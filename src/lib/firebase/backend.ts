/* eslint-disable no-control-regex */
import { getFirebaseIdToken } from "./phoneAuth";

/*
|--------------------------------------------------------------------------
| DivyaDhara Firebase → Backend Identity Bridge
|--------------------------------------------------------------------------
|
| BUSINESS RESPONSIBILITY
| - Firebase Phone OTP is completed in the browser.
| - The Firebase ID token is sent ONLY to the DivyaDhara backend.
| - The backend is the trust boundary: it verifies the token server-side,
|   requires Firebase phone identity, persists the identity record, and may
|   bind an active lead_capture_session.
| - The client NEVER sends phone/user identity as proof of verification.
| - The client NEVER stores the Firebase ID token.
| - Detail-gate lead capture MUST use captureKey so verified identity is
|   attached to the correct anonymous lead-capture session.
|
| Supported business capture modules:
|   temple, pandit, puja, ashram, yatra, spiritual_place,
|   event, course, kundli
|
|--------------------------------------------------------------------------
*/

const VERIFY_ENDPOINT = "/api/auth/firebase/verify";

const TOKEN_MAX_LENGTH = 16 * 1024;
const CAPTURE_KEY_MAX_LENGTH = 255;
const API_BASE_URL_MAX_LENGTH = 2048;
const PHONE_MAX_LENGTH = 30;

const DEFAULT_API_TIMEOUT_MS = 15_000;
const MAX_API_TIMEOUT_MS = 60_000;

export type FirebaseIdentityVerification = {
  authIdentityId: number;
  provider: "firebase";
  identityType: "phone";
  phoneE164: string;
  status: "verified";
  linkedToUser: boolean;
  linkedUserId: number | null;
  linkedVisitorId: number | null;
  captureSessionId: number | null;
};

export type VerifyFirebaseIdentityOptions = {
  apiBaseUrl: string;
  captureKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class FirebaseIdentityVerificationError extends Error {
  readonly statusCode: number | null;
  readonly retryAfterSeconds: number | null;
  readonly code:
    | "invalid_configuration"
    | "invalid_token"
    | "invalid_response"
    | "verification_rejected"
    | "rate_limited"
    | "session_expired"
    | "conflict"
    | "timeout"
    | "aborted"
    | "network"
    | "unknown";

  constructor(
    message: string,
    options: {
      statusCode?: number | null;
      retryAfterSeconds?: number | null;
      code?: FirebaseIdentityVerificationError["code"];
    } = {},
  ) {
    super(message);
    this.name = "FirebaseIdentityVerificationError";
    this.statusCode = options.statusCode ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.code = options.code ?? "unknown";
  }
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof globalThis.location !== "undefined"
  );
}

function normalizeApiBaseUrl(value: string): string {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  if (raw.length > API_BASE_URL_MAX_LENGTH) {
    throw new FirebaseIdentityVerificationError(
      `Firebase identity verification API URL must be at most ${API_BASE_URL_MAX_LENGTH} characters.`,
      { code: "invalid_configuration" },
    );
  }

  try {
    const currentOrigin = isBrowser()
      ? globalThis.location.origin
      : undefined;

    const parsed = currentOrigin
      ? new URL(raw, currentOrigin)
      : new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new FirebaseIdentityVerificationError(
        "Firebase identity verification API URL must use HTTP or HTTPS.",
        { code: "invalid_configuration" },
      );
    }

    /*
     * A secure DivyaDhara page must never send a Firebase ID token over
     * plaintext HTTP. Local development may still use HTTP from an HTTP page.
     */
    if (
      isBrowser() &&
      globalThis.location.protocol === "https:" &&
      parsed.protocol !== "https:"
    ) {
      throw new FirebaseIdentityVerificationError(
        "Secure DivyaDhara pages cannot send Firebase identity tokens to an insecure API URL.",
        { code: "invalid_configuration" },
      );
    }

    if (parsed.username || parsed.password) {
      throw new FirebaseIdentityVerificationError(
        "Firebase identity verification API URL must not contain credentials.",
        { code: "invalid_configuration" },
      );
    }

    parsed.hash = "";

    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    if (error instanceof FirebaseIdentityVerificationError) {
      throw error;
    }

    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification API URL is invalid.",
      { code: "invalid_configuration" },
    );
  }
}

function positiveTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_API_TIMEOUT_MS;
  }

  return Math.min(Math.floor(value), MAX_API_TIMEOUT_MS);
}

function normalizeCaptureKey(value: string | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const captureKey = String(value).trim();

  if (!captureKey) {
    return null;
  }

  if (captureKey.length > CAPTURE_KEY_MAX_LENGTH) {
    throw new FirebaseIdentityVerificationError(
      `Firebase lead capture key must be at most ${CAPTURE_KEY_MAX_LENGTH} characters.`,
      { code: "invalid_configuration" },
    );
  }

  return captureKey;
}

function normalizeBearerToken(value: string): string {
  const token = String(value ?? "").trim();

  if (!token) {
    throw new FirebaseIdentityVerificationError(
      "Firebase ID token is empty. Complete phone verification first.",
      { code: "invalid_token" },
    );
  }

  if (token.length > TOKEN_MAX_LENGTH) {
    throw new FirebaseIdentityVerificationError(
      "Firebase ID token is invalid or unexpectedly large.",
      { code: "invalid_token" },
    );
  }

  /*
   * Firebase ID tokens are JWT strings. Reject control characters before
   * placing the value into the Authorization header.
   */
  if (/[\u0000-\u001F\u007F]/.test(token)) {
    throw new FirebaseIdentityVerificationError(
      "Firebase ID token contains invalid characters.",
      { code: "invalid_token" },
    );
  }

  return token;
}

function getErrorMessage(payload: unknown, statusCode: number): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;

    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }

    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;

      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message.trim();
      }

      if (typeof nested.description === "string" && nested.description.trim()) {
        return nested.description.trim();
      }

      if (typeof nested.code === "string" && nested.code.trim()) {
        return nested.code.trim();
      }
    }

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
  }

  switch (statusCode) {
    case 400:
      return "Firebase identity verification request is invalid.";
    case 401:
      return "Firebase identity verification failed. Please complete phone verification again.";
    case 403:
      return "This Firebase phone identity cannot be used for DivyaDhara verification.";
    case 404:
      return "The lead capture session was not found. Please start the verification again.";
    case 409:
      return "This verified phone identity is already linked to another DivyaDhara identity.";
    case 410:
      return "The lead verification session has expired. Please start again.";
    case 429:
      return "Too many verification attempts. Please retry later.";
    case 500:
      return "DivyaDhara could not complete Firebase identity verification.";
    case 503:
      return "Firebase phone verification is temporarily unavailable. Please try again later.";
    default:
      return "Firebase identity verification failed.";
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return Math.ceil(seconds);
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullablePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function requiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = nullablePositiveInteger(value);

  if (parsed === null) {
    throw new FirebaseIdentityVerificationError(
      `Firebase identity verification returned an invalid ${fieldName}.`,
      { code: "invalid_response" },
    );
  }

  return parsed;
}

function normalizePhone(value: unknown): string {
  const phone = String(value ?? "").trim();

  if (
    phone.length > PHONE_MAX_LENGTH ||
    !/^\+[1-9]\d{7,14}$/.test(phone)
  ) {
    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification returned an invalid verified phone number.",
      { code: "invalid_response" },
    );
  }

  return phone;
}

function parseVerificationResponse(
  payload: unknown,
): FirebaseIdentityVerification {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    payload.verified !== true
  ) {
    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification returned an invalid response.",
      { code: "invalid_response" },
    );
  }

  const identity = payload.identity;

  if (!isRecord(identity)) {
    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification returned incomplete identity data.",
      { code: "invalid_response" },
    );
  }

  if (
    identity.provider !== "firebase" ||
    identity.identityType !== "phone" ||
    identity.status !== "verified"
  ) {
    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification returned an unverified identity.",
      { code: "verification_rejected" },
    );
  }

  const authIdentityId = requiredPositiveInteger(
    identity.authIdentityId,
    "identity id",
  );

  const phoneE164 = normalizePhone(identity.phoneE164);

  const captureSessionId = nullablePositiveInteger(
    identity.captureSessionId,
  );

  const linkedUserId = nullablePositiveInteger(
    identity.linkedUserId,
  );

  const linkedVisitorId = nullablePositiveInteger(
    identity.linkedVisitorId,
  );

  const rawLinkedToUser = identity.linkedToUser;

  if (
    rawLinkedToUser !== undefined &&
    typeof rawLinkedToUser !== "boolean"
  ) {
    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification returned an invalid linked-user flag.",
      { code: "invalid_response" },
    );
  }

  const linkedToUser =
    rawLinkedToUser === true || linkedUserId !== null;

  /*
   * The backend contract says linkedToUser is true when a local user is
   * linked. Reject impossible contradictory data instead of passing it to
   * application authorization/UI code.
   */
  if (rawLinkedToUser === false && linkedUserId !== null) {
    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification returned inconsistent account-link data.",
      { code: "invalid_response" },
    );
  }

  return {
    authIdentityId,
    provider: "firebase",
    identityType: "phone",
    phoneE164,
    status: "verified",
    linkedToUser,
    linkedUserId,
    linkedVisitorId,
    captureSessionId,
  };
}

export async function getFirebaseAuthorizationHeader(): Promise<string> {
  const token = normalizeBearerToken(await getFirebaseIdToken());
  return `Bearer ${token}`;
}

/**
 * General backend identity verification.
 *
 * Use this when the application needs to establish/verify the Firebase phone
 * identity without creating a lead from a detail gate.
 *
 * For a revenue lead/detail-gate flow, use
 * verifyFirebaseIdentityForLeadCapture() instead.
 */
export async function verifyFirebaseIdentityOnBackend(
  apiBaseUrl: string,
  signal?: AbortSignal,
  captureKey?: string,
): Promise<FirebaseIdentityVerification> {
  return verifyFirebaseIdentityOnBackendWithOptions({
    apiBaseUrl,
    signal,
    captureKey,
  });
}

/**
 * Strict helper for DivyaDhara detail-gate lead capture.
 *
 * This MUST be used by:
 *   - Temple detail gate
 *   - Pandit detail gate
 *   - Puja detail gate
 *   - Ashram detail gate
 *   - Yatra detail gate
 *   - Spiritual Place detail gate
 *   - Event detail gate
 *   - Course detail gate
 *   - Kundli capture
 *
 * The backend uses captureKey to bind the verified Firebase phone identity
 * to the active anonymous lead_capture_session. No user_id or phone number is
 * accepted from the browser as proof of identity.
 */
export async function verifyFirebaseIdentityForLeadCapture(
  apiBaseUrl: string,
  captureKey: string,
  signal?: AbortSignal,
): Promise<FirebaseIdentityVerification> {
  const normalizedCaptureKey = normalizeCaptureKey(captureKey);

  if (!normalizedCaptureKey) {
    throw new FirebaseIdentityVerificationError(
      "A lead capture key is required for Firebase lead verification.",
      { code: "invalid_configuration" },
    );
  }

  const verification = await verifyFirebaseIdentityOnBackendWithOptions({
    apiBaseUrl,
    captureKey: normalizedCaptureKey,
    signal,
  });

  /*
   * OTP verification is not enough for the business flow. The backend must
   * confirm that this exact lead-capture session was linked.
   */
  if (verification.captureSessionId === null) {
    throw new FirebaseIdentityVerificationError(
      "Firebase phone verification succeeded, but the DivyaDhara lead capture session was not linked.",
      { code: "verification_rejected" },
    );
  }

  return verification;
}

/**
 * Verifies Firebase identity through the DivyaDhara backend.
 *
 * Security boundary:
 *   Browser Firebase SDK -> Firebase ID token -> DivyaDhara backend
 *
 * The token is used only for this request and is never persisted or returned.
 */
export async function verifyFirebaseIdentityOnBackendWithOptions(
  options: VerifyFirebaseIdentityOptions,
): Promise<FirebaseIdentityVerification> {
  const base = normalizeApiBaseUrl(options.apiBaseUrl);

  if (!base) {
    throw new FirebaseIdentityVerificationError(
      "Firebase identity verification requires a configured API base URL.",
      { code: "invalid_configuration" },
    );
  }

  const captureKey = normalizeCaptureKey(options.captureKey);
  const authorization = await getFirebaseAuthorizationHeader();

  const timeoutMs = positiveTimeout(options.timeoutMs);
  const controller = new AbortController();

  let timedOut = false;
  let externallyAborted = false;
  let externalAbortHandler: (() => void) | null = null;

  if (options.signal) {
    if (options.signal.aborted) {
      throw new FirebaseIdentityVerificationError(
        "Firebase identity verification was cancelled.",
        { code: "aborted" },
      );
    }

    externalAbortHandler = () => {
      externallyAborted = true;
      controller.abort(options.signal?.reason);
    };

    options.signal.addEventListener(
      "abort",
      externalAbortHandler,
      { once: true },
    );
  }

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const requestHeaders: HeadersInit = {
      Accept: "application/json",
      Authorization: authorization,
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    };

    const hasCaptureKey = captureKey !== null;

    if (hasCaptureKey) {
      requestHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(`${base}${VERIFY_ENDPOINT}`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: requestHeaders,
      ...(hasCaptureKey
        ? {
            body: JSON.stringify({
              captureKey,
            }),
          }
        : {}),
    });

    const payload = await readJsonSafely(response);

    if (!response.ok) {
      const retryAfterSeconds = parseRetryAfter(
        response.headers.get("retry-after"),
      );

      let code: FirebaseIdentityVerificationError["code"] =
        "verification_rejected";

      if (response.status === 404 || response.status === 410) {
        code = "session_expired";
      } else if (response.status === 409) {
        code = "conflict";
      } else if (response.status === 429) {
        code = "rate_limited";
      } else if (response.status === 401) {
        code = "invalid_token";
      }

      throw new FirebaseIdentityVerificationError(
        getErrorMessage(payload, response.status),
        {
          statusCode: response.status,
          retryAfterSeconds,
          code,
        },
      );
    }

    const verification = parseVerificationResponse(payload);

    /*
     * When captureKey was supplied, the backend must return the concrete
     * lead_capture_session id. Otherwise the UI could incorrectly treat OTP
     * verification as a completed revenue-lead gate.
     */
    if (hasCaptureKey && verification.captureSessionId === null) {
      throw new FirebaseIdentityVerificationError(
        "Firebase phone verification succeeded, but the lead capture session was not linked.",
        { code: "verification_rejected" },
      );
    }

    return verification;
  } catch (error) {
    if (error instanceof FirebaseIdentityVerificationError) {
      throw error;
    }

    if (timedOut) {
      throw new FirebaseIdentityVerificationError(
        `Firebase identity verification timed out after ${timeoutMs}ms.`,
        { code: "timeout" },
      );
    }

    if (externallyAborted || options.signal?.aborted) {
      throw new FirebaseIdentityVerificationError(
        "Firebase identity verification was cancelled.",
        { code: "aborted" },
      );
    }

    throw new FirebaseIdentityVerificationError(
      "Unable to reach the DivyaDhara Firebase verification service.",
      { code: "network" },
    );
  } finally {
    globalThis.clearTimeout(timeout);

    if (externalAbortHandler && options.signal) {
      options.signal.removeEventListener(
        "abort",
        externalAbortHandler,
      );
    }
  }
}
