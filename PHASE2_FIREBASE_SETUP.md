# DivyaDhara Phase 2 — Firebase Phone OTP Foundation

This bundle adds the Firebase foundation only. It intentionally does **not** modify the Phase-1 SQLite schema and does not implement the final `LeadCaptureGate` yet.

## What is included

- Firebase Web SDK initialization.
- Browser-local Firebase auth persistence.
- Phone OTP flow using `signInWithPhoneNumber` + `RecaptchaVerifier`.
- Firebase ID-token retrieval for the upcoming lead API.
- Firebase Admin initialization on Express.
- Server-side Firebase ID-token verification.
- `/api/auth/firebase/verify` identity bridge into `auth_identities`.
- Rate limiting on the identity bridge.
- Environment template.
- Safe integration script for the existing `/api/auth` router tree.

## Install

From the DivyaDhara project root:

```bash
npm install firebase firebase-admin
```

The Firebase Web SDK uses the modular API, which Firebase recommends for production web applications. Phone authentication on the web uses `RecaptchaVerifier` together with `signInWithPhoneNumber`. The backend verifies the resulting Firebase ID token with the Admin SDK.

## Firebase Console setup

1. Create/open the DivyaDhara Firebase project.
2. Add a Web App and copy its Web SDK configuration.
3. Open Authentication → Sign-in method and enable Phone.
4. In Authentication settings, configure the SMS region policy to include the regions that DivyaDhara will serve.
5. Add the production web domain to Authentication → Settings → Authorized domains. Add development domains only where needed for local testing.
6. In Project settings → Service accounts, create/get a service-account key for the Express backend. Keep the private key server-side only.

Firebase's current phone-auth documentation requires the Phone provider to be enabled, an SMS region policy, and an authorized domain; the web flow also requires reCAPTCHA before sending the SMS.

## Environment

Copy `.env.firebase.example` values into the project's environment configuration.

Frontend values:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Backend values:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

Do not paste the service-account private key into source code or `VITE_*` variables.

## Express mount

The current DivyaDhara `server/index.ts` already has `/api/auth` as the authentication mount. Add the new Firebase router immediately after the existing auth mount:

```ts
import firebaseAuthRoutes from "./routes/firebase-auth.ts";

app.use("/api/auth", authRoutes);
app.use("/api/auth/firebase", firebaseAuthRoutes);
```

The new route exposes:

```text
POST /api/auth/firebase/verify
Authorization: Bearer <Firebase ID token>
```

The route verifies that the Firebase identity used the phone provider and then upserts the verified subject into `auth_identities`. OTP codes are never written to SQLite.

## Important architecture boundary

Firebase is being used for **phone identity verification only** in Phase 2. SQLite remains the application database. Firebase Firestore/Realtime Database is not introduced by this setup.

The future flow is:

```text
LeadCaptureGate
  → Firebase Phone OTP
  → Firebase ID token
  → POST /api/auth/firebase/verify
  → auth_identities
  → lead_capture_sessions
  → leads
  → form_submissions
```

The next Phase-2 implementation step is the reusable `LeadCaptureGate` and lead-capture API.

## Development testing

Firebase supports fictional test phone numbers in the console so development can avoid consuming SMS quota. Do not ship fictional numbers or disabled app verification in production.

Run normal project checks after integration:

```bash
npx tsc --noEmit -p tsconfig.node.json
npm run build
```
