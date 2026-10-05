import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
} from "firebase/app";

import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";

function requiredEnv(name: string, value: string | undefined): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`Missing Firebase frontend configuration: ${name}`);
  }

  return normalized;
}

const firebaseConfig = {
  apiKey: requiredEnv(
    "VITE_FIREBASE_API_KEY",
    import.meta.env.VITE_FIREBASE_API_KEY,
  ),

  authDomain: requiredEnv(
    "VITE_FIREBASE_AUTH_DOMAIN",
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  ),

  projectId: requiredEnv(
    "VITE_FIREBASE_PROJECT_ID",
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
  ),

  storageBucket: requiredEnv(
    "VITE_FIREBASE_STORAGE_BUCKET",
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  ),

  messagingSenderId: requiredEnv(
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  ),

  appId: requiredEnv(
    "VITE_FIREBASE_APP_ID",
    import.meta.env.VITE_FIREBASE_APP_ID,
  ),
};

let authPersistencePromise: Promise<void> | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error(
      "Firebase client SDK can only be initialized in a browser.",
    );
  }

  return getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export async function ensureFirebaseAuthPersistence(): Promise<void> {
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(
      getFirebaseAuth(),
      browserLocalPersistence,
    ).catch((error) => {
      // Allow a retry if persistence setup fails.
      authPersistencePromise = null;
      throw error;
    });
  }

  await authPersistencePromise;
}