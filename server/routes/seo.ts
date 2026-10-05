/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable no-useless-escape */
import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import { requireAuth, requireRole, type AuthenticatedUser } from "./auth.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — SEO / Indexing / Programmatic SEO API
|--------------------------------------------------------------------------
|
| Responsibilities
| ----------------
| - public SEO resolution for frontend pages
| - canonical URL + robots + Open Graph + Twitter metadata
| - JSON-LD / schema payload storage and delivery
| - sitemap.xml / sitemap-index.xml / robots.txt
| - SEO entry CMS for Super Admin
| - SEO content blocks
| - redirects
| - SEO settings
| - SEO templates
| - location SEO pages with thin-content safeguards
| - keyword management
| - internal-link management
| - URL health records
| - generation-run audit trail
| - compatibility read for legacy seo_pages
|
| Security
| --------
| - Public endpoints expose only published + indexable SEO data.
| - Sales gets read-only operational SEO visibility.
| - Only Super Admin may mutate SEO configuration/content.
| - Programmatic pages never become indexable below the configured listing
|   threshold.
| - Existing canonical URLs can be locked to prevent accidental mutation.
|
| Mount example
| ------------
| app.use("/api/seo", seoRouter);
|
| Public examples
| ---------------
| GET /api/seo/resolve?path=/temples
| GET /api/seo/defaults
| GET /api/seo/sitemap.xml
| GET /api/seo/robots.txt
|
| Admin examples
| --------------
| GET   /api/seo/entries
| POST  /api/seo/entries
| PATCH /api/seo/entries/:id
| POST  /api/seo/location-pages/:id/generate
| GET   /api/seo/templates
| PATCH /api/seo/settings
|--------------------------------------------------------------------------
*/

const router = Router();

const PUBLIC_STATUS = "published" as const;
const INDEXABLE_ROBOTS = "index,follow";
const NOINDEX_ROBOTS = "noindex,follow";
const MAX_LIST_LIMIT = 100;
const MAX_EXPORT_URLS = 50_000;
const MAX_BLOCK_CONTENT = 100_000;
const MAX_JSON_TEXT = 150_000;

const SEO_PAGE_TYPES = [
  "home",
  "page",
  "temples",
  "pandits",
  "puja_services",
  "ashrams",
  "yatra_packages",
  "spiritual_places",
  "events",
  "courses",
  "gallery",
  "videos",
  "articles",
  "location_listing",
  "location_hub",
  "entity",
] as const;

type SeoEntryStatus = "draft" | "published" | "unpublished";

type CatalogType =
  | "temple"
  | "pandit"
  | "puja_service"
  | "ashram"
  | "yatra"
  | "spiritual_place"
  | "event"
  | "course"
  | "gallery"
  | "video"
  | "article"
  | "other";

type LocationLevel = "country" | "state" | "district" | "city" | "area";

type SqlRow = Record<string, unknown>;

const CATALOG_TYPES: readonly CatalogType[] = [
  "temple",
  "pandit",
  "puja_service",
  "ashram",
  "yatra",
  "spiritual_place",
  "event",
  "course",
  "gallery",
  "video",
  "article",
  "other",
];

const LOCATION_LEVELS: readonly LocationLevel[] = [
  "country",
  "state",
  "district",
  "city",
  "area",
];

const BLOCK_TYPES = [
  "heading",
  "text",
  "html",
  "faq",
  "list",
  "image",
  "cta",
  "json",
] as const;

const REDIRECT_CODES = [301, 302, 307, 308] as const;
const SETTING_TYPES = ["string", "number", "boolean", "json"] as const;
const GENERATION_RUN_TYPES = ["generate", "refresh", "reindex", "validate", "manual"] as const;
const GENERATION_RESULTS = ["success", "skipped", "failed"] as const;

function text(value: unknown, max = 500): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, max);
}

function nullableText(value: unknown, max = 500): string | null {
  const normalized = text(value, max);
  return normalized || null;
}

function boolInt(value: unknown, fallback = false): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value !== 0 ? 1 : 0;
  const normalized = text(value, 30).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return 1;
  if (["0", "false", "no", "off"].includes(normalized)) return 0;
  return fallback ? 1 : 0;
}

function positiveId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function integerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return rounded >= min && rounded <= max ? rounded : fallback;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const normalized = text(value, 120).toLowerCase();
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as T[number])
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

function jsonText(value: unknown, fallback = "{}"): string {
  try {
    const serialized = JSON.stringify(value ?? {});
    if (!serialized) return fallback;
    if (serialized.length > MAX_JSON_TEXT) return fallback;
    return serialized;
  } catch {
    return fallback;
  }
}

function jsonArrayText(value: unknown, fallback = "[]"): string {
  const serialized = jsonText(value, fallback);
  return Array.isArray(parseJson(serialized)) ? serialized : fallback;
}

function jsonObjectText(value: unknown, fallback = "{}"): string {
  const serialized = jsonText(value, fallback);
  const parsed = parseJson(serialized);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? serialized
    : fallback;
}

function normalizePath(value: unknown): string {
  let path = text(value, 2000);
  if (!path) return "/";

  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname;
    }
  } catch {
    return "/";
  }

  path = path.split("?")[0]?.split("#")[0] ?? "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/+/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

function normalizeExternalOrPath(value: unknown): string | null {
  const raw = nullableText(value, 2000);
  if (!raw) return null;
  if (raw.startsWith("/")) return normalizePath(raw);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!url.protocol || !url.hostname) return null;
      return url.toString();
    } catch {
      return null;
    }
  }
  return null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) return nullableText(forwarded[0], 100);
  if (typeof forwarded === "string") return nullableText(forwarded.split(",")[0], 100);
  return nullableText(req.ip, 100);
}

function userAgent(req: Request): string | null {
  return nullableText(req.get("user-agent"), 500);
}

function requestId(req: Request): string | null {
  return nullableText(req.get("x-request-id"), 200);
}

function tableExists(tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
    .get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function currentUser(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

function currentActorType(user: AuthenticatedUser | null): string {
  return user?.role ?? "system";
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
  db.prepare(`
    INSERT INTO audit_logs (
      user_id, request_id, actor_type, action, entity_type, entity_id,
      old_data_json, new_data_json, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    user?.id ?? null,
    requestId(req),
    currentActorType(user ?? null),
    action,
    entityType,
    entityId,
    oldData === undefined ? null : jsonText(oldData),
    newData === undefined ? null : jsonText(newData),
    clientIp(req),
    userAgent(req),
  );
}

function pagination(req: Request): { page: number; limit: number; offset: number } {
  const page = integerInRange(req.query.page, 1, 1, 1000000);
  const limit = integerInRange(req.query.limit, 25, 1, MAX_LIST_LIMIT);
  return { page, limit, offset: (page - 1) * limit };
}

function parsePathList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : parseJson(value);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizePath(item)).filter(Boolean).slice(0, 500);
}

function buildPublicBaseUrl(req: Request): string | null {
  const configured = getSeoSettingValue("canonical_base_url");
  if (configured) {
    try {
      return new URL(configured).toString().replace(/\/$/, "");
    } catch {
      // Fall through to environment/request host.
    }
  }

  const fromEnv = text(process.env.PUBLIC_SITE_URL ?? process.env.SITE_URL, 500);
  if (fromEnv) {
    try {
      return new URL(fromEnv).toString().replace(/\/$/, "");
    } catch {
      // Fall through.
    }
  }

  try {
    const protocol = text(req.get("x-forwarded-proto"), 20) || req.protocol || "https";
    const host = req.get("host");
    if (!host) return null;
    return `${protocol}://${host}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function absoluteUrl(req: Request, pathOrUrl: string): string | null {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = buildPublicBaseUrl(req);
  if (!base) return null;
  return `${base}${normalizePath(pathOrUrl)}`;
}

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getSeoSetting(key: string): SqlRow | null {
  if (!tableExists("seo_settings")) return null;
  return (
    (db.prepare(`SELECT * FROM seo_settings WHERE setting_key=? LIMIT 1`).get(key) as SqlRow | undefined) ?? null
  );
}

function getSeoSettingValue(key: string): string {
  const row = getSeoSetting(key);
  return text(row?.setting_value, 5000);
}

function publicSettings(): Record<string, unknown> {
  const rows = tableExists("seo_settings")
    ? (db.prepare(`SELECT setting_key, setting_value, setting_type FROM seo_settings WHERE is_public=1 ORDER BY id`).all() as Array<SqlRow>)
    : [];

  const output: Record<string, unknown> = {};
  for (const row of rows) {
    const key = text(row.setting_key, 150);
    if (!key) continue;
    const type = enumValue(row.setting_type, SETTING_TYPES) ?? "string";
    const raw = row.setting_value;
    if (type === "json") output[key] = parseJson(raw) ?? {};
    else if (type === "number") output[key] = Number(raw ?? 0);
    else if (type === "boolean") output[key] = boolInt(raw) === 1;
    else output[key] = text(raw, 5000);
  }
  return output;
}

function validateSeoFieldLengths(body: SqlRow): string | null {
  const title = text(body.seoTitle ?? body.title, 250);
  const description = text(body.metaDescription ?? body.description, 5000);
  const h1 = text(body.h1, 500);
  const path = normalizePath(body.path);

  if (!path) return "Path is required.";
  if (title && title.length > 250) return "SEO title is too long.";
  if (description && description.length > 5000) return "Meta description is too long.";
  if (h1 && h1.length > 500) return "H1 is too long.";
  return null;
}

function validateSeoPath(path: string): string | null {
  if (!path.startsWith("/")) return "SEO path must start with '/'.";
  if (/\s/.test(path)) return "SEO path cannot contain spaces.";
  if (/\\/.test(path)) return "SEO path cannot contain backslashes.";
  if (path.includes("..")) return "SEO path cannot contain '..'.";
  if (/^\/api\//i.test(path)) return "API paths cannot be indexed through SEO entries.";
  if (/^\/(admin|dashboard|login|register)(\/|$)/i.test(path)) return "Private application paths cannot be SEO indexed.";
  return null;
}

function getSeoEntryById(id: number): SqlRow | null {
  if (!tableExists("seo_entries")) return null;
  return (db.prepare(`SELECT * FROM seo_entries WHERE id=? LIMIT 1`).get(id) as SqlRow | undefined) ?? null;
}

function getSeoEntryByPath(path: string, publishedOnly = true): SqlRow | null {
  if (!tableExists("seo_entries")) return null;

  const where = publishedOnly
    ? `WHERE path=? AND status='published' AND is_indexable=1`
    : `WHERE path=?`;

  return (db.prepare(`SELECT * FROM seo_entries ${where} LIMIT 1`).get(path) as SqlRow | undefined) ?? null;
}

function getBlocks(entryId: number, publicOnly = true): SqlRow[] {
  if (!tableExists("seo_content_blocks")) return [];
  return db
    .prepare(`
      SELECT *
      FROM seo_content_blocks
      WHERE seo_entry_id=? ${publicOnly ? "AND is_active=1" : ""}
      ORDER BY sort_order ASC, id ASC
    `)
    .all(entryId) as SqlRow[];
}

function getActiveRedirect(path: string): SqlRow | null {
  if (!tableExists("seo_redirects")) return null;
  return (db.prepare(`
    SELECT *
    FROM seo_redirects
    WHERE source_path=? AND is_active=1
    LIMIT 1
  `).get(path) as SqlRow | undefined) ?? null;
}

function entryPublicPayload(req: Request, entry: SqlRow, blocks: SqlRow[]): SqlRow {
  const path = normalizePath(entry.path);
  const canonical = nullableText(entry.canonical_url, 2000) || absoluteUrl(req, path);
  const schema = parseJson(entry.schema_json) ?? {};
  const faq = parseJson(entry.faq_json) ?? [];
  const breadcrumbs = parseJson(entry.breadcrumb_json) ?? [];
  const hreflang = parseJson(entry.hreflang_json) ?? {};
  const isIndexable = Number(entry.is_indexable ?? 0) === 1 && entry.status === PUBLIC_STATUS;

  return {
    id: entry.id,
    path,
    pageType: entry.page_type,
    entityType: entry.entity_type ?? null,
    entityId: entry.entity_id ?? null,
    seoTitle: entry.seo_title ?? null,
    metaDescription: entry.meta_description ?? null,
    h1: entry.h1 ?? null,
    introContent: entry.intro_content ?? null,
    bodyContent: entry.body_content ?? null,
    canonicalUrl: canonical,
    canonicalLocked: Number(entry.canonical_locked ?? 0) === 1,
    robots: isIndexable ? String(entry.robots ?? INDEXABLE_ROBOTS) : NOINDEX_ROBOTS,
    og: {
      title: entry.og_title ?? entry.seo_title ?? null,
      description: entry.og_description ?? entry.meta_description ?? null,
      image: entry.og_image ?? null,
    },
    twitter: {
      card: entry.twitter_card ?? "summary_large_image",
      title: entry.twitter_title ?? entry.seo_title ?? null,
      description: entry.twitter_description ?? entry.meta_description ?? null,
      image: entry.twitter_image ?? null,
    },
    schema,
    schemaType: entry.schema_type ?? null,
    faq,
    breadcrumbs,
    hreflang,
    imageAlt: entry.image_alt ?? null,
    focusKeyword: entry.focus_keyword ?? null,
    keywords: parseJson(entry.keywords_json) ?? [],
    primaryKeywords: parseJson(entry.primary_keywords_json) ?? [],
    locationKeywords: parseJson(entry.location_keywords_json) ?? [],
    longTailKeywords: parseJson(entry.long_tail_keywords_json) ?? [],
    searchIntents: parseJson(entry.search_intents_json) ?? [],
    qualityScore: entry.quality_score ?? null,
    sitemap: {
      priority: entry.sitemap_priority ?? null,
      changefreq: entry.sitemap_changefreq ?? null,
      lastmod: entry.lastmod_at ?? null,
    },
    blocks: blocks.map((block) => ({
      id: block.id,
      blockKey: block.block_key,
      blockType: block.block_type,
      heading: block.heading,
      content: block.content,
      contentJson: parseJson(block.content_json) ?? {},
      sortOrder: block.sort_order,
    })),
  };
}

function defaultSeoPayload(): SqlRow {
  return {
    title: getSeoSettingValue("site_default_title") || null,
    description: getSeoSettingValue("site_default_description") || null,
    robots: getSeoSettingValue("default_robots") || INDEXABLE_ROBOTS,
    canonicalBaseUrl: getSeoSettingValue("canonical_base_url") || null,
    settings: publicSettings(),
  };
}

function locationNames(locationId: number): Record<string, string> {
  if (!tableExists("locations")) return {};
  const row = db.prepare(`
    SELECT
      l.id,l.name,l.type,l.slug,l.seo_path,
      c.name AS country_name,
      st.name AS state_name,
      d.name AS district_name,
      ci.name AS city_name,
      c.slug AS country_slug,
      st.slug AS state_slug,
      d.slug AS district_slug,
      ci.slug AS city_slug
    FROM locations l
    LEFT JOIN locations c ON c.id=l.country_id
    LEFT JOIN locations st ON st.id=l.state_id
    LEFT JOIN locations d ON d.id=l.district_id
    LEFT JOIN locations ci ON ci.id=l.city_id
    WHERE l.id=?
    LIMIT 1
  `).get(locationId) as SqlRow | undefined;

  if (!row) return {};
  return {
    name: text(row.name, 250),
    type: text(row.type, 30),
    slug: text(row.slug, 250),
    seo_path: normalizePath(row.seo_path),
    country_name: text(row.country_name, 250),
    state_name: text(row.state_name, 250),
    district_name: text(row.district_name, 250),
    city_name: text(row.city_name, 250),
    country_slug: text(row.country_slug, 250),
    state_slug: text(row.state_slug, 250),
    district_slug: text(row.district_slug, 250),
    city_slug: text(row.city_slug, 250),
  };
}

function renderTemplate(template: unknown, values: Record<string, string>): string {
  return text(template, MAX_BLOCK_CONTENT).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => values[key] ?? "");
}

function locationSeoPath(locationId: number): string {
  const names = locationNames(locationId);
  if (names.seo_path) return names.seo_path;
  if (names.type === "country") return `/${names.country_slug || names.slug}`;
  if (names.type === "state") return `/${names.country_slug}/${names.state_slug}`.replace(/\/+$/, "");
  if (names.type === "district") return `/${names.country_slug}/${names.state_slug}/${names.district_slug}`.replace(/\/+$/, "");
  if (names.type === "city") return `/${names.country_slug}/${names.state_slug}/${names.district_slug}/${names.city_slug}`.replace(/\/+$/, "");
  return `/${names.slug}`.replace(/\/+$/, "");
}

function listingCountForLocation(catalogType: CatalogType, locationId: number, locationLevel: LocationLevel): number {
  const values = [locationId, locationId, locationId, locationId, locationId];

  try {
    switch (catalogType) {
      case "temple": {
        if (!tableExists("temples")) return 0;
        const row = db.prepare(`
          SELECT COUNT(DISTINCT t.id) AS count
          FROM temples t
          WHERE t.status='published'
            AND (t.location_id=? OR t.country_location_id=? OR t.state_location_id=? OR t.district_location_id=? OR t.city_location_id=?)
        `).get(...values) as { count?: number } | undefined;
        return Number(row?.count ?? 0);
      }
      case "pandit": {
        if (!tableExists("pandit_profiles")) return 0;
        const row = db.prepare(`
          SELECT COUNT(DISTINCT p.id) AS count
          FROM pandit_profiles p
          LEFT JOIN pandit_service_locations psl ON psl.pandit_id=p.id AND psl.is_active=1
          LEFT JOIN locations sl ON sl.id=psl.location_id
          WHERE p.profile_status='approved' AND p.listing_active=1
            AND (
              p.location_id=? OR p.country_location_id=? OR p.state_location_id=? OR p.district_location_id=? OR p.city_location_id=?
              OR sl.id=? OR sl.country_id=? OR sl.state_id=? OR sl.district_id=? OR sl.city_id=?
            )
        `).get(
          locationId,locationId,locationId,locationId,locationId,
          locationId,locationId,locationId,locationId,locationId,
        ) as { count?: number } | undefined;
        return Number(row?.count ?? 0);
      }
      case "puja_service": {
        if (!tableExists("puja_services")) return 0;
        const national = locationLevel === "country" ? "ps.availability_scope IN ('national','online') OR" : "";
        const row = db.prepare(`
          SELECT COUNT(DISTINCT ps.id) AS count
          FROM puja_services ps
          LEFT JOIN puja_service_locations psl ON psl.puja_service_id=ps.id AND psl.is_active=1
          LEFT JOIN locations dl ON dl.id=ps.default_location_id
          LEFT JOIN locations sl ON sl.id=psl.location_id
          WHERE ps.status='published' AND (
            ${national}
            ps.default_location_id=? OR psl.location_id=?
            OR dl.country_id=? OR dl.state_id=? OR dl.district_id=? OR dl.city_id=?
            OR sl.country_id=? OR sl.state_id=? OR sl.district_id=? OR sl.city_id=?
          )
        `).get(
          locationId,locationId,
          locationId,locationId,locationId,locationId,
          locationId,locationId,locationId,locationId,
        ) as { count?: number } | undefined;
        return Number(row?.count ?? 0);
      }
      case "ashram": {
        if (!tableExists("ashrams")) return 0;
        const row = db.prepare(`
          SELECT COUNT(DISTINCT a.id) AS count
          FROM ashrams a
          WHERE a.status='published' AND a.listing_active=1
            AND (a.location_id=? OR a.country_location_id=? OR a.state_location_id=? OR a.district_location_id=? OR a.city_location_id=?)
        `).get(...values) as { count?: number } | undefined;
        return Number(row?.count ?? 0);
      }
      default: {
        const tableMap: Partial<Record<CatalogType, { table: string; alias: string }>> = {
          yatra: { table: "yatra_packages", alias: "y" },
          spiritual_place: { table: "spiritual_places", alias: "sp" },
          event: { table: "events", alias: "e" },
          gallery: { table: "gallery_items", alias: "g" },
          video: { table: "videos", alias: "v" },
          course: { table: "courses", alias: "c" },
          article: { table: "articles", alias: "ar" },
        };
        const config = tableMap[catalogType];
        if (!config || !tableExists(config.table)) return 0;
        const row = db.prepare(`
          SELECT COUNT(DISTINCT ${config.alias}.id) AS count
          FROM "${config.table}" ${config.alias}
          WHERE ${config.alias}.status='published'
            AND (
              ${config.alias}.location_id=?
              OR ${config.alias}.country_location_id=?
              OR ${config.alias}.state_location_id=?
              OR ${config.alias}.district_location_id=?
              OR ${config.alias}.city_location_id=?
            )
        `).get(...values) as { count?: number } | undefined;
        return Number(row?.count ?? 0);
      }
    }
  } catch (error) {
    console.error("SEO listing count error:", catalogType, locationId, error);
    return 0;
  }
}

function seoMinimumForLocation(catalogType: CatalogType, locationLevel: LocationLevel, fallback: number): number {
  if (!tableExists("seo_listing_controls")) return fallback;

  const allowedColumns: Record<string, string> = {
    country: "min_country_listings",
    state: "min_state_listings",
    district: "min_district_listings",
    city: "min_city_listings",
  };
  const column = allowedColumns[locationLevel];
  if (!column) return fallback;

  const row = db.prepare(`
    SELECT "${column}" AS minimum
    FROM seo_listing_controls
    WHERE catalog_type=?
    LIMIT 1
  `).get(catalogType) as { minimum?: number } | undefined;

  const value = Number(row?.minimum ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function seoTemplateForLocation(catalogType: CatalogType, locationLevel: LocationLevel, templateId?: number | null, templateKey?: string | null): SqlRow | null {
  if (!tableExists("seo_templates")) return null;

  if (templateId) {
    return (db.prepare(`SELECT * FROM seo_templates WHERE id=? AND is_active=1 LIMIT 1`).get(templateId) as SqlRow | undefined) ?? null;
  }

  if (templateKey) {
    return (db.prepare(`SELECT * FROM seo_templates WHERE template_key=? AND is_active=1 LIMIT 1`).get(templateKey) as SqlRow | undefined) ?? null;
  }

  const prefixMap: Record<CatalogType, string> = {
    temple: "temple-listing",
    pandit: "pandit-listing",
    puja_service: "puja-listing",
    ashram: "ashram-listing",
    spiritual_place: "spiritual-place-listing",
    event: "event-listing",
    course: "course-listing",
    yatra: "yatra-listing",
    gallery: "gallery-listing",
    video: "video-listing",
    article: "article-listing",
    other: "other-listing",
  };

  const expectedKey = `${prefixMap[catalogType]}-${locationLevel}`;
  return (db.prepare(`
    SELECT *
    FROM seo_templates
    WHERE template_key=? AND is_active=1
    ORDER BY id ASC
    LIMIT 1
  `).get(expectedKey) as SqlRow | undefined) ?? null;
}

function buildLocationTemplateValues(locationId: number, listingCount: number): Record<string, string> {
  const names = locationNames(locationId);
  const locationPath = locationSeoPath(locationId);
  return {
    ...names,
    location_path: locationPath,
    listing_count: String(listingCount),
    website_name: "DivyaDhara",
  };
}

function upsertGeneratedLocationPage(params: {
  locationId: number;
  catalogType: CatalogType;
  locationLevel: LocationLevel;
  template: SqlRow;
  forcePublish?: boolean;
}): { seoEntry: SqlRow | null; page: SqlRow | null; listingCount: number; indexable: boolean; message: string } {
  const { locationId, catalogType, locationLevel, template, forcePublish = false } = params;
  const names = locationNames(locationId);
  if (!names.name) return { seoEntry: null, page: null, listingCount: 0, indexable: false, message: "Location not found." };

  const listingCount = listingCountForLocation(catalogType, locationId, locationLevel);
  const minimum = seoMinimumForLocation(
    catalogType,
    locationLevel,
    Math.max(0, Number(template.min_listings_to_index ?? 3)),
  );
  const values = buildLocationTemplateValues(locationId, listingCount);
  const path = normalizePath(renderTemplate(template.slug_pattern, values));
  if (!path || path === "/") {
    return { seoEntry: null, page: null, listingCount, indexable: false, message: "Template did not render a valid location path." };
  }

  const validationError = validateSeoPath(path);
  if (validationError) {
    return { seoEntry: null, page: null, listingCount, indexable: false, message: validationError };
  }

  const title = renderTemplate(template.title_template, values).slice(0, 250);
  const description = renderTemplate(template.meta_template, values).slice(0, 5000);
  const h1 = renderTemplate(template.h1_template, values).slice(0, 500);
  const intro = renderTemplate(template.intro_template, values).slice(0, MAX_BLOCK_CONTENT);
  const faq = renderTemplate(template.faq_template_json, values) || "[]";
  const schema = renderTemplate(template.schema_template_json, values) || "{}";
  const breadcrumbs = renderTemplate(template.breadcrumb_template_json, values) || "[]";
  const imageAlt = renderTemplate(template.image_alt_template, values).slice(0, 500) || null;

  const parsedFaq = parseJson(faq);
  const parsedSchema = parseJson(schema);
  const parsedBreadcrumbs = parseJson(breadcrumbs);
  if (!Array.isArray(parsedFaq) || !parsedSchema || typeof parsedSchema !== "object" || Array.isArray(parsedSchema) || !Array.isArray(parsedBreadcrumbs)) {
    return {
      seoEntry: null,
      page: null,
      listingCount,
      indexable: false,
      message: "SEO template contains invalid FAQ/schema/breadcrumb JSON.",
    };
  }

  const hasUniqueContent = Boolean(title && description && h1 && intro);
  const thinContent = listingCount < minimum;
  const indexable = Boolean(hasUniqueContent && !thinContent);
  const shouldPublish = forcePublish ? indexable : indexable;
  const status: SeoEntryStatus = shouldPublish ? "published" : "draft";
  const noindexReason = thinContent
    ? `Thin location page: ${listingCount} ${catalogType} listing(s), minimum required ${minimum}.`
    : !hasUniqueContent
      ? "Template did not provide enough unique SEO content to index this page."
      : null;
  const canonicalPath = path;
  const qualityScore = Math.min(100, Math.max(0, 50 + Math.min(listingCount, 50)));
  const contentHash = sha256(JSON.stringify({ path, title, description, h1, intro, listingCount, templateId: template.id }));
  const pageKey = `${catalogType}:${path}`;
  const keywordPrimary = nullableText(template.primary_keyword ?? template.primaryKeyword, 250);
  const keywords = jsonArrayText(template.keyword_cluster_json, "[]");
  const intents = jsonArrayText(template.search_intent_json, "[]");
  const geo = db.prepare(`SELECT country_id,state_id,district_id,city_id FROM locations WHERE id=? LIMIT 1`).get(locationId) as SqlRow | undefined;

  let seoEntry: SqlRow | null = null;
  let page: SqlRow | null = null;

  const run = db.transaction(() => {
    const seoEntryPayload = [
      path,
      "location_listing",
      null,
      geo?.country_id ?? null,
      geo?.state_id ?? null,
      geo?.district_id ?? null,
      geo?.city_id ?? null,
      locationLevel === "area" ? locationId : null,
      locationLevel,
      title || null,
      description || null,
      h1 || null,
      intro || null,
      intro || null,
      jsonArrayText(parsedFaq, "[]"),
      jsonArrayText(parsedBreadcrumbs, "[]"),
      canonicalPath,
      indexable ? INDEXABLE_ROBOTS : NOINDEX_ROBOTS,
      jsonObjectText(parsedSchema, "{}"),
      catalogType,
      "{}",
      imageAlt,
      keywordPrimary,
      [names.city_name, names.district_name, names.state_name, names.country_name].filter(Boolean).join(", ") || names.name,
      keywords,
      keywordPrimary ? jsonArrayText([keywordPrimary], "[]") : "[]",
      jsonArrayText([names.name], "[]"),
      jsonArrayText(parseJson(template.keyword_cluster_json), "[]"),
      intents,
      indexable ? 1 : 0,
      noindexReason,
      qualityScore,
      contentHash,
      Math.min(1, Math.max(0.3, 0.5 + listingCount / 1000)),
      String(template.sitemap_changefreq ?? "weekly"),
      nowIso(),
      indexable ? nowIso() : null,
      status,
    ];

    db.prepare(`
      INSERT INTO seo_entries (
        path,page_type,entity_type,country_id,state_id,district_id,city_id,area_id,location_level,
        seo_title,meta_description,h1,intro_content,body_content,faq_json,breadcrumb_json,canonical_url,
        robots,schema_json,schema_type,hreflang_json,image_alt,focus_keyword,location_label,
        keywords_json,primary_keywords_json,location_keywords_json,long_tail_keywords_json,search_intents_json,
        is_indexable,noindex_reason,quality_score,content_hash,sitemap_priority,sitemap_changefreq,lastmod_at,published_at,status
      ) VALUES (${seoEntryPayload.map(() => "?").join(",")})
      ON CONFLICT(path) DO UPDATE SET
        page_type=excluded.page_type,
        entity_type=excluded.entity_type,
        country_id=excluded.country_id,
        state_id=excluded.state_id,
        district_id=excluded.district_id,
        city_id=excluded.city_id,
        area_id=excluded.area_id,
        location_level=excluded.location_level,
        seo_title=excluded.seo_title,
        meta_description=excluded.meta_description,
        h1=excluded.h1,
        intro_content=excluded.intro_content,
        body_content=excluded.body_content,
        faq_json=excluded.faq_json,
        breadcrumb_json=excluded.breadcrumb_json,
        canonical_url=excluded.canonical_url,
        robots=excluded.robots,
        schema_json=excluded.schema_json,
        schema_type=excluded.schema_type,
        hreflang_json=excluded.hreflang_json,
        image_alt=excluded.image_alt,
        focus_keyword=excluded.focus_keyword,
        location_label=excluded.location_label,
        keywords_json=excluded.keywords_json,
        primary_keywords_json=excluded.primary_keywords_json,
        location_keywords_json=excluded.location_keywords_json,
        long_tail_keywords_json=excluded.long_tail_keywords_json,
        search_intents_json=excluded.search_intents_json,
        is_indexable=excluded.is_indexable,
        noindex_reason=excluded.noindex_reason,
        quality_score=excluded.quality_score,
        content_hash=excluded.content_hash,
        sitemap_priority=excluded.sitemap_priority,
        sitemap_changefreq=excluded.sitemap_changefreq,
        lastmod_at=excluded.lastmod_at,
        published_at=excluded.published_at,
        status=excluded.status,
        updated_at=CURRENT_TIMESTAMP
    `).run(...seoEntryPayload);

    seoEntry = getSeoEntryByPath(path, false);
    if (!seoEntry?.id) throw new Error("Failed to create SEO entry for location page.");

    const locationPagePayload = [
      Number(seoEntry.id),
      Number(template.id),
      locationId,
      locationLevel,
      catalogType,
      "listing",
      null,
      null,
      pageKey,
      path,
      path,
      path,
      keywordPrimary,
      keywords,
      intents,
      title,
      description,
      h1,
      intro,
      jsonArrayText(parsedFaq, "[]"),
      jsonObjectText(parsedSchema, "{}"),
      jsonArrayText(parsedBreadcrumbs, "[]"),
      intro,
      listingCount,
      minimum,
      noindexReason,
      qualityScore,
      contentHash,
      1,
      Math.min(1, Math.max(0.3, 0.5 + listingCount / 1000)),
      String(template.sitemap_changefreq ?? "weekly"),
      nowIso(),
      indexable ? nowIso() : null,
      indexable ? 1 : 0,
      status,
      0,
    ];

    db.prepare(`
      INSERT INTO seo_location_pages (
        seo_entry_id,template_id,location_id,location_level,catalog_type,page_kind,entity_type,entity_id,
        page_key,path,url_pattern,canonical_path,primary_keyword,keyword_cluster_json,search_intent_json,
        generated_title,generated_description,generated_h1,generated_intro,generated_faq_json,generated_schema_json,
        generated_breadcrumb_json,generated_body,listing_count,minimum_listings_to_index,noindex_reason,quality_score,
        content_hash,generation_version,sitemap_priority,sitemap_changefreq,lastmod_at,published_at,is_indexable,status,priority
      ) VALUES (${locationPagePayload.map(() => "?").join(",")})
      ON CONFLICT(path) DO UPDATE SET
        seo_entry_id=excluded.seo_entry_id,
        template_id=excluded.template_id,
        location_id=excluded.location_id,
        location_level=excluded.location_level,
        catalog_type=excluded.catalog_type,
        page_key=excluded.page_key,
        url_pattern=excluded.url_pattern,
        canonical_path=excluded.canonical_path,
        primary_keyword=excluded.primary_keyword,
        keyword_cluster_json=excluded.keyword_cluster_json,
        search_intent_json=excluded.search_intent_json,
        generated_title=excluded.generated_title,
        generated_description=excluded.generated_description,
        generated_h1=excluded.generated_h1,
        generated_intro=excluded.generated_intro,
        generated_faq_json=excluded.generated_faq_json,
        generated_schema_json=excluded.generated_schema_json,
        generated_breadcrumb_json=excluded.generated_breadcrumb_json,
        generated_body=excluded.generated_body,
        listing_count=excluded.listing_count,
        minimum_listings_to_index=excluded.minimum_listings_to_index,
        noindex_reason=excluded.noindex_reason,
        quality_score=excluded.quality_score,
        content_hash=excluded.content_hash,
        generation_version=excluded.generation_version,
        sitemap_priority=excluded.sitemap_priority,
        sitemap_changefreq=excluded.sitemap_changefreq,
        lastmod_at=excluded.lastmod_at,
        published_at=excluded.published_at,
        is_indexable=excluded.is_indexable,
        status=excluded.status,
        priority=excluded.priority,
        last_generated_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
    `).run(...locationPagePayload);

    page = db.prepare(`SELECT * FROM seo_location_pages WHERE path=? LIMIT 1`).get(path) as SqlRow;
  });

  run();

  return {
    seoEntry,
    page,
    listingCount,
    indexable,
    message: indexable ? "Location SEO page generated and indexable." : noindexReason ?? "Location SEO page generated as noindex.",
  };
}

function canReadAdminSeo(user: AuthenticatedUser): boolean {
  return user.role === "sales" || user.role === "super_admin";
}

function applySeoEntryInput(_existing: SqlRow | null, body: SqlRow): { updates: string[]; values: unknown[] } {
  const updates: string[] = [];
  const values: unknown[] = [];
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(body, key);

  if (has("path")) {
    const path = normalizePath(body.path);
    const pathError = validateSeoPath(path);
    if (pathError) throw new Error(pathError);
    updates.push("path=?");
    values.push(path);
  }

  const textFields: Array<[string, string, number]> = [
    ["page_type", "pageType", 100],
    ["entity_type", "entityType", 100],
    ["seo_title", "seoTitle", 250],
    ["seo_title", "title", 250],
    ["meta_description", "metaDescription", 5000],
    ["meta_description", "description", 5000],
    ["h1", "h1", 500],
    ["intro_content", "introContent", MAX_BLOCK_CONTENT],
    ["body_content", "bodyContent", MAX_BLOCK_CONTENT],
    ["canonical_url", "canonicalUrl", 2000],
    ["og_title", "ogTitle", 250],
    ["og_description", "ogDescription", 5000],
    ["og_image", "ogImage", 2000],
    ["twitter_card", "twitterCard", 100],
    ["twitter_title", "twitterTitle", 250],
    ["twitter_description", "twitterDescription", 5000],
    ["twitter_image", "twitterImage", 2000],
    ["image_alt", "imageAlt", 500],
    ["focus_keyword", "focusKeyword", 250],
    ["area", "area", 250],
    ["location_label", "locationLabel", 500],
    ["noindex_reason", "noindexReason", 1000],
  ];

  const seenColumns = new Set<string>();
  for (const [column, key, max] of textFields) {
    if (!has(key) || seenColumns.has(column)) continue;
    seenColumns.add(column);
    const value = body[key];
    if (column === "canonical_url") {
      const normalized = normalizeExternalOrPath(value);
      if (value && !normalized) throw new Error("canonicalUrl must be a valid path or http(s) URL.");
      updates.push("canonical_url=?");
      values.push(normalized);
      continue;
    }
    updates.push(`${column}=?`);
    values.push(nullableText(value, max));
  }

  if (has("entityId")) {
    updates.push("entity_id=?");
    values.push(positiveId(body.entityId));
  }
  if (has("countryId")) { updates.push("country_id=?"); values.push(positiveId(body.countryId)); }
  if (has("stateId")) { updates.push("state_id=?"); values.push(positiveId(body.stateId)); }
  if (has("districtId")) { updates.push("district_id=?"); values.push(positiveId(body.districtId)); }
  if (has("cityId")) { updates.push("city_id=?"); values.push(positiveId(body.cityId)); }
  if (has("areaId")) { updates.push("area_id=?"); values.push(positiveId(body.areaId)); }

  if (has("locationLevel")) {
    const level = enumValue(body.locationLevel, LOCATION_LEVELS);
    if (!level) throw new Error("Invalid locationLevel.");
    updates.push("location_level=?");
    values.push(level);
  }

  if (has("faq") || has("faqJson")) {
    const parsed = Array.isArray(body.faq) ? body.faq : parseJson(body.faqJson);
    if (!Array.isArray(parsed)) throw new Error("FAQ must be an array.");
    updates.push("faq_json=?"); values.push(jsonArrayText(parsed));
  }

  if (has("breadcrumbs") || has("breadcrumbJson")) {
    const parsed = Array.isArray(body.breadcrumbs) ? body.breadcrumbs : parseJson(body.breadcrumbJson);
    if (!Array.isArray(parsed)) throw new Error("Breadcrumbs must be an array.");
    updates.push("breadcrumb_json=?"); values.push(jsonArrayText(parsed));
  }

  if (has("hreflang") || has("hreflangJson")) {
    const parsed = body.hreflang && typeof body.hreflang === "object" ? body.hreflang : parseJson(body.hreflangJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("hreflang must be an object.");
    updates.push("hreflang_json=?"); values.push(jsonObjectText(parsed));
  }

  if (has("schema") || has("schemaJson")) {
    const parsed = body.schema && typeof body.schema === "object" ? body.schema : parseJson(body.schemaJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("schema must be an object.");
    updates.push("schema_json=?"); values.push(jsonObjectText(parsed));
  }

  const jsonArrayFields: Array<[string,string]> = [
    ["keywords_json", "keywords"],
    ["primary_keywords_json", "primaryKeywords"],
    ["location_keywords_json", "locationKeywords"],
    ["long_tail_keywords_json", "longTailKeywords"],
    ["search_intents_json", "searchIntents"],
  ];
  for (const [column, key] of jsonArrayFields) {
    if (!has(key)) continue;
    const candidate = Array.isArray(body[key]) ? body[key] : parseJson(body[key]);
    if (!Array.isArray(candidate)) throw new Error(`${key} must be an array.`);
    updates.push(`${column}=?`);
    values.push(jsonArrayText(candidate));
  }

  if (has("robots")) {
    const robots = text(body.robots, 120).toLowerCase();
    if (!robots) throw new Error("robots cannot be empty.");
    updates.push("robots=?"); values.push(robots);
  }
  if (has("isIndexable")) { updates.push("is_indexable=?"); values.push(boolInt(body.isIndexable)); }
  if (has("canonicalLocked")) { updates.push("canonical_locked=?"); values.push(boolInt(body.canonicalLocked)); }
  if (has("qualityScore")) { updates.push("quality_score=?"); values.push(integerInRange(body.qualityScore, 0, 0, 100)); }
  if (has("sitemapPriority")) {
    const p = Number(body.sitemapPriority);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error("sitemapPriority must be between 0 and 1.");
    updates.push("sitemap_priority=?"); values.push(p);
  }
  if (has("sitemapChangefreq")) { updates.push("sitemap_changefreq=?"); values.push(nullableText(body.sitemapChangefreq, 50)); }
  if (has("lastmodAt")) { updates.push("lastmod_at=?"); values.push(nullableText(body.lastmodAt, 80)); }
  if (has("publishedAt")) { updates.push("published_at=?"); values.push(nullableText(body.publishedAt, 80)); }
  if (has("status")) {
    const status = enumValue(body.status, ["draft","published","unpublished"] as const);
    if (!status) throw new Error("Invalid SEO entry status.");
    updates.push("status=?"); values.push(status);
  }

  if (updates.length) updates.push("updated_at=CURRENT_TIMESTAMP");

  return { updates, values };
}

/* -------------------------------------------------------------------------- */
/* Public SEO endpoints                                                      */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  try {
    const tables = [
      "seo_entries",
      "seo_content_blocks",
      "seo_redirects",
      "seo_settings",
      "seo_pages",
      "seo_templates",
      "seo_location_pages",
      "seo_keywords",
      "seo_internal_links",
      "seo_url_health",
    ];
    const tableStatus = Object.fromEntries(tables.map((name) => [name, tableExists(name)]));
    res.json({
      success: true,
      service: "seo",
      status: tableStatus.seo_entries && tableStatus.seo_settings ? "healthy" : "degraded",
      database: true,
      tables: tableStatus,
      timestamp: nowIso(),
    });
  } catch (error) {
    console.error("SEO health error:", error);
    res.status(500).json({ success: false, service: "seo", status: "unhealthy", database: false });
  }
});

router.get("/defaults", (_req: Request, res: Response) => {
  res.json({ success: true, defaults: defaultSeoPayload() });
});

router.get("/redirect", (req: Request, res: Response) => {
  try {
    const path = normalizePath(req.query.path);
    const redirect = getActiveRedirect(path);
    if (!redirect) {
      res.status(404).json({ success: false, found: false, path });
      return;
    }
    res.json({
      success: true,
      found: true,
      redirect: {
        sourcePath: redirect.source_path,
        targetPath: normalizeExternalOrPath(redirect.target_path),
        statusCode: Number(redirect.status_code),
      },
    });
  } catch (error) {
    console.error("SEO redirect resolver error:", error);
    res.status(500).json({ success: false, error: "Unable to resolve SEO redirect." });
  }
});

router.get("/resolve", (req: Request, res: Response) => {
  try {
    const path = normalizePath(req.query.path);
    const redirect = getActiveRedirect(path);

    if (redirect) {
      res.json({
        success: true,
        found: false,
        redirected: true,
        path,
        redirect: {
          sourcePath: redirect.source_path,
          targetPath: normalizeExternalOrPath(redirect.target_path),
          statusCode: Number(redirect.status_code),
        },
        defaults: defaultSeoPayload(),
      });
      return;
    }

    const entry = getSeoEntryByPath(path, true);
    if (!entry) {
      res.status(404).json({ success: false, found: false, path, defaults: defaultSeoPayload() });
      return;
    }

    const payload = entryPublicPayload(req, entry, getBlocks(Number(entry.id), true));
    res.json({ success: true, found: true, path, entry: payload });
  } catch (error) {
    console.error("SEO resolve error:", error);
    res.status(500).json({ success: false, error: "Unable to resolve SEO metadata." });
  }
});

router.get("/sitemap.xml", (req: Request, res: Response) => {
  try {
    if (!tableExists("seo_entries")) {
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
      return;
    }

    const countRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM seo_entries
      WHERE status='published' AND is_indexable=1
    `).get() as { count?: number } | undefined;
    const total = Math.min(Number(countRow?.count ?? 0), MAX_EXPORT_URLS);
    const chunkSize = 45_000;
    const maxChunks = Math.max(1, Math.ceil(total / chunkSize));
    const chunk = integerInRange(req.query.chunk, 1, 1, maxChunks);
    const offset = (chunk - 1) * chunkSize;

    const rows = db.prepare(`
      SELECT path, canonical_url, sitemap_priority, sitemap_changefreq, lastmod_at, updated_at
      FROM seo_entries
      WHERE status='published' AND is_indexable=1
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `).all(Math.min(chunkSize, MAX_EXPORT_URLS), offset) as Array<SqlRow>;

    const urls: string[] = [];
    for (const row of rows) {
      const path = normalizePath(row.path);
      const loc = nullableText(row.canonical_url, 2000) || absoluteUrl(req, path);
      if (!loc) continue;
      const lastmod = nullableText(row.lastmod_at ?? row.updated_at, 80);
      const priority = row.sitemap_priority !== null && row.sitemap_priority !== undefined ? Number(row.sitemap_priority) : null;
      const changefreq = nullableText(row.sitemap_changefreq, 50);

      urls.push([
        "<url>",
        `<loc>${xmlEscape(loc)}</loc>`,
        lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "",
        changefreq ? `<changefreq>${xmlEscape(changefreq)}</changefreq>` : "",
        priority !== null && Number.isFinite(priority) ? `<priority>${Math.min(1, Math.max(0, priority)).toFixed(2)}</priority>` : "",
        "</url>",
      ].join(""));
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
  } catch (error) {
    console.error("SEO sitemap error:", error);
    res.status(500).type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
  }
});

router.get("/sitemap-index.xml", (req: Request, res: Response) => {
  try {
    if (!tableExists("seo_entries")) {
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>`);
      return;
    }

    const countRow = db.prepare(`SELECT COUNT(*) AS count FROM seo_entries WHERE status='published' AND is_indexable=1`).get() as { count?: number } | undefined;
    const total = Math.min(Number(countRow?.count ?? 0), MAX_EXPORT_URLS);
    const chunkSize = 45_000;
    const chunks = Math.max(1, Math.ceil(total / chunkSize));
    const base = buildPublicBaseUrl(req);
    const basePath = `${req.baseUrl || ""}`.replace(/\/$/, "");

    const children: string[] = [];
    for (let i = 1; i <= chunks; i += 1) {
      const loc = base ? `${base}${basePath}/sitemap.xml?chunk=${i}` : `${basePath}/sitemap.xml?chunk=${i}`;
      children.push(`<sitemap><loc>${xmlEscape(loc)}</loc></sitemap>`);
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children.join("")}</sitemapindex>`);
  } catch (error) {
    console.error("SEO sitemap index error:", error);
    res.status(500).type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>`);
  }
});

router.get("/robots.txt", (req: Request, res: Response) => {
  const base = buildPublicBaseUrl(req);
  const sitemap = base ? `${base}${req.baseUrl || ""}/sitemap.xml` : `${req.baseUrl || ""}/sitemap.xml`;
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin",
    "Disallow: /dashboard",
    "Disallow: /login",
    "Disallow: /register",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ];
  res.setHeader("Cache-Control", "public, max-age=600");
  res.type("text/plain").send(lines.join("\n"));
});

/* -------------------------------------------------------------------------- */
/* Read-only operational SEO endpoints — Sales + Super Admin                 */
/* -------------------------------------------------------------------------- */

router.get("/overview", requireAuth, requireRole("sales", "super_admin"), (_req: Request, res: Response) => {
  try {
    const user = currentUser(res);
    if (!canReadAdminSeo(user)) {
      res.status(403).json({ success: false, error: "SEO access denied." });
      return;
    }

    const count = (table: string, where = "1=1") => tableExists(table)
      ? Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get() as { count?: number } | undefined)?.count ?? 0)
      : 0;

    res.json({
      success: true,
      viewer: { id: user.id, role: user.role, name: user.name },
      counts: {
        entries: count("seo_entries"),
        publishedIndexable: count("seo_entries", "status='published' AND is_indexable=1"),
        drafts: count("seo_entries", "status='draft'"),
        redirects: count("seo_redirects", "is_active=1"),
        locationPages: count("seo_location_pages"),
        locationPagesIndexable: count("seo_location_pages", "status='published' AND is_indexable=1"),
        keywords: count("seo_keywords", "is_active=1"),
        internalLinks: count("seo_internal_links", "is_active=1"),
        urlHealthErrors: count("seo_url_health", "http_status IS NOT NULL AND http_status >= 400"),
      },
    });
  } catch (error) {
    console.error("SEO overview error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO overview." });
  }
});

router.get("/schema-status", requireAuth, requireRole("sales", "super_admin"), (_req: Request, res: Response) => {
  try {
    const required = [
      "seo_entries","seo_content_blocks","seo_redirects","seo_settings","seo_pages",
      "seo_templates","seo_location_pages","seo_keywords","seo_internal_links",
      "seo_generation_runs","seo_url_health","seo_listing_controls","locations",
    ];
    const tables = Object.fromEntries(required.map((name) => [name, tableExists(name)]));
    const missing = required.filter((name) => !tables[name]);
    res.json({ success: true, tables, missing, healthy: missing.length === 0 });
  } catch (error) {
    console.error("SEO schema status error:", error);
    res.status(500).json({ success: false, error: "Unable to inspect SEO schema." });
  }
});

router.get("/entries", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const search = text(req.query.search, 180);
    const status = enumValue(req.query.status, ["draft","published","unpublished"] as const);
    const pageType = text(req.query.pageType, 100);
    const entityType = text(req.query.entityType, 100);
    const indexable = req.query.isIndexable === undefined ? null : boolInt(req.query.isIndexable);

    if (search) {
      const pattern = `%${search}%`;
      where.push(`(LOWER(COALESCE(path,'')) LIKE LOWER(?) OR LOWER(COALESCE(seo_title,'')) LIKE LOWER(?) OR LOWER(COALESCE(h1,'')) LIKE LOWER(?) OR LOWER(COALESCE(focus_keyword,'')) LIKE LOWER(?))`);
      params.push(pattern, pattern, pattern, pattern);
    }
    if (status) { where.push("status=?"); params.push(status); }
    if (pageType) { where.push("page_type=?"); params.push(pageType); }
    if (entityType) { where.push("entity_type=?"); params.push(entityType); }
    if (indexable !== null) { where.push("is_indexable=?"); params.push(indexable); }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM seo_entries ${whereSql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);
    const rows = db.prepare(`
      SELECT *
      FROM seo_entries
      ${whereSql}
      ORDER BY
        CASE WHEN status='published' THEN 0 WHEN status='draft' THEN 1 ELSE 2 END,
        is_indexable DESC,
        COALESCE(lastmod_at, updated_at) DESC,
        id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as SqlRow[];

    res.json({
      success: true,
      entries: rows,
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("SEO entry list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO entries." });
  }
});

router.get("/entries/:id", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid SEO entry id." });
    const entry = getSeoEntryById(id);
    if (!entry) return res.status(404).json({ success: false, error: "SEO entry not found." });
    res.json({ success: true, entry, blocks: getBlocks(id, false) });
  } catch (error) {
    console.error("SEO entry detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO entry." });
  }
});

router.get("/blocks", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const seoEntryId = positiveId(req.query.seoEntryId ?? req.query.entryId);
    if (!seoEntryId) return res.status(400).json({ success: false, error: "seoEntryId is required." });
    if (!getSeoEntryById(seoEntryId)) return res.status(404).json({ success: false, error: "SEO entry not found." });
    res.json({ success: true, blocks: getBlocks(seoEntryId, false) });
  } catch (error) {
    console.error("SEO block list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO blocks." });
  }
});

router.get("/redirects", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const search = text(req.query.search, 180);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    if (search) {
      const pattern = `%${search}%`;
      where.push("(LOWER(source_path) LIKE LOWER(?) OR LOWER(target_path) LIKE LOWER(?))");
      params.push(pattern, pattern);
    }
    if (req.query.isActive !== undefined) { where.push("is_active=?"); params.push(boolInt(req.query.isActive)); }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_redirects ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const redirects = db.prepare(`SELECT * FROM seo_redirects ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ success: true, redirects, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("SEO redirects list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO redirects." });
  }
});

router.get("/settings", requireAuth, requireRole("sales", "super_admin"), (_req: Request, res: Response) => {
  try {
    const settings = tableExists("seo_settings") ? db.prepare(`SELECT * FROM seo_settings ORDER BY id`).all() : [];
    res.json({ success: true, settings });
  } catch (error) {
    console.error("SEO settings list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO settings." });
  }
});

router.get("/templates", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const catalogType = enumValue(req.query.catalogType, CATALOG_TYPES);
    const locationLevel = enumValue(req.query.locationLevel, LOCATION_LEVELS);
    const pageType = text(req.query.pageType, 100);
    if (catalogType) { where.push("catalog_type=?"); params.push(catalogType); }
    if (locationLevel) { where.push("location_level=?"); params.push(locationLevel); }
    if (pageType) { where.push("page_type=?"); params.push(pageType); }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_templates ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const templates = db.prepare(`SELECT * FROM seo_templates ${whereSql} ORDER BY page_type, catalog_type, location_level, id LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ success: true, templates, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("SEO templates list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO templates." });
  }
});

router.get("/location-pages", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const catalogType = enumValue(req.query.catalogType, CATALOG_TYPES);
    const locationLevel = enumValue(req.query.locationLevel, LOCATION_LEVELS);
    const status = enumValue(req.query.status, ["draft","published","unpublished"] as const);
    const locationId = positiveId(req.query.locationId);
    if (catalogType) { where.push("slp.catalog_type=?"); params.push(catalogType); }
    if (locationLevel) { where.push("slp.location_level=?"); params.push(locationLevel); }
    if (status) { where.push("slp.status=?"); params.push(status); }
    if (locationId) { where.push("slp.location_id=?"); params.push(locationId); }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_location_pages slp ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const pages = db.prepare(`
      SELECT slp.*, l.name AS location_name, l.seo_path AS location_seo_path, st.template_key
      FROM seo_location_pages slp
      LEFT JOIN locations l ON l.id=slp.location_id
      LEFT JOIN seo_templates st ON st.id=slp.template_id
      ${whereSql}
      ORDER BY slp.is_indexable DESC, slp.priority DESC, slp.listing_count DESC, slp.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    res.json({ success: true, locationPages: pages, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("SEO location page list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO location pages." });
  }
});

router.get("/keywords", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const search = text(req.query.search ?? req.query.keyword, 180);
    const entityType = text(req.query.entityType, 100);
    const language = text(req.query.language, 30);
    if (search) { where.push("LOWER(keyword) LIKE LOWER(?)"); params.push(`%${search}%`); }
    if (entityType) { where.push("entity_type=?"); params.push(entityType); }
    if (language) { where.push("language=?"); params.push(language); }
    if (req.query.isActive !== undefined) { where.push("is_active=?"); params.push(boolInt(req.query.isActive)); }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_keywords ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const keywords = db.prepare(`SELECT * FROM seo_keywords ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ success: true, keywords, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("SEO keyword list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO keywords." });
  }
});

router.get("/internal-links", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const fromEntryId = positiveId(req.query.fromSeoEntryId ?? req.query.fromEntryId);
    const where = fromEntryId ? "WHERE sil.from_seo_entry_id=?" : "";
    const params: unknown[] = fromEntryId ? [fromEntryId] : [];
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_internal_links sil ${where}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const links = db.prepare(`
      SELECT sil.*, se.path AS from_path
      FROM seo_internal_links sil
      INNER JOIN seo_entries se ON se.id=sil.from_seo_entry_id
      ${where}
      ORDER BY sil.sort_order ASC, sil.id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    res.json({ success: true, internalLinks: links, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("SEO internal link list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO internal links." });
  }
});

router.get("/url-health", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const status = positiveId(req.query.httpStatus);
    const search = text(req.query.search, 180);
    if (status) { where.push("http_status=?"); params.push(status); }
    if (search) { where.push("LOWER(path) LIKE LOWER(?)"); params.push(`%${search}%`); }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_url_health ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const rows = db.prepare(`SELECT * FROM seo_url_health ${whereSql} ORDER BY COALESCE(last_crawled_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ success: true, urlHealth: rows, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("SEO URL health list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO URL health." });
  }
});

router.get("/generation-runs", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    const result = enumValue(req.query.result, GENERATION_RESULTS);
    const runType = enumValue(req.query.runType, GENERATION_RUN_TYPES);
    if (result) { where.push("sgr.result=?"); params.push(result); }
    if (runType) { where.push("sgr.run_type=?"); params.push(runType); }
    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_generation_runs sgr ${whereSql}`).get(...params) as { count?: number } | undefined)?.count ?? 0);
    const runs = db.prepare(`
      SELECT sgr.*, slp.path AS location_page_path, se.path AS seo_entry_path, st.template_key
      FROM seo_generation_runs sgr
      LEFT JOIN seo_location_pages slp ON slp.id=sgr.seo_location_page_id
      LEFT JOIN seo_entries se ON se.id=sgr.seo_entry_id
      LEFT JOIN seo_templates st ON st.id=sgr.template_id
      ${whereSql}
      ORDER BY sgr.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    res.json({ success: true, generationRuns: runs, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("SEO generation run list error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO generation runs." });
  }
});

router.get("/listing-controls", requireAuth, requireRole("sales", "super_admin"), (_req: Request, res: Response) => {
  try {
    const controls = tableExists("seo_listing_controls") ? db.prepare(`SELECT * FROM seo_listing_controls ORDER BY catalog_type`).all() : [];
    res.json({ success: true, controls });
  } catch (error) {
    console.error("SEO listing controls error:", error);
    res.status(500).json({ success: false, error: "Unable to load SEO listing controls." });
  }
});

/* -------------------------------------------------------------------------- */
/* Super Admin mutation endpoints                                             */
/* -------------------------------------------------------------------------- */

router.post("/entries", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as SqlRow;
    const validation = validateSeoFieldLengths(body);
    if (validation) return res.status(400).json({ success: false, error: validation });

    const path = normalizePath(body.path);
    const pathError = validateSeoPath(path);
    if (pathError) return res.status(400).json({ success: false, error: pathError });

    const existing = getSeoEntryByPath(path, false);
    if (existing) return res.status(409).json({ success: false, error: "An SEO entry already exists for this path." });

    const pageType = enumValue(body.pageType, SEO_PAGE_TYPES) ?? "page";
    const status = enumValue(body.status, ["draft","published","unpublished"] as const) ?? "draft";
    const requestedIndexable = boolInt(body.isIndexable ?? (status === "published"));
    const isIndexable = status === "published" ? requestedIndexable : 0;
    const title = nullableText(body.seoTitle ?? body.title, 250);
    const description = nullableText(body.metaDescription ?? body.description, 5000);
    const h1 = nullableText(body.h1, 500);
    const canonical = normalizeExternalOrPath(body.canonicalUrl) ?? path;
    const robots = isIndexable ? text(body.robots ?? INDEXABLE_ROBOTS, 120) : NOINDEX_ROBOTS;
    const schema = body.schema && typeof body.schema === "object" ? body.schema : parseJson(body.schemaJson) ?? {};
    const faq = Array.isArray(body.faq) ? body.faq : parseJson(body.faqJson) ?? [];
    const breadcrumbs = Array.isArray(body.breadcrumbs) ? body.breadcrumbs : parseJson(body.breadcrumbJson) ?? [];
    const hreflang = body.hreflang && typeof body.hreflang === "object" ? body.hreflang : parseJson(body.hreflangJson) ?? {};

    if (!Array.isArray(faq)) return res.status(400).json({ success: false, error: "FAQ must be an array." });
    if (!Array.isArray(breadcrumbs)) return res.status(400).json({ success: false, error: "Breadcrumbs must be an array." });
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return res.status(400).json({ success: false, error: "Schema must be an object." });
    if (!hreflang || typeof hreflang !== "object" || Array.isArray(hreflang)) return res.status(400).json({ success: false, error: "hreflang must be an object." });

    const seoEntryPayload = [
      path,
      pageType,
      nullableText(body.entityType, 100),
      positiveId(body.entityId),
      positiveId(body.countryId),
      positiveId(body.stateId),
      positiveId(body.districtId),
      positiveId(body.cityId),
      positiveId(body.areaId),
      enumValue(body.locationLevel, LOCATION_LEVELS),
      title,
      description,
      h1,
      nullableText(body.introContent, MAX_BLOCK_CONTENT),
      nullableText(body.bodyContent, MAX_BLOCK_CONTENT),
      jsonArrayText(faq),
      jsonArrayText(breadcrumbs),
      canonical,
      boolInt(body.canonicalLocked),
      nullableText(body.ogTitle ?? title, 250),
      nullableText(body.ogDescription ?? description, 5000),
      nullableText(body.ogImage, 2000),
      nullableText(body.twitterCard ?? "summary_large_image", 100),
      nullableText(body.twitterTitle ?? title, 250),
      nullableText(body.twitterDescription ?? description, 5000),
      nullableText(body.twitterImage, 2000),
      robots,
      jsonObjectText(schema),
      nullableText(body.schemaType, 100),
      jsonObjectText(hreflang),
      nullableText(body.imageAlt, 500),
      nullableText(body.focusKeyword, 250),
      nullableText(body.area, 250),
      nullableText(body.locationLabel, 500),
      jsonArrayText(body.keywords),
      jsonArrayText(body.primaryKeywords),
      jsonArrayText(body.locationKeywords),
      jsonArrayText(body.longTailKeywords),
      jsonArrayText(body.searchIntents),
      isIndexable,
      isIndexable ? null : nullableText(body.noindexReason, 1000),
      body.qualityScore === undefined ? null : integerInRange(body.qualityScore, 0, 0, 100),
      sha256(JSON.stringify({path,title,description,h1,canonical,schema,faq,breadcrumbs})),
      Number(body.sitemapPriority ?? 0.6),
      nullableText(body.sitemapChangefreq ?? "weekly", 50),
      nullableText(body.lastmodAt ?? nowIso(), 80),
      isIndexable ? nowIso() : null,
      status,
    ];

    const result = db.prepare(`
      INSERT INTO seo_entries (
        path,page_type,entity_type,entity_id,country_id,state_id,district_id,city_id,area_id,location_level,
        seo_title,meta_description,h1,intro_content,body_content,faq_json,breadcrumb_json,canonical_url,
        canonical_locked,og_title,og_description,og_image,twitter_card,twitter_title,twitter_description,twitter_image,
        robots,schema_json,schema_type,hreflang_json,image_alt,focus_keyword,area,location_label,
        keywords_json,primary_keywords_json,location_keywords_json,long_tail_keywords_json,search_intents_json,
        is_indexable,noindex_reason,quality_score,content_hash,sitemap_priority,sitemap_changefreq,lastmod_at,published_at,status
      ) VALUES (${seoEntryPayload.map(() => "?").join(",")})
    `).run(...seoEntryPayload);

    const id = Number(result.lastInsertRowid);
    const entry = getSeoEntryById(id);
    audit(req, "admin.seo_entry.created", "seo_entry", id, null, entry);
    res.status(201).json({ success: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/must be|cannot|Invalid|already exists|FAQ|Breadcrumbs|Schema|hreflang|canonicalUrl/i.test(message)) {
      return res.status(400).json({ success: false, error: message });
    }
    console.error("SEO entry create error:", error);
    res.status(500).json({ success: false, error: "Unable to create SEO entry." });
  }
});

router.patch("/entries/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid SEO entry id." });
    const old = getSeoEntryById(id);
    if (!old) return res.status(404).json({ success: false, error: "SEO entry not found." });
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as SqlRow;

    if (Object.prototype.hasOwnProperty.call(body, "canonicalUrl") && Number(old.canonical_locked ?? 0) === 1 && !boolInt(body.forceCanonicalChange)) {
      const incoming = normalizeExternalOrPath(body.canonicalUrl) ?? normalizePath(body.canonicalUrl);
      const current = nullableText(old.canonical_url, 2000) ?? normalizePath(old.path);
      if (incoming !== current) return res.status(409).json({ success: false, error: "Canonical URL is locked. Send forceCanonicalChange=true to change it." });
    }

    const result = applySeoEntryInput(old, body);
    if (!result.updates.length) return res.status(400).json({ success: false, error: "No supported SEO entry fields were supplied." });

    result.values.push(id);
    db.prepare(`UPDATE seo_entries SET ${result.updates.join(", ")} WHERE id=?`).run(...result.values);

    let updated = getSeoEntryById(id);
    if (updated && Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = String(updated.status);
      if (status !== "published" || Number(updated.is_indexable ?? 0) !== 1) {
        db.prepare(`UPDATE seo_entries SET is_indexable=0, robots=?, published_at=NULL WHERE id=? AND status<>'published'`).run(NOINDEX_ROBOTS, id);
      } else {
        db.prepare(`UPDATE seo_entries SET robots=?, published_at=COALESCE(published_at,CURRENT_TIMESTAMP) WHERE id=?`).run(INDEXABLE_ROBOTS, id);
      }
      updated = getSeoEntryById(id);
    }

    audit(req, "admin.seo_entry.updated", "seo_entry", id, old, updated);
    res.json({ success: true, entry: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/must be|cannot|Invalid|locked|FAQ|Breadcrumbs|Schema|hreflang|canonicalUrl/i.test(message)) {
      return res.status(400).json({ success: false, error: message });
    }
    console.error("SEO entry update error:", error);
    res.status(500).json({ success: false, error: "Unable to update SEO entry." });
  }
});

router.post("/entries/:id/publish", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid SEO entry id." });
    const old = getSeoEntryById(id);
    if (!old) return res.status(404).json({ success: false, error: "SEO entry not found." });

    const path = normalizePath(old.path);
    const pathError = validateSeoPath(path);
    if (pathError) return res.status(400).json({ success: false, error: pathError });

    const title = text(old.seo_title, 250);
    const description = text(old.meta_description, 5000);
    const h1 = text(old.h1, 500);
    if (!title || !description || !h1) {
      return res.status(400).json({ success: false, error: "SEO entry requires title, meta description and H1 before publishing." });
    }

    const existingCanonical = nullableText(old.canonical_url, 2000) ?? path;
    db.prepare(`
      UPDATE seo_entries
      SET status='published', is_indexable=1, robots=?, noindex_reason=NULL,
          canonical_url=?, published_at=COALESCE(published_at,CURRENT_TIMESTAMP),
          lastmod_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(INDEXABLE_ROBOTS, existingCanonical, id);

    const updated = getSeoEntryById(id);
    audit(req, "admin.seo_entry.published", "seo_entry", id, old, updated);
    res.json({ success: true, entry: updated });
  } catch (error) {
    console.error("SEO entry publish error:", error);
    res.status(500).json({ success: false, error: "Unable to publish SEO entry." });
  }
});

router.post("/entries/:id/unpublish", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid SEO entry id." });
    const old = getSeoEntryById(id);
    if (!old) return res.status(404).json({ success: false, error: "SEO entry not found." });

    db.prepare(`
      UPDATE seo_entries
      SET status='unpublished', is_indexable=0, robots=?, noindex_reason=?, published_at=NULL,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(NOINDEX_ROBOTS, "Manually unpublished by Super Admin.", id);

    if (tableExists("seo_location_pages")) {
      db.prepare(`UPDATE seo_location_pages SET status='unpublished', is_indexable=0, updated_at=CURRENT_TIMESTAMP WHERE seo_entry_id=?`).run(id);
    }

    const updated = getSeoEntryById(id);
    audit(req, "admin.seo_entry.unpublished", "seo_entry", id, old, updated);
    res.json({ success: true, entry: updated });
  } catch (error) {
    console.error("SEO entry unpublish error:", error);
    res.status(500).json({ success: false, error: "Unable to unpublish SEO entry." });
  }
});

router.delete("/entries/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid SEO entry id." });
    const old = getSeoEntryById(id);
    if (!old) return res.status(404).json({ success: false, error: "SEO entry not found." });

    db.prepare(`UPDATE seo_entries SET status='unpublished', is_indexable=0, robots=?, noindex_reason=?, published_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(NOINDEX_ROBOTS, "Soft-deleted by Super Admin.", id);
    audit(req, "admin.seo_entry.soft_deleted", "seo_entry", id, old, getSeoEntryById(id));
    res.json({ success: true, deleted: true, entry: getSeoEntryById(id) });
  } catch (error) {
    console.error("SEO entry delete error:", error);
    res.status(500).json({ success: false, error: "Unable to remove SEO entry." });
  }
});

router.post("/entries/:id/blocks", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const entryId = positiveId(req.params.id);
    if (!entryId) return res.status(400).json({ success: false, error: "Invalid SEO entry id." });
    if (!getSeoEntryById(entryId)) return res.status(404).json({ success: false, error: "SEO entry not found." });
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as SqlRow;
    const blockKey = text(body.blockKey ?? body.key, 150);
    const blockType = enumValue(body.blockType ?? body.type, BLOCK_TYPES);
    const heading = nullableText(body.heading, 500);
    const content = nullableText(body.content, MAX_BLOCK_CONTENT);
    if (!blockKey) return res.status(400).json({ success: false, error: "blockKey is required." });
    if (!blockType) return res.status(400).json({ success: false, error: "Invalid blockType." });

    const result = db.prepare(`
      INSERT INTO seo_content_blocks (
        seo_entry_id,block_key,block_type,heading,content,content_json,sort_order,is_active,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(seo_entry_id,block_key) DO UPDATE SET
        block_type=excluded.block_type,
        heading=excluded.heading,
        content=excluded.content,
        content_json=excluded.content_json,
        sort_order=excluded.sort_order,
        is_active=excluded.is_active,
        updated_at=CURRENT_TIMESTAMP
    `).run(
      entryId,
      blockKey,
      blockType,
      heading,
      content,
      jsonObjectText(body.contentJson ?? body.data ?? {}, "{}"),
      integerInRange(body.sortOrder, 0, 0, 100000),
    );

    const block = db.prepare(`SELECT * FROM seo_content_blocks WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    audit(req, "admin.seo_block.upserted", "seo_content_block", Number((block as SqlRow | undefined)?.id ?? 0), null, block);
    res.status(201).json({ success: true, block });
  } catch (error) {
    console.error("SEO block upsert error:", error);
    res.status(500).json({ success: false, error: "Unable to save SEO content block." });
  }
});

router.patch("/blocks/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid SEO block id." });
    const old = tableExists("seo_content_blocks") ? (db.prepare(`SELECT * FROM seo_content_blocks WHERE id=? LIMIT 1`).get(id) as SqlRow | undefined) : undefined;
    if (!old) return res.status(404).json({ success: false, error: "SEO block not found." });
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as SqlRow;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (Object.prototype.hasOwnProperty.call(body,"blockKey")) { const key=text(body.blockKey,150); if(!key)return res.status(400).json({success:false,error:"blockKey cannot be empty."}); updates.push("block_key=?"); values.push(key); }
    if (Object.prototype.hasOwnProperty.call(body,"blockType")) { const t=enumValue(body.blockType,BLOCK_TYPES); if(!t)return res.status(400).json({success:false,error:"Invalid blockType."}); updates.push("block_type=?"); values.push(t); }
    if (Object.prototype.hasOwnProperty.call(body,"heading")) { updates.push("heading=?"); values.push(nullableText(body.heading,500)); }
    if (Object.prototype.hasOwnProperty.call(body,"content")) { updates.push("content=?"); values.push(nullableText(body.content,MAX_BLOCK_CONTENT)); }
    if (Object.prototype.hasOwnProperty.call(body,"contentJson") || Object.prototype.hasOwnProperty.call(body,"data")) { updates.push("content_json=?"); values.push(jsonObjectText(body.contentJson ?? body.data, "{}")); }
    if (Object.prototype.hasOwnProperty.call(body,"sortOrder")) { updates.push("sort_order=?"); values.push(integerInRange(body.sortOrder, Number(old.sort_order ?? 0), 0, 100000)); }
    if (Object.prototype.hasOwnProperty.call(body,"isActive")) { updates.push("is_active=?"); values.push(boolInt(body.isActive)); }
    if (!updates.length)return res.status(400).json({success:false,error:"No supported SEO block fields were supplied."});
    updates.push("updated_at=CURRENT_TIMESTAMP");
    values.push(id);
    db.prepare(`UPDATE seo_content_blocks SET ${updates.join(",")} WHERE id=?`).run(...values);
    const updated = db.prepare(`SELECT * FROM seo_content_blocks WHERE id=? LIMIT 1`).get(id);
    audit(req,"admin.seo_block.updated","seo_content_block",id,old,updated);
    res.json({success:true,block:updated});
  } catch(error){
    console.error("SEO block update error:",error);
    res.status(500).json({success:false,error:"Unable to update SEO content block."});
  }
});

router.delete("/blocks/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id=positiveId(req.params.id);
    if(!id)return res.status(400).json({success:false,error:"Invalid SEO block id."});
    const old=tableExists("seo_content_blocks")?(db.prepare(`SELECT * FROM seo_content_blocks WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined):undefined;
    if(!old)return res.status(404).json({success:false,error:"SEO block not found."});
    db.prepare(`UPDATE seo_content_blocks SET is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    audit(req,"admin.seo_block.deactivated","seo_content_block",id,old,db.prepare(`SELECT * FROM seo_content_blocks WHERE id=? LIMIT 1`).get(id));
    res.json({success:true,deleted:true});
  }catch(error){console.error("SEO block delete error:",error);res.status(500).json({success:false,error:"Unable to remove SEO content block."});}
});

router.post("/redirects", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const sourcePath=normalizePath(body.sourcePath??body.fromPath??body.from);
    const target=normalizeExternalOrPath(body.targetPath??body.toPath??body.to);
    if(!sourcePath)return res.status(400).json({success:false,error:"sourcePath is required."});
    const pathError=validateSeoPath(sourcePath);
    if(pathError)return res.status(400).json({success:false,error:pathError});
    if(!target)return res.status(400).json({success:false,error:"targetPath must be a valid path or URL."});
    if(sourcePath===normalizePath(target))return res.status(400).json({success:false,error:"Redirect cannot point to itself."});
    const statusCode=integerInRange(body.statusCode,301,301,308);
    if(!(REDIRECT_CODES as readonly number[]).includes(statusCode))return res.status(400).json({success:false,error:"Invalid redirect status code."});
    const result=db.prepare(`
      INSERT INTO seo_redirects(source_path,target_path,status_code,is_active,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(source_path) DO UPDATE SET target_path=excluded.target_path,status_code=excluded.status_code,is_active=excluded.is_active,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP
    `).run(sourcePath,target,statusCode,boolInt(body.isActive,true),nullableText(body.notes??body.note,1000));
    const redirect=db.prepare(`SELECT * FROM seo_redirects WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    audit(req,"admin.seo_redirect.upserted","seo_redirect",Number((redirect as SqlRow|undefined)?.id??0),null,redirect);
    res.status(201).json({success:true,redirect});
  }catch(error){console.error("SEO redirect create error:",error);res.status(500).json({success:false,error:"Unable to save SEO redirect."});}
});

router.patch("/redirects/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id=positiveId(req.params.id); if(!id)return res.status(400).json({success:false,error:"Invalid redirect id."});
    const old=tableExists("seo_redirects")?(db.prepare(`SELECT * FROM seo_redirects WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined):undefined;
    if(!old)return res.status(404).json({success:false,error:"SEO redirect not found."});
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const updates:string[]=[]; const values:unknown[]=[];
    if(Object.prototype.hasOwnProperty.call(body,"sourcePath")){const p=normalizePath(body.sourcePath);const e=validateSeoPath(p);if(e)return res.status(400).json({success:false,error:e});updates.push("source_path=?");values.push(p);}
    if(Object.prototype.hasOwnProperty.call(body,"targetPath")){const t=normalizeExternalOrPath(body.targetPath);if(!t)return res.status(400).json({success:false,error:"Invalid targetPath."});updates.push("target_path=?");values.push(t);}
    if(Object.prototype.hasOwnProperty.call(body,"statusCode")){const c=integerInRange(body.statusCode,Number(old.status_code??301),301,308);if(!(REDIRECT_CODES as readonly number[]).includes(c))return res.status(400).json({success:false,error:"Invalid redirect status code."});updates.push("status_code=?");values.push(c);}
    if(Object.prototype.hasOwnProperty.call(body,"isActive")){updates.push("is_active=?");values.push(boolInt(body.isActive));}
    if(Object.prototype.hasOwnProperty.call(body,"notes")||Object.prototype.hasOwnProperty.call(body,"note")){updates.push("notes=?");values.push(nullableText(body.notes??body.note,1000));}
    if(!updates.length)return res.status(400).json({success:false,error:"No supported redirect fields were supplied."});
    updates.push("updated_at=CURRENT_TIMESTAMP");values.push(id);
    db.prepare(`UPDATE seo_redirects SET ${updates.join(",")} WHERE id=?`).run(...values);
    const updated=db.prepare(`SELECT * FROM seo_redirects WHERE id=? LIMIT 1`).get(id);
    audit(req,"admin.seo_redirect.updated","seo_redirect",id,old,updated);
    res.json({success:true,redirect:updated});
  }catch(error){console.error("SEO redirect update error:",error);res.status(500).json({success:false,error:"Unable to update SEO redirect."});}
});

router.delete("/redirects/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id=positiveId(req.params.id); if(!id)return res.status(400).json({success:false,error:"Invalid redirect id."});
    const old=tableExists("seo_redirects")?(db.prepare(`SELECT * FROM seo_redirects WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined):undefined;
    if(!old)return res.status(404).json({success:false,error:"SEO redirect not found."});
    db.prepare(`DELETE FROM seo_redirects WHERE id=?`).run(id);
    audit(req,"admin.seo_redirect.deleted","seo_redirect",id,old,null);
    res.json({success:true,deleted:true});
  }catch(error){console.error("SEO redirect delete error:",error);res.status(500).json({success:false,error:"Unable to delete SEO redirect."});}
});

router.patch("/settings", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const key=text(body.settingKey??body.key,150);
    if(!key)return res.status(400).json({success:false,error:"settingKey is required."});
    const old=getSeoSetting(key);
    if(!old)return res.status(404).json({success:false,error:"SEO setting not found."});
    const supplied=Object.prototype.hasOwnProperty.call(body,"value")||Object.prototype.hasOwnProperty.call(body,"settingValue");
    if(!supplied)return res.status(400).json({success:false,error:"value is required."});
    const type=enumValue(old.setting_type,SETTING_TYPES)??"string";
    const raw=body.value??body.settingValue;
    let value:string;
    if(type==="json") value=jsonText(raw,"{}");
    else if(type==="number"){const n=Number(raw);if(!Number.isFinite(n))return res.status(400).json({success:false,error:"Setting value must be a number."});value=String(n);}
    else if(type==="boolean") value=boolInt(raw)?"true":"false";
    else value=text(raw,5000);
    db.prepare(`UPDATE seo_settings SET setting_value=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(value,Number(old.id));
    const updated=getSeoSetting(key);
    audit(req,"admin.seo_setting.updated","seo_setting",Number(old.id),old,updated);
    res.json({success:true,setting:updated});
  }catch(error){console.error("SEO setting update error:",error);res.status(500).json({success:false,error:"Unable to update SEO setting."});}
});

router.post("/settings", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const key=text(body.settingKey??body.key,150); if(!key)return res.status(400).json({success:false,error:"settingKey is required."});
    const type=enumValue(body.settingType??body.type,SETTING_TYPES)??"string";
    const description=nullableText(body.description,1000);
    const isPublic=boolInt(body.isPublic);
    const value=type==="json"?jsonText(body.value??body.settingValue,"{}"):type==="number"?String(Number(body.value??body.settingValue??0)):type==="boolean"?(boolInt(body.value??body.settingValue)?"true":"false"):text(body.value??body.settingValue,5000);
    if(tableExists("seo_settings")){
      const existing=getSeoSetting(key); if(existing)return res.status(409).json({success:false,error:"SEO setting already exists."});
    }
    const result=db.prepare(`INSERT INTO seo_settings(setting_key,setting_value,setting_type,description,is_public,created_at,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(key,value,type,description,isPublic);
    const setting=db.prepare(`SELECT * FROM seo_settings WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    audit(req,"admin.seo_setting.created","seo_setting",Number((setting as SqlRow|undefined)?.id??0),null,setting);
    res.status(201).json({success:true,setting});
  }catch(error){console.error("SEO setting create error:",error);res.status(500).json({success:false,error:"Unable to create SEO setting."});}
});

router.post("/templates", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const key=text(body.templateKey??body.key,150); if(!key)return res.status(400).json({success:false,error:"templateKey is required."});
    const pageType=text(body.pageType,100)||"location_listing";
    const catalogType=enumValue(body.catalogType,CATALOG_TYPES);
    const locationLevel=enumValue(body.locationLevel,LOCATION_LEVELS);
    const titleTemplate=text(body.titleTemplate,250); if(!titleTemplate)return res.status(400).json({success:false,error:"titleTemplate is required."});
    const existing=db.prepare(`SELECT id FROM seo_templates WHERE template_key=? LIMIT 1`).get(key); if(existing)return res.status(409).json({success:false,error:"SEO template already exists."});
    const result=db.prepare(`
      INSERT INTO seo_templates(
        template_key,page_type,catalog_type,location_level,slug_pattern,canonical_pattern,min_listings_to_index,
        title_template,meta_template,h1_template,intro_template,faq_template_json,schema_template_json,
        internal_links_template_json,breadcrumb_template_json,image_alt_template,is_active,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).run(
      key,pageType,catalogType,locationLevel,nullableText(body.slugPattern,500),nullableText(body.canonicalPattern,500),integerInRange(body.minListingsToIndex,1,0,100000),
      titleTemplate,nullableText(body.metaTemplate,5000),nullableText(body.h1Template,500),nullableText(body.introTemplate,MAX_BLOCK_CONTENT),
      jsonArrayText(body.faqTemplateJson??body.faqTemplate),jsonObjectText(body.schemaTemplateJson??body.schemaTemplate,"{}"),jsonArrayText(body.internalLinksTemplateJson??body.internalLinks),jsonArrayText(body.breadcrumbTemplateJson??body.breadcrumbTemplate),nullableText(body.imageAltTemplate,500)
    );
    const template=db.prepare(`SELECT * FROM seo_templates WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    audit(req,"admin.seo_template.created","seo_template",Number((template as SqlRow|undefined)?.id??0),null,template);
    res.status(201).json({success:true,template});
  }catch(error){console.error("SEO template create error:",error);res.status(500).json({success:false,error:"Unable to create SEO template."});}
});

router.patch("/templates/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const id=positiveId(req.params.id); if(!id)return res.status(400).json({success:false,error:"Invalid template id."});
    const old=db.prepare(`SELECT * FROM seo_templates WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined; if(!old)return res.status(404).json({success:false,error:"SEO template not found."});
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const updates:string[]=[];const values:unknown[]=[];
    const textFields:Array<[string,string,number]>=[
      ["template_key","templateKey",150],["page_type","pageType",100],["slug_pattern","slugPattern",500],["canonical_pattern","canonicalPattern",500],
      ["title_template","titleTemplate",250],["meta_template","metaTemplate",5000],["h1_template","h1Template",500],["intro_template","introTemplate",MAX_BLOCK_CONTENT],["image_alt_template","imageAltTemplate",500]
    ];
    for(const [c,k,m] of textFields)if(Object.prototype.hasOwnProperty.call(body,k)){const v=text(body[k],m);if(c==="title_template"&&!v)return res.status(400).json({success:false,error:"titleTemplate cannot be empty."});updates.push(`${c}=?`);values.push(v||null);}
    if(Object.prototype.hasOwnProperty.call(body,"catalogType")){updates.push("catalog_type=?");values.push(enumValue(body.catalogType,CATALOG_TYPES));}
    if(Object.prototype.hasOwnProperty.call(body,"locationLevel")){const v=enumValue(body.locationLevel,LOCATION_LEVELS);if(!v)return res.status(400).json({success:false,error:"Invalid locationLevel."});updates.push("location_level=?");values.push(v);}
    if(Object.prototype.hasOwnProperty.call(body,"minListingsToIndex")){updates.push("min_listings_to_index=?");values.push(integerInRange(body.minListingsToIndex,Number(old.min_listings_to_index??1),0,100000));}
    if(Object.prototype.hasOwnProperty.call(body,"faqTemplate")||Object.prototype.hasOwnProperty.call(body,"faqTemplateJson")){updates.push("faq_template_json=?");values.push(jsonArrayText(body.faqTemplateJson??body.faqTemplate));}
    if(Object.prototype.hasOwnProperty.call(body,"schemaTemplate")||Object.prototype.hasOwnProperty.call(body,"schemaTemplateJson")){updates.push("schema_template_json=?");values.push(jsonObjectText(body.schemaTemplateJson??body.schemaTemplate,"{}"));}
    if(Object.prototype.hasOwnProperty.call(body,"internalLinksTemplate")||Object.prototype.hasOwnProperty.call(body,"internalLinksTemplateJson")){updates.push("internal_links_template_json=?");values.push(jsonArrayText(body.internalLinksTemplateJson??body.internalLinksTemplate));}
    if(Object.prototype.hasOwnProperty.call(body,"breadcrumbTemplate")||Object.prototype.hasOwnProperty.call(body,"breadcrumbTemplateJson")){updates.push("breadcrumb_template_json=?");values.push(jsonArrayText(body.breadcrumbTemplateJson??body.breadcrumbTemplate));}
    if(Object.prototype.hasOwnProperty.call(body,"isActive")){updates.push("is_active=?");values.push(boolInt(body.isActive));}
    if(!updates.length)return res.status(400).json({success:false,error:"No supported SEO template fields were supplied."});
    updates.push("updated_at=CURRENT_TIMESTAMP");values.push(id);
    db.prepare(`UPDATE seo_templates SET ${updates.join(",")} WHERE id=?`).run(...values);
    const updated=db.prepare(`SELECT * FROM seo_templates WHERE id=? LIMIT 1`).get(id);
    audit(req,"admin.seo_template.updated","seo_template",id,old,updated);
    res.json({success:true,template:updated});
  }catch(error){console.error("SEO template update error:",error);res.status(500).json({success:false,error:"Unable to update SEO template."});}
});

router.delete("/templates/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid template id."});
    const old=db.prepare(`SELECT * FROM seo_templates WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return res.status(404).json({success:false,error:"SEO template not found."});
    db.prepare(`UPDATE seo_templates SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    audit(req,"admin.seo_template.deactivated","seo_template",id,old,db.prepare(`SELECT * FROM seo_templates WHERE id=? LIMIT 1`).get(id));
    res.json({success:true,deleted:true});
  }catch(error){console.error("SEO template delete error:",error);res.status(500).json({success:false,error:"Unable to deactivate SEO template."});}
});

router.post("/location-pages/generate", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const locationId=positiveId(body.locationId);if(!locationId)return res.status(400).json({success:false,error:"locationId is required."});
    const catalogType=enumValue(body.catalogType,CATALOG_TYPES);if(!catalogType)return res.status(400).json({success:false,error:"catalogType is required."});
    const location=tableExists("locations")?(db.prepare(`SELECT * FROM locations WHERE id=? LIMIT 1`).get(locationId) as SqlRow|undefined):undefined;
    if(!location)return res.status(404).json({success:false,error:"Location not found."});
    if(Number(location.seo_enabled??1)!==1)return res.status(400).json({success:false,error:"SEO is disabled for this location."});
    const locationLevel=enumValue(body.locationLevel??location.type,LOCATION_LEVELS);if(!locationLevel)return res.status(400).json({success:false,error:"Invalid location level."});
    const template=seoTemplateForLocation(catalogType,locationLevel,positiveId(body.templateId),text(body.templateKey,150)||null);if(!template)return res.status(404).json({success:false,error:"No active SEO template found."});

    let generatedResult:{seoEntry:SqlRow|null;page:SqlRow|null;listingCount:number;indexable:boolean;message:string} = {seoEntry:null,page:null,listingCount:0,indexable:false,message:"Generation not completed."};
    let runResult:"success"|"skipped"|"failed"="success";
    let runMessage="";
    try{
      generatedResult=upsertGeneratedLocationPage({locationId,catalogType,locationLevel,template,forcePublish:boolInt(body.forcePublish)===1});
      runMessage=generatedResult.message;
      if(!generatedResult.seoEntry||!generatedResult.page)runResult="failed";
      else if(!generatedResult.indexable)runResult="skipped";
    }catch(error){
      runResult="failed";runMessage=error instanceof Error?error.message:"Generation failed.";
      throw error;
    }finally{
      if(tableExists("seo_generation_runs")){
        db.prepare(`
          INSERT INTO seo_generation_runs(
            seo_location_page_id,seo_entry_id,run_type,template_id,generation_version,listing_count,content_hash,result,message,metadata_json,started_at,finished_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).run(
          generatedResult?.page?.id ?? null,
          generatedResult?.seoEntry?.id ?? null,
          text(body.runType,30) || "generate",
          template.id,
          Number(generatedResult?.page?.generation_version ?? 1),
          generatedResult?.listingCount ?? 0,
          generatedResult?.page?.content_hash ?? null,
          runResult,
          runMessage,
          jsonText({locationId,catalogType,locationLevel}),
        );
      }
    }

    const generatedEntry=generatedResult.seoEntry;
    const generatedPage=generatedResult.page;
    audit(req,"admin.seo_location_page.generated","seo_location_page",Number(generatedPage?.id??0),null,{entry:generatedEntry,page:generatedPage});
    res.status(201).json({success:true,...generatedResult});
  }catch(error){
    console.error("SEO location page generation error:",error);
    res.status(500).json({success:false,error:"Unable to generate SEO location page."});
  }
});

router.post("/location-pages/rebuild", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try {
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const maxLocations=integerInRange(body.maxLocations,200,1,2000);
    const catalogType=enumValue(body.catalogType,CATALOG_TYPES);
    const locationLevel=enumValue(body.locationLevel,LOCATION_LEVELS);
    const where=["status='active'","seo_enabled=1"];
    const params:unknown[]=[];
    if(locationLevel){where.push("type=?");params.push(locationLevel);}else{where.push("type IN ('country','state','district','city')");}
    if(positiveId(body.locationId)){where.push("id=?");params.push(positiveId(body.locationId));}
    const locations=db.prepare(`SELECT id,type FROM locations WHERE ${where.join(" AND ")} ORDER BY sort_order ASC,id ASC LIMIT ?`).all(...params,maxLocations) as Array<{id:number;type:LocationLevel}>;
    const catalogs:CatalogType[]=catalogType?[catalogType]:["temple","pandit","puja_service","ashram","yatra","spiritual_place","event","course"];
    const results:SqlRow[]=[];
    for(const loc of locations){
      for(const catalog of catalogs){
        const template=seoTemplateForLocation(catalog,loc.type,null,null);
        if(!template){results.push({locationId:loc.id,catalogType:catalog,locationLevel:loc.type,status:"skipped",message:"No active template."});continue;}
        try{const generated=upsertGeneratedLocationPage({locationId:loc.id,catalogType:catalog,locationLevel:loc.type,template});results.push({locationId:loc.id,catalogType:catalog,locationLevel:loc.type,status:generated.indexable?"published":"noindex",listingCount:generated.listingCount,message:generated.message,pageId:generated.page?.id??null});}
        catch(error){results.push({locationId:loc.id,catalogType:catalog,locationLevel:loc.type,status:"failed",message:error instanceof Error?error.message:"Generation failed."});}
      }
    }
    audit(req,"admin.seo_location_pages.rebuilt","seo_location_pages",null,null,{processed:results.length,locations:locations.length});
    res.json({success:true,processed:results.length,locations:locations.length,results});
  }catch(error){console.error("SEO location rebuild error:",error);res.status(500).json({success:false,error:"Unable to rebuild SEO location pages."});}
});

router.patch("/location-pages/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid location page id."});
    const old=db.prepare(`SELECT * FROM seo_location_pages WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return res.status(404).json({success:false,error:"SEO location page not found."});
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const updates:string[]=[];const values:unknown[]=[];
    if(Object.prototype.hasOwnProperty.call(body,"isIndexable")){updates.push("is_indexable=?");values.push(boolInt(body.isIndexable));}
    if(Object.prototype.hasOwnProperty.call(body,"status")){const s=enumValue(body.status,["draft","published","unpublished"] as const);if(!s)return res.status(400).json({success:false,error:"Invalid location page status."});updates.push("status=?");values.push(s);}
    if(Object.prototype.hasOwnProperty.call(body,"priority")){updates.push("priority=?");values.push(integerInRange(body.priority,0,0,100000));}
    if(Object.prototype.hasOwnProperty.call(body,"minimumListingsToIndex")){updates.push("minimum_listings_to_index=?");values.push(integerInRange(body.minimumListingsToIndex,Number(old.minimum_listings_to_index??3),0,100000));}
    if(Object.prototype.hasOwnProperty.call(body,"noindexReason")){updates.push("noindex_reason=?");values.push(nullableText(body.noindexReason,1000));}
    if(Object.prototype.hasOwnProperty.call(body,"generatedTitle")){updates.push("generated_title=?");values.push(nullableText(body.generatedTitle,250));}
    if(Object.prototype.hasOwnProperty.call(body,"generatedDescription")){updates.push("generated_description=?");values.push(nullableText(body.generatedDescription,5000));}
    if(Object.prototype.hasOwnProperty.call(body,"generatedH1")){updates.push("generated_h1=?");values.push(nullableText(body.generatedH1,500));}
    if(Object.prototype.hasOwnProperty.call(body,"generatedIntro")){updates.push("generated_intro=?");values.push(nullableText(body.generatedIntro,MAX_BLOCK_CONTENT));}
    if(Object.prototype.hasOwnProperty.call(body,"generatedBody")){updates.push("generated_body=?");values.push(nullableText(body.generatedBody,MAX_BLOCK_CONTENT));}
    if(Object.prototype.hasOwnProperty.call(body,"sitemapPriority")){const p=Number(body.sitemapPriority);if(!Number.isFinite(p)||p<0||p>1)return res.status(400).json({success:false,error:"Invalid sitemapPriority."});updates.push("sitemap_priority=?");values.push(p);}
    if(Object.prototype.hasOwnProperty.call(body,"sitemapChangefreq")){updates.push("sitemap_changefreq=?");values.push(nullableText(body.sitemapChangefreq,50));}
    if(!updates.length)return res.status(400).json({success:false,error:"No supported location page fields were supplied."});
    updates.push("updated_at=CURRENT_TIMESTAMP");values.push(id);
    db.prepare(`UPDATE seo_location_pages SET ${updates.join(",")} WHERE id=?`).run(...values);
    const updated=db.prepare(`SELECT * FROM seo_location_pages WHERE id=? LIMIT 1`).get(id) as SqlRow | undefined;
    if(updated && Number(updated.is_indexable??0)===1 && String(updated.status)==="published"){
      db.prepare(`UPDATE seo_entries SET is_indexable=1,status='published',robots=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(INDEXABLE_ROBOTS,positiveId(updated.seo_entry_id));
    }else if(updated){
      db.prepare(`UPDATE seo_entries SET is_indexable=0,robots=?,status=CASE WHEN status='published' THEN 'unpublished' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(NOINDEX_ROBOTS,positiveId(updated.seo_entry_id));
    }
    audit(req,"admin.seo_location_page.updated","seo_location_page",id,old,updated);
    res.json({success:true,locationPage:updated,seoEntry:positiveId(updated?.seo_entry_id)?getSeoEntryById(Number(updated?.seo_entry_id)):null});
  }catch(error){console.error("SEO location page update error:",error);res.status(500).json({success:false,error:"Unable to update SEO location page."});}
});

router.post("/keywords", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const keyword=text(body.keyword,250);if(!keyword)return res.status(400).json({success:false,error:"keyword is required."});
    const normalized=keyword.toLowerCase().replace(/\s+/g," ").trim();
    const language=text(body.language??"en",30).toLowerCase()||"en";
    const source=enumValue(body.source,["manual","generated","imported","search_console","analytics"] as const)??"manual";
    const keywordType=enumValue(body.keywordType,["primary","secondary","location","long_tail","question","brand"] as const)??"secondary";
    const result=db.prepare(`
      INSERT INTO seo_keywords(
        keyword,keyword_normalized,cluster_key,source,language,intent,keyword_type,country_id,state_id,district_id,city_id,area_id,entity_type,entity_id,seo_entry_id,search_volume,competition,cpc,is_active,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(keyword_normalized,language,entity_type,entity_id,country_id,state_id,district_id,city_id,area_id) DO UPDATE SET
        keyword=excluded.keyword,cluster_key=excluded.cluster_key,source=excluded.source,intent=excluded.intent,keyword_type=excluded.keyword_type,
        search_volume=excluded.search_volume,competition=excluded.competition,cpc=excluded.cpc,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP
    `).run(
      keyword,normalized,nullableText(body.clusterKey,150),source,language,nullableText(body.intent,100),keywordType,
      positiveId(body.countryId),positiveId(body.stateId),positiveId(body.districtId),positiveId(body.cityId),positiveId(body.areaId),
      nullableText(body.entityType,100),positiveId(body.entityId),positiveId(body.seoEntryId),positiveId(body.searchVolume),body.competition===undefined?null:Number(body.competition),body.cpc===undefined?null:Number(body.cpc),boolInt(body.isActive,true),
    );
    const keyRow=db.prepare(`SELECT * FROM seo_keywords WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid));
    audit(req,"admin.seo_keyword.upserted","seo_keyword",Number((keyRow as SqlRow|undefined)?.id??0),null,keyRow);
    res.status(201).json({success:true,keyword:keyRow});
  }catch(error){console.error("SEO keyword upsert error:",error);res.status(500).json({success:false,error:"Unable to save SEO keyword."});}
});

router.patch("/keywords/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid keyword id."});
    const old=db.prepare(`SELECT * FROM seo_keywords WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return res.status(404).json({success:false,error:"SEO keyword not found."});
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;const updates:string[]=[];const values:unknown[]=[];
    const textFields:Array<[string,string,number]>=[["keyword","keyword",250],["cluster_key","clusterKey",150],["intent","intent",100],["language","language",30]];
    for(const [c,k,m] of textFields)if(Object.prototype.hasOwnProperty.call(body,k)){const v=text(body[k],m);if(c==="keyword"&&!v)return res.status(400).json({success:false,error:"keyword cannot be empty."});updates.push(`${c}=?`);values.push(v||null);}
    if(Object.prototype.hasOwnProperty.call(body,"keyword"))updates.push("keyword_normalized=?"),values.push(text(body.keyword,250).toLowerCase().replace(/\s+/g," ").trim());
    if(Object.prototype.hasOwnProperty.call(body,"source")){const v=enumValue(body.source,["manual","generated","imported","search_console","analytics"] as const);if(!v)return res.status(400).json({success:false,error:"Invalid keyword source."});updates.push("source=?");values.push(v);}
    if(Object.prototype.hasOwnProperty.call(body,"keywordType")){const v=enumValue(body.keywordType,["primary","secondary","location","long_tail","question","brand"] as const);if(!v)return res.status(400).json({success:false,error:"Invalid keywordType."});updates.push("keyword_type=?");values.push(v);}
    if(Object.prototype.hasOwnProperty.call(body,"isActive")){updates.push("is_active=?");values.push(boolInt(body.isActive));}
    if(Object.prototype.hasOwnProperty.call(body,"seoEntryId")){updates.push("seo_entry_id=?");values.push(positiveId(body.seoEntryId));}
    if(Object.prototype.hasOwnProperty.call(body,"entityType")){updates.push("entity_type=?");values.push(nullableText(body.entityType,100));}
    if(Object.prototype.hasOwnProperty.call(body,"entityId")){updates.push("entity_id=?");values.push(positiveId(body.entityId));}
    if(Object.prototype.hasOwnProperty.call(body,"searchVolume")){updates.push("search_volume=?");values.push(positiveId(body.searchVolume));}
    if(Object.prototype.hasOwnProperty.call(body,"competition")){const n=Number(body.competition);if(!Number.isFinite(n))return res.status(400).json({success:false,error:"Invalid competition."});updates.push("competition=?");values.push(n);}
    if(Object.prototype.hasOwnProperty.call(body,"cpc")){const n=Number(body.cpc);if(!Number.isFinite(n))return res.status(400).json({success:false,error:"Invalid cpc."});updates.push("cpc=?");values.push(n);}
    if(!updates.length)return res.status(400).json({success:false,error:"No supported SEO keyword fields were supplied."});updates.push("updated_at=CURRENT_TIMESTAMP");values.push(id);db.prepare(`UPDATE seo_keywords SET ${updates.join(",")} WHERE id=?`).run(...values);
    const updated=db.prepare(`SELECT * FROM seo_keywords WHERE id=? LIMIT 1`).get(id);audit(req,"admin.seo_keyword.updated","seo_keyword",id,old,updated);res.json({success:true,keyword:updated});
  }catch(error){console.error("SEO keyword update error:",error);res.status(500).json({success:false,error:"Unable to update SEO keyword."});}
});

router.delete("/keywords/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid keyword id."});const old=db.prepare(`SELECT * FROM seo_keywords WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return res.status(404).json({success:false,error:"SEO keyword not found."});db.prepare(`UPDATE seo_keywords SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);audit(req,"admin.seo_keyword.deactivated","seo_keyword",id,old,db.prepare(`SELECT * FROM seo_keywords WHERE id=? LIMIT 1`).get(id));res.json({success:true,deleted:true});}catch(error){console.error("SEO keyword delete error:",error);res.status(500).json({success:false,error:"Unable to deactivate SEO keyword."});}
});

router.post("/internal-links", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;
    const fromSeoEntryId=positiveId(body.fromSeoEntryId??body.fromEntryId);if(!fromSeoEntryId)return res.status(400).json({success:false,error:"fromSeoEntryId is required."});
    if(!getSeoEntryById(fromSeoEntryId))return res.status(404).json({success:false,error:"Source SEO entry not found."});
    const toPath=normalizePath(body.toPath??body.targetPath);const anchorText=text(body.anchorText??body.anchor,250);if(!toPath||!anchorText)return res.status(400).json({success:false,error:"toPath and anchorText are required."});
    const result=db.prepare(`INSERT INTO seo_internal_links(from_seo_entry_id,to_path,anchor_text,relevance_type,sort_order,is_active,created_at) VALUES(?,?,?,?,?,1,CURRENT_TIMESTAMP)`).run(fromSeoEntryId,toPath,anchorText,nullableText(body.relevanceType,100),integerInRange(body.sortOrder,0,0,100000));
    const link=db.prepare(`SELECT * FROM seo_internal_links WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid));audit(req,"admin.seo_internal_link.created","seo_internal_link",Number((link as SqlRow|undefined)?.id??0),null,link);res.status(201).json({success:true,internalLink:link});
  }catch(error){console.error("SEO internal link create error:",error);res.status(500).json({success:false,error:"Unable to create SEO internal link."});}
});

router.patch("/internal-links/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid internal link id."});const old=db.prepare(`SELECT * FROM seo_internal_links WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return res.status(404).json({success:false,error:"SEO internal link not found."});const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;const updates:string[]=[];const values:unknown[]=[];
    if(Object.prototype.hasOwnProperty.call(body,"toPath")){const p=normalizePath(body.toPath);if(!p)return res.status(400).json({success:false,error:"Invalid toPath."});updates.push("to_path=?");values.push(p);}if(Object.prototype.hasOwnProperty.call(body,"anchorText")){const a=text(body.anchorText,250);if(!a)return res.status(400).json({success:false,error:"anchorText cannot be empty."});updates.push("anchor_text=?");values.push(a);}if(Object.prototype.hasOwnProperty.call(body,"relevanceType")){updates.push("relevance_type=?");values.push(nullableText(body.relevanceType,100));}if(Object.prototype.hasOwnProperty.call(body,"sortOrder")){updates.push("sort_order=?");values.push(integerInRange(body.sortOrder,Number(old.sort_order??0),0,100000));}if(Object.prototype.hasOwnProperty.call(body,"isActive")){updates.push("is_active=?");values.push(boolInt(body.isActive));}if(!updates.length)return res.status(400).json({success:false,error:"No supported internal-link fields were supplied."});values.push(id);db.prepare(`UPDATE seo_internal_links SET ${updates.join(",")} WHERE id=?`).run(...values);const updated=db.prepare(`SELECT * FROM seo_internal_links WHERE id=? LIMIT 1`).get(id);audit(req,"admin.seo_internal_link.updated","seo_internal_link",id,old,updated);res.json({success:true,internalLink:updated});
  }catch(error){console.error("SEO internal link update error:",error);res.status(500).json({success:false,error:"Unable to update SEO internal link."});}
});

router.delete("/internal-links/:id", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid internal link id."});const old=db.prepare(`SELECT * FROM seo_internal_links WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return res.status(404).json({success:false,error:"SEO internal link not found."});db.prepare(`UPDATE seo_internal_links SET is_active=0 WHERE id=?`).run(id);audit(req,"admin.seo_internal_link.deactivated","seo_internal_link",id,old,db.prepare(`SELECT * FROM seo_internal_links WHERE id=? LIMIT 1`).get(id));res.json({success:true,deleted:true});}catch(error){console.error("SEO internal link delete error:",error);res.status(500).json({success:false,error:"Unable to deactivate SEO internal link."});}
});

router.post("/url-health", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;const path=normalizePath(body.path);if(!path)return res.status(400).json({success:false,error:"path is required."});
    const status=integerInRange(body.httpStatus,200,100,599);const canonical=normalizeExternalOrPath(body.canonicalUrl??body.canonical);const robots=text(body.robots,120)||INDEXABLE_ROBOTS;const indexable=boolInt(body.indexable,true);const wordCount=positiveId(body.wordCount);const responseTime=positiveId(body.responseTimeMs);const titleLength=positiveId(body.titleLength);const descriptionLength=positiveId(body.descriptionLength);const errorText=nullableText(body.lastError??body.error,1000);
    db.prepare(`INSERT INTO seo_url_health(path,http_status,canonical_url,robots,indexable,word_count,response_time_ms,title_length,description_length,last_crawled_at,last_index_check_at,last_error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(path) DO UPDATE SET http_status=excluded.http_status,canonical_url=excluded.canonical_url,robots=excluded.robots,indexable=excluded.indexable,word_count=excluded.word_count,response_time_ms=excluded.response_time_ms,title_length=excluded.title_length,description_length=excluded.description_length,last_crawled_at=CURRENT_TIMESTAMP,last_index_check_at=CURRENT_TIMESTAMP,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP`).run(path,status,canonical,robots,indexable,wordCount,responseTime,titleLength,descriptionLength,errorText);
    const health=db.prepare(`SELECT * FROM seo_url_health WHERE path=? LIMIT 1`).get(path);audit(req,"admin.seo_url_health.upserted","seo_url_health",Number((health as SqlRow|undefined)?.id??0),null,health);res.status(201).json({success:true,urlHealth:health});
  }catch(error){console.error("SEO URL health create error:",error);res.status(500).json({success:false,error:"Unable to save SEO URL health."});}
});

router.post("/location-pages/:id/generate", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    const id=positiveId(req.params.id);if(!id)return res.status(400).json({success:false,error:"Invalid location page id."});
    const page=db.prepare(`SELECT * FROM seo_location_pages WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!page)return res.status(404).json({success:false,error:"SEO location page not found."});
    const template=db.prepare(`SELECT * FROM seo_templates WHERE id=? AND is_active=1 LIMIT 1`).get(positiveId(page.template_id)) as SqlRow|undefined;if(!template)return res.status(404).json({success:false,error:"Active SEO template not found."});
    const result=upsertGeneratedLocationPage({locationId:Number(page.location_id),catalogType:enumValue(page.catalog_type,CATALOG_TYPES)??"other",locationLevel:enumValue(page.location_level,LOCATION_LEVELS)??"city",template,forcePublish:boolInt(req.body?.forcePublish)===1});
    if(tableExists("seo_generation_runs"))db.prepare(`INSERT INTO seo_generation_runs(seo_location_page_id,seo_entry_id,run_type,template_id,generation_version,listing_count,content_hash,result,message,metadata_json,started_at,finished_at) VALUES(?,?,?, ?,?,?,?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(result.page?.id??id,result.seoEntry?.id??null,"refresh",template.id,Number(result.page?.generation_version??1),result.listingCount,result.page?.content_hash??null,result.indexable?"success":"skipped",result.message,jsonText({locationId:page.location_id,catalogType:page.catalog_type,locationLevel:page.location_level}));
    audit(req,"admin.seo_location_page.refreshed","seo_location_page",id,null,result);res.json({success:true,...result});
  }catch(error){console.error("SEO location page refresh error:",error);res.status(500).json({success:false,error:"Unable to refresh SEO location page."});}
});

router.post("/listing-controls", requireAuth, requireRole("super_admin"), (req: Request, res: Response) => {
  try{
    if(!tableExists("seo_listing_controls"))return res.status(503).json({success:false,error:"SEO listing controls table is unavailable."});
    const body=(req.body&&typeof req.body==="object"?req.body:{}) as SqlRow;const catalog=enumValue(body.catalogType,["temple","pandit","puja_service","ashram"] as const);if(!catalog)return res.status(400).json({success:false,error:"catalogType must be temple, pandit, puja_service or ashram."});
    const getNumber=(key:string,fallback:number)=>integerInRange(body[key],fallback,0,100000);const levels=parsePathList(body.indexableLocationLevels??body.indexable_location_levels_json);const queryParams=parsePathList(body.noindexQueryParameters??body.noindex_query_parameters_json);
    const strategy=text(body.canonicalQueryStrategy??"location_path",50);if(!["location_path","self","custom"].includes(strategy))return res.status(400).json({success:false,error:"Invalid canonicalQueryStrategy."});
    db.prepare(`INSERT INTO seo_listing_controls(catalog_type,base_path,detail_path_template,indexable_location_levels_json,min_country_listings,min_state_listings,min_district_listings,min_city_listings,noindex_query_parameters_json,canonical_query_strategy,sitemap_enabled,internal_linking_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(catalog_type) DO UPDATE SET base_path=excluded.base_path,detail_path_template=excluded.detail_path_template,indexable_location_levels_json=excluded.indexable_location_levels_json,min_country_listings=excluded.min_country_listings,min_state_listings=excluded.min_state_listings,min_district_listings=excluded.min_district_listings,min_city_listings=excluded.min_city_listings,noindex_query_parameters_json=excluded.noindex_query_parameters_json,canonical_query_strategy=excluded.canonical_query_strategy,sitemap_enabled=excluded.sitemap_enabled,internal_linking_enabled=excluded.internal_linking_enabled,updated_at=CURRENT_TIMESTAMP`).run(
      catalog,normalizePath(body.basePath??`/${catalog}`),nullableText(body.detailPathTemplate,500)??`/${catalog}/{slug}`,
      jsonArrayText(levels.length?levels:["country","state","district","city"]),getNumber("minCountryListings",3),getNumber("minStateListings",3),getNumber("minDistrictListings",3),getNumber("minCityListings",3),jsonArrayText(queryParams),strategy,boolInt(body.sitemapEnabled,true),boolInt(body.internalLinkingEnabled,true)
    );
    const control=db.prepare(`SELECT * FROM seo_listing_controls WHERE catalog_type=? LIMIT 1`).get(catalog);audit(req,"admin.seo_listing_controls.updated","seo_listing_controls",null,null,control);res.json({success:true,control});
  }catch(error){console.error("SEO listing controls update error:",error);res.status(500).json({success:false,error:"Unable to save SEO listing controls."});}
});

/* -------------------------------------------------------------------------- */
/* Legacy compatibility                                                       */
/* -------------------------------------------------------------------------- */

router.get("/legacy-pages", requireAuth, requireRole("sales", "super_admin"), (req: Request, res: Response) => {
  try {
    if (!tableExists("seo_pages")) return res.json({ success: true, pages: [] });
    const { page, limit, offset } = pagination(req);
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM seo_pages`).get() as { count?: number } | undefined)?.count ?? 0);
    const pages = db.prepare(`SELECT * FROM seo_pages ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset);
    res.json({ success: true, pages, pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Legacy SEO pages error:", error);
    res.status(500).json({ success: false, error: "Unable to load legacy SEO pages." });
  }
});

export const seoRouter = router;
export const seoRoutes = router;
export default router;
