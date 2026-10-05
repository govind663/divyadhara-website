import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import {
  getAuth as getAdminAuth,
  type Auth,
  type DecodedIdToken,
} from "firebase-admin/auth";

/*
|-----------------------------------------------------------------------------
| DivyaDhara — Firebase Admin Identity Helper
|-----------------------------------------------------------------------------
|
| Business purpose
| ----------------
| Firebase Phone OTP is the verification mechanism for public/detail-page
| lead capture. The browser performs the OTP flow with Firebase Client SDK;
| this module only trusts the resulting Firebase ID token after server-side
| verification.
|
| Used by
| -------
| - /api/firebase-identity/verify
| - public detail-page lead capture flows
| - leads.ts capture-session verification
|
| Security/business rules
| -----------------------
| - Never store the Firebase ID token.
| - Never trust a phone number supplied only in request.body as proof of OTP.
| - A valid lead-capture verification must be backed by a Firebase phone
|   identity (sign_in_provider === "phone").
| - Firebase UID (provider_subject) is the canonical external identity.
| - Local account linking remains controlled by auth.ts / firebase identity
|   route; this helper does not create users or grant application roles.
| - Revocation checking is enabled by default.
| - Firebase configuration must come from server environment variables.
|-----------------------------------------------------------------------------
*/

let firebaseAdminApp: App | null = null;

const FIREBASE_PROJECT_ID_ENV = "FIREBASE_PROJECT_ID";
const FIREBASE_CLIENT_EMAIL_ENV = "FIREBASE_CLIENT_EMAIL";
const FIREBASE_PRIVATE_KEY_ENV = "FIREBASE_PRIVATE_KEY";

function envValue(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function normalizePrivateKey(value: string): string {
  return value
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
}

function validateConfiguredValues(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} {
  const projectId = envValue(FIREBASE_PROJECT_ID_ENV);
  const clientEmail = envValue(FIREBASE_CLIENT_EMAIL_ENV);
  const privateKey = normalizePrivateKey(envValue(FIREBASE_PRIVATE_KEY_ENV));

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Firebase Admin is not configured. Set ${FIREBASE_PROJECT_ID_ENV}, ${FIREBASE_CLIENT_EMAIL_ENV} and ${FIREBASE_PRIVATE_KEY_ENV}.`,
    );
  }

  if (!clientEmail.includes("@")) {
    throw new Error("Firebase Admin client email is invalid.");
  }

  if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
    throw new Error(
      "Firebase Admin private key is invalid. FIREBASE_PRIVATE_KEY must contain a PEM private key.",
    );
  }

  return { projectId, clientEmail, privateKey };
}

export function isFirebaseAdminConfigured(): boolean {
  try {
    validateConfiguredValues();
    return true;
  } catch {
    return false;
  }
}

export function getFirebaseAdminApp(): App {
  if (firebaseAdminApp) return firebaseAdminApp;

  const configured = validateConfiguredValues();

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseAdminApp = existingApps[0]!;
    return firebaseAdminApp;
  }

  firebaseAdminApp = initializeApp({
    credential: cert({
      projectId: configured.projectId,
      clientEmail: configured.clientEmail,
      privateKey: configured.privateKey,
    }),
  });

  return firebaseAdminApp;
}

export function getFirebaseAdminAuth(): Auth {
  return getAdminAuth(getFirebaseAdminApp());
}

function assertIdTokenInput(idToken: string): string {
  const token = String(idToken ?? "").trim();

  if (!token) {
    throw new Error("Firebase ID token is required.");
  }

  if (token.length > 16 * 1024) {
    throw new Error("Firebase ID token exceeds the maximum allowed size.");
  }

  return token;
}

/**
 * Verify a Firebase ID token against the configured Firebase project.
 * Revocation checking is enabled by default because this token is used as
 * proof for high-value lead-capture verification.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  checkRevoked = true,
): Promise<DecodedIdToken> {
  const token = assertIdTokenInput(idToken);
  return getFirebaseAdminAuth().verifyIdToken(token, checkRevoked);
}

export function getFirebaseUid(
  decodedToken: DecodedIdToken,
): string | null {
  const uid = String(decodedToken.uid ?? "").trim();
  return uid || null;
}

export function getFirebasePhoneNumber(
  decodedToken: DecodedIdToken,
): string | null {
  const phone = String(decodedToken.phone_number ?? "").trim();
  return phone || null;
}

/**
 * Firebase phone-auth identity is the only identity accepted for the public
 * OTP lead-capture verification path.
 */
export function isFirebasePhoneIdentity(
  decodedToken: DecodedIdToken,
): boolean {
  return decodedToken.firebase?.sign_in_provider === "phone";
}

export type FirebasePhoneIdentity = {
  uid: string;
  phoneNumber: string;
  provider: "firebase";
  identityType: "phone";
};

/**
 * Convert a verified Firebase ID token into the minimal business identity
 * needed by the lead-capture layer. This deliberately excludes the token,
 * refresh token, and unrelated Firebase claims.
 */
export function getVerifiedFirebasePhoneIdentity(
  decodedToken: DecodedIdToken,
): FirebasePhoneIdentity | null {
  if (!isFirebasePhoneIdentity(decodedToken)) {
    return null;
  }

  const uid = getFirebaseUid(decodedToken);
  const phoneNumber = getFirebasePhoneNumber(decodedToken);

  if (!uid || !phoneNumber) {
    return null;
  }

  return {
    uid,
    phoneNumber,
    provider: "firebase",
    identityType: "phone",
  };
}

/**
 * Return a verified Firebase phone identity or throw a controlled error.
 * Routes should map this to a 401/403 response rather than exposing Firebase
 * SDK error details to the public client.
 */
export function requireVerifiedFirebasePhoneIdentity(
  decodedToken: DecodedIdToken,
): FirebasePhoneIdentity {
  const identity = getVerifiedFirebasePhoneIdentity(decodedToken);

  if (!identity) {
    throw new Error("A verified Firebase phone identity is required.");
  }

  return identity;
}
