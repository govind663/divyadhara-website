import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { db } from "../db/database.ts";
import {
  optionalAuth,
  requireAuth,
  type AuthenticatedUser,
} from "./auth.ts";

const router = Router();

/*
 * DivyaDhara Temple API — business aligned
 *
 * Ownership model:
 *   - super_admin: full editorial/admin control
 *   - temple_manager: only assigned temples, subject to plan entitlements
 *   - sales: read-only commercial/onboarding visibility; no content mutation
 *   - other roles: public APIs only
 *
 * Primary authorization for Temple Managers is temple_manager_assignments.
 * temple_subscriptions.manager_user_id is billing metadata only and is never
 * used as a substitute for an active assignment.
 *
 * Subscription lifecycle/payment mutation belongs to subscriptions.ts/payments.ts.
 * Lead creation/status/assignment/credit consumption belongs to leads.ts.
 */

type Row = Record<string, unknown>;
type ResourceRow = Record<string, unknown>;

type LocationContext = {
  locationId: number | null;
  countryId: number | null;
  stateId: number | null;
  districtId: number | null;
  cityId: number | null;
  areaId: number | null;
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  area: string | null;
};

type ResourceField = {
  type: "text" | "int" | "bool" | "source_type";
  max: number;
  required?: boolean;
  defaultValue?: unknown;
};

type ResourceConfig = {
  table: string;
  route: string;
  fields: Record<string, ResourceField>;
  orderBy: string;
};

type TempleSubscriptionSummary = Row & {
  id: number;
  temple_id: number;
  manager_user_id: number | null;
  plan_id: number;
  subscription_plan_price_id: number | null;
  billing_interval: string;
  duration_days: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  lead_limit: number;
  leads_used: number;
  service_limit: number;
  service_area_limit: number;
  gallery_limit: number;
  video_limit: number;
  program_limit: number;
  listing_enabled: number;
  featured_listing: number;
  priority_support: number;
  verification_badge: number;
  analytics_access: number;
  homepage_promotion: number;
  live_aarti_enabled: number;
  enhanced_seo: number;
  enhanced_profile: number;
  whatsapp_enquiry: number;
  search_visibility: string;
  analytics_level: string;
  price_amount: number;
  currency: string;
  plan_code?: string;
  plan_name?: string;
  plan_description?: string;
  plan_price_amount?: number;
  plan_currency?: string;
  price_variant_amount?: number;
  price_variant_currency?: string;
  price_variant_interval?: string;
  price_variant_duration_days?: number;
  price_variant_provider?: string;
};

const TEMPLE_STATUSES = ["draft", "pending", "published", "unpublished"] as const;
const CHILD_CONTENT_STATUSES = ["draft", "published", "unpublished"] as const;
const SOURCE_TYPES = ["Official Temple", "Government", "Tourism", "Ministry", "Reference"] as const;
const SCHEDULE_TYPES = ["darshan", "aarti", "puja", "other"] as const;
const LIVE_PROVIDERS = ["youtube", "youtube-channel", "hls", "ipcamlive", "external"] as const;
const SEO_KEYWORD_TYPES = ["primary", "location", "long_tail", "search_intent"] as const;

const RESOURCE_CONFIGS: ResourceConfig[] = [
  {
    table: "temple_history",
    route: "history",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      title: { type: "text", max: 250 },
      content: { type: "text", max: 15000, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_significance",
    route: "significance",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      content: { type: "text", max: 15000, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_divine_attractions",
    route: "attractions",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      title: { type: "text", max: 250, required: true },
      description: { type: "text", max: 10000 },
      image: { type: "text", max: 2000 },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_scriptural_connections",
    route: "scriptural-connections",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      title: { type: "text", max: 250, required: true },
      context: { type: "text", max: 15000, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_pilgrim_experience",
    route: "pilgrim-experience",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      content: { type: "text", max: 15000, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_bhagavata_connections",
    route: "bhagavata-connections",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      content: { type: "text", max: 15000, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_darshan_timings",
    route: "darshan-timings",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      label: { type: "text", max: 250, required: true },
      time_text: { type: "text", max: 120, required: true },
      day_of_week: { type: "int", max: 6 },
      season: { type: "text", max: 150 },
      valid_from: { type: "text", max: 40 },
      valid_to: { type: "text", max: 40 },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_aarti",
    route: "aarti",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      name: { type: "text", max: 250, required: true },
      time_text: { type: "text", max: 120, required: true },
      description: { type: "text", max: 10000 },
      day_of_week: { type: "int", max: 6 },
      season: { type: "text", max: 150 },
      valid_from: { type: "text", max: 40 },
      valid_to: { type: "text", max: 40 },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_festivals",
    route: "festivals",
    orderBy: "sort_order ASC, COALESCE(event_start_date, ''), id ASC",
    fields: {
      name: { type: "text", max: 250, required: true },
      month: { type: "text", max: 100 },
      description: { type: "text", max: 10000 },
      event_start_date: { type: "text", max: 40 },
      event_end_date: { type: "text", max: 40 },
      year: { type: "int", max: 2200 },
      image: { type: "text", max: 2000 },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_facilities",
    route: "facilities",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      name: { type: "text", max: 250, required: true },
      description: { type: "text", max: 10000 },
      icon: { type: "text", max: 100 },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_how_to_reach",
    route: "how-to-reach",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      mode: { type: "text", max: 100, required: true },
      detail: { type: "text", max: 10000, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_committee",
    route: "committee",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      name: { type: "text", max: 250, required: true },
      role: { type: "text", max: 250, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_faqs",
    route: "faqs",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      question: { type: "text", max: 1000, required: true },
      answer: { type: "text", max: 15000, required: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_nearby_places",
    route: "nearby-places",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      name: { type: "text", max: 300, required: true },
      distance_text: { type: "text", max: 120 },
      description: { type: "text", max: 10000 },
      location_id: { type: "int", max: 100000000 },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_sources",
    route: "sources",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      title: { type: "text", max: 300, required: true },
      organization: { type: "text", max: 300, required: true },
      url: { type: "text", max: 2000, required: true },
      source_type: { type: "source_type", max: 60, required: true },
      purpose: { type: "text", max: 1000 },
      last_verified: { type: "text", max: 40 },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
      is_active: { type: "bool", max: 1, defaultValue: true },
    },
  },
  {
    table: "temple_schedules",
    route: "schedules",
    orderBy: "sort_order ASC, id ASC",
    fields: {
      schedule_type: { type: "text", max: 20, required: true },
      title: { type: "text", max: 250, required: true },
      day_of_week: { type: "int", max: 6 },
      start_time: { type: "text", max: 20 },
      end_time: { type: "text", max: 20 },
      season: { type: "text", max: 150 },
      notes: { type: "text", max: 10000 },
      is_active: { type: "bool", max: 1, defaultValue: true },
      sort_order: { type: "int", max: 100000, defaultValue: 0 },
    },
  },
];

const ROOT_TEXT_FIELDS: Record<string, number> = {
  name: 250,
  sanskrit_name: 250,
  deity: 250,
  temple_type: 120,
  tradition: 200,
  established: 200,
  summary: 4000,
  description: 30000,
  history: 30000,
  stay: 5000,
  food: 5000,
  contact_note: 5000,
  image: 2000,
  logo: 2000,
  city: 150,
  district: 150,
  state: 150,
  country: 120,
  address: 3000,
  map_url: 2000,
  trust_name: 300,
  rating_text: 120,
  peetha_body_part: 250,
  shakti_form: 250,
  bhairava: 250,
  identification_note: 5000,
  map_embed_note: 5000,
  contact_phone: 40,
  contact_email: 320,
  website_url: 2000,
  story_video_id: 250,
  content_note: 5000,
};

const ROOT_JSON_FIELDS = new Set([
  "activities_json",
  "schedule_json",
  "courses_json",
  "gallery_json",
  "category_json",
]);
const ROOT_INTEGER_FIELDS = new Set(["peetha_number"]);
const ROOT_LOCATION_FIELDS = new Set([
  "location_id",
  "country_location_id",
  "state_location_id",
  "district_location_id",
  "city_location_id",
]);
const ROOT_BOOLEAN_FIELDS = new Set(["booking_enabled", "featured"]);

function normalizeText(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength = 500): string | null {
  const text = normalizeText(value, maxLength);
  return text || null;
}

function positiveId(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function integerInRange(value: unknown, min: number, max: number, fallback: number | null = null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const integer = Math.floor(number);
  return integer >= min && integer <= max ? integer : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = normalizeText(value, 20).toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function parseJson(value: unknown, fallback: unknown = []): unknown {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function toJson(value: unknown, fallback = "[]"): string {
  try {
    const parsedFallback = JSON.parse(fallback);
    const result = JSON.stringify(value ?? parsedFallback);
    return result.length <= 200000 ? result : fallback;
  } catch {
    return fallback;
  }
}

function slugify(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return base || "temple";
}

function uniqueTempleSlug(name: string, requestedSlug?: unknown, excludeId?: number): string {
  const base = slugify(normalizeText(requestedSlug, 100) || name);
  let slug = base;
  let suffix = 1;
  while (true) {
    const row = db.prepare("SELECT id FROM temples WHERE slug = ? LIMIT 1").get(slug) as { id?: number } | undefined;
    if (!row || row.id === excludeId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

function uniqueEntitySlug(table: "gallery_items" | "videos", name: string, requestedSlug?: unknown, excludeId?: number): string {
  const base = slugify(normalizeText(requestedSlug, 120) || name);
  let slug = base;
  let suffix = 1;
  while (true) {
    const row = db.prepare(`SELECT id FROM ${table} WHERE slug = ? LIMIT 1`).get(slug) as { id?: number } | undefined;
    if (!row || row.id === excludeId) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded[0]) return nullableText(forwarded[0], 100);
  if (typeof forwarded === "string" && forwarded) return nullableText(forwarded.split(",")[0], 100);
  return nullableText(req.ip, 100);
}

function userAgent(req: Request): string | null {
  return nullableText(req.get("user-agent"), 500);
}

function currentUser(res: Response): AuthenticatedUser | null {
  return (res.locals.user as AuthenticatedUser | undefined) ?? null;
}

function auditLog(params: {
  userId?: number | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  oldData?: unknown;
  newData?: unknown;
  req: Request;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (
      user_id, action, entity_type, entity_id,
      old_data_json, new_data_json, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).run(
    params.userId ?? null,
    params.action,
    params.entityType ?? null,
    params.entityId ?? null,
    params.oldData === undefined ? null : toJson(params.oldData, "{}"),
    params.newData === undefined ? null : toJson(params.newData, "{}"),
    clientIp(params.req),
    userAgent(params.req),
  );
}

function safeHttpUrl(value: unknown, maxLength: number): string | null {
  const text = nullableText(value, maxLength);
  if (!text) return null;
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? text : null;
  } catch {
    return null;
  }
}

function locationRowById(locationId: number): { id: number; parent_id: number | null; type: string; name: string; status?: string } | undefined {
  return db.prepare(
    `SELECT id, parent_id, type, name, status FROM locations WHERE id = ? LIMIT 1`,
  ).get(locationId) as { id: number; parent_id: number | null; type: string; name: string; status?: string } | undefined;
}

function resolveLocationContext(body: Record<string, unknown>): LocationContext {
  const context: LocationContext = {
    locationId: positiveId(body.locationId ?? body.location_id),
    countryId: positiveId(body.countryId ?? body.country_location_id),
    stateId: positiveId(body.stateId ?? body.state_location_id),
    districtId: positiveId(body.districtId ?? body.district_location_id),
    cityId: positiveId(body.cityId ?? body.city_location_id),
    areaId: positiveId(body.areaId),
    country: nullableText(body.country, 120),
    state: nullableText(body.state, 150),
    district: nullableText(body.district, 150),
    city: nullableText(body.city, 150),
    area: nullableText(body.area, 180),
  };

  context.locationId = context.areaId ?? context.cityId ?? context.districtId ?? context.stateId ?? context.countryId ?? context.locationId;
  let cursor = context.locationId;
  let guard = 0;

  while (cursor && guard < 10) {
    guard += 1;
    const row = locationRowById(cursor);
    if (!row) break;
    switch (row.type) {
      case "country": context.countryId = row.id; context.country = row.name; break;
      case "state": context.stateId = row.id; context.state = row.name; break;
      case "district": context.districtId = row.id; context.district = row.name; break;
      case "city": context.cityId = row.id; context.city = row.name; break;
      case "area": context.areaId = row.id; context.area = row.name; break;
      default: break;
    }
    cursor = row.parent_id;
  }
  return context;
}

function validateLocationContext(context: LocationContext): string | null {
  const ids = [context.locationId, context.countryId, context.stateId, context.districtId, context.cityId, context.areaId]
    .filter((value): value is number => value !== null);
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = locationRowById(id);
    if (!row) return `Location #${id} was not found.`;
    if (row.status && row.status !== "active") return `Location #${id} is not active.`;
  }
  return null;
}

function buildTemplePath(slug: string): string { return `/temples/${slug}`; }

function getTempleById(id: number): Row | null {
  return (db.prepare("SELECT * FROM temples WHERE id = ? LIMIT 1").get(id) as Row | undefined) ?? null;
}

function getPublishedTempleBySlug(slug: string): Row | null {
  return (db.prepare(`SELECT * FROM temples WHERE slug = ? AND status = 'published' LIMIT 1`).get(slug) as Row | undefined) ?? null;
}


function hasPermission(user: AuthenticatedUser | null, permissionCode: string): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  const row = db.prepare(
    `SELECT 1
     FROM role_permissions rp
     INNER JOIN roles r ON r.id = rp.role_id
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE r.code = ? AND p.code = ?
     LIMIT 1`,
  ).get(user.role, permissionCode);
  return Boolean(row);
}

function isTempleManagerAssigned(templeId: number, userId: number): boolean {
  const row = db.prepare(
    `SELECT 1
     FROM temple_manager_assignments tma
     INNER JOIN users u ON u.id = tma.manager_user_id
     INNER JOIN roles r ON r.id = u.role_id
     WHERE tma.temple_id = ?
       AND tma.manager_user_id = ?
       AND tma.status = 'active'
       AND u.status = 'active'
       AND r.code = 'temple_manager'
     LIMIT 1`,
  ).get(templeId, userId);
  return Boolean(row);
}

function hasTempleEditorAccess(templeId: number, user: AuthenticatedUser | null): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return hasPermission(user, "admin.manage_temples");
  return user.role === "temple_manager" && hasPermission(user, "temple.manage_assigned") && isTempleManagerAssigned(templeId, user.id);
}

function requireTempleEditor(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(res);
  const templeId = positiveId(req.params.id);
  if (!user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }
  if (!templeId) {
    res.status(400).json({ success: false, error: "Invalid temple id." });
    return;
  }
  if (!hasTempleEditorAccess(templeId, user)) {
    res.status(403).json({ success: false, error: "You do not have permission to manage this temple." });
    return;
  }
  next();
}

function requireTempleLeadViewer(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(res);
  const templeId = positiveId(req.params.id);
  if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
  if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
  const allowed = user.role === "super_admin"
    ? hasPermission(user, "admin.manage_temples")
    : user.role === "temple_manager"
      && hasPermission(user, "temple.view_leads")
      && isTempleManagerAssigned(templeId, user.id);
  if (!allowed) {
    res.status(403).json({ success: false, error: "You do not have permission to view this temple's enquiries." });
    return;
  }
  next();
}

function requireSuperAdmin(_req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(res);
  if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
  if (user.role !== "super_admin" || !hasPermission(user, "admin.manage_temples")) {
    res.status(403).json({ success: false, error: "Only Super Admin can perform this operation." });
    return;
  }
  next();
}

function managerWorkspaceAllowed(user: AuthenticatedUser | null): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return hasPermission(user, "admin.manage_temples");
  if (user.role === "sales") return hasPermission(user, "sales.view_ashrams") || hasPermission(user, "temple.view");
  return user.role === "temple_manager" && hasPermission(user, "temple.manage_assigned");
}

function requireManagerWorkspace(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(res);
  if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
  if (!managerWorkspaceAllowed(user)) { res.status(403).json({ success: false, error: "You do not have permission to access the Temple workspace." }); return; }
  void req;
  next();
}

function getActiveTempleSubscription(templeId: number): TempleSubscriptionSummary | null {
  return (db.prepare(
    `SELECT
       ts.*,
       sp.code AS plan_code,
       sp.name AS plan_name,
       sp.description AS plan_description,
       sp.price_amount AS plan_price_amount,
       sp.currency AS plan_currency,
       spp.price_amount AS price_variant_amount,
       spp.currency AS price_variant_currency,
       spp.billing_interval AS price_variant_interval,
       spp.duration_days AS price_variant_duration_days,
       spp.provider AS price_variant_provider
     FROM temple_subscriptions ts
     INNER JOIN subscription_plans sp ON sp.id = ts.plan_id
     LEFT JOIN subscription_plan_prices spp ON spp.id = ts.subscription_plan_price_id
     WHERE ts.temple_id = ?
       AND ts.status = 'active'
       AND (ts.starts_at IS NULL OR ts.starts_at <= CURRENT_TIMESTAMP)
       AND (ts.expires_at IS NULL OR ts.expires_at >= CURRENT_TIMESTAMP)
     ORDER BY ts.id DESC
     LIMIT 1`,
  ).get(templeId) as TempleSubscriptionSummary | undefined) ?? null;
}

function publicSubscriptionFeatures(subscription: TempleSubscriptionSummary | null): Row | null {
  if (!subscription) return null;
  return {
    planCode: subscription.plan_code ?? null,
    planName: subscription.plan_name ?? null,
    billingInterval: subscription.billing_interval ?? null,
    durationDays: Number(subscription.duration_days ?? 0),
    listingEnabled: Boolean(subscription.listing_enabled),
    featuredListing: Boolean(subscription.featured_listing),
    prioritySupport: Boolean(subscription.priority_support),
    verificationBadge: Boolean(subscription.verification_badge),
    analyticsAccess: Boolean(subscription.analytics_access),
    homepagePromotion: Boolean(subscription.homepage_promotion),
    liveAartiEnabled: Boolean(subscription.live_aarti_enabled),
    enhancedSeo: Boolean(subscription.enhanced_seo),
    enhancedProfile: Boolean(subscription.enhanced_profile),
    whatsappEnquiry: Boolean(subscription.whatsapp_enquiry),
    searchVisibility: subscription.search_visibility,
    analyticsLevel: subscription.analytics_level,
    price: Number(subscription.price_amount ?? subscription.price_variant_amount ?? subscription.plan_price_amount ?? 0),
    currency: subscription.currency ?? subscription.price_variant_currency ?? subscription.plan_currency ?? "INR",
    limits: {
      lead: Number(subscription.lead_limit ?? 0),
      service: Number(subscription.service_limit ?? 0),
      serviceArea: Number(subscription.service_area_limit ?? 0),
      gallery: Number(subscription.gallery_limit ?? 0),
      video: Number(subscription.video_limit ?? 0),
      program: Number(subscription.program_limit ?? 0),
    },
  };
}

function requireActiveTempleFeature(
  templeId: number,
  feature: "live_aarti" | "enhanced_seo" | "analytics" | "gallery" | "video" | "service",
  res: Response,
): TempleSubscriptionSummary | null {
  const user = currentUser(res);
  const subscription = getActiveTempleSubscription(templeId);
  if (user?.role === "super_admin") return subscription;
  if (!subscription) {
    res.status(403).json({ success: false, error: "An active Temple subscription is required for this feature.", code: "TEMPLE_SUBSCRIPTION_REQUIRED" });
    return null;
  }
  const enabled = feature === "live_aarti"
    ? Boolean(subscription.live_aarti_enabled)
    : feature === "enhanced_seo"
      ? Boolean(subscription.enhanced_seo)
      : feature === "analytics"
        ? Boolean(subscription.analytics_access)
        : feature === "gallery"
          ? Number(subscription.gallery_limit ?? 0) > 0
          : feature === "video"
            ? Number(subscription.video_limit ?? 0) > 0
            : Number(subscription.service_limit ?? 0) > 0;
  if (!enabled) {
    res.status(403).json({
      success: false,
      error: `Your current Temple plan does not include ${feature.replace("_", " ")} access.`,
      code: "TEMPLE_PLAN_FEATURE_REQUIRED",
      planCode: subscription.plan_code ?? null,
    });
    return null;
  }
  return subscription;
}

function canManagerEditStatus(user: AuthenticatedUser | null, requestedStatus: string): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return user.role === "temple_manager" && requestedStatus === "pending";
}

function validateChildStatus(status: string): string | null {
  return CHILD_CONTENT_STATUSES.includes(status as typeof CHILD_CONTENT_STATUSES[number]) ? null : "Invalid content status.";
}

function activeCount(table: "gallery_items" | "videos", templeId: number): number {
  const sql = table === "gallery_items"
    ? `SELECT COUNT(*) AS count FROM gallery_items WHERE content_type = 'temple' AND related_entity_type = 'temple' AND related_entity_id = ?`
    : `SELECT COUNT(*) AS count FROM videos WHERE related_temple_id = ? AND is_active = 1`;
  const row = db.prepare(sql).get(templeId) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function publicTemple(temple: Row): Row {
  const context = resolveLocationContext({
    locationId: temple.location_id,
    countryId: temple.country_location_id,
    stateId: temple.state_location_id,
    districtId: temple.district_location_id,
    cityId: temple.city_location_id,
    country: temple.country,
    state: temple.state,
    district: temple.district,
    city: temple.city,
  });
  return {
    ...temple,
    booking_enabled: Boolean(temple.booking_enabled),
    featured: Boolean(temple.featured),
    activities: parseJson(temple.activities_json, []),
    schedule: parseJson(temple.schedule_json, []),
    courses: parseJson(temple.courses_json, []),
    gallery: parseJson(temple.gallery_json, []),
    categories: parseJson(temple.category_json, []),
    location: {
      locationId: context.locationId,
      countryId: context.countryId,
      stateId: context.stateId,
      districtId: context.districtId,
      cityId: context.cityId,
      areaId: context.areaId,
      country: context.country,
      state: context.state,
      district: context.district,
      city: context.city,
      area: context.area,
    },
  };
}

function getCategoryIdsForTemple(templeId: number): Row[] {
  return db.prepare(
    `SELECT tc.id, tc.name, tc.slug, tc.description, tcm.is_primary, tcm.sort_order
     FROM temple_category_map tcm
     INNER JOIN temple_categories tc ON tc.id = tcm.category_id
     WHERE tcm.temple_id = ? AND tc.is_active = 1
     ORDER BY tcm.is_primary DESC, tcm.sort_order ASC, tc.name ASC`,
  ).all(templeId) as Row[];
}

function getTempleGallery(templeId: number): Row[] {
  const items = db.prepare(
    `SELECT * FROM gallery_items
     WHERE content_type = 'temple' AND related_entity_type = 'temple' AND related_entity_id = ? AND status = 'published'
     ORDER BY featured DESC, sort_order ASC, id DESC`,
  ).all(templeId) as Row[];
  if (!items.length) return [];
  const media = db.prepare(
    `SELECT * FROM gallery_media WHERE gallery_item_id IN (${items.map(() => "?").join(",")}) ORDER BY sort_order ASC, id ASC`,
  ).all(...items.map((item) => Number(item.id))) as Row[];
  const byItem = new Map<number, Row[]>();
  for (const row of media) {
    const id = Number(row.gallery_item_id);
    byItem.set(id, [...(byItem.get(id) ?? []), row]);
  }
  return items.map((item) => ({ ...item, media: byItem.get(Number(item.id)) ?? [] }));
}

function getTempleVideos(templeId: number): Row[] {
  return db.prepare(
    `SELECT id, slug, title, short_description, description, provider, video_id, watch_url,
            video_provider, video_url, embed_url, external_video_id, thumbnail_url, image,
            duration_text, duration_seconds, category, tags_json, related_temple_id,
            location_id, country_location_id, state_location_id, district_location_id, city_location_id,
            status, featured, sort_order, published_at, created_at, updated_at
     FROM videos
     WHERE related_temple_id = ? AND status = 'published' AND is_active = 1
     ORDER BY featured DESC, sort_order ASC, COALESCE(published_at, updated_at) DESC, id DESC`,
  ).all(templeId).map((row) => {
    const item = row as Row;
    return { ...item, featured: Boolean(item.featured), tags: parseJson(item.tags_json, []) };
  }) as Row[];
}

function publicResourceCollection(templeId: number): Row {
  const result: Row = {};
  for (const config of RESOURCE_CONFIGS) {
    result[config.route] = db.prepare(
      `SELECT * FROM ${config.table} WHERE temple_id = ? AND is_active = 1 ORDER BY ${config.orderBy}`,
    ).all(templeId) as ResourceRow[];
  }
  result.categories = getCategoryIdsForTemple(templeId);
  result.pujas = db.prepare(
    `SELECT ps.*, tps.is_featured AS temple_puja_featured
     FROM temple_puja_services tps
     INNER JOIN puja_services ps ON ps.id = tps.puja_id
     WHERE tps.temple_id = ? AND ps.status = 'published'
     ORDER BY tps.is_featured DESC, ps.sort_order ASC, ps.name ASC`,
  ).all(templeId);
  const subscription = getActiveTempleSubscription(templeId);
  const galleryEnabled = Number(subscription?.gallery_limit ?? 0) > 0;
  const videoEnabled = Number(subscription?.video_limit ?? 0) > 0;
  const liveAartiEnabled = Boolean(subscription?.live_aarti_enabled);
  const enhancedSeoEnabled = Boolean(subscription?.enhanced_seo);
  result.gallery = galleryEnabled ? getTempleGallery(templeId) : [];
  result.videos = videoEnabled ? getTempleVideos(templeId) : [];
  result.liveAarti = liveAartiEnabled
    ? db.prepare(`SELECT * FROM temple_live_aarti WHERE temple_id = ? AND enabled = 1 LIMIT 1`).get(templeId) ?? null
    : null;
  result.seoKeywords = enhancedSeoEnabled
    ? db.prepare(`SELECT * FROM temple_seo_keywords WHERE temple_id = ? ORDER BY sort_order ASC, id ASC`).all(templeId)
    : [];
  return result;
}

/* --------------------------------------------------------------------------
 * SEO synchronisation
 * -------------------------------------------------------------------------- */

function syncTempleSeo(temple: Row, oldSlug: string | null): void {
  const slug = normalizeText(temple.slug, 100);
  const path = buildTemplePath(slug);
  const isPublished = temple.status === "published";
  const status = isPublished ? "published" : "draft";
  const isIndexable = isPublished ? 1 : 0;

  if (oldSlug && oldSlug !== slug) {
    db.prepare(
      `INSERT INTO seo_redirects (
         source_path, target_path, status_code, is_active, notes, created_at, updated_at
       ) VALUES (?, ?, 301, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(source_path) DO UPDATE SET
         target_path = excluded.target_path,
         status_code = 301,
         is_active = 1,
         notes = excluded.notes,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(oldSlug ? buildTemplePath(oldSlug) : path, path, "Temple slug changed; canonical 301 redirect maintained automatically.");
  }

  const location = resolveLocationContext({
    locationId: temple.location_id,
    countryId: temple.country_location_id,
    stateId: temple.state_location_id,
    districtId: temple.district_location_id,
    cityId: temple.city_location_id,
    country: temple.country,
    state: temple.state,
    district: temple.district,
    city: temple.city,
  });

  const existing = db.prepare(
    `SELECT id FROM seo_entries WHERE entity_type = 'temple' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(temple.id) as { id?: number } | undefined;

  const defaultTitle = `${normalizeText(temple.name, 250)} | Temple Timings, History, Darshan & Puja | DivyaDhara`;
  const defaultDescription = `${normalizeText(temple.name, 250)} temple information on DivyaDhara including history, darshan timings, aarti, festivals, facilities, puja services and pilgrimage guidance.`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "PlaceOfWorship",
    name: temple.name,
    url: path,
    image: temple.image ?? null,
    address: {
      "@type": "PostalAddress",
      addressLocality: location.city,
      addressRegion: location.state,
      addressCountry: location.country ?? "India",
    },
    geo: temple.latitude !== null && temple.longitude !== null && temple.latitude !== undefined && temple.longitude !== undefined
      ? { "@type": "GeoCoordinates", latitude: temple.latitude, longitude: temple.longitude }
      : undefined,
  };

  const locationLevel = location.areaId ? "area" : location.cityId ? "city" : location.districtId ? "district" : location.stateId ? "state" : location.countryId ? "country" : null;
  const locationLabel = [location.city, location.district, location.state, location.country].filter(Boolean).join(", ") || null;

  if (existing?.id) {
    db.prepare(
      `UPDATE seo_entries
       SET path = ?, page_type = 'temple', entity_type = 'temple', entity_id = ?,
           country_id = ?, state_id = ?, district_id = ?, city_id = ?, area_id = ?,
           location_level = ?,
           seo_title = COALESCE(seo_title, ?),
           meta_description = COALESCE(meta_description, ?),
           canonical_url = CASE WHEN canonical_locked = 1 THEN canonical_url ELSE ? END,
           robots = ?, schema_json = ?, schema_type = 'PlaceOfWorship',
           is_indexable = ?, noindex_reason = CASE WHEN ? = 1 THEN NULL ELSE 'Temple is not published.' END,
           status = ?, location_label = COALESCE(location_label, ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      path,
      temple.id,
      location.countryId,
      location.stateId,
      location.districtId,
      location.cityId,
      location.areaId,
      locationLevel,
      defaultTitle,
      defaultDescription,
      path,
      isIndexable ? "index,follow" : "noindex,nofollow",
      JSON.stringify(schema),
      isIndexable,
      isIndexable,
      status,
      locationLabel,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO seo_entries (
        path, page_type, entity_type, entity_id,
        country_id, state_id, district_id, city_id, area_id, location_level,
        seo_title, meta_description, canonical_url,
        og_title, og_description, og_image,
        twitter_card, robots, schema_json, schema_type, focus_keyword,
        area, location_label,
        keywords_json, primary_keywords_json, location_keywords_json, long_tail_keywords_json, search_intents_json,
        is_indexable, noindex_reason, status, created_at, updated_at
      ) VALUES (
        ?, 'temple', 'temple', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 'summary_large_image', ?, ?, 'PlaceOfWorship', ?, ?, ?,
        '[]', '[]', '[]', '[]', '[]', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
    ).run(
      path,
      temple.id,
      location.countryId,
      location.stateId,
      location.districtId,
      location.cityId,
      location.areaId,
      locationLevel,
      defaultTitle,
      defaultDescription,
      path,
      defaultTitle,
      defaultDescription,
      temple.image ?? null,
      isIndexable ? "index,follow" : "noindex,nofollow",
      JSON.stringify(schema),
      temple.name ?? null,
      location.area,
      locationLabel,
      isIndexable,
      isIndexable ? null : "Temple is not published.",
      status,
    );
  }
}

/* --------------------------------------------------------------------------
 * Public metadata/location/listing
 * -------------------------------------------------------------------------- */

router.get("/meta", optionalAuth, (_req: Request, res: Response) => {
  try {
    const categories = db.prepare(
      `SELECT id, name, slug, description, is_active, sort_order
       FROM temple_categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`,
    ).all();
    res.json({
      success: true,
      statuses: [...TEMPLE_STATUSES],
      childContentStatuses: [...CHILD_CONTENT_STATUSES],
      categories,
      sourceTypes: [...SOURCE_TYPES],
      scheduleTypes: [...SCHEDULE_TYPES],
      liveProviders: [...LIVE_PROVIDERS],
      seoKeywordTypes: [...SEO_KEYWORD_TYPES],
      locationLevels: ["country", "state", "district", "city", "area"],
    });
  } catch (error) {
    console.error("Temple meta error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple metadata." });
  }
});

router.get("/categories", (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(
      `SELECT tc.*, COUNT(tcm.temple_id) AS temple_count
       FROM temple_categories tc
       LEFT JOIN temple_category_map tcm ON tcm.category_id = tc.id
       WHERE tc.is_active = 1
       GROUP BY tc.id
       ORDER BY tc.sort_order ASC, tc.name ASC`,
    ).all();
    res.json({ success: true, categories: rows });
  } catch (error) {
    console.error("Temple categories error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple categories." });
  }
});

router.get("/locations/children", (_req: Request, res: Response) => {
  try {
    const parentId = positiveId(_req.query.parentId);
    const type = normalizeText(_req.query.type, 30).toLowerCase();
    const where = ["status = 'active'"];
    const params: unknown[] = [];
    if (parentId) { where.push("parent_id = ?"); params.push(parentId); }
    if (type) {
      if (!["country", "state", "district", "city", "area"].includes(type)) {
        res.status(400).json({ success: false, error: "Invalid location type." });
        return;
      }
      where.push("type = ?"); params.push(type);
    }
    const rows = db.prepare(
      `SELECT id, parent_id, type, name, slug, code, state_code, description, latitude, longitude, status
       FROM locations WHERE ${where.join(" AND ")} ORDER BY name ASC LIMIT 500`,
    ).all(...params);
    res.json({ success: true, locations: rows });
  } catch (error) {
    console.error("Temple location children error:", error);
    res.status(500).json({ success: false, error: "Unable to load locations." });
  }
});

router.get("/manager/temples", requireAuth, requireManagerWorkspace, (req: Request, res: Response) => {
  try {
    const user = currentUser(res);
    if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    const search = normalizeText(req.query.search, 180);
    const status = normalizeText(req.query.status, 30).toLowerCase();
    const page = Math.max(1, integerInRange(req.query.page, 1, 100000, 1) ?? 1);
    const limit = Math.min(100, Math.max(1, integerInRange(req.query.limit, 1, 100, 25) ?? 25));
    const offset = (page - 1) * limit;
    const where = ["1 = 1"];
    const params: unknown[] = [];

    if (user.role === "temple_manager") {
      where.push(`EXISTS (
        SELECT 1 FROM temple_manager_assignments tma
        WHERE tma.temple_id = t.id AND tma.manager_user_id = ? AND tma.status = 'active'
      )`);
      params.push(user.id);
    }
    if (status) { where.push("t.status = ?"); params.push(status); }
    if (search) {
      where.push(`(LOWER(t.name) LIKE LOWER(?) OR LOWER(COALESCE(t.city,'')) LIKE LOWER(?) OR LOWER(COALESCE(t.state,'')) LIKE LOWER(?))`);
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const whereSql = where.join(" AND ");
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM temples t WHERE ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const rows = db.prepare(
      `SELECT t.*,
         (SELECT GROUP_CONCAT(u.name, '||')
            FROM temple_manager_assignments a
            INNER JOIN users u ON u.id = a.manager_user_id
           WHERE a.temple_id = t.id AND a.status = 'active') AS manager_names,
         (SELECT ts.status FROM temple_subscriptions ts WHERE ts.temple_id = t.id ORDER BY ts.id DESC LIMIT 1) AS subscription_status,
         (SELECT sp.code FROM temple_subscriptions ts INNER JOIN subscription_plans sp ON sp.id = ts.plan_id WHERE ts.temple_id = t.id ORDER BY ts.id DESC LIMIT 1) AS subscription_plan_code
       FROM temples t
       WHERE ${whereSql}
       ORDER BY CASE WHEN t.status = 'pending' THEN 0 WHEN t.status = 'published' THEN 1 WHEN t.status = 'draft' THEN 2 ELSE 3 END, t.name ASC
       LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      temples: rows.map((row) => ({ ...publicTemple(row), managerNames: typeof row.manager_names === "string" ? row.manager_names.split("||").filter(Boolean) : [], subscriptionStatus: row.subscription_status ?? null, subscriptionPlanCode: row.subscription_plan_code ?? null })),
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Temple manager workspace error:", error);
    res.status(500).json({ success: false, error: "Unable to load Temple workspace." });
  }
});

router.get("/", optionalAuth, (req: Request, res: Response) => {
  try {
    const search = normalizeText(req.query.search, 180);
    const country = normalizeText(req.query.country, 120);
    const state = normalizeText(req.query.state, 150);
    const district = normalizeText(req.query.district, 150);
    const city = normalizeText(req.query.city, 150);
    const deity = normalizeText(req.query.deity, 200);
    const tradition = normalizeText(req.query.tradition, 200);
    const templeType = normalizeText(req.query.templeType ?? req.query.type, 120);
    const categoryId = positiveId(req.query.categoryId);
    const locationId = positiveId(req.query.locationId);
    const featured = req.query.featured === undefined ? null : booleanValue(req.query.featured);
    const page = Math.max(1, integerInRange(req.query.page, 1, 100000, 1) ?? 1);
    const limit = Math.min(100, Math.max(1, integerInRange(req.query.limit, 1, 100, 24) ?? 24));
    const offset = (page - 1) * limit;

    const where = ["t.status = 'published'"];
    const params: unknown[] = [];
    if (search) {
      const like = `%${search}%`;
      where.push(`(LOWER(t.name) LIKE LOWER(?) OR LOWER(COALESCE(t.sanskrit_name,'')) LIKE LOWER(?) OR LOWER(COALESCE(t.deity,'')) LIKE LOWER(?) OR LOWER(COALESCE(t.city,'')) LIKE LOWER(?) OR LOWER(COALESCE(t.state,'')) LIKE LOWER(?) OR LOWER(COALESCE(t.summary,'')) LIKE LOWER(?))`);
      params.push(like, like, like, like, like, like);
    }
    for (const [column, value] of [["t.country", country], ["t.state", state], ["t.district", district], ["t.city", city], ["t.deity", deity], ["t.tradition", tradition], ["t.temple_type", templeType]] as Array<[string, string]>) {
      if (value) { where.push(`LOWER(COALESCE(${column},'')) = LOWER(?)`); params.push(value); }
    }
    if (categoryId) {
      where.push(`EXISTS (SELECT 1 FROM temple_category_map x WHERE x.temple_id = t.id AND x.category_id = ?)`);
      params.push(categoryId);
    }
    if (locationId) {
      where.push(`EXISTS (
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM locations WHERE id = ?
          UNION ALL SELECT l.id FROM locations l INNER JOIN descendants d ON l.parent_id = d.id
        )
        SELECT 1 FROM descendants d WHERE d.id IN (t.location_id, t.country_location_id, t.state_location_id, t.district_location_id, t.city_location_id)
      )`);
      params.push(locationId);
    }
    if (featured !== null) { where.push("t.featured = ?"); params.push(featured ? 1 : 0); }
    const whereSql = where.join(" AND ");
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM temples t WHERE ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const rows = db.prepare(
      `SELECT t.*,
         (SELECT GROUP_CONCAT(tc.name, '||') FROM temple_category_map tcm INNER JOIN temple_categories tc ON tc.id = tcm.category_id WHERE tcm.temple_id = t.id AND tc.is_active = 1) AS category_names,
         (SELECT COUNT(*) FROM temple_puja_services tps INNER JOIN puja_services ps ON ps.id = tps.puja_id WHERE tps.temple_id = t.id AND ps.status = 'published') AS puja_count,
         (SELECT ts.search_visibility FROM temple_subscriptions ts WHERE ts.temple_id = t.id AND ts.status = 'active' ORDER BY ts.id DESC LIMIT 1) AS search_visibility
       FROM temples t WHERE ${whereSql}
       ORDER BY CASE WHEN search_visibility = 'higher' THEN 0 ELSE 1 END, t.featured DESC, t.name ASC
       LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as Row[];
    const temples = rows.map((row) => ({
      ...publicTemple(row),
      categoryNames: typeof row.category_names === "string" ? row.category_names.split("||").filter(Boolean) : [],
      pujaCount: Number(row.puja_count ?? 0),
    }));
    res.json({ success: true, temples, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) }, filters: { search: search || null, country: country || null, state: state || null, district: district || null, city: city || null, deity: deity || null, tradition: tradition || null, templeType: templeType || null, categoryId, locationId, featured } });
  } catch (error) {
    console.error("Temple list error:", error);
    res.status(500).json({ success: false, error: "Unable to load temples." });
  }
});

router.get("/featured", (_req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, integerInRange(_req.query.limit, 1, 50, 12) ?? 12));
    const rows = db.prepare(
      `SELECT * FROM temples WHERE status = 'published' AND featured = 1 ORDER BY updated_at DESC, name ASC LIMIT ?`,
    ).all(limit) as Row[];
    res.json({ success: true, temples: rows.map(publicTemple) });
  } catch (error) {
    console.error("Featured temple error:", error);
    res.status(500).json({ success: false, error: "Unable to load featured temples." });
  }
});

/* --------------------------------------------------------------------------
 * Temple CRUD / editorial workflow
 * -------------------------------------------------------------------------- */

const ROOT_FIELDS = [
  "name", "sanskrit_name", "deity", "temple_type", "tradition", "established", "summary", "description", "history",
  "activities_json", "schedule_json", "stay", "food", "courses_json", "contact_note", "image", "logo", "gallery_json", "category_json",
  "city", "district", "state", "country", "location_id", "country_location_id", "state_location_id", "district_location_id", "city_location_id",
  "address", "latitude", "longitude", "map_url", "trust_name", "rating_text", "peetha_number", "peetha_body_part", "shakti_form", "bhairava",
  "identification_note", "map_embed_note", "contact_phone", "contact_email", "website_url", "booking_enabled", "story_video_id", "content_note", "status", "featured",
] as const;

function validateCoordinates(body: Row): { latitude: number | null; longitude: number | null; error: string | null } {
  const latitude = body.latitude === undefined || body.latitude === null || body.latitude === "" ? null : Number(body.latitude);
  const longitude = body.longitude === undefined || body.longitude === null || body.longitude === "" ? null : Number(body.longitude);
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return { latitude, longitude, error: "Latitude must be between -90 and 90." };
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return { latitude, longitude, error: "Longitude must be between -180 and 180." };
  return { latitude, longitude, error: null };
}

function validateContactEmail(value: unknown): string | null {
  const email = nullableText(value, 320);
  return email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : email;
}

function locationInputFromTemple(temple: Row): LocationContext {
  return resolveLocationContext({
    locationId: temple.location_id,
    countryId: temple.country_location_id,
    stateId: temple.state_location_id,
    districtId: temple.district_location_id,
    cityId: temple.city_location_id,
    country: temple.country,
    state: temple.state,
    district: temple.district,
    city: temple.city,
  });
}

function buildRootValue(field: string, body: Row): unknown {
  if (ROOT_JSON_FIELDS.has(field)) return toJson(body[field], "[]");
  if (ROOT_INTEGER_FIELDS.has(field)) return integerInRange(body[field], 1, 1000, null);
  if (ROOT_BOOLEAN_FIELDS.has(field)) return booleanValue(body[field]) ? 1 : 0;
  if (field === "latitude" || field === "longitude") return body[field];
  if (field === "contact_email") return validateContactEmail(body[field]);
  if (["image", "logo", "map_url", "website_url"].includes(field)) return safeHttpUrl(body[field], ROOT_TEXT_FIELDS[field] ?? 2000);
  return nullableText(body[field], ROOT_TEXT_FIELDS[field] ?? 5000);
}

router.post("/", requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const name = normalizeText(body.name, 250);
    if (name.length < 2) { res.status(400).json({ success: false, error: "Temple name must contain at least 2 characters." }); return; }

    const context = resolveLocationContext(body);
    const locationError = validateLocationContext(context);
    if (locationError) { res.status(400).json({ success: false, error: locationError }); return; }

    const status = normalizeText(body.status, 30).toLowerCase() || "draft";
    if (!TEMPLE_STATUSES.includes(status as typeof TEMPLE_STATUSES[number])) { res.status(400).json({ success: false, error: "Invalid temple status." }); return; }
    const email = validateContactEmail(body.contact_email ?? body.contactEmail);
    if ((body.contact_email ?? body.contactEmail) && !email) { res.status(400).json({ success: false, error: "Invalid temple contact email." }); return; }
    const coords = validateCoordinates(body);
    if (coords.error) { res.status(400).json({ success: false, error: coords.error }); return; }
    const slug = uniqueTempleSlug(name, body.slug);

    const fields = [
      "slug", "name", "sanskrit_name", "deity", "temple_type", "tradition", "established", "summary", "description", "history",
      "activities_json", "schedule_json", "stay", "food", "courses_json", "contact_note", "image", "logo", "gallery_json", "category_json",
      "city", "district", "state", "country", "location_id", "country_location_id", "state_location_id", "district_location_id", "city_location_id",
      "address", "latitude", "longitude", "map_url", "trust_name", "rating_text", "peetha_number", "peetha_body_part", "shakti_form", "bhairava",
      "identification_note", "map_embed_note", "contact_phone", "contact_email", "website_url", "booking_enabled", "story_video_id", "content_note", "status", "featured",
      "created_at", "updated_at",
    ];
    const values: unknown[] = [
      slug, name,
      nullableText(body.sanskrit_name ?? body.sanskritName, 250), nullableText(body.deity, 250), nullableText(body.temple_type ?? body.templeType, 120),
      nullableText(body.tradition, 200), nullableText(body.established, 200), nullableText(body.summary, 4000), nullableText(body.description, 30000), nullableText(body.history, 30000),
      toJson(body.activities_json ?? body.activities, "[]"), toJson(body.schedule_json ?? body.schedule, "[]"), nullableText(body.stay, 5000), nullableText(body.food, 5000),
      toJson(body.courses_json ?? body.courses, "[]"), nullableText(body.contact_note ?? body.contactNote, 5000),
      safeHttpUrl(body.image, 2000), safeHttpUrl(body.logo, 2000), toJson(body.gallery_json ?? body.gallery, "[]"), toJson(body.category_json ?? body.categories, "[]"),
      context.city, context.district, context.state, context.country || "India", context.locationId, context.countryId, context.stateId, context.districtId, context.cityId,
      nullableText(body.address, 3000), coords.latitude, coords.longitude, safeHttpUrl(body.map_url ?? body.mapUrl, 2000),
      nullableText(body.trust_name ?? body.trustName, 300), nullableText(body.rating_text ?? body.ratingText, 120), integerInRange(body.peetha_number ?? body.peethaNumber, 1, 1000, null),
      nullableText(body.peetha_body_part ?? body.peethaBodyPart, 250), nullableText(body.shakti_form ?? body.shaktiForm, 250), nullableText(body.bhairava, 250),
      nullableText(body.identification_note ?? body.identificationNote, 5000), nullableText(body.map_embed_note ?? body.mapEmbedNote, 5000), nullableText(body.contact_phone ?? body.contactPhone, 40), email,
      safeHttpUrl(body.website_url ?? body.websiteUrl, 2000), booleanValue(body.booking_enabled ?? body.bookingEnabled, true) ? 1 : 0,
      nullableText(body.story_video_id ?? body.storyVideoId, 250), nullableText(body.content_note ?? body.contentNote, 5000), status, booleanValue(body.featured, false) ? 1 : 0,
      new Date().toISOString(), new Date().toISOString(),
    ];

    const temple = db.transaction(() => {
      const result = db.prepare(`INSERT INTO temples (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`).run(...values);
      const created = getTempleById(Number(result.lastInsertRowid));
      if (!created) throw new Error("Temple could not be loaded after creation.");
      syncTempleSeo(created, null);
      auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.created", entityType: "temple", entityId: Number(created.id), newData: created, req });
      return created;
    })() as Row;

    res.status(201).json({ success: true, message: "Temple created successfully.", temple: publicTemple(temple) });
  } catch (error) {
    console.error("Temple create error:", error);
    const text = String(error).toLowerCase();
    if (text.includes("unique") || text.includes("constraint")) { res.status(409).json({ success: false, error: "Temple could not be created because a unique business field conflicts with an existing record." }); return; }
    res.status(500).json({ success: false, error: "Unable to create temple." });
  }
});

router.get("/manage/:id", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const temple = getTempleById(templeId);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }

    const content = publicResourceCollection(templeId);
    const seo = db.prepare(`SELECT * FROM seo_entries WHERE entity_type = 'temple' AND entity_id = ? ORDER BY id DESC LIMIT 1`).get(templeId) ?? null;
    const assignments = db.prepare(
      `SELECT tma.*, u.name AS manager_name, u.email AS manager_email, u.phone AS manager_phone,
              tmp.designation, tmp.organization_name, tmp.verification_status
       FROM temple_manager_assignments tma
       INNER JOIN users u ON u.id = tma.manager_user_id
       LEFT JOIN temple_manager_profiles tmp ON tmp.user_id = u.id
       WHERE tma.temple_id = ? ORDER BY CASE tma.status WHEN 'active' THEN 0 WHEN 'inactive' THEN 1 ELSE 2 END, u.name ASC`,
    ).all(templeId);
    const subscription = db.prepare(
      `SELECT ts.*, sp.name AS plan_name, sp.code AS plan_code, sp.description AS plan_description,
              spp.id AS price_variant_id, spp.price_amount AS price_variant_amount,
              spp.currency AS price_variant_currency, spp.billing_interval AS price_variant_interval,
              spp.duration_days AS price_variant_duration_days, spp.provider AS price_variant_provider
       FROM temple_subscriptions ts
       INNER JOIN subscription_plans sp ON sp.id = ts.plan_id
       LEFT JOIN subscription_plan_prices spp ON spp.id = ts.subscription_plan_price_id
       WHERE ts.temple_id = ? ORDER BY ts.id DESC LIMIT 1`,
    ).get(templeId) ?? null;

    res.json({ success: true, temple, content, seo, assignments, subscription, activeFeatures: publicSubscriptionFeatures(getActiveTempleSubscription(templeId)) });
  } catch (error) {
    console.error("Temple management detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple management data." });
  }
});

router.patch("/manage/:id", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const current = getTempleById(templeId);
    if (!current) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const user = currentUser(res);
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const updates: string[] = [];
    const values: unknown[] = [];

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      if (user?.role !== "super_admin") { res.status(403).json({ success: false, error: "Only Super Admin can change a temple URL slug." }); return; }
      updates.push("slug = ?"); values.push(uniqueTempleSlug(String(current.name ?? "temple"), body.slug, templeId));
    }
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = normalizeText(body.name, 250);
      if (name.length < 2) { res.status(400).json({ success: false, error: "Temple name must contain at least 2 characters." }); return; }
      updates.push("name = ?"); values.push(name);
      if (user?.role === "super_admin" && !Object.prototype.hasOwnProperty.call(body, "slug") && ["draft", "unpublished"].includes(String(current.status))) {
        updates.push("slug = ?"); values.push(uniqueTempleSlug(name, undefined, templeId));
      }
    }

    const hasLocationField = ["locationId", "countryId", "stateId", "districtId", "cityId", "areaId", "country", "state", "district", "city"].some((field) => Object.prototype.hasOwnProperty.call(body, field));
    if (hasLocationField) {
      const currentContext = locationInputFromTemple(current);
      const requested = resolveLocationContext(body);
      const merged: LocationContext = {
        locationId: requested.locationId ?? currentContext.locationId,
        countryId: requested.countryId ?? currentContext.countryId,
        stateId: requested.stateId ?? currentContext.stateId,
        districtId: requested.districtId ?? currentContext.districtId,
        cityId: requested.cityId ?? currentContext.cityId,
        areaId: requested.areaId ?? currentContext.areaId,
        country: requested.country ?? currentContext.country,
        state: requested.state ?? currentContext.state,
        district: requested.district ?? currentContext.district,
        city: requested.city ?? currentContext.city,
        area: requested.area ?? currentContext.area,
      };
      const error = validateLocationContext(merged);
      if (error) { res.status(400).json({ success: false, error }); return; }
      updates.push("location_id = ?", "country_location_id = ?", "state_location_id = ?", "district_location_id = ?", "city_location_id = ?", "country = ?", "state = ?", "district = ?", "city = ?");
      values.push(merged.locationId, merged.countryId, merged.stateId, merged.districtId, merged.cityId, merged.country || "India", merged.state, merged.district, merged.city);
    }

    const protectedForManager = new Set(["featured", "status"]);
    for (const field of ROOT_FIELDS) {
      if (field === "name" || field === "status") continue;
      if (ROOT_LOCATION_FIELDS.has(field) || field === "latitude" || field === "longitude" || field === "contact_email") continue;
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      if (user?.role !== "super_admin" && protectedForManager.has(field)) { res.status(403).json({ success: false, error: `Only Super Admin can change ${field}.` }); return; }
      if (["image", "logo", "map_url", "website_url"].includes(field)) {
        const raw = body[field];
        const value = raw === null || raw === "" ? null : safeHttpUrl(raw, ROOT_TEXT_FIELDS[field] ?? 2000);
        if (raw && !value) { res.status(400).json({ success: false, error: `${field} must be a valid HTTP(S) URL or safe relative path.` }); return; }
        updates.push(`${field} = ?`); values.push(value); continue;
      }
      updates.push(`${field} = ?`); values.push(buildRootValue(field, body));
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = normalizeText(body.status, 30).toLowerCase();
      if (!TEMPLE_STATUSES.includes(status as typeof TEMPLE_STATUSES[number])) { res.status(400).json({ success: false, error: "Invalid temple status." }); return; }
      if (!canManagerEditStatus(user, status)) { res.status(403).json({ success: false, error: "Temple Managers can only submit a temple for admin review; only Super Admin can publish or unpublish." }); return; }
      updates.push("status = ?"); values.push(status);
    }

    if (Object.prototype.hasOwnProperty.call(body, "latitude") || Object.prototype.hasOwnProperty.call(body, "longitude")) {
      const coords = validateCoordinates({ latitude: body.latitude ?? current.latitude, longitude: body.longitude ?? current.longitude });
      if (coords.error) { res.status(400).json({ success: false, error: coords.error }); return; }
      if (Object.prototype.hasOwnProperty.call(body, "latitude")) { updates.push("latitude = ?"); values.push(coords.latitude); }
      if (Object.prototype.hasOwnProperty.call(body, "longitude")) { updates.push("longitude = ?"); values.push(coords.longitude); }
    }

    if (Object.prototype.hasOwnProperty.call(body, "contact_email") || Object.prototype.hasOwnProperty.call(body, "contactEmail")) {
      const raw = body.contact_email ?? body.contactEmail;
      const email = validateContactEmail(raw);
      if (raw && !email) { res.status(400).json({ success: false, error: "Invalid temple contact email." }); return; }
      updates.push("contact_email = ?"); values.push(email);
    }

    if (!updates.length) { res.json({ success: true, message: "No temple changes were supplied.", temple: publicTemple(current) }); return; }
    updates.push("updated_at = CURRENT_TIMESTAMP"); values.push(templeId);

    const updated = db.transaction(() => {
      db.prepare(`UPDATE temples SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      const row = getTempleById(templeId);
      if (!row) throw new Error("Temple disappeared after update.");
      syncTempleSeo(row, String(current.slug ?? ""));
      auditLog({ userId: user?.id ?? null, action: "temple.updated", entityType: "temple", entityId: templeId, oldData: current, newData: row, req });
      return row;
    })() as Row;

    res.json({ success: true, message: "Temple updated successfully.", temple: publicTemple(updated) });
  } catch (error) {
    console.error("Temple update error:", error);
    const text = String(error).toLowerCase();
    if (text.includes("unique") || text.includes("constraint")) { res.status(409).json({ success: false, error: "Temple update conflicts with an existing unique business value." }); return; }
    res.status(500).json({ success: false, error: "Unable to update temple." });
  }
});

router.delete("/manage/:id", requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const temple = getTempleById(templeId);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }

    const history = db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM temple_enquiry_requests WHERE temple_id = ?) AS enquiries,
         (SELECT COUNT(*) FROM temple_manager_assignments WHERE temple_id = ?) AS assignments,
         (SELECT COUNT(*) FROM temple_subscriptions WHERE temple_id = ?) AS subscriptions,
         (SELECT COUNT(*) FROM leads WHERE temple_id = ?) AS leads`,
    ).get(templeId, templeId, templeId, templeId) as { enquiries?: number; assignments?: number; subscriptions?: number; leads?: number } | undefined;
    if (Number(history?.enquiries ?? 0) + Number(history?.assignments ?? 0) + Number(history?.subscriptions ?? 0) + Number(history?.leads ?? 0) > 0) {
      res.status(409).json({ success: false, error: "Temple has business history. Unpublish it instead of hard deleting the record." }); return;
    }

    db.transaction(() => {
      db.prepare("DELETE FROM gallery_media WHERE gallery_item_id IN (SELECT id FROM gallery_items WHERE related_entity_type = 'temple' AND related_entity_id = ?)").run(templeId);
      db.prepare("DELETE FROM gallery_items WHERE related_entity_type = 'temple' AND related_entity_id = ?").run(templeId);
      db.prepare("DELETE FROM videos WHERE related_temple_id = ?").run(templeId);
      db.prepare("DELETE FROM seo_entries WHERE entity_type = 'temple' AND entity_id = ?").run(templeId);
      db.prepare("DELETE FROM temples WHERE id = ?").run(templeId);
      auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.deleted", entityType: "temple", entityId: templeId, oldData: temple, req });
    })();
    res.json({ success: true, message: "Temple deleted successfully." });
  } catch (error) {
    console.error("Temple delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete temple." });
  }
});

router.post("/manage/:id/publish", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const current = getTempleById(templeId);
    if (!current) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const user = currentUser(res);
    const requested = normalizeText(req.body?.status, 30).toLowerCase() || "published";
    if (!TEMPLE_STATUSES.includes(requested as typeof TEMPLE_STATUSES[number])) { res.status(400).json({ success: false, error: "Invalid temple status." }); return; }
    if (!canManagerEditStatus(user, requested)) { res.status(403).json({ success: false, error: "Temple Managers can only submit a temple for admin review." }); return; }
    db.transaction(() => {
      db.prepare("UPDATE temples SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(requested, templeId);
      const updated = getTempleById(templeId);
      if (!updated) throw new Error("Temple could not be loaded after status update.");
      syncTempleSeo(updated, String(current.slug ?? ""));
      auditLog({ userId: user?.id ?? null, action: "temple.status_changed", entityType: "temple", entityId: templeId, oldData: { status: current.status }, newData: { status: requested }, req });
    })();
    res.json({ success: true, message: `Temple status changed to ${requested}.`, temple: publicTemple(getTempleById(templeId) as Row) });
  } catch (error) {
    console.error("Temple status error:", error);
    res.status(500).json({ success: false, error: "Unable to change temple status." });
  }
});

/* --------------------------------------------------------------------------
 * Generic temple child resources
 * -------------------------------------------------------------------------- */

function buildResourceValues(config: ResourceConfig, body: Row, isUpdate: boolean): { fields: string[]; values: unknown[]; error: string | null } {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [field, definition] of Object.entries(config.fields)) {
    const supplied = Object.prototype.hasOwnProperty.call(body, field);
    if (!supplied) {
      if (!isUpdate && definition.defaultValue !== undefined) {
        fields.push(field);
        values.push(definition.type === "bool" ? (booleanValue(definition.defaultValue) ? 1 : 0) : definition.defaultValue);
      }
      continue;
    }
    if (definition.type === "text") {
      const value = nullableText(body[field], definition.max);
      if (definition.required && !value) return { fields: [], values: [], error: `${field} is required.` };
      fields.push(field); values.push(value); continue;
    }
    if (definition.type === "int") {
      const value = integerInRange(body[field], 0, definition.max, null);
      if (body[field] !== null && body[field] !== "" && value === null) return { fields: [], values: [], error: `${field} must be a valid integer.` };
      fields.push(field); values.push(value); continue;
    }
    if (definition.type === "bool") { fields.push(field); values.push(booleanValue(body[field]) ? 1 : 0); continue; }
    const value = normalizeText(body[field], definition.max);
    if (!SOURCE_TYPES.includes(value as typeof SOURCE_TYPES[number])) return { fields: [], values: [], error: "Invalid source_type." };
    fields.push(field); values.push(value);
  }
  for (const [field, definition] of Object.entries(config.fields)) {
    if (definition.required && !fields.includes(field)) return { fields: [], values: [], error: `${field} is required.` };
  }

  if (Object.prototype.hasOwnProperty.call(body, "url") && config.route === "sources") {
    const url = safeHttpUrl(body.url, 2000);
    if (!url) return { fields: [], values: [], error: "Source URL must be a valid HTTP(S) URL or safe relative path." };
    const index = fields.indexOf("url");
    if (index >= 0) values[index] = url;
  }
  if (Object.prototype.hasOwnProperty.call(body, "image") && config.route !== "sources") {
    const image = safeHttpUrl(body.image, 2000);
    if (body.image && !image) return { fields: [], values: [], error: "image must be a valid HTTP(S) URL or safe relative path." };
    const index = fields.indexOf("image");
    if (index >= 0) values[index] = image;
  }
  if (config.route === "nearby-places" && Object.prototype.hasOwnProperty.call(body, "location_id") && positiveId(body.location_id)) {
    const row = locationRowById(positiveId(body.location_id) as number);
    if (!row || (row.status && row.status !== "active")) return { fields: [], values: [], error: "Nearby place location was not found or is inactive." };
  }
  if (config.route === "schedules" || config.route === "darshan-timings" || config.route === "aarti") {
    if (Object.prototype.hasOwnProperty.call(body, "day_of_week")) {
      const day = integerInRange(body.day_of_week, 0, 6, null);
      if (body.day_of_week !== null && body.day_of_week !== "" && day === null) return { fields: [], values: [], error: "day_of_week must be between 0 and 6." };
      const index = fields.indexOf("day_of_week");
      if (index >= 0) values[index] = day;
    }
  }
  if (config.route === "schedules" && Object.prototype.hasOwnProperty.call(body, "schedule_type")) {
    const scheduleType = normalizeText(body.schedule_type, 20).toLowerCase();
    if (!SCHEDULE_TYPES.includes(scheduleType as typeof SCHEDULE_TYPES[number])) return { fields: [], values: [], error: "Invalid schedule_type." };
    const index = fields.indexOf("schedule_type");
    if (index >= 0) values[index] = scheduleType;
  }
  return { fields, values, error: null };
}

function attachResourceRoutes(config: ResourceConfig): void {
  router.get(`/manage/:id/${config.route}`, requireAuth, requireTempleEditor, (req: Request, res: Response) => {
    try {
      const templeId = positiveId(req.params.id);
      if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
      const rows = db.prepare(`SELECT * FROM ${config.table} WHERE temple_id = ? ORDER BY ${config.orderBy}`).all(templeId);
      res.json({ success: true, resource: config.route, items: rows });
    } catch (error) {
      console.error(`Temple ${config.route} list error:`, error);
      res.status(500).json({ success: false, error: `Unable to load ${config.route}.` });
    }
  });

  router.post(`/manage/:id/${config.route}`, requireAuth, requireTempleEditor, (req: Request, res: Response) => {
    try {
      const templeId = positiveId(req.params.id);
      if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
      if (!getTempleById(templeId)) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
      const body = req.body && typeof req.body === "object" ? req.body as Row : {};
      const payload = buildResourceValues(config, body, false);
      if (payload.error) { res.status(400).json({ success: false, error: payload.error }); return; }
      const fields = ["temple_id", ...payload.fields, "created_at", "updated_at"];
      const values = [templeId, ...payload.values, new Date().toISOString(), new Date().toISOString()];
      const result = db.prepare(`INSERT INTO ${config.table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`).run(...values);
      const row = db.prepare(`SELECT * FROM ${config.table} WHERE id = ? LIMIT 1`).get(Number(result.lastInsertRowid));
      auditLog({ userId: currentUser(res)?.id ?? null, action: `temple.${config.route}.created`, entityType: "temple", entityId: templeId, newData: row, req });
      res.status(201).json({ success: true, item: row });
    } catch (error) {
      console.error(`Temple ${config.route} create error:`, error);
      res.status(500).json({ success: false, error: `Unable to create ${config.route} item.` });
    }
  });

  router.patch(`/manage/:id/${config.route}/:itemId`, requireAuth, requireTempleEditor, (req: Request, res: Response) => {
    try {
      const templeId = positiveId(req.params.id);
      const itemId = positiveId(req.params.itemId);
      if (!templeId || !itemId) { res.status(400).json({ success: false, error: "Invalid temple or resource id." }); return; }
      const current = db.prepare(`SELECT * FROM ${config.table} WHERE id = ? AND temple_id = ? LIMIT 1`).get(itemId, templeId) as ResourceRow | undefined;
      if (!current) { res.status(404).json({ success: false, error: "Resource item not found." }); return; }
      const body = req.body && typeof req.body === "object" ? req.body as Row : {};
      const payload = buildResourceValues(config, body, true);
      if (payload.error) { res.status(400).json({ success: false, error: payload.error }); return; }
      if (!payload.fields.length) { res.json({ success: true, message: "No changes supplied.", item: current }); return; }
      const sets = payload.fields.map((field) => `${field} = ?`);
      sets.push("updated_at = ?");
      db.prepare(`UPDATE ${config.table} SET ${sets.join(", ")} WHERE id = ? AND temple_id = ?`).run(...payload.values, new Date().toISOString(), itemId, templeId);
      const updated = db.prepare(`SELECT * FROM ${config.table} WHERE id = ? LIMIT 1`).get(itemId);
      auditLog({ userId: currentUser(res)?.id ?? null, action: `temple.${config.route}.updated`, entityType: "temple", entityId: templeId, oldData: current, newData: updated, req });
      res.json({ success: true, item: updated });
    } catch (error) {
      console.error(`Temple ${config.route} update error:`, error);
      res.status(500).json({ success: false, error: `Unable to update ${config.route} item.` });
    }
  });

  router.delete(`/manage/:id/${config.route}/:itemId`, requireAuth, requireTempleEditor, (req: Request, res: Response) => {
    try {
      const templeId = positiveId(req.params.id);
      const itemId = positiveId(req.params.itemId);
      if (!templeId || !itemId) { res.status(400).json({ success: false, error: "Invalid temple or resource id." }); return; }
      const current = db.prepare(`SELECT * FROM ${config.table} WHERE id = ? AND temple_id = ? LIMIT 1`).get(itemId, templeId) as ResourceRow | undefined;
      if (!current) { res.status(404).json({ success: false, error: "Resource item not found." }); return; }
      db.prepare(`DELETE FROM ${config.table} WHERE id = ? AND temple_id = ?`).run(itemId, templeId);
      auditLog({ userId: currentUser(res)?.id ?? null, action: `temple.${config.route}.deleted`, entityType: "temple", entityId: templeId, oldData: current, req });
      res.json({ success: true, removed: true });
    } catch (error) {
      console.error(`Temple ${config.route} delete error:`, error);
      res.status(500).json({ success: false, error: `Unable to delete ${config.route} item.` });
    }
  });
}

for (const config of RESOURCE_CONFIGS) attachResourceRoutes(config);

/* --------------------------------------------------------------------------
 * Live Aarti / Darshan
 * -------------------------------------------------------------------------- */

router.get("/manage/:id/live-aarti", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const live = db.prepare("SELECT * FROM temple_live_aarti WHERE temple_id = ? LIMIT 1").get(templeId) ?? null;
    res.json({ success: true, liveAarti: live });
  } catch (error) {
    console.error("Temple live aarti get error:", error);
    res.status(500).json({ success: false, error: "Unable to load live Aarti settings." });
  }
});

router.put("/manage/:id/live-aarti", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    if (!getTempleById(templeId)) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const enabling = booleanValue(body.enabled, false);
    const subscription = enabling ? requireActiveTempleFeature(templeId, "live_aarti", res) : getActiveTempleSubscription(templeId);
    if (enabling && currentUser(res)?.role !== "super_admin" && !subscription) return;
    const provider = normalizeText(body.provider, 40).toLowerCase() || "youtube";
    if (!LIVE_PROVIDERS.includes(provider as typeof LIVE_PROVIDERS[number])) { res.status(400).json({ success: false, error: "Invalid live provider." }); return; }
    const official = currentUser(res)?.role === "super_admin" && booleanValue(body.is_official ?? body.isOfficial, false) ? 1 : 0;
    const lastVerified = currentUser(res)?.role === "super_admin" ? nullableText(body.last_verified_at ?? body.lastVerifiedAt, 80) : null;
    const urls: Array<[string, unknown, number]> = [
      ["stream_url", body.stream_url ?? body.streamUrl, 3000],
      ["ipcamlive_url", body.ipcamlive_url ?? body.ipcamliveUrl, 3000],
      ["watch_url", body.watch_url ?? body.watchUrl, 3000],
    ];
    const safeUrls: Record<string, string | null> = {};
    for (const [key, value, max] of urls) {
      const safe = safeHttpUrl(value, max);
      if (value && !safe) { res.status(400).json({ success: false, error: `${key} must be a valid HTTP(S) URL or safe relative path.` }); return; }
      safeUrls[key] = safe;
    }
    db.prepare(
      `INSERT INTO temple_live_aarti (
         temple_id, enabled, provider, video_id, channel_id, stream_url, ipcamlive_url, watch_url,
         title, time_text, is_official, last_verified_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(temple_id) DO UPDATE SET
         enabled = excluded.enabled, provider = excluded.provider, video_id = excluded.video_id,
         channel_id = excluded.channel_id, stream_url = excluded.stream_url, ipcamlive_url = excluded.ipcamlive_url,
         watch_url = excluded.watch_url, title = excluded.title, time_text = excluded.time_text,
         is_official = excluded.is_official, last_verified_at = excluded.last_verified_at, updated_at = CURRENT_TIMESTAMP`,
    ).run(
      templeId,
      enabling ? 1 : 0,
      provider,
      nullableText(body.video_id ?? body.videoId, 300),
      nullableText(body.channel_id ?? body.channelId, 300),
      safeUrls.stream_url,
      safeUrls.ipcamlive_url,
      safeUrls.watch_url,
      normalizeText(body.title, 250) || "Live Aarti & Darshan",
      nullableText(body.time_text ?? body.timeText, 120),
      official,
      lastVerified,
    );
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.live_aarti.updated", entityType: "temple", entityId: templeId, newData: { ...body, is_official: official }, req });
    res.json({ success: true, liveAarti: db.prepare("SELECT * FROM temple_live_aarti WHERE temple_id = ? LIMIT 1").get(templeId) });
  } catch (error) {
    console.error("Temple live aarti update error:", error);
    res.status(500).json({ success: false, error: "Unable to save live Aarti settings." });
  }
});

/* --------------------------------------------------------------------------
 * Categories
 * -------------------------------------------------------------------------- */

router.post("/manage/categories", requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const name = normalizeText(req.body?.name, 250);
    if (name.length < 2) { res.status(400).json({ success: false, error: "Category name is required." }); return; }
    const slug = slugify(normalizeText(req.body?.slug, 120) || name);
    const description = nullableText(req.body?.description, 2000);
    const sortOrder = integerInRange(req.body?.sort_order ?? req.body?.sortOrder, 0, 100000, 0) ?? 0;
    const isActive = booleanValue(req.body?.is_active ?? req.body?.isActive, true) ? 1 : 0;
    const result = db.prepare(
      `INSERT INTO temple_categories (name, slug, description, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).run(name, slug, description, isActive, sortOrder);
    const category = db.prepare("SELECT * FROM temple_categories WHERE id = ? LIMIT 1").get(Number(result.lastInsertRowid));
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.category.created", entityType: "temple_category", entityId: Number(result.lastInsertRowid), newData: category, req });
    res.status(201).json({ success: true, category });
  } catch (error) {
    console.error("Temple category create error:", error);
    if (String(error).toLowerCase().includes("unique")) { res.status(409).json({ success: false, error: "Category name or slug already exists." }); return; }
    res.status(500).json({ success: false, error: "Unable to create temple category." });
  }
});

router.patch("/manage/categories/:categoryId", requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const categoryId = positiveId(req.params.categoryId);
    if (!categoryId) { res.status(400).json({ success: false, error: "Invalid category id." }); return; }
    const current = db.prepare("SELECT * FROM temple_categories WHERE id = ? LIMIT 1").get(categoryId) as Row | undefined;
    if (!current) { res.status(404).json({ success: false, error: "Category not found." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const updates: string[] = [];
    const values: unknown[] = [];
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = normalizeText(body.name, 250);
      if (!name) { res.status(400).json({ success: false, error: "Category name is required." }); return; }
      updates.push("name = ?"); values.push(name);
    }
    if (Object.prototype.hasOwnProperty.call(body, "slug")) { updates.push("slug = ?"); values.push(slugify(normalizeText(body.slug, 120))); }
    if (Object.prototype.hasOwnProperty.call(body, "description")) { updates.push("description = ?"); values.push(nullableText(body.description, 2000)); }
    if (Object.prototype.hasOwnProperty.call(body, "is_active")) { updates.push("is_active = ?"); values.push(booleanValue(body.is_active) ? 1 : 0); }
    if (Object.prototype.hasOwnProperty.call(body, "sort_order")) { updates.push("sort_order = ?"); values.push(integerInRange(body.sort_order, 0, 100000, 0) ?? 0); }
    if (!updates.length) { res.json({ success: true, category: current }); return; }
    updates.push("updated_at = CURRENT_TIMESTAMP"); values.push(categoryId);
    db.prepare(`UPDATE temple_categories SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    const updated = db.prepare("SELECT * FROM temple_categories WHERE id = ? LIMIT 1").get(categoryId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.category.updated", entityType: "temple_category", entityId: categoryId, oldData: current, newData: updated, req });
    res.json({ success: true, category: updated });
  } catch (error) {
    console.error("Temple category update error:", error);
    if (String(error).toLowerCase().includes("unique")) { res.status(409).json({ success: false, error: "Category name or slug already exists." }); return; }
    res.status(500).json({ success: false, error: "Unable to update temple category." });
  }
});

router.delete("/manage/categories/:categoryId", requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const categoryId = positiveId(req.params.categoryId);
    if (!categoryId) { res.status(400).json({ success: false, error: "Invalid category id." }); return; }
    const count = Number((db.prepare("SELECT COUNT(*) AS count FROM temple_category_map WHERE category_id = ?").get(categoryId) as { count?: number } | undefined)?.count ?? 0);
    if (count > 0) { res.status(409).json({ success: false, error: "Category is in use by temples. Deactivate it instead of deleting it." }); return; }
    db.prepare("DELETE FROM temple_categories WHERE id = ?").run(categoryId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.category.deleted", entityType: "temple_category", entityId: categoryId, req });
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error("Temple category delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete temple category." });
  }
});

router.get("/manage/:id/categories", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    res.json({ success: true, categories: getCategoryIdsForTemple(templeId) });
  } catch (error) {
    console.error("Temple categories get error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple categories." });
  }
});

router.put("/manage/:id/categories", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    if (!getTempleById(templeId)) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const raw = req.body?.categoryIds ?? req.body?.categories ?? [];
    if (!Array.isArray(raw)) { res.status(400).json({ success: false, error: "categoryIds must be an array." }); return; }
    const categoryIds = Array.from(new Set(raw.map((v: unknown) => positiveId(v)).filter((v: number | null): v is number => v !== null))).slice(0, 50);
    db.transaction(() => {
      db.prepare("DELETE FROM temple_category_map WHERE temple_id = ?").run(templeId);
      const insert = db.prepare(`INSERT INTO temple_category_map (temple_id, category_id, is_primary, sort_order, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`);
      categoryIds.forEach((categoryId, index) => {
        const category = db.prepare("SELECT id FROM temple_categories WHERE id = ? AND is_active = 1 LIMIT 1").get(categoryId);
        if (!category) throw new Error(`Temple category #${categoryId} was not found or is inactive.`);
        insert.run(templeId, categoryId, index === 0 ? 1 : 0, index);
      });
      auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.categories.synced", entityType: "temple", entityId: templeId, newData: { categoryIds }, req });
    })();
    res.json({ success: true, categories: getCategoryIdsForTemple(templeId) });
  } catch (error) {
    console.error("Temple categories sync error:", error);
    res.status(500).json({ success: false, error: "Unable to update temple categories." });
  }
});

/* --------------------------------------------------------------------------
 * Temple -> Puja Services (service_limit entitlement)
 * -------------------------------------------------------------------------- */

router.get("/manage/:id/pujas", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const pujas = db.prepare(
      `SELECT ps.*, tps.is_featured AS temple_puja_featured
       FROM temple_puja_services tps INNER JOIN puja_services ps ON ps.id = tps.puja_id
       WHERE tps.temple_id = ? ORDER BY tps.is_featured DESC, ps.sort_order ASC, ps.name ASC`,
    ).all(templeId);
    const subscription = getActiveTempleSubscription(templeId);
    res.json({ success: true, pujas, usage: { count: pujas.length, limit: subscription?.service_limit ?? 0 } });
  } catch (error) {
    console.error("Temple puja list error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple puja services." });
  }
});

router.post("/manage/:id/pujas", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    const pujaId = positiveId(req.body?.pujaId ?? req.body?.puja_id);
    if (!templeId || !pujaId) { res.status(400).json({ success: false, error: "Valid templeId and pujaId are required." }); return; }
    const subscription = requireActiveTempleFeature(templeId, "service", res);
    if (currentUser(res)?.role !== "super_admin" && !subscription) return;
    const puja = db.prepare("SELECT id, status FROM puja_services WHERE id = ? LIMIT 1").get(pujaId) as { id?: number; status?: string } | undefined;
    if (!puja) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }
    if (puja.status !== "published" && currentUser(res)?.role !== "super_admin") { res.status(400).json({ success: false, error: "Only a published puja service can be attached to a public temple profile." }); return; }
    if (subscription) {
      const existing = db.prepare("SELECT 1 FROM temple_puja_services WHERE temple_id = ? AND puja_id = ? LIMIT 1").get(templeId, pujaId);
      if (!existing) {
        const usage = Number((db.prepare("SELECT COUNT(*) AS count FROM temple_puja_services WHERE temple_id = ?").get(templeId) as { count?: number } | undefined)?.count ?? 0);
        if (usage >= Number(subscription.service_limit ?? 0)) {
          res.status(409).json({ success: false, error: "Temple service limit reached for the current plan.", code: "TEMPLE_SERVICE_LIMIT_REACHED", limit: subscription.service_limit });
          return;
        }
      }
    }
    const isFeatured = booleanValue(req.body?.isFeatured ?? req.body?.is_featured, false);
    db.prepare(
      `INSERT INTO temple_puja_services (temple_id, puja_id, is_featured, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(temple_id, puja_id) DO UPDATE SET is_featured = excluded.is_featured`,
    ).run(templeId, pujaId, isFeatured ? 1 : 0);
    const relation = db.prepare(`SELECT * FROM temple_puja_services WHERE temple_id = ? AND puja_id = ? LIMIT 1`).get(templeId, pujaId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.puja.attached", entityType: "temple", entityId: templeId, newData: relation, req });
    res.status(201).json({ success: true, relation });
  } catch (error) {
    console.error("Temple puja attach error:", error);
    res.status(500).json({ success: false, error: "Unable to attach puja service." });
  }
});

router.delete("/manage/:id/pujas/:pujaId", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    const pujaId = positiveId(req.params.pujaId);
    if (!templeId || !pujaId) { res.status(400).json({ success: false, error: "Invalid temple or puja id." }); return; }
    const user = currentUser(res);
    const subscription = requireActiveTempleFeature(templeId, "service", res);
    if (user?.role !== "super_admin" && !subscription) return;
    const current = db.prepare("SELECT * FROM temple_puja_services WHERE temple_id = ? AND puja_id = ? LIMIT 1").get(templeId, pujaId);
    db.prepare("DELETE FROM temple_puja_services WHERE temple_id = ? AND puja_id = ?").run(templeId, pujaId);
    auditLog({ userId: user?.id ?? null, action: "temple.puja.detached", entityType: "temple", entityId: templeId, oldData: current ?? { pujaId }, req });
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error("Temple puja detach error:", error);
    res.status(500).json({ success: false, error: "Unable to detach puja service." });
  }
});

/* --------------------------------------------------------------------------
 * Temple Gallery
 * -------------------------------------------------------------------------- */

router.get("/manage/:id/gallery", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const items = db.prepare(
      `SELECT * FROM gallery_items WHERE content_type = 'temple' AND related_entity_type = 'temple' AND related_entity_id = ?
       ORDER BY featured DESC, sort_order ASC, id DESC`,
    ).all(templeId) as Row[];
    const media = items.length ? db.prepare(
      `SELECT * FROM gallery_media WHERE gallery_item_id IN (${items.map(() => "?").join(",")}) ORDER BY sort_order ASC, id ASC`,
    ).all(...items.map((x) => Number(x.id))) as Row[] : [];
    const grouped = new Map<number, Row[]>();
    for (const item of media) grouped.set(Number(item.gallery_item_id), [...(grouped.get(Number(item.gallery_item_id)) ?? []), item]);
    const subscription = getActiveTempleSubscription(templeId);
    res.json({ success: true, gallery: items.map((x) => ({ ...x, media: grouped.get(Number(x.id)) ?? [] })), usage: { items: items.length, limit: subscription?.gallery_limit ?? 0 } });
  } catch (error) {
    console.error("Temple gallery list error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple gallery." });
  }
});

router.post("/manage/:id/gallery", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const subscription = requireActiveTempleFeature(templeId, "gallery", res);
    if (currentUser(res)?.role !== "super_admin" && !subscription) return;
    if (subscription && activeCount("gallery_items", templeId) >= Number(subscription.gallery_limit ?? 0)) {
      res.status(409).json({ success: false, error: "Temple gallery limit reached for the current plan.", code: "TEMPLE_GALLERY_LIMIT_REACHED", limit: subscription.gallery_limit });
      return;
    }
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const title = normalizeText(body.title, 250);
    if (!title) { res.status(400).json({ success: false, error: "Gallery title is required." }); return; }
    const status = normalizeText(body.status, 20).toLowerCase() || "draft";
    const statusError = validateChildStatus(status);
    if (statusError) { res.status(400).json({ success: false, error: statusError }); return; }
    if (currentUser(res)?.role !== "super_admin" && status !== "draft") { res.status(403).json({ success: false, error: "Only Super Admin can publish or unpublish gallery items." }); return; }
    const temple = getTempleById(templeId);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const cover = safeHttpUrl(body.cover_image ?? body.coverImage, 2000);
    const sourcePath = safeHttpUrl(body.source_path ?? body.sourcePath, 2000);
    if ((body.cover_image ?? body.coverImage) && !cover) { res.status(400).json({ success: false, error: "cover_image must be a valid HTTP(S) URL or safe relative path." }); return; }
    if ((body.source_path ?? body.sourcePath) && !sourcePath) { res.status(400).json({ success: false, error: "source_path must be a valid HTTP(S) URL or safe relative path." }); return; }
    const result = db.prepare(
      `INSERT INTO gallery_items (
        slug, title, tag, caption, description, cover_image, source_path, alt_text,
        content_type, related_entity_type, related_entity_id, location_id, country_location_id,
        state_location_id, district_location_id, city_location_id, status, featured, sort_order, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'temple', 'temple', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).run(
      uniqueEntitySlug("gallery_items", title, body.slug), title, nullableText(body.tag, 120), nullableText(body.caption, 1000), nullableText(body.description, 10000), cover, sourcePath, nullableText(body.alt_text ?? body.altText, 500),
      templeId, temple.location_id ?? null, temple.country_location_id ?? null, temple.state_location_id ?? null, temple.district_location_id ?? null, temple.city_location_id ?? null,
      status, currentUser(res)?.role === "super_admin" && booleanValue(body.featured) ? 1 : 0, integerInRange(body.sort_order ?? body.sortOrder, 0, 100000, 0) ?? 0,
    );
    const item = db.prepare("SELECT * FROM gallery_items WHERE id = ? LIMIT 1").get(Number(result.lastInsertRowid));
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.gallery.created", entityType: "temple", entityId: templeId, newData: item, req });
    res.status(201).json({ success: true, item });
  } catch (error) {
    console.error("Temple gallery create error:", error);
    if (String(error).toLowerCase().includes("unique")) { res.status(409).json({ success: false, error: "Gallery slug already exists." }); return; }
    res.status(500).json({ success: false, error: "Unable to create gallery item." });
  }
});

router.patch("/manage/:id/gallery/:itemId", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), itemId = positiveId(req.params.itemId);
    if (!templeId || !itemId) { res.status(400).json({ success: false, error: "Invalid temple or gallery id." }); return; }
    const current = db.prepare(`SELECT * FROM gallery_items WHERE id = ? AND content_type = 'temple' AND related_entity_type = 'temple' AND related_entity_id = ? LIMIT 1`).get(itemId, templeId) as Row | undefined;
    if (!current) { res.status(404).json({ success: false, error: "Gallery item not found." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    if (currentUser(res)?.role !== "super_admin") {
      const subscription = requireActiveTempleFeature(templeId, "gallery", res);
      if (!subscription) return;
    }
    const updates: string[] = [], values: unknown[] = [];
    for (const [input, column, max] of [["title","title",250],["tag","tag",120],["caption","caption",1000],["description","description",10000],["alt_text","alt_text",500]] as Array<[string,string,number]>) {
      if (Object.prototype.hasOwnProperty.call(body, input)) { updates.push(`${column} = ?`); values.push(nullableText(body[input], max)); }
    }
    if (Object.prototype.hasOwnProperty.call(body, "cover_image")) {
      const safe = safeHttpUrl(body.cover_image, 2000); if (body.cover_image && !safe) { res.status(400).json({ success: false, error: "cover_image must be a valid HTTP(S) URL or safe relative path." }); return; }
      updates.push("cover_image = ?"); values.push(safe);
    }
    if (Object.prototype.hasOwnProperty.call(body, "source_path")) {
      const safe = safeHttpUrl(body.source_path, 2000); if (body.source_path && !safe) { res.status(400).json({ success: false, error: "source_path must be a valid HTTP(S) URL or safe relative path." }); return; }
      updates.push("source_path = ?"); values.push(safe);
    }
    if (Object.prototype.hasOwnProperty.call(body, "slug")) { updates.push("slug = ?"); values.push(uniqueEntitySlug("gallery_items", String(body.title ?? current.title ?? "gallery"), body.slug, itemId)); }
    if (Object.prototype.hasOwnProperty.call(body, "sort_order")) { updates.push("sort_order = ?"); values.push(integerInRange(body.sort_order, 0, 100000, 0) ?? 0); }
    if (Object.prototype.hasOwnProperty.call(body, "featured")) {
      if (currentUser(res)?.role !== "super_admin") { res.status(403).json({ success: false, error: "Only Super Admin can feature gallery items." }); return; }
      updates.push("featured = ?"); values.push(booleanValue(body.featured) ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = normalizeText(body.status, 20).toLowerCase();
      const error = validateChildStatus(status); if (error) { res.status(400).json({ success: false, error }); return; }
      if (currentUser(res)?.role !== "super_admin" && status !== "draft") { res.status(403).json({ success: false, error: "Only Super Admin can publish or unpublish gallery items." }); return; }
      updates.push("status = ?"); values.push(status);
    }
    if (!updates.length) { res.json({ success: true, item: current }); return; }
    updates.push("updated_at = CURRENT_TIMESTAMP"); values.push(itemId, templeId);
    db.prepare(`UPDATE gallery_items SET ${updates.join(", ")} WHERE id = ? AND content_type = 'temple' AND related_entity_type = 'temple' AND related_entity_id = ?`).run(...values);
    const updated = db.prepare("SELECT * FROM gallery_items WHERE id = ? LIMIT 1").get(itemId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.gallery.updated", entityType: "temple", entityId: templeId, oldData: current, newData: updated, req });
    res.json({ success: true, item: updated });
  } catch (error) {
    console.error("Temple gallery update error:", error);
    res.status(500).json({ success: false, error: "Unable to update gallery item." });
  }
});

router.delete("/manage/:id/gallery/:itemId", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), itemId = positiveId(req.params.itemId);
    if (!templeId || !itemId) { res.status(400).json({ success: false, error: "Invalid temple or gallery id." }); return; }
    const current = db.prepare(`SELECT * FROM gallery_items WHERE id = ? AND content_type = 'temple' AND related_entity_type = 'temple' AND related_entity_id = ? LIMIT 1`).get(itemId, templeId) as Row | undefined;
    if (!current) { res.status(404).json({ success: false, error: "Gallery item not found." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "gallery", res); if (!subscription) return; }
    db.transaction(() => {
      db.prepare("DELETE FROM gallery_media WHERE gallery_item_id = ?").run(itemId);
      db.prepare("DELETE FROM gallery_items WHERE id = ? AND related_entity_id = ? AND related_entity_type = 'temple'").run(itemId, templeId);
      auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.gallery.deleted", entityType: "temple", entityId: templeId, oldData: current, req });
    })();
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error("Temple gallery delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete gallery item." });
  }
});

router.post("/manage/:id/gallery/:itemId/media", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), itemId = positiveId(req.params.itemId);
    if (!templeId || !itemId) { res.status(400).json({ success: false, error: "Invalid temple or gallery id." }); return; }
    const gallery = db.prepare(`SELECT id FROM gallery_items WHERE id = ? AND content_type = 'temple' AND related_entity_type = 'temple' AND related_entity_id = ? LIMIT 1`).get(itemId, templeId);
    if (!gallery) { res.status(404).json({ success: false, error: "Gallery item not found." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "gallery", res); if (!subscription) return; }
    const mediaUrl = safeHttpUrl(req.body?.media_url ?? req.body?.mediaUrl, 3000);
    if (!mediaUrl) { res.status(400).json({ success: false, error: "media_url must be a valid HTTP(S) URL or safe relative path." }); return; }
    const thumbRaw = req.body?.thumbnail_url ?? req.body?.thumbnailUrl;
    const thumbnail = safeHttpUrl(thumbRaw, 3000);
    if (thumbRaw && !thumbnail) { res.status(400).json({ success: false, error: "thumbnail_url must be a valid HTTP(S) URL or safe relative path." }); return; }
    const result = db.prepare(
      `INSERT INTO gallery_media (gallery_item_id, media_url, thumbnail_url, alt_text, caption, width, height, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).run(itemId, mediaUrl, thumbnail, nullableText(req.body?.alt_text ?? req.body?.altText, 500), nullableText(req.body?.caption, 1000), integerInRange(req.body?.width, 1, 20000, null), integerInRange(req.body?.height, 1, 20000, null), integerInRange(req.body?.sort_order ?? req.body?.sortOrder, 0, 100000, 0) ?? 0);
    const media = db.prepare("SELECT * FROM gallery_media WHERE id = ? LIMIT 1").get(Number(result.lastInsertRowid));
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.gallery_media.created", entityType: "temple", entityId: templeId, newData: media, req });
    res.status(201).json({ success: true, media });
  } catch (error) {
    console.error("Temple gallery media create error:", error);
    res.status(500).json({ success: false, error: "Unable to add gallery media." });
  }
});

router.delete("/manage/:id/gallery/:itemId/media/:mediaId", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), itemId = positiveId(req.params.itemId), mediaId = positiveId(req.params.mediaId);
    if (!templeId || !itemId || !mediaId) { res.status(400).json({ success: false, error: "Invalid temple, gallery or media id." }); return; }
    const current = db.prepare(`SELECT gm.* FROM gallery_media gm INNER JOIN gallery_items gi ON gi.id = gm.gallery_item_id WHERE gm.id = ? AND gm.gallery_item_id = ? AND gi.content_type = 'temple' AND gi.related_entity_id = ? LIMIT 1`).get(mediaId, itemId, templeId) as Row | undefined;
    if (!current) { res.status(404).json({ success: false, error: "Gallery media not found." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "gallery", res); if (!subscription) return; }
    db.prepare("DELETE FROM gallery_media WHERE id = ? AND gallery_item_id = ?").run(mediaId, itemId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.gallery_media.deleted", entityType: "temple", entityId: templeId, oldData: current, req });
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error("Temple gallery media delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete gallery media." });
  }
});

/* --------------------------------------------------------------------------
 * Temple Videos
 * -------------------------------------------------------------------------- */

function validVideoProvider(value: string): boolean {
  return ["youtube", "vimeo", "self_hosted", "other"].includes(value);
}

router.get("/manage/:id/videos", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const videos = db.prepare("SELECT * FROM videos WHERE related_temple_id = ? ORDER BY featured DESC, sort_order ASC, id DESC").all(templeId);
    const subscription = getActiveTempleSubscription(templeId);
    res.json({ success: true, videos, usage: { count: videos.length, limit: subscription?.video_limit ?? 0 } });
  } catch (error) {
    console.error("Temple video list error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple videos." });
  }
});

router.post("/manage/:id/videos", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const subscription = requireActiveTempleFeature(templeId, "video", res);
    if (currentUser(res)?.role !== "super_admin" && !subscription) return;
    if (subscription && activeCount("videos", templeId) >= Number(subscription.video_limit ?? 0)) {
      res.status(409).json({ success: false, error: "Temple video limit reached for the current plan.", code: "TEMPLE_VIDEO_LIMIT_REACHED", limit: subscription.video_limit }); return;
    }
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const temple = getTempleById(templeId);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const title = normalizeText(body.title, 250);
    const videoUrl = safeHttpUrl(body.video_url ?? body.videoUrl ?? body.watch_url ?? body.watchUrl, 3000);
    if (!title || !videoUrl) { res.status(400).json({ success: false, error: "title and a valid video_url are required." }); return; }
    const watchUrlRaw = body.watch_url ?? body.watchUrl ?? body.video_url ?? body.videoUrl;
    const watchUrl = safeHttpUrl(watchUrlRaw, 3000);
    const provider = normalizeText(body.video_provider ?? body.videoProvider, 30).toLowerCase() || "youtube";
    if (!validVideoProvider(provider)) { res.status(400).json({ success: false, error: "Invalid video provider." }); return; }
    const status = normalizeText(body.status, 20).toLowerCase() || "draft";
    const statusError = validateChildStatus(status);
    if (statusError) { res.status(400).json({ success: false, error: statusError }); return; }
    if (currentUser(res)?.role !== "super_admin" && status !== "draft") { res.status(403).json({ success: false, error: "Only Super Admin can publish or unpublish temple videos." }); return; }
    const thumbnailRaw = body.thumbnail_url ?? body.thumbnailUrl;
    const thumbnail = safeHttpUrl(thumbnailRaw, 3000);
    if (thumbnailRaw && !thumbnail) { res.status(400).json({ success: false, error: "thumbnail_url must be a valid HTTP(S) URL or safe relative path." }); return; }
    const image = safeHttpUrl(body.image, 2000);
    if (body.image && !image) { res.status(400).json({ success: false, error: "image must be a valid HTTP(S) URL or safe relative path." }); return; }

    const result = db.prepare(
      `INSERT INTO videos (
        slug, title, short_description, description, provider, video_id, watch_url,
        video_provider, video_url, embed_url, external_video_id, thumbnail_url, image,
        duration_text, duration_seconds, category, tags_json,
        related_entity_type, related_entity_id, related_temple_id,
        location_id, country_location_id, state_location_id, district_location_id, city_location_id,
        status, featured, is_active, sort_order, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'temple', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).run(
      uniqueEntitySlug("videos", title, body.slug), title,
      nullableText(body.short_description ?? body.shortDescription, 2000), nullableText(body.description, 10000), nullableText(body.provider, 50),
      nullableText(body.video_id ?? body.videoId, 300), watchUrl, provider, videoUrl,
      safeHttpUrl(body.embed_url ?? body.embedUrl, 3000), nullableText(body.external_video_id ?? body.externalVideoId, 300), thumbnail, image,
      nullableText(body.duration_text ?? body.durationText, 100), integerInRange(body.duration_seconds ?? body.durationSeconds, 0, 2_000_000, null), nullableText(body.category, 120), toJson(body.tags ?? body.tags_json, "[]"),
      templeId, templeId, temple.location_id ?? null, temple.country_location_id ?? null, temple.state_location_id ?? null, temple.district_location_id ?? null, temple.city_location_id ?? null,
      status, currentUser(res)?.role === "super_admin" && booleanValue(body.featured) ? 1 : 0, integerInRange(body.sort_order ?? body.sortOrder, 0, 100000, 0) ?? 0,
      status === "published" ? new Date().toISOString() : null,
    );
    const video = db.prepare("SELECT * FROM videos WHERE id = ? LIMIT 1").get(Number(result.lastInsertRowid));
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.video.created", entityType: "temple", entityId: templeId, newData: video, req });
    res.status(201).json({ success: true, video });
  } catch (error) {
    console.error("Temple video create error:", error);
    if (String(error).toLowerCase().includes("unique")) { res.status(409).json({ success: false, error: "Video slug already exists." }); return; }
    res.status(500).json({ success: false, error: "Unable to create temple video." });
  }
});

router.patch("/manage/:id/videos/:videoId", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), videoId = positiveId(req.params.videoId);
    if (!templeId || !videoId) { res.status(400).json({ success: false, error: "Invalid temple or video id." }); return; }
    const current = db.prepare("SELECT * FROM videos WHERE id = ? AND related_temple_id = ? LIMIT 1").get(videoId, templeId) as Row | undefined;
    if (!current) { res.status(404).json({ success: false, error: "Temple video not found." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "video", res); if (!subscription) return; }
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const updates: string[] = [], values: unknown[] = [];
    for (const [input, column, max] of [["title","title",250],["short_description","short_description",2000],["description","description",10000],["category","category",120],["duration_text","duration_text",100]] as Array<[string,string,number]>) {
      if (Object.prototype.hasOwnProperty.call(body, input)) { updates.push(`${column} = ?`); values.push(nullableText(body[input], max)); }
    }
    for (const [input, column, max] of [["thumbnail_url","thumbnail_url",3000],["image","image",2000],["embed_url","embed_url",3000]] as Array<[string,string,number]>) {
      if (Object.prototype.hasOwnProperty.call(body, input)) {
        const safe = safeHttpUrl(body[input], max); if (body[input] && !safe) { res.status(400).json({ success: false, error: `${input} must be a valid HTTP(S) URL or safe relative path.` }); return; }
        updates.push(`${column} = ?`); values.push(safe);
      }
    }
    for (const input of ["watch_url", "watchUrl", "video_url", "videoUrl"] as const) {
      if (Object.prototype.hasOwnProperty.call(body, input)) {
        const safe = safeHttpUrl(body[input], 3000); if (!safe) { res.status(400).json({ success: false, error: `${input} must be a valid HTTP(S) URL or safe relative path.` }); return; }
        updates.push(input.toLowerCase().includes("watch") ? "watch_url = ?" : "video_url = ?"); values.push(safe);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "video_provider") || Object.prototype.hasOwnProperty.call(body, "videoProvider")) {
      const provider = normalizeText(body.video_provider ?? body.videoProvider, 30).toLowerCase();
      if (!validVideoProvider(provider)) { res.status(400).json({ success: false, error: "Invalid video provider." }); return; }
      updates.push("video_provider = ?"); values.push(provider);
    }
    if (Object.prototype.hasOwnProperty.call(body, "tags") || Object.prototype.hasOwnProperty.call(body, "tags_json")) { updates.push("tags_json = ?"); values.push(toJson(body.tags ?? body.tags_json, "[]")); }
    if (Object.prototype.hasOwnProperty.call(body, "duration_seconds")) { updates.push("duration_seconds = ?"); values.push(integerInRange(body.duration_seconds, 0, 2_000_000, null)); }
    if (Object.prototype.hasOwnProperty.call(body, "slug")) { if (currentUser(res)?.role !== "super_admin") { res.status(403).json({ success: false, error: "Only Super Admin can change a video URL slug." }); return; } updates.push("slug = ?"); values.push(uniqueEntitySlug("videos", String(body.title ?? current.title ?? "video"), body.slug, videoId)); }
    if (Object.prototype.hasOwnProperty.call(body, "sort_order")) { updates.push("sort_order = ?"); values.push(integerInRange(body.sort_order, 0, 100000, 0) ?? 0); }
    if (Object.prototype.hasOwnProperty.call(body, "featured")) { if (currentUser(res)?.role !== "super_admin") { res.status(403).json({ success: false, error: "Only Super Admin can feature temple videos." }); return; } updates.push("featured = ?"); values.push(booleanValue(body.featured) ? 1 : 0); }
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = normalizeText(body.status, 20).toLowerCase(); const error = validateChildStatus(status); if (error) { res.status(400).json({ success: false, error }); return; }
      if (currentUser(res)?.role !== "super_admin" && status !== "draft") { res.status(403).json({ success: false, error: "Only Super Admin can publish or unpublish temple videos." }); return; }
      updates.push("status = ?"); values.push(status);
      if (status === "published") updates.push("published_at = COALESCE(published_at, CURRENT_TIMESTAMP)");
    }
    if (Object.prototype.hasOwnProperty.call(body, "is_active")) { updates.push("is_active = ?"); values.push(booleanValue(body.is_active, true) ? 1 : 0); }
    if (!updates.length) { res.json({ success: true, video: current }); return; }
    updates.push("updated_at = CURRENT_TIMESTAMP"); values.push(videoId, templeId);
    db.prepare(`UPDATE videos SET ${updates.join(", ")} WHERE id = ? AND related_temple_id = ?`).run(...values);
    const updated = db.prepare("SELECT * FROM videos WHERE id = ? LIMIT 1").get(videoId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.video.updated", entityType: "temple", entityId: templeId, oldData: current, newData: updated, req });
    res.json({ success: true, video: updated });
  } catch (error) {
    console.error("Temple video update error:", error);
    res.status(500).json({ success: false, error: "Unable to update temple video." });
  }
});

router.delete("/manage/:id/videos/:videoId", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), videoId = positiveId(req.params.videoId);
    if (!templeId || !videoId) { res.status(400).json({ success: false, error: "Invalid temple or video id." }); return; }
    const current = db.prepare("SELECT * FROM videos WHERE id = ? AND related_temple_id = ? LIMIT 1").get(videoId, templeId) as Row | undefined;
    if (!current) { res.status(404).json({ success: false, error: "Temple video not found." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "video", res); if (!subscription) return; }
    db.prepare("DELETE FROM videos WHERE id = ? AND related_temple_id = ?").run(videoId, templeId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.video.deleted", entityType: "temple", entityId: templeId, oldData: current, req });
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error("Temple video delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete temple video." });
  }
});

/* --------------------------------------------------------------------------
 * Temple Managers / assignments
 * -------------------------------------------------------------------------- */

router.get("/manage/:id/managers", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const rows = db.prepare(
      `SELECT tma.*, u.name, u.email, u.phone, u.status AS user_status,
              tmp.designation, tmp.organization_name, tmp.verification_status
       FROM temple_manager_assignments tma
       INNER JOIN users u ON u.id = tma.manager_user_id
       LEFT JOIN temple_manager_profiles tmp ON tmp.user_id = u.id
       WHERE tma.temple_id = ?
       ORDER BY CASE tma.status WHEN 'active' THEN 0 WHEN 'inactive' THEN 1 ELSE 2 END, u.name ASC`,
    ).all(templeId);
    res.json({ success: true, managers: rows });
  } catch (error) {
    console.error("Temple manager list error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple managers." });
  }
});

router.post("/manage/:id/managers", requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), managerUserId = positiveId(req.body?.managerUserId ?? req.body?.userId);
    if (!templeId || !managerUserId) { res.status(400).json({ success: false, error: "Valid templeId and managerUserId are required." }); return; }
    if (!getTempleById(templeId)) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const manager = db.prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.status, r.code AS role_code
       FROM users u INNER JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1`,
    ).get(managerUserId) as { id: number; name: string; email?: string; phone?: string; status: string; role_code: string } | undefined;
    if (!manager) { res.status(404).json({ success: false, error: "Manager user not found." }); return; }
    if (manager.role_code !== "temple_manager" || manager.status !== "active") { res.status(400).json({ success: false, error: "Selected user must be an active Temple Manager." }); return; }
    const profile = db.prepare("SELECT verification_status FROM temple_manager_profiles WHERE user_id = ? LIMIT 1").get(managerUserId) as { verification_status?: string } | undefined;
    if (profile?.verification_status === "suspended" || profile?.verification_status === "rejected") { res.status(400).json({ success: false, error: "Selected Temple Manager is not eligible for a new assignment." }); return; }

    db.transaction(() => {
      db.prepare(
        `UPDATE temple_manager_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE temple_id = ? AND manager_user_id = ? AND status = 'active'`,
      ).run(templeId, managerUserId);
      const result = db.prepare(
        `INSERT INTO temple_manager_assignments (
           temple_id, manager_user_id, assigned_by, status, assigned_at, revoked_at, created_at, updated_at
         ) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).run(templeId, managerUserId, currentUser(res)?.id ?? null);
      const assignment = db.prepare("SELECT * FROM temple_manager_assignments WHERE id = ? LIMIT 1").get(Number(result.lastInsertRowid));
      auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.manager.assigned", entityType: "temple", entityId: templeId, newData: assignment, req });
    })();
    const active = db.prepare("SELECT * FROM temple_manager_assignments WHERE temple_id = ? AND manager_user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(templeId, managerUserId);
    res.status(201).json({ success: true, assignment: active });
  } catch (error) {
    console.error("Temple manager assign error:", error);
    res.status(500).json({ success: false, error: "Unable to assign temple manager." });
  }
});

router.patch("/manage/:id/managers/:assignmentId", requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), assignmentId = positiveId(req.params.assignmentId);
    if (!templeId || !assignmentId) { res.status(400).json({ success: false, error: "Invalid temple or assignment id." }); return; }
    const status = normalizeText(req.body?.status, 20).toLowerCase();
    if (!["active", "inactive", "revoked"].includes(status)) { res.status(400).json({ success: false, error: "Invalid assignment status." }); return; }
    const current = db.prepare("SELECT * FROM temple_manager_assignments WHERE id = ? AND temple_id = ? LIMIT 1").get(assignmentId, templeId) as Row | undefined;
    if (!current) { res.status(404).json({ success: false, error: "Assignment not found." }); return; }
    if (status === "active") {
      const manager = db.prepare(
        `SELECT u.status AS user_status, r.code AS role_code, tmp.verification_status
         FROM users u INNER JOIN roles r ON r.id = u.role_id
         LEFT JOIN temple_manager_profiles tmp ON tmp.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
      ).get(current.manager_user_id) as { user_status?: string; role_code?: string; verification_status?: string } | undefined;
      if (manager?.user_status !== "active" || manager.role_code !== "temple_manager" || ["suspended", "rejected"].includes(String(manager.verification_status ?? "pending"))) {
        res.status(400).json({ success: false, error: "This manager cannot be reactivated until the account/profile is eligible." }); return;
      }
    }
    db.prepare(
      `UPDATE temple_manager_assignments SET status = ?, revoked_at = CASE WHEN ? = 'revoked' THEN COALESCE(revoked_at, CURRENT_TIMESTAMP) ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND temple_id = ?`,
    ).run(status, status, assignmentId, templeId);
    const updated = db.prepare("SELECT * FROM temple_manager_assignments WHERE id = ? LIMIT 1").get(assignmentId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.manager.assignment_updated", entityType: "temple", entityId: templeId, oldData: current, newData: updated, req });
    res.json({ success: true, assignment: updated });
  } catch (error) {
    console.error("Temple manager assignment update error:", error);
    res.status(500).json({ success: false, error: "Unable to update temple manager assignment." });
  }
});

router.get("/manage/:id/manager-profile", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const user = currentUser(res);
    if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    let managerUserId = user.id;
    if (user.role === "super_admin") {
      managerUserId = positiveId(req.query.managerUserId) ?? user.id;
    }
    if (user.role !== "super_admin" && !isTempleManagerAssigned(templeId, managerUserId)) { res.status(403).json({ success: false, error: "You are not assigned to this temple." }); return; }
    const profile = db.prepare(
      `SELECT tmp.*, u.name, u.email, u.phone, u.status AS user_status FROM temple_manager_profiles tmp INNER JOIN users u ON u.id = tmp.user_id WHERE tmp.user_id = ? LIMIT 1`,
    ).get(managerUserId) ?? null;
    res.json({ success: true, managerUserId, profile });
  } catch (error) {
    console.error("Temple manager profile get error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple manager profile." });
  }
});

router.patch("/manage/:id/manager-profile", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const user = currentUser(res);
    if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    const managerUserId = user.role === "super_admin" ? positiveId(req.body?.managerUserId) ?? user.id : user.id;
    if (user.role !== "super_admin" && !isTempleManagerAssigned(templeId, managerUserId)) { res.status(403).json({ success: false, error: "You are not assigned to this temple." }); return; }
    const manager = db.prepare("SELECT id FROM users WHERE id = ? AND role_id = (SELECT id FROM roles WHERE code = 'temple_manager' LIMIT 1) LIMIT 1").get(managerUserId) as { id?: number } | undefined;
    if (!manager) { res.status(400).json({ success: false, error: "Selected user is not a Temple Manager." }); return; }
    const current = db.prepare("SELECT * FROM temple_manager_profiles WHERE user_id = ? LIMIT 1").get(managerUserId) as Row | undefined;
    const designation = Object.prototype.hasOwnProperty.call(req.body ?? {}, "designation") ? nullableText(req.body?.designation, 250) : nullableText(current?.designation, 250);
    const organizationName = Object.prototype.hasOwnProperty.call(req.body ?? {}, "organization_name") ? nullableText(req.body?.organization_name, 300) : nullableText(current?.organization_name, 300);
    const verificationStatus = user.role === "super_admin" && Object.prototype.hasOwnProperty.call(req.body ?? {}, "verification_status") ? normalizeText(req.body?.verification_status, 30).toLowerCase() : String(current?.verification_status ?? "pending");
    if (!["pending", "verified", "rejected", "suspended"].includes(verificationStatus)) { res.status(400).json({ success: false, error: "Invalid manager verification status." }); return; }
    db.prepare(
      `INSERT INTO temple_manager_profiles (user_id, designation, organization_name, verification_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET designation = excluded.designation, organization_name = excluded.organization_name, verification_status = excluded.verification_status, updated_at = CURRENT_TIMESTAMP`,
    ).run(managerUserId, designation, organizationName, verificationStatus);
    const profile = db.prepare("SELECT * FROM temple_manager_profiles WHERE user_id = ? LIMIT 1").get(managerUserId);
    auditLog({ userId: user.id, action: "temple.manager_profile.updated", entityType: "temple_manager_profile", entityId: managerUserId, oldData: current, newData: profile, req });
    res.json({ success: true, profile });
  } catch (error) {
    console.error("Temple manager profile update error:", error);
    res.status(500).json({ success: false, error: "Unable to update temple manager profile." });
  }
});

/* --------------------------------------------------------------------------
 * Temple enquiries — read only; lifecycle remains in /api/leads
 * -------------------------------------------------------------------------- */

router.get("/manage/:id/enquiries/stats", requireAuth, requireTempleLeadViewer, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const totals = db.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(l.status,'new') = 'new' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN COALESCE(l.status,'new') = 'qualified' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN COALESCE(l.status,'new') = 'contacted' THEN 1 ELSE 0 END) AS contacted_count,
        SUM(CASE WHEN COALESCE(l.status,'new') = 'follow_up' THEN 1 ELSE 0 END) AS follow_up_count,
        SUM(CASE WHEN COALESCE(l.status,'new') = 'converted' THEN 1 ELSE 0 END) AS converted_count,
        SUM(CASE WHEN COALESCE(l.status,'new') IN ('lost','closed') THEN 1 ELSE 0 END) AS closed_count
       FROM temple_enquiry_requests ter LEFT JOIN leads l ON l.id = ter.lead_id WHERE ter.temple_id = ?`,
    ).get(templeId);
    res.json({ success: true, stats: totals });
  } catch (error) {
    console.error("Temple enquiry stats error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple enquiry statistics." });
  }
});

router.get("/manage/:id/enquiries", requireAuth, requireTempleLeadViewer, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const page = Math.max(1, integerInRange(req.query.page, 1, 100000, 1) ?? 1);
    const limit = Math.min(100, Math.max(1, integerInRange(req.query.limit, 1, 100, 25) ?? 25));
    const offset = (page - 1) * limit;
    const status = normalizeText(req.query.status, 30).toLowerCase();
    const enquiryType = normalizeText(req.query.enquiryType ?? req.query.enquiry_type, 120);
    const search = normalizeText(req.query.search, 180);
    const where = ["ter.temple_id = ?"], params: unknown[] = [templeId];
    if (status) { where.push("COALESCE(l.status,'new') = ?"); params.push(status); }
    if (enquiryType) { where.push("LOWER(COALESCE(ter.enquiry_type,'')) = LOWER(?)"); params.push(enquiryType); }
    if (search) { const like = `%${search}%`; where.push(`(LOWER(COALESCE(l.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.phone,'')) LIKE LOWER(?) OR LOWER(COALESCE(l.email,'')) LIKE LOWER(?) OR LOWER(COALESCE(ter.message,'')) LIKE LOWER(?) OR LOWER(COALESCE(ter.city,'')) LIKE LOWER(?))`); params.push(like, like, like, like, like); }
    const whereSql = where.join(" AND ");
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM temple_enquiry_requests ter LEFT JOIN leads l ON l.id = ter.lead_id WHERE ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const rows = db.prepare(
      `SELECT ter.*, l.lead_number, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email,
              l.status AS lead_status, l.priority AS lead_priority, l.lead_score, l.lead_temperature,
              l.contact_preference, l.created_at AS lead_created_at, l.last_activity_at
       FROM temple_enquiry_requests ter LEFT JOIN leads l ON l.id = ter.lead_id
       WHERE ${whereSql} ORDER BY ter.created_at DESC, ter.id DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset);
    res.json({ success: true, enquiries: rows, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) }, note: "Lead creation, assignment, credit consumption and status mutation remain owned by /api/leads." });
  } catch (error) {
    console.error("Temple enquiries list error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple enquiries." });
  }
});

router.get("/manage/:id/enquiries/:enquiryId", requireAuth, requireTempleLeadViewer, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), enquiryId = positiveId(req.params.enquiryId);
    if (!templeId || !enquiryId) { res.status(400).json({ success: false, error: "Invalid temple or enquiry id." }); return; }
    const row = db.prepare(
      `SELECT ter.*, l.lead_number, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email,
              l.city AS lead_city, l.state AS lead_state, l.district AS lead_district, l.country AS lead_country,
              l.service_type, l.puja_type, l.status AS lead_status, l.priority AS lead_priority, l.message AS lead_message,
              l.source_type, l.source_page, l.source_form, l.utm_source, l.utm_medium, l.utm_campaign, l.landing_page,
              l.referrer_url, l.contact_preference, l.lead_score, l.lead_temperature, l.last_activity_at,
              l.created_at AS lead_created_at, l.updated_at AS lead_updated_at
       FROM temple_enquiry_requests ter LEFT JOIN leads l ON l.id = ter.lead_id
       WHERE ter.id = ? AND ter.temple_id = ? LIMIT 1`,
    ).get(enquiryId, templeId);
    if (!row) { res.status(404).json({ success: false, error: "Temple enquiry not found." }); return; }
    res.json({ success: true, enquiry: row });
  } catch (error) {
    console.error("Temple enquiry detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple enquiry." });
  }
});

/* --------------------------------------------------------------------------
 * Temple SEO
 * -------------------------------------------------------------------------- */

function getTempleSeo(templeId: number): Row | null {
  return (db.prepare(
    `SELECT * FROM seo_entries WHERE entity_type = 'temple' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(templeId) as Row | undefined) ?? null;
}

router.get("/manage/:id/seo", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const temple = getTempleById(templeId);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const seo = getTempleSeo(templeId);
    const keywords = db.prepare("SELECT * FROM temple_seo_keywords WHERE temple_id = ? ORDER BY sort_order ASC, id ASC").all(templeId);
    res.json({ success: true, temple, seo, keywords, entitlement: { enhancedSeo: Boolean(getActiveTempleSubscription(templeId)?.enhanced_seo) } });
  } catch (error) {
    console.error("Temple SEO get error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple SEO." });
  }
});

router.put("/manage/:id/seo", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const temple = getTempleById(templeId);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "enhanced_seo", res); if (!subscription) return; }
    const body = req.body && typeof req.body === "object" ? req.body as Row : {};
    const path = buildTemplePath(String(temple.slug ?? ""));
    const location = locationInputFromTemple(temple);
    const current = getTempleSeo(templeId);
    const requestedCanonical = body.canonicalUrl ?? body.canonical_url;
    const canonicalUrl = requestedCanonical === undefined ? String(current?.canonical_url ?? path) : safeHttpUrl(requestedCanonical, 2000);
    if (!canonicalUrl) { res.status(400).json({ success: false, error: "canonicalUrl must be a valid HTTP(S) URL or safe relative path." }); return; }
    const requestedRobots = nullableText(body.robots, 150);
    if (currentUser(res)?.role !== "super_admin" && (Object.prototype.hasOwnProperty.call(body, "status") || Object.prototype.hasOwnProperty.call(body, "isIndexable") || Object.prototype.hasOwnProperty.call(body, "is_indexable") || Object.prototype.hasOwnProperty.call(body, "robots"))) {
      res.status(403).json({ success: false, error: "Temple Managers cannot directly change crawl/publish controls; they follow the Temple publication workflow." }); return;
    }

    const values = {
      path,
      country_id: location.countryId,
      state_id: location.stateId,
      district_id: location.districtId,
      city_id: location.cityId,
      area_id: location.areaId,
      location_level: location.areaId ? "area" : location.cityId ? "city" : location.districtId ? "district" : location.stateId ? "state" : location.countryId ? "country" : null,
      seo_title: nullableText(body.seoTitle ?? body.seo_title, 320),
      meta_description: nullableText(body.metaDescription ?? body.meta_description, 5000),
      canonical_url: canonicalUrl,
      og_title: nullableText(body.ogTitle ?? body.og_title, 320),
      og_description: nullableText(body.ogDescription ?? body.og_description, 5000),
      og_image: safeHttpUrl(body.ogImage ?? body.og_image, 2000),
      twitter_card: nullableText(body.twitterCard ?? body.twitter_card, 100) || "summary_large_image",
      twitter_title: nullableText(body.twitterTitle ?? body.twitter_title, 320),
      twitter_description: nullableText(body.twitterDescription ?? body.twitter_description, 5000),
      twitter_image: safeHttpUrl(body.twitterImage ?? body.twitter_image, 2000),
      robots: requestedRobots || (temple.status === "published" ? "index,follow" : "noindex,nofollow"),
      schema_json: body.schemaJson ?? body.schema_json,
      schema_type: nullableText(body.schemaType ?? body.schema_type, 150) || "PlaceOfWorship",
      focus_keyword: nullableText(body.focusKeyword ?? body.focus_keyword, 500),
      area: nullableText(body.area, 180),
      location_label: nullableText(body.locationLabel ?? body.location_label, 500),
      keywords_json: toJson(body.keywords ?? body.keywordsJson, "[]"),
      primary_keywords_json: toJson(body.primaryKeywords ?? body.primary_keywords_json, "[]"),
      location_keywords_json: toJson(body.locationKeywords ?? body.location_keywords_json, "[]"),
      long_tail_keywords_json: toJson(body.longTailKeywords ?? body.long_tail_keywords_json, "[]"),
      search_intents_json: toJson(body.searchIntents ?? body.search_intents_json, "[]"),
      canonical_locked: currentUser(res)?.role === "super_admin" && Object.prototype.hasOwnProperty.call(body, "canonical_locked") ? (booleanValue(body.canonical_locked) ? 1 : 0) : Number(current?.canonical_locked ?? 0),
    };
    const schemaJson = values.schema_json === undefined
      ? String(current?.schema_json ?? JSON.stringify({ "@context": "https://schema.org", "@type": "PlaceOfWorship", name: temple.name, url: canonicalUrl }))
      : toJson(values.schema_json, "{}");
    const isIndexable = temple.status === "published" ? 1 : 0;
    const status = temple.status === "published" ? "published" : "draft";
    const noindexReason = isIndexable ? null : "Temple is not published.";

    db.transaction(() => {
      if (current?.id) {
        db.prepare(
          `UPDATE seo_entries SET
             path = ?, country_id = ?, state_id = ?, district_id = ?, city_id = ?, area_id = ?, location_level = ?,
             seo_title = ?, meta_description = ?, canonical_url = ?, canonical_locked = ?,
             og_title = ?, og_description = ?, og_image = ?, twitter_card = ?, twitter_title = ?, twitter_description = ?, twitter_image = ?,
             robots = ?, schema_json = ?, schema_type = ?, focus_keyword = ?, area = ?, location_label = ?,
             keywords_json = ?, primary_keywords_json = ?, location_keywords_json = ?, long_tail_keywords_json = ?, search_intents_json = ?,
             is_indexable = ?, noindex_reason = ?, status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          values.path, values.country_id, values.state_id, values.district_id, values.city_id, values.area_id, values.location_level,
          values.seo_title, values.meta_description, values.canonical_url, values.canonical_locked,
          values.og_title, values.og_description, values.og_image, values.twitter_card, values.twitter_title, values.twitter_description, values.twitter_image,
          values.robots, schemaJson, values.schema_type, values.focus_keyword, values.area, values.location_label,
          values.keywords_json, values.primary_keywords_json, values.location_keywords_json, values.long_tail_keywords_json, values.search_intents_json,
          isIndexable, noindexReason, status, current.id,
        );
      } else {
        db.prepare(
          `INSERT INTO seo_entries (
             path, page_type, entity_type, entity_id,
             country_id, state_id, district_id, city_id, area_id, location_level,
             seo_title, meta_description, canonical_url, canonical_locked,
             og_title, og_description, og_image, twitter_card, twitter_title, twitter_description, twitter_image,
             robots, schema_json, schema_type, focus_keyword, area, location_label,
             keywords_json, primary_keywords_json, location_keywords_json, long_tail_keywords_json, search_intents_json,
             is_indexable, noindex_reason, status, created_at, updated_at
           ) VALUES (
             ?, 'temple', 'temple', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           )`,
        ).run(
          values.path, templeId, values.country_id, values.state_id, values.district_id, values.city_id, values.area_id, values.location_level,
          values.seo_title, values.meta_description, values.canonical_url, values.canonical_locked,
          values.og_title, values.og_description, values.og_image, values.twitter_card, values.twitter_title, values.twitter_description, values.twitter_image,
          values.robots, schemaJson, values.schema_type, values.focus_keyword, values.area, values.location_label,
          values.keywords_json, values.primary_keywords_json, values.location_keywords_json, values.long_tail_keywords_json, values.search_intents_json,
          isIndexable, noindexReason, status,
        );
      }
      auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.seo.updated", entityType: "temple", entityId: templeId, oldData: current, newData: getTempleSeo(templeId), req });
    })();
    res.json({ success: true, seo: getTempleSeo(templeId) });
  } catch (error) {
    console.error("Temple SEO update error:", error);
    if (String(error).toLowerCase().includes("unique")) { res.status(409).json({ success: false, error: "Temple SEO path conflicts with another SEO entry." }); return; }
    res.status(500).json({ success: false, error: "Unable to update temple SEO." });
  }
});

router.post("/manage/:id/seo/keywords", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "enhanced_seo", res); if (!subscription) return; }
    const keyword = normalizeText(req.body?.keyword, 500);
    const keywordType = normalizeText(req.body?.keywordType ?? req.body?.keyword_type, 30).toLowerCase();
    const sortOrder = integerInRange(req.body?.sortOrder ?? req.body?.sort_order, 0, 100000, 0) ?? 0;
    if (!keyword) { res.status(400).json({ success: false, error: "SEO keyword is required." }); return; }
    if (!SEO_KEYWORD_TYPES.includes(keywordType as typeof SEO_KEYWORD_TYPES[number])) { res.status(400).json({ success: false, error: "Invalid SEO keyword type." }); return; }
    db.prepare(
      `INSERT INTO temple_seo_keywords (temple_id, keyword_type, keyword, sort_order, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(temple_id, keyword_type, keyword) DO UPDATE SET sort_order = excluded.sort_order`,
    ).run(templeId, keywordType, keyword, sortOrder);
    const row = db.prepare("SELECT * FROM temple_seo_keywords WHERE temple_id = ? AND keyword_type = ? AND keyword = ? LIMIT 1").get(templeId, keywordType, keyword);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.seo_keyword.upserted", entityType: "temple", entityId: templeId, newData: row, req });
    res.status(201).json({ success: true, keyword: row });
  } catch (error) {
    console.error("Temple SEO keyword error:", error);
    res.status(500).json({ success: false, error: "Unable to save SEO keyword." });
  }
});

router.delete("/manage/:id/seo/keywords/:keywordId", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id), keywordId = positiveId(req.params.keywordId);
    if (!templeId || !keywordId) { res.status(400).json({ success: false, error: "Invalid temple or keyword id." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "enhanced_seo", res); if (!subscription) return; }
    const current = db.prepare("SELECT * FROM temple_seo_keywords WHERE id = ? AND temple_id = ? LIMIT 1").get(keywordId, templeId);
    if (!current) { res.status(404).json({ success: false, error: "SEO keyword not found." }); return; }
    db.prepare("DELETE FROM temple_seo_keywords WHERE id = ? AND temple_id = ?").run(keywordId, templeId);
    auditLog({ userId: currentUser(res)?.id ?? null, action: "temple.seo_keyword.deleted", entityType: "temple", entityId: templeId, oldData: current, req });
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error("Temple SEO keyword delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete SEO keyword." });
  }
});

/* --------------------------------------------------------------------------
 * Business insights / subscription summary (read only)
 * -------------------------------------------------------------------------- */

router.get("/manage/:id/insights", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const temple = getTempleById(templeId);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    if (currentUser(res)?.role !== "super_admin") { const subscription = requireActiveTempleFeature(templeId, "analytics", res); if (!subscription) return; }
    const from = normalizeText(req.query.from ?? req.query.dateFrom, 40) || "1970-01-01 00:00:00";
    const to = normalizeText(req.query.to ?? req.query.dateTo, 40) || "9999-12-31 23:59:59";
    const path = buildTemplePath(String(temple.slug ?? ""));
    const pageViews = db.prepare(
      `SELECT COUNT(*) AS page_views, COUNT(DISTINCT visitor_id) AS unique_visitors, COUNT(DISTINCT session_id) AS sessions,
              COALESCE(SUM(click_count),0) AS clicks, COALESCE(SUM(interaction_count),0) AS interactions,
              COALESCE(AVG(duration_seconds),0) AS avg_duration_seconds, COALESCE(MAX(scroll_depth_percent),0) AS max_scroll_depth
       FROM web_page_views WHERE entity_type = 'temple' AND entity_id = ? AND entered_at >= ? AND entered_at <= ? AND is_bot = 0`,
    ).get(templeId, from, to);
    const leads = db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
              SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualified_count,
              SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted_count,
              SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up_count,
              SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
              SUM(CASE WHEN status IN ('lost','closed') THEN 1 ELSE 0 END) AS closed_count
       FROM leads WHERE temple_id = ? AND created_at >= ? AND created_at <= ?`,
    ).get(templeId, from, to);
    const conversions = db.prepare(
      `SELECT conversion_type, COUNT(*) AS count, COALESCE(SUM(value_amount),0) AS value_amount
       FROM web_conversions WHERE entity_type = 'temple' AND entity_id = ? AND created_at >= ? AND created_at <= ?
       GROUP BY conversion_type ORDER BY count DESC`,
    ).all(templeId, from, to);
    const daily = db.prepare(
      `SELECT stat_date, page_views, unique_visitors, sessions, engaged_sessions, exits, bounces, leads, bookings, payments, revenue_amount
       FROM analytics_daily_page_stats WHERE path = ? AND stat_date >= DATE(?) AND stat_date <= DATE(?) ORDER BY stat_date DESC LIMIT 366`,
    ).all(path, from, to);
    res.json({ success: true, temple: { id: temple.id, slug: temple.slug, name: temple.name, path }, pageViews, leads, conversions, daily, attribution: { entityType: "temple", entityId: templeId, path } });
  } catch (error) {
    console.error("Temple insights error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple insights." });
  }
});

router.get("/manage/:id/subscription", requireAuth, requireTempleEditor, (req: Request, res: Response) => {
  try {
    const templeId = positiveId(req.params.id);
    if (!templeId) { res.status(400).json({ success: false, error: "Invalid temple id." }); return; }
    const subscription = db.prepare(
      `SELECT ts.*, sp.name AS plan_name, sp.code AS plan_code, sp.description AS plan_description,
              sp.price_amount AS plan_price_amount, sp.currency AS plan_currency,
              spp.id AS price_variant_id, spp.price_amount AS price_variant_amount,
              spp.currency AS price_variant_currency, spp.billing_interval AS price_variant_interval,
              spp.duration_days AS price_variant_duration_days, spp.provider AS price_variant_provider
       FROM temple_subscriptions ts INNER JOIN subscription_plans sp ON sp.id = ts.plan_id
       LEFT JOIN subscription_plan_prices spp ON spp.id = ts.subscription_plan_price_id
       WHERE ts.temple_id = ? ORDER BY ts.id DESC LIMIT 1`,
    ).get(templeId);
    res.json({ success: true, subscription, activeFeatures: publicSubscriptionFeatures(getActiveTempleSubscription(templeId)), note: "Subscription purchase, payment activation, renewal and cancellation remain owned by /api/subscriptions and /api/payments." });
  } catch (error) {
    console.error("Temple subscription error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple subscription." });
  }
});

/* --------------------------------------------------------------------------
 * Public focused resources / Temple detail
 * -------------------------------------------------------------------------- */

function publicFeatureEnabled(templeId: number, feature: "gallery" | "video" | "live_aarti" | "enhanced_seo"): boolean {
  const subscription = getActiveTempleSubscription(templeId);
  if (!subscription) return false;
  if (feature === "gallery") return Number(subscription.gallery_limit ?? 0) > 0;
  if (feature === "video") return Number(subscription.video_limit ?? 0) > 0;
  if (feature === "live_aarti") return Boolean(subscription.live_aarti_enabled);
  return Boolean(subscription.enhanced_seo);
}

function sendPublishedTempleResource(
  slugValue: unknown,
  resource: typeof RESOURCE_CONFIGS[number]["route"],
  res: Response,
): void {
  const slug = normalizeText(slugValue, 100).toLowerCase();
  if (!slug) { res.status(400).json({ success: false, error: "Temple slug is required." }); return; }
  const temple = getPublishedTempleBySlug(slug);
  if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
  const config = RESOURCE_CONFIGS.find((item) => item.route === resource);
  if (!config) { res.status(404).json({ success: false, error: "Temple resource not found." }); return; }
  const rows = db.prepare(`SELECT * FROM ${config.table} WHERE temple_id = ? AND is_active = 1 ORDER BY ${config.orderBy}`).all(Number(temple.id));
  res.json({ success: true, temple: { id: temple.id, slug: temple.slug, name: temple.name, path: buildTemplePath(String(temple.slug)) }, resource, items: rows });
}

for (const resource of RESOURCE_CONFIGS.map((item) => item.route) as Array<typeof RESOURCE_CONFIGS[number]["route"]>) {
  router.get(`/:slug/${resource}`, optionalAuth, (req: Request, res: Response) => {
    try {
      sendPublishedTempleResource(req.params.slug, resource, res);
    } catch (error) {
      console.error(`Public temple ${resource} error:`, error);
      res.status(500).json({ success: false, error: `Unable to load temple ${resource}.` });
    }
  });
}

router.get("/:slug/live-aarti", optionalAuth, (req: Request, res: Response) => {
  try {
    const slug = normalizeText(req.params.slug, 100).toLowerCase();
    const temple = getPublishedTempleBySlug(slug);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const enabled = publicFeatureEnabled(Number(temple.id), "live_aarti");
    const live = enabled ? db.prepare(`SELECT * FROM temple_live_aarti WHERE temple_id = ? AND enabled = 1 LIMIT 1`).get(Number(temple.id)) : null;
    res.json({ success: true, temple: { id: temple.id, slug: temple.slug, name: temple.name }, liveAarti: live ?? null, enabled: Boolean(live), featureAvailable: enabled });
  } catch (error) {
    console.error("Public temple live aarti error:", error);
    res.status(500).json({ success: false, error: "Unable to load live Aarti." });
  }
});

router.get("/:slug/gallery", optionalAuth, (req: Request, res: Response) => {
  try {
    const slug = normalizeText(req.params.slug, 100).toLowerCase();
    const temple = getPublishedTempleBySlug(slug);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const enabled = publicFeatureEnabled(Number(temple.id), "gallery");
    res.json({ success: true, temple: { id: temple.id, slug: temple.slug, name: temple.name }, gallery: enabled ? getTempleGallery(Number(temple.id)) : [], featureAvailable: enabled });
  } catch (error) {
    console.error("Public temple gallery error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple gallery." });
  }
});

router.get("/:slug/videos", optionalAuth, (req: Request, res: Response) => {
  try {
    const slug = normalizeText(req.params.slug, 100).toLowerCase();
    const temple = getPublishedTempleBySlug(slug);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const enabled = publicFeatureEnabled(Number(temple.id), "video");
    res.json({ success: true, temple: { id: temple.id, slug: temple.slug, name: temple.name }, videos: enabled ? getTempleVideos(Number(temple.id)) : [], featureAvailable: enabled });
  } catch (error) {
    console.error("Public temple videos error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple videos." });
  }
});

router.get("/:slug", optionalAuth, (req: Request, res: Response) => {
  try {
    const slug = normalizeText(req.params.slug, 100).toLowerCase();
    if (!slug) { res.status(400).json({ success: false, error: "Temple slug is required." }); return; }
    const temple = getPublishedTempleBySlug(slug);
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }
    const templeId = Number(temple.id);
    const seo = getTempleSeo(templeId);
    const content = publicResourceCollection(templeId);
    const enhanced = publicFeatureEnabled(templeId, "enhanced_seo");
    const gallery = publicFeatureEnabled(templeId, "gallery");
    const videos = publicFeatureEnabled(templeId, "video");
    const liveAarti = publicFeatureEnabled(templeId, "live_aarti");
    if (!gallery) content.gallery = [];
    if (!videos) content.videos = [];
    if (!liveAarti) content.liveAarti = null;
    if (!enhanced) content.seoKeywords = [];

    const managers = db.prepare(
      `SELECT tma.id AS assignment_id, tma.status AS assignment_status,
              u.id AS user_id, u.name, tmp.designation, tmp.organization_name, tmp.verification_status
       FROM temple_manager_assignments tma
       INNER JOIN users u ON u.id = tma.manager_user_id
       LEFT JOIN temple_manager_profiles tmp ON tmp.user_id = u.id
       WHERE tma.temple_id = ? AND tma.status = 'active' AND u.status = 'active' AND tmp.verification_status = 'verified'
       ORDER BY u.name ASC`,
    ).all(templeId);
    const activeSubscription = getActiveTempleSubscription(templeId);

    res.json({
      success: true,
      temple: publicTemple(temple),
      content,
      seo: enhanced ? seo : (seo ? { ...seo, keywords_json: "[]", primary_keywords_json: "[]", location_keywords_json: "[]", long_tail_keywords_json: "[]", search_intents_json: "[]" } : null),
      managers,
      features: publicSubscriptionFeatures(activeSubscription),
      attribution: { entityType: "temple", entityId: templeId, pagePath: buildTemplePath(slug) },
    });
  } catch (error) {
    console.error("Temple detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load temple details." });
  }
});

export default router;
