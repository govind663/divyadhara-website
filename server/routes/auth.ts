/* eslint-disable no-extra-boolean-cast */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

import { db } from "../db/database.ts";

const router = Router();

/*
|--------------------------------------------------------------------------
| DivyaDhara — Authentication / RBAC API
|--------------------------------------------------------------------------
|
| Canonical roles:
|   visitor
|   pandit
|   temple_manager
|   ashram_manager
|   sales
|   super_admin
|
| Public self-registration:
|   visitor, pandit, temple_manager, ashram_manager
|
| Internal-only bootstrap accounts:
|   sales, super_admin
|
| Database source of truth:
|   server/db/schema.sql
|   server/db/database.ts
|
| This module owns session authentication and account-level profile flows.
| Domain workflows such as temple assignment, Ashram assignment, sales lead
| management, billing and admin moderation remain in their own route modules.
|--------------------------------------------------------------------------
*/

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

export type UserRole =
  | "visitor"
  | "pandit"
  | "temple_manager"
  | "ashram_manager"
  | "sales"
  | "super_admin";

export type UserStatus =
  | "pending"
  | "active"
  | "suspended"
  | "rejected"
  | "blocked";

export type AuthenticatedUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  role: UserRole;
  status: UserStatus;
  avatar: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
};

type UserDatabaseRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: UserStatus;
  avatar: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  password_hash?: string;
  role: UserRole;
};

type LocationRow = {
  id: number;
  name: string;
  type: string;
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
};

type JsonRecord = Record<string, unknown>;

type RateBucket = {
  count: number;
  resetAt: number;
};

/* -------------------------------------------------------------------------
 * Configuration
 * ---------------------------------------------------------------------- */

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const SESSION_DAYS = positiveInteger(process.env.SESSION_DAYS, 7);
const MAX_SESSIONS_PER_USER = positiveInteger(process.env.AUTH_MAX_SESSIONS, 10);
const PASSWORD_RESET_MINUTES = positiveInteger(process.env.PASSWORD_RESET_MINUTES, 30);
const EMAIL_VERIFICATION_MINUTES = positiveInteger(
  process.env.EMAIL_VERIFICATION_MINUTES,
  24 * 60,
);
const LOGIN_RATE_LIMIT = positiveInteger(process.env.AUTH_LOGIN_LIMIT, 10);
const REGISTER_RATE_LIMIT = positiveInteger(process.env.AUTH_REGISTER_LIMIT, 5);
const RESET_RATE_LIMIT = positiveInteger(process.env.AUTH_RESET_LIMIT, 5);
const VERIFY_RATE_LIMIT = positiveInteger(process.env.AUTH_VERIFY_LIMIT, 10);
const RESEND_VERIFY_RATE_LIMIT = positiveInteger(process.env.AUTH_RESEND_VERIFY_LIMIT, 5);
const CHANGE_PASSWORD_RATE_LIMIT = positiveInteger(process.env.AUTH_CHANGE_PASSWORD_LIMIT, 5);
const RATE_WINDOW_MS = positiveInteger(process.env.AUTH_RATE_WINDOW_MINUTES, 15) * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME?.trim() || "divyadhara_session";
const COOKIE_SAMESITE = (() => {
  const value = process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase();
  return value === "strict" || value === "none" ? value : "lax";
})();
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN?.trim() || null;
const COOKIE_SECURE = IS_PRODUCTION || COOKIE_SAMESITE === "none";
const REQUIRE_EMAIL_VERIFICATION = parseBooleanEnv(
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION,
  false,
);

const RATE_BUCKETS = new Map<string, RateBucket>();

/* Same scrypt cost and hash format as the bootstrap scripts. */
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};
const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const DUMMY_PASSWORD_HASH =
  "42424242424242424242424242424242:d0fa964cb6bc24e0a7e58beddfd79b961249c6235497418b2beaf85fbf56974abaa151b1129c63cf88b977335f3c63f0de3c3afbc3bd9c9a15fd87ed4dc1f30e";

const ALL_ROLES = new Set<UserRole>([
  "visitor",
  "pandit",
  "temple_manager",
  "ashram_manager",
  "sales",
  "super_admin",
]);

const INTERNAL_ROLES = new Set<UserRole>(["sales", "super_admin"]);

/* -------------------------------------------------------------------------
 * Generic input helpers
 * ---------------------------------------------------------------------- */

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeText(value: unknown, maxLength = 500): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeNullableText(value: unknown, maxLength = 500): string | null {
  const text = normalizeText(value, maxLength);
  return text || null;
}

function normalizePhone(value: unknown): string | null {
  const text = normalizeText(value, 30);
  return text || null;
}

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string | null): boolean {
  return !phone || /^[+0-9()\-\s]{7,20}$/.test(phone);
}

function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

function normalizeRole(value: unknown): UserRole | null {
  const role = normalizeText(value, 50).toLowerCase() as UserRole;
  return ALL_ROLES.has(role) ? role : null;
}

function normalizeDateOnly(value: unknown): string | null {
  const text = normalizeText(value, 20);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

function uniqueStringArray(value: unknown, maxItems = 30, maxItemLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value.slice(0, maxItems)) {
    const text = normalizeText(item, maxItemLength);
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

function uniquePositiveIds(value: unknown, maxItems = 50): number[] {
  if (!Array.isArray(value)) return [];
  const result: number[] = [];
  for (const item of value.slice(0, maxItems)) {
    const id = positiveId(item);
    if (id !== null && !result.includes(id)) result.push(id);
  }
  return result;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

function decodeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStringArray(value);
  try {
    return uniqueStringArray(JSON.parse(String(value ?? "[]")));
  } catch {
    return [];
  }
}

function makeServiceSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || "service";
}

function makeUniquePanditSlug(value: string): string {
  const base =
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "pandit";

  let slug = base;
  let counter = 1;
  while (db.prepare("SELECT 1 FROM pandit_profiles WHERE slug=? LIMIT 1").get(slug)) {
    counter += 1;
    slug = `${base}-${counter}`;
  }
  return slug;
}

/* -------------------------------------------------------------------------
 * Password hashing
 * ---------------------------------------------------------------------- */

function deriveKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) return reject(error);
      if (!Buffer.isBuffer(derivedKey)) return reject(new Error("Password derivation failed."));
      resolve(derivedKey);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

function isStoredHashFormat(value: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(value);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!isStoredHashFormat(storedHash)) return false;
  const [saltHex, hashHex] = storedHash.split(":");
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) return false;
    const actual = await deriveKey(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------
 * Token helpers
 * ---------------------------------------------------------------------- */

function makeOpaqueToken(): string {
  return randomBytes(48).toString("hex");
}

function makeSessionToken(): string {
  return makeOpaqueToken();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/* -------------------------------------------------------------------------
 * HTTP helpers
 * ---------------------------------------------------------------------- */

function getClientIp(req: Request): string {
  return typeof req.ip === "string" && req.ip.trim() ? req.ip.trim() : "unknown";
}

function getRequestId(req: Request): string | null {
  return normalizeNullableText(req.get("x-request-id"), 120);
}

function getUserAgent(req: Request): string | null {
  return normalizeNullableText(req.get("user-agent"), 500);
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
}

function sendValidationError(res: Response, error: string): void {
  res.status(400).json({ success: false, error });
}

function sendConflict(res: Response, error: string): void {
  res.status(409).json({ success: false, error });
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function allowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  if (configured.length) return new Set(configured);
  return new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ]);
}

function isTrustedBrowserMutation(req: Request): boolean {
  const origin = req.get("origin");
  if (origin) return allowedOrigins().has(normalizeOrigin(origin));

  const fetchSite = req.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") return false;

  /* CLI/server-to-server clients normally have neither header. */
  return true;
}

function rejectUntrustedMutation(req: Request, res: Response): boolean {
  if (isTrustedBrowserMutation(req)) return false;
  res.status(403).json({ success: false, error: "Untrusted request origin." });
  return true;
}

/* -------------------------------------------------------------------------
 * Rate limiting
 * ---------------------------------------------------------------------- */

function cleanupRateBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of RATE_BUCKETS) {
    if (bucket.resetAt <= now) RATE_BUCKETS.delete(key);
  }
  if (RATE_BUCKETS.size <= 10_000) return;
  const entries = [...RATE_BUCKETS.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [key] of entries.slice(0, Math.max(1, entries.length - 9_000))) RATE_BUCKETS.delete(key);
}

function rateLimitKey(scope: string, req: Request, identity = ""): string {
  return `${scope}:${getClientIp(req)}:${identity}`;
}

function enforceRateLimit(res: Response, key: string, limit: number): boolean {
  cleanupRateBuckets();
  const now = Date.now();
  const current = RATE_BUCKETS.get(key);
  if (!current || current.resetAt <= now) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      success: false,
      error: "Too many attempts. Please try again later.",
      retryAfterSeconds: retryAfter,
    });
    return true;
  }
  current.count += 1;
  RATE_BUCKETS.set(key, current);
  return false;
}

/* -------------------------------------------------------------------------
 * User / role helpers
 * ---------------------------------------------------------------------- */

function getUserByEmail(email: string): UserDatabaseRow | undefined {
  return db.prepare(`
    SELECT
      u.id, u.name, u.email, u.phone, u.city, u.state, u.country,
      u.status, u.avatar, u.email_verified_at, u.phone_verified_at,
      u.password_hash, r.code AS role
    FROM users u
    INNER JOIN roles r ON r.id=u.role_id
    WHERE LOWER(u.email)=LOWER(?)
    LIMIT 1
  `).get(email) as UserDatabaseRow | undefined;
}

function getUserById(userId: number): UserDatabaseRow | undefined {
  return db.prepare(`
    SELECT
      u.id, u.name, u.email, u.phone, u.city, u.state, u.country,
      u.status, u.avatar, u.email_verified_at, u.phone_verified_at,
      u.password_hash, r.code AS role
    FROM users u
    INNER JOIN roles r ON r.id=u.role_id
    WHERE u.id=?
    LIMIT 1
  `).get(userId) as UserDatabaseRow | undefined;
}

function publicUser(user: UserDatabaseRow): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    state: user.state,
    country: user.country,
    role: user.role,
    status: user.status,
    avatar: user.avatar,
    emailVerifiedAt: user.email_verified_at,
    phoneVerifiedAt: user.phone_verified_at,
  };
}

function getRoleRow(role: UserRole): { id: number; code: UserRole; isSystem: number; isActive: number; publicRegistrationEnabled: number; approvalRequired: number } | undefined {
  return db.prepare(`
    SELECT
      id,
      code,
      is_system AS isSystem,
      is_active AS isActive,
      public_registration_enabled AS publicRegistrationEnabled,
      approval_required AS approvalRequired
    FROM roles
    WHERE code=?
    LIMIT 1
  `).get(role) as any;
}

function getPublicRegistrationRoles(): UserRole[] {
  const row = db.prepare(`
    SELECT setting_value, setting_type
    FROM settings
    WHERE setting_key='public_registration_roles'
    LIMIT 1
  `).get() as { setting_value?: string | null; setting_type?: string | null } | undefined;

  if (!row || row.setting_type !== "json") {
    return ["visitor", "pandit", "temple_manager", "ashram_manager"];
  }

  try {
    const parsed: unknown = JSON.parse(String(row.setting_value ?? "[]"));
    if (!Array.isArray(parsed)) return ["visitor", "pandit", "temple_manager", "ashram_manager"];
    return parsed.filter((value): value is UserRole => typeof value === "string" && ALL_ROLES.has(value as UserRole));
  } catch {
    return ["visitor", "pandit", "temple_manager", "ashram_manager"];
  }
}

function isPublicRegistrationRole(role: UserRole | null): role is "visitor" | "pandit" | "temple_manager" | "ashram_manager" {
  if (!role || INTERNAL_ROLES.has(role)) return false;
  return getPublicRegistrationRoles().includes(role);
}

function registrationStatusForRole(role: UserRole): UserStatus {
  if (role === "visitor") return "active";
  const roleRow = getRoleRow(role);
  const settingKey = `${role}_registration_requires_approval`;
  const setting = db.prepare(`
    SELECT setting_value, setting_type
    FROM settings
    WHERE setting_key=?
    LIMIT 1
  `).get(settingKey) as { setting_value?: string | null; setting_type?: string | null } | undefined;

  if (setting) {
    const requiresApproval = parseBooleanEnv(setting.setting_value ?? undefined, roleRow?.approvalRequired === 1);
    return requiresApproval ? "pending" : "active";
  }

  return roleRow?.approvalRequired === 0 ? "active" : "pending";
}

/* -------------------------------------------------------------------------
 * Location helpers
 * ---------------------------------------------------------------------- */

function getLocationById(locationId: number): LocationRow | undefined {
  return db.prepare(`
    SELECT
      l.id,
      l.name,
      l.type,
      country.name AS country,
      state.name AS state,
      district.name AS district,
      city.name AS city
    FROM locations l
    LEFT JOIN locations country ON country.id=CASE WHEN l.type='country' THEN l.id ELSE l.country_id END
    LEFT JOIN locations state ON state.id=CASE WHEN l.type='state' THEN l.id ELSE l.state_id END
    LEFT JOIN locations district ON district.id=CASE WHEN l.type='district' THEN l.id ELSE l.district_id END
    LEFT JOIN locations city ON city.id=CASE WHEN l.type='city' THEN l.id ELSE l.city_id END
    WHERE l.id=?
    LIMIT 1
  `).get(locationId) as LocationRow | undefined;
}

function assertLocationIds(locationIds: number[]): void {
  if (!locationIds.length) return;
  const placeholders = locationIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id FROM locations WHERE id IN (${placeholders})`).all(...locationIds) as Array<{ id: number }>;
  const found = new Set(rows.map((row) => Number(row.id)));
  for (const id of locationIds) {
    if (!found.has(id)) throw new Error(`Location ${id} does not exist.`);
  }
}

function locationSnapshot(locationId: number | null): LocationRow | null {
  if (!locationId) return null;
  const row = getLocationById(locationId);
  if (!row) throw new Error(`Location ${locationId} does not exist.`);
  return row;
}

/* -------------------------------------------------------------------------
 * Cookie / session helpers
 * ---------------------------------------------------------------------- */

function setSessionCookie(res: Response, token: string): void {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${COOKIE_SAMESITE.charAt(0).toUpperCase()}${COOKIE_SAMESITE.slice(1)}`,
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (COOKIE_DOMAIN) parts.push(`Domain=${COOKIE_DOMAIN}`);
  if (COOKIE_SECURE) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res: Response): void {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    `SameSite=${COOKIE_SAMESITE.charAt(0).toUpperCase()}${COOKIE_SAMESITE.slice(1)}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (COOKIE_DOMAIN) parts.push(`Domain=${COOKIE_DOMAIN}`);
  if (COOKIE_SECURE) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function getCookieToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const rawCookie of cookieHeader.split(";")) {
    const cookie = rawCookie.trim();
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const name = cookie.slice(0, separator);
    if (name !== COOKIE_NAME) continue;
    const value = cookie.slice(separator + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function removeExpiredSessions(): void {
  db.prepare("DELETE FROM sessions WHERE julianday(expires_at) <= julianday('now')").run();
}

function createSession(userId: number, req?: Request): { token: string; sessionId: number; expiresAt: string } {
  removeExpiredSessions();
  const token = makeSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const result = db.prepare(`
    INSERT INTO sessions (
      user_id, token_hash, expires_at, ip_address, user_agent,
      created_at, last_activity_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    userId,
    hashToken(token),
    expiresAt,
    req ? getClientIp(req) : null,
    req ? getUserAgent(req) : null,
  );

  const sessionId = Number(result.lastInsertRowid);
  const oldSessions = db.prepare(`
    SELECT id
    FROM sessions
    WHERE user_id=?
    ORDER BY created_at DESC, id DESC
    LIMIT -1 OFFSET ?
  `).all(userId, MAX_SESSIONS_PER_USER) as Array<{ id: number }>;

  if (oldSessions.length) {
    const placeholders = oldSessions.map(() => "?").join(",");
    db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...oldSessions.map((row) => row.id));
  }

  return { token, sessionId, expiresAt };
}

function getSessionUser(token: string, res?: Response): AuthenticatedUser | null {
  const row = db.prepare(`
    SELECT id AS session_id, user_id, expires_at
    FROM sessions
    WHERE token_hash=?
    LIMIT 1
  `).get(hashToken(token)) as { session_id: number; user_id: number; expires_at: string } | undefined;
  if (!row) return null;

  const expires = Date.parse(row.expires_at);
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id=?").run(row.session_id);
    return null;
  }

  const user = getUserById(row.user_id);
  if (!user) {
    db.prepare("DELETE FROM sessions WHERE id=?").run(row.session_id);
    return null;
  }

  if (["blocked", "suspended", "rejected"].includes(user.status)) {
    db.prepare("DELETE FROM sessions WHERE id=?").run(row.session_id);
    return null;
  }

  db.prepare("UPDATE sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE id=?").run(row.session_id);
  if (res) res.locals.authSessionId = row.session_id;
  return publicUser(user);
}

function getCurrentSessionId(res: Response): number | null {
  const id = Number(res.locals.authSessionId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireAuthenticatedUser(res: Response): AuthenticatedUser | null {
  return (res.locals.user as AuthenticatedUser | undefined) ?? null;
}

/* -------------------------------------------------------------------------
 * Audit logging
 * ---------------------------------------------------------------------- */

function actorTypeForRole(role: UserRole): string {
  return role;
}

function writeAudit(
  req: Request,
  userId: number | null,
  action: string,
  entityType?: string | null,
  entityId?: number | null,
  oldData?: unknown,
  newData?: unknown,
): void {
  try {
    const user = userId !== null ? getUserById(userId) : undefined;
    db.prepare(`
      INSERT INTO audit_logs (
        user_id, request_id, actor_type, action, entity_type, entity_id,
        old_data_json, new_data_json, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      userId,
      getRequestId(req),
      user ? actorTypeForRole(user.role) : "system",
      action,
      entityType ?? null,
      entityId ?? null,
      oldData === undefined ? null : safeJson(oldData),
      newData === undefined ? null : safeJson(newData),
      getClientIp(req),
      getUserAgent(req),
    );
  } catch (error) {
    console.error("Auth audit log error:", error);
  }
}

/* -------------------------------------------------------------------------
 * Profiles for all six roles
 * ---------------------------------------------------------------------- */

function getUserProfile(user: AuthenticatedUser): Record<string, unknown> | null {
  if (user.role === "visitor") {
    return (db.prepare(`
      SELECT
        id,
        user_id AS userId,
        preferred_language AS preferredLanguage,
        date_of_birth AS dateOfBirth,
        gender,
        address,
        pincode,
        emergency_contact_name AS emergencyContactName,
        emergency_contact_phone AS emergencyContactPhone,
        marketing_consent AS marketingConsent,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM visitor_profiles
      WHERE user_id=?
      LIMIT 1
    `).get(user.id) as Record<string, unknown> | undefined) ?? null;
  }

  if (user.role === "pandit") {
    const profile = db.prepare(`
      SELECT
        p.id,
        p.user_id AS userId,
        p.slug,
        p.display_name AS displayName,
        p.title,
        p.photo,
        p.experience_years AS experienceYears,
        p.location,
        p.city,
        p.district,
        p.state,
        p.country,
        p.location_id AS locationId,
        p.languages_json AS languagesJson,
        p.specializations_json AS specializationsJson,
        p.puja_types_json AS pujaTypesJson,
        p.service_areas_json AS serviceAreasJson,
        p.associated_with AS associatedWith,
        p.about,
        p.availability,
        p.profile_status AS profileStatus,
        p.verification_status AS verificationStatus,
        p.identity_verified AS identityVerified,
        p.profile_verified AS profileVerified,
        p.authorized_contact AS authorizedContact,
        p.featured,
        p.listing_active AS listingActive,
        p.verified_at AS verifiedAt,
        p.rejection_reason AS rejectionReason,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt
      FROM pandit_profiles p
      WHERE p.user_id=?
      LIMIT 1
    `).get(user.id) as any;

    if (!profile) return null;

    const services = db.prepare(`
      SELECT
        id,
        name,
        slug,
        description,
        price_display AS priceDisplay,
        duration_text AS durationText,
        price_amount AS priceAmount,
        currency,
        duration_minutes AS durationMinutes,
        is_active AS isActive,
        sort_order AS sortOrder
      FROM pandit_service_offerings
      WHERE pandit_id=?
      ORDER BY sort_order ASC, id ASC
    `).all(profile.id);

    return {
      ...profile,
      languages: decodeJsonArray(profile.languagesJson),
      specializations: decodeJsonArray(profile.specializationsJson),
      pujaTypes: decodeJsonArray(profile.pujaTypesJson),
      serviceAreas: decodeJsonArray(profile.serviceAreasJson),
      identityVerified: Boolean(Number(profile.identityVerified ?? 0)),
      profileVerified: Boolean(Number(profile.profileVerified ?? 0)),
      authorizedContact: Boolean(Number(profile.authorizedContact ?? 0)),
      featured: Boolean(Number(profile.featured ?? 0)),
      listingActive: Boolean(Number(profile.listingActive ?? 0)),
      services,
    };
  }

  if (user.role === "temple_manager") {
    const profile = (db.prepare(`
      SELECT
        id,
        user_id AS userId,
        designation,
        organization_name AS organizationName,
        verification_status AS verificationStatus,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM temple_manager_profiles
      WHERE user_id=?
      LIMIT 1
    `).get(user.id) as Record<string, unknown> | undefined) ?? null;

    const assignments = db.prepare(`
      SELECT
        tma.id,
        tma.temple_id AS templeId,
        t.name AS templeName,
        t.slug AS templeSlug,
        tma.status,
        tma.assigned_at AS assignedAt,
        tma.revoked_at AS revokedAt
      FROM temple_manager_assignments tma
      INNER JOIN temples t ON t.id=tma.temple_id
      WHERE tma.manager_user_id=?
      ORDER BY tma.status ASC, tma.assigned_at DESC, tma.id DESC
    `).all(user.id);

    return { ...(profile ?? {}), assignments };
  }

  if (user.role === "ashram_manager") {
    const profile = (db.prepare(`
      SELECT
        id,
        user_id AS userId,
        designation,
        organization_name AS organizationName,
        verification_status AS verificationStatus,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM ashram_manager_profiles
      WHERE user_id=?
      LIMIT 1
    `).get(user.id) as Record<string, unknown> | undefined) ?? null;

    const assignments = db.prepare(`
      SELECT
        ama.id,
        ama.ashram_id AS ashramId,
        a.name AS ashramName,
        a.slug AS ashramSlug,
        ama.status,
        ama.assigned_at AS assignedAt,
        ama.revoked_at AS revokedAt
      FROM ashram_manager_assignments ama
      INNER JOIN ashrams a ON a.id=ama.ashram_id
      WHERE ama.manager_user_id=?
      ORDER BY ama.status ASC, ama.assigned_at DESC, ama.id DESC
    `).all(user.id);

    return { ...(profile ?? {}), assignments };
  }

  if (user.role === "sales") {
    const activityCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM sales_activities
      WHERE sales_user_id=?
    `).get(user.id) as { count?: number } | undefined;

    const followupCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM sales_activities
      WHERE sales_user_id=?
        AND next_follow_up_at IS NOT NULL
    `).get(user.id) as { count?: number } | undefined;

    return {
      role: "sales",
      dashboardPath: "/sales/dashboard",
      activityCount: Number(activityCount?.count ?? 0),
      followUpCount: Number(followupCount?.count ?? 0),
    };
  }

  if (user.role === "super_admin") {
    const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count?: number } | undefined;
    const leadCount = db.prepare("SELECT COUNT(*) AS count FROM leads").get() as { count?: number } | undefined;
    const templeCount = db.prepare("SELECT COUNT(*) AS count FROM temples").get() as { count?: number } | undefined;
    const ashramCount = db.prepare("SELECT COUNT(*) AS count FROM ashrams").get() as { count?: number } | undefined;
    return {
      role: "super_admin",
      dashboardPath: "/admin",
      systemSummary: {
        users: Number(userCount?.count ?? 0),
        leads: Number(leadCount?.count ?? 0),
        temples: Number(templeCount?.count ?? 0),
        ashrams: Number(ashramCount?.count ?? 0),
      },
    };
  }

  return null;
}

/* -------------------------------------------------------------------------
 * Auth middleware / permission helpers
 * ---------------------------------------------------------------------- */

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getCookieToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const user = getSessionUser(token, res);
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ success: false, error: "Session expired or invalid." });
    return;
  }

  res.locals.user = user;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getCookieToken(req);
  if (token) {
    const user = getSessionUser(token, res);
    if (user) res.locals.user = user;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = requireAuthenticatedUser(res);
    if (!user) {
      res.status(401).json({ success: false, error: "Authentication required." });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ success: false, error: "You do not have permission to access this resource." });
      return;
    }
    next();
  };
}

export function requirePermission(permissionCode: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = requireAuthenticatedUser(res);
    if (!user) {
      res.status(401).json({ success: false, error: "Authentication required." });
      return;
    }

    const row = db.prepare(`
      SELECT 1 AS allowed
      FROM role_permissions rp
      INNER JOIN roles r ON r.id=rp.role_id
      INNER JOIN permissions p ON p.id=rp.permission_id
      WHERE r.code=? AND r.is_active=1 AND p.code=?
      LIMIT 1
    `).get(user.role, permissionCode) as { allowed?: number } | undefined;

    if (!row?.allowed) {
      res.status(403).json({ success: false, error: "You do not have the required permission." });
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissionCodes: string[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = requireAuthenticatedUser(res);
    if (!user) {
      res.status(401).json({ success: false, error: "Authentication required." });
      return;
    }
    if (!permissionCodes.length) {
      res.status(403).json({ success: false, error: "No permission was specified." });
      return;
    }
    const placeholders = permissionCodes.map(() => "?").join(",");
    const row = db.prepare(`
      SELECT 1 AS allowed
      FROM role_permissions rp
      INNER JOIN roles r ON r.id=rp.role_id
      INNER JOIN permissions p ON p.id=rp.permission_id
      WHERE r.code=? AND r.is_active=1 AND p.code IN (${placeholders})
      LIMIT 1
    `).get(user.role, ...permissionCodes) as { allowed?: number } | undefined;
    if (!row?.allowed) {
      res.status(403).json({ success: false, error: "You do not have the required permission." });
      return;
    }
    next();
  };
}

/* -------------------------------------------------------------------------
 * GET /api/auth/me
 * ---------------------------------------------------------------------- */

router.get("/me", optionalAuth, (_req: Request, res: Response) => {
  noStore(res);
  const user = requireAuthenticatedUser(res);
  res.json({
    success: true,
    authenticated: Boolean(user),
    user: user ?? null,
  });
});

/* -------------------------------------------------------------------------
 * GET /api/auth/profile
 * ---------------------------------------------------------------------- */

router.get("/profile", requireAuth, (_req: Request, res: Response) => {
  try {
    noStore(res);
    const user = requireAuthenticatedUser(res)!;
    res.json({ success: true, user, profile: getUserProfile(user) });
  } catch (error) {
    console.error("Auth profile GET error:", error);
    res.status(500).json({ success: false, error: "Unable to load your profile." });
  }
});

/* -------------------------------------------------------------------------
 * GET /api/auth/role
 * ---------------------------------------------------------------------- */

router.get("/role", requireAuth, (_req: Request, res: Response) => {
  try {
    noStore(res);
    const user = requireAuthenticatedUser(res)!;
    const rows = db.prepare(`
      SELECT p.code
      FROM role_permissions rp
      INNER JOIN roles r ON r.id=rp.role_id
      INNER JOIN permissions p ON p.id=rp.permission_id
      WHERE r.code=? AND r.is_active=1
      ORDER BY p.code ASC
    `).all(user.role) as Array<{ code: string }>;
    res.json({
      success: true,
      role: user.role,
      status: user.status,
      userId: user.id,
      permissions: rows.map((row) => row.code).filter(Boolean),
    });
  } catch (error) {
    console.error("Auth role error:", error);
    res.status(500).json({ success: false, error: "Unable to load role information." });
  }
});

/* -------------------------------------------------------------------------
 * POST /api/auth/register
 * ---------------------------------------------------------------------- */

router.post("/register", async (req: Request, res: Response) => {
  try {
    noStore(res);
    if (enforceRateLimit(res, rateLimitKey("register", req), REGISTER_RATE_LIMIT)) return;

    const body = req.body && typeof req.body === "object" ? (req.body as JsonRecord) : {};
    const role = normalizeRole(body.role);
    const name = normalizeText(body.name, 150);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const country = normalizeNullableText(body.country, 100) || "India";
    let city = normalizeNullableText(body.city, 120);
    let state = normalizeNullableText(body.state, 120);
    const district = normalizeNullableText(body.district, 120);
    const password = body.password;

    if (!role) return sendValidationError(res, "A valid account role is required.");
    if (!isPublicRegistrationRole(role)) {
      res.status(403).json({ success: false, error: "This role cannot be registered publicly." });
      return;
    }
    if (name.length < 2) return sendValidationError(res, "Name must contain at least 2 characters.");
    if (!isValidEmail(email)) return sendValidationError(res, "Please enter a valid email address.");
    if (!isValidPhone(phone)) return sendValidationError(res, "Please enter a valid phone number.");
    if (!isValidPassword(password)) return sendValidationError(res, "Password must be between 8 and 128 characters.");
    if (getUserByEmail(email)) return sendConflict(res, "An account with this email already exists.");

    const locationId = positiveId(body.locationId ?? body.primaryLocationId);
    const location = ["pandit", "temple_manager", "ashram_manager"].includes(role)
      ? locationSnapshot(locationId)
      : null;

    if (location) {
      city = location.city ?? city;
      state = location.state ?? state;
    }

    const serviceLocationIds = uniquePositiveIds(body.serviceLocationIds ?? body.serviceAreasLocationIds, 50);
    const initialServices = Array.isArray(body.services) ? body.services.slice(0, 30) : [];
    const verificationDocuments = Array.isArray(body.verificationDocuments) ? body.verificationDocuments.slice(0, 10) : [];

    const passwordHash = await hashPassword(password);
    const transaction = db.transaction(() => {
      const roleRow = getRoleRow(role);
      if (!roleRow || roleRow.isActive !== 1 || roleRow.isSystem !== 1) {
        throw new Error(`Role "${role}" is not configured as an active system role.`);
      }
      if (INTERNAL_ROLES.has(role)) throw new Error("Internal roles cannot be publicly registered.");

      if (role === "pandit") assertLocationIds(serviceLocationIds);
      if (role === "visitor" && serviceLocationIds.length) {
        /* Ignore irrelevant service locations for visitors rather than creating stray rows. */
      }

      const userStatus = registrationStatusForRole(role);
      const userResult = db.prepare(`
        INSERT INTO users (
          role_id, name, email, phone, password_hash, status,
          city, state, country, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        roleRow.id,
        name,
        email,
        phone,
        passwordHash,
        userStatus,
        city,
        state,
        country,
      );
      const userId = Number(userResult.lastInsertRowid);

      if (role === "visitor") {
        db.prepare(`
          INSERT INTO visitor_profiles (
            user_id, preferred_language, date_of_birth, gender, address, pincode,
            emergency_contact_name, emergency_contact_phone, marketing_consent,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          userId,
          normalizeNullableText(body.preferredLanguage, 80),
          normalizeDateOnly(body.dateOfBirth ?? body.dob),
          normalizeNullableText(body.gender, 30),
          normalizeNullableText(body.address, 1000),
          normalizeNullableText(body.pincode, 20),
          normalizeNullableText(body.emergencyContactName, 150),
          normalizePhone(body.emergencyContactPhone),
          body.marketingConsent ? 1 : 0,
        );
      }

      if (role === "pandit") {
        const slug = makeUniquePanditSlug(name);
        const languages = uniqueStringArray(body.languages);
        const specializations = uniqueStringArray(body.specializations);
        const pujaTypes = uniqueStringArray(body.pujaTypes);
        const serviceAreas = uniqueStringArray(body.serviceAreas);
        const experienceRaw = Number(body.experienceYears ?? body.experience ?? 0);
        if (!Number.isFinite(experienceRaw) || experienceRaw < 0) throw new Error("Experience years must be a non-negative number.");

        const profileResult = db.prepare(`
          INSERT INTO pandit_profiles (
            user_id, slug, display_name, title, photo, experience_years,
            location, city, district, state, country, location_id,
            languages_json, specializations_json, puja_types_json, service_areas_json,
            associated_with, about, availability,
            profile_status, verification_status, identity_verified,
            profile_verified, authorized_contact, featured, listing_active,
            created_at, updated_at
          ) VALUES (
            ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
            'pending','pending',0,0,0,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
          )
        `).run(
          userId,
          slug,
          name,
          normalizeNullableText(body.title, 200),
          normalizeNullableText(body.photo, 500),
          Math.floor(experienceRaw),
          location?.name ?? city,
          city,
          location?.district ?? district,
          state,
          country,
          locationId,
          JSON.stringify(languages),
          JSON.stringify(specializations),
          JSON.stringify(pujaTypes),
          JSON.stringify(serviceAreas),
          normalizeNullableText(body.associatedWith, 300),
          normalizeNullableText(body.about, 5000),
          normalizeNullableText(body.availability, 300),
        );

        const panditId = Number(profileResult.lastInsertRowid);
        if (locationId) {
          db.prepare(`
            INSERT OR IGNORE INTO pandit_service_locations (
              pandit_id, location_id, relation_type, is_active, priority,
              created_at, updated_at
            ) VALUES (?, ?, 'primary', 1, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(panditId, locationId);
        }

        if (serviceLocationIds.length) {
          const insertLocation = db.prepare(`
            INSERT OR IGNORE INTO pandit_service_locations (
              pandit_id, location_id, relation_type, is_active, priority,
              created_at, updated_at
            ) VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `);
          for (const serviceLocationId of serviceLocationIds) {
            if (serviceLocationId === locationId) continue;
            insertLocation.run(panditId, serviceLocationId, "service_area", 0);
          }
        }

        const insertService = db.prepare(`
          INSERT INTO pandit_service_offerings (
            pandit_id, name, slug, description, price_display, duration_text,
            price_amount, currency, duration_minutes, is_active, sort_order,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        for (const [index, rawService] of initialServices.entries()) {
          if (!rawService || typeof rawService !== "object") continue;
          const service = rawService as JsonRecord;
          const serviceName = normalizeText(service.name, 180);
          if (!serviceName) continue;
          const rawPrice = Number(service.priceAmount);
          const rawDuration = Number(service.durationMinutes);
          insertService.run(
            panditId,
            serviceName,
            makeServiceSlug(serviceName),
            normalizeNullableText(service.description, 500),
            normalizeNullableText(service.priceDisplay, 80),
            normalizeNullableText(service.durationText, 80),
            Number.isFinite(rawPrice) && rawPrice >= 0 ? Math.floor(rawPrice) : null,
            Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : null,
            index,
          );
        }

        const allowedDocumentTypes = new Set([
          "government_id", "address_proof", "guru_reference", "parampara_reference",
          "qualification", "video_sample", "other",
        ]);
        const insertDocument = db.prepare(`
          INSERT INTO pandit_verification_documents (
            pandit_id, document_type, document_name, document_url, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        for (const rawDocument of verificationDocuments) {
          if (!rawDocument || typeof rawDocument !== "object") continue;
          const document = rawDocument as JsonRecord;
          const documentType = normalizeText(document.documentType, 50).toLowerCase();
          const documentUrl = normalizeNullableText(document.documentUrl ?? document.url, 2000);
          if (!allowedDocumentTypes.has(documentType) || !documentUrl) continue;
          insertDocument.run(
            panditId,
            documentType,
            normalizeNullableText(document.documentName ?? document.name, 200),
            documentUrl,
          );
        }
      }

      if (role === "temple_manager") {
        db.prepare(`
          INSERT INTO temple_manager_profiles (
            user_id, designation, organization_name, verification_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          userId,
          normalizeNullableText(body.designation, 150),
          normalizeNullableText(body.organizationName ?? body.organization, 250),
        );
      }

      if (role === "ashram_manager") {
        db.prepare(`
          INSERT INTO ashram_manager_profiles (
            user_id, designation, organization_name, verification_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          userId,
          normalizeNullableText(body.designation, 150),
          normalizeNullableText(body.organizationName ?? body.organization, 250),
        );
      }

      db.prepare(`
        DELETE FROM verification_tokens
        WHERE user_id=? AND purpose='email_verification' AND verified_at IS NULL
      `).run(userId);

      const verificationToken = makeOpaqueToken();
      const verificationExpiresAt = new Date(
        Date.now() + EMAIL_VERIFICATION_MINUTES * 60 * 1000,
      ).toISOString();
      db.prepare(`
        INSERT INTO verification_tokens (
          user_id, token_hash, purpose, expires_at, created_at
        ) VALUES (?, ?, 'email_verification', ?, CURRENT_TIMESTAMP)
      `).run(userId, hashToken(verificationToken), verificationExpiresAt);

      return {
        userId,
        userStatus,
        rawVerificationToken: verificationToken,
        verificationExpiresAt,
      };
    });

    const created = transaction();
    const user = getUserById(created.userId);
    if (!user) {
      res.status(500).json({ success: false, error: "Account was created but could not be loaded." });
      return;
    }

    writeAudit(req, user.id, "auth.registration_completed", "user", user.id, undefined, {
      role: user.role,
      status: user.status,
    });

    if (user.status === "active") {
      const session = createSession(user.id, req);
      setSessionCookie(res, session.token);
      res.status(201).json({
        success: true,
        message: "Registration successful.",
        authenticated: true,
        user: publicUser(user),
        // eslint-disable-next-line no-extra-boolean-cast
        verificationRequired: !Boolean(user.email_verified_at),
        emailVerificationRequired: REQUIRE_EMAIL_VERIFICATION,
        ...(IS_PRODUCTION ? {} : {
          emailVerificationToken: created.rawVerificationToken,
          verificationExpiresAt: created.verificationExpiresAt,
        }),
      });
      return;
    }

    const awaitingMessage = (() => {
      switch (user.role) {
        case "pandit": return "Pandit registration submitted. Your profile is awaiting verification.";
        case "temple_manager": return "Temple Manager registration submitted. Your account is awaiting approval.";
        case "ashram_manager": return "Ashram Manager registration submitted. Your account is awaiting approval.";
        default: return "Registration submitted and is awaiting approval.";
      }
    })();

    res.status(201).json({
      success: true,
      message: awaitingMessage,
      authenticated: false,
      user: publicUser(user),
      // eslint-disable-next-line no-extra-boolean-cast
      verificationRequired: !Boolean(user.email_verified_at),
      emailVerificationRequired: REQUIRE_EMAIL_VERIFICATION,
      ...(IS_PRODUCTION ? {} : {
        emailVerificationToken: created.rawVerificationToken,
        verificationExpiresAt: created.verificationExpiresAt,
      }),
    });
  } catch (error) {
    console.error("Registration error:", error);
    const message = error instanceof Error ? error.message : "";
    if (/unique constraint/i.test(message)) {
      sendConflict(res, "An account or profile with the supplied information already exists.");
      return;
    }
    if (/location/i.test(message)) {
      sendValidationError(res, message);
      return;
    }
    res.status(500).json({ success: false, error: "Unable to complete registration." });
  }
});

/* -------------------------------------------------------------------------
 * POST /api/auth/login
 * ---------------------------------------------------------------------- */

router.post("/login", async (req: Request, res: Response) => {
  try {
    noStore(res);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!isValidEmail(email)) return sendValidationError(res, "Please enter a valid email address.");
    if (typeof password !== "string" || !password.length) return sendValidationError(res, "Password is required.");

    if (enforceRateLimit(res, rateLimitKey("login", req, email), LOGIN_RATE_LIMIT)) return;

    const user = getUserByEmail(email);
    const validPassword = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !validPassword) {
      writeAudit(req, null, "auth.login_failed", "user", null, undefined, { email });
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }

    if (user.status === "blocked") return res.status(403).json({ success: false, error: "This account has been blocked." });
    if (user.status === "suspended") return res.status(403).json({ success: false, error: "This account is currently suspended." });
    if (user.status === "rejected") return res.status(403).json({ success: false, error: "This account has been rejected." });

    if (user.status === "pending") {
      const messageByRole: Partial<Record<UserRole, string>> = {
        pandit: "Your Pandit account is awaiting admin verification.",
        temple_manager: "Your Temple Manager account is awaiting admin approval.",
        ashram_manager: "Your Ashram Manager account is awaiting admin approval.",
      };
      const message = messageByRole[user.role] ?? "Your account is awaiting approval.";
      res.status(403).json({ success: false, error: message, approvalRequired: true });
      return;
    }

    if (
      REQUIRE_EMAIL_VERIFICATION &&
      !INTERNAL_ROLES.has(user.role) &&
      !user.email_verified_at
    ) {
      res.status(403).json({
        success: false,
        error: "Please verify your email address before logging in.",
        verificationRequired: true,
      });
      return;
    }

    db.prepare(`UPDATE users SET last_login_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id);
    const session = createSession(user.id, req);
    setSessionCookie(res, session.token);

    const currentUser = getUserById(user.id);
    if (!currentUser) {
      clearSessionCookie(res);
      res.status(500).json({ success: false, error: "Unable to load authenticated account." });
      return;
    }

    writeAudit(req, user.id, "auth.login_success", "user", user.id, undefined, {
      role: user.role,
      sessionId: session.sessionId,
    });

    res.json({
      success: true,
      message: "Login successful.",
      authenticated: true,
      user: publicUser(currentUser),
      verificationRequired: !Boolean(currentUser.email_verified_at),
      dashboardPath: getRoleRow(currentUser.role)?.code === "super_admin"
        ? "/admin"
        : getRoleRow(currentUser.role)?.code === "sales"
          ? "/sales/dashboard"
          : currentUser.role === "pandit"
            ? "/pandit/dashboard"
            : currentUser.role === "temple_manager"
              ? "/temple/dashboard"
              : currentUser.role === "ashram_manager"
                ? "/ashram/dashboard"
                : "/dashboard",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "Unable to login." });
  }
});

/* -------------------------------------------------------------------------
 * POST /api/auth/logout
 * ---------------------------------------------------------------------- */

router.post("/logout", (req: Request, res: Response) => {
  try {
    noStore(res);
    const token = getCookieToken(req);
    if (token && rejectUntrustedMutation(req, res)) return;

    if (token) {
      const session = db.prepare(`
        SELECT id AS session_id, user_id
        FROM sessions
        WHERE token_hash=?
        LIMIT 1
      `).get(hashToken(token)) as { session_id: number; user_id: number } | undefined;
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
      if (session) writeAudit(req, session.user_id, "auth.logout", "session", session.session_id);
    }

    clearSessionCookie(res);
    res.json({ success: true, authenticated: false, message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout error:", error);
    clearSessionCookie(res);
    res.status(500).json({ success: false, error: "Unable to logout." });
  }
});

/* -------------------------------------------------------------------------
 * POST /api/auth/change-password
 * ---------------------------------------------------------------------- */

router.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    noStore(res);
    if (rejectUntrustedMutation(req, res)) return;
    const user = requireAuthenticatedUser(res)!;
    if (enforceRateLimit(res, rateLimitKey("change-password", req, String(user.id)), CHANGE_PASSWORD_RATE_LIMIT)) return;

    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword ?? req.body?.password;
    if (typeof currentPassword !== "string" || !currentPassword) return sendValidationError(res, "Current password is required.");
    if (!isValidPassword(newPassword)) return sendValidationError(res, "New password must be between 8 and 128 characters.");
    if (currentPassword === newPassword) return sendValidationError(res, "New password must be different from the current password.");

    const row = db.prepare("SELECT password_hash FROM users WHERE id=? LIMIT 1").get(user.id) as { password_hash?: string } | undefined;
    if (!row?.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) {
      res.status(401).json({ success: false, error: "Current password is incorrect." });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    const transaction = db.transaction(() => {
      db.prepare("UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(passwordHash, user.id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    });
    transaction();

    const session = createSession(user.id, req);
    setSessionCookie(res, session.token);
    writeAudit(req, user.id, "auth.password_changed", "user", user.id, undefined, {
      sessionId: session.sessionId,
    });

    const refreshed = getUserById(user.id);
    res.json({
      success: true,
      message: "Password changed successfully.",
      authenticated: true,
      user: refreshed ? publicUser(refreshed) : user,
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, error: "Unable to change password." });
  }
});

/* -------------------------------------------------------------------------
 * PATCH /api/auth/profile
 * ---------------------------------------------------------------------- */

router.patch("/profile", requireAuth, (req: Request, res: Response) => {
  try {
    noStore(res);
    if (rejectUntrustedMutation(req, res)) return;

    const user = requireAuthenticatedUser(res)!;
    const body = req.body && typeof req.body === "object" ? (req.body as JsonRecord) : {};
    const oldUser = getUserById(user.id);
    if (!oldUser) {
      res.status(404).json({ success: false, error: "User account not found." });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const requestedEmail = normalizeEmail(body.email);
      if (requestedEmail && requestedEmail !== oldUser.email.toLowerCase()) {
        return sendValidationError(res, "Email changes require a separate verification flow.");
      }
    }

    const hasLocationUpdate = Object.prototype.hasOwnProperty.call(body, "locationId");
    const locationId = hasLocationUpdate ? positiveId(body.locationId) : null;
    const location = hasLocationUpdate ? locationSnapshot(locationId) : null;

    if (hasLocationUpdate && ["pandit", "temple_manager", "ashram_manager"].includes(user.role) && !location) {
      return sendValidationError(res, "A valid locationId is required for this business profile.");
    }

    const userUpdates: string[] = [];
    const userParams: unknown[] = [];

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = normalizeText(body.name, 150);
      if (name.length < 2) return sendValidationError(res, "Name must contain at least 2 characters.");
      userUpdates.push("name=?");
      userParams.push(name);
    }

    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      const phone = normalizePhone(body.phone);
      if (!isValidPhone(phone)) return sendValidationError(res, "Please enter a valid phone number.");
      userUpdates.push("phone=?");
      userParams.push(phone);
    }

    for (const field of ["city", "state", "country", "avatar"] as const) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      if (hasLocationUpdate && ["pandit", "temple_manager", "ashram_manager"].includes(user.role) && ["city", "state", "country"].includes(field)) continue;
      userUpdates.push(`${field}=?`);
      userParams.push(normalizeNullableText(body[field], field === "avatar" ? 1000 : 120));
    }

    if (location && ["pandit", "temple_manager", "ashram_manager"].includes(user.role)) {
      userUpdates.push("city=?", "state=?", "country=?");
      userParams.push(location.city, location.state, location.country ?? "India");
    }

    const transaction = db.transaction(() => {
      if (userUpdates.length) {
        userUpdates.push("updated_at=CURRENT_TIMESTAMP");
        userParams.push(user.id);
        db.prepare(`UPDATE users SET ${userUpdates.join(", ")} WHERE id=?`).run(...userParams);
      }

      if (user.role === "visitor") {
        const fields: string[] = [];
        const params: unknown[] = [];
        const items: Array<[string, string, unknown]> = [
          ["preferredLanguage", "preferred_language", normalizeNullableText(body.preferredLanguage, 80)],
          ["dateOfBirth", "date_of_birth", normalizeDateOnly(body.dateOfBirth ?? body.dob)],
          ["gender", "gender", normalizeNullableText(body.gender, 30)],
          ["address", "address", normalizeNullableText(body.address, 1000)],
          ["pincode", "pincode", normalizeNullableText(body.pincode, 20)],
          ["emergencyContactName", "emergency_contact_name", normalizeNullableText(body.emergencyContactName, 150)],
          ["emergencyContactPhone", "emergency_contact_phone", normalizePhone(body.emergencyContactPhone)],
        ];

        for (const [bodyKey, column, value] of items) {
          if (!Object.prototype.hasOwnProperty.call(body, bodyKey) && !(bodyKey === "dateOfBirth" && Object.prototype.hasOwnProperty.call(body, "dob"))) continue;
          fields.push(`${column}=?`);
          params.push(value);
        }
        if (Object.prototype.hasOwnProperty.call(body, "marketingConsent")) {
          fields.push("marketing_consent=?");
          params.push(body.marketingConsent ? 1 : 0);
        }
        if (fields.length) {
          fields.push("updated_at=CURRENT_TIMESTAMP");
          db.prepare(`
            INSERT INTO visitor_profiles (user_id, created_at, updated_at)
            VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET ${fields.join(", ")}
          `).run(user.id, ...params);
        }
      }

      if (user.role === "pandit") {
        const profile = db.prepare("SELECT * FROM pandit_profiles WHERE user_id=? LIMIT 1").get(user.id) as any;
        if (!profile) throw new Error("Pandit profile not found.");

        const fields: string[] = [];
        const params: unknown[] = [];
        const pushNullable = (key: string, column: string, max: number) => {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            fields.push(`${column}=?`);
            params.push(normalizeNullableText(body[key], max));
          }
        };

        pushNullable("displayName", "display_name", 180);
        pushNullable("title", "title", 200);
        pushNullable("photo", "photo", 500);
        pushNullable("associatedWith", "associated_with", 300);
        pushNullable("about", "about", 5000);
        pushNullable("availability", "availability", 300);

        if (Object.prototype.hasOwnProperty.call(body, "experienceYears") || Object.prototype.hasOwnProperty.call(body, "experience")) {
          const experience = Number(body.experienceYears ?? body.experience);
          if (!Number.isFinite(experience) || experience < 0) return sendValidationError(res, "Experience years must be a non-negative number.");
          fields.push("experience_years=?");
          params.push(Math.floor(experience));
        }

        const jsonFields: Array<[string, string]> = [
          ["languages", "languages_json"],
          ["specializations", "specializations_json"],
          ["pujaTypes", "puja_types_json"],
          ["serviceAreas", "service_areas_json"],
        ];
        for (const [bodyKey, column] of jsonFields) {
          if (!Object.prototype.hasOwnProperty.call(body, bodyKey)) continue;
          fields.push(`${column}=?`);
          params.push(JSON.stringify(uniqueStringArray(body[bodyKey])));
        }

        if (hasLocationUpdate && location) {
          fields.push("location_id=?", "location=?", "city=?", "district=?", "state=?", "country=?");
          params.push(location.id, location.name, location.city, location.district, location.state, location.country ?? "India");
        }

        if (fields.length) {
          fields.push("updated_at=CURRENT_TIMESTAMP");
          db.prepare(`UPDATE pandit_profiles SET ${fields.join(", ")} WHERE id=?`).run(...params, Number(profile.id));
        }

        if (Object.prototype.hasOwnProperty.call(body, "serviceLocationIds") || Object.prototype.hasOwnProperty.call(body, "serviceAreasLocationIds")) {
          const nextIds = uniquePositiveIds(body.serviceLocationIds ?? body.serviceAreasLocationIds, 50);
          assertLocationIds(nextIds);
          db.prepare("DELETE FROM pandit_service_locations WHERE pandit_id=?").run(Number(profile.id));
          const insertLocation = db.prepare(`
            INSERT OR IGNORE INTO pandit_service_locations (
              pandit_id, location_id, relation_type, is_active, priority,
              created_at, updated_at
            ) VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `);
          for (const id of nextIds) {
            const relationType = id === locationId ? "primary" : "service_area";
            insertLocation.run(Number(profile.id), id, relationType, relationType === "primary" ? 100 : 0);
          }
        }
      }

      if (user.role === "temple_manager" || user.role === "ashram_manager") {
        const table = user.role === "temple_manager" ? "temple_manager_profiles" : "ashram_manager_profiles";
        const fields: string[] = [];
        const params: unknown[] = [];
        if (Object.prototype.hasOwnProperty.call(body, "designation")) {
          fields.push("designation=?");
          params.push(normalizeNullableText(body.designation, 150));
        }
        if (Object.prototype.hasOwnProperty.call(body, "organizationName") || Object.prototype.hasOwnProperty.call(body, "organization")) {
          fields.push("organization_name=?");
          params.push(normalizeNullableText(body.organizationName ?? body.organization, 250));
        }
        if (fields.length) {
          fields.push("updated_at=CURRENT_TIMESTAMP");
          db.prepare(`
            INSERT INTO ${table} (user_id, created_at, updated_at)
            VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET ${fields.join(", ")}
          `).run(user.id, ...params);
        }
      }

      /* Sales and Super Admin may update only account-level fields above. */
    });

    transaction();
    const updatedUser = getUserById(user.id);
    if (!updatedUser) {
      res.status(500).json({ success: false, error: "Profile updated but user could not be reloaded." });
      return;
    }

    writeAudit(req, user.id, "auth.profile_updated", "user", user.id, {
      name: oldUser.name,
      phone: oldUser.phone,
      city: oldUser.city,
      state: oldUser.state,
      country: oldUser.country,
      avatar: oldUser.avatar,
    }, {
      name: updatedUser.name,
      phone: updatedUser.phone,
      city: updatedUser.city,
      state: updatedUser.state,
      country: updatedUser.country,
      avatar: updatedUser.avatar,
    });

    const currentPublicUser = publicUser(updatedUser);
    res.json({
      success: true,
      message: "Profile updated successfully.",
      user: currentPublicUser,
      profile: getUserProfile(currentPublicUser),
    });
  } catch (error) {
    console.error("Auth profile PATCH error:", error);
    const message = error instanceof Error ? error.message : "";
    if (/location/i.test(message)) return sendValidationError(res, message);
    if (/pandit profile not found/i.test(message)) {
      res.status(404).json({ success: false, error: message });
      return;
    }
    if (/unique constraint/i.test(message)) return sendConflict(res, "A profile record with the supplied information already exists.");
    res.status(500).json({ success: false, error: "Unable to update your profile." });
  }
});

/* -------------------------------------------------------------------------
 * Sessions
 * ---------------------------------------------------------------------- */

router.get("/sessions", requireAuth, (_req: Request, res: Response) => {
  try {
    noStore(res);
    const user = requireAuthenticatedUser(res)!;
    const currentSessionId = getCurrentSessionId(res);
    removeExpiredSessions();
    const rows = db.prepare(`
      SELECT
        id,
        created_at AS createdAt,
        last_activity_at AS lastActivityAt,
        expires_at AS expiresAt,
        ip_address AS ipAddress,
        user_agent AS userAgent
      FROM sessions
      WHERE user_id=?
      ORDER BY created_at DESC, id DESC
    `).all(user.id) as Array<Record<string, unknown>>;
    res.json({
      success: true,
      sessions: rows.map((row) => ({
        ...row,
        isCurrent: Number(row.id) === currentSessionId,
      })),
    });
  } catch (error) {
    console.error("Auth sessions list error:", error);
    res.status(500).json({ success: false, error: "Unable to load active sessions." });
  }
});

function revokeSession(req: Request, res: Response): void {
  try {
    noStore(res);
    if (rejectUntrustedMutation(req, res)) return;
    const user = requireAuthenticatedUser(res)!;
    const sessionId = positiveId(req.params.id);
    if (!sessionId) return sendValidationError(res, "Invalid session id.");

    const row = db.prepare(`
      SELECT id FROM sessions WHERE id=? AND user_id=? LIMIT 1
    `).get(sessionId, user.id) as { id: number } | undefined;
    if (!row) {
      res.status(404).json({ success: false, error: "Session not found." });
      return;
    }

    db.prepare("DELETE FROM sessions WHERE id=? AND user_id=?").run(sessionId, user.id);
    const isCurrent = getCurrentSessionId(res) === sessionId;
    if (isCurrent) clearSessionCookie(res);
    writeAudit(req, user.id, "auth.session_revoked", "session", sessionId, undefined, { isCurrent });
    res.json({ success: true, message: "Session revoked successfully.", currentSessionRevoked: isCurrent });
  } catch (error) {
    console.error("Auth session revoke error:", error);
    res.status(500).json({ success: false, error: "Unable to revoke session." });
  }
}

router.delete("/sessions/:id", requireAuth, revokeSession);
router.post("/sessions/:id/revoke", requireAuth, revokeSession);

router.post("/logout-all", requireAuth, (req: Request, res: Response) => {
  try {
    noStore(res);
    if (rejectUntrustedMutation(req, res)) return;
    const user = requireAuthenticatedUser(res)!;
    const result = db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    writeAudit(req, user.id, "auth.sessions_revoked_all", "user", user.id, undefined, { deletedSessions: result.changes });
    clearSessionCookie(res);
    res.json({ success: true, authenticated: false, message: "All active sessions have been logged out." });
  } catch (error) {
    console.error("Auth logout-all error:", error);
    clearSessionCookie(res);
    res.status(500).json({ success: false, error: "Unable to log out all sessions." });
  }
});

/* -------------------------------------------------------------------------
 * Password reset
 * ---------------------------------------------------------------------- */

router.post("/forgot-password", (req: Request, res: Response) => {
  try {
    noStore(res);
    const email = normalizeEmail(req.body?.email);
    const genericResponse = () => res.json({
      success: true,
      message: "If an account exists for this email, a password reset link has been prepared.",
    });

    if (enforceRateLimit(res, rateLimitKey("forgot-password", req, email), RESET_RATE_LIMIT)) return;
    if (!isValidEmail(email)) return genericResponse();

    const user = getUserByEmail(email);
    if (!user) return genericResponse();

    db.prepare("DELETE FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL").run(user.id);
    const rawToken = makeOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(user.id, hashToken(rawToken), expiresAt);

    writeAudit(req, user.id, "auth.password_reset_requested", "user", user.id);

    if (!IS_PRODUCTION) {
      res.json({ success: true, message: "Development password reset token generated.", resetToken: rawToken, expiresAt });
      return;
    }
    genericResponse();
  } catch (error) {
    console.error("Forgot password error:", error);
    res.json({ success: true, message: "If an account exists for this email, a password reset link has been prepared." });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    noStore(res);
    const token = normalizeText(req.body?.token, 200);
    const password = req.body?.password;
    if (!token) return sendValidationError(res, "Password reset token is required.");
    if (!isValidPassword(password)) return sendValidationError(res, "Password must be between 8 and 128 characters.");
    if (enforceRateLimit(res, rateLimitKey("reset-password", req, hashToken(token)), RESET_RATE_LIMIT)) return;

    const record = db.prepare(`
      SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash=?
      LIMIT 1
    `).get(hashToken(token)) as { id: number; user_id: number; expires_at: string; used_at: string | null } | undefined;

    if (!record || record.used_at) return res.status(400).json({ success: false, error: "Invalid or expired reset token." });
    const expires = Date.parse(record.expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      db.prepare("DELETE FROM password_reset_tokens WHERE id=?").run(record.id);
      return res.status(400).json({ success: false, error: "Invalid or expired reset token." });
    }

    const passwordHash = await hashPassword(password);
    const transaction = db.transaction(() => {
      const tokenUpdate = db.prepare(`
        UPDATE password_reset_tokens
        SET used_at=CURRENT_TIMESTAMP
        WHERE id=? AND used_at IS NULL
      `).run(record.id);
      if (tokenUpdate.changes !== 1) throw new Error("RESET_TOKEN_ALREADY_USED");

      const userUpdate = db.prepare(`
        UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(passwordHash, record.user_id);
      if (userUpdate.changes !== 1) throw new Error("RESET_USER_NOT_FOUND");

      db.prepare("DELETE FROM sessions WHERE user_id=?").run(record.user_id);
      db.prepare(`
        DELETE FROM password_reset_tokens
        WHERE user_id=? AND id<>? AND used_at IS NULL
      `).run(record.user_id, record.id);
    });

    transaction();
    writeAudit(req, record.user_id, "auth.password_reset_completed", "user", record.user_id);
    res.json({ success: true, message: "Password reset successful. Please login again." });
  } catch (error) {
    if (error instanceof Error && error.message === "RESET_TOKEN_ALREADY_USED") {
      res.status(400).json({ success: false, error: "This reset token has already been used." });
      return;
    }
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, error: "Unable to reset password." });
  }
});

/* -------------------------------------------------------------------------
 * Email verification
 * ---------------------------------------------------------------------- */

router.post("/verify-email", (req: Request, res: Response) => {
  try {
    noStore(res);
    const token = normalizeText(req.body?.token, 200);
    if (!token) return sendValidationError(res, "Verification token is required.");
    if (enforceRateLimit(res, rateLimitKey("verify-email", req), VERIFY_RATE_LIMIT)) return;

    const record = db.prepare(`
      SELECT id, user_id, expires_at, verified_at
      FROM verification_tokens
      WHERE token_hash=? AND purpose='email_verification'
      LIMIT 1
    `).get(hashToken(token)) as { id: number; user_id: number; expires_at: string; verified_at: string | null } | undefined;

    if (!record) return res.status(400).json({ success: false, error: "Invalid or expired verification token." });
    if (record.verified_at) {
      res.json({ success: true, message: "Email has already been verified.", alreadyVerified: true });
      return;
    }

    const expires = Date.parse(record.expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      return res.status(400).json({ success: false, error: "Invalid or expired verification token." });
    }

    const transaction = db.transaction(() => {
      const tokenUpdate = db.prepare(`
        UPDATE verification_tokens
        SET verified_at=CURRENT_TIMESTAMP
        WHERE id=? AND verified_at IS NULL
      `).run(record.id);
      if (tokenUpdate.changes !== 1) throw new Error("EMAIL_TOKEN_ALREADY_VERIFIED");

      const userUpdate = db.prepare(`
        UPDATE users SET email_verified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(record.user_id);
      if (userUpdate.changes !== 1) throw new Error("EMAIL_USER_NOT_FOUND");
    });

    transaction();
    writeAudit(req, record.user_id, "auth.email_verified", "user", record.user_id);
    const user = getUserById(record.user_id);
    res.json({ success: true, message: "Email verified successfully.", authenticated: false, user: user ? publicUser(user) : null });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_TOKEN_ALREADY_VERIFIED") {
      res.json({ success: true, message: "Email has already been verified.", alreadyVerified: true });
      return;
    }
    console.error("Email verification error:", error);
    res.status(500).json({ success: false, error: "Unable to verify email." });
  }
});

router.post("/resend-verification", optionalAuth, (req: Request, res: Response) => {
  try {
    noStore(res);
    const authenticatedUser = requireAuthenticatedUser(res);
    const requestedEmail = normalizeEmail(req.body?.email);
    const email = authenticatedUser?.email ?? requestedEmail;

    if (!isValidEmail(email)) {
      res.json({ success: true, message: "If an account exists for this email, a verification token has been prepared." });
      return;
    }

    if (authenticatedUser && rejectUntrustedMutation(req, res)) return;
    if (enforceRateLimit(res, rateLimitKey("resend-verification", req, email), RESEND_VERIFY_RATE_LIMIT)) return;

    const user = getUserByEmail(email);
    if (!user || user.email_verified_at) {
      res.json({ success: true, message: "If an account exists for this email, a verification token has been prepared.", verificationRequired: Boolean(user && !user.email_verified_at) });
      return;
    }

    db.prepare(`
      DELETE FROM verification_tokens
      WHERE user_id=? AND purpose='email_verification' AND verified_at IS NULL
    `).run(user.id);

    const rawToken = makeOpaqueToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_MINUTES * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at, created_at)
      VALUES (?, ?, 'email_verification', ?, CURRENT_TIMESTAMP)
    `).run(user.id, hashToken(rawToken), expiresAt);

    writeAudit(req, user.id, "auth.email_verification_resent", "user", user.id);

    res.json({
      success: true,
      message: "A new email verification token has been prepared.",
      verificationRequired: true,
      ...(IS_PRODUCTION ? {} : {
        emailVerificationToken: rawToken,
        verificationExpiresAt: expiresAt,
      }),
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ success: false, error: "Unable to prepare a verification token." });
  }
});

/* -------------------------------------------------------------------------
 * GET /api/auth/verification-status
 * ---------------------------------------------------------------------- */

router.get("/verification-status", requireAuth, (_req: Request, res: Response) => {
  noStore(res);
  const user = requireAuthenticatedUser(res)!;
  res.json({
    success: true,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
  });
});

export default router;
