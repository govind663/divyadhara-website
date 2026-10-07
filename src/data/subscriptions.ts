/* eslint-disable @typescript-eslint/no-unused-vars */

/*
|--------------------------------------------------------------------------
| DivyaDhara — Subscription Plan Client
|--------------------------------------------------------------------------
|
| BUSINESS RULE
| - Backend/database is the ONLY source of truth for commercial plans,
|   prices, billing interval, duration and entitlements.
| - Client-side FALLBACK_PLANS exist only for degraded/offline UI state.
| - Fallback values must NEVER become payment authority.
| - Checkout must submit an authoritative backend plan/price reference.
| - Backend must re-resolve current commercial terms before creating any
|   payment order / subscription activation.
|
| Canonical commercial catalogue:
|   pandit_basic / pandit_premium
|   temple_basic / temple_premium
|   ashram_basic / ashram_premium
|
| Subscription audiences:
|   Pandit, Temple, Ashram
|
| Visitor is NOT a subscription audience.
| Temple Manager / Ashram Manager are authorization roles, not plan owners.
|--------------------------------------------------------------------------
*/

export type SubscriptionAudience =
  | "pandit"
  | "temple"
  | "ashram";

export type SubscriptionBillingInterval =
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export type SubscriptionPlan = {
  id: number;
  code: string;

  audience: SubscriptionAudience;
  ownerType: SubscriptionAudience;

  name: string;
  title?: string;
  description: string | null;

  priceAmount: number;
  currency: string;

  billingInterval: SubscriptionBillingInterval;
  durationDays: number;

  /*
   * Server-side catalogue / payment references.
   *
   * These are identifiers only.
   * They are NOT payable amounts.
   */
  priceId?: number;
  priceVariantId?: number;

  provider?: string;

  sortOrder?: number;

  /*
   * Commercial entitlements / limits.
   */
  leadLimit: number;
  serviceLimit: number;
  serviceAreaLimit: number;
  galleryLimit: number;
  videoLimit: number;
  programLimit: number;

  listingEnabled: boolean;
  featuredListing: boolean;
  prioritySupport: boolean;
  verificationBadge: boolean;
  analyticsAccess: boolean;
  homepagePromotion: boolean;
  liveAartiEnabled: boolean;
  enhancedSeo: boolean;
  enhancedProfile: boolean;
  whatsappEnquiry: boolean;

  searchVisibility: string;
  analyticsLevel: string;

  features: string[];

  /*
   * Gateway metadata only.
   *
   * NEVER use this as payable amount.
   * Backend may intentionally return null on public catalogue.
   */
  razorpayPlanId: string | null;

  isActive: boolean;
};

export type SubscriptionPlansResponse = {
  success: boolean;

  /*
   * The backend currently may omit top-level ownerType.
   * Client resolves it from the requested audience / returned plans.
   */
  ownerType: SubscriptionAudience;

  plans: unknown[];

  error?: string;

  /*
   * Optional catalogue metadata.
   */
  currency?: string;

  billingInterval?: SubscriptionBillingInterval;

  monthlyOnly?: boolean;
};

export type SubscriptionPlansSource =
  | "backend"
  | "fallback";

export type FetchSubscriptionPlansOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class SubscriptionPlansError extends Error {
  readonly statusCode: number | null;

  readonly source:
    | SubscriptionPlansSource
    | null;

  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      statusCode?: number | null;
      source?: SubscriptionPlansSource | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message);

    this.name =
      "SubscriptionPlansError";

    this.statusCode =
      options.statusCode ?? null;

    this.source =
      options.source ?? null;

    this.retryAfterSeconds =
      options.retryAfterSeconds ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Public audience catalogue
|--------------------------------------------------------------------------
*/

export const SUBSCRIPTION_AUDIENCES: ReadonlyArray<{
  value: SubscriptionAudience;
  label: string;
  shortLabel: string;
}> = [
  {
    value: "pandit",
    label: "Pandit",
    shortLabel: "Pandit",
  },
  {
    value: "temple",
    label: "Temple",
    shortLabel: "Temple",
  },
  {
    value: "ashram",
    label: "Ashram",
    shortLabel: "Ashram",
  },
];

/*
|--------------------------------------------------------------------------
| API configuration
|--------------------------------------------------------------------------
*/

/*
 * Development:
 *   http://localhost:3001/api
 *
 * Production / same-origin:
 *   /api
 *
 * Separate staging/production backend:
 *   VITE_API_URL
 */
const DEFAULT_API_URL =
  typeof globalThis.location !==
    "undefined" &&
  (
    globalThis.location.hostname ===
      "localhost" ||
    globalThis.location.hostname ===
      "127.0.0.1" ||
    globalThis.location.hostname ===
      "::1"
  )
    ? "http://localhost:3001/api"
    : "/api";

/*
|--------------------------------------------------------------------------
| Limits / constants
|--------------------------------------------------------------------------
|
| IMPORTANT:
| These constants MUST be initialized before API_URL because
| normalizeApiBaseUrl() uses API_URL_MAX_LENGTH.
|--------------------------------------------------------------------------
*/

const API_URL_MAX_LENGTH =
  2048;

const DEFAULT_TIMEOUT_MS =
  15_000;

const MAX_TIMEOUT_MS =
  60_000;

const MAX_PLAN_COUNT =
  24;

const MAX_FEATURE_COUNT =
  100;

const MAX_TEXT_LENGTH =
  10_000;

const MAX_FEATURE_LENGTH =
  500;

const MAX_CODE_LENGTH =
  120;

const MAX_CURRENCY_LENGTH =
  3;

const MAX_VISIBILITY_LENGTH =
  80;

const MAX_ANALYTICS_LEVEL_LENGTH =
  80;

const MIN_PLAN_DURATION_DAYS =
  1;

const MAX_PLAN_DURATION_DAYS =
  3660;

const MIN_PLAN_PRICE =
  0;

const MAX_PLAN_PRICE =
  100_000_000;

/*
|--------------------------------------------------------------------------
| Subscription catalogue endpoint
|--------------------------------------------------------------------------
|
| Backend mounting:
|
|   app.use(
|     "/api/subscriptions",
|     subscriptionRoutes,
|   );
|
| Route inside subscriptions.ts:
|
|   GET /plans
|
| Therefore final endpoint:
|
|   /api/subscriptions/plans
|
|--------------------------------------------------------------------------
*/

const SUBSCRIPTION_PLANS_ENDPOINT =
  "/subscriptions/plans";

const RAW_API_URL =
  (
    import.meta.env.VITE_API_URL as
      | string
      | undefined
  )?.trim() ||
  DEFAULT_API_URL;

const API_URL =
  normalizeApiBaseUrl(
    RAW_API_URL,
  );

/*
|--------------------------------------------------------------------------
| Audience helpers
|--------------------------------------------------------------------------
*/

export function isSubscriptionAudience(
  value: unknown,
): value is SubscriptionAudience {
  const audience =
    String(value ?? "")
      .trim()
      .toLowerCase();

  return (
    audience === "pandit" ||
    audience === "temple" ||
    audience === "ashram"
  );
}

function normalizeAudience(
  value: unknown,
): SubscriptionAudience | null {
  const audience =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (
    audience === "pandit" ||
    audience === "temple" ||
    audience === "ashram"
  ) {
    return audience;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| API URL normalization
|--------------------------------------------------------------------------
*/

function normalizeApiBaseUrl(
  value: string,
): string {
  const raw =
    String(value ?? "")
      .trim()
      .slice(
        0,
        API_URL_MAX_LENGTH,
      );

  if (!raw) {
    throw new SubscriptionPlansError(
      "Subscription API URL is empty.",
      {
        source: null,
      },
    );
  }

  try {
    const origin =
      typeof globalThis.location !==
        "undefined"
        ? globalThis.location.origin
        : undefined;

    const parsed =
      origin
        ? new URL(
            raw,
            origin,
          )
        : new URL(raw);

    if (
      ![
        "http:",
        "https:",
      ].includes(
        parsed.protocol,
      )
    ) {
      throw new SubscriptionPlansError(
        "Subscription API URL must use HTTP or HTTPS.",
        {
          source: null,
        },
      );
    }

    /*
     * Never allow HTTPS page -> HTTP API.
     */
    if (
      typeof globalThis.location !==
        "undefined" &&
      globalThis.location.protocol ===
        "https:" &&
      parsed.protocol !==
        "https:"
    ) {
      throw new SubscriptionPlansError(
        "Secure DivyaDhara pages cannot load subscription data over an insecure API connection.",
        {
          source: null,
        },
      );
    }

    /*
     * Credentials embedded inside an API URL
     * are never allowed.
     */
    if (
      parsed.username ||
      parsed.password
    ) {
      throw new SubscriptionPlansError(
        "Subscription API URL must not contain credentials.",
        {
          source: null,
        },
      );
    }

    /*
     * API URLs never need a hash.
     */
    parsed.hash = "";

    return parsed
      .toString()
      .replace(
        /\/+$/,
        "",
      );
  } catch (error) {
    if (
      error instanceof
      SubscriptionPlansError
    ) {
      throw error;
    }

    throw new SubscriptionPlansError(
      "Subscription API URL is invalid.",
      {
        source: null,
      },
    );
  }
}

/*
|--------------------------------------------------------------------------
| Primitive normalizers
|--------------------------------------------------------------------------
*/

function timeoutMs(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(
    Math.floor(value),
    MAX_TIMEOUT_MS,
  );
}

function toFiniteNumber(
  value: unknown,
  fallback = 0,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const numericValue =
      Number(value);

    if (
      Number.isFinite(
        numericValue,
      )
    ) {
      return numericValue;
    }
  }

  return fallback;
}

function toNonNegativeInteger(
  value: unknown,
  fallback = 0,
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    Number.isSafeInteger(
      numericValue,
    ) &&
    numericValue >= 0
  ) {
    return numericValue;
  }

  return fallback;
}

function toBoolean(
  value: unknown,
  fallback = false,
): boolean {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  if (
    value === true
  ) {
    return true;
  }

  if (
    value === false
  ) {
    return false;
  }

  if (
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === 0 ||
    value === "0"
  ) {
    return false;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    normalized ===
    "true"
  ) {
    return true;
  }

  if (
    normalized ===
    "false"
  ) {
    return false;
  }

  return fallback;
}

function normalizeText(
  value: unknown,
  fallback: string | null = null,
  maxLength = MAX_TEXT_LENGTH,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  if (!text) {
    return fallback;
  }

  return text.slice(
    0,
    maxLength,
  );
}

function positiveNullableId(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const id =
    Number(value);

  return Number.isSafeInteger(
    id,
  ) && id > 0
    ? id
    : null;
}

function nonNegativeNullableInteger(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numericValue =
    Number(value);

  return Number.isSafeInteger(
    numericValue,
  ) &&
    numericValue >=
      0
    ? numericValue
    : null;
}

/*
|--------------------------------------------------------------------------
| Billing interval
|--------------------------------------------------------------------------
*/

function normalizeBillingInterval(
  value: unknown,
): SubscriptionBillingInterval {
  const raw =
    String(value ?? "")
      .trim()
      .toLowerCase();

  switch (raw) {
    case "quarter":
    case "quarterly":
      return "quarterly";

    case "year":
    case "annual":
    case "annually":
    case "yearly":
      return "yearly";

    case "custom":
      return "custom";

    case "month":
    case "monthly":
    case "":
      return "monthly";

    default:
      throw new SubscriptionPlansError(
        `Unsupported subscription billing interval: ${raw}.`,
        {
          source: "backend",
        },
      );
  }
}

/*
|--------------------------------------------------------------------------
| Features
|--------------------------------------------------------------------------
*/

function normalizeFeatures(
  value: unknown,
): string[] {
  let raw: unknown =
    value;

  if (
    typeof raw === "string" &&
    raw.trim()
  ) {
    const rawString =
      raw.trim();

    try {
      raw =
        JSON.parse(
          rawString,
        );
    } catch {
      raw =
        rawString
          .split(
            /[\n|•]+/,
          )
          .map(
            (
              item,
            ) =>
              String(
                item,
              ).trim(),
          )
          .filter(
            Boolean,
          );
    }
  }

  if (
    !Array.isArray(raw)
  ) {
    return [];
  }

  const seen =
    new Set<string>();

  const features: string[] =
    [];

  for (
    const item of raw.slice(
      0,
      MAX_FEATURE_COUNT,
    )
  ) {
    if (
      typeof item !==
        "string" &&
      typeof item !==
        "number"
    ) {
      continue;
    }

    const feature =
      String(item)
        .trim()
        .slice(
          0,
          MAX_FEATURE_LENGTH,
        );

    if (!feature) {
      continue;
    }

    const key =
      feature.toLowerCase();

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    features.push(
      feature,
    );
  }

  return features;
}

/*
|--------------------------------------------------------------------------
| Plan validation helpers
|--------------------------------------------------------------------------
*/

function requiredPlanId(
  value: unknown,
): number {
  const id =
    positiveNullableId(
      value,
    );

  if (id === null) {
    throw new SubscriptionPlansError(
      "Subscription API returned a plan with an invalid id.",
      {
        source: "backend",
      },
    );
  }

  return id;
}

function normalizePlanCode(
  value: unknown,
  audience: SubscriptionAudience,
): string {
  const code =
    String(value ?? "")
      .trim()
      .toLowerCase()
      .slice(
        0,
        MAX_CODE_LENGTH,
      );

  if (!code) {
    throw new SubscriptionPlansError(
      `Subscription API returned a plan without a valid code for ${audience}.`,
      {
        source: "backend",
      },
    );
  }

  return code;
}

function requiredCurrency(
  value: unknown,
  planCode: string,
): string {
  const currency =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (
    currency.length !== 3 ||
    currency.length >
      MAX_CURRENCY_LENGTH ||
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new SubscriptionPlansError(
      `Subscription plan ${planCode} returned an invalid currency.`,
      {
        source: "backend",
      },
    );
  }

  return currency;
}

function requiredPrice(
  value: unknown,
  planCode: string,
): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw new SubscriptionPlansError(
      `Subscription plan ${planCode} returned no price.`,
      {
        source: "backend",
      },
    );
  }

  const price =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(
      price,
    ) ||
    price <
      MIN_PLAN_PRICE ||
    price >
      MAX_PLAN_PRICE
  ) {
    throw new SubscriptionPlansError(
      `Subscription plan ${planCode} returned an invalid price.`,
      {
        source: "backend",
      },
    );
  }

  return price;
}

function requiredDuration(
  value: unknown,
  planCode: string,
): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw new SubscriptionPlansError(
      `Subscription plan ${planCode} returned no duration.`,
      {
        source: "backend",
      },
    );
  }

  const duration =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(
      duration,
    ) ||
    duration <
      MIN_PLAN_DURATION_DAYS ||
    duration >
      MAX_PLAN_DURATION_DAYS
  ) {
    throw new SubscriptionPlansError(
      `Subscription plan ${planCode} returned an invalid duration.`,
      {
        source: "backend",
      },
    );
  }

  return duration;
}

function assertPlanAudience(
  raw: Record<
    string,
    unknown
  >,
  requestedAudience: SubscriptionAudience,
): SubscriptionAudience {
  const rawAudience =
    normalizeAudience(
      raw.audience ??
        raw.ownerType ??
        raw.owner_type,
    );

  if (
    rawAudience &&
    rawAudience !==
      requestedAudience
  ) {
    throw new SubscriptionPlansError(
      "Subscription API returned a plan for a different business audience.",
      {
        source: "backend",
      },
    );
  }

  return requestedAudience;
}

/*
|--------------------------------------------------------------------------
| Normalize backend plan
|--------------------------------------------------------------------------
*/

export function normalizePlan(
  raw: Record<
    string,
    unknown
  >,
  audience: SubscriptionAudience,
): SubscriptionPlan {
  const resolvedAudience =
    assertPlanAudience(
      raw,
      audience,
    );

  const id =
    requiredPlanId(
      raw.id,
    );

  const code =
    normalizePlanCode(
      raw.code,
      resolvedAudience,
    );

  const currency =
    requiredCurrency(
      raw.currency,
      code,
    );

  const priceAmount =
    requiredPrice(
      raw.priceAmount ??
        raw.price_amount,
      code,
    );

  const durationDays =
    requiredDuration(
      raw.durationDays ??
        raw.duration_days,
      code,
    );

  const billingInterval =
    normalizeBillingInterval(
      raw.billingInterval ??
        raw.billing_interval,
    );

  const name =
    normalizeText(
      raw.name ??
        raw.title,
      null,
      500,
    );

  if (!name) {
    throw new SubscriptionPlansError(
      `Subscription plan ${code} returned without a valid name.`,
      {
        source: "backend",
      },
    );
  }

  const rawIsActive =
    raw.isActive ??
    raw.is_active;

  /*
   * Missing isActive = false.
   */
  const isActive =
    toBoolean(
      rawIsActive,
      false,
    );

  const rawSortOrder =
    nonNegativeNullableInteger(
      raw.sortOrder ??
        raw.sort_order,
    );

  const rawPriceId =
    positiveNullableId(
      raw.priceId ??
        raw.price_id,
    );

  const rawPriceVariantId =
    positiveNullableId(
      raw.priceVariantId ??
        raw.price_variant_id ??
        raw.priceId ??
        raw.price_id,
    );

  /*
   * Provider is informational.
   *
   * Payment authority remains backend-side.
   */
  const provider =
    normalizeText(
      raw.provider,
      null,
      100,
    ) ?? undefined;

  /*
   * Public catalogue may intentionally expose null Razorpay plan id.
   */
  const razorpayPlanId =
    normalizeText(
      raw.razorpayPlanId ??
        raw.razorpay_plan_id,
      null,
      500,
    );

  return {
    id,
    code,

    audience:
      resolvedAudience,

    ownerType:
      resolvedAudience,

    name,

    title:
      normalizeText(
        raw.title,
        null,
        500,
      ) ?? undefined,

    description:
      normalizeText(
        raw.description,
        null,
      ),

    priceAmount,
    currency,

    billingInterval,
    durationDays,

    priceId:
      rawPriceId ??
      undefined,

    priceVariantId:
      rawPriceVariantId ??
      undefined,

    provider,

    sortOrder:
      rawSortOrder ??
      undefined,

    /*
     * Commercial entitlements.
     *
     * Always normalize to non-negative integers.
     */
    leadLimit:
      toNonNegativeInteger(
        raw.leadLimit ??
          raw.lead_limit,
        0,
      ),

    serviceLimit:
      toNonNegativeInteger(
        raw.serviceLimit ??
          raw.service_limit,
        0,
      ),

    serviceAreaLimit:
      toNonNegativeInteger(
        raw.serviceAreaLimit ??
          raw.service_area_limit,
        0,
      ),

    galleryLimit:
      toNonNegativeInteger(
        raw.galleryLimit ??
          raw.gallery_limit,
        0,
      ),

    videoLimit:
      toNonNegativeInteger(
        raw.videoLimit ??
          raw.video_limit,
        0,
      ),

    programLimit:
      toNonNegativeInteger(
        raw.programLimit ??
          raw.program_limit,
        0,
      ),

    listingEnabled:
      toBoolean(
        raw.listingEnabled ??
          raw.listing_enabled,
      ),

    featuredListing:
      toBoolean(
        raw.featuredListing ??
          raw.featured_listing,
      ),

    prioritySupport:
      toBoolean(
        raw.prioritySupport ??
          raw.priority_support,
      ),

    verificationBadge:
      toBoolean(
        raw.verificationBadge ??
          raw.verification_badge,
      ),

    analyticsAccess:
      toBoolean(
        raw.analyticsAccess ??
          raw.analytics_access,
      ),

    homepagePromotion:
      toBoolean(
        raw.homepagePromotion ??
          raw.homepage_promotion,
      ),

    liveAartiEnabled:
      toBoolean(
        raw.liveAartiEnabled ??
          raw.live_aarti_enabled,
      ),

    enhancedSeo:
      toBoolean(
        raw.enhancedSeo ??
          raw.enhanced_seo,
      ),

    enhancedProfile:
      toBoolean(
        raw.enhancedProfile ??
          raw.enhanced_profile,
      ),

    whatsappEnquiry:
      toBoolean(
        raw.whatsappEnquiry ??
          raw.whatsapp_enquiry,
      ),

    searchVisibility:
      String(
        raw.searchVisibility ??
          raw.search_visibility ??
          "standard",
      )
        .trim()
        .slice(
          0,
          MAX_VISIBILITY_LENGTH,
        ),

    analyticsLevel:
      String(
        raw.analyticsLevel ??
          raw.analytics_level ??
          "basic",
      )
        .trim()
        .slice(
          0,
          MAX_ANALYTICS_LEVEL_LENGTH,
        ),

    features:
      normalizeFeatures(
        raw.features ??
          raw.plan_features_json,
      ),

    razorpayPlanId,

    isActive,
  };
}

/*
|--------------------------------------------------------------------------
| Response validation
|--------------------------------------------------------------------------
|
| IMPORTANT FIX
|
| Current backend response is:
|
| {
|   success: true,
|   currency: "INR",
|   billingInterval: "monthly",
|   monthlyOnly: true,
|   plans: [...]
| }
|
| It does NOT necessarily contain:
|
|   ownerType: "pandit"
|
| Therefore ownerType is safely inferred from the returned plans and/or
| the requested audience.
|--------------------------------------------------------------------------
*/

function parseResponse(
  payload: unknown,
  requestedAudience: SubscriptionAudience,
): SubscriptionPlansResponse {
  if (
    !payload ||
    typeof payload !==
      "object" ||
    Array.isArray(
      payload,
    )
  ) {
    throw new SubscriptionPlansError(
      "Subscription API returned an invalid response.",
      {
        source: "backend",
      },
    );
  }

  const record =
    payload as Record<
      string,
      unknown
    >;

  const success =
    record.success ===
    true;

  const rawPlans =
    record.plans;

  if (
    !success ||
    !Array.isArray(
      rawPlans,
    )
  ) {
    const error =
      normalizeText(
        record.error,
        null,
        1_000,
      );

    throw new SubscriptionPlansError(
      error ||
        "Unable to load subscription plans.",
      {
        source: "backend",
      },
    );
  }

  if (
    rawPlans.length >
    MAX_PLAN_COUNT
  ) {
    throw new SubscriptionPlansError(
      "Subscription API returned an unexpectedly large plan catalogue.",
      {
        source: "backend",
      },
    );
  }

  /*
   * The backend can provide ownerType at the response level,
   * but it is optional in the current API contract.
   */
  const topLevelOwnerType =
    normalizeAudience(
      record.ownerType ??
        record.owner_type,
    );

  let resolvedOwnerType =
    topLevelOwnerType;

  /*
   * Inspect individual plan audiences.
   */
  for (
    const rawPlan of rawPlans
  ) {
    if (
      !rawPlan ||
      typeof rawPlan !==
        "object" ||
      Array.isArray(
        rawPlan,
      )
    ) {
      throw new SubscriptionPlansError(
        "Subscription API returned an invalid plan record.",
        {
          source: "backend",
        },
      );
    }

    const planRecord =
      rawPlan as Record<
        string,
        unknown
      >;

    const planAudience =
      normalizeAudience(
        planRecord.audience ??
          planRecord.ownerType ??
          planRecord.owner_type,
      );

    /*
     * Every plan must have an identifiable audience.
     */
    if (!planAudience) {
      throw new SubscriptionPlansError(
        "Subscription API returned a plan without a valid audience.",
        {
          source: "backend",
        },
      );
    }

    /*
     * This endpoint is requested for one audience.
     * Cross-audience records are never accepted.
     */
    if (
      planAudience !==
      requestedAudience
    ) {
      throw new SubscriptionPlansError(
        "Subscription API returned a plan for a different business audience.",
        {
          source: "backend",
        },
      );
    }

    if (
      resolvedOwnerType ===
      null
    ) {
      resolvedOwnerType =
        planAudience;
    } else if (
      resolvedOwnerType !==
      planAudience
    ) {
      throw new SubscriptionPlansError(
        "Subscription API returned plans belonging to multiple business audiences.",
        {
          source: "backend",
        },
      );
    }
  }

  /*
   * The request itself is audience-specific.
   *
   * Therefore requestedAudience is the final safe owner type when
   * the backend omits the top-level ownerType.
   */
  if (
    resolvedOwnerType ===
      null
  ) {
    resolvedOwnerType =
      requestedAudience;
  }

  if (
    resolvedOwnerType !==
    requestedAudience
  ) {
    throw new SubscriptionPlansError(
      "Subscription API returned a catalogue for a different audience.",
      {
        source: "backend",
      },
    );
  }

  /*
   * Optional top-level metadata.
   */
  const rawCurrency =
    String(
      record.currency ??
        "",
    )
      .trim()
      .toUpperCase();

  const currency =
    /^[A-Z]{3}$/.test(
      rawCurrency,
    )
      ? rawCurrency
      : undefined;

  let billingInterval:
    | SubscriptionBillingInterval
    | undefined;

  const rawBillingInterval =
    record.billingInterval ??
    record.billing_interval;

  if (
    rawBillingInterval !==
      undefined &&
    rawBillingInterval !==
      null &&
    String(
      rawBillingInterval,
    ).trim() !== ""
  ) {
    billingInterval =
      normalizeBillingInterval(
        rawBillingInterval,
      );
  }

  return {
    success: true,

    ownerType:
      resolvedOwnerType,

    plans:
      rawPlans,

    error:
      typeof record.error ===
      "string"
        ? record.error
        : undefined,

    currency,

    billingInterval,

    monthlyOnly:
      toBoolean(
        record.monthlyOnly ??
          record.monthly_only,
        false,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| HTTP helpers
|--------------------------------------------------------------------------
*/

async function readJsonSafely(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers
      .get(
        "content-type",
      )
      ?.toLowerCase() ??
    "";

  if (
    !contentType.includes(
      "application/json",
    ) &&
    !contentType.includes(
      "+json",
    )
  ) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function retryAfterSeconds(
  response: Response,
): number | null {
  const value =
    response.headers.get(
      "retry-after",
    );

  if (!value) {
    return null;
  }

  const seconds =
    Number(value);

  return Number.isFinite(
    seconds,
  ) && seconds >= 0
    ? Math.ceil(
        seconds,
      )
    : null;
}

function errorMessageForStatus(
  status: number,
): string {
  switch (status) {
    case 400:
      return "Invalid subscription plan request.";

    case 401:
      return "Please sign in to access subscription plans.";

    case 403:
      return "You do not have permission to access this subscription catalogue.";

    case 404:
      return "Subscription plans were not found.";

    case 408:
      return "Subscription plan request timed out.";

    case 429:
      return "Too many plan requests. Please try again shortly.";

    case 500:
      return "The subscription service encountered a server error.";

    case 502:
      return "Subscription service gateway error.";

    case 503:
      return "Subscription service is temporarily unavailable.";

    case 504:
      return "Subscription service timed out.";

    default:
      return "Unable to load subscription plans right now.";
  }
}

/*
|--------------------------------------------------------------------------
| Plan sorting / deduplication
|--------------------------------------------------------------------------
*/

function getPlanDeduplicationKey(
  plan: SubscriptionPlan,
): string {
  return `${plan.id}:${plan.code}`;
}

function comparePlans(
  a: SubscriptionPlan,
  b: SubscriptionPlan,
): number {
  const aSort =
    Number.isSafeInteger(
      a.sortOrder,
    )
      ? (a.sortOrder as number)
      : Number.MAX_SAFE_INTEGER;

  const bSort =
    Number.isSafeInteger(
      b.sortOrder,
    )
      ? (b.sortOrder as number)
      : Number.MAX_SAFE_INTEGER;

  if (
    aSort !==
    bSort
  ) {
    return (
      aSort -
      bSort
    );
  }

  const nameCompare =
    a.name.localeCompare(
      b.name,
      "en",
      {
        sensitivity:
          "base",
      },
    );

  if (
    nameCompare !==
    0
  ) {
    return nameCompare;
  }

  return (
    a.id -
    b.id
  );
}

function normalizeBackendPlans(
  plans: unknown[],
  audience: SubscriptionAudience,
): SubscriptionPlan[] {
  const normalized: SubscriptionPlan[] =
    [];

  const seen =
    new Set<string>();

  for (
    const raw of plans
  ) {
    if (
      !raw ||
      typeof raw !==
        "object" ||
      Array.isArray(
        raw,
      )
    ) {
      throw new SubscriptionPlansError(
        "Subscription API returned an invalid plan record.",
        {
          source: "backend",
        },
      );
    }

    const plan =
      normalizePlan(
        raw as Record<
          string,
          unknown
        >,
        audience,
      );

    /*
     * Inactive rows may exist in DB.
     * They are never exposed as active/purchasable catalogue entries.
     */
    if (
      !plan.isActive
    ) {
      continue;
    }

    const key =
      getPlanDeduplicationKey(
        plan,
      );

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    normalized.push(
      plan,
    );
  }

  normalized.sort(
    comparePlans,
  );

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Fetch current subscription plans
|--------------------------------------------------------------------------
*/

export async function fetchSubscriptionPlans(
  audience: SubscriptionAudience,
  signal?: AbortSignal,
  options: FetchSubscriptionPlansOptions = {},
): Promise<SubscriptionPlan[]> {
  if (
    !isSubscriptionAudience(
      audience,
    )
  ) {
    throw new SubscriptionPlansError(
      "A valid subscription audience is required.",
      {
        source: null,
      },
    );
  }

  if (!API_URL) {
    throw new SubscriptionPlansError(
      "Subscription API base URL is not configured.",
      {
        source: null,
      },
    );
  }

  const controller =
    new AbortController();

  let timedOut =
    false;

  let externalAbortHandler:
    | (() => void)
    | null =
    null;

  /*
   * Connect external AbortSignal.
   */
  if (signal) {
    if (
      signal.aborted
    ) {
      throw new SubscriptionPlansError(
        "Subscription plan request was cancelled.",
        {
          source: null,
        },
      );
    }

    externalAbortHandler =
      () => {
        controller.abort();
      };

    signal.addEventListener(
      "abort",
      externalAbortHandler,
      {
        once: true,
      },
    );
  }

  const requestTimeout =
    timeoutMs(
      options.timeoutMs,
    );

  const timeoutHandle =
    globalThis.setTimeout(
      () => {
        timedOut =
          true;

        controller.abort();
      },
      requestTimeout,
    );

  try {
    const query =
      new URLSearchParams();

    /*
     * Public catalogue endpoint.
     */
    query.set(
      "ownerType",
      audience,
    );

    const endpoint =
      `${API_URL}${SUBSCRIPTION_PLANS_ENDPOINT}?${query.toString()}`;

    const response =
      await fetch(
        endpoint,
        {
          method: "GET",

          /*
           * Plans are public.
           *
           * No authentication cookie/session is needed for
           * catalogue reads.
           */
          credentials: "omit",

          /*
           * Browser cache policy belongs here.
           *
           * DO NOT send Cache-Control / Pragma / Expires as custom
           * request headers because they can trigger unnecessary CORS
           * preflight requirements.
           */
          cache: "no-store",

          signal:
            controller.signal,

          /*
           * Accept is sufficient.
           */
          headers: {
            Accept:
              "application/json",
          },
        },
      );

    const payload =
      await readJsonSafely(
        response,
      );

    if (
      !response.ok
    ) {
      throw new SubscriptionPlansError(
        errorMessageForStatus(
          response.status,
        ),
        {
          statusCode:
            response.status,

          source:
            "backend",

          retryAfterSeconds:
            retryAfterSeconds(
              response,
            ),
        },
      );
    }

    const parsed =
      parseResponse(
        payload,
        audience,
      );

    /*
     * Defensive audience check.
     */
    if (
      parsed.ownerType !==
      audience
    ) {
      throw new SubscriptionPlansError(
        "Subscription API returned a catalogue for a different audience.",
        {
          source: "backend",
        },
      );
    }

    const plans =
      normalizeBackendPlans(
        parsed.plans,
        audience,
      );

    /*
     * No active authoritative plan means no checkout.
     */
    if (
      plans.length ===
      0
    ) {
      throw new SubscriptionPlansError(
        `No active ${audience} subscription plans are currently available.`,
        {
          source: "backend",
        },
      );
    }

    return plans;
  } catch (error) {
    /*
     * Already normalized error.
     */
    if (
      error instanceof
      SubscriptionPlansError
    ) {
      throw error;
    }

    /*
     * Timeout must be checked before generic AbortError.
     */
    if (timedOut) {
      throw new SubscriptionPlansError(
        `Subscription plan request timed out after ${requestTimeout}ms.`,
        {
          source: "backend",
        },
      );
    }

    /*
     * Caller/component cancellation.
     *
     * Do not convert this into a visible network error.
     */
    if (
      signal?.aborted ||
      controller.signal.aborted
    ) {
      throw new SubscriptionPlansError(
        "Subscription plan request was cancelled.",
        {
          source: null,
        },
      );
    }

    /*
     * Network / CORS / fetch failure.
     */
    throw new SubscriptionPlansError(
      "Unable to reach the DivyaDhara subscription service.",
      {
        source: "backend",
      },
    );
  } finally {
    globalThis.clearTimeout(
      timeoutHandle,
    );

    if (
      externalAbortHandler &&
      signal
    ) {
      signal.removeEventListener(
        "abort",
        externalAbortHandler,
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| Fallback plans — DISPLAY ONLY
|--------------------------------------------------------------------------
|
| IMPORTANT
| - id = 0 means there is no authoritative backend purchase record.
| - These values are only for degraded UI display.
| - They must NEVER be sent as payment authority.
|--------------------------------------------------------------------------
*/

export function getFallbackPlans(
  audience: SubscriptionAudience,
): SubscriptionPlan[] {
  return (
    FALLBACK_PLANS[
      audience
    ] ?? []
  ).map(
    (
      plan,
    ) => ({
      ...plan,

      features: [
        ...plan.features,
      ],
    }),
  );
}

export function getFallbackPlansForDisplay(
  audience: SubscriptionAudience,
): SubscriptionPlan[] {
  return getFallbackPlans(
    audience,
  );
}

/*
|--------------------------------------------------------------------------
| Price formatting
|--------------------------------------------------------------------------
*/

export function formatSubscriptionPrice(
  amount: number,
  currency = "INR",
): string {
  const numericAmount =
    Number(amount);

  if (
    !Number.isFinite(
      numericAmount,
    ) ||
    numericAmount < 0
  ) {
    return "—";
  }

  const normalizedCurrency =
    /^[A-Za-z]{3}$/.test(
      String(
        currency ?? "",
      ).trim(),
    )
      ? String(
          currency,
        )
          .trim()
          .toUpperCase()
      : "INR";

  try {
    return new Intl.NumberFormat(
      "en-IN",
      {
        style:
          "currency",

        currency:
          normalizedCurrency,

        maximumFractionDigits:
          0,
      },
    ).format(
      numericAmount,
    );
  } catch {
    return `${normalizedCurrency} ${Math.round(
      numericAmount,
    ).toLocaleString(
      "en-IN",
    )}`;
  }
}

/*
|--------------------------------------------------------------------------
| DISPLAY-ONLY FALLBACK CATALOGUE
|--------------------------------------------------------------------------
*/

export const FALLBACK_PLANS: Record<
  SubscriptionAudience,
  SubscriptionPlan[]
> = {
  /*
  |--------------------------------------------------------------------------
  | Pandit
  |--------------------------------------------------------------------------
  */

  pandit: [
    {
      id: 0,

      code:
        "pandit_basic",

      audience:
        "pandit",

      ownerType:
        "pandit",

      name:
        "Basic",

      description:
        "Professional Pandit listing with essential enquiry tools.",

      priceAmount:
        199,

      currency:
        "INR",

      billingInterval:
        "monthly",

      durationDays:
        30,

      provider:
        "razorpay",

      leadLimit:
        10,

      serviceLimit:
        5,

      serviceAreaLimit:
        2,

      galleryLimit:
        0,

      videoLimit:
        0,

      programLimit:
        0,

      listingEnabled:
        true,

      featuredListing:
        false,

      prioritySupport:
        false,

      verificationBadge:
        true,

      analyticsAccess:
        true,

      homepagePromotion:
        false,

      liveAartiEnabled:
        false,

      enhancedSeo:
        false,

      enhancedProfile:
        false,

      whatsappEnquiry:
        true,

      searchVisibility:
        "standard",

      analyticsLevel:
        "basic",

      features: [
        "10 qualified leads / month",
        "Up to 5 services",
        "2 service areas",
        "WhatsApp enquiries",
        "Basic analytics",
        "Verification badge",
      ],

      razorpayPlanId:
        null,

      priceVariantId:
        undefined,

      isActive:
        true,
    },

    {
      id: 0,

      code:
        "pandit_premium",

      audience:
        "pandit",

      ownerType:
        "pandit",

      name:
        "Premium",

      description:
        "Enhanced visibility and enquiry tools for established Pandits.",

      priceAmount:
        499,

      currency:
        "INR",

      billingInterval:
        "monthly",

      durationDays:
        30,

      provider:
        "razorpay",

      leadLimit:
        30,

      serviceLimit:
        15,

      serviceAreaLimit:
        0,

      galleryLimit:
        0,

      videoLimit:
        0,

      programLimit:
        0,

      listingEnabled:
        true,

      featuredListing:
        true,

      prioritySupport:
        true,

      verificationBadge:
        true,

      analyticsAccess:
        true,

      homepagePromotion:
        true,

      liveAartiEnabled:
        false,

      enhancedSeo:
        true,

      enhancedProfile:
        true,

      whatsappEnquiry:
        true,

      searchVisibility:
        "higher",

      analyticsLevel:
        "advanced",

      features: [
        "30 qualified leads / month",
        "Up to 15 services",
        "Featured listing",
        "Higher search visibility",
        "Enhanced profile + SEO",
        "Homepage promotion",
        "Advanced analytics",
        "Priority support",
      ],

      razorpayPlanId:
        null,

      priceVariantId:
        undefined,

      isActive:
        true,
    },
  ],

  /*
  |--------------------------------------------------------------------------
  | Temple
  |--------------------------------------------------------------------------
  */

  temple: [
    {
      id: 0,

      code:
        "temple_basic",

      audience:
        "temple",

      ownerType:
        "temple",

      name:
        "Basic",

      description:
        "Essential temple presence with enquiry and content support.",

      priceAmount:
        499,

      currency:
        "INR",

      billingInterval:
        "monthly",

      durationDays:
        30,

      provider:
        "razorpay",

      leadLimit:
        15,

      serviceLimit:
        0,

      serviceAreaLimit:
        0,

      galleryLimit:
        15,

      videoLimit:
        2,

      programLimit:
        0,

      listingEnabled:
        true,

      featuredListing:
        false,

      prioritySupport:
        false,

      verificationBadge:
        true,

      analyticsAccess:
        true,

      homepagePromotion:
        false,

      liveAartiEnabled:
        false,

      enhancedSeo:
        false,

      enhancedProfile:
        false,

      whatsappEnquiry:
        true,

      searchVisibility:
        "standard",

      analyticsLevel:
        "basic",

      features: [
        "15 enquiries / month",
        "15 gallery items",
        "2 videos",
        "WhatsApp enquiries",
        "Basic analytics",
        "Verification badge",
      ],

      razorpayPlanId:
        null,

      priceVariantId:
        undefined,

      isActive:
        true,
    },

    {
      id: 0,

      code:
        "temple_premium",

      audience:
        "temple",

      ownerType:
        "temple",

      name:
        "Premium",

      description:
        "Full-featured temple presence with enhanced visibility and live aarti support.",

      priceAmount:
        999,

      currency:
        "INR",

      billingInterval:
        "monthly",

      durationDays:
        30,

      provider:
        "razorpay",

      leadLimit:
        50,

      serviceLimit:
        0,

      serviceAreaLimit:
        0,

      galleryLimit:
        50,

      videoLimit:
        10,

      programLimit:
        0,

      listingEnabled:
        true,

      featuredListing:
        true,

      prioritySupport:
        true,

      verificationBadge:
        true,

      analyticsAccess:
        true,

      homepagePromotion:
        true,

      liveAartiEnabled:
        true,

      enhancedSeo:
        true,

      enhancedProfile:
        true,

      whatsappEnquiry:
        true,

      searchVisibility:
        "higher",

      analyticsLevel:
        "advanced",

      features: [
        "50 enquiries / month",
        "50 gallery items",
        "10 videos",
        "Live aarti support",
        "Featured listing",
        "Higher search visibility",
        "Enhanced profile + SEO",
        "Homepage promotion",
        "Advanced analytics",
        "Priority support",
      ],

      razorpayPlanId:
        null,

      priceVariantId:
        undefined,

      isActive:
        true,
    },
  ],

  /*
  |--------------------------------------------------------------------------
  | Ashram
  |--------------------------------------------------------------------------
  */

  ashram: [
    {
      id: 0,

      code:
        "ashram_basic",

      audience:
        "ashram",

      ownerType:
        "ashram",

      name:
        "Basic",

      description:
        "Essential Ashram listing with programme and enquiry capacity.",

      priceAmount:
        499,

      currency:
        "INR",

      billingInterval:
        "monthly",

      durationDays:
        30,

      provider:
        "razorpay",

      leadLimit:
        15,

      serviceLimit:
        0,

      serviceAreaLimit:
        0,

      galleryLimit:
        15,

      videoLimit:
        2,

      programLimit:
        3,

      listingEnabled:
        true,

      featuredListing:
        false,

      prioritySupport:
        false,

      verificationBadge:
        true,

      analyticsAccess:
        true,

      homepagePromotion:
        false,

      liveAartiEnabled:
        false,

      enhancedSeo:
        false,

      enhancedProfile:
        false,

      whatsappEnquiry:
        true,

      searchVisibility:
        "standard",

      analyticsLevel:
        "basic",

      features: [
        "15 enquiries / month",
        "15 gallery items",
        "2 videos",
        "Up to 3 programmes",
        "WhatsApp enquiries",
        "Basic analytics",
        "Verification badge",
      ],

      razorpayPlanId:
        null,

      priceVariantId:
        undefined,

      isActive:
        true,
    },

    {
      id: 0,

      code:
        "ashram_premium",

      audience:
        "ashram",

      ownerType:
        "ashram",

      name:
        "Premium",

      description:
        "Expanded Ashram presence with stronger visibility and programme capacity.",

      priceAmount:
        1499,

      currency:
        "INR",

      billingInterval:
        "monthly",

      durationDays:
        30,

      provider:
        "razorpay",

      leadLimit:
        75,

      serviceLimit:
        0,

      serviceAreaLimit:
        0,

      galleryLimit:
        50,

      videoLimit:
        10,

      programLimit:
        15,

      listingEnabled:
        true,

      featuredListing:
        true,

      prioritySupport:
        true,

      verificationBadge:
        true,

      analyticsAccess:
        true,

      homepagePromotion:
        true,

      liveAartiEnabled:
        false,

      enhancedSeo:
        true,

      enhancedProfile:
        true,

      whatsappEnquiry:
        true,

      searchVisibility:
        "higher",

      analyticsLevel:
        "advanced",

      features: [
        "75 enquiries / month",
        "50 gallery items",
        "10 videos",
        "Up to 15 programmes",
        "Featured listing",
        "Higher search visibility",
        "Enhanced profile + SEO",
        "Homepage promotion",
        "Advanced analytics",
        "Priority support",
      ],

      razorpayPlanId:
        null,

      priceVariantId:
        undefined,

      isActive:
        true,
    },
  ],
};