import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  optionalAuth,
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

/*
 * DivyaDhara — Puja Services Catalogue API — FINAL BUSINESS ALIGNMENT
 *
 * Business ownership:
 *   - Public: published catalogue/detail/search only.
 *   - Super Admin: global catalogue CRUD, publication, location mappings.
 *   - Sales: catalogue/request visibility for business operations; no catalogue editing.
 *   - Temple Manager: only Temple <-> Puja relationships for assigned temples.
 *   - Pandit: only Puja requests assigned to / requesting that Pandit.
 *   - Ashram Manager: only Puja requests whose lead belongs to an assigned Ashram.
 *   - Visitor: public catalogue only; never CRM/admin access.
 *
 * Lead creation remains in leads.ts. Payments remain in payments.ts.
 */

const router = Router();

type Row = Record<string, unknown>;
type AuthUser = AuthenticatedUser;

type ServiceStatus = "draft" | "published" | "unpublished";
type AvailabilityScope = "national" | "location_based" | "online" | "hybrid";
type LocationType = "country" | "state" | "district" | "city" | "area";
type AvailabilityType = "service_area" | "home" | "temple" | "travel";

const SERVICE_STATUSES: readonly ServiceStatus[] = ["draft", "published", "unpublished"];
const AVAILABILITY_SCOPES: readonly AvailabilityScope[] = ["national", "location_based", "online", "hybrid"];
const LOCATION_TYPES: readonly LocationType[] = ["country", "state", "district", "city", "area"];
const AVAILABILITY_TYPES: readonly AvailabilityType[] = ["service_area", "home", "temple", "travel"];
const SORT_DIRECTIONS = ["asc", "desc"] as const;
const REQUEST_VIEW_ROLES = ["super_admin", "sales", "pandit", "temple_manager", "ashram_manager"] as const;

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function currentUser(res: Response): AuthUser | undefined {
  return res.locals.user as AuthUser | undefined;
}

function bodyOf(req: Request): Row {
  return req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
    ? (req.body as Row)
    : {};
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
  const integer = Math.floor(n);
  return integer >= min && integer <= max ? integer : fallback;
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


function jsonArray(value: unknown, maxItems = 200, maxItemLength = 3000): string {
  let parsed: unknown = value;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return "[]";
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.split(",").map((part) => part.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(parsed)) return "[]";

  const normalized = parsed.slice(0, maxItems).map((item) => {
    if (typeof item === "string") return item.slice(0, maxItemLength);
    if (item && typeof item === "object") return item;
    return String(item).slice(0, maxItemLength);
  });

  try {
    return JSON.stringify(normalized);
  } catch {
    return "[]";
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function normalizeSlug(value: unknown, fallback: string): string {
  return slugify(text(value, 180)) || slugify(fallback) || `puja-service-${Date.now()}`;
}

function normalizeStatus(value: unknown, fallback: ServiceStatus = "draft"): ServiceStatus {
  return enumValue(value, SERVICE_STATUSES) ?? fallback;
}

function normalizeScope(value: unknown, fallback: AvailabilityScope = "location_based"): AvailabilityScope {
  return enumValue(value, AVAILABILITY_SCOPES) ?? fallback;
}

function normalizeAvailabilityType(value: unknown, fallback: AvailabilityType = "service_area"): AvailabilityType {
  return enumValue(value, AVAILABILITY_TYPES) ?? fallback;
}

function pagination(req: Request): { page: number; limit: number; offset: number } {
  const page = integerInRange(req.query.page, 1, 1, 100000);
  const limit = integerInRange(req.query.limit, 24, 1, 100);
  return { page, limit, offset: (page - 1) * limit };
}

function amountValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100000000) {
    throw new Error("priceFromAmount must be between 0 and 100000000 INR units.");
  }
  return Math.floor(n);
}

function validateCurrency(value: unknown): string {
  const currency = text(value, 10).toUpperCase() || "INR";
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter ISO code.");
  return currency;
}

function tableExists(tableName: string): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=? LIMIT 1
  `).get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function requestViewUser(user: AuthUser): boolean {
  return (REQUEST_VIEW_ROLES as readonly string[]).includes(user.role);
}

function requestScope(req: Request, user: AuthUser): { sql: string; params: unknown[] } {
  void req;
  if (user.role === "super_admin" || user.role === "sales") return { sql: "", params: [] };

  if (user.role === "pandit") {
    return {
      sql: `AND (
        pr.requested_pandit_id = (
          SELECT pp.id FROM pandit_profiles pp WHERE pp.user_id = ? LIMIT 1
        )
        OR EXISTS (
          SELECT 1
          FROM lead_assignments la
          INNER JOIN pandit_profiles pp ON pp.id = la.pandit_id
          WHERE la.lead_id = pr.lead_id
            AND pp.user_id = ?
        )
      )`,
      params: [user.id, user.id],
    };
  }

  if (user.role === "temple_manager") {
    return {
      sql: `AND EXISTS (
        SELECT 1
        FROM temple_manager_assignments tma
        WHERE tma.manager_user_id = ?
          AND tma.temple_id = pr.temple_id
          AND tma.status = 'active'
      )`,
      params: [user.id],
    };
  }

  if (user.role === "ashram_manager") {
    return {
      sql: `AND EXISTS (
        SELECT 1
        FROM leads lscope
        INNER JOIN ashram_manager_assignments ama
          ON ama.ashram_id = lscope.ashram_id
         AND ama.manager_user_id = ?
         AND ama.status = 'active'
        WHERE lscope.id = pr.lead_id
      )`,
      params: [user.id],
    };
  }

  return { sql: "AND 1=0", params: [] };
}

function ownsRequest(user: AuthUser, requestId: number): boolean {
  if (user.role === "super_admin" || user.role === "sales") return true;
  const scope = requestScope({} as Request, user);
  const row = db.prepare(`
    SELECT pr.id
    FROM puja_service_requests pr
    WHERE pr.id = ?
      ${scope.sql}
    LIMIT 1
  `).get(requestId, ...scope.params) as { id?: number } | undefined;
  return Boolean(row?.id);
}

function assignedTempleManager(userId: number, templeId: number): boolean {
  return Boolean(db.prepare(`
    SELECT 1 FROM temple_manager_assignments
    WHERE manager_user_id=? AND temple_id=? AND status='active'
    LIMIT 1
  `).get(userId, templeId));
}

function audit(req: Request, action: string, entityType: string, entityId: number | null, oldData?: unknown, newData?: unknown): void {
  if (!tableExists("audit_logs")) return;
  const user = currentUser(req.res!);
  try {
    db.prepare(`
      INSERT INTO audit_logs (
        user_id, request_id, actor_type, action, entity_type, entity_id,
        old_data_json, new_data_json, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      user?.id ?? null,
      req.res?.locals?.requestId ?? null,
      user?.role ?? "system",
      action,
      entityType,
      entityId,
      oldData === undefined ? null : JSON.stringify(oldData),
      newData === undefined ? null : JSON.stringify(newData),
      text(req.ip, 100) || null,
      nullableText(req.get("user-agent"), 1000),
    );
  } catch (error) {
    console.error("Puja service audit error:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Locations                                                                  */
/* -------------------------------------------------------------------------- */

function loadLocation(locationId: number): Row | null {
  return (db.prepare(`
    SELECT id, parent_id, type, name, slug, code, state_code, district_code,
           city_code, country_code, normalized_name, canonical_name, native_name,
           country_id, state_id, district_id, city_id, seo_path, latitude, longitude,
           timezone, status
    FROM locations WHERE id=? LIMIT 1
  `).get(locationId) as Row | undefined) ?? null;
}

function locationExists(locationId: number): boolean {
  const row = db.prepare(`
    SELECT id FROM locations WHERE id=? AND status='active' LIMIT 1
  `).get(locationId) as { id?: number } | undefined;
  return Boolean(row?.id);
}

function locationLabel(row: Row): string {
  const name = nullableText(row.name, 180);
  const type = nullableText(row.type, 30);
  return [name, type].filter(Boolean).join(" · ");
}

function validateLocationPayload(locationId: number, availabilityType: AvailabilityType): Row {
  const location = loadLocation(locationId);
  if (!location || location.status !== "active") {
    throw new Error("Selected location is not active or does not exist.");
  }
  if (!LOCATION_TYPES.includes(location.type as LocationType)) {
    throw new Error("Selected location has an invalid location type.");
  }
  if (!AVAILABILITY_TYPES.includes(availabilityType)) {
    throw new Error("Invalid availability type.");
  }
  return location;
}

function locationRowsForService(serviceId: number): Row[] {
  return db.prepare(`
    SELECT
      psl.id, psl.puja_service_id, psl.location_id, psl.availability_type,
      psl.is_primary, psl.is_active, psl.priority,
      l.parent_id, l.type, l.name, l.slug, l.code, l.state_code,
      l.district_code, l.city_code, l.country_code, l.country_id, l.state_id,
      l.district_id, l.city_id, l.seo_path, l.latitude, l.longitude, l.timezone,
      l.status
    FROM puja_service_locations psl
    INNER JOIN locations l ON l.id=psl.location_id
    WHERE psl.puja_service_id=?
    ORDER BY psl.is_active DESC, psl.is_primary DESC, psl.priority ASC, l.name ASC, psl.id ASC
  `).all(serviceId) as Row[];
}

function activeLocationCount(serviceId: number): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM puja_service_locations
    WHERE puja_service_id=? AND is_active=1
  `).get(serviceId) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function primaryActiveLocation(serviceId: number): Row | null {
  return (db.prepare(`
    SELECT * FROM puja_service_locations
    WHERE puja_service_id=? AND is_active=1 AND is_primary=1
    LIMIT 1
  `).get(serviceId) as Row | undefined) ?? null;
}

function ensurePrimaryLocation(serviceId: number): void {
  const active = db.prepare(`
    SELECT id FROM puja_service_locations
    WHERE puja_service_id=? AND is_active=1
    ORDER BY priority ASC, id ASC LIMIT 1
  `).get(serviceId) as { id?: number } | undefined;

  if (!active?.id) return;
  db.prepare(`
    UPDATE puja_service_locations
    SET is_primary=0, updated_at=CURRENT_TIMESTAMP
    WHERE puja_service_id=?
  `).run(serviceId);
  db.prepare(`
    UPDATE puja_service_locations
    SET is_primary=1, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(active.id);
}

function ensureServiceLocation(
  serviceId: number,
  locationId: number,
  availabilityType: AvailabilityType,
  isPrimary: boolean,
  isActive: boolean,
  priority: number,
): Row {
  const existing = db.prepare(`
    SELECT id FROM puja_service_locations
    WHERE puja_service_id=? AND location_id=? AND availability_type=? LIMIT 1
  `).get(serviceId, locationId, availabilityType) as { id?: number } | undefined;

  if (existing?.id) {
    if (isPrimary) {
      db.prepare(`
        UPDATE puja_service_locations SET is_primary=0, updated_at=CURRENT_TIMESTAMP
        WHERE puja_service_id=? AND id<>?
      `).run(serviceId, existing.id);
    }
    db.prepare(`
      UPDATE puja_service_locations
      SET is_primary=?, is_active=?, priority=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(isPrimary ? 1 : 0, isActive ? 1 : 0, priority, existing.id);
    if (isActive && !primaryActiveLocation(serviceId)) ensurePrimaryLocation(serviceId);
    return db.prepare(`SELECT * FROM puja_service_locations WHERE id=?`).get(existing.id) as Row;
  }

  if (isPrimary) {
    db.prepare(`
      UPDATE puja_service_locations SET is_primary=0, updated_at=CURRENT_TIMESTAMP
      WHERE puja_service_id=?
    `).run(serviceId);
  }

  const result = db.prepare(`
    INSERT INTO puja_service_locations (
      puja_service_id, location_id, availability_type,
      is_primary, is_active, priority, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(serviceId, locationId, availabilityType, isPrimary ? 1 : 0, isActive ? 1 : 0, priority);

  if (isActive && !primaryActiveLocation(serviceId)) ensurePrimaryLocation(serviceId);
  return db.prepare(`SELECT * FROM puja_service_locations WHERE id=?`).get(Number(result.lastInsertRowid)) as Row;
}

function serviceLocationFilter(req: Request): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const directLocationId = positiveId(req.query.locationId);
  if (directLocationId) {
    clauses.push(`(
      ps.availability_scope IN ('national','online')
      OR EXISTS (
        SELECT 1 FROM puja_service_locations psl
        WHERE psl.puja_service_id=ps.id
          AND psl.location_id=?
          AND psl.is_active=1
      )
      OR ps.default_location_id=?
    )`);
    params.push(directLocationId, directLocationId);
  }

  const ancestryFilters: Array<[string, string]> = [
    ["countryId", "country_id"],
    ["stateId", "state_id"],
    ["districtId", "district_id"],
    ["cityId", "city_id"],
  ];

  for (const [key, column] of ancestryFilters) {
    const id = positiveId(req.query[key]);
    if (!id) continue;
    clauses.push(`(
      ps.availability_scope IN ('national','online')
      OR EXISTS (
        SELECT 1
        FROM puja_service_locations psl
        INNER JOIN locations lf ON lf.id=psl.location_id
        WHERE psl.puja_service_id=ps.id
          AND psl.is_active=1
          AND lf.${column}=?
      )
      OR EXISTS (
        SELECT 1 FROM locations dl
        WHERE dl.id=ps.default_location_id
          AND dl.${column}=?
          AND dl.status='active'
      )
    )`);
    params.push(id, id);
  }

  return { sql: clauses.join(" AND "), params };
}

/* -------------------------------------------------------------------------- */
/* Service queries / serialization                                            */
/* -------------------------------------------------------------------------- */

function serviceById(serviceId: number, includeUnpublished = false): Row | null {
  const status = includeUnpublished ? "" : "AND ps.status='published'";
  return (db.prepare(`
    SELECT ps.*,
           dl.name AS default_location_name,
           dl.slug AS default_location_slug,
           dl.type AS default_location_type,
           dl.seo_path AS default_location_seo_path
    FROM puja_services ps
    LEFT JOIN locations dl ON dl.id=ps.default_location_id
    WHERE ps.id=? ${status}
    LIMIT 1
  `).get(serviceId) as Row | undefined) ?? null;
}

function serviceBySlug(slug: string, includeUnpublished = false): Row | null {
  const status = includeUnpublished ? "" : "AND ps.status='published'";
  return (db.prepare(`
    SELECT ps.*,
           dl.name AS default_location_name,
           dl.slug AS default_location_slug,
           dl.type AS default_location_type,
           dl.seo_path AS default_location_seo_path
    FROM puja_services ps
    LEFT JOIN locations dl ON dl.id=ps.default_location_id
    WHERE ps.slug=? ${status}
    LIMIT 1
  `).get(slug) as Row | undefined) ?? null;
}

function relatedTemples(serviceId: number, includeUnpublished = false): Row[] {
  const status = includeUnpublished ? "" : "AND t.status='published'";
  return db.prepare(`
    SELECT t.id, t.name, t.slug, t.city, t.district, t.state,
           t.country, t.location_id, t.featured, t.status,
           tps.is_featured AS puja_relation_featured
    FROM temple_puja_services tps
    INNER JOIN temples t ON t.id=tps.temple_id
    WHERE tps.puja_id=? ${status}
    ORDER BY tps.is_featured DESC, t.featured DESC, t.name ASC, t.id ASC
  `).all(serviceId) as Row[];
}

function seoForService(service: Row): Row | null {
  if (!tableExists("seo_entries")) return null;
  const path = `/services/${text(service.slug, 180)}`;
  return (db.prepare(`SELECT * FROM seo_entries WHERE path=? LIMIT 1`).get(path) as Row | undefined) ?? null;
}

function parseService(service: Row): Row {
  const locations = locationRowsForService(Number(service.id)).map((row) => ({
    ...row,
    label: locationLabel(row),
    isPrimary: Boolean(Number(row.is_primary ?? 0)),
    isActive: Boolean(Number(row.is_active ?? 0)),
  }));

  return {
    ...service,
    descriptionJson: parseJson(service.description_json) ?? [],
    samagriJson: parseJson(service.samagri_json) ?? [],
    benefits: parseJson(service.benefits_json) ?? [],
    suitableFor: parseJson(service.suitable_for_json) ?? [],
    gallery: parseJson(service.gallery_json) ?? [],
    faqs: parseJson(service.faqs_json) ?? [],
    samagriIncluded: Boolean(Number(service.samagri_included ?? 0)),
    bookingEnabled: Boolean(Number(service.booking_enabled ?? 0)),
    featured: Boolean(Number(service.featured ?? 0)),
    defaultLocation: service.default_location_id ? {
      id: positiveId(service.default_location_id),
      name: service.default_location_name ?? null,
      slug: service.default_location_slug ?? null,
      type: service.default_location_type ?? null,
      seoPath: service.default_location_seo_path ?? null,
    } : null,
    activeLocationCount: locations.filter((item) => item.isActive).length,
    locations,
  };
}

function enrichDetail(service: Row, includeUnpublished = false): Row {
  return {
    ...parseService(service),
    temples: relatedTemples(Number(service.id), includeUnpublished).map((row) => ({
      ...row,
      relationFeatured: Boolean(Number(row.puja_relation_featured ?? 0)),
    })),
    seo: seoForService(service),
  };
}

function uniqueSlug(requestedSlug: string, excludeId?: number): string {
  const base = requestedSlug || `puja-service-${Date.now()}`;
  let slug = base;
  let suffix = 1;
  while (true) {
    const row = excludeId
      ? db.prepare(`SELECT id FROM puja_services WHERE slug=? AND id<>? LIMIT 1`).get(slug, excludeId)
      : db.prepare(`SELECT id FROM puja_services WHERE slug=? LIMIT 1`).get(slug);
    if (!row) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`.slice(0, 180);
  }
}

function validatePublishable(serviceId: number, status: ServiceStatus, scope: AvailabilityScope): string | null {
  if (status !== "published") return null;
  const service = serviceById(serviceId, true);
  if (!service) return "Puja service not found.";

  if (text(service.name, 250).length < 2) return "A published Puja service must have a valid name.";
  if (!text(service.short_description, 2000) && !text(service.description, 10000)) {
    return "A published Puja service must have a short description or full description.";
  }
  if (!text(service.category, 120)) return "A published Puja service must have a category.";

  if (["location_based", "hybrid"].includes(scope)) {
    if (activeLocationCount(serviceId) < 1) {
      return "Location-based or hybrid Puja services must have at least one active service location.";
    }
    if (!primaryActiveLocation(serviceId)) {
      return "A location-based or hybrid Puja service must have a primary service location.";
    }
    const defaultLocationId = positiveId(service.default_location_id);
    if (!defaultLocationId) return "A location-based or hybrid Puja service must have a default location.";
    const mapped = db.prepare(`
      SELECT 1 FROM puja_service_locations
      WHERE puja_service_id=? AND location_id=? AND is_active=1 LIMIT 1
    `).get(serviceId, defaultLocationId);
    if (!mapped) return "The default location must be one of the service's active mapped locations.";
  }

  if (scope === "online" && booleanValue(service.booking_enabled, true)) {
    // Online services may be bookable without a physical location mapping.
    return null;
  }

  return null;
}

function synchronizePublishedState(serviceId: number, status: ServiceStatus): void {
  if (status !== "published") {
    db.prepare(`
      UPDATE puja_services
      SET booking_enabled=0, featured=0, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(serviceId);
    db.prepare(`
      UPDATE puja_service_locations
      SET is_active=0, is_primary=0, updated_at=CURRENT_TIMESTAMP
      WHERE puja_service_id=?
    `).run(serviceId);
  }
}

/* -------------------------------------------------------------------------- */
/* Public catalogue                                                           */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
             SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS drafts,
             SUM(CASE WHEN status='unpublished' THEN 1 ELSE 0 END) AS unpublished
      FROM puja_services
    `).get() as Row | undefined;

    res.json({
      success: true,
      service: "puja-services",
      status: "healthy",
      database: tableExists("puja_services") && tableExists("puja_service_locations"),
      totals: {
        total: Number(row?.total ?? 0),
        published: Number(row?.published ?? 0),
        drafts: Number(row?.drafts ?? 0),
        unpublished: Number(row?.unpublished ?? 0),
      },
    });
  } catch (error) {
    console.error("Puja services health error:", error);
    res.status(500).json({ success: false, service: "puja-services", status: "unhealthy", database: false });
  }
});

router.get("/locations", (_req: Request, res: Response) => {
  try {
    const type = enumValue(_req.query.type, LOCATION_TYPES);
    const search = text(_req.query.search ?? _req.query.q, 120);
    const parentId = positiveId(_req.query.parentId);
    const limit = integerInRange(_req.query.limit, 500, 1, 5000);
    const where: string[] = ["l.status='active'"];
    const params: unknown[] = [];

    if (type) {
      where.push("l.type=?");
      params.push(type);
    }
    if (parentId) {
      where.push("l.parent_id=?");
      params.push(parentId);
    }
    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(l.name) LIKE LOWER(?)
        OR LOWER(COALESCE(l.normalized_name,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(l.native_name,'')) LIKE LOWER(?)
        OR EXISTS (
          SELECT 1 FROM location_aliases la
          WHERE la.location_id=l.id
            AND LOWER(la.alias) LIKE LOWER(?)
        )
      )`);
      params.push(pattern, pattern, pattern, pattern);
    }

    const rows = db.prepare(`
      SELECT l.id, l.parent_id, l.type, l.name, l.slug, l.code,
             l.state_code, l.district_code, l.city_code, l.country_code,
             l.country_id, l.state_id, l.district_id, l.city_id,
             l.seo_path, l.latitude, l.longitude, l.timezone
      FROM locations l
      WHERE ${where.join(" AND ")}
      ORDER BY CASE l.type
        WHEN 'country' THEN 1 WHEN 'state' THEN 2 WHEN 'district' THEN 3
        WHEN 'city' THEN 4 WHEN 'area' THEN 5 ELSE 9 END,
        l.sort_order ASC, l.name ASC, l.id ASC
      LIMIT ?
    `).all(...params, limit) as Row[];

    res.json({ success: true, locations: rows });
  } catch (error) {
    console.error("Puja service locations lookup error:", error);
    res.status(500).json({ success: false, error: "Unable to load service locations." });
  }
});

router.get("/categories", (_req: Request, res: Response) => {
  try {
    const categories = db.prepare(`
      SELECT category, COUNT(*) AS count
      FROM puja_services
      WHERE status='published' AND category IS NOT NULL AND TRIM(category)<>''
      GROUP BY category ORDER BY count DESC, category ASC LIMIT 200
    `).all() as Row[];

    const deities = db.prepare(`
      SELECT deity, COUNT(*) AS count
      FROM puja_services
      WHERE status='published' AND deity IS NOT NULL AND TRIM(deity)<>''
      GROUP BY deity ORDER BY count DESC, deity ASC LIMIT 200
    `).all() as Row[];

    const sampradayas = db.prepare(`
      SELECT sampradaya, COUNT(*) AS count
      FROM puja_services
      WHERE status='published' AND sampradaya IS NOT NULL AND TRIM(sampradaya)<>''
      GROUP BY sampradaya ORDER BY count DESC, sampradaya ASC LIMIT 200
    `).all() as Row[];

    res.json({ success: true, categories, deities, sampradayas });
  } catch (error) {
    console.error("Puja service facets error:", error);
    res.status(500).json({ success: false, error: "Unable to load Puja service filters." });
  }
});

router.get("/stats", requireAuth, requireRole("super_admin", "sales"), (_req: Request, res: Response) => {
  try {
    const totals = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
             SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS drafts,
             SUM(CASE WHEN status='unpublished' THEN 1 ELSE 0 END) AS unpublished,
             SUM(CASE WHEN featured=1 AND status='published' THEN 1 ELSE 0 END) AS featured,
             SUM(CASE WHEN booking_enabled=1 AND status='published' THEN 1 ELSE 0 END) AS booking_enabled,
             ROUND(COALESCE(AVG(price_from_amount),0),2) AS average_price_from
      FROM puja_services
    `).get() as Row;

    const byCategory = db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(category),''),'uncategorized') AS category,
             COUNT(*) AS count
      FROM puja_services WHERE status='published'
      GROUP BY COALESCE(NULLIF(TRIM(category),''),'uncategorized')
      ORDER BY count DESC, category ASC LIMIT 100
    `).all();

    const byScope = db.prepare(`
      SELECT availability_scope AS scope, COUNT(*) AS count
      FROM puja_services WHERE status='published'
      GROUP BY availability_scope ORDER BY count DESC
    `).all();

    const byLocation = db.prepare(`
      SELECT l.type AS location_type, COUNT(DISTINCT psl.puja_service_id) AS services
      FROM puja_service_locations psl
      INNER JOIN locations l ON l.id=psl.location_id
      INNER JOIN puja_services ps ON ps.id=psl.puja_service_id
      WHERE psl.is_active=1 AND ps.status='published'
      GROUP BY l.type ORDER BY services DESC
    `).all();

    res.json({ success: true, totals, byCategory, byScope, byLocation });
  } catch (error) {
    console.error("Puja service stats error:", error);
    res.status(500).json({ success: false, error: "Unable to load Puja service statistics." });
  }
});

router.get("/", optionalAuth, (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const search = text(req.query.search ?? req.query.q, 180);
    const category = text(req.query.category, 120);
    const deity = text(req.query.deity, 150);
    const sampradaya = text(req.query.sampradaya ?? req.query.tradition, 150);
    const scope = enumValue(req.query.availabilityScope ?? req.query.scope, AVAILABILITY_SCOPES);
    const featured = req.query.featured === undefined ? null : booleanValue(req.query.featured);
    const bookingEnabled = req.query.bookingEnabled === undefined ? null : booleanValue(req.query.bookingEnabled);
    const defaultLocationType = enumValue(req.query.locationType, LOCATION_TYPES);
    const sort = text(req.query.sort, 40).toLowerCase();
    const direction = enumValue(req.query.direction, SORT_DIRECTIONS) ?? "asc";

    const where: string[] = ["ps.status='published'"];
    const params: unknown[] = [];

    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(ps.name,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.tagline,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.short_description,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.description,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.category,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.deity,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.sampradaya,'')) LIKE LOWER(?)
      )`);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (category) { where.push("LOWER(COALESCE(ps.category,''))=LOWER(?)"); params.push(category); }
    if (deity) { where.push("LOWER(COALESCE(ps.deity,''))=LOWER(?)"); params.push(deity); }
    if (sampradaya) { where.push("LOWER(COALESCE(ps.sampradaya,''))=LOWER(?)"); params.push(sampradaya); }
    if (scope) { where.push("ps.availability_scope=?"); params.push(scope); }
    if (featured !== null) { where.push("ps.featured=?"); params.push(featured ? 1 : 0); }
    if (bookingEnabled !== null) { where.push("ps.booking_enabled=?"); params.push(bookingEnabled ? 1 : 0); }
    if (defaultLocationType) {
      where.push(`EXISTS (
        SELECT 1 FROM locations dl
        WHERE dl.id=ps.default_location_id AND dl.type=? AND dl.status='active'
      )`);
      params.push(defaultLocationType);
    }

    const locationFilter = serviceLocationFilter(req);
    if (locationFilter.sql) {
      where.push(locationFilter.sql);
      params.push(...locationFilter.params);
    }

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS count FROM puja_services ps WHERE ${where.join(" AND ")}
    `).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const dir = direction === "desc" ? "DESC" : "ASC";
    let orderSql = "ps.sort_order ASC, ps.featured DESC, ps.id ASC";
    switch (sort) {
      case "name": orderSql = `LOWER(ps.name) ${dir}, ps.id ASC`; break;
      case "price": orderSql = `CASE WHEN ps.price_from_amount IS NULL THEN 1 ELSE 0 END ASC, ps.price_from_amount ${dir}, ps.id ASC`; break;
      case "updated": orderSql = `datetime(ps.updated_at) ${dir}, ps.id ${dir}`; break;
      case "created": orderSql = `datetime(ps.created_at) ${dir}, ps.id ${dir}`; break;
      case "featured": orderSql = "ps.featured DESC, ps.sort_order ASC, ps.id ASC"; break;
      default: break;
    }

    const rows = db.prepare(`
      SELECT ps.id, ps.slug, ps.name, ps.category, ps.tagline, ps.short_description,
             ps.deity, ps.sampradaya, ps.duration_text, ps.samagri_included,
             ps.image, ps.video_url, ps.price_from_amount, ps.price_display,
             ps.currency, ps.availability_scope, ps.default_location_id,
             dl.name AS default_location_name, dl.slug AS default_location_slug,
             dl.type AS default_location_type, ps.booking_enabled, ps.featured,
             ps.sort_order, ps.created_at, ps.updated_at
      FROM puja_services ps
      LEFT JOIN locations dl ON dl.id=ps.default_location_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      services: rows.map((row) => ({
        ...row,
        samagriIncluded: Boolean(Number(row.samagri_included ?? 0)),
        bookingEnabled: Boolean(Number(row.booking_enabled ?? 0)),
        featured: Boolean(Number(row.featured ?? 0)),
      })),
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      filters: {
        search: search || null, category: category || null, deity: deity || null,
        sampradaya: sampradaya || null, availabilityScope: scope || null,
        featured, bookingEnabled, locationType: defaultLocationType || null,
      },
    });
  } catch (error) {
    console.error("Puja service public list error:", error);
    res.status(500).json({ success: false, error: "Unable to load Puja services." });
  }
});

/* -------------------------------------------------------------------------- */
/* Requests / CRM visibility                                                  */
/* -------------------------------------------------------------------------- */

router.get("/requests", requireAuth, requireRole(...REQUEST_VIEW_ROLES), (req: Request, res: Response) => {
  try {
    const user = currentUser(res);
    if (!user || !requestViewUser(user)) {
      res.status(403).json({ success: false, error: "You do not have permission to view Puja requests." });
      return;
    }

    const { page, limit, offset } = pagination(req);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const scope = requestScope(req, user);
    if (scope.sql) { where.push(scope.sql.replace(/^AND\s+/, "")); params.push(...scope.params); }

    const status = text(req.query.status, 30).toLowerCase();
    const serviceId = positiveId(req.query.pujaServiceId);
    const panditId = positiveId(req.query.requestedPanditId);
    const templeId = positiveId(req.query.templeId);
    const search = text(req.query.search ?? req.query.q, 180);

    if (status) { where.push("fs.status=?"); params.push(status); }
    if (serviceId) { where.push("pr.puja_service_id=?"); params.push(serviceId); }
    if (panditId) { where.push("pr.requested_pandit_id=?"); params.push(panditId); }
    if (templeId) { where.push("pr.temple_id=?"); params.push(templeId); }
    if (search) {
      const p = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(fs.submission_number,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(fs.name,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(fs.phone,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(fs.email,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(pr.service_city,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.name,'')) LIKE LOWER(?)
      )`);
      params.push(p, p, p, p, p, p);
    }

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM puja_service_requests pr
      INNER JOIN form_submissions fs ON fs.id=pr.form_submission_id
      LEFT JOIN puja_services ps ON ps.id=pr.puja_service_id
      LEFT JOIN leads l ON l.id=pr.lead_id
      WHERE ${where.join(" AND ")}
    `).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = db.prepare(`
      SELECT pr.*,
             fs.submission_number, fs.form_key, fs.form_version,
             fs.name AS requester_name, fs.email AS requester_email,
             fs.phone AS requester_phone, fs.whatsapp AS requester_whatsapp,
             fs.status AS submission_status, fs.submitted_at,
             l.lead_number, l.status AS lead_status, l.priority AS lead_priority,
             l.lead_temperature, l.ashram_id AS lead_ashram_id,
             ps.name AS puja_service_name, ps.slug AS puja_service_slug,
             pp.display_name AS requested_pandit_name,
             t.name AS temple_name
      FROM puja_service_requests pr
      INNER JOIN form_submissions fs ON fs.id=pr.form_submission_id
      LEFT JOIN leads l ON l.id=pr.lead_id
      LEFT JOIN puja_services ps ON ps.id=pr.puja_service_id
      LEFT JOIN pandit_profiles pp ON pp.id=pr.requested_pandit_id
      LEFT JOIN temples t ON t.id=pr.temple_id
      WHERE ${where.join(" AND ")}
      ORDER BY datetime(pr.created_at) DESC, pr.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      requests: rows.map((row) => ({
        ...row,
        samagriRequired: Boolean(Number(row.samagri_required ?? 0)),
        onlineVideoJoin: Boolean(Number(row.online_video_join ?? 0)),
        details: parseJson(row.details_json) ?? {},
      })),
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      access: { role: user.role, scoped: !(user.role === "super_admin" || user.role === "sales") },
    });
  } catch (error) {
    console.error("Puja service request list error:", error);
    res.status(500).json({ success: false, error: "Unable to load Puja service requests." });
  }
});

router.get("/requests/:id", requireAuth, requireRole(...REQUEST_VIEW_ROLES), (req: Request, res: Response) => {
  try {
    const requestId = positiveId(req.params.id);
    if (!requestId) {
      res.status(400).json({ success: false, error: "Invalid Puja service request id." });
      return;
    }

    const user = currentUser(res);
    if (!user || !ownsRequest(user, requestId)) {
      res.status(403).json({ success: false, error: "You do not have access to this Puja service request." });
      return;
    }

    const row = db.prepare(`
      SELECT pr.*,
             fs.submission_number, fs.form_key, fs.form_version,
             fs.name AS requester_name, fs.email AS requester_email,
             fs.phone AS requester_phone, fs.whatsapp AS requester_whatsapp,
             fs.country AS requester_country, fs.state AS requester_state,
             fs.district AS requester_district, fs.city AS requester_city,
             fs.page_path, fs.landing_page, fs.referrer_url,
             fs.utm_source, fs.utm_medium, fs.utm_campaign, fs.utm_term, fs.utm_content,
             fs.status AS submission_status, fs.spam_score, fs.submitted_at,
             fs.payload_json, fs.normalized_json,
             l.lead_number, l.status AS lead_status, l.priority AS lead_priority,
             l.lead_temperature, l.ashram_id AS lead_ashram_id,
             ps.name AS puja_service_name, ps.slug AS puja_service_slug,
             pp.display_name AS requested_pandit_name,
             pp.slug AS requested_pandit_slug,
             t.name AS temple_name, t.slug AS temple_slug
      FROM puja_service_requests pr
      INNER JOIN form_submissions fs ON fs.id=pr.form_submission_id
      LEFT JOIN leads l ON l.id=pr.lead_id
      LEFT JOIN puja_services ps ON ps.id=pr.puja_service_id
      LEFT JOIN pandit_profiles pp ON pp.id=pr.requested_pandit_id
      LEFT JOIN temples t ON t.id=pr.temple_id
      WHERE pr.id=? LIMIT 1
    `).get(requestId) as Row | undefined;

    if (!row) {
      res.status(404).json({ success: false, error: "Puja service request not found." });
      return;
    }

    const isGlobal = user.role === "super_admin" || user.role === "sales";
    res.json({
      success: true,
      request: {
        ...row,
        payload: isGlobal ? (parseJson(row.payload_json) ?? {}) : undefined,
        normalized: isGlobal ? (parseJson(row.normalized_json) ?? {}) : undefined,
        details: parseJson(row.details_json) ?? {},
        samagriRequired: Boolean(Number(row.samagri_required ?? 0)),
        onlineVideoJoin: Boolean(Number(row.online_video_join ?? 0)),
      },
    });
  } catch (error) {
    console.error("Puja service request detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load Puja service request." });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin catalogue list / detail                                              */
/* -------------------------------------------------------------------------- */

router.get("/admin/list", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const status = enumValue(req.query.status, SERVICE_STATUSES);
    const category = text(req.query.category, 120);
    const search = text(req.query.search ?? req.query.q, 180);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];

    if (status) { where.push("ps.status=?"); params.push(status); }
    if (category) { where.push("LOWER(COALESCE(ps.category,''))=LOWER(?)"); params.push(category); }
    if (search) {
      const p = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(ps.name,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.slug,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.category,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(ps.deity,'')) LIKE LOWER(?)
      )`);
      params.push(p, p, p, p);
    }

    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM puja_services ps WHERE ${where.join(" AND ")}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = db.prepare(`
      SELECT ps.*, dl.name AS default_location_name, dl.type AS default_location_type,
             (
               SELECT COUNT(*) FROM puja_service_locations psl
               WHERE psl.puja_service_id=ps.id AND psl.is_active=1
             ) AS active_location_count,
             (
               SELECT COUNT(*) FROM temple_puja_services tps
               WHERE tps.puja_id=ps.id
             ) AS temple_count
      FROM puja_services ps
      LEFT JOIN locations dl ON dl.id=ps.default_location_id
      WHERE ${where.join(" AND ")}
      ORDER BY CASE ps.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
               ps.sort_order ASC, ps.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      services: rows.map((row) => ({
        ...parseService(row),
        activeLocationCount: Number(row.active_location_count ?? 0),
        templeCount: Number(row.temple_count ?? 0),
      })),
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Puja service admin list error:", error);
    res.status(500).json({ success: false, error: "Unable to load the Puja service administration list." });
  }
});

router.get("/:identifier", optionalAuth, (req: Request, res: Response) => {
  try {
    const identifier = text(req.params.identifier, 180);
    if (!identifier) {
      res.status(400).json({ success: false, error: "Puja service identifier is required." });
      return;
    }

    const user = currentUser(res);
    const includeUnpublished = user?.role === "super_admin";
    const id = positiveId(identifier);
    const service = id ? serviceById(id, includeUnpublished) : serviceBySlug(identifier, includeUnpublished);

    if (!service) {
      res.status(404).json({ success: false, error: "Puja service not found." });
      return;
    }

    res.json({
      success: true,
      service: enrichDetail(service, includeUnpublished),
      preview: includeUnpublished && service.status !== "published",
    });
  } catch (error) {
    console.error("Puja service detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load Puja service." });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin CRUD                                                                 */
/* -------------------------------------------------------------------------- */

router.post("/", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const body = bodyOf(req);
    const name = text(body.name, 250);
    if (name.length < 2) {
      res.status(400).json({ success: false, error: "Puja service name must contain at least 2 characters." });
      return;
    }

    const status = normalizeStatus(body.status, "draft");
    const scope = normalizeScope(body.availabilityScope ?? body.availability_scope);
    const slug = uniqueSlug(normalizeSlug(body.slug, name));
    const defaultLocationId = positiveId(body.defaultLocationId ?? body.default_location_id);

    if (defaultLocationId && !locationExists(defaultLocationId)) {
      res.status(400).json({ success: false, error: "Default location does not exist or is not active." });
      return;
    }

    const currency = validateCurrency(body.currency);
    const priceFromAmount = amountValue(body.priceFromAmount ?? body.price_from_amount);

    const serviceId = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO puja_services (
          slug, name, category, tagline, short_description, description,
          description_json, deity, sampradaya, duration_text,
          samagri_included, samagri_details, samagri_json, benefits_json,
          suitable_for_json, image, gallery_json, video_url,
          price_from_amount, price_display, faqs_json, currency,
          availability_scope, default_location_id, booking_enabled, featured,
          status, sort_order, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
      `).run(
        slug,
        name,
        nullableText(body.category, 120),
        nullableText(body.tagline, 500),
        nullableText(body.shortDescription ?? body.short_description, 2000),
        nullableText(body.description, 10000),
        jsonArray(body.descriptionJson ?? body.description_json, 100, 5000),
        nullableText(body.deity, 150),
        nullableText(body.sampradaya ?? body.tradition, 150),
        nullableText(body.durationText ?? body.duration_text, 100),
        booleanValue(body.samagriIncluded ?? body.samagri_included) ? 1 : 0,
        nullableText(body.samagriDetails ?? body.samagri_details, 5000),
        jsonArray(body.samagriJson ?? body.samagri_json, 200, 3000),
        jsonArray(body.benefits ?? body.benefitsJson ?? body.benefits_json, 200, 3000),
        jsonArray(body.suitableFor ?? body.suitable_for_json, 200, 3000),
        nullableText(body.image, 2000),
        jsonArray(body.gallery ?? body.galleryJson ?? body.gallery_json, 100, 4000),
        nullableText(body.videoUrl ?? body.video_url, 3000),
        priceFromAmount,
        nullableText(body.priceDisplay ?? body.price_display, 120),
        jsonArray(body.faqs ?? body.faqsJson ?? body.faqs_json, 100, 5000),
        currency,
        scope,
        defaultLocationId,
        booleanValue(body.bookingEnabled ?? body.booking_enabled, true) ? 1 : 0,
        booleanValue(body.featured) ? 1 : 0,
        status,
        integerInRange(body.sortOrder ?? body.sort_order, 0, 0, 100000),
      );
      return Number(result.lastInsertRowid);
    })();

    const validationError = validatePublishable(serviceId, status, scope);
    if (validationError) {
      db.prepare(`UPDATE puja_services SET status='draft', booking_enabled=0, featured=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(serviceId);
      res.status(409).json({ success: false, error: validationError, code: "PUJA_SERVICE_NOT_READY_TO_PUBLISH", serviceId });
      return;
    }

    synchronizePublishedState(serviceId, status);
    const service = serviceById(serviceId, true);
    audit(req, "puja_service.created", "puja_service", serviceId, null, service);
    res.status(201).json({ success: true, message: "Puja service created successfully.", service: service ? enrichDetail(service, true) : null });
  } catch (error) {
    console.error("Puja service create error:", error);
    const message = error instanceof Error ? error.message : "Unable to create Puja service.";
    if (message.toLowerCase().includes("unique constraint")) {
      res.status(409).json({ success: false, error: "Puja service slug already exists." });
      return;
    }
    if (/currency|priceFromAmount|location/i.test(message)) {
      res.status(400).json({ success: false, error: message });
      return;
    }
    res.status(500).json({ success: false, error: "Unable to create Puja service." });
  }
});

router.patch("/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    if (!serviceId) {
      res.status(400).json({ success: false, error: "Invalid Puja service id." });
      return;
    }

    const existing = serviceById(serviceId, true);
    if (!existing) {
      res.status(404).json({ success: false, error: "Puja service not found." });
      return;
    }

    const body = bodyOf(req);
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(body, key);
    const updates: string[] = [];
    const values: unknown[] = [];
    const changedFields: string[] = [];
    const currentStatus = normalizeStatus(existing.status);
    let nextStatus = currentStatus;
    let nextScope = normalizeScope(existing.availability_scope);

    if (has("name")) {
      const name = text(body.name, 250);
      if (name.length < 2) {
        res.status(400).json({ success: false, error: "Puja service name must contain at least 2 characters." });
        return;
      }
      updates.push("name=?"); values.push(name); changedFields.push("name");
    }

    if (has("slug")) {
      const requested = normalizeSlug(body.slug, text(existing.name, 250));
      const oldSlug = text(existing.slug, 180);
      if (requested !== oldSlug && currentStatus === "published") {
        res.status(409).json({
          success: false,
          code: "PUBLISHED_SLUG_LOCKED",
          error: "Published Puja service slugs are locked. Unpublish the service before changing its slug.",
        });
        return;
      }
      updates.push("slug=?"); values.push(uniqueSlug(requested, serviceId)); changedFields.push("slug");
    }

    const textFields: Array<[string, string, number]> = [
      ["category", "category", 120], ["tagline", "tagline", 500],
      ["short_description", "shortDescription", 2000], ["description", "description", 10000],
      ["deity", "deity", 150], ["sampradaya", "sampradaya", 150],
      ["duration_text", "durationText", 100], ["samagri_details", "samagriDetails", 5000],
      ["image", "image", 2000], ["video_url", "videoUrl", 3000],
      ["price_display", "priceDisplay", 120],
    ];
    for (const [column, key, max] of textFields) {
      if (!has(key) && !has(column)) continue;
      updates.push(`${column}=?`);
      values.push(nullableText(body[key] ?? body[column], max));
      changedFields.push(column);
    }

    const jsonFields: Array<[string, string[] , number, number]> = [
      ["description_json", ["descriptionJson", "description_json"], 100, 5000],
      ["samagri_json", ["samagriJson", "samagri_json"], 200, 3000],
      ["benefits_json", ["benefits", "benefitsJson", "benefits_json"], 200, 3000],
      ["suitable_for_json", ["suitableFor", "suitable_for_json"], 200, 3000],
      ["gallery_json", ["gallery", "galleryJson", "gallery_json"], 100, 4000],
      ["faqs_json", ["faqs", "faqsJson", "faqs_json"], 100, 5000],
    ];
    for (const [column, keys, maxItems, maxLen] of jsonFields) {
      const key = keys.find((item) => has(item));
      if (!key) continue;
      updates.push(`${column}=?`);
      values.push(jsonArray(body[key], maxItems, maxLen));
      changedFields.push(column);
    }

    if (has("samagriIncluded") || has("samagri_included")) {
      updates.push("samagri_included=?"); values.push(booleanValue(body.samagriIncluded ?? body.samagri_included) ? 1 : 0); changedFields.push("samagri_included");
    }
    if (has("priceFromAmount") || has("price_from_amount")) {
      updates.push("price_from_amount=?"); values.push(amountValue(body.priceFromAmount ?? body.price_from_amount)); changedFields.push("price_from_amount");
    }
    if (has("currency")) {
      updates.push("currency=?"); values.push(validateCurrency(body.currency)); changedFields.push("currency");
    }
    if (has("availabilityScope") || has("availability_scope")) {
      nextScope = normalizeScope(body.availabilityScope ?? body.availability_scope, nextScope);
      updates.push("availability_scope=?"); values.push(nextScope); changedFields.push("availability_scope");
    }
    if (has("defaultLocationId") || has("default_location_id")) {
      const id = positiveId(body.defaultLocationId ?? body.default_location_id);
      if (id && !locationExists(id)) {
        res.status(400).json({ success: false, error: "Default location does not exist or is not active." });
        return;
      }
      updates.push("default_location_id=?"); values.push(id); changedFields.push("default_location_id");
    }
    if (has("bookingEnabled") || has("booking_enabled")) {
      updates.push("booking_enabled=?"); values.push(booleanValue(body.bookingEnabled ?? body.booking_enabled, true) ? 1 : 0); changedFields.push("booking_enabled");
    }
    if (has("featured")) {
      updates.push("featured=?"); values.push(booleanValue(body.featured) ? 1 : 0); changedFields.push("featured");
    }
    if (has("sortOrder") || has("sort_order")) {
      updates.push("sort_order=?"); values.push(integerInRange(body.sortOrder ?? body.sort_order, 0, 0, 100000)); changedFields.push("sort_order");
    }
    if (has("status")) {
      nextStatus = normalizeStatus(body.status, currentStatus);
      updates.push("status=?"); values.push(nextStatus); changedFields.push("status");
    }

    if (!updates.length) {
      res.status(400).json({ success: false, error: "No supported Puja service fields were supplied." });
      return;
    }

    const updated = db.transaction(() => {
      db.prepare(`UPDATE puja_services SET ${updates.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values, serviceId);
      const candidate = serviceById(serviceId, true);
      if (!candidate) throw new Error("Updated Puja service could not be loaded.");
      if (nextStatus === "published") {
        const validationError = validatePublishable(serviceId, "published", nextScope);
        if (validationError) throw new Error(validationError);
      }
      synchronizePublishedState(serviceId, nextStatus);
      return serviceById(serviceId, true);
    })();

    audit(req, "puja_service.updated", "puja_service", serviceId, existing, updated);
    res.json({
      success: true,
      message: "Puja service updated successfully.",
      updatedFields: changedFields,
      service: updated ? enrichDetail(updated, true) : null,
    });
  } catch (error) {
    console.error("Puja service update error:", error);
    const message = error instanceof Error ? error.message : "Unable to update Puja service.";
    if (message.toLowerCase().includes("unique constraint")) {
      res.status(409).json({ success: false, error: "Puja service slug or relation already exists." });
      return;
    }
    if (/slug|published Puja service|Default location|Currency|priceFromAmount|published.*category|Location-based|primary service location/i.test(message)) {
      res.status(409).json({ success: false, error: message });
      return;
    }
    res.status(500).json({ success: false, error: "Unable to update Puja service." });
  }
});

router.delete("/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    if (!serviceId) { res.status(400).json({ success: false, error: "Invalid Puja service id." }); return; }
    const existing = serviceById(serviceId, true);
    if (!existing) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }

    db.transaction(() => {
      db.prepare(`UPDATE puja_services SET status='unpublished', booking_enabled=0, featured=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(serviceId);
      db.prepare(`UPDATE puja_service_locations SET is_active=0, is_primary=0, updated_at=CURRENT_TIMESTAMP WHERE puja_service_id=?`).run(serviceId);
    })();

    const updated = serviceById(serviceId, true);
    audit(req, "puja_service.unpublished", "puja_service", serviceId, existing, updated);
    res.json({ success: true, message: "Puja service unpublished. Historical references are retained.", softDeleted: true, service: updated ? enrichDetail(updated, true) : null });
  } catch (error) {
    console.error("Puja service delete/unpublish error:", error);
    res.status(500).json({ success: false, error: "Unable to unpublish Puja service." });
  }
});

router.post("/:id/publish", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    if (!serviceId) { res.status(400).json({ success: false, error: "Invalid Puja service id." }); return; }
    const existing = serviceById(serviceId, true);
    if (!existing) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }

    const scope = normalizeScope(existing.availability_scope);
    const error = validatePublishable(serviceId, "published", scope);
    if (error) {
      res.status(409).json({ success: false, error, code: "PUJA_SERVICE_NOT_READY_TO_PUBLISH" });
      return;
    }
    db.prepare(`UPDATE puja_services SET status='published', updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(serviceId);
    const updated = serviceById(serviceId, true);
    audit(req, "puja_service.published", "puja_service", serviceId, existing, updated);
    res.json({ success: true, message: "Puja service published.", service: updated ? enrichDetail(updated, true) : null });
  } catch (error) {
    console.error("Puja service publish error:", error);
    res.status(500).json({ success: false, error: "Unable to publish Puja service." });
  }
});

router.post("/:id/unpublish", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    if (!serviceId) { res.status(400).json({ success: false, error: "Invalid Puja service id." }); return; }
    const existing = serviceById(serviceId, true);
    if (!existing) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }

    db.transaction(() => {
      db.prepare(`UPDATE puja_services SET status='unpublished', booking_enabled=0, featured=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(serviceId);
      db.prepare(`UPDATE puja_service_locations SET is_active=0, is_primary=0, updated_at=CURRENT_TIMESTAMP WHERE puja_service_id=?`).run(serviceId);
    })();

    const updated = serviceById(serviceId, true);
    audit(req, "puja_service.unpublished", "puja_service", serviceId, existing, updated);
    res.json({ success: true, message: "Puja service unpublished.", service: updated ? enrichDetail(updated, true) : null });
  } catch (error) {
    console.error("Puja service unpublish error:", error);
    res.status(500).json({ success: false, error: "Unable to unpublish Puja service." });
  }
});

/* -------------------------------------------------------------------------- */
/* Service location management                                                */
/* -------------------------------------------------------------------------- */

router.get("/:id/locations", optionalAuth, (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    if (!serviceId) { res.status(400).json({ success: false, error: "Invalid Puja service id." }); return; }
    const user = currentUser(res);
    const service = serviceById(serviceId, user?.role === "super_admin");
    if (!service) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }

    const rows = locationRowsForService(serviceId);
    res.json({ success: true, serviceId, locations: rows.map((row) => ({ ...row, label: locationLabel(row), isPrimary: Boolean(Number(row.is_primary)), isActive: Boolean(Number(row.is_active)) })) });
  } catch (error) {
    console.error("Puja service location list error:", error);
    res.status(500).json({ success: false, error: "Unable to load service locations." });
  }
});

router.post("/:id/locations", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    if (!serviceId) { res.status(400).json({ success: false, error: "Invalid Puja service id." }); return; }
    if (!serviceById(serviceId, true)) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }

    const body = bodyOf(req);
    const locationId = positiveId(body.locationId ?? body.location_id);
    const availabilityType = normalizeAvailabilityType(body.availabilityType ?? body.availability_type);
    if (!locationId) { res.status(400).json({ success: false, error: "locationId is required." }); return; }

    try { validateLocationPayload(locationId, availabilityType); }
    catch (error) { res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Invalid location." }); return; }

    const mapping = db.transaction(() => ensureServiceLocation(
      serviceId,
      locationId,
      availabilityType,
      body.isPrimary === undefined ? activeLocationCount(serviceId) === 0 : booleanValue(body.isPrimary),
      body.isActive === undefined ? true : booleanValue(body.isActive, true),
      integerInRange(body.priority, 0, 0, 100000),
    ))();

    audit(req, "puja_service.location_saved", "puja_service_location", Number(mapping.id), null, mapping);
    res.status(201).json({ success: true, location: mapping, locations: locationRowsForService(serviceId) });
  } catch (error) {
    console.error("Puja service location add error:", error);
    const message = error instanceof Error ? error.message : "Unable to save service location.";
    if (message.toLowerCase().includes("unique constraint")) {
      res.status(409).json({ success: false, error: "A service location mapping with these values already exists." });
      return;
    }
    res.status(500).json({ success: false, error: message });
  }
});

router.patch("/:id/locations/:locationMappingId", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    const mappingId = positiveId(req.params.locationMappingId);
    if (!serviceId || !mappingId) { res.status(400).json({ success: false, error: "Invalid service or location mapping id." }); return; }

    const existing = db.prepare(`
      SELECT * FROM puja_service_locations WHERE id=? AND puja_service_id=? LIMIT 1
    `).get(mappingId, serviceId) as Row | undefined;
    if (!existing) { res.status(404).json({ success: false, error: "Service location mapping not found." }); return; }

    const body = bodyOf(req);
    const nextLocationId = Object.prototype.hasOwnProperty.call(body, "locationId") || Object.prototype.hasOwnProperty.call(body, "location_id")
      ? positiveId(body.locationId ?? body.location_id)
      : Number(existing.location_id);
    if (!nextLocationId) { res.status(400).json({ success: false, error: "Invalid locationId." }); return; }

    const nextAvailability = Object.prototype.hasOwnProperty.call(body, "availabilityType") || Object.prototype.hasOwnProperty.call(body, "availability_type")
      ? normalizeAvailabilityType(body.availabilityType ?? body.availability_type)
      : normalizeAvailabilityType(existing.availability_type);
    validateLocationPayload(nextLocationId, nextAvailability);

    const nextPrimary = Object.prototype.hasOwnProperty.call(body, "isPrimary") || Object.prototype.hasOwnProperty.call(body, "is_primary")
      ? booleanValue(body.isPrimary ?? body.is_primary)
      : Boolean(Number(existing.is_primary));
    const nextActive = Object.prototype.hasOwnProperty.call(body, "isActive") || Object.prototype.hasOwnProperty.call(body, "is_active")
      ? booleanValue(body.isActive ?? body.is_active, true)
      : Boolean(Number(existing.is_active));
    const nextPriority = Object.prototype.hasOwnProperty.call(body, "priority")
      ? integerInRange(body.priority, 0, 0, 100000)
      : Number(existing.priority ?? 0);

    db.transaction(() => {
      if (nextPrimary) {
        db.prepare(`UPDATE puja_service_locations SET is_primary=0, updated_at=CURRENT_TIMESTAMP WHERE puja_service_id=? AND id<>?`).run(serviceId, mappingId);
      }
      db.prepare(`
        UPDATE puja_service_locations
        SET location_id=?, availability_type=?, is_primary=?, is_active=?, priority=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND puja_service_id=?
      `).run(nextLocationId, nextAvailability, nextPrimary ? 1 : 0, nextActive ? 1 : 0, nextPriority, mappingId, serviceId);
      if (nextActive && !primaryActiveLocation(serviceId)) ensurePrimaryLocation(serviceId);
      if (!nextActive && Number(existing.is_primary) === 1) ensurePrimaryLocation(serviceId);
    })();

    const updated = db.prepare(`SELECT * FROM puja_service_locations WHERE id=?`).get(mappingId) as Row;
    audit(req, "puja_service.location_mapping_updated", "puja_service_location", mappingId, existing, updated);
    res.json({ success: true, location: updated, locations: locationRowsForService(serviceId) });
  } catch (error) {
    console.error("Puja service location update error:", error);
    const message = error instanceof Error ? error.message : "Unable to update service location.";
    if (message.toLowerCase().includes("unique constraint")) {
      res.status(409).json({ success: false, error: "A service location mapping with these values already exists." });
      return;
    }
    res.status(400).json({ success: false, error: message });
  }
});

router.delete("/:id/locations/:locationMappingId", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    const mappingId = positiveId(req.params.locationMappingId);
    if (!serviceId || !mappingId) { res.status(400).json({ success: false, error: "Invalid service or location mapping id." }); return; }

    const existing = db.prepare(`SELECT * FROM puja_service_locations WHERE id=? AND puja_service_id=? LIMIT 1`).get(mappingId, serviceId) as Row | undefined;
    if (!existing) { res.status(404).json({ success: false, error: "Service location mapping not found." }); return; }

    db.transaction(() => {
      db.prepare(`UPDATE puja_service_locations SET is_active=0, is_primary=0, updated_at=CURRENT_TIMESTAMP WHERE id=? AND puja_service_id=?`).run(mappingId, serviceId);
      if (Number(existing.is_primary) === 1) ensurePrimaryLocation(serviceId);
    })();

    audit(req, "puja_service.location_mapping_deactivated", "puja_service_location", mappingId, existing, { is_active: 0, is_primary: 0 });
    res.json({ success: true, message: "Service location deactivated.", locations: locationRowsForService(serviceId) });
  } catch (error) {
    console.error("Puja service location delete error:", error);
    res.status(500).json({ success: false, error: "Unable to deactivate service location." });
  }
});

/* -------------------------------------------------------------------------- */
/* Temple <-> Puja relations                                                  */
/* -------------------------------------------------------------------------- */

router.get("/:id/temples", optionalAuth, (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    if (!serviceId) { res.status(400).json({ success: false, error: "Invalid Puja service id." }); return; }
    const user = currentUser(res);
    const service = serviceById(serviceId, user?.role === "super_admin");
    if (!service) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }
    res.json({ success: true, serviceId, temples: relatedTemples(serviceId, user?.role === "super_admin") });
  } catch (error) {
    console.error("Puja service temple relation list error:", error);
    res.status(500).json({ success: false, error: "Unable to load related temples." });
  }
});

router.post("/:id/temples", requireAuth, (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    const templeId = positiveId(bodyOf(req).templeId ?? bodyOf(req).temple_id);
    if (!serviceId || !templeId) { res.status(400).json({ success: false, error: "Valid Puja service id and templeId are required." }); return; }

    const user = currentUser(res);
    const canManage = user?.role === "super_admin" || (user?.role === "temple_manager" && assignedTempleManager(user.id, templeId));
    if (!canManage) { res.status(403).json({ success: false, error: "You are not authorized to manage this Temple-Puja relation." }); return; }

    const service = serviceById(serviceId, true);
    if (!service) { res.status(404).json({ success: false, error: "Puja service not found." }); return; }
    const temple = db.prepare(`SELECT id, name, slug, status FROM temples WHERE id=? LIMIT 1`).get(templeId) as Row | undefined;
    if (!temple) { res.status(404).json({ success: false, error: "Temple not found." }); return; }

    const featured = booleanValue(bodyOf(req).isFeatured ?? bodyOf(req).featured);
    const existing = db.prepare(`SELECT * FROM temple_puja_services WHERE temple_id=? AND puja_id=? LIMIT 1`).get(templeId, serviceId) as Row | undefined;

    if (existing) {
      db.prepare(`UPDATE temple_puja_services SET is_featured=? WHERE temple_id=? AND puja_id=?`).run(featured ? 1 : 0, templeId, serviceId);
    } else {
      db.prepare(`INSERT INTO temple_puja_services (temple_id, puja_id, is_featured, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run(templeId, serviceId, featured ? 1 : 0);
    }

    const relation = db.prepare(`SELECT * FROM temple_puja_services WHERE temple_id=? AND puja_id=? LIMIT 1`).get(templeId, serviceId);
    audit(req, "puja_service.temple_relation_saved", "temple_puja_service", serviceId, existing, relation);
    res.status(201).json({ success: true, relation, temples: relatedTemples(serviceId, true) });
  } catch (error) {
    console.error("Puja service temple relation save error:", error);
    res.status(500).json({ success: false, error: "Unable to save temple-Puja relation." });
  }
});

router.patch("/:id/temples/:templeId", requireAuth, (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    const templeId = positiveId(req.params.templeId);
    if (!serviceId || !templeId) { res.status(400).json({ success: false, error: "Invalid service or temple id." }); return; }
    const user = currentUser(res);
    const canManage = user?.role === "super_admin" || (user?.role === "temple_manager" && assignedTempleManager(user.id, templeId));
    if (!canManage) { res.status(403).json({ success: false, error: "You are not authorized to manage this Temple-Puja relation." }); return; }

    const existing = db.prepare(`SELECT * FROM temple_puja_services WHERE temple_id=? AND puja_id=? LIMIT 1`).get(templeId, serviceId) as Row | undefined;
    if (!existing) { res.status(404).json({ success: false, error: "Temple-Puja relation not found." }); return; }
    const featured = booleanValue(bodyOf(req).isFeatured ?? bodyOf(req).featured);
    db.prepare(`UPDATE temple_puja_services SET is_featured=? WHERE temple_id=? AND puja_id=?`).run(featured ? 1 : 0, templeId, serviceId);
    const updated = db.prepare(`SELECT * FROM temple_puja_services WHERE temple_id=? AND puja_id=? LIMIT 1`).get(templeId, serviceId);
    audit(req, "puja_service.temple_relation_updated", "temple_puja_service", serviceId, existing, updated);
    res.json({ success: true, relation: updated, temples: relatedTemples(serviceId, true) });
  } catch (error) {
    console.error("Puja service temple relation update error:", error);
    res.status(500).json({ success: false, error: "Unable to update temple-Puja relation." });
  }
});

router.delete("/:id/temples/:templeId", requireAuth, (req: Request, res: Response) => {
  try {
    const serviceId = positiveId(req.params.id);
    const templeId = positiveId(req.params.templeId);
    if (!serviceId || !templeId) { res.status(400).json({ success: false, error: "Invalid service or temple id." }); return; }
    const user = currentUser(res);
    const canManage = user?.role === "super_admin" || (user?.role === "temple_manager" && assignedTempleManager(user.id, templeId));
    if (!canManage) { res.status(403).json({ success: false, error: "You are not authorized to manage this Temple-Puja relation." }); return; }

    const existing = db.prepare(`SELECT * FROM temple_puja_services WHERE temple_id=? AND puja_id=? LIMIT 1`).get(templeId, serviceId) as Row | undefined;
    if (!existing) { res.status(404).json({ success: false, error: "Temple-Puja relation not found." }); return; }
    db.prepare(`DELETE FROM temple_puja_services WHERE temple_id=? AND puja_id=?`).run(templeId, serviceId);
    audit(req, "puja_service.temple_relation_removed", "temple_puja_service", serviceId, existing, null);
    res.json({ success: true, message: "Temple-Puja relation removed.", temples: relatedTemples(serviceId, true) });
  } catch (error) {
    console.error("Puja service temple relation delete error:", error);
    res.status(500).json({ success: false, error: "Unable to remove temple-Puja relation." });
  }
});

/* -------------------------------------------------------------------------- */
/* Bulk operations                                                            */
/* -------------------------------------------------------------------------- */

router.patch("/bulk/status", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const status = enumValue(bodyOf(req).status, SERVICE_STATUSES);
    const idsRaw = Array.isArray(bodyOf(req).ids) ? bodyOf(req).ids as unknown[] : [];
    if (!status) { res.status(400).json({ success: false, error: "Valid status is required." }); return; }
    const ids = Array.from(new Set(idsRaw.map(positiveId).filter((id): id is number => id !== null))).slice(0, 500);
    if (!ids.length) { res.status(400).json({ success: false, error: "At least one valid Puja service id is required." }); return; }

    const updatedIds: number[] = [];
    const rejected: Array<{ id: number; error: string }> = [];
    db.transaction(() => {
      for (const id of ids) {
        const service = serviceById(id, true);
        if (!service) { rejected.push({ id, error: "Puja service not found." }); continue; }
        const scope = normalizeScope(service.availability_scope);
        if (status === "published") {
          const error = validatePublishable(id, "published", scope);
          if (error) { rejected.push({ id, error }); continue; }
        }
        db.prepare(`
          UPDATE puja_services
          SET status=?,
              booking_enabled=CASE WHEN ?='published' THEN booking_enabled ELSE 0 END,
              featured=CASE WHEN ?='published' THEN featured ELSE 0 END,
              updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(status, status, status, id);
        if (status !== "published") {
          db.prepare(`UPDATE puja_service_locations SET is_active=0, is_primary=0, updated_at=CURRENT_TIMESTAMP WHERE puja_service_id=?`).run(id);
        }
        updatedIds.push(id);
      }
    })();

    for (const id of updatedIds) audit(req, "puja_service.bulk_status_updated", "puja_service", id, null, { status });
    res.json({ success: true, status, updatedIds, rejected, updatedCount: updatedIds.length, rejectedCount: rejected.length });
  } catch (error) {
    console.error("Puja service bulk status error:", error);
    res.status(500).json({ success: false, error: "Unable to update Puja service statuses." });
  }
});

export { router as pujaServicesRouter };
export { router as pujaServiceRoutes };
export default router;
