/* eslint-disable no-useless-escape */
import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  optionalAuth,
  requireAuth,
  requirePermission,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

/*
|-----------------------------------------------------------------------------
| DivyaDhara — Events API — FINAL BUSINESS-ALIGNED VERSION
|-----------------------------------------------------------------------------
|
| Canonical responsibilities
| - Public spiritual-event / festival / katha / yatra-event catalogue.
| - SEO-friendly event detail by numeric id OR slug.
| - Event schedule / itinerary management.
| - Super Admin-only Event CMS through admin.manage_events.
| - Public event enquiry -> form_submission + event_enquiry_request + lead.
| - Event registration is intentionally NOT implemented as a second booking
|   ledger here. Internal paid/operational bookings belong to bookings.ts.
|   events.registration_url is for external registration providers only.
| - Location-aware filtering using the canonical location hierarchy.
| - Audit logging and operational notifications for important event changes.
| - Event lifecycle: draft -> published -> completed/cancelled/unpublished.
| - Completed/cancelled events remain readable by direct URL for history,
|   while draft/unpublished events are not public.
|
| RBAC
| - visitor: public read + authenticated enquiry; no CMS access.
| - pandit: public read + authenticated enquiry; no event ownership.
| - temple_manager: public read + authenticated enquiry; no event ownership.
| - ashram_manager: public read + authenticated enquiry; no event ownership.
| - sales: no Event CMS permission exists in canonical schema; can operate
|   event leads through the CRM / leads.ts and bookings.ts modules.
| - super_admin: full Event CMS + schedules + event operational visibility.
|
| Important schema facts
| - events has NO manager_user_id / owner_user_id.
| - event_schedules belongs to events.
| - event_enquiry_requests is the typed request model and links to leads.
| - bookings.event_id is the canonical operational booking link.
| - events.fee is display text; it is NOT a payment amount source of truth.
| - payments.ts remains the payment ledger.
|-----------------------------------------------------------------------------
*/

const router = Router();

type Row = Record<string, unknown>;

type EventStatus = "draft" | "published" | "cancelled" | "completed" | "unpublished";
const EVENT_STATUSES: readonly EventStatus[] = [
  "draft",
  "published",
  "cancelled",
  "completed",
  "unpublished",
];

const PUBLIC_EVENT_STATUSES: readonly EventStatus[] = ["published", "cancelled", "completed"];
const MAX_LIST_LIMIT = 100;
const MAX_TEXT = 50_000;
const MAX_GALLERY_ITEMS = 100;
const MAX_SCHEDULE_ITEMS = 200;
const EVENT_ENQUIRY_RATE_WINDOW_MS = 15 * 60 * 1000;
const EVENT_ENQUIRY_RATE_LIMIT = 8;

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function text(value: unknown, max = 500): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, max);
}

function nullableText(value: unknown, max = 500): string | null {
  const valueText = text(value, max);
  return valueText || null;
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
  return integer < min || integer > max ? fallback : integer;
}

function nonNegativeInteger(
  value: unknown,
  fallback: number | null = null,
  max = 1_000_000_000,
): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) return fallback;
  return parsed;
}

function numberInRange(
  value: unknown,
  fallback: number | null = null,
  min = -1_000_000_000,
  max = 1_000_000_000,
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

function bodyOf(req: Request): Row {
  return req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
    ? (req.body as Row)
    : {};
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const normalized = text(value, 100).toLowerCase();
  return (allowed as readonly string[]).includes(normalized)
    ? normalized as T[number]
    : null;
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
  if (Array.isArray(value)) return value;
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function jsonArray(value: unknown, maxItems = 100): string {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseJsonArray(value)
      : [];

  return JSON.stringify(items.slice(0, maxItems));
}

function currentUser(res: Response): AuthenticatedUser | null {
  return (res.locals.user as AuthenticatedUser | undefined) ?? null;
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim().slice(0, 100) || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].trim().slice(0, 100) || null;
  }
  return req.ip?.trim().slice(0, 100) || null;
}

function userAgent(req: Request): string | null {
  return nullableText(req.get("user-agent"), 1000);
}

function requestId(req: Request): string | null {
  return nullableText(req.res?.locals.requestId, 150);
}

function tableExists(tableName: string): boolean {
  const row = db.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type='table' AND name=?
    LIMIT 1
  `).get(tableName) as { present?: number } | undefined;
  return Boolean(row?.present);
}

function makeSlug(value: unknown): string {
  const source = text(value, 180);
  const normalized = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‘’'\"]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 150);

  return normalized || `event-${randomBytes(4).toString("hex")}`;
}

function uniqueSlug(requested: unknown, title: string, currentId?: number): string {
  const base = makeSlug(requested || title);
  let candidate = base;

  for (let i = 2; i <= 100; i += 1) {
    const row = db.prepare(`
      SELECT id
      FROM events
      WHERE slug=?
        AND (? IS NULL OR id<>?)
      LIMIT 1
    `).get(candidate, currentId ?? null, currentId ?? null) as { id?: number } | undefined;

    if (!row) return candidate;
    candidate = `${base}-${i}`;
  }

  return `${base}-${randomBytes(3).toString("hex")}`;
}

function generateNumber(prefix: string, column: string, table: string): string {
  for (let i = 0; i < 20; i += 1) {
    const value = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const row = db.prepare(`SELECT id FROM ${table} WHERE ${column}=? LIMIT 1`).get(value) as { id?: number } | undefined;
    if (!row) return value;
  }
  return `${prefix}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function validDateText(value: unknown): string | null {
  const raw = nullableText(value, 40);
  if (!raw) return null;

  // Keep the API permissive for existing data, but validate common ISO/date forms.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return raw;
}

function validUrl(value: unknown): string | null {
  const raw = nullableText(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

function isEmailLike(value: string | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/* -------------------------------------------------------------------------- */
/* Location helpers                                                           */
/* -------------------------------------------------------------------------- */

type LocationContext = {
  locationId: number | null;
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  countryId: number | null;
  stateId: number | null;
  districtId: number | null;
  cityId: number | null;
};

function resolveLocation(locationId: number | null): LocationContext {
  const result: LocationContext = {
    locationId,
    country: null,
    state: null,
    district: null,
    city: null,
    countryId: null,
    stateId: null,
    districtId: null,
    cityId: null,
  };

  let current = locationId;
  let guard = 0;

  while (current && guard < 12) {
    guard += 1;
    const row = db.prepare(`
      SELECT id,parent_id,type,name,status
      FROM locations
      WHERE id=?
      LIMIT 1
    `).get(current) as {
      id: number;
      parent_id: number | null;
      type: string;
      name: string;
      status: string;
    } | undefined;

    if (!row || row.status === "inactive") break;

    if (row.type === "country") {
      result.countryId = row.id;
      result.country = row.name;
    } else if (row.type === "state") {
      result.stateId = row.id;
      result.state = row.name;
    } else if (row.type === "district") {
      result.districtId = row.id;
      result.district = row.name;
    } else if (row.type === "city") {
      result.cityId = row.id;
      result.city = row.name;
    }

    current = row.parent_id;
  }

  return result;
}

function validateLocation(locationId: number | null): LocationContext {
  if (!locationId) return resolveLocation(null);

  const row = db.prepare(`
    SELECT id,status
    FROM locations
    WHERE id=?
    LIMIT 1
  `).get(locationId) as { id?: number; status?: string } | undefined;

  if (!row) throw new Error("Selected location was not found.");
  if (row.status !== "active") throw new Error("Selected location is not active.");

  return resolveLocation(locationId);
}

function locationFilterSql(locationId: number, alias = "e"): { sql: string; params: unknown[] } {
  const location = validateLocation(locationId);

  if (location.cityId) return { sql: `${alias}.city_location_id=?`, params: [location.cityId] };
  if (location.districtId) return { sql: `${alias}.district_location_id=?`, params: [location.districtId] };
  if (location.stateId) return { sql: `${alias}.state_location_id=?`, params: [location.stateId] };
  if (location.countryId) return { sql: `${alias}.country_location_id=?`, params: [location.countryId] };
  return { sql: `${alias}.location_id=?`, params: [location.locationId] };
}

/* -------------------------------------------------------------------------- */
/* Audit + notifications                                                      */
/* -------------------------------------------------------------------------- */

function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData: unknown = null,
  newData: unknown = null,
): void {
  if (!tableExists("audit_logs")) return;

  const actor = req.res?.locals.user as AuthenticatedUser | undefined;

  try {
    db.prepare(`
      INSERT INTO audit_logs (
        user_id,request_id,actor_type,action,entity_type,entity_id,
        old_data_json,new_data_json,ip_address,user_agent,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).run(
      actor?.id ?? null,
      requestId(req),
      actor?.role ?? "system",
      text(action, 150),
      text(entityType, 100),
      entityId,
      oldData == null ? null : JSON.stringify(oldData),
      newData == null ? null : JSON.stringify(newData),
      clientIp(req),
      userAgent(req),
    );
  } catch (error) {
    console.error("Event audit error:", error);
  }
}

function notifyRoles(
  roles: string[],
  title: string,
  message: string,
  actionUrl: string | null,
  metadata: unknown = {},
): void {
  if (!tableExists("notifications")) return;

  try {
    const placeholders = roles.map(() => "?").join(",");
    const users = db.prepare(`
      SELECT u.id
      FROM users u
      INNER JOIN roles r ON r.id=u.role_id
      WHERE u.status='active'
        AND r.is_active=1
        AND r.code IN (${placeholders})
    `).all(...roles) as Array<{ id: number }>;

    const statement = db.prepare(`
      INSERT INTO notifications (
        user_id,type,title,message,action_url,metadata_json,created_at
      ) VALUES (?,? ,?,?,?,?,CURRENT_TIMESTAMP)
    `);

    const payload = JSON.stringify(
      metadata && typeof metadata === "object" ? metadata : {},
    );

    db.transaction(() => {
      for (const user of users) {
        statement.run(
          Number(user.id),
          "event",
          text(title, 200),
          text(message, 2000),
          actionUrl,
          payload,
        );
      }
    })();
  } catch (error) {
    console.error("Event notification error:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Event schedule helpers                                                     */
/* -------------------------------------------------------------------------- */

function eventSchedules(eventId: number): Row[] {
  if (!tableExists("event_schedules")) return [];

  return db.prepare(`
    SELECT
      id,event_id,schedule_date,start_time,end_time,title,description,
      sort_order,created_at,updated_at
    FROM event_schedules
    WHERE event_id=?
    ORDER BY schedule_date IS NULL, schedule_date ASC,
             sort_order ASC, id ASC
    LIMIT ?
  `).all(eventId, MAX_SCHEDULE_ITEMS) as Row[];
}

function serializeSchedule(row: Row): Row {
  return {
    id: Number(row.id),
    eventId: Number(row.event_id),
    scheduleDate: row.schedule_date ?? null,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function normalizeScheduleInput(value: unknown, fallbackSortOrder = 0): Row {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : {};

  return {
    scheduleDate: nullableText(source.scheduleDate ?? source.schedule_date, 40),
    startTime: nullableText(source.startTime ?? source.start_time, 30),
    endTime: nullableText(source.endTime ?? source.end_time, 30),
    title: nullableText(source.title, 300),
    description: nullableText(source.description, 3000),
    sortOrder: integerInRange(source.sortOrder ?? source.sort_order, fallbackSortOrder, 0, 100000),
  };
}

/* -------------------------------------------------------------------------- */
/* Event state + serialization                                                */
/* -------------------------------------------------------------------------- */

function eventVisibilityStatus(row: Row): Row {
  const status = String(row.status ?? "draft") as EventStatus;
  const start = row.start_date ? new Date(String(row.start_date)).getTime() : NaN;
  const end = row.end_date ? new Date(String(row.end_date)).getTime() : NaN;
  const today = Date.now();

  const isUpcoming = status === "published" && Number.isNaN(start) ? true : status === "published" && start >= today;
  const isOngoing = status === "published" && !Number.isNaN(start) && !Number.isNaN(end) && start <= today && end >= today;
  const isPast = status === "completed" || (!Number.isNaN(end) && end < today);
  const registrationOpen = status === "published"
    && Number(row.registration_enabled ?? 0) === 1
    && (Number.isNaN(end) || end >= today);

  return { status, isUpcoming, isOngoing, isPast, registrationOpen };
}

function serializeEvent(
  row: Row,
  options: {
    includePrivate?: boolean;
    includeSchedules?: boolean;
  } = {},
): Row {
  const privateMode = options.includePrivate === true;
  const state = eventVisibilityStatus(row);

  const event: Row = {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    category: row.category ?? null,
    eventType: row.event_type ?? null,
    eventDate: row.event_date ?? null,
    timeText: row.time_text ?? null,
    shortDescription: row.short_description ?? null,
    description: row.description ?? null,
    image: row.image ?? null,
    gallery: parseJsonArray(row.gallery_json).slice(0, MAX_GALLERY_ITEMS),
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    venue: row.venue ?? null,
    city: row.city ?? null,
    district: row.district ?? null,
    state: row.state ?? null,
    country: row.country ?? "India",
    locationId: row.location_id == null ? null : Number(row.location_id),
    countryLocationId: row.country_location_id == null ? null : Number(row.country_location_id),
    stateLocationId: row.state_location_id == null ? null : Number(row.state_location_id),
    districtLocationId: row.district_location_id == null ? null : Number(row.district_location_id),
    cityLocationId: row.city_location_id == null ? null : Number(row.city_location_id),
    address: row.address ?? null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    mapUrl: row.map_url ?? null,
    organizerName: row.organizer_name ?? null,
    organizer: row.organizer ?? null,
    fee: row.fee ?? null,
    schedule: parseJsonArray(row.schedule_json).slice(0, MAX_SCHEDULE_ITEMS),
    contactPhone: row.contact_phone ?? null,
    contactEmail: row.contact_email ?? null,
    websiteUrl: row.website_url ?? null,
    registrationEnabled: Number(row.registration_enabled ?? 0),
    registrationUrl: row.registration_url ?? null,
    status: row.status,
    featured: Number(row.featured ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    ...state,
    registrationMode: Number(row.registration_enabled ?? 0) === 1
      ? (row.registration_url ? "external" : "enquiry")
      : "none",
  };

  if (options.includeSchedules) {
    event.schedules = eventSchedules(Number(row.id)).map(serializeSchedule);
  }

  if (privateMode) {
    event.adminOnly = true;
  }

  return event;
}

function getEvent(identifier: string): Row | undefined {
  const numericId = positiveId(identifier);
  if (numericId) {
    return db.prepare(`SELECT * FROM events WHERE id=? LIMIT 1`).get(numericId) as Row | undefined;
  }

  return db.prepare(`SELECT * FROM events WHERE slug=? LIMIT 1`).get(text(identifier, 180)) as Row | undefined;
}

function publicEventFilter(identifier: string): { row: Row | undefined; statusAllowed: boolean } {
  const row = getEvent(identifier);
  if (!row) return { row: undefined, statusAllowed: false };
  return {
    row,
    statusAllowed: PUBLIC_EVENT_STATUSES.includes(String(row.status) as EventStatus),
  };
}

/* -------------------------------------------------------------------------- */
/* Event enquiry rate limiter                                                 */
/* -------------------------------------------------------------------------- */

const enquiryRateBuckets = new Map<string, { count: number; resetAt: number }>();

function enquiryAllowed(req: Request): boolean {
  const key = `${clientIp(req) ?? "unknown"}:${text(req.get("user-agent"), 120)}`;
  const now = Date.now();
  const existing = enquiryRateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    enquiryRateBuckets.set(key, { count: 1, resetAt: now + EVENT_ENQUIRY_RATE_WINDOW_MS });
    return true;
  }

  if (existing.count >= EVENT_ENQUIRY_RATE_LIMIT) return false;
  existing.count += 1;
  return true;
}

function rateLimitResponse(res: Response): void {
  res.status(429).json({
    success: false,
    error: "Too many event enquiries from this client. Please try again later.",
  });
}

/* -------------------------------------------------------------------------- */
/* SEO helpers                                                                */
/* -------------------------------------------------------------------------- */

function defaultEventSeo(row: Row): Row {
  const title = text(row.title, 250);
  const city = text(row.city, 100);
  const state = text(row.state, 100);
  const venue = text(row.venue, 150);
  const locationLabel = [city, state].filter(Boolean).join(", ");

  const seoTitle = `${title} | Event Date, Venue & Details | DivyaDhara`.slice(0, 250);
  const metaDescription = `View ${title} details including date, venue, schedule, organiser, fee and registration information${locationLabel ? ` in ${locationLabel}` : ""}.`.slice(0, 320);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    description: text(row.short_description ?? row.description, 500),
    startDate: row.start_date ?? row.event_date ?? undefined,
    endDate: row.end_date ?? undefined,
    image: row.image ? [String(row.image)] : undefined,
    location: {
      "@type": "Place",
      name: venue || title,
      address: {
        "@type": "PostalAddress",
        addressLocality: row.city ?? undefined,
        addressRegion: row.state ?? undefined,
        addressCountry: row.country ?? "India",
      },
      ...(row.latitude != null && row.longitude != null
        ? { geo: { "@type": "GeoCoordinates", latitude: Number(row.latitude), longitude: Number(row.longitude) } }
        : {}),
    },
    organizer: row.organizer_name || row.organizer
      ? { "@type": "Organization", name: row.organizer_name ?? row.organizer }
      : undefined,
    offers: row.fee
      ? { "@type": "Offer", price: String(row.fee), priceCurrency: "INR", url: row.registration_url ?? undefined }
      : undefined,
  };

  return { seoTitle, metaDescription, schema };
}

function syncSeoEntry(row: Row): void {
  if (!tableExists("seo_entries")) return;

  try {
    const id = Number(row.id);
    const slug = text(row.slug, 180);
    const path = `/events/${slug}`;
    const defaults = defaultEventSeo(row);
    const status: EventStatus = String(row.status) as EventStatus;
    const seoStatus = status === "draft" ? "draft" : status === "unpublished" ? "unpublished" : "published";
    const indexable = status === "published" || status === "completed" || status === "cancelled" ? 1 : 0;
    const robots = indexable ? "index,follow" : "noindex,follow";
    const location = resolveLocation(row.location_id == null ? null : Number(row.location_id));
    const publishedAt = status === "published" ? nowIso() : null;

    const existing = db.prepare(`
      SELECT id
      FROM seo_entries
      WHERE (entity_type='event' AND entity_id=?) OR path=?
      ORDER BY CASE WHEN path=? THEN 0 ELSE 1 END, id DESC
      LIMIT 1
    `).get(id, path, path) as { id?: number } | undefined;

    if (existing?.id) {
      db.prepare(`
        UPDATE seo_entries
        SET page_type='event',
            entity_type='event',
            entity_id=?,
            country_id=?,
            state_id=?,
            district_id=?,
            city_id=?,
            location_level=CASE
              WHEN ? IS NOT NULL THEN 'city'
              WHEN ? IS NOT NULL THEN 'district'
              WHEN ? IS NOT NULL THEN 'state'
              WHEN ? IS NOT NULL THEN 'country'
              ELSE NULL
            END,
            seo_title=?,
            meta_description=?,
            h1=?,
            intro_content=?,
            canonical_url=NULL,
            robots=?,
            schema_json=?,
            schema_type='Event',
            image_alt=?,
            is_indexable=?,
            noindex_reason=?,
            lastmod_at=CURRENT_TIMESTAMP,
            published_at=COALESCE(?, published_at),
            status=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        id,
        location.countryId,
        location.stateId,
        location.districtId,
        location.cityId,
        location.cityId,
        location.districtId,
        location.stateId,
        location.countryId,
        defaults.seoTitle,
        defaults.metaDescription,
        text(row.title, 250),
        text(row.short_description ?? row.description, 5000),
        robots,
        JSON.stringify(defaults.schema),
        text(row.title, 250),
        indexable,
        indexable ? null : `Event status is ${status}.`,
        publishedAt,
        seoStatus,
        Number(existing.id),
      );
      return;
    }

    db.prepare(`
      INSERT INTO seo_entries (
        path,page_type,entity_type,entity_id,country_id,state_id,district_id,city_id,
        location_level,seo_title,meta_description,h1,intro_content,robots,schema_json,
        schema_type,image_alt,is_indexable,noindex_reason,lastmod_at,published_at,status
      ) VALUES (
        ?, 'event', 'event', ?, ?, ?, ?, ?,
        CASE
          WHEN ? IS NOT NULL THEN 'city'
          WHEN ? IS NOT NULL THEN 'district'
          WHEN ? IS NOT NULL THEN 'state'
          WHEN ? IS NOT NULL THEN 'country'
          ELSE NULL
        END,
        ?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?
      )
    `).run(
      path,
      id,
      location.countryId,
      location.stateId,
      location.districtId,
      location.cityId,
      location.cityId,
      location.districtId,
      location.stateId,
      location.countryId,
      defaults.seoTitle,
      defaults.metaDescription,
      text(row.title, 250),
      text(row.short_description ?? row.description, 5000),
      robots,
      JSON.stringify(defaults.schema),
      "Event",
      text(row.title, 250),
      indexable,
      indexable ? null : `Event status is ${status}.`,
      publishedAt,
      seoStatus,
    );
  } catch (error) {
    console.error("Event SEO sync error:", error);
  }
}

function fetchEventSeo(eventId: number): Row | null {
  if (!tableExists("seo_entries")) return null;
  return (db.prepare(`
    SELECT id,path,page_type,entity_type,entity_id,seo_title,meta_description,h1,
           intro_content,robots,schema_json,schema_type,is_indexable,noindex_reason,status,
           lastmod_at,published_at
    FROM seo_entries
    WHERE entity_type='event' AND entity_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(eventId) as Row | undefined) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Public metadata / health                                                   */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  try {
    const total = db.prepare(`SELECT COUNT(*) AS count FROM events`).get() as { count?: number } | undefined;
    const published = db.prepare(`SELECT COUNT(*) AS count FROM events WHERE status='published'`).get() as { count?: number } | undefined;
    const upcoming = db.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE status='published'
        AND (start_date IS NULL OR start_date>=CURRENT_TIMESTAMP)
    `).get() as { count?: number } | undefined;

    res.json({
      success: true,
      service: "events",
      status: "healthy",
      database: true,
      totals: {
        events: Number(total?.count ?? 0),
        publishedEvents: Number(published?.count ?? 0),
        upcomingEvents: Number(upcoming?.count ?? 0),
      },
      timestamp: nowIso(),
    });
  } catch (error) {
    console.error("Event health error:", error);
    res.status(500).json({ success: false, service: "events", status: "unhealthy", database: false });
  }
});

router.get("/meta", (_req: Request, res: Response) => {
  try {
    const categories = (db.prepare(`
      SELECT DISTINCT category
      FROM events
      WHERE status='published' AND category IS NOT NULL AND TRIM(category)<>''
      ORDER BY LOWER(category), category
      LIMIT 200
    `).all() as Row[]).map((row) => String(row.category));

    const eventTypes = (db.prepare(`
      SELECT DISTINCT event_type
      FROM events
      WHERE status='published' AND event_type IS NOT NULL AND TRIM(event_type)<>''
      ORDER BY LOWER(event_type), event_type
      LIMIT 200
    `).all() as Row[]).map((row) => String(row.event_type));

    const states = (db.prepare(`
      SELECT DISTINCT state
      FROM events
      WHERE status='published' AND state IS NOT NULL AND TRIM(state)<>''
      ORDER BY LOWER(state), state
      LIMIT 200
    `).all() as Row[]).map((row) => String(row.state));

    res.json({
      success: true,
      statuses: EVENT_STATUSES,
      publicStatuses: PUBLIC_EVENT_STATUSES,
      categories,
      eventTypes,
      states,
      sorts: ["featured", "upcoming", "newest", "date", "name"],
    });
  } catch (error) {
    console.error("Event meta error:", error);
    res.status(500).json({ success: false, error: "Unable to load event metadata." });
  }
});

/* -------------------------------------------------------------------------- */
/* Public event catalogue                                                     */
/* -------------------------------------------------------------------------- */

router.get("/", (_req: Request, res: Response) => {
  try {
    const page = integerInRange(_req.query.page, 1, 1, 100000);
    const limit = integerInRange(_req.query.limit, 24, 1, MAX_LIST_LIMIT);
    const offset = (page - 1) * limit;

    const search = text(_req.query.search ?? _req.query.q, 180);
    const category = nullableText(_req.query.category, 120);
    const eventType = nullableText(_req.query.eventType ?? _req.query.event_type, 120);
    const city = nullableText(_req.query.city, 120);
    const district = nullableText(_req.query.district, 120);
    const state = nullableText(_req.query.state, 120);
    const featured = _req.query.featured === undefined ? null : booleanValue(_req.query.featured, false);
    const locationId = positiveId(_req.query.locationId ?? _req.query.location_id);
    const fromDate = nullableText(_req.query.fromDate ?? _req.query.from, 40);
    const toDate = nullableText(_req.query.toDate ?? _req.query.to, 40);
    const sort = text(_req.query.sort, 30).toLowerCase() || "featured";

    const where: string[] = ["e.status='published'"];
    const params: unknown[] = [];

    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(e.title,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.category,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.event_type,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.short_description,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.description,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.venue,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.organizer_name,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.organizer,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.city,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(e.state,'')) LIKE LOWER(?)
      )`);
      for (let i = 0; i < 10; i += 1) params.push(pattern);
    }

    if (category) {
      where.push("LOWER(COALESCE(e.category,''))=LOWER(?)");
      params.push(category);
    }

    if (eventType) {
      where.push("LOWER(COALESCE(e.event_type,''))=LOWER(?)");
      params.push(eventType);
    }

    if (city) {
      where.push("LOWER(COALESCE(e.city,''))=LOWER(?)");
      params.push(city);
    }

    if (district) {
      where.push("LOWER(COALESCE(e.district,''))=LOWER(?)");
      params.push(district);
    }

    if (state) {
      where.push("LOWER(COALESCE(e.state,''))=LOWER(?)");
      params.push(state);
    }

    if (featured !== null) {
      where.push("e.featured=?");
      params.push(featured ? 1 : 0);
    }

    if (fromDate) {
      const parsed = validDateText(fromDate);
      if (parsed) {
        where.push("COALESCE(e.end_date,e.start_date,e.event_date) >= ?");
        params.push(parsed);
      }
    }

    if (toDate) {
      const parsed = validDateText(toDate);
      if (parsed) {
        where.push("COALESCE(e.start_date,e.event_date,e.end_date) <= ?");
        params.push(parsed);
      }
    }

    if (locationId) {
      const filter = locationFilterSql(locationId, "e");
      where.push(filter.sql);
      params.push(...filter.params);
    }

    const orderBy = (() => {
      switch (sort) {
        case "upcoming":
        case "date":
          return "CASE WHEN e.start_date IS NULL THEN 1 ELSE 0 END, e.start_date ASC, e.featured DESC, e.id DESC";
        case "newest":
          return "e.id DESC";
        case "name":
          return "LOWER(e.title) ASC, e.id ASC";
        default:
          return "e.featured DESC, CASE WHEN e.start_date IS NULL THEN 1 ELSE 0 END, e.start_date ASC, e.id DESC";
      }
    })();

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM events e ${whereSql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = db.prepare(`
      SELECT
        e.id,e.slug,e.title,e.category,e.event_type,e.event_date,e.time_text,
        e.short_description,e.image,e.start_date,e.end_date,e.venue,
        e.city,e.district,e.state,e.country,
        e.location_id,e.country_location_id,e.state_location_id,
        e.district_location_id,e.city_location_id,
        e.organizer_name,e.organizer,e.fee,
        e.registration_enabled,e.registration_url,
        e.status,e.featured,e.created_at,e.updated_at
      FROM events e
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      events: rows.map((row) => serializeEvent(row)),
      pagination: {
        page,
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search: search || null,
        category,
        eventType,
        city,
        district,
        state,
        featured,
        locationId,
        fromDate,
        toDate,
        sort,
      },
    });
  } catch (error) {
    console.error("Public event list error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Selected location")) {
      res.status(400).json({ success: false, error: message });
      return;
    }
    res.status(500).json({ success: false, error: "Unable to load events." });
  }
});

/* -------------------------------------------------------------------------- */
/* Event enquiry / lead capture                                               */
/* -------------------------------------------------------------------------- */

router.post("/:id/enquiry", optionalAuth, (req: Request, res: Response) => {
  if (!enquiryAllowed(req)) {
    rateLimitResponse(res);
    return;
  }

  try {
    const identifier = text(req.params.id, 180);
    const { row: event, statusAllowed } = publicEventFilter(identifier);

    if (!event || !statusAllowed || String(event.status) !== "published") {
      res.status(404).json({ success: false, error: "Event is not accepting enquiries." });
      return;
    }

    const body = bodyOf(req);
    const user = currentUser(res);

    const name = text(body.name, 180);
    const phone = nullableText(body.phone, 30);
    const email = nullableText(body.email, 320);
    const attendingDate = validDateText(body.attendingDate ?? body.attending_date ?? body.eventDate ?? event.start_date ?? event.event_date);
    const attendeeCount = nonNegativeInteger(body.attendeeCount ?? body.attendee_count ?? body.devoteeCount ?? body.travellersCount, null, 10000);
    const passType = nullableText(body.passType ?? body.pass_type, 120);
    const message = nullableText(body.message, 5000);

    const city = nullableText(body.city, 120) ?? nullableText(event.city, 120);
    const district = nullableText(body.district, 120) ?? nullableText(event.district, 120);
    const state = nullableText(body.state, 120) ?? nullableText(event.state, 120);
    const country = nullableText(body.country, 120) ?? nullableText(event.country, 120) ?? "India";

    if (!name) {
      res.status(400).json({ success: false, error: "Name is required." });
      return;
    }

    if (!phone && !email) {
      res.status(400).json({ success: false, error: "Phone or email is required." });
      return;
    }

    if (email && !isEmailLike(email)) {
      res.status(400).json({ success: false, error: "Please provide a valid email address." });
      return;
    }

    const eventId = Number(event.id);
    const sourcePage = `/events/${text(event.slug, 180)}`;
    const leadNumber = generateNumber("LEAD", "lead_number", "leads");
    const submissionNumber = generateNumber("FORM", "submission_number", "form_submissions");

    if (!tableExists("leads") || !tableExists("form_submissions") || !tableExists("event_enquiry_requests")) {
      res.status(503).json({ success: false, error: "Event enquiry infrastructure is not configured." });
      return;
    }

    let leadId = 0;
    let submissionId = 0;
    let requestRowId = 0;

    const userId = user?.id ?? null;
    const pagePath = sourcePage;
    const payload: Row = {
      name,
      phone,
      email,
      attending_date: attendingDate,
      attendee_count: attendeeCount,
      pass_type: passType,
      city,
      district,
      state,
      country,
      message,
    };

    db.transaction(() => {
      const leadResult = db.prepare(`
        INSERT INTO leads (
          lead_number,name,phone,email,city,state,district,country,
          event_id,preferred_date,travellers_count,message,
          source_type,source_page,landing_page,referrer_url,
          utm_source,utm_medium,utm_campaign,utm_term,utm_content,
          user_id,status,priority,lead_temperature,lead_score,
          last_activity_at,form_key,created_at,updated_at
        ) VALUES (
          ?,?,?,?,?,?,?,?,
          ?,?,?,?,
          'form',?,?,?,
          ?,?,?,?,?,
          ?,'new','normal','warm',10,
          CURRENT_TIMESTAMP,'event_enquiry',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
      `).run(
        leadNumber,
        name,
        phone,
        email,
        city,
        state,
        district,
        country,
        eventId,
        attendingDate,
        attendeeCount,
        message,
        pagePath,
        pagePath,
        nullableText(body.referrerUrl, 2000),
        nullableText(body.utmSource, 200),
        nullableText(body.utmMedium, 200),
        nullableText(body.utmCampaign, 200),
        nullableText(body.utmTerm, 200),
        nullableText(body.utmContent, 200),
        userId,
      );

      leadId = Number(leadResult.lastInsertRowid);

      const submissionResult = db.prepare(`
        INSERT INTO form_submissions (
          submission_number,form_id,form_key,form_version,lead_id,
          user_id,name,email,phone,whatsapp,
          country,state,district,city,
          page_path,landing_page,referrer_url,
          utm_source,utm_medium,utm_campaign,utm_term,utm_content,
          payload_json,normalized_json,ip_hash,user_agent,status,submitted_at,created_at,updated_at
        ) VALUES (
          ?,
          (SELECT id FROM form_definitions WHERE form_key='event_enquiry' LIMIT 1),
          'event_enquiry',1,?,
          ?,?,?,?,?,
          ?,?,?,?,
          ?,?,?,
          ?,?,?,?, ?,
          ?,?,?,?, 'received',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
      `).run(
        submissionNumber,
        leadId,
        userId,
        name,
        email,
        phone,
        nullableText(body.whatsapp ?? body.phone, 30),
        country,
        state,
        district,
        city,
        pagePath,
        pagePath,
        nullableText(body.referrerUrl, 2000),
        nullableText(body.utmSource, 200),
        nullableText(body.utmMedium, 200),
        nullableText(body.utmCampaign, 200),
        nullableText(body.utmTerm, 200),
        nullableText(body.utmContent, 200),
        JSON.stringify(payload),
        JSON.stringify(payload),
        nullableText(clientIp(req), 100),
        userAgent(req),
      );

      submissionId = Number(submissionResult.lastInsertRowid);

      db.prepare(`
        UPDATE leads
        SET source_submission_id=?,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(submissionId, leadId);

      const requestResult = db.prepare(`
        INSERT INTO event_enquiry_requests (
          form_submission_id,lead_id,event_id,attending_date,
          attendee_count,pass_type,city,district,state,country,message,details_json,
          created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `).run(
        submissionId,
        leadId,
        eventId,
        attendingDate,
        attendeeCount,
        passType,
        city,
        district,
        state,
        country,
        message,
        JSON.stringify(payload),
      );

      requestRowId = Number(requestResult.lastInsertRowid);

      if (tableExists("lead_events")) {
        db.prepare(`
          INSERT INTO lead_events (
            lead_id,user_id,event_type,new_status,notes,metadata_json,created_at
          ) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).run(
          leadId,
          userId,
          "created",
          "new",
          "Event enquiry received",
          JSON.stringify({ eventId, requestId: requestRowId, submissionId }),
        );
      }
    })();

    audit(req, "event.enquiry.created", "event", eventId, null, {
      leadId,
      submissionId,
      requestId: requestRowId,
      attendeeCount,
    });

    notifyRoles(
      ["sales", "super_admin"],
      "New Event Enquiry",
      `${name} enquired about ${String(event.title)}.`,
      `/admin/leads/${leadId}`,
      { leadId, eventId, submissionId, eventSlug: event.slug },
    );

    res.status(201).json({
      success: true,
      message: "Your event enquiry has been received. Our team will contact you shortly.",
      enquiry: {
        id: requestRowId,
        leadId,
        submissionId,
        eventId,
        eventSlug: event.slug,
        eventTitle: event.title,
        attendingDate,
        attendeeCount,
      },
    });
  } catch (error) {
    console.error("Event enquiry error:", error);
    res.status(500).json({ success: false, error: "Unable to submit event enquiry." });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin Event CMS                                                            */
/* -------------------------------------------------------------------------- */

router.get(
  "/manage",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const page = integerInRange(req.query.page, 1, 1, 100000);
      const limit = integerInRange(req.query.limit, 25, 1, MAX_LIST_LIMIT);
      const offset = (page - 1) * limit;
      const search = text(req.query.search ?? req.query.q, 180);
      const status = enumValue(req.query.status, EVENT_STATUSES);
      const category = nullableText(req.query.category, 120);
      const featured = req.query.featured === undefined ? null : booleanValue(req.query.featured, false);

      const where: string[] = ["1=1"];
      const params: unknown[] = [];

      if (search) {
        const pattern = `%${search}%`;
        where.push(`(
          LOWER(COALESCE(title,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(slug,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(category,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(event_type,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(city,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(state,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(organizer_name,'')) LIKE LOWER(?)
        )`);
        for (let i = 0; i < 7; i += 1) params.push(pattern);
      }

      if (status) {
        where.push("status=?");
        params.push(status);
      }

      if (category) {
        where.push("LOWER(COALESCE(category,''))=LOWER(?)");
        params.push(category);
      }

      if (featured !== null) {
        where.push("featured=?");
        params.push(featured ? 1 : 0);
      }

      const whereSql = `WHERE ${where.join(" AND ")}`;
      const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM events ${whereSql}`).get(...params) as { count?: number } | undefined;
      const total = Number(totalRow?.count ?? 0);

      const rows = db.prepare(`
        SELECT *
        FROM events
        ${whereSql}
        ORDER BY featured DESC, CASE WHEN status='published' THEN 0 WHEN status='draft' THEN 1 ELSE 2 END,
                 start_date IS NULL, start_date ASC, id DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Row[];

      res.json({
        success: true,
        events: rows.map((row) => serializeEvent(row, { includePrivate: true })),
        pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
        filters: { search: search || null, status, category, featured },
      });
    } catch (error) {
      console.error("Admin event list error:", error);
      res.status(500).json({ success: false, error: "Unable to load managed events." });
    }
  },
);

router.get(
  "/manage/stats",
  requireAuth,
  requireRole("super_admin"),
  (_req: Request, res: Response) => {
    try {
      const total = db.prepare(`SELECT COUNT(*) AS count FROM events`).get() as { count?: number } | undefined;
      const byStatus = db.prepare(`SELECT status,COUNT(*) AS count FROM events GROUP BY status ORDER BY count DESC`).all() as Row[];
      const byCategory = db.prepare(`
        SELECT COALESCE(category,'Uncategorised') AS category,COUNT(*) AS count
        FROM events
        GROUP BY COALESCE(category,'Uncategorised')
        ORDER BY count DESC, category ASC
        LIMIT 100
      `).all() as Row[];
      const enquiries = tableExists("event_enquiry_requests")
        ? db.prepare(`SELECT COUNT(*) AS count FROM event_enquiry_requests`).get() as { count?: number } | undefined
        : { count: 0 };
      const leads = tableExists("leads")
        ? db.prepare(`SELECT COUNT(*) AS count FROM leads WHERE event_id IS NOT NULL`).get() as { count?: number } | undefined
        : { count: 0 };
      const bookings = tableExists("bookings")
        ? db.prepare(`SELECT COUNT(*) AS count FROM bookings WHERE event_id IS NOT NULL`).get() as { count?: number } | undefined
        : { count: 0 };

      res.json({
        success: true,
        totals: {
          events: Number(total?.count ?? 0),
          enquiries: Number(enquiries?.count ?? 0),
          eventLeads: Number(leads?.count ?? 0),
          eventBookings: Number(bookings?.count ?? 0),
        },
        byStatus,
        byCategory,
      });
    } catch (error) {
      console.error("Event stats error:", error);
      res.status(500).json({ success: false, error: "Unable to load event statistics." });
    }
  },
);

router.get(
  "/manage/:id",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      const eventId = Number(event.id);
      const enquiries = tableExists("event_enquiry_requests")
        ? db.prepare(`
            SELECT COUNT(*) AS count
            FROM event_enquiry_requests
            WHERE event_id=?
          `).get(eventId) as { count?: number } | undefined
        : { count: 0 };
      const bookings = tableExists("bookings")
        ? db.prepare(`
            SELECT COUNT(*) AS count
            FROM bookings
            WHERE event_id=?
              AND status NOT IN ('cancelled','rejected')
          `).get(eventId) as { count?: number } | undefined
        : { count: 0 };
      const leads = tableExists("leads")
        ? db.prepare(`SELECT COUNT(*) AS count FROM leads WHERE event_id=?`).get(eventId) as { count?: number } | undefined
        : { count: 0 };

      res.json({
        success: true,
        event: serializeEvent(event, { includePrivate: true, includeSchedules: true }),
        seo: fetchEventSeo(eventId),
        metrics: {
          enquiries: Number(enquiries?.count ?? 0),
          leads: Number(leads?.count ?? 0),
          bookings: Number(bookings?.count ?? 0),
        },
      });
    } catch (error) {
      console.error("Admin event detail error:", error);
      res.status(500).json({ success: false, error: "Unable to load managed event." });
    }
  },
);

function eventInputFromBody(body: Row, current?: Row): Row {
  const title = text(body.title ?? current?.title, 250);
  if (!title) throw new Error("Event title is required.");

  const status = enumValue(body.status ?? current?.status ?? "draft", EVENT_STATUSES) ?? "draft";
  const locationId = positiveId(body.locationId ?? body.location_id ?? current?.location_id);
  const location = validateLocation(locationId);

  const latitude = numberInRange(body.latitude ?? current?.latitude, current?.latitude == null ? null : Number(current.latitude), -90, 90);
  const longitudeRaw = body.longitude ?? current?.longitude;
  const longitude = longitudeRaw == null || longitudeRaw === ""
    ? current?.longitude == null ? null : Number(current.longitude)
    : numberInRange(longitudeRaw, null, -180, 180);

  const websiteUrl = body.websiteUrl !== undefined || body.website_url !== undefined
    ? validUrl(body.websiteUrl ?? body.website_url)
    : (current?.website_url ?? null);
  const mapUrl = body.mapUrl !== undefined || body.map_url !== undefined
    ? validUrl(body.mapUrl ?? body.map_url)
    : (current?.map_url ?? null);
  const registrationUrl = body.registrationUrl !== undefined || body.registration_url !== undefined
    ? validUrl(body.registrationUrl ?? body.registration_url)
    : (current?.registration_url ?? null);

  return {
    slug: uniqueSlug(body.slug ?? current?.slug, title, current ? Number(current.id) : undefined),
    title,
    category: nullableText(body.category ?? current?.category, 150),
    eventType: nullableText(body.eventType ?? body.event_type ?? current?.event_type, 150),
    eventDate: nullableText(body.eventDate ?? body.event_date ?? current?.event_date, 80),
    timeText: nullableText(body.timeText ?? body.time_text ?? current?.time_text, 150),
    shortDescription: nullableText(body.shortDescription ?? body.short_description ?? current?.short_description, 5000),
    description: nullableText(body.description ?? current?.description, MAX_TEXT),
    image: nullableText(body.image ?? current?.image, 2000),
    galleryJson: body.gallery !== undefined || body.gallery_json !== undefined
      ? jsonArray(body.gallery ?? body.gallery_json, MAX_GALLERY_ITEMS)
      : (current?.gallery_json ?? "[]"),
    startDate: validDateText(body.startDate ?? body.start_date ?? current?.start_date),
    endDate: validDateText(body.endDate ?? body.end_date ?? current?.end_date),
    venue: nullableText(body.venue ?? current?.venue, 300),
    city: nullableText(body.city ?? current?.city ?? location.city, 120),
    district: nullableText(body.district ?? current?.district ?? location.district, 120),
    state: nullableText(body.state ?? current?.state ?? location.state, 120),
    country: nullableText(body.country ?? current?.country ?? location.country ?? "India", 120) ?? "India",
    locationId: locationId,
    address: nullableText(body.address ?? current?.address, 2000),
    latitude,
    longitude,
    mapUrl,
    organizerName: nullableText(body.organizerName ?? body.organizer_name ?? current?.organizer_name, 250),
    organizer: nullableText(body.organizer ?? current?.organizer, 250),
    fee: nullableText(body.fee ?? current?.fee, 250),
    scheduleJson: body.schedule !== undefined || body.schedule_json !== undefined
      ? jsonArray(body.schedule ?? body.schedule_json, MAX_SCHEDULE_ITEMS)
      : (current?.schedule_json ?? "[]"),
    contactPhone: nullableText(body.contactPhone ?? body.contact_phone ?? current?.contact_phone, 50),
    contactEmail: nullableText(body.contactEmail ?? body.contact_email ?? current?.contact_email, 320),
    websiteUrl,
    registrationEnabled: booleanValue(body.registrationEnabled ?? body.registration_enabled ?? current?.registration_enabled, Number(current?.registration_enabled ?? 0) === 1) ? 1 : 0,
    registrationUrl,
    status,
    featured: booleanValue(body.featured ?? current?.featured, Number(current?.featured ?? 0) === 1) ? 1 : 0,
  };
}

function syncEventStatus(
  requestedStatus: EventStatus,
  featured: number,
  requestedRegistrationEnabled: number,
): { status: EventStatus; featured: number; registrationEnabled: number } {
  if (requestedStatus === "draft" || requestedStatus === "unpublished" || requestedStatus === "cancelled" || requestedStatus === "completed") {
    return { status: requestedStatus, featured: 0, registrationEnabled: 0 };
  }

  return {
    status: "published",
    featured: featured ? 1 : 0,
    registrationEnabled: requestedRegistrationEnabled ? 1 : 0,
  };
}

router.post(
  "/manage",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const body = bodyOf(req);
      const input = eventInputFromBody(body);
      const lifecycle = syncEventStatus(input.status as EventStatus, Number(input.featured), Number(input.registrationEnabled));

      if (lifecycle.status === "published" && !input.title) {
        res.status(400).json({ success: false, error: "Event title is required." });
        return;
      }

      const result = db.prepare(`
        INSERT INTO events (
          slug,title,category,event_type,event_date,time_text,short_description,description,
          image,gallery_json,start_date,end_date,venue,city,district,state,country,
          location_id,address,latitude,longitude,map_url,organizer_name,organizer,fee,
          schedule_json,contact_phone,contact_email,website_url,
          registration_enabled,registration_url,status,featured,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `).run(
        input.slug,
        input.title,
        input.category,
        input.eventType,
        input.eventDate,
        input.timeText,
        input.shortDescription,
        input.description,
        input.image,
        input.galleryJson,
        input.startDate,
        input.endDate,
        input.venue,
        input.city,
        input.district,
        input.state,
        input.country,
        input.locationId,
        input.address,
        input.latitude,
        input.longitude,
        input.mapUrl,
        input.organizerName,
        input.organizer,
        input.fee,
        input.scheduleJson,
        input.contactPhone,
        input.contactEmail,
        input.websiteUrl,
        lifecycle.registrationEnabled,
        input.registrationUrl,
        lifecycle.status,
        lifecycle.featured,
      );

      const eventId = Number(result.lastInsertRowid);
      replaceSchedulesFromInput(eventId, body.schedule ?? body.schedule_json);
      const created = getEvent(String(eventId));
      if (!created) throw new Error("Event created but could not be reloaded.");

      syncSeoEntry(created);
      audit(req, "event.created", "event", eventId, null, created);

      notifyRoles(
        ["super_admin"],
        "Event Created",
        `Event ${created.title} was created with status ${created.status}.`,
        `/admin/events/${eventId}`,
        { eventId },
      );

      res.status(201).json({
        success: true,
        message: "Event created successfully.",
        event: serializeEvent(created, { includePrivate: true, includeSchedules: true }),
      });
    } catch (error) {
      console.error("Create event error:", error);
      const message = error instanceof Error ? error.message : "Unable to create event.";
      res.status(message.includes("required") || message.includes("location") ? 400 : 500).json({ success: false, error: message });
    }
  },
);

router.put(
  "/manage/:id",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      const body = bodyOf(req);
      const input = eventInputFromBody(body, event);
      const lifecycle = syncEventStatus(input.status as EventStatus, Number(input.featured), Number(input.registrationEnabled));

      const oldSnapshot = serializeEvent(event, { includePrivate: true, includeSchedules: true });
      db.prepare(`
        UPDATE events
        SET slug=?,title=?,category=?,event_type=?,event_date=?,time_text=?,short_description=?,description=?,
            image=?,gallery_json=?,start_date=?,end_date=?,venue=?,city=?,district=?,state=?,country=?,
            location_id=?,address=?,latitude=?,longitude=?,map_url=?,organizer_name=?,organizer=?,fee=?,
            schedule_json=?,contact_phone=?,contact_email=?,website_url=?,registration_enabled=?,registration_url=?,
            status=?,featured=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        input.slug,
        input.title,
        input.category,
        input.eventType,
        input.eventDate,
        input.timeText,
        input.shortDescription,
        input.description,
        input.image,
        input.galleryJson,
        input.startDate,
        input.endDate,
        input.venue,
        input.city,
        input.district,
        input.state,
        input.country,
        input.locationId,
        input.address,
        input.latitude,
        input.longitude,
        input.mapUrl,
        input.organizerName,
        input.organizer,
        input.fee,
        input.scheduleJson,
        input.contactPhone,
        input.contactEmail,
        input.websiteUrl,
        lifecycle.registrationEnabled,
        input.registrationUrl,
        lifecycle.status,
        lifecycle.featured,
        Number(event.id),
      );

      replaceSchedulesFromInput(Number(event.id), body.schedule ?? body.schedule_json);
      const updated = getEvent(String(event.id));
      if (!updated) throw new Error("Event updated but could not be reloaded.");

      syncSeoEntry(updated);
      audit(req, "event.updated", "event", Number(event.id), oldSnapshot, serializeEvent(updated, { includePrivate: true }));

      if (String(event.status) !== String(updated.status)) {
        audit(req, `event.status.${updated.status}`, "event", Number(event.id), { status: event.status }, { status: updated.status });
      }

      res.json({
        success: true,
        message: "Event updated successfully.",
        event: serializeEvent(updated, { includePrivate: true, includeSchedules: true }),
      });
    } catch (error) {
      console.error("Update event error:", error);
      const message = error instanceof Error ? error.message : "Unable to update event.";
      res.status(message.includes("required") || message.includes("location") ? 400 : 500).json({ success: false, error: message });
    }
  },
);

router.patch(
  "/manage/:id/status",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      const requested = enumValue(bodyOf(req).status, EVENT_STATUSES);
      if (!requested) {
        res.status(400).json({ success: false, error: `Status must be one of: ${EVENT_STATUSES.join(", ")}.` });
        return;
      }

      const lifecycle = syncEventStatus(requested, Number(event.featured ?? 0), Number(event.registration_enabled ?? 0));
      db.prepare(`
        UPDATE events
        SET status=?,featured=?,registration_enabled=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(lifecycle.status, lifecycle.featured, lifecycle.registrationEnabled, Number(event.id));

      const updated = getEvent(String(event.id));
      if (!updated) throw new Error("Event status changed but could not be reloaded.");

      syncSeoEntry(updated);
      audit(req, `event.status.${lifecycle.status}`, "event", Number(event.id), { status: event.status }, { status: lifecycle.status });

      res.json({
        success: true,
        message: `Event status changed to ${lifecycle.status}.`,
        event: serializeEvent(updated, { includePrivate: true, includeSchedules: true }),
      });
    } catch (error) {
      console.error("Change event status error:", error);
      res.status(500).json({ success: false, error: "Unable to change event status." });
    }
  },
);

router.delete(
  "/manage/:id",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      if (String(event.status) === "unpublished") {
        res.json({ success: true, message: "Event is already unpublished." });
        return;
      }

      db.prepare(`
        UPDATE events
        SET status='unpublished',featured=0,registration_enabled=0,updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(Number(event.id));

      const updated = getEvent(String(event.id));
      if (updated) syncSeoEntry(updated);

      audit(req, "event.unpublished", "event", Number(event.id), { status: event.status }, { status: "unpublished" });

      res.json({
        success: true,
        message: "Event unpublished. The record was preserved; no hard delete was performed.",
        event: updated ? serializeEvent(updated, { includePrivate: true }) : null,
      });
    } catch (error) {
      console.error("Unpublish event error:", error);
      res.status(500).json({ success: false, error: "Unable to unpublish event." });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Admin schedule management                                                  */
/* -------------------------------------------------------------------------- */

router.post(
  "/manage/:id/schedules",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      const body = bodyOf(req);
      const source = Array.isArray(body.schedules as unknown[])
        ? (body.schedules as unknown[])
        : [body];

      if (source.length === 0 || source.length > MAX_SCHEDULE_ITEMS) {
        res.status(400).json({ success: false, error: `Maximum ${MAX_SCHEDULE_ITEMS} schedule entries are allowed.` });
        return;
      }

      const created: Row[] = [];

      db.transaction(() => {
        const statement = db.prepare(`
          INSERT INTO event_schedules (
            event_id,schedule_date,start_time,end_time,title,description,sort_order,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `);

        source.forEach((item, index) => {
          const input = normalizeScheduleInput(item, index);
          const result = statement.run(
            Number(event.id),
            input.scheduleDate,
            input.startTime,
            input.endTime,
            input.title,
            input.description,
            input.sortOrder,
          );
          const row = db.prepare(`SELECT * FROM event_schedules WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid)) as Row | undefined;
          if (row) created.push(row);
        });
      })();

      syncScheduleJsonFromTable(Number(event.id));
      audit(req, "event.schedule.created", "event", Number(event.id), null, created.map(serializeSchedule));

      res.status(201).json({
        success: true,
        message: "Event schedule saved.",
        schedules: created.map(serializeSchedule),
      });
    } catch (error) {
      console.error("Create event schedule error:", error);
      res.status(500).json({ success: false, error: "Unable to save event schedule." });
    }
  },
);

router.put(
  "/manage/:id/schedules",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      const body = bodyOf(req);
      if (!Array.isArray(body.schedules as unknown[])) {
        res.status(400).json({ success: false, error: "schedules must be an array." });
        return;
      }

      if ((body.schedules as unknown[]).length > MAX_SCHEDULE_ITEMS) {
        res.status(400).json({ success: false, error: `Maximum ${MAX_SCHEDULE_ITEMS} schedule entries are allowed.` });
        return;
      }

      const oldSchedules = eventSchedules(Number(event.id)).map(serializeSchedule);

      db.transaction(() => {
        db.prepare(`DELETE FROM event_schedules WHERE event_id=?`).run(Number(event.id));
        const statement = db.prepare(`
          INSERT INTO event_schedules (
            event_id,schedule_date,start_time,end_time,title,description,sort_order,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `);

        const scheduleItems = body.schedules as unknown[];
        for (let index = 0; index < scheduleItems.length; index += 1) {
          const input = normalizeScheduleInput(scheduleItems[index], index);
          statement.run(
            Number(event.id),
            input.scheduleDate,
            input.startTime,
            input.endTime,
            input.title,
            input.description,
            input.sortOrder,
          );
        }
      })();

      syncScheduleJsonFromTable(Number(event.id));
      const updatedSchedules = eventSchedules(Number(event.id)).map(serializeSchedule);
      audit(req, "event.schedule.replaced", "event", Number(event.id), oldSchedules, updatedSchedules);

      res.json({ success: true, message: "Event schedule replaced.", schedules: updatedSchedules });
    } catch (error) {
      console.error("Replace event schedule error:", error);
      res.status(500).json({ success: false, error: "Unable to replace event schedule." });
    }
  },
);

router.put(
  "/manage/:id/schedules/:scheduleId",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      const scheduleId = positiveId(req.params.scheduleId);

      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }
      if (!scheduleId) {
        res.status(400).json({ success: false, error: "Invalid schedule id." });
        return;
      }

      const existing = db.prepare(`
        SELECT *
        FROM event_schedules
        WHERE id=? AND event_id=?
        LIMIT 1
      `).get(scheduleId, Number(event.id)) as Row | undefined;

      if (!existing) {
        res.status(404).json({ success: false, error: "Event schedule not found." });
        return;
      }

      const input = normalizeScheduleInput(bodyOf(req), Number(existing.sort_order ?? 0));
      db.prepare(`
        UPDATE event_schedules
        SET schedule_date=?,start_time=?,end_time=?,title=?,description=?,sort_order=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND event_id=?
      `).run(
        input.scheduleDate,
        input.startTime,
        input.endTime,
        input.title,
        input.description,
        input.sortOrder,
        scheduleId,
        Number(event.id),
      );

      syncScheduleJsonFromTable(Number(event.id));
      const updated = db.prepare(`SELECT * FROM event_schedules WHERE id=? LIMIT 1`).get(scheduleId) as Row | undefined;
      audit(req, "event.schedule.updated", "event", Number(event.id), serializeSchedule(existing), updated ? serializeSchedule(updated) : null);

      res.json({ success: true, message: "Event schedule updated.", schedule: updated ? serializeSchedule(updated) : null });
    } catch (error) {
      console.error("Update event schedule error:", error);
      res.status(500).json({ success: false, error: "Unable to update event schedule." });
    }
  },
);

router.delete(
  "/manage/:id/schedules/:scheduleId",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      const scheduleId = positiveId(req.params.scheduleId);

      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }
      if (!scheduleId) {
        res.status(400).json({ success: false, error: "Invalid schedule id." });
        return;
      }

      const existing = db.prepare(`
        SELECT *
        FROM event_schedules
        WHERE id=? AND event_id=?
        LIMIT 1
      `).get(scheduleId, Number(event.id)) as Row | undefined;

      if (!existing) {
        res.status(404).json({ success: false, error: "Event schedule not found." });
        return;
      }

      db.prepare(`DELETE FROM event_schedules WHERE id=? AND event_id=?`).run(scheduleId, Number(event.id));
      syncScheduleJsonFromTable(Number(event.id));
      audit(req, "event.schedule.deleted", "event", Number(event.id), serializeSchedule(existing), null);

      res.json({
        success: true,
        message: "Event schedule entry deleted.",
        schedules: eventSchedules(Number(event.id)).map(serializeSchedule),
      });
    } catch (error) {
      console.error("Delete event schedule error:", error);
      res.status(500).json({ success: false, error: "Unable to delete event schedule." });
    }
  },
);

function syncScheduleJsonFromTable(eventId: number): void {
  if (!tableExists("event_schedules")) return;

  const rows = eventSchedules(eventId);
  db.prepare(`
    UPDATE events
    SET schedule_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    JSON.stringify(rows.map((row) => ({
      scheduleDate: row.schedule_date ?? null,
      startTime: row.start_time ?? null,
      endTime: row.end_time ?? null,
      title: row.title ?? null,
      description: row.description ?? null,
      sortOrder: Number(row.sort_order ?? 0),
    }))),
    eventId,
  );
}

/* -------------------------------------------------------------------------- */
/* Admin event enquiries / operational visibility                             */
/* -------------------------------------------------------------------------- */

router.get(
  "/manage/:id/enquiries",
  requireAuth,
  requirePermission("admin.manage_events"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      if (!tableExists("event_enquiry_requests")) {
        res.status(503).json({ success: false, error: "Event enquiry infrastructure is not configured." });
        return;
      }

      const page = integerInRange(req.query.page, 1, 1, 100000);
      const limit = integerInRange(req.query.limit, 50, 1, MAX_LIST_LIMIT);
      const offset = (page - 1) * limit;
      const status = nullableText(req.query.status, 50);
      const search = nullableText(req.query.search, 180);

      const where: string[] = ["r.event_id=?"];
      const params: unknown[] = [Number(event.id)];

      if (status) {
        where.push("fs.status=?");
        params.push(status);
      }

      if (search) {
        const pattern = `%${search}%`;
        where.push(`(
          LOWER(COALESCE(fs.name,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(fs.phone,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(fs.email,'')) LIKE LOWER(?)
          OR LOWER(COALESCE(l.lead_number,'')) LIKE LOWER(?)
        )`);
        params.push(pattern, pattern, pattern, pattern);
      }

      const whereSql = `WHERE ${where.join(" AND ")}`;
      const totalRow = db.prepare(`
        SELECT COUNT(*) AS count
        FROM event_enquiry_requests r
        LEFT JOIN form_submissions fs ON fs.id=r.form_submission_id
        LEFT JOIN leads l ON l.id=r.lead_id
        ${whereSql}
      `).get(...params) as { count?: number } | undefined;
      const total = Number(totalRow?.count ?? 0);

      const rows = db.prepare(`
        SELECT
          r.id,r.form_submission_id,r.lead_id,r.event_id,r.attending_date,r.attendee_count,
          r.pass_type,r.city,r.district,r.state,r.country,r.message,r.details_json,
          r.created_at,r.updated_at,
          fs.submission_number,fs.status AS submission_status,fs.name,fs.email,fs.phone,
          fs.submitted_at,
          l.lead_number,l.status AS lead_status,l.priority AS lead_priority,
          l.lead_temperature,l.lead_score
        FROM event_enquiry_requests r
        LEFT JOIN form_submissions fs ON fs.id=r.form_submission_id
        LEFT JOIN leads l ON l.id=r.lead_id
        ${whereSql}
        ORDER BY r.id DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Row[];

      res.json({
        success: true,
        event: { id: Number(event.id), slug: event.slug, title: event.title },
        enquiries: rows,
        pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error("Event enquiries list error:", error);
      res.status(500).json({ success: false, error: "Unable to load event enquiries." });
    }
  },
);

router.get(
  "/manage/:id/bookings",
  requireAuth,
  requireRole("super_admin"),
  (req: Request, res: Response) => {
    try {
      const event = getEvent(text(req.params.id, 180));
      if (!event) {
        res.status(404).json({ success: false, error: "Event not found." });
        return;
      }

      if (!tableExists("bookings")) {
        res.status(503).json({ success: false, error: "Booking infrastructure is not configured." });
        return;
      }

      const limit = integerInRange(req.query.limit, 100, 1, MAX_LIST_LIMIT);
      const status = nullableText(req.query.status, 50);
      const where: string[] = ["b.event_id=?"];
      const params: unknown[] = [Number(event.id)];

      if (status) {
        where.push("b.status=?");
        params.push(status);
      }

      const rows = db.prepare(`
        SELECT
          b.id,b.booking_number,b.user_id,b.lead_id,b.event_id,b.kind,b.title,
          b.date,b.time,b.status,b.amount,b.currency,b.payment_status,
          b.created_at,b.updated_at,
          u.name AS user_name,u.email AS user_email,u.phone AS user_phone
        FROM bookings b
        LEFT JOIN users u ON u.id=b.user_id
        WHERE ${where.join(" AND ")}
        ORDER BY b.id DESC
        LIMIT ?
      `).all(...params, limit) as Row[];

      res.json({
        success: true,
        event: { id: Number(event.id), slug: event.slug, title: event.title },
        bookings: rows,
      });
    } catch (error) {
      console.error("Event bookings error:", error);
      res.status(500).json({ success: false, error: "Unable to load event bookings." });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Public event detail                                                        */
/* -------------------------------------------------------------------------- */

router.get("/:id", optionalAuth, (req: Request, res: Response) => {
  try {
    const { row: event, statusAllowed } = publicEventFilter(text(req.params.id, 180));
    if (!event || !statusAllowed) {
      res.status(404).json({ success: false, error: "Event not found." });
      return;
    }

    const result: Row = {
      success: true,
      event: serializeEvent(event, { includeSchedules: true }),
      seo: fetchEventSeo(Number(event.id)),
    };

    res.json(result);
  } catch (error) {
    console.error("Public event detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load event." });
  }
});

/* -------------------------------------------------------------------------- */
/* Public schedule endpoint                                                   */
/* -------------------------------------------------------------------------- */

router.get("/:id/schedules", optionalAuth, (req: Request, res: Response) => {
  try {
    const { row: event, statusAllowed } = publicEventFilter(text(req.params.id, 180));
    if (!event || !statusAllowed) {
      res.status(404).json({ success: false, error: "Event not found." });
      return;
    }

    res.json({
      success: true,
      eventId: Number(event.id),
      eventSlug: event.slug,
      schedules: eventSchedules(Number(event.id)).map(serializeSchedule),
    });
  } catch (error) {
    console.error("Public event schedules error:", error);
    res.status(500).json({ success: false, error: "Unable to load event schedule." });
  }
});

/* -------------------------------------------------------------------------- */
/* Canonical schedule synchronisation                                         */
/* -------------------------------------------------------------------------- */

function replaceSchedulesFromInput(eventId: number, value: unknown): void {
  if (!tableExists("event_schedules") || value === undefined) return;

  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseJsonArray(value)
      : [];

  if (source.length > MAX_SCHEDULE_ITEMS) {
    throw new Error(`Maximum ${MAX_SCHEDULE_ITEMS} schedule entries are allowed.`);
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM event_schedules WHERE event_id=?`).run(eventId);

    const statement = db.prepare(`
      INSERT INTO event_schedules (
        event_id,schedule_date,start_time,end_time,title,description,sort_order,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `);

    for (let index = 0; index < source.length; index += 1) {
      const input = normalizeScheduleInput(source[index], index);
      statement.run(
        eventId,
        input.scheduleDate,
        input.startTime,
        input.endTime,
        input.title,
        input.description,
        input.sortOrder,
      );
    }
  })();

  syncScheduleJsonFromTable(eventId);
}


/* -------------------------------------------------------------------------- */
/* Backward-compatible aliases                                                */
/* -------------------------------------------------------------------------- */

router.get(
  "/:id/schedule",
  optionalAuth,
  (req: Request, res: Response) => {
    const redirectPath = `/api/events/${encodeURIComponent(text(req.params.id, 180))}/schedules`;
    res.redirect(307, redirectPath);
  },
);

export default router;
