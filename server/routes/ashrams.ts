import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  optionalAuth,
  requireAuth,
  requireAnyPermission,
  requirePermission,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Ashram API — FINAL ROLE-ALIGNED VERSION
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
| Ashram ownership / authorization source of truth:
|   ashram_manager_assignments
|
| Subscription source of truth:
|   ashram_subscriptions
|
| Commercial plans:
|   ashram_basic    ₹499/month   | 15 leads | 3 programs/courses | 15 gallery | 2 videos
|   ashram_premium  ₹1499/month  | 75 leads | 15 programs/courses | 50 gallery | 10 videos
|
| Public visibility:
|   status = 'published' AND listing_active = 1
|
| Important separation of responsibility:
|   - Super Admin creates/moderates/archives Ashram records.
|   - Super Admin assigns/revokes Ashram Managers through the assignment model.
|   - Ashram Manager can manage only actively assigned Ashrams.
|   - Sales can view Ashrams and assist onboarding, but cannot impersonate or
|     become the Ashram Manager through this route.
|   - Subscription purchase/lifecycle/payment belongs to subscriptions.ts and
|     payments.ts. This route exposes entitlements/history only.
|   - Analytics belongs to analytics.ts.
|--------------------------------------------------------------------------
*/

const router = Router();

type Row = Record<string, unknown>;

type LocationContext = {
  locationId: number | null;
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  countryLocationId: number | null;
  stateLocationId: number | null;
  districtLocationId: number | null;
  cityLocationId: number | null;
};

type SubscriptionRow = Row & {
  id: number;
  ashram_id: number;
  plan_id: number;
  status: string;
  manager_user_id?: number | null;
  subscription_plan_price_id?: number | null;
  billing_interval?: string | null;
  duration_days?: number | null;
  plan_code?: string | null;
  plan_name?: string | null;
  plan_description?: string | null;
  plan_price_amount?: number | null;
  plan_currency?: string | null;
  plan_billing_interval?: string | null;
  plan_duration_days?: number | null;
  plan_analytics_level?: string | null;
  plan_features_json?: string | null;
  price_amount?: number | null;
  currency?: string | null;
  lead_limit?: number | null;
  leads_used?: number | null;
  program_limit?: number | null;
  gallery_limit?: number | null;
  video_limit?: number | null;
  listing_enabled?: number | null;
  featured_listing?: number | null;
  priority_support?: number | null;
  verification_badge?: number | null;
  analytics_access?: number | null;
  homepage_promotion?: number | null;
  live_aarti_enabled?: number | null;
  enhanced_seo?: number | null;
  enhanced_profile?: number | null;
  whatsapp_enquiry?: number | null;
  search_visibility?: string | null;
  analytics_level?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
};

type AssignmentRow = Row & {
  id: number;
  ashram_id: number;
  manager_user_id: number;
  assigned_by?: number | null;
  status: "active" | "inactive" | "revoked";
  assigned_at: string;
  revoked_at?: string | null;
};

const PUBLIC_STATUS = "published" as const;
const EDITABLE_STATUS = ["draft", "published", "unpublished"] as const;
const MAX_LIST_LIMIT = 100;
const MAX_DETAIL_TEXT = 50_000;

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function currentUser(res: Response): AuthenticatedUser | null {
  return (res.locals.user as AuthenticatedUser | undefined) ?? null;
}

function text(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function nullableText(value: unknown, max = 500): string | null {
  const result = text(value, max);
  return result || null;
}

function positiveId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function integerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  if (integer < min || integer > max) return fallback;
  return integer;
}

function numberInRange(
  value: unknown,
  fallback: number | null,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = text(value, 20).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function jsonString(value: unknown, fallback = "{}"): string {
  try {
    const result = JSON.stringify(value ?? {});
    return result || fallback;
  } catch {
    return fallback;
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonArray(value: unknown): unknown[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function normalizeJsonObject(
  value: unknown,
  maxKeys = 100,
  maxValueLength = 5000,
): string {
  let parsed: unknown = value;

  if (typeof value === "string") {
    parsed = parseJson(value);
    if (parsed === null) return "{}";
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "{}";

  const source = parsed as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  let count = 0;

  for (const [rawKey, item] of Object.entries(source)) {
    if (count >= maxKeys) break;

    const key = rawKey.trim().slice(0, 120);
    if (!key) continue;

    if (typeof item === "string") {
      result[key] = item.slice(0, maxValueLength);
    } else if (
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      result[key] = item;
    } else if (Array.isArray(item) || typeof item === "object") {
      result[key] = item;
    }

    count += 1;
  }

  return JSON.stringify(result);
}

function normalizeJsonArray(
  value: unknown,
  maxItems: number,
  maxItemLength = 4000,
): string {
  let parsed: unknown = value;

  if (typeof value === "string") {
    parsed = parseJson(value);
    if (parsed === null) return "[]";
  }

  if (!Array.isArray(parsed)) return "[]";

  return JSON.stringify(
    parsed.slice(0, maxItems).map((item) => {
      if (typeof item === "string") return item.trim().slice(0, maxItemLength);
      if (item && typeof item === "object") return item;
      return String(item ?? "").slice(0, maxItemLength);
    }),
  );
}

function makeSlug(value: unknown): string {
  const slug = text(value, 180)
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || `ashram-${randomBytes(5).toString("hex")}`;
}

function uniqueAshramSlug(
  requested: unknown,
  name: string,
  currentId?: number,
): string {
  const base = makeSlug(requested || name);
  let candidate = base;

  for (let index = 2; index <= 100; index += 1) {
    const existing = db
      .prepare(
        `
        SELECT id
        FROM ashrams
        WHERE slug = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1
        `,
      )
      .get(candidate, currentId ?? null, currentId ?? null) as
      | { id?: number }
      | undefined;

    if (!existing) return candidate;
    candidate = `${base}-${index}`;
  }

  return `${base}-${randomBytes(3).toString("hex")}`;
}

function uniqueProgramSlug(
  ashramId: number,
  requested: unknown,
  title: string,
  currentId?: number,
): string {
  const base = makeSlug(requested || title);
  let candidate = base;

  for (let index = 2; index <= 100; index += 1) {
    const existing = db
      .prepare(
        `
        SELECT id
        FROM ashram_programs
        WHERE ashram_id = ?
          AND slug = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1
        `,
      )
      .get(ashramId, candidate, currentId ?? null, currentId ?? null) as
      | { id?: number }
      | undefined;

    if (!existing) return candidate;
    candidate = `${base}-${index}`;
  }

  return `${base}-${randomBytes(3).toString("hex")}`;
}

function normalizeEmail(value: unknown): string | null {
  const email = nullableText(value, 320)?.toLowerCase() ?? null;
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhone(value: unknown): string | null {
  const phone = nullableText(value, 30);
  if (!phone) return null;
  return /^[+0-9()\-\s]{7,20}$/.test(phone) ? phone : null;
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim().slice(0, 100) || null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim().slice(0, 100) || null;
  }
  return req.ip?.trim().slice(0, 100) || null;
}

function isSuperAdmin(user: AuthenticatedUser | null): boolean {
  return user?.role === "super_admin";
}

/* -------------------------------------------------------------------------- */
/* Audit / notifications                                                      */
/* -------------------------------------------------------------------------- */

function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData?: unknown,
  newData?: unknown,
): void {
  const user = req.res?.locals.user as AuthenticatedUser | undefined;

  try {
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
    ).run(
      user?.id ?? null,
      req.res?.locals.requestId ?? null,
      user?.role ?? "system",
      action,
      entityType,
      entityId,
      oldData === undefined ? null : jsonString(oldData),
      newData === undefined ? null : jsonString(newData),
      clientIp(req),
      nullableText(req.get("user-agent"), 500),
    );
  } catch (error) {
    console.error("Ashram audit log error:", error);
  }
}

function notifyUser(
  userId: number | null,
  type: string,
  title: string,
  message: string,
  actionUrl: string | null,
  metadata: unknown = {},
): void {
  if (!userId) return;

  try {
    db.prepare(
      `
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        action_url,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
    ).run(
      userId,
      type,
      title,
      message,
      actionUrl,
      jsonString(metadata),
    );
  } catch (error) {
    console.error("Ashram notification error:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Location helpers                                                           */
/* -------------------------------------------------------------------------- */

function resolveLocation(locationId: number | null): LocationContext {
  const context: LocationContext = {
    locationId,
    country: null,
    state: null,
    district: null,
    city: null,
    countryLocationId: null,
    stateLocationId: null,
    districtLocationId: null,
    cityLocationId: null,
  };

  let currentId = locationId;
  let guard = 0;

  while (currentId && guard < 10) {
    guard += 1;

    const row = db
      .prepare(
        `
        SELECT id, parent_id, type, name, status
        FROM locations
        WHERE id = ?
        LIMIT 1
        `,
      )
      .get(currentId) as
      | {
          id: number;
          parent_id: number | null;
          type: string;
          name: string;
          status: string;
        }
      | undefined;

    if (!row || row.status === "inactive") break;

    switch (row.type) {
      case "country":
        context.countryLocationId = row.id;
        context.country = row.name;
        break;
      case "state":
        context.stateLocationId = row.id;
        context.state = row.name;
        break;
      case "district":
        context.districtLocationId = row.id;
        context.district = row.name;
        break;
      case "city":
        context.cityLocationId = row.id;
        context.city = row.name;
        break;
      default:
        break;
    }

    currentId = row.parent_id;
  }

  return context;
}

function validateLocationId(locationId: number | null): LocationContext {
  if (!locationId) return resolveLocation(null);

  const row = db
    .prepare(
      `
      SELECT id, type, status
      FROM locations
      WHERE id = ?
      LIMIT 1
      `,
    )
    .get(locationId) as
    | { id?: number; type?: string; status?: string }
    | undefined;

  if (!row) throw new Error("Selected location was not found.");
  if (row.status !== "active") throw new Error("Selected location is not active.");

  return resolveLocation(locationId);
}

/* -------------------------------------------------------------------------- */
/* Ashram / assignment / subscription helpers                                */
/* -------------------------------------------------------------------------- */

function ashramByIdentifier(identifier: string): Row | null {
  const normalized = text(identifier, 180);
  if (!normalized) return null;

  const numericId = positiveId(normalized);
  return (
    (db
      .prepare(
        numericId
          ? `SELECT * FROM ashrams WHERE id = ? LIMIT 1`
          : `SELECT * FROM ashrams WHERE slug = ? LIMIT 1`,
      )
      .get(numericId ?? normalized) as Row | undefined) ?? null
  );
}

function activeAssignmentForAshram(
  ashramId: number,
  managerUserId?: number,
): AssignmentRow | null {
  const whereManager = managerUserId ? "AND ama.manager_user_id = ?" : "";
  const params: unknown[] = managerUserId ? [ashramId, managerUserId] : [ashramId];

  return (
    (db
      .prepare(
        `
        SELECT
          ama.*,
          u.name AS manager_name,
          u.email AS manager_email,
          u.phone AS manager_phone,
          amp.designation AS manager_designation,
          amp.organization_name AS manager_organization_name,
          amp.verification_status AS manager_verification_status
        FROM ashram_manager_assignments ama
        INNER JOIN users u ON u.id = ama.manager_user_id
        LEFT JOIN ashram_manager_profiles amp ON amp.user_id = ama.manager_user_id
        WHERE ama.ashram_id = ?
          AND ama.status = 'active'
          ${whereManager}
        ORDER BY ama.id DESC
        LIMIT 1
        `,
      )
      .get(...params) as AssignmentRow | undefined) ?? null
  );
}

function assignmentsForAshram(ashramId: number): Row[] {
  return db
    .prepare(
      `
      SELECT
        ama.*,
        u.name AS manager_name,
        u.email AS manager_email,
        u.phone AS manager_phone,
        amp.designation AS manager_designation,
        amp.organization_name AS manager_organization_name,
        amp.verification_status AS manager_verification_status,
        assigned_by_user.name AS assigned_by_name
      FROM ashram_manager_assignments ama
      INNER JOIN users u ON u.id = ama.manager_user_id
      LEFT JOIN ashram_manager_profiles amp ON amp.user_id = ama.manager_user_id
      LEFT JOIN users assigned_by_user ON assigned_by_user.id = ama.assigned_by
      WHERE ama.ashram_id = ?
      ORDER BY
        CASE ama.status WHEN 'active' THEN 0 WHEN 'inactive' THEN 1 ELSE 2 END,
        ama.id DESC
      `,
    )
    .all(ashramId) as Row[];
}

function activeSubscriptionForAshram(ashramId: number): SubscriptionRow | null {
  return (
    (db
      .prepare(
        `
        SELECT
          s.*,
          sp.code AS plan_code,
          sp.name AS plan_name,
          sp.description AS plan_description,
          sp.price_amount AS plan_price_amount,
          sp.currency AS plan_currency,
          sp.billing_interval AS plan_billing_interval,
          sp.duration_days AS plan_duration_days,
          sp.plan_features_json,
          sp.analytics_level AS plan_analytics_level
        FROM ashram_subscriptions s
        INNER JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE s.ashram_id = ?
          AND s.status = 'active'
          AND sp.audience = 'ashram'
          AND (s.starts_at IS NULL OR datetime(s.starts_at) <= datetime('now'))
          AND (s.expires_at IS NULL OR datetime(s.expires_at) >= datetime('now'))
        ORDER BY s.id DESC
        LIMIT 1
        `,
      )
      .get(ashramId) as SubscriptionRow | undefined) ?? null
  );
}

function latestSubscriptionForAshram(ashramId: number): SubscriptionRow | null {
  return (
    (db
      .prepare(
        `
        SELECT
          s.*,
          sp.code AS plan_code,
          sp.name AS plan_name,
          sp.description AS plan_description,
          sp.price_amount AS plan_price_amount,
          sp.currency AS plan_currency,
          sp.billing_interval AS plan_billing_interval,
          sp.duration_days AS plan_duration_days,
          sp.plan_features_json,
          sp.analytics_level AS plan_analytics_level
        FROM ashram_subscriptions s
        INNER JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE s.ashram_id = ?
          AND sp.audience = 'ashram'
        ORDER BY
          CASE s.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
          s.id DESC
        LIMIT 1
        `,
      )
      .get(ashramId) as SubscriptionRow | undefined) ?? null
  );
}

function subscriptionHistory(ashramId: number, limit = 50): Row[] {
  return db
    .prepare(
      `
      SELECT
        s.id,
        s.ashram_id,
        s.manager_user_id,
        s.plan_id,
        s.subscription_plan_price_id,
        s.billing_interval,
        s.duration_days,
        s.status,
        s.starts_at,
        s.expires_at,
        s.lead_limit,
        s.leads_used,
        s.price_amount,
        s.currency,
        s.gallery_limit,
        s.video_limit,
        s.program_limit,
        s.auto_renew,
        s.listing_enabled,
        s.featured_listing,
        s.priority_support,
        s.verification_badge,
        s.analytics_access,
        s.homepage_promotion,
        s.live_aarti_enabled,
        s.enhanced_seo,
        s.enhanced_profile,
        s.whatsapp_enquiry,
        s.search_visibility,
        s.analytics_level,
        s.razorpay_subscription_id,
        s.plan_snapshot_json,
        s.notes,
        s.created_at,
        s.updated_at,
        sp.code AS plan_code,
        sp.name AS plan_name,
        u.name AS manager_name
      FROM ashram_subscriptions s
      INNER JOIN subscription_plans sp ON sp.id = s.plan_id
      LEFT JOIN users u ON u.id = s.manager_user_id
      WHERE s.ashram_id = ?
        AND sp.audience = 'ashram'
      ORDER BY s.id DESC
      LIMIT ?
      `,
    )
    .all(ashramId, integerInRange(limit, 50, 1, 100)) as Row[];
}

function userCanViewAshram(
  user: AuthenticatedUser | null,
  ashramId: number,
): boolean {
  if (!user) return false;
  if (user.role === "super_admin" || user.role === "sales") return true;
  if (user.role === "ashram_manager") {
    return Boolean(activeAssignmentForAshram(ashramId, user.id));
  }
  return false;
}

function userCanManageAshram(
  user: AuthenticatedUser | null,
  ashramId: number,
): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (user.role !== "ashram_manager") return false;
  return Boolean(activeAssignmentForAshram(ashramId, user.id));
}

function requireAshramAccess(
  user: AuthenticatedUser | null,
  ashramId: number,
  res: Response,
  mode: "view" | "manage",
): boolean {
  const allowed = mode === "manage"
    ? userCanManageAshram(user, ashramId)
    : userCanViewAshram(user, ashramId);

  if (allowed) return true;

  res.status(403).json({
    success: false,
    error: mode === "manage"
      ? "You do not have management access to this Ashram."
      : "You do not have access to this Ashram.",
  });
  return false;
}

function subscriptionEntitlements(
  subscription: SubscriptionRow | null,
): Row | null {
  if (!subscription) return null;

  const planFeatures = parseJsonArray(subscription.plan_features_json);
  const priceAmount = Number(
    subscription.price_amount ?? subscription.plan_price_amount ?? 0,
  );
  const leadLimit = Number(subscription.lead_limit ?? 0);
  const leadsUsed = Number(subscription.leads_used ?? 0);

  return {
    id: subscription.id,
    ashramId: subscription.ashram_id,
    status: subscription.status,
    planId: subscription.plan_id,
    planCode: subscription.plan_code ?? null,
    planName: subscription.plan_name ?? null,
    planDescription: subscription.plan_description ?? null,
    priceAmount,
    currency: subscription.currency ?? subscription.plan_currency ?? "INR",
    subscriptionPlanPriceId: subscription.subscription_plan_price_id ?? null,
    billingInterval:
      subscription.billing_interval ?? subscription.plan_billing_interval ?? "monthly",
    durationDays: Number(
      subscription.duration_days ?? subscription.plan_duration_days ?? 30,
    ),
    startsAt: subscription.starts_at ?? null,
    expiresAt: subscription.expires_at ?? null,
    leadLimit,
    leadsUsed,
    leadsRemaining: Math.max(0, leadLimit - leadsUsed),
    serviceLimit: Number(subscription.service_limit ?? 0),
    serviceAreaLimit: Number(subscription.service_area_limit ?? 0),
    programLimit: Number(subscription.program_limit ?? 0),
    galleryLimit: Number(subscription.gallery_limit ?? 0),
    videoLimit: Number(subscription.video_limit ?? 0),
    listingEnabled: Number(subscription.listing_enabled ?? 0),
    featuredListing: Number(subscription.featured_listing ?? 0),
    prioritySupport: Number(subscription.priority_support ?? 0),
    verificationBadge: Number(subscription.verification_badge ?? 0),
    analyticsAccess: Number(subscription.analytics_access ?? 0),
    analyticsLevel:
      subscription.analytics_level ?? subscription.plan_analytics_level ?? "none",
    homepagePromotion: Number(subscription.homepage_promotion ?? 0),
    liveAartiEnabled: Number(subscription.live_aarti_enabled ?? 0),
    enhancedSeo: Number(subscription.enhanced_seo ?? 0),
    enhancedProfile: Number(subscription.enhanced_profile ?? 0),
    whatsappEnquiry: Number(subscription.whatsapp_enquiry ?? 0),
    searchVisibility: subscription.search_visibility ?? "standard",
    autoRenew: Number(subscription.auto_renew ?? 0),
    managerUserId: subscription.manager_user_id ?? null,
    planFeatures,
  };
}

function planRows(): Row[] {
  return db
    .prepare(
      `
      SELECT
        id,
        code,
        audience,
        name,
        description,
        price_amount,
        currency,
        billing_interval,
        duration_days,
        lead_limit,
        service_limit,
        service_area_limit,
        gallery_limit,
        video_limit,
        program_limit,
        listing_enabled,
        featured_listing,
        priority_support,
        verification_badge,
        analytics_access,
        homepage_promotion,
        live_aarti_enabled,
        enhanced_seo,
        enhanced_profile,
        whatsapp_enquiry,
        search_visibility,
        analytics_level,
        plan_features_json,
        is_active,
        sort_order
      FROM subscription_plans
      WHERE audience = 'ashram'
        AND is_active = 1
      ORDER BY sort_order ASC, price_amount ASC, id ASC
      `,
    )
    .all() as Row[];
}

function planPriceRows(planId: number): Row[] {
  const rows = db
    .prepare(
      `
      SELECT
        spp.id,
        spp.plan_id,
        spp.billing_interval,
        spp.duration_days,
        spp.price_amount,
        spp.currency,
        spp.provider,
        spp.razorpay_plan_id,
        spp.is_active,
        spp.sort_order,
        spp.metadata_json
      FROM subscription_plan_prices spp
      INNER JOIN subscription_plans sp ON sp.id = spp.plan_id
      WHERE spp.plan_id = ?
        AND sp.audience = 'ashram'
        AND sp.is_active = 1
        AND spp.is_active = 1
      ORDER BY spp.sort_order ASC, spp.price_amount ASC, spp.id ASC
      `,
    )
    .all(planId) as Row[];

  return rows.map((row) => ({
    id: Number(row.id),
    planId: Number(row.plan_id),
    billingInterval: row.billing_interval,
    durationDays: Number(row.duration_days ?? 30),
    priceAmount: Number(row.price_amount ?? 0),
    currency: row.currency ?? "INR",
    provider: row.provider ?? "razorpay",
    isActive: Number(row.is_active ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    metadata: parseJsonObject(row.metadata_json),
  }));
}

function serializePlans(rows: Row[]): Row[] {
  return rows.map((row) => {
    const planId = Number(row.id);
    return {
      id: planId,
      code: row.code,
      audience: row.audience,
      name: row.name,
      description: row.description,
      priceAmount: Number(row.price_amount ?? 0),
      currency: row.currency ?? "INR",
      billingInterval: row.billing_interval,
      durationDays: Number(row.duration_days ?? 30),
      leadLimit: Number(row.lead_limit ?? 0),
      serviceLimit: Number(row.service_limit ?? 0),
      serviceAreaLimit: Number(row.service_area_limit ?? 0),
      galleryLimit: Number(row.gallery_limit ?? 0),
      videoLimit: Number(row.video_limit ?? 0),
      programLimit: Number(row.program_limit ?? 0),
      listingEnabled: Number(row.listing_enabled ?? 0),
      featuredListing: Number(row.featured_listing ?? 0),
      prioritySupport: Number(row.priority_support ?? 0),
      verificationBadge: Number(row.verification_badge ?? 0),
      analyticsAccess: Number(row.analytics_access ?? 0),
      homepagePromotion: Number(row.homepage_promotion ?? 0),
      liveAartiEnabled: Number(row.live_aarti_enabled ?? 0),
      enhancedSeo: Number(row.enhanced_seo ?? 0),
      enhancedProfile: Number(row.enhanced_profile ?? 0),
      whatsappEnquiry: Number(row.whatsapp_enquiry ?? 0),
      searchVisibility: row.search_visibility,
      analyticsLevel: row.analytics_level,
      features: parseJsonArray(row.plan_features_json),
      priceVariants: planPriceRows(planId),
      isActive: Number(row.is_active ?? 0),
      sortOrder: Number(row.sort_order ?? 0),
    };
  });
}

function programCount(ashramId: number): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM ashram_programs
      WHERE ashram_id = ?
        AND is_active = 1
      `,
    )
    .get(ashramId) as { count?: number } | undefined;

  return Number(row?.count ?? 0);
}

function linkedCourseCount(ashramId: number): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM ashram_courses
      WHERE ashram_id = ?
      `,
    )
    .get(ashramId) as { count?: number } | undefined;

  return Number(row?.count ?? 0);
}

function combinedProgramCount(ashramId: number): number {
  return programCount(ashramId) + linkedCourseCount(ashramId);
}

function enforceProgramLimit(
  ashramId: number,
  user: AuthenticatedUser | null,
): void {
  if (user?.role === "super_admin") return;

  const subscription = activeSubscriptionForAshram(ashramId);
  if (!subscription) {
    throw new Error(
      "An active Ashram subscription is required to add programs or courses.",
    );
  }

  const limit = Number(subscription.program_limit ?? 0);
  if (limit <= 0) {
    throw new Error("Your current Ashram plan does not include programs or courses.");
  }

  if (combinedProgramCount(ashramId) >= limit) {
    throw new Error(`Your Ashram plan allows up to ${limit} programs/courses.`);
  }
}

function enforceGalleryLimit(
  ashramId: number,
  gallery: unknown[],
  user: AuthenticatedUser | null,
): void {
  if (user?.role === "super_admin") return;

  const subscription = activeSubscriptionForAshram(ashramId);
  if (!subscription) {
    throw new Error(
      "An active Ashram subscription is required to manage gallery capacity.",
    );
  }

  const limit = Number(subscription.gallery_limit ?? 0);
  if (gallery.length > limit) {
    throw new Error(`Your Ashram plan allows up to ${limit} gallery items.`);
  }
}

function syncProgramsJson(ashramId: number): void {
  const programs = db
    .prepare(
      `
      SELECT
        id,
        title,
        slug,
        description,
        program_type,
        duration_text,
        price_amount,
        currency,
        image,
        start_date,
        end_date,
        is_active,
        sort_order
      FROM ashram_programs
      WHERE ashram_id = ?
      ORDER BY sort_order ASC, id ASC
      `,
    )
    .all(ashramId);

  db.prepare(
    `
    UPDATE ashrams
    SET programs_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(JSON.stringify(programs), ashramId);
}

function syncCoursesJson(ashramId: number): void {
  const courses = db
    .prepare(
      `
      SELECT
        c.id,
        c.slug,
        c.title,
        c.subtitle,
        c.category,
        c.level,
        c.short_description,
        c.duration_text,
        c.sessions_text,
        c.fee_display,
        c.mode_text,
        c.status,
        c.featured,
        ac.is_featured AS relation_featured
      FROM ashram_courses ac
      INNER JOIN courses c ON c.id = ac.course_id
      WHERE ac.ashram_id = ?
      ORDER BY ac.is_featured DESC, c.sort_order ASC, c.id ASC
      `,
    )
    .all(ashramId);

  db.prepare(
    `
    UPDATE ashrams
    SET courses_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(JSON.stringify(courses), ashramId);
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

function serializeProgram(row: Row): Row {
  return {
    id: Number(row.id),
    ashramId: Number(row.ashram_id),
    title: row.title ?? null,
    slug: row.slug ?? null,
    description: row.description ?? null,
    programType: row.program_type ?? null,
    durationText: row.duration_text ?? null,
    priceAmount:
      row.price_amount === null || row.price_amount === undefined
        ? null
        : Number(row.price_amount),
    currency: row.currency ?? "INR",
    image: row.image ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    isActive: Number(row.is_active ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function serializeCourse(row: Row): Row {
  return {
    id: Number(row.id),
    slug: row.slug ?? null,
    title: row.title ?? null,
    subtitle: row.subtitle ?? null,
    category: row.category ?? null,
    level: row.level ?? null,
    shortDescription: row.short_description ?? null,
    durationText: row.duration_text ?? null,
    sessionsText: row.sessions_text ?? null,
    feeDisplay: row.fee_display ?? null,
    modeText: row.mode_text ?? null,
    status: row.status ?? null,
    featured: Number(row.featured ?? 0),
    relationFeatured: Number(row.relation_featured ?? 0),
  };
}

function serializeAssignment(row: Row | null): Row | null {
  if (!row) return null;

  return {
    id: Number(row.id),
    ashramId: Number(row.ashram_id),
    managerUserId: Number(row.manager_user_id),
    assignedBy: row.assigned_by === null || row.assigned_by === undefined
      ? null
      : Number(row.assigned_by),
    status: row.status,
    assignedAt: row.assigned_at ?? null,
    revokedAt: row.revoked_at ?? null,
    manager: {
      name: row.manager_name ?? null,
      email: row.manager_email ?? null,
      phone: row.manager_phone ?? null,
      designation: row.manager_designation ?? null,
      organizationName: row.manager_organization_name ?? null,
      verificationStatus: row.manager_verification_status ?? null,
    },
    assignedByName: row.assigned_by_name ?? null,
  };
}

function serializeAshram(
  row: Row,
  options: { includePrivate?: boolean } = {},
): Row {
  const includePrivate = options.includePrivate === true;
  const subscription = includePrivate
    ? latestSubscriptionForAshram(Number(row.id))
    : null;
  const activeAssignment = includePrivate
    ? activeAssignmentForAshram(Number(row.id))
    : null;

  const result: Row = {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    shortName: row.short_name ?? null,
    founder: row.founder ?? null,
    spiritualHead: row.spiritual_head ?? null,
    tradition: row.tradition ?? null,
    founded: row.founded ?? null,
    summary: row.summary ?? null,
    description: row.description ?? null,
    history: row.history ?? null,
    activities: parseJsonArray(row.activities_json),
    stay: row.stay ?? null,
    food: row.food ?? null,
    courses: parseJsonArray(row.courses_json),
    contactNote: row.contact_note ?? null,
    image: row.image ?? null,
    gallery: parseJsonArray(row.gallery_json),
    city: row.city ?? null,
    district: row.district ?? null,
    state: row.state ?? null,
    country: row.country ?? "India",
    locationId: row.location_id ?? null,
    countryLocationId: row.country_location_id ?? null,
    stateLocationId: row.state_location_id ?? null,
    districtLocationId: row.district_location_id ?? null,
    cityLocationId: row.city_location_id ?? null,
    address: row.address ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    mapUrl: row.map_url ?? null,
    contactPhone: row.contact_phone ?? null,
    contactEmail: row.contact_email ?? null,
    websiteUrl: row.website_url ?? null,
    stayAvailable: Number(row.stay_available ?? 0),
    retreatAvailable: Number(row.retreat_available ?? 0),
    facilities: parseJsonArray(row.facilities_json),
    programs: parseJsonArray(row.programs_json),
    timings: parseJsonObject(row.timings_json),
    bookingEnabled: Number(row.booking_enabled ?? 0),
    status: row.status,
    featured: Number(row.featured ?? 0),
    listingActive: Number(row.listing_active ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };

  if (includePrivate) {
    result.subscription = subscriptionEntitlements(subscription);
    result.activeAssignment = serializeAssignment(activeAssignment);
  }

  return result;
}

function loadPrograms(ashramId: number, includeInactive: boolean): Row[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM ashram_programs
      WHERE ashram_id = ?
        ${includeInactive ? "" : "AND is_active = 1"}
      ORDER BY sort_order ASC, id ASC
      `,
    )
    .all(ashramId) as Row[];

  return rows.map(serializeProgram);
}

function loadCourses(ashramId: number, includeUnpublished: boolean): Row[] {
  const rows = db
    .prepare(
      `
      SELECT
        c.*,
        ac.is_featured AS relation_featured
      FROM ashram_courses ac
      INNER JOIN courses c ON c.id = ac.course_id
      WHERE ac.ashram_id = ?
        ${includeUnpublished ? "" : "AND c.status = 'published'"}
      ORDER BY ac.is_featured DESC, c.sort_order ASC, c.id ASC
      `,
    )
    .all(ashramId) as Row[];

  return rows.map(serializeCourse);
}

function publicVisible(row: Row): boolean {
  return row.status === PUBLIC_STATUS && Number(row.listing_active ?? 0) === 1;
}

function managerViewPayload(ashramId: number): Row {
  const assignmentRows = assignmentsForAshram(ashramId);
  return {
    active: assignmentRows
      .filter((row) => row.status === "active")
      .map(serializeAssignment),
    history: assignmentRows
      .filter((row) => row.status !== "active")
      .map(serializeAssignment),
  };
}

/* -------------------------------------------------------------------------- */
/* Health / metadata / public catalogue                                      */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  try {
    const ashrams = db
      .prepare(`SELECT COUNT(*) AS count FROM ashrams`)
      .get() as { count?: number } | undefined;

    const published = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM ashrams
        WHERE status = 'published'
          AND listing_active = 1
        `,
      )
      .get() as { count?: number } | undefined;

    const assigned = db
      .prepare(
        `
        SELECT COUNT(DISTINCT ashram_id) AS count
        FROM ashram_manager_assignments
        WHERE status = 'active'
        `,
      )
      .get() as { count?: number } | undefined;

    const subscriptions = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM ashram_subscriptions
        WHERE status = 'active'
          AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
          AND (expires_at IS NULL OR datetime(expires_at) >= datetime('now'))
        `,
      )
      .get() as { count?: number } | undefined;

    res.json({
      success: true,
      service: "ashrams",
      status: "healthy",
      database: true,
      totals: {
        ashrams: Number(ashrams?.count ?? 0),
        publicListings: Number(published?.count ?? 0),
        activelyAssignedAshrams: Number(assigned?.count ?? 0),
        activeSubscriptions: Number(subscriptions?.count ?? 0),
      },
    });
  } catch (error) {
    console.error("Ashram health error:", error);
    res.status(500).json({
      success: false,
      service: "ashrams",
      status: "unhealthy",
      database: false,
    });
  }
});

router.get("/meta", (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      filters: {
        traditions: (db
          .prepare(
            `
            SELECT DISTINCT tradition
            FROM ashrams
            WHERE status = 'published'
              AND listing_active = 1
              AND tradition IS NOT NULL
              AND TRIM(tradition) <> ''
            ORDER BY LOWER(tradition) ASC
            LIMIT 200
            `,
          )
          .all() as Row[])
          .map((row) => String(row.tradition)),
      },
      sorts: ["featured", "newest", "name"],
      plans: serializePlans(planRows()),
      visibilityRule: "published + listing_active",
    });
  } catch (error) {
    console.error("Ashram meta error:", error);
    res.status(500).json({
      success: false,
      error: "Unable to load Ashram metadata.",
    });
  }
});

router.get("/", (req: Request, res: Response) => {
  try {
    const page = integerInRange(req.query.page, 1, 1, 100000);
    const limit = integerInRange(req.query.limit, 24, 1, MAX_LIST_LIMIT);
    const offset = (page - 1) * limit;
    const search = text(req.query.search ?? req.query.q, 180);
    const country = nullableText(req.query.country, 100);
    const state = nullableText(req.query.state, 120);
    const district = nullableText(req.query.district, 120);
    const city = nullableText(req.query.city, 120);
    const tradition = nullableText(req.query.tradition, 120);
    const locationId = positiveId(req.query.locationId);
    const stay = req.query.stay === undefined
      ? null
      : booleanValue(req.query.stay, false);
    const retreat = req.query.retreat === undefined
      ? null
      : booleanValue(req.query.retreat, false);
    const featured = req.query.featured === undefined
      ? null
      : booleanValue(req.query.featured, false);
    const sort = text(req.query.sort, 30).toLowerCase() || "featured";

    const where: string[] = [
      "a.status = 'published'",
      "a.listing_active = 1",
    ];
    const params: unknown[] = [];

    if (search) {
      const pattern = `%${search}%`;
      where.push(`
        (
          LOWER(COALESCE(a.name, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(a.short_name, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(a.tradition, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(a.summary, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(a.city, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(a.state, '')) LIKE LOWER(?)
        )
      `);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (country) {
      where.push("LOWER(COALESCE(a.country, '')) = LOWER(?)");
      params.push(country);
    }
    if (state) {
      where.push("LOWER(COALESCE(a.state, '')) = LOWER(?)");
      params.push(state);
    }
    if (district) {
      where.push("LOWER(COALESCE(a.district, '')) = LOWER(?)");
      params.push(district);
    }
    if (city) {
      where.push("LOWER(COALESCE(a.city, '')) = LOWER(?)");
      params.push(city);
    }
    if (tradition) {
      where.push("LOWER(COALESCE(a.tradition, '')) = LOWER(?)");
      params.push(tradition);
    }

    if (locationId) {
      const location = validateLocationId(locationId);
      if (location.cityLocationId) {
        where.push("a.city_location_id = ?");
        params.push(location.cityLocationId);
      } else if (location.districtLocationId) {
        where.push("a.district_location_id = ?");
        params.push(location.districtLocationId);
      } else if (location.stateLocationId) {
        where.push("a.state_location_id = ?");
        params.push(location.stateLocationId);
      } else if (location.countryLocationId) {
        where.push("a.country_location_id = ?");
        params.push(location.countryLocationId);
      } else {
        where.push("a.location_id = ?");
        params.push(location.locationId);
      }
    }

    if (stay !== null) {
      where.push("a.stay_available = ?");
      params.push(stay ? 1 : 0);
    }
    if (retreat !== null) {
      where.push("a.retreat_available = ?");
      params.push(retreat ? 1 : 0);
    }
    if (featured !== null) {
      where.push("a.featured = ?");
      params.push(featured ? 1 : 0);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const orderBy = sort === "name"
      ? "LOWER(a.name) ASC, a.id ASC"
      : sort === "newest"
        ? "a.id DESC"
        : "a.featured DESC, a.id DESC";

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS count FROM ashrams a ${whereSql}`)
      .get(...params) as { count?: number } | undefined;

    const total = Number(totalRow?.count ?? 0);

    const rows = db
      .prepare(
        `
        SELECT
          a.id,
          a.slug,
          a.name,
          a.short_name,
          a.founder,
          a.spiritual_head,
          a.tradition,
          a.founded,
          a.summary,
          a.image,
          a.city,
          a.district,
          a.state,
          a.country,
          a.location_id,
          a.country_location_id,
          a.state_location_id,
          a.district_location_id,
          a.city_location_id,
          a.stay_available,
          a.retreat_available,
          a.booking_enabled,
          a.status,
          a.featured,
          a.listing_active
        FROM ashrams a
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      ashrams: rows.map((row) => serializeAshram(row)),
      pagination: {
        page,
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search: search || null,
        country,
        state,
        district,
        city,
        tradition,
        locationId,
        stay,
        retreat,
        featured,
        sort,
      },
    });
  } catch (error) {
    console.error("Ashram public list error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Selected location")) {
      res.status(400).json({ success: false, error: message });
      return;
    }
    res.status(500).json({ success: false, error: "Unable to load Ashrams." });
  }
});

/* -------------------------------------------------------------------------- */
/* Manager workspace                                                          */
/* -------------------------------------------------------------------------- */

router.get(
  "/manager/ashrams",
  requireAuth,
  requirePermission("ashram.view"),
  requireRole("ashram_manager", "sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      if (!user) {
        res.status(401).json({ success: false, error: "Authentication required." });
        return;
      }

      const search = text(req.query.search, 180);
      const where: string[] = ["1 = 1"];
      const params: unknown[] = [];

      if (user.role === "ashram_manager") {
        where.push(`
          EXISTS (
            SELECT 1
            FROM ashram_manager_assignments ama
            WHERE ama.ashram_id = a.id
              AND ama.manager_user_id = ?
              AND ama.status = 'active'
          )
        `);
        params.push(user.id);
      }

      if (search) {
        const pattern = `%${search}%`;
        where.push(`
          (
            LOWER(COALESCE(a.name, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(a.city, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(a.state, '')) LIKE LOWER(?)
          )
        `);
        params.push(pattern, pattern, pattern);
      }

      const rows = db
        .prepare(
          `
          SELECT
            a.*,
            s.id AS subscription_id,
            s.status AS subscription_status,
            s.starts_at AS subscription_starts_at,
            s.expires_at AS subscription_expires_at,
            s.lead_limit AS subscription_lead_limit,
            s.leads_used AS subscription_leads_used,
            s.program_limit AS subscription_program_limit,
            s.gallery_limit AS subscription_gallery_limit,
            s.video_limit AS subscription_video_limit,
            s.listing_enabled AS subscription_listing_enabled,
            s.featured_listing AS subscription_featured_listing,
            s.analytics_access AS subscription_analytics_access,
            s.analytics_level AS subscription_analytics_level,
            s.manager_user_id AS subscription_manager_user_id,
            s.subscription_plan_price_id AS subscription_plan_price_id,
            s.billing_interval AS subscription_billing_interval,
            s.duration_days AS subscription_duration_days,
            sp.code AS plan_code,
            sp.name AS plan_name,
            ama.id AS assignment_id,
            ama.manager_user_id AS assigned_manager_user_id,
            ama.status AS assignment_status,
            ama.assigned_at,
            ama.revoked_at,
            manager.name AS assigned_manager_name,
            manager.email AS assigned_manager_email,
            manager.phone AS assigned_manager_phone,
            amp.designation AS assigned_manager_designation,
            amp.organization_name AS assigned_manager_organization_name,
            amp.verification_status AS assigned_manager_verification_status
          FROM ashrams a
          LEFT JOIN ashram_subscriptions s
            ON s.id = (
              SELECT latest.id
              FROM ashram_subscriptions latest
              WHERE latest.ashram_id = a.id
              ORDER BY
                CASE WHEN latest.status = 'active' THEN 0
                     WHEN latest.status = 'pending' THEN 1
                     ELSE 2 END,
                latest.id DESC
              LIMIT 1
            )
          LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
          LEFT JOIN ashram_manager_assignments ama
            ON ama.id = (
              SELECT latest_assignment.id
              FROM ashram_manager_assignments latest_assignment
              WHERE latest_assignment.ashram_id = a.id
              ORDER BY
                CASE WHEN latest_assignment.status = 'active' THEN 0
                     WHEN latest_assignment.status = 'inactive' THEN 1
                     ELSE 2 END,
                latest_assignment.id DESC
              LIMIT 1
            )
          LEFT JOIN users manager ON manager.id = ama.manager_user_id
          LEFT JOIN ashram_manager_profiles amp ON amp.user_id = ama.manager_user_id
          WHERE ${where.join(" AND ")}
          ORDER BY a.featured DESC, a.id DESC
          LIMIT 500
          `,
        )
        .all(...params) as Row[];

      res.json({
        success: true,
        ashrams: rows.map((row) => ({
          ...serializeAshram(row, { includePrivate: true }),
          subscription: row.subscription_id
            ? {
                id: Number(row.subscription_id),
                status: row.subscription_status,
                startsAt: row.subscription_starts_at ?? null,
                expiresAt: row.subscription_expires_at ?? null,
                leadLimit: Number(row.subscription_lead_limit ?? 0),
                leadsUsed: Number(row.subscription_leads_used ?? 0),
                programLimit: Number(row.subscription_program_limit ?? 0),
                galleryLimit: Number(row.subscription_gallery_limit ?? 0),
                videoLimit: Number(row.subscription_video_limit ?? 0),
                listingEnabled: Number(row.subscription_listing_enabled ?? 0),
                featuredListing: Number(row.subscription_featured_listing ?? 0),
                analyticsAccess: Number(row.subscription_analytics_access ?? 0),
                analyticsLevel: row.subscription_analytics_level ?? "none",
                planCode: row.plan_code ?? null,
                planName: row.plan_name ?? null,
                managerUserId: row.subscription_manager_user_id ?? null,
                subscriptionPlanPriceId: row.subscription_plan_price_id ?? null,
                billingInterval: row.subscription_billing_interval ?? "monthly",
                durationDays: Number(row.subscription_duration_days ?? 30),
              }
            : null,
          latestAssignment: row.assignment_id
            ? {
                id: Number(row.assignment_id),
                managerUserId: Number(row.assigned_manager_user_id),
                status: row.assignment_status,
                assignedAt: row.assigned_at ?? null,
                revokedAt: row.revoked_at ?? null,
                manager: {
                  name: row.assigned_manager_name ?? null,
                  email: row.assigned_manager_email ?? null,
                  phone: row.assigned_manager_phone ?? null,
                  designation: row.assigned_manager_designation ?? null,
                  organizationName: row.assigned_manager_organization_name ?? null,
                  verificationStatus: row.assigned_manager_verification_status ?? null,
                },
              }
            : null,
        })),
      });
    } catch (error) {
      console.error("Ashram manager list error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load managed Ashrams.",
      });
    }
  },
);

router.get(
  "/:id/dashboard",
  requireAuth,
  requirePermission("ashram.view"),
  requireRole("ashram_manager", "sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      if (!requireAshramAccess(user, Number(ashram.id), res, "view")) return;

      const subscription = activeSubscriptionForAshram(Number(ashram.id));
      const leadStats = db
        .prepare(
          `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status NOT IN ('converted', 'lost', 'closed', 'spam') THEN 1 ELSE 0 END) AS open_count,
            SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
            SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up_count
          FROM leads
          WHERE ashram_id = ?
          `,
        )
        .get(ashram.id) as Row;

      const bookingStats = db
        .prepare(
          `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status IN ('received', 'confirmed', 'in_progress') THEN 1 ELSE 0 END) AS open_count,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount
          FROM bookings
          WHERE ashram_id = ?
          `,
        )
        .get(ashram.id) as Row;

      const unread = db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM notifications
          WHERE user_id = ?
            AND is_read = 0
          `,
        )
        .get(user?.id ?? 0) as { count?: number } | undefined;

      res.json({
        success: true,
        ashram: serializeAshram(ashram, { includePrivate: true }),
        subscription: subscriptionEntitlements(subscription),
        plans: serializePlans(planRows()),
        managerAssignments: managerViewPayload(Number(ashram.id)),
        counts: {
          programs: programCount(Number(ashram.id)),
          linkedCourses: linkedCourseCount(Number(ashram.id)),
          totalProgramsAndCourses: combinedProgramCount(Number(ashram.id)),
          galleryItems: parseJsonArray(ashram.gallery_json).length,
          leads: {
            total: Number(leadStats?.total ?? 0),
            open: Number(leadStats?.open_count ?? 0),
            converted: Number(leadStats?.converted_count ?? 0),
            followUps: Number(leadStats?.follow_up_count ?? 0),
          },
          bookings: {
            total: Number(bookingStats?.total ?? 0),
            open: Number(bookingStats?.open_count ?? 0),
            completed: Number(bookingStats?.completed_count ?? 0),
            paidAmount: Number(bookingStats?.paid_amount ?? 0),
          },
          unreadNotifications: Number(unread?.count ?? 0),
        },
      });
    } catch (error) {
      console.error("Ashram dashboard error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load Ashram dashboard.",
      });
    }
  },
);

router.get(
  "/:id/subscription",
  requireAuth,
  requirePermission("ashram.view"),
  requireRole("ashram_manager", "sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      if (!requireAshramAccess(user, Number(ashram.id), res, "view")) return;

      const latest = latestSubscriptionForAshram(Number(ashram.id));
      const active = activeSubscriptionForAshram(Number(ashram.id));

      res.json({
        success: true,
        ashramId: Number(ashram.id),
        current: subscriptionEntitlements(active ?? latest),
        active: subscriptionEntitlements(active),
        history: subscriptionHistory(Number(ashram.id)),
        plans: serializePlans(planRows()),
        billingSource: "subscriptions.ts",
      });
    } catch (error) {
      console.error("Ashram subscription read error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load Ashram subscription.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Public / protected detail                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  "/:id",
  optionalAuth,
  (req: Request, res: Response) => {
    try {
      const ashram = ashramByIdentifier(text(req.params.id, 180));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      const user = currentUser(res);
      const canPrivatelyView = userCanViewAshram(user, Number(ashram.id));

      if (!publicVisible(ashram) && !canPrivatelyView) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      res.json({
        success: true,
        ashram: serializeAshram(ashram, { includePrivate: canPrivatelyView }),
        programs: loadPrograms(Number(ashram.id), canPrivatelyView),
        courses: loadCourses(Number(ashram.id), canPrivatelyView),
        subscription: canPrivatelyView
          ? subscriptionEntitlements(activeSubscriptionForAshram(Number(ashram.id)))
          : null,
        seo: db
          .prepare(
            `
            SELECT *
            FROM seo_entries
            WHERE entity_type = 'ashram'
              AND entity_id = ?
              AND status = 'published'
            ORDER BY id DESC
            LIMIT 1
            `,
          )
          .get(Number(ashram.id)) ?? null,
      });
    } catch (error) {
      console.error("Ashram detail error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load Ashram details.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Lead visibility                                                            */
/* -------------------------------------------------------------------------- */

router.get(
  "/:id/leads",
  requireAuth,
  requireAnyPermission("ashram.view_leads", "sales.view_ashrams"),
  requireRole("ashram_manager", "sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      if (!requireAshramAccess(user, Number(ashram.id), res, "view")) return;

      const page = integerInRange(req.query.page, 1, 1, 100000);
      const limit = integerInRange(req.query.limit, 25, 1, MAX_LIST_LIMIT);
      const offset = (page - 1) * limit;
      const status = nullableText(req.query.status, 30)?.toLowerCase();

      const where = ["l.ashram_id = ?"];
      const params: unknown[] = [ashram.id];

      if (status) {
        where.push("l.status = ?");
        params.push(status);
      }

      const totalRow = db
        .prepare(
          `SELECT COUNT(*) AS count FROM leads l WHERE ${where.join(" AND ")}`,
        )
        .get(...params) as { count?: number } | undefined;

      const total = Number(totalRow?.count ?? 0);

      const rows = db
        .prepare(
          `
          SELECT
            l.id,
            l.lead_number,
            l.name,
            l.phone,
            l.email,
            l.city,
            l.district,
            l.state,
            l.country,
            l.service_type,
            l.puja_type,
            l.preferred_date,
            l.preferred_time,
            l.travellers_count,
            l.message,
            l.source_type,
            l.source_page,
            l.source_form,
            l.utm_source,
            l.utm_medium,
            l.utm_campaign,
            l.status,
            l.priority,
            l.lead_temperature,
            l.lead_score,
            l.owner_user_id,
            owner.name AS owner_name,
            l.created_at,
            l.last_activity_at,
            l.last_contacted_at,
            l.converted_at
          FROM leads l
          LEFT JOIN users owner ON owner.id = l.owner_user_id
          WHERE ${where.join(" AND ")}
          ORDER BY
            CASE l.priority
              WHEN 'urgent' THEN 0
              WHEN 'high' THEN 1
              WHEN 'normal' THEN 2
              ELSE 3
            END,
            CASE l.lead_temperature
              WHEN 'hot' THEN 0
              WHEN 'warm' THEN 1
              ELSE 2
            END,
            l.id DESC
          LIMIT ? OFFSET ?
          `,
        )
        .all(...params, limit, offset) as Row[];

      res.json({
        success: true,
        ashramId: Number(ashram.id),
        leads: rows,
        pagination: {
          page,
          limit,
          offset,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Ashram leads error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load Ashram leads.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Super Admin Ashram creation                                                */
/* -------------------------------------------------------------------------- */

router.post(
  "/",
  requireAuth,
  requirePermission("admin.manage_ashrams"),
  requireRole("super_admin"),
  (req: Request, res: Response) => {
    try {
      const body = req.body && typeof req.body === "object"
        ? req.body as Row
        : {};
      const name = text(body.name, 250);

      if (name.length < 2) {
        res.status(400).json({
          success: false,
          error: "Ashram name must contain at least 2 characters.",
        });
        return;
      }

      const locationId = positiveId(body.locationId);
      const location = validateLocationId(locationId);
      const slug = uniqueAshramSlug(body.slug, name);
      const email = normalizeEmail(body.contactEmail ?? body.email);
      const phone = normalizePhone(body.contactPhone ?? body.phone);

      if (body.contactEmail !== undefined && body.contactEmail !== null && !email) {
        res.status(400).json({
          success: false,
          error: "Please enter a valid Ashram contact email.",
        });
        return;
      }

      if (body.contactPhone !== undefined && body.contactPhone !== null && !phone) {
        res.status(400).json({
          success: false,
          error: "Please enter a valid Ashram contact phone.",
        });
        return;
      }

      const status = text(body.status, 20).toLowerCase() || "draft";
      if (!(EDITABLE_STATUS as readonly string[]).includes(status)) {
        res.status(400).json({ success: false, error: "Invalid Ashram status." });
        return;
      }

      const featured = booleanValue(body.featured, false) ? 1 : 0;
      const bookingEnabled = booleanValue(body.bookingEnabled, false) ? 1 : 0;

      if (featured) {
        res.status(400).json({
          success: false,
          error: "Ashram cannot be featured until an active subscription with featured listing entitlement exists.",
        });
        return;
      }

      const inserted = db.transaction(() => {
        const result = db
          .prepare(
            `
            INSERT INTO ashrams (
              slug,
              name,
              short_name,
              founder,
              spiritual_head,
              tradition,
              founded,
              summary,
              description,
              history,
              activities_json,
              stay,
              food,
              courses_json,
              contact_note,
              image,
              gallery_json,
              city,
              district,
              state,
              country,
              location_id,
              country_location_id,
              state_location_id,
              district_location_id,
              city_location_id,
              address,
              latitude,
              longitude,
              map_url,
              contact_phone,
              contact_email,
              website_url,
              stay_available,
              retreat_available,
              facilities_json,
              programs_json,
              timings_json,
              booking_enabled,
              status,
              featured,
              listing_active,
              created_at,
              updated_at
            ) VALUES (
              ?,?,?,?,?,?,?,?,?,?,
              ?,?,?,?,?,?,
              ?,?,?,?,?,?,?,?,?,?,
              ?,?,?,?,?,?,
              ?,?,?,?,?,?,
              ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
            )
            `,
          )
          .run(
            slug,
            name,
            nullableText(body.shortName, 120),
            nullableText(body.founder, 250),
            nullableText(body.spiritualHead, 250),
            nullableText(body.tradition, 150),
            nullableText(body.founded, 100),
            nullableText(body.summary, 5000),
            nullableText(body.description, MAX_DETAIL_TEXT),
            nullableText(body.history, MAX_DETAIL_TEXT),
            normalizeJsonArray(body.activities, 100),
            nullableText(body.stay, 10000),
            nullableText(body.food, 5000),
            normalizeJsonArray(body.courses, 100),
            nullableText(body.contactNote, 5000),
            nullableText(body.image, 4000),
            normalizeJsonArray(body.gallery, 50, 4000),
            location.city ?? nullableText(body.city, 120),
            location.district ?? nullableText(body.district, 120),
            location.state ?? nullableText(body.state, 120),
            nullableText(body.country, 100) ?? location.country ?? "India",
            location.locationId,
            location.countryLocationId,
            location.stateLocationId,
            location.districtLocationId,
            location.cityLocationId,
            nullableText(body.address, 1000),
            numberInRange(body.latitude, null, -90, 90),
            numberInRange(body.longitude, null, -180, 180),
            nullableText(body.mapUrl, 3000),
            phone,
            email,
            nullableText(body.websiteUrl, 3000),
            booleanValue(body.stayAvailable, false) ? 1 : 0,
            booleanValue(body.retreatAvailable, false) ? 1 : 0,
            normalizeJsonArray(body.facilities, 100),
            "[]",
            normalizeJsonObject(body.timings, 100, 5000),
            bookingEnabled,
            status,
            0,
            0,
          );

        return Number(result.lastInsertRowid);
      })();

      const created = ashramByIdentifier(String(inserted));
      audit(req, "ashram.created", "ashram", inserted, null, created);

      res.status(201).json({
        success: true,
        ashram: created
          ? serializeAshram(created, { includePrivate: true })
          : null,
      });
    } catch (error) {
      console.error("Ashram create error:", error);
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("Selected location") ||
        message.includes("valid Ashram") ||
        message.includes("Invalid Ashram status")
      ) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Unable to create Ashram.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Ashram profile update                                                      */
/* -------------------------------------------------------------------------- */

router.patch(
  "/:id",
  requireAuth,
  requirePermission("ashram.manage_assigned"),
  requireRole("ashram_manager", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const existing = ashramByIdentifier(String(ashramId));
      if (!existing) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      if (!requireAshramAccess(user, Number(existing.id), res, "manage")) return;

      const body = req.body && typeof req.body === "object"
        ? req.body as Row
        : {};
      const updates: string[] = [];
      const values: unknown[] = [];
      const fields: string[] = [];
      const has = (key: string): boolean =>
        Object.prototype.hasOwnProperty.call(body, key);

      const addText = (key: string, column: string, max: number): void => {
        if (!has(key)) return;
        updates.push(`${column} = ?`);
        values.push(nullableText(body[key], max));
        fields.push(column);
      };

      addText("name", "name", 250);
      addText("shortName", "short_name", 120);
      addText("founder", "founder", 250);
      addText("spiritualHead", "spiritual_head", 250);
      addText("tradition", "tradition", 150);
      addText("founded", "founded", 100);
      addText("summary", "summary", 5000);
      addText("description", "description", MAX_DETAIL_TEXT);
      addText("history", "history", MAX_DETAIL_TEXT);
      addText("stay", "stay", 10000);
      addText("food", "food", 5000);
      addText("contactNote", "contact_note", 5000);
      addText("image", "image", 4000);
      addText("address", "address", 1000);
      addText("mapUrl", "map_url", 3000);
      addText("websiteUrl", "website_url", 3000);

      if (has("contactEmail")) {
        const email = normalizeEmail(body.contactEmail);
        if (body.contactEmail && !email) {
          res.status(400).json({
            success: false,
            error: "Please enter a valid Ashram contact email.",
          });
          return;
        }
        updates.push("contact_email = ?");
        values.push(email);
        fields.push("contact_email");
      }

      if (has("contactPhone")) {
        const phone = normalizePhone(body.contactPhone);
        if (body.contactPhone && !phone) {
          res.status(400).json({
            success: false,
            error: "Please enter a valid Ashram contact phone.",
          });
          return;
        }
        updates.push("contact_phone = ?");
        values.push(phone);
        fields.push("contact_phone");
      }

      if (["city", "district", "state", "country"].some((key) => has(key)) && !has("locationId")) {
        res.status(400).json({
          success: false,
          error: "Use locationId to change Ashram location so the location hierarchy remains consistent.",
        });
        return;
      }

      if (has("locationId")) {
        const location = validateLocationId(positiveId(body.locationId));
        updates.push(
          "location_id = ?",
          "country_location_id = ?",
          "state_location_id = ?",
          "district_location_id = ?",
          "city_location_id = ?",
          "country = COALESCE(?, country)",
          "state = ?",
          "district = ?",
          "city = ?",
        );
        values.push(
          location.locationId,
          location.countryLocationId,
          location.stateLocationId,
          location.districtLocationId,
          location.cityLocationId,
          location.country,
          location.state,
          location.district,
          location.city,
        );
        fields.push("location");
      }

      if (has("latitude")) {
        updates.push("latitude = ?");
        values.push(numberInRange(body.latitude, null, -90, 90));
        fields.push("latitude");
      }

      if (has("longitude")) {
        updates.push("longitude = ?");
        values.push(numberInRange(body.longitude, null, -180, 180));
        fields.push("longitude");
      }

      if (has("activities")) {
        updates.push("activities_json = ?");
        values.push(normalizeJsonArray(body.activities, 100));
        fields.push("activities_json");
      }

      if (has("facilities")) {
        updates.push("facilities_json = ?");
        values.push(normalizeJsonArray(body.facilities, 100));
        fields.push("facilities_json");
      }

      if (has("timings")) {
        updates.push("timings_json = ?");
        values.push(normalizeJsonObject(body.timings, 100, 5000));
        fields.push("timings_json");
      }

      if (has("courses")) {
        updates.push("courses_json = ?");
        values.push(normalizeJsonArray(body.courses, 100));
        fields.push("courses_json");
      }

      if (has("gallery")) {
        const gallery = Array.isArray(body.gallery)
          ? body.gallery
          : parseJsonArray(body.gallery);
        enforceGalleryLimit(Number(existing.id), gallery, user);
        updates.push("gallery_json = ?");
        values.push(normalizeJsonArray(gallery, 100, 4000));
        fields.push("gallery_json");
      }

      if (has("stayAvailable")) {
        updates.push("stay_available = ?");
        values.push(booleanValue(body.stayAvailable) ? 1 : 0);
        fields.push("stay_available");
      }

      if (has("retreatAvailable")) {
        updates.push("retreat_available = ?");
        values.push(booleanValue(body.retreatAvailable) ? 1 : 0);
        fields.push("retreat_available");
      }

      if (has("bookingEnabled")) {
        updates.push("booking_enabled = ?");
        values.push(booleanValue(body.bookingEnabled) ? 1 : 0);
        fields.push("booking_enabled");
      }

      if (has("slug")) {
        const name = text(body.name ?? existing.name, 250);
        updates.push("slug = ?");
        values.push(uniqueAshramSlug(body.slug, name, Number(existing.id)));
        fields.push("slug");
      }

      if (isSuperAdmin(user)) {
        if (has("status")) {
          const status = text(body.status, 20).toLowerCase();
          if (!(EDITABLE_STATUS as readonly string[]).includes(status)) {
            res.status(400).json({ success: false, error: "Invalid Ashram status." });
            return;
          }

          updates.push("status = ?");
          values.push(status);
          fields.push("status");

          if (status !== PUBLIC_STATUS) {
            updates.push("listing_active = 0", "featured = 0");
            fields.push("listing_active", "featured");
          }
        }

        if (has("featured")) {
          const wantedFeatured = booleanValue(body.featured, false);
          if (wantedFeatured) {
            const subscription = activeSubscriptionForAshram(Number(existing.id));
            if (!subscription || Number(subscription.featured_listing ?? 0) !== 1) {
              res.status(400).json({
                success: false,
                error: "Featured Ashram visibility requires an active plan with featured listing entitlement.",
              });
              return;
            }
          }
          updates.push("featured = ?");
          values.push(wantedFeatured ? 1 : 0);
          fields.push("featured");
        }

        if (has("listingActive")) {
          res.status(403).json({
            success: false,
            error: "listingActive is controlled by the Ashram subscription lifecycle and cannot be changed manually from this route.",
          });
          return;
        }
      } else {
        if (["status", "featured", "listingActive"].some((key) => has(key))) {
          res.status(403).json({
            success: false,
            error: "Ashram status, featured visibility and listing activation are controlled by Super Admin/subscription lifecycle.",
          });
          return;
        }
      }

      if (!updates.length) {
        res.status(400).json({
          success: false,
          error: "No supported Ashram fields were supplied.",
        });
        return;
      }

      const oldData = { ...existing };
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(Number(existing.id));

      db.prepare(
        `UPDATE ashrams SET ${updates.join(", ")} WHERE id = ?`,
      ).run(...values);

      const updated = ashramByIdentifier(String(existing.id));
      audit(req, "ashram.updated", "ashram", Number(existing.id), oldData, updated);

      if (updated && oldData.status !== updated.status) {
        const activeAssignment = activeAssignmentForAshram(Number(existing.id));
        if (activeAssignment?.manager_user_id) {
          notifyUser(
            Number(activeAssignment.manager_user_id),
            "ashram_status",
            "Ashram listing status updated",
            `Your Ashram status is now ${String(updated.status)}.`,
            `/ashrams/${updated.slug}`,
            { ashramId: Number(existing.id), status: updated.status },
          );
        }
      }

      res.json({
        success: true,
        updatedFields: Array.from(new Set(fields)),
        ashram: updated
          ? serializeAshram(updated, { includePrivate: true })
          : null,
      });
    } catch (error) {
      console.error("Ashram update error:", error);
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("Selected location") ||
        message.includes("Ashram plan") ||
        message.includes("active Ashram subscription") ||
        message.includes("gallery") ||
        message.includes("Featured Ashram") ||
        message.includes("Invalid Ashram status")
      ) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Unable to update Ashram.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Soft delete / archive                                                      */
/* -------------------------------------------------------------------------- */

router.delete(
  "/:id",
  requireAuth,
  requirePermission("admin.manage_ashrams"),
  requireRole("super_admin"),
  (req: Request, res: Response) => {
    try {
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const existing = ashramByIdentifier(String(ashramId));
      if (!existing) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      db.prepare(
        `
        UPDATE ashrams
        SET status = 'unpublished',
            listing_active = 0,
            featured = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
      ).run(ashramId);

      const updated = ashramByIdentifier(String(ashramId));
      audit(req, "ashram.unpublished", "ashram", ashramId, existing, updated);

      const activeAssignment = activeAssignmentForAshram(ashramId);
      if (activeAssignment?.manager_user_id) {
        notifyUser(
          Number(activeAssignment.manager_user_id),
          "ashram_archived",
          "Ashram listing archived",
          "Your Ashram listing has been unpublished by DivyaDhara administration.",
          `/ashrams/${updated?.slug ?? ashramId}`,
          { ashramId },
        );
      }

      res.json({
        success: true,
        archived: true,
        ashram: updated
          ? serializeAshram(updated, { includePrivate: true })
          : null,
      });
    } catch (error) {
      console.error("Ashram archive error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to archive Ashram.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Programs                                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  "/:id/programs",
  optionalAuth,
  (req: Request, res: Response) => {
    try {
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      const user = currentUser(res);
      const privateAccess = userCanViewAshram(user, Number(ashram.id));
      if (!publicVisible(ashram) && !privateAccess) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      res.json({
        success: true,
        ashramId: Number(ashram.id),
        programs: loadPrograms(Number(ashram.id), privateAccess),
      });
    } catch (error) {
      console.error("Ashram programs list error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load Ashram programs.",
      });
    }
  },
);

router.post(
  "/:id/programs",
  requireAuth,
  requirePermission("ashram.manage_programs"),
  requireRole("ashram_manager", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      if (!requireAshramAccess(user, Number(ashram.id), res, "manage")) return;

      const body = req.body && typeof req.body === "object"
        ? req.body as Row
        : {};
      const title = text(body.title, 250);
      if (title.length < 2) {
        res.status(400).json({
          success: false,
          error: "Program title must contain at least 2 characters.",
        });
        return;
      }

      enforceProgramLimit(Number(ashram.id), user);

      const isActive = booleanValue(body.isActive, true);
      const sortOrder = integerInRange(body.sortOrder, 0, 0, 100000);
      const slug = uniqueProgramSlug(Number(ashram.id), body.slug, title);

      const result = db.transaction(() => {
        const program = db
          .prepare(
            `
            INSERT INTO ashram_programs (
              ashram_id,
              title,
              slug,
              description,
              program_type,
              duration_text,
              price_amount,
              currency,
              image,
              start_date,
              end_date,
              is_active,
              sort_order,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `,
          )
          .run(
            ashram.id,
            title,
            slug,
            nullableText(body.description, 10000),
            nullableText(body.programType, 120),
            nullableText(body.durationText, 120),
            numberInRange(body.priceAmount, null, 0, 1000000000),
            nullableText(body.currency, 10)?.toUpperCase() || "INR",
            nullableText(body.image, 4000),
            nullableText(body.startDate, 40),
            nullableText(body.endDate, 40),
            isActive ? 1 : 0,
            sortOrder,
          );

        const programId = Number(program.lastInsertRowid);
        syncProgramsJson(Number(ashram.id));
        return programId;
      })();

      const created = db
        .prepare(`SELECT * FROM ashram_programs WHERE id = ? LIMIT 1`)
        .get(result) as Row | undefined;

      audit(req, "ashram.program_created", "ashram_program", result, null, created);

      res.status(201).json({
        success: true,
        program: created ? serializeProgram(created) : null,
      });
    } catch (error) {
      console.error("Ashram program create error:", error);
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("Ashram plan") ||
        message.includes("subscription") ||
        message.includes("programs/courses")
      ) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Unable to create Ashram program.",
      });
    }
  },
);

router.patch(
  "/:id/programs/:programId",
  requireAuth,
  requirePermission("ashram.manage_programs"),
  requireRole("ashram_manager", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      const programId = positiveId(req.params.programId);
      if (!ashramId || !programId) {
        res.status(400).json({
          success: false,
          error: "Invalid Ashram or program id.",
        });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      if (!requireAshramAccess(user, Number(ashram.id), res, "manage")) return;

      const existing = db
        .prepare(
          `
          SELECT *
          FROM ashram_programs
          WHERE id = ? AND ashram_id = ?
          LIMIT 1
          `,
        )
        .get(programId, ashram.id) as Row | undefined;

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Ashram program not found.",
        });
        return;
      }

      const body = req.body && typeof req.body === "object"
        ? req.body as Row
        : {};
      const updates: string[] = [];
      const values: unknown[] = [];

      const textFields: Array<[string, string, number]> = [
        ["title", "title", 250],
        ["description", "description", 10000],
        ["programType", "program_type", 120],
        ["durationText", "duration_text", 120],
        ["image", "image", 4000],
        ["startDate", "start_date", 40],
        ["endDate", "end_date", 40],
      ];

      for (const [input, column, max] of textFields) {
        if (!Object.prototype.hasOwnProperty.call(body, input)) continue;
        updates.push(`${column} = ?`);
        values.push(nullableText(body[input], max));
      }

      if (Object.prototype.hasOwnProperty.call(body, "slug")) {
        const title = text(body.title ?? existing.title, 250);
        updates.push("slug = ?");
        values.push(
          uniqueProgramSlug(Number(ashram.id), body.slug, title, programId),
        );
      }

      if (Object.prototype.hasOwnProperty.call(body, "priceAmount")) {
        updates.push("price_amount = ?");
        values.push(numberInRange(body.priceAmount, null, 0, 1000000000));
      }

      if (Object.prototype.hasOwnProperty.call(body, "currency")) {
        updates.push("currency = ?");
        values.push(nullableText(body.currency, 10)?.toUpperCase() || "INR");
      }

      if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
        const wanted = booleanValue(body.isActive, true);
        if (wanted && Number(existing.is_active ?? 0) !== 1) {
          enforceProgramLimit(Number(ashram.id), user);
        }
        updates.push("is_active = ?");
        values.push(wanted ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(body, "sortOrder")) {
        updates.push("sort_order = ?");
        values.push(integerInRange(body.sortOrder, 0, 0, 100000));
      }

      if (!updates.length) {
        res.status(400).json({
          success: false,
          error: "No supported program fields were supplied.",
        });
        return;
      }

      const oldData = { ...existing };
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(programId, Number(ashram.id));

      db.transaction(() => {
        db.prepare(
          `UPDATE ashram_programs SET ${updates.join(", ")} WHERE id = ? AND ashram_id = ?`,
        ).run(...values);
        syncProgramsJson(Number(ashram.id));
      })();

      const updated = db
        .prepare(`SELECT * FROM ashram_programs WHERE id = ? LIMIT 1`)
        .get(programId) as Row | undefined;

      audit(req, "ashram.program_updated", "ashram_program", programId, oldData, updated);

      res.json({
        success: true,
        program: updated ? serializeProgram(updated) : null,
      });
    } catch (error) {
      console.error("Ashram program update error:", error);
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("subscription") ||
        message.includes("programs/courses")
      ) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Unable to update Ashram program.",
      });
    }
  },
);

router.delete(
  "/:id/programs/:programId",
  requireAuth,
  requirePermission("ashram.manage_programs"),
  requireRole("ashram_manager", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      const programId = positiveId(req.params.programId);
      if (!ashramId || !programId) {
        res.status(400).json({
          success: false,
          error: "Invalid Ashram or program id.",
        });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }
      if (!requireAshramAccess(user, Number(ashram.id), res, "manage")) return;

      const existing = db
        .prepare(
          `
          SELECT *
          FROM ashram_programs
          WHERE id = ? AND ashram_id = ?
          LIMIT 1
          `,
        )
        .get(programId, ashram.id) as Row | undefined;

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Ashram program not found.",
        });
        return;
      }

      db.transaction(() => {
        db.prepare(
          `DELETE FROM ashram_programs WHERE id = ? AND ashram_id = ?`,
        ).run(programId, ashram.id);
        syncProgramsJson(Number(ashram.id));
      })();

      audit(req, "ashram.program_deleted", "ashram_program", programId, existing, null);

      res.json({ success: true, deleted: true, programId });
    } catch (error) {
      console.error("Ashram program delete error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to delete Ashram program.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Course relations                                                           */
/* -------------------------------------------------------------------------- */

router.get(
  "/:id/courses",
  optionalAuth,
  (req: Request, res: Response) => {
    try {
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      const user = currentUser(res);
      const privateAccess = userCanViewAshram(user, Number(ashram.id));
      if (!publicVisible(ashram) && !privateAccess) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }

      res.json({
        success: true,
        ashramId: Number(ashram.id),
        courses: loadCourses(Number(ashram.id), privateAccess),
      });
    } catch (error) {
      console.error("Ashram courses list error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load Ashram courses.",
      });
    }
  },
);

router.post(
  "/:id/courses",
  requireAuth,
  requirePermission("ashram.manage_programs"),
  requireRole("ashram_manager", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      if (!ashramId) {
        res.status(400).json({ success: false, error: "Invalid Ashram id." });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }
      if (!requireAshramAccess(user, Number(ashram.id), res, "manage")) return;

      const body = req.body && typeof req.body === "object"
        ? req.body as Row
        : {};
      const courseId = positiveId(body.courseId);
      if (!courseId) {
        res.status(400).json({ success: false, error: "courseId is required." });
        return;
      }

      const course = db
        .prepare(`SELECT id, title, status FROM courses WHERE id = ? LIMIT 1`)
        .get(courseId) as Row | undefined;

      if (!course) {
        res.status(404).json({ success: false, error: "Course not found." });
        return;
      }

      const duplicate = db
        .prepare(
          `SELECT 1 FROM ashram_courses WHERE ashram_id = ? AND course_id = ? LIMIT 1`,
        )
        .get(ashram.id, courseId);

      if (duplicate) {
        res.status(409).json({
          success: false,
          error: "This course is already linked to the Ashram.",
        });
        return;
      }

      enforceProgramLimit(Number(ashram.id), user);

      db.transaction(() => {
        db.prepare(
          `
          INSERT INTO ashram_courses (
            ashram_id,
            course_id,
            is_featured,
            created_at
          ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `,
        ).run(
          ashram.id,
          courseId,
          booleanValue(body.isFeatured, false) ? 1 : 0,
        );
        syncCoursesJson(Number(ashram.id));
      })();

      const relation = db
        .prepare(
          `
          SELECT
            c.*,
            ac.is_featured AS relation_featured
          FROM ashram_courses ac
          INNER JOIN courses c ON c.id = ac.course_id
          WHERE ac.ashram_id = ?
            AND ac.course_id = ?
          LIMIT 1
          `,
        )
        .get(ashram.id, courseId) as Row | undefined;

      audit(req, "ashram.course_linked", "ashram", Number(ashram.id), null, {
        courseId,
      });

      res.status(201).json({
        success: true,
        course: relation ? serializeCourse(relation) : null,
      });
    } catch (error) {
      console.error("Ashram course link error:", error);
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("subscription") ||
        message.includes("programs/courses")
      ) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Unable to link course to Ashram.",
      });
    }
  },
);

router.patch(
  "/:id/courses/:courseId",
  requireAuth,
  requirePermission("ashram.manage_programs"),
  requireRole("ashram_manager", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      const courseId = positiveId(req.params.courseId);
      if (!ashramId || !courseId) {
        res.status(400).json({
          success: false,
          error: "Invalid Ashram or course id.",
        });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }
      if (!requireAshramAccess(user, Number(ashram.id), res, "manage")) return;

      const existing = db
        .prepare(
          `
          SELECT *
          FROM ashram_courses
          WHERE ashram_id = ? AND course_id = ?
          LIMIT 1
          `,
        )
        .get(ashram.id, courseId) as Row | undefined;

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Ashram course relation not found.",
        });
        return;
      }

      const body = req.body && typeof req.body === "object"
        ? req.body as Row
        : {};
      if (!Object.prototype.hasOwnProperty.call(body, "isFeatured")) {
        res.status(400).json({
          success: false,
          error: "isFeatured is required for this update.",
        });
        return;
      }

      const featured = booleanValue(body.isFeatured, false) ? 1 : 0;
      db.prepare(
        `
        UPDATE ashram_courses
        SET is_featured = ?
        WHERE ashram_id = ? AND course_id = ?
        `,
      ).run(featured, ashram.id, courseId);

      syncCoursesJson(Number(ashram.id));

      audit(
        req,
        "ashram.course_relation_updated",
        "ashram",
        Number(ashram.id),
        existing,
        { courseId, featured },
      );

      const relation = db
        .prepare(
          `
          SELECT *
          FROM ashram_courses
          WHERE ashram_id = ? AND course_id = ?
          LIMIT 1
          `,
        )
        .get(ashram.id, courseId);

      res.json({ success: true, relation });
    } catch (error) {
      console.error("Ashram course relation update error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to update Ashram course relation.",
      });
    }
  },
);

router.delete(
  "/:id/courses/:courseId",
  requireAuth,
  requirePermission("ashram.manage_programs"),
  requireRole("ashram_manager", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUser(res);
      const ashramId = positiveId(req.params.id);
      const courseId = positiveId(req.params.courseId);
      if (!ashramId || !courseId) {
        res.status(400).json({
          success: false,
          error: "Invalid Ashram or course id.",
        });
        return;
      }

      const ashram = ashramByIdentifier(String(ashramId));
      if (!ashram) {
        res.status(404).json({ success: false, error: "Ashram not found." });
        return;
      }
      if (!requireAshramAccess(user, Number(ashram.id), res, "manage")) return;

      const existing = db
        .prepare(
          `
          SELECT *
          FROM ashram_courses
          WHERE ashram_id = ? AND course_id = ?
          LIMIT 1
          `,
        )
        .get(ashram.id, courseId) as Row | undefined;

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Ashram course relation not found.",
        });
        return;
      }

      db.transaction(() => {
        db.prepare(
          `DELETE FROM ashram_courses WHERE ashram_id = ? AND course_id = ?`,
        ).run(ashram.id, courseId);
        syncCoursesJson(Number(ashram.id));
      })();

      audit(req, "ashram.course_unlinked", "ashram", Number(ashram.id), existing, null);

      res.json({ success: true, deleted: true, courseId });
    } catch (error) {
      console.error("Ashram course unlink error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to unlink Ashram course.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

export { router as ashramRouter, router as ashramRoutes };
export default router;
