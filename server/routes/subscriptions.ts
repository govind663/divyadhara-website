import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Subscription Management API
|--------------------------------------------------------------------------
|
| COMMERCIAL AUTHORITY
| --------------------
| SQLite + subscription_plans + subscription_plan_prices are the authoritative
| commercial catalogue.
|
| PAYMENT AUTHORITY
| -----------------
| payments.ts + verified payment webhooks own payment/order verification.
|
| SUBSCRIPTION AUTHORITY
| ----------------------
| This router owns subscription lifecycle, entitlement snapshots, status
| transitions, expiry and operational subscription management.
|
| CURRENT CANONICAL COMMERCIAL CATALOGUE
| ---------------------------------------
| Pandit:
|   pandit_basic   ₹199 monthly
|   pandit_premium ₹499 monthly
|
| Temple:
|   temple_basic   ₹499 monthly
|   temple_premium ₹999 monthly
|
| Ashram:
|   ashram_basic   ₹499 monthly
|   ashram_premium ₹1499 monthly
|
| BUSINESS RULES
| --------------
| 1. Client-provided prices are NEVER trusted.
| 2. Client-provided entitlement limits are NEVER trusted.
| 3. Active commercial pricing is read from subscription_plan_prices.
| 4. Subscription rows store a frozen commercial snapshot.
| 5. Fallback frontend pricing has no payment authority.
| 6. Checkout must reference backend plan + price-variant records.
| 7. Payment order creation belongs to payments.ts.
| 8. Payment verification belongs to payments.ts/webhooks.
| 9. Subscription activation after verified payment belongs to the payment
|    integration and subscription lifecycle.
| 10. Exactly one ACTIVE subscription per owner is allowed.
| 11. Pandit listing is commercially active only when the subscription is active
|     AND the underlying Pandit profile is approved.
| 12. Temple/Ashram Manager authorization comes from explicit assignment tables.
| 13. ashram_subscriptions.manager_user_id is NOT the authorization authority.
| 14. Sales can operate only the Ashram subscription pipeline.
| 15. Super Admin is the only role allowed to manually change subscription
|     state.
| 16. Self-cancellation of an active paid subscription disables renewal but
|     does not revoke the already-paid service period.
| 17. Every important lifecycle transition creates a subscription event.
|--------------------------------------------------------------------------
*/

const router = Router();

/*
|--------------------------------------------------------------------------
| Router-level response hardening
|--------------------------------------------------------------------------
*/

router.use(
  (
    _req,
    res,
    next,
  ) => {
    res.setHeader(
      "X-Content-Type-Options",
      "nosniff",
    );

    res.setHeader(
      "Referrer-Policy",
      "no-referrer",
    );

    /*
     * Subscription/account/payment state must never be cached by an
     * intermediary.
     */
    res.setHeader(
      "Cache-Control",
      "no-store, private",
    );

    next();
  },
);

/*
|--------------------------------------------------------------------------
| Domain types
|--------------------------------------------------------------------------
*/

type OwnerType =
  | "pandit"
  | "temple"
  | "ashram";

type SubscriptionStatus =
  | "pending"
  | "active"
  | "expired"
  | "cancelled"
  | "paused"
  | "payment_failed";

type BillingInterval =
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

type SearchVisibility =
  | "standard"
  | "higher";

type AnalyticsLevel =
  | "none"
  | "basic"
  | "advanced";

type SqlRow =
  Record<string, unknown>;

const OWNER_TYPES: readonly OwnerType[] = [
  "pandit",
  "temple",
  "ashram",
];

const STATUSES: readonly SubscriptionStatus[] = [
  "pending",
  "active",
  "expired",
  "cancelled",
  "paused",
  "payment_failed",
];

const BILLING_INTERVALS: readonly BillingInterval[] = [
  "monthly",
  "quarterly",
  "yearly",
  "custom",
];

const CANONICAL_PLAN_CODES: Record<
  OwnerType,
  readonly string[]
> = {
  pandit: [
    "pandit_basic",
    "pandit_premium",
  ],
  temple: [
    "temple_basic",
    "temple_premium",
  ],
  ashram: [
    "ashram_basic",
    "ashram_premium",
  ],
};

/*
 * Current commercial release deliberately exposes only monthly prices.
 * The database can support additional intervals later.
 */
const PUBLIC_MONTHLY_ONLY = true;

const PENDING_INTENT_TTL_MS =
  30 * 60 * 1000;

const MAX_NOTES_LENGTH = 5000;

const SUPPORTED_PAYMENT_PROVIDER =
  "razorpay";

const MIN_PRICE_AMOUNT = 1;
const MAX_PRICE_AMOUNT = 100_000_000;

const MIN_DURATION_DAYS = 1;
const MAX_DURATION_DAYS = 3660;

/*
|--------------------------------------------------------------------------
| Database row contracts
|--------------------------------------------------------------------------
*/

interface PlanRow {
  id: number;
  code: string;
  audience: OwnerType;
  name: string;
  description: string | null;
  price_amount: number;
  currency: string;
  billing_interval: BillingInterval;
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

  search_visibility: SearchVisibility;
  analytics_level: AnalyticsLevel;

  plan_features_json: string;

  /*
   * Database metadata only.
   * Public API does not expose provider plan identifiers.
   */
  razorpay_plan_id: string | null;

  is_active: number;
  sort_order: number;

  created_at: string;
  updated_at: string;
}

interface PriceVariantRow {
  id: number;
  plan_id: number;
  billing_interval: BillingInterval;
  duration_days: number;
  price_amount: number;
  currency: string;
  provider: string;
  razorpay_plan_id: string | null;
  is_active: number;
  sort_order: number;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

type SubscriptionRow = SqlRow & {
  id: number;
  plan_id: number;

  status: SubscriptionStatus;

  starts_at: string | null;
  expires_at: string | null;

  lead_limit: number;
  leads_used: number;

  price_amount: number;
  currency: string;

  service_limit: number;
  service_area_limit: number;
  gallery_limit: number;
  video_limit: number;
  program_limit: number;

  auto_renew: number;

  payment_order_id: number | null;
  payment_id: number | null;

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

  search_visibility: SearchVisibility;
  analytics_level: AnalyticsLevel;

  razorpay_subscription_id: string | null;

  plan_snapshot_json: string;

  subscription_plan_price_id?:
    number | null;

  manager_user_id?:
    number | null;

  notes: string | null;

  created_at: string;
  updated_at: string;

  pandit_id?: number;
  temple_id?: number;
  ashram_id?: number;

  billing_interval?:
    BillingInterval | null;

  duration_days?: number | null;

  plan_code?: string | null;
  plan_name?: string | null;
  plan_description?: string | null;

  plan_price_amount?: number | null;
  plan_currency?: string | null;

  plan_billing_interval?:
    BillingInterval | null;

  plan_duration_days?: number | null;
};

/*
|--------------------------------------------------------------------------
| Generic helpers
|--------------------------------------------------------------------------
*/

function text(
  value: unknown,
  max = 500,
): string {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, max);
}

function nullable(
  value: unknown,
  max = 500,
): string | null {
  const result = text(
    value,
    max,
  );

  return result || null;
}

function positiveId(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isSafeInteger(
    number,
  ) && number > 0
    ? number
    : null;
}

function integerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(
    String(value)
      .replace(/,/g, "")
      .trim(),
  );

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  const integer = Math.floor(
    number,
  );

  return integer >= min &&
    integer <= max
    ? integer
    : fallback;
}

function enumValue<
  T extends readonly string[],
>(
  value: unknown,
  allowed: T,
): T[number] | null {
  const normalized = text(
    value,
    100,
  ).toLowerCase();

  return (
    allowed as readonly string[]
  ).includes(normalized)
    ? (normalized as T[number])
    : null;
}

function booleanValue(
  value: unknown,
  fallback = false,
): boolean {
  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    return value !== 0;
  }

  const normalized = text(
    value,
    20,
  ).toLowerCase();

  if (
    ["1", "true", "yes", "on"].includes(
      normalized,
    )
  ) {
    return true;
  }

  if (
    ["0", "false", "no", "off"].includes(
      normalized,
    )
  ) {
    return false;
  }

  return fallback;
}

function jsonObject(
  value: unknown,
): string {
  try {
    const serialized =
      JSON.stringify(
        value ?? {},
      );

    return serialized || "{}";
  } catch {
    return "{}";
  }
}

function parseObject(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(value);

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<
          string,
          unknown
        >)
      : {};
  } catch {
    return {};
  }
}

function parseArray(
  value: unknown,
): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function bodyOf(
  req: Request,
): Record<string, unknown> {
  return req.body &&
    typeof req.body === "object" &&
    !Array.isArray(req.body)
    ? (req.body as Record<
        string,
        unknown
      >)
    : {};
}

function currentUser(
  res: Response,
): AuthenticatedUser {
  return res.locals
    .user as AuthenticatedUser;
}

function nowIso(): string {
  return new Date().toISOString();
}

function daysUntil(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const timestamp =
    new Date(value).getTime();

  if (
    !Number.isFinite(timestamp)
  ) {
    return null;
  }

  return Math.ceil(
    (timestamp - Date.now()) /
      86_400_000,
  );
}

function validIsoOrNull(
  value: unknown,
): string | null {
  const raw =
    nullable(value, 80);

  if (!raw) {
    return null;
  }

  const timestamp =
    new Date(raw).getTime();

  if (
    !Number.isFinite(timestamp)
  ) {
    return null;
  }

  return new Date(
    timestamp,
  ).toISOString();
}

function addDaysIso(
  start: string,
  days: number,
): string {
  const timestamp =
    new Date(start).getTime();

  const base =
    Number.isFinite(timestamp)
      ? timestamp
      : Date.now();

  return new Date(
    base +
      Math.max(
        MIN_DURATION_DAYS,
        days,
      ) *
        86_400_000,
  ).toISOString();
}

function auditIp(
  req: Request,
): string | null {
  const forwarded =
    req.headers[
      "x-forwarded-for"
    ];

  if (
    typeof forwarded ===
      "string" &&
    forwarded.trim()
  ) {
    return (
      text(
        forwarded
          .split(",")[0],
        100,
      ) || null
    );
  }

  if (
    Array.isArray(forwarded) &&
    forwarded[0]
  ) {
    return (
      text(
        forwarded[0],
        100,
      ) || null
    );
  }

  return req.ip
    ? text(req.ip, 100) ||
        null
    : null;
}

function userAgent(
  req: Request,
): string | null {
  return nullable(
    req.get("user-agent"),
    500,
  );
}

/*
|--------------------------------------------------------------------------
| Audit + notifications
|--------------------------------------------------------------------------
*/

function audit(params: {
  req: Request;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldData?: unknown;
  newData?: unknown;
}): void {
  try {
    db.prepare(`
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
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `).run(
      params.userId,
      params.action,
      params.entityType,
      params.entityId,
      params.oldData ===
      undefined
        ? null
        : jsonObject(
            params.oldData,
          ),
      params.newData ===
      undefined
        ? null
        : jsonObject(
            params.newData,
          ),
      auditIp(params.req),
      userAgent(params.req),
    );
  } catch (error) {
    /*
     * Audit failure must not take down a user-facing subscription operation.
     * subscription_events remains the lifecycle authority and is written
     * transactionally for state transitions.
     */
    console.warn(
      "Subscription audit write skipped:",
      error,
    );
  }
}

function notifyUser(
  userId: number,
  title: string,
  message: string,
  actionUrl: string | null,
  metadata: unknown,
): void {
  try {
    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        action_url,
        is_read,
        metadata_json,
        created_at
      )
      VALUES (
        ?,
        'subscription',
        ?,
        ?,
        ?,
        0,
        ?,
        CURRENT_TIMESTAMP
      )
    `).run(
      userId,
      title,
      message,
      actionUrl,
      jsonObject(
        metadata,
      ),
    );
  } catch (error) {
    console.warn(
      "Subscription notification skipped:",
      error,
    );
  }
}

function tableExists(
  tableName: string,
): boolean {
  const row =
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type='table'
        AND name=?
      LIMIT 1
    `).get(
      tableName,
    ) as
      | {
          name?: string;
        }
      | undefined;

  return Boolean(
    row?.name,
  );
}

function requireTables(
  res: Response,
): boolean {
  const required = [
    "subscription_plans",
    "subscription_plan_prices",
    "pandit_subscriptions",
    "temple_subscriptions",
    "ashram_subscriptions",
    "subscription_events",
    "audit_logs",
    "notifications",
  ];

  const missing =
    required.filter(
      (name) =>
        !tableExists(name),
    );

  if (missing.length) {
    res.status(503).json({
      success: false,
      error:
        `Subscription database is incomplete. Missing: ${missing.join(", ")}.`,
    });

    return false;
  }

  return true;
}

/*
|--------------------------------------------------------------------------
| Validation helpers
|--------------------------------------------------------------------------
*/

function normalizeOwnerType(
  value: unknown,
): OwnerType | null {
  return enumValue(
    value,
    OWNER_TYPES,
  );
}

function normalizeStatus(
  value: unknown,
): SubscriptionStatus | null {
  return enumValue(
    value,
    STATUSES,
  );
}

function normalizeInterval(
  value: unknown,
): BillingInterval | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "monthly";
  }

  return enumValue(
    value,
    BILLING_INTERVALS,
  );
}

function requireBillingInterval(
  value: unknown,
): BillingInterval | null {
  const interval =
    normalizeInterval(value);

  if (!interval) {
    return null;
  }

  if (
    PUBLIC_MONTHLY_ONLY &&
    interval !== "monthly"
  ) {
    return null;
  }

  return interval;
}

function normalizedCurrency(
  value: unknown,
): string {
  return (
    text(value, 10)
      .toUpperCase() ||
    "INR"
  );
}

function isValidCurrency(
  value: unknown,
): boolean {
  return /^[A-Z]{3}$/.test(
    normalizedCurrency(
      value,
    ),
  );
}

function safeAmount(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const amount =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isSafeInteger(
    amount,
  ) && amount >= 0
    ? amount
    : null;
}

function positiveMoneyAmount(
  value: unknown,
): number | null {
  const amount =
    safeAmount(value);

  return amount !== null &&
    amount >=
      MIN_PRICE_AMOUNT &&
    amount <=
      MAX_PRICE_AMOUNT
    ? amount
    : null;
}

function pendingIsFresh(
  row: SubscriptionRow,
): boolean {
  const updated =
    new Date(
      String(
        row.updated_at ??
          row.created_at ??
          "",
      ),
    ).getTime();

  if (
    !Number.isFinite(
      updated,
    )
  ) {
    return false;
  }

  return (
    Date.now() - updated <=
    PENDING_INTENT_TTL_MS
  );
}

function providerName(): string {
  return (
    text(
      process.env.PAYMENT_PROVIDER,
      50,
    ).toLowerCase() ||
    SUPPORTED_PAYMENT_PROVIDER
  );
}

/*
|--------------------------------------------------------------------------
| Plans / price variants
|--------------------------------------------------------------------------
*/

function isCanonicalPlanCode(
  ownerType: OwnerType,
  code: string,
): boolean {
  return (
    CANONICAL_PLAN_CODES[
      ownerType
    ] as readonly string[]
  ).includes(code);
}

function listPlans(
  ownerType?: OwnerType,
): PlanRow[] {
  const where = [
    "p.is_active=1",
  ];

  const params: unknown[] = [];

  if (ownerType) {
    where.push(
      "p.audience=?",
    );
    params.push(ownerType);
  }

  const rows =
    db.prepare(`
      SELECT p.*
      FROM subscription_plans p
      WHERE ${where.join(
        " AND ",
      )}
      ORDER BY
        CASE p.audience
          WHEN 'pandit' THEN 1
          WHEN 'temple' THEN 2
          WHEN 'ashram' THEN 3
          ELSE 99
        END,
        p.sort_order ASC,
        p.price_amount ASC,
        p.id ASC
    `).all(
      ...params,
    ) as PlanRow[];

  return rows.filter(
    (row) =>
      OWNER_TYPES.includes(
        row.audience,
      ) &&
      isCanonicalPlanCode(
        row.audience,
        row.code,
      ),
  );
}

function getPlan(
  planId: number,
  ownerType: OwnerType,
): PlanRow | null {
  const row =
    (
      db.prepare(`
        SELECT *
        FROM subscription_plans
        WHERE id=?
          AND audience=?
          AND is_active=1
        LIMIT 1
      `).get(
        planId,
        ownerType,
      ) as PlanRow | undefined
    ) ?? null;

  return row &&
    isCanonicalPlanCode(
      ownerType,
      row.code,
    )
    ? row
    : null;
}

function getPlanByCode(
  code: string,
  ownerType: OwnerType,
): PlanRow | null {
  if (
    !isCanonicalPlanCode(
      ownerType,
      code,
    )
  ) {
    return null;
  }

  return (
    db.prepare(`
      SELECT *
      FROM subscription_plans
      WHERE code=?
        AND audience=?
        AND is_active=1
      LIMIT 1
    `).get(
      code,
      ownerType,
    ) as PlanRow | undefined
  ) ?? null;
}

function getPriceVariant(
  planId: number,
  interval: BillingInterval,
): PriceVariantRow | null {
  return (
    db.prepare(`
      SELECT *
      FROM subscription_plan_prices
      WHERE plan_id=?
        AND billing_interval=?
        AND is_active=1
      ORDER BY
        sort_order ASC,
        id ASC
      LIMIT 1
    `).get(
      planId,
      interval,
    ) as
      | PriceVariantRow
      | undefined
  ) ?? null;
}

function effectiveOffer(
  plan: PlanRow,
  interval: BillingInterval,
): {
  plan: PlanRow;
  price: PriceVariantRow;
} | null {
  if (
    !plan.is_active ||
    !isCanonicalPlanCode(
      plan.audience,
      plan.code,
    )
  ) {
    return null;
  }

  if (
    PUBLIC_MONTHLY_ONLY &&
    interval !== "monthly"
  ) {
    return null;
  }

  const price =
    getPriceVariant(
      plan.id,
      interval,
    );

  if (
    !price ||
    Number(price.is_active) !==
      1
  ) {
    return null;
  }

  const provider =
    text(
      price.provider,
      50,
    ).toLowerCase();

  if (
    provider !==
    SUPPORTED_PAYMENT_PROVIDER
  ) {
    return null;
  }

  if (
    !isValidCurrency(
      price.currency,
    ) ||
    normalizedCurrency(
      price.currency,
    ) !== "INR"
  ) {
    return null;
  }

  const amount =
    positiveMoneyAmount(
      price.price_amount,
    );

  if (amount === null) {
    return null;
  }

  if (
    !Number.isSafeInteger(
      price.duration_days,
    ) ||
    price.duration_days <
      MIN_DURATION_DAYS ||
    price.duration_days >
      MAX_DURATION_DAYS
  ) {
    return null;
  }

  return {
    plan,
    price,
  };
}

/*
|--------------------------------------------------------------------------
| Public plan serialization
|--------------------------------------------------------------------------
|
| Provider Plan IDs are intentionally NOT exposed to the browser.
| Checkout uses priceVariantId/planId and backend re-resolves the provider
| metadata server-side.
|--------------------------------------------------------------------------
*/

function serializePlan(
  plan: PlanRow,
  price?: PriceVariantRow | null,
): Record<string, unknown> {
  const effectivePrice =
    price?.price_amount ??
    plan.price_amount;

  const effectiveCurrency =
    normalizedCurrency(
      price?.currency ??
        plan.currency,
    );

  const effectiveInterval =
    price?.billing_interval ??
    plan.billing_interval;

  const effectiveDuration =
    price?.duration_days ??
    plan.duration_days;

  const provider =
    text(
      price?.provider ??
        SUPPORTED_PAYMENT_PROVIDER,
      50,
    ).toLowerCase() ||
    SUPPORTED_PAYMENT_PROVIDER;

  return {
    id: plan.id,

    code: plan.code,

    ownerType:
      plan.audience,

    audience:
      plan.audience,

    name: plan.name,

    title: plan.name,

    description:
      plan.description,

    priceAmount:
      effectivePrice,

    currency:
      effectiveCurrency,

    billingInterval:
      effectiveInterval,

    durationDays:
      effectiveDuration,

    leadLimit:
      Number(plan.lead_limit),

    serviceLimit:
      Number(plan.service_limit),

    serviceAreaLimit:
      Number(plan.service_area_limit),

    galleryLimit:
      Number(plan.gallery_limit),

    videoLimit:
      Number(plan.video_limit),

    programLimit:
      Number(plan.program_limit),

    listingEnabled:
      Boolean(
        plan.listing_enabled,
      ),

    featuredListing:
      Boolean(
        plan.featured_listing,
      ),

    prioritySupport:
      Boolean(
        plan.priority_support,
      ),

    verificationBadge:
      Boolean(
        plan.verification_badge,
      ),

    analyticsAccess:
      Boolean(
        plan.analytics_access,
      ),

    homepagePromotion:
      Boolean(
        plan.homepage_promotion,
      ),

    liveAartiEnabled:
      Boolean(
        plan.live_aarti_enabled,
      ),

    enhancedSeo:
      Boolean(
        plan.enhanced_seo,
      ),

    enhancedProfile:
      Boolean(
        plan.enhanced_profile,
      ),

    whatsappEnquiry:
      Boolean(
        plan.whatsapp_enquiry,
      ),

    searchVisibility:
      plan.search_visibility,

    analyticsLevel:
      plan.analytics_level,

    features:
      parseArray(
        plan.plan_features_json,
      ),

    provider,

    /*
     * Internal gateway identifier intentionally hidden from public API.
     */
    razorpayPlanId:
      null,

    /*
     * Frontend may submit this identifier back to the backend.
     * Backend revalidates it against the current price table.
     */
    priceVariantId:
      price?.id ?? null,

    sortOrder:
      plan.sort_order,

    isActive:
      Boolean(
        plan.is_active,
      ),
  };
}

function buildSnapshot(
  plan: PlanRow,
  price: PriceVariantRow,
): Record<string, unknown> {
  return {
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    planDescription:
      plan.description,
    planAudience:
      plan.audience,

    priceVariantId:
      price.id,

    provider:
      price.provider,

    priceAmount:
      price.price_amount,

    currency:
      price.currency,

    billingInterval:
      price.billing_interval,

    durationDays:
      price.duration_days,

    leadLimit:
      plan.lead_limit,

    serviceLimit:
      plan.service_limit,

    serviceAreaLimit:
      plan.service_area_limit,

    galleryLimit:
      plan.gallery_limit,

    videoLimit:
      plan.video_limit,

    programLimit:
      plan.program_limit,

    listingEnabled:
      Boolean(
        plan.listing_enabled,
      ),

    featuredListing:
      Boolean(
        plan.featured_listing,
      ),

    prioritySupport:
      Boolean(
        plan.priority_support,
      ),

    verificationBadge:
      Boolean(
        plan.verification_badge,
      ),

    analyticsAccess:
      Boolean(
        plan.analytics_access,
      ),

    homepagePromotion:
      Boolean(
        plan.homepage_promotion,
      ),

    liveAartiEnabled:
      Boolean(
        plan.live_aarti_enabled,
      ),

    enhancedSeo:
      Boolean(
        plan.enhanced_seo,
      ),

    enhancedProfile:
      Boolean(
        plan.enhanced_profile,
      ),

    whatsappEnquiry:
      Boolean(
        plan.whatsapp_enquiry,
      ),

    searchVisibility:
      plan.search_visibility,

    analyticsLevel:
      plan.analytics_level,

    features:
      parseArray(
        plan.plan_features_json,
      ),

    /*
     * Snapshot contains the provider metadata because server-side reconciliation
     * may require it later. It is not sent directly to the public browser.
     */
    razorpayPlanId:
      price.razorpay_plan_id ??
      plan.razorpay_plan_id ??
      null,

    snapshottedAt:
      nowIso(),
  };
}

/*
|--------------------------------------------------------------------------
| Owner authorization
|--------------------------------------------------------------------------
*/

function panditProfile(
  userId: number,
): SqlRow | null {
  return (
    db.prepare(`
      SELECT *
      FROM pandit_profiles
      WHERE user_id=?
      LIMIT 1
    `).get(
      userId,
    ) as SqlRow | undefined
  ) ?? null;
}

function activeTempleAssignment(
  userId: number,
  templeId: number,
): SqlRow | null {
  return (
    db.prepare(`
      SELECT *
      FROM temple_manager_assignments
      WHERE manager_user_id=?
        AND temple_id=?
        AND status='active'
      ORDER BY id DESC
      LIMIT 1
    `).get(
      userId,
      templeId,
    ) as SqlRow | undefined
  ) ?? null;
}

function activeAshramAssignment(
  userId: number,
  ashramId: number,
): SqlRow | null {
  return (
    db.prepare(`
      SELECT *
      FROM ashram_manager_assignments
      WHERE manager_user_id=?
        AND ashram_id=?
        AND status='active'
      ORDER BY id DESC
      LIMIT 1
    `).get(
      userId,
      ashramId,
    ) as SqlRow | undefined
  ) ?? null;
}

function assignedAshramManager(
  ashramId: number,
): number | null {
  const row =
    db.prepare(`
      SELECT
        ama.manager_user_id
      FROM ashram_manager_assignments ama
      INNER JOIN users u
        ON u.id=ama.manager_user_id
      INNER JOIN roles r
        ON r.id=u.role_id
      WHERE ama.ashram_id=?
        AND ama.status='active'
        AND u.status='active'
        AND r.code='ashram_manager'
      ORDER BY
        ama.assigned_at DESC,
        ama.id DESC
      LIMIT 1
    `).get(
      ashramId,
    ) as
      | {
          manager_user_id?: number;
        }
      | undefined;

  return positiveId(
    row?.manager_user_id,
  );
}

function assignedTempleManager(
  templeId: number,
): number | null {
  const row =
    db.prepare(`
      SELECT
        tma.manager_user_id
      FROM temple_manager_assignments tma
      INNER JOIN users u
        ON u.id=tma.manager_user_id
      INNER JOIN roles r
        ON r.id=u.role_id
      WHERE tma.temple_id=?
        AND tma.status='active'
        AND u.status='active'
        AND r.code='temple_manager'
      ORDER BY
        tma.assigned_at DESC,
        tma.id DESC
      LIMIT 1
    `).get(
      templeId,
    ) as
      | {
          manager_user_id?: number;
        }
      | undefined;

  return positiveId(
    row?.manager_user_id,
  );
}

function ownerExists(
  ownerType: OwnerType,
  ownerId: number,
): boolean {
  const table =
    ownerType === "pandit"
      ? "pandit_profiles"
      : ownerType === "temple"
        ? "temples"
        : "ashrams";

  return Boolean(
    db.prepare(`
      SELECT id
      FROM ${table}
      WHERE id=?
      LIMIT 1
    `).get(
      ownerId,
    ),
  );
}

function ownerCommerciallyEligible(
  ownerType: OwnerType,
  ownerId: number,
): boolean {
  if (
    ownerType === "pandit"
  ) {
    const row =
      db.prepare(`
        SELECT
          p.id,
          u.status AS user_status
        FROM pandit_profiles p
        INNER JOIN users u
          ON u.id=p.user_id
        WHERE p.id=?
        LIMIT 1
      `).get(
        ownerId,
      ) as
        | {
            id?: number;
            user_status?: string;
          }
        | undefined;

    return Boolean(
      row?.id,
    ) &&
      row?.user_status ===
        "active";
  }

  if (
    ownerType === "temple"
  ) {
    return Boolean(
      db.prepare(`
        SELECT id
        FROM temples
        WHERE id=?
          AND status NOT IN (
            'archived',
            'deleted'
          )
        LIMIT 1
      `).get(
        ownerId,
      ),
    );
  }

  return Boolean(
    db.prepare(`
      SELECT id
      FROM ashrams
      WHERE id=?
        AND status NOT IN (
          'archived',
          'deleted'
        )
      LIMIT 1
    `).get(
      ownerId,
    ),
  );
}

function canAccessOwner(
  user: AuthenticatedUser,
  ownerType: OwnerType,
  ownerId: number,
): boolean {
  if (
    user.role === "super_admin"
  ) {
    return true;
  }

  /*
   * Sales is restricted to the Ashram commercial pipeline only.
   * This is intentional.
   */
  if (
    user.role === "sales"
  ) {
    return ownerType === "ashram";
  }

  if (
    ownerType === "pandit" &&
    user.role === "pandit"
  ) {
    return (
      Number(
        panditProfile(
          user.id,
        )?.id ?? 0,
      ) === ownerId
    );
  }

  if (
    ownerType === "temple" &&
    user.role ===
      "temple_manager"
  ) {
    return Boolean(
      activeTempleAssignment(
        user.id,
        ownerId,
      ),
    );
  }

  if (
    ownerType === "ashram" &&
    user.role ===
      "ashram_manager"
  ) {
    return Boolean(
      activeAshramAssignment(
        user.id,
        ownerId,
      ),
    );
  }

  return false;
}

function resolveOwnerId(
  user: AuthenticatedUser,
  ownerType: OwnerType,
  requested: number | null,
): number | null {
  if (
    ownerType === "pandit" &&
    user.role === "pandit"
  ) {
    return positiveId(
      panditProfile(
        user.id,
      )?.id,
    );
  }

  return requested;
}

function managerIdForSubscription(
  user: AuthenticatedUser,
  ownerType: OwnerType,
  ownerId: number,
): number | null {
  if (
    ownerType === "pandit"
  ) {
    return ownerAccountId(
      ownerType,
      ownerId,
    );
  }

  if (
    ownerType === "temple"
  ) {
    return (
      assignedTempleManager(
        ownerId,
      ) ??
      (user.role ===
      "temple_manager"
        ? user.id
        : null)
    );
  }

  return (
    assignedAshramManager(
      ownerId,
    ) ??
    (user.role ===
    "ashram_manager"
      ? user.id
      : null)
  );
}

function ownerAccountId(
  ownerType: OwnerType,
  ownerId: number,
): number | null {
  if (
    ownerType === "pandit"
  ) {
    const row =
      db.prepare(`
        SELECT user_id
        FROM pandit_profiles
        WHERE id=?
        LIMIT 1
      `).get(
        ownerId,
      ) as
        | {
            user_id?: number;
          }
        | undefined;

    return positiveId(
      row?.user_id,
    );
  }

  if (
    ownerType === "temple"
  ) {
    return assignedTempleManager(
      ownerId,
    );
  }

  return assignedAshramManager(
    ownerId,
  );
}

/*
|--------------------------------------------------------------------------
| Subscription readers
|--------------------------------------------------------------------------
*/

function subscriptionTable(
  ownerType: OwnerType,
): string {
  return `${ownerType}_subscriptions`;
}

function subscriptionOwnerColumn(
  ownerType: OwnerType,
): string {
  return `${ownerType}_id`;
}

function getSubscriptionById(
  ownerType: OwnerType,
  subscriptionId: number,
): SubscriptionRow | null {
  const table =
    subscriptionTable(
      ownerType,
    );

  return (
    db.prepare(`
      SELECT
        s.*,
        p.code AS plan_code,
        p.name AS plan_name,
        p.description AS plan_description,
        p.price_amount AS plan_price_amount,
        p.currency AS plan_currency,
        p.billing_interval AS plan_billing_interval,
        p.duration_days AS plan_duration_days
      FROM ${table} s
      INNER JOIN subscription_plans p
        ON p.id=s.plan_id
      WHERE s.id=?
      LIMIT 1
    `).get(
      subscriptionId,
    ) as
      | SubscriptionRow
      | undefined
  ) ?? null;
}

function latestSubscription(
  ownerType: OwnerType,
  ownerId: number,
): SubscriptionRow | null {
  const table =
    subscriptionTable(
      ownerType,
    );

  const column =
    subscriptionOwnerColumn(
      ownerType,
    );

  return (
    db.prepare(`
      SELECT
        s.*,
        p.code AS plan_code,
        p.name AS plan_name,
        p.description AS plan_description,
        p.price_amount AS plan_price_amount,
        p.currency AS plan_currency,
        p.billing_interval AS plan_billing_interval,
        p.duration_days AS plan_duration_days
      FROM ${table} s
      INNER JOIN subscription_plans p
        ON p.id=s.plan_id
      WHERE s.${column}=?
      ORDER BY s.id DESC
      LIMIT 1
    `).get(
      ownerId,
    ) as
      | SubscriptionRow
      | undefined
  ) ?? null;
}

function currentSubscription(
  ownerType: OwnerType,
  ownerId: number,
): SubscriptionRow | null {
  const table =
    subscriptionTable(
      ownerType,
    );

  const column =
    subscriptionOwnerColumn(
      ownerType,
    );

  return (
    db.prepare(`
      SELECT
        s.*,
        p.code AS plan_code,
        p.name AS plan_name,
        p.description AS plan_description,
        p.price_amount AS plan_price_amount,
        p.currency AS plan_currency,
        p.billing_interval AS plan_billing_interval,
        p.duration_days AS plan_duration_days
      FROM ${table} s
      INNER JOIN subscription_plans p
        ON p.id=s.plan_id
      WHERE s.${column}=?
        AND s.status IN (
          'active',
          'pending',
          'paused',
          'payment_failed'
        )
        AND (
          s.expires_at IS NULL
          OR s.expires_at>=CURRENT_TIMESTAMP
        )
      ORDER BY
        CASE s.status
          WHEN 'active' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'paused' THEN 2
          ELSE 3
        END,
        s.id DESC
      LIMIT 1
    `).get(
      ownerId,
    ) as
      | SubscriptionRow
      | undefined
  ) ?? null;
}

function history(
  ownerType: OwnerType,
  ownerId: number,
): SubscriptionRow[] {
  const table =
    subscriptionTable(
      ownerType,
    );

  const column =
    subscriptionOwnerColumn(
      ownerType,
    );

  return db.prepare(`
    SELECT
      s.*,
      p.code AS plan_code,
      p.name AS plan_name,
      p.description AS plan_description,
      p.price_amount AS plan_price_amount,
      p.currency AS plan_currency,
      p.billing_interval AS plan_billing_interval,
      p.duration_days AS plan_duration_days
    FROM ${table} s
    INNER JOIN subscription_plans p
      ON p.id=s.plan_id
    WHERE s.${column}=?
    ORDER BY s.id DESC
    LIMIT 200
  `).all(
    ownerId,
  ) as SubscriptionRow[];
}

function serializeSubscription(
  ownerType: OwnerType,
  row: SubscriptionRow | null,
): Record<string, unknown> | null {
  if (!row) {
    return null;
  }

  const snapshot =
    parseObject(
      row.plan_snapshot_json,
    );

  const leadLimit =
    Number(
      row.lead_limit ?? 0,
    );

  const leadsUsed =
    Number(
      row.leads_used ?? 0,
    );

  const ownerId =
    positiveId(
      row[
        subscriptionOwnerColumn(
          ownerType,
        )
      ],
    );

  return {
    id: Number(row.id),

    subscriptionId:
      Number(row.id),

    ownerType,

    ownerId,

    panditId:
      ownerType === "pandit"
        ? positiveId(
            row.pandit_id,
          )
        : null,

    templeId:
      ownerType === "temple"
        ? positiveId(
            row.temple_id,
          )
        : null,

    ashramId:
      ownerType === "ashram"
        ? positiveId(
            row.ashram_id,
          )
        : null,

    managerUserId:
      ownerType ===
          "ashram" ||
      ownerType ===
          "temple"
        ? ownerId
          ? ownerAccountId(
              ownerType,
              ownerId,
            )
          : null
        : null,

    planId:
      Number(row.plan_id),

    planCode:
      row.plan_code ??
      null,

    planName:
      row.plan_name ??
      null,

    planDescription:
      row.plan_description ??
      null,

    priceVariantId:
      positiveId(
        row.subscription_plan_price_id,
      ),

    paymentProvider:
      text(
        snapshot.provider ??
          SUPPORTED_PAYMENT_PROVIDER,
        50,
      ).toLowerCase() ||
      SUPPORTED_PAYMENT_PROVIDER,

    priceAmount:
      Number(
        row.price_amount ?? 0,
      ),

    currency:
      String(
        row.currency ??
          "INR",
      ),

    billingInterval:
      row.billing_interval ??
      row.plan_billing_interval ??
      "monthly",

    durationDays:
      Number(
        row.duration_days ??
          row.plan_duration_days ??
          30,
      ),

    status:
      row.status,

    startsAt:
      row.starts_at,

    expiresAt:
      row.expires_at,

    daysToExpiry:
      daysUntil(
        row.expires_at,
      ),

    leadLimit,

    leadsUsed,

    leadsRemaining:
      Math.max(
        0,
        leadLimit -
          leadsUsed,
      ),

    serviceLimit:
      Number(
        row.service_limit ??
          0,
      ),

    serviceAreaLimit:
      Number(
        row.service_area_limit ??
          0,
      ),

    galleryLimit:
      Number(
        row.gallery_limit ??
          0,
      ),

    videoLimit:
      Number(
        row.video_limit ??
          0,
      ),

    programLimit:
      Number(
        row.program_limit ??
          0,
      ),

    autoRenew:
      Boolean(
        row.auto_renew,
      ),

    listingEnabled:
      Boolean(
        row.listing_enabled,
      ),

    featuredListing:
      Boolean(
        row.featured_listing,
      ),

    prioritySupport:
      Boolean(
        row.priority_support,
      ),

    verificationBadge:
      Boolean(
        row.verification_badge,
      ),

    analyticsAccess:
      Boolean(
        row.analytics_access,
      ),

    homepagePromotion:
      Boolean(
        row.homepage_promotion,
      ),

    liveAartiEnabled:
      Boolean(
        row.live_aarti_enabled,
      ),

    enhancedSeo:
      Boolean(
        row.enhanced_seo,
      ),

    enhancedProfile:
      Boolean(
        row.enhanced_profile,
      ),

    whatsappEnquiry:
      Boolean(
        row.whatsapp_enquiry,
      ),

    searchVisibility:
      row.search_visibility,

    analyticsLevel:
      row.analytics_level,

    razorpaySubscriptionId:
      row.razorpay_subscription_id ??
      null,

    paymentOrderId:
      positiveId(
        row.payment_order_id,
      ),

    paymentId:
      positiveId(
        row.payment_id,
      ),

    planSnapshot:
      snapshot,

    notes:
      row.notes ??
      null,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

/*
|--------------------------------------------------------------------------
| Payment visibility
|--------------------------------------------------------------------------
*/

function paymentSummary(
  ownerType: OwnerType,
  row: SubscriptionRow | null,
): Record<string, unknown> | null {
  if (!row) {
    return null;
  }

  const paymentId =
    positiveId(
      row.payment_id,
    );

  const orderId =
    positiveId(
      row.payment_order_id,
    );

  let payment:
    | SqlRow
    | null = null;

  let order:
    | SqlRow
    | null = null;

  if (
    paymentId &&
    tableExists("payments")
  ) {
    payment =
      (
        db.prepare(`
          SELECT
            id,
            payment_number,
            payment_order_id,
            amount,
            amount_paise,
            currency,
            provider,
            provider_order_id,
            provider_payment_id,
            status,
            payment_method,
            paid_at,
            failed_at,
            refund_amount_paise,
            refunded_at,
            receipt,
            created_at,
            updated_at
          FROM payments
          WHERE id=?
          LIMIT 1
        `).get(
          paymentId,
        ) as
          | SqlRow
          | undefined
      ) ?? null;
  }

  if (
    orderId &&
    tableExists(
      "payment_orders",
    )
  ) {
    order =
      (
        db.prepare(`
          SELECT
            id,
            order_number,
            plan_id,
            purpose,
            amount,
            amount_paise,
            currency,
            provider,
            provider_order_id,
            status,
            receipt,
            expires_at,
            created_at,
            updated_at
          FROM payment_orders
          WHERE id=?
          LIMIT 1
        `).get(
          orderId,
        ) as
          | SqlRow
          | undefined
      ) ?? null;
  }

  if (
    !payment &&
    !order
  ) {
    return null;
  }

  return {
    ownerType,
    payment,
    order,
  };
}

/*
|--------------------------------------------------------------------------
| Subscription events
|--------------------------------------------------------------------------
*/

function subscriptionEvent(params: {
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
      subscription_type,
      subscription_id,
      payment_order_id,
      payment_id,
      user_id,
      event_type,
      old_status,
      new_status,
      old_expires_at,
      new_expires_at,
      notes,
      metadata_json,
      created_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    )
  `).run(
    params.ownerType,
    params.subscriptionId,
    params.paymentOrderId ??
      null,
    params.paymentId ??
      null,
    params.userId ??
      null,
    params.eventType,
    params.oldStatus ??
      null,
    params.newStatus ??
      null,
    params.oldExpiresAt ??
      null,
    params.newExpiresAt ??
      null,
    params.notes ??
      null,
    jsonObject(
      params.metadata,
    ),
  );
}

function syncPanditListing(
  panditId: number,
  allowed: boolean,
): void {
  if (
    !tableExists(
      "pandit_profiles",
    )
  ) {
    return;
  }

  db.prepare(`
    UPDATE pandit_profiles
    SET
      listing_active =
        CASE
          WHEN profile_status='approved'
            AND ?=1
          THEN 1
          ELSE 0
        END,
      updated_at=
        CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    allowed ? 1 : 0,
    panditId,
  );
}

/*
|--------------------------------------------------------------------------
| Expiry maintenance
|--------------------------------------------------------------------------
*/

function expireSubscriptions(): number {
  let changedCount = 0;

  for (
    const ownerType of OWNER_TYPES
  ) {
    const table =
      subscriptionTable(
        ownerType,
      );

    const column =
      subscriptionOwnerColumn(
        ownerType,
      );

    const candidates =
      db.prepare(`
        SELECT
          id,
          ${column} AS owner_id,
          status,
          expires_at,
          payment_order_id,
          payment_id
        FROM ${table}
        WHERE expires_at IS NOT NULL
          AND expires_at<CURRENT_TIMESTAMP
          AND status IN (
            'active',
            'pending',
            'paused',
            'payment_failed'
          )
      `).all() as Array<{
        id: number;
        owner_id: number;
        status: SubscriptionStatus;
        expires_at: string;
        payment_order_id:
          | number
          | null;
        payment_id:
          | number
          | null;
      }>;

    for (
      const row of candidates
    ) {
      const changed =
        db.transaction(
          () => {
            const result =
              db.prepare(`
                UPDATE ${table}
                SET
                  status='expired',
                  auto_renew=0,
                  updated_at=CURRENT_TIMESTAMP
                WHERE id=?
                  AND status=?
              `).run(
                row.id,
                row.status,
              );

            if (
              result.changes !== 1
            ) {
              return false;
            }

            if (
              ownerType ===
              "pandit"
            ) {
              syncPanditListing(
                row.owner_id,
                false,
              );
            }

            subscriptionEvent(
              {
                ownerType,
                subscriptionId:
                  row.id,
                userId: null,
                eventType:
                  "expired",
                oldStatus:
                  row.status,
                newStatus:
                  "expired",
                oldExpiresAt:
                  row.expires_at,
                newExpiresAt:
                  row.expires_at,
                paymentOrderId:
                  row.payment_order_id,
                paymentId:
                  row.payment_id,
                notes:
                  "Subscription expired automatically.",
                metadata: {
                  automatic:
                    true,
                  ownerId:
                    row.owner_id,
                },
              },
            );

            return true;
          },
        )();

      if (changed) {
        changedCount += 1;
      }
    }
  }

  return changedCount;
}

/*
|--------------------------------------------------------------------------
| Pending intents
|--------------------------------------------------------------------------
*/

function cancelOpenPending(
  ownerType: OwnerType,
  ownerId: number,
  actorId: number,
  reason: string,
): void {
  const table =
    subscriptionTable(
      ownerType,
    );

  const column =
    subscriptionOwnerColumn(
      ownerType,
    );

  const rows =
    db.prepare(`
      SELECT
        id,
        status,
        expires_at,
        payment_order_id,
        payment_id
      FROM ${table}
      WHERE ${column}=?
        AND status IN (
          'pending',
          'payment_failed',
          'paused'
        )
      ORDER BY id DESC
    `).all(
      ownerId,
    ) as Array<{
      id: number;
      status: SubscriptionStatus;
      expires_at:
        | string
        | null;
      payment_order_id:
        | number
        | null;
      payment_id:
        | number
        | null;
    }>;

  for (
    const row of rows
  ) {
    db.prepare(`
      UPDATE ${table}
      SET
        status='cancelled',
        auto_renew=0,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      row.id,
    );

    subscriptionEvent(
      {
        ownerType,
        subscriptionId:
          row.id,
        userId:
          actorId,
        eventType:
          "superseded_pending",
        oldStatus:
          row.status,
        newStatus:
          "cancelled",
        oldExpiresAt:
          row.expires_at,
        newExpiresAt:
          row.expires_at,
        paymentOrderId:
          row.payment_order_id,
        paymentId:
          row.payment_id,
        notes:
          reason,
        metadata: {
          ownerId,
        },
      },
    );
  }
}

/*
|--------------------------------------------------------------------------
| Create pending subscription intent
|--------------------------------------------------------------------------
*/

function createPending(
  params: {
    ownerType: OwnerType;
    ownerId: number;
    managerUserId: number | null;
    plan: PlanRow;
    price: PriceVariantRow;
    notes: string | null;
    actorId: number;
  },
): number {
  const table =
    subscriptionTable(
      params.ownerType,
    );

  if (
    !isCanonicalPlanCode(
      params.ownerType,
      params.plan.code,
    )
  ) {
    throw new Error(
      "SUBSCRIPTION_PLAN_UNSUPPORTED",
    );
  }

  if (
    text(
      params.price.provider,
      50,
    ).toLowerCase() !==
    SUPPORTED_PAYMENT_PROVIDER
  ) {
    throw new Error(
      "SUBSCRIPTION_PAYMENT_PROVIDER_UNSUPPORTED",
    );
  }

  if (
    !isValidCurrency(
      params.price.currency,
    ) ||
    normalizedCurrency(
      params.price.currency,
    ) !== "INR"
  ) {
    throw new Error(
      "SUBSCRIPTION_CURRENCY_UNSUPPORTED",
    );
  }

  const amount =
    positiveMoneyAmount(
      params.price.price_amount,
    );

  if (
    amount === null
  ) {
    throw new Error(
      "SUBSCRIPTION_PRICE_INVALID",
    );
  }

  if (
    !Number.isSafeInteger(
      params.price.duration_days,
    ) ||
    params.price.duration_days <
      MIN_DURATION_DAYS ||
    params.price.duration_days >
      MAX_DURATION_DAYS
  ) {
    throw new Error(
      "SUBSCRIPTION_DURATION_INVALID",
    );
  }

  const snapshot =
    buildSnapshot(
      params.plan,
      params.price,
    );

  /*
   * Ensures there is never more than one open unpaid intent for an owner.
   */
  cancelOpenPending(
    params.ownerType,
    params.ownerId,
    params.actorId,
    "Previous unfinished payment intent was superseded by a new subscription intent.",
  );

  const columns = [
    `${params.ownerType}_id`,

    ...(params.ownerType ===
    "pandit"
      ? []
      : ["manager_user_id"]),

    "plan_id",
    "subscription_plan_price_id",
    "billing_interval",
    "duration_days",
    "status",
    "starts_at",
    "expires_at",
    "lead_limit",
    "leads_used",
    "price_amount",
    "currency",
    "service_limit",
    "service_area_limit",
    "gallery_limit",
    "video_limit",
    "program_limit",
    "auto_renew",
    "payment_order_id",
    "payment_id",
    "listing_enabled",
    "featured_listing",
    "priority_support",
    "verification_badge",
    "analytics_access",
    "homepage_promotion",
    "live_aarti_enabled",
    "enhanced_seo",
    "enhanced_profile",
    "whatsapp_enquiry",
    "search_visibility",
    "analytics_level",
    "razorpay_subscription_id",
    "plan_snapshot_json",
    "notes",
  ];

  const values: unknown[] = [
    params.ownerId,

    ...(params.ownerType ===
    "pandit"
      ? []
      : [
          params.managerUserId,
        ]),

    params.plan.id,
    params.price.id,

    params.price.billing_interval,
    params.price.duration_days,

    "pending",

    null,
    null,

    params.plan.lead_limit,
    0,

    amount,
    normalizedCurrency(
      params.price.currency,
    ),

    params.plan.service_limit,
    params.plan.service_area_limit,
    params.plan.gallery_limit,
    params.plan.video_limit,
    params.plan.program_limit,

    0,

    null,
    null,

    params.plan.listing_enabled,
    params.plan.featured_listing,
    params.plan.priority_support,
    params.plan.verification_badge,
    params.plan.analytics_access,
    params.plan.homepage_promotion,
    params.plan.live_aarti_enabled,
    params.plan.enhanced_seo,
    params.plan.enhanced_profile,
    params.plan.whatsapp_enquiry,
    params.plan.search_visibility,
    params.plan.analytics_level,

    null,

    jsonObject(
      snapshot,
    ),

    params.notes ??
      "Awaiting verified payment.",
  ];

  const result =
    db.prepare(`
      INSERT INTO ${table} (
        ${columns.join(",")},
        created_at,
        updated_at
      )
      VALUES (
        ${values
          .map(() => "?")
          .join(",")},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `).run(
      ...values,
    );

  return Number(
    result.lastInsertRowid,
  );
}

/*
|--------------------------------------------------------------------------
| PUBLIC COMMERCIAL CATALOGUE
|--------------------------------------------------------------------------
|
| IMPORTANT:
| These endpoints do NOT require authentication.
|--------------------------------------------------------------------------
*/

router.get(
  "/plans",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const ownerType =
        normalizeOwnerType(
          req.query.ownerType ??
            req.query.audience,
        );

      const interval =
        requireBillingInterval(
          req.query
            .billingInterval ??
            req.query.interval,
        );

      if (!interval) {
        res.status(400).json({
          success: false,
          error:
            "Only monthly subscription pricing is currently available.",
        });
        return;
      }

      const audiences =
        ownerType
          ? [ownerType]
          : [...OWNER_TYPES];

      const plans =
        audiences.flatMap(
          (audience) =>
            listPlans(
              audience,
            )
              .map(
                (plan) => {
                  const offer =
                    effectiveOffer(
                      plan,
                      interval,
                    );

                  return offer
                    ? serializePlan(
                        offer.plan,
                        offer.price,
                      )
                    : null;
                },
              )
              .filter(
                Boolean,
              ),
        ) as Record<
          string,
          unknown
        >[];

      /*
       * When an ownerType was requested, echo it in the response so the
       * frontend can verify that it received the expected catalogue.
       */
      res.json({
        success: true,

        ownerType:
          ownerType ?? null,

        currency: "INR",

        billingInterval:
          interval,

        monthlyOnly:
          PUBLIC_MONTHLY_ONLY,

        plans,
      });
    } catch (error) {
      console.error(
        "Subscription plans error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription plans.",
      });
    }
  },
);

router.get(
  "/plans/:audience",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const ownerType =
        normalizeOwnerType(
          req.params.audience,
        );

      if (!ownerType) {
        res.status(400).json({
          success: false,
          error:
            "Invalid subscription audience.",
        });
        return;
      }

      const interval =
        requireBillingInterval(
          req.query
            .billingInterval ??
            req.query.interval,
        );

      if (!interval) {
        res.status(400).json({
          success: false,
          error:
            "Only monthly subscription pricing is currently available.",
        });
        return;
      }

      const plans =
        listPlans(
          ownerType,
        )
          .map(
            (plan) => {
              const offer =
                effectiveOffer(
                  plan,
                  interval,
                );

              return offer
                ? serializePlan(
                    offer.plan,
                    offer.price,
                  )
                : null;
            },
          )
          .filter(
            Boolean,
          );

      res.json({
        success: true,
        ownerType,
        billingInterval:
          interval,
        monthlyOnly:
          PUBLIC_MONTHLY_ONLY,
        plans,
      });
    } catch (error) {
      console.error(
        "Subscription audience plans error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription plans.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Public Razorpay configuration
|--------------------------------------------------------------------------
|
| Only publishable configuration is exposed.
| Secret key is never exposed.
|--------------------------------------------------------------------------
*/

router.get(
  "/config",
  (
    _req,
    res,
  ) => {
    const keyId =
      text(
        process.env
          .RAZORPAY_KEY_ID,
        200,
      );

    res.json({
      success: true,

      razorpay: {
        configured:
          Boolean(keyId),

        keyId,

        mode:
          text(
            process.env
              .RAZORPAY_MODE ??
              process.env
                .PAYMENT_ENVIRONMENT,
            20,
          ).toLowerCase() ===
          "live"
            ? "live"
            : "test",

        currency:
          normalizedCurrency(
            process.env
              .RAZORPAY_CURRENCY ??
              process.env
                .PAYMENT_CURRENCY ??
              "INR",
          ),

        companyName:
          text(
            process.env
              .RAZORPAY_COMPANY_NAME ??
              process.env
                .PAYMENT_COMPANY_NAME ??
              process.env
                .COMPANY_NAME,
            200,
          ) ||
          "DivyaDhara",

        publicOnly:
          true,
      },
    });
  },
);

/*
|--------------------------------------------------------------------------
| Commercial readiness
|--------------------------------------------------------------------------
|
| Operational/system readiness is Super Admin information.
|--------------------------------------------------------------------------
*/

router.get(
  "/readiness",
  requireAuth,
  requireRole(
    "super_admin",
  ),
  (
    _req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const activePlans =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM subscription_plans
          WHERE is_active=1
            AND code IN (
              'pandit_basic',
              'pandit_premium',
              'temple_basic',
              'temple_premium',
              'ashram_basic',
              'ashram_premium'
            )
        `).get() as
          | {
              count?: number;
            }
          | undefined;

      const activeMonthlyVariants =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM subscription_plan_prices spp
          INNER JOIN subscription_plans sp
            ON sp.id=spp.plan_id
          WHERE spp.is_active=1
            AND spp.billing_interval='monthly'
            AND spp.currency='INR'
            AND LOWER(spp.provider)='razorpay'
            AND sp.is_active=1
            AND sp.code IN (
              'pandit_basic',
              'pandit_premium',
              'temple_basic',
              'temple_premium',
              'ashram_basic',
              'ashram_premium'
            )
        `).get() as
          | {
              count?: number;
            }
          | undefined;

      const razorpayKeyConfigured =
        Boolean(
          text(
            process.env
              .RAZORPAY_KEY_ID,
            200,
          ),
        );

      const planCount =
        Number(
          activePlans?.count ??
            0,
        );

      const priceCount =
        Number(
          activeMonthlyVariants
            ?.count ?? 0,
        );

      const plansReady =
        planCount === 6;

      const pricesReady =
        priceCount === 6;

      res.json({
        success: true,

        ready:
          plansReady &&
          pricesReady &&
          razorpayKeyConfigured,

        commercialCatalogue: {
          canonicalPlanCount:
            planCount,

          activeMonthlyPriceVariantCount:
            priceCount,

          monthlyOnly:
            PUBLIC_MONTHLY_ONLY,

          currency:
            "INR",
        },

        paymentProvider: {
          provider:
            SUPPORTED_PAYMENT_PROVIDER,

          configured:
            razorpayKeyConfigured,
        },
      });
    } catch (error) {
      console.error(
        "Subscription readiness error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to check subscription readiness.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Authentication starts here
|--------------------------------------------------------------------------
*/

router.use(
  requireAuth,
);

/*
|--------------------------------------------------------------------------
| Current / history / usage
|--------------------------------------------------------------------------
*/

router.get(
  "/me",
  (
    _req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      const result: Record<
        string,
        unknown
      > = {
        pandit: null,
        temple: [],
        ashram: [],
      };

      const profile =
        panditProfile(
          user.id,
        );

      if (profile?.id) {
        const id =
          Number(
            profile.id,
          );

        const subscription =
          currentSubscription(
            "pandit",
            id,
          );

        result.pandit = {
          ownerId: id,

          subscription:
            serializeSubscription(
              "pandit",
              subscription,
            ),

          payment:
            paymentSummary(
              "pandit",
              subscription,
            ),
        };
      }

      const temples =
        user.role ===
        "temple_manager"
          ? (db
              .prepare(`
                SELECT DISTINCT
                  temple_id
                FROM temple_manager_assignments
                WHERE manager_user_id=?
                  AND status='active'
                ORDER BY temple_id ASC
              `)
              .all(
                user.id,
              ) as Array<{
                temple_id: number;
              }>)
          : [];

      result.temple =
        temples.map(
          (row) => {
            const subscription =
              currentSubscription(
                "temple",
                row.temple_id,
              );

            return {
              ownerId:
                row.temple_id,

              subscription:
                serializeSubscription(
                  "temple",
                  subscription,
                ),

              payment:
                paymentSummary(
                  "temple",
                  subscription,
                ),
            };
          },
        );

      if (
        user.role ===
        "ashram_manager"
      ) {
        const ashrams =
          db
            .prepare(`
              SELECT DISTINCT
                ashram_id
              FROM ashram_manager_assignments
              WHERE manager_user_id=?
                AND status='active'
              ORDER BY ashram_id ASC
            `)
            .all(
              user.id,
            ) as Array<{
              ashram_id: number;
            }>;

        result.ashram =
          ashrams.map(
            (row) => {
              const subscription =
                currentSubscription(
                  "ashram",
                  row.ashram_id,
                );

              return {
                ownerId:
                  row.ashram_id,

                subscription:
                  serializeSubscription(
                    "ashram",
                    subscription,
                  ),

                payment:
                  paymentSummary(
                    "ashram",
                    subscription,
                  ),
              };
            },
          );
      }

      res.json({
        success: true,
        userId:
          user.id,
        subscriptions:
          result,
      });
    } catch (error) {
      console.error(
        "Subscription /me error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load your subscriptions.",
      });
    }
  },
);

router.get(
  "/dashboard",
  (
    _req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      const allowedTypes =
        OWNER_TYPES.filter(
          (type) =>
            type !==
              "ashram" ||
            [
              "ashram_manager",
              "sales",
              "super_admin",
            ].includes(
              user.role,
            ),
        );

      const plans =
        allowedTypes.reduce<
          Record<
            string,
            unknown[]
          >
        >(
          (
            accumulator,
            type,
          ) => {
            accumulator[type] =
              listPlans(
                type,
              )
                .map(
                  (plan) => {
                    const offer =
                      effectiveOffer(
                        plan,
                        "monthly",
                      );

                    return offer
                      ? serializePlan(
                          offer.plan,
                          offer.price,
                        )
                      : null;
                  },
                )
                .filter(
                  Boolean,
                );

            return accumulator;
          },
          {},
        );

      res.json({
        success: true,

        user: {
          id: user.id,
          role: user.role,
          name: user.name,
        },

        plans,
      });
    } catch (error) {
      console.error(
        "Subscription dashboard error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription dashboard.",
      });
    }
  },
);

router.get(
  "/current",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.query.ownerType ??
            req.query.audience,
        );

      const requestedOwnerId =
        positiveId(
          req.query.ownerId,
        );

      if (!ownerType) {
        res.status(400).json({
          success: false,
          error:
            "ownerType is required.",
        });
        return;
      }

      const ownerId =
        resolveOwnerId(
          user,
          ownerType,
          requestedOwnerId,
        );

      if (!ownerId) {
        res.status(400).json({
          success: false,
          error:
            "ownerId could not be resolved.",
        });
        return;
      }

      if (
        !ownerExists(
          ownerType,
          ownerId,
        )
      ) {
        res.status(404).json({
          success: false,
          error:
            "Subscription owner was not found.",
        });
        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "You do not have access to this subscription.",
        });
        return;
      }

      const subscription =
        currentSubscription(
          ownerType,
          ownerId,
        );

      res.json({
        success: true,
        ownerType,
        ownerId,

        subscription:
          serializeSubscription(
            ownerType,
            subscription,
          ),

        payment:
          paymentSummary(
            ownerType,
            subscription,
          ),
      });
    } catch (error) {
      console.error(
        "Current subscription error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load current subscription.",
      });
    }
  },
);

router.get(
  "/history",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      const requestedType =
        normalizeOwnerType(
          req.query.ownerType ??
            req.query.audience,
        );

      const requestedId =
        positiveId(
          req.query.ownerId,
        );

      const result: Record<
        string,
        unknown[]
      > = {
        pandit: [],
        temple: [],
        ashram: [],
      };

      if (
        !requestedType ||
        requestedType ===
          "pandit"
      ) {
        let ids: number[] = [];

        if (
          user.role ===
          "super_admin"
        ) {
          ids = requestedId
            ? [requestedId]
            : (
                db
                  .prepare(`
                    SELECT id
                    FROM pandit_profiles
                    ORDER BY id
                    LIMIT 250
                  `)
                  .all() as Array<{
                    id: number;
                  }>
              ).map(
                (row) =>
                  row.id,
              );
        } else if (
          user.role ===
          "pandit"
        ) {
          const profileId =
            positiveId(
              panditProfile(
                user.id,
              )?.id,
            );

          if (profileId) {
            ids = [
              profileId,
            ];
          }
        }

        result.pandit =
          ids
            .filter(
              (id) =>
                canAccessOwner(
                  user,
                  "pandit",
                  id,
                ),
            )
            .flatMap(
              (id) =>
                history(
                  "pandit",
                  id,
                ).map(
                  (row) =>
                    serializeSubscription(
                      "pandit",
                      row,
                    ) as Record<
                      string,
                      unknown
                    >,
                ),
            );
      }

      if (
        !requestedType ||
        requestedType ===
          "temple"
      ) {
        let ids: number[] = [];

        if (
          user.role ===
          "super_admin"
        ) {
          ids = requestedId
            ? [requestedId]
            : (
                db
                  .prepare(`
                    SELECT id
                    FROM temples
                    ORDER BY id
                    LIMIT 250
                  `)
                  .all() as Array<{
                    id: number;
                  }>
              ).map(
                (row) =>
                  row.id,
              );
        } else if (
          user.role ===
          "temple_manager"
        ) {
          ids = (
            db
              .prepare(`
                SELECT DISTINCT
                  temple_id
                FROM temple_manager_assignments
                WHERE manager_user_id=?
                  AND status='active'
              `)
              .all(
                user.id,
              ) as Array<{
                temple_id: number;
              }>
          ).map(
            (row) =>
              row.temple_id,
          );

          if (requestedId) {
            ids =
              ids.filter(
                (id) =>
                  id ===
                  requestedId,
              );
          }
        }

        result.temple =
          ids
            .filter(
              (id) =>
                canAccessOwner(
                  user,
                  "temple",
                  id,
                ),
            )
            .flatMap(
              (id) =>
                history(
                  "temple",
                  id,
                ).map(
                  (row) =>
                    serializeSubscription(
                      "temple",
                      row,
                    ) as Record<
                      string,
                      unknown
                    >,
                ),
            );
      }

      if (
        !requestedType ||
        requestedType ===
          "ashram"
      ) {
        let ids: number[] = [];

        if (
          user.role ===
            "super_admin" ||
          user.role ===
            "sales"
        ) {
          ids = requestedId
            ? [requestedId]
            : (
                db
                  .prepare(`
                    SELECT id
                    FROM ashrams
                    ORDER BY id
                    LIMIT 500
                  `)
                  .all() as Array<{
                    id: number;
                  }>
              ).map(
                (row) =>
                  row.id,
              );
        } else if (
          user.role ===
          "ashram_manager"
        ) {
          ids = (
            db
              .prepare(`
                SELECT DISTINCT
                  ashram_id
                FROM ashram_manager_assignments
                WHERE manager_user_id=?
                  AND status='active'
              `)
              .all(
                user.id,
              ) as Array<{
                ashram_id: number;
              }>
          ).map(
            (row) =>
              row.ashram_id,
          );

          if (requestedId) {
            ids =
              ids.filter(
                (id) =>
                  id ===
                  requestedId,
              );
          }
        }

        result.ashram =
          ids
            .filter(
              (id) =>
                canAccessOwner(
                  user,
                  "ashram",
                  id,
                ),
            )
            .flatMap(
              (id) =>
                history(
                  "ashram",
                  id,
                ).map(
                  (row) =>
                    serializeSubscription(
                      "ashram",
                      row,
                    ) as Record<
                      string,
                      unknown
                    >,
                ),
            );
      }

      res.json({
        success: true,
        history:
          result,
      });
    } catch (error) {
      console.error(
        "Subscription history error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription history.",
      });
    }
  },
);

router.get(
  "/:ownerType/:ownerId/usage",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });
        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "You do not have access to this subscription.",
        });
        return;
      }

      const subscription =
        currentSubscription(
          ownerType,
          ownerId,
        );

      if (!subscription) {
        res.json({
          success: true,
          ownerType,
          ownerId,
          hasSubscription:
            false,

          usage: {
            leadLimit: 0,
            leadsUsed: 0,
            leadsRemaining: 0,
            utilizationPercent: 0,
          },
        });

        return;
      }

      const leadLimit =
        Number(
          subscription.lead_limit ??
            0,
        );

      const leadsUsed =
        Number(
          subscription.leads_used ??
            0,
        );

      res.json({
        success: true,
        ownerType,
        ownerId,
        hasSubscription:
          true,

        subscription:
          serializeSubscription(
            ownerType,
            subscription,
          ),

        usage: {
          leadLimit,
          leadsUsed,

          leadsRemaining:
            Math.max(
              0,
              leadLimit -
                leadsUsed,
            ),

          utilizationPercent:
            leadLimit > 0
              ? Number(
                  (
                    (leadsUsed /
                      leadLimit) *
                    100
                  ).toFixed(2),
                )
              : 0,

          exhausted:
            leadLimit > 0 &&
            leadsUsed >=
              leadLimit,

          serviceLimit:
            Number(
              subscription.service_limit ??
                0,
            ),

          serviceAreaLimit:
            Number(
              subscription.service_area_limit ??
                0,
            ),

          galleryLimit:
            Number(
              subscription.gallery_limit ??
                0,
            ),

          videoLimit:
            Number(
              subscription.video_limit ??
                0,
            ),

          programLimit:
            Number(
              subscription.program_limit ??
                0,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Subscription usage error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription usage.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| PREPARE CHECKOUT INTENT
|--------------------------------------------------------------------------
|
| The client may submit:
|   ownerType
|   ownerId
|   planId OR planCode
|   priceVariantId
|   billingInterval
|
| The server resolves the actual plan and price from SQLite.
|--------------------------------------------------------------------------
*/

router.post(
  "/prepare",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const body =
        bodyOf(req);

      const ownerType =
        normalizeOwnerType(
          body.ownerType ??
            body.audience,
        );

      const requestedOwnerId =
        positiveId(
          body.ownerId ??
            body.panditId ??
            body.templeId ??
            body.ashramId,
        );

      const planId =
        positiveId(
          body.planId,
        );

      const interval =
        requireBillingInterval(
          body.billingInterval ??
            body.interval,
        );

      const requestedPriceVariantId =
        positiveId(
          body.priceVariantId,
        );

      const requestedPlanCode =
        text(
          body.planCode,
          100,
        ).toLowerCase();

      if (!ownerType) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType is required.",
        });

        return;
      }

      if (
        !planId &&
        !requestedPlanCode
      ) {
        res.status(400).json({
          success: false,
          error:
            "planId or planCode is required.",
        });

        return;
      }

      if (!interval) {
        res.status(400).json({
          success: false,
          error:
            "Only monthly subscription pricing is currently available.",
        });

        return;
      }

      /*
       * Sales is Ashram-only.
       */
      if (
        user.role ===
          "sales" &&
        ownerType !==
          "ashram"
      ) {
        res.status(403).json({
          success: false,
          error:
            "Sales can manage only Ashram subscriptions.",
        });

        return;
      }

      const ownerId =
        resolveOwnerId(
          user,
          ownerType,
          requestedOwnerId,
        );

      if (!ownerId) {
        res.status(400).json({
          success: false,
          error:
            "Subscription owner could not be resolved.",
        });

        return;
      }

      if (
        !ownerExists(
          ownerType,
          ownerId,
        )
      ) {
        res.status(404).json({
          success: false,
          error:
            "Subscription owner was not found.",
        });

        return;
      }

      if (
        !ownerCommerciallyEligible(
          ownerType,
          ownerId,
        )
      ) {
        res.status(409).json({
          success: false,
          error:
            "This subscription owner is not currently eligible for commercial subscription checkout.",
        });

        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "This account cannot manage this subscription.",
        });

        return;
      }

      const plan =
        planId
          ? getPlan(
              planId,
              ownerType,
            )
          : getPlanByCode(
              requestedPlanCode,
              ownerType,
            );

      if (!plan) {
        res.status(404).json({
          success: false,
          error:
            "Selected plan was not found or is inactive.",
        });

        return;
      }

      if (
        !isCanonicalPlanCode(
          ownerType,
          plan.code,
        )
      ) {
        res.status(409).json({
          success: false,
          error:
            "Selected plan is not a canonical commercial plan.",
        });

        return;
      }

      const offer =
        effectiveOffer(
          plan,
          interval,
        );

      if (!offer) {
        res.status(409).json({
          success: false,
          error:
            "No active Razorpay price variant is available for this plan and billing interval.",
        });

        return;
      }

      /*
       * Prevent stale frontend price variants from being silently accepted.
       */
      if (
        requestedPriceVariantId &&
        requestedPriceVariantId !==
          offer.price.id
      ) {
        res.status(409).json({
          success: false,

          code:
            "PRICE_VARIANT_MISMATCH",

          error:
            "The selected subscription price variant is no longer current. Reload the plan catalogue and try again.",

          authoritativePlan:
            serializePlan(
              plan,
              offer.price,
            ),
        });

        return;
      }

      expireSubscriptions();

      const current =
        currentSubscription(
          ownerType,
          ownerId,
        );

      if (
        current?.status ===
          "active" &&
        Number(
          current.plan_id,
        ) ===
          plan.id
      ) {
        res.status(409).json({
          success: false,
          error:
            "This subscription plan is already active.",

          subscription:
            serializeSubscription(
              ownerType,
              current,
            ),
        });

        return;
      }

      const pending =
        db.prepare(`
          SELECT
            s.*,
            p.code AS plan_code,
            p.name AS plan_name,
            p.description AS plan_description,
            p.price_amount AS plan_price_amount,
            p.currency AS plan_currency,
            p.billing_interval AS plan_billing_interval,
            p.duration_days AS plan_duration_days
          FROM ${subscriptionTable(
            ownerType,
          )} s
          INNER JOIN subscription_plans p
            ON p.id=s.plan_id
          WHERE s.${subscriptionOwnerColumn(
            ownerType,
          )}=?
            AND s.status='pending'
          ORDER BY s.id DESC
          LIMIT 1
        `).get(
          ownerId,
        ) as
          | SubscriptionRow
          | undefined;

      if (
        pending
      ) {
        const pendingPriceVariantId =
          positiveId(
            pending.subscription_plan_price_id,
          );

        const pendingAmount =
          safeAmount(
            pending.price_amount,
          );

        const pendingCurrency =
          normalizedCurrency(
            pending.currency,
          );

        const sameCommercialOffer =
          pendingPriceVariantId ===
            offer.price.id &&
          pendingAmount ===
            offer.price.price_amount &&
          pendingCurrency ===
            normalizedCurrency(
              offer.price.currency,
            ) &&
          String(
            pending.billing_interval ??
              "monthly",
          ) ===
            offer.price
              .billing_interval &&
          Number(
            pending.duration_days ??
              0,
          ) ===
            Number(
              offer.price
                .duration_days,
            );

        if (
          sameCommercialOffer &&
          pendingIsFresh(
            pending,
          )
        ) {
          res.json({
            success: true,
            reused: true,
            ownerType,
            ownerId,

            subscription:
              serializeSubscription(
                ownerType,
                pending,
              ),

            payment: {
              required:
                true,

              provider:
                text(
                  offer.price
                    .provider,
                  50,
                ).toLowerCase() ||
                providerName(),

              amount:
                Number(
                  pending.price_amount ??
                    offer.price
                      .price_amount,
                ),

              amountPaise:
                Number(
                  pending.price_amount ??
                    offer.price
                      .price_amount,
                ) * 100,

              currency:
                pendingCurrency,

              planId:
                plan.id,

              planCode:
                plan.code,

              priceVariantId:
                pendingPriceVariantId ??
                offer.price.id,

              subscriptionId:
                Number(
                  pending.id,
                ),

              orderCreationOwnedBy:
                "payments.ts",

              activationOwnedBy:
                "payments.ts/webhook",
            },
          });

          return;
        }

        cancelOpenPending(
          ownerType,
          ownerId,
          user.id,
          "Previous pending checkout intent was stale or no longer matched the current authoritative price variant and was superseded.",
        );
      }

      const managerUserId =
        managerIdForSubscription(
          user,
          ownerType,
          ownerId,
        );

      if (
        (ownerType ===
          "temple" ||
          ownerType ===
            "ashram") &&
        !managerUserId
      ) {
        /*
         * Commercial ownership for a manager-led business should have a valid
         * account/assignment before a new subscription record is created.
         */
        res.status(409).json({
          success: false,
          error:
            `No active ${ownerType === "temple" ? "Temple" : "Ashram"} Manager assignment exists for this owner.`,
        });

        return;
      }

      const subscriptionId =
        db.transaction(
          () => {
            const id =
              createPending({
                ownerType,
                ownerId,
                managerUserId,
                plan,
                price:
                  offer.price,
                notes:
                  nullable(
                    body.notes,
                    2000,
                  ),
                actorId:
                  user.id,
              });

            subscriptionEvent(
              {
                ownerType,

                subscriptionId:
                  id,

                userId:
                  user.id,

                eventType:
                  "prepared",

                oldStatus:
                  current?.status ??
                  null,

                newStatus:
                  "pending",

                oldExpiresAt:
                  current?.expires_at ??
                  null,

                newExpiresAt:
                  null,

                notes:
                  "Subscription intent prepared; verified payment is required before activation.",

                metadata: {
                  planId:
                    plan.id,

                  planCode:
                    plan.code,

                  priceVariantId:
                    offer.price
                      .id,

                  priceAmount:
                    offer.price
                      .price_amount,

                  activeSubscriptionPreserved:
                    current?.status ===
                    "active",
                },
              },
            );

            return id;
          },
        )();

      const prepared =
        getSubscriptionById(
          ownerType,
          subscriptionId,
        );

      if (!prepared) {
        res.status(500).json({
          success: false,
          error:
            "Subscription was prepared but could not be loaded.",
        });

        return;
      }

      audit({
        req,
        userId:
          user.id,

        action:
          "subscription.prepared",

        entityType:
          `${ownerType}_subscription`,

        entityId:
          subscriptionId,

        oldData:
          current
            ? serializeSubscription(
                ownerType,
                current,
              )
            : null,

        newData:
          serializeSubscription(
            ownerType,
            prepared,
          ),
      });

      const targetUserId =
        managerUserId ??
        ownerAccountId(
          ownerType,
          ownerId,
        );

      if (targetUserId) {
        notifyUser(
          targetUserId,

          "Subscription checkout prepared",

          `Your ${plan.name} subscription is ready for payment.`,

          "/subscriptions",

          {
            ownerType,
            ownerId,
            subscriptionId,
            planId:
              plan.id,
            priceVariantId:
              offer.price.id,
          },
        );
      }

      res.status(201).json({
        success: true,

        ownerType,
        ownerId,

        subscription:
          serializeSubscription(
            ownerType,
            prepared,
          ),

        payment: {
          required:
            true,

          provider:
            offer.price
              .provider ||
            providerName(),

          amount:
            offer.price
              .price_amount,

          amountPaise:
            offer.price
              .price_amount *
            100,

          currency:
            offer.price
              .currency,

          planId:
            plan.id,

          planCode:
            plan.code,

          priceVariantId:
            offer.price.id,

          subscriptionId,

          orderCreationOwnedBy:
            "payments.ts",

          activationOwnedBy:
            "payments.ts/webhook",
        },
      });
    } catch (error) {
      const message =
        error instanceof
        Error
          ? error.message
          : "Unable to prepare subscription.";

      console.error(
        "Subscription prepare error:",
        error,
      );

      if (
        [
          "SUBSCRIPTION_PLAN_UNSUPPORTED",
          "SUBSCRIPTION_PAYMENT_PROVIDER_UNSUPPORTED",
          "SUBSCRIPTION_CURRENCY_UNSUPPORTED",
          "SUBSCRIPTION_PRICE_INVALID",
          "SUBSCRIPTION_DURATION_INVALID",
        ].includes(
          message,
        )
      ) {
        res.status(409).json({
          success: false,
          code: message,
          error:
            "The selected subscription offer is temporarily unavailable. Please reload the current plans.",
        });

        return;
      }

      res.status(500).json({
        success: false,
        error:
          "Unable to prepare subscription.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| AUTO RENEW
|--------------------------------------------------------------------------
*/

router.patch(
  "/:ownerType/:ownerId/auto-renew",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "You do not have access to this subscription.",
        });

        return;
      }

      const current =
        currentSubscription(
          ownerType,
          ownerId,
        );

      if (!current) {
        res.status(404).json({
          success: false,
          error:
            "No current subscription found.",
        });

        return;
      }

      if (
        current.status !==
        "active"
      ) {
        res.status(409).json({
          success: false,
          error:
            "Auto-renew can only be changed on an active subscription.",
        });

        return;
      }

      const autoRenew =
        booleanValue(
          bodyOf(req)
            .autoRenew,
          Boolean(
            current.auto_renew,
          ),
        );

      if (
        autoRenew &&
        !current.razorpay_subscription_id
      ) {
        res.status(409).json({
          success: false,

          code:
            "PAYMENT_PROVIDER_SUBSCRIPTION_REQUIRED",

          error:
            "Auto-renew requires a provider-backed subscription. Complete the supported recurring subscription checkout first.",
        });

        return;
      }

      const table =
        subscriptionTable(
          ownerType,
        );

      db.prepare(`
        UPDATE ${table}
        SET
          auto_renew=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
          AND status='active'
      `).run(
        autoRenew ? 1 : 0,
        current.id,
      );

      subscriptionEvent(
        {
          ownerType,

          subscriptionId:
            current.id,

          userId:
            user.id,

          eventType:
            autoRenew
              ? "auto_renew_enabled"
              : "auto_renew_disabled",

          oldStatus:
            current.status,

          newStatus:
            current.status,

          oldExpiresAt:
            current.expires_at,

          newExpiresAt:
            current.expires_at,

          paymentOrderId:
            current.payment_order_id,

          paymentId:
            current.payment_id,

          notes:
            autoRenew
              ? "Auto-renew enabled by owner/manager."
              : "Auto-renew disabled by owner/manager.",

          metadata: {
            autoRenew,

            /*
             * When provider-backed recurring billing exists, payments.ts
             * should reconcile the provider-side renewal state.
             */
            providerSyncRequired:
              Boolean(
                current.razorpay_subscription_id,
              ),
          },
        },
      );

      const updated =
        getSubscriptionById(
          ownerType,
          current.id,
        );

      audit({
        req,

        userId:
          user.id,

        action:
          "subscription.auto_renew_updated",

        entityType:
          `${ownerType}_subscription`,

        entityId:
          current.id,

        oldData: {
          autoRenew:
            Boolean(
              current.auto_renew,
            ),
        },

        newData: {
          autoRenew,
        },
      });

      res.json({
        success: true,

        autoRenew,

        providerSyncRequired:
          Boolean(
            current.razorpay_subscription_id,
          ),

        providerSyncOwner:
          current.razorpay_subscription_id
            ? "payments.ts/provider recurring workflow"
            : null,

        subscription:
          serializeSubscription(
            ownerType,
            updated,
          ),
      });
    } catch (error) {
      console.error(
        "Subscription auto-renew error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update auto-renew setting.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| SELF CANCELLATION
|--------------------------------------------------------------------------
|
| Active paid subscriptions:
|   - remain active until expiry
|   - auto-renew becomes false
|   - no refund is initiated here
|
| Pending/unpaid states:
|   - can be cancelled immediately
|--------------------------------------------------------------------------
*/

router.post(
  "/:ownerType/:ownerId/cancel",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "You do not have access to this subscription.",
        });

        return;
      }

      const current =
        currentSubscription(
          ownerType,
          ownerId,
        );

      if (!current) {
        res.status(404).json({
          success: false,
          error:
            "No current subscription found.",
        });

        return;
      }

      const immediate =
        booleanValue(
          bodyOf(req)
            .immediate,
          false,
        );

      if (
        immediate &&
        current.status ===
          "active"
      ) {
        res.status(409).json({
          success: false,

          code:
            "PAYMENT_LAYER_REQUIRED",

          error:
            "An active paid subscription cannot be revoked immediately from this route. Disable renewal here; refunds/revocation belong to the payment/admin workflow.",
        });

        return;
      }

      const table =
        subscriptionTable(
          ownerType,
        );

      const old =
        serializeSubscription(
          ownerType,
          current,
        );

      if (
        current.status ===
        "active"
      ) {
        db.prepare(`
          UPDATE ${table}
          SET
            auto_renew=0,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
            AND status='active'
        `).run(
          current.id,
        );

        subscriptionEvent(
          {
            ownerType,

            subscriptionId:
              current.id,

            userId:
              user.id,

            eventType:
              "cancellation_scheduled",

            oldStatus:
              current.status,

            newStatus:
              current.status,

            oldExpiresAt:
              current.expires_at,

            newExpiresAt:
              current.expires_at,

            paymentOrderId:
              current.payment_order_id,

            paymentId:
              current.payment_id,

            notes:
              "Auto-renew disabled; subscription remains active until existing expiry.",

            metadata: {
              immediate: false,

              providerSyncRequired:
                Boolean(
                  current.razorpay_subscription_id,
                ),
            },
          },
        );
      } else if (
        [
          "pending",
          "paused",
          "payment_failed",
        ].includes(
          current.status,
        )
      ) {
        db.prepare(`
          UPDATE ${table}
          SET
            status='cancelled',
            auto_renew=0,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(
          current.id,
        );

        subscriptionEvent(
          {
            ownerType,

            subscriptionId:
              current.id,

            userId:
              user.id,

            eventType:
              "cancelled",

            oldStatus:
              current.status,

            newStatus:
              "cancelled",

            oldExpiresAt:
              current.expires_at,

            newExpiresAt:
              current.expires_at,

            paymentOrderId:
              current.payment_order_id,

            paymentId:
              current.payment_id,

            notes:
              "Unpaid/unstarted subscription intent cancelled by owner/manager.",

            metadata: {
              immediate: true,
            },
          },
        );
      } else {
        res.status(409).json({
          success: false,
          error:
            "This subscription is not cancellable in its current state.",
        });

        return;
      }

      const updated =
        getSubscriptionById(
          ownerType,
          current.id,
        );

      const isActiveCancellation =
        current.status ===
        "active";

      audit({
        req,

        userId:
          user.id,

        action:
          isActiveCancellation
            ? "subscription.cancellation_scheduled"
            : "subscription.cancelled",

        entityType:
          `${ownerType}_subscription`,

        entityId:
          current.id,

        oldData:
          old,

        newData:
          serializeSubscription(
            ownerType,
            updated,
          ),
      });

      res.json({
        success: true,

        message:
          isActiveCancellation
            ? "Auto-renew disabled. Current subscription remains active until expiry."
            : "Subscription cancelled.",

        providerSyncRequired:
          Boolean(
            current.razorpay_subscription_id,
          ) &&
          isActiveCancellation,

        subscription:
          serializeSubscription(
            ownerType,
            updated,
          ),
      });
    } catch (error) {
      console.error(
        "Subscription cancellation error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to cancel subscription.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| REACTIVATE
|--------------------------------------------------------------------------
|
| Reactivation always creates a fresh payment intent.
| It does NOT restore an old paid state for free.
|--------------------------------------------------------------------------
*/

router.post(
  "/:ownerType/:ownerId/reactivate",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "You do not have access to this subscription.",
        });

        return;
      }

      const latest =
        latestSubscription(
          ownerType,
          ownerId,
        );

      if (!latest) {
        res.status(404).json({
          success: false,
          error:
            "No subscription history found.",
        });

        return;
      }

      if (
        latest.status ===
        "active"
      ) {
        res.status(409).json({
          success: false,
          error:
            "Subscription is already active.",
        });

        return;
      }

      if (
        ![
          "cancelled",
          "expired",
        ].includes(
          latest.status,
        )
      ) {
        res.status(409).json({
          success: false,
          error:
            "Only a cancelled or expired subscription can be reactivated through this endpoint.",
        });

        return;
      }

      const snapshot =
        parseObject(
          latest.plan_snapshot_json,
        );

      const requestedPlanId =
        positiveId(
          bodyOf(req).planId,
        );

      const snapshotPlanId =
        positiveId(
          snapshot.planId,
        );

      const plan =
        requestedPlanId
          ? getPlan(
              requestedPlanId,
              ownerType,
            )
          : snapshotPlanId
            ? getPlan(
                snapshotPlanId,
                ownerType,
              )
            : null;

      const selectedPlan =
        plan ??
        getPlanByCode(
          text(
            snapshot.planCode,
            100,
          ).toLowerCase(),
          ownerType,
        );

      if (!selectedPlan) {
        res.status(409).json({
          success: false,
          error:
            "The original plan is no longer active. Select another available plan.",
        });

        return;
      }

      const offer =
        effectiveOffer(
          selectedPlan,
          "monthly",
        );

      if (!offer) {
        res.status(409).json({
          success: false,
          error:
            "No active monthly price variant exists for the selected plan.",
        });

        return;
      }

      const pending =
        db.prepare(`
          SELECT id
          FROM ${subscriptionTable(
            ownerType,
          )}
          WHERE ${subscriptionOwnerColumn(
            ownerType,
          )}=?
            AND status='pending'
          ORDER BY id DESC
          LIMIT 1
        `).get(
          ownerId,
        ) as
          | {
              id?: number;
            }
          | undefined;

      if (
        pending?.id
      ) {
        const subscription =
          getSubscriptionById(
            ownerType,
            Number(
              pending.id,
            ),
          );

        res.json({
          success: true,
          reused: true,
          ownerType,
          ownerId,

          subscription:
            serializeSubscription(
              ownerType,
              subscription,
            ),

          payment: {
            required:
              true,

            provider:
              offer.price
                .provider ||
              providerName(),

            amount:
              Number(
                subscription
                  ?.price_amount ??
                  offer.price
                    .price_amount,
              ),

            amountPaise:
              Number(
                subscription
                  ?.price_amount ??
                  offer.price
                    .price_amount,
              ) * 100,

            currency:
              String(
                subscription
                  ?.currency ??
                  offer.price
                    .currency,
              ),

            planId:
              selectedPlan.id,

            planCode:
              selectedPlan.code,

            priceVariantId:
              positiveId(
                subscription
                  ?.subscription_plan_price_id,
              ) ??
              offer.price.id,

            subscriptionId:
              Number(
                pending.id,
              ),

            orderCreationOwnedBy:
              "payments.ts",

            activationOwnedBy:
              "payments.ts/webhook",
          },
        });

        return;
      }

      const managerUserId =
        managerIdForSubscription(
          user,
          ownerType,
          ownerId,
        );

      if (
        (ownerType ===
          "temple" ||
          ownerType ===
            "ashram") &&
        !managerUserId
      ) {
        res.status(409).json({
          success: false,
          error:
            `No active ${ownerType === "temple" ? "Temple" : "Ashram"} Manager assignment exists for this owner.`,
        });

        return;
      }

      const createdId =
        db.transaction(
          () => {
            const id =
              createPending(
                {
                  ownerType,
                  ownerId,
                  managerUserId,

                  plan:
                    selectedPlan,

                  price:
                    offer.price,

                  notes:
                    "Fresh payment required for subscription reactivation.",

                  actorId:
                    user.id,
                },
              );

            subscriptionEvent(
              {
                ownerType,

                subscriptionId:
                  id,

                userId:
                  user.id,

                eventType:
                  "reactivation_prepared",

                oldStatus:
                  latest.status,

                newStatus:
                  "pending",

                oldExpiresAt:
                  latest.expires_at,

                newExpiresAt:
                  null,

                notes:
                  "Reactivation prepared for fresh payment confirmation.",

                metadata: {
                  previousSubscriptionId:
                    latest.id,

                  planId:
                    selectedPlan.id,

                  planCode:
                    selectedPlan.code,

                  priceVariantId:
                    offer.price
                      .id,
                },
              },
            );

            return id;
          },
        )();

      const prepared =
        getSubscriptionById(
          ownerType,
          createdId,
        );

      audit({
        req,

        userId:
          user.id,

        action:
          "subscription.reactivation_prepared",

        entityType:
          `${ownerType}_subscription`,

        entityId:
          createdId,

        oldData:
          serializeSubscription(
            ownerType,
            latest,
          ),

        newData:
          serializeSubscription(
            ownerType,
            prepared,
          ),
      });

      res.status(201).json({
        success: true,

        ownerType,
        ownerId,

        subscription:
          serializeSubscription(
            ownerType,
            prepared,
          ),

        payment: {
          required:
            true,

          provider:
            offer.price
              .provider ||
            providerName(),

          amount:
            offer.price
              .price_amount,

          amountPaise:
            offer.price
              .price_amount *
            100,

          currency:
            offer.price
              .currency,

          planId:
            selectedPlan.id,

          planCode:
            selectedPlan.code,

          priceVariantId:
            offer.price.id,

          subscriptionId:
            createdId,
        },
      });
    } catch (error) {
      console.error(
        "Subscription reactivation error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to prepare subscription reactivation.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| OWNER DETAIL
|--------------------------------------------------------------------------
*/

router.get(
  "/:ownerType/:ownerId",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      if (
        !ownerExists(
          ownerType,
          ownerId,
        )
      ) {
        res.status(404).json({
          success: false,
          error:
            "Subscription owner was not found.",
        });

        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "You do not have access to this subscription.",
        });

        return;
      }

      const subscription =
        currentSubscription(
          ownerType,
          ownerId,
        );

      res.json({
        success: true,

        ownerType,
        ownerId,

        subscription:
          serializeSubscription(
            ownerType,
            subscription,
          ),

        payment:
          paymentSummary(
            ownerType,
            subscription,
          ),
      });
    } catch (error) {
      console.error(
        "Subscription detail error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| OWNER EVENTS
|--------------------------------------------------------------------------
*/

router.get(
  "/:ownerType/:ownerId/events",
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      if (
        !canAccessOwner(
          user,
          ownerType,
          ownerId,
        )
      ) {
        res.status(403).json({
          success: false,
          error:
            "You do not have access to this subscription history.",
        });

        return;
      }

      const rows =
        db.prepare(`
          SELECT
            se.*,
            u.name AS user_name,
            u.email AS user_email
          FROM subscription_events se
          LEFT JOIN users u
            ON u.id=se.user_id
          WHERE se.subscription_type=?
            AND se.subscription_id IN (
              SELECT id
              FROM ${subscriptionTable(
                ownerType,
              )}
              WHERE ${subscriptionOwnerColumn(
                ownerType,
              )}=?
            )
          ORDER BY se.id DESC
          LIMIT 300
        `).all(
          ownerType,
          ownerId,
        );

      res.json({
        success: true,
        ownerType,
        ownerId,
        events: rows,
      });
    } catch (error) {
      console.error(
        "Subscription events error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription events.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| ADMIN / SALES OPERATIONAL PIPELINE
|--------------------------------------------------------------------------
*/

function operationalSubscriptions(
  audience: OwnerType | null,
  status: SubscriptionStatus | null,
  search: string,
): SqlRow[] {
  const definitions: Array<{
    audience: OwnerType;
    table: string;
    owner: string;
  }> = [
    {
      audience: "pandit",
      table:
        "pandit_subscriptions",
      owner: "pandit_id",
    },
    {
      audience: "temple",
      table:
        "temple_subscriptions",
      owner: "temple_id",
    },
    {
      audience: "ashram",
      table:
        "ashram_subscriptions",
      owner: "ashram_id",
    },
  ];

  const rows: SqlRow[] = [];

  for (
    const definition of definitions
  ) {
    if (
      audience &&
      audience !==
        definition.audience
    ) {
      continue;
    }

    const where = [
      "1=1",
    ];

    const params: unknown[] =
      [];

    if (status) {
      where.push(
        "s.status=?",
      );

      params.push(
        status,
      );
    }

    if (search) {
      const pattern =
        `%${search}%`;

      const ownerExpression =
        definition.audience ===
        "pandit"
          ? "pp.display_name"
          : definition.audience ===
              "temple"
            ? "t.name"
            : "a.name";

      where.push(`
        (
          CAST(s.id AS TEXT) LIKE ?
          OR LOWER(
            COALESCE(
              ${ownerExpression},
              ''
            )
          ) LIKE LOWER(?)
          OR LOWER(
            COALESCE(
              u.name,
              ''
            )
          ) LIKE LOWER(?)
          OR LOWER(
            COALESCE(
              u.email,
              ''
            )
          ) LIKE LOWER(?)
          OR LOWER(
            COALESCE(
              sp.code,
              ''
            )
          ) LIKE LOWER(?)
          OR LOWER(
            COALESCE(
              sp.name,
              ''
            )
          ) LIKE LOWER(?)
        )
      `);

      params.push(
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
        pattern,
      );
    }

    const query =
      definition.audience ===
      "pandit"
        ? `
          SELECT
            s.id,
            'pandit' AS audience,
            s.pandit_id AS owner_entity_id,
            s.plan_id,
            s.subscription_plan_price_id,

            sp.code AS plan_code,
            sp.name AS plan_name,

            s.price_amount,
            s.currency,
            s.billing_interval,
            s.duration_days,
            s.status,
            s.starts_at,
            s.expires_at,

            s.lead_limit,
            s.leads_used,
            s.service_limit,
            s.service_area_limit,
            s.gallery_limit,
            s.video_limit,
            s.program_limit,

            s.auto_renew,
            s.listing_enabled,
            s.featured_listing,
            s.priority_support,
            s.verification_badge,
            s.analytics_access,
            s.homepage_promotion,
            s.live_aarti_enabled,
            s.enhanced_seo,
            s.enhanced_profile,
            s.whatsapp_enquiry,
            s.search_visibility,
            s.analytics_level,

            s.payment_order_id,
            s.payment_id,

            pp.display_name AS owner_name,
            u.name AS account_name,
            u.email AS account_email,

            pp.city,
            pp.district,
            pp.state,
            pp.country,

            s.created_at,
            s.updated_at

          FROM pandit_subscriptions s

          INNER JOIN pandit_profiles pp
            ON pp.id=s.pandit_id

          INNER JOIN users u
            ON u.id=pp.user_id

          INNER JOIN subscription_plans sp
            ON sp.id=s.plan_id

          WHERE ${where.join(
            " AND ",
          )}
        `
        : definition.audience ===
            "temple"
          ? `
            SELECT
              s.id,
              'temple' AS audience,
              s.temple_id AS owner_entity_id,
              s.plan_id,
              s.subscription_plan_price_id,

              sp.code AS plan_code,
              sp.name AS plan_name,

              s.price_amount,
              s.currency,
              s.billing_interval,
              s.duration_days,
              s.status,
              s.starts_at,
              s.expires_at,

              s.lead_limit,
              s.leads_used,
              s.service_limit,
              s.service_area_limit,
              s.gallery_limit,
              s.video_limit,
              s.program_limit,

              s.auto_renew,
              s.listing_enabled,
              s.featured_listing,
              s.priority_support,
              s.verification_badge,
              s.analytics_access,
              s.homepage_promotion,
              s.live_aarti_enabled,
              s.enhanced_seo,
              s.enhanced_profile,
              s.whatsapp_enquiry,
              s.search_visibility,
              s.analytics_level,

              s.payment_order_id,
              s.payment_id,

              t.name AS owner_name,
              u.name AS account_name,
              u.email AS account_email,

              t.city,
              t.district,
              t.state,
              t.country,

              s.created_at,
              s.updated_at

            FROM temple_subscriptions s

            INNER JOIN temples t
              ON t.id=s.temple_id

            INNER JOIN subscription_plans sp
              ON sp.id=s.plan_id

            LEFT JOIN users u
              ON u.id=(
                SELECT
                  tma.manager_user_id
                FROM temple_manager_assignments tma
                WHERE tma.temple_id=
                  s.temple_id
                  AND tma.status='active'
                ORDER BY
                  tma.assigned_at DESC,
                  tma.id DESC
                LIMIT 1
              )

            WHERE ${where.join(
              " AND ",
            )}
          `
          : `
            SELECT
              s.id,
              'ashram' AS audience,
              s.ashram_id AS owner_entity_id,
              s.plan_id,
              s.subscription_plan_price_id,

              sp.code AS plan_code,
              sp.name AS plan_name,

              s.price_amount,
              s.currency,
              s.billing_interval,
              s.duration_days,
              s.status,
              s.starts_at,
              s.expires_at,

              s.lead_limit,
              s.leads_used,
              s.service_limit,
              s.service_area_limit,
              s.gallery_limit,
              s.video_limit,
              s.program_limit,

              s.auto_renew,
              s.listing_enabled,
              s.featured_listing,
              s.priority_support,
              s.verification_badge,
              s.analytics_access,
              s.homepage_promotion,
              s.live_aarti_enabled,
              s.enhanced_seo,
              s.enhanced_profile,
              s.whatsapp_enquiry,
              s.search_visibility,
              s.analytics_level,

              s.payment_order_id,
              s.payment_id,

              a.name AS owner_name,
              u.name AS account_name,
              u.email AS account_email,

              a.city,
              a.district,
              a.state,
              a.country,

              s.created_at,
              s.updated_at

            FROM ashram_subscriptions s

            INNER JOIN ashrams a
              ON a.id=s.ashram_id

            INNER JOIN subscription_plans sp
              ON sp.id=s.plan_id

            LEFT JOIN users u
              ON u.id=(
                SELECT
                  ama.manager_user_id
                FROM ashram_manager_assignments ama
                WHERE ama.ashram_id=
                  s.ashram_id
                  AND ama.status='active'
                ORDER BY
                  ama.assigned_at DESC,
                  ama.id DESC
                LIMIT 1
              )

            WHERE ${where.join(
              " AND ",
            )}
          `;

    rows.push(
      ...(
        db.prepare(
          query,
        ).all(
          ...params,
        ) as SqlRow[]
      ),
    );
  }

  return rows.sort(
    (
      first,
      second,
    ) =>
      String(
        second.created_at ??
          "",
      ).localeCompare(
        String(
          first.created_at ??
            "",
        ),
      ) ||
      Number(
        second.id ?? 0,
      ) -
        Number(
          first.id ?? 0,
        ),
  );
}

router.get(
  "/admin/subscriptions",
  requireRole(
    "super_admin",
    "sales",
  ),
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      let audience =
        normalizeOwnerType(
          req.query.audience ??
            req.query.ownerType,
        );

      if (
        user.role ===
          "sales" &&
        audience &&
        audience !==
          "ashram"
      ) {
        res.status(403).json({
          success: false,
          error:
            "Sales can view only Ashram subscriptions.",
        });

        return;
      }

      if (
        user.role ===
        "sales"
      ) {
        audience =
          "ashram";
      }

      const status =
        normalizeStatus(
          req.query.status,
        );

      const search =
        text(
          req.query.search,
          180,
        );

      const page =
        integerInRange(
          req.query.page,
          1,
          1,
          100000,
        );

      const limit =
        integerInRange(
          req.query.limit,
          25,
          1,
          100,
        );

      const offset =
        (page - 1) *
        limit;

      const all =
        operationalSubscriptions(
          audience,
          status,
          search,
        );

      const paged =
        all
          .slice(
            offset,
            offset +
              limit,
          )
          .map(
            (row) => ({
              ...row,

              days_to_expiry:
                daysUntil(
                  row.expires_at
                    ? String(
                        row.expires_at,
                      )
                    : null,
                ),

              leads_remaining:
                Math.max(
                  0,
                  Number(
                    row.lead_limit ??
                      0,
                  ) -
                    Number(
                      row.leads_used ??
                        0,
                    ),
                ),
            }),
          );

      res.json({
        success: true,

        subscriptions:
          paged,

        pagination: {
          page,
          limit,
          offset,
          total:
            all.length,
          totalPages:
            Math.ceil(
              all.length /
                limit,
            ),
        },

        filters: {
          audience:
            audience ??
            null,

          status:
            status ??
            null,

          search:
            search ||
            null,
        },
      });
    } catch (error) {
      console.error(
        "Operational subscription list error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription pipeline.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| RENEWALS
|--------------------------------------------------------------------------
*/

router.get(
  "/admin/renewals",
  requireRole(
    "super_admin",
    "sales",
  ),
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      const days =
        integerInRange(
          req.query.days,
          30,
          1,
          3650,
        );

      const audience =
        normalizeOwnerType(
          req.query.audience ??
            req.query.ownerType,
        );

      if (
        user.role ===
          "sales" &&
        audience &&
        audience !==
          "ashram"
      ) {
        res.status(403).json({
          success: false,
          error:
            "Sales can view only Ashram renewals.",
        });

        return;
      }

      const types: OwnerType[] =
        user.role ===
        "sales"
          ? ["ashram"]
          : audience
            ? [audience]
            : [
                "pandit",
                "temple",
                "ashram",
              ];

      const rows: SqlRow[] =
        [];

      for (
        const type of types
      ) {
        const table =
          subscriptionTable(
            type,
          );

        rows.push(
          ...(
            db.prepare(`
              SELECT
                s.id,
                '${type}' AS audience,
                ${subscriptionOwnerColumn(
                  type,
                )} AS owner_entity_id,

                s.plan_id,
                s.subscription_plan_price_id,

                s.price_amount,
                s.currency,
                s.status,

                s.expires_at,
                s.auto_renew,

                s.lead_limit,
                s.leads_used,

                p.code AS plan_code,
                p.name AS plan_name

              FROM ${table} s

              INNER JOIN subscription_plans p
                ON p.id=s.plan_id

              WHERE s.status='active'
                AND s.expires_at IS NOT NULL
                AND s.expires_at>=CURRENT_TIMESTAMP
                AND s.expires_at<=datetime(
                  'now',
                  ?
                )

              ORDER BY
                s.expires_at ASC,
                s.id ASC
            `).all(
              `+${days} day`,
            ) as SqlRow[]
          ),
        );
      }

      res.json({
        success: true,

        days,

        renewals:
          rows.map(
            (row) => ({
              ...row,

              days_to_expiry:
                daysUntil(
                  row.expires_at
                    ? String(
                        row.expires_at,
                      )
                    : null,
                ),

              leads_remaining:
                Math.max(
                  0,
                  Number(
                    row.lead_limit ??
                      0,
                  ) -
                    Number(
                      row.leads_used ??
                        0,
                    ),
                ),
            }),
          ),
      });
    } catch (error) {
      console.error(
        "Subscription renewal pipeline error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load renewal pipeline.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| SUBSCRIPTION STATS
|--------------------------------------------------------------------------
*/

router.get(
  "/admin/stats",
  requireRole(
    "super_admin",
    "sales",
  ),
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      expireSubscriptions();

      const user =
        currentUser(res);

      let audience =
        normalizeOwnerType(
          req.query.audience ??
            req.query.ownerType,
        );

      if (
        user.role ===
          "sales" &&
        audience &&
        audience !==
          "ashram"
      ) {
        res.status(403).json({
          success: false,
          error:
            "Sales can view only Ashram subscription statistics.",
        });

        return;
      }

      if (
        user.role ===
        "sales"
      ) {
        audience =
          "ashram";
      }

      const types: OwnerType[] =
        audience
          ? [audience]
          : [
              "pandit",
              "temple",
              "ashram",
            ];

      const byAudience: SqlRow[] =
        [];

      let totals = {
        subscriptions: 0,
        active: 0,
        pending: 0,
        expired: 0,
        cancelled: 0,
        paused: 0,
        paymentFailed: 0,
        totalLeadLimit: 0,
        totalLeadsUsed: 0,
        activeRevenuePerCycle: 0,
      };

      const renewals: SqlRow[] =
        [];

      for (
        const type of types
      ) {
        const table =
          subscriptionTable(
            type,
          );

        const summary =
          db.prepare(`
            SELECT
              COUNT(*) AS subscriptions,

              SUM(
                CASE
                  WHEN status='active'
                  THEN 1
                  ELSE 0
                END
              ) AS active,

              SUM(
                CASE
                  WHEN status='pending'
                  THEN 1
                  ELSE 0
                END
              ) AS pending,

              SUM(
                CASE
                  WHEN status='expired'
                  THEN 1
                  ELSE 0
                END
              ) AS expired,

              SUM(
                CASE
                  WHEN status='cancelled'
                  THEN 1
                  ELSE 0
                END
              ) AS cancelled,

              SUM(
                CASE
                  WHEN status='paused'
                  THEN 1
                  ELSE 0
                END
              ) AS paused,

              SUM(
                CASE
                  WHEN status='payment_failed'
                  THEN 1
                  ELSE 0
                END
              ) AS payment_failed,

              COALESCE(
                SUM(
                  CASE
                    WHEN status='active'
                    THEN lead_limit
                    ELSE 0
                  END
                ),
                0
              ) AS lead_limit,

              COALESCE(
                SUM(
                  CASE
                    WHEN status='active'
                    THEN leads_used
                    ELSE 0
                  END
                ),
                0
              ) AS leads_used,

              COALESCE(
                SUM(
                  CASE
                    WHEN status='active'
                    THEN price_amount
                    ELSE 0
                  END
                ),
                0
              ) AS active_value

            FROM ${table}
          `).get() as SqlRow;

        const normalized =
          {
            audience:
              type,

            subscriptions:
              Number(
                summary.subscriptions ??
                  0,
              ),

            active:
              Number(
                summary.active ??
                  0,
              ),

            pending:
              Number(
                summary.pending ??
                  0,
              ),

            expired:
              Number(
                summary.expired ??
                  0,
              ),

            cancelled:
              Number(
                summary.cancelled ??
                  0,
              ),

            paused:
              Number(
                summary.paused ??
                  0,
              ),

            paymentFailed:
              Number(
                summary.payment_failed ??
                  0,
              ),

            totalLeadLimit:
              Number(
                summary.lead_limit ??
                  0,
              ),

            totalLeadsUsed:
              Number(
                summary.leads_used ??
                  0,
              ),

            activeRevenuePerCycle:
              Number(
                summary.active_value ??
                  0,
              ),
          };

        byAudience.push(
          normalized,
        );

        totals = {
          subscriptions:
            totals.subscriptions +
            normalized.subscriptions,

          active:
            totals.active +
            normalized.active,

          pending:
            totals.pending +
            normalized.pending,

          expired:
            totals.expired +
            normalized.expired,

          cancelled:
            totals.cancelled +
            normalized.cancelled,

          paused:
            totals.paused +
            normalized.paused,

          paymentFailed:
            totals.paymentFailed +
            normalized.paymentFailed,

          totalLeadLimit:
            totals.totalLeadLimit +
            normalized.totalLeadLimit,

          totalLeadsUsed:
            totals.totalLeadsUsed +
            normalized.totalLeadsUsed,

          activeRevenuePerCycle:
            totals.activeRevenuePerCycle +
            normalized.activeRevenuePerCycle,
        };

        renewals.push(
          ...(
            db.prepare(`
              SELECT
                id,
                '${type}' AS audience,
                ${subscriptionOwnerColumn(
                  type,
                )} AS owner_entity_id,
                plan_id,
                price_amount,
                currency,
                status,
                expires_at,
                auto_renew,
                lead_limit,
                leads_used
              FROM ${table}
              WHERE status='active'
                AND expires_at IS NOT NULL
                AND expires_at>=CURRENT_TIMESTAMP
                AND expires_at<=datetime(
                  'now',
                  '+30 day'
                )
              ORDER BY
                expires_at ASC
              LIMIT 100
            `).all() as SqlRow[]
          ),
        );
      }

      renewals.sort(
        (
          first,
          second,
        ) =>
          String(
            first.expires_at ??
              "",
          ).localeCompare(
            String(
              second.expires_at ??
                "",
            ),
          ),
      );

      res.json({
        success: true,

        totals: {
          ...totals,

          leadUtilizationPercent:
            totals.totalLeadLimit >
            0
              ? Number(
                  (
                    (totals.totalLeadsUsed /
                      totals.totalLeadLimit) *
                    100
                  ).toFixed(2),
                )
              : 0,
        },

        byAudience,

        upcomingRenewals:
          renewals,
      });
    } catch (error) {
      console.error(
        "Subscription stats error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription statistics.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| SUPER ADMIN MANUAL STATE CORRECTION
|--------------------------------------------------------------------------
*/

function adminTargetSubscription(
  ownerType: OwnerType,
  ownerId: number,
  requestedSubscriptionId:
    | number
    | null,
): SubscriptionRow | null {
  if (
    requestedSubscriptionId
  ) {
    const selected =
      getSubscriptionById(
        ownerType,
        requestedSubscriptionId,
      );

    if (!selected) {
      return null;
    }

    if (
      Number(
        selected[
          subscriptionOwnerColumn(
            ownerType,
          )
        ] ?? 0,
      ) !== ownerId
    ) {
      return null;
    }

    return selected;
  }

  return (
    currentSubscription(
      ownerType,
      ownerId,
    ) ??
    latestSubscription(
      ownerType,
      ownerId,
    )
  );
}

function adminSetStatus(
  params: {
    req: Request;
    user: AuthenticatedUser;

    ownerType: OwnerType;
    ownerId: number;

    status:
      SubscriptionStatus;

    startsAt: string | null;
    expiresAt: string | null;

    notes: string | null;

    subscriptionId:
      | number
      | null;
  },
): Record<
  string,
  unknown
> | null {
  const current =
    adminTargetSubscription(
      params.ownerType,
      params.ownerId,
      params.subscriptionId,
    );

  if (!current) {
    return null;
  }

  const table =
    subscriptionTable(
      params.ownerType,
    );

  if (
    params.status ===
    "active"
  ) {
    const other =
      db.prepare(`
        SELECT id
        FROM ${table}
        WHERE ${subscriptionOwnerColumn(
          params.ownerType,
        )}=?
          AND status='active'
          AND id<>?
        LIMIT 1
      `).get(
        params.ownerId,
        current.id,
      ) as
        | {
            id?: number;
          }
        | undefined;

    if (other) {
      throw new Error(
        "Another active subscription already exists for this owner.",
      );
    }
  }

  const start =
    params.startsAt ??
    validIsoOrNull(
      current.starts_at,
    ) ??
    nowIso();

  let expiry =
    params.expiresAt ??
    validIsoOrNull(
      current.expires_at,
    );

  if (
    params.status ===
      "active" &&
    !expiry
  ) {
    expiry =
      addDaysIso(
        start,
        Number(
          current.duration_days ??
            current.plan_duration_days ??
            30,
        ),
      );
  }

  if (
    params.status ===
      "active" &&
    (
      !expiry ||
      new Date(
        expiry,
      ).getTime() <=
        new Date(
          start,
        ).getTime()
    )
  ) {
    throw new Error(
      "expiresAt must be later than startsAt.",
    );
  }

  const old =
    serializeSubscription(
      params.ownerType,
      current,
    );

  db.transaction(
    () => {
      db.prepare(`
        UPDATE ${table}
        SET
          status=?,
          starts_at=?,
          expires_at=?,
          auto_renew=
            CASE
              WHEN ?='active'
              THEN auto_renew
              ELSE 0
            END,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        params.status,
        start,
        expiry,
        params.status,
        current.id,
      );

      if (
        params.ownerType ===
        "pandit"
      ) {
        syncPanditListing(
          params.ownerId,
          params.status ===
            "active" &&
            Boolean(
              current.listing_enabled,
            ),
        );
      }

      subscriptionEvent(
        {
          ownerType:
            params.ownerType,

          subscriptionId:
            current.id,

          userId:
            params.user.id,

          eventType:
            `admin_status_${params.status}`,

          oldStatus:
            current.status,

          newStatus:
            params.status,

          oldExpiresAt:
            current.expires_at,

          newExpiresAt:
            expiry,

          paymentOrderId:
            current.payment_order_id,

          paymentId:
            current.payment_id,

          notes:
            params.notes ??
            `Subscription status changed to ${params.status} by Super Admin.`,

          metadata: {
            manual:
              true,
          },
        },
      );
    },
  )();

  const updated =
    getSubscriptionById(
      params.ownerType,
      current.id,
    );

  audit({
    req: params.req,

    userId:
      params.user.id,

    action:
      "admin.subscription_status_changed",

    entityType:
      `${params.ownerType}_subscription`,

    entityId:
      current.id,

    oldData:
      old,

    newData:
      serializeSubscription(
        params.ownerType,
        updated,
      ),
  });

  const target =
    ownerAccountId(
      params.ownerType,
      params.ownerId,
    );

  if (target) {
    notifyUser(
      target,

      "Subscription status updated",

      `Your ${params.ownerType} subscription is now ${params.status}.`,

      "/subscriptions",

      {
        ownerType:
          params.ownerType,

        ownerId:
          params.ownerId,

        subscriptionId:
          current.id,

        status:
          params.status,
      },
    );
  }

  return serializeSubscription(
    params.ownerType,
    updated,
  );
}

router.patch(
  "/admin/:ownerType/:ownerId/status",
  requireRole(
    "super_admin",
  ),
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      const status =
        normalizeStatus(
          bodyOf(req).status,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      if (!status) {
        res.status(400).json({
          success: false,
          error:
            "Valid subscription status is required.",
        });

        return;
      }

      if (
        !ownerExists(
          ownerType,
          ownerId,
        )
      ) {
        res.status(404).json({
          success: false,
          error:
            "Subscription owner was not found.",
        });

        return;
      }

      const requestBody =
        bodyOf(req);

      const requestedSubscriptionId =
        positiveId(
          requestBody.subscriptionId,
        );

      const startsInput =
        requestBody.startsAt;

      const expiresInput =
        requestBody.expiresAt;

      const startsAt =
        startsInput ===
        undefined
          ? null
          : validIsoOrNull(
              startsInput,
            );

      const expiresAt =
        expiresInput ===
        undefined
          ? null
          : validIsoOrNull(
              expiresInput,
            );

      if (
        startsInput !==
          undefined &&
        !startsAt
      ) {
        res.status(400).json({
          success: false,
          error:
            "startsAt must be a valid date/time.",
        });

        return;
      }

      if (
        expiresInput !==
          undefined &&
        !expiresAt
      ) {
        res.status(400).json({
          success: false,
          error:
            "expiresAt must be a valid date/time.",
        });

        return;
      }

      const updated =
        adminSetStatus({
          req,
          user,
          ownerType,
          ownerId,
          status,
          startsAt,
          expiresAt,

          notes:
            nullable(
              requestBody.notes,
              MAX_NOTES_LENGTH,
            ),

          subscriptionId:
            requestedSubscriptionId,
        });

      if (!updated) {
        res.status(404).json({
          success: false,
          error:
            "No subscription history found.",
        });

        return;
      }

      res.json({
        success: true,
        subscription:
          updated,
      });
    } catch (error) {
      const message =
        error instanceof
        Error
          ? error.message
          : "Unable to update subscription status.";

      console.error(
        "Admin subscription status error:",
        error,
      );

      res.status(
        message.includes(
          "Another active",
        ) ||
          message.includes(
            "expiresAt",
          )
          ? 409
          : 500,
      ).json({
        success: false,
        error:
          message,
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| ADMIN ACTIVATE
|--------------------------------------------------------------------------
*/

router.post(
  "/admin/:ownerType/:ownerId/activate",
  requireRole(
    "super_admin",
  ),
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      const requestBody =
        bodyOf(req);

      const requestedSubscriptionId =
        positiveId(
          requestBody.subscriptionId,
        );

      const startsInput =
        requestBody.startsAt;

      const expiresInput =
        requestBody.expiresAt;

      const startsAt =
        startsInput ===
        undefined
          ? null
          : validIsoOrNull(
              startsInput,
            );

      const expiresAt =
        expiresInput ===
        undefined
          ? null
          : validIsoOrNull(
              expiresInput,
            );

      if (
        startsInput !==
          undefined &&
        !startsAt
      ) {
        res.status(400).json({
          success: false,
          error:
            "startsAt must be a valid date/time.",
        });

        return;
      }

      if (
        expiresInput !==
          undefined &&
        !expiresAt
      ) {
        res.status(400).json({
          success: false,
          error:
            "expiresAt must be a valid date/time.",
        });

        return;
      }

      const updated =
        adminSetStatus({
          req,
          user,

          ownerType,
          ownerId,

          status:
            "active",

          startsAt,
          expiresAt,

          notes:
            nullable(
              requestBody.notes,
              MAX_NOTES_LENGTH,
            ) ??
            "Activated manually by Super Admin.",

          subscriptionId:
            requestedSubscriptionId,
        });

      if (!updated) {
        res.status(404).json({
          success: false,
          error:
            "No subscription history found.",
        });

        return;
      }

      res.json({
        success: true,
        subscription:
          updated,
      });
    } catch (error) {
      console.error(
        "Admin subscription activation error:",
        error,
      );

      res.status(409).json({
        success: false,
        error:
          error instanceof
          Error
            ? error.message
            : "Unable to activate subscription.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| ADMIN EXPIRE
|--------------------------------------------------------------------------
*/

router.post(
  "/admin/:ownerType/:ownerId/expire",
  requireRole(
    "super_admin",
  ),
  (
    req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const user =
        currentUser(res);

      const ownerType =
        normalizeOwnerType(
          req.params.ownerType,
        );

      const ownerId =
        positiveId(
          req.params.ownerId,
        );

      if (
        !ownerType ||
        !ownerId
      ) {
        res.status(400).json({
          success: false,
          error:
            "Valid ownerType and ownerId are required.",
        });

        return;
      }

      const requestBody =
        bodyOf(req);

      const requestedSubscriptionId =
        positiveId(
          requestBody.subscriptionId,
        );

      const current =
        adminTargetSubscription(
          ownerType,
          ownerId,
          requestedSubscriptionId,
        );

      if (!current) {
        res.status(404).json({
          success: false,
          error:
            "No matching subscription history found.",
        });

        return;
      }

      const table =
        subscriptionTable(
          ownerType,
        );

      db.transaction(
        () => {
          db.prepare(`
            UPDATE ${table}
            SET
              status='expired',
              auto_renew=0,
              updated_at=CURRENT_TIMESTAMP
            WHERE id=?
          `).run(
            current.id,
          );

          if (
            ownerType ===
            "pandit"
          ) {
            syncPanditListing(
              ownerId,
              false,
            );
          }

          subscriptionEvent(
            {
              ownerType,

              subscriptionId:
                current.id,

              userId:
                user.id,

              eventType:
                "admin_expired",

              oldStatus:
                current.status,

              newStatus:
                "expired",

              oldExpiresAt:
                current.expires_at,

              newExpiresAt:
                current.expires_at,

              paymentOrderId:
                current.payment_order_id,

              paymentId:
                current.payment_id,

              notes:
                nullable(
                  requestBody.notes,
                  MAX_NOTES_LENGTH,
                ) ??
                "Expired manually by Super Admin.",

              metadata: {
                manual:
                  true,
              },
            },
          );
        },
      )();

      const updated =
        getSubscriptionById(
          ownerType,
          current.id,
        );

      audit({
        req,
        userId:
          user.id,

        action:
          "admin.subscription_expired",

        entityType:
          `${ownerType}_subscription`,

        entityId:
          current.id,

        oldData:
          serializeSubscription(
            ownerType,
            current,
          ),

        newData:
          serializeSubscription(
            ownerType,
            updated,
          ),
      });

      const target =
        ownerAccountId(
          ownerType,
          ownerId,
        );

      if (target) {
        notifyUser(
          target,

          "Subscription expired",

          `Your ${ownerType} subscription has been marked expired by Super Admin.`,

          "/subscriptions",

          {
            ownerType,
            ownerId,
            subscriptionId:
              current.id,
          },
        );
      }

      res.json({
        success: true,

        subscription:
          serializeSubscription(
            ownerType,
            updated,
          ),
      });
    } catch (error) {
      console.error(
        "Admin subscription expire error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to expire subscription.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| MAINTENANCE
|--------------------------------------------------------------------------
*/

router.post(
  "/maintenance/expire",
  requireRole(
    "super_admin",
  ),
  (
    _req,
    res,
  ) => {
    try {
      if (
        !requireTables(res)
      ) {
        return;
      }

      const expired =
        expireSubscriptions();

      res.json({
        success: true,
        expired,
        timestamp:
          nowIso(),
      });
    } catch (error) {
      console.error(
        "Subscription maintenance error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to run subscription maintenance.",
      });
    }
  },
);

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

export type {
  OwnerType,
  SubscriptionStatus,
  BillingInterval,
};

export default router;