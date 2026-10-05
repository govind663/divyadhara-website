import {
  Router,
  type Request,
  type Response,
} from "express";

import {
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

import { db } from "../db/database.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Pandit Self-Service API — FINAL
|--------------------------------------------------------------------------
|
| Canonical business rules:
| - Only authenticated Pandit accounts can use this router.
| - Public registration/approval is controlled by auth + Admin workflows.
| - Admin exclusively owns profile approval, verification flags and
|   featured status; this router never self-approves or self-verifies them.
| - Public listing requires: active user + approved profile + verified
|   identity/profile/contact + active paid subscription + listing entitlement.
| - Subscription plan terms come from subscription_plans and are frozen into
|   pandit_subscriptions only as a pending commercial snapshot. Payment/
|   activation is trusted only from payments.ts / payment infrastructure.
| - Pandits cannot grant themselves credits, modify quota counters, or edit
|   payment references / subscription entitlements.
| - Service and service-area limits are enforced server-side.
| - Approved verification documents are immutable. Rejected documents may be
|   resubmitted; deletion is allowed only before approval.
| - Historical subscriptions/services/documents/leads remain auditable.
|--------------------------------------------------------------------------
*/

const router = Router();
router.use(requireAuth, requireRole("pandit"));

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

type PanditProfileRow = {
  id: number;
  user_id: number;
  slug: string;
  display_name: string;
  title: string | null;
  photo: string | null;
  experience_years: number;
  location: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  location_id: number | null;
  country_location_id: number | null;
  state_location_id: number | null;
  district_location_id: number | null;
  city_location_id: number | null;
  languages_json: string | null;
  specializations_json: string | null;
  puja_types_json: string | null;
  service_areas_json: string | null;
  associated_with: string | null;
  about: string | null;
  availability: string | null;
  profile_status: string;
  verification_status: string;
  identity_verified: number;
  profile_verified: number;
  authorized_contact: number;
  featured: number;
  listing_active: number;
  verified_at: string | null;
  verification_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type ServiceRow = {
  id: number;
  pandit_id: number;
  name: string;
  slug: string | null;
  description: string | null;
  price_display: string | null;
  duration_text: string | null;
  price_amount: number | null;
  currency: string;
  duration_minutes: number | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type VerificationDocumentRow = {
  id: number;
  pandit_id: number;
  document_type: string;
  document_name: string | null;
  document_url: string | null;
  status: string;
  reviewer_id: number | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlanRow = {
  id: number;
  code: string;
  audience: string;
  name: string;
  description: string | null;
  price_amount: number;
  currency: string;
  billing_interval: string;
  duration_days: number;
  lead_limit: number;
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
  service_limit: number;
  service_area_limit: number;
  gallery_limit: number;
  video_limit: number;
  program_limit: number;
  plan_features_json: string;
  razorpay_plan_id: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SubscriptionRow = {
  id: number;
  pandit_id: number;
  plan_id: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  lead_limit: number;
  leads_used: number;
  auto_renew: number;
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
  service_limit: number;
  service_area_limit: number;
  gallery_limit: number;
  video_limit: number;
  program_limit: number;
  payment_order_id: number | null;
  payment_id: number | null;
  razorpay_subscription_id: string | null;
  plan_snapshot_json: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan_code?: string;
  plan_name?: string;
  plan_price?: number;
  plan_currency?: string;
  plan_interval?: string;
};

type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function userOf(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bodyOf(req: Request): Record<string, unknown> {
  return record(req.body) ? req.body : {};
}

function text(value: unknown, max = 500): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim().slice(0, max);
  return "";
}

function nullable(value: unknown, max = 500): string | null {
  const v = text(value, max);
  return v || null;
}

function required(value: unknown, field: string, max: number, min = 1): Parsed<string> {
  if (typeof value !== "string") return { ok: false, error: `${field} must be a text value.` };
  const v = value.trim();
  if (v.length < min) return { ok: false, error: `${field} must contain at least ${min} character${min === 1 ? "" : "s"}.` };
  if (v.length > max) return { ok: false, error: `${field} cannot exceed ${max} characters.` };
  return { ok: true, value: v };
}

function positiveId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function integer(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER, nullableValue = true): Parsed<number | null> {
  if (value === undefined || value === null || value === "") {
    return nullableValue ? { ok: true, value: null } : { ok: false, error: `${field} is required.` };
  }
  const n = Number(value);
  if (!Number.isInteger(n)) return { ok: false, error: `${field} must be a whole number.` };
  if (n < min) return { ok: false, error: `${field} cannot be less than ${min}.` };
  if (n > max) return { ok: false, error: `${field} cannot be greater than ${max}.` };
  return { ok: true, value: n };
}

function money(value: unknown, field = "Price"): Parsed<number | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return { ok: false, error: `${field} must be a non-negative amount in INR.` };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return { ok: false, error: `${field} must be a whole INR amount because the Pandit service price is stored in rupees.` };
  }
  return { ok: true, value: n };
}

function bool(value: unknown, field: string): Parsed<boolean> {
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "number" && (value === 0 || value === 1)) return { ok: true, value: value === 1 };
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(v)) return { ok: true, value: true };
    if (["false", "0", "no", "off"].includes(v)) return { ok: true, value: false };
  }
  return { ok: false, error: `${field} must be true or false.` };
}

function stringArray(value: unknown, maxItems = 50, maxLength = 150): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const result: string[] = [];
  for (const item of source.slice(0, maxItems)) {
    if (typeof item !== "string") continue;
    const v = item.trim().slice(0, maxLength);
    if (v && !result.includes(v)) result.push(v);
  }
  return result;
}

function readArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return stringArray(parsed);
  } catch {
    return [];
  }
}

function json(value: unknown, fallback = "[]"): string {
  try { return JSON.stringify(value); } catch { return fallback; }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return record(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "pandit";
}

function safeUrl(value: string | null): boolean {
  if (!value) return true;
  if (value.startsWith("/") || value.startsWith("./")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = typeof forwarded === "string" ? forwarded.split(",")[0] : req.ip;
  return raw ? raw.trim().slice(0, 100) : null;
}

function userAgent(req: Request): string | null {
  const raw = req.get("user-agent");
  return raw ? raw.slice(0, 1000) : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePhone(value: string | null): string {
  if (!value) return "";
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function uniquePositiveIds(value: unknown, maxItems = 100): number[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const ids: number[] = [];
  for (const item of source.slice(0, maxItems)) {
    const id = positiveId(item);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function verifyLocationIds(locationIds: number[]): { ok: true } | { ok: false; invalid: number[] } {
  const invalid = locationIds.filter((id) => {
    const row = db.prepare(`SELECT id, status FROM locations WHERE id = ? LIMIT 1`).get(id) as { id?: number; status?: string } | undefined;
    return !row || String(row.status) !== "active";
  });
  return invalid.length ? { ok: false, invalid } : { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Location helpers                                                           */
/* -------------------------------------------------------------------------- */

function resolveLocation(locationId: number): Row | null {
  return (db.prepare(`SELECT id, parent_id, type, name, slug, status FROM locations WHERE id = ? LIMIT 1`).get(locationId) as Row | undefined) ?? null;
}

function locationChain(locationId: number | null): {
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
} {
  const result = {
    country: null as string | null,
    state: null as string | null,
    district: null as string | null,
    city: null as string | null,
  };
  let id = locationId;
  let guard = 0;
  while (id && guard++ < 10) {
    const row = resolveLocation(id) as { id: number; parent_id: number | null; type: string; name: string } | null;
    if (!row) break;
    if (row.type === "country") result.country = row.name;
    if (row.type === "state") result.state = row.name;
    if (row.type === "district") result.district = row.name;
    if (row.type === "city") result.city = row.name;
    id = row.parent_id;
  }
  return result;
}

function updateProfileLocationCache(panditId: number, locationId: number | null): void {
  if (!locationId) {
    db.prepare(`
      UPDATE pandit_profiles
      SET country_location_id = NULL,
          state_location_id = NULL,
          district_location_id = NULL,
          city_location_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(panditId);
    return;
  }

  const chain = locationChain(locationId);
  const ids = db.prepare(`
    SELECT country_id, state_id, district_id, city_id
    FROM locations WHERE id = ? LIMIT 1
  `).get(locationId) as {
    country_id?: number | null;
    state_id?: number | null;
    district_id?: number | null;
    city_id?: number | null;
  } | undefined;

  db.prepare(`
    UPDATE pandit_profiles
    SET country = ?, state = ?, district = ?, city = ?,
        country_location_id = ?, state_location_id = ?, district_location_id = ?, city_location_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    chain.country ?? "India",
    chain.state,
    chain.district,
    chain.city,
    ids?.country_id ?? null,
    ids?.state_id ?? null,
    ids?.district_id ?? null,
    ids?.city_id ?? null,
    panditId,
  );
}

function upsertPanditServiceLocations(panditId: number, locationIds: number[], replace = true): void {
  if (replace) {
    db.prepare(`DELETE FROM pandit_service_locations WHERE pandit_id = ? AND relation_type = 'service_area'`).run(panditId);
  }
  const statement = db.prepare(`
    INSERT OR IGNORE INTO pandit_service_locations
    (pandit_id, location_id, relation_type, is_active, priority, created_at, updated_at)
    VALUES (?, ?, 'service_area', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  for (const locationId of locationIds) statement.run(panditId, locationId);
}

function getPanditServiceLocationIds(panditId: number): number[] {
  const rows = db.prepare(`
    SELECT location_id FROM pandit_service_locations
    WHERE pandit_id = ? AND relation_type = 'service_area' AND is_active = 1
    ORDER BY priority DESC, id ASC
  `).all(panditId) as Array<{ location_id: number }>;
  return rows.map((row) => Number(row.location_id)).filter((id) => Number.isInteger(id) && id > 0);
}

/* -------------------------------------------------------------------------- */
/* Readers / serializers                                                      */
/* -------------------------------------------------------------------------- */

function getProfile(userId: number): PanditProfileRow | undefined {
  return db.prepare(`
    SELECT id, user_id, slug, display_name, title, photo, experience_years,
           location, city, district, state, country, location_id,
           country_location_id, state_location_id, district_location_id, city_location_id,
           languages_json, specializations_json, puja_types_json, service_areas_json,
           associated_with, about, availability, profile_status, verification_status,
           identity_verified, profile_verified, authorized_contact, featured, listing_active,
           verified_at, verification_notes, rejection_reason, created_at, updated_at
    FROM pandit_profiles WHERE user_id = ? LIMIT 1
  `).get(userId) as PanditProfileRow | undefined;
}

function getServices(panditId: number): ServiceRow[] {
  return db.prepare(`
    SELECT id, pandit_id, name, slug, description, price_display, duration_text,
           price_amount, currency, duration_minutes, is_active, sort_order,
           created_at, updated_at
    FROM pandit_service_offerings
    WHERE pandit_id = ? ORDER BY sort_order ASC, id DESC
  `).all(panditId) as ServiceRow[];
}

function getService(userId: number, serviceId: number): ServiceRow | undefined {
  return db.prepare(`
    SELECT ps.id, ps.pandit_id, ps.name, ps.slug, ps.description, ps.price_display,
           ps.duration_text, ps.price_amount, ps.currency, ps.duration_minutes,
           ps.is_active, ps.sort_order, ps.created_at, ps.updated_at
    FROM pandit_service_offerings ps
    INNER JOIN pandit_profiles pp ON pp.id = ps.pandit_id
    WHERE pp.user_id = ? AND ps.id = ? LIMIT 1
  `).get(userId, serviceId) as ServiceRow | undefined;
}

function getDocuments(panditId: number): VerificationDocumentRow[] {
  return db.prepare(`
    SELECT id, pandit_id, document_type, document_name, document_url, status,
           reviewer_id, reviewer_note, reviewed_at, created_at, updated_at
    FROM pandit_verification_documents
    WHERE pandit_id = ? ORDER BY id DESC
  `).all(panditId) as VerificationDocumentRow[];
}

function getPlans(): PlanRow[] {
  return db.prepare(`
    SELECT id, code, audience, name, description, price_amount, currency,
           billing_interval, duration_days, lead_limit,
           service_limit, service_area_limit, gallery_limit, video_limit, program_limit,
           listing_enabled, featured_listing, priority_support, verification_badge,
           analytics_access, homepage_promotion, live_aarti_enabled, enhanced_seo,
           enhanced_profile, whatsapp_enquiry, search_visibility, analytics_level,
           plan_features_json, razorpay_plan_id, is_active, sort_order,
           created_at, updated_at
    FROM subscription_plans
    WHERE audience = 'pandit' AND is_active = 1
    ORDER BY sort_order ASC, price_amount ASC, id ASC
  `).all() as PlanRow[];
}

function getCurrentSubscription(panditId: number): SubscriptionRow | undefined {
  expireStalePanditSubscriptions(panditId);
  return db.prepare(`
    SELECT ps.id, ps.pandit_id, ps.plan_id, ps.status, ps.starts_at, ps.expires_at,
           ps.lead_limit, ps.leads_used, ps.auto_renew,
           ps.price_amount, ps.currency, ps.service_limit, ps.service_area_limit,
           ps.gallery_limit, ps.video_limit, ps.program_limit,
           ps.listing_enabled, ps.featured_listing, ps.priority_support,
           ps.verification_badge, ps.analytics_access, ps.homepage_promotion,
           ps.live_aarti_enabled, ps.enhanced_seo, ps.enhanced_profile,
           ps.whatsapp_enquiry, ps.search_visibility, ps.analytics_level,
           ps.payment_order_id, ps.payment_id, ps.razorpay_subscription_id,
           ps.plan_snapshot_json, ps.notes, ps.created_at, ps.updated_at,
           sp.code AS plan_code, sp.name AS plan_name, sp.price_amount AS plan_price,
           sp.currency AS plan_currency, sp.billing_interval AS plan_interval
    FROM pandit_subscriptions ps
    LEFT JOIN subscription_plans sp ON sp.id = ps.plan_id
    WHERE ps.pandit_id = ?
      AND ps.status IN ('pending','active','paused','payment_failed')
      AND (ps.expires_at IS NULL OR ps.expires_at >= CURRENT_TIMESTAMP)
    ORDER BY CASE ps.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
             ps.id DESC LIMIT 1
  `).get(panditId) as SubscriptionRow | undefined;
}

function getSubscriptionHistory(panditId: number): SubscriptionRow[] {
  return db.prepare(`
    SELECT ps.id, ps.pandit_id, ps.plan_id, ps.status, ps.starts_at, ps.expires_at,
           ps.lead_limit, ps.leads_used, ps.auto_renew,
           ps.price_amount, ps.currency, ps.service_limit, ps.service_area_limit,
           ps.gallery_limit, ps.video_limit, ps.program_limit,
           ps.listing_enabled, ps.featured_listing, ps.priority_support,
           ps.verification_badge, ps.analytics_access, ps.homepage_promotion,
           ps.live_aarti_enabled, ps.enhanced_seo, ps.enhanced_profile,
           ps.whatsapp_enquiry, ps.search_visibility, ps.analytics_level,
           ps.payment_order_id, ps.payment_id, ps.razorpay_subscription_id,
           ps.plan_snapshot_json, ps.notes, ps.created_at, ps.updated_at,
           sp.code AS plan_code, sp.name AS plan_name, sp.price_amount AS plan_price,
           sp.currency AS plan_currency, sp.billing_interval AS plan_interval
    FROM pandit_subscriptions ps
    LEFT JOIN subscription_plans sp ON sp.id = ps.plan_id
    WHERE ps.pandit_id = ? ORDER BY ps.id DESC LIMIT 50
  `).all(panditId) as SubscriptionRow[];
}

function countPanditServices(panditId: number): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pandit_service_offerings
    WHERE pandit_id = ? AND is_active = 1
  `).get(panditId) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function serviceLimit(subscription: SubscriptionRow | undefined): number {
  return subscription ? Number(subscription.service_limit ?? 0) : 0;
}

function serviceAreaLimit(subscription: SubscriptionRow | undefined): number {
  return subscription ? Number(subscription.service_area_limit ?? 0) : 0;
}

function subscriptionIsActive(subscription: SubscriptionRow | undefined): boolean {
  if (!subscription || subscription.status !== "active") return false;
  if (subscription.starts_at) {
    const starts = new Date(subscription.starts_at).getTime();
    if (Number.isFinite(starts) && starts > Date.now()) return false;
  }
  if (!subscription.expires_at) return false;
  const expires = new Date(subscription.expires_at).getTime();
  return Number.isFinite(expires) && expires > Date.now();
}

function subscriptionCanList(subscription: SubscriptionRow | undefined): boolean {
  return Boolean(subscriptionIsActive(subscription) && Number(subscription?.listing_enabled ?? 0) === 1);
}

function profileCanList(profile: PanditProfileRow): boolean {
  return profile.profile_status === "approved"
    && profile.verification_status === "verified"
    && Number(profile.identity_verified) === 1
    && Number(profile.profile_verified) === 1
    && Number(profile.authorized_contact) === 1;
}

function publicListingEligibility(profile: PanditProfileRow, subscription: SubscriptionRow | undefined, user?: AuthenticatedUser) {
  return {
    eligible: Boolean(user && user.status === "active" && profileCanList(profile) && subscriptionCanList(subscription)),
    accountActive: Boolean(user && user.status === "active"),
    profileApproved: profile.profile_status === "approved",
    verificationComplete: profileCanList(profile),
    subscriptionActive: subscriptionIsActive(subscription),
    listingEntitled: Number(subscription?.listing_enabled ?? 0) === 1,
    listingRequested: Boolean(profile.listing_active),
    public: Boolean(user && user.status === "active" && profileCanList(profile) && subscriptionCanList(subscription) && profile.listing_active === 1),
  };
}

function serializeProfile(p: PanditProfileRow, subscription?: SubscriptionRow, user?: AuthenticatedUser) {
  const eligibility = publicListingEligibility(p, subscription, user);
  return {
    id: p.id,
    userId: p.user_id,
    slug: p.slug,
    displayName: p.display_name,
    title: p.title,
    photo: p.photo,
    experienceYears: p.experience_years,
    location: p.location,
    city: p.city,
    district: p.district,
    state: p.state,
    country: p.country,
    locationId: p.location_id,
    countryLocationId: p.country_location_id,
    stateLocationId: p.state_location_id,
    districtLocationId: p.district_location_id,
    cityLocationId: p.city_location_id,
    languages: readArray(p.languages_json),
    specializations: readArray(p.specializations_json),
    pujaTypes: readArray(p.puja_types_json),
    serviceAreas: readArray(p.service_areas_json),
    serviceLocationIds: getPanditServiceLocationIds(p.id),
    associatedWith: p.associated_with,
    about: p.about,
    availability: p.availability,
    profileStatus: p.profile_status,
    verificationStatus: p.verification_status,
    identityVerified: Boolean(p.identity_verified),
    profileVerified: Boolean(p.profile_verified),
    authorizedContact: Boolean(p.authorized_contact),
    featured: Boolean(p.featured),
    listingActive: Boolean(p.listing_active),
    effectivePublicListing: eligibility.public,
    publicListingEligibility: eligibility,
    verifiedAt: p.verified_at,
    verificationNotes: p.verification_notes,
    rejectionReason: p.rejection_reason,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function serializeService(s: ServiceRow) {
  return {
    id: s.id,
    panditId: s.pandit_id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    priceDisplay: s.price_display,
    durationText: s.duration_text,
    priceAmount: s.price_amount,
    currency: s.currency,
    durationMinutes: s.duration_minutes,
    isActive: Boolean(s.is_active),
    sortOrder: s.sort_order,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

function serializePlan(p: PlanRow) {
  return {
    id: p.id,
    code: p.code,
    audience: p.audience,
    name: p.name,
    description: p.description,
    priceAmount: p.price_amount,
    currency: p.currency,
    billingInterval: p.billing_interval,
    durationDays: p.duration_days,
    leadLimit: p.lead_limit,
    serviceLimit: p.service_limit,
    serviceAreaLimit: p.service_area_limit,
    galleryLimit: p.gallery_limit,
    videoLimit: p.video_limit,
    programLimit: p.program_limit,
    listingEnabled: Boolean(p.listing_enabled),
    featuredListing: Boolean(p.featured_listing),
    prioritySupport: Boolean(p.priority_support),
    verificationBadge: Boolean(p.verification_badge),
    analyticsAccess: Boolean(p.analytics_access),
    homepagePromotion: Boolean(p.homepage_promotion),
    liveAartiEnabled: Boolean(p.live_aarti_enabled),
    enhancedSeo: Boolean(p.enhanced_seo),
    enhancedProfile: Boolean(p.enhanced_profile),
    whatsappEnquiry: Boolean(p.whatsapp_enquiry),
    searchVisibility: p.search_visibility,
    analyticsLevel: p.analytics_level,
    features: readArray(p.plan_features_json),
    razorpayPlanId: p.razorpay_plan_id,
  };
}

function serializeSubscription(s: SubscriptionRow | undefined) {
  if (!s) return null;
  return {
    id: s.id,
    panditId: s.pandit_id,
    planId: s.plan_id,
    status: s.status,
    startsAt: s.starts_at,
    expiresAt: s.expires_at,
    leadLimit: s.lead_limit,
    leadsUsed: s.leads_used,
    leadsRemaining: Math.max(0, s.lead_limit - s.leads_used),
    autoRenew: Boolean(s.auto_renew),
    priceAmount: s.price_amount,
    currency: s.currency,
    serviceLimit: s.service_limit,
    serviceAreaLimit: s.service_area_limit,
    galleryLimit: s.gallery_limit,
    videoLimit: s.video_limit,
    programLimit: s.program_limit,
    listingEnabled: Boolean(s.listing_enabled),
    featuredListing: Boolean(s.featured_listing),
    prioritySupport: Boolean(s.priority_support),
    verificationBadge: Boolean(s.verification_badge),
    analyticsAccess: Boolean(s.analytics_access),
    homepagePromotion: Boolean(s.homepage_promotion),
    liveAartiEnabled: Boolean(s.live_aarti_enabled),
    enhancedSeo: Boolean(s.enhanced_seo),
    enhancedProfile: Boolean(s.enhanced_profile),
    whatsappEnquiry: Boolean(s.whatsapp_enquiry),
    searchVisibility: s.search_visibility,
    analyticsLevel: s.analytics_level,
    paymentOrderId: s.payment_order_id,
    paymentId: s.payment_id,
    razorpaySubscriptionId: s.razorpay_subscription_id,
    planSnapshot: parseJsonObject(s.plan_snapshot_json),
    notes: s.notes,
    planCode: s.plan_code ?? null,
    planName: s.plan_name ?? null,
    planPrice: s.plan_price ?? null,
    planCurrency: s.plan_currency ?? null,
    planInterval: s.plan_interval ?? null,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Audit / notifications / subscriptions                                     */
/* -------------------------------------------------------------------------- */

function actorType(user: AuthenticatedUser): string {
  return user.role;
}

function audit(req: Request, user: AuthenticatedUser, action: string, entityType: string, entityId: number, oldData?: unknown, newData?: unknown): void {
  db.prepare(`
    INSERT INTO audit_logs (
      user_id, actor_type, action, entity_type, entity_id,
      old_data_json, new_data_json, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    user.id,
    actorType(user),
    action,
    entityType,
    entityId,
    oldData == null ? null : json(oldData, "{}"),
    newData == null ? null : json(newData, "{}"),
    clientIp(req),
    userAgent(req),
  );
}

function notify(userId: number, type: string, title: string, message: string, actionUrl?: string, metadata?: unknown): void {
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, action_url, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(userId, type, title, message, actionUrl ?? null, json(metadata, "{}"));
}

function expireStalePanditSubscriptions(panditId: number): number {
  const rows = db.prepare(`
    SELECT id, status, expires_at
    FROM pandit_subscriptions
    WHERE pandit_id = ?
      AND status IN ('active','pending','paused','payment_failed')
      AND expires_at IS NOT NULL
      AND expires_at <= CURRENT_TIMESTAMP
  `).all(panditId) as Array<{ id: number; status: string; expires_at: string }>;

  for (const row of rows) {
    const changed = db.prepare(`
      UPDATE pandit_subscriptions
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
    `).run(row.id, row.status);
    if (changed.changes !== 1) continue;

    db.prepare(`
      UPDATE pandit_profiles
      SET listing_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND NOT EXISTS (
          SELECT 1 FROM pandit_subscriptions ps
          WHERE ps.pandit_id = pandit_profiles.id
            AND ps.status = 'active'
            AND ps.expires_at IS NOT NULL
            AND ps.expires_at > CURRENT_TIMESTAMP
            AND ps.listing_enabled = 1
        )
    `).run(panditId);

    db.prepare(`
      INSERT INTO subscription_events (
        subscription_type, subscription_id, user_id, event_type,
        old_status, new_status, old_expires_at, new_expires_at,
        notes, metadata_json, created_at
      ) VALUES (
        'pandit', ?, (SELECT user_id FROM pandit_profiles WHERE id = ?),
        'expired', ?, 'expired', ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `).run(
      row.id,
      panditId,
      row.status,
      row.expires_at,
      row.expires_at,
      "Pandit subscription expired automatically.",
      json({ automatic: true, source: "pandit-route" }, "{}"),
    );
  }
  return rows.length;
}


/* -------------------------------------------------------------------------- */
/* Dashboard / profile                                                        */
/* -------------------------------------------------------------------------- */

router.get("/dashboard", (_req: Request, res: Response) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found.", code: "PANDIT_PROFILE_NOT_FOUND" });

    const subscription = getCurrentSubscription(profile.id);
    const services = getServices(profile.id);
    const documents = getDocuments(profile.id);
    const plans = getPlans();
    const serviceLocationIds = getPanditServiceLocationIds(profile.id);

    const leadStats = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN l.status IN ('new','qualified','assigned','contacted','follow_up') THEN 1 ELSE 0 END) AS open_count,
             SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
             SUM(CASE WHEN l.status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up_count,
             SUM(CASE WHEN la.lead_credit_used = 1 THEN 1 ELSE 0 END) AS credit_leads
      FROM lead_assignments la
      INNER JOIN leads l ON l.id = la.lead_id
      WHERE la.pandit_id = ? AND la.assignment_type = 'pandit'
    `).get(profile.id) as Row;

    const unreadNotifications = Number((db.prepare(`
      SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0
    `).get(user.id) as { count?: number } | undefined)?.count ?? 0);

    return res.json({
      success: true,
      profile: serializeProfile(profile, subscription, user),
      services: services.map(serializeService),
      verificationDocuments: documents.map((d) => ({
        id: d.id,
        documentType: d.document_type,
        documentName: d.document_name,
        documentUrl: d.document_url,
        status: d.status,
        reviewerNote: d.reviewer_note,
        reviewedAt: d.reviewed_at,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
      subscription: serializeSubscription(subscription),
      plans: plans.map(serializePlan),
      stats: {
        totalServices: services.length,
        activeServices: services.filter((s) => s.is_active === 1).length,
        totalDocuments: documents.length,
        pendingDocuments: documents.filter((d) => d.status === "pending").length,
        approvedDocuments: documents.filter((d) => d.status === "approved").length,
        rejectedDocuments: documents.filter((d) => d.status === "rejected").length,
        leadsTotal: Number(leadStats?.total ?? 0),
        openLeads: Number(leadStats?.open_count ?? 0),
        convertedLeads: Number(leadStats?.converted_count ?? 0),
        followUps: Number(leadStats?.follow_up_count ?? 0),
        creditedLeads: Number(leadStats?.credit_leads ?? 0),
        leadsRemaining: subscription ? Math.max(0, subscription.lead_limit - subscription.leads_used) : 0,
        serviceLimit: subscription?.service_limit ?? 0,
        servicesRemaining: subscription && subscription.service_limit > 0
          ? Math.max(0, subscription.service_limit - services.filter((s) => s.is_active === 1).length)
          : null,
        serviceAreaLimit: subscription?.service_area_limit ?? 0,
        serviceAreasUsed: serviceLocationIds.length || readArray(profile.service_areas_json).length,
        serviceAreasRemaining: subscription && subscription.service_area_limit > 0
          ? Math.max(0, subscription.service_area_limit - (serviceLocationIds.length || readArray(profile.service_areas_json).length))
          : null,
        unreadNotifications,
      },
      rules: {
        listingRequiresApproval: true,
        listingRequiresVerifiedIdentity: true,
        listingRequiresVerifiedProfile: true,
        listingRequiresAuthorizedContact: true,
        listingRequiresPaidPlan: true,
        adminOwnsVerificationFlags: true,
        serviceLimitEnforced: true,
        serviceAreaLimitEnforced: true,
        creditsServerControlled: true,
        paymentActivationServerControlled: true,
      },
    });
  } catch (error) {
    console.error("Pandit dashboard error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit dashboard." });
  }
});

router.get("/profile", (_req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found.", code: "PANDIT_PROFILE_NOT_FOUND" });
    return res.json({ success: true, profile: serializeProfile(profile, getCurrentSubscription(profile.id), user) });
  } catch (error) {
    console.error("Pandit profile GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit profile." });
  }
});

function uniqueSlugForInsert(value: string): string {
  const base = makeSlug(value);
  let slug = base;
  let counter = 1;
  while (db.prepare(`SELECT id FROM pandit_profiles WHERE slug = ? LIMIT 1`).get(slug)) {
    counter += 1;
    slug = `${base}-${counter}`;
  }
  return slug;
}

router.post("/profile", (req, res) => {
  try {
    const user = userOf(res);
    if (getProfile(user.id)) return res.status(409).json({ success: false, error: "Pandit profile already exists." });

    const body = bodyOf(req);
    const displayName = text(body.displayName ?? body.name ?? user.name, 150);
    if (displayName.length < 2) return res.status(400).json({ success: false, error: "Display name must contain at least 2 characters." });

    const experience = body.experienceYears === undefined ? 0 : Number(body.experienceYears);
    if (!Number.isInteger(experience) || experience < 0 || experience > 100) {
      return res.status(400).json({ success: false, error: "Experience years must be a whole number between 0 and 100." });
    }

    const photo = nullable(body.photo, 500);
    if (!safeUrl(photo)) return res.status(400).json({ success: false, error: "Photo must be a valid HTTP(S) URL or relative path." });

    const locationId = positiveId(body.locationId);
    const serviceLocationIds = uniquePositiveIds(body.serviceLocationIds ?? body.serviceAreasLocationIds);
    if (locationId) {
      const location = resolveLocation(locationId);
      if (!location || String(location.status) !== "active") return res.status(400).json({ success: false, error: "Selected location is not available." });
    }
    const locationsResult = verifyLocationIds(serviceLocationIds);
    if (!locationsResult.ok) return res.status(400).json({ success: false, error: "One or more service-area locations are invalid or inactive.", invalidLocationIds: locationsResult.invalid });

    const chain = locationChain(locationId);
    const city = nullable(body.city, 120) ?? chain.city ?? user.city;
    const state = nullable(body.state, 120) ?? chain.state ?? user.state;
    const district = nullable(body.district, 120) ?? chain.district;
    const country = nullable(body.country, 100) ?? chain.country ?? user.country ?? "India";
    const location = nullable(body.location, 300) ?? (city && state ? `${city} · ${state}` : null);

    const result = db.transaction(() => {
      const created = db.prepare(`
        INSERT INTO pandit_profiles (
          user_id, slug, display_name, title, photo, experience_years, location,
          city, district, state, country, location_id, languages_json,
          specializations_json, puja_types_json, service_areas_json,
          associated_with, about, availability, profile_status, verification_status,
          identity_verified, profile_verified, authorized_contact, featured, listing_active,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'pending', 'pending', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `).run(
        user.id,
        uniqueSlugForInsert(displayName),
        displayName,
        nullable(body.title, 200),
        photo,
        experience,
        location,
        city,
        district,
        state,
        country,
        locationId,
        json(stringArray(body.languages)),
        json(stringArray(body.specializations)),
        json(stringArray(body.pujaTypes)),
        json(stringArray(body.serviceAreas)),
        nullable(body.associatedWith, 300),
        nullable(body.about, 5000),
        nullable(body.availability, 500),
      );
      const id = Number(created.lastInsertRowid);
      db.prepare(`
        UPDATE users
        SET name = ?, city = ?, state = ?, country = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(displayName, city, state, country, user.id);
      upsertPanditServiceLocations(id, serviceLocationIds, true);
      updateProfileLocationCache(id, locationId);
      audit(req, user, "pandit.profile_created", "pandit_profile", id, null, {
        displayName, city, district, state, country, locationId, serviceLocationIds,
      });
      return id;
    })();

    notify(user.id, "profile", "Pandit profile submitted", "Your Pandit profile has been created and is waiting for Admin approval.", "/pandit/dashboard");

    const profile = getProfile(user.id);
    return res.status(201).json({
      success: true,
      message: "Pandit profile created successfully and submitted for Admin review.",
      profile: profile ? serializeProfile(profile, undefined, user) : null,
      profileId: result,
    });
  } catch (error) {
    console.error("Pandit profile POST error:", error);
    return res.status(500).json({ success: false, error: "Unable to create Pandit profile." });
  }
});

router.patch("/profile", (req, res) => {
  try {
    const user = userOf(res);
    const existing = getProfile(user.id);
    if (!existing) return res.status(404).json({ success: false, error: "Pandit profile not found.", code: "PANDIT_PROFILE_NOT_FOUND" });

    const body = bodyOf(req);
    const requestedPhone = body.phone === undefined ? user.phone : nullable(body.phone, 30);
    if (normalizePhone(requestedPhone) !== normalizePhone(user.phone)) {
      return res.status(409).json({
        success: false,
        error: "Verified phone cannot be changed from the Pandit profile API. Use the authenticated phone-verification flow to change it.",
        code: "VERIFIED_PHONE_CHANGE_REQUIRES_AUTH_FLOW",
      });
    }

    const displayName = body.displayName === undefined ? existing.display_name : text(body.displayName, 150);
    if (displayName.length < 2) return res.status(400).json({ success: false, error: "Display name must contain at least 2 characters." });

    const experience = body.experienceYears === undefined ? existing.experience_years : Number(body.experienceYears);
    if (!Number.isInteger(experience) || experience < 0 || experience > 100) return res.status(400).json({ success: false, error: "Experience years must be a whole number between 0 and 100." });

    const photo = body.photo === undefined ? existing.photo : nullable(body.photo, 500);
    if (!safeUrl(photo)) return res.status(400).json({ success: false, error: "Photo must be a valid HTTP(S) URL or relative path." });

    const city = body.city === undefined ? existing.city : nullable(body.city, 120);
    const district = body.district === undefined ? existing.district : nullable(body.district, 120);
    const state = body.state === undefined ? existing.state : nullable(body.state, 120);
    const country = body.country === undefined ? existing.country : (nullable(body.country, 100) || "India");
    const locationId = body.locationId === undefined ? existing.location_id : positiveId(body.locationId);

    if (locationId) {
      const location = resolveLocation(locationId);
      if (!location || String(location.status) !== "active") return res.status(400).json({ success: false, error: "Selected location is not available." });
    }

    const serviceLocationIds = body.serviceLocationIds === undefined && body.serviceAreasLocationIds === undefined
      ? getPanditServiceLocationIds(existing.id)
      : uniquePositiveIds(body.serviceLocationIds ?? body.serviceAreasLocationIds);
    const locationsResult = verifyLocationIds(serviceLocationIds);
    if (!locationsResult.ok) return res.status(400).json({ success: false, error: "One or more service-area locations are invalid or inactive.", invalidLocationIds: locationsResult.invalid });

    const currentSubscription = getCurrentSubscription(existing.id);
    const areaLimit = serviceAreaLimit(currentSubscription);
    const serviceAreas = body.serviceAreas === undefined ? readArray(existing.service_areas_json) : stringArray(body.serviceAreas);
    const effectiveAreaCount = serviceLocationIds.length || serviceAreas.length;
    if (areaLimit > 0 && effectiveAreaCount > areaLimit) {
      return res.status(409).json({ success: false, error: `Your current subscription allows up to ${areaLimit} service areas/cities.`, code: "SERVICE_AREA_LIMIT_REACHED", limit: areaLimit, requested: effectiveAreaCount });
    }

    const fields: Record<string, string | null> = {
      title: body.title === undefined ? existing.title : nullable(body.title, 200),
      location: body.location === undefined ? existing.location : nullable(body.location, 300),
      associated_with: body.associatedWith === undefined ? existing.associated_with : nullable(body.associatedWith, 300),
      about: body.about === undefined ? existing.about : nullable(body.about, 5000),
      availability: body.availability === undefined ? existing.availability : nullable(body.availability, 500),
    };

    const languages = body.languages === undefined ? readArray(existing.languages_json) : stringArray(body.languages);
    const specializations = body.specializations === undefined ? readArray(existing.specializations_json) : stringArray(body.specializations);
    const pujaTypes = body.pujaTypes === undefined ? readArray(existing.puja_types_json) : stringArray(body.pujaTypes);

    const resolved = locationId && body.locationId !== undefined
      ? locationChain(locationId)
      : { country, state, district, city };
    const nextName = body.name === undefined ? user.name : (nullable(body.name, 150) || user.name);

    const before = serializeProfile(existing, currentSubscription, user);
    db.transaction(() => {
      const result = db.prepare(`
        UPDATE pandit_profiles
        SET display_name = ?, title = ?, photo = ?, experience_years = ?,
            location = ?, city = ?, district = ?, state = ?, country = ?, location_id = ?,
            languages_json = ?, specializations_json = ?, puja_types_json = ?, service_areas_json = ?,
            associated_with = ?, about = ?, availability = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(
        displayName,
        fields.title,
        photo,
        experience,
        fields.location ?? (resolved.city && resolved.state ? `${resolved.city} · ${resolved.state}` : null),
        resolved.city,
        resolved.district,
        resolved.state,
        resolved.country || "India",
        locationId,
        json(languages),
        json(specializations),
        json(pujaTypes),
        json(serviceAreas),
        fields.associated_with,
        fields.about,
        fields.availability,
        existing.id,
        user.id,
      );
      if (result.changes !== 1) throw new Error("Pandit profile update did not affect a record.");

      db.prepare(`
        UPDATE users
        SET name = ?, city = ?, state = ?, country = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextName, resolved.city, resolved.state, resolved.country || "India", user.id);

      upsertPanditServiceLocations(existing.id, serviceLocationIds, true);
      updateProfileLocationCache(existing.id, locationId);

      audit(req, user, "pandit.profile_updated", "pandit_profile", existing.id, before, {
        ...before,
        displayName,
        title: fields.title,
        photo,
        experienceYears: experience,
        city: resolved.city,
        district: resolved.district,
        state: resolved.state,
        country: resolved.country || "India",
        locationId,
        languages,
        specializations,
        pujaTypes,
        serviceAreas,
        serviceLocationIds,
      });
    })();

    const updated = getProfile(user.id);
    return res.json({ success: true, message: "Pandit profile updated successfully.", profile: updated ? serializeProfile(updated, getCurrentSubscription(updated.id), user) : null });
  } catch (error) {
    console.error("Pandit profile PATCH error:", error);
    return res.status(500).json({ success: false, error: "Unable to update Pandit profile." });
  }
});

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

router.get("/services", (_req, res) => {
  try {
    const profile = getProfile(userOf(res).id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });
    return res.json({ success: true, services: getServices(profile.id).map(serializeService) });
  } catch (error) {
    console.error("Pandit services GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit services." });
  }
});

router.post("/services", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });

    const body = bodyOf(req);
    const nameResult = required(body.name, "Service name", 180, 2);
    if (!nameResult.ok) return res.status(400).json({ success: false, error: nameResult.error });

    const description = nullable(body.description, 2000);
    const priceResult = money(body.priceAmount, "Price");
    if (!priceResult.ok) return res.status(400).json({ success: false, error: priceResult.error });
    const durationResult = integer(body.durationMinutes, "Duration", 1, 1440, true);
    if (!durationResult.ok) return res.status(400).json({ success: false, error: durationResult.error });
    const activeResult = body.isActive === undefined ? { ok: true as const, value: true } : bool(body.isActive, "isActive");
    if (!activeResult.ok) return res.status(400).json({ success: false, error: activeResult.error });
    const orderResult = integer(body.sortOrder, "Sort order", 0, 100000, true);
    if (!orderResult.ok) return res.status(400).json({ success: false, error: orderResult.error });

    const currency = body.currency === undefined ? "INR" : text(body.currency, 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ success: false, error: "Currency must be a valid 3-letter code." });

    const subscription = getCurrentSubscription(profile.id);
    const maxServices = serviceLimit(subscription);
    const currentServiceCount = countPanditServices(profile.id);
    if (maxServices > 0 && currentServiceCount >= maxServices) {
      return res.status(409).json({ success: false, error: `Your current ${subscription?.plan_name ?? "subscription"} allows up to ${maxServices} active services.`, code: "SERVICE_LIMIT_REACHED", limit: maxServices, used: currentServiceCount });
    }

    if (activeResult.value && !subscription) {
      return res.status(409).json({ success: false, error: "An active Pandit subscription is required before publishing a service.", code: "PANDIT_SUBSCRIPTION_REQUIRED" });
    }

    const slug = text(body.slug, 100).toLowerCase() || makeSlug(nameResult.value);
    const duplicateSlug = db.prepare(`
      SELECT id FROM pandit_service_offerings
      WHERE pandit_id = ? AND LOWER(COALESCE(slug, '')) = LOWER(?) LIMIT 1
    `).get(profile.id, slug);
    if (duplicateSlug) return res.status(409).json({ success: false, error: "A service with this slug already exists." });

    const priceDisplay = nullable(body.priceDisplay, 100);
    const durationText = nullable(body.durationText, 100);

    const result = db.prepare(`
      INSERT INTO pandit_service_offerings (
        pandit_id, name, slug, description, price_display, duration_text,
        price_amount, currency, duration_minutes, is_active, sort_order,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      profile.id,
      nameResult.value,
      slug,
      description,
      priceDisplay,
      durationText,
      priceResult.value,
      currency,
      durationResult.value,
      activeResult.value ? 1 : 0,
      orderResult.value ?? 0,
    );

    const serviceId = Number(result.lastInsertRowid);
    const service = getService(user.id, serviceId);
    if (!service) return res.status(500).json({ success: false, error: "Service was created but could not be loaded." });
    audit(req, user, "pandit.service_created", "pandit_service_offering", serviceId, null, serializeService(service));
    return res.status(201).json({ success: true, message: "Puja service created successfully.", service: serializeService(service) });
  } catch (error) {
    console.error("Pandit service POST error:", error);
    return res.status(500).json({ success: false, error: "Unable to create Puja service." });
  }
});

router.get("/services/:id", (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid service ID." });
    const service = getService(userOf(res).id, id);
    if (!service) return res.status(404).json({ success: false, error: "Puja service not found." });
    return res.json({ success: true, service: serializeService(service) });
  } catch (error) {
    console.error("Pandit service GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit service." });
  }
});

router.patch("/services/:id", (req, res) => {
  try {
    const user = userOf(res);
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid service ID." });
    const existing = getService(user.id, id);
    if (!existing) return res.status(404).json({ success: false, error: "Puja service not found." });

    const body = bodyOf(req);
    const name = body.name === undefined ? existing.name : text(body.name, 180);
    if (name.length < 2) return res.status(400).json({ success: false, error: "Service name must contain at least 2 characters." });

    const activeResult = body.isActive === undefined ? { ok: true as const, value: existing.is_active === 1 } : bool(body.isActive, "isActive");
    if (!activeResult.ok) return res.status(400).json({ success: false, error: activeResult.error });

    const subscription = getCurrentSubscription(existing.pandit_id);
    if (activeResult.value && !subscription) return res.status(409).json({ success: false, error: "An active Pandit subscription is required before activating a service.", code: "PANDIT_SUBSCRIPTION_REQUIRED" });

    if (activeResult.value && existing.is_active !== 1) {
      const limit = serviceLimit(subscription);
      const activeCount = countPanditServices(existing.pandit_id);
      if (limit > 0 && activeCount >= limit) {
        return res.status(409).json({ success: false, error: `Your current subscription allows up to ${limit} active services.`, code: "SERVICE_LIMIT_REACHED", limit, used: activeCount });
      }
    }

    const description = body.description === undefined ? existing.description : nullable(body.description, 2000);
    const priceResult = body.priceAmount === undefined ? { ok: true as const, value: existing.price_amount } : money(body.priceAmount, "Price");
    if (!priceResult.ok) return res.status(400).json({ success: false, error: priceResult.error });
    const durationResult = body.durationMinutes === undefined ? { ok: true as const, value: existing.duration_minutes } : integer(body.durationMinutes, "Duration", 1, 1440, true);
    if (!durationResult.ok) return res.status(400).json({ success: false, error: durationResult.error });
    const orderResult = body.sortOrder === undefined ? { ok: true as const, value: existing.sort_order } : integer(body.sortOrder, "Sort order", 0, 100000, false);
    if (!orderResult.ok) return res.status(400).json({ success: false, error: orderResult.error });
    const currency = body.currency === undefined ? existing.currency : text(body.currency, 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ success: false, error: "Currency must be a valid 3-letter code." });

    const slug = body.slug === undefined ? existing.slug : (text(body.slug, 100).toLowerCase() || makeSlug(name));
    if (slug) {
      const duplicateSlug = db.prepare(`
        SELECT id FROM pandit_service_offerings
        WHERE pandit_id = ? AND id <> ? AND LOWER(COALESCE(slug, '')) = LOWER(?) LIMIT 1
      `).get(existing.pandit_id, id, slug);
      if (duplicateSlug) return res.status(409).json({ success: false, error: "A service with this slug already exists." });
    }

    const priceDisplay = body.priceDisplay === undefined ? existing.price_display : nullable(body.priceDisplay, 100);
    const durationText = body.durationText === undefined ? existing.duration_text : nullable(body.durationText, 100);

    const changed = db.prepare(`
      UPDATE pandit_service_offerings
      SET name = ?, slug = ?, description = ?, price_display = ?,
          duration_text = ?, price_amount = ?, currency = ?, duration_minutes = ?,
          is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND pandit_id = ?
    `).run(
      name,
      slug,
      description,
      priceDisplay,
      durationText,
      priceResult.value,
      currency,
      durationResult.value,
      activeResult.value ? 1 : 0,
      orderResult.value,
      id,
      existing.pandit_id,
    );
    if (changed.changes !== 1) return res.status(409).json({ success: false, error: "Puja service could not be updated." });

    const updated = getService(user.id, id);
    if (!updated) return res.status(500).json({ success: false, error: "Updated service could not be loaded." });
    audit(req, user, "pandit.service_updated", "pandit_service_offering", id, serializeService(existing), serializeService(updated));
    return res.json({ success: true, message: "Puja service updated successfully.", service: serializeService(updated) });
  } catch (error) {
    console.error("Pandit service PATCH error:", error);
    return res.status(500).json({ success: false, error: "Unable to update Puja service." });
  }
});

router.delete("/services/:id", (req, res) => {
  try {
    const user = userOf(res);
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid service ID." });
    const existing = getService(user.id, id);
    if (!existing) return res.status(404).json({ success: false, error: "Puja service not found." });

    const result = db.prepare(`
      UPDATE pandit_service_offerings
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND pandit_id = ?
    `).run(id, existing.pandit_id);
    if (result.changes !== 1) return res.status(409).json({ success: false, error: "Puja service could not be deactivated." });

    const updated = getService(user.id, id);
    audit(req, user, "pandit.service_deactivated", "pandit_service_offering", id, serializeService(existing), updated ? serializeService(updated) : null);
    return res.json({ success: true, message: "Puja service deactivated successfully. Historical service data has been retained.", deletedServiceId: id, softDeleted: true, service: updated ? serializeService(updated) : null });
  } catch (error) {
    console.error("Pandit service DELETE error:", error);
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("foreign key") || message.includes("constraint")) return res.status(409).json({ success: false, error: "This Puja service is linked to another record. Deactivate it instead." });
    return res.status(500).json({ success: false, error: "Unable to delete Puja service." });
  }
});

/* -------------------------------------------------------------------------- */
/* Public listing control                                                     */
/* -------------------------------------------------------------------------- */

router.get("/listing", (_req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });
    const subscription = getCurrentSubscription(profile.id);
    return res.json({ success: true, listing: publicListingEligibility(profile, subscription, user), profileListingActive: Boolean(profile.listing_active), subscription: serializeSubscription(subscription) });
  } catch (error) {
    console.error("Pandit listing GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit listing status." });
  }
});

router.patch("/listing", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });

    const parsed = bool(bodyOf(req).listingActive, "listingActive");
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });

    const subscription = getCurrentSubscription(profile.id);
    if (parsed.value) {
      if (!profileCanList(profile)) {
        return res.status(409).json({
          success: false,
          error: "Listing can be activated only after Admin approval and completion of identity, profile and authorized-contact verification.",
          code: "PANDIT_PROFILE_NOT_VERIFIED",
          requirements: {
            profileApproved: profile.profile_status === "approved",
            verificationStatus: profile.verification_status === "verified",
            identityVerified: Boolean(profile.identity_verified),
            profileVerified: Boolean(profile.profile_verified),
            authorizedContact: Boolean(profile.authorized_contact),
          },
        });
      }
      if (!subscriptionCanList(subscription)) {
        return res.status(409).json({ success: false, error: "An active paid Pandit subscription with listing access is required before the public listing can be activated.", code: "PANDIT_SUBSCRIPTION_REQUIRED" });
      }
    }

    const result = db.prepare(`
      UPDATE pandit_profiles
      SET listing_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(parsed.value ? 1 : 0, profile.id, user.id);
    if (result.changes !== 1) return res.status(409).json({ success: false, error: "Pandit listing status could not be updated." });

    audit(req, user, parsed.value ? "pandit.listing_activated" : "pandit.listing_deactivated", "pandit_profile", profile.id, { listingActive: Boolean(profile.listing_active) }, { listingActive: parsed.value });
    return res.json({ success: true, message: parsed.value ? "Pandit listing activated successfully." : "Pandit listing deactivated successfully.", listingActive: parsed.value, listing: publicListingEligibility({ ...profile, listing_active: parsed.value ? 1 : 0 }, subscription, user) });
  } catch (error) {
    console.error("Pandit listing PATCH error:", error);
    return res.status(500).json({ success: false, error: "Unable to update Pandit listing status." });
  }
});

/* -------------------------------------------------------------------------- */
/* Verification documents                                                     */
/* -------------------------------------------------------------------------- */

const DOCUMENT_TYPES = [
  "government_id",
  "address_proof",
  "guru_reference",
  "parampara_reference",
  "qualification",
  "video_sample",
  "other",
] as const;

router.get("/verification/documents", (_req, res) => {
  try {
    const profile = getProfile(userOf(res).id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });
    return res.json({
      success: true,
      documents: getDocuments(profile.id).map((d) => ({
        id: d.id,
        documentType: d.document_type,
        documentName: d.document_name,
        documentUrl: d.document_url,
        status: d.status,
        reviewerNote: d.reviewer_note,
        reviewedAt: d.reviewed_at,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
      allowedDocumentTypes: DOCUMENT_TYPES,
      verification: {
        profileStatus: profile.profile_status,
        verificationStatus: profile.verification_status,
        identityVerified: Boolean(profile.identity_verified),
        profileVerified: Boolean(profile.profile_verified),
        authorizedContact: Boolean(profile.authorized_contact),
        adminControlled: true,
      },
      immutabilityRules: {
        approvedDocumentsCanNotBeEdited: true,
        rejectedDocumentsCanBeResubmitted: true,
        approvedDocumentsCanNotBeDeleted: true,
      },
    });
  } catch (error) {
    console.error("Pandit verification docs GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load verification documents." });
  }
});

router.post("/verification/documents", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });

    const body = bodyOf(req);
    const type = text(body.documentType, 40).toLowerCase();
    if (!(DOCUMENT_TYPES as readonly string[]).includes(type)) return res.status(400).json({ success: false, error: "Invalid document type." });

    const name = nullable(body.documentName, 250);
    const url = nullable(body.documentUrl ?? body.url, 2000);
    if (!url) return res.status(400).json({ success: false, error: "Document URL is required. Upload the file to private storage and submit its controlled URL." });
    if (!safeUrl(url)) return res.status(400).json({ success: false, error: "Document URL must be a valid HTTP(S) URL or relative path." });

    const pendingSameType = db.prepare(`
      SELECT id FROM pandit_verification_documents
      WHERE pandit_id = ? AND document_type = ? AND status = 'pending'
      LIMIT 1
    `).get(profile.id, type);
    if (pendingSameType) return res.status(409).json({ success: false, error: "A document of this type is already pending review. Wait for Admin review or resubmit the rejected record." });

    const result = db.prepare(`
      INSERT INTO pandit_verification_documents (
        pandit_id, document_type, document_name, document_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(profile.id, type, name, url);

    const id = Number(result.lastInsertRowid);
    db.prepare(`
      UPDATE pandit_profiles
      SET verification_status = CASE
        WHEN verification_status IN ('rejected','expired') THEN 'in_review'
        WHEN verification_status = 'pending' THEN 'in_review'
        ELSE verification_status
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(profile.id);

    audit(req, user, "pandit.verification_document_submitted", "pandit_verification_document", id, null, { documentType: type, documentName: name });
    notify(user.id, "verification", "Verification document submitted", "Your verification document was submitted for Admin review.", "/pandit/dashboard/verification", { documentId: id });

    const document = db.prepare(`SELECT * FROM pandit_verification_documents WHERE id = ?`).get(id) as VerificationDocumentRow;
    return res.status(201).json({ success: true, message: "Verification document submitted successfully.", document: {
      id: document.id,
      documentType: document.document_type,
      documentName: document.document_name,
      documentUrl: document.document_url,
      status: document.status,
      reviewerNote: document.reviewer_note,
      reviewedAt: document.reviewed_at,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
    } });
  } catch (error) {
    console.error("Pandit verification docs POST error:", error);
    return res.status(500).json({ success: false, error: "Unable to submit verification document." });
  }
});

router.patch("/verification/documents/:id/resubmit", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    const id = positiveId(req.params.id);
    if (!profile || !id) return res.status(400).json({ success: false, error: "Invalid request." });

    const existing = db.prepare(`
      SELECT * FROM pandit_verification_documents
      WHERE id = ? AND pandit_id = ? LIMIT 1
    `).get(id, profile.id) as VerificationDocumentRow | undefined;
    if (!existing) return res.status(404).json({ success: false, error: "Verification document not found." });
    if (existing.status !== "rejected") return res.status(409).json({ success: false, error: "Only rejected documents can be resubmitted." });

    const body = bodyOf(req);
    const url = nullable(body.documentUrl ?? body.url, 2000) || existing.document_url;
    if (!url) return res.status(400).json({ success: false, error: "Document URL is required." });
    if (!safeUrl(url)) return res.status(400).json({ success: false, error: "Document URL must be a valid HTTP(S) URL or relative path." });
    const name = body.documentName === undefined ? existing.document_name : nullable(body.documentName, 250);

    const duplicatePending = db.prepare(`
      SELECT id FROM pandit_verification_documents
      WHERE pandit_id = ? AND document_type = ? AND status = 'pending' AND id <> ?
      LIMIT 1
    `).get(profile.id, existing.document_type, id);
    if (duplicatePending) return res.status(409).json({ success: false, error: "Another document of this type is already pending review." });

    const result = db.prepare(`
      UPDATE pandit_verification_documents
      SET document_name = ?, document_url = ?, status = 'pending',
          reviewer_id = NULL, reviewer_note = NULL, reviewed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND pandit_id = ? AND status = 'rejected'
    `).run(name, url, id, profile.id);
    if (result.changes !== 1) return res.status(409).json({ success: false, error: "Document could not be resubmitted." });

    db.prepare(`UPDATE pandit_profiles SET verification_status = 'in_review', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(profile.id);
    audit(req, user, "pandit.verification_document_resubmitted", "pandit_verification_document", id, existing, { id, documentName: name, documentUrl: url, status: "pending" });

    const updated = db.prepare(`SELECT * FROM pandit_verification_documents WHERE id = ?`).get(id) as VerificationDocumentRow;
    return res.json({ success: true, message: "Verification document resubmitted successfully.", document: {
      id: updated.id,
      documentType: updated.document_type,
      documentName: updated.document_name,
      documentUrl: updated.document_url,
      status: updated.status,
      reviewerNote: updated.reviewer_note,
      reviewedAt: updated.reviewed_at,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    } });
  } catch (error) {
    console.error("Pandit verification docs resubmit error:", error);
    return res.status(500).json({ success: false, error: "Unable to resubmit verification document." });
  }
});

router.delete("/verification/documents/:id", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    const id = positiveId(req.params.id);
    if (!profile || !id) return res.status(400).json({ success: false, error: "Invalid request." });

    const existing = db.prepare(`
      SELECT * FROM pandit_verification_documents
      WHERE id = ? AND pandit_id = ? LIMIT 1
    `).get(id, profile.id) as VerificationDocumentRow | undefined;
    if (!existing) return res.status(404).json({ success: false, error: "Verification document not found." });
    if (existing.status === "approved") return res.status(409).json({ success: false, error: "Approved verification documents cannot be deleted. Contact Admin if a replacement is needed." });

    const result = db.prepare(`DELETE FROM pandit_verification_documents WHERE id = ? AND pandit_id = ?`).run(id, profile.id);
    if (result.changes !== 1) return res.status(409).json({ success: false, error: "Document could not be deleted." });

    audit(req, user, "pandit.verification_document_deleted", "pandit_verification_document", id, existing, null);
    return res.json({ success: true, message: "Verification document deleted.", deletedDocumentId: id });
  } catch (error) {
    console.error("Pandit verification docs DELETE error:", error);
    return res.status(500).json({ success: false, error: "Unable to delete verification document." });
  }
});

/* -------------------------------------------------------------------------- */
/* Subscription / monetization                                                */
/* -------------------------------------------------------------------------- */

router.get("/subscription/plans", (_req, res) => {
  try {
    const plans = getPlans().map(serializePlan);
    return res.json({ success: true, currency: "INR", billing: "monthly", plans, sourceOfTruth: "subscription_plans" });
  } catch (error) {
    console.error("Pandit plans GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit plans." });
  }
});

router.get("/subscription", (_req, res) => {
  try {
    const profile = getProfile(userOf(res).id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });
    const current = getCurrentSubscription(profile.id);
    return res.json({
      success: true,
      current: serializeSubscription(current),
      history: getSubscriptionHistory(profile.id).map(serializeSubscription),
      limits: current
        ? { serviceLimit: current.service_limit, serviceAreaLimit: current.service_area_limit, leadLimit: current.lead_limit }
        : { serviceLimit: 0, serviceAreaLimit: 0, leadLimit: 0 },
      paymentArchitecture: "Subscription activation and payment references are trusted from payments.ts / payment webhooks only.",
    });
  } catch (error) {
    console.error("Pandit subscription GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load subscription." });
  }
});

router.get("/subscription/usage", (_req, res) => {
  try {
    const profile = getProfile(userOf(res).id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });
    const current = getCurrentSubscription(profile.id);
    const servicesUsed = countPanditServices(profile.id);
    const areasUsed = getPanditServiceLocationIds(profile.id).length || readArray(profile.service_areas_json).length;
    const leadsUsed = Number(current?.leads_used ?? 0);
    const leadLimit = Number(current?.lead_limit ?? 0);
    const serviceLimitValue = Number(current?.service_limit ?? 0);
    const areaLimitValue = Number(current?.service_area_limit ?? 0);

    return res.json({
      success: true,
      subscription: serializeSubscription(current),
      usage: {
        leads: { used: leadsUsed, limit: leadLimit, remaining: Math.max(0, leadLimit - leadsUsed), exhausted: leadLimit > 0 && leadsUsed >= leadLimit },
        services: { used: servicesUsed, limit: serviceLimitValue, remaining: serviceLimitValue > 0 ? Math.max(0, serviceLimitValue - servicesUsed) : null, exhausted: serviceLimitValue > 0 && servicesUsed >= serviceLimitValue },
        serviceAreas: { used: areasUsed, limit: areaLimitValue, remaining: areaLimitValue > 0 ? Math.max(0, areaLimitValue - areasUsed) : null, exhausted: areaLimitValue > 0 && areasUsed >= areaLimitValue },
      },
      note: "Quota fields are server-controlled; Pandit APIs cannot increase leads_used, lead_limit, or other entitlement counters.",
    });
  } catch (error) {
    console.error("Pandit subscription usage error:", error);
    return res.status(500).json({ success: false, error: "Unable to load subscription usage." });
  }
});

router.post("/subscription/prepare", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });

    const planId = positiveId(bodyOf(req).planId);
    if (!planId) return res.status(400).json({ success: false, error: "planId is required." });

    const plan = db.prepare(`
      SELECT *
      FROM subscription_plans
      WHERE id = ? AND audience = 'pandit' AND is_active = 1
      LIMIT 1
    `).get(planId) as PlanRow | undefined;
    if (!plan) return res.status(404).json({ success: false, error: "Selected Pandit plan is not available." });
    if (String(plan.currency).toUpperCase() !== "INR" || String(plan.billing_interval) !== "monthly" || Number(plan.duration_days) !== 30) {
      return res.status(409).json({ success: false, error: "Pandit subscription plan is not configured as the canonical monthly INR plan." });
    }

    const current = getCurrentSubscription(profile.id);
    if (current?.status === "active" && current.plan_id === plan.id) {
      return res.status(409).json({ success: false, error: "This subscription plan is already active.", subscription: serializeSubscription(current) });
    }

    const snapshot = {
      planId: plan.id,
      code: plan.code,
      audience: plan.audience,
      name: plan.name,
      description: plan.description,
      priceAmount: plan.price_amount,
      currency: plan.currency,
      billingInterval: plan.billing_interval,
      durationDays: plan.duration_days,
      leadLimit: plan.lead_limit,
      serviceLimit: plan.service_limit,
      serviceAreaLimit: plan.service_area_limit,
      galleryLimit: plan.gallery_limit,
      videoLimit: plan.video_limit,
      programLimit: plan.program_limit,
      listingEnabled: Boolean(plan.listing_enabled),
      featuredListing: Boolean(plan.featured_listing),
      prioritySupport: Boolean(plan.priority_support),
      verificationBadge: Boolean(plan.verification_badge),
      analyticsAccess: Boolean(plan.analytics_access),
      homepagePromotion: Boolean(plan.homepage_promotion),
      liveAartiEnabled: Boolean(plan.live_aarti_enabled),
      enhancedSeo: Boolean(plan.enhanced_seo),
      enhancedProfile: Boolean(plan.enhanced_profile),
      whatsappEnquiry: Boolean(plan.whatsapp_enquiry),
      searchVisibility: plan.search_visibility,
      analyticsLevel: plan.analytics_level,
      features: readArray(plan.plan_features_json),
      preparedAt: nowIso(),
    };

    const subscriptionId = db.transaction(() => {
      db.prepare(`
        UPDATE pandit_subscriptions
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE pandit_id = ? AND status IN ('pending','paused','payment_failed')
      `).run(profile.id);

      const created = db.prepare(`
        INSERT INTO pandit_subscriptions (
          pandit_id, plan_id, status, lead_limit, leads_used,
          price_amount, currency, service_limit, service_area_limit, gallery_limit, video_limit, program_limit,
          auto_renew, listing_enabled, featured_listing, priority_support, verification_badge, analytics_access,
          homepage_promotion, live_aarti_enabled, enhanced_seo, enhanced_profile, whatsapp_enquiry,
          search_visibility, analytics_level, plan_snapshot_json, notes, created_at, updated_at
        ) VALUES (
          ?, ?, 'pending', ?, 0,
          ?, ?, ?, ?, ?, ?, ?,
          0, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `).run(
        profile.id,
        plan.id,
        plan.lead_limit,
        plan.price_amount,
        plan.currency,
        plan.service_limit,
        plan.service_area_limit,
        plan.gallery_limit,
        plan.video_limit,
        plan.program_limit,
        plan.listing_enabled,
        plan.featured_listing,
        plan.priority_support,
        plan.verification_badge,
        plan.analytics_access,
        plan.homepage_promotion,
        plan.live_aarti_enabled,
        plan.enhanced_seo,
        plan.enhanced_profile,
        plan.whatsapp_enquiry,
        plan.search_visibility,
        plan.analytics_level,
        json(snapshot, "{}"),
        "Awaiting trusted payment verification.",
      );
      return Number(created.lastInsertRowid);
    })();

    const created = db.prepare(`
      SELECT ps.*, sp.code AS plan_code, sp.name AS plan_name,
             sp.price_amount AS plan_price, sp.currency AS plan_currency,
             sp.billing_interval AS plan_interval
      FROM pandit_subscriptions ps
      INNER JOIN subscription_plans sp ON sp.id = ps.plan_id
      WHERE ps.id = ? LIMIT 1
    `).get(subscriptionId) as SubscriptionRow | undefined;
    if (!created) return res.status(500).json({ success: false, error: "Subscription was prepared but could not be loaded." });

    db.prepare(`
      INSERT INTO subscription_events (
        subscription_type, subscription_id, user_id, event_type,
        old_status, new_status, old_expires_at, new_expires_at,
        notes, metadata_json, created_at
      ) VALUES ('pandit', ?, ?, 'prepared', ?, 'pending', ?, NULL, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      subscriptionId,
      user.id,
      current?.status ?? null,
      current?.expires_at ?? null,
      "Pandit subscription prepared; payment confirmation is required before activation.",
      json({ planId: plan.id, planCode: plan.code, amount: plan.price_amount }, "{}"),
    );

    audit(req, user, "pandit.subscription_prepared", "pandit_subscription", subscriptionId, current ? serializeSubscription(current) : null, serializeSubscription(created));
    notify(user.id, "subscription", "Subscription checkout prepared", `Your ${plan.name} plan is ready for payment.`, "/pandit/dashboard/subscription", { subscriptionId, planId: plan.id });

    return res.status(201).json({
      success: true,
      message: "Subscription prepared. Continue with the trusted Razorpay payment flow; activation occurs only after server-side payment verification.",
      ownerType: "pandit",
      ownerId: profile.id,
      subscription: serializeSubscription(created),
      payment: {
        required: true,
        provider: text(process.env.PAYMENT_PROVIDER, 50).toLowerCase() || "razorpay",
        amount: plan.price_amount,
        amountPaise: plan.price_amount * 100,
        currency: plan.currency,
        planId: plan.id,
        subscriptionId,
        orderCreationOwnedBy: "payments.ts",
        activationOwnedBy: "payments.ts/webhook",
      },
    });
  } catch (error) {
    console.error("Pandit subscription prepare error:", error);
    return res.status(500).json({ success: false, error: "Unable to prepare Pandit subscription." });
  }
});

router.patch("/subscription/auto-renew", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });
    const parsed = bool(bodyOf(req).autoRenew, "autoRenew");
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });

    const current = getCurrentSubscription(profile.id);
    if (!current) return res.status(404).json({ success: false, error: "No current subscription found." });
    if (!subscriptionIsActive(current)) return res.status(409).json({ success: false, error: "Auto-renew can only be changed on an active subscription." });
    if (parsed.value && !current.razorpay_subscription_id) {
      return res.status(409).json({ success: false, error: "Auto-renew requires a provider-backed subscription. Complete the supported subscription checkout first.", code: "PAYMENT_PROVIDER_SUBSCRIPTION_REQUIRED" });
    }

    const result = db.prepare(`
      UPDATE pandit_subscriptions
      SET auto_renew = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND pandit_id = ? AND status = 'active'
    `).run(parsed.value ? 1 : 0, current.id, profile.id);
    if (result.changes !== 1) return res.status(409).json({ success: false, error: "Auto-renew setting could not be updated." });

    db.prepare(`
      INSERT INTO subscription_events (
        subscription_type, subscription_id, user_id, event_type,
        old_status, new_status, old_expires_at, new_expires_at,
        notes, metadata_json, created_at
      ) VALUES ('pandit', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      current.id,
      user.id,
      parsed.value ? "auto_renew_enabled" : "auto_renew_disabled",
      current.status,
      current.status,
      current.expires_at,
      current.expires_at,
      parsed.value ? "Pandit auto-renew enabled." : "Pandit auto-renew disabled.",
      json({ providerSubscriptionPresent: Boolean(current.razorpay_subscription_id) }, "{}"),
    );

    audit(req, user, "pandit.subscription_auto_renew_updated", "pandit_subscription", current.id, { autoRenew: Boolean(current.auto_renew) }, { autoRenew: parsed.value });
    return res.json({ success: true, autoRenew: parsed.value, subscription: serializeSubscription(getCurrentSubscription(profile.id)) });
  } catch (error) {
    console.error("Pandit auto-renew error:", error);
    return res.status(500).json({ success: false, error: "Unable to update auto-renew setting." });
  }
});

router.post("/subscription/cancel", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });
    const current = getCurrentSubscription(profile.id);
    if (!current) return res.status(404).json({ success: false, error: "No current subscription found." });

    if (!["pending", "active", "paused", "payment_failed"].includes(current.status)) {
      return res.json({ success: true, message: "Subscription is already inactive.", subscription: serializeSubscription(current) });
    }

    db.transaction(() => {
      const changed = db.prepare(`
        UPDATE pandit_subscriptions
        SET status = 'cancelled', auto_renew = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND pandit_id = ? AND status IN ('pending','active','paused','payment_failed')
      `).run(current.id, profile.id);
      if (changed.changes !== 1) throw new Error("Subscription could not be cancelled.");

      db.prepare(`
        UPDATE pandit_profiles
        SET listing_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(profile.id);

      db.prepare(`
        INSERT INTO subscription_events (
          subscription_type, subscription_id, user_id, event_type,
          old_status, new_status, old_expires_at, new_expires_at,
          notes, metadata_json, created_at
        ) VALUES ('pandit', ?, ?, 'cancelled', ?, 'cancelled', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        current.id,
        user.id,
        current.status,
        current.expires_at,
        current.expires_at,
        "Pandit subscription cancelled by owner.",
        json({ providerSubscriptionPresent: Boolean(current.razorpay_subscription_id) }, "{}"),
      );
    })();

    audit(req, user, "pandit.subscription_cancelled", "pandit_subscription", current.id, serializeSubscription(current), { status: "cancelled" });
    notify(user.id, "subscription", "Subscription cancelled", "Your Pandit subscription has been cancelled and public listing has been deactivated.", "/pandit/dashboard/subscription", { subscriptionId: current.id });
    return res.json({ success: true, message: "Subscription cancelled successfully.", subscription: serializeSubscription(getSubscriptionHistory(profile.id)[0]) });
  } catch (error) {
    console.error("Pandit subscription cancel error:", error);
    return res.status(500).json({ success: false, error: "Unable to cancel subscription." });
  }
});

/* -------------------------------------------------------------------------- */
/* Lead management for Pandit                                                 */
/* -------------------------------------------------------------------------- */

function canSeeLead(panditId: number, leadId: number): boolean {
  return Boolean(db.prepare(`
    SELECT 1
    FROM lead_assignments
    WHERE lead_id = ? AND pandit_id = ? AND assignment_type = 'pandit'
    LIMIT 1
  `).get(leadId, panditId));
}

router.get("/leads", (req, res) => {
  try {
    const profile = getProfile(userOf(res).id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const where = ["la.pandit_id = ?", "la.assignment_type = 'pandit'"];
    const params: unknown[] = [profile.id];
    const status = text(req.query.status, 30).toLowerCase();
    const search = text(req.query.search, 150);

    if (status && ["assigned", "accepted", "contacted", "follow_up", "converted", "rejected", "expired", "closed"].includes(status)) {
      where.push("la.status = ?");
      params.push(status);
    }

    if (search) {
      const pattern = `%${search}%`;
      where.push(`(
        LOWER(COALESCE(l.name,'')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.phone,'')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.email,'')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.lead_number,'')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.service_type,'')) LIKE LOWER(?) OR
        LOWER(COALESCE(l.puja_type,'')) LIKE LOWER(?)
      )`);
      for (let i = 0; i < 6; i += 1) params.push(pattern);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const total = Number((db.prepare(`
      SELECT COUNT(*) AS count
      FROM lead_assignments la
      INNER JOIN leads l ON l.id = la.lead_id
      ${whereSql}
    `).get(...params) as { count?: number } | undefined)?.count ?? 0);

    const rows = db.prepare(`
      SELECT l.*,
             la.id AS assignment_id,
             la.status AS assignment_status,
             la.lead_credit_used,
             la.credit_consumed_at,
             la.assigned_at,
             la.contacted_at,
             la.converted_at,
             la.closed_at,
             la.notes AS assignment_notes
      FROM lead_assignments la
      INNER JOIN leads l ON l.id = la.lead_id
      ${whereSql}
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Row[];

    return res.json({ success: true, leads: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Pandit leads GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit leads." });
  }
});

router.get("/leads/stats", (_req, res) => {
  try {
    const profile = getProfile(userOf(res).id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });

    const total = db.prepare(`SELECT COUNT(*) AS count FROM lead_assignments WHERE pandit_id = ? AND assignment_type = 'pandit'`).get(profile.id) as { count?: number };
    const byStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM lead_assignments WHERE pandit_id = ? AND assignment_type = 'pandit' GROUP BY status ORDER BY count DESC`).all(profile.id);
    const credited = db.prepare(`SELECT COUNT(*) AS count FROM lead_assignments WHERE pandit_id = ? AND assignment_type = 'pandit' AND lead_credit_used = 1`).get(profile.id) as { count?: number };
    const converted = db.prepare(`SELECT COUNT(*) AS count FROM lead_assignments WHERE pandit_id = ? AND assignment_type = 'pandit' AND status = 'converted'`).get(profile.id) as { count?: number };
    const subscription = getCurrentSubscription(profile.id);

    return res.json({
      success: true,
      total: Number(total?.count ?? 0),
      credited: Number(credited?.count ?? 0),
      converted: Number(converted?.count ?? 0),
      byStatus,
      subscription: serializeSubscription(subscription),
      leadsRemaining: subscription ? Math.max(0, subscription.lead_limit - subscription.leads_used) : 0,
    });
  } catch (error) {
    console.error("Pandit lead stats error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit lead statistics." });
  }
});

router.get("/leads/:id", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    const leadId = positiveId(req.params.id);
    if (!profile || !leadId) return res.status(400).json({ success: false, error: "Invalid lead ID." });
    if (!canSeeLead(profile.id, leadId)) return res.status(403).json({ success: false, error: "You do not have access to this lead." });

    const lead = db.prepare(`SELECT * FROM leads WHERE id = ? LIMIT 1`).get(leadId) as Row | undefined;
    if (!lead) return res.status(404).json({ success: false, error: "Lead not found." });
    const assignments = db.prepare(`SELECT * FROM lead_assignments WHERE lead_id = ? AND pandit_id = ? AND assignment_type = 'pandit' ORDER BY id DESC`).all(leadId, profile.id);
    const notes = db.prepare(`SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY is_pinned DESC, id DESC LIMIT 100`).all(leadId);
    const followups = db.prepare(`SELECT * FROM lead_followups WHERE lead_id = ? ORDER BY due_at ASC`).all(leadId);
    const communications = db.prepare(`SELECT * FROM lead_communications WHERE lead_id = ? ORDER BY id DESC LIMIT 100`).all(leadId);
    const events = db.prepare(`SELECT * FROM lead_events WHERE lead_id = ? ORDER BY id DESC LIMIT 100`).all(leadId);

    return res.json({ success: true, lead, assignments, notes, followups, communications, events });
  } catch (error) {
    console.error("Pandit lead detail error:", error);
    return res.status(500).json({ success: false, error: "Unable to load lead details." });
  }
});

router.patch("/leads/:id/status", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    const leadId = positiveId(req.params.id);
    const status = text(bodyOf(req).status, 30).toLowerCase();
    if (!profile || !leadId) return res.status(400).json({ success: false, error: "Invalid lead ID." });
    if (!canSeeLead(profile.id, leadId)) return res.status(403).json({ success: false, error: "You do not have access to this lead." });

    if (!["assigned", "accepted", "contacted", "follow_up", "converted", "rejected", "expired", "closed"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid lead status." });
    }

    const old = db.prepare(`SELECT * FROM lead_assignments WHERE lead_id = ? AND pandit_id = ? AND assignment_type = 'pandit' LIMIT 1`).get(leadId, profile.id) as Row | undefined;
    if (!old) return res.status(404).json({ success: false, error: "Lead assignment not found." });

    const result = db.prepare(`
      UPDATE lead_assignments
      SET status = ?,
          contacted_at = CASE WHEN ? = 'contacted' THEN COALESCE(contacted_at, CURRENT_TIMESTAMP) ELSE contacted_at END,
          converted_at = CASE WHEN ? = 'converted' THEN COALESCE(converted_at, CURRENT_TIMESTAMP) ELSE converted_at END,
          closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE closed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND pandit_id = ? AND assignment_type = 'pandit'
    `).run(status, status, status, status, Number(old.id), profile.id);
    if (result.changes !== 1) return res.status(409).json({ success: false, error: "Lead status could not be updated." });

    if (status === "contacted") db.prepare(`UPDATE leads SET last_contacted_at = CURRENT_TIMESTAMP, status = CASE WHEN status IN ('new','qualified','assigned') THEN 'contacted' ELSE status END, last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    if (status === "follow_up") db.prepare(`UPDATE leads SET status = 'follow_up', last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    if (status === "converted") db.prepare(`UPDATE leads SET status = 'converted', converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP), last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    if (["closed", "rejected", "expired"].includes(status)) db.prepare(`UPDATE leads SET status = CASE WHEN ? = 'closed' THEN 'closed' ELSE status END, closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE closed_at END, last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, status, leadId);
    if (["accepted", "assigned"].includes(status)) db.prepare(`UPDATE leads SET status = 'assigned', last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);

    const updated = db.prepare(`SELECT * FROM lead_assignments WHERE id = ?`).get(Number(old.id));
    db.prepare(`
      INSERT INTO lead_events (lead_id, assignment_id, user_id, event_type, old_status, new_status, notes, metadata_json, created_at)
      VALUES (?, ?, ?, 'assignment_status_changed', ?, ?, ?, '{}', CURRENT_TIMESTAMP)
    `).run(leadId, Number(old.id), user.id, old.status ?? null, status, "Pandit updated lead assignment status.");

    audit(req, user, "pandit.lead_status_changed", "lead", leadId, old, updated);
    return res.json({ success: true, lead: db.prepare(`SELECT * FROM leads WHERE id = ?`).get(leadId), assignment: updated });
  } catch (error) {
    console.error("Pandit lead status error:", error);
    return res.status(500).json({ success: false, error: "Unable to update lead status." });
  }
});

router.post("/leads/:id/notes", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    const leadId = positiveId(req.params.id);
    if (!profile || !leadId || !canSeeLead(profile.id, leadId)) return res.status(403).json({ success: false, error: "You do not have access to this lead." });

    const body = bodyOf(req);
    const note = text(body.note ?? body.message, 10000);
    if (!note) return res.status(400).json({ success: false, error: "Note text is required." });
    const pinned = bool(body.isPinned ?? false, "isPinned");
    if (!pinned.ok) return res.status(400).json({ success: false, error: pinned.error });

    const result = db.prepare(`
      INSERT INTO lead_notes (lead_id, user_id, note_type, note, is_pinned, created_at, updated_at)
      VALUES (?, ?, 'internal', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(leadId, user.id, note, pinned.value ? 1 : 0);

    db.prepare(`UPDATE leads SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    db.prepare(`INSERT INTO lead_events (lead_id, user_id, event_type, notes, metadata_json, created_at) VALUES (?, ?, 'note_added', ?, '{}', CURRENT_TIMESTAMP)`).run(leadId, user.id, note);
    audit(req, user, "pandit.lead_note_added", "lead", leadId, null, { noteId: Number(result.lastInsertRowid), pinned: pinned.value });

    return res.status(201).json({ success: true, note: db.prepare(`SELECT * FROM lead_notes WHERE id = ?`).get(Number(result.lastInsertRowid)) });
  } catch (error) {
    console.error("Pandit lead note error:", error);
    return res.status(500).json({ success: false, error: "Unable to add lead note." });
  }
});

router.post("/leads/:id/followups", (req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    const leadId = positiveId(req.params.id);
    const body = bodyOf(req);
    if (!profile || !leadId || !canSeeLead(profile.id, leadId)) return res.status(403).json({ success: false, error: "You do not have access to this lead." });

    const dueAt = text(body.dueAt ?? body.followupAt, 80);
    const type = text(body.followupType ?? body.type ?? "call", 20).toLowerCase();
    if (!dueAt) return res.status(400).json({ success: false, error: "dueAt is required." });
    if (!["call", "whatsapp", "email", "meeting", "reminder", "other"].includes(type)) return res.status(400).json({ success: false, error: "Invalid follow-up type." });

    const result = db.prepare(`
      INSERT INTO lead_followups (
        lead_id, assigned_to_user_id, followup_type, due_at, status,
        subject, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(leadId, user.id, type, dueAt, nullable(body.subject, 250), nullable(body.notes ?? body.message, 5000));

    db.prepare(`UPDATE leads SET status = CASE WHEN status IN ('new','qualified','assigned','contacted') THEN 'follow_up' ELSE status END, last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    audit(req, user, "pandit.lead_followup_created", "lead", leadId, null, { followupId: Number(result.lastInsertRowid), dueAt, type });

    return res.status(201).json({ success: true, followup: db.prepare(`SELECT * FROM lead_followups WHERE id = ?`).get(Number(result.lastInsertRowid)) });
  } catch (error) {
    console.error("Pandit lead follow-up error:", error);
    return res.status(500).json({ success: false, error: "Unable to create follow-up." });
  }
});

/* -------------------------------------------------------------------------- */
/* Pandit analytics (subscription gated)                                      */
/* -------------------------------------------------------------------------- */

router.get("/analytics", (_req, res) => {
  try {
    const user = userOf(res);
    const profile = getProfile(user.id);
    if (!profile) return res.status(404).json({ success: false, error: "Pandit profile not found." });

    const subscription = getCurrentSubscription(profile.id);
    if (!subscriptionIsActive(subscription) || Number(subscription?.analytics_access ?? 0) !== 1) {
      return res.status(403).json({ success: false, error: "Analytics are available only on an active eligible Pandit subscription plan.", code: "ANALYTICS_NOT_INCLUDED" });
    }

    const analyticsLevel = String(subscription?.analytics_level || "basic");
    const views = db.prepare(`SELECT COUNT(*) AS count FROM web_page_views WHERE entity_type = 'pandit' AND entity_id = ? AND entered_at >= datetime('now','-30 day')`).get(profile.id) as { count?: number };
    const visitors = db.prepare(`SELECT COUNT(DISTINCT visitor_id) AS count FROM web_page_views WHERE entity_type = 'pandit' AND entity_id = ? AND entered_at >= datetime('now','-30 day')`).get(profile.id) as { count?: number };
    const events = db.prepare(`SELECT COUNT(*) AS count FROM web_events WHERE entity_type = 'pandit' AND entity_id = ? AND occurred_at >= datetime('now','-30 day')`).get(profile.id) as { count?: number };
    const conversions = db.prepare(`SELECT conversion_type, COUNT(*) AS count FROM web_conversions WHERE entity_type = 'pandit' AND entity_id = ? AND created_at >= datetime('now','-30 day') GROUP BY conversion_type ORDER BY count DESC`).all(profile.id);
    const daily = db.prepare(`
      SELECT substr(entered_at, 1, 10) AS date,
             COUNT(*) AS page_views,
             COUNT(DISTINCT visitor_id) AS unique_visitors,
             ROUND(COALESCE(AVG(duration_seconds), 0), 2) AS avg_duration_seconds,
             ROUND(COALESCE(AVG(scroll_depth_percent), 0), 2) AS avg_scroll_depth_percent,
             SUM(click_count) AS clicks,
             SUM(interaction_count) AS interactions,
             SUM(CASE WHEN engaged = 1 THEN 1 ELSE 0 END) AS engaged_views
      FROM web_page_views
      WHERE entity_type = 'pandit' AND entity_id = ? AND entered_at >= datetime('now','-30 day')
      GROUP BY substr(entered_at, 1, 10) ORDER BY date ASC
    `).all(profile.id);
    const topPaths = db.prepare(`
      SELECT path, COUNT(*) AS page_views, COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM web_page_views
      WHERE entity_type = 'pandit' AND entity_id = ? AND entered_at >= datetime('now','-30 day')
      GROUP BY path ORDER BY page_views DESC LIMIT 50
    `).all(profile.id);

    return res.json({
      success: true,
      subscription: serializeSubscription(subscription),
      access: { level: analyticsLevel, advanced: analyticsLevel === "advanced" },
      range: { days: 30 },
      summary: {
        pageViews: Number(views?.count ?? 0),
        uniqueVisitors: Number(visitors?.count ?? 0),
        events: Number(events?.count ?? 0),
      },
      conversions,
      daily,
      topPaths,
    });
  } catch (error) {
    console.error("Pandit analytics error:", error);
    return res.status(500).json({ success: false, error: "Unable to load Pandit analytics." });
  }
});

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

router.get("/notifications", (req, res) => {
  try {
    const user = userOf(res);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const rows = db.prepare(`
      SELECT id, type, title, message, action_url, is_read, read_at, metadata_json, created_at
      FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?
    `).all(user.id, limit) as Row[];
    const unreadCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`).get(user.id) as { count?: number } | undefined)?.count ?? 0);
    return res.json({ success: true, notifications: rows, unreadCount });
  } catch (error) {
    console.error("Pandit notifications GET error:", error);
    return res.status(500).json({ success: false, error: "Unable to load notifications." });
  }
});

router.patch("/notifications/:id/read", (req, res) => {
  try {
    const user = userOf(res);
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid notification ID." });
    const result = db.prepare(`
      UPDATE notifications
      SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);
    if (result.changes !== 1) return res.status(404).json({ success: false, error: "Notification not found." });
    return res.json({ success: true, message: "Notification marked as read." });
  } catch (error) {
    console.error("Pandit notification read error:", error);
    return res.status(500).json({ success: false, error: "Unable to update notification." });
  }
});

router.post("/notifications/read-all", (_req, res) => {
  try {
    const user = userOf(res);
    const result = db.prepare(`
      UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE user_id = ? AND is_read = 0
    `).run(user.id);
    return res.json({ success: true, updated: result.changes });
  } catch (error) {
    console.error("Pandit notifications read-all error:", error);
    return res.status(500).json({ success: false, error: "Unable to mark notifications as read." });
  }
});

export default router;
