import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * DivyaDhara — Razorpay Gateway Adapter
 *
 * BUSINESS BOUNDARY
 * -----------------
 * This module is ONLY the Razorpay gateway/integration layer.
 *
 * The application remains the source of truth for:
 *   - subscription plans and price variants
 *   - monthly/yearly billing configuration
 *   - owner/manager authorization
 *   - subscription status and entitlements
 *   - booking / puja / donation business rules
 *   - payment ledger, idempotency and webhook event persistence
 *   - refund policy and subscription revocation
 *
 * Razorpay is the payment processor, not the application's pricing source.
 * Never trust amount, currency, plan, owner or subscription identity supplied
 * by the browser. The payments route must resolve those values from the DB
 * before calling this module.
 *
 * SECURITY RULES
 * --------------
 * - Key secret is server-only; never expose it to the browser.
 * - Browser checkout receives only the public key id and the server-created
 *   Razorpay order id.
 * - Checkout success is not proof by itself. The payments route must verify
 *   the HMAC signature and then fetch the Razorpay payment server-side.
 * - Webhooks must be verified against the exact raw request body.
 * - No auth/role/ownership decisions are made in this file.
 * - No subscription activation/deactivation is made in this file.
 * - Non-GET gateway writes are never automatically retried because a retry
 *   can create duplicate orders/links or duplicate refund attempts.
 */

export type RazorpayMode = "test" | "live";

export type RazorpayConfig = {
  mode: RazorpayMode;
  keyId: string;
  keySecret: string;
  merchantId: string;
  webhookSecret: string;
  currency: string;
  apiBaseUrl: string;
  companyName: string;
  callbackUrl: string;
};

export type RazorpayPublicConfig = Pick<
  RazorpayConfig,
  "mode" | "keyId" | "currency" | "companyName"
>;

export type RazorpayOrder = {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts?: number;
  notes?: Record<string, string>;
  created_at?: number;
};

export type RazorpayPayment = {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id?: string;
  method?: string;
  captured?: boolean;
  email?: string;
  contact?: string;
  description?: string | null;
  fee?: number | null;
  tax?: number | null;
  wallet?: string | null;
  vpa?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  created_at?: number;
};

export type RazorpayRefund = {
  id?: string;
  entity?: string;
  amount?: number;
  currency?: string;
  payment_id?: string;
  notes?: Record<string, string>;
  receipt?: string | null;
  status?: string;
  created_at?: number;
  speed_requested?: string;
  speed_processed?: string;
};

export type RazorpayPaymentLinkPayment = {
  payment_id?: string;
  amount?: number;
  status?: string;
  method?: string;
  plink_id?: string;
};

export type RazorpayPaymentLink = {
  id: string;
  entity?: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  description?: string;
  short_url?: string;
  status: string;
  expire_by?: number;
  expired_at?: number | null;
  cancelled_at?: number | null;
  reference_id?: string;
  callback_url?: string | null;
  callback_method?: string | null;
  created_at?: number;
  updated_at?: number;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  payments?: RazorpayPaymentLinkPayment[] | null;
};

export type RazorpayApiError = Error & {
  statusCode?: number;
  razorpayPayload?: unknown;
  requestId?: string;
  retryable?: boolean;
};

type RequestOptions = {
  retryable?: boolean;
  maxRetries?: number;
};

const DEFAULT_API_BASE_URL = "https://api.razorpay.com/v1";
const DEFAULT_CURRENCY = "INR";
const DEFAULT_COMPANY_NAME = "DivyaDhara";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES_HARD_CAP = 3;
const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RECEIPT_LENGTH = 40;
const MAX_REFERENCE_ID_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 2048;
const MAX_NOTE_ENTRIES = 15;
const MAX_NOTE_VALUE_LENGTH = 256;
const MAX_CUSTOMER_NAME_LENGTH = 100;
const MAX_CUSTOMER_EMAIL_LENGTH = 320;
const MAX_CUSTOMER_CONTACT_LENGTH = 32;
const HEX_SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i;

function env(name: string, fallback = ""): string {
  return String(process.env[name] ?? fallback).trim();
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function assertIsoCurrency(value: string, label: string): string {
  const currency = normalizeCurrency(value);
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`${label} must be a valid ISO 4217 three-letter currency code.`);
  }
  return currency;
}

function assertAmountPaise(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer in currency subunits (paise for INR).`);
  }
  return value;
}

function assertNonEmptyId(value: string, label: string, maxLength = 150): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }
  return normalized;
}

function assertReceiptOrReferenceId(
  value: string,
  label: string,
  maxLength = MAX_RECEIPT_LENGTH,
): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} must be present and at most ${maxLength} characters.`);
  }
  return normalized;
}

function assertDescription(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Payment Link description must be present and at most ${MAX_DESCRIPTION_LENGTH} characters.`,
    );
  }
  return normalized;
}

function normalizeNotes(notes?: Record<string, string>): Record<string, string> {
  if (notes === undefined) return {};
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
    throw new Error("Razorpay notes must be an object.");
  }

  const entries = Object.entries(notes);
  if (entries.length > MAX_NOTE_ENTRIES) {
    throw new Error(`Razorpay supports at most ${MAX_NOTE_ENTRIES} note entries.`);
  }

  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey).trim();
    const value = String(rawValue ?? "").trim();

    if (!key) throw new Error("Razorpay note keys cannot be empty.");
    if (key.length > 256) throw new Error("Razorpay note keys are too long.");
    if (value.length > MAX_NOTE_VALUE_LENGTH) {
      throw new Error(`Each Razorpay note value must be at most ${MAX_NOTE_VALUE_LENGTH} characters.`);
    }

    normalized[key] = value;
  }

  return normalized;
}

function normalizeCustomer(customer?: {
  name?: string;
  email?: string;
  contact?: string;
}): { name?: string; email?: string; contact?: string } | undefined {
  if (!customer) return undefined;

  const normalized: { name?: string; email?: string; contact?: string } = {};

  if (customer.name !== undefined) {
    const name = String(customer.name).trim();
    if (name.length > MAX_CUSTOMER_NAME_LENGTH) {
      throw new Error(`Razorpay customer name must be at most ${MAX_CUSTOMER_NAME_LENGTH} characters.`);
    }
    if (name) normalized.name = name;
  }

  if (customer.email !== undefined) {
    const email = String(customer.email).trim();
    if (email.length > MAX_CUSTOMER_EMAIL_LENGTH) {
      throw new Error(`Razorpay customer email must be at most ${MAX_CUSTOMER_EMAIL_LENGTH} characters.`);
    }
    if (email) normalized.email = email;
  }

  if (customer.contact !== undefined) {
    const contact = String(customer.contact).trim();
    if (contact.length > MAX_CUSTOMER_CONTACT_LENGTH) {
      throw new Error(`Razorpay customer contact must be at most ${MAX_CUSTOMER_CONTACT_LENGTH} characters.`);
    }
    if (contact) normalized.contact = contact;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function validateCallbackUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Razorpay callback URL is invalid.");
  }

  if (!(url.protocol === "https:" || url.protocol === "http:")) {
    throw new Error("Razorpay callback URL must use http or https.");
  }

  if (getRazorpayConfig().mode === "live" && url.protocol !== "https:") {
    throw new Error("Razorpay live-mode callback URL must use HTTPS.");
  }

  return url.toString();
}

export function getRazorpayConfig(): RazorpayConfig {
  const rawMode = env("RAZORPAY_MODE", env("PAYMENT_ENVIRONMENT", "test")).toLowerCase();
  const mode: RazorpayMode = rawMode === "live" ? "live" : "test";

  const apiBaseUrl = env("RAZORPAY_API_BASE_URL", DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const callbackUrl = env("RAZORPAY_CALLBACK_URL");

  return {
    mode,
    keyId: env("RAZORPAY_KEY_ID"),
    keySecret: env("RAZORPAY_KEY_SECRET"),
    merchantId: env("RAZORPAY_MERCHANT_ID"),
    webhookSecret: env("RAZORPAY_WEBHOOK_SECRET"),
    currency: normalizeCurrency(env("RAZORPAY_CURRENCY", env("PAYMENT_CURRENCY", DEFAULT_CURRENCY))),
    apiBaseUrl,
    companyName: env(
      "RAZORPAY_COMPANY_NAME",
      env("PAYMENT_COMPANY_NAME", DEFAULT_COMPANY_NAME),
    ),
    callbackUrl,
  };
}

export function getRazorpayPublicConfig(): RazorpayPublicConfig {
  const config = assertRazorpayConfigured();
  return {
    mode: config.mode,
    keyId: config.keyId,
    currency: config.currency,
    companyName: config.companyName,
  };
}

export function assertRazorpayConfigured(): RazorpayConfig {
  const config = getRazorpayConfig();

  if (!config.keyId || !config.keySecret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server .env file.",
    );
  }

  const currency = assertIsoCurrency(config.currency, "Razorpay currency configuration");
  if (!currency) {
    throw new Error("Razorpay currency configuration is invalid.");
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(config.apiBaseUrl);
  } catch {
    throw new Error("Razorpay API base URL is invalid.");
  }

  if (!(apiUrl.protocol === "https:" || apiUrl.protocol === "http:")) {
    throw new Error("Razorpay API base URL must use http or https.");
  }

  if (config.mode === "live" && apiUrl.protocol !== "https:") {
    throw new Error("Razorpay live-mode API base URL must use HTTPS.");
  }

  if (config.mode === "live" && /^rzp_test_/i.test(config.keyId)) {
    throw new Error("Razorpay mode is live but a test key id is configured.");
  }

  if (config.mode === "test" && /^rzp_live_/i.test(config.keyId)) {
    throw new Error("Razorpay mode is test but a live key id is configured.");
  }

  return config;
}

export function assertRazorpayWebhookConfigured(): RazorpayConfig {
  const config = assertRazorpayConfigured();
  if (!config.webhookSecret) {
    throw new Error(
      "Razorpay webhook verification is not configured. Set RAZORPAY_WEBHOOK_SECRET in the server .env file.",
    );
  }
  return config;
}

function authHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`, "utf8").toString("base64")}`;
}

function requestTimeoutMs(): number {
  return Math.min(60_000, positiveInteger(process.env.RAZORPAY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
}

function maxRetries(): number {
  return Math.min(
    MAX_RETRIES_HARD_CAP,
    nonNegativeInteger(process.env.RAZORPAY_MAX_RETRIES, DEFAULT_MAX_RETRIES),
  );
}

function shouldRetry(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30_000, Math.round(seconds * 1_000));
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.min(30_000, Math.max(0, dateMs - Date.now()));
  }

  return null;
}

function retryDelayMs(attempt: number, retryAfterMs: number | null = null): number {
  if (retryAfterMs !== null) return retryAfterMs;
  const base = 250 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(2_000, base + jitter);
}

function errorMessageFromPayload(payload: unknown, statusCode: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "description" in payload.error
  ) {
    return String(payload.error.description);
  }

  if (payload && typeof payload === "object" && "message" in payload) {
    return String(payload.message);
  }

  return `Razorpay request failed with HTTP ${statusCode}.`;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_API_RESPONSE_BYTES) {
    throw new Error("Razorpay response exceeded the configured response size limit.");
  }

  const responseText = await response.text();
  if (!responseText) return null;

  if (Buffer.byteLength(responseText, "utf8") > MAX_API_RESPONSE_BYTES) {
    throw new Error("Razorpay response exceeded the configured response size limit.");
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return { error: { description: responseText.slice(0, 4_000) } };
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function razorpayRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const config = assertRazorpayConfigured();
  const method = (init.method ?? "GET").toUpperCase();
  const retryable = options.retryable ?? method === "GET";
  const retries = retryable
    ? Math.min(MAX_RETRIES_HARD_CAP, Math.max(0, options.maxRetries ?? maxRetries()))
    : 0;

  if (!path.startsWith("/")) {
    throw new Error("Razorpay API path must start with '/'.");
  }

  const url = `${config.apiBaseUrl}${path}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());

    try {
      const headers = new Headers(init.headers);
      headers.set("Authorization", authHeader(config));
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "application/json");
      headers.set("User-Agent", `${config.companyName.replace(/\s+/g, "-")}/DivyaDhara-Razorpay`);

      const response = await fetch(url, {
        ...init,
        method,
        headers,
        signal: controller.signal,
      });

      const payload = await readResponsePayload(response);

      if (response.ok) {
        return payload as T;
      }

      const error: RazorpayApiError = new Error(
        errorMessageFromPayload(payload, response.status),
      );
      error.statusCode = response.status;
      error.razorpayPayload = payload;
      error.requestId = response.headers.get("x-razorpay-request-id") ?? undefined;
      error.retryable = shouldRetry(response.status);

      if (attempt < retries && shouldRetry(response.status)) {
        await sleep(retryDelayMs(attempt, parseRetryAfterMs(response)));
        continue;
      }

      throw error;
    } catch (error) {
      if (isAbortError(error)) {
        const timeoutError: RazorpayApiError = new Error(
          `Razorpay request timed out after ${requestTimeoutMs()}ms.`,
        );
        timeoutError.statusCode = 504;
        timeoutError.retryable = true;

        if (attempt < retries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }

        throw timeoutError;
      }

      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error
      ) {
        const statusCode = Number((error as RazorpayApiError).statusCode ?? 0);
        if (attempt < retries && shouldRetry(statusCode)) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw error;
      }

      const networkError: RazorpayApiError = new Error(
        error instanceof Error ? `Razorpay network request failed: ${error.message}` : "Razorpay network request failed.",
      );
      networkError.statusCode = 503;
      networkError.retryable = true;

      if (attempt < retries) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      throw networkError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Razorpay request failed unexpectedly.");
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const amountPaise = assertAmountPaise(params.amountPaise, "Razorpay order amount");
  const currency = assertIsoCurrency(params.currency, "Razorpay order currency");
  const receipt = assertReceiptOrReferenceId(params.receipt, "Razorpay receipt");
  const notes = normalizeNotes(params.notes);

  return razorpayRequest<RazorpayOrder>(
    "/orders",
    {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt,
        notes,
      }),
    },
    { retryable: false },
  );
}

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  const id = assertNonEmptyId(orderId, "Razorpay order id");

  return razorpayRequest<RazorpayOrder>(
    `/orders/${encodeURIComponent(id)}`,
    { method: "GET" },
    { retryable: true },
  );
}

export async function fetchRazorpayPayment(
  paymentId: string,
): Promise<RazorpayPayment> {
  const id = assertNonEmptyId(paymentId, "Razorpay payment id");

  return razorpayRequest<RazorpayPayment>(
    `/payments/${encodeURIComponent(id)}`,
    { method: "GET" },
    { retryable: true },
  );
}

export async function captureRazorpayPayment(
  paymentId: string,
  amountPaise: number,
  currency: string,
): Promise<RazorpayPayment> {
  const id = assertNonEmptyId(paymentId, "Razorpay payment id");
  const amount = assertAmountPaise(amountPaise, "Capture amount");
  const normalizedCurrency = assertIsoCurrency(currency, "Capture currency");

  return razorpayRequest<RazorpayPayment>(
    `/payments/${encodeURIComponent(id)}/capture`,
    {
      method: "POST",
      body: JSON.stringify({
        amount,
        currency: normalizedCurrency,
      }),
    },
    { retryable: false },
  );
}

export async function createRazorpayRefund(
  paymentId: string,
  amountPaise?: number,
): Promise<RazorpayRefund & Record<string, unknown>> {
  const id = assertNonEmptyId(paymentId, "Razorpay payment id");

  const body: Record<string, unknown> = {};
  if (amountPaise !== undefined) {
    body.amount = assertAmountPaise(amountPaise, "Refund amount");
  }

  return razorpayRequest<RazorpayRefund & Record<string, unknown>>(
    `/payments/${encodeURIComponent(id)}/refund`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { retryable: false },
  );
}

export async function createRazorpayPaymentLink(params: {
  amountPaise: number;
  currency: string;
  referenceId: string;
  description: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  expireBy?: number;
  callbackUrl?: string;
  callbackMethod?: "get";
  reminderEnable?: boolean;
  acceptPartial?: boolean;
  firstMinPartialAmountPaise?: number;
  upiLink?: boolean;
  notes?: Record<string, string>;
}): Promise<RazorpayPaymentLink> {
  const amountPaise = assertAmountPaise(params.amountPaise, "Payment Link amount");
  const currency = assertIsoCurrency(params.currency, "Payment Link currency");
  const referenceId = assertReceiptOrReferenceId(
    params.referenceId,
    "Payment Link referenceId",
    MAX_REFERENCE_ID_LENGTH,
  );
  const description = assertDescription(params.description);
  const customer = normalizeCustomer(params.customer);
  const notes = normalizeNotes(params.notes);

  if (params.expireBy !== undefined) {
    if (!Number.isSafeInteger(params.expireBy) || params.expireBy <= Math.floor(Date.now() / 1000)) {
      throw new Error("Payment Link expiry must be a future Unix timestamp.");
    }

    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
    if (params.expireBy * 1000 > sixMonthsFromNow.getTime()) {
      throw new Error("Payment Link expiry cannot be set beyond Razorpay's six-month maximum window.");
    }
  }

  const acceptPartial = Boolean(params.acceptPartial);
  if (params.firstMinPartialAmountPaise !== undefined) {
    const firstMin = assertAmountPaise(
      params.firstMinPartialAmountPaise,
      "Payment Link first minimum partial amount",
    );

    if (!acceptPartial) {
      throw new Error("firstMinPartialAmountPaise requires acceptPartial=true.");
    }

    if (firstMin > amountPaise) {
      throw new Error("firstMinPartialAmountPaise cannot exceed the Payment Link amount.");
    }
  }

  let callbackUrl: string | undefined;
  if (params.callbackUrl !== undefined) {
    callbackUrl = validateCallbackUrl(params.callbackUrl) || undefined;
  }

  if (callbackUrl && params.callbackMethod !== undefined && params.callbackMethod !== "get") {
    throw new Error("Razorpay Payment Link callback_method must be 'get'.");
  }

  if (!callbackUrl && params.callbackMethod !== undefined) {
    throw new Error("callbackMethod cannot be set without callbackUrl.");
  }

  const body: Record<string, unknown> = {
    amount: amountPaise,
    currency,
    reference_id: referenceId,
    description,
    accept_partial: acceptPartial,
    reminder_enable: params.reminderEnable ?? true,
  };

  if (customer) body.customer = customer;
  if (params.expireBy !== undefined) body.expire_by = params.expireBy;
  if (callbackUrl) {
    body.callback_url = callbackUrl;
    body.callback_method = "get";
  }
  if (params.firstMinPartialAmountPaise !== undefined) {
    body.first_min_partial_amount = params.firstMinPartialAmountPaise;
  }
  if (params.upiLink !== undefined) body.upi_link = Boolean(params.upiLink);
  if (Object.keys(notes).length > 0) body.notes = notes;

  return razorpayRequest<RazorpayPaymentLink>(
    "/payment_links",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { retryable: false },
  );
}

export async function fetchRazorpayPaymentLink(
  paymentLinkId: string,
): Promise<RazorpayPaymentLink> {
  const id = assertNonEmptyId(paymentLinkId, "Razorpay payment link id");

  return razorpayRequest<RazorpayPaymentLink>(
    `/payment_links/${encodeURIComponent(id)}`,
    { method: "GET" },
    { retryable: true },
  );
}

export async function cancelRazorpayPaymentLink(
  paymentLinkId: string,
): Promise<Record<string, unknown>> {
  const id = assertNonEmptyId(paymentLinkId, "Razorpay payment link id");

  return razorpayRequest<Record<string, unknown>>(
    `/payment_links/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    { retryable: false },
  );
}

export function generatePaymentSignature(
  orderId: string,
  paymentId: string,
  secret = getRazorpayConfig().keySecret,
): string {
  const normalizedOrderId = assertNonEmptyId(orderId, "Razorpay order id");
  const normalizedPaymentId = assertNonEmptyId(paymentId, "Razorpay payment id");
  const normalizedSecret = String(secret ?? "").trim();

  if (!normalizedSecret) {
    throw new Error("Razorpay key secret is not configured.");
  }

  return createHmac("sha256", normalizedSecret)
    .update(`${normalizedOrderId}|${normalizedPaymentId}`, "utf8")
    .digest("hex");
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret = getRazorpayConfig().keySecret,
): boolean {
  const normalizedSignature = String(signature ?? "").trim();
  const normalizedSecret = String(secret ?? "").trim();

  if (!normalizedSecret || !orderId?.trim() || !paymentId?.trim()) return false;
  if (!HEX_SIGNATURE_PATTERN.test(normalizedSignature)) return false;

  let expected: string;
  try {
    expected = generatePaymentSignature(orderId, paymentId, normalizedSecret);
  } catch {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(normalizedSignature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function generateWebhookSignature(
  rawBody: string | Buffer,
  secret = getRazorpayConfig().webhookSecret,
): string {
  const normalizedSecret = String(secret ?? "").trim();
  if (!normalizedSecret) throw new Error("Razorpay webhook secret is not configured.");

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  return createHmac("sha256", normalizedSecret).update(payload).digest("hex");
}

export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret = getRazorpayConfig().webhookSecret,
): boolean {
  const normalizedSecret = String(secret ?? "").trim();
  const normalizedSignature = String(signature ?? "").trim();

  if (!normalizedSecret || !normalizedSignature) return false;
  if (!HEX_SIGNATURE_PATTERN.test(normalizedSignature)) return false;

  let expected: string;
  try {
    expected = generateWebhookSignature(rawBody, normalizedSecret);
  } catch {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(normalizedSignature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
