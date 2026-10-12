/* eslint-disable prefer-const */
import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/database.ts";
import { optionalAuth, requireAuth, requireRole, type AuthenticatedUser, } from "./auth.ts";
const router = Router();
type SqlRow = Record<string, unknown>;
type AnalyticsUser = AuthenticatedUser | undefined;
type LocationContext = {
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
type AnalyticsContext = {
    visitorId: number;
    visitorKey: string;
    sessionId: number;
    sessionKey: string;
    trackingAllowed: boolean;
};
type SessionRow = {
    id: number;
    session_key: string;
    visitor_id: number;
    user_id: number | null;
    started_at: string;
    ended_at: string | null;
    last_activity_at: string;
    page_views: number;
    event_count: number;
    duration_seconds: number;
    engaged: number;
    is_bounce: number;
    is_bot: number;
};
type PageViewRow = {
    id: number;
    visitor_id: number;
    session_id: number;
    entered_at: string;
    exited_at: string | null;
    path: string;
    entity_type?: string | null;
    entity_id?: number | null;
};
type OwnerScope = {
    panditIds: number[];
    templeIds: number[];
    ashramIds: number[];
    analyticsLevel: "basic" | "advanced";
};
const VISITOR_COOKIE = sanitizeCookieName(process.env.ANALYTICS_VISITOR_COOKIE || "divyadhara_visitor");
const SESSION_COOKIE = sanitizeCookieName(process.env.ANALYTICS_SESSION_COOKIE || "divyadhara_analytics_session");
const SESSION_MINUTES = positiveInteger(process.env.ANALYTICS_SESSION_MINUTES, 30);
const VISITOR_COOKIE_DAYS = positiveInteger(process.env.ANALYTICS_VISITOR_COOKIE_DAYS, 730);
const EVENT_MAX_BODY = positiveInteger(process.env.ANALYTICS_MAX_EVENT_PAYLOAD, 30000);
const ANALYTICS_REQUIRE_CONSENT = normalizeBooleanEnv(process.env.ANALYTICS_REQUIRE_CONSENT, false);
const ANALYTICS_IP_SALT = process.env.ANALYTICS_IP_SALT || "divyadhara-analytics";
const RATE_WINDOW_MINUTES = positiveInteger(process.env.ANALYTICS_RATE_LIMIT_WINDOW_MINUTES, 1);
const RATE_LIMIT_COUNT = positiveInteger(process.env.ANALYTICS_RATE_LIMIT_COUNT, 240);
const RATE_LIMITS = {
    consent: positiveInteger(process.env.ANALYTICS_CONSENT_RATE_LIMIT_COUNT, 30),
    visit: positiveInteger(process.env.ANALYTICS_VISIT_RATE_LIMIT_COUNT, 120),
    pageView: positiveInteger(process.env.ANALYTICS_PAGE_VIEW_RATE_LIMIT_COUNT, 240),
    pageViewUpdate: positiveInteger(process.env.ANALYTICS_PAGE_VIEW_UPDATE_RATE_LIMIT_COUNT, 180),
    event: positiveInteger(process.env.ANALYTICS_EVENT_RATE_LIMIT_COUNT, 180),
    search: positiveInteger(process.env.ANALYTICS_SEARCH_RATE_LIMIT_COUNT, 60),
    heartbeat: positiveInteger(process.env.ANALYTICS_HEARTBEAT_RATE_LIMIT_COUNT, 120),
    sessionEnd: positiveInteger(process.env.ANALYTICS_SESSION_END_RATE_LIMIT_COUNT, 30),
    conversion: positiveInteger(process.env.ANALYTICS_CONVERSION_RATE_LIMIT_COUNT, 60),
};
const MAX_REPORT_DAYS = positiveInteger(process.env.ANALYTICS_MAX_REPORT_DAYS, 366);
const OWNER_MAX_DAYS = positiveInteger(process.env.ANALYTICS_OWNER_MAX_REPORT_DAYS, 180);
const DEFAULT_CONSENT_VERSION = normalizeText(process.env.ANALYTICS_CONSENT_VERSION || "v1", 80) || "v1";
const rateMap = new Map<string, {
    count: number;
    startedAt: number;
}>();
function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function sanitizeCookieName(value: string): string {
    return value.replace(/[^A-Za-z0-9_-]/g, "_");
}
function normalizeBooleanEnv(value: string | undefined, fallback: boolean): boolean {
    if (!value)
        return fallback;
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(v))
        return true;
    if (["0", "false", "no", "off"].includes(v))
        return false;
    return fallback;
}
function normalizeText(value: unknown, maxLength = 500): string {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function nullableText(value: unknown, maxLength = 500): string | null {
    const text = normalizeText(value, maxLength);
    return text || null;
}
function idOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === "")
        return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function boundedInteger(value: unknown, fallback = 0, min = 0, max = 1000000): number {
    if (value === null || value === undefined || value === "")
        return fallback;
    const n = Number(String(value).replace(/,/g, "").trim());
    if (!Number.isFinite(n))
        return fallback;
    const integer = Math.floor(n);
    return integer >= min && integer <= max ? integer : fallback;
}
function boundedNumber(value: unknown, fallback: number | null = null, min = 0, max = 1000000000): number | null {
    if (value === null || value === undefined || value === "")
        return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
function boolValue(value: unknown, fallback = false): boolean {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    const v = normalizeText(value, 20).toLowerCase();
    if (["1", "true", "yes", "on"].includes(v))
        return true;
    if (["0", "false", "no", "off"].includes(v))
        return false;
    return fallback;
}
function jsonString(value: unknown, maxLength = EVENT_MAX_BODY): string {
    try {
        const serialized = JSON.stringify(value ?? {});
        if (serialized.length <= maxLength)
            return serialized;
        return JSON.stringify({
            __truncated: true,
            preview: serialized.slice(0, Math.max(0, maxLength - 120)),
        });
    }
    catch {
        return "{}";
    }
}
function currentUser(res: Response): AnalyticsUser {
    return res.locals.user as AuthenticatedUser | undefined;
}
function userVisitorType(user: AnalyticsUser, isBotRequest: boolean): string {
    if (isBotRequest)
        return "bot";
    if (!user)
        return "anonymous";
    switch (user.role) {
        case "pandit": return "pandit";
        case "temple_manager": return "temple_manager";
        case "ashram_manager": return "ashram_manager";
        case "sales": return "sales";
        case "super_admin": return "super_admin";
        case "visitor": return "registered";
        default: return "registered";
    }
}
function sendError(res: Response, status: number, error: string): void {
    res.status(status).json({ success: false, error });
}
function isValidDateOnly(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function tableExists(table: string): boolean {
    const safe = normalizeText(table, 100);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(safe))
        return false;
    const row = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`).get(safe) as {
        ok?: number;
    } | undefined;
    return Boolean(row?.ok);
}
function columnExists(table: string, column: string): boolean {
    if (!tableExists(table))
        return false;
    const rows = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all() as Array<{
        name?: string;
    }>;
    return rows.some((row) => row.name === column);
}
function requestId(req: Request): string | null {
    const value = req.get("x-request-id") || req.get("x-correlation-id");
    return nullableText(value, 200);
}
function clientIp(req: Request): string | null {
    return nullableText(req.ip, 100);
}
function userAgent(req: Request): string {
    return (req.get("user-agent") || "").slice(0, 1000);
}
function requestHeaderText(req: Request, names: string[], maxLength = 120): string | null {
    for (const name of names) {
        const value = req.get(name);
        if (value) {
            const first = value.split(",")[0].trim();
            if (first)
                return first.slice(0, maxLength);
        }
    }
    return null;
}
function timezoneFromRequest(req: Request): string | null {
    const tz = requestHeaderText(req, ["x-timezone", "x-client-timezone", "x-user-timezone", "cf-timezone"], 80);
    return tz && /^[A-Za-z0-9_+./:-]{1,80}$/.test(tz) ? tz : null;
}
function isBot(req: Request): boolean {
    const ua = userAgent(req).toLowerCase();
    return /(bot|crawler|spider|slurp|bingpreview|headless|lighthouse|semrush|ahrefs|petalbot|facebookexternalhit|meta-externalagent|google-inspectiontool)/i.test(ua);
}
function deviceFromRequest(req: Request): string | null {
    const explicit = requestHeaderText(req, ["x-device-type", "x-client-device-type"], 40)?.toLowerCase();
    if (explicit && ["mobile", "tablet", "desktop", "bot"].includes(explicit))
        return explicit;
    const ua = userAgent(req);
    if (!ua)
        return null;
    if (isBot(req))
        return "bot";
    if (/ipad|tablet|playbook|silk/i.test(ua))
        return "tablet";
    if (/mobi|android|iphone|ipod|windows phone|opera mini|opera mobi/i.test(ua))
        return "mobile";
    return "desktop";
}
function browserFromRequest(req: Request): string | null {
    const explicit = requestHeaderText(req, ["x-browser", "x-client-browser"], 80);
    if (explicit)
        return explicit;
    const ua = userAgent(req);
    if (!ua)
        return null;
    if (/googlebot/i.test(ua))
        return "Googlebot";
    if (/edg\//i.test(ua))
        return "Edge";
    if (/opr\//i.test(ua) || /opera/i.test(ua))
        return "Opera";
    if (/firefox\//i.test(ua))
        return "Firefox";
    if (/chrome\//i.test(ua) && !/edg\//i.test(ua))
        return "Chrome";
    if (/safari\//i.test(ua) && !/chrome\//i.test(ua) && !/android/i.test(ua))
        return "Safari";
    if (/msie |trident\//i.test(ua))
        return "Internet Explorer";
    return "Other";
}
function osFromRequest(req: Request): string | null {
    const explicit = requestHeaderText(req, ["x-operating-system", "x-os", "x-client-os"], 80);
    if (explicit)
        return explicit;
    const ua = userAgent(req);
    if (!ua)
        return null;
    if (/windows nt/i.test(ua))
        return "Windows";
    if (/iphone|ipad|ipod/i.test(ua))
        return "iOS";
    if (/android/i.test(ua))
        return "Android";
    if (/mac os x|macintosh/i.test(ua))
        return "macOS";
    if (/cros/i.test(ua))
        return "ChromeOS";
    if (/linux/i.test(ua))
        return "Linux";
    return "Other";
}
function ipHash(req: Request): string | null {
    const ip = clientIp(req);
    return ip ? createHash("sha256").update(`${ANALYTICS_IP_SALT}:${ip}`).digest("hex") : null;
}
function readCookie(req: Request, name: string): string | null {
    const header = req.headers.cookie;
    if (!header)
        return null;
    for (const chunk of header.split(";")) {
        const separator = chunk.indexOf("=");
        if (separator < 0)
            continue;
        if (chunk.slice(0, separator).trim() !== name)
            continue;
        const raw = chunk.slice(separator + 1).trim();
        if (!raw)
            return null;
        try {
            return decodeURIComponent(raw);
        }
        catch {
            return raw;
        }
    }
    return null;
}
function isSecureRequest(req: Request): boolean {
    const forwardedProto = (req.get("x-forwarded-proto") || "")
        .split(",")[0]
        .trim()
        .toLowerCase();
    return Boolean(req.secure) || forwardedProto === "https";
}

function appendCookie(req: Request, res: Response, name: string, value: string, maxAge: number, httpOnly = true): void {
    const parts = [
        `${name}=${encodeURIComponent(value)}`,
        "Path=/",
        "SameSite=Lax",
        `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    ];
    if (httpOnly)
        parts.push("HttpOnly");
    // Set Secure only when the current request is actually HTTPS. This prevents
    // localhost HTTP development from silently losing the analytics session cookie
    // when NODE_ENV happens to be "production".
    if (isSecureRequest(req))
        parts.push("Secure");
    res.append("Set-Cookie", parts.join("; "));
}
function clearAnalyticsCookies(req: Request, res: Response): void {
    appendCookie(req, res, VISITOR_COOKIE, "", 0, true);
    appendCookie(req, res, SESSION_COOKIE, "", 0, true);
}
function rateAllowed(req: Request, bucket = "default", limit = RATE_LIMIT_COUNT): boolean {
    // Keep endpoint buckets independent so normal heartbeats cannot consume the
    // same quota as page navigation or analytics events.
    const key = `${ipHash(req) || "unknown"}:${bucket}`;
    const now = Date.now();
    const windowMs = RATE_WINDOW_MINUTES * 60 * 1000;

    // This is an in-process limiter. Expire stale keys to prevent unbounded growth
    // on a long-running Node process. Multi-instance deployments should additionally
    // use a shared Redis-backed limiter at the gateway/application layer.
    if (rateMap.size > 5000) {
        for (const [mapKey, value] of rateMap) {
            if (now - value.startedAt >= windowMs) rateMap.delete(mapKey);
        }
        if (rateMap.size > 10000) {
            const excess = rateMap.size - 10000;
            let removed = 0;
            for (const mapKey of rateMap.keys()) {
                rateMap.delete(mapKey);
                if (++removed >= excess) break;
            }
        }
    }

    const existing = rateMap.get(key);
    if (!existing || now - existing.startedAt >= windowMs) {
        rateMap.set(key, { count: 1, startedAt: now });
        return true;
    }
    if (existing.count >= limit) return false;
    existing.count += 1;
    return true;
}
function rateLimitResponse(res: Response): void {
    res.setHeader("Retry-After", String(RATE_WINDOW_MINUTES * 60));
    sendError(res, 429, "Analytics rate limit exceeded.");
}
function trackingAllowed(body: SqlRow): boolean {
    if (Object.prototype.hasOwnProperty.call(body, "analyticsConsent") || Object.prototype.hasOwnProperty.call(body, "analytics_consent")) {
        return boolValue(body.analyticsConsent ?? body.analytics_consent, false);
    }
    if (ANALYTICS_REQUIRE_CONSENT)
        return false;
    return true;
}
function resolveLocation(body: SqlRow): LocationContext {
    const context: LocationContext = {
        country: nullableText(body.country, 100),
        state: nullableText(body.state, 120),
        district: nullableText(body.district, 120),
        city: nullableText(body.city, 120),
        area: nullableText(body.area, 150),
        locationId: idOrNull(body.locationId),
        countryId: idOrNull(body.countryId),
        stateId: idOrNull(body.stateId),
        districtId: idOrNull(body.districtId),
        cityId: idOrNull(body.cityId),
        areaId: idOrNull(body.areaId),
    };
    if (!context.locationId) {
        context.locationId = context.areaId || context.cityId || context.districtId || context.stateId || context.countryId;
    }
    let currentId = context.locationId;
    let guard = 0;
    while (currentId && guard < 10) {
        guard += 1;
        const row = db.prepare(`SELECT id, parent_id, type, name FROM locations WHERE id=? LIMIT 1`).get(currentId) as {
            id: number;
            parent_id: number | null;
            type: string;
            name: string;
        } | undefined;
        if (!row)
            break;
        switch (row.type) {
            case "country":
                context.countryId = row.id;
                context.country = row.name;
                break;
            case "state":
                context.stateId = row.id;
                context.state = row.name;
                break;
            case "district":
                context.districtId = row.id;
                context.district = row.name;
                break;
            case "city":
                context.cityId = row.id;
                context.city = row.name;
                break;
            case "area":
                context.areaId = row.id;
                context.area = row.name;
                break;
            default: break;
        }
        currentId = row.parent_id;
    }
    return context;
}
function pageType(path: string, explicit: unknown): string {
    const provided = nullableText(explicit, 100);
    if (provided)
        return provided;
    if (!path || path === "/")
        return "home";
    const patterns: Array<[
        string,
        string
    ]> = [
        ["/temples", "temples"], ["/pandits", "pandits"], ["/services", "puja_services"],
        ["/puja-services", "puja_services"], ["/ashrams", "ashrams"], ["/packages", "yatra_packages"],
        ["/yatras", "yatra_packages"], ["/travel", "yatra_packages"], ["/spiritual-places", "spiritual_places"],
        ["/events", "events"], ["/gallery", "gallery"], ["/videos", "videos"], ["/courses", "courses"],
        ["/articles", "articles"], ["/panchang", "panchang"], ["/calendar", "calendar"], ["/rashifal", "rashifal"],
        ["/kundli", "kundli"], ["/locations", "location"], ["/dashboard", "dashboard"], ["/subscription", "subscriptions"],
    ];
    for (const [prefix, type] of patterns)
        if (path === prefix || path.startsWith(`${prefix}/`))
            return type;
    return "page";
}
type RouteEntity = {
    entityType: string | null;
    entityId: number | null;
    entitySlug: string | null;
};
function inferEntityFromPath(path: string): RouteEntity {
    const normalized = path.split("?")[0].replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const mappings: Array<{
        prefix: string;
        entityType: string;
        table: string;
    }> = [
        { prefix: "/temples/", entityType: "temple", table: "temples" },
        { prefix: "/pandits/", entityType: "pandit", table: "pandit_profiles" },
        { prefix: "/ashrams/", entityType: "ashram", table: "ashrams" },
        { prefix: "/services/", entityType: "puja_service", table: "puja_services" },
        { prefix: "/puja-services/", entityType: "puja_service", table: "puja_services" },
        { prefix: "/packages/", entityType: "yatra", table: "yatra_packages" },
        { prefix: "/yatras/", entityType: "yatra", table: "yatra_packages" },
        { prefix: "/travel/", entityType: "yatra", table: "yatra_packages" },
        { prefix: "/spiritual-places/", entityType: "spiritual_place", table: "spiritual_places" },
        { prefix: "/events/", entityType: "event", table: "events" },
        { prefix: "/courses/", entityType: "course", table: "courses" },
        { prefix: "/articles/", entityType: "article", table: "articles" },
    ];
    for (const mapping of mappings) {
        if (!normalized.startsWith(mapping.prefix) || !tableExists(mapping.table))
            continue;
        const slug = normalized.slice(mapping.prefix.length).split("/")[0].trim();
        if (!slug)
            return { entityType: mapping.entityType, entityId: null, entitySlug: null };
        if (!columnExists(mapping.table, "slug"))
            return { entityType: mapping.entityType, entityId: null, entitySlug: slug };
        const row = db.prepare(`SELECT id FROM ${mapping.table} WHERE slug=? LIMIT 1`).get(slug) as {
            id?: number;
        } | undefined;
        return { entityType: mapping.entityType, entityId: row?.id ?? null, entitySlug: slug };
    }
    return { entityType: null, entityId: null, entitySlug: null };
}
function loadSession(sessionKey: string): SessionRow | undefined {
    return db.prepare(`SELECT id, session_key, visitor_id, user_id, started_at, ended_at, last_activity_at, page_views, event_count, duration_seconds, engaged, is_bounce, is_bot FROM web_sessions WHERE session_key=? LIMIT 1`).get(sessionKey) as SessionRow | undefined;
}
function elapsedSecondsSince(value: unknown): number {
    const parsed = safeDate(value);
    if (!parsed) return 0;
    return Math.min(86400, Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000)));
}
function createVisitor(req: Request, res: Response, body: SqlRow, user: AnalyticsUser, location: LocationContext, path: string | null, referrer: string | null, tracking: boolean, bot: boolean): {
    id: number;
    visitorKey: string;
} {
    const requestedKey = nullableText(readCookie(req, VISITOR_COOKIE), 150);
    const visitorKey = requestedKey || `v_${randomBytes(24).toString("hex")}`;
    const existing = db.prepare(`SELECT id, visitor_key, tracking_status FROM web_visitors WHERE visitor_key=? LIMIT 1`).get(visitorKey) as {
        id: number;
        visitor_key: string;
        tracking_status: string;
    } | undefined;
    const language = nullableText(body.language ?? req.get("accept-language"), 80);
    const timezone = nullableText(body.timezone ?? timezoneFromRequest(req), 80);
    const device = nullableText(body.deviceType ?? deviceFromRequest(req), 40);
    const browser = nullableText(body.browser ?? browserFromRequest(req), 80);
    const os = nullableText(body.operatingSystem ?? osFromRequest(req), 80);
    const ip = ipHash(req);
    const marketingConsent = boolValue(body.marketingConsent ?? body.marketing_consent, false);
    const analyticsConsent = tracking ? 1 : 0;
    const consentVersion = nullableText(body.consentVersion ?? body.consent_version, 80) || DEFAULT_CONSENT_VERSION;
    const consentSource = nullableText(body.consentSource ?? body.consent_source, 80) || "web";
    const status = bot ? "bot" : tracking ? "active" : "opted_out";
    if (existing) {
        db.prepare(`
      UPDATE web_visitors
         SET user_id=COALESCE(?,user_id), visitor_type=?, tracking_status=?,
             last_seen_at=CURRENT_TIMESTAMP, last_activity_at=CURRENT_TIMESTAMP,
             last_page_path=COALESCE(?,last_page_path), last_referrer_url=COALESCE(?,last_referrer_url),
             first_utm_source=COALESCE(first_utm_source,?), first_utm_medium=COALESCE(first_utm_medium,?), first_utm_campaign=COALESCE(first_utm_campaign,?),
             first_utm_term=COALESCE(first_utm_term,?), first_utm_content=COALESCE(first_utm_content,?),
             country=CASE WHEN ?=1 THEN COALESCE(?,country) ELSE country END,
             state=CASE WHEN ?=1 THEN COALESCE(?,state) ELSE state END,
             district=CASE WHEN ?=1 THEN COALESCE(?,district) ELSE district END,
             city=CASE WHEN ?=1 THEN COALESCE(?,city) ELSE city END,
             language=COALESCE(?,language), timezone=COALESCE(?,timezone), device_type=COALESCE(?,device_type),
             browser=COALESCE(?,browser), operating_system=COALESCE(?,operating_system), ip_hash=COALESCE(?,ip_hash),
             marketing_consent=CASE WHEN ?=1 THEN 1 ELSE marketing_consent END,
             analytics_consent=CASE WHEN ?=1 THEN 1 ELSE analytics_consent END,
             analytics_consent_at=CASE WHEN ?=1 THEN COALESCE(analytics_consent_at,CURRENT_TIMESTAMP) ELSE analytics_consent_at END,
             consent_source=CASE WHEN ?=1 THEN ? ELSE consent_source END,
             consent_version=CASE WHEN ?=1 THEN ? ELSE consent_version END,
             updated_at=CURRENT_TIMESTAMP
       WHERE id=?
    `).run(user?.id ?? null, userVisitorType(user, bot), status, path, referrer, nullableText(body.utmSource, 250), nullableText(body.utmMedium, 250), nullableText(body.utmCampaign, 250), nullableText(body.utmTerm, 250), nullableText(body.utmContent, 250), tracking ? 1 : 0, location.country, tracking ? 1 : 0, location.state, tracking ? 1 : 0, location.district, tracking ? 1 : 0, location.city, language, timezone, device, browser, os, ip, marketingConsent ? 1 : 0, analyticsConsent, analyticsConsent, analyticsConsent, consentSource, analyticsConsent, consentVersion, existing.id);
        appendCookie(req, res, VISITOR_COOKIE, existing.visitor_key, VISITOR_COOKIE_DAYS * 86400);
        return { id: existing.id, visitorKey: existing.visitor_key };
    }
    const result = db.prepare(`
    INSERT INTO web_visitors (
      visitor_key,user_id,visitor_type,tracking_status,consent_source,consent_version,analytics_consent_at,
      first_seen_at,last_seen_at,last_activity_at,first_page_path,last_page_path,first_referrer_url,last_referrer_url,
      first_utm_source,first_utm_medium,first_utm_campaign,first_utm_term,first_utm_content,
      country,state,district,city,language,timezone,device_type,browser,operating_system,ip_hash,is_bot,
      total_sessions,total_page_views,total_events,marketing_consent,analytics_consent,created_at,updated_at
    ) VALUES (
      ?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,
      CASE WHEN ?=1 THEN ? ELSE NULL END,
      CASE WHEN ?=1 THEN ? ELSE NULL END,
      CASE WHEN ?=1 THEN ? ELSE NULL END,
      CASE WHEN ?=1 THEN ? ELSE NULL END,
      ?,?,?,?,?,?, ?,0,0,0,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    )
  `).run(visitorKey, user?.id ?? null, userVisitorType(user, bot), status, consentSource, consentVersion, tracking ? new Date().toISOString() : null, path, path, referrer, referrer, nullableText(body.utmSource, 250), nullableText(body.utmMedium, 250), nullableText(body.utmCampaign, 250), nullableText(body.utmTerm, 250), nullableText(body.utmContent, 250), tracking ? 1 : 0, location.country, tracking ? 1 : 0, location.state, tracking ? 1 : 0, location.district, tracking ? 1 : 0, location.city, language, timezone, device, browser, os, ip, bot ? 1 : 0, marketingConsent ? 1 : 0, tracking ? 1 : 0);
    const visitorId = Number(result.lastInsertRowid);
    appendCookie(req, res, VISITOR_COOKIE, visitorKey, VISITOR_COOKIE_DAYS * 86400);
    return { id: visitorId, visitorKey };
}
function ensureVisitorAndSession(req: Request, res: Response, body: SqlRow): AnalyticsContext {
    const user = currentUser(res);
    const tracking = trackingAllowed(body);
    if (!tracking)
        return { visitorId: 0, visitorKey: "", sessionId: 0, sessionKey: "", trackingAllowed: false };
    const bot = isBot(req);
    const location = resolveLocation(body);
    const path = nullableText(body.pagePath ?? body.path, 1000);
    const referrer = nullableText(body.referrerUrl ?? req.get("referer"), 2000);
    const visitor = createVisitor(req, res, body, user, location, path, referrer, true, bot);
    let sessionKey = nullableText(readCookie(req, SESSION_COOKIE), 150);
    let session = sessionKey ? loadSession(sessionKey) : undefined;
    if (session && session.visitor_id !== visitor.id)
        session = undefined;
    const sessionAge = session ? Date.now() - new Date(session.last_activity_at).getTime() : Number.POSITIVE_INFINITY;
    const sessionExpired = !Number.isFinite(sessionAge) || sessionAge > SESSION_MINUTES * 60000 || Boolean(session?.ended_at);
    if (session && sessionExpired) {
        db.prepare(`UPDATE web_sessions SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(session.id);
    }
    if (!session || sessionExpired) {
        sessionKey = `s_${randomBytes(24).toString("hex")}`;
        const result = db.prepare(`
      INSERT INTO web_sessions (
        session_key,visitor_id,user_id,ip_hash,request_id,started_at,last_activity_at,entry_path,landing_page,referrer_url,
        utm_source,utm_medium,utm_campaign,utm_term,utm_content,country,state,district,city,device_type,browser,operating_system,
        screen_width,screen_height,page_views,event_count,duration_seconds,engaged,is_bounce,is_bot,created_at,updated_at
      ) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,0,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).run(sessionKey, visitor.id, user?.id ?? null, ipHash(req), requestId(req), path, path, referrer, nullableText(body.utmSource, 250), nullableText(body.utmMedium, 250), nullableText(body.utmCampaign, 250), nullableText(body.utmTerm, 250), nullableText(body.utmContent, 250), location.country, location.state, location.district, location.city, nullableText(body.deviceType ?? deviceFromRequest(req), 40), nullableText(body.browser ?? browserFromRequest(req), 80), nullableText(body.operatingSystem ?? osFromRequest(req), 80), boundedInteger(body.screenWidth, 0, 0, 10000), boundedInteger(body.screenHeight, 0, 0, 10000), bot ? 1 : 0);
        const now = new Date().toISOString();
        session = {
            id: Number(result.lastInsertRowid), session_key: sessionKey, visitor_id: visitor.id, user_id: user?.id ?? null,
            started_at: now, ended_at: null, last_activity_at: now, page_views: 0, event_count: 0, duration_seconds: 0, engaged: 0, is_bounce: 1, is_bot: bot ? 1 : 0,
        };
        db.prepare(`UPDATE web_visitors SET total_sessions=total_sessions+1, last_activity_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(visitor.id);
        appendCookie(req, res, SESSION_COOKIE, sessionKey, SESSION_MINUTES * 60);
    }
    else {
        db.prepare(`
      UPDATE web_sessions
         SET user_id=COALESCE(?,user_id),ip_hash=COALESCE(?,ip_hash),request_id=COALESCE(?,request_id),
             last_activity_at=CURRENT_TIMESTAMP,country=COALESCE(?,country),state=COALESCE(?,state),district=COALESCE(?,district),city=COALESCE(?,city),
             device_type=COALESCE(?,device_type),browser=COALESCE(?,browser),operating_system=COALESCE(?,operating_system),updated_at=CURRENT_TIMESTAMP
       WHERE id=?
    `).run(user?.id ?? null, ipHash(req), requestId(req), location.country, location.state, location.district, location.city, nullableText(body.deviceType ?? deviceFromRequest(req), 40), nullableText(body.browser ?? browserFromRequest(req), 80), nullableText(body.operatingSystem ?? osFromRequest(req), 80), session.id);
        appendCookie(req, res, SESSION_COOKIE, session.session_key, SESSION_MINUTES * 60);
    }
    return { visitorId: visitor.id, visitorKey: visitor.visitorKey, sessionId: session.id, sessionKey: session.session_key, trackingAllowed: true };
}
/**
 * Resolve an already-existing analytics session for write-back endpoints.
 *
 * Unlike ensureVisitorAndSession(), this helper is intentionally read-only:
 * missing/expired cookies must not create a new web_sessions row while a page
 * view is being PATCHed. That old behavior caused repeated 403s and hundreds
 * of orphan sessions whenever the browser's cookie/session did not match.
 */
function existingAnalyticsContext(req: Request, body: SqlRow): AnalyticsContext | null {
    if (!trackingAllowed(body)) {
        return { visitorId: 0, visitorKey: "", sessionId: 0, sessionKey: "", trackingAllowed: false };
    }

    const sessionKey = nullableText(readCookie(req, SESSION_COOKIE), 150);
    if (!sessionKey)
        return null;

    const session = loadSession(sessionKey);
    if (!session || session.ended_at)
        return null;

    const sessionAge = Date.now() - new Date(session.last_activity_at).getTime();
    if (!Number.isFinite(sessionAge) || sessionAge > SESSION_MINUTES * 60000)
        return null;

    const visitor = db.prepare(`SELECT id, visitor_key FROM web_visitors WHERE id=? LIMIT 1`).get(session.visitor_id) as {
        id: number;
        visitor_key: string;
    } | undefined;
    if (!visitor)
        return null;

    return {
        visitorId: visitor.id,
        visitorKey: visitor.visitor_key,
        sessionId: session.id,
        sessionKey: session.session_key,
        trackingAllowed: true,
    };
}

function getPageView(pageViewId: number): PageViewRow | undefined {
    return db.prepare(`SELECT id,visitor_id,session_id,entered_at,exited_at,path,entity_type,entity_id FROM web_page_views WHERE id=? LIMIT 1`).get(pageViewId) as PageViewRow | undefined;
}
function pageViewBelongsToContext(row: PageViewRow, context: AnalyticsContext): boolean {
    return context.trackingAllowed && row.visitor_id === context.visitorId && row.session_id === context.sessionId;
}
function matchesPathPattern(path: string, pattern: string): boolean {
    const normalized = pattern.trim();
    if (!normalized || normalized === "*")
        return true;
    if (normalized.includes("*")) {
        const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        try {
            return new RegExp(`^${escaped}$`).test(path);
        }
        catch {
            return false;
        }
    }
    return path === normalized;
}
function eventMatchesGoal(eventName: string, path: string | null, entityType: string | null, entityId: number | null): SqlRow[] {
    const goals = db.prepare(`SELECT id,name,slug,event_name,page_pattern,entity_type,entity_id,goal_type,value_amount,is_active FROM analytics_goals WHERE is_active=1 AND event_name=? ORDER BY id ASC`).all(eventName) as SqlRow[];
    return goals.filter((goal) => {
        const pagePattern = nullableText(goal.page_pattern, 1000);
        const goalEntityType = nullableText(goal.entity_type, 100);
        const goalEntityId = idOrNull(goal.entity_id);
        if (pagePattern && !matchesPathPattern(path || "", pagePattern))
            return false;
        if (goalEntityType && goalEntityType !== entityType)
            return false;
        if (goalEntityId && goalEntityId !== entityId)
            return false;
        return true;
    });
}
function isoDateOnly(date: Date): string { return date.toISOString().slice(0, 10); }
// SQLite CURRENT_TIMESTAMP values are stored as "YYYY-MM-DD HH:mm:ss" in UTC.
// Use matching SQL bounds and explicitly parse those timestamps as UTC so reports
// and duration calculations stay correct regardless of the server's TZ setting.
function startOfDayIso(dateString: string): string { return `${dateString} 00:00:00`; }
function endOfDayIso(dateString: string): string { return `${dateString} 23:59:59.999`; }
function safeDate(value: unknown): Date | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
        ? `${raw.replace(" ", "T")}Z`
        : raw;
    const date = new Date(normalized);
    return Number.isFinite(date.getTime()) ? date : null;
}
function dateDiffDays(fromDate: string, toDate: string): number {
    const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
    const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
    return Math.floor((to - from) / 86400000) + 1;
}
function buildDateRange(req: Request, maxDays = MAX_REPORT_DAYS): {
    from: string;
    to: string;
    fromDate: string;
    toDate: string;
} {
    const today = isoDateOnly(new Date());
    let fromDate = normalizeText(req.query.from ?? req.query.dateFrom, 20) || today;
    let toDate = normalizeText(req.query.to ?? req.query.dateTo, 20) || today;
    if (!isValidDateOnly(fromDate))
        fromDate = today;
    if (!isValidDateOnly(toDate))
        toDate = today;
    if (fromDate > toDate)
        [fromDate, toDate] = [toDate, fromDate];
    if (dateDiffDays(fromDate, toDate) > maxDays) {
        const to = new Date(`${toDate}T00:00:00.000Z`);
        to.setUTCDate(to.getUTCDate() - (maxDays - 1));
        fromDate = isoDateOnly(to);
    }
    return { from: startOfDayIso(fromDate), to: endOfDayIso(toDate), fromDate, toDate };
}
const SENSITIVE_METADATA_KEY = /(password|passcode|token|secret|authorization|cookie|session|email|phone|mobile|address|aadhaar|pan|dob|contact)/i;
function sanitizeAnalyticsMetadata(value: unknown, depth = 0): unknown {
    if (depth > 4)
        return "[truncated]";
    if (value === null || value === undefined)
        return value;
    if (["string", "number", "boolean"].includes(typeof value))
        return value;
    if (Array.isArray(value))
        return value.slice(0, 50).map(item => sanitizeAnalyticsMetadata(item, depth + 1));
    if (typeof value === "object") {
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
            output[key] = SENSITIVE_METADATA_KEY.test(key) ? "[redacted]" : sanitizeAnalyticsMetadata(item, depth + 1);
        }
        return output;
    }
    return "[unsupported]";
}
const CONVERSION_TYPES = ["lead", "booking", "payment", "signup", "subscription", "whatsapp", "phone_call", "email"] as const;
type ConversionType = (typeof CONVERSION_TYPES)[number];
function conversionTypeFromEvent(name: string): "whatsapp" | "phone_call" | "email" | null {
    if (name.includes("whatsapp"))
        return "whatsapp";
    if (name.includes("phone") || name.includes("call"))
        return "phone_call";
    if (name.includes("email") || name.includes("mail"))
        return "email";
    return null;
}
function trustedBookingValue(bookingId: number): {
    amount: number;
    currency: string;
} | null {
    if (!tableExists("bookings"))
        return null;
    const row = db.prepare(`SELECT amount,currency,status,payment_status FROM bookings WHERE id=? LIMIT 1`).get(bookingId) as {
        amount?: number;
        currency?: string;
        status?: string;
        payment_status?: string;
    } | undefined;
    if (!row)
        return null;
    const paymentStatus = String(row.payment_status ?? "").toLowerCase();
    const amount = Number(row.amount ?? 0);
    const paid = ["paid", "captured", "success", "successful", "completed"].includes(paymentStatus);
    return { amount: paid ? amount : 0, currency: String(row.currency || "INR") };
}
function trustedPaymentValue(paymentId: number): {
    amount: number;
    currency: string;
    valid: boolean;
} | null {
    if (!tableExists("payments"))
        return null;
    const row = db.prepare(`SELECT amount,currency,status,refund_amount_paise FROM payments WHERE id=? LIMIT 1`).get(paymentId) as {
        amount?: number;
        currency?: string;
        status?: string;
        refund_amount_paise?: number;
    } | undefined;
    if (!row)
        return null;
    const status = String(row.status ?? "").toLowerCase();
    const settled = ["paid", "captured", "partially_refunded", "refunded"].includes(status);
    const amount = Number(row.amount ?? 0);
    const refund = Number(row.refund_amount_paise ?? 0) / 100;
    return { amount: settled ? Math.max(0, amount - refund) : 0, currency: String(row.currency || "INR"), valid: settled };
}
function resolveLeadForContext(context: AnalyticsContext): number | null {
    if (!tableExists("leads"))
        return null;
    const row = db.prepare(`SELECT id FROM leads WHERE visitor_id=? OR session_id=? ORDER BY CASE WHEN session_id=? THEN 0 ELSE 1 END,id DESC LIMIT 1`).get(context.visitorId, context.sessionId, context.sessionId) as {
        id?: number;
    } | undefined;
    return row?.id ?? null;
}
function insertConversion(args: {
    visitorId: number;
    sessionId: number;
    pageViewId?: number | null;
    eventId?: number | null;
    conversionType: ConversionType;
    leadId?: number | null;
    bookingId?: number | null;
    paymentId?: number | null;
    userId?: number | null;
    valueAmount?: number | null;
    currency?: string;
    path?: string | null;
    entityType?: string | null;
    entityId?: number | null;
    body: SqlRow;
}): number {
    const duplicate = db.prepare(`
    SELECT id FROM web_conversions WHERE conversion_type=? AND (
      (? IS NOT NULL AND event_id=?) OR (? IS NOT NULL AND lead_id=?) OR (? IS NOT NULL AND payment_id=?) OR
      (?='booking' AND ? IS NOT NULL AND booking_id=?)
    ) ORDER BY id DESC LIMIT 1
  `).get(args.conversionType, args.eventId ?? null, args.eventId ?? null, args.leadId ?? null, args.leadId ?? null, args.paymentId ?? null, args.paymentId ?? null, args.conversionType, args.bookingId ?? null, args.bookingId ?? null) as {
        id?: number;
    } | undefined;
    if (duplicate?.id)
        return duplicate.id;
    const result = db.prepare(`
    INSERT INTO web_conversions (visitor_id,session_id,page_view_id,event_id,conversion_type,lead_id,booking_id,payment_id,user_id,value_amount,currency,path,entity_type,entity_id,utm_source,utm_medium,utm_campaign,utm_term,utm_content,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).run(args.visitorId, args.sessionId, args.pageViewId ?? null, args.eventId ?? null, args.conversionType, args.leadId ?? null, args.bookingId ?? null, args.paymentId ?? null, args.userId ?? null, args.valueAmount ?? null, args.currency || "INR", args.path ?? null, args.entityType ?? null, args.entityId ?? null, nullableText(args.body.utmSource, 250), nullableText(args.body.utmMedium, 250), nullableText(args.body.utmCampaign, 250), nullableText(args.body.utmTerm, 250), nullableText(args.body.utmContent, 250));
    return Number(result.lastInsertRowid);
}
router.post("/consent", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "consent", RATE_LIMITS.consent))
        return rateLimitResponse(res);
    try {
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        const analyticsConsent = boolValue(body.analyticsConsent ?? body.analytics_consent, false);
        const marketingConsent = boolValue(body.marketingConsent ?? body.marketing_consent, false);
        const existingKey = nullableText(readCookie(req, VISITOR_COOKIE), 150);
        if (!analyticsConsent) {
            if (existingKey) {
                db.prepare(`UPDATE web_visitors SET tracking_status='opted_out',analytics_consent=0,analytics_consent_at=NULL,consent_source=?,consent_version=?,updated_at=CURRENT_TIMESTAMP WHERE visitor_key=?`).run(nullableText(body.consentSource ?? body.consent_source, 80) || "web", nullableText(body.consentVersion ?? body.consent_version, 80) || DEFAULT_CONSENT_VERSION, existingKey);
            }
            clearAnalyticsCookies(req, res);
            return res.json({ success: true, tracking: false, analyticsConsent: false, marketingConsent });
        }
        const user = currentUser(res);
        const location = resolveLocation(body);
        const path = nullableText(body.pagePath ?? body.path, 1000);
        const referrer = nullableText(body.referrerUrl ?? req.get("referer"), 2000);
        const visitor = createVisitor(req, res, body, user, location, path, referrer, true, isBot(req));
        db.prepare(`UPDATE web_visitors SET tracking_status='active',analytics_consent=1,analytics_consent_at=CURRENT_TIMESTAMP,marketing_consent=?,consent_source=?,consent_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(marketingConsent ? 1 : 0, nullableText(body.consentSource ?? body.consent_source, 80) || "web", nullableText(body.consentVersion ?? body.consent_version, 80) || DEFAULT_CONSENT_VERSION, visitor.id);
        res.json({ success: true, tracking: true, analyticsConsent: true, marketingConsent, visitorId: visitor.id });
    }
    catch (error) {
        console.error("Analytics consent error:", error);
        sendError(res, 500, "Unable to save analytics consent.");
    }
});
router.post("/visit", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "visit", RATE_LIMITS.visit))
        return rateLimitResponse(res);
    try {
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        const context = ensureVisitorAndSession(req, res, body);
        if (!context.trackingAllowed)
            return res.status(202).json({ success: true, tracking: false, reason: "Analytics consent not granted." });
        res.json({ success: true, tracking: true, visitorId: context.visitorId, sessionId: context.sessionId });
    }
    catch (error) {
        console.error("Analytics visit error:", error);
        sendError(res, 500, "Unable to record visitor analytics.");
    }
});
router.post("/page-view", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "page-view", RATE_LIMITS.pageView))
        return rateLimitResponse(res);
    try {
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        const path = normalizeText(body.path ?? body.pagePath, 1000);
        if (!path)
            return sendError(res, 400, "Page path is required.");
        const context = ensureVisitorAndSession(req, res, body);
        if (!context.trackingAllowed)
            return res.status(202).json({ success: true, tracking: false });
        const location = resolveLocation(body);
        const user = currentUser(res);
        const referrer = nullableText(body.referrerUrl ?? req.get("referer"), 2000);
        const previousPath = nullableText(body.previousPath, 1000);
        const title = nullableText(body.pageTitle, 500);
        const inferred = inferEntityFromPath(path);
        const type = pageType(path, body.pageType);
        const entityType = nullableText(body.entityType, 100) || inferred.entityType;
        const entityId = idOrNull(body.entityId) ?? inferred.entityId;

        // React StrictMode (development) and quick duplicate fetches can invoke
        // the same tracker twice. Reuse the active row instead of inserting a
        // zero-second duplicate page view. Real revisits still create new rows.
        const duplicate = db.prepare(`SELECT id,entered_at FROM web_page_views WHERE visitor_id=? AND session_id=? AND path=? AND exited_at IS NULL ORDER BY id DESC LIMIT 1`).get(context.visitorId, context.sessionId, path) as { id: number; entered_at: string } | undefined;
        const duplicateAgeMs = duplicate ? Date.now() - (safeDate(duplicate.entered_at)?.getTime() ?? 0) : Number.POSITIVE_INFINITY;
        if (duplicate && duplicateAgeMs >= 0 && duplicateAgeMs <= 2500) {
            db.prepare(`UPDATE web_page_views SET page_title=COALESCE(NULLIF(page_title,''),?),page_type=COALESCE(NULLIF(page_type,''),?),entity_type=COALESCE(entity_type,?),entity_id=COALESCE(entity_id,?) WHERE id=? AND visitor_id=? AND session_id=?`).run(title, type, entityType, entityId, duplicate.id, context.visitorId, context.sessionId);
            return res.json({ success: true, pageViewId: duplicate.id, visitorId: context.visitorId, sessionId: context.sessionId, deduplicated: true });
        }

        const openPages = db.prepare(`SELECT id,entered_at FROM web_page_views WHERE visitor_id=? AND session_id=? AND exited_at IS NULL ORDER BY id DESC LIMIT 10`).all(context.visitorId, context.sessionId) as Array<{
            id: number;
            entered_at: string;
        }>;
        for (const open of openPages) {
            const entered = safeDate(open.entered_at);
            const duration = entered ? Math.max(0, Math.floor((Date.now() - entered.getTime()) / 1000)) : 0;
            db.prepare(`UPDATE web_page_views SET exited_at=CURRENT_TIMESTAMP,duration_seconds=MAX(duration_seconds,?),is_bounce_candidate=CASE WHEN ?<10 AND scroll_depth_percent<25 AND click_count=0 AND interaction_count=0 THEN 1 ELSE is_bounce_candidate END WHERE id=? AND exited_at IS NULL`).run(duration, duration, open.id);
        }
        const result = db.prepare(`
      INSERT INTO web_page_views (visitor_id,session_id,user_id,path,page_title,page_type,entity_type,entity_id,country,state,district,city,referrer_url,previous_path,utm_source,utm_medium,utm_campaign,utm_term,utm_content,entered_at,duration_seconds,scroll_depth_percent,click_count,interaction_count,engaged,exit_page,is_bounce_candidate,is_bot,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,0,0,0,0,0,0,0,?,CURRENT_TIMESTAMP)
    `).run(context.visitorId, context.sessionId, user?.id ?? null, path, title, type, entityType, entityId, location.country, location.state, location.district, location.city, referrer, previousPath, nullableText(body.utmSource, 250), nullableText(body.utmMedium, 250), nullableText(body.utmCampaign, 250), nullableText(body.utmTerm, 250), nullableText(body.utmContent, 250), isBot(req) ? 1 : 0);
        const pageViewId = Number(result.lastInsertRowid);
        db.prepare(`UPDATE web_sessions SET page_views=page_views+1,entry_path=COALESCE(entry_path,?),landing_page=COALESCE(landing_page,?),last_activity_at=CURRENT_TIMESTAMP,is_bounce=CASE WHEN page_views=0 THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND visitor_id=?`).run(path, path, context.sessionId, context.visitorId);
        db.prepare(`UPDATE web_visitors SET total_page_views=total_page_views+1,last_page_path=?,last_seen_at=CURRENT_TIMESTAMP,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(path, context.visitorId);
        res.json({ success: true, pageViewId, visitorId: context.visitorId, sessionId: context.sessionId });
    }
    catch (error) {
        console.error("Analytics page-view error:", error);
        sendError(res, 500, "Unable to record page view.");
    }
});
router.patch("/page-view/:id", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "page-view-update", RATE_LIMITS.pageViewUpdate))
        return rateLimitResponse(res);
    try {
        const pageViewId = idOrNull(req.params.id);
        if (!pageViewId)
            return sendError(res, 400, "Invalid page view id.");
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        if (!trackingAllowed(body))
            return res.status(202).json({ success: true, tracking: false });

        const pageView = getPageView(pageViewId);
        if (!pageView)
            return sendError(res, 404, "Page view not found.");

        // Do not create a replacement visitor/session while updating an existing
        // page view. A missing, expired, or mismatched cookie should fail closed.
        const context = existingAnalyticsContext(req, body);
        if (!context)
            return sendError(res, 403, "Analytics session is missing or expired.");
        if (!pageViewBelongsToContext(pageView, context))
            return sendError(res, 403, "You do not have access to this page view.");
        const entered = safeDate(pageView.entered_at);
        const calculatedDuration = entered ? Math.min(86400, Math.max(0, Math.floor((Date.now() - entered.getTime()) / 1000))) : 0;
        const reportedDuration = boundedInteger(body.durationSeconds, 0, 0, 86400);
        // Never let a late/small client heartbeat reduce the server's elapsed-time estimate.
        const duration = Math.max(calculatedDuration, reportedDuration);
        const scroll = boundedInteger(body.scrollDepthPercent, 0, 0, 100);
        const clicks = boundedInteger(body.clickCount, 0, 0, 100000);
        const interactions = boundedInteger(body.interactionCount, 0, 0, 100000);
        const engaged = boolValue(body.engaged, duration >= 10 || scroll >= 50 || clicks > 0 || interactions > 0);
        const exitPage = boolValue(body.exitPage, false);
        db.prepare(`UPDATE web_page_views SET exited_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE exited_at END,duration_seconds=MAX(duration_seconds,?),scroll_depth_percent=MAX(scroll_depth_percent,?),click_count=MAX(click_count,?),interaction_count=MAX(interaction_count,?),engaged=CASE WHEN ?=1 THEN 1 ELSE engaged END,exit_page=CASE WHEN ?=1 THEN 1 ELSE exit_page END,is_bounce_candidate=CASE WHEN ?<10 AND ?=0 AND ?=0 AND ?<25 THEN 1 ELSE is_bounce_candidate END WHERE id=? AND visitor_id=? AND session_id=?`).run(exitPage ? 1 : 0, duration, scroll, clicks, interactions, engaged ? 1 : 0, exitPage ? 1 : 0, duration, clicks, interactions, scroll, pageViewId, context.visitorId, context.sessionId);
        const session = loadSession(context.sessionKey);
        const sessionDuration = session ? elapsedSecondsSince(session.started_at) : duration;
        db.prepare(`UPDATE web_sessions SET duration_seconds=MAX(duration_seconds,?),engaged=CASE WHEN ?=1 THEN 1 ELSE engaged END,is_bounce=CASE WHEN ?=1 THEN 0 ELSE is_bounce END,exit_path=CASE WHEN ?=1 THEN ? ELSE exit_path END,ended_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE ended_at END,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND visitor_id=?`).run(sessionDuration, engaged ? 1 : 0, engaged ? 1 : 0, exitPage ? 1 : 0, pageView.path, exitPage ? 1 : 0, context.sessionId, context.visitorId);
        res.json({ success: true, pageView: getPageView(pageViewId) });
    }
    catch (error) {
        console.error("Analytics page-view update error:", error);
        sendError(res, 500, "Unable to update page view.");
    }
});
router.post("/event", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "event", RATE_LIMITS.event))
        return rateLimitResponse(res);
    try {
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        const eventName = normalizeText(body.eventName ?? body.name, 120);
        if (!eventName)
            return sendError(res, 400, "eventName is required.");
        const context = ensureVisitorAndSession(req, res, body);
        if (!context.trackingAllowed)
            return res.status(202).json({ success: true, tracking: false });
        const user = currentUser(res);
        const location = resolveLocation(body);
        const path = nullableText(body.path ?? body.pagePath, 1000);
        const pageViewId = idOrNull(body.pageViewId);
        if (pageViewId) {
            const pv = getPageView(pageViewId);
            if (!pv || !pageViewBelongsToContext(pv, context))
                return sendError(res, 403, "The supplied page view does not belong to this session.");
        }
        const inferred = path ? inferEntityFromPath(path) : null;
        const entityType = nullableText(body.entityType, 100) || inferred?.entityType || null;
        const entityId = idOrNull(body.entityId) ?? inferred?.entityId ?? null;
        const normalizedName = eventName.toLowerCase().replace(/[\s-]+/g, "_");
        const conversionEvent = Boolean(conversionTypeFromEvent(normalizedName));
        const result = db.prepare(`INSERT INTO web_events (visitor_id,session_id,page_view_id,user_id,event_class,event_source,request_id,ip_hash,user_agent,event_name,event_category,target_type,target_key,target_label,path,entity_type,entity_id,value_number,value_text,metadata_json,country,state,district,city,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(context.visitorId, context.sessionId, pageViewId, user?.id ?? null, conversionEvent ? "conversion" : "analytics", "web", requestId(req), ipHash(req), userAgent(req), eventName, nullableText(body.eventCategory ?? body.category, 100), nullableText(body.targetType, 100), nullableText(body.targetKey ?? body.key, 200), nullableText(body.targetLabel ?? body.label, 300), path, entityType, entityId, boundedNumber(body.valueNumber ?? body.value, null, -1000000000, 1000000000), nullableText(body.valueText, 1000), jsonString(sanitizeAnalyticsMetadata({ ...(body.metadata && typeof body.metadata === "object" ? (body.metadata as SqlRow) : {}), ...(body.dedupeKey ? { dedupeKey: normalizeText(body.dedupeKey, 120) } : {}) })), location.country, location.state, location.district, location.city);
        const eventId = Number(result.lastInsertRowid);
        db.prepare(`UPDATE web_sessions SET event_count=event_count+1,engaged=1,is_bounce=0,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND visitor_id=?`).run(context.sessionId, context.visitorId);
        db.prepare(`UPDATE web_visitors SET total_events=total_events+1,last_seen_at=CURRENT_TIMESTAMP,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(context.visitorId);
        let conversionId: null | number = null;
        const conversionType = conversionTypeFromEvent(normalizedName);
        if (conversionType) {
            conversionId = insertConversion({ visitorId: context.visitorId, sessionId: context.sessionId, pageViewId, eventId, conversionType, path, entityType, entityId, userId: user?.id ?? null, currency: "INR", body });
        }
        const matchedGoals = eventMatchesGoal(eventName, path, entityType, entityId);
        res.json({ success: true, eventId, conversionId, matchedGoalIds: matchedGoals.map(goal => idOrNull(goal.id)), visitorId: context.visitorId, sessionId: context.sessionId });
    }
    catch (error) {
        console.error("Analytics event error:", error);
        sendError(res, 500, "Unable to record analytics event.");
    }
});
router.post("/search", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "search", RATE_LIMITS.search))
        return rateLimitResponse(res);
    try {
        if (!tableExists("site_searches"))
            return sendError(res, 503, "Site search analytics is not configured.");
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        const query = normalizeText(body.query ?? body.queryText ?? body.search, 500);
        if (!query)
            return sendError(res, 400, "Search query is required.");
        const context = ensureVisitorAndSession(req, res, body);
        if (!context.trackingAllowed)
            return res.status(202).json({ success: true, tracking: false });
        const user = currentUser(res);
        const result = db.prepare(`INSERT INTO site_searches (visitor_id,session_id,user_id,query_text,results_count,page_path,filter_json,converted,created_at) VALUES (?,?,?,?,?,?,?,0,CURRENT_TIMESTAMP)`).run(context.visitorId, context.sessionId, user?.id ?? null, query, boundedInteger(body.resultsCount, 0, 0, 1000000), nullableText(body.pagePath ?? body.path, 1000), jsonString(body.filters ?? body.filter, 10000));
        db.prepare(`UPDATE web_sessions SET event_count=event_count+1,engaged=1,is_bounce=0,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND visitor_id=?`).run(context.sessionId, context.visitorId);
        res.status(201).json({ success: true, searchId: Number(result.lastInsertRowid), visitorId: context.visitorId, sessionId: context.sessionId });
    }
    catch (error) {
        console.error("Analytics search error:", error);
        sendError(res, 500, "Unable to record site search.");
    }
});
router.post("/heartbeat", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "heartbeat", RATE_LIMITS.heartbeat))
        return rateLimitResponse(res);
    try {
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        // Heartbeats must update an existing session only. If a cookie expired or
        // the session ended, let the next /visit or /page-view create a fresh one.
        const context = existingAnalyticsContext(req, body);
        if (!context) return res.status(202).json({ success: true, tracking: true, sessionActive: false });
        if (!context.trackingAllowed)
            return res.status(202).json({ success: true, tracking: false });
        const pageViewId = idOrNull(body.pageViewId);
        const duration = boundedInteger(body.durationSeconds, 0, 0, 86400);
        const scroll = boundedInteger(body.scrollDepthPercent, 0, 0, 100);
        const clicks = boundedInteger(body.clickCount, 0, 0, 100000);
        const interactions = boundedInteger(body.interactionCount, 0, 0, 100000);
        const engaged = duration >= 10 || scroll >= 50 || clicks > 0 || interactions > 0;
        const session = loadSession(context.sessionKey);
        const sessionDuration = session ? elapsedSecondsSince(session.started_at) : duration;
        if (pageViewId) {
            const pv = getPageView(pageViewId);
            if (!pv || !pageViewBelongsToContext(pv, context))
                return sendError(res, 403, "The supplied page view does not belong to this session.");
            db.prepare(`UPDATE web_page_views SET duration_seconds=MAX(duration_seconds,?),scroll_depth_percent=MAX(scroll_depth_percent,?),click_count=MAX(click_count,?),interaction_count=MAX(interaction_count,?),engaged=CASE WHEN ?=1 THEN 1 ELSE engaged END WHERE id=? AND visitor_id=? AND session_id=?`).run(duration, scroll, clicks, interactions, engaged ? 1 : 0, pageViewId, context.visitorId, context.sessionId);
        }
        db.prepare(`UPDATE web_sessions SET duration_seconds=MAX(duration_seconds,?),last_activity_at=CURRENT_TIMESTAMP,engaged=CASE WHEN ?=1 THEN 1 ELSE engaged END,is_bounce=CASE WHEN ?=1 THEN 0 ELSE is_bounce END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND visitor_id=?`).run(sessionDuration, engaged ? 1 : 0, engaged ? 1 : 0, context.sessionId, context.visitorId);
        res.json({ success: true, visitorId: context.visitorId, sessionId: context.sessionId, pageViewId, durationSeconds: duration, sessionDurationSeconds: sessionDuration, engaged });
    }
    catch (error) {
        console.error("Analytics heartbeat error:", error);
        sendError(res, 500, "Unable to record analytics heartbeat.");
    }
});
router.post("/session/end", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "session-end", RATE_LIMITS.sessionEnd))
        return rateLimitResponse(res);
    try {
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        const context = existingAnalyticsContext(req, body);
        if (!context) return res.json({ success: true, ended: false, reason: "No active analytics session." });
        if (!context.trackingAllowed)
            return res.status(202).json({ success: true, tracking: false });
        const requestedSessionId = idOrNull(body.sessionId);
        if (requestedSessionId && requestedSessionId !== context.sessionId)
            return sendError(res, 403, "Session id does not match the active analytics session.");
        const sessionId = context.sessionId;
        const session = loadSession(context.sessionKey);
        if (!session || session.id !== sessionId)
            return res.json({ success: true, sessionId, ended: false, reason: "Session is already unavailable." });
        const durationFromStart = elapsedSecondsSince(session.started_at);
        const suppliedDuration = boundedInteger(body.durationSeconds, 0, 0, 86400);
        const duration = Math.min(86400, Math.max(durationFromStart, session.duration_seconds, suppliedDuration));
        const engaged = boolValue(body.engaged, Boolean(session.engaged) || duration >= 10 || session.event_count > 0 || session.page_views > 1);
        const exitPath = nullableText(body.exitPath ?? body.path, 1000);
        db.prepare(`UPDATE web_sessions SET ended_at=CURRENT_TIMESTAMP,exit_path=COALESCE(?,exit_path),duration_seconds=MAX(duration_seconds,?),engaged=CASE WHEN ?=1 THEN 1 ELSE engaged END,is_bounce=CASE WHEN ?=1 THEN 0 ELSE is_bounce END,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND visitor_id=?`).run(exitPath, duration, engaged ? 1 : 0, engaged ? 1 : 0, sessionId, context.visitorId);
        db.prepare(`UPDATE web_page_views SET exited_at=COALESCE(exited_at,CURRENT_TIMESTAMP),duration_seconds=MAX(duration_seconds,CASE WHEN entered_at IS NOT NULL THEN CAST((julianday('now')-julianday(entered_at))*86400 AS INTEGER) ELSE 0 END),exit_page=CASE WHEN id=(SELECT id FROM web_page_views WHERE session_id=? ORDER BY id DESC LIMIT 1) THEN 1 ELSE exit_page END WHERE session_id=? AND exited_at IS NULL`).run(sessionId, sessionId);
        res.json({ success: true, sessionId, ended: true });
    }
    catch (error) {
        console.error("Analytics session-end error:", error);
        sendError(res, 500, "Unable to end analytics session.");
    }
});
router.post("/conversion", optionalAuth, (req, res) => {
    if (!rateAllowed(req, "conversion", RATE_LIMITS.conversion))
        return rateLimitResponse(res);
    try {
        const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
        const conversionTypeText = normalizeText(body.conversionType ?? body.type, 40).toLowerCase();
        if (!CONVERSION_TYPES.includes(conversionTypeText as ConversionType))
            return sendError(res, 400, "Invalid conversion type.");
        const conversionType = conversionTypeText as ConversionType;
        const context = ensureVisitorAndSession(req, res, body);
        if (!context.trackingAllowed)
            return res.status(202).json({ success: true, tracking: false });
        const user = currentUser(res);
        const pageViewId = idOrNull(body.pageViewId);
        const eventId = idOrNull(body.eventId);
        if (pageViewId) {
            const pv = getPageView(pageViewId);
            if (!pv || !pageViewBelongsToContext(pv, context))
                return sendError(res, 403, "The supplied page view does not belong to this session.");
        }
        let leadId = idOrNull(body.leadId);
        let bookingId = idOrNull(body.bookingId);
        let paymentId = idOrNull(body.paymentId);
        let entityType = nullableText(body.entityType, 100);
        let entityId = idOrNull(body.entityId);
        let valueAmount: number | null = null;
        let currency = normalizeText(body.currency, 10).toUpperCase() || "INR";
        if (conversionType === "lead") {
            leadId = leadId ?? resolveLeadForContext(context);
            if (leadId) {
                const lead = db.prepare(`SELECT id,temple_id,requested_pandit_id,ashram_id,puja_service_id,yatra_package_id,event_id,course_id,spiritual_place_id FROM leads WHERE id=? LIMIT 1`).get(leadId) as SqlRow | undefined;
                if (!lead)
                    return sendError(res, 400, "Lead not found.");
                if (!entityType) {
                    const candidates: Array<[
                        string,
                        unknown
                    ]> = [["temple", lead.temple_id], ["pandit", lead.requested_pandit_id], ["ashram", lead.ashram_id], ["puja_service", lead.puja_service_id], ["yatra", lead.yatra_package_id], ["event", lead.event_id], ["course", lead.course_id], ["spiritual_place", lead.spiritual_place_id]];
                    const found = candidates.find(candidate => idOrNull(candidate[1]) !== null);
                    entityType = found?.[0] ?? null;
                    entityId = found ? idOrNull(found[1]) : entityId;
                }
            }
        }
        if (conversionType === "booking" && bookingId) {
            const booking = trustedBookingValue(bookingId);
            if (!booking)
                return sendError(res, 400, "Booking not found.");
            valueAmount = booking.amount;
            currency = booking.currency || currency;
        }
        if (conversionType === "payment" || conversionType === "subscription") {
            if (!paymentId)
                return sendError(res, 400, "paymentId is required for payment/subscription conversions.");
            const payment = trustedPaymentValue(paymentId);
            if (!payment)
                return sendError(res, 400, "Payment not found.");
            if (!payment.valid)
                return sendError(res, 409, "Payment is not a settled payment.");
            valueAmount = payment.amount;
            currency = payment.currency || currency;
        }
        if (conversionType === "signup" && !user)
            return sendError(res, 401, "Authentication required for signup conversion.");
        if (bookingId && !db.prepare(`SELECT id FROM bookings WHERE id=? LIMIT 1`).get(bookingId))
            return sendError(res, 400, "Booking not found.");
        if (paymentId && !db.prepare(`SELECT id FROM payments WHERE id=? LIMIT 1`).get(paymentId))
            return sendError(res, 400, "Payment not found.");
        const conversionId = insertConversion({ visitorId: context.visitorId, sessionId: context.sessionId, pageViewId, eventId, conversionType, leadId, bookingId, paymentId, valueAmount, currency, path: nullableText(body.path ?? body.pagePath, 1000), entityType, entityId, userId: user?.id ?? null, body });
        if (conversionType === "lead" && leadId) {
            db.prepare(`UPDATE web_sessions SET engaged=1,is_bounce=0,event_count=event_count+1,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND visitor_id=?`).run(context.sessionId, context.visitorId);
            if (tableExists("site_searches"))
                db.prepare(`UPDATE site_searches SET converted=1 WHERE id=(SELECT id FROM site_searches WHERE visitor_id=? AND session_id=? ORDER BY id DESC LIMIT 1)`).run(context.visitorId, context.sessionId);
        }
        res.status(201).json({ success: true, conversionId, conversionType, visitorId: context.visitorId, sessionId: context.sessionId });
    }
    catch (error) {
        console.error("Analytics conversion error:", error);
        sendError(res, 500, "Unable to record conversion.");
    }
});
router.get("/context", optionalAuth, (req, res) => {
    try {
        const body = req.query && typeof req.query === "object" ? (req.query as SqlRow) : {};
        const context = ensureVisitorAndSession(req, res, body);
        if (!context.trackingAllowed)
            return res.json({ success: true, tracking: false, visitor: null, session: null });
        const visitor = db.prepare(`SELECT id,visitor_type,tracking_status,consent_source,consent_version,analytics_consent_at,first_seen_at,last_seen_at,last_activity_at,first_page_path,last_page_path,first_referrer_url,last_referrer_url,first_utm_source,first_utm_medium,first_utm_campaign,country,state,district,city,language,timezone,device_type,browser,operating_system,is_bot,total_sessions,total_page_views,total_events,marketing_consent,analytics_consent,created_at,updated_at FROM web_visitors WHERE id=? LIMIT 1`).get(context.visitorId);
        const session = db.prepare(`SELECT id,visitor_id,user_id,started_at,ended_at,last_activity_at,entry_path,exit_path,landing_page,referrer_url,utm_source,utm_medium,utm_campaign,country,state,district,city,device_type,browser,operating_system,page_views,event_count,duration_seconds,engaged,is_bounce,is_bot,created_at,updated_at FROM web_sessions WHERE id=? LIMIT 1`).get(context.sessionId);
        res.json({ success: true, tracking: true, visitor, session });
    }
    catch (error) {
        console.error("Analytics context error:", error);
        sendError(res, 500, "Unable to load analytics context.");
    }
});
router.get("/me", requireAuth, (req, res) => {
    void req;
    try {
        const user = currentUser(res);
        if (!user)
            return sendError(res, 401, "Authentication required.");
        const sessions = db.prepare(`SELECT COUNT(*) AS count FROM web_sessions WHERE user_id=? AND is_bot=0`).get(user.id) as {
            count?: number;
        };
        const pageViews = db.prepare(`SELECT COUNT(*) AS count FROM web_page_views WHERE user_id=? AND is_bot=0`).get(user.id) as {
            count?: number;
        };
        const events = db.prepare(`SELECT COUNT(*) AS count FROM web_events WHERE user_id=?`).get(user.id) as {
            count?: number;
        };
        const conversions = db.prepare(`SELECT conversion_type,COUNT(*) AS count,COALESCE(SUM(value_amount),0) AS value_amount FROM web_conversions WHERE user_id=? GROUP BY conversion_type ORDER BY count DESC`).all(user.id);
        res.json({ success: true, userId: user.id, role: user.role, totals: { sessions: Number(sessions?.count ?? 0), pageViews: Number(pageViews?.count ?? 0), events: Number(events?.count ?? 0) }, conversions });
    }
    catch (error) {
        console.error("Analytics user summary error:", error);
        sendError(res, 500, "Unable to load your analytics summary.");
    }
});
function isAdminAnalyticsUser(user: AnalyticsUser): boolean { return user?.role === "super_admin" || user?.role === "sales"; }
function resolveOwnerScope(user: AuthenticatedUser): OwnerScope {
    const panditIds: number[] = [];
    const templeIds: number[] = [];
    const ashramIds: number[] = [];
    let advanced = false;
    if (user.role === "pandit" && tableExists("pandit_profiles") && tableExists("pandit_subscriptions")) {
        const rows = db.prepare(`SELECT DISTINCT pp.id,ps.analytics_level FROM pandit_profiles pp INNER JOIN pandit_subscriptions ps ON ps.pandit_id=pp.id WHERE pp.user_id=? AND ps.status='active' AND ps.analytics_access=1 AND (ps.expires_at IS NULL OR ps.expires_at>=CURRENT_TIMESTAMP)`).all(user.id) as Array<{
            id: number;
            analytics_level?: string;
        }>;
        for (const row of rows) {
            panditIds.push(row.id);
            if (row.analytics_level === "advanced")
                advanced = true;
        }
    }
    if (user.role === "temple_manager" && tableExists("temples") && tableExists("temple_subscriptions") && tableExists("temple_manager_assignments")) {
        const rows = db.prepare(`SELECT DISTINCT t.id,ts.analytics_level FROM temples t INNER JOIN temple_subscriptions ts ON ts.temple_id=t.id WHERE ts.status='active' AND ts.analytics_access=1 AND (ts.expires_at IS NULL OR ts.expires_at>=CURRENT_TIMESTAMP) AND (ts.manager_user_id=? OR EXISTS(SELECT 1 FROM temple_manager_assignments tma WHERE tma.temple_id=t.id AND tma.manager_user_id=? AND tma.status='active'))`).all(user.id, user.id) as Array<{
            id: number;
            analytics_level?: string;
        }>;
        for (const row of rows) {
            if (!templeIds.includes(row.id))
                templeIds.push(row.id);
            if (row.analytics_level === "advanced")
                advanced = true;
        }
    }
    if (user.role === "ashram_manager" && tableExists("ashrams") && tableExists("ashram_subscriptions") && tableExists("ashram_manager_assignments")) {
        const rows = db.prepare(`SELECT DISTINCT a.id,ass.analytics_level FROM ashrams a INNER JOIN ashram_subscriptions ass ON ass.ashram_id=a.id WHERE ass.status='active' AND ass.analytics_access=1 AND (ass.expires_at IS NULL OR ass.expires_at>=CURRENT_TIMESTAMP) AND (ass.manager_user_id=? OR EXISTS(SELECT 1 FROM ashram_manager_assignments ama WHERE ama.ashram_id=a.id AND ama.manager_user_id=? AND ama.status='active'))`).all(user.id, user.id) as Array<{
            id: number;
            analytics_level?: string;
        }>;
        for (const row of rows) {
            if (!ashramIds.includes(row.id))
                ashramIds.push(row.id);
            if (row.analytics_level === "advanced")
                advanced = true;
        }
    }
    return { panditIds, templeIds, ashramIds, analyticsLevel: advanced ? "advanced" : "basic" };
}
function requireOwnerAnalytics(res: Response): {
    user: AuthenticatedUser;
    scope: OwnerScope;
} | null {
    const user = currentUser(res);
    if (!user) {
        sendError(res, 401, "Authentication required.");
        return null;
    }
    if (isAdminAnalyticsUser(user))
        return { user, scope: { panditIds: [], templeIds: [], ashramIds: [], analyticsLevel: "advanced" } };
    if (!["pandit", "temple_manager", "ashram_manager"].includes(user.role)) {
        sendError(res, 403, "Analytics access is not available for this role.");
        return null;
    }
    const scope = resolveOwnerScope(user);
    if (!scope.panditIds.length && !scope.templeIds.length && !scope.ashramIds.length) {
        sendError(res, 403, "An active subscription with analytics access is required.");
        return null;
    }
    return { user, scope };
}
function entityScopeForOwner(scope: OwnerScope, alias: string): {
    sql: string;
    params: unknown[];
} {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (scope.panditIds.length) {
        clauses.push(`${alias}.entity_type='pandit' AND ${alias}.entity_id IN (${scope.panditIds.map(() => "?").join(",")})`);
        params.push(...scope.panditIds);
    }
    if (scope.templeIds.length) {
        clauses.push(`${alias}.entity_type='temple' AND ${alias}.entity_id IN (${scope.templeIds.map(() => "?").join(",")})`);
        params.push(...scope.templeIds);
    }
    if (scope.ashramIds.length) {
        clauses.push(`${alias}.entity_type='ashram' AND ${alias}.entity_id IN (${scope.ashramIds.map(() => "?").join(",")})`);
        params.push(...scope.ashramIds);
    }
    return clauses.length ? { sql: `AND (${clauses.join(" OR ")})`, params } : { sql: "AND 1=0", params: [] };
}
function ownerLeadScope(scope: OwnerScope, alias = "l"): {
    sql: string;
    params: unknown[];
} {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (scope.panditIds.length) {
        clauses.push(`(${alias}.requested_pandit_id IN (${scope.panditIds.map(() => "?").join(",")}) OR EXISTS(SELECT 1 FROM lead_assignments la INNER JOIN pandit_profiles pp ON pp.id=la.pandit_id WHERE la.lead_id=${alias}.id AND pp.id IN (${scope.panditIds.map(() => "?").join(",")})))`);
        params.push(...scope.panditIds, ...scope.panditIds);
    }
    if (scope.templeIds.length) {
        clauses.push(`${alias}.temple_id IN (${scope.templeIds.map(() => "?").join(",")})`);
        params.push(...scope.templeIds);
    }
    if (scope.ashramIds.length) {
        clauses.push(`${alias}.ashram_id IN (${scope.ashramIds.map(() => "?").join(",")})`);
        params.push(...scope.ashramIds);
    }
    return clauses.length ? { sql: `AND (${clauses.join(" OR ")})`, params } : { sql: "AND 1=0", params: [] };
}
function ownerBookingScope(scope: OwnerScope, alias = "b"): {
    sql: string;
    params: unknown[];
} {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (scope.panditIds.length) {
        clauses.push(`${alias}.pandit_id IN (${scope.panditIds.map(() => "?").join(",")})`);
        params.push(...scope.panditIds);
    }
    if (scope.templeIds.length) {
        clauses.push(`${alias}.temple_id IN (${scope.templeIds.map(() => "?").join(",")})`);
        params.push(...scope.templeIds);
    }
    if (scope.ashramIds.length) {
        clauses.push(`${alias}.ashram_id IN (${scope.ashramIds.map(() => "?").join(",")})`);
        params.push(...scope.ashramIds);
    }
    return clauses.length ? { sql: `AND (${clauses.join(" OR ")})`, params } : { sql: "AND 1=0", params: [] };
}
function ownerPaymentScope(scope: OwnerScope, alias = "p"): {
    sql: string;
    params: unknown[];
} {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (scope.panditIds.length) {
        clauses.push(`(${alias}.pandit_id IN (${scope.panditIds.map(() => "?").join(",")}) OR EXISTS(SELECT 1 FROM pandit_subscriptions ps WHERE ps.id=${alias}.pandit_subscription_id AND ps.pandit_id IN (${scope.panditIds.map(() => "?").join(",")})))`);
        params.push(...scope.panditIds, ...scope.panditIds);
    }
    if (scope.templeIds.length) {
        clauses.push(`(${alias}.temple_id IN (${scope.templeIds.map(() => "?").join(",")}) OR EXISTS(SELECT 1 FROM temple_subscriptions ts WHERE ts.id=${alias}.temple_subscription_id AND ts.temple_id IN (${scope.templeIds.map(() => "?").join(",")})))`);
        params.push(...scope.templeIds, ...scope.templeIds);
    }
    if (scope.ashramIds.length) {
        clauses.push(`(${alias}.ashram_id IN (${scope.ashramIds.map(() => "?").join(",")}) OR EXISTS(SELECT 1 FROM ashram_subscriptions ass WHERE ass.id=${alias}.ashram_subscription_id AND ass.ashram_id IN (${scope.ashramIds.map(() => "?").join(",")})))`);
        params.push(...scope.ashramIds, ...scope.ashramIds);
    }
    return clauses.length ? { sql: `AND (${clauses.join(" OR ")})`, params } : { sql: "AND 1=0", params: [] };
}
function refreshDailySiteStats(statDate: string): void {
    const from = startOfDayIso(statDate);
    const to = endOfDayIso(statDate);
    const visitorCount = Number((db.prepare(`SELECT COUNT(DISTINCT visitor_id) AS count FROM web_sessions WHERE is_bot=0 AND started_at BETWEEN ? AND ?`).get(from, to) as {
        count?: number;
    } | undefined)?.count ?? 0);
    const loggedInUsers = Number((db.prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM web_sessions WHERE is_bot=0 AND user_id IS NOT NULL AND started_at BETWEEN ? AND ?`).get(from, to) as {
        count?: number;
    } | undefined)?.count ?? 0);
    const sessionStats = db.prepare(`SELECT COUNT(*) AS sessions,COALESCE(SUM(CASE WHEN engaged=1 THEN 1 ELSE 0 END),0) AS engaged_sessions,COALESCE(SUM(CASE WHEN is_bounce=1 THEN 1 ELSE 0 END),0) AS bounces,COALESCE(SUM(CASE WHEN LOWER(COALESCE(utm_medium,'')) IN ('organic','seo') OR LOWER(COALESCE(utm_source,'')) IN ('google','bing','search') THEN 1 ELSE 0 END),0) AS organic_sessions,COALESCE(SUM(CASE WHEN LOWER(COALESCE(utm_medium,'')) IN ('cpc','ppc','paid','paid_search','paid-social') THEN 1 ELSE 0 END),0) AS paid_sessions,COALESCE(SUM(CASE WHEN LOWER(COALESCE(utm_medium,'')) IN ('social','social_media') OR LOWER(COALESCE(utm_source,'')) IN ('facebook','instagram','youtube','linkedin','twitter','x') THEN 1 ELSE 0 END),0) AS social_sessions,COALESCE(SUM(CASE WHEN LOWER(COALESCE(utm_medium,'')) IN ('referral','affiliate') THEN 1 ELSE 0 END),0) AS referral_sessions,COALESCE(SUM(CASE WHEN (utm_source IS NULL OR TRIM(utm_source)='') AND (referrer_url IS NULL OR TRIM(referrer_url)='') THEN 1 ELSE 0 END),0) AS direct_sessions FROM web_sessions WHERE is_bot=0 AND started_at BETWEEN ? AND ?`).get(from, to) as SqlRow;
    const pageViews = Number((db.prepare(`SELECT COUNT(*) AS count FROM web_page_views WHERE is_bot=0 AND entered_at BETWEEN ? AND ?`).get(from, to) as {
        count?: number;
    } | undefined)?.count ?? 0);
    const leadCount: SqlRow = tableExists("leads")
        ? (db.prepare(`SELECT COUNT(*) AS count FROM leads WHERE created_at BETWEEN ? AND ?`).get(from, to) as SqlRow)
        : { count: 0 };
    const bookingCount: SqlRow = tableExists("bookings")
        ? (db.prepare(`SELECT COUNT(*) AS count FROM bookings WHERE created_at BETWEEN ? AND ?`).get(from, to) as SqlRow)
        : { count: 0 };
    const paymentStats: SqlRow = tableExists("payments")
        ? (db.prepare(`SELECT COUNT(CASE WHEN status IN ('paid','captured','partially_refunded','refunded') THEN 1 END) AS payments,COALESCE(SUM(CASE WHEN status IN ('paid','captured','partially_refunded','refunded') THEN MAX(0,amount-COALESCE(refund_amount_paise,0)/100.0) ELSE 0 END),0) AS revenue FROM payments WHERE created_at BETWEEN ? AND ?`).get(from, to) as SqlRow)
        : { payments: 0, revenue: 0 };
    const conversionStats = db.prepare(`SELECT COALESCE(SUM(CASE WHEN conversion_type='whatsapp' THEN 1 ELSE 0 END),0) AS whatsapp_clicks,COALESCE(SUM(CASE WHEN conversion_type='phone_call' THEN 1 ELSE 0 END),0) AS phone_clicks,COALESCE(SUM(CASE WHEN conversion_type='email' THEN 1 ELSE 0 END),0) AS email_clicks FROM web_conversions WHERE created_at BETWEEN ? AND ?`).get(from, to) as SqlRow;
    db.prepare(`INSERT INTO analytics_daily_site_stats (stat_date,visitors,unique_logged_in_users,sessions,page_views,engaged_sessions,bounces,leads,bookings,payments,revenue_amount,whatsapp_clicks,phone_clicks,email_clicks,organic_sessions,paid_sessions,social_sessions,referral_sessions,direct_sessions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(stat_date) DO UPDATE SET visitors=excluded.visitors,unique_logged_in_users=excluded.unique_logged_in_users,sessions=excluded.sessions,page_views=excluded.page_views,engaged_sessions=excluded.engaged_sessions,bounces=excluded.bounces,leads=excluded.leads,bookings=excluded.bookings,payments=excluded.payments,revenue_amount=excluded.revenue_amount,whatsapp_clicks=excluded.whatsapp_clicks,phone_clicks=excluded.phone_clicks,email_clicks=excluded.email_clicks,organic_sessions=excluded.organic_sessions,paid_sessions=excluded.paid_sessions,social_sessions=excluded.social_sessions,referral_sessions=excluded.referral_sessions,direct_sessions=excluded.direct_sessions,updated_at=CURRENT_TIMESTAMP`).run(statDate, visitorCount, loggedInUsers, Number(sessionStats.sessions ?? 0), pageViews, Number(sessionStats.engaged_sessions ?? 0), Number(sessionStats.bounces ?? 0), Number(leadCount.count ?? 0), Number(bookingCount.count ?? 0), Number(paymentStats.payments ?? 0), Number(paymentStats.revenue ?? 0), Number(conversionStats.whatsapp_clicks ?? 0), Number(conversionStats.phone_clicks ?? 0), Number(conversionStats.email_clicks ?? 0), Number(sessionStats.organic_sessions ?? 0), Number(sessionStats.paid_sessions ?? 0), Number(sessionStats.social_sessions ?? 0), Number(sessionStats.referral_sessions ?? 0), Number(sessionStats.direct_sessions ?? 0));
}
function refreshDailyPageStats(statDate: string): void {
    const from = startOfDayIso(statDate);
    const to = endOfDayIso(statDate);
    const rows = db.prepare(`SELECT p.path,MAX(p.page_type) AS page_type,MAX(p.entity_type) AS entity_type,MAX(p.entity_id) AS entity_id,p.country,p.state,p.district,p.city,COUNT(*) AS page_views,COUNT(DISTINCT p.visitor_id) AS unique_visitors,COUNT(DISTINCT p.session_id) AS sessions,COALESCE(SUM(CASE WHEN p.engaged=1 THEN 1 ELSE 0 END),0) AS engaged_sessions,COALESCE(SUM(CASE WHEN p.exit_page=1 THEN 1 ELSE 0 END),0) AS exits,COALESCE(SUM(CASE WHEN p.is_bounce_candidate=1 THEN 1 ELSE 0 END),0) AS bounces,COALESCE(SUM(p.duration_seconds),0) AS total_duration_seconds,COALESCE(AVG(p.duration_seconds),0) AS avg_duration_seconds,COALESCE(MAX(p.scroll_depth_percent),0) AS max_scroll_depth_percent,COALESCE(SUM(p.click_count),0) AS clicks FROM web_page_views p WHERE p.is_bot=0 AND p.entered_at BETWEEN ? AND ? GROUP BY p.path,p.country,p.state,p.district,p.city`).all(from, to) as SqlRow[];
    const eventRows = db.prepare(`SELECT path,country,state,district,city,SUM(CASE WHEN LOWER(event_name) IN ('form_start','form_started','form_open') THEN 1 ELSE 0 END) AS form_starts,SUM(CASE WHEN LOWER(event_name) IN ('form_submit','form_submitted','form_submission') THEN 1 ELSE 0 END) AS form_submissions,SUM(CASE WHEN LOWER(event_name) LIKE '%whatsapp%' THEN 1 ELSE 0 END) AS whatsapp_clicks,SUM(CASE WHEN LOWER(event_name) LIKE '%phone%' OR LOWER(event_name) LIKE '%call%' THEN 1 ELSE 0 END) AS phone_clicks,SUM(CASE WHEN LOWER(event_name) LIKE '%email%' OR LOWER(event_name) LIKE '%mail%' THEN 1 ELSE 0 END) AS email_clicks,SUM(CASE WHEN LOWER(event_name) IN ('video_play','video_started','video_start') THEN 1 ELSE 0 END) AS video_plays,SUM(CASE WHEN LOWER(event_name) IN ('gallery_open','gallery_opened') THEN 1 ELSE 0 END) AS gallery_opens FROM web_events WHERE occurred_at BETWEEN ? AND ? GROUP BY path,country,state,district,city`).all(from, to) as SqlRow[];
    const conversionRows = db.prepare(`SELECT COALESCE(pv.path,c.path) AS path,COALESCE(pv.country,'') AS country,COALESCE(pv.state,'') AS state,COALESCE(pv.district,'') AS district,COALESCE(pv.city,'') AS city,c.conversion_type,COUNT(*) AS count,COALESCE(SUM(c.value_amount),0) AS revenue FROM web_conversions c LEFT JOIN web_page_views pv ON pv.id=c.page_view_id WHERE c.created_at BETWEEN ? AND ? GROUP BY COALESCE(pv.path,c.path),COALESCE(pv.country,''),COALESCE(pv.state,''),COALESCE(pv.district,''),COALESCE(pv.city,''),c.conversion_type`).all(from, to) as SqlRow[];
    const deleteStatement = db.prepare(`DELETE FROM analytics_daily_page_stats WHERE stat_date=?`);
    const insertStatement = db.prepare(`INSERT INTO analytics_daily_page_stats (stat_date,path,page_type,entity_type,entity_id,country,state,district,city,page_views,unique_visitors,sessions,engaged_sessions,exits,bounces,total_duration_seconds,avg_duration_seconds,max_scroll_depth_percent,clicks,form_starts,form_submissions,whatsapp_clicks,phone_clicks,email_clicks,video_plays,gallery_opens,leads,bookings,payments,revenue_amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
    db.transaction(() => { deleteStatement.run(statDate); for (const row of rows) {
        const same = (item: SqlRow) => String(item.path ?? "") === String(row.path ?? "") && String(item.country ?? "") === String(row.country ?? "") && String(item.state ?? "") === String(row.state ?? "") && String(item.district ?? "") === String(row.district ?? "") && String(item.city ?? "") === String(row.city ?? "");
        const events = eventRows.filter(same);
        const conversions = conversionRows.filter(same);
        const sumEvent = (key: string) => events.reduce((sum, item) => sum + Number(item[key] ?? 0), 0);
        const sumConversion = (type: string) => conversions.reduce((sum, item) => sum + (item.conversion_type === type ? Number(item.count ?? 0) : 0), 0);
        const revenue = conversions.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0);
        insertStatement.run(statDate, row.path ?? null, row.page_type ?? null, row.entity_type ?? null, row.entity_id ?? null, row.country ?? null, row.state ?? null, row.district ?? null, row.city ?? null, Number(row.page_views ?? 0), Number(row.unique_visitors ?? 0), Number(row.sessions ?? 0), Number(row.engaged_sessions ?? 0), Number(row.exits ?? 0), Number(row.bounces ?? 0), Number(row.total_duration_seconds ?? 0), Number(row.avg_duration_seconds ?? 0), Number(row.max_scroll_depth_percent ?? 0), Number(row.clicks ?? 0), sumEvent("form_starts"), sumEvent("form_submissions"), sumEvent("whatsapp_clicks") + sumConversion("whatsapp"), sumEvent("phone_clicks") + sumConversion("phone_call"), sumEvent("email_clicks") + sumConversion("email"), sumEvent("video_plays"), sumEvent("gallery_opens"), sumConversion("lead"), sumConversion("booking"), sumConversion("payment") + sumConversion("subscription"), revenue);
    } })();
}
function refreshDailyStats(statDate: string): void { refreshDailySiteStats(statDate); refreshDailyPageStats(statDate); }
function sourceDimensionSql(alias = "s"): { source: string; medium: string; campaign: string } {
    const referrer = `LOWER(COALESCE(${alias}.referrer_url,''))`;
    const source = `COALESCE(NULLIF(TRIM(${alias}.utm_source),''),CASE
      WHEN ${referrer} LIKE '%google.%' OR ${referrer} LIKE '%bing.%' OR ${referrer} LIKE '%yahoo.%' OR ${referrer} LIKE '%duckduckgo.%' THEN 'organic search'
      WHEN ${referrer} LIKE '%facebook.%' OR ${referrer} LIKE '%instagram.%' OR ${referrer} LIKE '%youtube.%' OR ${referrer} LIKE '%tiktok.%' OR ${referrer} LIKE '%linkedin.%' OR ${referrer} LIKE '%pinterest.%' THEN 'social'
      WHEN TRIM(COALESCE(${alias}.referrer_url,''))<>'' THEN 'referral'
      ELSE 'direct' END)`;
    const medium = `COALESCE(NULLIF(TRIM(${alias}.utm_medium),''),CASE
      WHEN ${referrer} LIKE '%google.%' OR ${referrer} LIKE '%bing.%' OR ${referrer} LIKE '%yahoo.%' OR ${referrer} LIKE '%duckduckgo.%' THEN 'organic'
      WHEN ${referrer} LIKE '%facebook.%' OR ${referrer} LIKE '%instagram.%' OR ${referrer} LIKE '%youtube.%' OR ${referrer} LIKE '%tiktok.%' OR ${referrer} LIKE '%linkedin.%' OR ${referrer} LIKE '%pinterest.%' THEN 'social'
      WHEN TRIM(COALESCE(${alias}.referrer_url,''))<>'' THEN 'referral'
      ELSE '(none)' END)`;
    const campaign = `COALESCE(NULLIF(TRIM(${alias}.utm_campaign),''),'(none)')`;
    return { source, medium, campaign };
}
router.get("/reports/overview", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const visitorCount = db.prepare(`SELECT COUNT(DISTINCT s.visitor_id) AS count,COUNT(DISTINCT CASE WHEN v.visitor_type='anonymous' THEN s.visitor_id END) AS anonymous_count FROM web_sessions s LEFT JOIN web_visitors v ON v.id=s.visitor_id WHERE s.is_bot=0 AND s.started_at BETWEEN ? AND ?`).get(from, to) as {
            count?: number;
            anonymous_count?: number;
        };
        const sessionStats = db.prepare(`SELECT COUNT(*) AS sessions,COUNT(DISTINCT user_id) AS logged_in_users,COALESCE(SUM(page_views),0) AS page_views,COALESCE(SUM(event_count),0) AS event_count,COALESCE(SUM(CASE WHEN engaged=1 THEN 1 ELSE 0 END),0) AS engaged_sessions,COALESCE(SUM(CASE WHEN is_bounce=1 THEN 1 ELSE 0 END),0) AS bounces,ROUND(COALESCE(AVG(duration_seconds),0),2) AS avg_duration_seconds FROM web_sessions WHERE is_bot=0 AND started_at BETWEEN ? AND ?`).get(from, to) as SqlRow;
        const pageStats = db.prepare(`SELECT ROUND(CASE WHEN COUNT(*)=0 THEN 0 ELSE SUM(duration_seconds)*1.0/COUNT(*) END,2) AS avg_time,ROUND(CASE WHEN COUNT(*)=0 THEN 0 ELSE AVG(scroll_depth_percent) END,2) AS avg_scroll FROM web_page_views WHERE is_bot=0 AND entered_at BETWEEN ? AND ?`).get(from, to) as SqlRow;
        const conversions = db.prepare(`SELECT conversion_type,COUNT(*) AS count,COALESCE(SUM(value_amount),0) AS attributed_value FROM web_conversions WHERE created_at BETWEEN ? AND ? GROUP BY conversion_type ORDER BY count DESC`).all(from, to);
        const leads = tableExists("leads") ? db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='new' THEN 1 ELSE 0 END),0) AS new,COALESCE(SUM(CASE WHEN status='assigned' THEN 1 ELSE 0 END),0) AS assigned,COALESCE(SUM(CASE WHEN status='contacted' THEN 1 ELSE 0 END),0) AS contacted,COALESCE(SUM(CASE WHEN status='follow_up' THEN 1 ELSE 0 END),0) AS follow_up,COALESCE(SUM(CASE WHEN status='converted' THEN 1 ELSE 0 END),0) AS converted,COALESCE(SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END),0) AS closed FROM leads WHERE created_at BETWEEN ? AND ?`).get(from, to) : {};
        const bookings = tableExists("bookings") ? db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(amount),0) AS gross_value FROM bookings WHERE created_at BETWEEN ? AND ?`).get(from, to) : {};
        const payments = tableExists("payments") ? db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN status IN ('authorized','paid','captured','partially_refunded','refunded') THEN amount ELSE 0 END),0) AS gross_revenue,COALESCE(SUM(CASE WHEN status IN ('authorized','paid','captured') THEN amount ELSE 0 END),0) AS collected_revenue,COALESCE(SUM(CASE WHEN status IN ('refunded','partially_refunded') THEN refund_amount_paise/100.0 ELSE 0 END),0) AS refunds FROM payments WHERE created_at BETWEEN ? AND ?`).get(from, to) : {};
        const topPages = db.prepare(`SELECT path,page_type,COUNT(*) AS page_views,COUNT(DISTINCT visitor_id) AS unique_visitors,COUNT(DISTINCT session_id) AS sessions,ROUND(AVG(duration_seconds),2) AS avg_duration_seconds,ROUND(AVG(scroll_depth_percent),2) AS avg_scroll_depth_percent,SUM(click_count) AS clicks,SUM(interaction_count) AS interactions FROM web_page_views WHERE is_bot=0 AND entered_at BETWEEN ? AND ? GROUP BY path,page_type ORDER BY page_views DESC LIMIT 100`).all(from, to);
        const sourceDimensions = sourceDimensionSql("s");
        const sourceBreakdown = db.prepare(`SELECT ${sourceDimensions.source} AS source,${sourceDimensions.medium} AS medium,${sourceDimensions.campaign} AS campaign,COUNT(*) AS sessions,COUNT(DISTINCT s.visitor_id) AS unique_visitors,ROUND(AVG(s.duration_seconds),2) AS avg_duration_seconds FROM web_sessions s WHERE s.is_bot=0 AND s.started_at BETWEEN ? AND ? GROUP BY source,medium,campaign ORDER BY sessions DESC LIMIT 100`).all(from, to);
        const locationBreakdown = db.prepare(`SELECT COALESCE(country,'') AS country,COALESCE(state,'') AS state,COALESCE(district,'') AS district,COALESCE(city,'') AS city,COUNT(*) AS page_views,COUNT(DISTINCT visitor_id) AS unique_visitors,COUNT(DISTINCT session_id) AS sessions FROM web_page_views WHERE is_bot=0 AND entered_at BETWEEN ? AND ? GROUP BY country,state,district,city ORDER BY unique_visitors DESC LIMIT 200`).all(from, to);
        const totalVisitors = Number(visitorCount?.count ?? 0);
        const totalSessions = Number(sessionStats.sessions ?? 0);
        const totalLeads = Number((leads as SqlRow).total ?? 0);
        const totalBookings = Number((bookings as SqlRow).count ?? 0);
        const totalCollectedRevenue = Number((payments as SqlRow).collected_revenue ?? 0);
        res.json({ success: true, role: currentUser(res)?.role ?? null, range: { from: fromDate, to: toDate }, totals: { visitors: totalVisitors, anonymousVisitors: Number(visitorCount?.anonymous_count ?? 0), sessions: totalSessions, loggedInUsers: Number(sessionStats.logged_in_users ?? 0), pageViews: Number(sessionStats.page_views ?? 0), events: Number(sessionStats.event_count ?? 0), engagedSessions: Number(sessionStats.engaged_sessions ?? 0), bounces: Number(sessionStats.bounces ?? 0), bounceRate: totalSessions ? Number(((Number(sessionStats.bounces ?? 0) / totalSessions) * 100).toFixed(2)) : 0, avgDurationSeconds: Number(sessionStats.avg_duration_seconds ?? 0), avgPageDurationSeconds: Number(pageStats.avg_time ?? 0), avgScrollDepthPercent: Number(pageStats.avg_scroll ?? 0), leads: totalLeads, bookings: totalBookings, paidRevenue: totalCollectedRevenue, refunds: Number((payments as SqlRow).refunds ?? 0) }, funnel: { visitors: totalVisitors, sessions: totalSessions, engagedSessions: Number(sessionStats.engaged_sessions ?? 0), leads: totalLeads, bookings: totalBookings, paidRevenue: totalCollectedRevenue }, leads, bookings, payments, attributedConversions: conversions, topPages, sourceBreakdown, locationBreakdown });
    }
    catch (error) {
        console.error("Analytics overview error:", error);
        sendError(res, 500, "Unable to load analytics overview.");
    }
});
router.get("/reports/realtime", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const windowMinutes = Math.min(30, Math.max(1, boundedInteger(req.query.windowMinutes, 5, 1, 30)));
        const modifier = `-${windowMinutes} minutes`;
        const active = db.prepare(`SELECT COUNT(DISTINCT s.visitor_id) AS online_visitors,COUNT(DISTINCT CASE WHEN v.visitor_type='anonymous' THEN s.visitor_id END) AS online_anonymous_visitors,COUNT(*) AS online_sessions FROM web_sessions s LEFT JOIN web_visitors v ON v.id=s.visitor_id WHERE s.is_bot=0 AND s.ended_at IS NULL AND datetime(s.last_activity_at)>=datetime('now',?)`).get(modifier) as SqlRow;
        const activePageViews = db.prepare(`SELECT COUNT(*) AS count FROM web_page_views p INNER JOIN web_sessions s ON s.id=p.session_id WHERE p.is_bot=0 AND s.is_bot=0 AND s.ended_at IS NULL AND datetime(s.last_activity_at)>=datetime('now',?) AND p.exited_at IS NULL`).get(modifier) as SqlRow;
        res.json({ success: true, asOf: new Date().toISOString(), windowMinutes, onlineVisitors: Number(active.online_visitors ?? 0), onlineAnonymousVisitors: Number(active.online_anonymous_visitors ?? 0), onlineSessions: Number(active.online_sessions ?? 0), activePageViews: Number(activePageViews.count ?? 0), definition: `Sessions with activity in the last ${windowMinutes} minutes and no recorded exit.` });
    }
    catch (error) {
        console.error("Analytics realtime report error:", error);
        sendError(res, 500, "Unable to load real-time analytics.");
    }
});
router.get("/reports/page-visits", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const limit = Math.min(1000, Math.max(1, boundedInteger(req.query.limit, 200, 1, 1000)));
        const where = ["p.is_bot=0", "p.entered_at BETWEEN ? AND ?"];
        const params: unknown[] = [from, to];
        const path = normalizeText(req.query.path, 1000);
        const sessionId = idOrNull(req.query.sessionId);
        const visitorId = idOrNull(req.query.visitorId);
        if (path) { where.push("p.path=?"); params.push(path); }
        if (sessionId) { where.push("p.session_id=?"); params.push(sessionId); }
        if (visitorId) { where.push("p.visitor_id=?"); params.push(visitorId); }
        const rows = db.prepare(`SELECT p.id AS page_view_id,p.visitor_id,p.session_id,p.user_id,p.path,p.page_title,p.page_type,p.entity_type,p.entity_id,p.entered_at,p.exited_at,p.duration_seconds,p.scroll_depth_percent,p.click_count,p.interaction_count,p.engaged,p.exit_page,p.is_bounce_candidate,p.country,p.state,p.district,p.city,s.started_at AS session_started_at,s.ended_at AS session_ended_at,s.duration_seconds AS session_duration_seconds,s.device_type,s.browser,s.operating_system FROM web_page_views p LEFT JOIN web_sessions s ON s.id=p.session_id WHERE ${where.join(" AND ")} ORDER BY p.entered_at DESC,p.id DESC LIMIT ?`).all(...params, limit);
        res.json({ success: true, range: { from: fromDate, to: toDate }, count: rows.length, pageVisits: rows });
    }
    catch (error) {
        console.error("Analytics page-visit report error:", error);
        sendError(res, 500, "Unable to load page-visit history.");
    }
});
router.get("/reports/daily-page-visits", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const limit = Math.min(5000, Math.max(1, boundedInteger(req.query.limit, 1000, 1, 5000)));
        const where = ["p.is_bot=0", "p.entered_at BETWEEN ? AND ?"];
        const params: unknown[] = [from, to];
        const path = normalizeText(req.query.path, 1000);
        const sessionId = idOrNull(req.query.sessionId);
        if (path) { where.push("p.path=?"); params.push(path); }
        if (sessionId) { where.push("p.session_id=?"); params.push(sessionId); }
        const rows = db.prepare(`SELECT date(p.entered_at) AS visit_date,p.session_id,p.visitor_id,p.path,MIN(p.entered_at) AS first_start,MAX(COALESCE(p.exited_at,p.entered_at)) AS last_end,SUM(p.duration_seconds) AS total_spent_seconds,COUNT(*) AS visit_count,ROUND(AVG(p.duration_seconds),2) AS avg_visit_seconds,MAX(s.duration_seconds) AS session_duration_seconds,MAX(p.page_type) AS page_type,MAX(p.entity_type) AS entity_type,MAX(p.entity_id) AS entity_id FROM web_page_views p LEFT JOIN web_sessions s ON s.id=p.session_id WHERE ${where.join(" AND ")} GROUP BY date(p.entered_at),p.session_id,p.visitor_id,p.path ORDER BY visit_date DESC,first_start DESC LIMIT ?`).all(...params, limit);
        res.json({ success: true, range: { from: fromDate, to: toDate }, count: rows.length, dailyPageVisits: rows, grouping: ["date", "sessionId", "visitorId", "path"] });
    }
    catch (error) {
        console.error("Analytics daily page-visit report error:", error);
        sendError(res, 500, "Unable to load daily page-visit summaries.");
    }
});

router.get("/reports/pages", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const limit = Math.min(500, Math.max(1, boundedInteger(req.query.limit, 100, 1, 500)));
        const search = normalizeText(req.query.search, 500);
        const where = ["is_bot=0", "entered_at BETWEEN ? AND ?"];
        const params: unknown[] = [from, to];
        if (search) {
            where.push("path LIKE ?");
            params.push(`%${search}%`);
        }
        const rows = db.prepare(`SELECT path,page_type,entity_type,entity_id,COUNT(*) AS page_views,COUNT(DISTINCT visitor_id) AS unique_visitors,COUNT(DISTINCT session_id) AS sessions,ROUND(AVG(duration_seconds),2) AS avg_duration_seconds,ROUND(AVG(scroll_depth_percent),2) AS avg_scroll_depth_percent,SUM(click_count) AS clicks,SUM(interaction_count) AS interactions,SUM(CASE WHEN engaged=1 THEN 1 ELSE 0 END) AS engaged_views,SUM(CASE WHEN exit_page=1 THEN 1 ELSE 0 END) AS exits,MAX(entered_at) AS last_viewed_at FROM web_page_views WHERE ${where.join(" AND ")} GROUP BY path,page_type,entity_type,entity_id ORDER BY page_views DESC LIMIT ?`).all(...params, limit);
        res.json({ success: true, range: { from: fromDate, to: toDate }, pages: rows });
    }
    catch (error) {
        console.error("Analytics pages report error:", error);
        sendError(res, 500, "Unable to load page analytics.");
    }
});
router.get("/reports/events", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const limit = Math.min(500, Math.max(1, boundedInteger(req.query.limit, 200, 1, 500)));
        const rows = db.prepare(`SELECT event_name,event_category,target_type,target_key,COUNT(*) AS count,COUNT(DISTINCT visitor_id) AS unique_visitors,COUNT(DISTINCT session_id) AS sessions,MAX(occurred_at) AS last_occurred_at FROM web_events WHERE occurred_at BETWEEN ? AND ? GROUP BY event_name,event_category,target_type,target_key ORDER BY count DESC LIMIT ?`).all(from, to, limit);
        res.json({ success: true, range: { from: fromDate, to: toDate }, events: rows });
    }
    catch (error) {
        console.error("Analytics events report error:", error);
        sendError(res, 500, "Unable to load event analytics.");
    }
});
router.get("/reports/entities", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const entityType = normalizeText(req.query.entityType, 50);
        const params: unknown[] = [from, to];
        const where = ["p.is_bot=0", "p.entered_at BETWEEN ? AND ?", "p.entity_type IS NOT NULL", "p.entity_id IS NOT NULL"];
        if (entityType) {
            where.push("p.entity_type=?");
            params.push(entityType);
        }
        const rows = db.prepare(`SELECT p.entity_type,p.entity_id,COUNT(*) AS page_views,COUNT(DISTINCT p.visitor_id) AS unique_visitors,COUNT(DISTINCT p.session_id) AS sessions,ROUND(AVG(p.duration_seconds),2) AS avg_duration_seconds,ROUND(AVG(p.scroll_depth_percent),2) AS avg_scroll_depth_percent,COALESCE((SELECT COUNT(*) FROM web_conversions c WHERE c.entity_type=p.entity_type AND c.entity_id=p.entity_id AND c.created_at BETWEEN ? AND ?),0) AS attributed_conversions,COALESCE((SELECT COUNT(*) FROM leads l WHERE l.created_at BETWEEN ? AND ? AND ((p.entity_type='temple' AND l.temple_id=p.entity_id) OR (p.entity_type='pandit' AND l.requested_pandit_id=p.entity_id) OR (p.entity_type='ashram' AND l.ashram_id=p.entity_id) OR (p.entity_type='puja_service' AND l.puja_service_id=p.entity_id) OR (p.entity_type='yatra' AND l.yatra_package_id=p.entity_id) OR (p.entity_type='event' AND l.event_id=p.entity_id) OR (p.entity_type='course' AND l.course_id=p.entity_id) OR (p.entity_type='spiritual_place' AND l.spiritual_place_id=p.entity_id))),0) AS leads FROM web_page_views p WHERE ${where.join(" AND ")} GROUP BY p.entity_type,p.entity_id ORDER BY page_views DESC LIMIT 500`).all(from, to, from, to, ...params);
        res.json({ success: true, range: { from: fromDate, to: toDate }, entities: rows });
    }
    catch (error) {
        console.error("Analytics entity report error:", error);
        sendError(res, 500, "Unable to load entity analytics.");
    }
});
router.get("/reports/locations", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const level = normalizeText(req.query.level, 20).toLowerCase();
        const allowed = ["country", "state", "district", "city"];
        if (level && !allowed.includes(level))
            return sendError(res, 400, "Invalid location level.");
        const columns = (level ? [level] : allowed);
        const rows = db.prepare(`SELECT ${columns.map(column => `COALESCE("${column}",'') AS "${column}"`).join(",")},COUNT(*) AS page_views,COUNT(DISTINCT visitor_id) AS unique_visitors,COUNT(DISTINCT session_id) AS sessions,ROUND(AVG(duration_seconds),2) AS avg_duration_seconds FROM web_page_views WHERE is_bot=0 AND entered_at BETWEEN ? AND ? GROUP BY ${columns.map(column => `"${column}"`).join(",")} ORDER BY unique_visitors DESC LIMIT 500`).all(from, to);
        res.json({ success: true, range: { from: fromDate, to: toDate }, level: level || "country,state,district,city", locations: rows });
    }
    catch (error) {
        console.error("Analytics locations report error:", error);
        sendError(res, 500, "Unable to load location analytics.");
    }
});
router.get("/reports/sources", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const sourceDimensions = sourceDimensionSql("s");
        const conversionSourceDimensions = sourceDimensionSql("cs");
        const rows = db.prepare(`SELECT ${sourceDimensions.source} AS source,${sourceDimensions.medium} AS medium,${sourceDimensions.campaign} AS campaign,COUNT(*) AS sessions,COUNT(DISTINCT s.visitor_id) AS unique_visitors,ROUND(AVG(s.duration_seconds),2) AS avg_duration_seconds,COALESCE((SELECT COUNT(*) FROM web_conversions c LEFT JOIN web_sessions cs ON cs.id=c.session_id WHERE COALESCE(NULLIF(TRIM(c.utm_source),''),${conversionSourceDimensions.source})=${sourceDimensions.source} AND COALESCE(NULLIF(TRIM(c.utm_medium),''),${conversionSourceDimensions.medium})=${sourceDimensions.medium} AND COALESCE(NULLIF(TRIM(c.utm_campaign),''),${conversionSourceDimensions.campaign})=${sourceDimensions.campaign} AND c.created_at BETWEEN ? AND ?),0) AS attributed_conversions FROM web_sessions s WHERE s.is_bot=0 AND s.started_at BETWEEN ? AND ? GROUP BY source,medium,campaign ORDER BY sessions DESC LIMIT 200`).all(from, to, from, to);
        res.json({ success: true, range: { from: fromDate, to: toDate }, sources: rows });
    }
    catch (error) {
        console.error("Analytics source report error:", error);
        sendError(res, 500, "Unable to load source analytics.");
    }
});
router.get("/reports/searches", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const limit = Math.min(500, Math.max(1, boundedInteger(req.query.limit, 100, 1, 500)));
        const rows = db.prepare(`SELECT query_text,COUNT(*) AS searches,COUNT(DISTINCT visitor_id) AS unique_visitors,ROUND(AVG(results_count),2) AS avg_results_count,SUM(CASE WHEN converted=1 THEN 1 ELSE 0 END) AS conversions,MAX(created_at) AS last_searched_at FROM site_searches WHERE created_at BETWEEN ? AND ? GROUP BY query_text ORDER BY searches DESC LIMIT ?`).all(from, to, limit);
        res.json({ success: true, range: { from: fromDate, to: toDate }, searches: rows });
    }
    catch (error) {
        console.error("Analytics searches report error:", error);
        sendError(res, 500, "Unable to load search analytics.");
    }
});
router.get("/reports/daily", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { fromDate, toDate } = buildDateRange(req);
        const daily = db.prepare(`SELECT * FROM analytics_daily_site_stats WHERE stat_date BETWEEN ? AND ? ORDER BY stat_date ASC`).all(fromDate, toDate);
        res.json({ success: true, range: { from: fromDate, to: toDate }, daily });
    }
    catch (error) {
        console.error("Analytics daily report error:", error);
        sendError(res, 500, "Unable to load daily analytics.");
    }
});
router.get("/reports/business", requireAuth, requireRole("super_admin", "sales"), (req, res) => {
    try {
        const { from, to, fromDate, toDate } = buildDateRange(req);
        const leadModules = tableExists("leads") ? db.prepare(`SELECT CASE WHEN requested_pandit_id IS NOT NULL THEN 'pandit' WHEN temple_id IS NOT NULL THEN 'temple' WHEN ashram_id IS NOT NULL THEN 'ashram' WHEN puja_service_id IS NOT NULL THEN 'puja_service' WHEN yatra_package_id IS NOT NULL THEN 'yatra' WHEN event_id IS NOT NULL THEN 'event' WHEN course_id IS NOT NULL THEN 'course' WHEN spiritual_place_id IS NOT NULL THEN 'spiritual_place' ELSE COALESCE(service_type,'general') END AS module,COUNT(*) AS leads,SUM(CASE WHEN status='converted' THEN 1 ELSE 0 END) AS converted,SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed FROM leads WHERE created_at BETWEEN ? AND ? GROUP BY module ORDER BY leads DESC`).all(from, to) : [];
        const leadStatuses = tableExists("leads") ? db.prepare(`SELECT status,COUNT(*) AS count FROM leads WHERE created_at BETWEEN ? AND ? GROUP BY status ORDER BY count DESC`).all(from, to) : [];
        const bookingsByKind = tableExists("bookings") ? db.prepare(`SELECT COALESCE(kind,'general') AS kind,COUNT(*) AS count,COALESCE(SUM(amount),0) AS value FROM bookings WHERE created_at BETWEEN ? AND ? GROUP BY kind ORDER BY count DESC`).all(from, to) : [];
        const revenueByPurpose = tableExists("payments") ? db.prepare(`SELECT purpose,COUNT(*) AS payments,COALESCE(SUM(CASE WHEN status IN ('authorized','paid','captured','partially_refunded','refunded') THEN amount ELSE 0 END),0) AS gross,COALESCE(SUM(CASE WHEN status IN ('refunded','partially_refunded') THEN refund_amount_paise/100.0 ELSE 0 END),0) AS refunds FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY purpose ORDER BY gross DESC`).all(from, to) : [];
        const subscriptionSales = tableExists("payment_orders") ? db.prepare(`SELECT sp.audience,sp.code AS plan_code,sp.name AS plan_name,COUNT(*) AS subscriptions,COALESCE(SUM(CASE WHEN p.status IN ('authorized','paid','captured') THEN p.amount ELSE 0 END),0) AS collected FROM payment_orders po LEFT JOIN subscription_plans sp ON sp.id=po.plan_id LEFT JOIN payments p ON p.payment_order_id=po.id WHERE po.created_at BETWEEN ? AND ? AND po.purpose='subscription' GROUP BY sp.audience,sp.code,sp.name ORDER BY collected DESC`).all(from, to) : [];
        res.json({ success: true, range: { from: fromDate, to: toDate }, leadModules, leadStatuses, bookingsByKind, revenueByPurpose, subscriptionSales });
    }
    catch (error) {
        console.error("Analytics business report error:", error);
        sendError(res, 500, "Unable to load business analytics.");
    }
});
router.get("/reports/owner/overview", requireAuth, (req, res) => {
    try {
        const access = requireOwnerAnalytics(res);
        if (!access)
            return;
        const { scope, user } = access;
        const { from, to, fromDate, toDate } = buildDateRange(req, OWNER_MAX_DAYS);
        if (isAdminAnalyticsUser(user))
            return res.redirect(`/api/analytics/reports/overview?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`);
        const pageScope = entityScopeForOwner(scope, "pv");
        const eventScope = entityScopeForOwner(scope, "we");
        const conversionScope = entityScopeForOwner(scope, "c");
        const leadScope = ownerLeadScope(scope, "l");
        const bookingScope = ownerBookingScope(scope, "b");
        const paymentScope = ownerPaymentScope(scope, "p");
        const pages = db.prepare(`SELECT COUNT(*) AS count,COUNT(DISTINCT pv.visitor_id) AS visitors,COUNT(DISTINCT pv.session_id) AS sessions,ROUND(AVG(pv.duration_seconds),2) AS avg_duration FROM web_page_views pv WHERE pv.is_bot=0 AND pv.entered_at BETWEEN ? AND ? ${pageScope.sql}`).get(from, to, ...pageScope.params) as SqlRow;
        const events = db.prepare(`SELECT COUNT(*) AS count FROM web_events we WHERE we.occurred_at BETWEEN ? AND ? ${eventScope.sql}`).get(from, to, ...eventScope.params) as SqlRow;
        const conversions = db.prepare(`SELECT conversion_type,COUNT(*) AS count,COALESCE(SUM(value_amount),0) AS value_amount FROM web_conversions c WHERE c.created_at BETWEEN ? AND ? ${conversionScope.sql} GROUP BY conversion_type ORDER BY count DESC`).all(from, to, ...conversionScope.params);
        const leads: SqlRow = tableExists("leads")
            ? (db.prepare(`SELECT COUNT(*) AS count,SUM(CASE WHEN l.status='converted' THEN 1 ELSE 0 END) AS converted FROM leads l WHERE l.created_at BETWEEN ? AND ? ${leadScope.sql}`).get(from, to, ...leadScope.params) as SqlRow)
            : { count: 0, converted: 0 };
        const bookings: SqlRow = tableExists("bookings")
            ? (db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(b.amount),0) AS value FROM bookings b WHERE b.created_at BETWEEN ? AND ? ${bookingScope.sql}`).get(from, to, ...bookingScope.params) as SqlRow)
            : { count: 0, value: 0 };
        const payments: SqlRow = tableExists("payments")
            ? (db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN p.status IN ('authorized','paid','captured') THEN p.amount ELSE 0 END),0) AS collected,COALESCE(SUM(CASE WHEN p.status IN ('refunded','partially_refunded') THEN p.refund_amount_paise/100.0 ELSE 0 END),0) AS refunds FROM payments p WHERE p.created_at BETWEEN ? AND ? ${paymentScope.sql}`).get(from, to, ...paymentScope.params) as SqlRow)
            : { count: 0, collected: 0, refunds: 0 };
        res.json({ success: true, role: user.role, scope: { analyticsLevel: scope.analyticsLevel, panditIds: scope.panditIds, templeIds: scope.templeIds, ashramIds: scope.ashramIds }, range: { from: fromDate, to: toDate }, totals: { pageViews: Number(pages.count ?? 0), uniqueVisitors: Number(pages.visitors ?? 0), sessions: Number(pages.sessions ?? 0), avgPageDurationSeconds: Number(pages.avg_duration ?? 0), events: Number(events.count ?? 0), leads: Number(leads.count ?? 0), convertedLeads: Number(leads.converted ?? 0), bookings: Number(bookings.count ?? 0), bookingValue: Number(bookings.value ?? 0), collectedRevenue: Number(payments.collected ?? 0), refunds: Number(payments.refunds ?? 0) }, conversions });
    }
    catch (error) {
        console.error("Owner analytics overview error:", error);
        sendError(res, 500, "Unable to load owner analytics overview.");
    }
});
router.get("/reports/owner/pages", requireAuth, (req, res) => {
    try {
        const access = requireOwnerAnalytics(res);
        if (!access)
            return;
        const { scope } = access;
        const { from, to, fromDate, toDate } = buildDateRange(req, OWNER_MAX_DAYS);
        const limit = Math.min(300, Math.max(1, boundedInteger(req.query.limit, 100, 1, 300)));
        const search = normalizeText(req.query.search, 500);
        const pageScope = entityScopeForOwner(scope, "pv");
        const where = ["pv.is_bot=0", "pv.entered_at BETWEEN ? AND ?", pageScope.sql.replace(/^AND /, "")];
        const params: unknown[] = [from, to, ...pageScope.params];
        if (search) {
            where.push("pv.path LIKE ?");
            params.push(`%${search}%`);
        }
        const rows = db.prepare(`SELECT pv.path,pv.page_type,pv.entity_type,pv.entity_id,COUNT(*) AS page_views,COUNT(DISTINCT pv.visitor_id) AS unique_visitors,COUNT(DISTINCT pv.session_id) AS sessions,ROUND(AVG(pv.duration_seconds),2) AS avg_duration_seconds,ROUND(AVG(pv.scroll_depth_percent),2) AS avg_scroll_depth_percent,SUM(pv.click_count) AS clicks,SUM(pv.interaction_count) AS interactions,SUM(CASE WHEN pv.engaged=1 THEN 1 ELSE 0 END) AS engaged_views FROM web_page_views pv WHERE ${where.join(" AND ")} GROUP BY pv.path,pv.page_type,pv.entity_type,pv.entity_id ORDER BY page_views DESC LIMIT ?`).all(...params, limit);
        res.json({ success: true, range: { from: fromDate, to: toDate }, analyticsLevel: scope.analyticsLevel, pages: rows });
    }
    catch (error) {
        console.error("Owner analytics pages error:", error);
        sendError(res, 500, "Unable to load owner page analytics.");
    }
});
router.get("/reports/owner/conversions", requireAuth, (req, res) => {
    try {
        const access = requireOwnerAnalytics(res);
        if (!access)
            return;
        const { scope } = access;
        const { from, to, fromDate, toDate } = buildDateRange(req, OWNER_MAX_DAYS);
        const conversionScope = entityScopeForOwner(scope, "c");
        const rows = db.prepare(`SELECT conversion_type,COUNT(*) AS count,COALESCE(SUM(value_amount),0) AS value_amount,COUNT(DISTINCT visitor_id) AS unique_visitors FROM web_conversions c WHERE c.created_at BETWEEN ? AND ? ${conversionScope.sql} GROUP BY conversion_type ORDER BY count DESC`).all(from, to, ...conversionScope.params);
        res.json({ success: true, range: { from: fromDate, to: toDate }, analyticsLevel: scope.analyticsLevel, conversions: rows });
    }
    catch (error) {
        console.error("Owner conversion analytics error:", error);
        sendError(res, 500, "Unable to load owner conversion analytics.");
    }
});
router.get("/reports/owner/sources", requireAuth, (req, res) => {
    try {
        const access = requireOwnerAnalytics(res);
        if (!access)
            return;
        if (access.scope.analyticsLevel !== "advanced")
            return sendError(res, 403, "Advanced analytics is required for source reporting.");
        const { scope } = access;
        const { from, to, fromDate, toDate } = buildDateRange(req, OWNER_MAX_DAYS);
        const entityScope = entityScopeForOwner(scope, "pv");
        const rows = db.prepare(`SELECT COALESCE(NULLIF(TRIM(pv.utm_source),''),'direct') AS source,COALESCE(NULLIF(TRIM(pv.utm_medium),''),'(none)') AS medium,COUNT(*) AS page_views,COUNT(DISTINCT pv.visitor_id) AS unique_visitors,COUNT(DISTINCT pv.session_id) AS sessions FROM web_page_views pv WHERE pv.is_bot=0 AND pv.entered_at BETWEEN ? AND ? ${entityScope.sql} GROUP BY source,medium ORDER BY sessions DESC LIMIT 200`).all(from, to, ...entityScope.params);
        res.json({ success: true, range: { from: fromDate, to: toDate }, sources: rows });
    }
    catch (error) {
        console.error("Owner source analytics error:", error);
        sendError(res, 500, "Unable to load owner source analytics.");
    }
});
router.get("/reports/owner/locations", requireAuth, (req, res) => {
    try {
        const access = requireOwnerAnalytics(res);
        if (!access)
            return;
        const { scope } = access;
        const { from, to, fromDate, toDate } = buildDateRange(req, OWNER_MAX_DAYS);
        const entityScope = entityScopeForOwner(scope, "pv");
        const rows = db.prepare(`SELECT COALESCE(pv.country,'') AS country,COALESCE(pv.state,'') AS state,COALESCE(pv.district,'') AS district,COALESCE(pv.city,'') AS city,COUNT(*) AS page_views,COUNT(DISTINCT pv.visitor_id) AS unique_visitors,COUNT(DISTINCT pv.session_id) AS sessions FROM web_page_views pv WHERE pv.is_bot=0 AND pv.entered_at BETWEEN ? AND ? ${entityScope.sql} GROUP BY pv.country,pv.state,pv.district,pv.city ORDER BY unique_visitors DESC LIMIT 200`).all(from, to, ...entityScope.params);
        res.json({ success: true, range: { from: fromDate, to: toDate }, analyticsLevel: scope.analyticsLevel, locations: rows });
    }
    catch (error) {
        console.error("Owner location analytics error:", error);
        sendError(res, 500, "Unable to load owner location analytics.");
    }
});
router.get("/goals", requireAuth, requireRole("super_admin", "sales"), (_req, res) => { try {
    const goals = db.prepare(`SELECT * FROM analytics_goals ORDER BY is_active DESC,id ASC`).all();
    res.json({ success: true, goals });
}
catch (error) {
    console.error("Analytics goals list error:", error);
    sendError(res, 500, "Unable to load analytics goals.");
} });
router.post("/goals", requireAuth, requireRole("super_admin"), (req, res) => { try {
    const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
    const name = normalizeText(body.name, 180);
    const slug = normalizeText(body.slug ?? name, 160).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const eventName = normalizeText(body.eventName, 120);
    const goalType = normalizeText(body.goalType, 30).toLowerCase() || "conversion";
    if (!name || !slug || !eventName)
        return sendError(res, 400, "name, slug and eventName are required.");
    if (!["engagement", "conversion", "revenue"].includes(goalType))
        return sendError(res, 400, "Invalid goal type.");
    const result = db.prepare(`INSERT INTO analytics_goals (name,slug,event_name,page_pattern,entity_type,entity_id,goal_type,value_amount,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(name, slug, eventName, nullableText(body.pagePattern, 1000), nullableText(body.entityType, 100), idOrNull(body.entityId), goalType, boundedInteger(body.valueAmount, 0, 0, 1000000000), boolValue(body.isActive, true) ? 1 : 0);
    res.status(201).json({ success: true, goal: db.prepare(`SELECT * FROM analytics_goals WHERE id=? LIMIT 1`).get(Number(result.lastInsertRowid)) });
}
catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique constraint"))
        return sendError(res, 409, "A goal with this slug already exists.");
    console.error("Analytics goal create error:", error);
    sendError(res, 500, "Unable to create analytics goal.");
} });
router.patch("/goals/:id", requireAuth, requireRole("super_admin"), (req, res) => { try {
    const goalId = idOrNull(req.params.id);
    if (!goalId)
        return sendError(res, 400, "Invalid goal id.");
    if (!db.prepare(`SELECT id FROM analytics_goals WHERE id=? LIMIT 1`).get(goalId))
        return sendError(res, 404, "Analytics goal not found.");
    const body = req.body && typeof req.body === "object" ? (req.body as SqlRow) : {};
    const updates: string[] = [];
    const params: unknown[] = [];
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
        const name = normalizeText(body.name, 180);
        if (!name)
            return sendError(res, 400, "Goal name cannot be empty.");
        updates.push("name=?");
        params.push(name);
    }
    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
        const slug = normalizeText(body.slug, 160).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!slug)
            return sendError(res, 400, "Goal slug cannot be empty.");
        updates.push("slug=?");
        params.push(slug);
    }
    if (Object.prototype.hasOwnProperty.call(body, "eventName")) {
        const eventName = normalizeText(body.eventName, 120);
        if (!eventName)
            return sendError(res, 400, "Goal eventName cannot be empty.");
        updates.push("event_name=?");
        params.push(eventName);
    }
    if (Object.prototype.hasOwnProperty.call(body, "pagePattern")) {
        updates.push("page_pattern=?");
        params.push(nullableText(body.pagePattern, 1000));
    }
    if (Object.prototype.hasOwnProperty.call(body, "entityType")) {
        updates.push("entity_type=?");
        params.push(nullableText(body.entityType, 100));
    }
    if (Object.prototype.hasOwnProperty.call(body, "entityId")) {
        updates.push("entity_id=?");
        params.push(idOrNull(body.entityId));
    }
    if (Object.prototype.hasOwnProperty.call(body, "goalType")) {
        const type = normalizeText(body.goalType, 30).toLowerCase();
        if (!["engagement", "conversion", "revenue"].includes(type))
            return sendError(res, 400, "Invalid goal type.");
        updates.push("goal_type=?");
        params.push(type);
    }
    if (Object.prototype.hasOwnProperty.call(body, "valueAmount")) {
        updates.push("value_amount=?");
        params.push(boundedInteger(body.valueAmount, 0, 0, 1000000000));
    }
    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
        updates.push("is_active=?");
        params.push(boolValue(body.isActive, true) ? 1 : 0);
    }
    if (!updates.length)
        return sendError(res, 400, "No supported goal fields were supplied.");
    updates.push("updated_at=CURRENT_TIMESTAMP");
    params.push(goalId);
    db.prepare(`UPDATE analytics_goals SET ${updates.join(",")} WHERE id=?`).run(...params);
    res.json({ success: true, goal: db.prepare(`SELECT * FROM analytics_goals WHERE id=? LIMIT 1`).get(goalId) });
}
catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique constraint"))
        return sendError(res, 409, "A goal with this slug already exists.");
    console.error("Analytics goal update error:", error);
    sendError(res, 500, "Unable to update analytics goal.");
} });
router.post("/admin/rebuild-daily", requireAuth, requireRole("super_admin"), (req, res) => { try {
    const date = normalizeText(req.body?.date, 20) || isoDateOnly(new Date());
    if (!isValidDateOnly(date))
        return sendError(res, 400, "date must use YYYY-MM-DD format.");
    refreshDailyStats(date);
    res.json({ success: true, date, rebuilt: true });
}
catch (error) {
    console.error("Analytics daily rebuild error:", error);
    sendError(res, 500, "Unable to rebuild daily analytics.");
} });
router.post("/admin/rebuild-range", requireAuth, requireRole("super_admin"), (req, res) => { try {
    const from = normalizeText(req.body?.from, 20);
    const to = normalizeText(req.body?.to, 20);
    if (!isValidDateOnly(from) || !isValidDateOnly(to) || from > to)
        return sendError(res, 400, "from and to must be valid YYYY-MM-DD dates.");
    if (dateDiffDays(from, to) > MAX_REPORT_DAYS)
        return sendError(res, 400, `The rebuild range cannot exceed ${MAX_REPORT_DAYS} days.`);
    const current = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    let count = 0;
    while (current <= end) {
        refreshDailyStats(isoDateOnly(current));
        current.setUTCDate(current.getUTCDate() + 1);
        count += 1;
    }
    res.json({ success: true, from, to, rebuiltDays: count });
}
catch (error) {
    console.error("Analytics range rebuild error:", error);
    sendError(res, 500, "Unable to rebuild analytics range.");
} });
router.get("/health", optionalAuth, (_req, res) => { try {
    const checks = { webVisitors: tableExists("web_visitors"), webSessions: tableExists("web_sessions"), webPageViews: tableExists("web_page_views"), webEvents: tableExists("web_events"), webConversions: tableExists("web_conversions"), goals: tableExists("analytics_goals"), dailyStats: tableExists("analytics_daily_site_stats"), dailyPageStats: tableExists("analytics_daily_page_stats"), siteSearches: tableExists("site_searches") };
    const healthy = Object.values(checks).every(Boolean);
    res.status(healthy ? 200 : 503).json({ success: healthy, healthy, trackingEnabled: !ANALYTICS_REQUIRE_CONSENT, consentRequired: ANALYTICS_REQUIRE_CONSENT, checks, config: { sessionMinutes: SESSION_MINUTES, visitorCookieDays: VISITOR_COOKIE_DAYS, rateLimitWindowMinutes: RATE_WINDOW_MINUTES, rateLimitPerWindow: RATE_LIMIT_COUNT, rateLimits: RATE_LIMITS, maxReportDays: MAX_REPORT_DAYS, ownerMaxReportDays: OWNER_MAX_DAYS, consentVersion: DEFAULT_CONSENT_VERSION } });
}
catch (error) {
    console.error("Analytics health error:", error);
    sendError(res, 500, "Unable to load analytics health.");
} });
router.post("/admin/purge", requireAuth, requireRole("super_admin"), (req, res) => { try {
    const days = Math.min(730, Math.max(30, boundedInteger(req.body?.days, 395, 30, 730)));
    const before = new Date();
    before.setUTCDate(before.getUTCDate() - days);
    const cutoff = before.toISOString();
    const transaction = db.transaction(() => { const events = db.prepare(`DELETE FROM web_events WHERE occurred_at<?`).run(cutoff).changes; const pageViews = db.prepare(`DELETE FROM web_page_views WHERE entered_at<?`).run(cutoff).changes; const searches = tableExists("site_searches") ? db.prepare(`DELETE FROM site_searches WHERE created_at<?`).run(cutoff).changes : 0; const conversions = db.prepare(`DELETE FROM web_conversions WHERE created_at<?`).run(cutoff).changes; const sessions = db.prepare(`DELETE FROM web_sessions WHERE started_at<?`).run(cutoff).changes; const visitors = db.prepare(`DELETE FROM web_visitors WHERE last_seen_at<? AND NOT EXISTS(SELECT 1 FROM web_sessions ws WHERE ws.visitor_id=web_visitors.id)`).run(cutoff).changes; return { events, pageViews, searches, conversions, sessions, visitors }; });
    res.json({ success: true, retentionDays: days, cutoff, deleted: transaction() });
}
catch (error) {
    console.error("Analytics purge error:", error);
    sendError(res, 500, "Unable to purge old analytics data.");
} });
export { router as analyticsRouter, router as analyticsRoutes };
export default router;
