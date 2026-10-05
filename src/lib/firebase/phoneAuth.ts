/* eslint-disable no-control-regex */
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";

import {
  ensureFirebaseAuthPersistence,
  getFirebaseAuth,
} from "./client";

/*
|--------------------------------------------------------------------------
| DivyaDhara Firebase Phone OTP
|--------------------------------------------------------------------------
|
| BUSINESS FLOW
| 1. User enters a mobile number on a DivyaDhara detail-gate / capture form.
| 2. Firebase Phone OTP + reCAPTCHA verifies possession of that number.
| 3. Firebase signs the browser into the verified phone identity.
| 4. The ID token is retrieved only when the backend bridge requests it.
| 5. The backend verifies the token server-side and, when captureKey is
|    supplied, binds the identity to the correct lead_capture_session.
|
| IMPORTANT
| - Firebase verification is NOT CRM lead creation.
| - Never use a manually entered phone number as proof of verification.
| - Never trust browser user_id / visitor_id as identity proof.
| - Do not manually persist Firebase ID tokens in localStorage/sessionStorage.
| - The backend remains the final trust boundary for DivyaDhara identity.
|
| Supported Phase-2 capture gates:
|   temple, pandit, puja, ashram, yatra, spiritual_place,
|   event, course, kundli
|
|--------------------------------------------------------------------------
*/

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const OTP_PATTERN = /^\d{6}$/;

const PHONE_MAX_LENGTH = 15;
const OTP_LENGTH = 6;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const TOKEN_MAX_LENGTH = 16 * 1024;
const RECAPTCHA_CONTAINER_MAX_LENGTH = 200;

type GrecaptchaWindow = Window & {
  grecaptcha?: {
    reset?: (widgetId: number) => void;
  };
};

type FirebasePhoneErrorCode =
  | "invalid_phone"
  | "too_many_requests"
  | "quota_exceeded"
  | "captcha_failed"
  | "code_expired"
  | "invalid_code"
  | "credential_conflict"
  | "network"
  | "cancelled"
  | "not_configured"
  | "unknown";

export class FirebasePhoneAuthError extends Error {
  readonly firebaseCode: string | null;
  readonly code: FirebasePhoneErrorCode;

  constructor(
    message: string,
    options: {
      firebaseCode?: string | null;
      code?: FirebasePhoneErrorCode;
    } = {},
  ) {
    super(message);
    this.name = "FirebasePhoneAuthError";
    this.firebaseCode = options.firebaseCode ?? null;
    this.code = options.code ?? "unknown";
  }
}

let recaptchaVerifier: RecaptchaVerifier | null = null;
let recaptchaContainerId: string | null = null;
let recaptchaExpired = false;

let lastOtpSentPhoneE164: string | null = null;
let otpCooldownUntilMs = 0;

/*
 * ConfirmationResult objects are kept only in memory. Mapping each result to
 * the phone used for that OTP prevents a reused UI state from accidentally
 * validating a code against a different entered number.
 */
const confirmationPhones = new WeakMap<object, string>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return String((error as { code: string }).code);
  }

  return null;
}

function firebaseErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = String((error as { message: string }).message).trim();
    if (message) return message;
  }

  return fallback;
}

function mapFirebasePhoneError(
  error: unknown,
  fallback: string,
): FirebasePhoneAuthError {
  const firebaseCode = getFirebaseErrorCode(error);

  switch (firebaseCode) {
    case "auth/invalid-phone-number":
      return new FirebasePhoneAuthError(
        "Enter a valid mobile number with country code, e.g. +919876543210.",
        {
          firebaseCode,
          code: "invalid_phone",
        },
      );

    case "auth/too-many-requests":
      return new FirebasePhoneAuthError(
        "Too many SMS verification attempts. Please wait and try again later.",
        {
          firebaseCode,
          code: "too_many_requests",
        },
      );

    case "auth/quota-exceeded":
      return new FirebasePhoneAuthError(
        "Firebase SMS verification quota has been reached temporarily. Please try again later.",
        {
          firebaseCode,
          code: "quota_exceeded",
        },
      );

    case "auth/captcha-check-failed":
    case "auth/missing-recaptcha-token":
      return new FirebasePhoneAuthError(
        "reCAPTCHA verification failed. Please complete the verification again.",
        {
          firebaseCode,
          code: "captcha_failed",
        },
      );

    case "auth/code-expired":
      return new FirebasePhoneAuthError(
        "This OTP has expired. Request a new OTP.",
        {
          firebaseCode,
          code: "code_expired",
        },
      );

    case "auth/invalid-verification-code":
      return new FirebasePhoneAuthError(
        "The OTP is incorrect. Enter the latest 6-digit OTP.",
        {
          firebaseCode,
          code: "invalid_code",
        },
      );

    case "auth/credential-already-in-use":
      return new FirebasePhoneAuthError(
        "This phone identity is already associated with another Firebase identity.",
        {
          firebaseCode,
          code: "credential_conflict",
        },
      );

    case "auth/network-request-failed":
      return new FirebasePhoneAuthError(
        "Network error while contacting Firebase. Please check your connection and retry.",
        {
          firebaseCode,
          code: "network",
        },
      );

    default:
      return new FirebasePhoneAuthError(
        firebaseErrorMessage(error, fallback),
        {
          firebaseCode,
          code: "unknown",
        },
      );
  }
}

function normalizeContainerId(containerId: string): string {
  const normalized = normalizeText(
    containerId,
    RECAPTCHA_CONTAINER_MAX_LENGTH,
  );

  if (!normalized) {
    throw new FirebasePhoneAuthError(
      "Firebase reCAPTCHA container ID is required.",
      { code: "not_configured" },
    );
  }

  return normalized;
}

export function normalizePhoneE164(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

export function isValidPhoneE164(value: string): boolean {
  const phone = normalizePhoneE164(value);

  return (
    phone.length <= PHONE_MAX_LENGTH &&
    E164_PHONE_PATTERN.test(phone)
  );
}

function assertValidPhoneE164(value: string): string {
  const phone = normalizePhoneE164(value);

  if (!isValidPhoneE164(phone)) {
    throw new FirebasePhoneAuthError(
      "Enter a valid mobile number with country code, e.g. +919876543210.",
      { code: "invalid_phone" },
    );
  }

  return phone;
}

function normalizeOtp(value: string): string {
  return String(value ?? "")
    .replace(/\s/g, "")
    .trim();
}

function assertValidOtp(value: string): string {
  const code = normalizeOtp(value);

  if (!OTP_PATTERN.test(code)) {
    throw new FirebasePhoneAuthError(
      `Enter the ${OTP_LENGTH}-digit OTP sent to your mobile number.`,
      { code: "invalid_code" },
    );
  }

  return code;
}

export function getOtpResendCooldownSeconds(): number {
  const remainingMs = otpCooldownUntilMs - Date.now();

  if (remainingMs <= 0) return 0;

  return Math.ceil(remainingMs / 1000);
}

export function canResendPhoneOtp(): boolean {
  return getOtpResendCooldownSeconds() === 0;
}

function startOtpCooldown(phoneE164: string): void {
  lastOtpSentPhoneE164 = phoneE164;
  otpCooldownUntilMs =
    Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000;
}

export function getLastOtpSentPhoneE164(): string | null {
  return lastOtpSentPhoneE164;
}

export function isRecaptchaExpired(): boolean {
  return recaptchaExpired;
}

export function getOrCreateRecaptchaVerifier(
  containerId: string,
): RecaptchaVerifier {
  if (!isBrowser()) {
    throw new FirebasePhoneAuthError(
      "Phone authentication is only available in a browser.",
      { code: "not_configured" },
    );
  }

  const normalizedContainerId =
    normalizeContainerId(containerId);

  const container = document.getElementById(
    normalizedContainerId,
  );

  if (!container) {
    throw new FirebasePhoneAuthError(
      `Firebase reCAPTCHA container not found: #${normalizedContainerId}`,
      { code: "not_configured" },
    );
  }

  if (
    recaptchaVerifier &&
    recaptchaContainerId === normalizedContainerId
  ) {
    return recaptchaVerifier;
  }

  clearRecaptchaVerifier();

  const auth = getFirebaseAuth();

  recaptchaExpired = false;

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    normalizedContainerId,
    {
      size: "normal",
      callback: () => {
        recaptchaExpired = false;
      },
      "expired-callback": () => {
        recaptchaExpired = true;
      },
    },
  );

  recaptchaContainerId = normalizedContainerId;

  return recaptchaVerifier;
}

export async function renderRecaptchaVerifier(
  containerId: string,
): Promise<number> {
  const verifier = getOrCreateRecaptchaVerifier(
    containerId,
  );

  try {
    const widgetId = await verifier.render();
    recaptchaExpired = false;
    return widgetId;
  } catch (error) {
    clearRecaptchaVerifier();

    throw mapFirebasePhoneError(
      error,
      "Unable to initialize Firebase reCAPTCHA. Please try again.",
    );
  }
}

export async function sendPhoneOtp(
  phoneE164: string,
  recaptchaContainerId: string,
): Promise<ConfirmationResult> {
  const phone = assertValidPhoneE164(phoneE164);

  if (!canResendPhoneOtp()) {
    const seconds = getOtpResendCooldownSeconds();

    throw new FirebasePhoneAuthError(
      `Please wait ${seconds} second${seconds === 1 ? "" : "s"} before requesting another OTP.`,
      { code: "too_many_requests" },
    );
  }

  /*
   * Firebase web phone authentication requires a reCAPTCHA verifier. A
   * verifier can be reused for the same container and is reset after failure.
   */
  const verifier =
    getOrCreateRecaptchaVerifier(
      recaptchaContainerId,
    );

  await ensureFirebaseAuthPersistence();

  const auth = getFirebaseAuth();

  try {
    const confirmationResult =
      await signInWithPhoneNumber(
        auth,
        phone,
        verifier,
      );

    /* Keep this relationship in memory only. */
    confirmationPhones.set(
      confirmationResult,
      phone,
    );

    startOtpCooldown(phone);
    recaptchaExpired = false;

    return confirmationResult;
  } catch (error) {
    resetRecaptchaWidget(verifier);

    /* No cooldown is started because Firebase did not accept the send. */
    throw mapFirebasePhoneError(
      error,
      "Unable to send the Firebase OTP. Please try again.",
    );
  }
}

export async function confirmPhoneOtp(
  confirmationResult: ConfirmationResult,
  code: string,
  expectedPhoneE164?: string,
): Promise<User> {
  if (
    !confirmationResult ||
    typeof confirmationResult.confirm !== "function"
  ) {
    throw new FirebasePhoneAuthError(
      "The Firebase OTP verification session is invalid. Please request a new OTP.",
      { code: "cancelled" },
    );
  }

  const normalizedCode = assertValidOtp(code);
  const rememberedPhone =
    confirmationPhones.get(
      confirmationResult,
    ) ?? null;

  const expectedPhone =
    expectedPhoneE164 !== undefined
      ? assertValidPhoneE164(expectedPhoneE164)
      : rememberedPhone;

  if (!expectedPhone) {
    throw new FirebasePhoneAuthError(
      "The OTP session could not be matched to a verified phone number. Please request a new OTP.",
      { code: "cancelled" },
    );
  }

  try {
    const credential =
      await confirmationResult.confirm(
        normalizedCode,
      );

    const verifiedUser = credential.user;

    if (!verifiedUser) {
      throw new FirebasePhoneAuthError(
        "Firebase OTP verification succeeded but no Firebase user was returned.",
        { code: "unknown" },
      );
    }

    const verifiedPhone =
      normalizePhoneE164(
        verifiedUser.phoneNumber ?? "",
      );

    if (
      !isValidPhoneE164(verifiedPhone) ||
      verifiedPhone !== expectedPhone
    ) {
      /* Never let a different phone identity pass the business gate. */
      try {
        await signOut(getFirebaseAuth());
      } catch {
        // Best-effort cleanup only.
      }

      throw new FirebasePhoneAuthError(
        "Firebase verified a different phone identity than the number submitted for this DivyaDhara verification.",
        { code: "credential_conflict" },
      );
    }

    /*
     * Firebase authentication is now complete. Backend verification is still
     * mandatory before the app submits a revenue-generating lead.
     */
    confirmationPhones.delete(
      confirmationResult,
    );
    lastOtpSentPhoneE164 = expectedPhone;
    otpCooldownUntilMs = 0;
    recaptchaExpired = false;

    return verifiedUser;
  } catch (error) {
    if (error instanceof FirebasePhoneAuthError) {
      throw error;
    }

    throw mapFirebasePhoneError(
      error,
      "Unable to verify the Firebase OTP. Please try again.",
    );
  }
}

export async function getFirebaseIdToken(
  forceRefresh = false,
): Promise<string> {
  const user = getFirebaseAuth().currentUser;

  if (!user) {
    throw new FirebasePhoneAuthError(
      "No verified Firebase phone session is available. Complete phone verification first.",
      { code: "cancelled" },
    );
  }

  const phone =
    normalizePhoneE164(
      user.phoneNumber ?? "",
    );

  if (!isValidPhoneE164(phone)) {
    throw new FirebasePhoneAuthError(
      "The current Firebase session does not contain a valid verified phone identity.",
      { code: "invalid_phone" },
    );
  }

  try {
    const token =
      String(
        await user.getIdToken(forceRefresh),
      ).trim();

    if (!token) {
      throw new FirebasePhoneAuthError(
        "Firebase returned an empty ID token.",
        { code: "unknown" },
      );
    }

    if (token.length > TOKEN_MAX_LENGTH) {
      throw new FirebasePhoneAuthError(
        "Firebase returned an unexpectedly large ID token.",
        { code: "unknown" },
      );
    }

    if (/[\u0000-\u001F\u007F]/.test(token)) {
      throw new FirebasePhoneAuthError(
        "Firebase returned an invalid ID token.",
        { code: "unknown" },
      );
    }

    return token;
  } catch (error) {
    if (error instanceof FirebasePhoneAuthError) {
      throw error;
    }

    throw mapFirebasePhoneError(
      error,
      "Unable to obtain the Firebase identity token.",
    );
  }
}

export function getCurrentFirebaseUser(): User | null {
  if (!isBrowser()) return null;

  return getFirebaseAuth().currentUser;
}

export function isCurrentFirebasePhoneVerified(
  expectedPhoneE164?: string,
): boolean {
  const user = getCurrentFirebaseUser();

  if (!user?.phoneNumber) return false;

  const actualPhone =
    normalizePhoneE164(user.phoneNumber);

  if (!isValidPhoneE164(actualPhone)) {
    return false;
  }

  if (expectedPhoneE164 === undefined) {
    return true;
  }

  const expectedPhone =
    normalizePhoneE164(expectedPhoneE164);

  return (
    isValidPhoneE164(expectedPhone) &&
    actualPhone === expectedPhone
  );
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(getFirebaseAuth());
  } catch (error) {
    throw mapFirebasePhoneError(
      error,
      "Unable to sign out from Firebase.",
    );
  } finally {
    clearRecaptchaVerifier();
    lastOtpSentPhoneE164 = null;
    otpCooldownUntilMs = 0;
  }
}

export function resetRecaptchaWidget(
  verifier: RecaptchaVerifier | null =
    recaptchaVerifier,
): void {
  if (
    !verifier ||
    !isBrowser()
  ) {
    return;
  }

  void verifier
    .render()
    .then((widgetId: number) => {
      const grecaptcha =
        (window as GrecaptchaWindow)
          .grecaptcha;

      grecaptcha?.reset?.(widgetId);
      recaptchaExpired = false;
    })
    .catch(() => {
      /* The verifier may already be cleared or unavailable. */
    });
}

export function clearRecaptchaVerifier(): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // Ignore cleanup errors during verifier teardown.
    }
  }

  recaptchaVerifier = null;
  recaptchaContainerId = null;
  recaptchaExpired = false;
}

/* Compatibility aliases for existing DivyaDhara UI imports. */
export const verifyPhoneOtp = confirmPhoneOtp;
export const requestPhoneOtp = sendPhoneOtp;

export default {
  normalizePhoneE164,
  isValidPhoneE164,
  getOrCreateRecaptchaVerifier,
  renderRecaptchaVerifier,
  sendPhoneOtp,
  requestPhoneOtp,
  confirmPhoneOtp,
  verifyPhoneOtp,
  getFirebaseIdToken,
  getCurrentFirebaseUser,
  isCurrentFirebasePhoneVerified,
  getOtpResendCooldownSeconds,
  canResendPhoneOtp,
  getLastOtpSentPhoneE164,
  isRecaptchaExpired,
  signOutFirebase,
  resetRecaptchaWidget,
  clearRecaptchaVerifier,
};
