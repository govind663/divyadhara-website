import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  getFirebasePhoneNumber,
  isFirebaseAdminConfigured,
  isFirebasePhoneIdentity,
  verifyFirebaseIdToken,
} from "../lib/firebase-admin.ts";
import { optionalAuth, type AuthenticatedUser } from "./auth.ts";

const router = Router();

/* --------------------------------------------------------------------------
 * Business/security policy
 * -------------------------------------------------------------------------- */

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 30;
const TOKEN_MAX_LENGTH = 16 * 1024;
const PHONE_MAX_LENGTH = 30;
const REQUEST_ID_MAX_LENGTH = 120;
const USER_AGENT_MAX_LENGTH = 1000;
const CAPTURE_KEY_MAX_LENGTH = 255;
const RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

/* Keep the in-memory limiter bounded in long-running processes. */
function pruneRateBuckets(now: number): void {
  if (RATE_BUCKETS.size < 5000) return;

  for (const [key, bucket] of RATE_BUCKETS) {
    if (bucket.resetAt <= now) RATE_BUCKETS.delete(key);
  }
}

function getClientIp(req: Request): string {
  return String(req.ip ?? "unknown").trim() || "unknown";
}

function getUserAgent(req: Request): string | null {
  const value = String(req.get("user-agent") ?? "").trim();
  return value ? value.slice(0, USER_AGENT_MAX_LENGTH) : null;
}

function requestId(req: Request): string | null {
  const value = String(req.get("x-request-id") ?? req.get("x-correlation-id") ?? "").trim();
  return value ? value.slice(0, REQUEST_ID_MAX_LENGTH) : null;
}

function enforceRateLimit(req: Request, res: Response): boolean {
  const now = Date.now();
  pruneRateBuckets(now);

  const key = `firebase-phone:${getClientIp(req)}`;
  const current = RATE_BUCKETS.get(key);

  if (!current || current.resetAt <= now) {
    RATE_BUCKETS.set(key, {
      count: 1,
      resetAt: now + RATE_WINDOW_MS,
    });
    return false;
  }

  if (current.count >= RATE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      success: false,
      error: "Too many Firebase identity verification attempts. Please retry later.",
      retryAfterSeconds: retryAfter,
    });
    return true;
  }

  current.count += 1;
  return false;
}

function bearerToken(req: Request): string | null {
  const value = String(req.get("authorization") ?? "").trim();
  if (!value) return null;

  const match = /^Bearer\s+(.+)$/i.exec(value);
  const token = match?.[1]?.trim() || null;

  if (!token || token.length > TOKEN_MAX_LENGTH) return null;
  return token;
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
}

function isoNow(): string {
  return new Date().toISOString();
}

function nullableText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function validPhone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone) && phone.length <= PHONE_MAX_LENGTH;
}

function getAuthenticatedUser(res: Response): AuthenticatedUser | null {
  return (res.locals.user as AuthenticatedUser | undefined) ?? null;
}

function firebaseProviderValue(decoded: unknown): string | null {
  if (!decoded || typeof decoded !== "object") return null;
  const root = decoded as Record<string, unknown>;
  const firebase = root.firebase;

  if (!firebase || typeof firebase !== "object") return null;
  const provider = (firebase as Record<string, unknown>).sign_in_provider;

  return nullableText(provider, 80);
}

function firebaseEmail(decoded: unknown): string | null {
  if (!decoded || typeof decoded !== "object") return null;
  const root = decoded as Record<string, unknown>;
  const email = nullableText(root.email, 255);
  const verified = root.email_verified === true;
  return email && verified ? email.toLowerCase() : null;
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function tableExists(tableName: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type='table'
        AND name=?
      LIMIT 1
      `,
    )
    .get(tableName) as { present?: number } | undefined;

  return Number(row?.present ?? 0) === 1;
}

function writeAudit(args: {
  req: Request;
  userId: number | null;
  action: string;
  entityId: number | null;
  oldData?: unknown;
  newData?: unknown;
}): void {
  if (!tableExists("audit_logs")) return;

  const actorType = args.userId ? "registered" : "anonymous";

  db.prepare(
    `
    INSERT INTO audit_logs (
      user_id,
      request_id,
      actor_type,
      action,
      entity_type,
      entity_id,
      old_data_json,
      new_data_json,
      ip_address,
      user_agent,
      created_at
    )
    VALUES (?, ?, ?, ?, 'auth_identity', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
  ).run(
    args.userId,
    requestId(args.req),
    actorType,
    args.action,
    args.entityId,
    args.oldData === undefined ? null : safeJson(args.oldData),
    args.newData === undefined ? null : safeJson(args.newData),
    getClientIp(args.req),
    getUserAgent(args.req),
  );
}

/* --------------------------------------------------------------------------
 * POST /api/firebase-identity/verify
 *
 * Purpose:
 *   1. Verify a real Firebase ID token server-side.
 *   2. Require Firebase phone identity.
 *   3. Persist only the provider identity metadata; never store the ID token.
 *   4. Optionally bind that verified identity to the current local account.
 *   5. Optionally mark a lead-capture session as phone-verified.
 *
 * Important:
 *   - The Firebase UID/provider_subject is the canonical external identity.
 *   - A revoked local identity is NOT automatically reactivated.
 *   - We never accept user_id from request.body for account linking.
 *   - Sales/Super Admin roles do not get special treatment here; this route is
 *     identity infrastructure, not public registration or authorization.
 * -------------------------------------------------------------------------- */
router.post("/verify", optionalAuth, async (req, res) => {
  noStore(res);

  if (enforceRateLimit(req, res)) return;

  if (!isFirebaseAdminConfigured()) {
    res.status(503).json({
      success: false,
      error: "Firebase identity verification is not configured on the server.",
    });
    return;
  }

  const idToken = bearerToken(req);

  if (!idToken) {
    res.status(401).json({
      success: false,
      error: "A valid Firebase Bearer ID token is required.",
    });
    return;
  }

  const captureKey = nullableText(req.body?.captureKey, CAPTURE_KEY_MAX_LENGTH);
  const user = getAuthenticatedUser(res);

  try {
    const decoded = await verifyFirebaseIdToken(idToken, true);

    if (!isFirebasePhoneIdentity(decoded)) {
      res.status(403).json({
        success: false,
        error: "A verified Firebase phone identity is required.",
      });
      return;
    }

    const phoneE164 = nullableText(getFirebasePhoneNumber(decoded), PHONE_MAX_LENGTH);
    const uid = nullableText((decoded as { uid?: unknown })?.uid, 255);

    if (!uid) {
      res.status(400).json({
        success: false,
        error: "Firebase token did not contain a valid identity subject.",
      });
      return;
    }

    if (!phoneE164 || !validPhone(phoneE164)) {
      res.status(400).json({
        success: false,
        error: "Firebase did not return a valid verified phone number.",
      });
      return;
    }

    const email = firebaseEmail(decoded);
    const signInProvider = firebaseProviderValue(decoded);
    const now = isoNow();

    const existing = db
      .prepare(
        `
        SELECT
          id,
          provider,
          identity_type,
          provider_subject,
          user_id,
          visitor_id,
          phone_e164,
          email,
          status,
          verified_at,
          first_seen_at,
          last_seen_at,
          metadata_json
        FROM auth_identities
        WHERE provider='firebase'
          AND provider_subject=?
        LIMIT 1
        `,
      )
      .get(uid) as
      | {
          id: number;
          provider: string;
          identity_type: "phone" | "email" | "other";
          provider_subject: string;
          user_id: number | null;
          visitor_id: number | null;
          phone_e164: string | null;
          email: string | null;
          status: "pending" | "verified" | "revoked";
          verified_at: string | null;
          first_seen_at: string;
          last_seen_at: string;
          metadata_json: string;
        }
      | undefined;

    if (existing?.status === "revoked") {
      res.status(403).json({
        success: false,
        error: "This Firebase phone identity has been revoked. Please contact DivyaDhara support.",
      });
      return;
    }

    if (existing && existing.identity_type !== "phone") {
      res.status(409).json({
        success: false,
        error: "The Firebase identity is already registered with a different identity type.",
      });
      return;
    }

    if (existing?.user_id && user?.id && Number(existing.user_id) !== Number(user.id)) {
      res.status(409).json({
        success: false,
        error: "This verified phone identity is already linked to another DivyaDhara account.",
      });
      return;
    }

    if (user?.phone && String(user.phone).trim() && String(user.phone).trim() !== phoneE164) {
      res.status(409).json({
        success: false,
        error: "The Firebase phone number is different from the phone number on the current DivyaDhara account. Update the account phone through the authenticated profile flow first.",
      });
      return;
    }

    const phoneConflict = db
      .prepare(
        `
        SELECT id, provider_subject, user_id, status
        FROM auth_identities
        WHERE provider='firebase'
          AND identity_type='phone'
          AND phone_e164=?
          AND provider_subject<>?
          AND status='verified'
        LIMIT 1
        `,
      )
      .get(phoneE164, uid) as
      | {
          id: number;
          provider_subject: string;
          user_id: number | null;
          status: "verified";
        }
      | undefined;

    if (phoneConflict && Number(phoneConflict.user_id ?? 0) !== Number(user?.id ?? -1)) {
      res.status(409).json({
        success: false,
        error: "This verified phone number is already associated with another Firebase identity.",
      });
      return;
    }

    let captureSession: {
      id: number;
      capture_key: string;
      module: string;
      entity_type: string | null;
      entity_id: number | null;
      user_id: number | null;
      auth_identity_id: number | null;
      verification_status: string;
      status: string;
      expires_at: string | null;
    } | undefined;

    if (captureKey && tableExists("lead_capture_sessions")) {
      captureSession = db
        .prepare(
          `
          SELECT
            id,
            capture_key,
            module,
            entity_type,
            entity_id,
            user_id,
            auth_identity_id,
            verification_status,
            status,
            expires_at
          FROM lead_capture_sessions
          WHERE capture_key=?
          LIMIT 1
          `,
        )
        .get(captureKey) as typeof captureSession;

      if (!captureSession) {
        res.status(404).json({
          success: false,
          error: "Lead capture session was not found or has expired.",
        });
        return;
      }

      if (
        captureSession.expires_at &&
        new Date(captureSession.expires_at).getTime() <= Date.now()
      ) {
        res.status(410).json({
          success: false,
          error: "Lead capture session has expired. Please start the verification again.",
        });
        return;
      }

      if (
        captureSession.user_id &&
        (!user || Number(captureSession.user_id) !== Number(user.id))
      ) {
        res.status(403).json({
          success: false,
          error: "This lead capture session belongs to another account.",
        });
        return;
      }
    }

    const previousMetadata = parseMetadata(existing?.metadata_json);
    const metadata = {
      ...previousMetadata,
      verification_provider: "firebase",
      identity_type: "phone",
      last_sign_in_provider: signInProvider,
      last_verified_at: now,
    };

    let authIdentityId = 0;
    let linkedVisitorId: number | null = existing?.visitor_id ?? null;
    let linkedUserId: number | null = existing?.user_id ?? null;

    const result = db.transaction(() => {
      if (existing) {
        db.prepare(
          `
          UPDATE auth_identities
          SET
            identity_type='phone',
            user_id=COALESCE(user_id, ?),
            phone_e164=?,
            email=COALESCE(?, email),
            status='verified',
            verified_at=?,
            last_seen_at=?,
            metadata_json=?,
            updated_at=?
          WHERE id=?
          `,
        ).run(
          user?.id ?? null,
          phoneE164,
          email,
          now,
          now,
          safeJson(metadata),
          now,
          existing.id,
        );

        authIdentityId = existing.id;
        linkedUserId = user?.id ?? existing.user_id ?? null;
      } else {
        const inserted = db
          .prepare(
            `
            INSERT INTO auth_identities (
              provider,
              identity_type,
              provider_subject,
              user_id,
              visitor_id,
              phone_e164,
              email,
              status,
              verified_at,
              first_seen_at,
              last_seen_at,
              metadata_json,
              created_at,
              updated_at
            )
            VALUES (
              'firebase',
              'phone',
              ?,
              ?,
              NULL,
              ?,
              ?,
              'verified',
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )
            `,
          )
          .run(
            uid,
            user?.id ?? null,
            phoneE164,
            email,
            now,
            now,
            now,
            safeJson(metadata),
            now,
            now,
          );

        authIdentityId = Number(inserted.lastInsertRowid);
        linkedUserId = user?.id ?? null;
      }

      if (user?.id) {
        if (tableExists("web_visitors")) {
          const visitor = db
            .prepare(
              `
              SELECT id
              FROM web_visitors
              WHERE user_id=?
                AND tracking_status<>'blocked'
              ORDER BY last_seen_at DESC, id DESC
              LIMIT 1
              `,
            )
            .get(user.id) as { id?: number } | undefined;

          if (visitor?.id) {
            linkedVisitorId = Number(visitor.id);
            db.prepare(
              `
              UPDATE auth_identities
              SET visitor_id=?, updated_at=?
              WHERE id=?
              `,
            ).run(linkedVisitorId, now, authIdentityId);
          }
        }

        db.prepare(
          `
          UPDATE users
          SET
            phone=CASE
              WHEN phone IS NULL OR TRIM(phone)='' THEN ?
              ELSE phone
            END,
            phone_verified_at=?,
            updated_at=?
          WHERE id=?
          `,
        ).run(phoneE164, now, now, user.id);
      }

      if (captureSession) {
        db.prepare(
          `
          UPDATE lead_capture_sessions
          SET
            user_id=COALESCE(user_id, ?),
            auth_identity_id=?,
            phone=?,
            verification_provider='firebase',
            verification_status='verified',
            phone_verified_at=?,
            status=CASE
              WHEN status IN ('expired', 'abandoned', 'failed', 'duplicate') THEN status
              ELSE 'verified'
            END,
            attempt_count=attempt_count+1,
            updated_at=?
          WHERE id=?
          `,
        ).run(
          user?.id ?? null,
          authIdentityId,
          phoneE164,
          now,
          now,
          captureSession.id,
        );
      }

      return {
        authIdentityId,
        linkedUserId,
        linkedVisitorId,
        captureSessionId: captureSession?.id ?? null,
      };
    })();

    writeAudit({
      req,
      userId: result.linkedUserId,
      action: existing ? "auth.firebase_phone_verified" : "auth.firebase_phone_identity_created",
      entityId: result.authIdentityId,
      oldData: existing
        ? {
            status: existing.status,
            userId: existing.user_id,
            visitorId: existing.visitor_id,
            phoneE164: existing.phone_e164,
          }
        : undefined,
      newData: {
        provider: "firebase",
        identityType: "phone",
        status: "verified",
        linkedUserId: result.linkedUserId,
        linkedVisitorId: result.linkedVisitorId,
        captureSessionId: result.captureSessionId,
        signInProvider,
      },
    });

    res.status(200).json({
      success: true,
      verified: true,
      identity: {
        authIdentityId: result.authIdentityId,
        provider: "firebase",
        identityType: "phone",
        phoneE164,
        status: "verified",
        linkedToUser: Boolean(result.linkedUserId),
        linkedUserId: result.linkedUserId,
        linkedVisitorId: result.linkedVisitorId,
        captureSessionId: result.captureSessionId,
      },
    });
  } catch (error) {
    console.error("Firebase identity verification failed:", error);

    res.status(401).json({
      success: false,
      error: "Firebase identity could not be verified.",
    });
  }
});

export default router;
