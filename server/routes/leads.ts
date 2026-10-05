/*
|--------------------------------------------------------------------------
| DivyaDhara — Leads / Forms / CRM API
|--------------------------------------------------------------------------
|
| This router is intentionally separate from authentication.
|
| Responsibilities:
| - retain every public form submission
| - normalize business leads across every DivyaDhara module
| - preserve Country → State → District → City → Area context
| - retain UTM / landing / referrer / visitor / session attribution
| - create module-specific enquiry records
| - prevent common duplicate/spam submissions
| - expose role-scoped CRM lead management
| - assign module leads against active subscription lead credits where the commercial plan defines lead quota
| - support CRM notes, follow-ups, communications, tags, documents and assignment history
|
| Mount from server/index.ts:
|   app.use("/api/leads", leadRouter);
|
| Public submission examples:
|   POST /api/leads
|   POST /api/leads/submit
|   POST /api/leads/forms/:formKey/submit
|
|--------------------------------------------------------------------------
*/

import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/database.ts";
import {
  optionalAuth,
  requireAuth,
  type AuthenticatedUser,
  type UserRole,
  type UserStatus,
} from "./auth.ts";

const router = Router();
const leadRouter = router;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function positiveInteger(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function normalizeText(value: unknown, maxLength = 500): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, maxLength);
}

function normalizeNullableText(value: unknown, maxLength = 500): string | null {
  const text = normalizeText(value, maxLength);
  return text || null;
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value, 320).toLowerCase();
}

function normalizePhone(value: unknown): string | null {
  return normalizeNullableText(value, 30);
}

function isValidEmail(email: string): boolean {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string | null): boolean {
  return !phone || /^[+0-9()\-\s]{7,20}$/.test(phone);
}

function getClientIp(req: Request): string | null {
  const value = req.ip || req.headers["x-forwarded-for"] || null;
  if (Array.isArray(value)) return normalizeNullableText(value[0], 100);
  if (typeof value === "string") return normalizeNullableText(value.split(",")[0], 100);
  return null;
}

function getUserAgent(req: Request): string | null {
  return normalizeNullableText(req.get("user-agent"), 500);
}

function ddJsonSafe(value: unknown, maxLength = 30000): string {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length <= maxLength ? text : JSON.stringify({ __truncated: true, preview: text.slice(0, maxLength - 100) });
  } catch {
    return "{}";
  }
}

function createAuditLog(params: {
  userId?: number | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (
      user_id, action, entity_type, entity_id,
      old_data_json, new_data_json, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    params.userId ?? null,
    params.action,
    params.entityType ?? null,
    params.entityId ?? null,
    params.oldData === undefined ? null : ddJsonSafe(params.oldData),
    params.newData === undefined ? null : ddJsonSafe(params.newData),
    params.ipAddress ?? null,
    params.userAgent ?? null,
  );
}


function publicLeadReceipt(leadId: number): Record<string, unknown> | null {
  return (
    db.prepare(`
      SELECT l.lead_number, ${DD_LEAD_TYPE_SQL} AS lead_type, l.status, l.priority, l.created_at
      FROM leads l
      WHERE l.id = ?
      LIMIT 1
    `).get(leadId) as Record<string, unknown> | undefined
  ) ?? null;
}

function publicAssignmentReceipt(assignment: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!assignment) return null;
  return {
    id: assignment.id ?? null,
    assignmentType: assignment.assignment_type ?? null,
    status: assignment.status ?? null,
  };
}

type DDLeadType =
  | "general"
  | "contact"
  | "puja"
  | "pandit"
  | "temple"
  | "ashram"
  | "yatra"
  | "travel"
  | "event"
  | "course"
  | "spiritual_place";

const DD_LEAD_TYPE_SQL = `CASE
  WHEN l.temple_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%temple%' THEN 'temple'
  WHEN l.requested_pandit_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%pandit%' THEN 'pandit'
  WHEN l.puja_service_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%puja%' THEN 'puja'
  WHEN l.ashram_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%ashram%' THEN 'ashram'
  WHEN l.yatra_package_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%travel%' THEN 'travel'
  WHEN l.yatra_package_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%yatra%' THEN 'yatra'
  WHEN l.event_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%event%' THEN 'event'
  WHEN l.course_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%course%' THEN 'course'
  WHEN l.spiritual_place_id IS NOT NULL AND (LOWER(COALESCE(l.source_form, '')) LIKE '%spiritual%' OR LOWER(COALESCE(l.source_form, '')) LIKE '%place%') THEN 'spiritual_place'
  WHEN l.temple_id IS NOT NULL THEN 'temple'
  WHEN l.requested_pandit_id IS NOT NULL THEN 'pandit'
  WHEN l.puja_service_id IS NOT NULL THEN 'puja'
  WHEN l.ashram_id IS NOT NULL THEN 'ashram'
  WHEN l.yatra_package_id IS NOT NULL THEN 'yatra'
  WHEN l.event_id IS NOT NULL THEN 'event'
  WHEN l.course_id IS NOT NULL THEN 'course'
  WHEN l.spiritual_place_id IS NOT NULL THEN 'spiritual_place'
  WHEN LOWER(COALESCE(l.source_form, '')) LIKE 'contact%' THEN 'contact'
  ELSE 'general'
END`;


type DDLocationContext = {
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  area: string | null;
  locationId: number | null;
  countryId: number | null;
  stateId: number | null;
  districtId: number | null;
  cityId: number | null;
  areaId: number | null;
};

type DDAnalyticsContext = {
  visitorId: number;
  visitorKey: string;
  sessionId: number;
  sessionKey: string;
};

const DD_VISITOR_COOKIE = (
  process.env.ANALYTICS_VISITOR_COOKIE || "divyadhara_visitor"
).replace(/[^A-Za-z0-9_-]/g, "_");
const DD_SESSION_COOKIE = (
  process.env.ANALYTICS_SESSION_COOKIE || "divyadhara_analytics_session"
).replace(/[^A-Za-z0-9_-]/g, "_");
const DD_SESSION_MINUTES = positiveInteger(process.env.ANALYTICS_SESSION_MINUTES, 30);
const DD_DUPLICATE_HOURS = positiveInteger(process.env.LEAD_DUPLICATE_HOURS, 24);
const DD_LEAD_WINDOW_MINUTES = positiveInteger(process.env.LEAD_RATE_LIMIT_WINDOW_MINUTES, 5);
const DD_LEAD_WINDOW_COUNT = positiveInteger(process.env.LEAD_RATE_LIMIT_COUNT, 8);
const ddRateMap = new Map<string, { count: number; startedAt: number }>();

const DD_GLOBAL_CRM_ROLES = new Set<UserRole>(["sales", "super_admin"]);

function ddSettingBoolean(key: string, fallback: boolean): boolean {
  const row = db.prepare(`SELECT setting_value, setting_type FROM settings WHERE setting_key = ? LIMIT 1`).get(key) as
    | { setting_value: string | null; setting_type: string | null }
    | undefined;
  if (!row) return fallback;
  const value = normalizeText(row.setting_value, 30).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function ddPhoneComparable(value: string | null): string {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(-10);
  return digits;
}

function ddPhonesMatch(a: string | null, b: string | null): boolean {
  const left = ddPhoneComparable(a);
  const right = ddPhoneComparable(b);
  return Boolean(left && right && left === right);
}

function ddModuleForCapture(type: DDLeadType): string {
  if (type === "puja") return "puja_service";
  if (type === "yatra" || type === "travel") return "yatra";
  if (type === "contact" || type === "general") return "other";
  return type;
}

function ddEntityTypeForLead(type: DDLeadType): string {
  if (type === "puja") return "puja_service";
  if (type === "yatra" || type === "travel") return "yatra_package";
  if (type === "general" || type === "contact") return "";
  return type;
}

function ddNotifyUser(userId: number | null, type: string, title: string, message: string, actionUrl: string | null, metadata?: unknown): void {
  if (!userId) return;
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, action_url, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, type, title, message, actionUrl, ddJson(metadata ?? {}, 10000));
  } catch (error) {
    console.error("Lead notification error:", error);
  }
}

function ddNotifyGlobalCrm(type: string, title: string, message: string, actionUrl: string | null, metadata?: unknown): void {
  try {
    const users = db.prepare(`
      SELECT u.id
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.status = 'active'
        AND r.code IN ('sales', 'super_admin')
    `).all() as Array<{ id: number }>;
    for (const target of users) ddNotifyUser(Number(target.id), type, title, message, actionUrl, metadata);
  } catch (error) {
    console.error("Global lead notification error:", error);
  }
}


function ddId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function ddInt(value: unknown, fallback: number | null = null, min = 0, max = 1000000): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return v >= min && v <= max ? v : null;
}

function ddBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const v = normalizeText(value, 20).toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function ddJson(value: unknown, maxLength = 120000): string {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length <= maxLength
      ? text
      : JSON.stringify({ __truncated: true, preview: text.slice(0, Math.max(0, maxLength - 100)) });
  } catch {
    return "{}";
  }
}

function ddNumber(prefix: string): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${stamp}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function ddCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const chunk of header.split(";")) {
    const i = chunk.indexOf("=");
    if (i < 0 || chunk.slice(0, i).trim() !== name) continue;
    const value = chunk.slice(i + 1).trim();
    if (!value) return null;
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

function ddSetCookie(res: Response, name: string, value: string, maxAge: number): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (IS_PRODUCTION) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function ddIpHash(req: Request): string | null {
  const ip = getClientIp(req);
  if (!ip) return null;
  const salt = process.env.ANALYTICS_IP_SALT || "divyadhara-analytics";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function ddBot(req: Request): boolean {
  const ua = (req.get("user-agent") || "").toLowerCase();
  return /(bot|crawler|spider|slurp|bingpreview|headless|lighthouse|semrush|ahrefs|petalbot)/i.test(ua);
}

function ddLeadType(value: unknown): DDLeadType {
  const v = normalizeText(value, 50).toLowerCase().replace(/[\s-]+/g, "_");
  switch (v) {
    case "contact": return "contact";
    case "puja":
    case "puja_service":
    case "service":
    case "services": return "puja";
    case "pandit":
    case "pandit_booking": return "pandit";
    case "temple":
    case "temple_enquiry": return "temple";
    case "ashram":
    case "ashram_enquiry": return "ashram";
    case "yatra":
    case "yatra_booking": return "yatra";
    case "travel": return "travel";
    case "event":
    case "event_enquiry": return "event";
    case "course":
    case "course_enquiry": return "course";
    default: return "general";
  }
}

function ddSource(value: unknown, path: string | null): string {
  const v = normalizeText(value, 50).toLowerCase().replace(/[\s-]+/g, "_");
  const allowed = ["website", "form", "whatsapp", "phone", "admin", "organic_search", "paid_search", "social", "email", "referral", "direct", "video", "gallery", "seo_landing"];
  if (allowed.includes(v)) return v;
  const p = (path || "").toLowerCase();
  if (p.includes("/locations/") || p.includes("/seo/")) return "seo_landing";
  return "form";
}

function ddEntityId(body: Record<string, unknown>, type: DDLeadType): number | null {
  const values: unknown[] = [];
  if (type === "puja") values.push(body.pujaServiceId, body.serviceId, body.entityId);
  else if (type === "pandit") values.push(body.panditId, body.requestedPanditId, body.entityId);
  else if (type === "temple") values.push(body.templeId, body.entityId);
  else if (type === "ashram") values.push(body.ashramId, body.entityId);
  else if (type === "yatra" || type === "travel") values.push(body.yatraPackageId, body.packageId, body.entityId);
  else if (type === "event") values.push(body.eventId, body.entityId);
  else if (type === "course") values.push(body.courseId, body.entityId);
  else values.push(body.entityId);
  for (const value of values) {
    const id = ddId(value);
    if (id) return id;
  }
  return null;
}

function ddEntityExists(type: DDLeadType, id: number | null): boolean {
  if (!id) return false;

  switch (type) {
    case "puja":
      return Boolean(db.prepare(`
        SELECT id
        FROM puja_services
        WHERE id = ? AND status = 'published'
        LIMIT 1
      `).get(id));
    case "pandit":
      return Boolean(db.prepare(`
        SELECT p.id
        FROM pandit_profiles p
        INNER JOIN users u ON u.id = p.user_id
        WHERE p.id = ?
          AND p.profile_status = 'approved'
          AND p.verification_status = 'verified'
          AND p.listing_active = 1
          AND u.status = 'active'
        LIMIT 1
      `).get(id));
    case "temple":
      return Boolean(db.prepare(`
        SELECT id FROM temples
        WHERE id = ? AND status = 'published'
        LIMIT 1
      `).get(id));
    case "ashram":
      return Boolean(db.prepare(`
        SELECT id FROM ashrams
        WHERE id = ? AND status = 'published' AND listing_active = 1
        LIMIT 1
      `).get(id));
    case "yatra":
    case "travel":
      return Boolean(db.prepare(`
        SELECT id FROM yatra_packages
        WHERE id = ? AND status = 'published'
        LIMIT 1
      `).get(id));
    case "event":
      return Boolean(db.prepare(`
        SELECT id FROM events
        WHERE id = ? AND status = 'published'
        LIMIT 1
      `).get(id));
    case "course":
      return Boolean(db.prepare(`
        SELECT id FROM courses
        WHERE id = ? AND status = 'published'
        LIMIT 1
      `).get(id));
    case "spiritual_place":
      return Boolean(db.prepare(`
        SELECT id FROM spiritual_places
        WHERE id = ? AND status = 'published'
        LIMIT 1
      `).get(id));
    default:
      // General/contact leads have no canonical entity requirement.
      return true;
  }
}

function ddLocation(body: Record<string, unknown>): DDLocationContext {
  const context: DDLocationContext = {
    country: normalizeNullableText(body.country, 100),
    state: normalizeNullableText(body.state, 120),
    district: normalizeNullableText(body.district, 120),
    city: normalizeNullableText(body.city, 120),
    area: normalizeNullableText(body.area, 150),
    locationId: ddId(body.locationId),
    countryId: ddId(body.countryId),
    stateId: ddId(body.stateId),
    districtId: ddId(body.districtId),
    cityId: ddId(body.cityId),
    areaId: ddId(body.areaId),
  };

  if (!context.locationId) {
    context.locationId = context.areaId || context.cityId || context.districtId || context.stateId || context.countryId;
  }

  let currentId = context.locationId;
  let guard = 0;
  while (currentId && guard < 8) {
    guard += 1;
    const row = db.prepare(`SELECT id, parent_id, type, name FROM locations WHERE id = ? LIMIT 1`).get(currentId) as
      | { id: number; parent_id: number | null; type: string; name: string }
      | undefined;
    if (!row) break;
    if (row.type === "country") { context.countryId = row.id; context.country = row.name; }
    if (row.type === "state") { context.stateId = row.id; context.state = row.name; }
    if (row.type === "district") { context.districtId = row.id; context.district = row.name; }
    if (row.type === "city") { context.cityId = row.id; context.city = row.name; }
    if (row.type === "area") { context.areaId = row.id; context.area = row.name; }
    currentId = row.parent_id;
  }
  return context;
}

function ddLocationJson(value: DDLocationContext): Record<string, unknown> {
  return {
    country: value.country,
    state: value.state,
    district: value.district,
    city: value.city,
    area: value.area,
    countryId: value.countryId,
    stateId: value.stateId,
    districtId: value.districtId,
    cityId: value.cityId,
    areaId: value.areaId,
    locationId: value.locationId,
  };
}

function ddValidateLocationContext(context: DDLocationContext): string | null {
  const ids = [
    context.locationId,
    context.countryId,
    context.stateId,
    context.districtId,
    context.cityId,
    context.areaId,
  ].filter((value): value is number => value !== null);

  for (const id of ids) {
    const row = db.prepare(`
      SELECT id, parent_id, type, name
      FROM locations
      WHERE id = ?
      LIMIT 1
    `).get(id) as
      | { id: number; parent_id: number | null; type: string; name: string }
      | undefined;

    if (!row) return `Location #${id} was not found.`;
  }

  const chain = new Map<number, { parent_id: number | null; type: string }>();
  let cursor = context.locationId;
  let guard = 0;
  while (cursor && guard < 12) {
    guard += 1;
    const row = db.prepare(`
      SELECT id, parent_id, type
      FROM locations
      WHERE id = ?
      LIMIT 1
    `).get(cursor) as
      | { id: number; parent_id: number | null; type: string }
      | undefined;
    if (!row) break;
    chain.set(row.id, { parent_id: row.parent_id, type: row.type });
    cursor = row.parent_id;
  }

  const expected = [
    [context.countryId, "country"],
    [context.stateId, "state"],
    [context.districtId, "district"],
    [context.cityId, "city"],
    [context.areaId, "area"],
  ] as const;

  for (const [id, type] of expected) {
    if (id === null) continue;
    const node = chain.get(id);
    if (context.locationId !== null && !node) {
      return `Location #${id} is not part of the selected location hierarchy.`;
    }
    if (node && node.type !== type) {
      return `Location #${id} is not a ${type} location.`;
    }
  }

  return null;
}

function ddContact(body: Record<string, unknown>): { name: string; email: string; phone: string | null; whatsapp: string | null } {
  return {
    name: normalizeText(body.name ?? body.fullName, 150),
    email: normalizeEmail(body.email),
    phone: normalizePhone(body.phone ?? body.mobile ?? body.mobileNumber),
    whatsapp: normalizePhone(body.whatsapp ?? body.whatsappNumber),
  };
}

function ddMessage(body: Record<string, unknown>): string | null {
  return normalizeNullableText(body.message ?? body.notes ?? body.enquiryMessage ?? body.description, 10000);
}

function ddSpamScore(body: Record<string, unknown>, req: Request, enabled: boolean): number {
  if (!enabled) return 0;
  let score = 0;
  const text = normalizeText(body.message ?? body.notes ?? body.description, 10000).toLowerCase();
  const honeypot = normalizeText(body.website ?? body.hp ?? body.companyWebsite, 500);
  const ua = (req.get("user-agent") || "").toLowerCase();
  if (honeypot) score += 100;
  if (ddBot(req)) score += 80;
  if (/(viagra|casino|crypto|backlink|loan offer|telegram|xxx)/i.test(text)) score += 35;
  if ((text.match(/https?:\/\//g) || []).length >= 3) score += 25;
  if (ua.includes("curl/") || ua.includes("wget/")) score += 20;
  return Math.min(score, 100);
}

function ddRateAllowed(req: Request): boolean {
  const key = ddIpHash(req) || "unknown";
  const now = Date.now();
  const windowMs = DD_LEAD_WINDOW_MINUTES * 60 * 1000;

  for (const [storedKey, entry] of ddRateMap) {
    if (now - entry.startedAt >= windowMs) ddRateMap.delete(storedKey);
  }

  const existing = ddRateMap.get(key);
  if (!existing || now - existing.startedAt >= windowMs) {
    ddRateMap.set(key, { count: 1, startedAt: now });
    return true;
  }
  if (existing.count >= DD_LEAD_WINDOW_COUNT) return false;
  existing.count += 1;
  return true;
}

function ddForm(formKey: string): {
  id: number | null;
  version: number;
  createsLead: boolean;
  spam: boolean;
  requiresPhoneVerification: boolean;
  captureMode: "standard_form" | "detail_gate" | "chatbot" | "other";
  success: string | null;
} {
  const row = db.prepare(`
    SELECT id, version, creates_lead, spam_protection_enabled, requires_phone_verification, capture_mode, success_message
    FROM form_definitions
    WHERE form_key = ? AND is_active = 1
    LIMIT 1
  `).get(formKey) as
    | {
        id: number;
        version: number;
        creates_lead: number;
        spam_protection_enabled: number;
        requires_phone_verification: number;
        capture_mode: "standard_form" | "detail_gate" | "chatbot" | "other";
        success_message: string | null;
      }
    | undefined;

  return {
    id: row?.id ?? null,
    version: row?.version ?? 1,
    createsLead: row ? Boolean(row.creates_lead) : true,
    spam: row ? Boolean(row.spam_protection_enabled) : true,
    requiresPhoneVerification: row ? Boolean(row.requires_phone_verification) : false,
    captureMode: row?.capture_mode ?? "standard_form",
    success: row?.success_message ?? null,
  };
}

type DDVerifiedCapture = {
  id: number;
  captureKey: string;
  module: string;
  entityType: string | null;
  entityId: number | null;
  authIdentityId: number | null;
  userId: number | null;
  phone: string | null;
  verificationStatus: string;
  status: string;
};

function ddGetVerifiedCapture(
  body: Record<string, unknown>,
  leadType: DDLeadType,
  entityId: number | null,
  contactPhone: string | null,
  user: AuthenticatedUser | undefined,
  analytics: DDAnalyticsContext,
): DDVerifiedCapture | null {
  const captureKey = normalizeNullableText(body.captureKey ?? body.leadCaptureKey, 255);
  if (!captureKey) return null;

  const row = db.prepare(`
    SELECT
      id, capture_key, module, entity_type, entity_id, auth_identity_id, user_id,
      phone, verification_status, phone_verified_at, status, expires_at,
      visitor_id, session_id, page_view_id
    FROM lead_capture_sessions
    WHERE capture_key = ?
    LIMIT 1
  `).get(captureKey) as
    | {
        id: number;
        capture_key: string;
        module: string;
        entity_type: string | null;
        entity_id: number | null;
        auth_identity_id: number | null;
        user_id: number | null;
        phone: string | null;
        verification_status: string;
        phone_verified_at: string | null;
        status: string;
        expires_at: string | null;
        visitor_id: number | null;
        session_id: number | null;
        page_view_id: number | null;
      }
    | undefined;

  if (!row) throw new Error("LEAD_CAPTURE_NOT_FOUND");
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) throw new Error("LEAD_CAPTURE_EXPIRED");
  if (["expired", "abandoned", "failed", "duplicate", "submitted"].includes(row.status)) throw new Error("LEAD_CAPTURE_UNAVAILABLE");
  if (row.verification_status !== "verified" || !row.phone_verified_at) {
    // phone_verified_at is checked below through the identity join; this branch is intentionally kept strict.
    throw new Error("LEAD_CAPTURE_NOT_VERIFIED");
  }

  const expectedModule = ddModuleForCapture(leadType);
  const expectedEntityType = ddEntityTypeForLead(leadType);
  if (row.module !== expectedModule) throw new Error("LEAD_CAPTURE_CONTEXT_MISMATCH");
  if (expectedEntityType && row.entity_type && row.entity_type !== expectedEntityType) throw new Error("LEAD_CAPTURE_CONTEXT_MISMATCH");
  if (entityId && row.entity_id && Number(row.entity_id) !== Number(entityId)) throw new Error("LEAD_CAPTURE_CONTEXT_MISMATCH");
  if (row.user_id && (!user || Number(row.user_id) !== Number(user.id))) throw new Error("LEAD_CAPTURE_ACCOUNT_MISMATCH");
  if (row.visitor_id && Number(row.visitor_id) !== Number(analytics.visitorId)) throw new Error("LEAD_CAPTURE_VISITOR_MISMATCH");
  if (row.session_id && Number(row.session_id) !== Number(analytics.sessionId)) throw new Error("LEAD_CAPTURE_SESSION_MISMATCH");

  if (!row.auth_identity_id) throw new Error("LEAD_CAPTURE_IDENTITY_MISSING");
  const identity = db.prepare(`
    SELECT id, user_id, visitor_id, phone_e164, status, verified_at
    FROM auth_identities
    WHERE id = ? AND provider = 'firebase' AND identity_type = 'phone'
    LIMIT 1
  `).get(row.auth_identity_id) as
    | { id: number; user_id: number | null; visitor_id: number | null; phone_e164: string | null; status: string; verified_at: string | null }
    | undefined;
  if (!identity || identity.status !== "verified" || !identity.verified_at) throw new Error("LEAD_CAPTURE_IDENTITY_INVALID");
  if (user && identity.user_id && Number(identity.user_id) !== Number(user.id)) throw new Error("LEAD_CAPTURE_ACCOUNT_MISMATCH");
  if (!ddPhonesMatch(contactPhone, identity.phone_e164 || row.phone)) throw new Error("LEAD_CAPTURE_PHONE_MISMATCH");

  return {
    id: row.id,
    captureKey: row.capture_key,
    module: row.module,
    entityType: row.entity_type,
    entityId: row.entity_id,
    authIdentityId: row.auth_identity_id,
    userId: row.user_id ?? user?.id ?? null,
    phone: identity.phone_e164 || row.phone || null,
    verificationStatus: row.verification_status,
    status: row.status,
  };
}


function ddAnalyticsContext(req: Request, res: Response, body: Record<string, unknown>): DDAnalyticsContext {
  const user = res.locals.user as AuthenticatedUser | undefined;
  const visitorCookie = ddCookie(req, DD_VISITOR_COOKIE);
  const sessionCookie = ddCookie(req, DD_SESSION_COOKIE);
  const location = ddLocation(body);
  const path = normalizeNullableText(body.pagePath ?? body.path, 1000);
  const referrer = normalizeNullableText(body.referrerUrl ?? req.get("referer"), 2000);
  const ipHash = ddIpHash(req);
  const bot = ddBot(req);
  const visitorKey = visitorCookie || `v_${randomBytes(24).toString("hex")}`;
  const visitorType = bot ? "bot" : user?.role === "pandit" ? "pandit" : user?.role === "temple_manager" ? "temple_manager" : user?.role === "ashram_manager" ? "ashram_manager" : user?.role === "sales" ? "sales" : user?.role === "super_admin" ? "super_admin" : user ? "registered" : "anonymous";

  let visitor = db.prepare(`
    SELECT id, visitor_key
    FROM web_visitors
    WHERE visitor_key = ?
    LIMIT 1
  `).get(visitorKey) as { id: number; visitor_key: string } | undefined;

  if (!visitor) {
    const result = db.prepare(`
      INSERT INTO web_visitors (
        visitor_key, user_id, visitor_type, first_seen_at, last_seen_at,
        first_page_path, last_page_path, first_referrer_url, last_referrer_url,
        first_utm_source, first_utm_medium, first_utm_campaign, first_utm_term, first_utm_content,
        country, state, district, city, language, timezone, device_type, browser,
        operating_system, ip_hash, is_bot, marketing_consent, analytics_consent,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(
      visitorKey,
      user?.id ?? null,
      visitorType,
      path,
      path,
      referrer,
      referrer,
      normalizeNullableText(body.utmSource, 250),
      normalizeNullableText(body.utmMedium, 250),
      normalizeNullableText(body.utmCampaign, 250),
      normalizeNullableText(body.utmTerm, 250),
      normalizeNullableText(body.utmContent, 250),
      location.country,
      location.state,
      location.district,
      location.city,
      normalizeNullableText(body.language ?? req.get("accept-language"), 80),
      normalizeNullableText(body.timezone, 80),
      normalizeNullableText(body.deviceType, 40),
      normalizeNullableText(body.browser, 80),
      normalizeNullableText(body.operatingSystem, 80),
      ipHash,
      bot ? 1 : 0,
      ddBool(body.marketingConsent) ? 1 : 0,
      bot ? 0 : 1,
    );
    visitor = { id: Number(result.lastInsertRowid), visitor_key: visitorKey };
    ddSetCookie(res, DD_VISITOR_COOKIE, visitorKey, 60 * 60 * 24 * 365 * 2);
  } else {
    db.prepare(`
      UPDATE web_visitors
      SET user_id = COALESCE(?, user_id), visitor_type = ?, last_seen_at = CURRENT_TIMESTAMP,
          last_page_path = COALESCE(?, last_page_path), last_referrer_url = COALESCE(?, last_referrer_url),
          country = COALESCE(?, country), state = COALESCE(?, state), district = COALESCE(?, district), city = COALESCE(?, city),
          language = COALESCE(?, language), timezone = COALESCE(?, timezone), device_type = COALESCE(?, device_type),
          browser = COALESCE(?, browser), operating_system = COALESCE(?, operating_system), ip_hash = COALESCE(?, ip_hash),
          marketing_consent = CASE WHEN ? = 1 THEN 1 ELSE marketing_consent END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      user?.id ?? null,
      visitorType,
      path,
      referrer,
      location.country,
      location.state,
      location.district,
      location.city,
      normalizeNullableText(body.language ?? req.get("accept-language"), 80),
      normalizeNullableText(body.timezone, 80),
      normalizeNullableText(body.deviceType, 40),
      normalizeNullableText(body.browser, 80),
      normalizeNullableText(body.operatingSystem, 80),
      ipHash,
      ddBool(body.marketingConsent) ? 1 : 0,
      visitor.id,
    );
  }

  let sessionKey = sessionCookie || `s_${randomBytes(24).toString("hex")}`;
  let session = db.prepare(`
    SELECT id, session_key, last_activity_at
    FROM web_sessions
    WHERE session_key = ?
    LIMIT 1
  `).get(sessionKey) as { id: number; session_key: string; last_activity_at: string } | undefined;

  const age = session ? Date.now() - new Date(session.last_activity_at).getTime() : Number.POSITIVE_INFINITY;
  if (!session || !Number.isFinite(age) || age > DD_SESSION_MINUTES * 60 * 1000) {
    sessionKey = `s_${randomBytes(24).toString("hex")}`;
    const result = db.prepare(`
      INSERT INTO web_sessions (
        session_key, visitor_id, user_id, started_at, last_activity_at,
        entry_path, landing_page, referrer_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        country, state, district, city, device_type, browser, operating_system,
        screen_width, screen_height, page_views, event_count, duration_seconds, engaged, is_bounce, is_bot,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(
      sessionKey,
      visitor.id,
      user?.id ?? null,
      path,
      path,
      referrer,
      normalizeNullableText(body.utmSource, 250),
      normalizeNullableText(body.utmMedium, 250),
      normalizeNullableText(body.utmCampaign, 250),
      normalizeNullableText(body.utmTerm, 250),
      normalizeNullableText(body.utmContent, 250),
      location.country,
      location.state,
      location.district,
      location.city,
      normalizeNullableText(body.deviceType, 40),
      normalizeNullableText(body.browser, 80),
      normalizeNullableText(body.operatingSystem, 80),
      ddInt(body.screenWidth, null, 0, 10000),
      ddInt(body.screenHeight, null, 0, 10000),
      bot ? 1 : 0,
    );
    session = { id: Number(result.lastInsertRowid), session_key: sessionKey, last_activity_at: new Date().toISOString() };
    db.prepare(`UPDATE web_visitors SET total_sessions = total_sessions + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(visitor.id);
    ddSetCookie(res, DD_SESSION_COOKIE, sessionKey, DD_SESSION_MINUTES * 60);
  } else {
    db.prepare(`
      UPDATE web_sessions
      SET user_id = COALESCE(?, user_id), last_activity_at = CURRENT_TIMESTAMP,
          country = COALESCE(?, country), state = COALESCE(?, state), district = COALESCE(?, district), city = COALESCE(?, city),
          device_type = COALESCE(?, device_type), browser = COALESCE(?, browser), operating_system = COALESCE(?, operating_system),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      user?.id ?? null,
      location.country,
      location.state,
      location.district,
      location.city,
      normalizeNullableText(body.deviceType, 40),
      normalizeNullableText(body.browser, 80),
      normalizeNullableText(body.operatingSystem, 80),
      session.id,
    );
  }

  return { visitorId: visitor.id, visitorKey, sessionId: session.id, sessionKey };
}

function ddDuplicate(
  email: string,
  phone: string | null,
  formKey: string,
  entityType: DDLeadType,
  entityId: number | null,
): { id: number; lead_id: number | null } | null {
  if (!email && !phone) return null;
  const cutoff = new Date(Date.now() - DD_DUPLICATE_HOURS * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT id, lead_id, email, phone
    FROM form_submissions
    WHERE submitted_at >= ?
      AND form_key = ?
      AND status NOT IN ('spam', 'archived')
      AND COALESCE(entity_type, '') = ?
      AND COALESCE(entity_id, 0) = COALESCE(?, 0)
      AND (LOWER(COALESCE(email, '')) = LOWER(?) OR COALESCE(phone, '') <> '')
    ORDER BY id DESC
    LIMIT 100
  `).all(cutoff, formKey, entityType, entityId ?? 0, email) as Array<{
    id: number;
    lead_id: number | null;
    email: string | null;
    phone: string | null;
  }>;
  const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
  const match = rows.find((candidate) => {
    const candidatePhone = candidate.phone ? candidate.phone.replace(/\D/g, '') : '';
    return (Boolean(email) && String(candidate.email ?? '').toLowerCase() === email.toLowerCase()) ||
      (Boolean(phoneDigits) && Boolean(candidatePhone) && candidatePhone === phoneDigits);
  });
  return match ? { id: match.id, lead_id: match.lead_id } : null;
}


function ddPageViewId(bodyValue: unknown, analytics: DDAnalyticsContext): number | null {
  const requested = ddId(bodyValue);
  if (!requested) return null;
  const row = db.prepare(`
    SELECT id
    FROM web_page_views
    WHERE id = ? AND visitor_id = ? AND session_id = ?
    LIMIT 1
  `).get(requested, analytics.visitorId, analytics.sessionId) as { id: number } | undefined;
  return row?.id ?? null;
}

function ddLeadScore(body: Record<string, unknown>, contact: ReturnType<typeof ddContact>, location: DDLocationContext, entityId: number | null): number {
  let score = 0;
  if (contact.phone) score += 25;
  if (contact.email) score += 15;
  if (contact.whatsapp) score += 10;
  if (entityId) score += 10;
  if (location.city) score += 5;
  if (location.state) score += 3;
  if (ddMessage(body)) score += 5;
  if (body.preferredDate || body.requestedDate || body.startDate || body.travelStartDate) score += 10;
  if (ddInt(body.budgetAmount ?? body.budget, null, 0, 100000000) !== null) score += 7;
  if (ddInt(body.travellersCount ?? body.travellers ?? body.adults, null, 0, 100000) !== null) score += 5;
  if (ddBool(body.whatsappConsent)) score += 5;
  return Math.min(score, 1000);
}

function ddInsertStructured(
  type: DDLeadType,
  submissionId: number,
  leadId: number,
  body: Record<string, unknown>,
  location: DDLocationContext,
  entityId: number | null,
): number | null {
  const details = ddJson(body, 50000);
  const commonMessage = ddMessage(body);
  const country = location.country || "India";

  if (type === "puja") {
    const mode = normalizeText(body.serviceMode ?? body.mode, 20).toLowerCase() || "home";
    if (!["home", "temple", "online", "travel", "other"].includes(mode)) {
      throw new Error("Invalid puja service mode.");
    }
    const result = db.prepare(`
      INSERT INTO puja_service_requests (
        form_submission_id, lead_id, puja_service_id, requested_pandit_id, temple_id,
        service_mode, requested_date, preferred_time, alternate_date,
        service_city, service_district, service_state, service_country,
        service_address, service_pincode, language, gotra, family_names,
        devotee_count, samagri_required, online_video_join, budget_amount,
        special_requirements, message, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      submissionId, leadId, entityId, ddId(body.requestedPanditId), ddId(body.templeId),
      mode,
      normalizeNullableText(body.requestedDate ?? body.preferredDate, 40),
      normalizeNullableText(body.preferredTime, 80),
      normalizeNullableText(body.alternateDate, 40),
      location.city, location.district, location.state, country,
      normalizeNullableText(body.serviceAddress ?? body.address, 1000),
      normalizeNullableText(body.servicePincode ?? body.pincode, 20),
      normalizeNullableText(body.language, 100),
      normalizeNullableText(body.gotra, 250),
      normalizeNullableText(body.familyNames ?? body.family_names, 2000),
      ddInt(body.devoteeCount ?? body.guestCount ?? body.guests, null, 0, 100000),
      ddBool(body.samagriRequired, true) ? 1 : 0,
      ddBool(body.onlineVideoJoin, false) ? 1 : 0,
      ddInt(body.budgetAmount ?? body.budget, null, 0, 100000000),
      normalizeNullableText(body.specialRequirements, 5000),
      commonMessage,
      details,
    );
    return Number(result.lastInsertRowid);
  }

  if (type === "pandit") {
    const mode = normalizeText(body.bookingMode ?? body.serviceMode ?? body.mode, 20).toLowerCase() || "home";
    if (!["home", "temple", "online", "travel", "other"].includes(mode)) {
      throw new Error("Invalid Pandit booking mode.");
    }
    const result = db.prepare(`
      INSERT INTO pandit_booking_requests (
        form_submission_id, lead_id, pandit_id, pandit_service_id, puja_service_id,
        requested_date, preferred_time, duration_text, booking_mode,
        city, district, state, country, address, pincode,
        language, gotra, family_names, guest_count, budget_amount,
        special_requirements, message, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      submissionId, leadId, entityId, ddId(body.panditServiceId ?? body.serviceOfferingId), ddId(body.pujaServiceId),
      normalizeNullableText(body.requestedDate ?? body.preferredDate, 40),
      normalizeNullableText(body.preferredTime, 80),
      normalizeNullableText(body.durationText ?? body.duration, 120),
      mode,
      location.city, location.district, location.state, country,
      normalizeNullableText(body.address, 1000), normalizeNullableText(body.pincode, 20),
      normalizeNullableText(body.language, 100), normalizeNullableText(body.gotra, 250),
      normalizeNullableText(body.familyNames ?? body.family_names, 2000),
      ddInt(body.guestCount ?? body.devoteeCount ?? body.guests, null, 0, 100000),
      ddInt(body.budgetAmount ?? body.budget, null, 0, 100000000),
      normalizeNullableText(body.specialRequirements, 5000), commonMessage, details,
    );
    return Number(result.lastInsertRowid);
  }

  if (type === "yatra" || type === "travel") {
    const result = db.prepare(`
      INSERT INTO yatra_booking_requests (
        form_submission_id, lead_id, package_id,
        departure_city, departure_state, departure_country,
        travel_start_date, travel_end_date, adults, children, seniors,
        rooms_required, preferred_transport, meal_preference, stay_preference,
        budget_amount, medical_or_accessibility_requirements, special_requirements,
        message, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      submissionId, leadId, entityId,
      normalizeNullableText(body.departureCity ?? body.fromCity ?? body.city, 120),
      normalizeNullableText(body.departureState ?? body.fromState ?? body.state, 120),
      normalizeNullableText(body.departureCountry ?? body.fromCountry ?? body.country, 100) || "India",
      normalizeNullableText(body.travelStartDate ?? body.startDate ?? body.preferredDate, 40),
      normalizeNullableText(body.travelEndDate ?? body.endDate, 40),
      ddInt(body.adults ?? body.travellersCount ?? body.travellers, 1, 0, 100000) ?? 1,
      ddInt(body.children, 0, 0, 100000) ?? 0,
      ddInt(body.seniors, 0, 0, 100000) ?? 0,
      ddInt(body.roomsRequired ?? body.rooms, null, 0, 100000),
      normalizeNullableText(body.preferredTransport ?? body.transport, 120),
      normalizeNullableText(body.mealPreference, 120),
      normalizeNullableText(body.stayPreference, 120),
      ddInt(body.budgetAmount ?? body.budget, null, 0, 100000000),
      normalizeNullableText(body.medicalOrAccessibilityRequirements ?? body.accessibility, 5000),
      normalizeNullableText(body.specialRequirements, 5000), commonMessage, details,
    );
    return Number(result.lastInsertRowid);
  }

  if (type === "temple") {
    const result = db.prepare(`
      INSERT INTO temple_enquiry_requests (
        form_submission_id, lead_id, temple_id, enquiry_type,
        preferred_visit_date, preferred_time, devotees_count,
        city, district, state, country,
        live_aarti_request, puja_request, special_assistance,
        message, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      submissionId, leadId, entityId,
      normalizeNullableText(body.enquiryType, 100),
      normalizeNullableText(body.preferredVisitDate ?? body.visitDate ?? body.preferredDate, 40),
      normalizeNullableText(body.preferredTime, 80),
      ddInt(body.devoteesCount ?? body.devoteeCount ?? body.guests, null, 0, 100000),
      location.city, location.district, location.state, country,
      ddBool(body.liveAartiRequest) ? 1 : 0, ddBool(body.pujaRequest) ? 1 : 0,
      normalizeNullableText(body.specialAssistance, 5000), commonMessage, details,
    );
    return Number(result.lastInsertRowid);
  }

  if (type === "ashram") {
    const result = db.prepare(`
      INSERT INTO ashram_enquiry_requests (
        form_submission_id, lead_id, ashram_id,
        visit_start_date, visit_end_date, adults, children,
        stay_required, course_or_program, room_preference, food_preference,
        city, district, state, country,
        special_requirements, message, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      submissionId, leadId, entityId,
      normalizeNullableText(body.visitStartDate ?? body.startDate, 40),
      normalizeNullableText(body.visitEndDate ?? body.endDate, 40),
      ddInt(body.adults, 1, 0, 100000) ?? 1, ddInt(body.children, 0, 0, 100000) ?? 0,
      ddBool(body.stayRequired ?? body.stay) ? 1 : 0,
      normalizeNullableText(body.courseOrProgram ?? body.program, 300),
      normalizeNullableText(body.roomPreference ?? body.room, 200),
      normalizeNullableText(body.foodPreference ?? body.food, 200),
      location.city, location.district, location.state, country,
      normalizeNullableText(body.specialRequirements, 5000), commonMessage, details,
    );
    return Number(result.lastInsertRowid);
  }

  if (type === "event") {
    const result = db.prepare(`
      INSERT INTO event_enquiry_requests (
        form_submission_id, lead_id, event_id, attending_date,
        attendee_count, pass_type, city, district, state, country,
        message, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      submissionId, leadId, entityId,
      normalizeNullableText(body.attendingDate ?? body.eventDate ?? body.preferredDate, 40),
      ddInt(body.attendeeCount ?? body.attendees ?? body.guests, null, 0, 100000),
      normalizeNullableText(body.passType, 150),
      location.city, location.district, location.state, country,
      commonMessage, details,
    );
    return Number(result.lastInsertRowid);
  }

  if (type === "course") {
    const mode = normalizeText(body.mode ?? body.deliveryMode, 20).toLowerCase();
    const normalizedMode = ["online", "offline", "hybrid"].includes(mode) ? mode : null;
    const result = db.prepare(`
      INSERT INTO course_enquiry_requests (
        form_submission_id, lead_id, course_id,
        preferred_start_date, batch_preference, learner_count, mode,
        city, district, state, country,
        message, details_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      submissionId, leadId, entityId,
      normalizeNullableText(body.preferredStartDate ?? body.startDate, 40),
      normalizeNullableText(body.batchPreference ?? body.batch, 150),
      ddInt(body.learnerCount ?? body.students ?? body.quantity, null, 0, 100000),
      normalizedMode,
      location.city, location.district, location.state, country,
      commonMessage, details,
    );
    return Number(result.lastInsertRowid);
  }

  const result = db.prepare(`
    INSERT INTO contact_requests (
      form_submission_id, lead_id, subject, message, preferred_contact,
      details_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    submissionId, leadId,
    normalizeNullableText(body.subject, 250),
    commonMessage || "General enquiry",
    normalizeNullableText(body.preferredContact ?? body.contactPreference, 30),
    details,
  );
  return Number(result.lastInsertRowid);
}

function ddLeadAssignment(leadId: number, panditId: number, assignedBy: number | null): Record<string, unknown> | null {
  const pandit = db.prepare(`
    SELECT p.id, p.user_id
    FROM pandit_profiles p
    INNER JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
      AND p.listing_active = 1
      AND p.profile_status = 'approved'
      AND p.verification_status = 'verified'
      AND u.status = 'active'
    LIMIT 1
  `).get(panditId) as { id: number; user_id: number } | undefined;
  if (!pandit) return null;

  const existing = db.prepare(`
    SELECT * FROM lead_assignments
    WHERE lead_id = ? AND pandit_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(leadId, panditId) as Record<string, unknown> | undefined;
  if (existing) return existing;

  const quota = db.prepare(`
    SELECT id
    FROM pandit_subscriptions
    WHERE pandit_id = ?
      AND status = 'active'
      AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
      AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
      AND leads_used < lead_limit
    ORDER BY expires_at IS NULL ASC, expires_at ASC, id DESC
    LIMIT 1
  `).get(panditId) as { id: number } | undefined;
  if (!quota) return null;

  const result = db.transaction(() => {
    const quotaUpdate = db.prepare(`
      UPDATE pandit_subscriptions
      SET leads_used = leads_used + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'active'
        AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
        AND leads_used < lead_limit
    `).run(quota.id);
    if (quotaUpdate.changes !== 1) return null;

    const inserted = db.prepare(`
      INSERT INTO lead_assignments (
        lead_id, pandit_id, assigned_to_user_id, assigned_by,
        subscription_id, pandit_subscription_id,
        assignment_type, status, lead_credit_used, credit_consumed_at,
        assigned_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pandit', 'assigned', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(leadId, panditId, pandit.user_id, assignedBy, quota.id, quota.id);

    db.prepare(`
      UPDATE leads SET status = 'assigned', owner_user_id = COALESCE(owner_user_id, ?),
        last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(pandit.user_id, leadId);

    return db.prepare(`SELECT * FROM lead_assignments WHERE id = ?`).get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
  })();

  if (result) ddNotifyUser(pandit.user_id, "lead_assigned", "New lead assigned", "A new DivyaDhara lead has been assigned to your Pandit profile.", `/dashboard/leads/${leadId}`, { leadId, assignmentType: "pandit", panditId });
  return result;
}

type DDModuleAssignment = {
  assignment: Record<string, unknown> | null;
  reason: "assigned" | "no_subscription" | "no_manager" | "no_quota" | "invalid";
};

function ddTempleAssignment(leadId: number, templeId: number, assignedBy: number | null): DDModuleAssignment {
  const subscription = db.prepare(`
    SELECT id, manager_user_id, lead_limit, leads_used
    FROM temple_subscriptions
    WHERE temple_id = ? AND status = 'active'
      AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
      AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
    ORDER BY CASE WHEN leads_used < lead_limit THEN 0 ELSE 1 END, expires_at IS NULL ASC, expires_at ASC, id DESC
    LIMIT 1
  `).get(templeId) as { id: number; manager_user_id: number | null; lead_limit: number; leads_used: number } | undefined;
  if (!subscription) return { assignment: null, reason: "no_subscription" };
  if (subscription.leads_used >= subscription.lead_limit) return { assignment: null, reason: "no_quota" };

  const manager = db.prepare(`
    SELECT tma.manager_user_id
    FROM temple_manager_assignments tma
    INNER JOIN users u ON u.id = tma.manager_user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE tma.temple_id = ? AND tma.status = 'active'
      AND r.code = 'temple_manager' AND u.status = 'active'
    ORDER BY CASE WHEN ? IS NOT NULL AND tma.manager_user_id = ? THEN 0 ELSE 1 END,
      tma.assigned_at ASC, tma.id ASC LIMIT 1
  `).get(templeId, subscription.manager_user_id, subscription.manager_user_id) as { manager_user_id: number } | undefined;
  if (!manager) return { assignment: null, reason: "no_manager" };

  const existing = db.prepare(`
    SELECT * FROM lead_assignments
    WHERE lead_id = ? AND assigned_to_user_id = ? AND assignment_type = 'temple_manager'
    ORDER BY id DESC LIMIT 1
  `).get(leadId, manager.manager_user_id) as Record<string, unknown> | undefined;
  if (existing) return { assignment: existing, reason: "assigned" };

  const result = db.transaction(() => {
    const quotaUpdate = db.prepare(`
      UPDATE temple_subscriptions SET leads_used = leads_used + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'active'
        AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
        AND leads_used < lead_limit
    `).run(subscription.id);
    if (quotaUpdate.changes !== 1) return null;
    const inserted = db.prepare(`
      INSERT INTO lead_assignments (
        lead_id, assigned_to_user_id, assigned_by, temple_subscription_id,
        assignment_type, status, lead_credit_used, credit_consumed_at,
        assigned_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'temple_manager', 'assigned', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(leadId, manager.manager_user_id, assignedBy, subscription.id);
    db.prepare(`UPDATE leads SET status='assigned', owner_user_id=COALESCE(owner_user_id, ?), last_activity_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(manager.manager_user_id, leadId);
    return db.prepare(`SELECT * FROM lead_assignments WHERE id=?`).get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
  })();
  if (!result) return { assignment: null, reason: "no_quota" };
  ddNotifyUser(manager.manager_user_id, "lead_assigned", "New temple lead assigned", "A new DivyaDhara temple enquiry has been assigned to your Temple Manager account.", `/dashboard/leads/${leadId}`, { leadId, assignmentType: "temple_manager", templeId, subscriptionId: subscription.id });
  return { assignment: result, reason: "assigned" };
}

function ddAshramAssignment(leadId: number, ashramId: number, assignedBy: number | null): DDModuleAssignment {
  const subscription = db.prepare(`
    SELECT id, manager_user_id, lead_limit, leads_used
    FROM ashram_subscriptions
    WHERE ashram_id = ? AND status = 'active'
      AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
      AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
    ORDER BY CASE WHEN leads_used < lead_limit THEN 0 ELSE 1 END, expires_at IS NULL ASC, expires_at ASC, id DESC
    LIMIT 1
  `).get(ashramId) as { id: number; manager_user_id: number | null; lead_limit: number; leads_used: number } | undefined;
  if (!subscription) return { assignment: null, reason: "no_subscription" };
  if (subscription.leads_used >= subscription.lead_limit) return { assignment: null, reason: "no_quota" };

  const manager = db.prepare(`
    SELECT ama.manager_user_id
    FROM ashram_manager_assignments ama
    INNER JOIN users u ON u.id = ama.manager_user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE ama.ashram_id = ? AND ama.status = 'active'
      AND r.code = 'ashram_manager' AND u.status = 'active'
    ORDER BY CASE WHEN ? IS NOT NULL AND ama.manager_user_id = ? THEN 0 ELSE 1 END,
      ama.assigned_at ASC, ama.id ASC LIMIT 1
  `).get(ashramId, subscription.manager_user_id, subscription.manager_user_id) as { manager_user_id: number } | undefined;
  if (!manager) return { assignment: null, reason: "no_manager" };

  const existing = db.prepare(`
    SELECT * FROM lead_assignments
    WHERE lead_id = ? AND assigned_to_user_id = ? AND assignment_type = 'ashram_manager'
    ORDER BY id DESC LIMIT 1
  `).get(leadId, manager.manager_user_id) as Record<string, unknown> | undefined;
  if (existing) return { assignment: existing, reason: "assigned" };

  const result = db.transaction(() => {
    const quotaUpdate = db.prepare(`
      UPDATE ashram_subscriptions SET leads_used = leads_used + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'active'
        AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
        AND leads_used < lead_limit
    `).run(subscription.id);
    if (quotaUpdate.changes !== 1) return null;
    const inserted = db.prepare(`
      INSERT INTO lead_assignments (
        lead_id, assigned_to_user_id, assigned_by, ashram_subscription_id,
        assignment_type, status, lead_credit_used, credit_consumed_at,
        assigned_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ashram_manager', 'assigned', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(leadId, manager.manager_user_id, assignedBy, subscription.id);
    db.prepare(`UPDATE leads SET status='assigned', owner_user_id=COALESCE(owner_user_id, ?), last_activity_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(manager.manager_user_id, leadId);
    return db.prepare(`SELECT * FROM lead_assignments WHERE id=?`).get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
  })();
  if (!result) return { assignment: null, reason: "no_quota" };
  ddNotifyUser(manager.manager_user_id, "lead_assigned", "New Ashram lead assigned", "A new DivyaDhara Ashram enquiry has been assigned to your Ashram Manager account.", `/dashboard/leads/${leadId}`, { leadId, assignmentType: "ashram_manager", ashramId, subscriptionId: subscription.id });
  return { assignment: result, reason: "assigned" };
}

function ddCanAccessLead(user: AuthenticatedUser, leadId: number): boolean {
  if (DD_GLOBAL_CRM_ROLES.has(user.role)) return true;
  if (user.role === "pandit") {
    return Boolean(db.prepare(`
      SELECT 1 FROM leads l
      WHERE l.id=? AND (
        l.requested_pandit_id=(SELECT id FROM pandit_profiles WHERE user_id=? LIMIT 1)
        OR EXISTS (SELECT 1 FROM lead_assignments la INNER JOIN pandit_profiles pp ON pp.id=la.pandit_id WHERE la.lead_id=l.id AND la.status NOT IN ('closed','expired','rejected') AND pp.user_id=?)
      ) LIMIT 1
    `).get(leadId, user.id, user.id));
  }
  if (user.role === "temple_manager") {
    return Boolean(db.prepare(`
      SELECT 1 FROM leads l
      WHERE l.id=? AND EXISTS (
        SELECT 1 FROM temple_manager_assignments tma
        WHERE tma.temple_id=l.temple_id AND tma.manager_user_id=? AND tma.status='active'
      ) LIMIT 1
    `).get(leadId, user.id));
  }
  if (user.role === "ashram_manager") {
    return Boolean(db.prepare(`
      SELECT 1 FROM leads l
      WHERE l.id=? AND EXISTS (
        SELECT 1 FROM ashram_manager_assignments ama
        WHERE ama.ashram_id=l.ashram_id AND ama.manager_user_id=? AND ama.status='active'
      ) LIMIT 1
    `).get(leadId, user.id));
  }
  return false;
}

function ddLeadScope(user: AuthenticatedUser): { sql: string; params: unknown[] } {
  if (DD_GLOBAL_CRM_ROLES.has(user.role)) return { sql: "", params: [] };
  if (user.role === "pandit") return {
    sql: `AND (l.requested_pandit_id=(SELECT id FROM pandit_profiles WHERE user_id=? LIMIT 1) OR EXISTS (SELECT 1 FROM lead_assignments la INNER JOIN pandit_profiles pp ON pp.id=la.pandit_id WHERE la.lead_id=l.id AND pp.user_id=? AND la.status NOT IN ('closed','expired','rejected')))`,
    params: [user.id, user.id],
  };
  if (user.role === "temple_manager") return {
    sql: `AND EXISTS (SELECT 1 FROM temple_manager_assignments tma WHERE tma.temple_id=l.temple_id AND tma.manager_user_id=? AND tma.status='active')`,
    params: [user.id],
  };
  if (user.role === "ashram_manager") return {
    sql: `AND EXISTS (SELECT 1 FROM ashram_manager_assignments ama WHERE ama.ashram_id=l.ashram_id AND ama.manager_user_id=? AND ama.status='active')`,
    params: [user.id],
  };
  return { sql: "AND 1=0", params: [] };
}


function ddLeadPayload(body: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...body };
  for (const secretKey of ["password", "passwordConfirmation", "token", "resetToken"]) {
    if (secretKey in clean) clean[secretKey] = "[redacted]";
  }
  return clean;
}

const ddSubmitLead = (req: Request, res: Response): void => {
  if (!ddRateAllowed(req)) {
    res.setHeader("Retry-After", String(DD_LEAD_WINDOW_MINUTES * 60));
    res.status(429).json({ success: false, error: "Too many submissions. Please try again later." });
    return;
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const leadType = ddLeadType(body.leadType ?? body.type ?? body.formType ?? body.module);
    const formKey = normalizeText(
      (req.params as Record<string, string | undefined>).formKey ?? body.formKey ?? body.form ?? `${leadType}_enquiry`,
      120,
    ).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(formKey)) {
      res.status(400).json({ success: false, error: "Invalid form key." });
      return;
    }
    const form = ddForm(formKey);
    if (!form.id) {
      res.status(400).json({ success: false, error: "The requested form is not configured or active." });
      return;
    }
    const contact = ddContact(body);
    const location = ddLocation(body);
    const locationError = ddValidateLocationContext(location);
    if (locationError) {
      res.status(400).json({ success: false, error: locationError });
      return;
    }
    const entityId = ddEntityId(body, leadType);
    const pagePath = normalizeNullableText(body.pagePath ?? body.sourcePage ?? req.get("referer"), 1000);
    const landingPage = normalizeNullableText(body.landingPage, 1000);
    const referrerUrl = normalizeNullableText(body.referrerUrl ?? req.get("referer"), 2000);
    const sourceType = ddSource(body.sourceType ?? body.source, pagePath);
    const sourceForm = normalizeNullableText(body.sourceForm ?? formKey, 120);
    const serviceType = normalizeNullableText(
      body.serviceType ?? body.service ?? body.category ?? (leadType === "general" || leadType === "contact" ? null : leadType),
      150,
    );
    const pujaType = normalizeNullableText(body.pujaType ?? body.pujaName, 250);
    const preferredDate = normalizeNullableText(body.preferredDate ?? body.requestedDate ?? body.travelStartDate ?? body.startDate, 40);
    const preferredTime = normalizeNullableText(body.preferredTime, 80);
    const travellersCount = ddInt(body.travellersCount ?? body.travellers ?? body.adults ?? body.guestCount ?? body.devoteeCount, null, 0, 100000);
    const contactPreferenceValue = normalizeText(body.contactPreference ?? body.preferredContact, 20).toLowerCase();
    const contactPreference = ["call", "whatsapp", "email", "any"].includes(contactPreferenceValue) ? contactPreferenceValue : null;
    const whatsappConsent = ddBool(body.whatsappConsent);
    const marketingConsent = ddBool(body.marketingConsent);
    const user = res.locals.user as AuthenticatedUser | undefined;
    const analytics = ddAnalyticsContext(req, res, body);
    const pageViewId = ddPageViewId(body.pageViewId, analytics);

    if (!contact.name || contact.name.length < 2) {
      res.status(400).json({ success: false, error: "Name must contain at least 2 characters." });
      return;
    }
    if (!contact.email && !contact.phone && !contact.whatsapp) {
      res.status(400).json({ success: false, error: "Please provide phone, email or WhatsApp." });
      return;
    }
    if (contact.email && !isValidEmail(contact.email)) {
      res.status(400).json({ success: false, error: "Please enter a valid email address." });
      return;
    }
    if (!isValidPhone(contact.phone) || !isValidPhone(contact.whatsapp)) {
      res.status(400).json({ success: false, error: "Please enter a valid phone or WhatsApp number." });
      return;
    }
    const entityRequiredTypes: DDLeadType[] = ["puja", "pandit", "temple", "ashram", "yatra", "travel", "event", "course", "spiritual_place"];
    if (entityRequiredTypes.includes(leadType) && !entityId) {
      res.status(400).json({ success: false, error: "A valid business item is required for this enquiry." });
      return;
    }

    if (entityId && !ddEntityExists(leadType, entityId)) {
      res.status(400).json({ success: false, error: "The selected business item is not available for public enquiries." });
      return;
    }

    const crossReferences: Array<[string, DDLeadType, number | null]> = [
      ["requestedPanditId", "pandit", ddId(body.requestedPanditId)],
      ["templeId", "temple", ddId(body.templeId)],
      ["ashramId", "ashram", ddId(body.ashramId)],
      ["pujaServiceId", "puja", ddId(body.pujaServiceId ?? body.serviceId)],
      ["yatraPackageId", "yatra", ddId(body.yatraPackageId ?? body.packageId)],
      ["eventId", "event", ddId(body.eventId)],
      ["courseId", "course", ddId(body.courseId)],
      ["spiritualPlaceId", "spiritual_place", ddId(body.spiritualPlaceId)],
    ];
    for (const [field, referenceType, referenceId] of crossReferences) {
      if (referenceId && !ddEntityExists(referenceType, referenceId)) {
        res.status(400).json({ success: false, error: `${field} refers to an unavailable business item.` });
        return;
      }
    }

    const spamScore = ddSpamScore(body, req, form.spam);
    const captureRequired = form.requiresPhoneVerification || (form.captureMode === "detail_gate" && ddSettingBoolean("lead_capture_require_phone_verification", true));
    let verifiedCapture: DDVerifiedCapture | null = null;
    try {
      if (captureRequired) {
        const bodyCaptureKey = normalizeNullableText(body.captureKey ?? body.leadCaptureKey, 255);
        const authenticatedPhoneVerified = Boolean(user?.phoneVerifiedAt);
        if (bodyCaptureKey) {
          verifiedCapture = ddGetVerifiedCapture(body, leadType, entityId, contact.phone || contact.whatsapp, user, analytics);
        } else if (!authenticatedPhoneVerified) {
          res.status(403).json({ success: false, error: "Verified mobile number is required before submitting this enquiry.", code: "PHONE_VERIFICATION_REQUIRED" });
          return;
        }
      }
    } catch (verificationError) {
      const code = String(verificationError);
      if (code.includes("LEAD_CAPTURE_NOT_FOUND")) { res.status(404).json({ success: false, error: "Lead verification session was not found." }); return; }
      if (code.includes("LEAD_CAPTURE_EXPIRED")) { res.status(410).json({ success: false, error: "Lead verification session has expired." }); return; }
      if (code.includes("PHONE_MISMATCH")) { res.status(409).json({ success: false, error: "Verified mobile number does not match the submitted phone number." }); return; }
      if (code.includes("CONTEXT_MISMATCH")) { res.status(409).json({ success: false, error: "Verification session does not belong to this enquiry." }); return; }
      if (code.includes("ACCOUNT_MISMATCH")) { res.status(403).json({ success: false, error: "This verification session belongs to another account." }); return; }
      if (code.includes("VISITOR_MISMATCH") || code.includes("SESSION_MISMATCH")) { res.status(403).json({ success: false, error: "This verification session does not belong to the current browser session." }); return; }
      if (code.includes("NOT_VERIFIED") || code.includes("IDENTITY_INVALID") || code.includes("IDENTITY_MISSING")) { res.status(403).json({ success: false, error: "A valid verified Firebase phone identity is required." }); return; }
      if (code.includes("UNAVAILABLE")) { res.status(409).json({ success: false, error: "This verification session has already been used or closed." }); return; }
      throw verificationError;
    }
    const duplicate = ddDuplicate(contact.email, contact.phone, formKey, leadType, entityId);

    let leadId: number | null = null;
    let submissionId = 0;
    const resultState: { status: "created" | "duplicate" | "spam" | "processed" } = { status: "created" };
    let assignment: Record<string, unknown> | null = null;

    const transaction = db.transaction(() => {
      const normalized = {
        leadType,
        formKey,
        formVersion: form.version,
        contact: {
          name: contact.name,
          email: contact.email || null,
          phone: contact.phone || null,
          whatsapp: contact.whatsapp || null,
        },
        entityType: leadType,
        entityId,
        location: ddLocationJson(location),
        serviceType,
        pujaType,
        preferredDate,
        preferredTime,
        travellersCount,
        contactPreference,
        whatsappConsent,
        marketingConsent,
        attribution: {
          sourceType,
          sourcePage: pagePath,
          sourceForm,
          landingPage,
          referrerUrl,
          utmSource: normalizeNullableText(body.utmSource, 250),
          utmMedium: normalizeNullableText(body.utmMedium, 250),
          utmCampaign: normalizeNullableText(body.utmCampaign, 250),
          utmTerm: normalizeNullableText(body.utmTerm, 250),
          utmContent: normalizeNullableText(body.utmContent, 250),
        },
      };

      const submissionResult = db.prepare(`
        INSERT INTO form_submissions (
          submission_number, form_id, form_key, form_version,
          lead_id, capture_session_id, visitor_id, session_id, page_view_id,
          entity_type, entity_id, name, email, phone, whatsapp,
          country, state, district, city, pincode,
          page_path, landing_page, referrer_url,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          payload_json, normalized_json, ip_hash, user_agent,
          status, spam_score, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `).run(
        ddNumber("DD-SUB"), form.id, formKey, form.version, verifiedCapture?.id ?? null,
        analytics.visitorId, analytics.sessionId, pageViewId,
        leadType, entityId, contact.name, contact.email || null, contact.phone || null, contact.whatsapp || null,
        location.country, location.state, location.district, location.city,
        normalizeNullableText(body.pincode, 20), pagePath, landingPage, referrerUrl,
        normalizeNullableText(body.utmSource, 250), normalizeNullableText(body.utmMedium, 250), normalizeNullableText(body.utmCampaign, 250),
        normalizeNullableText(body.utmTerm, 250), normalizeNullableText(body.utmContent, 250),
        ddJson(ddLeadPayload(body), 120000), ddJson(normalized, 120000), ddIpHash(req), getUserAgent(req),
        spamScore >= 80 ? "spam" : duplicate ? "duplicate" : "received", spamScore,
      );

      submissionId = Number(submissionResult.lastInsertRowid);

      if (spamScore >= 80) {
        resultState.status = "spam";
        db.prepare(`UPDATE form_submissions SET processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(submissionId);
        return;
      }

      if (duplicate?.lead_id) {
        leadId = duplicate.lead_id;
        resultState.status = "duplicate";
        db.prepare(`UPDATE form_submissions SET lead_id = ?, duplicate_of_id = ?, status = 'duplicate', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId, duplicate.id, submissionId);
        db.prepare(`UPDATE leads SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
        return;
      }

      if (!form.createsLead) {
        resultState.status = "processed";
        db.prepare(`UPDATE form_submissions SET status = 'processed', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(submissionId);
        return;
      }

      const score = ddLeadScore(body, contact, location, entityId);
      const temperature = score >= 70 ? "hot" : score >= 45 ? "warm" : "cold";
      const leadNumber = ddNumber("DD-LEAD");
      const requestedPanditId = leadType === "pandit" ? entityId : ddId(body.requestedPanditId);
      const templeId = leadType === "temple" ? entityId : ddId(body.templeId);
      const ashramId = leadType === "ashram" ? entityId : ddId(body.ashramId);
      const pujaServiceId = leadType === "puja" ? entityId : ddId(body.pujaServiceId ?? body.serviceId);
      const yatraPackageId = (leadType === "yatra" || leadType === "travel") ? entityId : ddId(body.yatraPackageId ?? body.packageId);
      const eventId = leadType === "event" ? entityId : ddId(body.eventId);
      const courseId = leadType === "course" ? entityId : ddId(body.courseId);
      const spiritualPlaceId = ddId(body.spiritualPlaceId);

      const leadResult = db.prepare(`
        INSERT INTO leads (
          lead_number, name, phone, email, city, state,
          service_type, puja_type, temple_id, requested_pandit_id, ashram_id,
          puja_service_id, yatra_package_id, event_id, course_id, spiritual_place_id,
          country, district, preferred_date, preferred_time, travellers_count, message,
          source_type, source_page, source_form, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          landing_page, referrer_url, visitor_id, session_id, contact_preference,
          whatsapp_consent, marketing_consent, lead_score, lead_temperature, last_activity_at,
          form_key, source_submission_id, status, priority, owner_user_id,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `).run(
        leadNumber, contact.name, contact.phone || contact.whatsapp || null, contact.email || null,
        location.city, location.state, serviceType, pujaType, templeId, requestedPanditId, ashramId,
        pujaServiceId, yatraPackageId, eventId, courseId, spiritualPlaceId,
        location.country, location.district, preferredDate, preferredTime, travellersCount, ddMessage(body),
        sourceType, pagePath, sourceForm,
        normalizeNullableText(body.utmSource, 250), normalizeNullableText(body.utmMedium, 250), normalizeNullableText(body.utmCampaign, 250),
        normalizeNullableText(body.utmTerm, 250), normalizeNullableText(body.utmContent, 250),
        landingPage, referrerUrl, analytics.visitorId, analytics.sessionId, contactPreference,
        whatsappConsent ? 1 : 0, marketingConsent ? 1 : 0, score, temperature, new Date().toISOString(),
        formKey, submissionId, "new", score >= 85 ? "high" : "normal", user?.role === "sales" ? user.id : null,
      );

      leadId = Number(leadResult.lastInsertRowid);

      db.prepare(`UPDATE form_submissions SET lead_id = ?, status = 'processed', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId, submissionId);

      ddInsertStructured(leadType, submissionId, leadId, body, location, entityId);

      if (verifiedCapture) {
        db.prepare(`
          UPDATE lead_capture_sessions
          SET user_id=COALESCE(user_id, ?), lead_id=?, auth_identity_id=?, phone=?,
              verification_status='verified', status='submitted', updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(user?.id ?? null, leadId, verifiedCapture.authIdentityId, verifiedCapture.phone, verifiedCapture.id);
      }

      const insertConsent = db.prepare(`
        INSERT INTO lead_consents (
          lead_id, consent_type, granted, consent_text, policy_version, source_ip_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      insertConsent.run(leadId, "contact", 1, "Lead form contact consent", normalizeNullableText(body.policyVersion, 50), ddIpHash(req));
      insertConsent.run(leadId, "whatsapp", whatsappConsent ? 1 : 0, "WhatsApp contact consent", normalizeNullableText(body.policyVersion, 50), ddIpHash(req));
      insertConsent.run(leadId, "marketing", marketingConsent ? 1 : 0, "Marketing communications consent", normalizeNullableText(body.policyVersion, 50), ddIpHash(req));
      insertConsent.run(leadId, "terms", ddBool(body.termsAccepted ?? body.acceptTerms) ? 1 : 0, "Terms acceptance", normalizeNullableText(body.policyVersion, 50), ddIpHash(req));
      insertConsent.run(leadId, "privacy", ddBool(body.privacyAccepted ?? body.acceptPrivacy) ? 1 : 0, "Privacy policy acceptance", normalizeNullableText(body.policyVersion, 50), ddIpHash(req));

      db.prepare(`
        INSERT INTO lead_events (
          lead_id, user_id, event_type, old_status, new_status, notes, metadata_json
        ) VALUES (?, ?, 'created', NULL, 'new', ?, ?)
      `).run(
        leadId,
        user?.id ?? null,
        `Lead received from ${sourceType}`,
        ddJson({ leadType, formKey, sourceType, location: ddLocationJson(location) }, 5000),
      );

      if (requestedPanditId && ddEntityExists("pandit", requestedPanditId)) {
        assignment = ddLeadAssignment(leadId, requestedPanditId, user?.id ?? null);
        if (assignment) {
          db.prepare(`
            INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json)
            VALUES (?, ?, ?, 'assigned', 'new', 'assigned', ?, ?)
          `).run(
            leadId,
            assignment.id ?? null,
            user?.id ?? null,
            'Automatically assigned to requested Pandit against active subscription quota.',
            ddJson({ assignmentType: 'pandit', panditId: requestedPanditId }, 5000),
          );
        }
      } else if (leadType === 'temple' && templeId) {
        const templeAssignment = ddTempleAssignment(leadId, templeId, user?.id ?? null);
        assignment = templeAssignment.assignment;
        if (assignment) {
          db.prepare(`
            INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json)
            VALUES (?, ?, ?, 'assigned', 'new', 'assigned', ?, ?)
          `).run(
            leadId, assignment.id ?? null, user?.id ?? null,
            'Automatically assigned to an active Temple Manager against subscription quota.',
            ddJson({ assignmentType: 'temple_manager', templeId, reason: templeAssignment.reason }, 5000),
          );
        } else {
          db.prepare(`
            INSERT INTO lead_events (lead_id, user_id, event_type, old_status, new_status, notes, metadata_json)
            VALUES (?, ?, 'assignment_skipped', 'new', 'new', ?, ?)
          `).run(
            leadId, user?.id ?? null,
            'Temple lead remains unassigned until an active Temple subscription, manager and lead quota are available.',
            ddJson({ assignmentType: 'temple_manager', templeId, reason: templeAssignment.reason }, 5000),
          );
        }
      } else if (leadType === 'ashram' && ashramId) {
        const ashramAssignment = ddAshramAssignment(leadId, ashramId, user?.id ?? null);
        assignment = ashramAssignment.assignment;
        if (assignment) {
          db.prepare(`
            INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json)
            VALUES (?, ?, ?, 'assigned', 'new', 'assigned', ?, ?)
          `).run(
            leadId, assignment.id ?? null, user?.id ?? null,
            'Automatically assigned to the subscription manager against Ashram subscription quota.',
            ddJson({ assignmentType: 'ashram_manager', ashramId, reason: ashramAssignment.reason }, 5000),
          );
        }
      }

      const existingConversion = db.prepare(`
        SELECT id FROM web_conversions WHERE conversion_type='lead' AND lead_id=? LIMIT 1
      `).get(leadId);
      if (!existingConversion) {
        db.prepare(`
          INSERT INTO web_conversions (
            visitor_id, session_id, page_view_id, conversion_type, lead_id,
            value_amount, currency, path, entity_type, entity_id,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content, created_at
          ) VALUES (?, ?, ?, 'lead', ?, NULL, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
        analytics.visitorId, analytics.sessionId, pageViewId, leadId, pagePath, leadType, entityId,
        normalizeNullableText(body.utmSource, 250), normalizeNullableText(body.utmMedium, 250), normalizeNullableText(body.utmCampaign, 250),
        normalizeNullableText(body.utmTerm, 250), normalizeNullableText(body.utmContent, 250),
        );
      }

      db.prepare(`UPDATE web_sessions SET engaged = 1, is_bounce = 0, event_count = event_count + 1, last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(analytics.sessionId);
      db.prepare(`UPDATE web_visitors SET total_events = total_events + 1, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(analytics.visitorId);

      createAuditLog({
        userId: user?.id ?? null,
        action: "lead.created",
        entityType: "lead",
        entityId: leadId,
        newData: { leadType, formKey, sourceType, entityId, location, score, temperature },
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    });

    transaction();

    if (leadId && resultState.status === "created") {
      ddNotifyGlobalCrm(
        "new_lead",
        "New DivyaDhara lead",
        `${contact.name} submitted a ${leadType} enquiry.`,
        `/sales/leads/${leadId}`,
        { leadId, leadType, formKey, entityId },
      );
    }

    if (resultState.status === "spam") {
      res.status(202).json({ success: true, accepted: true, spam: true, message: "Your request has been received." });
      return;
    }

    if (resultState.status === "duplicate") {
      res.status(200).json({ success: true, duplicate: true, message: "Your earlier enquiry is already in our system.", lead: leadId ? publicLeadReceipt(leadId) : null });
      return;
    }

    res.status(resultState.status === "processed" ? 202 : 201).json({
      success: true,
      message: form.success || "Thank you. Your enquiry has been received.",
      lead: leadId ? publicLeadReceipt(leadId) : null,
      assignment: publicAssignmentReceipt(assignment as Record<string, unknown> | null),
      submissionId,
      attribution: {
        sourceType,
        sourcePage: pagePath,
        formKey,
        location: {
          country: location.country,
          state: location.state,
          district: location.district,
          city: location.city,
          area: location.area,
        },
      },
    });
  } catch (error) {
    console.error("Lead submission error:", error);
    res.status(500).json({ success: false, error: "Unable to submit your enquiry right now." });
  }
};

router.post("/", optionalAuth, ddSubmitLead);
router.post("/submit", optionalAuth, ddSubmitLead);
router.post("/forms/:formKey/submit", optionalAuth, ddSubmitLead);

/*
|--------------------------------------------------------------------------
| CRM helpers + routes
|--------------------------------------------------------------------------
*/

function ddRequireLeadUser(req: Request, res: Response, roles: UserRole[]): AuthenticatedUser | null {
  void req;
  const user = res.locals.user as AuthenticatedUser | undefined;
  if (!user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return null;
  }
  if (!roles.includes(user.role)) {
    res.status(403).json({ success: false, error: "You do not have permission to access this resource." });
    return null;
  }
  return user;
}

function ddGetLead(leadId: number): Record<string, unknown> | null {
  return (db.prepare(`
    SELECT l.*, ${DD_LEAD_TYPE_SQL} AS lead_type
    FROM leads l
    WHERE l.id = ?
    LIMIT 1
  `).get(leadId) as Record<string, unknown> | undefined) ?? null;
}

function ddStructuredForLead(lead: Record<string, unknown>): Record<string, unknown> | null {
  const type = ddLeadType(lead.lead_type);
  const table: Partial<Record<DDLeadType, string>> = {
    puja: "puja_service_requests",
    pandit: "pandit_booking_requests",
    temple: "temple_enquiry_requests",
    ashram: "ashram_enquiry_requests",
    yatra: "yatra_booking_requests",
    travel: "yatra_booking_requests",
    event: "event_enquiry_requests",
    course: "course_enquiry_requests",
    spiritual_place: "contact_requests",
    contact: "contact_requests",
    general: "contact_requests",
  };
  const name = table[type];
  if (!name) return null;
  return (db.prepare(`SELECT * FROM ${name} WHERE lead_id = ? ORDER BY id DESC LIMIT 1`).get(lead.id) as Record<string, unknown> | undefined) ?? null;
}

router.get("/meta", (req: Request, res: Response) => {
  void req;
  try {
    const forms = db.prepare(`
      SELECT id, form_key, name, module, entity_type, version, fields_json,
             validation_json, success_message, creates_lead, creates_booking,
             spam_protection_enabled
      FROM form_definitions
      WHERE is_active = 1
      ORDER BY module, name
    `).all();
    const locations = db.prepare(`
      SELECT id, parent_id, type, name, slug, code, state_code, status
      FROM locations
      WHERE status = 'active'
      ORDER BY type, name
      LIMIT 5000
    `).all();
    res.json({
      success: true,
      leadTypes: ["general", "contact", "puja", "pandit", "temple", "ashram", "yatra", "travel", "event", "course", "spiritual_place"],
      statuses: ["new", "qualified", "assigned", "contacted", "follow_up", "converted", "lost", "closed", "spam"],
      priorities: ["low", "normal", "high", "urgent"],
      temperatures: ["cold", "warm", "hot"],
      contactPreferences: ["call", "whatsapp", "email", "any"],
      forms,
      locations,
    });
  } catch (error) {
    console.error("Lead meta error:", error);
    res.status(500).json({ success: false, error: "Unable to load lead metadata." });
  }
});

router.get("/", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "pandit", "temple_manager", "ashram_manager"]);
    if (!user) return;

    const page = Math.max(1, ddInt(req.query.page, 1, 1, 100000) ?? 1);
    const limit = Math.min(100, Math.max(1, ddInt(req.query.limit, 25, 1, 100) ?? 25));
    const offset = (page - 1) * limit;
    const scope = ddLeadScope(user);
    const where = ["1 = 1", ...scope.sql ? [scope.sql.replace(/^\s*AND\s+/, "")] : []];
    const params: unknown[] = [...scope.params];

    const search = normalizeText(req.query.search, 180);
    const exact: Array<[string, unknown, number]> = [
      ["l.status", req.query.status, 30],
      [`${DD_LEAD_TYPE_SQL}`, req.query.leadType ?? req.query.type, 40],
      ["l.source_type", req.query.sourceType ?? req.query.source, 50],
      ["l.service_type", req.query.serviceType, 120],
      ["l.puja_type", req.query.pujaType, 200],
      ["l.country", req.query.country, 100],
      ["l.state", req.query.state, 120],
      ["l.district", req.query.district, 120],
      ["l.city", req.query.city, 120],
      ["l.form_key", req.query.formKey, 120],
      ["l.priority", req.query.priority, 20],
      ["l.lead_temperature", req.query.temperature ?? req.query.leadTemperature, 20],
    ];

    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(l.lead_number, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.name, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.email, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.phone, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.service_type, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.puja_type, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.message, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.source_page, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.form_key, '')) LIKE LOWER(?)
      )`);
      for (let i = 0; i < 9; i += 1) params.push(pattern);
    }

    for (const [column, raw, max] of exact) {
      const value = normalizeText(raw, max).toLowerCase();
      if (value) {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }

    const ownerId = ddId(req.query.ownerUserId);
    if (ownerId) {
      where.push("l.owner_user_id = ?");
      params.push(ownerId);
    }

    const dateFrom = normalizeText(req.query.from ?? req.query.dateFrom, 50);
    const dateTo = normalizeText(req.query.to ?? req.query.dateTo, 50);
    if (dateFrom) {
      where.push("l.created_at >= ?");
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push("l.created_at <= ?");
      params.push(dateTo);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM leads l ${whereSql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);
    const rows = db.prepare(`
      SELECT
        l.*,
        ${DD_LEAD_TYPE_SQL} AS lead_type,
        pp.display_name AS requested_pandit_name,
        t.name AS temple_name,
        a.name AS ashram_name,
        ps.name AS puja_service_name,
        yp.name AS yatra_package_name,
        e.title AS event_name,
        c.title AS course_name,
        owner.name AS owner_name
      FROM leads l
      LEFT JOIN pandit_profiles pp ON pp.id = l.requested_pandit_id
      LEFT JOIN temples t ON t.id = l.temple_id
      LEFT JOIN ashrams a ON a.id = l.ashram_id
      LEFT JOIN puja_services ps ON ps.id = l.puja_service_id
      LEFT JOIN yatra_packages yp ON yp.id = l.yatra_package_id
      LEFT JOIN events e ON e.id = l.event_id
      LEFT JOIN courses c ON c.id = l.course_id
      LEFT JOIN users owner ON owner.id = l.owner_user_id
      ${whereSql}
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<Record<string, unknown>>;

    res.json({
      success: true,
      leads: rows,
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      filters: {
        search,
        status: req.query.status ?? null,
        leadType: req.query.leadType ?? null,
        sourceType: req.query.sourceType ?? null,
        country: normalizeText(req.query.country, 100),
        state: normalizeText(req.query.state, 120),
        district: normalizeText(req.query.district, 120),
        city: normalizeText(req.query.city, 120),
      },
    });
  } catch (error) {
    console.error("Lead list error:", error);
    res.status(500).json({ success: false, error: "Unable to load leads." });
  }
});

router.get("/stats", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "pandit", "temple_manager", "ashram_manager"]);
    if (!user) return;
    const scope = ddLeadScope(user);
    const where = scope.sql ? `WHERE ${scope.sql.replace(/^\s*AND\s+/, "")}` : "";
    const params = [...scope.params];
    const totals = db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted_count,
        SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up_count,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
        SUM(CASE WHEN status IN ('lost','closed') THEN 1 ELSE 0 END) AS closed_count,
        SUM(CASE WHEN lead_temperature = 'hot' THEN 1 ELSE 0 END) AS hot_count,
        SUM(CASE WHEN priority IN ('high','urgent') THEN 1 ELSE 0 END) AS priority_count
      FROM leads l ${where}
    `).get(...params);
    const byType = db.prepare(`SELECT ${DD_LEAD_TYPE_SQL} AS lead_type, COUNT(*) AS count FROM leads l ${where} GROUP BY ${DD_LEAD_TYPE_SQL} ORDER BY count DESC`).all(...params);
    const bySource = db.prepare(`SELECT source_type, COUNT(*) AS count FROM leads l ${where} GROUP BY source_type ORDER BY count DESC`).all(...params);
    const byLocation = db.prepare(`SELECT country, state, district, city, COUNT(*) AS count FROM leads l ${where} GROUP BY country, state, district, city ORDER BY count DESC LIMIT 100`).all(...params);
    const byService = db.prepare(`SELECT service_type, puja_type, COUNT(*) AS count FROM leads l ${where} GROUP BY service_type, puja_type ORDER BY count DESC LIMIT 100`).all(...params);
    res.json({ success: true, totals, byType, bySource, byLocation, byService });
  } catch (error) {
    console.error("Lead stats error:", error);
    res.status(500).json({ success: false, error: "Unable to load lead statistics." });
  }
});


/*
|--------------------------------------------------------------------------
| CRM / form management fixed routes
|--------------------------------------------------------------------------
*/

router.get("/health", (_req: Request, res: Response) => {
  try {
    const row = db.prepare(`SELECT 1 AS ok`).get() as { ok?: number } | undefined;
    res.json({
      success: row?.ok === 1,
      service: "divyadhara-leads",
      database: row?.ok === 1,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lead health error:", error);
    res.status(500).json({
      success: false,
      service: "divyadhara-leads",
      database: false,
    });
  }
});

router.get("/owners", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales"]);
    if (!user) return;
    const rows = db.prepare(`
      SELECT u.id, u.name, u.email, r.code AS role, u.status
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.status = 'active'
        AND r.code IN ('sales', 'super_admin', 'temple_manager', 'ashram_manager', 'pandit')
      ORDER BY u.name COLLATE NOCASE, u.id
    `).all();
    res.json({ success: true, owners: rows });
  } catch (error) {
    console.error("Lead owners error:", error);
    res.status(500).json({ success: false, error: "Unable to load lead owners." });
  }
});

router.get("/lookup/pandits", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager"]);
    if (!user) return;
    const search = normalizeText(req.query.search, 150);
    const city = normalizeText(req.query.city, 120);
    const state = normalizeText(req.query.state, 120);
    const limit = Math.min(100, Math.max(1, ddInt(req.query.limit, 30, 1, 100) ?? 30));
    const where: string[] = [
      "p.profile_status = 'approved'",
      "p.verification_status = 'verified'",
      "p.listing_active = 1",
      "u.status = 'active'",
    ];
    const params: unknown[] = [];
    if (search) {
      where.push(`(
        LOWER(p.display_name) LIKE LOWER(?) OR
        LOWER(COALESCE(p.city, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(p.state, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(p.specializations_json, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(p.puja_types_json, '')) LIKE LOWER(?)
      )`);
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (city) { where.push("LOWER(COALESCE(p.city, '')) = LOWER(?)"); params.push(city); }
    if (state) { where.push("LOWER(COALESCE(p.state, '')) = LOWER(?)"); params.push(state); }
    const rows = db.prepare(`
      SELECT p.id, p.slug, p.display_name, p.title, p.photo, p.experience_years,
             p.city, p.district, p.state, p.country, p.languages_json,
             p.specializations_json, p.puja_types_json, p.availability,
             p.featured, p.listing_active
      FROM pandit_profiles p
      INNER JOIN users u ON u.id = p.user_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.featured DESC, p.display_name COLLATE NOCASE
      LIMIT ?
    `).all(...params, limit);
    res.json({ success: true, pandits: rows });
  } catch (error) {
    console.error("Pandit lookup error:", error);
    res.status(500).json({ success: false, error: "Unable to load Pandit options." });
  }
});

router.get("/submissions/list", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales"]);
    if (!user) return;
    const page = Math.max(1, ddInt(req.query.page, 1, 1, 100000) ?? 1);
    const limit = Math.min(100, Math.max(1, ddInt(req.query.limit, 25, 1, 100) ?? 25));
    const offset = (page - 1) * limit;
    const search = normalizeText(req.query.search, 180);
    const formKey = normalizeText(req.query.formKey, 120).toLowerCase();
    const status = normalizeText(req.query.status, 30).toLowerCase();
    const where = ["1 = 1"];
    const params: unknown[] = [];
    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(fs.submission_number, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(fs.name, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(fs.email, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(fs.phone, '')) LIKE LOWER(?) OR
        LOWER(COALESCE(fs.form_key, '')) LIKE LOWER(?)
      )`);
      params.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (formKey) { where.push("LOWER(fs.form_key) = LOWER(?)"); params.push(formKey); }
    if (status) { where.push("fs.status = ?"); params.push(status); }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM form_submissions fs ${whereSql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);
    const rows = db.prepare(`
      SELECT fs.*, l.lead_number, l.status AS lead_status, ${DD_LEAD_TYPE_SQL} AS lead_type,
             f.name AS form_name, f.module AS form_module
      FROM form_submissions fs
      LEFT JOIN leads l ON l.id = fs.lead_id
      LEFT JOIN form_definitions f ON f.id = fs.form_id
      ${whereSql}
      ORDER BY fs.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    res.json({ success: true, submissions: rows, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Form submission list error:", error);
    res.status(500).json({ success: false, error: "Unable to load form submissions." });
  }
});

router.get("/submissions/:submissionId", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales"]);
    if (!user) return;
    const submissionId = ddId(req.params.submissionId);
    if (!submissionId) { res.status(400).json({ success: false, error: "Invalid submission id." }); return; }
    const submission = db.prepare(`
      SELECT fs.*, f.name AS form_name, f.module AS form_module,
             l.lead_number, l.status AS lead_status, ${DD_LEAD_TYPE_SQL} AS lead_type
      FROM form_submissions fs
      LEFT JOIN form_definitions f ON f.id = fs.form_id
      LEFT JOIN leads l ON l.id = fs.lead_id
      WHERE fs.id = ?
      LIMIT 1
    `).get(submissionId) as Record<string, unknown> | undefined;
    if (!submission) { res.status(404).json({ success: false, error: "Form submission not found." }); return; }
    const payload = typeof submission.payload_json === "string" ? (() => { try { return JSON.parse(submission.payload_json || "{}"); } catch { return {}; } })() : {};
    const normalized = typeof submission.normalized_json === "string" ? (() => { try { return JSON.parse(submission.normalized_json || "{}"); } catch { return {}; } })() : {};
    res.json({ success: true, submission: { ...submission, payload, normalized } });
  } catch (error) {
    console.error("Form submission detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load form submission." });
  }
});

router.patch("/submissions/:submissionId", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales"]);
    if (!user) return;
    const submissionId = ddId(req.params.submissionId);
    if (!submissionId) { res.status(400).json({ success: false, error: "Invalid submission id." }); return; }
    const existing = db.prepare(`SELECT * FROM form_submissions WHERE id = ? LIMIT 1`).get(submissionId) as Record<string, unknown> | undefined;
    if (!existing) { res.status(404).json({ success: false, error: "Form submission not found." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const status = normalizeText(body.status, 30).toLowerCase();
    if (status && !["received", "processed", "spam", "duplicate", "archived"].includes(status)) {
      res.status(400).json({ success: false, error: "Invalid form submission status." }); return;
    }
    if (!status) { res.status(400).json({ success: false, error: "Status is required." }); return; }
    db.prepare(`
      UPDATE form_submissions
      SET status = ?,
          processed_at = CASE WHEN ? IN ('processed','spam','duplicate','archived') THEN COALESCE(processed_at, CURRENT_TIMESTAMP) ELSE processed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, status, submissionId);
    const updated = db.prepare(`SELECT * FROM form_submissions WHERE id = ?`).get(submissionId);
    createAuditLog({ userId: user.id, action: "form_submission.status_changed", entityType: "form_submission", entityId: submissionId, oldData: existing, newData: updated, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.json({ success: true, submission: updated });
  } catch (error) {
    console.error("Form submission update error:", error);
    res.status(500).json({ success: false, error: "Unable to update form submission." });
  }
});


router.get("/:id/documents", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager", "pandit"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    res.json({ success: true, documents: db.prepare(`
      SELECT d.*, u.name AS uploaded_by_name
      FROM lead_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by_user_id
      WHERE d.lead_id = ? ORDER BY d.id DESC
    `).all(leadId) });
  } catch (error) {
    console.error("Lead documents list error:", error);
    res.status(500).json({ success: false, error: "Unable to load lead documents." });
  }
});

router.post("/:id/documents", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const documentType = normalizeText(body.documentType ?? body.type, 100);
    const originalName = normalizeText(body.originalName ?? body.fileName, 250);
    const storagePath = normalizeText(body.storagePath ?? body.path, 1000);
    if (storagePath.startsWith("/") || storagePath.includes("..") || storagePath.includes("\\")) {
      res.status(400).json({ success: false, error: "storagePath must be a safe relative storage key." });
      return;
    }
    if (!documentType || !originalName || !storagePath) {
      res.status(400).json({ success: false, error: "documentType, originalName and storagePath are required." });
      return;
    }
    const result = db.prepare(`
      INSERT INTO lead_documents (
        lead_id, uploaded_by_user_id, document_type, original_name,
        storage_path, mime_type, size_bytes, is_private, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      leadId, user.id, documentType, originalName, storagePath,
      normalizeNullableText(body.mimeType, 150), ddInt(body.sizeBytes, null, 0, 2000000000),
      ddBool(body.isPrivate, true) ? 1 : 0,
    );
    const document = db.prepare(`SELECT * FROM lead_documents WHERE id = ?`).get(Number(result.lastInsertRowid));
    createAuditLog({ userId: user.id, action: "lead.document_created", entityType: "lead_document", entityId: Number(result.lastInsertRowid), newData: document, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    db.prepare(`UPDATE leads SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    res.status(201).json({ success: true, document });
  } catch (error) {
    console.error("Lead document create error:", error);
    res.status(500).json({ success: false, error: "Unable to save lead document." });
  }
});

router.patch("/:leadId/assignments/:assignmentId", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales"]);
    if (!user) return;
    const leadId = ddId(req.params.leadId);
    const assignmentId = ddId(req.params.assignmentId);
    if (!leadId || !assignmentId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this assignment." }); return; }
    const existing = db.prepare(`SELECT * FROM lead_assignments WHERE id = ? AND lead_id = ? LIMIT 1`).get(assignmentId, leadId) as Record<string, unknown> | undefined;
    if (!existing) { res.status(404).json({ success: false, error: "Assignment not found." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const status = normalizeText(body.status, 30).toLowerCase();
    const allowed = ["assigned", "accepted", "contacted", "follow_up", "converted", "rejected", "expired", "closed"];
    if (!allowed.includes(status)) { res.status(400).json({ success: false, error: "Invalid assignment status." }); return; }
    const notes = normalizeNullableText(body.notes, 5000);
    db.prepare(`
      UPDATE lead_assignments
      SET status = ?,
          contacted_at = CASE WHEN ? IN ('contacted','follow_up','converted') THEN COALESCE(contacted_at, CURRENT_TIMESTAMP) ELSE contacted_at END,
          converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at, CURRENT_TIMESTAMP) ELSE converted_at END,
          closed_at = CASE WHEN ? IN ('closed','rejected','expired') THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE closed_at END,
          notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND lead_id = ?
    `).run(status, status, status, status, notes, assignmentId, leadId);
    const updated = db.prepare(`SELECT * FROM lead_assignments WHERE id = ?`).get(assignmentId);
    db.prepare(`INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json) VALUES (?, ?, ?, 'assignment_status_changed', ?, ?, ?, ?)`)
      .run(leadId, assignmentId, user.id, String(existing.status ?? ""), status, notes, ddJson({ assignmentId }, 5000));
    const leadStatus = status === 'converted' ? 'converted' : status === 'closed' ? 'closed' : status === 'follow_up' ? 'follow_up' : status === 'contacted' ? 'contacted' : null;
    if (leadStatus) {
      db.prepare(`UPDATE leads SET status = ?, last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at, CURRENT_TIMESTAMP) ELSE converted_at END, closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE closed_at END WHERE id = ?`).run(leadStatus, leadStatus, leadStatus, leadId);
    }
    createAuditLog({ userId: user.id, action: "lead.assignment_status_changed", entityType: "lead_assignment", entityId: assignmentId, oldData: existing, newData: updated, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.json({ success: true, assignment: updated });
  } catch (error) {
    console.error("Lead assignment update error:", error);
    res.status(500).json({ success: false, error: "Unable to update lead assignment." });
  }
});

router.get("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "pandit", "temple_manager", "ashram_manager"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId) { res.status(400).json({ success: false, error: "Invalid lead id." }); return; }
    if (!ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const lead = ddGetLead(leadId);
    if (!lead) { res.status(404).json({ success: false, error: "Lead not found." }); return; }

    const submission = lead.source_submission_id
      ? db.prepare(`SELECT * FROM form_submissions WHERE id = ? LIMIT 1`).get(lead.source_submission_id)
      : null;
    const request = ddStructuredForLead(lead);
    const assignments = db.prepare(`
      SELECT la.*, pp.display_name AS pandit_name, u.name AS assigned_user_name, au.name AS assigned_by_name
      FROM lead_assignments la
      LEFT JOIN pandit_profiles pp ON pp.id = la.pandit_id
      LEFT JOIN users u ON u.id = la.assigned_to_user_id
      LEFT JOIN users au ON au.id = la.assigned_by
      WHERE la.lead_id = ? ORDER BY la.id DESC
    `).all(leadId);
    const notes = db.prepare(`SELECT ln.*, u.name AS user_name FROM lead_notes ln LEFT JOIN users u ON u.id = ln.user_id WHERE ln.lead_id = ? ORDER BY ln.is_pinned DESC, ln.id DESC`).all(leadId);
    const followups = db.prepare(`SELECT lf.*, u.name AS assigned_user_name FROM lead_followups lf LEFT JOIN users u ON u.id = lf.assigned_to_user_id WHERE lf.lead_id = ? ORDER BY CASE WHEN lf.status = 'pending' THEN 0 ELSE 1 END, lf.due_at ASC`).all(leadId);
    const communications = db.prepare(`SELECT lc.*, u.name AS user_name FROM lead_communications lc LEFT JOIN users u ON u.id = lc.user_id WHERE lc.lead_id = ? ORDER BY lc.id DESC LIMIT 200`).all(leadId);
    const tags = db.prepare(`SELECT lt.id, lt.name, lt.slug FROM lead_tag_map ltm INNER JOIN lead_tags lt ON lt.id = ltm.tag_id WHERE ltm.lead_id = ? ORDER BY lt.name`).all(leadId);
    const events = db.prepare(`SELECT le.*, u.name AS user_name FROM lead_events le LEFT JOIN users u ON u.id = le.user_id WHERE le.lead_id = ? ORDER BY le.id DESC LIMIT 200`).all(leadId);

    res.json({ success: true, lead, formSubmission: submission, structuredRequest: request, assignments, notes, followups, communications, tags, events });
  } catch (error) {
    console.error("Lead detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load lead details." });
  }
});

router.patch("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager", "pandit"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId) { res.status(400).json({ success: false, error: "Invalid lead id." }); return; }
    if (!ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const oldLead = ddGetLead(leadId);
    if (!oldLead) { res.status(404).json({ success: false, error: "Lead not found." }); return; }

    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    if (user.role === "pandit" && ["ownerUserId", "leadScore", "priority"].some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      res.status(403).json({ success: false, error: "Pandit accounts cannot change CRM ownership or scoring fields." });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const setText = (column: string, key: string, max: number) => {
      if (has(key)) { updates.push(`${column} = ?`); values.push(normalizeNullableText(body[key], max)); }
    };

    if (has("status")) {
      const status = normalizeText(body.status, 30).toLowerCase();
      if (status === "spam" && !["super_admin", "sales"].includes(user.role)) {
        res.status(403).json({ success: false, error: "Only Sales or Super Admin can mark a lead as spam." });
        return;
      }
      if (!["new", "qualified", "assigned", "contacted", "follow_up", "converted", "lost", "closed", "spam"].includes(status)) {
        res.status(400).json({ success: false, error: "Invalid lead status." }); return;
      }
      updates.push("status = ?"); values.push(status);
      if (status === "converted") updates.push("converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP)");
      if (status === "closed") updates.push("closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP)");
    }

    if (has("priority")) {
      const priority = normalizeText(body.priority, 20).toLowerCase();
      if (!["low", "normal", "high", "urgent"].includes(priority)) {
        res.status(400).json({ success: false, error: "Invalid lead priority." }); return;
      }
      updates.push("priority = ?"); values.push(priority);
    }

    if (has("leadTemperature")) {
      const temperature = normalizeText(body.leadTemperature, 20).toLowerCase();
      if (!["cold", "warm", "hot"].includes(temperature)) {
        res.status(400).json({ success: false, error: "Invalid lead temperature." }); return;
      }
      updates.push("lead_temperature = ?"); values.push(temperature);
    }

    if (has("leadScore")) {
      updates.push("lead_score = ?"); values.push(ddInt(body.leadScore, 0, 0, 1000) ?? 0);
    }

    if (has("ownerUserId")) {
      if (!DD_GLOBAL_CRM_ROLES.has(user.role)) {
        res.status(403).json({ success: false, error: "Only Sales or Super Admin can change CRM ownership." });
        return;
      }
      const ownerId = body.ownerUserId === null || body.ownerUserId === "" ? null : ddId(body.ownerUserId);
      if (ownerId) {
        const owner = db.prepare(`
          SELECT u.id, u.status, r.code AS role
          FROM users u INNER JOIN roles r ON r.id=u.role_id
          WHERE u.id=? AND u.status='active'
          LIMIT 1
        `).get(ownerId) as { id: number; status: UserStatus; role: UserRole } | undefined;
        if (!owner || !["sales", "super_admin", "pandit", "temple_manager", "ashram_manager"].includes(owner.role)) {
          res.status(400).json({ success: false, error: "Selected lead owner is not a valid active CRM user." });
          return;
        }
      }
      updates.push("owner_user_id = ?"); values.push(ownerId);
    }

    setText("message", "message", 10000);
    setText("preferred_date", "preferredDate", 40);
    setText("preferred_time", "preferredTime", 80);
    setText("city", "city", 120);
    setText("district", "district", 120);
    setText("state", "state", 120);
    setText("country", "country", 100);

    if (has("contactPreference")) {
      const preference = normalizeText(body.contactPreference, 20).toLowerCase();
      if (preference && !["call", "whatsapp", "email", "any"].includes(preference)) {
        res.status(400).json({ success: false, error: "Invalid contact preference." }); return;
      }
      updates.push("contact_preference = ?"); values.push(preference || null);
    }

    if (!updates.length) { res.status(400).json({ success: false, error: "No supported lead fields were supplied." }); return; }
    updates.push("last_activity_at = CURRENT_TIMESTAMP", "updated_at = CURRENT_TIMESTAMP");
    values.push(leadId);
    db.prepare(`UPDATE leads SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = ddGetLead(leadId);
    db.prepare(`INSERT INTO lead_events (lead_id, user_id, event_type, old_status, new_status, notes, metadata_json) VALUES (?, ?, 'updated', ?, ?, ?, ?)`).run(
      leadId, user.id, oldLead.status ?? null, updated?.status ?? null, "Lead fields updated", ddJson({ fields: Object.keys(body) }, 5000),
    );
    createAuditLog({ userId: user.id, action: "lead.updated", entityType: "lead", entityId: leadId, oldData: oldLead, newData: updated, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.json({ success: true, lead: updated });
  } catch (error) {
    console.error("Lead update error:", error);
    res.status(500).json({ success: false, error: "Unable to update lead." });
  }
});

router.patch("/:id/status", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager", "pandit"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    const status = normalizeText(req.body?.status, 30).toLowerCase();
    if (status === "spam" && !["super_admin", "sales"].includes(user.role)) {
      res.status(403).json({ success: false, error: "Only Sales or Super Admin can mark a lead as spam." });
      return;
    }
    if (!leadId) { res.status(400).json({ success: false, error: "Invalid lead id." }); return; }
    if (!["new", "qualified", "assigned", "contacted", "follow_up", "converted", "lost", "closed", "spam"].includes(status)) {
      res.status(400).json({ success: false, error: "Invalid lead status." }); return;
    }
    if (!ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const oldLead = ddGetLead(leadId);
    if (!oldLead) { res.status(404).json({ success: false, error: "Lead not found." }); return; }

    db.prepare(`
      UPDATE leads
      SET status = ?,
          converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at, CURRENT_TIMESTAMP) ELSE converted_at END,
          closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE closed_at END,
          last_activity_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, status, status, leadId);

    const updated = ddGetLead(leadId);
    db.prepare(`INSERT INTO lead_events (lead_id, user_id, event_type, old_status, new_status, notes, metadata_json) VALUES (?, ?, 'status_changed', ?, ?, NULL, '{}')`).run(leadId, user.id, oldLead.status ?? null, status);
    createAuditLog({ userId: user.id, action: "lead.status_changed", entityType: "lead", entityId: leadId, oldData: oldLead, newData: updated, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.json({ success: true, lead: updated });
  } catch (error) {
    console.error("Lead status error:", error);
    res.status(500).json({ success: false, error: "Unable to update lead status." });
  }
});

router.post("/:id/assign", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager"]);
    if (!user) return;

    const leadId = ddId(req.params.id);
    if (!leadId) return void res.status(400).json({ success: false, error: "Invalid lead id." });

    const lead = ddGetLead(leadId);
    if (!lead) return void res.status(404).json({ success: false, error: "Lead not found." });
    if (!ddCanAccessLead(user, leadId) && !DD_GLOBAL_CRM_ROLES.has(user.role)) {
      return void res.status(403).json({ success: false, error: "You do not have access to this lead." });
    }

    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const requestedType = normalizeText(body.assignmentType, 30).toLowerCase();
    const type = requestedType || (ddId(body.panditId ?? body.requestedPanditId) ? "pandit" : lead.temple_id ? "temple_manager" : lead.ashram_id ? "ashram_manager" : "sales");

    if (!["pandit", "sales", "temple_manager", "ashram_manager", "admin"].includes(type)) {
      return void res.status(400).json({ success: false, error: "Invalid assignment type." });
    }

    if (type === "pandit") {
      if (!DD_GLOBAL_CRM_ROLES.has(user.role)) {
        return void res.status(403).json({ success: false, error: "Only Sales or Super Admin can assign leads to a Pandit." });
      }
      const panditId = ddId(body.panditId ?? body.requestedPanditId);
      if (!panditId || !ddEntityExists("pandit", panditId)) {
        return void res.status(400).json({ success: false, error: "A valid active verified Pandit is required." });
      }
      const assignment = db.transaction(() => ddLeadAssignment(leadId, panditId, user.id))();
      if (!assignment) return void res.status(409).json({ success: false, error: "Pandit assignment requires an active subscription with available lead credits, or the lead is already assigned." });
      db.prepare(`INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json) VALUES (?, ?, ?, 'assigned', ?, 'assigned', ?, ?)`).run(leadId, assignment.id ?? null, user.id, lead.status ?? 'new', "Lead assigned to Pandit against active subscription quota.", ddJson({ assignmentType: type, panditId }, 5000));
      createAuditLog({ userId: user.id, action: "lead.assigned", entityType: "lead_assignment", entityId: Number(assignment.id), newData: assignment, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
      return void res.json({ success: true, lead: ddGetLead(leadId), assignment });
    }

    if (type === "temple_manager") {
      const templeId = ddId(lead.temple_id);
      if (!templeId) return void res.status(400).json({ success: false, error: "Temple Manager assignment requires a temple lead." });
      const targetUserId = ddId(body.assignedToUserId ?? body.userId) ?? (user.role === "temple_manager" ? user.id : null);
      if (!targetUserId) return void res.status(400).json({ success: false, error: "assignedToUserId is required." });
      if (user.role === "temple_manager" && targetUserId !== user.id) return void res.status(403).json({ success: false, error: "Temple Managers can assign this lead only to themselves." });
      if (!DD_GLOBAL_CRM_ROLES.has(user.role) && user.role !== "temple_manager") return void res.status(403).json({ success: false, error: "You cannot assign this lead as a Temple Manager." });

      const assigned = db.prepare(`SELECT id FROM temple_manager_assignments WHERE temple_id=? AND manager_user_id=? AND status='active' LIMIT 1`).get(templeId, targetUserId);
      if (!assigned) return void res.status(403).json({ success: false, error: "That Temple Manager is not actively assigned to this temple." });

      const result = db.transaction(() => {
        const existing = db.prepare(`SELECT * FROM lead_assignments WHERE lead_id=? AND assigned_to_user_id=? AND assignment_type='temple_manager' ORDER BY id DESC LIMIT 1`).get(leadId, targetUserId) as Record<string, unknown> | undefined;
        if (existing) return existing;
        const subscription = db.prepare(`SELECT id FROM temple_subscriptions WHERE temple_id=? AND status='active' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (expires_at IS NULL OR expires_at>=CURRENT_TIMESTAMP) AND leads_used<lead_limit ORDER BY expires_at IS NULL ASC, expires_at ASC, id DESC LIMIT 1`).get(templeId) as { id: number } | undefined;
        if (!subscription) throw new Error("TEMPLE_LEAD_QUOTA_EXHAUSTED");
        const updated = db.prepare(`UPDATE temple_subscriptions SET leads_used=leads_used+1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (expires_at IS NULL OR expires_at>=CURRENT_TIMESTAMP) AND leads_used<lead_limit`).run(subscription.id);
        if (updated.changes !== 1) throw new Error("TEMPLE_LEAD_QUOTA_EXHAUSTED");
        const inserted = db.prepare(`INSERT INTO lead_assignments (lead_id, assigned_to_user_id, assigned_by, temple_subscription_id, assignment_type, status, lead_credit_used, credit_consumed_at, assigned_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'temple_manager', 'assigned', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(leadId, targetUserId, user.id, subscription.id);
        db.prepare(`UPDATE leads SET owner_user_id=COALESCE(owner_user_id, ?), status='assigned', last_activity_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(targetUserId, leadId);
        return db.prepare(`SELECT * FROM lead_assignments WHERE id=?`).get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
      })();
      ddNotifyUser(targetUserId, "lead_assigned", "New temple lead assigned", "A new DivyaDhara temple enquiry has been assigned to you.", `/dashboard/leads/${leadId}`, { leadId, assignmentType: type, templeId });
      db.prepare(`INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json) VALUES (?, ?, ?, 'assigned', ?, 'assigned', ?, ?)`).run(leadId, result.id ?? null, user.id, lead.status ?? 'new', "Lead assigned to Temple Manager against temple subscription quota.", ddJson({ assignmentType: type, templeId, targetUserId }, 5000));
      createAuditLog({ userId: user.id, action: "lead.assigned", entityType: "lead_assignment", entityId: Number(result.id), newData: result, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
      return void res.json({ success: true, lead: ddGetLead(leadId), assignment: result });
    }

    if (type === "ashram_manager") {
      const ashramId = ddId(lead.ashram_id);
      if (!ashramId) return void res.status(400).json({ success: false, error: "Ashram Manager assignment requires an Ashram lead." });
      const targetUserId = ddId(body.assignedToUserId ?? body.userId) ?? (user.role === "ashram_manager" ? user.id : null);
      if (!targetUserId) return void res.status(400).json({ success: false, error: "assignedToUserId is required." });
      if (user.role === "ashram_manager" && targetUserId !== user.id) return void res.status(403).json({ success: false, error: "Ashram Managers can assign this lead only to themselves." });
      const assigned = db.prepare(`SELECT id FROM ashram_manager_assignments WHERE ashram_id=? AND manager_user_id=? AND status='active' LIMIT 1`).get(ashramId, targetUserId);
      if (!assigned) return void res.status(403).json({ success: false, error: "That Ashram Manager is not actively assigned to this Ashram." });

      const result = db.transaction(() => {
        const existing = db.prepare(`SELECT * FROM lead_assignments WHERE lead_id=? AND assigned_to_user_id=? AND assignment_type='ashram_manager' ORDER BY id DESC LIMIT 1`).get(leadId, targetUserId) as Record<string, unknown> | undefined;
        if (existing) return existing;
        const subscription = db.prepare(`SELECT id FROM ashram_subscriptions WHERE ashram_id=? AND status='active' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (expires_at IS NULL OR expires_at>=CURRENT_TIMESTAMP) AND leads_used<lead_limit ORDER BY expires_at IS NULL ASC, expires_at ASC, id DESC LIMIT 1`).get(ashramId) as { id: number } | undefined;
        if (!subscription) throw new Error("ASHRAM_LEAD_QUOTA_EXHAUSTED");
        const updated = db.prepare(`UPDATE ashram_subscriptions SET leads_used=leads_used+1, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (expires_at IS NULL OR expires_at>=CURRENT_TIMESTAMP) AND leads_used<lead_limit`).run(subscription.id);
        if (updated.changes !== 1) throw new Error("ASHRAM_LEAD_QUOTA_EXHAUSTED");
        const inserted = db.prepare(`INSERT INTO lead_assignments (lead_id, assigned_to_user_id, assigned_by, ashram_subscription_id, assignment_type, status, lead_credit_used, credit_consumed_at, assigned_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'ashram_manager', 'assigned', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(leadId, targetUserId, user.id, subscription.id);
        db.prepare(`UPDATE leads SET owner_user_id=COALESCE(owner_user_id, ?), status='assigned', last_activity_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(targetUserId, leadId);
        return db.prepare(`SELECT * FROM lead_assignments WHERE id=?`).get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
      })();
      ddNotifyUser(targetUserId, "lead_assigned", "New Ashram lead assigned", "A new DivyaDhara Ashram enquiry has been assigned to you.", `/dashboard/leads/${leadId}`, { leadId, assignmentType: type, ashramId });
      db.prepare(`INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json) VALUES (?, ?, ?, 'assigned', ?, 'assigned', ?, ?)`).run(leadId, result.id ?? null, user.id, lead.status ?? 'new', "Lead assigned to Ashram Manager against Ashram subscription quota.", ddJson({ assignmentType: type, ashramId, targetUserId }, 5000));
      createAuditLog({ userId: user.id, action: "lead.assigned", entityType: "lead_assignment", entityId: Number(result.id), newData: result, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
      return void res.json({ success: true, lead: ddGetLead(leadId), assignment: result });
    }

    // Sales and Admin assignments never consume provider lead quota.
    if (!DD_GLOBAL_CRM_ROLES.has(user.role)) return void res.status(403).json({ success: false, error: "Only Sales or Super Admin can create operational CRM assignments of this type." });
    const targetUserId = ddId(body.assignedToUserId ?? body.userId);
    if (!targetUserId) return void res.status(400).json({ success: false, error: "assignedToUserId is required." });
    const target = db.prepare(`SELECT u.id, u.name, u.status, r.code AS role FROM users u INNER JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='active' LIMIT 1`).get(targetUserId) as { id: number; name: string; status: UserStatus; role: UserRole } | undefined;
    if (!target || (type === "sales" && target.role !== "sales") || (type === "admin" && target.role !== "super_admin")) return void res.status(400).json({ success: false, error: "Target user is not valid for this assignment type." });

    const existing = db.prepare(`SELECT * FROM lead_assignments WHERE lead_id=? AND assigned_to_user_id=? AND assignment_type=? ORDER BY id DESC LIMIT 1`).get(leadId, targetUserId, type) as Record<string, unknown> | undefined;
    if (existing) return void res.json({ success: true, lead: ddGetLead(leadId), assignment: existing, alreadyAssigned: true });

    const result = db.transaction(() => {
      const inserted = db.prepare(`INSERT INTO lead_assignments (lead_id, assigned_to_user_id, assigned_by, assignment_type, status, lead_credit_used, assigned_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'assigned', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(leadId, targetUserId, user.id, type);
      db.prepare(`UPDATE leads SET owner_user_id=?, status='assigned', last_activity_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(targetUserId, leadId);
      return db.prepare(`SELECT * FROM lead_assignments WHERE id=?`).get(Number(inserted.lastInsertRowid)) as Record<string, unknown>;
    })();
    ddNotifyUser(targetUserId, "lead_assigned", "New CRM lead assigned", "A new DivyaDhara lead has been assigned to you.", `/sales/leads/${leadId}`, { leadId, assignmentType: type });
    db.prepare(`INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json) VALUES (?, ?, ?, 'assigned', ?, 'assigned', ?, ?)`).run(leadId, result.id ?? null, user.id, lead.status ?? 'new', `Lead assigned to ${type}.`, ddJson({ assignmentType: type, targetUserId }, 5000));
    createAuditLog({ userId: user.id, action: "lead.assigned", entityType: "lead_assignment", entityId: Number(result.id), newData: result, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    return void res.json({ success: true, lead: ddGetLead(leadId), assignment: result });
  } catch (error) {
    console.error("Lead assignment error:", error);
    const message = String(error);
    if (message.includes("TEMPLE_LEAD_QUOTA_EXHAUSTED")) return void res.status(409).json({ success: false, error: "Temple lead quota is unavailable." });
    if (message.includes("ASHRAM_LEAD_QUOTA_EXHAUSTED")) return void res.status(409).json({ success: false, error: "Ashram lead quota is unavailable." });
    if (message.toLowerCase().includes("unique constraint")) return void res.status(409).json({ success: false, error: "This lead is already assigned to that recipient." });
    res.status(500).json({ success: false, error: "Unable to assign lead." });
  }
});

router.post("/:id/notes", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager", "pandit"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const note = normalizeText(body.note ?? body.message, 10000);
    const noteType = normalizeText(body.noteType, 20).toLowerCase() || "internal";
    if (!note) { res.status(400).json({ success: false, error: "Note text is required." }); return; }
    if (!["internal", "customer", "system"].includes(noteType)) { res.status(400).json({ success: false, error: "Invalid note type." }); return; }
    const result = db.prepare(`
      INSERT INTO lead_notes (lead_id, user_id, note_type, note, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(leadId, user.id, noteType, note, ddBool(body.isPinned) ? 1 : 0);
    db.prepare(`UPDATE leads SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    db.prepare(`INSERT INTO lead_events (lead_id, user_id, event_type, notes, metadata_json) VALUES (?, ?, 'note_added', ?, '{}')`).run(leadId, user.id, note);
    res.status(201).json({ success: true, note: db.prepare(`SELECT * FROM lead_notes WHERE id = ?`).get(Number(result.lastInsertRowid)) });
  } catch (error) {
    console.error("Lead note error:", error);
    res.status(500).json({ success: false, error: "Unable to add lead note." });
  }
});

router.post("/:id/followups", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager", "pandit"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const dueAt = normalizeText(body.dueAt ?? body.followupAt, 80);
    const followupType = normalizeText(body.followupType ?? body.type, 20).toLowerCase() || "call";
    if (!dueAt) { res.status(400).json({ success: false, error: "dueAt is required." }); return; }
    if (!["call", "whatsapp", "email", "meeting", "reminder", "other"].includes(followupType)) { res.status(400).json({ success: false, error: "Invalid follow-up type." }); return; }
    const assignedTo = ddId(body.assignedToUserId) ?? user.id;
    const assignedUser = db.prepare(`SELECT id, status FROM users WHERE id = ? LIMIT 1`).get(assignedTo) as { id: number; status: UserStatus } | undefined;
    if (!assignedUser || assignedUser.status !== "active") {
      res.status(400).json({ success: false, error: "Follow-up assignee is not active." });
      return;
    }
    if (!["super_admin", "sales"].includes(user.role) && assignedTo !== user.id) {
      res.status(403).json({ success: false, error: "You can only assign a follow-up to yourself." });
      return;
    }
    const result = db.prepare(`
      INSERT INTO lead_followups (
        lead_id, assigned_to_user_id, followup_type, due_at, status, subject, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(leadId, assignedTo, followupType, dueAt, normalizeNullableText(body.subject, 250), normalizeNullableText(body.notes ?? body.message, 5000));
    db.prepare(`UPDATE leads SET status = CASE WHEN status IN ('new','qualified','assigned','contacted') THEN 'follow_up' ELSE status END, last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    const followup = db.prepare(`SELECT * FROM lead_followups WHERE id = ?`).get(Number(result.lastInsertRowid));
    createAuditLog({ userId: user.id, action: "lead.followup_created", entityType: "lead_followup", entityId: Number(result.lastInsertRowid), newData: followup, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    db.prepare(`INSERT INTO lead_events (lead_id, user_id, event_type, notes, metadata_json) VALUES (?, ?, 'followup_created', ?, ?)`).run(leadId, user.id, "Follow-up scheduled", ddJson({ followupId: Number(result.lastInsertRowid), followupType, dueAt }, 5000));
    res.status(201).json({ success: true, followup });
  } catch (error) {
    console.error("Lead follow-up create error:", error);
    res.status(500).json({ success: false, error: "Unable to create follow-up." });
  }
});

router.patch("/:leadId/followups/:followupId", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager", "pandit"]);
    if (!user) return;
    const leadId = ddId(req.params.leadId);
    const followupId = ddId(req.params.followupId);
    if (!leadId || !followupId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this follow-up." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const status = normalizeText(body.status, 20).toLowerCase();
    if (!["pending", "completed", "cancelled", "overdue"].includes(status)) { res.status(400).json({ success: false, error: "Invalid follow-up status." }); return; }
    db.prepare(`
      UPDATE lead_followups
      SET status = ?,
          completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
          outcome = COALESCE(?, outcome),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND lead_id = ?
    `).run(status, status, normalizeNullableText(body.outcome, 5000), normalizeNullableText(body.notes, 5000), followupId, leadId);
    db.prepare(`UPDATE leads SET status = CASE WHEN ? = 'completed' AND status = 'follow_up' THEN 'contacted' ELSE status END, last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, leadId);
    const followup = db.prepare(`SELECT * FROM lead_followups WHERE id = ? AND lead_id = ?`).get(followupId, leadId);
    createAuditLog({ userId: user.id, action: "lead.followup_updated", entityType: "lead_followup", entityId: followupId, newData: followup, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.json({ success: true, followup });
  } catch (error) {
    console.error("Lead follow-up update error:", error);
    res.status(500).json({ success: false, error: "Unable to update follow-up." });
  }
});

router.post("/:id/communications", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager", "pandit"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const channel = normalizeText(body.channel, 20).toLowerCase() || "system";
    const direction = normalizeText(body.direction, 20).toLowerCase() || "outbound";
    if (!["phone", "whatsapp", "email", "sms", "system"].includes(channel)) { res.status(400).json({ success: false, error: "Invalid communication channel." }); return; }
    if (!["inbound", "outbound"].includes(direction)) { res.status(400).json({ success: false, error: "Invalid communication direction." }); return; }
    const result = db.prepare(`
      INSERT INTO lead_communications (
        lead_id, user_id, channel, direction, subject, message,
        provider_message_id, provider_status, occurred_at, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, CURRENT_TIMESTAMP)
    `).run(
      leadId, user.id, channel, direction,
      normalizeNullableText(body.subject, 250), normalizeNullableText(body.message, 10000),
      normalizeNullableText(body.providerMessageId, 250), normalizeNullableText(body.providerStatus, 100),
      normalizeNullableText(body.occurredAt, 80), ddJson(body.metadata, 20000),
    );
    db.prepare(`
      UPDATE leads
      SET last_activity_at = CURRENT_TIMESTAMP,
          last_contacted_at = CASE WHEN ? = 'outbound' THEN CURRENT_TIMESTAMP ELSE last_contacted_at END,
          status = CASE WHEN ? = 'outbound' AND status IN ('new','qualified','assigned') THEN 'contacted' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(direction, direction, leadId);
    const communication = db.prepare(`SELECT * FROM lead_communications WHERE id = ?`).get(Number(result.lastInsertRowid));
    createAuditLog({ userId: user.id, action: "lead.communication_created", entityType: "lead_communication", entityId: Number(result.lastInsertRowid), newData: communication, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.status(201).json({ success: true, communication, lead: ddGetLead(leadId) });
  } catch (error) {
    console.error("Lead communication error:", error);
    res.status(500).json({ success: false, error: "Unable to record communication." });
  }
});

router.post("/:id/tags", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    if (!leadId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const name = normalizeText(body.name ?? body.tag, 100);
    const slug = normalizeText(body.slug, 100).toLowerCase() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!name || !slug) { res.status(400).json({ success: false, error: "Tag name is required." }); return; }
    db.prepare(`INSERT OR IGNORE INTO lead_tags (name, slug, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).run(name, slug);
    const tag = db.prepare(`SELECT id, name, slug FROM lead_tags WHERE slug = ? LIMIT 1`).get(slug) as { id: number; name: string; slug: string } | undefined;
    if (!tag) { res.status(500).json({ success: false, error: "Unable to create tag." }); return; }
    db.prepare(`INSERT OR IGNORE INTO lead_tag_map (lead_id, tag_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).run(leadId, tag.id);
    db.prepare(`UPDATE leads SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    createAuditLog({ userId: user.id, action: "lead.tag_added", entityType: "lead", entityId: leadId, newData: tag, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.status(201).json({ success: true, tag });
  } catch (error) {
    console.error("Lead tag add error:", error);
    res.status(500).json({ success: false, error: "Unable to add lead tag." });
  }
});

router.delete("/:id/tags/:tagId", requireAuth, (req: Request, res: Response) => {
  try {
    const user = ddRequireLeadUser(req, res, ["super_admin", "sales", "temple_manager", "ashram_manager"]);
    if (!user) return;
    const leadId = ddId(req.params.id);
    const tagId = ddId(req.params.tagId);
    if (!leadId || !tagId || !ddCanAccessLead(user, leadId)) { res.status(403).json({ success: false, error: "You do not have access to this lead." }); return; }
    db.prepare(`DELETE FROM lead_tag_map WHERE lead_id = ? AND tag_id = ?`).run(leadId, tagId);
    createAuditLog({ userId: user.id, action: "lead.tag_removed", entityType: "lead", entityId: leadId, oldData: { tagId }, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error("Lead tag delete error:", error);
    res.status(500).json({ success: false, error: "Unable to remove lead tag." });
  }
});



export { leadRouter };
export default router;
