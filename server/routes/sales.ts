import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  requireAuth,
  requireRole,
  type AuthenticatedUser,
  type UserRole,
  type UserStatus,
} from "./auth.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Sales / CRM API
|--------------------------------------------------------------------------
|
| Sales is an internal CRM role. It is deliberately separated from public
| lead capture and from the payment gateway/webhook layer.
|
| Business rules:
| - Only Sales and Super Admin may use this router.
| - Visitor/Pandit/Temple Manager/Ashram Manager never get Sales access.
| - Sales can work the global lead pipeline, activities and follow-ups.
| - Super Admin has the same operational visibility plus full oversight.
| - Only Sales/Super Admin can change lead ownership.
| - Subscription records are operational read-only here; payment mutation
|   remains in the dedicated payments/webhook routes.
| - Temple/Ashram authorization is never inferred from subscription
|   manager_user_id. Current manager display is read from assignment tables.
| - Financial detail returned by this router excludes provider signatures,
|   checkout payloads and other sensitive gateway internals.
|--------------------------------------------------------------------------
*/

const router = Router();
router.use(requireAuth);
router.use(requireRole("sales", "super_admin"));

const LEAD_STATUSES = [
  "new",
  "qualified",
  "assigned",
  "contacted",
  "follow_up",
  "converted",
  "lost",
  "closed",
  "spam",
] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

const LEAD_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type LeadPriority = (typeof LEAD_PRIORITIES)[number];

const LEAD_TEMPERATURES = ["cold", "warm", "hot"] as const;
type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

const ACTIVITY_TYPES = [
  "call",
  "whatsapp",
  "email",
  "meeting",
  "follow_up",
  "note",
  "package_discussion",
  "renewal",
] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

const FOLLOWUP_TYPES = ["call", "whatsapp", "email", "meeting", "reminder", "other"] as const;
const FOLLOWUP_STATUSES = ["pending", "completed", "cancelled", "overdue"] as const;
const BOOKING_STATUSES = ["received", "confirmed", "in_progress", "completed", "cancelled", "rejected"] as const;
const SUBSCRIPTION_STATUSES = ["pending", "active", "expired", "cancelled", "paused", "payment_failed"] as const;
const PAYMENT_STATUSES = ["created", "pending", "authorized", "paid", "captured", "failed", "refunded", "partially_refunded", "cancelled"] as const;
const PAYMENT_ORDER_STATUSES = ["created", "attempted", "paid", "failed", "cancelled", "expired"] as const;
const BOOKING_PAYMENT_STATUSES = ["unpaid", "pending", "paid", "partially_paid", "refunded", "failed"] as const;
const SOURCE_TYPES = [
  "website",
  "form",
  "whatsapp",
  "phone",
  "admin",
  "organic_search",
  "paid_search",
  "social",
  "email",
  "referral",
  "direct",
  "video",
  "gallery",
  "seo_landing",
] as const;

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
  WHEN l.spiritual_place_id IS NOT NULL
    AND (LOWER(COALESCE(l.source_form, '')) LIKE '%spiritual%' OR LOWER(COALESCE(l.source_form, '')) LIKE '%place%')
    THEN 'spiritual_place'
  WHEN l.temple_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%temple%' THEN 'temple'
  WHEN l.requested_pandit_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%pandit%' THEN 'pandit'
  WHEN l.puja_service_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%puja%' THEN 'puja'
  WHEN l.ashram_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%ashram%' THEN 'ashram'
  WHEN l.yatra_package_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%travel%' THEN 'travel'
  WHEN l.yatra_package_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%yatra%' THEN 'yatra'
  WHEN l.event_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%event%' THEN 'event'
  WHEN l.course_id IS NOT NULL AND LOWER(COALESCE(l.source_form, '')) LIKE '%course%' THEN 'course'
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

const LEAD_TYPE_VALUES: DDLeadType[] = [
  "general",
  "contact",
  "puja",
  "pandit",
  "temple",
  "ashram",
  "yatra",
  "travel",
  "event",
  "course",
  "spiritual_place",
];

const MANAGED_ENTITY_TABLES = new Set([
  "pandit_profiles",
  "temples",
  "ashrams",
  "puja_services",
  "yatra_packages",
  "events",
  "courses",
  "spiritual_places",
]);

function currentUser(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

function userFromRequest(req: Request): AuthenticatedUser {
  return req.res?.locals?.user as AuthenticatedUser;
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max = 500): string | null {
  const result = text(value, max);
  return result || null;
}

function positiveId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function integerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i < min || i > max ? fallback : i;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = text(value, 30).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const normalized = text(value, 100).toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function jsonText(value: unknown, fallback = "{}"): string {
  try {
    const result = JSON.stringify(value ?? {});
    return result || fallback;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeReference(prefix: string): string {
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

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]?.trim().slice(0, 100) || null;
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0].trim().slice(0, 100) || null;
  return req.ip?.trim().slice(0, 100) || null;
}

function userAgent(req: Request): string | null {
  return nullableText(req.get("user-agent"), 500);
}

function tableExists(tableName: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function pagination(req: Request): { page: number; limit: number; offset: number } {
  const page = integerInRange(req.query.page, 1, 1, 100000);
  const limit = integerInRange(req.query.limit, 25, 1, 100);
  return { page, limit, offset: (page - 1) * limit };
}

function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData?: unknown,
  newData?: unknown,
): void {
  if (!tableExists("audit_logs")) return;
  const user = userFromRequest(req);
  db.prepare(
    `INSERT INTO audit_logs (
      user_id, request_id, actor_type, action, entity_type, entity_id,
      old_data_json, new_data_json, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).run(
    user?.id ?? null,
    nullableText(req.get("x-request-id"), 120),
    user?.role ?? "system",
    action,
    entityType,
    entityId,
    oldData === undefined ? null : jsonText(oldData),
    newData === undefined ? null : jsonText(newData),
    clientIp(req),
    userAgent(req),
  );
}

function entityExists(table: string, id: number | null): boolean {
  if (!id || !MANAGED_ENTITY_TABLES.has(table)) return false;
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`).get(id) as { id?: number } | undefined;
  return Number(row?.id ?? 0) === id;
}

function leadById(leadId: number): Record<string, unknown> | null {
  return (
    db.prepare(`SELECT l.*, ${DD_LEAD_TYPE_SQL} AS lead_type FROM leads l WHERE l.id = ? LIMIT 1`).get(leadId) as Record<string, unknown> | undefined
  ) ?? null;
}

function ensureLead(leadId: number, res: Response): Record<string, unknown> | null {
  const lead = leadById(leadId);
  if (!lead) {
    res.status(404).json({ success: false, error: "Lead not found." });
    return null;
  }
  return lead;
}

function ensureSalesTarget(userId: number): {
  id: number;
  role: UserRole;
  status: UserStatus;
  name: string;
  email: string;
} | null {
  const row = db.prepare(`
    SELECT u.id, r.code AS role, u.status, u.name, u.email
    FROM users u INNER JOIN roles r ON r.id = u.role_id
    WHERE u.id = ? LIMIT 1
  `).get(userId) as {
    id: number;
    role: UserRole;
    status: UserStatus;
    name: string;
    email: string;
  } | undefined;
  return row ?? null;
}

function validateSalesTarget(userId: number | null): string | null {
  if (userId === null) return null;
  const target = ensureSalesTarget(userId);
  if (!target || target.status !== "active" || !["sales", "super_admin"].includes(target.role)) {
    return "Selected user must be an active Sales or Super Admin user.";
  }
  return null;
}

function buildLeadWhere(req: Request): { whereSql: string; params: unknown[] } {
  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];
  const search = text(req.query.search, 180);

  if (search) {
    const p = `%${search}%`;
    where.push(`(
      LOWER(COALESCE(l.lead_number,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.name,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.email,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.phone,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.service_type,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.puja_type,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.city,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.district,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.state,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.source_page,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(l.form_key,'')) LIKE LOWER(?)
    )`);
    params.push(p, p, p, p, p, p, p, p, p, p, p);
  }

  const filterDefinitions: Array<{ key: string; column: string; max: number; lower?: boolean }> = [
    { key: "status", column: "l.status", max: 30, lower: true },
    { key: "leadType", column: `(${DD_LEAD_TYPE_SQL})`, max: 40, lower: true },
    { key: "sourceType", column: "l.source_type", max: 50, lower: true },
    { key: "serviceType", column: "l.service_type", max: 150 },
    { key: "pujaType", column: "l.puja_type", max: 250 },
    { key: "country", column: "l.country", max: 100 },
    { key: "state", column: "l.state", max: 120 },
    { key: "district", column: "l.district", max: 120 },
    { key: "city", column: "l.city", max: 120 },
    { key: "formKey", column: "l.form_key", max: 120 },
    { key: "priority", column: "l.priority", max: 20, lower: true },
    { key: "temperature", column: "l.lead_temperature", max: 20, lower: true },
  ];

  for (const f of filterDefinitions) {
    const value = text(req.query[f.key], f.max);
    if (!value) continue;
    where.push(`${f.column} = ?`);
    params.push(f.lower ? value.toLowerCase() : value);
  }

  const owner = text(req.query.owner, 30).toLowerCase();
  if (owner === "mine") {
    where.push("l.owner_user_id = ?");
    params.push(userFromRequest(req).id);
  } else if (owner === "unassigned") {
    where.push("l.owner_user_id IS NULL");
  } else if (owner === "owned") {
    where.push("l.owner_user_id IS NOT NULL");
  } else {
    const ownerUserId = positiveId(req.query.ownerUserId);
    if (ownerUserId) {
      where.push("l.owner_user_id = ?");
      params.push(ownerUserId);
    }
  }

  const from = text(req.query.from ?? req.query.dateFrom, 50);
  const to = text(req.query.to ?? req.query.dateTo, 50);
  if (from) {
    where.push("l.created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("l.created_at <= ?");
    params.push(to);
  }
  if (booleanValue(req.query.highPriorityOnly)) where.push("l.priority IN ('high','urgent')");
  if (booleanValue(req.query.openOnly)) where.push("l.status NOT IN ('converted','lost','closed','spam')");

  return { whereSql: `WHERE ${where.join(" AND ")}`, params };
}

function leadDetailRow(leadId: number): Record<string, unknown> | null {
  return (
    db.prepare(`
      SELECT
        l.*,
        ${DD_LEAD_TYPE_SQL} AS lead_type,
        pp.display_name AS requested_pandit_name,
        pp.slug AS requested_pandit_slug,
        t.name AS temple_name,
        t.slug AS temple_slug,
        a.name AS ashram_name,
        a.slug AS ashram_slug,
        ps.name AS puja_service_name,
        ps.slug AS puja_service_slug,
        yp.name AS yatra_package_name,
        yp.slug AS yatra_package_slug,
        e.title AS event_name,
        e.slug AS event_slug,
        c.title AS course_name,
        c.slug AS course_slug,
        sp.name AS spiritual_place_name,
        sp.slug AS spiritual_place_slug,
        o.name AS owner_name,
        o.email AS owner_email
      FROM leads l
      LEFT JOIN pandit_profiles pp ON pp.id = l.requested_pandit_id
      LEFT JOIN temples t ON t.id = l.temple_id
      LEFT JOIN ashrams a ON a.id = l.ashram_id
      LEFT JOIN puja_services ps ON ps.id = l.puja_service_id
      LEFT JOIN yatra_packages yp ON yp.id = l.yatra_package_id
      LEFT JOIN events e ON e.id = l.event_id
      LEFT JOIN courses c ON c.id = l.course_id
      LEFT JOIN spiritual_places sp ON sp.id = l.spiritual_place_id
      LEFT JOIN users o ON o.id = l.owner_user_id
      WHERE l.id = ? LIMIT 1
    `).get(leadId) as Record<string, unknown> | undefined
  ) ?? null;
}

function detailCollections(leadId: number): Record<string, unknown> {
  return {
    formSubmission: db.prepare(`SELECT * FROM form_submissions WHERE lead_id = ? ORDER BY id DESC LIMIT 1`).get(leadId),
    assignments: db.prepare(`
      SELECT la.*, pp.display_name AS pandit_name, au.name AS assigned_user_name, ab.name AS assigned_by_name
      FROM lead_assignments la
      LEFT JOIN pandit_profiles pp ON pp.id = la.pandit_id
      LEFT JOIN users au ON au.id = la.assigned_to_user_id
      LEFT JOIN users ab ON ab.id = la.assigned_by
      WHERE la.lead_id = ? ORDER BY la.id DESC
    `).all(leadId),
    notes: db.prepare(`
      SELECT ln.*, u.name AS user_name, u.email AS user_email
      FROM lead_notes ln LEFT JOIN users u ON u.id = ln.user_id
      WHERE ln.lead_id = ? ORDER BY ln.is_pinned DESC, ln.id DESC
    `).all(leadId),
    followups: db.prepare(`
      SELECT lf.*, u.name AS assigned_user_name, u.email AS assigned_user_email
      FROM lead_followups lf LEFT JOIN users u ON u.id = lf.assigned_to_user_id
      WHERE lf.lead_id = ?
      ORDER BY CASE WHEN lf.status = 'pending' THEN 0 ELSE 1 END, lf.due_at ASC, lf.id DESC
    `).all(leadId),
    communications: db.prepare(`
      SELECT lc.*, u.name AS user_name
      FROM lead_communications lc LEFT JOIN users u ON u.id = lc.user_id
      WHERE lc.lead_id = ? ORDER BY lc.id DESC LIMIT 200
    `).all(leadId),
    tags: db.prepare(`
      SELECT lt.id, lt.name, lt.slug, ltm.created_at
      FROM lead_tag_map ltm INNER JOIN lead_tags lt ON lt.id = ltm.tag_id
      WHERE ltm.lead_id = ? ORDER BY lt.name ASC
    `).all(leadId),
    events: db.prepare(`
      SELECT le.*, u.name AS user_name
      FROM lead_events le LEFT JOIN users u ON u.id = le.user_id
      WHERE le.lead_id = ? ORDER BY le.id DESC LIMIT 300
    `).all(leadId),
    salesActivities: db.prepare(`
      SELECT sa.*, u.name AS sales_user_name
      FROM sales_activities sa INNER JOIN users u ON u.id = sa.sales_user_id
      WHERE sa.lead_id = ? ORDER BY sa.id DESC LIMIT 300
    `).all(leadId),
    bookings: db.prepare(`SELECT * FROM bookings WHERE lead_id = ? ORDER BY id DESC`).all(leadId),
  };
}

function recordLeadEvent(
  leadId: number,
  userId: number,
  eventType: string,
  oldStatus: string | null,
  newStatus: string | null,
  notes: string | null,
  metadata: unknown = {},
  assignmentId: number | null = null,
): void {
  db.prepare(`
    INSERT INTO lead_events (
      lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(leadId, assignmentId, userId, eventType, oldStatus, newStatus, notes, jsonText(metadata));
}

function setLeadOwner(leadId: number, targetUserId: number | null, actor: AuthenticatedUser): number | null {
  const targetError = validateSalesTarget(targetUserId);
  if (targetError) throw new Error(targetError);

  const lead = leadById(leadId);
  if (!lead) throw new Error("Lead not found.");

  return db.transaction(() => {
    db.prepare(`
      UPDATE lead_assignments
      SET status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE lead_id = ? AND assignment_type = 'sales'
        AND status IN ('assigned','accepted','contacted','follow_up')
    `).run(leadId);

    let assignmentId: number | null = null;
    if (targetUserId) {
      const result = db.prepare(`
        INSERT INTO lead_assignments (
          lead_id, assigned_to_user_id, assigned_by, assignment_type, status,
          lead_credit_used, assigned_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'sales', 'assigned', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(leadId, targetUserId, actor.id);
      assignmentId = Number(result.lastInsertRowid);
    }

    db.prepare(`
      UPDATE leads
      SET owner_user_id = ?,
          status = CASE
            WHEN ? IS NOT NULL AND status IN ('new','qualified') THEN 'assigned'
            WHEN ? IS NULL AND status = 'assigned' THEN 'new'
            ELSE status
          END,
          last_activity_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(targetUserId, targetUserId, targetUserId, leadId);

    const updated = leadById(leadId);
    recordLeadEvent(
      leadId,
      actor.id,
      targetUserId ? "assigned" : "unassigned",
      text(lead.status, 30) || null,
      text(updated?.status, 30) || null,
      targetUserId ? `Sales ownership assigned to user ${targetUserId}.` : `Sales ownership removed by ${actor.name}.`,
      { targetUserId },
      assignmentId,
    );

    return assignmentId;
  })();
}

function subscriptionOwnerName(audience: "pandit" | "temple" | "ashram", row: Record<string, unknown>): string | null {
  if (audience === "pandit") return nullableText(row.pandit_display_name, 250);
  if (audience === "temple") return nullableText(row.temple_name, 250);
  return nullableText(row.ashram_name, 250);
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function daysToExpiry(expiresAt: unknown): number | null {
  if (!expiresAt) return null;
  const time = new Date(String(expiresAt)).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.ceil((time - Date.now()) / 86400000));
}


/* ------------------------------------------------------------------------ */
/* META                                                                     */
/* ------------------------------------------------------------------------ */

router.get("/meta", (_req, res) => {
  res.json({
    success: true,
    leadStatuses: LEAD_STATUSES,
    leadPriorities: LEAD_PRIORITIES,
    leadTemperatures: LEAD_TEMPERATURES,
    activityTypes: ACTIVITY_TYPES,
    followupTypes: FOLLOWUP_TYPES,
    followupStatuses: FOLLOWUP_STATUSES,
    bookingStatuses: BOOKING_STATUSES,
    bookingPaymentStatuses: BOOKING_PAYMENT_STATUSES,
    subscriptionStatuses: SUBSCRIPTION_STATUSES,
    paymentStatuses: PAYMENT_STATUSES,
    paymentOrderStatuses: PAYMENT_ORDER_STATUSES,
    sourceTypes: SOURCE_TYPES,
    leadTypes: LEAD_TYPE_VALUES,
    audiences: ["pandit", "temple", "ashram"],
  });
});

/* ------------------------------------------------------------------------ */
/* DASHBOARD                                                                */
/* ------------------------------------------------------------------------ */

router.get("/dashboard", (_req, res) => {
  try {
    const user = currentUser(res);
    const leadScope = user.role === "sales" ? "WHERE owner_user_id = ? OR owner_user_id IS NULL" : "";
    const leadScopeParams = user.role === "sales" ? [user.id] : [];

    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted_count,
        SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up_count,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
        SUM(CASE WHEN status IN ('lost','closed') THEN 1 ELSE 0 END) AS closed_count,
        SUM(CASE WHEN lead_temperature = 'hot' THEN 1 ELSE 0 END) AS hot_count,
        SUM(CASE WHEN priority IN ('high','urgent') THEN 1 ELSE 0 END) AS high_priority_count,
        SUM(CASE WHEN owner_user_id = ? THEN 1 ELSE 0 END) AS my_owned_count,
        SUM(CASE WHEN owner_user_id IS NULL AND status NOT IN ('spam','closed','lost') THEN 1 ELSE 0 END) AS unassigned_open_count
      FROM leads
      ${leadScope}
    `).get(user.id, ...leadScopeParams) as Record<string, unknown>;

    const followupWhere = user.role === "sales" ? "AND lf.assigned_to_user_id = ?" : "";
    const followupParams = user.role === "sales" ? [user.id] : [];

    const todayFollowups = db.prepare(`
      SELECT lf.id, lf.lead_id, lf.assigned_to_user_id, lf.followup_type, lf.due_at,
             CASE WHEN lf.status = 'pending' AND datetime(lf.due_at) < datetime('now') THEN 'overdue' ELSE lf.status END AS status,
             lf.subject, lf.notes, l.lead_number, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email
      FROM lead_followups lf INNER JOIN leads l ON l.id = lf.lead_id
      WHERE lf.status IN ('pending','overdue') AND date(lf.due_at) <= date('now','localtime') ${followupWhere}
      ORDER BY lf.due_at ASC, lf.id ASC LIMIT 25
    `).all(...followupParams);

    const upcomingFollowups = db.prepare(`
      SELECT lf.id, lf.lead_id, lf.assigned_to_user_id, lf.followup_type, lf.due_at, lf.status,
             lf.subject, lf.notes, l.lead_number, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email
      FROM lead_followups lf INNER JOIN leads l ON l.id = lf.lead_id
      WHERE lf.status = 'pending' AND datetime(lf.due_at) > datetime('now','localtime') ${followupWhere}
      ORDER BY lf.due_at ASC, lf.id ASC LIMIT 25
    `).all(...followupParams);

    const byType = db.prepare(`SELECT ${DD_LEAD_TYPE_SQL} AS lead_type, COUNT(*) AS count FROM leads l ${leadScope} GROUP BY ${DD_LEAD_TYPE_SQL} ORDER BY count DESC`).all(...leadScopeParams);
    const bySource = db.prepare(`SELECT source_type, COUNT(*) AS count FROM leads l ${leadScope} GROUP BY source_type ORDER BY count DESC`).all(...leadScopeParams);
    const byLocation = db.prepare(`SELECT country, state, district, city, COUNT(*) AS count FROM leads l ${leadScope} GROUP BY country, state, district, city ORDER BY count DESC LIMIT 100`).all(...leadScopeParams);

    const conversion = db.prepare(`
      SELECT COUNT(*) AS total_leads,
             SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted_leads,
             ROUND(CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) END, 2) AS conversion_rate_percent
      FROM leads l
      WHERE created_at >= datetime('now','-30 day') ${user.role === "sales" ? "AND (owner_user_id = ? OR owner_user_id IS NULL)" : ""}
    `).get(...(user.role === "sales" ? [user.id] : []));

    const revenue = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN COALESCE(amount,0) ELSE 0 END),0) AS paid_booking_amount,
        COALESCE(SUM(CASE WHEN payment_status IN ('pending','unpaid','partially_paid') THEN COALESCE(amount,0) ELSE 0 END),0) AS pending_booking_amount,
        COUNT(*) AS booking_count
      FROM bookings WHERE created_at >= datetime('now','-30 day')
    `).get();

    const paymentRevenue = db.prepare(`
      SELECT
        COUNT(*) AS payment_count,
        COALESCE(SUM(CASE WHEN status IN ('paid','captured','partially_refunded','refunded') THEN COALESCE(amount_paise, ROUND(amount * 100)) ELSE 0 END),0) AS gross_paid_paise,
        COALESCE(SUM(COALESCE(refund_amount_paise,0)),0) AS refunded_paise,
        COALESCE(SUM(CASE WHEN status IN ('paid','captured','partially_refunded','refunded') THEN COALESCE(amount_paise, ROUND(amount * 100)) ELSE 0 END),0) - COALESCE(SUM(COALESCE(refund_amount_paise,0)),0) AS net_paid_paise
      FROM payments WHERE created_at >= datetime('now','-30 day')
    `).get();

    const renewals = db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT id FROM pandit_subscriptions WHERE status = 'active' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now','+30 day')
        UNION ALL
        SELECT id FROM temple_subscriptions WHERE status = 'active' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now','+30 day')
        UNION ALL
        SELECT id FROM ashram_subscriptions WHERE status = 'active' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now','+30 day')
      )
    `).get();

    const recentActivities = db.prepare(`
      SELECT sa.*, u.name AS sales_user_name, l.lead_number, l.name AS lead_name
      FROM sales_activities sa INNER JOIN users u ON u.id = sa.sales_user_id
      LEFT JOIN leads l ON l.id = sa.lead_id
      ${user.role === "sales" ? "WHERE sa.sales_user_id = ?" : ""}
      ORDER BY sa.id DESC LIMIT 25
    `).all(...(user.role === "sales" ? [user.id] : []));

    res.json({
      success: true,
      viewer: { id: user.id, role: user.role, name: user.name },
      totals,
      conversion,
      revenue: { bookings: revenue, payments: paymentRevenue },
      renewalPipeline: renewals,
      byType,
      bySource,
      byLocation,
      todayFollowups,
      upcomingFollowups,
      recentActivities,
    });
  } catch (error) {
    console.error("Sales dashboard error:", error);
    res.status(500).json({ success: false, error: "Unable to load sales dashboard." });
  }
});

/* ------------------------------------------------------------------------ */
/* LEADS                                                                    */
/* ------------------------------------------------------------------------ */

router.get("/leads/export.csv", (req, res) => {
  try {
    const { whereSql, params } = buildLeadWhere(req);
    const headers = [
      "id","lead_number","lead_type","name","phone","email","city","district","state","country",
      "service_type","puja_type","preferred_date","preferred_time","travellers_count","source_type","source_page",
      "source_form","landing_page","utm_source","utm_medium","utm_campaign","status","priority","lead_temperature",
      "lead_score","owner_user_id","owner_name","last_activity_at","last_contacted_at","converted_at","created_at",
    ];
    const rows = db.prepare(`
      SELECT l.id, l.lead_number, ${DD_LEAD_TYPE_SQL} AS lead_type, l.name, l.phone, l.email,
             l.city, l.district, l.state, l.country, l.service_type, l.puja_type, l.preferred_date, l.preferred_time,
             l.travellers_count, l.source_type, l.source_page, l.source_form, l.landing_page, l.utm_source, l.utm_medium,
             l.utm_campaign, l.status, l.priority, l.lead_temperature, l.lead_score, l.owner_user_id, owner.name AS owner_name,
             l.last_activity_at, l.last_contacted_at, l.converted_at, l.created_at
      FROM leads l LEFT JOIN users owner ON owner.id = l.owner_user_id
      ${whereSql}
      ORDER BY l.id DESC LIMIT 50000
    `).all(...params) as Array<Record<string, unknown>>;

    const csv = [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="divyadhara-sales-leads-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Sales lead CSV error:", error);
    res.status(500).json({ success: false, error: "Unable to export sales leads." });
  }
});

router.get("/leads", (req, res) => {
  try {
    const { page, limit, offset } = pagination(req);
    const { whereSql, params } = buildLeadWhere(req);
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM leads l ${whereSql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = db.prepare(`
      SELECT l.*, ${DD_LEAD_TYPE_SQL} AS lead_type,
             pp.display_name AS requested_pandit_name, pp.slug AS requested_pandit_slug,
             t.name AS temple_name, a.name AS ashram_name, ps.name AS puja_service_name,
             yp.name AS yatra_package_name, e.title AS event_name, c.title AS course_name,
             sp.name AS spiritual_place_name, owner.name AS owner_name, owner.email AS owner_email
      FROM leads l
      LEFT JOIN pandit_profiles pp ON pp.id = l.requested_pandit_id
      LEFT JOIN temples t ON t.id = l.temple_id
      LEFT JOIN ashrams a ON a.id = l.ashram_id
      LEFT JOIN puja_services ps ON ps.id = l.puja_service_id
      LEFT JOIN yatra_packages yp ON yp.id = l.yatra_package_id
      LEFT JOIN events e ON e.id = l.event_id
      LEFT JOIN courses c ON c.id = l.course_id
      LEFT JOIN spiritual_places sp ON sp.id = l.spiritual_place_id
      LEFT JOIN users owner ON owner.id = l.owner_user_id
      ${whereSql}
      ORDER BY CASE l.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
               CASE l.lead_temperature WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
               l.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<Record<string, unknown>>;

    res.json({
      success: true,
      leads: rows,
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      filters: {
        search: text(req.query.search, 180) || null,
        owner: text(req.query.owner, 30) || null,
        ownerUserId: positiveId(req.query.ownerUserId),
        status: text(req.query.status, 30) || null,
        leadType: text(req.query.leadType, 40) || null,
        sourceType: text(req.query.sourceType, 50) || null,
        priority: text(req.query.priority, 20) || null,
        temperature: text(req.query.temperature, 20) || null,
        country: text(req.query.country, 100) || null,
        state: text(req.query.state, 120) || null,
        district: text(req.query.district, 120) || null,
        city: text(req.query.city, 120) || null,
        highPriorityOnly: booleanValue(req.query.highPriorityOnly),
        openOnly: booleanValue(req.query.openOnly),
      },
    });
  } catch (error) {
    console.error("Sales lead list error:", error);
    res.status(500).json({ success: false, error: "Unable to load sales leads." });
  }
});

router.get("/leads/:id", (req, res) => {
  try {
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({ success: false, error: "Invalid lead id." });
    const lead = leadDetailRow(leadId);
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found." });
    return res.json({ success: true, lead, ...detailCollections(leadId) });
  } catch (error) {
    console.error("Sales lead detail error:", error);
    return res.status(500).json({ success: false, error: "Unable to load sales lead details." });
  }
});

router.post("/leads", (req, res) => {
  try {
    const user = currentUser(res);
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const name = text(body.name ?? body.fullName, 150);
    const email = text(body.email, 320).toLowerCase();
    const phone = nullableText(body.phone ?? body.mobile ?? body.mobileNumber, 30);
    const whatsapp = nullableText(body.whatsapp ?? body.whatsappNumber, 30);

    if (name.length < 2) return res.status(400).json({ success: false, error: "Name must contain at least 2 characters." });
    if (!email && !phone && !whatsapp) return res.status(400).json({ success: false, error: "Please provide phone, email or WhatsApp." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    if (phone && !/^[+0-9()\-\s]{7,20}$/.test(phone)) return res.status(400).json({ success: false, error: "Please enter a valid phone number." });

    const sourceType = enumValue(body.sourceType ?? body.source ?? "phone", SOURCE_TYPES) ?? "phone";
    const priority = enumValue(body.priority ?? "normal", LEAD_PRIORITIES) ?? "normal";
    const temperature = enumValue(body.leadTemperature ?? body.temperature ?? "cold", LEAD_TEMPERATURES) ?? "cold";
    const ownerId = body.ownerUserId === null || body.ownerUserId === "" ? null : positiveId(body.ownerUserId);
    const ownerError = validateSalesTarget(ownerId);
    if (ownerError) return res.status(400).json({ success: false, error: ownerError });

    const requestedLeadType = text(body.leadType ?? body.type, 40).toLowerCase() as DDLeadType;
    const leadType: DDLeadType = LEAD_TYPE_VALUES.includes(requestedLeadType) ? requestedLeadType : "general";

    const city = nullableText(body.city, 120);
    const district = nullableText(body.district, 120);
    const state = nullableText(body.state, 120);
    const country = nullableText(body.country, 100) || "India";
    const sourceForm = nullableText(body.sourceForm ?? body.formKey, 120) ?? (leadType === "general" ? "sales_manual" : `sales_${leadType}`);
    const serviceType = nullableText(body.serviceType ?? body.service, 150);
    const pujaType = nullableText(body.pujaType ?? body.pujaName, 250);
    const message = nullableText(body.message ?? body.notes, 10000);
    const preferredDate = nullableText(body.preferredDate, 40);
    const preferredTime = nullableText(body.preferredTime, 80);
    const travellersValue = body.travellersCount ?? body.travellers ?? body.adults;
    const travellersCount = travellersValue === null || travellersValue === undefined || travellersValue === "" ? null : integerInRange(travellersValue, 0, 0, 100000);

    const templeId = positiveId(body.templeId);
    const requestedPanditId = positiveId(body.requestedPanditId ?? body.panditId);
    const ashramId = positiveId(body.ashramId);
    const pujaServiceId = positiveId(body.pujaServiceId ?? body.serviceId);
    const yatraPackageId = positiveId(body.yatraPackageId ?? body.packageId);
    const eventId = positiveId(body.eventId);
    const courseId = positiveId(body.courseId);
    const spiritualPlaceId = positiveId(body.spiritualPlaceId ?? body.placeId);

    const entities: Array<[string, number | null, string]> = [
      ["temples", templeId, "Temple"], ["pandit_profiles", requestedPanditId, "Pandit"], ["ashrams", ashramId, "Ashram"],
      ["puja_services", pujaServiceId, "Puja service"], ["yatra_packages", yatraPackageId, "Yatra package"],
      ["events", eventId, "Event"], ["courses", courseId, "Course"], ["spiritual_places", spiritualPlaceId, "Spiritual place"],
    ];
    for (const [table, id, label] of entities) {
      if (id && !entityExists(table, id)) return res.status(400).json({ success: false, error: `${label} not found.` });
    }

    const populatedEntityIds = [templeId, requestedPanditId, ashramId, pujaServiceId, yatraPackageId, eventId, courseId, spiritualPlaceId].filter((x) => x !== null);
    if (populatedEntityIds.length > 1) {
      return res.status(400).json({ success: false, error: "A sales lead can reference only one primary business entity." });
    }

    const leadScore = Math.min(1000,
      (phone || whatsapp ? 25 : 0) + (email ? 15 : 0) + (serviceType ? 10 : 0) + (pujaType ? 10 : 0) +
      (city ? 5 : 0) + (state ? 3 : 0) + (message ? 5 : 0) + (preferredDate ? 10 : 0));

    const duplicateIdentity = phone ?? whatsapp;
    if (duplicateIdentity || email) {
      const duplicate = db.prepare(`
        SELECT id, lead_number, name, status, created_at
        FROM leads
        WHERE status <> 'spam' AND created_at >= datetime('now','-30 day')
          AND ((? IS NOT NULL AND phone = ?) OR (? IS NOT NULL AND email = ?))
          AND (COALESCE(service_type,'') = COALESCE(?, '') OR COALESCE(puja_type,'') = COALESCE(?, '') OR (? IS NULL AND ? IS NULL))
        ORDER BY id DESC LIMIT 1
      `).get(duplicateIdentity, duplicateIdentity, email || null, email || null, serviceType, pujaType, serviceType, pujaType) as Record<string, unknown> | undefined;
      if (duplicate && !(user.role === "super_admin" && booleanValue(body.allowDuplicate))) {
        return res.status(409).json({ success: false, error: "A similar lead was created recently.", existingLead: duplicate });
      }
    }

    const leadNumber = makeReference("DD-LEAD");
    const result = db.prepare(`
      INSERT INTO leads (
        lead_number,name,phone,email,city,state,service_type,puja_type,temple_id,requested_pandit_id,ashram_id,
        puja_service_id,yatra_package_id,event_id,course_id,spiritual_place_id,country,district,preferred_date,preferred_time,
        travellers_count,message,source_type,source_page,source_form,utm_source,utm_medium,utm_campaign,utm_term,utm_content,
        landing_page,referrer_url,visitor_id,session_id,contact_preference,whatsapp_consent,marketing_consent,lead_score,
        lead_temperature,last_activity_at,form_key,status,priority,owner_user_id,created_at,updated_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      )
    `).run(
      leadNumber,name,phone ?? whatsapp,email || null,city,state,serviceType,pujaType,templeId,requestedPanditId,ashramId,
      pujaServiceId,yatraPackageId,eventId,courseId,spiritualPlaceId,country,district,preferredDate,preferredTime,travellersCount,
      message,sourceType,nullableText(body.sourcePage ?? body.pagePath,1000),sourceForm,nullableText(body.utmSource,250),nullableText(body.utmMedium,250),
      nullableText(body.utmCampaign,250),nullableText(body.utmTerm,250),nullableText(body.utmContent,250),nullableText(body.landingPage,1000),
      nullableText(body.referrerUrl,2000),null,null,enumValue(body.contactPreference,["call","whatsapp","email","any"] as const),
      booleanValue(body.whatsappConsent) ? 1 : 0,booleanValue(body.marketingConsent) ? 1 : 0,leadScore,temperature,nullableText(body.formKey,120),
      ownerId ? "assigned" : "new",priority,ownerId,
    );
    const leadId = Number(result.lastInsertRowid);

    if (ownerId) setLeadOwner(leadId, ownerId, user);
    recordLeadEvent(leadId, user.id, "created", null, ownerId ? "assigned" : "new", "Lead manually created by Sales.", { source: sourceType, leadType });
    audit(req, "sales.lead_created", "lead", leadId, null, leadById(leadId));

    return res.status(201).json({ success: true, lead: leadDetailRow(leadId) });
  } catch (error) {
    console.error("Sales manual lead create error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "Selected user must be an active Sales or Super Admin user.") return res.status(400).json({ success: false, error: message });
    return res.status(500).json({ success: false, error: "Unable to create sales lead." });
  }
});

function buildLeadPatch(req: Request): { updates: string[]; values: unknown[]; fields: string[]; ownerChanged: boolean; ownerId: number | null } {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields: string[] = [];
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  let ownerChanged = false;
  let ownerId: number | null = null;

  if (has("status")) {
    const status = enumValue(body.status, LEAD_STATUSES) as LeadStatus | null;
    if (!status) throw new Error("Invalid lead status.");
    updates.push("status = ?"); values.push(status); fields.push("status");
    if (status === "converted") updates.push("converted_at = COALESCE(converted_at,CURRENT_TIMESTAMP)");
    if (status === "closed") updates.push("closed_at = COALESCE(closed_at,CURRENT_TIMESTAMP)");
  }
  if (has("priority")) {
    const priority = enumValue(body.priority, LEAD_PRIORITIES) as LeadPriority | null;
    if (!priority) throw new Error("Invalid lead priority.");
    updates.push("priority = ?"); values.push(priority); fields.push("priority");
  }
  if (has("leadTemperature") || has("temperature")) {
    const temperature = enumValue(body.leadTemperature ?? body.temperature, LEAD_TEMPERATURES) as LeadTemperature | null;
    if (!temperature) throw new Error("Invalid lead temperature.");
    updates.push("lead_temperature = ?"); values.push(temperature); fields.push("lead_temperature");
  }
  if (has("leadScore")) {
    updates.push("lead_score = ?"); values.push(integerInRange(body.leadScore, 0, 0, 1000)); fields.push("lead_score");
  }
  if (has("ownerUserId")) {
    ownerId = body.ownerUserId === null || body.ownerUserId === "" ? null : positiveId(body.ownerUserId);
    const error = validateSalesTarget(ownerId);
    if (error) throw new Error(error);
    ownerChanged = true;
    fields.push("owner_user_id");
  }

  const textFields: Array<[string,string,number]> = [
    ["message","message",10000],["preferred_date","preferredDate",40],["preferred_time","preferredTime",80],["city","city",120],
    ["district","district",120],["state","state",120],["country","country",100],["service_type","serviceType",150],["puja_type","pujaType",250],
  ];
  for (const [column,key,max] of textFields) {
    if (!has(key)) continue;
    updates.push(`${column} = ?`); values.push(nullableText(body[key], max)); fields.push(column);
  }
  if (has("contactPreference")) {
    const pref = text(body.contactPreference,20).toLowerCase();
    if (pref && !["call","whatsapp","email","any"].includes(pref)) throw new Error("Invalid contact preference.");
    updates.push("contact_preference = ?"); values.push(pref || null); fields.push("contact_preference");
  }
  if (has("whatsappConsent")) { updates.push("whatsapp_consent = ?"); values.push(booleanValue(body.whatsappConsent) ? 1 : 0); fields.push("whatsapp_consent"); }
  if (has("marketingConsent")) { updates.push("marketing_consent = ?"); values.push(booleanValue(body.marketingConsent) ? 1 : 0); fields.push("marketing_consent"); }

  return { updates, values, fields, ownerChanged, ownerId };
}

router.patch("/leads/:id", (req,res) => {
  try {
    const user = currentUser(res);
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({ success:false,error:"Invalid lead id." });
    const oldLead = ensureLead(leadId,res);
    if (!oldLead) return;

    const patch = buildLeadPatch(req);
    if (!patch.updates.length && !patch.ownerChanged) return res.status(400).json({ success:false,error:"No supported lead fields were supplied." });

    if (patch.updates.length) {
      patch.updates.push("last_activity_at = CURRENT_TIMESTAMP","updated_at = CURRENT_TIMESTAMP");
      patch.values.push(leadId);
      db.prepare(`UPDATE leads SET ${patch.updates.join(", ")} WHERE id = ?`).run(...patch.values);
    }

    if (patch.ownerChanged) setLeadOwner(leadId,patch.ownerId,user);
    const updated = leadById(leadId);
    recordLeadEvent(leadId,user.id,"updated",text(oldLead.status,30)||null,text(updated?.status,30)||null,`Lead updated by ${user.name}.`,{fields:patch.fields});
    audit(req,"sales.lead_updated","lead",leadId,oldLead,updated);
    return res.json({success:true,lead:updated,updatedFields:patch.fields});
  } catch(error) {
    const message = error instanceof Error ? error.message : "";
    if (["Invalid lead status.","Invalid lead priority.","Invalid lead temperature.","Invalid contact preference.","Selected user must be an active Sales or Super Admin user."].includes(message)) return res.status(400).json({success:false,error:message});
    console.error("Sales lead update error:",error);
    return res.status(500).json({success:false,error:"Unable to update sales lead."});
  }
});

router.post("/leads/:id/assign", (req,res) => {
  try {
    const user = currentUser(res);
    const leadId = positiveId(req.params.id);
    const targetUserId = positiveId(req.body?.userId ?? req.body?.assignedToUserId);
    if (!leadId) return res.status(400).json({success:false,error:"Invalid lead id."});
    const lead = ensureLead(leadId,res);
    if (!lead) return;
    if (!targetUserId) return res.status(400).json({success:false,error:"Sales user id is required."});
    const ownerError = validateSalesTarget(targetUserId);
    if (ownerError) return res.status(400).json({success:false,error:ownerError});

    const existing = db.prepare(`
      SELECT id FROM lead_assignments
      WHERE lead_id = ? AND assignment_type = 'sales' AND assigned_to_user_id = ?
        AND status IN ('assigned','accepted','contacted','follow_up') LIMIT 1
    `).get(leadId,targetUserId) as {id?:number}|undefined;
    if (existing?.id) return res.status(409).json({success:false,error:"This lead is already assigned to that Sales user."});

    const assignmentId = setLeadOwner(leadId,targetUserId,user);
    const assignment = assignmentId ? db.prepare(`
      SELECT la.*, u.name AS assigned_user_name, ab.name AS assigned_by_name
      FROM lead_assignments la LEFT JOIN users u ON u.id = la.assigned_to_user_id LEFT JOIN users ab ON ab.id = la.assigned_by
      WHERE la.id = ? LIMIT 1
    `).get(assignmentId) : null;
    audit(req,"sales.lead_assigned","lead",leadId,lead,{assignment});
    return res.json({success:true,lead:leadDetailRow(leadId),assignment});
  } catch(error) {
    console.error("Sales lead assignment error:",error);
    return res.status(500).json({success:false,error:"Unable to assign sales lead."});
  }
});

router.post("/leads/:id/unassign", (req,res) => {
  try {
    const user = currentUser(res);
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({success:false,error:"Invalid lead id."});
    const lead = ensureLead(leadId,res);
    if (!lead) return;
    setLeadOwner(leadId,null,user);
    const updated = leadDetailRow(leadId);
    audit(req,"sales.lead_unassigned","lead",leadId,lead,updated);
    return res.json({success:true,lead:updated});
  } catch(error) {
    console.error("Sales lead unassign error:",error);
    return res.status(500).json({success:false,error:"Unable to unassign sales lead."});
  }
});

router.patch("/leads/:id/status", (req,res) => {
  try {
    const user = currentUser(res);
    const leadId = positiveId(req.params.id);
    const status = enumValue(req.body?.status,LEAD_STATUSES) as LeadStatus|null;
    if (!leadId) return res.status(400).json({success:false,error:"Invalid lead id."});
    if (!status) return res.status(400).json({success:false,error:"Invalid lead status."});
    const oldLead = ensureLead(leadId,res);
    if (!oldLead) return;

    const assignmentStatus: Record<LeadStatus,string|null> = {
      new:"assigned", qualified:"assigned", assigned:"assigned", contacted:"contacted", follow_up:"follow_up",
      converted:"converted", lost:"closed", closed:"closed", spam:"closed",
    };

    db.transaction(() => {
      db.prepare(`
        UPDATE leads SET status = ?,
          converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at,CURRENT_TIMESTAMP) ELSE converted_at END,
          closed_at = CASE WHEN ? IN ('closed','lost','spam') THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE closed_at END,
          last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(status,status,status,leadId);
      const targetAssignmentStatus = assignmentStatus[status];
      if (targetAssignmentStatus) {
        db.prepare(`
          UPDATE lead_assignments SET status = ?,
            contacted_at = CASE WHEN ? = 'contacted' THEN COALESCE(contacted_at,CURRENT_TIMESTAMP) ELSE contacted_at END,
            converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at,CURRENT_TIMESTAMP) ELSE converted_at END,
            closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE closed_at END,
            updated_at = CURRENT_TIMESTAMP
          WHERE lead_id = ? AND assignment_type = 'sales' AND status NOT IN ('closed','expired','rejected')
        `).run(targetAssignmentStatus,targetAssignmentStatus,targetAssignmentStatus,targetAssignmentStatus,leadId);
      }
      recordLeadEvent(leadId,user.id,"status_changed",text(oldLead.status,30)||null,status,`Status changed by ${user.name}.`,{assignmentStatus:targetAssignmentStatus});
    })();

    const updated = leadById(leadId);
    audit(req,"sales.lead_status_changed","lead",leadId,oldLead,updated);
    return res.json({success:true,lead:updated});
  } catch(error) {
    console.error("Sales lead status error:",error);
    return res.status(500).json({success:false,error:"Unable to update sales lead status."});
  }
});

router.patch("/leads/bulk/status", (req,res) => {
  try {
    const user = currentUser(res);
    const rawIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds : [];
    const ids = [...new Set<number>(rawIds.map((value: unknown) => positiveId(value)).filter((x: number | null): x is number => x !== null))].slice(0,500);
    const status = enumValue(req.body?.status,LEAD_STATUSES) as LeadStatus|null;
    if (!ids.length) return res.status(400).json({success:false,error:"leadIds is required."});
    if (!status) return res.status(400).json({success:false,error:"Invalid lead status."});

    const updatedIds:number[]=[];
    db.transaction(() => {
      for (const leadId of ids) {
        const old = leadById(leadId);
        if (!old) continue;
        db.prepare(`UPDATE leads SET status = ?, converted_at = CASE WHEN ?='converted' THEN COALESCE(converted_at,CURRENT_TIMESTAMP) ELSE converted_at END, closed_at = CASE WHEN ? IN ('closed','lost','spam') THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE closed_at END, last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,status,status,leadId);
        db.prepare(`UPDATE lead_assignments SET status=?, updated_at=CURRENT_TIMESTAMP WHERE lead_id=? AND assignment_type='sales' AND status NOT IN ('closed','expired','rejected')`).run(status === 'converted' ? 'converted' : status === 'lost' || status === 'closed' || status === 'spam' ? 'closed' : status === 'contacted' ? 'contacted' : status === 'follow_up' ? 'follow_up' : 'assigned',leadId);
        recordLeadEvent(leadId,user.id,"status_changed",text(old.status,30)||null,status,`Bulk status change by ${user.name}.`,{bulk:true});
        audit(req,"sales.lead_bulk_status_changed","lead",leadId,old,leadById(leadId));
        updatedIds.push(leadId);
      }
    })();
    return res.json({success:true,updatedLeadIds:updatedIds,count:updatedIds.length});
  } catch(error) {
    console.error("Sales bulk lead status error:",error);
    return res.status(500).json({success:false,error:"Unable to bulk update sales leads."});
  }
});

/* ------------------------------------------------------------------------ */
/* NOTES / ACTIVITIES / FOLLOW-UPS / COMMUNICATIONS                         */
/* ------------------------------------------------------------------------ */

router.post("/leads/:id/notes", (req,res) => {
  try {
    const user = currentUser(res);
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({success:false,error:"Invalid lead id."});
    if (!ensureLead(leadId,res)) return;
    const body = req.body && typeof req.body === "object" ? req.body as Record<string,unknown> : {};
    const note = text(body.note ?? body.message,10000);
    const noteType = text(body.noteType,20).toLowerCase() || "internal";
    if (!note) return res.status(400).json({success:false,error:"Note text is required."});
    if (!["internal","customer","system"].includes(noteType)) return res.status(400).json({success:false,error:"Invalid note type."});
    const result = db.prepare(`INSERT INTO lead_notes (lead_id,user_id,note_type,note,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(leadId,user.id,noteType,note,booleanValue(body.isPinned)?1:0);
    db.prepare(`UPDATE leads SET last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(leadId);
    recordLeadEvent(leadId,user.id,"note_added",null,null,note,{noteType});
    const created = db.prepare(`SELECT * FROM lead_notes WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    audit(req,"sales.lead_note_added","lead",leadId,null,created);
    return res.status(201).json({success:true,note:created});
  } catch(error) {
    console.error("Sales note create error:",error);
    return res.status(500).json({success:false,error:"Unable to add sales lead note."});
  }
});

router.post("/leads/:id/activities", (req,res) => {
  try {
    const user = currentUser(res);
    const leadId = positiveId(req.params.id);
    if (!leadId) return res.status(400).json({success:false,error:"Invalid lead id."});
    const lead = ensureLead(leadId,res);
    if (!lead) return;
    const body = req.body && typeof req.body === "object" ? req.body as Record<string,unknown> : {};
    const activityType = enumValue(body.activityType ?? body.type,ACTIVITY_TYPES) as ActivityType|null;
    if (!activityType) return res.status(400).json({success:false,error:"Invalid activity type."});

    const linkedEntity = [positiveId(body.panditId),positiveId(body.templeId),positiveId(body.ashramId)].filter((x)=>x!==null);
    if (linkedEntity.length > 1) return res.status(400).json({success:false,error:"Activity can reference only one provider entity."});

    const result = db.prepare(`
      INSERT INTO sales_activities (sales_user_id,lead_id,pandit_id,temple_id,ashram_id,activity_type,outcome,notes,next_follow_up_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).run(user.id,leadId,positiveId(body.panditId),positiveId(body.templeId),positiveId(body.ashramId),activityType,nullableText(body.outcome,5000),nullableText(body.notes ?? body.message,10000),nullableText(body.nextFollowUpAt,80));

    const shouldContact = ["call","whatsapp","email","meeting"].includes(activityType);
    const nextStatus = activityType === "follow_up" ? "follow_up" : shouldContact ? "contacted" : null;
    db.prepare(`
      UPDATE leads SET last_activity_at=CURRENT_TIMESTAMP,
        last_contacted_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_contacted_at END,
        status = CASE WHEN ? IS NOT NULL AND status IN ('new','qualified','assigned','contacted') THEN ? ELSE status END,
        updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(shouldContact?1:0,nextStatus,nextStatus,leadId);

    const activity = db.prepare(`SELECT sa.*,u.name AS sales_user_name FROM sales_activities sa INNER JOIN users u ON u.id=sa.sales_user_id WHERE sa.id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    const updatedLead = leadById(leadId);
    recordLeadEvent(leadId,user.id,"sales_activity",text(lead.status,30)||null,text(updatedLead?.status,30)||null,nullableText(body.notes ?? body.message,10000),{activityType,outcome:body.outcome ?? null});
    audit(req,"sales.activity_created","lead",leadId,null,activity);
    return res.status(201).json({success:true,activity,lead:updatedLead});
  } catch(error) {
    console.error("Sales activity create error:",error);
    return res.status(500).json({success:false,error:"Unable to create sales activity."});
  }
});

router.get("/activities", (req,res) => {
  try {
    const user = currentUser(res);
    const {page,limit,offset}=pagination(req);
    const where:string[]=["1=1"]; const params:unknown[]=[];
    if (user.role === "sales") { where.push("sa.sales_user_id = ?"); params.push(user.id); }
    else { const requested = positiveId(req.query.salesUserId); if(requested){where.push("sa.sales_user_id=?");params.push(requested);} }
    const leadId=positiveId(req.query.leadId); if(leadId){where.push("sa.lead_id=?");params.push(leadId);}
    const activityType=enumValue(req.query.activityType,ACTIVITY_TYPES); if(activityType){where.push("sa.activity_type=?");params.push(activityType);}
    const from=text(req.query.from ?? req.query.dateFrom,50); const to=text(req.query.to ?? req.query.dateTo,50);
    if(from){where.push("sa.created_at>=?");params.push(from);} if(to){where.push("sa.created_at<=?");params.push(to);}
    const whereSql=`WHERE ${where.join(" AND ")}`;
    const totalRow=db.prepare(`SELECT COUNT(*) AS count FROM sales_activities sa ${whereSql}`).get(...params) as {count?:number}|undefined;
    const total=Number(totalRow?.count??0);
    const rows=db.prepare(`
      SELECT sa.*,u.name AS sales_user_name,l.lead_number,l.name AS lead_name,l.phone AS lead_phone,l.email AS lead_email,
             pp.display_name AS pandit_name,t.name AS temple_name,a.name AS ashram_name
      FROM sales_activities sa INNER JOIN users u ON u.id=sa.sales_user_id LEFT JOIN leads l ON l.id=sa.lead_id
      LEFT JOIN pandit_profiles pp ON pp.id=sa.pandit_id LEFT JOIN temples t ON t.id=sa.temple_id LEFT JOIN ashrams a ON a.id=sa.ashram_id
      ${whereSql} ORDER BY sa.id DESC LIMIT ? OFFSET ?
    `).all(...params,limit,offset);
    return res.json({success:true,activities:rows,pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error) {
    console.error("Sales activities list error:",error);
    return res.status(500).json({success:false,error:"Unable to load sales activities."});
  }
});

router.get("/followups", (req,res) => {
  try {
    const user=currentUser(res); const {page,limit,offset}=pagination(req);
    const where:string[]=["1=1"]; const params:unknown[]=[];
    if(user.role === "sales") { where.push("lf.assigned_to_user_id=?"); params.push(user.id); }
    else { const assignee=positiveId(req.query.assignedToUserId); if(assignee){where.push("lf.assigned_to_user_id=?");params.push(assignee);} }
    const status=enumValue(req.query.status,FOLLOWUP_STATUSES); if(status){where.push(status === "overdue" ? "lf.status='pending' AND datetime(lf.due_at)<datetime('now','localtime')" : "lf.status=?"); if(status !== "overdue")params.push(status);}
    if(booleanValue(req.query.dueToday)) where.push("date(lf.due_at)=date('now','localtime')");
    if(booleanValue(req.query.overdue)) where.push("lf.status='pending' AND datetime(lf.due_at)<datetime('now','localtime')");
    const leadId=positiveId(req.query.leadId); if(leadId){where.push("lf.lead_id=?");params.push(leadId);}
    const whereSql=`WHERE ${where.join(" AND ")}`;
    const totalRow=db.prepare(`SELECT COUNT(*) AS count FROM lead_followups lf ${whereSql}`).get(...params) as {count?:number}|undefined;
    const total=Number(totalRow?.count??0);
    const rows=db.prepare(`
      SELECT lf.*,assignee.name AS assigned_user_name,l.lead_number,l.name AS lead_name,l.phone AS lead_phone,l.email AS lead_email,
             l.status AS lead_status,l.priority AS lead_priority,l.lead_temperature,
             CASE WHEN lf.status='pending' AND datetime(lf.due_at)<datetime('now','localtime') THEN 'overdue' ELSE lf.status END AS effective_status
      FROM lead_followups lf LEFT JOIN users assignee ON assignee.id=lf.assigned_to_user_id INNER JOIN leads l ON l.id=lf.lead_id
      ${whereSql} ORDER BY CASE WHEN lf.status='pending' AND datetime(lf.due_at)<datetime('now','localtime') THEN 0 WHEN lf.status='pending' THEN 1 ELSE 2 END, lf.due_at ASC, lf.id DESC
      LIMIT ? OFFSET ?
    `).all(...params,limit,offset);
    return res.json({success:true,followups:rows,pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error) {
    console.error("Sales follow-up list error:",error);
    return res.status(500).json({success:false,error:"Unable to load sales follow-ups."});
  }
});

router.post("/leads/:id/followups", (req,res) => {
  try {
    const user=currentUser(res); const leadId=positiveId(req.params.id);
    if(!leadId)return res.status(400).json({success:false,error:"Invalid lead id."});
    if(!ensureLead(leadId,res))return;
    const body=req.body&&typeof req.body==="object"?req.body as Record<string,unknown>:{};
    const dueAt=text(body.dueAt ?? body.followupAt,80);
    const followupType=enumValue(body.followupType ?? body.type ?? "call",FOLLOWUP_TYPES);
    if(!dueAt)return res.status(400).json({success:false,error:"dueAt is required."});
    if(!followupType)return res.status(400).json({success:false,error:"Invalid follow-up type."});
    const assignedTo=positiveId(body.assignedToUserId) ?? user.id;
    const ownerError=validateSalesTarget(assignedTo); if(ownerError)return res.status(400).json({success:false,error:ownerError});

    const result=db.prepare(`INSERT INTO lead_followups (lead_id,assigned_to_user_id,followup_type,due_at,status,subject,notes,created_at,updated_at) VALUES (?,?,?,?, 'pending',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(leadId,assignedTo,followupType,dueAt,nullableText(body.subject,250),nullableText(body.notes ?? body.message,5000));
    db.prepare(`UPDATE leads SET status=CASE WHEN status IN ('new','qualified','assigned','contacted') THEN 'follow_up' ELSE status END,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(leadId);
    const followup=db.prepare(`SELECT lf.*,u.name AS assigned_user_name FROM lead_followups lf LEFT JOIN users u ON u.id=lf.assigned_to_user_id WHERE lf.id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    recordLeadEvent(leadId,user.id,"followup_created",null,text(leadById(leadId)?.status,30)||null,`Follow-up created for ${dueAt}.`,{assignedTo,followupType});
    audit(req,"sales.followup_created","lead_followup",Number(result.lastInsertRowid),null,followup);
    return res.status(201).json({success:true,followup,lead:leadById(leadId)});
  } catch(error) {
    console.error("Sales follow-up create error:",error);
    return res.status(500).json({success:false,error:"Unable to create sales follow-up."});
  }
});

router.patch("/followups/:id", (req,res) => {
  try {
    const user=currentUser(res); const followupId=positiveId(req.params.id);
    if(!followupId)return res.status(400).json({success:false,error:"Invalid follow-up id."});
    const old=db.prepare(`SELECT * FROM lead_followups WHERE id=? LIMIT 1`).get(followupId) as Record<string,unknown>|undefined;
    if(!old)return res.status(404).json({success:false,error:"Follow-up not found."});
    if(user.role === "sales" && Number(old.assigned_to_user_id) !== user.id)return res.status(403).json({success:false,error:"You can update only follow-ups assigned to you."});
    const body=req.body&&typeof req.body==="object"?req.body as Record<string,unknown>:{};
    const updates:string[]=[]; const values:unknown[]=[];
    if(Object.prototype.hasOwnProperty.call(body,"status")){
      const status=enumValue(body.status,FOLLOWUP_STATUSES); if(!status)return res.status(400).json({success:false,error:"Invalid follow-up status."});
      updates.push("status=?");values.push(status);
      if(status === "completed")updates.push("completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP)");
    }
    if(Object.prototype.hasOwnProperty.call(body,"dueAt")){const dueAt=text(body.dueAt,80);if(!dueAt)return res.status(400).json({success:false,error:"dueAt cannot be empty."});updates.push("due_at=?");values.push(dueAt);}
    if(Object.prototype.hasOwnProperty.call(body,"assignedToUserId")){
      const assigned=positiveId(body.assignedToUserId);if(!assigned)return res.status(400).json({success:false,error:"Invalid assigned user id."});
      const ownerError=validateSalesTarget(assigned);if(ownerError)return res.status(400).json({success:false,error:ownerError});
      if(user.role === "sales" && assigned !== user.id)return res.status(403).json({success:false,error:"Sales users cannot reassign a follow-up to another user."});
      updates.push("assigned_to_user_id=?");values.push(assigned);
    }
    if(Object.prototype.hasOwnProperty.call(body,"outcome")){updates.push("outcome=?");values.push(nullableText(body.outcome,5000));}
    if(Object.prototype.hasOwnProperty.call(body,"notes")){updates.push("notes=?");values.push(nullableText(body.notes,5000));}
    if(Object.prototype.hasOwnProperty.call(body,"subject")){updates.push("subject=?");values.push(nullableText(body.subject,250));}
    if(!updates.length)return res.status(400).json({success:false,error:"No supported follow-up fields were supplied."});
    updates.push("updated_at=CURRENT_TIMESTAMP");values.push(followupId);
    db.prepare(`UPDATE lead_followups SET ${updates.join(",")} WHERE id=?`).run(...values);
    const updated=db.prepare(`SELECT * FROM lead_followups WHERE id=? LIMIT 1`).get(followupId) as Record<string,unknown>|undefined;
    const leadId=positiveId(old.lead_id);
    if(leadId){
      if(text(updated?.status,20)==="completed")db.prepare(`UPDATE leads SET status=CASE WHEN status='follow_up' THEN 'contacted' ELSE status END,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(leadId);
      else db.prepare(`UPDATE leads SET last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(leadId);
      recordLeadEvent(leadId,user.id,"followup_updated",null,text(leadById(leadId)?.status,30)||null,`Follow-up #${followupId} updated by ${user.name}.`,{followupId});
    }
    audit(req,"sales.followup_updated","lead_followup",followupId,old,updated);
    return res.json({success:true,followup:updated});
  } catch(error) {
    console.error("Sales follow-up update error:",error);
    return res.status(500).json({success:false,error:"Unable to update sales follow-up."});
  }
});

router.post("/leads/:id/communications", (req,res) => {
  try {
    const user=currentUser(res); const leadId=positiveId(req.params.id);
    if(!leadId)return res.status(400).json({success:false,error:"Invalid lead id."});
    const lead=ensureLead(leadId,res);if(!lead)return;
    const body=req.body&&typeof req.body==="object"?req.body as Record<string,unknown>:{};
    const channel=text(body.channel ?? body.type,20).toLowerCase(); const direction=text(body.direction,20).toLowerCase()||"outbound";
    if(!["phone","whatsapp","email","sms","system"].includes(channel))return res.status(400).json({success:false,error:"Invalid communication channel."});
    if(!["inbound","outbound"].includes(direction))return res.status(400).json({success:false,error:"Invalid communication direction."});
    const message=nullableText(body.message,10000); const subject=nullableText(body.subject,250);
    if(!message&&!subject)return res.status(400).json({success:false,error:"Communication message or subject is required."});
    const result=db.prepare(`
      INSERT INTO lead_communications (lead_id,user_id,channel,direction,subject,message,provider_message_id,provider_status,occurred_at,metadata_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),?,CURRENT_TIMESTAMP)
    `).run(leadId,user.id,channel,direction,subject,message,nullableText(body.providerMessageId,250),nullableText(body.providerStatus,100),nullableText(body.occurredAt,80),jsonText(body.metadata ?? body.meta));
    const externalContact=["phone","whatsapp","email"].includes(channel)&&direction === "outbound";
    db.prepare(`UPDATE leads SET last_contacted_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE last_contacted_at END,last_activity_at=CURRENT_TIMESTAMP,status=CASE WHEN ?=1 AND status IN ('new','qualified','assigned') THEN 'contacted' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(externalContact?1:0,externalContact?1:0,leadId);
    const communication=db.prepare(`SELECT lc.*,u.name AS user_name FROM lead_communications lc LEFT JOIN users u ON u.id=lc.user_id WHERE lc.id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    recordLeadEvent(leadId,user.id,"communication_logged",text(lead.status,30)||null,text(leadById(leadId)?.status,30)||null,message??subject,{channel,direction});
    audit(req,"sales.communication_logged","lead",leadId,null,communication);
    return res.status(201).json({success:true,communication,lead:leadById(leadId)});
  } catch(error) {
    console.error("Sales communication error:",error);
    return res.status(500).json({success:false,error:"Unable to record communication."});
  }
});

/* ------------------------------------------------------------------------ */
/* CUSTOMERS                                                                */
/* ------------------------------------------------------------------------ */

router.get("/customers", (req,res) => {
  try {
    const {page,limit,offset}=pagination(req); const search=text(req.query.search,180); const where:string[]=["l.status='converted'"]; const params:unknown[]=[];
    if(search){const p=`%${search}%`;where.push(`(LOWER(COALESCE(l.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.phone,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.lead_number,'')) LIKE LOWER(?))`);params.push(p,p,p,p);}
    if(userFromRequest(req).role === "sales"){where.push("(l.owner_user_id=? OR l.owner_user_id IS NULL)");params.push(userFromRequest(req).id);}
    const whereSql=`WHERE ${where.join(" AND ")}`; const totalRow=db.prepare(`SELECT COUNT(*) AS count FROM leads l ${whereSql}`).get(...params) as {count?:number}|undefined; const total=Number(totalRow?.count??0);
    const rows=db.prepare(`
      SELECT l.id,l.lead_number,l.name,l.phone,l.email,l.city,l.district,l.state,l.country,${DD_LEAD_TYPE_SQL} AS lead_type,l.service_type,l.puja_type,l.created_at,l.converted_at,l.last_contacted_at,l.owner_user_id,owner.name AS owner_name,
             COUNT(DISTINCT b.id) AS booking_count,COALESCE(SUM(CASE WHEN b.payment_status='paid' THEN COALESCE(b.amount,0) ELSE 0 END),0) AS paid_booking_amount
      FROM leads l LEFT JOIN bookings b ON b.lead_id=l.id LEFT JOIN users owner ON owner.id=l.owner_user_id
      ${whereSql} GROUP BY l.id ORDER BY COALESCE(l.converted_at,l.created_at) DESC,l.id DESC LIMIT ? OFFSET ?
    `).all(...params,limit,offset);
    return res.json({success:true,customers:rows,pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error) {
    console.error("Sales customer list error:",error);
    return res.status(500).json({success:false,error:"Unable to load customers."});
  }
});

/* ------------------------------------------------------------------------ */
/* PLANS + SUBSCRIPTIONS + RENEWALS                                        */
/* ------------------------------------------------------------------------ */

router.get("/plans", (req,res) => {
  try {
    const audience=text(req.query.audience,30).toLowerCase(); const where:string[]=["sp.is_active=1"];const params:unknown[]=[];
    if(["pandit","temple","ashram"].includes(audience)){where.push("sp.audience=?");params.push(audience);}
    const plans=db.prepare(`SELECT sp.*,COUNT(DISTINCT s.id) AS active_subscription_count FROM subscription_plans sp LEFT JOIN (
      SELECT id,plan_id,status FROM pandit_subscriptions UNION ALL SELECT id,plan_id,status FROM temple_subscriptions UNION ALL SELECT id,plan_id,status FROM ashram_subscriptions
    ) s ON s.plan_id=sp.id AND s.status='active' WHERE ${where.join(" AND ")} GROUP BY sp.id ORDER BY sp.audience,sp.sort_order,sp.price_amount,sp.id`).all(...params) as Array<Record<string,unknown>>;

    const priceRows=db.prepare(`
      SELECT spp.*,sp.code AS plan_code,sp.audience,sp.name AS plan_name
      FROM subscription_plan_prices spp INNER JOIN subscription_plans sp ON sp.id=spp.plan_id
      WHERE spp.is_active=1 ${["pandit","temple","ashram"].includes(audience) ? "AND sp.audience=?" : ""}
      ORDER BY sp.audience,sp.sort_order,spp.sort_order,spp.price_amount
    `).all(...(["pandit","temple","ashram"].includes(audience)?[audience]:[])) as Array<Record<string,unknown>>;

    const variantsByPlan=new Map<number,Record<string,unknown>[]>();
    for(const row of priceRows){const id=Number(row.plan_id);const list=variantsByPlan.get(id)??[];list.push(row);variantsByPlan.set(id,list);}
    return res.json({success:true,plans:plans.map((p)=>({...p,features:parseJson(p.plan_features_json)??[],priceVariants:variantsByPlan.get(Number(p.id))??[]}))});
  } catch(error) {
    console.error("Sales plans error:",error);
    return res.status(500).json({success:false,error:"Unable to load subscription plans."});
  }
});


router.get("/subscriptions", (req,res) => {
  try {
    const {page,limit,offset}=pagination(req); const audience=text(req.query.audience,30).toLowerCase(); const status=enumValue(req.query.status,SUBSCRIPTION_STATUSES); const search=text(req.query.search,180);
    const queryBlocks:string[]=[]; const queryParams:unknown[]=[];
    const addPandit=()=>{const w:string[]=["1=1"];if(status){w.push("ps.status=?");queryParams.push(status);}if(search){const p=`%${search}%`;w.push(`(LOWER(COALESCE(pp.display_name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(sp.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(ps.razorpay_subscription_id,'')) LIKE LOWER(?))`);queryParams.push(p,p,p,p,p);}queryBlocks.push(`SELECT ps.id,'pandit' AS audience,ps.pandit_id AS owner_entity_id,ps.plan_id,sp.code AS plan_code,sp.name AS plan_name,sp.price_amount AS catalog_price_amount,ps.price_amount AS subscription_price_amount,ps.currency AS subscription_currency,ps.status,ps.starts_at,ps.expires_at,ps.lead_limit,ps.leads_used,ps.auto_renew,ps.listing_enabled,ps.featured_listing,ps.verification_badge,ps.analytics_access,ps.analytics_level,ps.payment_order_id,ps.payment_id,ps.razorpay_subscription_id,pp.display_name AS entity_name,u.name AS owner_user_name,u.email AS owner_user_email,u.phone AS owner_user_phone,pp.city,pp.district,pp.state,pp.country,NULL AS manager_user_id,NULL AS current_manager_name,NULL AS current_manager_email,ps.created_at,ps.updated_at FROM pandit_subscriptions ps INNER JOIN pandit_profiles pp ON pp.id=ps.pandit_id INNER JOIN users u ON u.id=pp.user_id INNER JOIN subscription_plans sp ON sp.id=ps.plan_id WHERE ${w.slice(0,1).length? w.join(" AND "):"1=1"}`);};
    const addTemple=()=>{const w:string[]=["1=1"];if(status){w.push("ts.status=?");queryParams.push(status);}if(search){const p=`%${search}%`;w.push(`(LOWER(COALESCE(t.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(sp.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(ts.razorpay_subscription_id,'')) LIKE LOWER(?))`);queryParams.push(p,p,p,p,p);}queryBlocks.push(`SELECT ts.id,'temple' AS audience,ts.temple_id AS owner_entity_id,ts.plan_id,sp.code AS plan_code,sp.name AS plan_name,sp.price_amount AS catalog_price_amount,ts.price_amount AS subscription_price_amount,ts.currency AS subscription_currency,ts.status,ts.starts_at,ts.expires_at,ts.lead_limit,ts.leads_used,ts.auto_renew,ts.listing_enabled,ts.featured_listing,ts.verification_badge,ts.analytics_access,ts.analytics_level,ts.payment_order_id,ts.payment_id,ts.razorpay_subscription_id,t.name AS entity_name,bu.name AS owner_user_name,bu.email AS owner_user_email,bu.phone AS owner_user_phone,t.city,t.district,t.state,t.country,ts.manager_user_id,(SELECT cu.name FROM temple_manager_assignments cma INNER JOIN users cu ON cu.id=cma.manager_user_id INNER JOIN roles cr ON cr.id=cu.role_id WHERE cma.temple_id=ts.temple_id AND cma.status='active' AND cu.status='active' AND cr.code='temple_manager' ORDER BY datetime(cma.assigned_at) DESC,cma.id DESC LIMIT 1) AS current_manager_name,(SELECT cu.email FROM temple_manager_assignments cma INNER JOIN users cu ON cu.id=cma.manager_user_id INNER JOIN roles cr ON cr.id=cu.role_id WHERE cma.temple_id=ts.temple_id AND cma.status='active' AND cu.status='active' AND cr.code='temple_manager' ORDER BY datetime(cma.assigned_at) DESC,cma.id DESC LIMIT 1) AS current_manager_email,ts.created_at,ts.updated_at FROM temple_subscriptions ts INNER JOIN temples t ON t.id=ts.temple_id LEFT JOIN users bu ON bu.id=ts.manager_user_id INNER JOIN subscription_plans sp ON sp.id=ts.plan_id WHERE ${w.join(" AND ")}`);};
    const addAshram=()=>{const w:string[]=["1=1"];if(status){w.push("asub.status=?");queryParams.push(status);}if(search){const p=`%${search}%`;w.push(`(LOWER(COALESCE(a.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(sp.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(asub.razorpay_subscription_id,'')) LIKE LOWER(?))`);queryParams.push(p,p,p,p,p);}queryBlocks.push(`SELECT asub.id,'ashram' AS audience,asub.ashram_id AS owner_entity_id,asub.plan_id,sp.code AS plan_code,sp.name AS plan_name,sp.price_amount AS catalog_price_amount,asub.price_amount AS subscription_price_amount,asub.currency AS subscription_currency,asub.status,asub.starts_at,asub.expires_at,asub.lead_limit,asub.leads_used,asub.auto_renew,asub.listing_enabled,asub.featured_listing,asub.verification_badge,asub.analytics_access,asub.analytics_level,asub.payment_order_id,asub.payment_id,asub.razorpay_subscription_id,a.name AS entity_name,bu.name AS owner_user_name,bu.email AS owner_user_email,bu.phone AS owner_user_phone,a.city,a.district,a.state,a.country,asub.manager_user_id,(SELECT cu.name FROM ashram_manager_assignments ama INNER JOIN users cu ON cu.id=ama.manager_user_id INNER JOIN roles cr ON cr.id=cu.role_id WHERE ama.ashram_id=asub.ashram_id AND ama.status='active' AND cu.status='active' AND cr.code='ashram_manager' ORDER BY datetime(ama.assigned_at) DESC,ama.id DESC LIMIT 1) AS current_manager_name,(SELECT cu.email FROM ashram_manager_assignments ama INNER JOIN users cu ON cu.id=ama.manager_user_id INNER JOIN roles cr ON cr.id=cu.role_id WHERE ama.ashram_id=asub.ashram_id AND ama.status='active' AND cu.status='active' AND cr.code='ashram_manager' ORDER BY datetime(ama.assigned_at) DESC,ama.id DESC LIMIT 1) AS current_manager_email,asub.created_at,asub.updated_at FROM ashram_subscriptions asub INNER JOIN ashrams a ON a.id=asub.ashram_id LEFT JOIN users bu ON bu.id=asub.manager_user_id INNER JOIN subscription_plans sp ON sp.id=asub.plan_id WHERE ${w.join(" AND ")}`);};
    if(!audience || audience === "pandit")addPandit(); if(!audience || audience === "temple")addTemple(); if(!audience || audience === "ashram")addAshram();
    const unionSql=`SELECT * FROM (${queryBlocks.join(" UNION ALL ")}) ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, datetime(expires_at) ASC, id DESC LIMIT ? OFFSET ?`;
    const rows=db.prepare(unionSql).all(...queryParams,limit,offset) as Array<Record<string,unknown>>;
    const totalRow=db.prepare(`SELECT COUNT(*) AS count FROM (${queryBlocks.join(" UNION ALL ")})`).get(...queryParams) as {count?:number}|undefined;
    const total=Number(totalRow?.count??0);
    return res.json({success:true,subscriptions:rows.map((row)=>({...row,owner_name:row.current_manager_name ?? subscriptionOwnerName(row.audience as "pandit"|"temple"|"ashram",row),days_to_expiry:daysToExpiry(row.expires_at)})),pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)},filters:{audience:audience||null,status:status||null,search:search||null}});
  } catch(error) {
    console.error("Sales subscriptions error:",error);
    return res.status(500).json({success:false,error:"Unable to load subscription pipeline."});
  }
});

router.get("/renewals", (req,res) => {
  try {
    const days=integerInRange(req.query.days,30,1,3650); const audience=text(req.query.audience,30).toLowerCase(); const rows:Array<Record<string,unknown>>=[];
    const windowParams=[`+${days} day`];
    if(!audience || audience === "pandit")rows.push(...db.prepare(`SELECT ps.id,'pandit' AS audience,ps.pandit_id AS entity_id,ps.plan_id,sp.code AS plan_code,sp.name AS plan_name,sp.price_amount AS catalog_price_amount,ps.price_amount AS subscription_price_amount,ps.currency,ps.status,ps.starts_at,ps.expires_at,ps.lead_limit,ps.leads_used,pp.display_name AS entity_name,u.name AS contact_name,u.email AS contact_email,u.phone AS contact_phone,pp.city,pp.district,pp.state,pp.country,NULL AS current_manager_name,NULL AS current_manager_email FROM pandit_subscriptions ps INNER JOIN pandit_profiles pp ON pp.id=ps.pandit_id INNER JOIN users u ON u.id=pp.user_id INNER JOIN subscription_plans sp ON sp.id=ps.plan_id WHERE ps.status='active' AND ps.expires_at IS NOT NULL AND datetime(ps.expires_at)<=datetime('now',?) ORDER BY datetime(ps.expires_at),ps.id`).all(...windowParams) as Array<Record<string,unknown>>);
    if(!audience || audience === "temple")rows.push(...db.prepare(`SELECT ts.id,'temple' AS audience,ts.temple_id AS entity_id,ts.plan_id,sp.code AS plan_code,sp.name AS plan_name,sp.price_amount AS catalog_price_amount,ts.price_amount AS subscription_price_amount,ts.currency,ts.status,ts.starts_at,ts.expires_at,ts.lead_limit,ts.leads_used,t.name AS entity_name,COALESCE(cm.name,bu.name) AS contact_name,COALESCE(cm.email,bu.email) AS contact_email,COALESCE(cm.phone,bu.phone) AS contact_phone,t.city,t.district,t.state,t.country,cm.name AS current_manager_name,cm.email AS current_manager_email FROM temple_subscriptions ts INNER JOIN temples t ON t.id=ts.temple_id LEFT JOIN users bu ON bu.id=ts.manager_user_id LEFT JOIN (SELECT cma.temple_id,u.name,u.email,u.phone,ROW_NUMBER() OVER (PARTITION BY cma.temple_id ORDER BY datetime(cma.assigned_at) DESC,cma.id DESC) AS rn FROM temple_manager_assignments cma INNER JOIN users u ON u.id=cma.manager_user_id INNER JOIN roles r ON r.id=u.role_id WHERE cma.status='active' AND u.status='active' AND r.code='temple_manager') cm ON cm.temple_id=ts.temple_id AND cm.rn=1 INNER JOIN subscription_plans sp ON sp.id=ts.plan_id WHERE ts.status='active' AND ts.expires_at IS NOT NULL AND datetime(ts.expires_at)<=datetime('now',?) ORDER BY datetime(ts.expires_at),ts.id`).all(...windowParams) as Array<Record<string,unknown>>);
    if(!audience || audience === "ashram")rows.push(...db.prepare(`SELECT asub.id,'ashram' AS audience,asub.ashram_id AS entity_id,asub.plan_id,sp.code AS plan_code,sp.name AS plan_name,sp.price_amount AS catalog_price_amount,asub.price_amount AS subscription_price_amount,asub.currency,asub.status,asub.starts_at,asub.expires_at,asub.lead_limit,asub.leads_used,a.name AS entity_name,COALESCE(cm.name,bu.name) AS contact_name,COALESCE(cm.email,bu.email) AS contact_email,COALESCE(cm.phone,bu.phone) AS contact_phone,a.city,a.district,a.state,a.country,cm.name AS current_manager_name,cm.email AS current_manager_email FROM ashram_subscriptions asub INNER JOIN ashrams a ON a.id=asub.ashram_id LEFT JOIN users bu ON bu.id=asub.manager_user_id LEFT JOIN (SELECT ama.ashram_id,u.name,u.email,u.phone,ROW_NUMBER() OVER (PARTITION BY ama.ashram_id ORDER BY datetime(ama.assigned_at) DESC,ama.id DESC) AS rn FROM ashram_manager_assignments ama INNER JOIN users u ON u.id=ama.manager_user_id INNER JOIN roles r ON r.id=u.role_id WHERE ama.status='active' AND u.status='active' AND r.code='ashram_manager') cm ON cm.ashram_id=asub.ashram_id AND cm.rn=1 INNER JOIN subscription_plans sp ON sp.id=asub.plan_id WHERE asub.status='active' AND asub.expires_at IS NOT NULL AND datetime(asub.expires_at)<=datetime('now',?) ORDER BY datetime(asub.expires_at),asub.id`).all(...windowParams) as Array<Record<string,unknown>>);
    rows.sort((a,b)=>new Date(String(a.expires_at??"9999-12-31")).getTime()-new Date(String(b.expires_at??"9999-12-31")).getTime());
    return res.json({success:true,days,renewals:rows.map((row)=>({...row,days_to_expiry:daysToExpiry(row.expires_at)}))});
  } catch(error) {
    console.error("Sales renewal pipeline error:",error);
    return res.status(500).json({success:false,error:"Unable to load renewal pipeline."});
  }
});

/* ------------------------------------------------------------------------ */
/* PAYMENTS / PAYMENT ORDERS — READ ONLY                                   */
/* ------------------------------------------------------------------------ */

router.get("/payments", (req,res) => {
  try {
    const {page,limit,offset}=pagination(req); const status=text(req.query.status,40).toLowerCase(); const purpose=text(req.query.purpose,30).toLowerCase(); const search=text(req.query.search,180);
    const where:string[]=["1=1"]; const params:unknown[]=[];
    if(status){where.push("p.status=?");params.push(status);} if(purpose){where.push("p.purpose=?");params.push(purpose);}
    if(search){const p=`%${search}%`;where.push(`(LOWER(COALESCE(p.payment_number,'')) LIKE LOWER(?) OR LOWER(COALESCE(p.provider_order_id,'')) LIKE LOWER(?) OR LOWER(COALESCE(p.provider_payment_id,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?))`);params.push(p,p,p,p,p);}
    const from=text(req.query.from ?? req.query.dateFrom,50);const to=text(req.query.to ?? req.query.dateTo,50);if(from){where.push("p.created_at>=?");params.push(from);}if(to){where.push("p.created_at<=?");params.push(to);}
    const whereSql=`WHERE ${where.join(" AND ")}`;
    const totalRow=db.prepare(`SELECT COUNT(*) AS count FROM payments p LEFT JOIN users u ON u.id=p.user_id ${whereSql}`).get(...params) as {count?:number}|undefined; const total=Number(totalRow?.count??0);
    const rows=db.prepare(`
      SELECT p.id,p.payment_number,p.user_id,p.pandit_id,p.temple_id,p.ashram_id,p.pandit_subscription_id,p.temple_subscription_id,p.ashram_subscription_id,
             p.subscription_id,p.plan_id,p.booking_id,p.payment_order_id,p.purpose,p.entity_type,p.entity_id,p.amount,p.amount_paise,p.currency,p.provider,
             p.provider_order_id,p.provider_payment_id,p.status,p.payment_method,p.paid_at,p.failed_at,p.failure_reason,p.refund_amount_paise,p.refunded_at,p.receipt,p.created_at,p.updated_at,
             u.name AS payer_name,u.email AS payer_email,u.phone AS payer_phone,pp.display_name AS pandit_name,t.name AS temple_name,a.name AS ashram_name,
             sp.name AS plan_name,b.booking_number,b.title AS booking_title
      FROM payments p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN pandit_profiles pp ON pp.id=p.pandit_id LEFT JOIN temples t ON t.id=p.temple_id LEFT JOIN ashrams a ON a.id=p.ashram_id
      LEFT JOIN subscription_plans sp ON sp.id=p.plan_id LEFT JOIN bookings b ON b.id=p.booking_id
      ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?
    `).all(...params,limit,offset) as Array<Record<string,unknown>>;
    const totals=db.prepare(`SELECT COUNT(*) AS total_count,COALESCE(SUM(CASE WHEN p.status IN ('paid','captured','partially_refunded','refunded') THEN COALESCE(p.amount_paise,ROUND(p.amount*100)) ELSE 0 END),0)/100.0 AS gross_paid_amount,COALESCE(SUM(COALESCE(p.refund_amount_paise,0)),0)/100.0 AS refunded_amount,COALESCE(SUM(CASE WHEN p.status IN ('paid','captured','partially_refunded','refunded') THEN COALESCE(p.amount_paise,ROUND(p.amount*100)) ELSE 0 END),0)/100.0 - COALESCE(SUM(COALESCE(p.refund_amount_paise,0)),0)/100.0 AS net_paid_amount,COALESCE(SUM(CASE WHEN p.status IN ('created','pending','authorized') THEN COALESCE(p.amount,0) ELSE 0 END),0) AS open_amount,COALESCE(SUM(CASE WHEN p.status IN ('failed','cancelled') THEN COALESCE(p.amount,0) ELSE 0 END),0) AS failed_amount FROM payments p LEFT JOIN users u ON u.id=p.user_id ${whereSql}`).get(...params);
    return res.json({success:true,payments:rows,totals,pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error) {
    console.error("Sales payments error:",error);
    return res.status(500).json({success:false,error:"Unable to load payment records."});
  }
});

router.get("/payments/:id", (req,res) => {
  try {
    const paymentId=positiveId(req.params.id); if(!paymentId)return res.status(400).json({success:false,error:"Invalid payment id."});
    const payment=db.prepare(`
      SELECT p.id,p.payment_number,p.user_id,p.pandit_id,p.temple_id,p.ashram_id,p.pandit_subscription_id,p.temple_subscription_id,p.ashram_subscription_id,
             p.subscription_id,p.plan_id,p.booking_id,p.payment_order_id,p.purpose,p.entity_type,p.entity_id,p.amount,p.amount_paise,p.currency,p.provider,
             p.provider_order_id,p.provider_payment_id,p.status,p.payment_method,p.paid_at,p.failed_at,p.failure_reason,p.refund_amount_paise,p.refunded_at,p.receipt,p.created_at,p.updated_at,
             u.name AS payer_name,u.email AS payer_email,u.phone AS payer_phone,sp.name AS plan_name
      FROM payments p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN subscription_plans sp ON sp.id=p.plan_id WHERE p.id=? LIMIT 1
    `).get(paymentId) as Record<string,unknown>|undefined;
    if(!payment)return res.status(404).json({success:false,error:"Payment not found."});
    return res.json({success:true,payment});
  } catch(error) {
    console.error("Sales payment detail error:",error);
    return res.status(500).json({success:false,error:"Unable to load payment details."});
  }
});

router.get("/payment-orders", (req,res) => {
  try {
    const {page,limit,offset}=pagination(req); const status=text(req.query.status,30).toLowerCase(); const purpose=text(req.query.purpose,30).toLowerCase(); const search=text(req.query.search,180); const where:string[]=["1=1"]; const params:unknown[]=[];
    if(status){where.push("po.status=?");params.push(status);}if(purpose){where.push("po.purpose=?");params.push(purpose);}if(search){const p=`%${search}%`;where.push(`(LOWER(COALESCE(po.order_number,'')) LIKE LOWER(?) OR LOWER(COALESCE(po.provider_order_id,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?))`);params.push(p,p,p,p);}
    const whereSql=`WHERE ${where.join(" AND ")}`; const totalRow=db.prepare(`SELECT COUNT(*) AS count FROM payment_orders po LEFT JOIN users u ON u.id=po.user_id ${whereSql}`).get(...params) as {count?:number}|undefined;const total=Number(totalRow?.count??0);
    const rows=db.prepare(`SELECT po.id,po.order_number,po.user_id,po.plan_id,po.pandit_subscription_id,po.temple_subscription_id,po.ashram_subscription_id,po.booking_id,po.purpose,po.amount,po.amount_paise,po.currency,po.provider,po.provider_order_id,po.status,po.receipt,po.expires_at,po.created_at,po.updated_at,u.name AS user_name,u.email AS user_email,u.phone AS user_phone,sp.name AS plan_name,b.booking_number,b.title AS booking_title FROM payment_orders po LEFT JOIN users u ON u.id=po.user_id LEFT JOIN subscription_plans sp ON sp.id=po.plan_id LEFT JOIN bookings b ON b.id=po.booking_id ${whereSql} ORDER BY po.id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset);
    return res.json({success:true,paymentOrders:rows,pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error) {
    console.error("Sales payment orders error:",error);
    return res.status(500).json({success:false,error:"Unable to load payment orders."});
  }
});

router.get("/payment-orders/:id", (req,res) => {
  try {
    const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid payment order id."});
    const row=db.prepare(`SELECT po.id,po.order_number,po.user_id,po.plan_id,po.pandit_subscription_id,po.temple_subscription_id,po.ashram_subscription_id,po.booking_id,po.purpose,po.amount,po.amount_paise,po.currency,po.provider,po.provider_order_id,po.status,po.receipt,po.expires_at,po.created_at,po.updated_at,u.name AS user_name,u.email AS user_email,u.phone AS user_phone,sp.name AS plan_name FROM payment_orders po LEFT JOIN users u ON u.id=po.user_id LEFT JOIN subscription_plans sp ON sp.id=po.plan_id WHERE po.id=? LIMIT 1`).get(id) as Record<string,unknown>|undefined;
    if(!row)return res.status(404).json({success:false,error:"Payment order not found."});
    return res.json({success:true,paymentOrder:row});
  } catch(error) {
    console.error("Sales payment order detail error:",error);
    return res.status(500).json({success:false,error:"Unable to load payment order details."});
  }
});

/* ------------------------------------------------------------------------ */
/* BOOKINGS — OPERATIONAL STATUS ONLY                                      */
/* ------------------------------------------------------------------------ */

router.get("/bookings", (req,res) => {
  try {
    const {page,limit,offset}=pagination(req); const status=text(req.query.status,30).toLowerCase(); const paymentStatus=text(req.query.paymentStatus,30).toLowerCase(); const kind=text(req.query.kind,100).toLowerCase(); const search=text(req.query.search,180); const where:string[]=["1=1"];const params:unknown[]=[];
    if(status){where.push("b.status=?");params.push(status);}if(paymentStatus){where.push("b.payment_status=?");params.push(paymentStatus);}if(kind){where.push("LOWER(b.kind)=LOWER(?)");params.push(kind);}if(search){const p=`%${search}%`;where.push(`(LOWER(COALESCE(b.booking_number,'')) LIKE LOWER(?) OR LOWER(COALESCE(b.title,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?))`);params.push(p,p,p,p);}
    const whereSql=`WHERE ${where.join(" AND ")}`;const totalRow=db.prepare(`SELECT COUNT(*) AS count FROM bookings b LEFT JOIN users u ON u.id=b.user_id ${whereSql}`).get(...params) as {count?:number}|undefined;const total=Number(totalRow?.count??0);
    const rows=db.prepare(`SELECT b.*,u.name AS customer_name,u.email AS customer_email,u.phone AS customer_phone,l.lead_number,pp.display_name AS pandit_name,t.name AS temple_name,a.name AS ashram_name,ps.name AS puja_service_name,yp.name AS yatra_package_name,c.title AS course_name,e.title AS event_name FROM bookings b LEFT JOIN users u ON u.id=b.user_id LEFT JOIN leads l ON l.id=b.lead_id LEFT JOIN pandit_profiles pp ON pp.id=b.pandit_id LEFT JOIN temples t ON t.id=b.temple_id LEFT JOIN ashrams a ON a.id=b.ashram_id LEFT JOIN puja_services ps ON ps.id=b.puja_id LEFT JOIN yatra_packages yp ON yp.id=b.package_id LEFT JOIN courses c ON c.id=b.course_id LEFT JOIN events e ON e.id=b.event_id ${whereSql} ORDER BY b.id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset);
    return res.json({success:true,bookings:rows,pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error) {
    console.error("Sales booking list error:",error);
    return res.status(500).json({success:false,error:"Unable to load bookings."});
  }
});

router.get("/bookings/:id", (req,res) => {
  try {
    const bookingId=positiveId(req.params.id);if(!bookingId)return res.status(400).json({success:false,error:"Invalid booking id."});
    const booking=db.prepare(`SELECT b.*,u.name AS customer_name,u.email AS customer_email,u.phone AS customer_phone,l.lead_number,l.name AS lead_name,pp.display_name AS pandit_name,t.name AS temple_name,a.name AS ashram_name,ps.name AS puja_service_name,yp.name AS yatra_package_name,c.title AS course_name,e.title AS event_name FROM bookings b LEFT JOIN users u ON u.id=b.user_id LEFT JOIN leads l ON l.id=b.lead_id LEFT JOIN pandit_profiles pp ON pp.id=b.pandit_id LEFT JOIN temples t ON t.id=b.temple_id LEFT JOIN ashrams a ON a.id=b.ashram_id LEFT JOIN puja_services ps ON ps.id=b.puja_id LEFT JOIN yatra_packages yp ON yp.id=b.package_id LEFT JOIN courses c ON c.id=b.course_id LEFT JOIN events e ON e.id=b.event_id WHERE b.id=? LIMIT 1`).get(bookingId) as Record<string,unknown>|undefined;
    if(!booking)return res.status(404).json({success:false,error:"Booking not found."});
    const payments=db.prepare(`SELECT p.id,p.payment_number,p.purpose,p.amount,p.amount_paise,p.currency,p.provider,p.provider_order_id,p.provider_payment_id,p.status,p.payment_method,p.paid_at,p.failed_at,p.failure_reason,p.refund_amount_paise,p.refunded_at,p.receipt,p.created_at FROM payments p WHERE p.booking_id=? ORDER BY p.id DESC`).all(bookingId);
    const paymentOrders=db.prepare(`SELECT po.id,po.order_number,po.purpose,po.amount,po.amount_paise,po.currency,po.provider,po.provider_order_id,po.status,po.receipt,po.expires_at,po.created_at,po.updated_at FROM payment_orders po WHERE po.booking_id=? ORDER BY po.id DESC`).all(bookingId);
    return res.json({success:true,booking,payments,paymentOrders});
  } catch(error) {
    console.error("Sales booking detail error:",error);
    return res.status(500).json({success:false,error:"Unable to load booking details."});
  }
});

router.patch("/bookings/:id/status", (req,res) => {
  try {
    const user=currentUser(res); const bookingId=positiveId(req.params.id); const status=enumValue(req.body?.status,BOOKING_STATUSES);
    if(!bookingId)return res.status(400).json({success:false,error:"Invalid booking id."}); if(!status)return res.status(400).json({success:false,error:"Invalid booking status."});
    const oldBooking=db.prepare(`SELECT * FROM bookings WHERE id=? LIMIT 1`).get(bookingId) as Record<string,unknown>|undefined; if(!oldBooking)return res.status(404).json({success:false,error:"Booking not found."});
    db.prepare(`UPDATE bookings SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,bookingId);
    const updated=db.prepare(`SELECT * FROM bookings WHERE id=? LIMIT 1`).get(bookingId);
    if(oldBooking.lead_id)recordLeadEvent(Number(oldBooking.lead_id),user.id,"booking_status_changed",null,null,`Booking #${text(oldBooking.booking_number,100)} changed to ${status}.`,{bookingId,status});
    audit(req,"sales.booking_status_changed","booking",bookingId,oldBooking,updated);
    return res.json({success:true,booking:updated});
  } catch(error) {
    console.error("Sales booking status error:",error);
    return res.status(500).json({success:false,error:"Unable to update booking status."});
  }
});

/* ------------------------------------------------------------------------ */
/* TEAM / PIPELINE / SEARCH / HEALTH                                        */
/* ------------------------------------------------------------------------ */

router.get("/team", (_req,res) => {
  try {
    const rows=db.prepare(`
      SELECT u.id,u.name,u.email,u.phone,u.status,u.last_login_at,u.created_at,
        (SELECT COUNT(*) FROM leads l WHERE l.owner_user_id=u.id) AS owned_leads,
        (SELECT COUNT(*) FROM leads l WHERE l.owner_user_id=u.id AND l.status IN ('new','qualified','assigned','contacted','follow_up')) AS open_leads,
        (SELECT COUNT(*) FROM leads l WHERE l.owner_user_id=u.id AND l.status='converted') AS converted_leads,
        (SELECT COUNT(*) FROM sales_activities sa WHERE sa.sales_user_id=u.id) AS activity_count,
        (SELECT COUNT(*) FROM lead_followups lf WHERE lf.assigned_to_user_id=u.id AND lf.status='pending') AS pending_followups
      FROM users u INNER JOIN roles r ON r.id=u.role_id WHERE r.code='sales' ORDER BY open_leads DESC,u.name ASC
    `).all();
    return res.json({success:true,team:rows});
  } catch(error) {
    console.error("Sales team error:",error);
    return res.status(500).json({success:false,error:"Unable to load sales team."});
  }
});

router.get("/pipeline", (req,res) => {
  try {
    const user=currentUser(res); const owner=text(req.query.owner,20).toLowerCase(); const where:string[]=["1=1"];const params:unknown[]=[];
    if(owner === "mine"){where.push("l.owner_user_id=?");params.push(user.id);}else if(owner === "unassigned"){where.push("l.owner_user_id IS NULL");}
    if(user.role === "sales" && owner !== "unassigned" && owner !== "mine"){where.push("(l.owner_user_id=? OR l.owner_user_id IS NULL)");params.push(user.id);}
    const whereSql=`WHERE ${where.join(" AND ")}`;
    const statuses=db.prepare(`SELECT l.status,COUNT(*) AS count,COALESCE(SUM(CASE WHEN l.priority IN ('high','urgent') THEN 1 ELSE 0 END),0) AS high_priority_count,COALESCE(SUM(CASE WHEN l.lead_temperature='hot' THEN 1 ELSE 0 END),0) AS hot_count,COALESCE(SUM(CASE WHEN l.lead_score>0 THEN l.lead_score ELSE 0 END),0) AS score_total FROM leads l ${whereSql} GROUP BY l.status ORDER BY count DESC`).all(...params);
    const funnel=db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('qualified','assigned','contacted','follow_up','converted') THEN 1 ELSE 0 END) AS qualified_or_more,SUM(CASE WHEN status IN ('assigned','contacted','follow_up','converted') THEN 1 ELSE 0 END) AS assigned_or_more,SUM(CASE WHEN status IN ('contacted','follow_up','converted') THEN 1 ELSE 0 END) AS contacted_or_more,SUM(CASE WHEN status IN ('follow_up','converted') THEN 1 ELSE 0 END) AS follow_up_or_more,SUM(CASE WHEN status='converted' THEN 1 ELSE 0 END) AS converted FROM leads l ${whereSql}`).get(...params);
    return res.json({success:true,scope:owner||"all",statuses,funnel});
  } catch(error) {
    console.error("Sales pipeline error:",error);
    return res.status(500).json({success:false,error:"Unable to load sales pipeline."});
  }
});

router.get("/search", (req,res) => {
  try {
    const user=currentUser(res); const query=text(req.query.q ?? req.query.search,180);
    if(query.length<2)return res.json({success:true,query,leads:[],bookings:[],payments:[],subscriptions:[]});
    const p=`%${query}%`;
    const salesScope=user.role === "sales" ? "AND (l.owner_user_id=? OR l.owner_user_id IS NULL)" : "";
    const scopeParams=user.role === "sales" ? [user.id] : [];
    const leads=db.prepare(`SELECT l.id,l.lead_number,${DD_LEAD_TYPE_SQL} AS lead_type,l.name,l.phone,l.email,l.status,l.priority,l.lead_temperature,l.city,l.state FROM leads l WHERE (LOWER(COALESCE(l.lead_number,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.phone,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.email,'')) LIKE LOWER(?)) ${salesScope} ORDER BY l.id DESC LIMIT 20`).all(p,p,p,p,...scopeParams);
    const bookings=db.prepare(`SELECT b.id,b.booking_number,b.title,b.status,b.payment_status,b.amount,u.name AS customer_name,u.email AS customer_email FROM bookings b LEFT JOIN users u ON u.id=b.user_id WHERE LOWER(COALESCE(b.booking_number,'')) LIKE LOWER(?) OR LOWER(COALESCE(b.title,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?) ORDER BY b.id DESC LIMIT 20`).all(p,p,p,p);
    const payments=db.prepare(`SELECT p.id,p.payment_number,p.provider_order_id,p.provider_payment_id,p.amount,p.currency,p.status,p.purpose,p.created_at,u.name AS payer_name,u.email AS payer_email FROM payments p LEFT JOIN users u ON u.id=p.user_id WHERE LOWER(COALESCE(p.payment_number,'')) LIKE LOWER(?) OR LOWER(COALESCE(p.provider_order_id,'')) LIKE LOWER(?) OR LOWER(COALESCE(p.provider_payment_id,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?) ORDER BY p.id DESC LIMIT 20`).all(p,p,p,p,p);
    const subscriptions=db.prepare(`
      SELECT * FROM (
        SELECT ps.id,'pandit' AS audience,pp.display_name AS entity_name,u.name AS contact_name,u.email AS contact_email,ps.status,ps.expires_at,sp.name AS plan_name
        FROM pandit_subscriptions ps INNER JOIN pandit_profiles pp ON pp.id=ps.pandit_id INNER JOIN users u ON u.id=pp.user_id INNER JOIN subscription_plans sp ON sp.id=ps.plan_id
        WHERE LOWER(COALESCE(pp.display_name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(sp.name,'')) LIKE LOWER(?)
        UNION ALL
        SELECT ts.id,'temple' AS audience,t.name AS entity_name,COALESCE(cm.name,bu.name) AS contact_name,COALESCE(cm.email,bu.email) AS contact_email,ts.status,ts.expires_at,sp.name AS plan_name
        FROM temple_subscriptions ts INNER JOIN temples t ON t.id=ts.temple_id LEFT JOIN users bu ON bu.id=ts.manager_user_id LEFT JOIN (SELECT cma.temple_id,u.name,u.email,ROW_NUMBER() OVER (PARTITION BY cma.temple_id ORDER BY datetime(cma.assigned_at) DESC,cma.id DESC) AS rn FROM temple_manager_assignments cma INNER JOIN users u ON u.id=cma.manager_user_id WHERE cma.status='active' AND u.status='active') cm ON cm.temple_id=ts.temple_id AND cm.rn=1 INNER JOIN subscription_plans sp ON sp.id=ts.plan_id
        WHERE LOWER(COALESCE(t.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(sp.name,'')) LIKE LOWER(?)
        UNION ALL
        SELECT asub.id,'ashram' AS audience,a.name AS entity_name,COALESCE(cm.name,bu.name) AS contact_name,COALESCE(cm.email,bu.email) AS contact_email,asub.status,asub.expires_at,sp.name AS plan_name
        FROM ashram_subscriptions asub INNER JOIN ashrams a ON a.id=asub.ashram_id LEFT JOIN users bu ON bu.id=asub.manager_user_id LEFT JOIN (SELECT ama.ashram_id,u.name,u.email,ROW_NUMBER() OVER (PARTITION BY ama.ashram_id ORDER BY datetime(ama.assigned_at) DESC,ama.id DESC) AS rn FROM ashram_manager_assignments ama INNER JOIN users u ON u.id=ama.manager_user_id WHERE ama.status='active' AND u.status='active') cm ON cm.ashram_id=asub.ashram_id AND cm.rn=1 INNER JOIN subscription_plans sp ON sp.id=asub.plan_id
        WHERE LOWER(COALESCE(a.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(bu.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(sp.name,'')) LIKE LOWER(?)
      ) ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,expires_at ASC LIMIT 30
    `).all(p,p,p,p,p,p,p,p,p,p,p,p);
    return res.json({success:true,query,leads,bookings,payments,subscriptions});
  } catch(error) {
    console.error("Sales search error:",error);
    return res.status(500).json({success:false,error:"Unable to search CRM records."});
  }
});

router.get("/health", (_req,res) => {
  try {
    const leadCount=db.prepare(`SELECT COUNT(*) AS count FROM leads`).get() as {count?:number}|undefined;
    const salesCount=db.prepare(`SELECT COUNT(*) AS count FROM users u INNER JOIN roles r ON r.id=u.role_id WHERE r.code='sales'`).get() as {count?:number}|undefined;
    res.json({success:true,service:"sales",status:"healthy",database:true,leadCount:Number(leadCount?.count??0),salesUserCount:Number(salesCount?.count??0),timestamp:nowIso()});
  } catch(error) {
    console.error("Sales health error:",error);
    res.status(500).json({success:false,service:"sales",status:"unhealthy",database:false});
  }
});

export { router as salesRouter };
export default router;
