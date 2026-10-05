/*
|--------------------------------------------------------------------------
| DivyaDhara — Subscription Plan Client
|--------------------------------------------------------------------------
|
| BUSINESS RULE
| - Backend/database is the source of truth for commercial plans, prices,
|   billing interval, duration and entitlements.
| - Client-side FALLBACK_PLANS exist only for a degraded/offline UI state.
| - The client must NEVER use fallback pricing/limits as payment authority.
| - Checkout must submit an authoritative plan/price variant reference to the
|   backend; the backend resolves and validates the current commercial terms.
| - Current canonical commercial catalogue has six active monthly plans:
|     pandit_basic / pandit_premium
|     temple_basic / temple_premium
|     ashram_basic / ashram_premium
| - Yearly/annual architecture is supported by the database model, but no
|   annual prices are assumed or invented here until the backend exposes them.
|
| Roles / audiences are intentionally limited to paid business owners:
|   Pandit, Temple, Ashram.
|
| Visitor is NOT a subscription audience.
| Temple Manager / Ashram Manager are authorization roles, not plan owners.
|--------------------------------------------------------------------------
*/

export type SubscriptionAudience = "pandit" | "temple" | "ashram";

export type SubscriptionBillingInterval =
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export type SubscriptionPlan = {
  id: number;
  code: string;
  audience: SubscriptionAudience;
  ownerType: SubscriptionAudience;
  name: string;
  title?: string;
  description: string | null;
  priceAmount: number;
  currency: string;
  billingInterval: SubscriptionBillingInterval;
  durationDays: number;

  /* Optional server fields for future price-variant/catalog expansion. */
  priceId?: number;
  sortOrder?: number;

  leadLimit: number;
  serviceLimit: number;
  serviceAreaLimit: number;
  galleryLimit: number;
  videoLimit: number;
  programLimit: number;

  listingEnabled: boolean;
  featuredListing: boolean;
  prioritySupport: boolean;
  verificationBadge: boolean;
  analyticsAccess: boolean;
  homepagePromotion: boolean;
  liveAartiEnabled: boolean;
  enhancedSeo: boolean;
  enhancedProfile: boolean;
  whatsappEnquiry: boolean;
  searchVisibility: string;
  analyticsLevel: string;
  features: string[];

  /* Never use this as the price source; it is gateway metadata only. */
  razorpayPlanId: string | null;
  isActive: boolean;
};

export type SubscriptionPlansResponse = {
  success: boolean;
  ownerType: SubscriptionAudience;
  plans: unknown[];
  error?: string;
};

export type SubscriptionPlansSource = "backend" | "fallback";

export type FetchSubscriptionPlansOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class SubscriptionPlansError extends Error {
  readonly statusCode: number | null;
  readonly source: SubscriptionPlansSource | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      statusCode?: number | null;
      source?: SubscriptionPlansSource | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "SubscriptionPlansError";
    this.statusCode = options.statusCode ?? null;
    this.source = options.source ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

export const SUBSCRIPTION_AUDIENCES: ReadonlyArray<{
  value: SubscriptionAudience;
  label: string;
  shortLabel: string;
}> = [
  { value: "pandit", label: "Pandit", shortLabel: "Pandit" },
  { value: "temple", label: "Temple", shortLabel: "Temple" },
  { value: "ashram", label: "Ashram", shortLabel: "Ashram" },
];

const API_URL = normalizeApiBaseUrl(
  (import.meta.env.VITE_API_URL as string | undefined) ||
    "http://localhost:3001/api",
);

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const API_URL_MAX_LENGTH = 2048;
const MAX_PLAN_COUNT = 24;
const MAX_FEATURE_COUNT = 100;
const MAX_TEXT_LENGTH = 10_000;
const MAX_CURRENCY_LENGTH = 3;

function normalizeApiBaseUrl(value: string): string {
  const raw = String(value ?? "").trim().slice(0, API_URL_MAX_LENGTH);

  if (!raw) return "";

  try {
    const origin =
      typeof globalThis.location !== "undefined"
        ? globalThis.location.origin
        : undefined;

    const parsed = origin ? new URL(raw, origin) : new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new SubscriptionPlansError(
        "Subscription API URL must use HTTP or HTTPS.",
        { source: null },
      );
    }

    if (
      typeof globalThis.location !== "undefined" &&
      globalThis.location.protocol === "https:" &&
      parsed.protocol !== "https:"
    ) {
      throw new SubscriptionPlansError(
        "Secure DivyaDhara pages cannot load subscription data over an insecure API connection.",
        { source: null },
      );
    }

    if (parsed.username || parsed.password) {
      throw new SubscriptionPlansError(
        "Subscription API URL must not contain credentials.",
        { source: null },
      );
    }

    parsed.hash = "";

    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    if (error instanceof SubscriptionPlansError) throw error;

    throw new SubscriptionPlansError(
      "Subscription API URL is invalid.",
      { source: null },
    );
  }
}

function timeoutMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
}

function normalizeAudience(
  value: unknown,
): SubscriptionAudience | null {
  const audience = String(value ?? "").trim().toLowerCase();

  if (
    audience === "pandit" ||
    audience === "temple" ||
    audience === "ashram"
  ) {
    return audience;
  }

  return null;
}

function normalizeBillingInterval(
  value: unknown,
): SubscriptionBillingInterval {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();

  if (raw === "quarter" || raw === "quarterly") return "quarterly";
  if (
    raw === "year" ||
    raw === "annual" ||
    raw === "annually" ||
    raw === "yearly"
  ) {
    return "yearly";
  }
  if (raw === "custom") return "custom";

  return "monthly";
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function toSafeInteger(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isSafeInteger(number) ? number : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;

  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).trim().toLowerCase() === "true"
  );
}

function normalizeText(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (value === undefined || value === null) return fallback;

  const text = String(value).trim();

  if (!text) return fallback;

  return text.slice(0, MAX_TEXT_LENGTH);
}

function normalizeFeatures(value: unknown): string[] {
  let raw: unknown = value;

  if (typeof raw === "string" && raw.trim()) {
    const rawString = raw;
    try {
      raw = JSON.parse(rawString);
    } catch {
      raw = rawString
        .split(/[\n|•]+/)
        .map((item: string) => item.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, MAX_FEATURE_COUNT)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 500));
}

function nullableRazorpayPlanId(value: unknown): string | null {
  const text = normalizeText(value, null);

  return text ? text : null;
}

function positiveNullableId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function requiredPlanId(value: unknown): number {
  const id = positiveNullableId(value);

  if (id === null) {
    throw new SubscriptionPlansError(
      "Subscription API returned a plan with an invalid id.",
      { source: "backend" },
    );
  }

  return id;
}

function normalizePlanCode(value: unknown, audience: SubscriptionAudience): string {
  const code = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!code) return `${audience}_plan`;

  return code.slice(0, 120);
}

function assertPlanAudience(
  raw: Record<string, unknown>,
  requestedAudience: SubscriptionAudience,
): SubscriptionAudience {
  const rawAudience = normalizeAudience(
    raw.audience ?? raw.ownerType ?? raw.owner_type,
  );

  if (rawAudience && rawAudience !== requestedAudience) {
    throw new SubscriptionPlansError(
      "Subscription API returned a plan for a different business audience.",
      { source: "backend" },
    );
  }

  return requestedAudience;
}

export function normalizePlan(
  raw: Record<string, unknown>,
  audience: SubscriptionAudience,
): SubscriptionPlan {
  const resolvedAudience = assertPlanAudience(raw, audience);

  const id = requiredPlanId(raw.id);
  const code = normalizePlanCode(raw.code, resolvedAudience);

  const currency = String(raw.currency ?? "INR")
    .trim()
    .toUpperCase()
    .slice(0, MAX_CURRENCY_LENGTH);

  const durationDays = toSafeInteger(
    raw.durationDays ?? raw.duration_days,
    30,
  );

  if (durationDays <= 0) {
    throw new SubscriptionPlansError(
      `Subscription plan ${code} returned an invalid duration.`,
      { source: "backend" },
    );
  }

  const priceAmount = toFiniteNumber(
    raw.priceAmount ?? raw.price_amount,
  );

  if (priceAmount < 0) {
    throw new SubscriptionPlansError(
      `Subscription plan ${code} returned an invalid price.`,
      { source: "backend" },
    );
  }

  const rawActive =
    raw.isActive ?? raw.is_active ?? true;

  return {
    id,
    code,
    audience: resolvedAudience,
    ownerType: resolvedAudience,
    name:
      normalizeText(raw.name ?? raw.title, "Plan") ??
      "Plan",
    title: raw.title ? String(raw.title).trim().slice(0, 500) || undefined : undefined,
    description: normalizeText(raw.description, null),
    priceAmount,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "INR",
    billingInterval: normalizeBillingInterval(
      raw.billingInterval ?? raw.billing_interval,
    ),
    durationDays,
    priceId:
      positiveNullableId(raw.priceId ?? raw.price_id) ?? undefined,
    sortOrder:
      positiveNullableId(raw.sortOrder ?? raw.sort_order) ?? undefined,

    leadLimit: Math.max(
      0,
      toFiniteNumber(raw.leadLimit ?? raw.lead_limit),
    ),
    serviceLimit: Math.max(
      0,
      toFiniteNumber(raw.serviceLimit ?? raw.service_limit),
    ),
    serviceAreaLimit: Math.max(
      0,
      toFiniteNumber(
        raw.serviceAreaLimit ?? raw.service_area_limit,
      ),
    ),
    galleryLimit: Math.max(
      0,
      toFiniteNumber(raw.galleryLimit ?? raw.gallery_limit),
    ),
    videoLimit: Math.max(
      0,
      toFiniteNumber(raw.videoLimit ?? raw.video_limit),
    ),
    programLimit: Math.max(
      0,
      toFiniteNumber(raw.programLimit ?? raw.program_limit),
    ),

    listingEnabled: toBoolean(
      raw.listingEnabled ?? raw.listing_enabled,
    ),
    featuredListing: toBoolean(
      raw.featuredListing ?? raw.featured_listing,
    ),
    prioritySupport: toBoolean(
      raw.prioritySupport ?? raw.priority_support,
    ),
    verificationBadge: toBoolean(
      raw.verificationBadge ?? raw.verification_badge,
    ),
    analyticsAccess: toBoolean(
      raw.analyticsAccess ?? raw.analytics_access,
    ),
    homepagePromotion: toBoolean(
      raw.homepagePromotion ?? raw.homepage_promotion,
    ),
    liveAartiEnabled: toBoolean(
      raw.liveAartiEnabled ?? raw.live_aarti_enabled,
    ),
    enhancedSeo: toBoolean(
      raw.enhancedSeo ?? raw.enhanced_seo,
    ),
    enhancedProfile: toBoolean(
      raw.enhancedProfile ?? raw.enhanced_profile,
    ),
    whatsappEnquiry: toBoolean(
      raw.whatsappEnquiry ?? raw.whatsapp_enquiry,
    ),
    searchVisibility: String(
      raw.searchVisibility ?? raw.search_visibility ?? "standard",
    )
      .trim()
      .slice(0, 80),
    analyticsLevel: String(
      raw.analyticsLevel ?? raw.analytics_level ?? "basic",
    )
      .trim()
      .slice(0, 80),
    features: normalizeFeatures(raw.features ?? raw.plan_features_json),

    razorpayPlanId: nullableRazorpayPlanId(
      raw.razorpayPlanId ?? raw.razorpay_plan_id,
    ),
    isActive: toBoolean(rawActive, true),
  };
}

function parseResponse(payload: unknown): SubscriptionPlansResponse {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new SubscriptionPlansError(
      "Subscription API returned an invalid response.",
      { source: "backend" },
    );
  }

  const record = payload as Record<string, unknown>;
  const success = record.success === true;
  const ownerType = normalizeAudience(record.ownerType);

  if (!success || !ownerType || !Array.isArray(record.plans)) {
    const error = normalizeText(record.error, null);

    throw new SubscriptionPlansError(
      error || "Unable to load subscription plans.",
      { source: "backend" },
    );
  }

  if (record.plans.length > MAX_PLAN_COUNT) {
    throw new SubscriptionPlansError(
      "Subscription API returned an unexpectedly large plan catalogue.",
      { source: "backend" },
    );
  }

  return {
    success: true,
    ownerType,
    plans: record.plans,
    error:
      typeof record.error === "string" ? record.error : undefined,
  };
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const contentType =
    response.headers.get("content-type")?.toLowerCase() ?? "";

  if (
    !contentType.includes("application/json") &&
    !contentType.includes("+json")
  ) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get("retry-after");

  if (!value) return null;

  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? Math.ceil(number)
    : null;
}

function errorMessageForStatus(status: number): string {
  switch (status) {
    case 401:
      return "Please sign in to access subscription plans.";
    case 403:
      return "You do not have permission to access this subscription catalogue.";
    case 404:
      return "Subscription plans were not found.";
    case 429:
      return "Too many plan requests. Please try again shortly.";
    case 503:
      return "Subscription service is temporarily unavailable.";
    default:
      return "Unable to load subscription plans right now.";
  }
}

const CANONICAL_PLAN_CODES = new Set([
  "pandit_basic",
  "pandit_premium",
  "temple_basic",
  "temple_premium",
  "ashram_basic",
  "ashram_premium",
]);

function validateBackendPlan(
  plan: SubscriptionPlan,
  audience: SubscriptionAudience,
): SubscriptionPlan {
  if (plan.audience !== audience || plan.ownerType !== audience) {
    throw new SubscriptionPlansError(
      "Subscription catalogue contains an audience mismatch.",
      { source: "backend" },
    );
  }

  /*
   * Today the backend exposes only the canonical six commercial plans.
   * Do not silently treat arbitrary active client-injected plan codes as valid
   * commercial products. Future plans must first be introduced server-side.
   */
  if (!CANONICAL_PLAN_CODES.has(plan.code)) {
    throw new SubscriptionPlansError(
      `Unsupported subscription plan returned by server: ${plan.code}.`,
      { source: "backend" },
    );
  }

  if (plan.billingInterval !== "monthly") {
    /*
     * The data model supports yearly/other intervals, but the current final
     * commercial catalogue has no confirmed annual amounts. We therefore do
     * not expose an invented non-monthly price as a purchasable current plan.
     */
    throw new SubscriptionPlansError(
      `Subscription billing interval ${plan.billingInterval} is not currently enabled for ${plan.code}.`,
      { source: "backend" },
    );
  }

  if (plan.currency !== "INR") {
    throw new SubscriptionPlansError(
      `Unsupported subscription currency for ${plan.code}.`,
      { source: "backend" },
    );
  }

  if (!Number.isFinite(plan.priceAmount) || plan.priceAmount < 0) {
    throw new SubscriptionPlansError(
      `Invalid subscription price for ${plan.code}.`,
      { source: "backend" },
    );
  }

  return plan;
}

export async function fetchSubscriptionPlans(
  audience: SubscriptionAudience,
  signal?: AbortSignal,
  options: FetchSubscriptionPlansOptions = {},
): Promise<SubscriptionPlan[]> {
  if (!normalizeAudience(audience)) {
    throw new SubscriptionPlansError(
      "A valid subscription audience is required.",
      { source: null },
    );
  }

  if (!API_URL) {
    throw new SubscriptionPlansError(
      "Subscription API base URL is not configured.",
      { source: null },
    );
  }

  const controller = new AbortController();
  const effectiveSignal = signal;
  let externalAbortHandler: (() => void) | null = null;
  let timedOut = false;

  if (effectiveSignal) {
    if (effectiveSignal.aborted) {
      throw new SubscriptionPlansError(
        "Subscription plan request was cancelled.",
        { source: null },
      );
    }

    externalAbortHandler = () => {
      controller.abort(effectiveSignal.reason);
    };

    effectiveSignal.addEventListener("abort", externalAbortHandler, {
      once: true,
    });
  }

  const requestTimeout = timeoutMs(options.timeoutMs);
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeout);

  try {
    const response = await fetch(
      `${API_URL}/payments/plans?ownerType=${encodeURIComponent(audience)}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      },
    );

    const payload = await readJsonSafely(response);

    if (!response.ok) {
      throw new SubscriptionPlansError(
        errorMessageForStatus(response.status),
        {
          statusCode: response.status,
          source: "backend",
          retryAfterSeconds: retryAfterSeconds(response),
        },
      );
    }

    const parsed = parseResponse(payload);

    if (parsed.ownerType !== audience) {
      throw new SubscriptionPlansError(
        "Subscription API returned a catalogue for a different audience.",
        { source: "backend" },
      );
    }

    const plans = parsed.plans.map((plan) =>
      validateBackendPlan(
        normalizePlan(
          plan && typeof plan === "object"
            ? (plan as Record<string, unknown>)
            : {},
          audience,
        ),
        audience,
      ),
    );

    /* Never silently display an empty authoritative catalogue as purchasable. */
    if (plans.length === 0) {
      throw new SubscriptionPlansError(
        `No active ${audience} subscription plans are currently available.`,
        { source: "backend" },
      );
    }

    return plans;
  } catch (error) {
    if (error instanceof SubscriptionPlansError) {
      throw error;
    }

    if (timedOut) {
      throw new SubscriptionPlansError(
        `Subscription plan request timed out after ${requestTimeout}ms.`,
        { source: "backend" },
      );
    }

    if (effectiveSignal?.aborted) {
      throw new SubscriptionPlansError(
        "Subscription plan request was cancelled.",
        { source: null },
      );
    }

    throw new SubscriptionPlansError(
      "Unable to reach the DivyaDhara subscription service.",
      { source: "backend" },
    );
  } finally {
    globalThis.clearTimeout(timeout);

    if (externalAbortHandler && effectiveSignal) {
      effectiveSignal.removeEventListener("abort", externalAbortHandler);
    }
  }
}

export function getFallbackPlans(
  audience: SubscriptionAudience,
): SubscriptionPlan[] {
  return FALLBACK_PLANS[audience].map((plan) => ({
    ...plan,
    features: [...plan.features],
  }));
}

/*
 * UI-only degraded mode.
 *
 * Calling code should clearly label these plans as fallback/offline data and
 * must never send their amount as the payment amount. Checkout must resolve
 * the current backend price again before creating a Razorpay order.
 */
export function getFallbackPlansForDisplay(
  audience: SubscriptionAudience,
): SubscriptionPlan[] {
  return getFallbackPlans(audience);
}

export function formatSubscriptionPrice(
  amount: number,
  currency = "INR",
): string {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    return "—";
  }

  const normalizedCurrency =
    /^[A-Za-z]{3}$/.test(currency.trim())
      ? currency.trim().toUpperCase()
      : "INR";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(numericAmount);
  } catch {
    return `${normalizedCurrency} ${Math.round(numericAmount).toLocaleString("en-IN")}`;
  }
}

/*
|--------------------------------------------------------------------------
| Canonical UI fallbacks — DISPLAY ONLY
|--------------------------------------------------------------------------
|
| These values mirror the current canonical database catalogue only so the UI
| can render a degraded state. They are NOT checkout authority.
|--------------------------------------------------------------------------
*/

export const FALLBACK_PLANS: Record<
  SubscriptionAudience,
  SubscriptionPlan[]
> = {
  pandit: [
    {
      id: 0,
      code: "pandit_basic",
      audience: "pandit",
      ownerType: "pandit",
      name: "Basic",
      description:
        "Professional Pandit listing with essential enquiry tools.",
      priceAmount: 199,
      currency: "INR",
      billingInterval: "monthly",
      durationDays: 30,
      leadLimit: 10,
      serviceLimit: 5,
      serviceAreaLimit: 2,
      galleryLimit: 0,
      videoLimit: 0,
      programLimit: 0,
      listingEnabled: true,
      featuredListing: false,
      prioritySupport: false,
      verificationBadge: true,
      analyticsAccess: true,
      homepagePromotion: false,
      liveAartiEnabled: false,
      enhancedSeo: false,
      enhancedProfile: false,
      whatsappEnquiry: true,
      searchVisibility: "standard",
      analyticsLevel: "basic",
      features: [
        "10 qualified leads / month",
        "Up to 5 services",
        "2 service areas",
        "WhatsApp enquiries",
        "Basic analytics",
        "Verification badge",
      ],
      razorpayPlanId: null,
      isActive: true,
    },
    {
      id: 0,
      code: "pandit_premium",
      audience: "pandit",
      ownerType: "pandit",
      name: "Premium",
      description:
        "Enhanced visibility and enquiry tools for established Pandits.",
      priceAmount: 499,
      currency: "INR",
      billingInterval: "monthly",
      durationDays: 30,
      leadLimit: 30,
      serviceLimit: 15,
      serviceAreaLimit: 0,
      galleryLimit: 0,
      videoLimit: 0,
      programLimit: 0,
      listingEnabled: true,
      featuredListing: true,
      prioritySupport: true,
      verificationBadge: true,
      analyticsAccess: true,
      homepagePromotion: true,
      liveAartiEnabled: false,
      enhancedSeo: true,
      enhancedProfile: true,
      whatsappEnquiry: true,
      searchVisibility: "higher",
      analyticsLevel: "advanced",
      features: [
        "30 qualified leads / month",
        "Up to 15 services",
        "Featured listing",
        "Higher search visibility",
        "Enhanced profile + SEO",
        "Homepage promotion",
        "Advanced analytics",
        "Priority support",
      ],
      razorpayPlanId: null,
      isActive: true,
    },
  ],

  temple: [
    {
      id: 0,
      code: "temple_basic",
      audience: "temple",
      ownerType: "temple",
      name: "Basic",
      description:
        "Essential temple presence with enquiry and content support.",
      priceAmount: 499,
      currency: "INR",
      billingInterval: "monthly",
      durationDays: 30,
      leadLimit: 15,
      serviceLimit: 0,
      serviceAreaLimit: 0,
      galleryLimit: 15,
      videoLimit: 2,
      programLimit: 0,
      listingEnabled: true,
      featuredListing: false,
      prioritySupport: false,
      verificationBadge: true,
      analyticsAccess: true,
      homepagePromotion: false,
      liveAartiEnabled: false,
      enhancedSeo: false,
      enhancedProfile: false,
      whatsappEnquiry: true,
      searchVisibility: "standard",
      analyticsLevel: "basic",
      features: [
        "15 enquiries / month",
        "15 gallery items",
        "2 videos",
        "WhatsApp enquiries",
        "Basic analytics",
        "Verification badge",
      ],
      razorpayPlanId: null,
      isActive: true,
    },
    {
      id: 0,
      code: "temple_premium",
      audience: "temple",
      ownerType: "temple",
      name: "Premium",
      description:
        "Full-featured temple presence with enhanced visibility and live aarti support.",
      priceAmount: 999,
      currency: "INR",
      billingInterval: "monthly",
      durationDays: 30,
      leadLimit: 50,
      serviceLimit: 0,
      serviceAreaLimit: 0,
      galleryLimit: 50,
      videoLimit: 10,
      programLimit: 0,
      listingEnabled: true,
      featuredListing: true,
      prioritySupport: true,
      verificationBadge: true,
      analyticsAccess: true,
      homepagePromotion: true,
      liveAartiEnabled: true,
      enhancedSeo: true,
      enhancedProfile: true,
      whatsappEnquiry: true,
      searchVisibility: "higher",
      analyticsLevel: "advanced",
      features: [
        "50 enquiries / month",
        "50 gallery items",
        "10 videos",
        "Live aarti support",
        "Featured listing",
        "Higher search visibility",
        "Enhanced profile + SEO",
        "Homepage promotion",
        "Advanced analytics",
        "Priority support",
      ],
      razorpayPlanId: null,
      isActive: true,
    },
  ],

  ashram: [
    {
      id: 0,
      code: "ashram_basic",
      audience: "ashram",
      ownerType: "ashram",
      name: "Basic",
      description:
        "Essential Ashram listing with programme and enquiry capacity.",
      priceAmount: 499,
      currency: "INR",
      billingInterval: "monthly",
      durationDays: 30,
      leadLimit: 15,
      serviceLimit: 0,
      serviceAreaLimit: 0,
      galleryLimit: 15,
      videoLimit: 2,
      programLimit: 3,
      listingEnabled: true,
      featuredListing: false,
      prioritySupport: false,
      verificationBadge: true,
      analyticsAccess: true,
      homepagePromotion: false,
      liveAartiEnabled: false,
      enhancedSeo: false,
      enhancedProfile: false,
      whatsappEnquiry: true,
      searchVisibility: "standard",
      analyticsLevel: "basic",
      features: [
        "15 enquiries / month",
        "15 gallery items",
        "2 videos",
        "Up to 3 programmes",
        "WhatsApp enquiries",
        "Basic analytics",
        "Verification badge",
      ],
      razorpayPlanId: null,
      isActive: true,
    },
    {
      id: 0,
      code: "ashram_premium",
      audience: "ashram",
      ownerType: "ashram",
      name: "Premium",
      description:
        "Expanded Ashram presence with stronger visibility and programme capacity.",
      priceAmount: 1499,
      currency: "INR",
      billingInterval: "monthly",
      durationDays: 30,
      leadLimit: 75,
      serviceLimit: 0,
      serviceAreaLimit: 0,
      galleryLimit: 50,
      videoLimit: 10,
      programLimit: 15,
      listingEnabled: true,
      featuredListing: true,
      prioritySupport: true,
      verificationBadge: true,
      analyticsAccess: true,
      homepagePromotion: true,
      liveAartiEnabled: false,
      enhancedSeo: true,
      enhancedProfile: true,
      whatsappEnquiry: true,
      searchVisibility: "higher",
      analyticsLevel: "advanced",
      features: [
        "75 enquiries / month",
        "50 gallery items",
        "10 videos",
        "Up to 15 programmes",
        "Featured listing",
        "Higher search visibility",
        "Enhanced profile + SEO",
        "Homepage promotion",
        "Advanced analytics",
        "Priority support",
      ],
      razorpayPlanId: null,
      isActive: true,
    },
  ],
};
