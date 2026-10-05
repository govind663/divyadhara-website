
import { createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";
import {
  captureRazorpayPayment,
  cancelRazorpayPaymentLink,
  createRazorpayOrder,
  createRazorpayPaymentLink,
  createRazorpayRefund,
  fetchRazorpayPayment,
  fetchRazorpayPaymentLink,
  getRazorpayConfig,
  verifyPaymentSignature,
  verifyRazorpayWebhookSignature,
} from "../lib/razorpay.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Payments / Subscriptions API — FINAL BUSINESS CONTRACT
|--------------------------------------------------------------------------
|
| Canonical business roles:
|   visitor, pandit, temple_manager, ashram_manager, sales, super_admin
|
| Commercial catalogue:
|   pandit_basic   ₹199 / 30 days / 10 leads / 5 services / 2 areas
|   pandit_premium ₹499 / 30 days / 30 leads / 15 services / unlimited areas
|   temple_basic   ₹499 / 30 days / 15 leads
|   temple_premium ₹999 / 30 days / 50 leads
|   ashram_basic   ₹499 / 30 days / 15 leads
|   ashram_premium ₹1499 / 30 days / 75 leads
|
| Payment rules:
| - Local subscription plan + active monthly price variant are the commercial
|   source of truth. Razorpay is the payment gateway, not the pricing source.
| - Only authorised business owners / assigned managers may create checkout.
| - Sales and Super Admin may operate business subscriptions where policy allows.
| - Payment is never considered successful from a client claim alone.
| - A trusted Razorpay signature + fetched gateway payment + exact amount/currency
|   match are required before activation.
| - Webhooks are HMAC-verified, idempotent and use the same activation path.
| - Subscription entitlements are frozen in plan_snapshot_json.
| - Lead/service quotas are not modified here; lead billing is consumed by CRM.
| - Full refund can revoke the linked subscription according to policy.
| - Historical payment/subscription/event records are retained.
| - Ashram ownership/authorisation uses ashram_manager_assignments, never the
|   legacy ashram_subscriptions.manager_user_id field.
|--------------------------------------------------------------------------
*/

const router = Router();
const razorpayWebhookRouter = Router();

/* IMPORTANT: webhook router is mounted before the auth middleware below. */
router.use("/webhooks", razorpayWebhookRouter);
router.use(requireAuth);

type OwnerType = "pandit" | "temple" | "ashram";
type SqlRow = Record<string, unknown>;

type Plan = {
  id: number;
  code: string;
  audience: OwnerType;
  name: string;
  description: string | null;
  price_amount: number;
  currency: string;
  billing_interval: string;
  duration_days: number;
  lead_limit: number;
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
  plan_features_json: string;
  razorpay_plan_id: string | null;
  is_active: number;
};

type PriceVariant = {
  id: number;
  plan_id: number;
  billing_interval: string;
  duration_days: number;
  price_amount: number;
  currency: string;
  provider: string;
  razorpay_plan_id: string | null;
  is_active: number;
};

const OWNER_TYPES: readonly OwnerType[] = ["pandit", "temple", "ashram"];
const SUCCESS_PAYMENT_STATUSES = new Set(["captured", "paid"]);
const TERMINAL_PAYMENT_STATUSES = new Set([
  "created",
  "pending",
  "authorized",
  "captured",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
]);

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active"]);
const NON_ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "pending",
  "paused",
  "payment_failed",
]);

function text(value: unknown, max = 500): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim().slice(0, max);
  return "";
}

function nullable(value: unknown, max = 500): string | null {
  const result = text(value, max);
  return result || null;
}

function bodyOf(req: Request): Record<string, unknown> {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = text(value, 20).toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function json(value: unknown, fallback = "{}"): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return fallback;
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function addDaysIso(days: number): string {
  const safe = Number.isInteger(days) && days > 0 ? days : 30;
  return new Date(Date.now() + safe * 86_400_000).toISOString();
}

function makeNumber(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function hashPayload(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function currentUser(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

function normalizeOwnerType(value: unknown): OwnerType | null {
  const normalized = text(value, 30).toLowerCase();
  return OWNER_TYPES.includes(normalized as OwnerType)
    ? normalized as OwnerType
    : null;
}

function tableExists(tableName: string): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ? LIMIT 1
  `).get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function columnExists(tableName: string, columnName: string): boolean {
  if (!tableExists(tableName)) return false;
  const rows = db.pragma(`table_info("${tableName.replace(/"/g, '""')}")`) as Array<{ name?: string }>;
  return rows.some((row) => row.name === columnName);
}

function paymentTablesReady(): string[] {
  return [
    "subscription_plans",
    "subscription_plan_prices",
    "pandit_subscriptions",
    "temple_subscriptions",
    "ashram_subscriptions",
    "payment_orders",
    "payments",
    "payment_links",
    "payment_webhook_events",
    "subscription_events",
    "audit_logs",
  ].filter((table) => !tableExists(table));
}

function requirePaymentTables(res: Response): boolean {
  const missing = paymentTablesReady();
  if (!missing.length) return true;
  res.status(503).json({
    success: false,
    error: `Payment database is incomplete. Missing: ${missing.join(", ")}.`,
    code: "PAYMENT_DATABASE_INCOMPLETE",
  });
  return false;
}

function paymentsEnabled(): boolean {
  const raw = text(process.env.PAYMENTS_ENABLED, 20).toLowerCase();
  return raw !== "false" && raw !== "0";
}

function providerName(): string {
  return text(process.env.PAYMENT_PROVIDER, 50).toLowerCase() || "razorpay";
}

function planForOwner(planId: number, ownerType: OwnerType): Plan | null {
  return (
    db.prepare(`
      SELECT id, code, audience, name, description, price_amount, currency,
             billing_interval, duration_days, lead_limit,
             service_limit, service_area_limit, gallery_limit, video_limit, program_limit,
             listing_enabled, featured_listing, priority_support, verification_badge,
             analytics_access, homepage_promotion, live_aarti_enabled, enhanced_seo,
             enhanced_profile, whatsapp_enquiry, search_visibility, analytics_level,
             plan_features_json, razorpay_plan_id, is_active
      FROM subscription_plans
      WHERE id = ? AND audience = ? AND is_active = 1
      LIMIT 1
    `).get(planId, ownerType) as Plan | undefined
  ) ?? null;
}

function activeMonthlyPriceVariant(planId: number): PriceVariant | null {
  return (
    db.prepare(`
      SELECT id, plan_id, billing_interval, duration_days, price_amount,
             currency, provider, razorpay_plan_id, is_active
      FROM subscription_plan_prices
      WHERE plan_id = ?
        AND billing_interval = 'monthly'
        AND duration_days = 30
        AND is_active = 1
      ORDER BY id DESC
      LIMIT 1
    `).get(planId) as PriceVariant | undefined
  ) ?? null;
}

function trustedCommercialPlan(planId: number, ownerType: OwnerType): {
  plan: Plan;
  price: PriceVariant;
} | null {
  const plan = planForOwner(planId, ownerType);
  if (!plan) return null;
  const price = activeMonthlyPriceVariant(plan.id);
  if (!price) return null;
  if (price.currency.toUpperCase() !== "INR") return null;
  if (Number(price.price_amount) !== Number(plan.price_amount)) return null;
  if (text(price.provider, 50).toLowerCase() !== "razorpay") return null;
  return { plan, price };
}

function planSnapshot(plan: Plan, price: PriceVariant): Record<string, unknown> {
  let features: unknown[] = [];
  try {
    const parsed = JSON.parse(plan.plan_features_json || "[]");
    features = Array.isArray(parsed) ? parsed : [];
  } catch {
    features = [];
  }

  return {
    planId: plan.id,
    planCode: plan.code,
    audience: plan.audience,
    name: plan.name,
    description: plan.description,
    priceVariantId: price.id,
    priceAmount: price.price_amount,
    currency: price.currency,
    billingInterval: price.billing_interval,
    durationDays: price.duration_days,
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
    features,
    capturedAt: nowIso(),
  };
}

function serializePlan(plan: Plan, price: PriceVariant | null): Record<string, unknown> {
  let features: unknown[] = [];
  try {
    const parsed = JSON.parse(plan.plan_features_json || "[]");
    features = Array.isArray(parsed) ? parsed : [];
  } catch {
    features = [];
  }

  return {
    id: plan.id,
    code: plan.code,
    audience: plan.audience,
    ownerType: plan.audience,
    name: plan.name,
    title: plan.name,
    description: plan.description,
    priceAmount: price?.price_amount ?? plan.price_amount,
    currency: price?.currency ?? plan.currency,
    billingInterval: price?.billing_interval ?? plan.billing_interval,
    durationDays: price?.duration_days ?? plan.duration_days,
    priceVariantId: price?.id ?? null,
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
    features,
    razorpayPlanId: price?.razorpay_plan_id ?? plan.razorpay_plan_id,
    isActive: Boolean(plan.is_active),
    checkoutAvailable: Boolean(price),
  };
}

function subscriptionTable(ownerType: OwnerType): string {
  return ownerType === "pandit"
    ? "pandit_subscriptions"
    : ownerType === "temple"
      ? "temple_subscriptions"
      : "ashram_subscriptions";
}

function ownerColumn(ownerType: OwnerType): string {
  return ownerType === "pandit"
    ? "pandit_id"
    : ownerType === "temple"
      ? "temple_id"
      : "ashram_id";
}

function subscriptionPriceColumnPresent(ownerType: OwnerType): boolean {
  return columnExists(subscriptionTable(ownerType), "subscription_plan_price_id");
}

function getPanditOwner(user: AuthenticatedUser): { ownerId: number; userId: number } | null {
  if (user.role !== "pandit") return null;
  const row = db.prepare(`
    SELECT id, user_id
    FROM pandit_profiles
    WHERE user_id = ? LIMIT 1
  `).get(user.id) as { id?: number; user_id?: number } | undefined;
  const ownerId = positiveId(row?.id);
  return ownerId ? { ownerId, userId: user.id } : null;
}

function isAssignedTempleManager(userId: number, templeId: number): boolean {
  return Boolean(db.prepare(`
    SELECT 1
    FROM temple_manager_assignments tma
    JOIN users u ON u.id = tma.manager_user_id
    JOIN roles r ON r.id = u.role_id
    WHERE tma.manager_user_id = ?
      AND tma.temple_id = ?
      AND tma.status = 'active'
      AND u.status = 'active'
      AND r.code = 'temple_manager'
    LIMIT 1
  `).get(userId, templeId));
}

function isAssignedAshramManager(userId: number, ashramId: number): boolean {
  return Boolean(db.prepare(`
    SELECT 1
    FROM ashram_manager_assignments ama
    JOIN users u ON u.id = ama.manager_user_id
    JOIN roles r ON r.id = u.role_id
    WHERE ama.manager_user_id = ?
      AND ama.ashram_id = ?
      AND ama.status = 'active'
      AND u.status = 'active'
      AND r.code = 'ashram_manager'
    LIMIT 1
  `).get(userId, ashramId));
}

function resolvePurchaseOwner(
  user: AuthenticatedUser,
  ownerType: OwnerType,
  requestedOwnerId: number | null,
): { ownerId: number; userId: number } | null {
  if (ownerType === "pandit") {
    if (user.role === "pandit") return getPanditOwner(user);
    /* Sales/Admin can assist with Pandit onboarding only when requested owner
       resolves to a real Pandit profile. */
    if (user.role === "sales" || user.role === "super_admin") {
      const ownerId = requestedOwnerId;
      if (!ownerId) return null;
      const row = db.prepare(`
        SELECT pp.id, pp.user_id, u.status
        FROM pandit_profiles pp
        JOIN users u ON u.id = pp.user_id
        JOIN roles r ON r.id = u.role_id
        WHERE pp.id = ? AND r.code = 'pandit' AND u.status IN ('pending','active')
        LIMIT 1
      `).get(ownerId) as { id?: number; user_id?: number } | undefined;
      return row?.id ? { ownerId, userId: positiveId(row.user_id) ?? user.id } : null;
    }
    return null;
  }

  if (ownerType === "temple") {
    const ownerId = requestedOwnerId;
    if (!ownerId) return null;
    const temple = db.prepare(`SELECT id FROM temples WHERE id = ? LIMIT 1`).get(ownerId);
    if (!temple) return null;

    if (user.role === "super_admin" || user.role === "sales") {
      return { ownerId, userId: user.id };
    }
    if (user.role === "temple_manager" && isAssignedTempleManager(user.id, ownerId)) {
      return { ownerId, userId: user.id };
    }
    return null;
  }

  const ownerId = requestedOwnerId;
  if (!ownerId) return null;
  const ashram = db.prepare(`SELECT id FROM ashrams WHERE id = ? LIMIT 1`).get(ownerId);
  if (!ashram) return null;

  if (user.role === "super_admin" || user.role === "sales") {
    return { ownerId, userId: user.id };
  }
  if (user.role === "ashram_manager" && isAssignedAshramManager(user.id, ownerId)) {
    return { ownerId, userId: user.id };
  }
  return null;
}

function canAccessOwner(user: AuthenticatedUser, ownerType: OwnerType, ownerId: number): boolean {
  if (user.role === "super_admin" || user.role === "sales") return true;
  return Boolean(resolvePurchaseOwner(user, ownerType, ownerId));
}

function ownerUserId(ownerType: OwnerType, ownerId: number): number | null {
  if (ownerType === "pandit") {
    const row = db.prepare(`
      SELECT user_id FROM pandit_profiles WHERE id = ? LIMIT 1
    `).get(ownerId) as { user_id?: number } | undefined;
    return positiveId(row?.user_id);
  }

  if (ownerType === "temple") {
    const row = db.prepare(`
      SELECT tma.manager_user_id
      FROM temple_manager_assignments tma
      JOIN users u ON u.id = tma.manager_user_id
      JOIN roles r ON r.id = u.role_id
      WHERE tma.temple_id = ?
        AND tma.status = 'active'
        AND u.status = 'active'
        AND r.code = 'temple_manager'
      ORDER BY tma.assigned_at DESC, tma.id DESC
      LIMIT 1
    `).get(ownerId) as { manager_user_id?: number } | undefined;
    return positiveId(row?.manager_user_id);
  }

  const row = db.prepare(`
    SELECT ama.manager_user_id
    FROM ashram_manager_assignments ama
    JOIN users u ON u.id = ama.manager_user_id
    JOIN roles r ON r.id = u.role_id
    WHERE ama.ashram_id = ?
      AND ama.status = 'active'
      AND u.status = 'active'
      AND r.code = 'ashram_manager'
    ORDER BY ama.assigned_at DESC, ama.id DESC
    LIMIT 1
  `).get(ownerId) as { manager_user_id?: number } | undefined;
  return positiveId(row?.manager_user_id);
}

function getSubscription(subscriptionId: number, ownerType: OwnerType): SqlRow | undefined {
  return db.prepare(`SELECT * FROM ${subscriptionTable(ownerType)} WHERE id = ? LIMIT 1`)
    .get(subscriptionId) as SqlRow | undefined;
}

function createSubscriptionEvent(params: {
  ownerType: OwnerType;
  subscriptionId: number;
  userId: number | null;
  eventType: string;
  oldStatus?: string | null;
  newStatus?: string | null;
  oldExpiresAt?: string | null;
  newExpiresAt?: string | null;
  paymentOrderId?: number | null;
  paymentId?: number | null;
  notes?: string | null;
  metadata?: unknown;
}): void {
  db.prepare(`
    INSERT INTO subscription_events (
      subscription_type, subscription_id, payment_order_id, payment_id, user_id,
      event_type, old_status, new_status, old_expires_at, new_expires_at,
      notes, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    params.ownerType,
    params.subscriptionId,
    params.paymentOrderId ?? null,
    params.paymentId ?? null,
    params.userId ?? null,
    params.eventType,
    params.oldStatus ?? null,
    params.newStatus ?? null,
    params.oldExpiresAt ?? null,
    params.newExpiresAt ?? null,
    params.notes ?? null,
    json(params.metadata ?? {}),
  );
}

function audit(
  req: Request | null,
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData: unknown,
  newData: unknown,
): void {
  if (!tableExists("audit_logs")) return;
  const ip = req?.ip ? text(req.ip, 100) : null;
  const agent = req?.get("user-agent") ? text(req.get("user-agent"), 1000) : null;
  db.prepare(`
    INSERT INTO audit_logs (
      user_id, action, entity_type, entity_id, old_data_json, new_data_json,
      ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    userId,
    action,
    entityType,
    entityId,
    oldData == null ? null : json(oldData),
    newData == null ? null : json(newData),
    ip,
    agent,
  );
}

function notifyUser(
  userId: number | null,
  title: string,
  message: string,
  actionUrl: string | null,
  metadata: unknown,
): void {
  if (!userId || !tableExists("notifications")) return;
  try {
    db.prepare(`
      INSERT INTO notifications (
        user_id, type, title, message, action_url, is_read, metadata_json, created_at
      ) VALUES (?, 'subscription', ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
    `).run(userId, title, message, actionUrl, json(metadata));
  } catch {
    /* Notification delivery must not roll back payment state. */
  }
}

function closePendingSubscriptions(
  ownerType: OwnerType,
  ownerId: number,
  exceptId?: number,
): void {
  const table = subscriptionTable(ownerType);
  const column = ownerColumn(ownerType);
  const args: unknown[] = [ownerId];
  let extra = "";
  if (exceptId) {
    extra = "AND id <> ?";
    args.push(exceptId);
  }
  db.prepare(`
    UPDATE ${table}
    SET status = 'cancelled', auto_renew = 0, updated_at = CURRENT_TIMESTAMP
    WHERE ${column} = ?
      ${extra}
      AND status IN ('pending','paused','payment_failed')
  `).run(...args);
}

function expireActiveSubscription(ownerType: OwnerType, ownerId: number): void {
  const table = subscriptionTable(ownerType);
  const column = ownerColumn(ownerType);
  const staleRows = db.prepare(`
    SELECT *
    FROM ${table}
    WHERE ${column} = ?
      AND status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < CURRENT_TIMESTAMP
    ORDER BY id DESC
  `).all(ownerId) as SqlRow[];

  for (const row of staleRows) {
    const changed = db.prepare(`
      UPDATE ${table}
      SET status = 'expired', auto_renew = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'active'
    `).run(row.id);

    if (changed.changes !== 1) continue;

    createSubscriptionEvent({
      ownerType,
      subscriptionId: Number(row.id),
      userId: null,
      eventType: "expired",
      oldStatus: "active",
      newStatus: "expired",
      oldExpiresAt: nullable(row.expires_at, 80),
      newExpiresAt: nullable(row.expires_at, 80),
      paymentOrderId: positiveId(row.payment_order_id),
      paymentId: positiveId(row.payment_id),
      notes: "Subscription expired automatically.",
      metadata: { automatic: true, ownerId },
    });

    if (ownerType === "pandit") syncPanditListing(ownerId, false);
  }
}

function getActiveSubscription(ownerType: OwnerType, ownerId: number): SqlRow | undefined {
  expireActiveSubscription(ownerType, ownerId);
  return db.prepare(`
    SELECT *
    FROM ${subscriptionTable(ownerType)}
    WHERE ${ownerColumn(ownerType)} = ?
      AND status = 'active'
      AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
      AND expires_at IS NOT NULL
      AND expires_at >= CURRENT_TIMESTAMP
    ORDER BY id DESC
    LIMIT 1
  `).get(ownerId) as SqlRow | undefined;
}

function getPendingSubscription(ownerType: OwnerType, ownerId: number, planId: number): SqlRow | undefined {
  return db.prepare(`
    SELECT *
    FROM ${subscriptionTable(ownerType)}
    WHERE ${ownerColumn(ownerType)} = ?
      AND plan_id = ?
      AND status = 'pending'
    ORDER BY id DESC
    LIMIT 1
  `).get(ownerId, planId) as SqlRow | undefined;
}

function createPendingSubscription(
  ownerType: OwnerType,
  ownerId: number,
  managerUserId: number | null,
  plan: Plan,
  price: PriceVariant,
): number {
  const table = subscriptionTable(ownerType);
  const column = ownerColumn(ownerType);
  const snapshot = planSnapshot(plan, price);
  const includePrice = subscriptionPriceColumnPresent(ownerType);

  const columns = [
    column,
    ...(includePrice ? ["subscription_plan_price_id"] : []),
    ...(ownerType === "pandit" ? [] : ["manager_user_id"]),
    "plan_id", "billing_interval", "duration_days", "status", "starts_at", "expires_at",
    "lead_limit", "leads_used", "price_amount", "currency",
    "service_limit", "service_area_limit", "gallery_limit", "video_limit", "program_limit",
    "auto_renew", "payment_order_id", "payment_id",
    "listing_enabled", "featured_listing", "priority_support", "verification_badge",
    "analytics_access", "homepage_promotion", "live_aarti_enabled", "enhanced_seo",
    "enhanced_profile", "whatsapp_enquiry", "search_visibility", "analytics_level",
    "plan_snapshot_json", "notes",
  ];

  const values: unknown[] = [
    ownerId,
    ...(includePrice ? [price.id] : []),
    ...(ownerType === "pandit" ? [] : [managerUserId]),
    plan.id, price.billing_interval, price.duration_days, "pending", null, null,
    plan.lead_limit, 0, price.price_amount, price.currency,
    plan.service_limit, plan.service_area_limit, plan.gallery_limit, plan.video_limit, plan.program_limit,
    0, null, null,
    plan.listing_enabled, plan.featured_listing, plan.priority_support, plan.verification_badge,
    plan.analytics_access, plan.homepage_promotion, plan.live_aarti_enabled, plan.enhanced_seo,
    plan.enhanced_profile, plan.whatsapp_enquiry, plan.search_visibility, plan.analytics_level,
    json(snapshot), "Awaiting verified Razorpay payment.",
  ];

  const placeholders = values.map(() => "?").join(", ");
  const result = db.prepare(`
    INSERT INTO ${table} (${columns.join(", ")}, created_at, updated_at)
    VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(...values);

  return Number(result.lastInsertRowid);
}

function ensurePendingSubscription(
  ownerType: OwnerType,
  ownerId: number,
  managerUserId: number | null,
  plan: Plan,
  price: PriceVariant,
): { id: number; reused: boolean } {
  const active = getActiveSubscription(ownerType, ownerId);
  if (active && positiveId(active.plan_id) === plan.id) {
    throw new Error("This subscription plan is already active for this business entity.");
  }

  const pending = getPendingSubscription(ownerType, ownerId, plan.id);
  if (pending) {
    const linkedOrderId = positiveId(pending.payment_order_id);
    if (linkedOrderId) {
      const order = db.prepare(`SELECT status FROM payment_orders WHERE id = ? LIMIT 1`)
        .get(linkedOrderId) as { status?: string } | undefined;
      if (order && ["created", "attempted"].includes(text(order.status, 30).toLowerCase())) {
        return { id: Number(pending.id), reused: true };
      }
    } else {
      return { id: Number(pending.id), reused: true };
    }
  }

  closePendingSubscriptions(ownerType, ownerId);
  return {
    id: createPendingSubscription(ownerType, ownerId, managerUserId, plan, price),
    reused: false,
  };
}

function updateSubscriptionPaymentRefs(
  ownerType: OwnerType,
  subscriptionId: number,
  orderId: number,
  paymentId: number,
): void {
  db.prepare(`
    UPDATE ${subscriptionTable(ownerType)}
    SET payment_order_id = ?, payment_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(orderId, paymentId, subscriptionId);
}

function createPaymentLedger(params: {
  userId: number;
  ownerType: OwnerType;
  ownerId: number;
  plan: Plan;
  price: PriceVariant;
  subscriptionId: number;
  providerOrderId: string | null;
  receipt: string;
  amount: number;
  amountPaise: number;
  currency: string;
  idempotencyKey: string | null;
  extraMetadata?: Record<string, unknown>;
}): { orderId: number; paymentId: number } {
  const orderColumns = [
    "order_number", "user_id", "plan_id", "subscription_plan_price_id",
    "pandit_subscription_id", "temple_subscription_id", "ashram_subscription_id",
    "booking_id", "purpose", "amount", "amount_paise", "currency", "provider",
    "provider_order_id", "status", "receipt", "notes_json", "metadata_json", "expires_at",
  ];

  const orderValues: unknown[] = [
    makeNumber("DD-ORD"), params.userId, params.plan.id, params.price.id,
    params.ownerType === "pandit" ? params.subscriptionId : null,
    params.ownerType === "temple" ? params.subscriptionId : null,
    params.ownerType === "ashram" ? params.subscriptionId : null,
    null, "subscription", params.amount, params.amountPaise, params.currency,
    "razorpay", params.providerOrderId, "created", params.receipt,
    json({ ownerType: params.ownerType, ownerId: params.ownerId, subscriptionId: params.subscriptionId }),
    json({
      app: "DivyaDhara",
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      subscriptionId: params.subscriptionId,
      planId: params.plan.id,
      priceVariantId: params.price.id,
      idempotencyKey: params.idempotencyKey,
      ...jsonObject(params.extraMetadata),
    }),
    addDaysIso(1),
  ];

  const orderResult = db.prepare(`
    INSERT INTO payment_orders (${orderColumns.join(", ")}, created_at, updated_at)
    VALUES (${orderValues.map(() => "?").join(", ")}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(...orderValues);

  const orderId = Number(orderResult.lastInsertRowid);
  const includePrice = columnExists("payments", "subscription_plan_price_id");

  const paymentColumns = [
    "payment_number", "user_id", "pandit_id", "temple_id", "ashram_id",
    "pandit_subscription_id", "temple_subscription_id", "ashram_subscription_id",
    "subscription_id", "plan_id",
    ...(includePrice ? ["subscription_plan_price_id"] : []),
    "booking_id", "payment_order_id", "purpose", "entity_type", "entity_id",
    "amount", "amount_paise", "currency", "provider", "provider_order_id",
    "provider_payment_id", "provider_signature", "idempotency_key", "status",
    "payment_method", "paid_at", "failed_at", "failure_reason",
    "refund_amount_paise", "refunded_at", "receipt", "checkout_payload_json", "metadata_json",
  ];

  const paymentValues: unknown[] = [
    makeNumber("DD-PAY"), params.userId,
    params.ownerType === "pandit" ? params.ownerId : null,
    params.ownerType === "temple" ? params.ownerId : null,
    params.ownerType === "ashram" ? params.ownerId : null,
    params.ownerType === "pandit" ? params.subscriptionId : null,
    params.ownerType === "temple" ? params.subscriptionId : null,
    params.ownerType === "ashram" ? params.subscriptionId : null,
    params.ownerType === "pandit" ? params.subscriptionId : null,
    params.plan.id,
    ...(includePrice ? [params.price.id] : []),
    null, orderId, "subscription",
    `${params.ownerType}_subscription`, params.ownerId,
    params.amount, params.amountPaise, params.currency, providerName(), params.providerOrderId,
    null, null, params.idempotencyKey, "created",
    null, null, null, 0, null, params.receipt,
    json({ providerOrderId: params.providerOrderId }),
    json({
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      subscriptionId: params.subscriptionId,
      planId: params.plan.id,
      priceVariantId: params.price.id,
      ...jsonObject(params.extraMetadata),
    }),
  ];

  const paymentResult = db.prepare(`
    INSERT INTO payments (${paymentColumns.join(", ")}, created_at, updated_at)
    VALUES (${paymentValues.map(() => "?").join(", ")}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(...paymentValues);

  const paymentId = Number(paymentResult.lastInsertRowid);
  updateSubscriptionPaymentRefs(params.ownerType, params.subscriptionId, orderId, paymentId);
  return { orderId, paymentId };
}

function getPaymentById(paymentId: number): SqlRow | undefined {
  return db.prepare(`SELECT * FROM payments WHERE id = ? LIMIT 1`).get(paymentId) as SqlRow | undefined;
}

function getPaymentForOrder(orderId: number): SqlRow | undefined {
  return db.prepare(`
    SELECT * FROM payments WHERE payment_order_id = ? ORDER BY id DESC LIMIT 1
  `).get(orderId) as SqlRow | undefined;
}

function getOrderByProviderId(providerOrderId: string): SqlRow | undefined {
  return db.prepare(`
    SELECT * FROM payment_orders WHERE provider_order_id = ? LIMIT 1
  `).get(providerOrderId) as SqlRow | undefined;
}

function getSubscriptionForPayment(payment: SqlRow): { ownerType: OwnerType; subscription: SqlRow } | null {
  for (const [ownerType, field] of [
    ["pandit", "pandit_subscription_id"],
    ["temple", "temple_subscription_id"],
    ["ashram", "ashram_subscription_id"],
  ] as Array<[OwnerType, string]>) {
    const subscriptionId = positiveId(payment[field]);
    if (!subscriptionId) continue;
    const subscription = getSubscription(subscriptionId, ownerType);
    if (subscription) return { ownerType, subscription };
  }

  const legacySubscriptionId = positiveId(payment.subscription_id);
  if (legacySubscriptionId) {
    const subscription = getSubscription(legacySubscriptionId, "pandit");
    if (subscription) return { ownerType: "pandit", subscription };
  }

  return null;
}

function paymentOwner(payment: SqlRow): { ownerType: OwnerType; ownerId: number } | null {
  const candidates: Array<[OwnerType, string]> = [
    ["pandit", "pandit_id"],
    ["temple", "temple_id"],
    ["ashram", "ashram_id"],
  ];
  for (const [ownerType, field] of candidates) {
    const ownerId = positiveId(payment[field]);
    if (ownerId) return { ownerType, ownerId };
  }
  return null;
}

function ownsPayment(user: AuthenticatedUser, payment: SqlRow): boolean {
  if (user.role === "super_admin" || user.role === "sales") return true;
  const owner = paymentOwner(payment);
  if (!owner) return false;
  return canAccessOwner(user, owner.ownerType, owner.ownerId);
}

function snapshotOf(row: SqlRow): Record<string, unknown> {
  try {
    return jsonObject(JSON.parse(String(row.plan_snapshot_json ?? "{}")));
  } catch {
    return {};
  }
}

function durationFromSubscription(row: SqlRow): number {
  const snapshot = snapshotOf(row);
  const value = positiveInt(snapshot.durationDays, positiveInt(row.duration_days, 30));
  return Math.min(Math.max(value, 1), 3650);
}

function ownerName(ownerType: OwnerType, ownerId: number): string {
  if (ownerType === "pandit") {
    const row = db.prepare(`SELECT display_name FROM pandit_profiles WHERE id = ? LIMIT 1`).get(ownerId) as { display_name?: string } | undefined;
    return text(row?.display_name, 200) || `Pandit #${ownerId}`;
  }
  if (ownerType === "temple") {
    const row = db.prepare(`SELECT name FROM temples WHERE id = ? LIMIT 1`).get(ownerId) as { name?: string } | undefined;
    return text(row?.name, 200) || `Temple #${ownerId}`;
  }
  const row = db.prepare(`SELECT name FROM ashrams WHERE id = ? LIMIT 1`).get(ownerId) as { name?: string } | undefined;
  return text(row?.name, 200) || `Ashram #${ownerId}`;
}

function syncPanditListing(panditId: number, enabled: boolean): void {
  if (!tableExists("pandit_profiles")) return;
  db.prepare(`
    UPDATE pandit_profiles
    SET listing_active = CASE
      WHEN profile_status = 'approved'
       AND verification_status = 'verified'
       AND identity_verified = 1
       AND authorized_contact = 1
       AND ? = 1
      THEN 1 ELSE 0 END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enabled ? 1 : 0, panditId);
}

function serializePayment(payment: SqlRow | undefined): Record<string, unknown> | null {
  if (!payment) return null;
  return {
    id: positiveId(payment.id),
    paymentNumber: payment.payment_number ?? null,
    ownerType: payment.entity_type ?? null,
    ownerId: positiveId(payment.entity_id),
    planId: positiveId(payment.plan_id),
    priceVariantId: positiveId(payment.subscription_plan_price_id),
    subscriptionId:
      positiveId(payment.pandit_subscription_id) ??
      positiveId(payment.temple_subscription_id) ??
      positiveId(payment.ashram_subscription_id) ??
      positiveId(payment.subscription_id),
    paymentOrderId: positiveId(payment.payment_order_id),
    amount: Number(payment.amount ?? 0),
    amountPaise: Number(payment.amount_paise ?? 0),
    currency: text(payment.currency, 10).toUpperCase(),
    provider: text(payment.provider, 30),
    providerOrderId: payment.provider_order_id ?? null,
    providerPaymentId: payment.provider_payment_id ?? null,
    status: payment.status ?? null,
    paymentMethod: payment.payment_method ?? null,
    paidAt: payment.paid_at ?? null,
    failedAt: payment.failed_at ?? null,
    failureReason: payment.failure_reason ?? null,
    refundAmountPaise: Number(payment.refund_amount_paise ?? 0),
    refundedAt: payment.refunded_at ?? null,
    receipt: payment.receipt ?? null,
    metadata: (() => {
      try { return jsonObject(JSON.parse(String(payment.metadata_json ?? "{}"))); }
      catch { return {}; }
    })(),
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
  };
}

function serializeSubscription(
  ownerType: OwnerType,
  row: SqlRow | undefined,
): Record<string, unknown> | null {
  if (!row) return null;
  const snapshot = snapshotOf(row);
  const leadLimit = Number(row.lead_limit ?? snapshot.leadLimit ?? 0);
  const leadsUsed = Number(row.leads_used ?? 0);
  return {
    id: positiveId(row.id),
    ownerType,
    ownerId: positiveId(row[ownerColumn(ownerType)]),
    managerUserId: positiveId(row.manager_user_id),
    planId: positiveId(row.plan_id),
    priceVariantId: positiveId(row.subscription_plan_price_id) ?? positiveId(snapshot.priceVariantId),
    planCode: snapshot.planCode ?? snapshot.code ?? null,
    planName: snapshot.name ?? null,
    planPriceAmount: Number(row.price_amount ?? snapshot.priceAmount ?? 0),
    planCurrency: text(row.currency ?? snapshot.currency, 10).toUpperCase() || "INR",
    status: row.status ?? null,
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    leadLimit,
    leadsUsed,
    leadsRemaining: Math.max(0, leadLimit - leadsUsed),
    autoRenew: Boolean(row.auto_renew),
    listingEnabled: Boolean(row.listing_enabled ?? snapshot.listingEnabled),
    featuredListing: Boolean(row.featured_listing ?? snapshot.featuredListing),
    prioritySupport: Boolean(row.priority_support ?? snapshot.prioritySupport),
    verificationBadge: Boolean(row.verification_badge ?? snapshot.verificationBadge),
    analyticsAccess: Boolean(row.analytics_access ?? snapshot.analyticsAccess),
    homepagePromotion: Boolean(row.homepage_promotion ?? snapshot.homepagePromotion),
    liveAartiEnabled: Boolean(row.live_aarti_enabled ?? snapshot.liveAartiEnabled),
    enhancedSeo: Boolean(row.enhanced_seo ?? snapshot.enhancedSeo),
    enhancedProfile: Boolean(row.enhanced_profile ?? snapshot.enhancedProfile),
    whatsappEnquiry: Boolean(row.whatsapp_enquiry ?? snapshot.whatsappEnquiry),
    searchVisibility: row.search_visibility ?? snapshot.searchVisibility ?? "standard",
    analyticsLevel: row.analytics_level ?? snapshot.analyticsLevel ?? "none",
    paymentOrderId: positiveId(row.payment_order_id),
    paymentId: positiveId(row.payment_id),
    razorpaySubscriptionId: row.razorpay_subscription_id ?? null,
    planSnapshot: snapshot,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function markPaymentStatus(params: {
  paymentId: number;
  orderId: number;
  status: string;
  providerPaymentId?: string | null;
  signature?: string | null;
  method?: string | null;
  failureReason?: string | null;
}): void {
  const rawStatus = text(params.status, 50).toLowerCase();
  const status = TERMINAL_PAYMENT_STATUSES.has(rawStatus) ? rawStatus : "pending";

  db.prepare(`
    UPDATE payments
    SET provider_payment_id = COALESCE(?, provider_payment_id),
        provider_signature = COALESCE(?, provider_signature),
        status = ?,
        payment_method = COALESCE(?, payment_method),
        paid_at = CASE WHEN ? = 1 THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
        failed_at = CASE WHEN ? = 1 THEN COALESCE(failed_at, CURRENT_TIMESTAMP) ELSE failed_at END,
        failure_reason = CASE WHEN ? = 1 THEN ? ELSE failure_reason END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    params.providerPaymentId ?? null,
    params.signature ?? null,
    status,
    params.method ?? null,
    SUCCESS_PAYMENT_STATUSES.has(status) ? 1 : 0,
    status === "failed" ? 1 : 0,
    status === "failed" ? 1 : 0,
    status === "failed" ? params.failureReason ?? null : null,
    params.paymentId,
  );

  const orderStatus = SUCCESS_PAYMENT_STATUSES.has(status)
    ? "paid"
    : status === "failed"
      ? "failed"
      : status === "cancelled"
        ? "cancelled"
        : "attempted";

  db.prepare(`
    UPDATE payment_orders
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(orderStatus, params.orderId);
}

function validatePaymentIdentity(
  payment: SqlRow,
  order: SqlRow,
  providerPaymentId: string,
  remoteAmount: number,
  remoteCurrency: string,
): { ownerType: OwnerType; subscriptionId: number } {
  const providerOrderId = text(payment.provider_order_id ?? order.provider_order_id, 150);
  const orderProviderOrderId = text(order.provider_order_id, 150);
  if (!providerOrderId || !orderProviderOrderId || providerOrderId !== orderProviderOrderId) {
    throw new Error("Payment order mismatch.");
  }

  const expectedAmount = Number(payment.amount_paise ?? order.amount_paise ?? 0);
  const expectedCurrency = text(payment.currency ?? order.currency, 10).toUpperCase();
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
    throw new Error("Trusted payment amount is invalid.");
  }
  if (remoteAmount !== expectedAmount || remoteCurrency !== expectedCurrency) {
    throw new Error("Payment amount or currency does not match the trusted order.");
  }

  const duplicateProviderPayment = db.prepare(`
    SELECT id
    FROM payments
    WHERE provider = 'razorpay'
      AND provider_payment_id = ?
      AND id <> ?
    LIMIT 1
  `).get(providerPaymentId, payment.id) as { id?: number } | undefined;
  if (duplicateProviderPayment) {
    throw new Error("This Razorpay payment is already linked to another payment record.");
  }

  const subscriptionRef = getSubscriptionForPayment(payment);
  if (!subscriptionRef) throw new Error("Payment subscription could not be resolved.");

  return {
    ownerType: subscriptionRef.ownerType,
    subscriptionId: Number(subscriptionRef.subscription.id),
  };
}

function activatePaidSubscription(params: {
  ownerType: OwnerType;
  subscriptionId: number;
  paymentOrderId: number;
  paymentId: number;
  userId: number;
}): Record<string, unknown> {
  const table = subscriptionTable(params.ownerType);
  const current = getSubscription(params.subscriptionId, params.ownerType);
  if (!current) throw new Error("Subscription record could not be found.");

  if (current.status === "active") {
    if (positiveId(current.payment_id) === params.paymentId) {
      return serializeSubscription(params.ownerType, current) ?? {};
    }
    throw new Error("This subscription is already active with another payment.");
  }

  if (current.status === "cancelled" || current.status === "expired") {
    throw new Error("This subscription is no longer eligible for activation.");
  }

  const payment = getPaymentById(params.paymentId);
  if (!payment) throw new Error("Payment ledger record could not be found.");

  const ownerId = positiveId(current[ownerColumn(params.ownerType)]);
  if (!ownerId) throw new Error("Subscription owner could not be resolved.");

  const otherActive = getActiveSubscription(params.ownerType, ownerId);
  if (otherActive && Number(otherActive.id) !== params.subscriptionId) {
    db.prepare(`
      UPDATE ${table}
      SET status = 'expired', auto_renew = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'active'
    `).run(otherActive.id);

    createSubscriptionEvent({
      ownerType: params.ownerType,
      subscriptionId: Number(otherActive.id),
      userId: params.userId,
      eventType: "replaced_for_upgrade",
      oldStatus: "active",
      newStatus: "expired",
      oldExpiresAt: nullable(otherActive.expires_at, 80),
      newExpiresAt: nullable(otherActive.expires_at, 80),
      paymentOrderId: params.paymentOrderId,
      paymentId: params.paymentId,
      notes: "Existing active subscription replaced after successful paid purchase.",
      metadata: { replacementSubscriptionId: params.subscriptionId },
    });

    if (params.ownerType === "pandit") syncPanditListing(ownerId, false);
  }

  const snapshot = snapshotOf(current);
  const startsAt = nowIso();
  const expiresAt = addDaysIso(durationFromSubscription(current));

  const setParts = [
    "status = 'active'",
    "starts_at = ?",
    "expires_at = ?",
    "payment_order_id = ?",
    "payment_id = ?",
    ...(columnExists(table, "subscription_plan_price_id") ? ["subscription_plan_price_id = ?"] : []),
    ...(columnExists(table, "billing_interval") ? ["billing_interval = ?"] : []),
    ...(columnExists(table, "duration_days") ? ["duration_days = ?"] : []),
    "price_amount = ?",
    "currency = ?",
    "lead_limit = ?",
    "service_limit = ?",
    "service_area_limit = ?",
    "gallery_limit = ?",
    "video_limit = ?",
    "program_limit = ?",
    "listing_enabled = ?",
    "featured_listing = ?",
    "priority_support = ?",
    "verification_badge = ?",
    "analytics_access = ?",
    "homepage_promotion = ?",
    "live_aarti_enabled = ?",
    "enhanced_seo = ?",
    "enhanced_profile = ?",
    "whatsapp_enquiry = ?",
    "search_visibility = ?",
    "analytics_level = ?",
    "updated_at = CURRENT_TIMESTAMP",
  ];

  db.prepare(`
    UPDATE ${table}
    SET ${setParts.join(", ")}
    WHERE id = ?
  `).run(
    startsAt,
    expiresAt,
    params.paymentOrderId,
    params.paymentId,
    ...(columnExists(table, "subscription_plan_price_id")
      ? [Number(current.subscription_plan_price_id ?? snapshot.priceVariantId ?? 0) || null]
      : []),
    ...(columnExists(table, "billing_interval")
      ? [text(snapshot.billingInterval ?? current.billing_interval, 30) || "monthly"]
      : []),
    ...(columnExists(table, "duration_days")
      ? [positiveInt(snapshot.durationDays, Number(current.duration_days ?? 30))]
      : []),
    Number(snapshot.priceAmount ?? current.price_amount ?? 0),
    text(snapshot.currency ?? current.currency, 10).toUpperCase() || "INR",
    positiveInt(snapshot.leadLimit, Number(current.lead_limit ?? 0)),
    positiveInt(snapshot.serviceLimit, Number(current.service_limit ?? 0)),
    positiveInt(snapshot.serviceAreaLimit, Number(current.service_area_limit ?? 0)),
    positiveInt(snapshot.galleryLimit, Number(current.gallery_limit ?? 0)),
    positiveInt(snapshot.videoLimit, Number(current.video_limit ?? 0)),
    positiveInt(snapshot.programLimit, Number(current.program_limit ?? 0)),
    booleanValue(snapshot.listingEnabled, Boolean(current.listing_enabled)) ? 1 : 0,
    booleanValue(snapshot.featuredListing, Boolean(current.featured_listing)) ? 1 : 0,
    booleanValue(snapshot.prioritySupport, Boolean(current.priority_support)) ? 1 : 0,
    booleanValue(snapshot.verificationBadge, Boolean(current.verification_badge)) ? 1 : 0,
    booleanValue(snapshot.analyticsAccess, Boolean(current.analytics_access)) ? 1 : 0,
    booleanValue(snapshot.homepagePromotion, Boolean(current.homepage_promotion)) ? 1 : 0,
    booleanValue(snapshot.liveAartiEnabled, Boolean(current.live_aarti_enabled)) ? 1 : 0,
    booleanValue(snapshot.enhancedSeo, Boolean(current.enhanced_seo)) ? 1 : 0,
    booleanValue(snapshot.enhancedProfile, Boolean(current.enhanced_profile)) ? 1 : 0,
    booleanValue(snapshot.whatsappEnquiry, Boolean(current.whatsapp_enquiry)) ? 1 : 0,
    text(snapshot.searchVisibility ?? current.search_visibility, 30) || "standard",
    text(snapshot.analyticsLevel ?? current.analytics_level, 30) || "none",
    params.subscriptionId,
  );

  const updated = getSubscription(params.subscriptionId, params.ownerType);
  createSubscriptionEvent({
    ownerType: params.ownerType,
    subscriptionId: params.subscriptionId,
    userId: params.userId,
    eventType: "activated",
    oldStatus: text(current.status, 50),
    newStatus: "active",
    oldExpiresAt: nullable(current.expires_at, 80),
    newExpiresAt: expiresAt,
    paymentOrderId: params.paymentOrderId,
    paymentId: params.paymentId,
    notes: "Subscription activated after trusted Razorpay payment verification.",
    metadata: {
      planId: current.plan_id,
      planCode: snapshot.planCode ?? snapshot.code ?? null,
      priceVariantId: current.subscription_plan_price_id ?? snapshot.priceVariantId ?? null,
    },
  });

  if (params.ownerType === "pandit") {
    syncPanditListing(
      ownerId,
      booleanValue(snapshot.listingEnabled, Boolean(current.listing_enabled)),
    );
  }

  return serializeSubscription(params.ownerType, updated) ?? {};
}

function completeVerifiedPayment(params: {
  order: SqlRow;
  payment: SqlRow;
  razorpayPaymentId: string;
  signature: string;
  method: string | null;
  remoteAmount: number;
  remoteCurrency: string;
  userId: number;
}): {
  ownerType: OwnerType;
  subscriptionId: number;
  subscription: Record<string, unknown>;
} {
  const paymentId = positiveId(params.payment.id);
  const orderId = positiveId(params.order.id);
  if (!paymentId || !orderId) throw new Error("Payment ledger identifiers are invalid.");

  const identity = validatePaymentIdentity(
    params.payment,
    params.order,
    params.razorpayPaymentId,
    params.remoteAmount,
    params.remoteCurrency,
  );

  return db.transaction(() => {
    const payment = getPaymentById(paymentId);
    if (!payment) throw new Error("Payment record could not be reloaded.");

    const existingStatus = text(payment.status, 50).toLowerCase();
    if (
      SUCCESS_PAYMENT_STATUSES.has(existingStatus) &&
      text(payment.provider_payment_id, 150) === params.razorpayPaymentId
    ) {
      const sub = getSubscription(identity.subscriptionId, identity.ownerType);
      return {
        ownerType: identity.ownerType,
        subscriptionId: identity.subscriptionId,
        subscription: serializeSubscription(identity.ownerType, sub) ?? {},
      };
    }

    markPaymentStatus({
      paymentId,
      orderId,
      status: "captured",
      providerPaymentId: params.razorpayPaymentId,
      signature: params.signature,
      method: params.method,
    });

    const subscription = activatePaidSubscription({
      ownerType: identity.ownerType,
      subscriptionId: identity.subscriptionId,
      paymentOrderId: orderId,
      paymentId,
      userId: params.userId,
    });

    audit(null, params.userId, "payment.verified", "payment", paymentId, payment, {
      providerPaymentId: params.razorpayPaymentId,
      providerOrderId: params.order.provider_order_id,
      ownerType: identity.ownerType,
      subscriptionId: identity.subscriptionId,
    });

    return {
      ownerType: identity.ownerType,
      subscriptionId: identity.subscriptionId,
      subscription,
    };
  })();
}

function handleFailedPayment(params: {
  payment: SqlRow;
  order: SqlRow;
  providerPaymentId?: string | null;
  signature?: string | null;
  method?: string | null;
  reason: string;
  userId: number | null;
}): void {
  const paymentId = positiveId(params.payment.id);
  const orderId = positiveId(params.order.id);
  if (!paymentId || !orderId) return;

  db.transaction(() => {
    markPaymentStatus({
      paymentId,
      orderId,
      status: "failed",
      providerPaymentId: params.providerPaymentId ?? null,
      signature: params.signature ?? null,
      method: params.method ?? null,
      failureReason: text(params.reason, 1000),
    });

    const subscriptionRef = getSubscriptionForPayment(params.payment);
    if (!subscriptionRef) return;

    const current = subscriptionRef.subscription;
    if (ACTIVE_SUBSCRIPTION_STATUSES.has(text(current.status, 50))) return;

    db.prepare(`
      UPDATE ${subscriptionTable(subscriptionRef.ownerType)}
      SET status = 'payment_failed',
          payment_order_id = ?,
          payment_id = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('pending','paused','payment_failed')
    `).run(
      orderId,
      paymentId,
      text(params.reason, 1000),
      current.id,
    );

    createSubscriptionEvent({
      ownerType: subscriptionRef.ownerType,
      subscriptionId: Number(current.id),
      userId: params.userId,
      eventType: "payment_failed",
      oldStatus: text(current.status, 50),
      newStatus: "payment_failed",
      oldExpiresAt: nullable(current.expires_at, 80),
      newExpiresAt: nullable(current.expires_at, 80),
      paymentOrderId: orderId,
      paymentId,
      notes: text(params.reason, 1000),
    });

    if (subscriptionRef.ownerType === "pandit") {
      syncPanditListing(Number(current.pandit_id), false);
    }
  })();
}

function checkoutResponse(
  user: AuthenticatedUser,
  order: SqlRow,
  payment: SqlRow,
  subscriptionId: number,
): Record<string, unknown> {
  const config = getRazorpayConfig();
  return {
    success: true,
    ownerType: payment.entity_type ?? null,
    ownerId: positiveId(payment.entity_id),
    subscriptionId,
    paymentId: positiveId(payment.id),
    paymentOrderId: positiveId(order.id),
    paymentTransactionId: positiveId(payment.id),
    order: {
      id: text(order.provider_order_id, 150),
      amount: Number(order.amount_paise),
      amountPaise: Number(order.amount_paise),
      amountRupees: Number(order.amount),
      currency: text(order.currency, 10).toUpperCase(),
      receipt: text(order.receipt, 200),
      status: text(order.status, 50),
    },
    checkout: {
      keyId: config.keyId,
      name: config.companyName,
      currency: text(order.currency, 10).toUpperCase(),
      amountPaise: Number(order.amount_paise),
      orderId: text(order.provider_order_id, 150),
      prefill: {
        name: user.name,
        email: user.email,
        contact: user.phone ?? undefined,
      },
    },
    payment: serializePayment(payment),
  };
}

/* -------------------------------------------------------------------------- */
/* Health / config / plans                                                     */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  try {
    const config = getRazorpayConfig();
    const missing = paymentTablesReady();
    const configured = Boolean(config.keyId && config.keySecret);
    const healthy = missing.length === 0 && configured && providerName() === "razorpay";
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      service: "divyadhara-payments",
      paymentsEnabled: paymentsEnabled(),
      database: { ready: missing.length === 0, missing },
      razorpay: {
        configured,
        webhookConfigured: Boolean(config.webhookSecret),
        mode: config.mode,
        currency: config.currency,
      },
    });
  } catch (error) {
    console.error("Payment health error:", error);
    return res.status(503).json({
      success: false,
      service: "divyadhara-payments",
      error: error instanceof Error ? error.message : "Payment health check failed.",
    });
  }
});

router.get("/config", (_req: Request, res: Response) => {
  const config = getRazorpayConfig();
  return res.json({
    success: true,
    paymentsEnabled: paymentsEnabled(),
    provider: providerName(),
    razorpay: {
      configured: Boolean(config.keyId && config.keySecret),
      mode: config.mode,
      keyId: config.keyId,
      currency: config.currency,
      companyName: config.companyName,
      callbackUrl: config.callbackUrl || null,
    },
  });
});

router.get("/plans", (req: Request, res: Response) => {
  try {
    if (!requirePaymentTables(res)) return;
    const requested = normalizeOwnerType(req.query.ownerType ?? req.query.audience);
    const audiences = requested ? [requested] : [...OWNER_TYPES];
    const byAudience: Record<string, Record<string, unknown>[]> = {};

    for (const ownerType of audiences) {
      const plans = db.prepare(`
        SELECT id, code, audience, name, description, price_amount, currency,
               billing_interval, duration_days, lead_limit,
               service_limit, service_area_limit, gallery_limit, video_limit, program_limit,
               listing_enabled, featured_listing, priority_support, verification_badge,
               analytics_access, homepage_promotion, live_aarti_enabled, enhanced_seo,
               enhanced_profile, whatsapp_enquiry, search_visibility, analytics_level,
               plan_features_json, razorpay_plan_id, is_active
        FROM subscription_plans
        WHERE audience = ? AND is_active = 1
        ORDER BY sort_order ASC, price_amount ASC, id ASC
      `).all(ownerType) as Plan[];

      byAudience[ownerType] = plans.map((plan) =>
        serializePlan(plan, activeMonthlyPriceVariant(plan.id)),
      );
    }

    return res.json({
      success: true,
      currency: getRazorpayConfig().currency,
      billing: "monthly",
      durationDays: 30,
      plans: audiences.flatMap((ownerType) => byAudience[ownerType] ?? []),
      byAudience,
      sourceOfTruth: "subscription_plans + active monthly subscription_plan_prices",
    });
  } catch (error) {
    console.error("Payment plans error:", error);
    return res.status(500).json({ success: false, error: "Unable to load payment plans." });
  }
});

/* -------------------------------------------------------------------------- */
/* Create Razorpay Order                                                      */
/* -------------------------------------------------------------------------- */

router.post("/create-order", async (req: Request, res: Response) => {
  try {
    if (!requirePaymentTables(res)) return;
    if (!paymentsEnabled()) {
      return res.status(503).json({ success: false, error: "Payments are currently disabled.", code: "PAYMENTS_DISABLED" });
    }

    const user = currentUser(res);
    const body = bodyOf(req);
    const ownerType = normalizeOwnerType(body.ownerType ?? body.audience);
    const planId = positiveId(body.planId);
    const requestedOwnerId = positiveId(
      body.ownerId ?? body.panditId ?? body.templeId ?? body.ashramId,
    );

    if (!ownerType || !planId) {
      return res.status(400).json({ success: false, error: "Valid ownerType and planId are required." });
    }

    const owner = resolvePurchaseOwner(user, ownerType, requestedOwnerId);
    if (!owner) {
      return res.status(403).json({
        success: false,
        error: "This account is not authorised to purchase the selected business subscription.",
        code: "SUBSCRIPTION_OWNER_FORBIDDEN",
      });
    }

    const commercial = trustedCommercialPlan(planId, ownerType);
    if (!commercial) {
      return res.status(409).json({
        success: false,
        error: "Selected subscription plan does not have a valid active monthly INR price variant.",
        code: "PLAN_PRICE_UNAVAILABLE",
      });
    }

    const idempotencyKey = nullable(
      req.get("Idempotency-Key") ?? body.idempotencyKey,
      200,
    );

    if (idempotencyKey) {
      const existingPayment = db.prepare(`
        SELECT *
        FROM payments
        WHERE idempotency_key = ? AND user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(idempotencyKey, user.id) as SqlRow | undefined;

      if (existingPayment?.payment_order_id) {
        const existingOrder = db.prepare(`
          SELECT * FROM payment_orders WHERE id = ? LIMIT 1
        `).get(existingPayment.payment_order_id) as SqlRow | undefined;

        if (existingOrder) {
          const existingOwnerType = normalizeOwnerType(existingPayment.entity_type);
          const existingOwnerId = positiveId(existingPayment.entity_id);
          const existingPlanId = positiveId(existingPayment.plan_id);
          if (
            existingOwnerType !== ownerType ||
            existingOwnerId !== owner.ownerId ||
            existingPlanId !== planId
          ) {
            return res.status(409).json({
              success: false,
              error: "This Idempotency-Key has already been used for another payment request.",
              code: "PAYMENT_IDEMPOTENCY_CONFLICT",
            });
          }

          const existingSubscriptionId =
            positiveId(existingPayment.pandit_subscription_id) ??
            positiveId(existingPayment.temple_subscription_id) ??
            positiveId(existingPayment.ashram_subscription_id) ??
            positiveId(existingPayment.subscription_id);

          if (["created", "attempted", "paid"].includes(text(existingOrder.status, 30).toLowerCase())) {
            return res.status(200).json(
              checkoutResponse(user, existingOrder, existingPayment, existingSubscriptionId ?? 0),
            );
          }
        }
      }
    }

    const gateway = getRazorpayConfig();
    const localCurrency = text(commercial.price.currency, 10).toUpperCase();
    const gatewayCurrency = text(gateway.currency, 10).toUpperCase();
    const amount = Number(commercial.price.price_amount);
    const amountPaise = amount * 100;

    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(amountPaise)) {
      return res.status(409).json({ success: false, error: "Subscription amount is invalid.", code: "INVALID_PLAN_AMOUNT" });
    }
    if (localCurrency !== gatewayCurrency) {
      return res.status(409).json({
        success: false,
        error: `Plan currency ${localCurrency} does not match configured gateway currency ${gatewayCurrency}.`,
        code: "PAYMENT_CURRENCY_MISMATCH",
      });
    }
    if (!gateway.keyId || !gateway.keySecret) {
      return res.status(503).json({ success: false, error: "Razorpay is not configured.", code: "RAZORPAY_NOT_CONFIGURED" });
    }

    const pending = ensurePendingSubscription(
      ownerType,
      owner.ownerId,
      owner.userId,
      commercial.plan,
      commercial.price,
    );

    if (pending.reused) {
      const subscription = getSubscription(pending.id, ownerType);
      const oldOrderId = positiveId(subscription?.payment_order_id);
      if (oldOrderId) {
        const oldOrder = db.prepare(`
          SELECT * FROM payment_orders WHERE id = ? LIMIT 1
        `).get(oldOrderId) as SqlRow | undefined;
        const oldPayment = getPaymentForOrder(oldOrderId);
        if (
          oldOrder &&
          oldPayment &&
          ["created", "attempted"].includes(text(oldOrder.status, 30).toLowerCase())
        ) {
          return res.status(200).json({
            ...checkoutResponse(user, oldOrder, oldPayment, pending.id),
            reused: true,
          });
        }
      }
    }

    const receipt = `DD-${ownerType}-${owner.ownerId}-${Date.now()}`.slice(0, 40);
    const razorpayOrder = await createRazorpayOrder({
      amountPaise,
      currency: localCurrency,
      receipt,
      notes: {
        app: "DivyaDhara",
        owner_type: ownerType,
        owner_id: String(owner.ownerId),
        subscription_id: String(pending.id),
        plan_id: String(commercial.plan.id),
        price_variant_id: String(commercial.price.id),
      },
    });

    if (
      Number(razorpayOrder.amount) !== amountPaise ||
      text(razorpayOrder.currency, 10).toUpperCase() !== localCurrency ||
      !text(razorpayOrder.id, 150)
    ) {
      throw new Error("Razorpay returned an invalid order that does not match the trusted local checkout.");
    }

    const ledger = db.transaction(() => {
      const subscription = getSubscription(pending.id, ownerType);
      if (!subscription) throw new Error("Pending subscription could not be reloaded.");

      const created = createPaymentLedger({
        userId: user.id,
        ownerType,
        ownerId: owner.ownerId,
        plan: commercial.plan,
        price: commercial.price,
        subscriptionId: pending.id,
        providerOrderId: text(razorpayOrder.id, 150),
        receipt,
        amount,
        amountPaise,
        currency: localCurrency,
        idempotencyKey,
        extraMetadata: {
          checkout: "razorpay_order",
        },
      });

      createSubscriptionEvent({
        ownerType,
        subscriptionId: pending.id,
        userId: user.id,
        eventType: "payment_order_created",
        oldStatus: text(subscription.status, 50),
        newStatus: "pending",
        paymentOrderId: created.orderId,
        paymentId: created.paymentId,
        notes: "Razorpay order created for subscription checkout.",
        metadata: {
          providerOrderId: razorpayOrder.id,
          planId: commercial.plan.id,
          priceVariantId: commercial.price.id,
          amountPaise,
        },
      });

      audit(req, user.id, "payment.order_created", "payment_order", created.orderId, null, {
        ownerType,
        ownerId: owner.ownerId,
        subscriptionId: pending.id,
        paymentId: created.paymentId,
        providerOrderId: razorpayOrder.id,
        planId: commercial.plan.id,
        priceVariantId: commercial.price.id,
        amount,
        currency: localCurrency,
      });

      return created;
    })();

    const order = db.prepare(`SELECT * FROM payment_orders WHERE id = ? LIMIT 1`).get(ledger.orderId) as SqlRow;
    const payment = getPaymentById(ledger.paymentId) as SqlRow;

    notifyUser(
      user.id,
      "Payment checkout ready",
      `Your ${commercial.plan.name} subscription checkout is ready for payment.`,
      "/dashboard/subscription",
      {
        ownerType,
        ownerId: owner.ownerId,
        subscriptionId: pending.id,
        paymentId: ledger.paymentId,
      },
    );

    return res.status(201).json(checkoutResponse(user, order, payment, pending.id));
  } catch (error) {
    console.error("Create Razorpay order error:", error);
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to create payment order.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Verify Razorpay Payment                                                    */
/* -------------------------------------------------------------------------- */

router.post("/verify", async (req: Request, res: Response) => {
  try {
    if (!requirePaymentTables(res)) return;
    const user = currentUser(res);
    const body = bodyOf(req);

    const providerOrderId = text(body.razorpayOrderId ?? body.razorpay_order_id, 150);
    const providerPaymentId = text(body.razorpayPaymentId ?? body.razorpay_payment_id, 150);
    const signature = text(body.razorpaySignature ?? body.razorpay_signature, 300);

    if (!providerOrderId || !providerPaymentId || !signature) {
      return res.status(400).json({
        success: false,
        error: "Razorpay order id, payment id and signature are required.",
      });
    }

    const order = getOrderByProviderId(providerOrderId);
    if (!order) return res.status(404).json({ success: false, error: "Payment order could not be found." });

    const orderId = positiveId(order.id);
    if (!orderId) return res.status(500).json({ success: false, error: "Payment order identifier is invalid." });

    const payment = getPaymentForOrder(orderId);
    if (!payment) return res.status(404).json({ success: false, error: "Payment ledger could not be found." });

    if (!ownsPayment(user, payment)) {
      return res.status(403).json({ success: false, error: "You are not authorised to verify this payment." });
    }

    if (text(payment.provider_order_id, 150) !== providerOrderId) {
      return res.status(409).json({ success: false, error: "Payment order mismatch." });
    }

    const config = getRazorpayConfig();
    if (!verifyPaymentSignature(providerOrderId, providerPaymentId, signature, config.keySecret)) {
      return res.status(400).json({ success: false, error: "Payment signature verification failed.", code: "PAYMENT_SIGNATURE_INVALID" });
    }

    const currentStatus = text(payment.status, 50).toLowerCase();
    if (
      SUCCESS_PAYMENT_STATUSES.has(currentStatus) &&
      text(payment.provider_payment_id, 150) === providerPaymentId
    ) {
      const subscriptionRef = getSubscriptionForPayment(payment);
      const subscription = subscriptionRef
        ? serializeSubscription(subscriptionRef.ownerType, subscriptionRef.subscription)
        : null;
      return res.json({
        success: true,
        message: "Payment was already verified.",
        ownerType: subscriptionRef?.ownerType ?? null,
        ownerId: subscriptionRef ? positiveId(subscriptionRef.subscription[ownerColumn(subscriptionRef.ownerType)]) : null,
        subscriptionId: subscriptionRef ? Number(subscriptionRef.subscription.id) : null,
        paymentId: Number(payment.id),
        paymentOrderId: orderId,
        paymentTransactionId: Number(payment.id),
        orderId: providerOrderId,
        status: currentStatus,
        subscription,
        payment: serializePayment(payment),
      });
    }

    const remote = await fetchRazorpayPayment(providerPaymentId);
    if (text(remote.order_id, 150) !== providerOrderId) {
      return res.status(409).json({ success: false, error: "Razorpay payment does not belong to the trusted order." });
    }

    const expectedAmount = Number(payment.amount_paise ?? order.amount_paise ?? 0);
    const expectedCurrency = text(payment.currency ?? order.currency, 10).toUpperCase();
    const remoteAmount = Number(remote.amount ?? 0);
    const remoteCurrency = text(remote.currency, 10).toUpperCase();

    if (
      remoteAmount !== expectedAmount ||
      remoteCurrency !== expectedCurrency
    ) {
      markPaymentStatus({
        paymentId: Number(payment.id),
        orderId,
        status: "failed",
        providerPaymentId,
        signature,
        method: remote.method ?? null,
        failureReason: "Gateway payment amount/currency did not match the trusted local order.",
      });
      return res.status(409).json({
        success: false,
        error: "Payment amount or currency verification mismatch.",
        code: "PAYMENT_AMOUNT_MISMATCH",
      });
    }

    let finalRemote = remote;
    const gatewayStatus = text(remote.status, 40).toLowerCase();

    if (gatewayStatus === "authorized" && remote.captured !== true) {
      finalRemote = await captureRazorpayPayment(providerPaymentId, expectedAmount, expectedCurrency);
    }

    const finalStatus =
      finalRemote.captured === true ||
      text(finalRemote.status, 40).toLowerCase() === "captured"
        ? "captured"
        : text(finalRemote.status, 40).toLowerCase() === "failed"
          ? "failed"
          : text(finalRemote.status, 40).toLowerCase() === "authorized"
            ? "authorized"
            : "pending";

    if (finalStatus === "failed") {
      handleFailedPayment({
        payment,
        order,
        providerPaymentId,
        signature,
        method: finalRemote.method ?? null,
        reason: finalRemote.error_description || "Razorpay reported payment failure.",
        userId: user.id,
      });

      return res.json({
        success: false,
        message: "Payment failed.",
        status: "failed",
        payment: serializePayment(getPaymentById(Number(payment.id))),
      });
    }

    if (!SUCCESS_PAYMENT_STATUSES.has(finalStatus)) {
      markPaymentStatus({
        paymentId: Number(payment.id),
        orderId,
        status: finalStatus,
        providerPaymentId,
        signature,
        method: finalRemote.method ?? null,
      });

      return res.json({
        success: false,
        message: `Payment is currently ${finalStatus}.`,
        status: finalStatus,
        payment: serializePayment(getPaymentById(Number(payment.id))),
      });
    }

    const result = completeVerifiedPayment({
      order,
      payment,
      razorpayPaymentId: providerPaymentId,
      signature,
      method: finalRemote.method ?? null,
      remoteAmount: Number(finalRemote.amount ?? expectedAmount),
      remoteCurrency: text(finalRemote.currency ?? expectedCurrency, 10).toUpperCase(),
      userId: user.id,
    });

    const updatedPayment = getPaymentById(Number(payment.id));
    notifyUser(
      user.id,
      "Subscription activated",
      `Your ${String(result.subscription.planName ?? "subscription")} is now active.`,
      "/dashboard/subscription",
      {
        ownerType: result.ownerType,
        subscriptionId: result.subscriptionId,
        paymentId: Number(payment.id),
      },
    );

    return res.json({
      success: true,
      message: "Payment verified and subscription activated.",
      ownerType: result.ownerType,
      ownerId: positiveId(result.subscription.ownerId),
      subscriptionId: result.subscriptionId,
      paymentId: Number(payment.id),
      paymentOrderId: orderId,
      paymentTransactionId: Number(payment.id),
      orderId: providerOrderId,
      status: "captured",
      startsAt: result.subscription.startsAt ?? null,
      endsAt: result.subscription.expiresAt ?? null,
      subscription: result.subscription,
      payment: serializePayment(updatedPayment),
      order: db.prepare(`SELECT * FROM payment_orders WHERE id = ? LIMIT 1`).get(orderId),
    });
  } catch (error) {
    console.error("Verify Razorpay payment error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to verify the payment.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Subscription history / transactions                                       */
/* -------------------------------------------------------------------------- */

router.get("/subscriptions", (req: Request, res: Response) => {
  try {
    if (!requirePaymentTables(res)) return;
    const user = currentUser(res);
    const requested = normalizeOwnerType(req.query.ownerType ?? req.query.audience);
    const results: Record<string, unknown>[] = [];

    const collect = (ownerType: OwnerType, ownerId: number): void => {
      const rows = db.prepare(`
        SELECT * FROM ${subscriptionTable(ownerType)}
        WHERE ${ownerColumn(ownerType)} = ?
        ORDER BY id DESC LIMIT 100
      `).all(ownerId) as SqlRow[];
      for (const row of rows) {
        results.push(serializeSubscription(ownerType, row) as Record<string, unknown>);
      }
    };

    if (!requested || requested === "pandit") {
      const owner = getPanditOwner(user);
      if (owner) collect("pandit", owner.ownerId);
      if (user.role === "sales" || user.role === "super_admin") {
        const rows = db.prepare(`SELECT id FROM pandit_profiles ORDER BY id ASC LIMIT 100`).all() as Array<{ id: number }>;
        rows.forEach((row) => collect("pandit", row.id));
      }
    }

    if (!requested || requested === "temple") {
      if (user.role === "super_admin" || user.role === "sales") {
        const rows = db.prepare(`SELECT id FROM temples ORDER BY id ASC LIMIT 100`).all() as Array<{ id: number }>;
        rows.forEach((row) => collect("temple", row.id));
      } else if (user.role === "temple_manager") {
        const rows = db.prepare(`
          SELECT DISTINCT temple_id
          FROM temple_manager_assignments
          WHERE manager_user_id = ? AND status = 'active'
          ORDER BY temple_id ASC LIMIT 100
        `).all(user.id) as Array<{ temple_id: number }>;
        rows.forEach((row) => collect("temple", row.temple_id));
      }
    }

    if (!requested || requested === "ashram") {
      if (user.role === "super_admin" || user.role === "sales") {
        const rows = db.prepare(`SELECT id FROM ashrams ORDER BY id ASC LIMIT 100`).all() as Array<{ id: number }>;
        rows.forEach((row) => collect("ashram", row.id));
      } else if (user.role === "ashram_manager") {
        const rows = db.prepare(`
          SELECT DISTINCT ashram_id
          FROM ashram_manager_assignments
          WHERE manager_user_id = ? AND status = 'active'
          ORDER BY ashram_id ASC LIMIT 100
        `).all(user.id) as Array<{ ashram_id: number }>;
        rows.forEach((row) => collect("ashram", row.ashram_id));
      }
    }

    results.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
    return res.json({ success: true, subscriptions: results });
  } catch (error) {
    console.error("Payment subscription history error:", error);
    return res.status(500).json({ success: false, error: "Unable to load subscriptions." });
  }
});

router.get("/transactions", (req: Request, res: Response) => {
  try {
    if (!tableExists("payments")) {
      return res.status(503).json({ success: false, error: "Payments table is not available." });
    }

    const user = currentUser(res);
    const requested = normalizeOwnerType(req.query.ownerType ?? req.query.audience);
    const limit = Math.min(100, positiveInt(req.query.limit, 50));
    const results: Record<string, unknown>[] = [];

    const collect = (ownerType: OwnerType, ownerId: number): void => {
      const field = ownerType === "pandit" ? "pandit_id" : ownerType === "temple" ? "temple_id" : "ashram_id";
      const rows = db.prepare(`
        SELECT * FROM payments
        WHERE ${field} = ?
        ORDER BY id DESC LIMIT ?
      `).all(ownerId, limit) as SqlRow[];
      for (const row of rows) {
        const serialized = serializePayment(row);
        if (serialized) results.push(serialized);
      }
    };

    if (!requested || requested === "pandit") {
      const owner = getPanditOwner(user);
      if (owner) collect("pandit", owner.ownerId);
      if (user.role === "sales" || user.role === "super_admin") {
        const rows = db.prepare(`SELECT id FROM pandit_profiles ORDER BY id ASC LIMIT 100`).all() as Array<{ id: number }>;
        rows.forEach((row) => collect("pandit", row.id));
      }
    }

    if (!requested || requested === "temple") {
      if (user.role === "sales" || user.role === "super_admin") {
        const rows = db.prepare(`SELECT id FROM temples ORDER BY id ASC LIMIT 100`).all() as Array<{ id: number }>;
        rows.forEach((row) => collect("temple", row.id));
      } else if (user.role === "temple_manager") {
        const rows = db.prepare(`
          SELECT DISTINCT temple_id
          FROM temple_manager_assignments
          WHERE manager_user_id = ? AND status = 'active'
        `).all(user.id) as Array<{ temple_id: number }>;
        rows.forEach((row) => collect("temple", row.temple_id));
      }
    }

    if (!requested || requested === "ashram") {
      if (user.role === "sales" || user.role === "super_admin") {
        const rows = db.prepare(`SELECT id FROM ashrams ORDER BY id ASC LIMIT 100`).all() as Array<{ id: number }>;
        rows.forEach((row) => collect("ashram", row.id));
      } else if (user.role === "ashram_manager") {
        const rows = db.prepare(`
          SELECT DISTINCT ashram_id
          FROM ashram_manager_assignments
          WHERE manager_user_id = ? AND status = 'active'
        `).all(user.id) as Array<{ ashram_id: number }>;
        rows.forEach((row) => collect("ashram", row.ashram_id));
      }
    }

    results.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));
    const sliced = results.slice(0, limit);
    return res.json({ success: true, transactions: sliced, payments: sliced });
  } catch (error) {
    console.error("Payment transactions error:", error);
    return res.status(500).json({ success: false, error: "Unable to load payment transactions." });
  }
});

router.get("/orders/:id", (req: Request, res: Response) => {
  try {
    const orderId = positiveId(req.params.id);
    if (!orderId) return res.status(400).json({ success: false, error: "Invalid payment order id." });

    const order = db.prepare(`SELECT * FROM payment_orders WHERE id = ? LIMIT 1`).get(orderId) as SqlRow | undefined;
    if (!order) return res.status(404).json({ success: false, error: "Payment order not found." });

    const payment = getPaymentForOrder(orderId);
    if (!payment || !ownsPayment(currentUser(res), payment)) {
      return res.status(403).json({ success: false, error: "You do not have access to this payment order." });
    }

    return res.json({ success: true, order, payment: serializePayment(payment) });
  } catch (error) {
    console.error("Payment order detail error:", error);
    return res.status(500).json({ success: false, error: "Unable to load payment order." });
  }
});

router.get("/payments/:id", (req: Request, res: Response) => {
  try {
    const paymentId = positiveId(req.params.id);
    if (!paymentId) return res.status(400).json({ success: false, error: "Invalid payment id." });

    const payment = getPaymentById(paymentId);
    if (!payment) return res.status(404).json({ success: false, error: "Payment not found." });

    if (!ownsPayment(currentUser(res), payment)) {
      return res.status(403).json({ success: false, error: "You do not have access to this payment." });
    }

    const orderId = positiveId(payment.payment_order_id);
    const order = orderId
      ? db.prepare(`SELECT * FROM payment_orders WHERE id = ? LIMIT 1`).get(orderId)
      : null;

    return res.json({ success: true, payment: serializePayment(payment), order });
  } catch (error) {
    console.error("Payment detail error:", error);
    return res.status(500).json({ success: false, error: "Unable to load payment." });
  }
});

/* -------------------------------------------------------------------------- */
/* Refunds                                                                    */
/* -------------------------------------------------------------------------- */

router.post("/payments/:id/refund", requireRole("super_admin", "sales"), async (req: Request, res: Response) => {
  try {
    if (!requirePaymentTables(res)) return;

    const paymentId = positiveId(req.params.id);
    if (!paymentId) return res.status(400).json({ success: false, error: "Invalid payment id." });

    const payment = getPaymentById(paymentId);
    if (!payment) return res.status(404).json({ success: false, error: "Payment not found." });

    const paymentStatus = text(payment.status, 40).toLowerCase();
    if (!SUCCESS_PAYMENT_STATUSES.has(paymentStatus)) {
      return res.status(409).json({ success: false, error: "Only captured/paid payments can be refunded." });
    }

    const providerPaymentId = text(payment.provider_payment_id, 150);
    if (!providerPaymentId) {
      return res.status(409).json({
        success: false,
        error: "This payment has no provider payment id and cannot be refunded through Razorpay.",
      });
    }

    const capturedAmount = Number(payment.amount_paise ?? 0);
    const alreadyRefunded = Number(payment.refund_amount_paise ?? 0);
    const remaining = Math.max(0, capturedAmount - alreadyRefunded);
    if (!Number.isSafeInteger(capturedAmount) || capturedAmount <= 0 || remaining <= 0) {
      return res.status(409).json({ success: false, error: "This payment has no refundable balance." });
    }

    const requested = bodyOf(req).amountPaise === undefined
      ? remaining
      : nonNegativeInt(bodyOf(req).amountPaise);

    if (!requested || requested <= 0 || requested > remaining) {
      return res.status(400).json({
        success: false,
        error: `Refund amount must be between 1 and ${remaining} paise.`,
      });
    }

    const providerRefund = await createRazorpayRefund(providerPaymentId, requested);
    const totalRefunded = alreadyRefunded + requested;
    const fullRefund = totalRefunded >= capturedAmount;
    const nextStatus = fullRefund ? "refunded" : "partially_refunded";

    db.transaction(() => {
      db.prepare(`
        UPDATE payments
        SET refund_amount_paise = ?,
            refunded_at = CURRENT_TIMESTAMP,
            status = ?,
            updated_at = CURRENT_TIMESTAMP,
            metadata_json = ?
        WHERE id = ?
          AND status IN ('captured','paid','partially_refunded')
      `).run(
        totalRefunded,
        nextStatus,
        json({
          ...(() => {
            try { return jsonObject(JSON.parse(String(payment.metadata_json ?? "{}"))); }
            catch { return {}; }
          })(),
          lastRefund: providerRefund,
        }),
        paymentId,
      );

      const orderId = positiveId(payment.payment_order_id);
      if (fullRefund && orderId) {
        db.prepare(`
          UPDATE payment_orders
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'paid'
        `).run(orderId);
      }

      const subscriptionRef = getSubscriptionForPayment(payment);
      if (
        fullRefund &&
        subscriptionRef &&
        booleanValue(process.env.PAYMENT_REFUND_REVOKES_SUBSCRIPTION, true)
      ) {
        const current = getSubscription(subscriptionRef.subscription.id as number, subscriptionRef.ownerType);
        if (current && NON_ACTIVE_SUBSCRIPTION_STATUSES.has(text(current.status, 50))) {
          db.prepare(`
            UPDATE ${subscriptionTable(subscriptionRef.ownerType)}
            SET status = 'cancelled', auto_renew = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status IN ('pending','paused','payment_failed')
          `).run(subscriptionRef.subscription.id);
        } else if (current?.status === "active") {
          db.prepare(`
            UPDATE ${subscriptionTable(subscriptionRef.ownerType)}
            SET status = 'cancelled', auto_renew = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'active'
          `).run(subscriptionRef.subscription.id);

          if (subscriptionRef.ownerType === "pandit") {
            syncPanditListing(Number(subscriptionRef.subscription.pandit_id), false);
          }
        }

        createSubscriptionEvent({
          ownerType: subscriptionRef.ownerType,
          subscriptionId: Number(subscriptionRef.subscription.id),
          userId: currentUser(res).id,
          eventType: "cancelled_after_full_refund",
          oldStatus: text(subscriptionRef.subscription.status, 50),
          newStatus: "cancelled",
          oldExpiresAt: nullable(subscriptionRef.subscription.expires_at, 80),
          newExpiresAt: nullable(subscriptionRef.subscription.expires_at, 80),
          paymentOrderId: orderId,
          paymentId,
          notes: "Subscription revoked after full refund according to refund policy.",
          metadata: { refundRevokeEnabled: true },
        });
      }

      audit(req, currentUser(res).id, "payment.refunded", "payment", paymentId, serializePayment(payment), {
        requestedRefundPaise: requested,
        totalRefundedPaise: totalRefunded,
        status: nextStatus,
      });
    })();

    const updated = getPaymentById(paymentId);
    return res.json({
      success: true,
      message: fullRefund ? "Payment fully refunded." : "Payment partially refunded.",
      payment: serializePayment(updated),
      providerRefund,
    });
  } catch (error) {
    console.error("Refund error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to refund payment.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Razorpay Payment Links                                                     */
/* -------------------------------------------------------------------------- */

router.post("/payment-links", async (req: Request, res: Response) => {
  try {
    if (!requirePaymentTables(res)) return;
    if (!paymentsEnabled()) {
      return res.status(503).json({ success: false, error: "Payments are currently disabled." });
    }

    const user = currentUser(res);
    const body = bodyOf(req);
    const ownerType = normalizeOwnerType(body.ownerType ?? body.audience);
    const planId = positiveId(body.planId);
    const ownerId = positiveId(
      body.ownerId ?? body.panditId ?? body.templeId ?? body.ashramId,
    );

    if (!ownerType || !planId || !ownerId) {
      return res.status(400).json({ success: false, error: "ownerType, planId and ownerId are required." });
    }

    const owner = resolvePurchaseOwner(user, ownerType, ownerId);
    if (!owner) {
      return res.status(403).json({ success: false, error: "This account cannot create a payment link for the selected business." });
    }

    const commercial = trustedCommercialPlan(planId, ownerType);
    if (!commercial) {
      return res.status(409).json({
        success: false,
        error: "Selected subscription plan does not have a valid active monthly INR price variant.",
      });
    }

    const gateway = getRazorpayConfig();
    const amount = Number(commercial.price.price_amount);
    const amountPaise = amount * 100;
    const currency = text(commercial.price.currency, 10).toUpperCase();

    if (!Number.isSafeInteger(amountPaise) || currency !== text(gateway.currency, 10).toUpperCase()) {
      return res.status(409).json({ success: false, error: "Payment currency or amount configuration is invalid." });
    }

    const pending = ensurePendingSubscription(
      ownerType,
      owner.ownerId,
      owner.userId,
      commercial.plan,
      commercial.price,
    );

    const expiresInSeconds = Math.min(
      Math.max(positiveInt(process.env.PAYMENT_LINK_EXPIRY_SECONDS, 86_400), 900),
      15_552_000,
    );
    const expireBy = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const callbackUrl = gateway.callbackUrl || undefined;
    const upiOnly = booleanValue(process.env.PAYMENT_LINK_UPI_ONLY, false);

    const providerLink = await createRazorpayPaymentLink({
      amountPaise,
      currency,
      referenceId: `DD-LINK-${ownerType}-${owner.ownerId}-${pending.id}`.slice(0, 40),
      description: `${commercial.plan.name} subscription — ${ownerName(ownerType, owner.ownerId)}`,
      customer: {
        name: user.name,
        email: user.email,
        contact: user.phone ?? undefined,
      },
      expireBy,
      callbackUrl,
      callbackMethod: callbackUrl ? "get" : undefined,
      reminderEnable: true,
      acceptPartial: false,
      upiLink: upiOnly,
      notes: {
        app: "DivyaDhara",
        owner_type: ownerType,
        owner_id: String(owner.ownerId),
        subscription_id: String(pending.id),
        plan_id: String(commercial.plan.id),
        price_variant_id: String(commercial.price.id),
      },
    });

    const linkResult = db.transaction(() => {
      const ledger = createPaymentLedger({
        userId: user.id,
        ownerType,
        ownerId: owner.ownerId,
        plan: commercial.plan,
        price: commercial.price,
        subscriptionId: pending.id,
        providerOrderId: null,
        receipt: `DD-LINK-${ownerType}-${owner.ownerId}-${Date.now()}`.slice(0, 40),
        amount,
        amountPaise,
        currency,
        idempotencyKey: null,
        extraMetadata: {
          providerLinkId: providerLink.id,
          checkout: "razorpay_payment_link",
        },
      });

      const linkColumns = [
        "link_number", "user_id", "plan_id", "subscription_plan_price_id",
        "pandit_subscription_id", "temple_subscription_id", "ashram_subscription_id",
        "purpose", "amount", "amount_paise", "currency", "provider",
        "provider_link_id", "provider_link_url", "status", "short_url", "expire_by", "metadata_json",
      ];
      const linkValues: unknown[] = [
        makeNumber("DD-LINK"),
        user.id,
        commercial.plan.id,
        commercial.price.id,
        ownerType === "pandit" ? pending.id : null,
        ownerType === "temple" ? pending.id : null,
        ownerType === "ashram" ? pending.id : null,
        "subscription",
        amount,
        amountPaise,
        currency,
        "razorpay",
        providerLink.id,
        providerLink.short_url ?? null,
        text(providerLink.status, 30).toLowerCase() === "paid" ? "paid" : "active",
        providerLink.short_url ?? null,
        providerLink.expire_by
          ? new Date(providerLink.expire_by * 1000).toISOString()
          : new Date(expireBy * 1000).toISOString(),
        json({
          ownerType,
          ownerId: owner.ownerId,
          subscriptionId: pending.id,
          planId: commercial.plan.id,
          priceVariantId: commercial.price.id,
          paymentOrderId: ledger.orderId,
          paymentId: ledger.paymentId,
          providerLinkId: providerLink.id,
        }),
      ];

      const result = db.prepare(`
        INSERT INTO payment_links (${linkColumns.join(", ")}, created_at, updated_at)
        VALUES (${linkValues.map(() => "?").join(", ")}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(...linkValues);

      createSubscriptionEvent({
        ownerType,
        subscriptionId: pending.id,
        userId: user.id,
        eventType: "payment_link_created",
        oldStatus: "pending",
        newStatus: "pending",
        paymentOrderId: ledger.orderId,
        paymentId: ledger.paymentId,
        notes: "Razorpay Payment Link created for subscription checkout.",
        metadata: {
          providerLinkId: providerLink.id,
          planId: commercial.plan.id,
          priceVariantId: commercial.price.id,
        },
      });

      return {
        linkId: Number(result.lastInsertRowid),
        paymentOrderId: ledger.orderId,
        paymentId: ledger.paymentId,
      };
    })();

    audit(req, user.id, "payment_link.created", "payment_link", linkResult.linkId, null, {
      providerLinkId: providerLink.id,
      ownerType,
      ownerId: owner.ownerId,
      subscriptionId: pending.id,
      planId: commercial.plan.id,
      priceVariantId: commercial.price.id,
      amountPaise,
    });

    return res.status(201).json({
      success: true,
      paymentLinkId: linkResult.linkId,
      paymentOrderId: linkResult.paymentOrderId,
      paymentId: linkResult.paymentId,
      paymentTransactionId: linkResult.paymentId,
      providerLinkId: providerLink.id,
      url: providerLink.short_url ?? null,
      shortUrl: providerLink.short_url ?? null,
      link: providerLink,
      ownerType,
      ownerId: owner.ownerId,
      subscriptionId: pending.id,
    });
  } catch (error) {
    console.error("Create Razorpay payment link error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to create payment link.",
    });
  }
});

function paymentLinkOwner(row: SqlRow): { ownerType: OwnerType; ownerId: number } | null {
  const metadata = (() => {
    try { return jsonObject(JSON.parse(String(row.metadata_json ?? "{}"))); }
    catch { return {}; }
  })();
  const ownerType = normalizeOwnerType(metadata.ownerType);
  const ownerId = positiveId(metadata.ownerId);
  return ownerType && ownerId ? { ownerType, ownerId } : null;
}

function canAccessPaymentLink(user: AuthenticatedUser, row: SqlRow): boolean {
  if (user.role === "super_admin" || user.role === "sales") return true;
  if (positiveId(row.user_id) === user.id) return true;
  const owner = paymentLinkOwner(row);
  return owner ? canAccessOwner(user, owner.ownerType, owner.ownerId) : false;
}

router.get("/payment-links", (req: Request, res: Response) => {
  try {
    if (!tableExists("payment_links")) {
      return res.status(503).json({ success: false, error: "Payment links table is not available." });
    }

    const user = currentUser(res);
    const requested = normalizeOwnerType(req.query.ownerType ?? req.query.audience);
    const rows = db.prepare(`
      SELECT *
      FROM payment_links
      ORDER BY id DESC
      LIMIT 200
    `).all() as SqlRow[];

    const filtered = rows.filter((row) => {
      if (!canAccessPaymentLink(user, row)) return false;
      if (!requested) return true;
      return paymentLinkOwner(row)?.ownerType === requested;
    });

    return res.json({ success: true, links: filtered, paymentLinks: filtered.slice(0, 100) });
  } catch (error) {
    console.error("Payment link list error:", error);
    return res.status(500).json({ success: false, error: "Unable to load payment links." });
  }
});

router.get("/payment-links/:id", async (req: Request, res: Response) => {
  try {
    const linkId = positiveId(req.params.id);
    if (!linkId) return res.status(400).json({ success: false, error: "Invalid payment link id." });

    const row = db.prepare(`SELECT * FROM payment_links WHERE id = ? LIMIT 1`).get(linkId) as SqlRow | undefined;
    if (!row) return res.status(404).json({ success: false, error: "Payment link not found." });

    const user = currentUser(res);
    if (!canAccessPaymentLink(user, row)) {
      return res.status(403).json({ success: false, error: "You do not have access to this payment link." });
    }

    const providerLinkId = text(row.provider_link_id, 150);
    let provider = null;

    if (providerLinkId) {
      provider = await fetchRazorpayPaymentLink(providerLinkId);
      const providerStatus = text(provider.status, 30).toLowerCase();
      const localStatus =
        providerStatus === "paid"
          ? "paid"
          : providerStatus === "expired"
            ? "expired"
            : providerStatus === "cancelled"
              ? "cancelled"
              : "active";
      if (localStatus !== text(row.status, 30).toLowerCase()) {
        db.prepare(`UPDATE payment_links SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(localStatus, linkId);
      }
    }

    return res.json({
      success: true,
      link: db.prepare(`SELECT * FROM payment_links WHERE id = ? LIMIT 1`).get(linkId),
      provider,
    });
  } catch (error) {
    console.error("Payment link detail error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to load payment link.",
    });
  }
});

router.post("/payment-links/:id/cancel", async (req: Request, res: Response) => {
  try {
    const linkId = positiveId(req.params.id);
    if (!linkId) return res.status(400).json({ success: false, error: "Invalid payment link id." });

    const row = db.prepare(`SELECT * FROM payment_links WHERE id = ? LIMIT 1`).get(linkId) as SqlRow | undefined;
    if (!row) return res.status(404).json({ success: false, error: "Payment link not found." });

    const user = currentUser(res);
    if (!canAccessPaymentLink(user, row)) {
      return res.status(403).json({ success: false, error: "You do not have access to cancel this payment link." });
    }

    const currentStatus = text(row.status, 30).toLowerCase();
    if (currentStatus === "paid") {
      return res.status(409).json({ success: false, error: "A paid payment link cannot be cancelled." });
    }

    const providerLinkId = text(row.provider_link_id, 150);
    let provider = null;
    if (providerLinkId) {
      provider = await cancelRazorpayPaymentLink(providerLinkId);
    }

    const metadata = (() => {
      try { return jsonObject(JSON.parse(String(row.metadata_json ?? "{}"))); }
      catch { return {}; }
    })();

    const paymentOrderId = positiveId(metadata.paymentOrderId);
    const paymentId = positiveId(metadata.paymentId);
    const subscriptionId =
      positiveId(row.pandit_subscription_id) ??
      positiveId(row.temple_subscription_id) ??
      positiveId(row.ashram_subscription_id);
    const ownerType = normalizeOwnerType(metadata.ownerType);

    db.transaction(() => {
      db.prepare(`
        UPDATE payment_links
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status <> 'paid'
      `).run(linkId);

      if (paymentOrderId) {
        db.prepare(`
          UPDATE payment_orders
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('created','attempted')
        `).run(paymentOrderId);
      }

      if (paymentId) {
        db.prepare(`
          UPDATE payments
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status NOT IN ('captured','paid','refunded','partially_refunded')
        `).run(paymentId);
      }

      if (ownerType && subscriptionId) {
        const subscription = getSubscription(subscriptionId, ownerType);
        if (subscription && NON_ACTIVE_SUBSCRIPTION_STATUSES.has(text(subscription.status, 50))) {
          db.prepare(`
            UPDATE ${subscriptionTable(ownerType)}
            SET status = 'cancelled', auto_renew = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status IN ('pending','paused','payment_failed')
          `).run(subscriptionId);

          createSubscriptionEvent({
            ownerType,
            subscriptionId,
            userId: user.id,
            eventType: "payment_link_cancelled",
            oldStatus: text(subscription.status, 50),
            newStatus: "cancelled",
            oldExpiresAt: nullable(subscription.expires_at, 80),
            newExpiresAt: nullable(subscription.expires_at, 80),
            paymentOrderId,
            paymentId,
            notes: "Payment Link checkout was cancelled before payment completion.",
          });
        }
      }
    })();

    audit(req, user.id, "payment_link.cancelled", "payment_link", linkId, row, { status: "cancelled" });

    return res.json({
      success: true,
      message: "Payment link cancelled.",
      link: db.prepare(`SELECT * FROM payment_links WHERE id = ? LIMIT 1`).get(linkId),
      provider,
    });
  } catch (error) {
    console.error("Cancel payment link error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to cancel payment link.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Razorpay Webhook                                                           */
/* -------------------------------------------------------------------------- */

razorpayWebhookRouter.post("/razorpay", async (req: Request, res: Response) => {
  try {
    if (!requirePaymentTables(res)) return;

    const signature = text(req.get("X-Razorpay-Signature"), 300);
    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      return res.status(503).json({
        success: false,
        error: "Razorpay webhook raw body is not configured. Preserve the raw request body before express.json().",
        code: "RAZORPAY_RAW_BODY_REQUIRED",
      });
    }

    const config = getRazorpayConfig();
    if (!verifyRazorpayWebhookSignature(rawBody, signature, config.webhookSecret)) {
      return res.status(400).json({ success: false, error: "Invalid Razorpay webhook signature." });
    }

    const rawText = rawBody.toString("utf8");
    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return res.status(400).json({ success: false, error: "Invalid Razorpay webhook JSON." });
    }

    const root = jsonObject(payload);
    const eventType = text(root.event, 100).toLowerCase() || "unknown";
    const providerEventId = text(req.get("X-Razorpay-Event-Id"), 200) || hashPayload(rawText);

    const existing = db.prepare(`
      SELECT id, status
      FROM payment_webhook_events
      WHERE provider = 'razorpay'
        AND provider_event_id = ?
      LIMIT 1
    `).get(providerEventId) as { id?: number; status?: string } | undefined;

    if (existing?.id && existing.status === "processed") {
      return res.json({ success: true, duplicate: true });
    }

    const webhookRowId = existing?.id
      ? Number(existing.id)
      : Number(db.prepare(`
          INSERT INTO payment_webhook_events (
            provider, provider_event_id, event_type, signature,
            payload_json, payload_hash, status, received_at
          ) VALUES ('razorpay', ?, ?, ?, ?, ?, 'received', CURRENT_TIMESTAMP)
        `).run(
          providerEventId,
          eventType,
          signature,
          rawText,
          hashPayload(rawText),
        ).lastInsertRowid);

    try {
      await processWebhookEvent(root, eventType);
      db.prepare(`
        UPDATE payment_webhook_events
        SET status = 'processed',
            processed_at = CURRENT_TIMESTAMP,
            error_message = NULL
        WHERE id = ?
      `).run(webhookRowId);

      return res.json({ success: true, processed: true });
    } catch (error) {
      db.prepare(`
        UPDATE payment_webhook_events
        SET status = 'failed', error_message = ?, processed_at = NULL
        WHERE id = ?
      `).run(
        error instanceof Error ? error.message : "Webhook processing failed.",
        webhookRowId,
      );
      throw error;
    }
  } catch (error) {
    console.error("Razorpay webhook error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to process Razorpay webhook.",
    });
  }
});

async function processWebhookEvent(
  payload: Record<string, unknown>,
  eventType: string,
): Promise<void> {
  const payloadData = jsonObject(payload.payload);
  const event = eventType.toLowerCase();

  if (event === "payment_link.paid" || event === "payment_link.expired" || event === "payment_link.cancelled") {
    const providerLinkEntity = jsonObject(payloadData.payment_link);
    const providerLinkData = jsonObject(providerLinkEntity.entity);
    const providerLinkId = text(providerLinkData.id, 150);
    if (!providerLinkId) return;

    const localLink = db.prepare(`
      SELECT * FROM payment_links
      WHERE provider_link_id = ?
      LIMIT 1
    `).get(providerLinkId) as SqlRow | undefined;
    if (!localLink) return;

    if (event === "payment_link.expired" || event === "payment_link.cancelled") {
      const nextStatus = event === "payment_link.expired" ? "expired" : "cancelled";
      const metadata = (() => {
        try { return jsonObject(JSON.parse(String(localLink.metadata_json ?? "{}"))); }
        catch { return {}; }
      })();
      const paymentOrderId = positiveId(metadata.paymentOrderId);
      const paymentId = positiveId(metadata.paymentId);
      const subscriptionId =
        positiveId(localLink.pandit_subscription_id) ??
        positiveId(localLink.temple_subscription_id) ??
        positiveId(localLink.ashram_subscription_id);
      const ownerType = normalizeOwnerType(metadata.ownerType);

      db.transaction(() => {
        db.prepare(`
          UPDATE payment_links
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status NOT IN ('paid','cancelled','expired')
        `).run(nextStatus, localLink.id);

        if (paymentOrderId) {
          db.prepare(`
            UPDATE payment_orders
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status IN ('created','attempted')
          `).run(nextStatus === "expired" ? "expired" : "cancelled", paymentOrderId);
        }

        if (paymentId) {
          db.prepare(`
            UPDATE payments
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND status IN ('created','pending','authorized')
          `).run(paymentId);
        }

        if (ownerType && subscriptionId) {
          const subscription = getSubscription(subscriptionId, ownerType);
          if (subscription && NON_ACTIVE_SUBSCRIPTION_STATUSES.has(text(subscription.status, 50))) {
            db.prepare(`
              UPDATE ${subscriptionTable(ownerType)}
              SET status = ?, auto_renew = 0, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND status IN ('pending','paused','payment_failed')
            `).run(
              nextStatus === "expired" ? "expired" : "cancelled",
              subscriptionId,
            );

            createSubscriptionEvent({
              ownerType,
              subscriptionId,
              userId: positiveId(localLink.user_id),
              eventType: nextStatus === "expired" ? "payment_link_expired" : "payment_link_cancelled",
              oldStatus: text(subscription.status, 50),
              newStatus: nextStatus === "expired" ? "expired" : "cancelled",
              oldExpiresAt: nullable(subscription.expires_at, 80),
              newExpiresAt: nullable(subscription.expires_at, 80),
              paymentOrderId,
              paymentId,
              notes: nextStatus === "expired"
                ? "Razorpay Payment Link expired before successful payment."
                : "Razorpay Payment Link was cancelled before successful payment.",
            });
          }
        }
      })();

      return;
    }

    const payments = Array.isArray(providerLinkData.payments)
      ? providerLinkData.payments as unknown[]
      : [];
    const firstPayment = payments.length ? jsonObject(payments[0]) : {};
    const fallbackPayment = jsonObject(payloadData.payment);
    const fallbackEntity = jsonObject(fallbackPayment.entity);

    const providerPaymentId = text(
      firstPayment.payment_id ??
      firstPayment.id ??
      providerLinkData.payment_id ??
      fallbackEntity.id,
      150,
    );
    if (!providerPaymentId) return;

    const metadata = (() => {
      try { return jsonObject(JSON.parse(String(localLink.metadata_json ?? "{}"))); }
      catch { return {}; }
    })();

    const ownerType = normalizeOwnerType(metadata.ownerType);
    const subscriptionId =
      positiveId(localLink.pandit_subscription_id) ??
      positiveId(localLink.temple_subscription_id) ??
      positiveId(localLink.ashram_subscription_id);

    if (!ownerType || !subscriptionId) return;

    const subscription = getSubscription(subscriptionId, ownerType);
    if (!subscription) return;

    let paymentOrderId = positiveId(subscription.payment_order_id);
    let localPayment = paymentOrderId ? getPaymentForOrder(paymentOrderId) : undefined;

    if (!localPayment) {
      const ownerId = positiveId(subscription[ownerColumn(ownerType)]);
      const planId = positiveId(localLink.plan_id);
      if (!ownerId || !planId) return;

      const commercial = trustedCommercialPlan(planId, ownerType);
      if (!commercial) return;

      const moneyAmount = Number(commercial.price.price_amount);
      const moneyPaise = moneyAmount * 100;
      const ledger = db.transaction(() => createPaymentLedger({
        userId: positiveId(localLink.user_id) ?? ownerUserId(ownerType, ownerId) ?? 0,
        ownerType,
        ownerId,
        plan: commercial.plan,
        price: commercial.price,
        subscriptionId,
        providerOrderId: null,
        receipt: `DD-LINK-${ownerType}-${ownerId}-${Date.now()}`.slice(0, 40),
        amount: moneyAmount,
        amountPaise: moneyPaise,
        currency: text(commercial.price.currency, 10).toUpperCase(),
        idempotencyKey: null,
        extraMetadata: {
          providerLinkId,
          source: "payment_link_webhook",
        },
      }))();

      paymentOrderId = ledger.orderId;
      localPayment = getPaymentById(ledger.paymentId);
    }

    if (!localPayment || !paymentOrderId) return;

    const remotePayment = await fetchRazorpayPayment(providerPaymentId);
    const remoteOrderId = text(remotePayment.order_id, 150);

    if (remoteOrderId) {
      db.prepare(`
        UPDATE payment_orders
        SET provider_order_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(remoteOrderId, paymentOrderId);

      db.prepare(`
        UPDATE payments
        SET provider_order_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(remoteOrderId, localPayment.id);
    }

    const order = db.prepare(`
      SELECT * FROM payment_orders WHERE id = ? LIMIT 1
    `).get(paymentOrderId) as SqlRow | undefined;
    const payment = getPaymentById(Number(localPayment.id));

    if (!order || !payment) return;

    const remoteAmount = Number(
      remotePayment.amount ??
      providerLinkData.amount ??
      payment.amount_paise ??
      0,
    );
    const remoteCurrency = text(
      remotePayment.currency ??
      providerLinkData.currency ??
      payment.currency,
      10,
    ).toUpperCase();

    if (!remoteOrderId) {
      throw new Error("Razorpay payment-link payment has no linked order id.");
    }

    completeVerifiedPayment({
      order,
      payment,
      razorpayPaymentId: providerPaymentId,
      signature: "webhook",
      method: text(remotePayment.method ?? firstPayment.method, 50) || null,
      remoteAmount,
      remoteCurrency,
      userId: positiveId(payment.user_id) ?? 0,
    });

    db.prepare(`
      UPDATE payment_links
      SET status = 'paid', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(localLink.id);

    const targetUserId = ownerUserId(ownerType, Number(subscription[ownerColumn(ownerType)]));
    notifyUser(
      targetUserId,
      "Subscription activated",
      "Your subscription payment was confirmed and the subscription is now active.",
      "/dashboard/subscription",
      {
        subscriptionId,
        paymentId: Number(payment.id),
        source: "razorpay_payment_link_webhook",
      },
    );
    return;
  }

  const paymentEntity = jsonObject(payloadData.payment);
  const orderEntity = jsonObject(payloadData.order);
  const paymentData = jsonObject(paymentEntity.entity);
  const orderData = jsonObject(orderEntity.entity);

  const providerPaymentId = text(paymentData.id, 150);
  const providerOrderId = text(paymentData.order_id ?? orderData.id, 150);
  if (!providerOrderId) return;

  const order = getOrderByProviderId(providerOrderId);
  if (!order) return;

  const orderId = positiveId(order.id);
  if (!orderId) return;

  const payment = providerPaymentId
    ? (
      db.prepare(`
        SELECT * FROM payments
        WHERE provider_order_id = ?
        ORDER BY id DESC LIMIT 1
      `).get(providerOrderId) as SqlRow | undefined
    ) ?? getPaymentForOrder(orderId)
    : getPaymentForOrder(orderId);

  if (!payment) return;

  if (event === "payment.captured" || event === "order.paid") {
    if (!providerPaymentId) return;

    const currentPayment = getPaymentById(Number(payment.id));
    if (!currentPayment) return;

    const result = completeVerifiedPayment({
      order,
      payment: currentPayment,
      razorpayPaymentId: providerPaymentId,
      signature: "webhook",
      method: text(paymentData.method, 50) || null,
      remoteAmount: Number(paymentData.amount ?? orderData.amount_paid ?? currentPayment.amount_paise ?? 0),
      remoteCurrency: text(paymentData.currency ?? orderData.currency ?? currentPayment.currency, 10).toUpperCase(),
      userId: positiveId(currentPayment.user_id) ?? 0,
    });

    const targetUserId = ownerUserId(
      result.ownerType,
      Number(result.subscription.ownerId),
    );

    notifyUser(
      targetUserId,
      "Subscription activated",
      `Your ${String(result.subscription.planName ?? "subscription")} is now active.`,
      "/dashboard/subscription",
      {
        subscriptionId: result.subscriptionId,
        paymentId: Number(payment.id),
        source: "razorpay_webhook",
      },
    );
    return;
  }

  if (event === "payment.failed") {
    handleFailedPayment({
      payment,
      order,
      providerPaymentId: providerPaymentId || null,
      signature: "webhook",
      method: text(paymentData.method, 50) || null,
      reason: text(
        paymentData.error_description ??
        paymentData.error_code ??
        "Razorpay reported payment failure.",
        1000,
      ),
      userId: positiveId(payment.user_id),
    });
    return;
  }

  if (event === "payment.refunded" || event === "payment.partially_refunded") {
    const capturedAmount = Number(payment.amount_paise ?? 0);
    const reportedTotal = Number(paymentData.amount_refunded ?? 0);
    const reportedIncrement = Number(
      paymentData.refund_amount ??
      paymentData.amount ??
      0,
    );
    const alreadyRefunded = Number(payment.refund_amount_paise ?? 0);
    const totalRefunded = reportedTotal > 0
      ? Math.min(capturedAmount, reportedTotal)
      : Math.min(capturedAmount, alreadyRefunded + Math.max(0, reportedIncrement));

    if (totalRefunded <= alreadyRefunded) return;

    const fullRefund = totalRefunded >= capturedAmount && capturedAmount > 0;
    const nextStatus = fullRefund ? "refunded" : "partially_refunded";

    db.transaction(() => {
      db.prepare(`
        UPDATE payments
        SET refund_amount_paise = ?,
            refunded_at = CURRENT_TIMESTAMP,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(totalRefunded, nextStatus, payment.id);

      if (fullRefund && booleanValue(process.env.PAYMENT_REFUND_REVOKES_SUBSCRIPTION, true)) {
        const subscriptionRef = getSubscriptionForPayment(payment);
        if (!subscriptionRef) return;

        const current = getSubscription(
          Number(subscriptionRef.subscription.id),
          subscriptionRef.ownerType,
        );
        if (!current) return;

        db.prepare(`
          UPDATE ${subscriptionTable(subscriptionRef.ownerType)}
          SET status = 'cancelled',
              auto_renew = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status IN ('active','pending','paused','payment_failed')
        `).run(current.id);

        if (subscriptionRef.ownerType === "pandit") {
          syncPanditListing(Number(current.pandit_id), false);
        }

        createSubscriptionEvent({
          ownerType: subscriptionRef.ownerType,
          subscriptionId: Number(current.id),
          userId: positiveId(payment.user_id),
          eventType: "cancelled_after_full_refund",
          oldStatus: text(current.status, 50),
          newStatus: "cancelled",
          oldExpiresAt: nullable(current.expires_at, 80),
          newExpiresAt: nullable(current.expires_at, 80),
          paymentOrderId: positiveId(payment.payment_order_id),
          paymentId: Number(payment.id),
          notes: "Subscription revoked after full refund reported by Razorpay.",
        });
      }
    })();

    return;
  }
}

export default router;
