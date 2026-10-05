import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  optionalAuth,
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Yatra / Pilgrimage Package API
|--------------------------------------------------------------------------
|
| Business model
| - Yatra packages are DivyaDhara-owned catalogue products.
| - Public users can discover only published packages.
| - Super Admin owns package editorial/configuration lifecycle.
| - Sales + Super Admin can inspect structured yatra enquiries.
| - Lead creation/assignment/status belongs to leads.ts.
| - Payment capture/refund belongs to payments.ts.
| - Subscription lifecycle belongs to subscriptions.ts.
| - Programmatic SEO generation belongs to seo.ts.
|
| Canonical tables:
|   yatra_packages
|   yatra_package_locations
|   package_itineraries
|   yatra_booking_requests
|   locations
|   leads
|   form_submissions
|   lead_events
|   audit_logs
|--------------------------------------------------------------------------
*/

const router = Router();

/* -------------------------------------------------------------------------- */
/* Types / constants                                                          */
/* -------------------------------------------------------------------------- */

type SqlRow = Record<string, unknown>;
type PackageStatus = "draft" | "published" | "unpublished";
type LocationRelation = "origin" | "route" | "destination";

type YatraPackageRow = SqlRow & {
  id: number;
  slug: string;
  name: string;
  status: PackageStatus;
  booking_enabled: number;
  featured: number;
  sort_order: number;
};

const PACKAGE_STATUSES: readonly PackageStatus[] = [
  "draft",
  "published",
  "unpublished",
];

const LOCATION_RELATIONS: readonly LocationRelation[] = [
  "origin",
  "route",
  "destination",
];

const ALLOWED_SORT = [
  "featured",
  "price_asc",
  "price_desc",
  "duration_asc",
  "duration_desc",
  "newest",
  "name",
] as const;

const CURRENCIES = new Set(["INR", "USD", "GBP", "EUR", "AED", "SGD"]);

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function currentUser(res: Response): AuthenticatedUser | null {
  return (res.locals.user as AuthenticatedUser | undefined) ?? null;
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max = 500): string | null {
  const normalized = text(value, max);
  return normalized || null;
}

function positiveId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function integerInRange(
  value: unknown,
  fallback: number | null,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const numberValue = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(numberValue)) return fallback;
  const integer = Math.floor(numberValue);
  if (integer < min || integer > max) return fallback;
  return integer;
}


function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = text(value, 20).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseJson(value: unknown, fallback: unknown = []): unknown {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonText(value: unknown, fallback = "[]", maxLength = 500000): string {
  try {
    const parsed = value === undefined ? (fallback === "{}" ? {} : []) : value;
    const serialized = JSON.stringify(parsed);
    if (!serialized || serialized.length > maxLength) return fallback;
    return serialized;
  } catch {
    return fallback;
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function uniquePackageSlug(
  name: unknown,
  requested: unknown,
  currentId?: number,
): string {
  const base = slugify(text(requested, 180) || text(name, 180) || "yatra-package") || "yatra-package";
  let candidate = base;
  let suffix = 2;

  while (true) {
    const row = db
      .prepare("SELECT id FROM yatra_packages WHERE slug = ? LIMIT 1")
      .get(candidate) as { id?: number } | undefined;

    if (!row || row.id === currentId) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded[0]) {
    return nullableText(forwarded[0], 100);
  }
  if (typeof forwarded === "string" && forwarded) {
    return nullableText(forwarded.split(",")[0], 100);
  }
  return nullableText(req.ip, 100);
}

function auditLog(params: {
  req: Request;
  res: Response;
  action: string;
  entityType: string;
  entityId?: number | null;
  oldData?: unknown;
  newData?: unknown;
}): void {
  const user = currentUser(params.res);
  if (!user) return;

  db.prepare(
    `
    INSERT INTO audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      old_data_json,
      new_data_json,
      ip_address,
      user_agent,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
  ).run(
    user.id,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.oldData === undefined ? null : jsonText(params.oldData, "{}"),
    params.newData === undefined ? null : jsonText(params.newData, "{}"),
    clientIp(params.req),
    nullableText(params.req.get("user-agent"), 500),
  );
}

function pagination(req: Request): { page: number; limit: number; offset: number } {
  const page = integerInRange(req.query.page, 1, 1, 100000) ?? 1;
  const limit = integerInRange(req.query.limit, 20, 1, 100) ?? 20;
  return { page, limit, offset: (page - 1) * limit };
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function isValidDateOnly(value: string | null): boolean {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}


function validCurrency(value: unknown): string | null {
  const currency = text(value ?? "INR", 10).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) && (CURRENCIES.has(currency) || currency === "INR")
    ? currency
    : null;
}

/* -------------------------------------------------------------------------- */
/* Location helpers                                                           */
/* -------------------------------------------------------------------------- */

function getLocation(locationId: number): SqlRow | null {
  return (
    (db
      .prepare(
        `
        SELECT
          id,
          parent_id,
          type,
          name,
          slug,
          country_id,
          state_id,
          district_id,
          city_id,
          latitude,
          longitude,
          status
        FROM locations
        WHERE id = ?
        LIMIT 1
        `,
      )
      .get(locationId) as SqlRow | undefined) ?? null
  );
}


function locationDisplayName(locationId: number | null): string | null {
  if (!locationId) return null;
  const row = getLocation(locationId);
  return row ? nullableText(row.name, 250) : null;
}

function locationHierarchy(locationId: number | null): {
  countryId: number | null;
  stateId: number | null;
  districtId: number | null;
  cityId: number | null;
} {
  const result = {
    countryId: null as number | null,
    stateId: null as number | null,
    districtId: null as number | null,
    cityId: null as number | null,
  };

  if (!locationId) return result;

  const first = getLocation(locationId);
  if (!first) return result;

  result.countryId = positiveId(first.country_id);
  result.stateId = positiveId(first.state_id);
  result.districtId = positiveId(first.district_id);
  result.cityId = positiveId(first.city_id);

  switch (first.type) {
    case "country":
      result.countryId = Number(first.id);
      break;
    case "state":
      result.stateId = Number(first.id);
      break;
    case "district":
      result.districtId = Number(first.id);
      break;
    case "city":
      result.cityId = Number(first.id);
      break;
    default:
      break;
  }

  return result;
}

function validateLocationId(
  value: unknown,
  allowedTypes?: readonly string[],
): { id: number | null; row: SqlRow | null; error: string | null } {
  const id = positiveId(value);
  if (!id) return { id: null, row: null, error: null };

  const row = getLocation(id);
  if (!row) return { id, row: null, error: `Location #${id} was not found.` };
  if (String(row.status ?? "active") !== "active") {
    return { id, row, error: `Location #${id} is not active.` };
  }
  if (allowedTypes?.length && !allowedTypes.includes(String(row.type))) {
    return {
      id,
      row,
      error: `Location #${id} must be one of: ${allowedTypes.join(", ")}.`,
    };
  }

  return { id, row, error: null };
}

function normalizePackageLocations(packageId: number): Array<SqlRow> {
  return db
    .prepare(
      `
      SELECT
        ypl.package_id,
        ypl.location_id,
        ypl.relation_type,
        ypl.sort_order,
        l.name,
        l.slug,
        l.type,
        l.parent_id,
        l.country_id,
        l.state_id,
        l.district_id,
        l.city_id
      FROM yatra_package_locations ypl
      INNER JOIN locations l
        ON l.id = ypl.location_id
      WHERE ypl.package_id = ?
      ORDER BY
        CASE ypl.relation_type
          WHEN 'origin' THEN 0
          WHEN 'route' THEN 1
          WHEN 'destination' THEN 2
          ELSE 3
        END,
        ypl.sort_order ASC,
        l.name ASC,
        l.id ASC
      `,
    )
    .all(packageId) as Array<SqlRow>;
}

function parsePackageLocationInput(value: unknown): {
  rows: Array<{ locationId: number; relationType: LocationRelation; sortOrder: number }>;
  errors: string[];
} {
  const input = Array.isArray(value) ? value : [];
  const rows: Array<{ locationId: number; relationType: LocationRelation; sortOrder: number }> = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (let index = 0; index < input.length && rows.length < 100; index += 1) {
    const item = input[index];
    let locationId: number | null = null;
    let relationType: LocationRelation = "route";
    let sortOrder = index;

    if (typeof item === "number" || typeof item === "string") {
      locationId = positiveId(item);
    } else if (item && typeof item === "object") {
      const record = item as SqlRow;
      locationId = positiveId(record.locationId ?? record.location_id ?? record.id);
      relationType = text(record.relationType ?? record.relation_type ?? record.type ?? "route", 30).toLowerCase() as LocationRelation;
      sortOrder = integerInRange(record.sortOrder ?? record.sort_order, index, 0, 100000) ?? index;
    }

    if (!locationId) {
      errors.push(`Invalid location entry at index ${index}.`);
      continue;
    }

    if (!LOCATION_RELATIONS.includes(relationType)) {
      errors.push(`Invalid relation type for location #${locationId}.`);
      continue;
    }

    const validated = validateLocationId(locationId);
    if (validated.error) {
      errors.push(validated.error);
      continue;
    }

    const key = `${locationId}:${relationType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({ locationId, relationType, sortOrder });
  }

  if (input.length > 100) errors.push("A yatra package can contain at most 100 route locations.");

  const origins = rows.filter((item) => item.relationType === "origin").length;
  const destinations = rows.filter((item) => item.relationType === "destination").length;
  if (origins > 1) errors.push("A yatra package can have only one origin location.");
  if (destinations > 50) errors.push("A yatra package can have at most 50 destination locations.");

  return { rows, errors };
}

function replacePackageLocations(packageId: number, value: unknown): void {
  const parsed = parsePackageLocationInput(value);
  if (parsed.errors.length) {
    throw new Error(parsed.errors[0]);
  }

  db.prepare("DELETE FROM yatra_package_locations WHERE package_id = ?").run(packageId);

  const insert = db.prepare(
    `
    INSERT INTO yatra_package_locations (
      package_id,
      location_id,
      relation_type,
      sort_order,
      created_at
    )
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
  );

  for (const row of parsed.rows) {
    insert.run(packageId, row.locationId, row.relationType, row.sortOrder);
  }
}

/* -------------------------------------------------------------------------- */
/* Package helpers / serializers                                              */
/* -------------------------------------------------------------------------- */

function packageById(packageId: number): YatraPackageRow | null {
  return (
    (db.prepare("SELECT * FROM yatra_packages WHERE id = ? LIMIT 1").get(packageId) as YatraPackageRow | undefined) ?? null
  );
}

function packageBySlug(slug: string): YatraPackageRow | null {
  return (
    (db.prepare("SELECT * FROM yatra_packages WHERE slug = ? LIMIT 1").get(slug) as YatraPackageRow | undefined) ?? null
  );
}

function packageCollections(packageId: number): {
  locations: Array<SqlRow>;
  itineraries: Array<SqlRow>;
} {
  const itineraries = db
    .prepare(
      `
      SELECT
        pi.*,
        l.name AS location_name,
        l.slug AS location_slug,
        l.type AS location_type,
        l.country_id,
        l.state_id,
        l.district_id,
        l.city_id
      FROM package_itineraries pi
      LEFT JOIN locations l ON l.id = pi.location_id
      WHERE pi.package_id = ?
      ORDER BY pi.day_number ASC, pi.sort_order ASC, pi.id ASC
      `,
    )
    .all(packageId) as Array<SqlRow>;

  return {
    locations: normalizePackageLocations(packageId),
    itineraries,
  };
}

function serializePackage(row: YatraPackageRow, includeCollections = false): SqlRow {
  const result: SqlRow = {
    ...row,
    bookingEnabled: Boolean(row.booking_enabled),
    featured: Boolean(row.featured),
    gallery: parseJson(row.gallery_json, []),
    dates: parseJson(row.dates_json, []),
    places: parseJson(row.places_json, []),
    terms: parseJson(row.terms_json, []),
    inclusions: parseJson(row.inclusions_json, []),
    exclusions: parseJson(row.exclusions_json, []),
    highlights: parseJson(row.highlights_json, []),
    transport: parseJson(row.transport_json, {}),
    stay: parseJson(row.stay_json, {}),
    locationName: locationDisplayName(positiveId(row.location_id)),
    countryName: locationDisplayName(positiveId(row.country_location_id)),
    stateName: locationDisplayName(positiveId(row.state_location_id)),
    districtName: locationDisplayName(positiveId(row.district_location_id)),
    cityName: locationDisplayName(positiveId(row.city_location_id)),
  };

  if (includeCollections) {
    Object.assign(result, packageCollections(row.id));
  }

  for (const key of [
    "gallery_json",
    "dates_json",
    "places_json",
    "terms_json",
    "inclusions_json",
    "exclusions_json",
    "highlights_json",
    "transport_json",
    "stay_json",
  ]) {
    delete result[key];
  }

  return result;
}

function getPackageCompleteness(packageId: number): {
  ready: boolean;
  errors: string[];
  warnings: string[];
} {
  const row = packageById(packageId);
  if (!row) {
    return { ready: false, errors: ["Yatra package not found."], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (text(row.name, 250).length < 2) errors.push("Package name is required.");
  if (!text(row.destination, 500) && !positiveId(row.location_id)) errors.push("Destination or primary location is required.");
  if (!positiveId(row.duration_days)) errors.push("Duration in days is required.");
  if (row.starting_price_amount !== null && Number(row.starting_price_amount) < 0) errors.push("Starting price cannot be negative.");
  if (!text(row.description, 20000) && !text(row.short_description, 2000)) errors.push("A package description is required.");

  const locations = normalizePackageLocations(packageId);
  const destinationCount = locations.filter((item) => item.relation_type === "destination").length;
  if (!destinationCount) warnings.push("No explicit destination route location is configured.");

  const itineraryCount = db
    .prepare("SELECT COUNT(*) AS count FROM package_itineraries WHERE package_id = ?")
    .get(packageId) as { count?: number } | undefined;
  if (Number(itineraryCount?.count ?? 0) === 0) warnings.push("No itinerary day has been configured.");

  if (Number(row.booking_enabled ?? 0) === 1 && row.starting_price_amount === null) {
    warnings.push("Booking is enabled but no starting price is displayed.");
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
  };
}

function packageListWhere(req: Request): {
  whereSql: string;
  params: unknown[];
  filters: Record<string, unknown>;
} {
  const search = text(req.query.search ?? req.query.q, 180);
  const packageType = text(req.query.packageType ?? req.query.type, 120);
  const locationId = positiveId(req.query.locationId);
  const featuredOnly = booleanValue(req.query.featured);
  const bookingOnly = booleanValue(req.query.bookingEnabled);
  const minPrice = integerInRange(req.query.minPrice, null, 0, 1_000_000_000);
  const maxPrice = integerInRange(req.query.maxPrice, null, 0, 1_000_000_000);
  const minDays = integerInRange(req.query.minDays, null, 1, 3650);
  const maxDays = integerInRange(req.query.maxDays, null, 1, 3650);
  const sortValue = text(req.query.sort, 30).toLowerCase();
  const sort = ALLOWED_SORT.includes(sortValue as (typeof ALLOWED_SORT)[number]) ? sortValue : "featured";

  const where: string[] = ["yp.status = 'published'"];
  const params: unknown[] = [];

  if (search) {
    const pattern = `%${search}%`;
    where.push(`
      (
        LOWER(COALESCE(yp.name, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(yp.destination, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(yp.package_type, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(yp.short_description, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(yp.description, '')) LIKE LOWER(?)
      )
    `);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  if (packageType) {
    where.push("LOWER(COALESCE(yp.package_type, '')) = LOWER(?)");
    params.push(packageType);
  }

  if (featuredOnly) where.push("yp.featured = 1");
  if (bookingOnly) where.push("yp.booking_enabled = 1");
  if (minPrice !== null) {
    where.push("COALESCE(yp.starting_price_amount, 0) >= ?");
    params.push(minPrice);
  }
  if (maxPrice !== null) {
    where.push("COALESCE(yp.starting_price_amount, 0) <= ?");
    params.push(maxPrice);
  }
  if (minDays !== null) {
    where.push("COALESCE(yp.duration_days, 0) >= ?");
    params.push(minDays);
  }
  if (maxDays !== null) {
    where.push("COALESCE(yp.duration_days, 0) <= ?");
    params.push(maxDays);
  }

  if (locationId) {
    const location = getLocation(locationId);
    if (!location || String(location.status ?? "active") !== "active") {
      throw new Error("LOCATION_NOT_FOUND");
    }

    where.push(`
      (
        yp.location_id = ?
        OR yp.country_location_id = ?
        OR yp.state_location_id = ?
        OR yp.district_location_id = ?
        OR yp.city_location_id = ?
        OR EXISTS (
          WITH RECURSIVE descendants(id) AS (
            SELECT id FROM locations WHERE id = ?
            UNION ALL
            SELECT l.id
            FROM locations l
            INNER JOIN descendants d ON l.parent_id = d.id
          )
          SELECT 1
          FROM descendants d
          WHERE d.id = yp.location_id
             OR EXISTS (
               SELECT 1
               FROM yatra_package_locations ypl2
               WHERE ypl2.package_id = yp.id
                 AND ypl2.location_id = d.id
             )
        )
      )
    `);

    params.push(
      locationId,
      locationId,
      locationId,
      locationId,
      locationId,
      locationId,
    );
  }

  return {
    whereSql: `WHERE ${where.join(" AND ")}`,
    params,
    filters: {
      search: search || null,
      packageType: packageType || null,
      locationId,
      featured: featuredOnly,
      bookingEnabled: bookingOnly,
      minPrice,
      maxPrice,
      minDays,
      maxDays,
      sort,
    },
  };
}

function orderByForSort(sort: string): string {
  switch (sort) {
    case "price_asc":
      return "COALESCE(yp.starting_price_amount, 999999999), yp.id DESC";
    case "price_desc":
      return "COALESCE(yp.starting_price_amount, 0) DESC, yp.id DESC";
    case "duration_asc":
      return "COALESCE(yp.duration_days, 9999) ASC, yp.id DESC";
    case "duration_desc":
      return "COALESCE(yp.duration_days, 0) DESC, yp.id DESC";
    case "name":
      return "LOWER(yp.name) ASC, yp.id ASC";
    case "newest":
      return "yp.id DESC";
    default:
      return "yp.featured DESC, yp.sort_order ASC, yp.id DESC";
  }
}

/* -------------------------------------------------------------------------- */
/* Public catalogue                                                           */
/* -------------------------------------------------------------------------- */

router.get("/", optionalAuth, (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const { whereSql, params, filters } = packageListWhere(req);

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS count FROM yatra_packages yp ${whereSql}`)
      .get(...params) as { count?: number } | undefined;

    const total = Number(totalRow?.count ?? 0);
    const rows = db
      .prepare(
        `
        SELECT
          yp.*,
          l.name AS primary_location_name,
          l.slug AS primary_location_slug,
          l.type AS primary_location_type
        FROM yatra_packages yp
        LEFT JOIN locations l ON l.id = yp.location_id
        ${whereSql}
        ORDER BY ${orderByForSort(String(filters.sort))}
        LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset) as YatraPackageRow[];

    res.json({
      success: true,
      packages: rows.map((row) => ({
        ...serializePackage(row),
        primaryLocationName: nullableText(row.primary_location_name, 250),
        primaryLocationSlug: nullableText(row.primary_location_slug, 180),
        primaryLocationType: nullableText(row.primary_location_type, 50),
      })),
      pagination: {
        page,
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters,
    });
  } catch (error) {
    if (String(error) === "Error: LOCATION_NOT_FOUND") {
      res.status(400).json({ success: false, error: "Location not found or inactive." });
      return;
    }
    console.error("Yatra public list error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra packages." });
  }
});

router.get("/featured", optionalAuth, (req: Request, res: Response) => {
  try {
    const limit = integerInRange(req.query.limit, 8, 1, 50) ?? 8;
    const rows = db
      .prepare(
        `
        SELECT *
        FROM yatra_packages
        WHERE status = 'published'
          AND featured = 1
        ORDER BY sort_order ASC, id DESC
        LIMIT ?
        `,
      )
      .all(limit) as YatraPackageRow[];

    res.json({ success: true, packages: rows.map((row) => serializePackage(row)) });
  } catch (error) {
    console.error("Yatra featured error:", error);
    res.status(500).json({ success: false, error: "Unable to load featured yatra packages." });
  }
});

router.get("/meta/catalog", optionalAuth, (_req: Request, res: Response) => {
  try {
    const packageTypes = db
      .prepare(
        `
        SELECT package_type AS value, COUNT(*) AS count
        FROM yatra_packages
        WHERE status = 'published'
          AND package_type IS NOT NULL
          AND TRIM(package_type) <> ''
        GROUP BY package_type
        ORDER BY count DESC, value ASC
        LIMIT 100
        `,
      )
      .all();

    const durations = db
      .prepare(
        `
        SELECT MIN(duration_days) AS min_days, MAX(duration_days) AS max_days
        FROM yatra_packages
        WHERE status = 'published'
        `,
      )
      .get();

    const priceRange = db
      .prepare(
        `
        SELECT MIN(starting_price_amount) AS min_price,
               MAX(starting_price_amount) AS max_price
        FROM yatra_packages
        WHERE status = 'published'
          AND starting_price_amount IS NOT NULL
        `,
      )
      .get();

    res.json({
      success: true,
      statuses: PACKAGE_STATUSES,
      locationRelations: LOCATION_RELATIONS,
      packageTypes,
      durations,
      priceRange,
      currencies: [...CURRENCIES],
    });
  } catch (error) {
    console.error("Yatra meta error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra metadata." });
  }
});

router.get("/locations/children", optionalAuth, (req: Request, res: Response) => {
  try {
    const parentId = positiveId(req.query.parentId);
    const type = text(req.query.type, 30).toLowerCase();
    const search = text(req.query.search ?? req.query.q, 120);

    const where = ["status = 'active'"];
    const params: unknown[] = [];

    if (parentId) {
      if (!getLocation(parentId)) {
        res.status(404).json({ success: false, error: "Parent location not found." });
        return;
      }
      where.push("parent_id = ?");
      params.push(parentId);
    }

    if (type) {
      if (!["country", "state", "district", "city", "area"].includes(type)) {
        res.status(400).json({ success: false, error: "Invalid location type." });
        return;
      }
      where.push("type = ?");
      params.push(type);
    }

    if (search) {
      where.push("LOWER(name) LIKE LOWER(?)");
      params.push(`%${search}%`);
    }

    const rows = db
      .prepare(
        `
        SELECT id, parent_id, type, name, slug, code, state_code,
               district_code, city_code, country_code, description,
               latitude, longitude, timezone, status
        FROM locations
        WHERE ${where.join(" AND ")}
        ORDER BY name ASC
        LIMIT 500
        `,
      )
      .all(...params);

    res.json({ success: true, locations: rows });
  } catch (error) {
    console.error("Yatra locations error:", error);
    res.status(500).json({ success: false, error: "Unable to load locations." });
  }
});

router.get("/:id/booking-info", optionalAuth, (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const row = packageById(packageId);
    if (!row || row.status !== "published") {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    res.json({
      success: true,
      bookingEnabled: Boolean(row.booking_enabled),
      package: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        destination: row.destination,
        durationDays: row.duration_days,
        durationNights: row.duration_nights,
        durationText: row.duration_text,
        startingPriceAmount: row.starting_price_amount,
        currency: row.currency,
        priceDisplay: row.price_display,
        dates: parseJson(row.dates_json, []),
        terms: parseJson(row.terms_json, []),
      },
      enquiry: {
        formKey: "yatra_enquiry",
        createsLead: true,
        paymentCapturedHere: false,
        leadLifecycleOwner: "/api/leads",
        paymentOwner: "/api/payments",
      },
    });
  } catch (error) {
    console.error("Yatra booking info error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra booking information." });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin package management                                                   */
/* -------------------------------------------------------------------------- */

const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("super_admin"));

adminRouter.get("/", (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const search = text(req.query.search ?? req.query.q, 180);
    const status = text(req.query.status, 30).toLowerCase();
    const packageType = text(req.query.packageType, 120);

    const where: string[] = ["1 = 1"];
    const params: unknown[] = [];

    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(name, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(slug, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(destination, '')) LIKE LOWER(?)
      )`);
      params.push(pattern, pattern, pattern);
    }

    if (status) {
      if (!PACKAGE_STATUSES.includes(status as PackageStatus)) {
        res.status(400).json({ success: false, error: "Invalid package status." });
        return;
      }
      where.push("status = ?");
      params.push(status);
    }

    if (packageType) {
      where.push("LOWER(COALESCE(package_type, '')) = LOWER(?)");
      params.push(packageType);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const countRow = db
      .prepare(`SELECT COUNT(*) AS count FROM yatra_packages ${whereSql}`)
      .get(...params) as { count?: number } | undefined;
    const total = Number(countRow?.count ?? 0);

    const rows = db
      .prepare(
        `
        SELECT *
        FROM yatra_packages
        ${whereSql}
        ORDER BY
          CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
          featured DESC,
          sort_order ASC,
          id DESC
        LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset) as YatraPackageRow[];

    res.json({
      success: true,
      packages: rows.map((row) => serializePackage(row, true)),
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Yatra admin list error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra management records." });
  }
});

adminRouter.get("/export.csv", (_req: Request, res: Response) => {
  try {
    const rows = db
      .prepare(
        `
        SELECT
          id, slug, name, destination, package_type,
          duration_days, duration_nights, starting_price_amount,
          currency, discount_amount, old_price_amount,
          booking_enabled, status, featured, sort_order,
          created_at, updated_at
        FROM yatra_packages
        ORDER BY id DESC
        LIMIT 50000
        `,
      )
      .all() as Array<SqlRow>;

    const headers = [
      "id",
      "slug",
      "name",
      "destination",
      "package_type",
      "duration_days",
      "duration_nights",
      "starting_price_amount",
      "currency",
      "discount_amount",
      "old_price_amount",
      "booking_enabled",
      "status",
      "featured",
      "sort_order",
      "created_at",
      "updated_at",
    ];

    const csv = [
      headers.map(csvCell).join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ].join("\n");

    const filename = `divyadhara-yatra-packages-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("Yatra CSV export error:", error);
    res.status(500).json({ success: false, error: "Unable to export yatra packages." });
  }
});

adminRouter.get("/:id/readiness", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const row = packageById(packageId);
    if (!row) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    res.json({ success: true, packageId, ...getPackageCompleteness(packageId) });
  } catch (error) {
    console.error("Yatra readiness error:", error);
    res.status(500).json({ success: false, error: "Unable to evaluate yatra package readiness." });
  }
});

adminRouter.get("/:id", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const row = packageById(packageId);
    if (!row) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    const requestCount = db
      .prepare("SELECT COUNT(*) AS count FROM yatra_booking_requests WHERE package_id = ?")
      .get(packageId) as { count?: number } | undefined;

    res.json({
      success: true,
      package: serializePackage(row, true),
      readiness: getPackageCompleteness(packageId),
      enquiryCount: Number(requestCount?.count ?? 0),
    });
  } catch (error) {
    console.error("Yatra admin detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra management record." });
  }
});

function validatePackagePricing(body: SqlRow, fallback: YatraPackageRow | null = null): {
  startingPrice: number | null;
  oldPrice: number | null;
  discount: number;
  currency: string;
  error: string | null;
} {
  const startingPrice = integerInRange(
    body.startingPriceAmount ?? body.starting_price_amount ?? fallback?.starting_price_amount,
    null,
    0,
    1_000_000_000,
  );
  const oldPrice = integerInRange(
    body.oldPriceAmount ?? body.old_price_amount ?? fallback?.old_price_amount,
    null,
    0,
    1_000_000_000,
  );
  const discount = integerInRange(
    body.discountAmount ?? body.discount_amount ?? fallback?.discount_amount,
    0,
    0,
    1_000_000_000,
  ) ?? 0;
  const currency = validCurrency(body.currency ?? fallback?.currency ?? "INR");

  if (currency === null) {
    return { startingPrice, oldPrice, discount, currency: "INR", error: "Invalid currency. Use a supported 3-letter currency code." };
  }
  if (startingPrice !== null && oldPrice !== null && oldPrice < startingPrice) {
    return { startingPrice, oldPrice, discount, currency, error: "oldPriceAmount cannot be lower than startingPriceAmount." };
  }
  if (startingPrice !== null && discount > startingPrice) {
    return { startingPrice, oldPrice, discount, currency, error: "discountAmount cannot exceed startingPriceAmount." };
  }

  return { startingPrice, oldPrice, discount, currency, error: null };
}

function normalizeJsonField(body: SqlRow, camel: string, snake: string, fallback: string): string {
  return jsonText(body[camel] ?? body[snake], fallback);
}

adminRouter.post("/", (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
    const name = text(body.name, 250);

    if (name.length < 2) {
      res.status(400).json({ success: false, error: "Yatra package name is required." });
      return;
    }

    const status = text(body.status ?? "draft", 20).toLowerCase() as PackageStatus;
    if (!PACKAGE_STATUSES.includes(status)) {
      res.status(400).json({ success: false, error: "Invalid package status." });
      return;
    }

    const primary = validateLocationId(body.locationId ?? body.location_id);
    if (primary.error) {
      res.status(400).json({ success: false, error: primary.error });
      return;
    }

    const pricing = validatePackagePricing(body);
    if (pricing.error) {
      res.status(400).json({ success: false, error: pricing.error });
      return;
    }

    const durationDays = integerInRange(body.durationDays ?? body.duration_days, null, 1, 3650);
    const durationNights = integerInRange(body.durationNights ?? body.duration_nights, null, 0, 3650);
    if (durationDays === null) {
      res.status(400).json({ success: false, error: "durationDays is required and must be valid." });
      return;
    }

    const primaryHierarchy = locationHierarchy(primary.id);
    const slug = uniquePackageSlug(name, body.slug);
    const bookingEnabled = booleanValue(body.bookingEnabled ?? body.booking_enabled, true) ? 1 : 0;
    const featured = booleanValue(body.featured, false) ? 1 : 0;

    if (status === "published") {
      const draftLike: YatraPackageRow = {
        id: 0,
        slug,
        name,
        status,
        booking_enabled: bookingEnabled,
        featured,
        sort_order: integerInRange(body.sortOrder ?? body.sort_order, 0, 0, 100000) ?? 0,
        destination: nullableText(body.destination, 500),
        description: nullableText(body.description, 20000),
        short_description: nullableText(body.shortDescription ?? body.short_description, 2000),
        duration_days: durationDays,
        duration_nights: durationNights,
        starting_price_amount: pricing.startingPrice,
        location_id: primary.id,
        gallery_json: normalizeJsonField(body, "gallery", "gallery_json", "[]"),
        dates_json: normalizeJsonField(body, "dates", "dates_json", "[]"),
      } as YatraPackageRow;
      const readiness = getPackageCompletenessFromDraft(draftLike);
      if (!readiness.ready) {
        res.status(400).json({ success: false, error: "Package is not ready for publication.", readiness });
        return;
      }
    }

    const result = db.transaction(() => {
      const insertResult = db
        .prepare(
          `
          INSERT INTO yatra_packages (
            slug,
            name,
            destination,
            country_location_id,
            state_location_id,
            district_location_id,
            city_location_id,
            package_type,
            short_description,
            description,
            image,
            gallery_json,
            duration_days,
            duration_nights,
            duration_text,
            dates_json,
            starting_price_amount,
            currency,
            discount_amount,
            old_price_amount,
            price_display,
            rating_text,
            group_size,
            meals,
            transport_text,
            stay_text,
            places_json,
            terms_json,
            inclusions_json,
            exclusions_json,
            highlights_json,
            transport_json,
            stay_json,
            location_id,
            booking_enabled,
            status,
            featured,
            sort_order,
            created_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          `,
        )
        .run(
          slug,
          name,
          nullableText(body.destination, 500),
          primaryHierarchy.countryId,
          primaryHierarchy.stateId,
          primaryHierarchy.districtId,
          primaryHierarchy.cityId,
          nullableText(body.packageType ?? body.type ?? body.package_type, 120),
          nullableText(body.shortDescription ?? body.short_description, 2000),
          nullableText(body.description, 20000),
          nullableText(body.image, 3000),
          normalizeJsonField(body, "gallery", "gallery_json", "[]"),
          durationDays,
          durationNights,
          nullableText(body.durationText ?? body.duration_text, 120),
          normalizeJsonField(body, "dates", "dates_json", "[]"),
          pricing.startingPrice,
          pricing.currency,
          pricing.discount,
          pricing.oldPrice,
          nullableText(body.priceDisplay ?? body.price_display, 120),
          nullableText(body.ratingText ?? body.rating_text, 50),
          nullableText(body.groupSize ?? body.group_size, 120),
          nullableText(body.meals, 250),
          nullableText(body.transportText ?? body.transport_text, 500),
          nullableText(body.stayText ?? body.stay_text, 500),
          normalizeJsonField(body, "places", "places_json", "[]"),
          normalizeJsonField(body, "terms", "terms_json", "[]"),
          normalizeJsonField(body, "inclusions", "inclusions_json", "[]"),
          normalizeJsonField(body, "exclusions", "exclusions_json", "[]"),
          normalizeJsonField(body, "highlights", "highlights_json", "[]"),
          normalizeJsonField(body, "transport", "transport_json", "{}"),
          normalizeJsonField(body, "stay", "stay_json", "{}"),
          primary.id,
          bookingEnabled,
          status,
          featured,
          integerInRange(body.sortOrder ?? body.sort_order, 0, 0, 100000) ?? 0,
        );

      const packageId = Number(insertResult.lastInsertRowid);
      replacePackageLocations(packageId, body.locations ?? body.packageLocations ?? body.package_locations ?? []);
      return packageId;
    })();

    const created = packageById(result);
    auditLog({ req, res, action: "yatra.package_created", entityType: "yatra_package", entityId: result, newData: created });

    res.status(201).json({ success: true, package: created ? serializePackage(created, true) : null });
  } catch (error) {
    console.error("Yatra package create error:", error);
    const message = String(error);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      res.status(409).json({ success: false, error: "Yatra package slug already exists." });
      return;
    }
    if (message.startsWith("Error: ") && !message.includes("SQLITE")) {
      res.status(400).json({ success: false, error: message.replace(/^Error:\s*/, "") });
      return;
    }
    res.status(500).json({ success: false, error: "Unable to create yatra package." });
  }
});

function getPackageCompletenessFromDraft(row: YatraPackageRow): { ready: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (text(row.name, 250).length < 2) errors.push("Package name is required.");
  if (!text(row.destination, 500) && !positiveId(row.location_id)) errors.push("Destination or primary location is required.");
  if (!positiveId(row.duration_days)) errors.push("Duration in days is required.");
  if (row.starting_price_amount === null) warnings.push("Starting price is not configured.");
  if (!text(row.description, 20000) && !text(row.short_description, 2000)) errors.push("A package description is required.");
  return { ready: errors.length === 0, errors, warnings };
}

adminRouter.patch("/:id", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const current = packageById(packageId);
    if (!current) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(body, key);
    const updates: string[] = [];
    const values: unknown[] = [];
    let locationPayloadSupplied = false;
    let nextLocations: unknown = null;

    if (has("name")) {
      const name = text(body.name, 250);
      if (name.length < 2) {
        res.status(400).json({ success: false, error: "Yatra package name cannot be empty." });
        return;
      }
      updates.push("name = ?");
      values.push(name);
    }

    if (has("slug")) {
      if (current.status === "published") {
        res.status(409).json({
          success: false,
          error: "Published package slugs are locked. Unpublish the package and complete the SEO migration separately before changing the URL.",
          code: "PUBLISHED_SLUG_LOCKED",
        });
        return;
      }
      updates.push("slug = ?");
      values.push(uniquePackageSlug(body.name ?? current.name, body.slug, packageId));
    }

    const textFields: Array<[string, string, number]> = [
      ["destination", "destination", 500],
      ["package_type", "packageType", 120],
      ["short_description", "shortDescription", 2000],
      ["description", "description", 20000],
      ["image", "image", 3000],
      ["duration_text", "durationText", 120],
      ["price_display", "priceDisplay", 120],
      ["rating_text", "ratingText", 50],
      ["group_size", "groupSize", 120],
      ["meals", "meals", 250],
      ["transport_text", "transportText", 500],
      ["stay_text", "stayText", 500],
    ];

    for (const [column, key, max] of textFields) {
      if (!has(key)) continue;
      updates.push(`${column} = ?`);
      values.push(nullableText(body[key], max));
    }

    if (has("currency")) {
      const currency = validCurrency(body.currency);
      if (!currency) {
        res.status(400).json({ success: false, error: "Invalid currency." });
        return;
      }
      updates.push("currency = ?");
      values.push(currency);
    }

    if (has("durationDays") || has("duration_days")) {
      const value = integerInRange(body.durationDays ?? body.duration_days, null, 1, 3650);
      if (value === null) {
        res.status(400).json({ success: false, error: "Invalid durationDays." });
        return;
      }
      updates.push("duration_days = ?");
      values.push(value);
    }

    if (has("durationNights") || has("duration_nights")) {
      const value = integerInRange(body.durationNights ?? body.duration_nights, null, 0, 3650);
      if (value === null) {
        res.status(400).json({ success: false, error: "Invalid durationNights." });
        return;
      }
      updates.push("duration_nights = ?");
      values.push(value);
    }

    const pricing = validatePackagePricing(body, current);
    if (pricing.error) {
      const pricingWasSupplied = [
        "startingPriceAmount",
        "starting_price_amount",
        "discountAmount",
        "discount_amount",
        "oldPriceAmount",
        "old_price_amount",
        "currency",
      ].some(has);
      if (pricingWasSupplied) {
        res.status(400).json({ success: false, error: pricing.error });
        return;
      }
    } else {
      if (has("startingPriceAmount") || has("starting_price_amount")) {
        updates.push("starting_price_amount = ?");
        values.push(pricing.startingPrice);
      }
      if (has("discountAmount") || has("discount_amount")) {
        updates.push("discount_amount = ?");
        values.push(pricing.discount);
      }
      if (has("oldPriceAmount") || has("old_price_amount")) {
        updates.push("old_price_amount = ?");
        values.push(pricing.oldPrice);
      }
      if (has("currency")) {
        updates.push("currency = ?");
        values.push(pricing.currency);
      }
    }

    const jsonFields: Array<[string, string, string]> = [
      ["gallery_json", "gallery", "[]"],
      ["dates_json", "dates", "[]"],
      ["places_json", "places", "[]"],
      ["terms_json", "terms", "[]"],
      ["inclusions_json", "inclusions", "[]"],
      ["exclusions_json", "exclusions", "[]"],
      ["highlights_json", "highlights", "[]"],
      ["transport_json", "transport", "{}"],
      ["stay_json", "stay", "{}"],
    ];

    for (const [column, key, fallback] of jsonFields) {
      if (!has(key)) continue;
      updates.push(`${column} = ?`);
      values.push(jsonText(body[key], fallback));
    }

    if (has("locationId") || has("location_id")) {
      const primary = validateLocationId(body.locationId ?? body.location_id);
      if (primary.error) {
        res.status(400).json({ success: false, error: primary.error });
        return;
      }
      const hierarchy = locationHierarchy(primary.id);
      updates.push(
        "location_id = ?",
        "country_location_id = ?",
        "state_location_id = ?",
        "district_location_id = ?",
        "city_location_id = ?",
      );
      values.push(primary.id, hierarchy.countryId, hierarchy.stateId, hierarchy.districtId, hierarchy.cityId);
    }

    if (has("bookingEnabled") || has("booking_enabled")) {
      updates.push("booking_enabled = ?");
      values.push(booleanValue(body.bookingEnabled ?? body.booking_enabled) ? 1 : 0);
    }

    if (has("featured")) {
      updates.push("featured = ?");
      values.push(booleanValue(body.featured) ? 1 : 0);
    }

    if (has("status")) {
      const status = text(body.status, 20).toLowerCase() as PackageStatus;
      if (!PACKAGE_STATUSES.includes(status)) {
        res.status(400).json({ success: false, error: "Invalid package status." });
        return;
      }

      if (status === "published") {
        const readiness = getPackageCompleteness(packageId);
        if (!readiness.ready) {
          res.status(400).json({ success: false, error: "Package is not ready for publication.", readiness });
          return;
        }
      }

      updates.push("status = ?");
      values.push(status);

      if (status === "unpublished") {
        updates.push("booking_enabled = 0", "featured = 0");
      }
    }

    if (has("locations") || has("packageLocations") || has("package_locations")) {
      locationPayloadSupplied = true;
      nextLocations = body.locations ?? body.packageLocations ?? body.package_locations;
    }

    if (!updates.length && !locationPayloadSupplied) {
      res.status(400).json({ success: false, error: "No supported package fields were supplied." });
      return;
    }

    const updated = db.transaction(() => {
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        values.push(packageId);
        db.prepare(`UPDATE yatra_packages SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      }

      if (locationPayloadSupplied) {
        replacePackageLocations(packageId, nextLocations);
      }

      return packageById(packageId);
    })();

    auditLog({ req, res, action: "yatra.package_updated", entityType: "yatra_package", entityId: packageId, oldData: current, newData: updated });
    res.json({ success: true, package: updated ? serializePackage(updated, true) : null });
  } catch (error) {
    console.error("Yatra package update error:", error);
    const message = String(error);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      res.status(409).json({ success: false, error: "Yatra package slug already exists." });
      return;
    }
    if (message.startsWith("Error: ") && !message.includes("SQLITE")) {
      res.status(400).json({ success: false, error: message.replace(/^Error:\s*/, "") });
      return;
    }
    res.status(500).json({ success: false, error: "Unable to update yatra package." });
  }
});

adminRouter.post("/:id/publish", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const current = packageById(packageId);
    if (!current) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    const readiness = getPackageCompleteness(packageId);
    if (!readiness.ready) {
      res.status(400).json({ success: false, error: "Package is not ready for publication.", readiness });
      return;
    }

    db.prepare(
      `UPDATE yatra_packages SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(packageId);

    const updated = packageById(packageId);
    auditLog({ req, res, action: "yatra.package_published", entityType: "yatra_package", entityId: packageId, oldData: current, newData: updated });

    res.json({ success: true, package: updated ? serializePackage(updated, true) : null });
  } catch (error) {
    console.error("Yatra publish error:", error);
    res.status(500).json({ success: false, error: "Unable to publish yatra package." });
  }
});

adminRouter.post("/:id/unpublish", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const current = packageById(packageId);
    if (!current) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    db.prepare(
      `UPDATE yatra_packages SET status = 'unpublished', booking_enabled = 0, featured = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(packageId);

    const updated = packageById(packageId);
    auditLog({ req, res, action: "yatra.package_unpublished", entityType: "yatra_package", entityId: packageId, oldData: current, newData: updated });

    res.json({ success: true, package: updated ? serializePackage(updated, true) : null });
  } catch (error) {
    console.error("Yatra unpublish error:", error);
    res.status(500).json({ success: false, error: "Unable to unpublish yatra package." });
  }
});

adminRouter.post("/:id/duplicate", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const current = packageById(packageId);
    if (!current) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    const result = db.transaction(() => {
      const newSlug = uniquePackageSlug(`${current.name}-copy`, `${current.slug}-copy`);
      const copyResult = db
        .prepare(
          `
          INSERT INTO yatra_packages (
            slug, name, destination,
            country_location_id, state_location_id, district_location_id, city_location_id,
            package_type, short_description, description, image, gallery_json,
            duration_days, duration_nights, duration_text, dates_json,
            starting_price_amount, currency, discount_amount, old_price_amount,
            price_display, rating_text, group_size, meals, transport_text, stay_text,
            places_json, terms_json, inclusions_json, exclusions_json, highlights_json,
            transport_json, stay_json, location_id, booking_enabled,
            status, featured, sort_order, created_at, updated_at
          )
          SELECT
            ?, name, destination,
            country_location_id, state_location_id, district_location_id, city_location_id,
            package_type, short_description, description, image, gallery_json,
            duration_days, duration_nights, duration_text, dates_json,
            starting_price_amount, currency, discount_amount, old_price_amount,
            price_display, rating_text, group_size, meals, transport_text, stay_text,
            places_json, terms_json, inclusions_json, exclusions_json, highlights_json,
            transport_json, stay_json, location_id, 0,
            'draft', 0, sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM yatra_packages
          WHERE id = ?
          `,
        )
        .run(newSlug, packageId);

      const newId = Number(copyResult.lastInsertRowid);

      db.prepare(
        `
        INSERT INTO yatra_package_locations (
          package_id, location_id, relation_type, sort_order, created_at
        )
        SELECT ?, location_id, relation_type, sort_order, CURRENT_TIMESTAMP
        FROM yatra_package_locations
        WHERE package_id = ?
        `,
      ).run(newId, packageId);

      db.prepare(
        `
        INSERT INTO package_itineraries (
          package_id, day_number, title, location_id, description,
          meals, stay, transport, image, sort_order, created_at, updated_at
        )
        SELECT
          ?, day_number, title, location_id, description,
          meals, stay, transport, image, sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM package_itineraries
        WHERE package_id = ?
        `,
      ).run(newId, packageId);

      return newId;
    })();

    const duplicated = packageById(result);
    auditLog({ req, res, action: "yatra.package_duplicated", entityType: "yatra_package", entityId: result, oldData: current, newData: duplicated });

    res.status(201).json({ success: true, package: duplicated ? serializePackage(duplicated, true) : null });
  } catch (error) {
    console.error("Yatra duplicate error:", error);
    res.status(500).json({ success: false, error: "Unable to duplicate yatra package." });
  }
});

adminRouter.delete("/:id", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const current = packageById(packageId);
    if (!current) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    db.prepare(
      `
      UPDATE yatra_packages
      SET status = 'unpublished',
          booking_enabled = 0,
          featured = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    ).run(packageId);

    const updated = packageById(packageId);
    auditLog({ req, res, action: "yatra.package_archived", entityType: "yatra_package", entityId: packageId, oldData: current, newData: updated });

    res.json({ success: true, archived: true, package: updated ? serializePackage(updated, true) : null });
  } catch (error) {
    console.error("Yatra archive error:", error);
    res.status(500).json({ success: false, error: "Unable to archive yatra package." });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin itinerary management                                                 */
/* -------------------------------------------------------------------------- */

adminRouter.get("/:id/itinerary", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }
    if (!packageById(packageId)) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    res.json({ success: true, packageId, itineraries: packageCollections(packageId).itineraries });
  } catch (error) {
    console.error("Yatra itinerary list error:", error);
    res.status(500).json({ success: false, error: "Unable to load package itinerary." });
  }
});

adminRouter.post("/:id/itinerary", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const packageRow = packageById(packageId);
    if (!packageRow) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
    const dayNumber = integerInRange(body.dayNumber ?? body.day_number, null, 1, 3650);
    const title = text(body.title, 250);

    if (dayNumber === null || !title) {
      res.status(400).json({ success: false, error: "dayNumber and title are required." });
      return;
    }

    const location = validateLocationId(body.locationId ?? body.location_id);
    if (location.error) {
      res.status(400).json({ success: false, error: location.error });
      return;
    }

    const existing = db
      .prepare("SELECT id FROM package_itineraries WHERE package_id = ? AND day_number = ? LIMIT 1")
      .get(packageId, dayNumber) as { id?: number } | undefined;

    if (existing?.id) {
      res.status(409).json({
        success: false,
        error: "This package already has an itinerary entry for that day. Update the existing entry instead.",
        existingId: existing.id,
      });
      return;
    }

    const result = db
      .prepare(
        `
        INSERT INTO package_itineraries (
          package_id,
          day_number,
          title,
          location_id,
          description,
          meals,
          stay,
          transport,
          image,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
      )
      .run(
        packageId,
        dayNumber,
        title,
        location.id,
        nullableText(body.description, 8000),
        nullableText(body.meals, 250),
        nullableText(body.stay, 500),
        nullableText(body.transport, 500),
        nullableText(body.image, 3000),
        integerInRange(body.sortOrder ?? body.sort_order, 0, 0, 100000) ?? 0,
      );

    const itinerary = db
      .prepare(
        `
        SELECT pi.*, l.name AS location_name, l.slug AS location_slug, l.type AS location_type
        FROM package_itineraries pi
        LEFT JOIN locations l ON l.id = pi.location_id
        WHERE pi.id = ?
        LIMIT 1
        `,
      )
      .get(Number(result.lastInsertRowid));

    db.prepare("UPDATE yatra_packages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(packageId);
    auditLog({ req, res, action: "yatra.itinerary_created", entityType: "package_itinerary", entityId: Number(result.lastInsertRowid), newData: itinerary });

    res.status(201).json({ success: true, itinerary });
  } catch (error) {
    console.error("Yatra itinerary create error:", error);
    res.status(500).json({ success: false, error: "Unable to create itinerary entry." });
  }
});

adminRouter.patch("/itinerary/:itineraryId", (req: Request, res: Response) => {
  try {
    const itineraryId = positiveId(req.params.itineraryId);
    if (!itineraryId) {
      res.status(400).json({ success: false, error: "Invalid itinerary id." });
      return;
    }

    const current = db
      .prepare("SELECT * FROM package_itineraries WHERE id = ? LIMIT 1")
      .get(itineraryId) as SqlRow | undefined;

    if (!current) {
      res.status(404).json({ success: false, error: "Itinerary entry not found." });
      return;
    }

    const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
    const updates: string[] = [];
    const values: unknown[] = [];
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(body, key);

    if (has("dayNumber") || has("day_number")) {
      const value = integerInRange(body.dayNumber ?? body.day_number, null, 1, 3650);
      if (value === null) {
        res.status(400).json({ success: false, error: "Invalid dayNumber." });
        return;
      }
      const duplicate = db
        .prepare(
          `SELECT id FROM package_itineraries WHERE package_id = ? AND day_number = ? AND id <> ? LIMIT 1`,
        )
        .get(Number(current.package_id), value, itineraryId) as { id?: number } | undefined;
      if (duplicate?.id) {
        res.status(409).json({ success: false, error: "Another itinerary entry already uses that day.", existingId: duplicate.id });
        return;
      }
      updates.push("day_number = ?");
      values.push(value);
    }

    if (has("title")) {
      const title = text(body.title, 250);
      if (!title) {
        res.status(400).json({ success: false, error: "Itinerary title cannot be empty." });
        return;
      }
      updates.push("title = ?");
      values.push(title);
    }

    const textFields: Array<[string, string, number]> = [
      ["description", "description", 8000],
      ["meals", "meals", 250],
      ["stay", "stay", 500],
      ["transport", "transport", 500],
      ["image", "image", 3000],
    ];

    for (const [column, key, max] of textFields) {
      if (!has(key)) continue;
      updates.push(`${column} = ?`);
      values.push(nullableText(body[key], max));
    }

    if (has("locationId") || has("location_id")) {
      const location = validateLocationId(body.locationId ?? body.location_id);
      if (location.error) {
        res.status(400).json({ success: false, error: location.error });
        return;
      }
      updates.push("location_id = ?");
      values.push(location.id);
    }

    if (has("sortOrder") || has("sort_order")) {
      updates.push("sort_order = ?");
      values.push(integerInRange(body.sortOrder ?? body.sort_order, 0, 0, 100000) ?? 0);
    }

    if (!updates.length) {
      res.status(400).json({ success: false, error: "No supported itinerary fields were supplied." });
      return;
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(itineraryId);
    db.prepare(`UPDATE package_itineraries SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = db
      .prepare(
        `
        SELECT pi.*, l.name AS location_name, l.slug AS location_slug, l.type AS location_type
        FROM package_itineraries pi
        LEFT JOIN locations l ON l.id = pi.location_id
        WHERE pi.id = ?
        LIMIT 1
        `,
      )
      .get(itineraryId);

    db.prepare("UPDATE yatra_packages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(current.package_id));
    auditLog({ req, res, action: "yatra.itinerary_updated", entityType: "package_itinerary", entityId: itineraryId, oldData: current, newData: updated });

    res.json({ success: true, itinerary: updated });
  } catch (error) {
    console.error("Yatra itinerary update error:", error);
    res.status(500).json({ success: false, error: "Unable to update itinerary entry." });
  }
});

adminRouter.delete("/itinerary/:itineraryId", (req: Request, res: Response) => {
  try {
    const itineraryId = positiveId(req.params.itineraryId);
    if (!itineraryId) {
      res.status(400).json({ success: false, error: "Invalid itinerary id." });
      return;
    }

    const current = db
      .prepare("SELECT * FROM package_itineraries WHERE id = ? LIMIT 1")
      .get(itineraryId) as SqlRow | undefined;

    if (!current) {
      res.status(404).json({ success: false, error: "Itinerary entry not found." });
      return;
    }

    db.transaction(() => {
      db.prepare("DELETE FROM package_itineraries WHERE id = ?").run(itineraryId);
      db.prepare("UPDATE yatra_packages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(current.package_id));
    })();

    auditLog({ req, res, action: "yatra.itinerary_deleted", entityType: "package_itinerary", entityId: itineraryId, oldData: current });
    res.json({ success: true, deleted: true, itineraryId });
  } catch (error) {
    console.error("Yatra itinerary delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete itinerary entry." });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin package locations                                                    */
/* -------------------------------------------------------------------------- */

adminRouter.get("/:id/locations", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    if (!packageById(packageId)) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    res.json({ success: true, packageId, locations: normalizePackageLocations(packageId) });
  } catch (error) {
    console.error("Yatra package locations error:", error);
    res.status(500).json({ success: false, error: "Unable to load package locations." });
  }
});

adminRouter.put("/:id/locations", (req: Request, res: Response) => {
  try {
    const packageId = positiveId(req.params.id);
    if (!packageId) {
      res.status(400).json({ success: false, error: "Invalid package id." });
      return;
    }

    const current = packageById(packageId);
    if (!current) {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
    const incoming = body.locations ?? body.packageLocations ?? body.package_locations;
    if (!Array.isArray(incoming)) {
      res.status(400).json({ success: false, error: "locations must be an array." });
      return;
    }

    const parsed = parsePackageLocationInput(incoming);
    if (parsed.errors.length) {
      res.status(400).json({ success: false, error: parsed.errors[0] });
      return;
    }

    db.transaction(() => {
      replacePackageLocations(packageId, incoming);
      db.prepare("UPDATE yatra_packages SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(packageId);
    })();

    const updated = packageById(packageId);
    const locations = normalizePackageLocations(packageId);
    auditLog({ req, res, action: "yatra.package_locations_replaced", entityType: "yatra_package", entityId: packageId, oldData: current, newData: locations });

    res.json({
      success: true,
      packageId,
      locations,
      package: updated ? serializePackage(updated, true) : null,
    });
  } catch (error) {
    console.error("Yatra package locations replace error:", error);
    res.status(500).json({ success: false, error: "Unable to update package locations." });
  }
});

/* -------------------------------------------------------------------------- */
/* Yatra enquiry / Sales operations                                            */
/* -------------------------------------------------------------------------- */

const operationsRouter = Router();
operationsRouter.use(requireAuth, requireRole("sales", "super_admin"));

operationsRouter.get("/health", (_req: Request, res: Response) => {
  try {
    const packages = db.prepare("SELECT COUNT(*) AS count FROM yatra_packages").get() as { count?: number } | undefined;
    const published = db.prepare("SELECT COUNT(*) AS count FROM yatra_packages WHERE status = 'published'").get() as { count?: number } | undefined;
    const enquiries = db.prepare("SELECT COUNT(*) AS count FROM yatra_booking_requests").get() as { count?: number } | undefined;

    res.json({
      success: true,
      service: "yatra",
      status: "healthy",
      database: true,
      packages: Number(packages?.count ?? 0),
      publishedPackages: Number(published?.count ?? 0),
      enquiries: Number(enquiries?.count ?? 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Yatra health error:", error);
    res.status(500).json({ success: false, service: "yatra", status: "unhealthy", database: false });
  }
});

operationsRouter.get("/", (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = pagination(req);
    const packageId = positiveId(req.query.packageId);
    const leadId = positiveId(req.query.leadId);
    const search = text(req.query.search, 180);
    const from = nullableText(req.query.from ?? req.query.dateFrom, 40);
    const to = nullableText(req.query.to ?? req.query.dateTo, 40);

    if (from && !isValidDateOnly(from)) {
      res.status(400).json({ success: false, error: "from must be YYYY-MM-DD." });
      return;
    }
    if (to && !isValidDateOnly(to)) {
      res.status(400).json({ success: false, error: "to must be YYYY-MM-DD." });
      return;
    }
    if (from && to && to < from) {
      res.status(400).json({ success: false, error: "to cannot be before from." });
      return;
    }

    const where: string[] = ["1 = 1"];
    const params: unknown[] = [];

    if (packageId) {
      where.push("ybr.package_id = ?");
      params.push(packageId);
    }
    if (leadId) {
      where.push("ybr.lead_id = ?");
      params.push(leadId);
    }
    if (from) {
      where.push("DATE(ybr.created_at) >= DATE(?)");
      params.push(from);
    }
    if (to) {
      where.push("DATE(ybr.created_at) <= DATE(?)");
      params.push(to);
    }
    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(l.lead_number, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(l.name, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(l.phone, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(l.email, '')) LIKE LOWER(?)
        OR LOWER(COALESCE(yp.name, '')) LIKE LOWER(?)
      )`);
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const totalRow = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM yatra_booking_requests ybr
        LEFT JOIN leads l ON l.id = ybr.lead_id
        LEFT JOIN yatra_packages yp ON yp.id = ybr.package_id
        ${whereSql}
        `,
      )
      .get(...params) as { count?: number } | undefined;

    const total = Number(totalRow?.count ?? 0);

    const rows = db
      .prepare(
        `
        SELECT
          ybr.*,
          l.lead_number,
          l.name AS lead_name,
          l.phone AS lead_phone,
          l.email AS lead_email,
          l.status AS lead_status,
          l.priority AS lead_priority,
          l.owner_user_id AS lead_owner_user_id,
          yp.name AS package_name,
          yp.slug AS package_slug,
          yp.status AS package_status
        FROM yatra_booking_requests ybr
        LEFT JOIN leads l ON l.id = ybr.lead_id
        LEFT JOIN yatra_packages yp ON yp.id = ybr.package_id
        ${whereSql}
        ORDER BY ybr.created_at DESC, ybr.id DESC
        LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset);

    res.json({
      success: true,
      enquiries: rows,
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      lifecycleOwner: "/api/leads",
      paymentOwner: "/api/payments",
    });
  } catch (error) {
    console.error("Yatra enquiry list error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra enquiries." });
  }
});

operationsRouter.get("/:id", (req: Request, res: Response) => {
  try {
    const requestId = positiveId(req.params.id);
    if (!requestId) {
      res.status(400).json({ success: false, error: "Invalid yatra enquiry id." });
      return;
    }

    const request = db
      .prepare(
        `
        SELECT
          ybr.*,
          l.lead_number,
          l.name AS lead_name,
          l.phone AS lead_phone,
          l.email AS lead_email,
          l.city AS lead_city,
          l.state AS lead_state,
          l.district AS lead_district,
          l.country AS lead_country,
          l.service_type,
          l.puja_type,
          l.status AS lead_status,
          l.priority AS lead_priority,
          l.owner_user_id AS lead_owner_user_id,
          yp.name AS package_name,
          yp.slug AS package_slug,
          yp.destination,
          yp.starting_price_amount,
          yp.currency,
          yp.status AS package_status
        FROM yatra_booking_requests ybr
        LEFT JOIN leads l ON l.id = ybr.lead_id
        LEFT JOIN yatra_packages yp ON yp.id = ybr.package_id
        WHERE ybr.id = ?
        LIMIT 1
        `,
      )
      .get(requestId) as SqlRow | undefined;

    if (!request) {
      res.status(404).json({ success: false, error: "Yatra enquiry not found." });
      return;
    }

    const leadEvents = request.lead_id
      ? db.prepare("SELECT * FROM lead_events WHERE lead_id = ? ORDER BY id DESC LIMIT 100").all(request.lead_id)
      : [];

    res.json({
      success: true,
      enquiry: request,
      leadEvents,
      note: "Lead status, assignment, credit consumption and follow-up mutations remain owned by /api/leads.",
    });
  } catch (error) {
    console.error("Yatra enquiry detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra enquiry." });
  }
});

/* -------------------------------------------------------------------------- */
/* Role-protected prefixes                                                     */
/* -------------------------------------------------------------------------- */

// Mount before /:slug so exact /admin, /requests and /ops prefixes cannot be
// interpreted as package slugs.
router.use("/admin", adminRouter);
router.use("/requests", operationsRouter);
router.use("/ops", operationsRouter);

/* -------------------------------------------------------------------------- */
/* Public package detail — deliberately last to avoid prefix collisions      */
/* -------------------------------------------------------------------------- */

router.get("/:slug", optionalAuth, (req: Request, res: Response) => {
  try {
    const slug = slugify(text(req.params.slug, 180));
    if (!slug) {
      res.status(400).json({ success: false, error: "Yatra package slug is required." });
      return;
    }

    const row = packageBySlug(slug);
    if (!row || row.status !== "published") {
      res.status(404).json({ success: false, error: "Yatra package not found." });
      return;
    }

    res.json({
      success: true,
      package: serializePackage(row, true),
      attribution: {
        entityType: "yatra_package",
        entityId: row.id,
        pagePath: `/yatra/${row.slug}`,
      },
    });
  } catch (error) {
    console.error("Yatra public detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load yatra package." });
  }
});

export { router as yatraRouter, router as yatraRoutes };
export default router;
