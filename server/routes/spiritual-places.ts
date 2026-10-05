import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { db } from "../db/database.ts";
import {
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

/*
 * DivyaDhara — Spiritual Places API
 *
 * Business rules
 * - Public visitors can read published Spiritual Places only.
 * - Visitor accounts never receive CRM/admin access here.
 * - Sales can read the public catalogue plus operational/admin-safe lists.
 * - Only Super Admin can create/edit/publish/unpublish/delete catalogue data.
 * - There is no Spiritual Place Manager role in the canonical six-role model.
 * - Lead capture remains centralized in /api/leads. This route only exposes
 *   the configured detail-gate metadata and never creates a second lead engine.
 * - Location is sourced from the canonical locations hierarchy and cached
 *   ancestry columns are kept synchronized.
 * - Published URL changes create a 301 redirect and move SEO entry ownership
 *   to the new path rather than silently breaking an indexed URL.
 * - Sensitive audit internals are never returned to public callers.
 */

const router = Router();

const PUBLIC_STATUS = "published" as const;
const EDITABLE_STATUSES = ["draft", "published", "unpublished"] as const;
const CATALOG_TYPES = ["city", "district", "state", "country", "area"] as const;
const MAX_LIST_LIMIT = 100;
const MAX_TEXT = 50_000;
const MAX_GALLERY = 100;

const DETAIL_GATE_FORM_KEY = "spiritual_place_detail_gate";
const DETAIL_BASE_PATH = "/places/";

interface SqlRow {
  [key: string]: unknown;
}

function currentUser(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

function text(value: unknown, max = 500): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, max);
}

function nullableText(value: unknown, max = 500): string | null {
  const v = text(value, max);
  return v || null;
}

function positiveId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInt(value: unknown, fallback: number | null, max = 1_000_000): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.floor(parsed);
  return n >= 0 && n <= max ? n : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const v = text(value, 30).toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const normalized = text(value, 100).toLowerCase();
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as T[number])
    : null;
}

function normalizeSlug(value: unknown, fallback: string): string {
  const source = text(value, 180) || fallback;
  const slug = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return slug || "spiritual-place";
}

function jsonArray(value: unknown, maxItems = 100, maxItemLength = 5000): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.slice(0, maxItems).map((item) => {
      if (typeof item === "string") return item.slice(0, maxItemLength);
      if (item && typeof item === "object") {
        try {
          return JSON.parse(JSON.stringify(item));
        } catch {
          return null;
        }
      }
      return item;
    }));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error("not array");
      return JSON.stringify(parsed.slice(0, maxItems));
    } catch {
      return "[]";
    }
  }
  return "[]";
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pagination(req: Request): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Math.min(100000, Math.floor(Number(req.query.page ?? 1)) || 1));
  const rawLimit = Math.floor(Number(req.query.limit ?? 25)) || 25;
  const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function tableExists(tableName: string): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
    LIMIT 1
  `).get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]!.trim().slice(0, 100);
  if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).trim().slice(0, 100);
  return req.ip?.trim().slice(0, 100) || null;
}

function userAgent(req: Request): string | null {
  return nullableText(req.get("user-agent"), 500);
}

function requestId(req: Request): string | null {
  return nullableText(req.get("x-request-id") ?? req.get("x-correlation-id"), 160);
}

function safeJson(value: unknown, maxLength = 100_000): string {
  try {
    const serialized = JSON.stringify(value ?? {});
    return serialized.length <= maxLength
      ? serialized
      : JSON.stringify({ truncated: true, preview: serialized.slice(0, maxLength - 100) });
  } catch {
    return "{}";
  }
}

function audit(
  req: Request,
  action: string,
  entityType: string | null,
  entityId: number | null,
  oldData?: unknown,
  newData?: unknown,
): void {
  if (!tableExists("audit_logs")) return;
  const user = req.res?.locals?.user as AuthenticatedUser | undefined;
  const actorType = user?.role ?? "system";

  db.prepare(`
    INSERT INTO audit_logs (
      user_id, request_id, actor_type, action, entity_type, entity_id,
      old_data_json, new_data_json, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    user?.id ?? null,
    requestId(req),
    actorType,
    action,
    entityType,
    entityId,
    oldData === undefined ? null : safeJson(oldData),
    newData === undefined ? null : safeJson(newData),
    clientIp(req),
    userAgent(req),
  );
}

function locationById(locationId: number | null): SqlRow | null {
  if (!locationId || !tableExists("locations")) return null;
  return (db.prepare(`
    SELECT
      id, parent_id, type, name, slug, normalized_name, canonical_name, native_name,
      country_id, state_id, district_id, city_id, seo_path, seo_enabled, status,
      latitude, longitude, timezone
    FROM locations
    WHERE id=?
    LIMIT 1
  `).get(locationId) as SqlRow | undefined) ?? null;
}

function locationAncestry(locationId: number | null): {
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
} {
  if (!locationId) {
    return {
      locationId: null, countryId: null, stateId: null, districtId: null, cityId: null,
      areaId: null, country: null, state: null, district: null, city: null, area: null,
    };
  }

  const row = db.prepare(`
    SELECT
      l.id,
      l.type,
      l.name,
      l.country_id,
      l.state_id,
      l.district_id,
      l.city_id,
      c.name AS country,
      s.name AS state,
      d.name AS district,
      ci.name AS city
    FROM locations l
    LEFT JOIN locations c ON c.id=l.country_id
    LEFT JOIN locations s ON s.id=l.state_id
    LEFT JOIN locations d ON d.id=l.district_id
    LEFT JOIN locations ci ON ci.id=l.city_id
    WHERE l.id=?
    LIMIT 1
  `).get(locationId) as SqlRow | undefined;

  if (!row) return {
    locationId, countryId: null, stateId: null, districtId: null, cityId: null, areaId: null,
    country: null, state: null, district: null, city: null, area: null,
  };

  return {
    locationId: Number(row.id),
    countryId: positiveId(row.country_id),
    stateId: positiveId(row.state_id),
    districtId: positiveId(row.district_id),
    cityId: positiveId(row.city_id),
    areaId: String(row.type ?? "") === "area" ? Number(row.id) : null,
    country: nullableText(row.country, 150),
    state: nullableText(row.state, 150),
    district: nullableText(row.district, 150),
    city: nullableText(row.city, 150),
    area: String(row.type ?? "") === "area" ? nullableText(row.name, 150) : null,
  };
}

function resolveLocationId(body: SqlRow): number | null {
  const raw = positiveId(body.locationId ?? body.location_id);
  if (raw) return raw;

  const name = text(body.locationName ?? body.city ?? body.location, 180);
  if (!name || !tableExists("locations")) return null;

  const normalized = name.toLowerCase().replace(/\\s+/g, " ").trim();
  const exact = db.prepare(`
    SELECT id
    FROM locations
    WHERE status='active'
      AND (LOWER(COALESCE(normalized_name,''))=? OR LOWER(name)=?)
    ORDER BY CASE WHEN type='city' THEN 0 WHEN type='district' THEN 1 ELSE 2 END, id
    LIMIT 1
  `).get(normalized, normalized) as { id?: number } | undefined;
  if (exact?.id) return Number(exact.id);

  if (tableExists("location_aliases")) {
    const alias = db.prepare(`
      SELECT la.location_id
      FROM location_aliases la
      JOIN locations l ON l.id=la.location_id
      WHERE la.is_active=1 AND l.status='active' AND LOWER(la.normalized_alias)=?
      ORDER BY la.is_primary DESC, la.id
      LIMIT 1
    `).get(normalized) as { location_id?: number } | undefined;
    if (alias?.location_id) return Number(alias.location_id);
  }

  return null;
}

function validateLocation(locationId: number | null): {
  locationId: number | null;
  countryId: number | null;
  stateId: number | null;
  districtId: number | null;
  cityId: number | null;
} {
  if (!locationId) return { locationId: null, countryId: null, stateId: null, districtId: null, cityId: null };
  const row = locationById(locationId);
  if (!row || row.status !== "active") throw new Error("LOCATION_INVALID");
  return {
    locationId,
    countryId: positiveId(row.country_id),
    stateId: positiveId(row.state_id),
    districtId: positiveId(row.district_id),
    cityId: positiveId(row.city_id),
  };
}

function uniqueSlug(input: unknown, name: string, excludeId: number | null = null): string {
  const base = normalizeSlug(input, name);
  let slug = base;
  let suffix = 2;
  while (true) {
    const row = db.prepare(`SELECT id FROM spiritual_places WHERE slug=? LIMIT 1`).get(slug) as { id?: number } | undefined;
    if (!row || Number(row.id) === Number(excludeId)) return slug;
    slug = `${base}-${suffix++}`.slice(0, 160);
  }
}

function spiritualPlaceById(id: number): SqlRow | null {
  return (db.prepare(`
    SELECT * FROM spiritual_places WHERE id=? LIMIT 1
  `).get(id) as SqlRow | undefined) ?? null;
}

function publicRow(row: SqlRow): SqlRow {
  const ancestry = locationAncestry(positiveId(row.location_id));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    placeType: row.place_type,
    significance: row.significance,
    significanceItems: parseJsonArray(row.significance_json),
    shortDescription: row.short_description,
    description: row.description,
    history: row.history,
    bestTime: row.best_time,
    howToReach: row.how_to_reach,
    reach: row.reach,
    attractions: parseJsonArray(row.attractions_json),
    nearby: parseJsonArray(row.nearby_json),
    image: row.image,
    gallery: parseJsonArray(row.gallery_json),
    city: row.city,
    district: row.district,
    state: row.state,
    country: row.country,
    location: ancestry,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    mapUrl: row.map_url,
    nearbyAttractions: parseJsonArray(row.nearby_attractions_json),
    travelTips: parseJsonArray(row.travel_tips_json),
    featured: Number(row.featured ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leadCapture: {
      enabled: true,
      formKey: DETAIL_GATE_FORM_KEY,
      requiresPhoneVerification: true,
      module: "spiritual_place",
      entityType: "spiritual_place",
      entityId: Number(row.id),
    },
  };
}

function adminRow(row: SqlRow): SqlRow {
  return {
    ...publicRow(row),
    raw: {
      ...row,
      significanceJson: undefined,
      attractionsJson: undefined,
      nearbyJson: undefined,
      galleryJson: undefined,
      nearbyAttractionsJson: undefined,
      travelTipsJson: undefined,
    },
  };
}

function defaultSeo(row: SqlRow): {
  title: string;
  description: string;
  h1: string;
  intro: string;
  schema: SqlRow;
} {
  const name = text(row.name, 250);
  const loc = [text(row.city, 100), text(row.state, 100)].filter(Boolean).join(", ");
  const title = `${name} | Spiritual Place & Pilgrimage Guide | DivyaDhara`.slice(0, 250);
  const description = `Discover ${name}, including spiritual significance, history, attractions, best time to visit, how to reach and nearby sacred places${loc ? ` in ${loc}` : ""}.`.slice(0, 320);
  const intro = text(row.short_description ?? row.description, 2500);
  const schema: SqlRow = {
    "@context": "https://schema.org",
    "@type": "Place",
    name,
    description: text(row.short_description ?? row.description, 500),
    url: `${publicBaseUrl()}${DETAIL_BASE_PATH}${String(row.slug)}`,
    image: row.image ? [String(row.image)] : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: row.address ?? undefined,
      addressLocality: row.city ?? undefined,
      addressRegion: row.state ?? undefined,
      addressCountry: row.country ?? "India",
    },
    ...(row.latitude != null && row.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: Number(row.latitude), longitude: Number(row.longitude) } }
      : {}),
    ...(row.map_url ? { sameAs: [String(row.map_url)] } : {}),
  };
  return { title, description, h1: name, intro, schema };
}

function publicBaseUrl(): string {
  const configured = process.env.PUBLIC_SITE_URL?.trim() || process.env.APP_URL?.trim() || "https://divya-dhara.in";
  return configured.replace(/\/+$/, "");
}

function syncSeo(row: SqlRow, req: Request, previousSlug?: string | null): void {
  if (!tableExists("seo_entries")) return;
  const id = Number(row.id);
  const slug = text(row.slug, 180);
  const path = `${DETAIL_BASE_PATH}${slug}`;
  const defaults = defaultSeo(row);
  const indexable = row.status === PUBLIC_STATUS ? 1 : 0;
  const robots = indexable ? "index,follow" : "noindex,follow";
  const location = locationAncestry(positiveId(row.location_id));
  const oldPath = previousSlug ? `${DETAIL_BASE_PATH}${previousSlug}` : null;

  if (oldPath && oldPath !== path && tableExists("seo_redirects")) {
    db.prepare(`
      INSERT INTO seo_redirects (source_path,target_path,status_code,is_active,notes,created_at,updated_at)
      VALUES (?, ?, 301, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(source_path) DO UPDATE SET
        target_path=excluded.target_path,
        status_code=301,
        is_active=1,
        notes=excluded.notes,
        updated_at=CURRENT_TIMESTAMP
    `).run(oldPath, path, `Spiritual Place slug changed from ${previousSlug} to ${slug}.`);
    db.prepare(`
      UPDATE seo_entries
      SET is_indexable=0, robots='noindex,follow', status='unpublished', updated_at=CURRENT_TIMESTAMP
      WHERE path=?
    `).run(oldPath);
  }

  const existing = db.prepare(`
    SELECT id, path
    FROM seo_entries
    WHERE (entity_type='spiritual_place' AND entity_id=?) OR path=?
    ORDER BY CASE WHEN path=? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `).get(id, path, path) as SqlRow | undefined;

  if (existing?.id) {
    db.prepare(`
      UPDATE seo_entries SET
        path=?, page_type='entity', entity_type='spiritual_place', entity_id=?,
        country_id=?, state_id=?, district_id=?, city_id=?, area_id=?, location_level=?,
        seo_title=?, meta_description=?, h1=?, intro_content=?, body_content=?,
        canonical_url=?, robots=?, schema_json=?, schema_type='Place', is_indexable=?,
        noindex_reason=?, quality_score=?, content_hash=?, sitemap_priority=?,
        sitemap_changefreq=?, lastmod_at=?, published_at=?, status=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      path, id,
      location.countryId, location.stateId, location.districtId, location.cityId, location.areaId,
      null,
      defaults.title, defaults.description, defaults.h1, defaults.intro, text(row.description, MAX_TEXT),
      `${publicBaseUrl()}${path}`, robots, JSON.stringify(defaults.schema),
      indexable, indexable ? null : `Spiritual Place status is ${String(row.status)}.`,
      indexable ? 80 : 30,
      createHash("sha256").update(JSON.stringify({ id, slug, title: defaults.title, description: defaults.description, content: row.description ?? null })).digest("hex"),
      0.7, "weekly", new Date().toISOString(), indexable ? new Date().toISOString() : null,
      row.status, Number(existing.id),
    );
  } else {
    db.prepare(`
      INSERT INTO seo_entries (
        path,page_type,entity_type,entity_id,country_id,state_id,district_id,city_id,area_id,
        seo_title,meta_description,h1,intro_content,body_content,canonical_url,robots,
        schema_json,schema_type,is_indexable,noindex_reason,quality_score,content_hash,
        sitemap_priority,sitemap_changefreq,lastmod_at,published_at,status,created_at,updated_at
      ) VALUES (
        ?,'entity','spiritual_place',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      )
    `).run(
      path, id,
      location.countryId, location.stateId, location.districtId, location.cityId, location.areaId,
      defaults.title, defaults.description, defaults.h1, defaults.intro, text(row.description, MAX_TEXT),
      `${publicBaseUrl()}${path}`, robots, JSON.stringify(defaults.schema), "Place", indexable,
      indexable ? null : `Spiritual Place status is ${String(row.status)}.`, indexable ? 80 : 30,
      createHash("sha256").update(JSON.stringify({ id, slug, title: defaults.title, description: defaults.description, content: row.description ?? null })).digest("hex"),
      0.7, "weekly", new Date().toISOString(), indexable ? new Date().toISOString() : null, row.status,
    );
  }

  void req;
}

function getGallery(id: number): SqlRow[] {
  if (!tableExists("gallery_items")) return [];
  return db.prepare(`
    SELECT id,slug,title,tag,caption,description,cover_image,source_path,alt_text,
           content_type,related_entity_type,related_entity_id,location_id,status,featured,sort_order,created_at,updated_at
    FROM gallery_items
    WHERE related_entity_type='spiritual_place' AND related_entity_id=? AND status='published'
    ORDER BY featured DESC, sort_order ASC, id DESC
    LIMIT ?
  `).all(id, MAX_GALLERY) as SqlRow[];
}

function attachRelated(row: SqlRow, includeGallery = true): SqlRow {
  return {
    ...row,
    relatedGallery: includeGallery ? getGallery(Number(row.id)) : [],
  };
}

function buildListWhere(req: Request, includeUnpublished: boolean): { sql: string; params: unknown[] } {
  const where: string[] = ["sp.1=1"];
  const params: unknown[] = [];

  if (!includeUnpublished) where.push("sp.status='published'");

  const search = text(req.query.search ?? req.query.q, 180);
  if (search) {
    const pattern = `%${search}%`;
    where.push(`(
      LOWER(COALESCE(sp.name,'')) LIKE LOWER(?) OR
      LOWER(COALESCE(sp.subtitle,'')) LIKE LOWER(?) OR
      LOWER(COALESCE(sp.place_type,'')) LIKE LOWER(?) OR
      LOWER(COALESCE(sp.significance,'')) LIKE LOWER(?) OR
      LOWER(COALESCE(sp.city,'')) LIKE LOWER(?) OR
      LOWER(COALESCE(sp.district,'')) LIKE LOWER(?) OR
      LOWER(COALESCE(sp.state,'')) LIKE LOWER(?) OR
      LOWER(COALESCE(sp.country,'')) LIKE LOWER(?)
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const placeType = text(req.query.placeType ?? req.query.type, 120);
  if (placeType) { where.push("LOWER(sp.place_type)=LOWER(?)"); params.push(placeType); }

  const country = text(req.query.country, 120);
  if (country) { where.push("LOWER(sp.country)=LOWER(?)"); params.push(country); }
  const state = text(req.query.state, 120);
  if (state) { where.push("LOWER(sp.state)=LOWER(?)"); params.push(state); }
  const district = text(req.query.district, 120);
  if (district) { where.push("LOWER(sp.district)=LOWER(?)"); params.push(district); }
  const city = text(req.query.city, 120);
  if (city) { where.push("LOWER(sp.city)=LOWER(?)"); params.push(city); }

  const locationId = positiveId(req.query.locationId);
  if (locationId) {
    where.push(`(
      sp.location_id=? OR sp.country_location_id=? OR sp.state_location_id=? OR
      sp.district_location_id=? OR sp.city_location_id=?
    )`);
    params.push(locationId, locationId, locationId, locationId, locationId);
  }

  if (booleanValue(req.query.featuredOnly)) where.push("sp.featured=1");
  if (includeUnpublished && req.query.status) {
    const status = enumValue(req.query.status, EDITABLE_STATUSES);
    if (status) { where.push("sp.status=?"); params.push(status); }
  }

  return { sql: `WHERE ${where.join(" AND ")}`, params };
}

/* -------------------------------------------------------------------------- */
/* Public                                                                      */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req, res) => {
  try {
    const count = db.prepare(`SELECT COUNT(*) AS count FROM spiritual_places`).get() as { count?: number } | undefined;
    res.json({ success: true, service: "spiritual-places", status: "healthy", database: true, count: Number(count?.count ?? 0) });
  } catch (error) {
    console.error("Spiritual Places health error:", error);
    res.status(500).json({ success: false, service: "spiritual-places", status: "unhealthy", database: false });
  }
});

router.get("/meta", (_req, res) => {
  res.json({
    success: true,
    status: [...EDITABLE_STATUSES],
    locationTypes: [...CATALOG_TYPES],
    detailPath: DETAIL_BASE_PATH,
    leadCapture: { enabled: true, formKey: DETAIL_GATE_FORM_KEY, requiresPhoneVerification: true },
  });
});

router.get("/locations", (_req, res) => {
  try {
    if (!tableExists("locations")) return res.json({ success: true, locations: [] });
    const rows = db.prepare(`
      SELECT id,parent_id,type,name,slug,canonical_name,native_name,seo_path,status
      FROM locations
      WHERE status='active' AND seo_enabled=1
      ORDER BY CASE type WHEN 'country' THEN 0 WHEN 'state' THEN 1 WHEN 'district' THEN 2 WHEN 'city' THEN 3 ELSE 4 END, name ASC
      LIMIT 5000
    `).all();
    return res.json({ success: true, locations: rows });
  } catch (error) {
    console.error("Spiritual Places locations error:", error);
    return res.status(500).json({ success: false, error: "Unable to load locations." });
  }
});

router.get("/categories", (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT place_type, COUNT(*) AS count
      FROM spiritual_places
      WHERE status='published' AND COALESCE(place_type,'')<>''
      GROUP BY place_type
      ORDER BY count DESC, place_type ASC
    `).all();
    res.json({ success: true, categories: rows });
  } catch (error) {
    console.error("Spiritual Places categories error:", error);
    res.status(500).json({ success: false, error: "Unable to load Spiritual Place categories." });
  }
});

router.get("/", (req, res) => {
  try {
    const { page, limit, offset } = pagination(req);
    const { sql, params } = buildListWhere(req, false);

    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM spiritual_places sp ${sql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const sort = text(req.query.sort, 40).toLowerCase();
    const order = sort === "name" ? "sp.name ASC, sp.id ASC"
      : sort === "oldest" ? "sp.id ASC"
      : sort === "featured" ? "sp.featured DESC, sp.sort_order ASC, sp.id DESC"
      : "sp.featured DESC, sp.sort_order ASC, sp.id DESC";

    const rows = db.prepare(`
      SELECT sp.*, l.name AS location_name, l.type AS location_type, l.seo_path AS location_seo_path
      FROM spiritual_places sp
      LEFT JOIN locations l ON l.id=sp.location_id
      ${sql}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as SqlRow[];

    res.json({
      success: true,
      spiritualPlaces: rows.map((row) => publicRow(row)),
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Spiritual Places public list error:", error);
    res.status(500).json({ success: false, error: "Unable to load Spiritual Places." });
  }
});

/* Public detail route is intentionally registered after staff routes. */

/* -------------------------------------------------------------------------- */
/* Authenticated admin/sales                                                   */
/* -------------------------------------------------------------------------- */

const staffRouter = Router();
staffRouter.use(requireAuth, requireRole("sales", "super_admin"));

staffRouter.get("/admin/list", (req, res) => {
  try {
    const { page, limit, offset } = pagination(req);
    const { sql, params } = buildListWhere(req, true);
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM spiritual_places sp ${sql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);
    const rows = db.prepare(`
      SELECT sp.*
      FROM spiritual_places sp
      ${sql}
      ORDER BY CASE sp.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
               sp.featured DESC, sp.sort_order ASC, sp.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as SqlRow[];

    return res.json({ success: true, spiritualPlaces: rows.map(adminRow), pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Spiritual Places admin list error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Spiritual Places for staff." });
  }
});

staffRouter.get("/stats", (_req, res) => {
  try {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN status='unpublished' THEN 1 ELSE 0 END) AS unpublished,
        SUM(CASE WHEN featured=1 THEN 1 ELSE 0 END) AS featured,
        SUM(CASE WHEN location_id IS NOT NULL THEN 1 ELSE 0 END) AS with_location
      FROM spiritual_places
    `).get();
    const byType = db.prepare(`SELECT COALESCE(place_type,'Uncategorised') AS place_type, COUNT(*) AS count FROM spiritual_places GROUP BY place_type ORDER BY count DESC`).all();
    const byState = db.prepare(`SELECT COALESCE(state,'Unknown') AS state, COUNT(*) AS count FROM spiritual_places WHERE status='published' GROUP BY state ORDER BY count DESC LIMIT 100`).all();
    return res.json({ success: true, totals, byType, byState });
  } catch (error) {
    console.error("Spiritual Places stats error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Spiritual Places stats." });
  }
});

staffRouter.get("/admin/:id", (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid Spiritual Place id." });
    const row = spiritualPlaceById(id);
    if (!row) return res.status(404).json({ success: false, error: "Spiritual Place not found." });
    return res.json({ success: true, spiritualPlace: attachRelated(adminRow(row), true) });
  } catch (error) {
    console.error("Spiritual Place admin detail error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Spiritual Place." });
  }
});

function requireSuperAdmin(res: Response): boolean {
  const user = currentUser(res);
  if (user.role !== "super_admin") {
    res.status(403).json({ success: false, error: "Only Super Admin can manage Spiritual Places." });
    return false;
  }
  return true;
}

staffRouter.post("/", (req, res) => {
  try {
    if (!requireSuperAdmin(res)) return;
    const body = req.body && typeof req.body === "object" ? req.body as SqlRow : {};

    const name = text(body.name, 250);
    if (name.length < 2) return res.status(400).json({ success: false, error: "Spiritual Place name must contain at least 2 characters." });

    const status = enumValue(body.status ?? "draft", EDITABLE_STATUSES);
    if (!status) return res.status(400).json({ success: false, error: "Invalid Spiritual Place status." });

    const locationId = resolveLocationId(body);
    if (body.locationId || body.location_id || body.locationName || body.location) {
      if (!locationId) return res.status(400).json({ success: false, error: "Selected location does not exist or is inactive." });
    }
    const location = validateLocation(locationId);
    const slug = uniqueSlug(body.slug, name);

    const values = {
      slug, name,
      subtitle: nullableText(body.subtitle, 500),
      placeType: nullableText(body.placeType ?? body.place_type, 120),
      significance: nullableText(body.significance, 20_000),
      significanceJson: jsonArray(body.significanceJson ?? body.significanceItems, 100),
      shortDescription: nullableText(body.shortDescription ?? body.short_description, 3000),
      description: nullableText(body.description, MAX_TEXT),
      history: nullableText(body.history, 20_000),
      bestTime: nullableText(body.bestTime ?? body.best_time, 1000),
      howToReach: nullableText(body.howToReach ?? body.how_to_reach, 5000),
      reach: nullableText(body.reach, 5000),
      attractionsJson: jsonArray(body.attractionsJson ?? body.attractions, 100),
      nearbyJson: jsonArray(body.nearbyJson ?? body.nearby, 100),
      image: nullableText(body.image, 4000),
      galleryJson: jsonArray(body.galleryJson ?? body.gallery, MAX_GALLERY, 4000),
      city: nullableText(body.city ?? locationAncestry(locationId).city, 150),
      district: nullableText(body.district ?? locationAncestry(locationId).district, 150),
      state: nullableText(body.state ?? locationAncestry(locationId).state, 150),
      country: nullableText(body.country ?? locationAncestry(locationId).country, 150) ?? "India",
      locationId: location.locationId,
      address: nullableText(body.address, 2000),
      latitude: body.latitude === "" || body.latitude == null ? null : Number(body.latitude),
      longitude: body.longitude === "" || body.longitude == null ? null : Number(body.longitude),
      mapUrl: nullableText(body.mapUrl ?? body.map_url, 4000),
      nearbyAttractionsJson: jsonArray(body.nearbyAttractionsJson ?? body.nearbyAttractions, 100),
      travelTipsJson: jsonArray(body.travelTipsJson ?? body.travelTips, 100),
      featured: booleanValue(body.featured) ? 1 : 0,
      sortOrder: nonNegativeInt(body.sortOrder ?? body.sort_order, 0, 100000) ?? 0,
    };

    if (values.latitude !== null && (!Number.isFinite(values.latitude) || values.latitude < -90 || values.latitude > 90)) return res.status(400).json({ success: false, error: "Invalid latitude." });
    if (values.longitude !== null && (!Number.isFinite(values.longitude) || values.longitude < -180 || values.longitude > 180)) return res.status(400).json({ success: false, error: "Invalid longitude." });

    if (status === "published" && values.description && values.shortDescription) {
      // intentionally allowed; no invented content is generated here
    } else if (status === "published") {
      return res.status(400).json({ success: false, error: "Published Spiritual Places require description and short description." });
    }

    const result = db.transaction(() => {
      const inserted = db.prepare(`
        INSERT INTO spiritual_places (
          slug,name,subtitle,place_type,significance,significance_json,short_description,description,
          history,best_time,how_to_reach,reach,attractions_json,nearby_json,image,gallery_json,
          city,district,state,country,location_id,country_location_id,state_location_id,district_location_id,city_location_id,
          address,latitude,longitude,map_url,nearby_attractions_json,travel_tips_json,status,featured,sort_order,
          created_at,updated_at
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
      `).run(
        values.slug, values.name, values.subtitle, values.placeType, values.significance, values.significanceJson,
        values.shortDescription, values.description, values.history, values.bestTime, values.howToReach, values.reach,
        values.attractionsJson, values.nearbyJson, values.image, values.galleryJson, values.city, values.district,
        values.state, values.country, values.locationId, location.countryId, location.stateId, location.districtId,
        location.cityId, values.address, values.latitude, values.longitude, values.mapUrl, values.nearbyAttractionsJson,
        values.travelTipsJson, status, values.featured, values.sortOrder,
      );
      return Number(inserted.lastInsertRowid);
    })();

    const created = spiritualPlaceById(result);
    if (created) syncSeo(created, req);
    audit(req, "spiritual_place.created", "spiritual_place", result, null, created);
    return res.status(201).json({ success: true, spiritualPlace: created ? adminRow(created) : null });
  } catch (error) {
    console.error("Spiritual Place create error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "LOCATION_INVALID") return res.status(400).json({ success: false, error: "Selected location does not exist or is inactive." });
    return res.status(500).json({ success: false, error: "Unable to create Spiritual Place." });
  }
});

staffRouter.patch("/:id", (req, res) => {
  try {
    if (!requireSuperAdmin(res)) return;
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid Spiritual Place id." });
    const existing = spiritualPlaceById(id);
    if (!existing) return res.status(404).json({ success: false, error: "Spiritual Place not found." });

    const body = req.body && typeof req.body === "object" ? req.body as SqlRow : {};
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(body, key);
    const updates: string[] = [];
    const params: unknown[] = [];
    let nextSlug = text(existing.slug, 160);

    if (has("name")) {
      const name = text(body.name, 250);
      if (name.length < 2) return res.status(400).json({ success: false, error: "Spiritual Place name must contain at least 2 characters." });
      updates.push("name=?"); params.push(name);
    }
    if (has("slug")) {
      nextSlug = uniqueSlug(body.slug, text(body.name ?? existing.name, 250), id);
      updates.push("slug=?"); params.push(nextSlug);
    }

    const textFields: Array<[string, string, number]> = [
      ["subtitle", "subtitle", 500], ["place_type", "placeType", 120], ["significance", "significance", 20_000],
      ["short_description", "shortDescription", 3000], ["description", "description", MAX_TEXT],
      ["history", "history", 20_000], ["best_time", "bestTime", 1000], ["how_to_reach", "howToReach", 5000],
      ["reach", "reach", 5000], ["image", "image", 4000], ["address", "address", 2000],
      ["map_url", "mapUrl", 4000], ["city", "city", 150], ["district", "district", 150], ["state", "state", 150],
      ["country", "country", 150],
    ];
    for (const [column, key, max] of textFields) if (has(key) || has(column)) { updates.push(`${column}=?`); params.push(nullableText(body[key] ?? body[column], max)); }

    const jsonFields: Array<[string, string]> = [
      ["significance_json", "significanceJson"], ["attractions_json", "attractions"], ["nearby_json", "nearby"],
      ["gallery_json", "gallery"], ["nearby_attractions_json", "nearbyAttractions"], ["travel_tips_json", "travelTips"],
    ];
    for (const [column, key] of jsonFields) if (has(key) || has(column)) { updates.push(`${column}=?`); params.push(jsonArray(body[key] ?? body[column], MAX_GALLERY)); }

    if (has("latitude")) {
      const value = body.latitude === "" || body.latitude == null ? null : Number(body.latitude);
      if (value !== null && (!Number.isFinite(value) || value < -90 || value > 90)) return res.status(400).json({ success: false, error: "Invalid latitude." });
      updates.push("latitude=?"); params.push(value);
    }
    if (has("longitude")) {
      const value = body.longitude === "" || body.longitude == null ? null : Number(body.longitude);
      if (value !== null && (!Number.isFinite(value) || value < -180 || value > 180)) return res.status(400).json({ success: false, error: "Invalid longitude." });
      updates.push("longitude=?"); params.push(value);
    }

    if (has("locationId") || has("location_id") || has("locationName") || has("location")) {
      const locationId = resolveLocationId(body);
      if (body.locationId || body.location_id || body.locationName || body.location) {
        if (!locationId) return res.status(400).json({ success: false, error: "Selected location does not exist or is inactive." });
      }
      const location = validateLocation(locationId);
      updates.push("location_id=?","country_location_id=?","state_location_id=?","district_location_id=?","city_location_id=?");
      params.push(location.locationId, location.countryId, location.stateId, location.districtId, location.cityId);
    }

    if (has("featured")) { updates.push("featured=?"); params.push(booleanValue(body.featured) ? 1 : 0); }
    if (has("sortOrder") || has("sort_order")) { updates.push("sort_order=?"); params.push(nonNegativeInt(body.sortOrder ?? body.sort_order, 0, 100000) ?? 0); }

    let nextStatus = String(existing.status ?? "draft");
    if (has("status")) {
      const status = enumValue(body.status, EDITABLE_STATUSES);
      if (!status) return res.status(400).json({ success: false, error: "Invalid Spiritual Place status." });
      nextStatus = status;
      updates.push("status=?"); params.push(status);
    }

    if (nextStatus === "published") {
      const prospectiveDescription = has("description") ? nullableText(body.description, MAX_TEXT) : nullableText(existing.description, MAX_TEXT);
      const prospectiveShort = has("shortDescription") ? nullableText(body.shortDescription, 3000) : nullableText(existing.short_description, 3000);
      if (!prospectiveDescription || !prospectiveShort) return res.status(400).json({ success: false, error: "Published Spiritual Places require description and short description." });
    }

    if (!updates.length) return res.status(400).json({ success: false, error: "No supported Spiritual Place fields were supplied." });

    const oldData = { ...existing };
    updates.push("updated_at=CURRENT_TIMESTAMP"); params.push(id);
    db.prepare(`UPDATE spiritual_places SET ${updates.join(", ")} WHERE id=?`).run(...params);

    const updated = spiritualPlaceById(id);
    if (updated) syncSeo(updated, req, String(existing.slug ?? ""));
    audit(req, "spiritual_place.updated", "spiritual_place", id, oldData, updated);
    return res.json({ success: true, spiritualPlace: updated ? adminRow(updated) : null });
  } catch (error) {
    console.error("Spiritual Place update error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message === "LOCATION_INVALID") return res.status(400).json({ success: false, error: "Selected location does not exist or is inactive." });
    return res.status(500).json({ success: false, error: "Unable to update Spiritual Place." });
  }
});

staffRouter.post("/:id/publish", (req, res) => {
  try {
    if (!requireSuperAdmin(res)) return;
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid Spiritual Place id." });
    const old = spiritualPlaceById(id);
    if (!old) return res.status(404).json({ success: false, error: "Spiritual Place not found." });
    if (!nullableText(old.name, 250) || !nullableText(old.short_description, 3000) || !nullableText(old.description, MAX_TEXT)) return res.status(400).json({ success: false, error: "A Spiritual Place must have name, short description and description before publishing." });

    db.prepare(`UPDATE spiritual_places SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    const updated = spiritualPlaceById(id);
    if (updated) syncSeo(updated, req);
    audit(req, "spiritual_place.published", "spiritual_place", id, old, updated);
    return res.json({ success: true, spiritualPlace: updated ? adminRow(updated) : null });
  } catch (error) {
    console.error("Spiritual Place publish error:", error);
    return res.status(500).json({ success: false, error: "Unable to publish Spiritual Place." });
  }
});

staffRouter.post("/:id/unpublish", (req, res) => {
  try {
    if (!requireSuperAdmin(res)) return;
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid Spiritual Place id." });
    const old = spiritualPlaceById(id);
    if (!old) return res.status(404).json({ success: false, error: "Spiritual Place not found." });
    db.prepare(`UPDATE spiritual_places SET status='unpublished',featured=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    const updated = spiritualPlaceById(id);
    if (updated) syncSeo(updated, req);
    audit(req, "spiritual_place.unpublished", "spiritual_place", id, old, updated);
    return res.json({ success: true, spiritualPlace: updated ? adminRow(updated) : null });
  } catch (error) {
    console.error("Spiritual Place unpublish error:", error);
    return res.status(500).json({ success: false, error: "Unable to unpublish Spiritual Place." });
  }
});

staffRouter.delete("/:id", (req, res) => {
  try {
    if (!requireSuperAdmin(res)) return;
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid Spiritual Place id." });
    const old = spiritualPlaceById(id);
    if (!old) return res.status(404).json({ success: false, error: "Spiritual Place not found." });

    db.transaction(() => {
      db.prepare(`UPDATE spiritual_places SET status='unpublished',featured=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
      if (tableExists("seo_entries")) db.prepare(`UPDATE seo_entries SET is_indexable=0,robots='noindex,follow',status='unpublished',updated_at=CURRENT_TIMESTAMP WHERE entity_type='spiritual_place' AND entity_id=?`).run(id);
    })();

    const updated = spiritualPlaceById(id);
    audit(req, "spiritual_place.deleted", "spiritual_place", id, old, updated);
    return res.json({ success: true, deleted: false, status: "unpublished", spiritualPlace: updated ? adminRow(updated) : null });
  } catch (error) {
    console.error("Spiritual Place delete error:", error);
    return res.status(500).json({ success: false, error: "Unable to remove Spiritual Place." });
  }
});

staffRouter.patch("/bulk/status", (req, res) => {
  try {
    if (!requireSuperAdmin(res)) return;
    const idsValue = req.body?.ids;
    const ids = Array.isArray(idsValue)
      ? [...new Set(idsValue.map((value: unknown) => positiveId(value)).filter((value: number | null): value is number => Boolean(value)))].slice(0, 500)
      : [];
    const status = enumValue(req.body?.status, EDITABLE_STATUSES);
    if (!ids.length) return res.status(400).json({ success: false, error: "At least one valid Spiritual Place id is required." });
    if (!status) return res.status(400).json({ success: false, error: "Invalid Spiritual Place status." });

    const changed: number[] = [];
    const skipped: Array<{ id: number; reason: string }> = [];

    db.transaction(() => {
      for (const id of ids) {
        const row = spiritualPlaceById(id);
        if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
        if (status === "published" && (!nullableText(row.short_description, 3000) || !nullableText(row.description, MAX_TEXT))) {
          skipped.push({ id, reason: "missing_description" });
          continue;
        }
        db.prepare(`UPDATE spiritual_places SET status=?,featured=CASE WHEN ?<>'published' THEN 0 ELSE featured END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, status, id);
        changed.push(id);
      }
    })();

    for (const id of changed) {
      const updated = spiritualPlaceById(id);
      if (updated) syncSeo(updated, req);
    }

    audit(req, "spiritual_place.bulk_status", "spiritual_place", null, null, { status, ids: changed });
    return res.json({ success: true, status, changedIds: changed, skipped });
  } catch (error) {
    console.error("Spiritual Place bulk status error:", error);
    return res.status(500).json({ success: false, error: "Unable to update Spiritual Place statuses." });
  }
});

/* -------------------------------------------------------------------------- */
/* Mounts / exports                                                            */
/* -------------------------------------------------------------------------- */



// Public endpoints remain on the main router. Staff endpoints are mounted
// after them so /:identifier can never consume /stats, /admin, etc.
router.use(staffRouter);

router.get("/:identifier", (req, res) => {
  try {
    const identifier = text(req.params.identifier, 180);
    let row: SqlRow | null = null;

    if (/^\d+$/.test(identifier)) {
      row = spiritualPlaceById(Number(identifier));
    } else {
      row = (db.prepare(`SELECT * FROM spiritual_places WHERE slug=? LIMIT 1`).get(identifier) as SqlRow | undefined) ?? null;
    }

    if (!row) return res.status(404).json({ success: false, error: "Spiritual Place not found." });

    if (row.status !== PUBLIC_STATUS) {
      return res.status(404).json({ success: false, error: "Spiritual Place not found." });
    }

    let payload = publicRow(row);
    payload.seo = tableExists("seo_entries")
      ? db.prepare(`SELECT path,seo_title,meta_description,h1,canonical_url,robots,schema_json,is_indexable,status FROM seo_entries WHERE entity_type='spiritual_place' AND entity_id=? ORDER BY id DESC LIMIT 1`).get(Number(row.id)) ?? null
      : null;
    payload = attachRelated(payload, true);
    return res.json({ success: true, spiritualPlace: payload });
  } catch (error) {
    console.error("Spiritual Place detail error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Spiritual Place details." });
  }
});


export {
  router as spiritualPlacesRouter,
  router as spiritualPlaceRoutes,
};

export default router;
