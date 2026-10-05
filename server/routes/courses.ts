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
|--------------------------------------------------------------------------
| DivyaDhara — Courses API
|--------------------------------------------------------------------------
|
| Canonical business responsibilities
| - Public course catalogue and SEO-friendly course detail.
| - Super Admin course/lesson CMS management.
| - Course lesson preview for public visitors.
| - Full lesson access for an enrolled/paid customer.
| - Course enrollment is represented by the canonical bookings ledger
|   (bookings.kind = 'course'); there is intentionally no second enrollment
|   table in the schema.
| - Ashram <-> Course relation is read-only here; assignment/link management
|   remains in ashrams.ts so the Ashram subscription/program entitlement rules
|   stay in one place.
| - Location-aware catalogue filtering.
| - Sales/Super Admin operational reporting.
| - Audit logging for course/lesson/enrollment changes.
|
| RBAC
| - Visitor / public: read published courses; authenticated customer can enroll.
| - Pandit / Temple Manager / Ashram Manager: may consume courses as customers,
|   but cannot edit the global course catalogue.
| - Ashram Manager may see courses linked to their assigned Ashrams, but course
|   linking itself is managed by the Ashram domain route.
| - Sales: read/manage operational booking records through bookings.ts; this
|   route does not grant global course CMS write access.
| - Super Admin: full course and lesson CMS access via admin.manage_courses.
|
| Financial source of truth
| - Course price is stored in courses.price_amount.
| - Enrollment record is bookings.
| - Payment state is authoritative in payments.ts / payments ledger.
|--------------------------------------------------------------------------
*/

const router = Router();

type Row = Record<string, unknown>;

type CourseStatus = "draft" | "published" | "unpublished";
type DeliveryMode = "online" | "offline" | "hybrid" | "residential";

type CourseAccess = "public" | "enrolled" | "admin";

const COURSE_STATUSES: readonly CourseStatus[] = ["draft", "published", "unpublished"];
const DELIVERY_MODES: readonly DeliveryMode[] = ["online", "offline", "hybrid", "residential"];
const MAX_LIST_LIMIT = 100;
const MAX_TEXT = 50_000;

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

function integerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  return integer < min || integer > max ? fallback : integer;
}

function nonNegativeInteger(value: unknown, fallback: number | null = null, max = 1_000_000_000): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) return fallback;
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
    ? req.body as Row
    : {};
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const normalized = text(value, 80).toLowerCase();
  return (allowed as readonly string[]).includes(normalized)
    ? normalized as T[number]
    : null;
}

function jsonText(value: unknown, fallback = "{}"): string {
  try {
    const result = JSON.stringify(value ?? {});
    return result || fallback;
  } catch {
    return fallback;
  }
}

function jsonArray(value: unknown, maxItems = 100): string {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  return JSON.stringify(Array.isArray(parsed) ? parsed.slice(0, maxItems) : []);
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

function makeSlug(value: unknown): string {
  const slug = text(value, 180)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 150);
  return slug || `course-${randomBytes(4).toString("hex")}`;
}

function uniqueSlug(requested: unknown, title: string, currentId?: number): string {
  const base = makeSlug(requested || title);
  let candidate = base;

  for (let i = 2; i <= 100; i += 1) {
    const row = db.prepare(`
      SELECT id
      FROM courses
      WHERE slug = ?
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `).get(candidate, currentId ?? null, currentId ?? null) as { id?: number } | undefined;

    if (!row) return candidate;
    candidate = `${base}-${i}`;
  }

  return `${base}-${randomBytes(3).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentUser(res: Response): AuthenticatedUser | null {
  return (res.locals.user as AuthenticatedUser | undefined) ?? null;
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]?.trim().slice(0, 100) || null;
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0].trim().slice(0, 100) || null;
  return req.ip?.trim().slice(0, 100) || null;
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

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
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

  const user = req.res?.locals.user as AuthenticatedUser | undefined;
  try {
    db.prepare(`
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
    `).run(
      user?.id ?? null,
      req.res?.locals.requestId ?? null,
      user?.role ?? "system",
      text(action, 150),
      text(entityType, 100),
      entityId,
      oldData == null ? null : jsonText(oldData),
      newData == null ? null : jsonText(newData),
      clientIp(req),
      nullableText(req.get("user-agent"), 1000),
    );
  } catch (error) {
    console.error("Course audit error:", error);
  }
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

  while (current && guard < 10) {
    guard += 1;
    const row = db.prepare(`
      SELECT id, parent_id, type, name, status
      FROM locations
      WHERE id=?
      LIMIT 1
    `).get(current) as { id: number; parent_id: number | null; type: string; name: string; status: string } | undefined;

    if (!row || row.status === "inactive") break;

    if (row.type === "country") { result.countryId = row.id; result.country = row.name; }
    else if (row.type === "state") { result.stateId = row.id; result.state = row.name; }
    else if (row.type === "district") { result.districtId = row.id; result.district = row.name; }
    else if (row.type === "city") { result.cityId = row.id; result.city = row.name; }

    current = row.parent_id;
  }

  return result;
}

function validateLocation(locationId: number | null): LocationContext {
  if (!locationId) return resolveLocation(null);

  const row = db.prepare(`
    SELECT id, status
    FROM locations
    WHERE id=?
    LIMIT 1
  `).get(locationId) as { id?: number; status?: string } | undefined;

  if (!row) throw new Error("Selected location was not found.");
  if (row.status !== "active") throw new Error("Selected location is not active.");
  return resolveLocation(locationId);
}

/* -------------------------------------------------------------------------- */
/* Course queries / serialization                                              */
/* -------------------------------------------------------------------------- */

function getCourse(identifier: string): Row | undefined {
  const numericId = positiveId(identifier);
  if (numericId) {
    return db.prepare(`SELECT * FROM courses WHERE id=? LIMIT 1`).get(numericId) as Row | undefined;
  }
  return db.prepare(`SELECT * FROM courses WHERE slug=? LIMIT 1`).get(text(identifier, 180)) as Row | undefined;
}

function courseAccess(user: AuthenticatedUser | null, courseId: number): CourseAccess {
  if (user && user.role === "super_admin") return "admin";

  if (!user) return "public";

  const row = db.prepare(`
    SELECT b.id, b.status, b.amount
    FROM bookings b
    WHERE b.user_id=?
      AND b.course_id=?
      AND b.kind='course'
      AND b.status NOT IN ('cancelled','rejected')
    ORDER BY b.id DESC
    LIMIT 1
  `).get(user.id, courseId) as Row | undefined;

  if (!row) return "public";

  const amount = row.amount == null ? 0 : Number(row.amount);
  if (amount <= 0) return "enrolled";

  const paid = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN p.status IN ('paid','captured') THEN COALESCE(p.amount,0) ELSE 0 END),0)
      - COALESCE(SUM(COALESCE(p.refund_amount_paise,0))/100.0,0) AS net_paid
    FROM payments p
    WHERE p.booking_id=?
  `).get(Number(row.id)) as { net_paid?: number } | undefined;

  if (Number(paid?.net_paid ?? 0) >= amount) return "enrolled";
  return "public";
}

function serializeLesson(row: Row, access: CourseAccess): Row {
  const preview = Number(row.is_preview ?? 0) === 1;
  const canWatch = access === "admin" || access === "enrolled" || preview;

  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    lessonNumber: Number(row.lesson_number),
    title: row.title ?? null,
    description: row.description ?? null,
    videoUrl: canWatch ? row.video_url ?? null : null,
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    isPreview: Number(row.is_preview ?? 0),
    isActive: Number(row.is_active ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    locked: !canWatch,
  };
}

function serializeCourse(row: Row, options: { includePrivate?: boolean; access?: CourseAccess } = {}): Row {
  const access = options.access ?? "public";
  const includePrivate = options.includePrivate === true;

  const result: Row = {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? null,
    category: row.category ?? null,
    level: row.level ?? null,
    shortDescription: row.short_description ?? null,
    description: row.description ?? null,
    instructorName: row.instructor_name ?? null,
    instructorBio: row.instructor_bio ?? null,
    instructorImage: row.instructor_image ?? null,
    image: row.image ?? null,
    gallery: parseJsonArray(row.gallery_json),
    durationText: row.duration_text ?? null,
    sessionsText: row.sessions_text ?? null,
    feeDisplay: row.fee_display ?? null,
    modeText: row.mode_text ?? null,
    scheduleText: row.schedule_text ?? null,
    eligibilityText: row.eligibility_text ?? null,
    deliveryMode: row.delivery_mode ?? null,
    priceAmount: row.price_amount == null ? null : Number(row.price_amount),
    currency: row.currency ?? "INR",
    certificateAvailable: Number(row.certificate_available ?? 0),
    curriculum: parseJsonArray(row.curriculum_json),
    benefits: parseJsonArray(row.benefits_json),
    locationId: row.location_id ?? null,
    countryLocationId: row.country_location_id ?? null,
    stateLocationId: row.state_location_id ?? null,
    districtLocationId: row.district_location_id ?? null,
    cityLocationId: row.city_location_id ?? null,
    enrollmentEnabled: Number(row.enrollment_enabled ?? 0),
    status: row.status,
    featured: Number(row.featured ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };

  if (includePrivate) {
    result.access = access;
    result.adminOnly = true;
  }

  return result;
}

function courseLessons(courseId: number, access: CourseAccess, includeInactive = false): Row[] {
  const rows = db.prepare(`
    SELECT *
    FROM course_lessons
    WHERE course_id=?
      ${includeInactive ? "" : "AND is_active=1"}
    ORDER BY sort_order ASC, lesson_number ASC, id ASC
  `).all(courseId) as Row[];

  return rows.map((row) => serializeLesson(row, access));
}

function linkedAshrams(courseId: number, includePrivate = false, user?: AuthenticatedUser | null): Row[] {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.slug,
      a.name,
      a.city,
      a.district,
      a.state,
      a.country,
      a.image,
      a.status,
      a.listing_active,
      ac.is_featured
    FROM ashram_courses ac
    INNER JOIN ashrams a ON a.id=ac.ashram_id
    WHERE ac.course_id=?
      ${includePrivate ? "" : "AND a.status='published' AND a.listing_active=1"}
    ORDER BY ac.is_featured DESC, a.featured DESC, a.name COLLATE NOCASE ASC
  `).all(courseId) as Row[];

  return rows
    .filter((row) => {
      if (!includePrivate) return true;
      if (user?.role === "super_admin") return true;
      if (user?.role !== "ashram_manager" || !user) return false;
      const assignment = db.prepare(`
        SELECT 1 FROM ashram_manager_assignments
        WHERE ashram_id=? AND manager_user_id=? AND status='active'
        LIMIT 1
      `).get(Number(row.id), user.id);
      return Boolean(assignment);
    })
    .map((row) => ({
      id: Number(row.id),
      slug: row.slug,
      name: row.name,
      city: row.city ?? null,
      district: row.district ?? null,
      state: row.state ?? null,
      country: row.country ?? "India",
      image: row.image ?? null,
      isFeatured: Number(row.is_featured ?? 0),
      status: row.status,
      listingActive: Number(row.listing_active ?? 0),
    }));
}

function latestCourseBooking(userId: number, courseId: number): Row | undefined {
  return db.prepare(`
    SELECT b.*
    FROM bookings b
    WHERE b.user_id=?
      AND b.course_id=?
      AND b.kind='course'
      AND b.status NOT IN ('cancelled','rejected')
    ORDER BY b.id DESC
    LIMIT 1
  `).get(userId, courseId) as Row | undefined;
}

/* -------------------------------------------------------------------------- */
/* Public catalogue                                                           */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  try {
    const total = db.prepare(`SELECT COUNT(*) AS count FROM courses`).get() as { count?: number } | undefined;
    const published = db.prepare(`
      SELECT COUNT(*) AS count
      FROM courses
      WHERE status='published' AND enrollment_enabled=1
    `).get() as { count?: number } | undefined;

    res.json({
      success: true,
      service: "courses",
      status: "healthy",
      database: true,
      totals: {
        courses: Number(total?.count ?? 0),
        publicCourses: Number(published?.count ?? 0),
      },
      timestamp: nowIso(),
    });
  } catch (error) {
    console.error("Course health error:", error);
    res.status(500).json({ success: false, service: "courses", status: "unhealthy", database: false });
  }
});

router.get("/meta", (_req: Request, res: Response) => {
  try {
    const categories = (db.prepare(`
      SELECT DISTINCT category
      FROM courses
      WHERE status='published' AND category IS NOT NULL AND TRIM(category)<>''
      ORDER BY LOWER(category) ASC
      LIMIT 200
    `).all() as Row[]).map((row) => String(row.category));

    const levels = (db.prepare(`
      SELECT DISTINCT level
      FROM courses
      WHERE status='published' AND level IS NOT NULL AND TRIM(level)<>''
      ORDER BY LOWER(level) ASC
      LIMIT 100
    `).all() as Row[]).map((row) => String(row.level));

    res.json({
      success: true,
      statuses: COURSE_STATUSES,
      deliveryModes: DELIVERY_MODES,
      categories,
      levels,
      sorts: ["featured", "newest", "name", "price_low", "price_high"],
    });
  } catch (error) {
    console.error("Course meta error:", error);
    res.status(500).json({ success: false, error: "Unable to load course metadata." });
  }
});

router.get("/", (_req: Request, res: Response) => {
  try {
    const page = integerInRange(_req.query.page, 1, 1, 100000);
    const limit = integerInRange(_req.query.limit, 24, 1, MAX_LIST_LIMIT);
    const offset = (page - 1) * limit;
    const search = text(_req.query.search ?? _req.query.q, 180);
    const category = nullableText(_req.query.category, 120);
    const level = nullableText(_req.query.level, 120);
    const deliveryMode = enumValue(_req.query.deliveryMode ?? _req.query.delivery_mode, DELIVERY_MODES);
    const featured = _req.query.featured === undefined ? null : booleanValue(_req.query.featured, false);
    const enrollmentEnabled = _req.query.enrollmentEnabled === undefined ? null : booleanValue(_req.query.enrollmentEnabled, true);
    const locationId = positiveId(_req.query.locationId);
    const sort = text(_req.query.sort, 30).toLowerCase() || "featured";

    const where: string[] = ["c.status='published'"];
    const params: unknown[] = [];

    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(c.title,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(c.subtitle,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(c.category,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(c.level,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(c.short_description,'')) LIKE LOWER(?)
        OR LOWER(COALESCE(c.instructor_name,'')) LIKE LOWER(?)
      )`);
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (category) { where.push("LOWER(COALESCE(c.category,''))=LOWER(?)"); params.push(category); }
    if (level) { where.push("LOWER(COALESCE(c.level,''))=LOWER(?)"); params.push(level); }
    if (deliveryMode) { where.push("c.delivery_mode=?"); params.push(deliveryMode); }
    if (featured !== null) { where.push("c.featured=?"); params.push(featured ? 1 : 0); }
    if (enrollmentEnabled !== null) { where.push("c.enrollment_enabled=?"); params.push(enrollmentEnabled ? 1 : 0); }

    if (locationId) {
      const location = validateLocation(locationId);
      if (location.cityId) { where.push("c.city_location_id=?"); params.push(location.cityId); }
      else if (location.districtId) { where.push("c.district_location_id=?"); params.push(location.districtId); }
      else if (location.stateId) { where.push("c.state_location_id=?"); params.push(location.stateId); }
      else if (location.countryId) { where.push("c.country_location_id=?"); params.push(location.countryId); }
      else { where.push("c.location_id=?"); params.push(location.locationId); }
    }

    const orderBy = (() => {
      switch (sort) {
        case "name": return "LOWER(c.title) ASC, c.id ASC";
        case "newest": return "c.id DESC";
        case "price_low": return "COALESCE(c.price_amount,0) ASC, c.id ASC";
        case "price_high": return "COALESCE(c.price_amount,0) DESC, c.id DESC";
        default: return "c.featured DESC, c.sort_order ASC, c.id DESC";
      }
    })();

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM courses c ${whereSql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = db.prepare(`
      SELECT
        c.id,
        c.slug,
        c.title,
        c.subtitle,
        c.category,
        c.level,
        c.short_description,
        c.instructor_name,
        c.image,
        c.duration_text,
        c.sessions_text,
        c.fee_display,
        c.mode_text,
        c.schedule_text,
        c.delivery_mode,
        c.price_amount,
        c.currency,
        c.certificate_available,
        c.location_id,
        c.country_location_id,
        c.state_location_id,
        c.district_location_id,
        c.city_location_id,
        c.enrollment_enabled,
        c.status,
        c.featured,
        c.sort_order
      FROM courses c
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      courses: rows.map((row) => serializeCourse(row)),
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      filters: {
        search: search || null,
        category,
        level,
        deliveryMode,
        featured,
        enrollmentEnabled,
        locationId,
        sort,
      },
    });
  } catch (error) {
    console.error("Public course list error:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Selected location")) {
      res.status(400).json({ success: false, error: message });
      return;
    }
    res.status(500).json({ success: false, error: "Unable to load courses." });
  }
});

/* -------------------------------------------------------------------------- */
/* Customer course dashboard                                                  */
/* -------------------------------------------------------------------------- */

router.get("/mine", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUser(res);
    if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }

    const page = integerInRange(req.query.page, 1, 1, 100000);
    const limit = integerInRange(req.query.limit, 25, 1, MAX_LIST_LIMIT);
    const offset = (page - 1) * limit;
    const where: string[] = ["b.user_id=?", "b.kind='course'"];
    const params: unknown[] = [user.id];

    const status = enumValue(req.query.status, ["received", "confirmed", "in_progress", "completed", "cancelled", "rejected"] as const);
    if (status) { where.push("b.status=?"); params.push(status); }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM bookings b ${whereSql}`).get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = db.prepare(`
      SELECT
        b.*,
        c.slug AS course_slug,
        c.title AS course_title,
        c.image AS course_image,
        c.instructor_name,
        c.price_amount AS course_price_amount,
        c.currency AS course_currency,
        c.certificate_available,
        c.status AS course_status
      FROM bookings b
      LEFT JOIN courses c ON c.id=b.course_id
      ${whereSql}
      ORDER BY b.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[];

    const result = rows.map((row) => {
      const access = row.course_id ? courseAccess(user, Number(row.course_id)) : "public";
      return {
        id: Number(row.id),
        bookingNumber: row.booking_number,
        courseId: row.course_id == null ? null : Number(row.course_id),
        courseSlug: row.course_slug ?? null,
        courseTitle: row.course_title ?? null,
        courseImage: row.course_image ?? null,
        instructorName: row.instructor_name ?? null,
        amount: row.amount == null ? null : Number(row.amount),
        currency: row.currency ?? "INR",
        status: row.status,
        paymentStatus: row.payment_status,
        date: row.date ?? null,
        time: row.time ?? null,
        access,
        canAccessLessons: access === "enrolled" || access === "admin",
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
      };
    });

    res.json({
      success: true,
      courses: result,
      pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("My courses error:", error);
    res.status(500).json({ success: false, error: "Unable to load your enrolled courses." });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin course workspace                                                     */
/* -------------------------------------------------------------------------- */

router.get(
  "/manage",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const page = integerInRange(req.query.page, 1, 1, 100000);
      const limit = integerInRange(req.query.limit, 50, 1, MAX_LIST_LIMIT);
      const offset = (page - 1) * limit;
      const status = enumValue(req.query.status, COURSE_STATUSES);
      const search = text(req.query.search, 180);
      const where: string[] = ["1=1"];
      const params: unknown[] = [];

      if (status) { where.push("c.status=?"); params.push(status); }
      if (search) {
        const pattern = `%${search}%`;
        where.push(`(LOWER(c.title) LIKE LOWER(?) OR LOWER(c.slug) LIKE LOWER(?) OR LOWER(COALESCE(c.instructor_name,'')) LIKE LOWER(?))`);
        params.push(pattern, pattern, pattern);
      }

      const whereSql = `WHERE ${where.join(" AND ")}`;
      const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM courses c ${whereSql}`).get(...params) as { count?: number } | undefined;
      const total = Number(totalRow?.count ?? 0);

      const rows = db.prepare(`
        SELECT
          c.*,
          (SELECT COUNT(*) FROM course_lessons cl WHERE cl.course_id=c.id) AS lesson_count,
          (SELECT COUNT(*) FROM ashram_courses ac WHERE ac.course_id=c.id) AS ashram_count,
          (SELECT COUNT(*) FROM bookings b WHERE b.course_id=c.id AND b.kind='course') AS enrollment_count
        FROM courses c
        ${whereSql}
        ORDER BY c.sort_order ASC, c.id DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Row[];

      res.json({
        success: true,
        courses: rows.map((row) => ({
          ...serializeCourse(row, { includePrivate: true, access: "admin" }),
          lessonCount: Number(row.lesson_count ?? 0),
          ashramCount: Number(row.ashram_count ?? 0),
          enrollmentCount: Number(row.enrollment_count ?? 0),
        })),
        pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error("Course admin list error:", error);
      res.status(500).json({ success: false, error: "Unable to load course management data." });
    }
  },
);

router.get(
  "/stats",
  requireAuth,
  requireRole("sales", "super_admin"),
  (_req: Request, res: Response) => {
    try {
      const totals = db.prepare(`
        SELECT
          COUNT(*) AS courses,
          SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
          SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft,
          SUM(CASE WHEN status='unpublished' THEN 1 ELSE 0 END) AS unpublished,
          SUM(CASE WHEN featured=1 THEN 1 ELSE 0 END) AS featured
        FROM courses
      `).get() as Row;

      const enrollments = db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('received','confirmed','in_progress') THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) AS paid
        FROM bookings
        WHERE kind='course'
      `).get() as Row;

      const revenue = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN p.status IN ('paid','captured') THEN COALESCE(p.amount,0) ELSE 0 END),0) AS gross
        FROM payments p
        INNER JOIN bookings b ON b.id=p.booking_id
        WHERE b.kind='course'
      `).get() as Row;

      res.json({
        success: true,
        courses: {
          total: Number(totals?.courses ?? 0),
          published: Number(totals?.published ?? 0),
          draft: Number(totals?.draft ?? 0),
          unpublished: Number(totals?.unpublished ?? 0),
          featured: Number(totals?.featured ?? 0),
        },
        enrollments: {
          total: Number(enrollments?.total ?? 0),
          active: Number(enrollments?.active ?? 0),
          completed: Number(enrollments?.completed ?? 0),
          paid: Number(enrollments?.paid ?? 0),
        },
        grossRevenue: Number(revenue?.gross ?? 0),
      });
    } catch (error) {
      console.error("Course stats error:", error);
      res.status(500).json({ success: false, error: "Unable to load course statistics." });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Course detail / lessons / linked Ashrams                                   */
/* -------------------------------------------------------------------------- */

router.get("/:id", optionalAuth, (req: Request, res: Response) => {
  try {
    const course = getCourse(text(req.params.id, 180));
    if (!course) { res.status(404).json({ success: false, error: "Course not found." }); return; }

    const user = currentUser(res);
    const access = courseAccess(user, Number(course.id));
    const publicVisible = course.status === "published";
    const privateAdmin = user?.role === "super_admin";

    if (!publicVisible && !privateAdmin) {
      res.status(404).json({ success: false, error: "Course not found." });
      return;
    }

    const includePrivate = privateAdmin;
    res.json({
      success: true,
      course: serializeCourse(course, { includePrivate, access }),
      lessons: courseLessons(Number(course.id), access, privateAdmin),
      lessonAccess: access,
      ashrams: linkedAshrams(Number(course.id), privateAdmin || user?.role === "ashram_manager", user),
      seo: tableExists("seo_entries")
        ? db.prepare(`
            SELECT *
            FROM seo_entries
            WHERE entity_type='course' AND entity_id=? AND status='published'
            ORDER BY id DESC
            LIMIT 1
          `).get(Number(course.id)) ?? null
        : null,
      enrollment: user
        ? (() => {
            const booking = latestCourseBooking(user.id, Number(course.id));
            if (!booking) return null;
            return {
              bookingId: Number(booking.id),
              bookingNumber: booking.booking_number,
              status: booking.status,
              paymentStatus: booking.payment_status,
              amount: booking.amount == null ? null : Number(booking.amount),
              canAccessLessons: access === "enrolled" || access === "admin",
            };
          })()
        : null,
    });
  } catch (error) {
    console.error("Course detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load course details." });
  }
});

router.get("/:id/lessons", optionalAuth, (req: Request, res: Response) => {
  try {
    const course = getCourse(text(req.params.id, 180));
    if (!course) { res.status(404).json({ success: false, error: "Course not found." }); return; }

    const user = currentUser(res);
    const isAdmin = user?.role === "super_admin";
    if (course.status !== "published" && !isAdmin) {
      res.status(404).json({ success: false, error: "Course not found." });
      return;
    }

    const access = courseAccess(user, Number(course.id));
    res.json({
      success: true,
      courseId: Number(course.id),
      access,
      lessons: courseLessons(Number(course.id), access, isAdmin),
    });
  } catch (error) {
    console.error("Course lessons error:", error);
    res.status(500).json({ success: false, error: "Unable to load course lessons." });
  }
});

router.get("/:id/ashrams", optionalAuth, (req: Request, res: Response) => {
  try {
    const course = getCourse(text(req.params.id, 180));
    if (!course) { res.status(404).json({ success: false, error: "Course not found." }); return; }

    const user = currentUser(res);
    const isAdmin = user?.role === "super_admin";
    if (course.status !== "published" && !isAdmin) {
      res.status(404).json({ success: false, error: "Course not found." });
      return;
    }

    res.json({
      success: true,
      courseId: Number(course.id),
      ashrams: linkedAshrams(Number(course.id), isAdmin || user?.role === "ashram_manager", user),
    });
  } catch (error) {
    console.error("Course Ashram relation read error:", error);
    res.status(500).json({ success: false, error: "Unable to load linked Ashrams." });
  }
});

/* -------------------------------------------------------------------------- */
/* Enrollment                                                                  */
/* -------------------------------------------------------------------------- */

router.post("/:id/enroll", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUser(res);
    if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return; }
    if (["sales", "super_admin"].includes(user.role)) {
      res.status(403).json({ success: false, error: "Internal users should create operational course bookings through bookings.ts." });
      return;
    }

    const course = getCourse(text(req.params.id, 180));
    if (!course || course.status !== "published") {
      res.status(404).json({ success: false, error: "Course not found or not published." });
      return;
    }

    if (Number(course.enrollment_enabled ?? 0) !== 1) {
      res.status(409).json({ success: false, error: "Enrollment is currently disabled for this course." });
      return;
    }

    const existing = latestCourseBooking(user.id, Number(course.id));
    if (existing) {
      const access = courseAccess(user, Number(course.id));
      res.status(200).json({
        success: true,
        alreadyEnrolled: true,
        booking: {
          id: Number(existing.id),
          bookingNumber: existing.booking_number,
          status: existing.status,
          paymentStatus: existing.payment_status,
          amount: existing.amount == null ? null : Number(existing.amount),
        },
        access,
      });
      return;
    }

    const amount = course.price_amount == null ? 0 : Number(course.price_amount);
    const currency = text(course.currency ?? "INR", 3).toUpperCase() || "INR";
    if (!/^[A-Z]{3}$/.test(currency)) {
      res.status(500).json({ success: false, error: "Course currency configuration is invalid." });
      return;
    }

    const bookingNumber = `DD-COURSE-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const note = nullableText(bodyOf(req).message ?? bodyOf(req).notes, 10_000);
    const date = nullableText(bodyOf(req).date, 80);
    const time = nullableText(bodyOf(req).time, 80);
    const initialStatus = amount === 0 ? "confirmed" : "received";
    const initialPaymentStatus = amount === 0 ? "paid" : "unpaid";

    const bookingId = db.transaction(() => {
      const inserted = db.prepare(`
        INSERT INTO bookings (
          booking_number,
          user_id,
          course_id,
          kind,
          title,
          date,
          time,
          status,
          detail,
          amount,
          currency,
          payment_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 'course', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        bookingNumber,
        user.id,
        Number(course.id),
        `Course Enrollment — ${text(course.title, 220)}`,
        date,
        time,
        initialStatus,
        note,
        amount,
        currency,
        initialPaymentStatus,
      );

      return Number(inserted.lastInsertRowid);
    })();

    const booking = db.prepare(`SELECT * FROM bookings WHERE id=? LIMIT 1`).get(bookingId) as Row | undefined;
    audit(req, "course.enrolled", "course", Number(course.id), null, { bookingId, userId: user.id, amount, currency });

    res.status(201).json({
      success: true,
      enrolled: true,
      booking: booking ? {
        id: Number(booking.id),
        bookingNumber: booking.booking_number,
        courseId: Number(course.id),
        status: booking.status,
        paymentStatus: booking.payment_status,
        amount: booking.amount == null ? null : Number(booking.amount),
        currency: booking.currency,
      } : null,
      requiresPayment: amount > 0,
      paymentSource: amount > 0 ? "payments.ts" : null,
    });
  } catch (error) {
    console.error("Course enrollment error:", error);
    res.status(500).json({ success: false, error: "Unable to enroll in this course." });
  }
});

/* -------------------------------------------------------------------------- */
/* Super Admin course CMS                                                     */
/* -------------------------------------------------------------------------- */

router.post(
  "/",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const body = bodyOf(req);
      const title = text(body.title, 250);
      if (title.length < 2) {
        res.status(400).json({ success: false, error: "Course title must contain at least 2 characters." });
        return;
      }

      const location = validateLocation(positiveId(body.locationId));
      const deliveryMode = body.deliveryMode == null ? null : enumValue(body.deliveryMode, DELIVERY_MODES);
      if (body.deliveryMode != null && !deliveryMode) {
        res.status(400).json({ success: false, error: "Invalid course delivery mode." });
        return;
      }

      const status = enumValue(body.status ?? "draft", COURSE_STATUSES);
      if (!status) { res.status(400).json({ success: false, error: "Invalid course status." }); return; }

      const priceAmount = nonNegativeInteger(body.priceAmount, null, 1_000_000_000);
      const currency = text(body.currency ?? "INR", 3).toUpperCase() || "INR";
      if (!/^[A-Z]{3}$/.test(currency)) { res.status(400).json({ success: false, error: "Invalid currency." }); return; }

      const result = db.prepare(`
        INSERT INTO courses (
          slug,
          title,
          subtitle,
          category,
          level,
          short_description,
          description,
          instructor_name,
          instructor_bio,
          instructor_image,
          image,
          gallery_json,
          duration_text,
          sessions_text,
          fee_display,
          mode_text,
          schedule_text,
          eligibility_text,
          delivery_mode,
          price_amount,
          currency,
          certificate_available,
          curriculum_json,
          benefits_json,
          location_id,
          country_location_id,
          state_location_id,
          district_location_id,
          city_location_id,
          enrollment_enabled,
          status,
          featured,
          sort_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        uniqueSlug(body.slug, title),
        title,
        nullableText(body.subtitle, 500),
        nullableText(body.category, 150),
        nullableText(body.level, 100),
        nullableText(body.shortDescription, 5000),
        nullableText(body.description, MAX_TEXT),
        nullableText(body.instructorName, 250),
        nullableText(body.instructorBio, 10_000),
        nullableText(body.instructorImage, 4000),
        nullableText(body.image, 4000),
        jsonArray(body.gallery, 100),
        nullableText(body.durationText, 150),
        nullableText(body.sessionsText, 150),
        nullableText(body.feeDisplay, 150),
        nullableText(body.modeText, 150),
        nullableText(body.scheduleText, 1000),
        nullableText(body.eligibilityText, 3000),
        deliveryMode,
        priceAmount,
        currency,
        booleanValue(body.certificateAvailable, false) ? 1 : 0,
        jsonArray(body.curriculum, 200),
        jsonArray(body.benefits, 200),
        location.locationId,
        location.countryId,
        location.stateId,
        location.districtId,
        location.cityId,
        booleanValue(body.enrollmentEnabled, true) ? 1 : 0,
        status,
        booleanValue(body.featured, false) ? 1 : 0,
        integerInRange(body.sortOrder, 0, 0, 100000),
      );

      const id = Number(result.lastInsertRowid);
      const created = getCourse(String(id));
      audit(req, "course.created", "course", id, null, created);

      res.status(201).json({ success: true, course: created ? serializeCourse(created, { includePrivate: true, access: "admin" }) : null });
    } catch (error) {
      console.error("Course create error:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Selected location")) { res.status(400).json({ success: false, error: message }); return; }
      res.status(500).json({ success: false, error: "Unable to create course." });
    }
  },
);

router.patch(
  "/:id",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const courseId = positiveId(req.params.id);
      if (!courseId) { res.status(400).json({ success: false, error: "Invalid course id." }); return; }
      const existing = getCourse(String(courseId));
      if (!existing) { res.status(404).json({ success: false, error: "Course not found." }); return; }

      const body = bodyOf(req);
      const updates: string[] = [];
      const values: unknown[] = [];
      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

      const textFields: Array<[string, string, number]> = [
        ["title", "title", 250], ["subtitle", "subtitle", 500], ["category", "category", 150],
        ["level", "level", 100], ["shortDescription", "short_description", 5000], ["description", "description", MAX_TEXT],
        ["instructorName", "instructor_name", 250], ["instructorBio", "instructor_bio", 10000],
        ["instructorImage", "instructor_image", 4000], ["image", "image", 4000], ["durationText", "duration_text", 150],
        ["sessionsText", "sessions_text", 150], ["feeDisplay", "fee_display", 150], ["modeText", "mode_text", 150],
        ["scheduleText", "schedule_text", 1000], ["eligibilityText", "eligibility_text", 3000],
      ];

      for (const [input, column, max] of textFields) {
        if (!has(input)) continue;
        const value = input === "title" ? text(body[input], max) : nullableText(body[input], max);
        if (input === "title" && !value) { res.status(400).json({ success: false, error: "Course title cannot be empty." }); return; }
        updates.push(`${column}=?`); values.push(value);
      }

      if (has("slug")) {
        const title = text(body.title ?? existing.title, 250);
        updates.push("slug=?"); values.push(uniqueSlug(body.slug, title, courseId));
      }

      if (has("gallery")) { updates.push("gallery_json=?"); values.push(jsonArray(body.gallery, 100)); }
      if (has("curriculum")) { updates.push("curriculum_json=?"); values.push(jsonArray(body.curriculum, 200)); }
      if (has("benefits")) { updates.push("benefits_json=?"); values.push(jsonArray(body.benefits, 200)); }

      if (has("deliveryMode")) {
        const mode = body.deliveryMode == null || body.deliveryMode === "" ? null : enumValue(body.deliveryMode, DELIVERY_MODES);
        if (body.deliveryMode != null && body.deliveryMode !== "" && !mode) { res.status(400).json({ success: false, error: "Invalid course delivery mode." }); return; }
        updates.push("delivery_mode=?"); values.push(mode);
      }

      if (has("priceAmount")) {
        const price = nonNegativeInteger(body.priceAmount, null, 1_000_000_000);
        if (body.priceAmount !== null && body.priceAmount !== "" && price === null) { res.status(400).json({ success: false, error: "Invalid course price." }); return; }
        updates.push("price_amount=?"); values.push(price);
      }

      if (has("currency")) {
        const currency = text(body.currency, 3).toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) { res.status(400).json({ success: false, error: "Invalid currency." }); return; }
        updates.push("currency=?"); values.push(currency);
      }

      if (has("certificateAvailable")) { updates.push("certificate_available=?"); values.push(booleanValue(body.certificateAvailable) ? 1 : 0); }
      if (has("enrollmentEnabled")) { updates.push("enrollment_enabled=?"); values.push(booleanValue(body.enrollmentEnabled, true) ? 1 : 0); }
      if (has("featured")) { updates.push("featured=?"); values.push(booleanValue(body.featured) ? 1 : 0); }
      if (has("sortOrder")) { updates.push("sort_order=?"); values.push(integerInRange(body.sortOrder, 0, 0, 100000)); }

      if (has("status")) {
        const status = enumValue(body.status, COURSE_STATUSES);
        if (!status) { res.status(400).json({ success: false, error: "Invalid course status." }); return; }
        updates.push("status=?"); values.push(status);
      }

      if (has("locationId")) {
        const location = validateLocation(positiveId(body.locationId));
        updates.push("location_id=?", "country_location_id=?", "state_location_id=?", "district_location_id=?", "city_location_id=?");
        values.push(location.locationId, location.countryId, location.stateId, location.districtId, location.cityId);
      }

      if (!updates.length) { res.status(400).json({ success: false, error: "No supported course fields were supplied." }); return; }

      updates.push("updated_at=CURRENT_TIMESTAMP");
      values.push(courseId);
      db.prepare(`UPDATE courses SET ${updates.join(", ")} WHERE id=?`).run(...values);

      const updated = getCourse(String(courseId));
      audit(req, "course.updated", "course", courseId, existing, updated);
      res.json({ success: true, course: updated ? serializeCourse(updated, { includePrivate: true, access: "admin" }) : null });
    } catch (error) {
      console.error("Course update error:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Selected location")) { res.status(400).json({ success: false, error: message }); return; }
      res.status(500).json({ success: false, error: "Unable to update course." });
    }
  },
);

router.delete(
  "/:id",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const courseId = positiveId(req.params.id);
      if (!courseId) { res.status(400).json({ success: false, error: "Invalid course id." }); return; }
      const existing = getCourse(String(courseId));
      if (!existing) { res.status(404).json({ success: false, error: "Course not found." }); return; }

      db.prepare(`
        UPDATE courses
        SET status='unpublished', enrollment_enabled=0, featured=0, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(courseId);

      const updated = getCourse(String(courseId));
      audit(req, "course.unpublished", "course", courseId, existing, updated);
      res.json({ success: true, archived: true, course: updated ? serializeCourse(updated, { includePrivate: true, access: "admin" }) : null });
    } catch (error) {
      console.error("Course archive error:", error);
      res.status(500).json({ success: false, error: "Unable to unpublish course." });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Lessons CMS                                                                */
/* -------------------------------------------------------------------------- */

router.post(
  "/:id/lessons",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const courseId = positiveId(req.params.id);
      if (!courseId) { res.status(400).json({ success: false, error: "Invalid course id." }); return; }
      if (!getCourse(String(courseId))) { res.status(404).json({ success: false, error: "Course not found." }); return; }

      const body = bodyOf(req);
      const title = text(body.title, 250);
      if (!title) { res.status(400).json({ success: false, error: "Lesson title is required." }); return; }

      const lessonNumber = integerInRange(body.lessonNumber, 1, 1, 1_000_000);
      const durationMinutes = nonNegativeInteger(body.durationMinutes, null, 100_000);
      const isPreview = booleanValue(body.isPreview, false) ? 1 : 0;
      const isActive = booleanValue(body.isActive, true) ? 1 : 0;
      const sortOrder = integerInRange(body.sortOrder, lessonNumber, 0, 1_000_000);

      const duplicateNumber = db.prepare(`
        SELECT id FROM course_lessons WHERE course_id=? AND lesson_number=? LIMIT 1
      `).get(courseId, lessonNumber);
      if (duplicateNumber) { res.status(409).json({ success: false, error: "This lesson number already exists for the course." }); return; }

      const result = db.prepare(`
        INSERT INTO course_lessons (
          course_id,
          lesson_number,
          title,
          description,
          video_url,
          duration_minutes,
          is_preview,
          is_active,
          sort_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        courseId,
        lessonNumber,
        title,
        nullableText(body.description, 10000),
        nullableText(body.videoUrl, 4000),
        durationMinutes,
        isPreview,
        isActive,
        sortOrder,
      );

      const id = Number(result.lastInsertRowid);
      const created = db.prepare(`SELECT * FROM course_lessons WHERE id=? LIMIT 1`).get(id) as Row | undefined;
      audit(req, "course.lesson_created", "course_lesson", id, null, created);

      res.status(201).json({ success: true, lesson: created ? serializeLesson(created, "admin") : null });
    } catch (error) {
      console.error("Course lesson create error:", error);
      res.status(500).json({ success: false, error: "Unable to create course lesson." });
    }
  },
);

router.patch(
  "/:id/lessons/:lessonId",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const courseId = positiveId(req.params.id);
      const lessonId = positiveId(req.params.lessonId);
      if (!courseId || !lessonId) { res.status(400).json({ success: false, error: "Invalid course or lesson id." }); return; }

      const existing = db.prepare(`
        SELECT * FROM course_lessons WHERE id=? AND course_id=? LIMIT 1
      `).get(lessonId, courseId) as Row | undefined;
      if (!existing) { res.status(404).json({ success: false, error: "Course lesson not found." }); return; }

      const body = bodyOf(req);
      const updates: string[] = [];
      const values: unknown[] = [];
      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

      if (has("lessonNumber")) {
        const lessonNumber = integerInRange(body.lessonNumber, Number(existing.lesson_number ?? 1), 1, 1_000_000);
        const duplicate = db.prepare(`
          SELECT id FROM course_lessons WHERE course_id=? AND lesson_number=? AND id<>? LIMIT 1
        `).get(courseId, lessonNumber, lessonId);
        if (duplicate) { res.status(409).json({ success: false, error: "This lesson number already exists for the course." }); return; }
        updates.push("lesson_number=?"); values.push(lessonNumber);
      }

      if (has("title")) {
        const title = text(body.title, 250);
        if (!title) { res.status(400).json({ success: false, error: "Lesson title cannot be empty." }); return; }
        updates.push("title=?"); values.push(title);
      }
      if (has("description")) { updates.push("description=?"); values.push(nullableText(body.description, 10000)); }
      if (has("videoUrl")) { updates.push("video_url=?"); values.push(nullableText(body.videoUrl, 4000)); }
      if (has("durationMinutes")) { updates.push("duration_minutes=?"); values.push(nonNegativeInteger(body.durationMinutes, null, 100000)); }
      if (has("isPreview")) { updates.push("is_preview=?"); values.push(booleanValue(body.isPreview) ? 1 : 0); }
      if (has("isActive")) { updates.push("is_active=?"); values.push(booleanValue(body.isActive, true) ? 1 : 0); }
      if (has("sortOrder")) { updates.push("sort_order=?"); values.push(integerInRange(body.sortOrder, 0, 0, 1000000)); }

      if (!updates.length) { res.status(400).json({ success: false, error: "No supported lesson fields were supplied." }); return; }
      updates.push("updated_at=CURRENT_TIMESTAMP");
      values.push(lessonId, courseId);

      db.prepare(`UPDATE course_lessons SET ${updates.join(", ")} WHERE id=? AND course_id=?`).run(...values);
      const updated = db.prepare(`SELECT * FROM course_lessons WHERE id=? LIMIT 1`).get(lessonId) as Row | undefined;
      audit(req, "course.lesson_updated", "course_lesson", lessonId, existing, updated);

      res.json({ success: true, lesson: updated ? serializeLesson(updated, "admin") : null });
    } catch (error) {
      console.error("Course lesson update error:", error);
      res.status(500).json({ success: false, error: "Unable to update course lesson." });
    }
  },
);

router.delete(
  "/:id/lessons/:lessonId",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const courseId = positiveId(req.params.id);
      const lessonId = positiveId(req.params.lessonId);
      if (!courseId || !lessonId) { res.status(400).json({ success: false, error: "Invalid course or lesson id." }); return; }

      const existing = db.prepare(`SELECT * FROM course_lessons WHERE id=? AND course_id=? LIMIT 1`).get(lessonId, courseId) as Row | undefined;
      if (!existing) { res.status(404).json({ success: false, error: "Course lesson not found." }); return; }

      db.prepare(`UPDATE course_lessons SET is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=? AND course_id=?`).run(lessonId, courseId);
      const updated = db.prepare(`SELECT * FROM course_lessons WHERE id=? LIMIT 1`).get(lessonId) as Row | undefined;
      audit(req, "course.lesson_unpublished", "course_lesson", lessonId, existing, updated);

      res.json({ success: true, deleted: true, lesson: updated ? serializeLesson(updated, "admin") : null });
    } catch (error) {
      console.error("Course lesson archive error:", error);
      res.status(500).json({ success: false, error: "Unable to archive course lesson." });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Admin enrollment read                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  "/:id/enrollments",
  requireAuth,
  requirePermission("admin.manage_courses"),
  (req: Request, res: Response) => {
    try {
      const courseId = positiveId(req.params.id);
      if (!courseId) { res.status(400).json({ success: false, error: "Invalid course id." }); return; }
      if (!getCourse(String(courseId))) { res.status(404).json({ success: false, error: "Course not found." }); return; }

      const page = integerInRange(req.query.page, 1, 1, 100000);
      const limit = integerInRange(req.query.limit, 50, 1, MAX_LIST_LIMIT);
      const offset = (page - 1) * limit;
      const where: string[] = ["b.course_id=?", "b.kind='course'"];
      const params: unknown[] = [courseId];

      const status = enumValue(req.query.status, ["received", "confirmed", "in_progress", "completed", "cancelled", "rejected"] as const);
      if (status) { where.push("b.status=?"); params.push(status); }

      const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM bookings b WHERE ${where.join(" AND ")}`).get(...params) as { count?: number } | undefined;
      const total = Number(totalRow?.count ?? 0);

      const rows = db.prepare(`
        SELECT
          b.id,
          b.booking_number,
          b.user_id,
          b.status,
          b.payment_status,
          b.amount,
          b.currency,
          b.date,
          b.time,
          b.detail,
          b.created_at,
          b.updated_at,
          u.name AS customer_name,
          u.email AS customer_email,
          u.phone AS customer_phone
        FROM bookings b
        LEFT JOIN users u ON u.id=b.user_id
        WHERE ${where.join(" AND ")}
        ORDER BY b.id DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Row[];

      res.json({
        success: true,
        enrollments: rows.map((row) => ({
          id: Number(row.id),
          bookingNumber: row.booking_number,
          userId: row.user_id == null ? null : Number(row.user_id),
          customer: {
            name: row.customer_name ?? null,
            email: row.customer_email ?? null,
            phone: row.customer_phone ?? null,
          },
          status: row.status,
          paymentStatus: row.payment_status,
          amount: row.amount == null ? null : Number(row.amount),
          currency: row.currency,
          date: row.date ?? null,
          time: row.time ?? null,
          detail: row.detail ?? null,
          createdAt: row.created_at ?? null,
          updatedAt: row.updated_at ?? null,
        })),
        pagination: { page, limit, offset, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error("Course enrollment list error:", error);
      res.status(500).json({ success: false, error: "Unable to load course enrollments." });
    }
  },
);

export { router as courseRouter, router as courseRoutes };
export default router;
