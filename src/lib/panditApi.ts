/* ============================================================================
 * DivyaDhara Pandit API Client
 * ----------------------------------------------------------------------------
 * Centralized Pandit self-service API layer.
 *
 * Backend:
 *   Express + SQLite
 *
 * Canonical backend mount:
 *   /api/pandit
 *
 * Authentication / authorization:
 *   Backend enforces authenticated + `pandit` role access.
 *
 * Business authority:
 *   - Admin owns approval / verification / featured flags.
 *   - Payments own payment verification / activation.
 *   - Subscription data is server-controlled.
 *   - Lead credits / quotas are server-controlled.
 *   - Pandit may manage only permitted profile/service/lead workflow fields.
 *
 * URL handling:
 *   Uses the centralized `buildApiUrl()` from ./api.
 *   This guarantees the `/api` prefix is not duplicated.
 *
 * Cache / CORS:
 *   - Never manually send Cache-Control / Pragma / Expires request headers.
 *   - Do not force fetch cache mode to `no-store`.
 *   - The backend controls response caching with Cache-Control: no-store.
 * ========================================================================== */

import { buildApiUrl } from "./api";

/* ============================================================================
 * Constants
 * ========================================================================== */

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2_000_000;

const JSON_CONTENT_TYPE = "application/json";

/*
 * These are intentionally removed from outbound application headers.
 *
 * IMPORTANT:
 * `Cache-Control`, `Pragma`, and `Expires` are not application headers
 * that this API client should manually inject. Doing so can make a
 * cross-origin request trigger a CORS preflight.
 *
 * The backend is responsible for response-side cache policy.
 */
const REQUEST_CACHE_HEADERS_TO_REMOVE = [
  "cache-control",
  "pragma",
  "expires",
] as const;

/* ============================================================================
 * Shared API Types
 * ========================================================================== */

export type PublicListingEligibility = {
  eligible?: boolean;
  accountActive?: boolean;
  profileApproved?: boolean;
  verificationComplete?: boolean;
  subscriptionActive?: boolean;
  listingEntitled?: boolean;
  listingRequested?: boolean;
  public?: boolean;
};

export type PanditProfile = {
  id: number;
  userId: number;
  slug: string;
  displayName: string;
  title: string | null;
  photo: string | null;
  experienceYears: number;
  location: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;

  locationId?: number | null;
  countryLocationId?: number | null;
  stateLocationId?: number | null;
  districtLocationId?: number | null;
  cityLocationId?: number | null;

  languages: string[];
  specializations: string[];
  pujaTypes: string[];

  associatedWith: string | null;
  about: string | null;
  availability: string | null;

  serviceAreas: string[];
  serviceLocationIds?: number[];

  profileStatus: string;
  verificationStatus: string;

  identityVerified: boolean;
  profileVerified: boolean;
  authorizedContact: boolean;

  featured: boolean;
  listingActive: boolean;
  effectivePublicListing?: boolean;

  publicListingEligibility?: PublicListingEligibility;

  verifiedAt?: string | null;
  verificationNotes?: string | null;
  rejectionReason?: string | null;

  createdAt: string;
  updatedAt: string;
};

export type PanditService = {
  id: number;
  panditId: number;
  name: string;
  slug?: string;

  description: string | null;

  priceDisplay?: string | null;
  durationText?: string | null;

  priceAmount: number | null;
  currency: string;
  durationMinutes: number | null;

  isActive: boolean;

  sortOrder?: number;

  createdAt: string;
  updatedAt: string;
};

export type VerificationDocument = {
  id: number;

  panditId?: number;

  documentType: string;
  documentName: string | null;
  documentUrl: string | null;

  status: string;

  reviewerNote: string | null;
  reviewedAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export type VerificationDocumentsResponse = {
  success?: boolean;

  documents?: VerificationDocument[];

  allowedDocumentTypes?: string[];

  verification?: {
    profileStatus?: string;
    verificationStatus?: string;
    identityVerified?: boolean;
    profileVerified?: boolean;
    authorizedContact?: boolean;
    adminControlled?: boolean;
  };

  immutabilityRules?: {
    approvedDocumentsCanNotBeEdited?: boolean;
    rejectedDocumentsCanBeResubmitted?: boolean;
    approvedDocumentsCanNotBeDeleted?: boolean;
  };

  message?: string;
  error?: string;
  code?: string;
};

export type VerificationDocumentInput = {
  documentType: string;
  documentName?: string | null;
  documentUrl: string;
};

export type VerificationDocumentResubmitInput = {
  documentName?: string | null;
  documentUrl?: string | null;
};

export type PanditSubscription = {
  id: number;
  panditId: number;
  planId: number;

  status: string;

  startsAt: string | null;
  expiresAt: string | null;

  leadLimit: number;
  leadsUsed: number;
  leadsRemaining: number;

  autoRenew: boolean;

  priceAmount: number;
  currency: string;

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

  paymentOrderId: number | null;
  paymentId: number | null;

  razorpaySubscriptionId: string | null;

  planSnapshot?: Record<string, unknown> | null;

  notes: string | null;

  planCode: string | null;
  planName: string | null;
  planPrice: number | null;
  planCurrency: string | null;
  planInterval: string | null;

  createdAt: string;
  updatedAt: string;
};

export type PanditPlan = {
  id: number;

  code: string;

  audience: "pandit" | string;

  name: string;
  description: string | null;

  priceAmount: number;
  currency: string;

  billingInterval: string;
  durationDays: number;

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

  razorpayPlanId?: string | null;
};

export type PanditStats = {
  totalServices: number;
  activeServices: number;
  inactiveServices: number;

  totalDocuments?: number;
  pendingDocuments?: number;
  approvedDocuments?: number;
  rejectedDocuments?: number;

  leadsTotal?: number;
  openLeads?: number;
  convertedLeads?: number;
  followUps?: number;
  creditedLeads?: number;

  leadsRemaining?: number;

  serviceLimit?: number;
  servicesRemaining?: number | null;

  serviceAreaLimit?: number;
  serviceAreasUsed?: number;
  serviceAreasRemaining?: number | null;

  unreadNotifications?: number;
};

export type PanditDashboardRules = {
  listingRequiresApproval?: boolean;
  listingRequiresVerifiedIdentity?: boolean;
  listingRequiresVerifiedProfile?: boolean;
  listingRequiresAuthorizedContact?: boolean;
  listingRequiresPaidPlan?: boolean;

  adminOwnsVerificationFlags?: boolean;

  serviceLimitEnforced?: boolean;
  serviceAreaLimitEnforced?: boolean;

  creditsServerControlled?: boolean;
  paymentActivationServerControlled?: boolean;
};

export type PanditDashboardResponse = {
  success?: boolean;

  profile: PanditProfile;

  services: PanditService[];

  verificationDocuments?: VerificationDocument[];

  subscription?: PanditSubscription | null;

  plans?: PanditPlan[];

  stats?: PanditStats;

  rules?: PanditDashboardRules;

  message?: string;
  error?: string;
  code?: string;
};

/* ============================================================================
 * Profile Input
 * ========================================================================== */

export type PanditProfileInput = {
  name?: string;
  phone?: string;

  city?: string;
  district?: string;
  state?: string;
  country?: string;

  displayName?: string;
  title?: string;
  photo?: string;

  experienceYears?: number;

  location?: string;

  locationId?: number | null;

  languages?: string[];
  specializations?: string[];
  pujaTypes?: string[];

  associatedWith?: string;
  about?: string;
  availability?: string;

  serviceAreas?: string[];

  serviceLocationIds?: number[];

  serviceAreasLocationIds?: number[];
};

/* ============================================================================
 * Service Input
 * ========================================================================== */

export type PanditServiceInput = {
  name: string;

  description?: string;

  priceAmount?: number | null;

  currency?: string;

  durationMinutes?: number | null;

  isActive?: boolean;
};

export type PanditServiceUpdateInput =
  Partial<PanditServiceInput>;

/* ============================================================================
 * Generic API Result
 * ========================================================================== */

export type PanditApiResult<
  T = Record<string, unknown>,
> = T & {
  success?: boolean;
  message?: string;
  error?: string;
  code?: string;
};

/* ============================================================================
 * Listing Response
 * ========================================================================== */

export type PanditListingResponse = {
  success?: boolean;

  listingActive?: boolean;

  profileListingActive?: boolean;

  listing?: PublicListingEligibility;

  eligibility?: PublicListingEligibility;

  profile?: PanditProfile;

  subscription?: PanditSubscription | null;

  message?: string;
  error?: string;
  code?: string;
};

export type PanditSetListingResponse = {
  success?: boolean;

  listingActive: boolean;

  listing?: PublicListingEligibility;

  message?: string;
  error?: string;
  code?: string;
};

/* ============================================================================
 * Subscription Responses
 * ========================================================================== */

export type PanditSubscriptionPlansResponse = {
  success?: boolean;

  currency?: string;
  billing?: string;

  plans?: PanditPlan[];

  sourceOfTruth?: string;

  message?: string;
  error?: string;
  code?: string;
};

export type PanditSubscriptionResponse = {
  success?: boolean;

  current?: PanditSubscription | null;

  history?: PanditSubscription[];

  limits?: {
    serviceLimit?: number;
    serviceAreaLimit?: number;
    leadLimit?: number;
  };

  paymentArchitecture?: string;

  message?: string;
  error?: string;
  code?: string;
};

export type PanditSubscriptionUsageResponse = {
  success?: boolean;

  subscription?: PanditSubscription | null;

  usage?: {
    leads?: {
      used?: number;
      limit?: number;
      remaining?: number;
      exhausted?: boolean;
    };

    services?: {
      used?: number;
      limit?: number;
      remaining?: number | null;
      exhausted?: boolean;
    };

    serviceAreas?: {
      used?: number;
      limit?: number;
      remaining?: number | null;
      exhausted?: boolean;
    };
  };

  note?: string;

  message?: string;
  error?: string;
  code?: string;
};

export type PreparePanditSubscriptionInput = {
  planId: number | string;
};

export type PreparePanditSubscriptionResponse = {
  success?: boolean;

  message?: string;

  ownerType?: "pandit" | string;
  ownerId?: number;

  subscription?: PanditSubscription | null;

  payment?: {
    required?: boolean;

    provider?: string;

    amount?: number;
    amountPaise?: number;

    currency?: string;

    planId?: number;
    subscriptionId?: number;

    orderCreationOwnedBy?: string;
    activationOwnedBy?: string;
  };

  error?: string;
  code?: string;
};

export type AutoRenewResponse = {
  success?: boolean;

  autoRenew?: boolean;

  subscription?: PanditSubscription | null;

  message?: string;
  error?: string;
  code?: string;
};

export type CancelSubscriptionResponse = {
  success?: boolean;

  message?: string;

  subscription?: PanditSubscription | null;

  error?: string;
  code?: string;
};

/* ============================================================================
 * Lead Types
 * ========================================================================== */

export type PanditLeadListParams = {
  page?: number;
  limit?: number;

  status?: string;

  search?: string;
};

export type PanditLeadAssignment = {
  id?: number;

  leadId?: number;
  panditId?: number;

  assignmentType?: string;
  status?: string;

  leadCreditUsed?: boolean | number;

  creditConsumedAt?: string | null;

  assignedAt?: string | null;
  contactedAt?: string | null;
  convertedAt?: string | null;
  closedAt?: string | null;

  notes?: string | null;

  [key: string]: unknown;
};

export type PanditLead = {
  id?: number;

  leadNumber?: string;

  name?: string;

  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;

  leadType?: string | null;
  serviceType?: string | null;
  pujaType?: string | null;

  city?: string | null;
  district?: string | null;
  state?: string | null;
  country?: string | null;

  preferredDate?: string | null;
  preferredTime?: string | null;

  message?: string | null;

  sourceType?: string | null;

  status?: string | null;

  priority?: string | null;

  leadTemperature?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivityAt?: string | null;

  [key: string]: unknown;
};

export type PanditLeadsResponse = {
  success?: boolean;

  leads?: PanditLead[];

  pagination?: {
    page?: number;
    limit?: number;
    offset?: number;
    total?: number;
    totalPages?: number;
  };

  message?: string;
  error?: string;
  code?: string;
};

export type PanditLeadStatsResponse = {
  success?: boolean;

  total?: number;
  credited?: number;
  converted?: number;

  byStatus?: Array<{
    status?: string;
    count?: number;
  }>;

  subscription?: PanditSubscription | null;

  leadsRemaining?: number;

  message?: string;
  error?: string;
  code?: string;
};

export type PanditLeadDetailResponse = {
  success?: boolean;

  lead?: PanditLead;

  assignments?: PanditLeadAssignment[];

  notes?: Array<Record<string, unknown>>;

  followups?: Array<Record<string, unknown>>;

  communications?: Array<Record<string, unknown>>;

  events?: Array<Record<string, unknown>>;

  message?: string;
  error?: string;
  code?: string;
};

export type PanditLeadStatus =
  | "assigned"
  | "accepted"
  | "contacted"
  | "follow_up"
  | "converted"
  | "rejected"
  | "expired"
  | "closed";

export type UpdatePanditLeadStatusInput = {
  status: PanditLeadStatus;
};

export type PanditLeadNoteInput = {
  note: string;
  isPinned?: boolean;
};

export type PanditLeadFollowupInput = {
  dueAt: string;

  followupType?:
    | "call"
    | "whatsapp"
    | "email"
    | "meeting"
    | "reminder"
    | "other";

  subject?: string;

  notes?: string;
};

export type PanditLeadNoteResponse = {
  success?: boolean;

  note?: Record<string, unknown>;

  message?: string;
  error?: string;
  code?: string;
};

export type PanditLeadFollowupResponse = {
  success?: boolean;

  followup?: Record<string, unknown>;

  message?: string;
  error?: string;
  code?: string;
};

/* ============================================================================
 * Analytics
 * ========================================================================== */

export type PanditAnalytics = {
  success?: boolean;

  subscription?: PanditSubscription | null;

  access?: {
    level?: string;
    advanced?: boolean;
  };

  range?: {
    days?: number;
    from?: string;
    to?: string;
  };

  summary?: {
    pageViews?: number;
    uniqueVisitors?: number;
    events?: number;
  };

  conversions?: Array<{
    conversion_type?: string;
    count?: number;
    value_amount?: number;
    unique_visitors?: number;
  }>;

  daily?: Array<{
    date?: string;
    page_views?: number;
    unique_visitors?: number;
    avg_duration_seconds?: number;
    avg_scroll_depth_percent?: number;
    clicks?: number;
    interactions?: number;
    engaged_views?: number;
  }>;

  topPaths?: Array<{
    path?: string;
    page_views?: number;
    unique_visitors?: number;
  }>;

  message?: string;
  error?: string;
  code?: string;
};

/* ============================================================================
 * Notifications
 * ========================================================================== */

export type PanditNotification = {
  id?: number;

  type?: string;

  title?: string;

  message?: string;

  action_url?: string | null;

  is_read?: number | boolean;

  read_at?: string | null;

  metadata_json?: string | null;

  created_at?: string;

  [key: string]: unknown;
};

export type PanditNotificationsResponse = {
  success?: boolean;

  notifications?: PanditNotification[];

  unreadCount?: number;

  message?: string;
  error?: string;
  code?: string;
};

export type MarkNotificationReadResponse = {
  success?: boolean;

  message?: string;
  error?: string;
  code?: string;
};

export type MarkAllNotificationsReadResponse = {
  success?: boolean;

  updated?: number;

  message?: string;
  error?: string;
  code?: string;
};

/* ============================================================================
 * API Error
 * ========================================================================== */

export class PanditApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    payload?: unknown,
  ) {
    super(message);

    this.name = "PanditApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

/* ============================================================================
 * Internal Helpers
 * ========================================================================== */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getErrorMessage(
  payload: unknown,
  status: number,
): string {
  if (isRecord(payload)) {
    if (
      typeof payload.error === "string" &&
      payload.error.trim()
    ) {
      return payload.error.trim();
    }

    if (
      typeof payload.message === "string" &&
      payload.message.trim()
    ) {
      return payload.message.trim();
    }

    if (
      typeof payload.detail === "string" &&
      payload.detail.trim()
    ) {
      return payload.detail.trim();
    }
  }

  switch (status) {
    case 400:
      return "Invalid Pandit request.";

    case 401:
      return "Your session has expired. Please login again.";

    case 403:
      return "You are not authorized to perform this Pandit action.";

    case 404:
      return "The requested Pandit resource was not found.";

    case 409:
      return "This action conflicts with the current Pandit account state.";

    case 413:
      return "The server response is too large to process safely.";

    case 422:
      return "The submitted Pandit data is invalid.";

    case 429:
      return "Too many requests. Please try again later.";

    case 500:
      return "The DivyaDhara server encountered an error.";

    case 502:
    case 503:
    case 504:
      return "The DivyaDhara service is temporarily unavailable. Please try again shortly.";

    case 499:
      return "The Pandit request was cancelled.";

    default:
      return status > 0
        ? `Request failed with status ${status}.`
        : "Unable to complete the Pandit request.";
  }
}

function contentLengthTooLarge(
  response: Response,
): boolean {
  const length =
    response.headers.get("content-length");

  if (!length) {
    return false;
  }

  const numericLength =
    Number(length);

  return (
    Number.isFinite(numericLength) &&
    numericLength > MAX_RESPONSE_BYTES
  );
}

async function readResponse(
  response: Response,
): Promise<unknown> {
  if (
    contentLengthTooLarge(response)
  ) {
    throw new PanditApiError(
      "The server response is too large to process safely.",
      413,
      "RESPONSE_TOO_LARGE",
    );
  }

  const raw =
    await response.text();

  if (
    new TextEncoder()
      .encode(raw)
      .byteLength > MAX_RESPONSE_BYTES
  ) {
    throw new PanditApiError(
      "The server response is too large to process safely.",
      413,
      "RESPONSE_TOO_LARGE",
    );
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      error: raw.trim(),
    };
  }
}

function buildHeaders(
  init: RequestInit,
): Headers {
  /*
   * Only application-level headers belong here.
   *
   * NOTE:
   * Do NOT put Cache-Control / Pragma / Expires here.
   */
  const headers =
    new Headers();

  headers.set(
    "Accept",
    JSON_CONTENT_TYPE,
  );

  if (init.headers) {
    const incoming =
      new Headers(init.headers);

    incoming.forEach(
      (value, key) => {
        headers.set(key, value);
      },
    );
  }

  /*
   * Defensive protection:
   * even if a caller accidentally passes one of these headers,
   * remove it before fetch.
   */
  for (
    const headerName of REQUEST_CACHE_HEADERS_TO_REMOVE
  ) {
    headers.delete(headerName);
  }

  /*
   * JSON bodies automatically receive Content-Type unless:
   * - body is FormData
   * - body is Blob
   * - body is URLSearchParams
   * - caller already specified Content-Type
   */
  if (
    init.body !== undefined &&
    init.body !== null &&
    !(init.body instanceof FormData) &&
    !(init.body instanceof Blob) &&
    !(init.body instanceof URLSearchParams) &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      JSON_CONTENT_TYPE,
    );
  }

  return headers;
}

function buildUrl(
  path: string,
): string {
  return buildApiUrl(path);
}

function appendQuery(
  path: string,
  params?: Record<
    string,
    string | number | boolean | null | undefined
  >,
): string {
  if (!params) {
    return path;
  }

  const search =
    new URLSearchParams();

  for (
    const [
      key,
      value,
    ] of Object.entries(params)
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    search.set(
      key,
      String(value),
    );
  }

  const query =
    search.toString();

  return query
    ? `${path}?${query}`
    : path;
}

function positiveIntegerId(
  value: number | string,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isInteger(numeric) ||
    numeric <= 0
  ) {
    throw new PanditApiError(
      "A valid positive numeric ID is required.",
      400,
      "INVALID_ID",
    );
  }

  return numeric;
}

function validateRequiredString(
  value: string,
  fieldName: string,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new PanditApiError(
      `${fieldName} is required.`,
      400,
      "VALIDATION_ERROR",
    );
  }

  const cleaned =
    value.trim();

  if (!cleaned) {
    throw new PanditApiError(
      `${fieldName} is required.`,
      400,
      "VALIDATION_ERROR",
    );
  }

  return cleaned;
}

function jsonBody(
  value: unknown,
): RequestInit {
  return {
    headers: {
      "Content-Type":
        JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(value),
  };
}

/* ============================================================================
 * Core Request
 * ========================================================================== */

async function request<
  T = Record<string, unknown>,
>(
  path: string,
  init: RequestInit = {},
): Promise<PanditApiResult<T>> {
  const controller =
    new AbortController();

  const callerSignal =
    init.signal;

  let timedOut = false;

  let removeCallerAbortListener:
    | (() => void)
    | undefined;

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      const onCallerAbort =
        () => {
          controller.abort();
        };

      callerSignal.addEventListener(
        "abort",
        onCallerAbort,
        {
          once: true,
        },
      );

      removeCallerAbortListener =
        () => {
          callerSignal.removeEventListener(
            "abort",
            onCallerAbort,
          );
        };
    }
  }

  const timeoutId =
    window.setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      REQUEST_TIMEOUT_MS,
    );

  const url =
    buildUrl(path);

  try {
    const response =
      await fetch(url, {
        ...init,

        /*
         * Pandit API uses cookie/session authentication.
         * Preserve a caller override when explicitly provided.
         */
        credentials:
          init.credentials ??
          "include",

        /*
         * IMPORTANT:
         *
         * Do not use `cache: "no-store"` here.
         *
         * Fetch implementations can translate no-store/reload
         * cache modes into Cache-Control / Pragma request headers.
         * Those headers can participate in CORS preflight.
         *
         * The backend already controls response caching using
         * Cache-Control: no-store.
         */
        cache: "default",

        mode:
          init.mode ?? "cors",

        headers:
          buildHeaders(init),

        /*
         * Use our own controller so we can support both:
         * - caller cancellation
         * - automatic timeout
         */
        signal:
          controller.signal,
      });

    const data =
      await readResponse(response);

    if (!response.ok) {
      const payload =
        isRecord(data)
          ? data
          : undefined;

      const code =
        payload &&
        typeof payload.code ===
          "string"
          ? payload.code
          : undefined;

      throw new PanditApiError(
        getErrorMessage(
          payload,
          response.status,
        ),
        response.status,
        code,
        data,
      );
    }

    if (
      isRecord(data) &&
      data.success === false
    ) {
      throw new PanditApiError(
        getErrorMessage(
          data,
          response.status,
        ),
        response.status,
        typeof data.code ===
          "string"
          ? data.code
          : undefined,
        data,
      );
    }

    if (isRecord(data)) {
      return data as PanditApiResult<T>;
    }

    /*
     * Non-object JSON responses are normalized here.
     *
     * The generic PanditApiResult<T> represents object-shaped API
     * responses, while the backend may technically return a primitive
     * JSON value. The double cast is intentional and resolves
     * TypeScript's structural incompatibility at this boundary.
     */
    return {
      success: true,
      data,
    } as unknown as PanditApiResult<T>;
  } catch (error) {
    if (
      error instanceof PanditApiError
    ) {
      throw error;
    }

    if (
      typeof DOMException !==
        "undefined" &&
      error instanceof DOMException &&
      error.name ===
        "AbortError"
    ) {
      if (
        timedOut
      ) {
        throw new PanditApiError(
          "Request timed out. Please make sure the DivyaDhara API server is running.",
          408,
          "REQUEST_TIMEOUT",
          {
            url,
            timeoutMs:
              REQUEST_TIMEOUT_MS,
          },
        );
      }

      if (
        callerSignal?.aborted
      ) {
        throw new PanditApiError(
          "The Pandit request was cancelled.",
          499,
          "REQUEST_ABORTED",
          {
            url,
          },
        );
      }

      throw new PanditApiError(
        "The Pandit request was aborted.",
        0,
        "REQUEST_ABORTED",
        {
          url,
        },
      );
    }

    if (
      error instanceof TypeError
    ) {
      throw new PanditApiError(
        "Unable to connect to the DivyaDhara API server. Please check that the backend is running and accessible.",
        0,
        "API_CONNECTION_ERROR",
        {
          url,
          originalError:
            error,
        },
      );
    }

    if (
      error instanceof Error
    ) {
      throw error;
    }

    throw new PanditApiError(
      "An unexpected error occurred while communicating with the Pandit API.",
      0,
      "UNKNOWN_API_ERROR",
      error,
    );
  } finally {
    window.clearTimeout(
      timeoutId,
    );

    removeCallerAbortListener?.();
  }
}

/* ============================================================================
 * Pandit API
 * ========================================================================== */

export const panditApi = {
  /* ------------------------------------------------------------------------
   * Dashboard
   * ---------------------------------------------------------------------- */

  dashboard():
    Promise<PanditDashboardResponse> {
    return request<PanditDashboardResponse>(
      "/api/pandit/dashboard",
    ) as Promise<PanditDashboardResponse>;
  },

  /* ------------------------------------------------------------------------
   * Profile
   * ---------------------------------------------------------------------- */

  profile():
    Promise<
      PanditApiResult<{
        profile: PanditProfile;
      }>
    > {
    return request<{
      profile: PanditProfile;
    }>(
      "/api/pandit/profile",
    );
  },

  createProfile(
    input: PanditProfileInput,
  ):
    Promise<
      PanditApiResult<{
        profile: PanditProfile;
      }>
    > {
    return request<{
      profile: PanditProfile;
    }>(
      "/api/pandit/profile",
      {
        method: "POST",
        ...jsonBody(input),
      },
    );
  },

  updateProfile(
    input: PanditProfileInput,
  ):
    Promise<
      PanditApiResult<{
        profile: PanditProfile;
      }>
    > {
    return request<{
      profile: PanditProfile;
    }>(
      "/api/pandit/profile",
      {
        method: "PATCH",
        ...jsonBody(input),
      },
    );
  },

  /* ------------------------------------------------------------------------
   * Services
   * ---------------------------------------------------------------------- */

  services():
    Promise<
      PanditApiResult<{
        services: PanditService[];
      }>
    > {
    return request<{
      services: PanditService[];
    }>(
      "/api/pandit/services",
    );
  },

  createService(
    input: PanditServiceInput,
  ):
    Promise<
      PanditApiResult<{
        service: PanditService;
      }>
    > {
    const name =
      validateRequiredString(
        input.name,
        "Service name",
      );

    return request<{
      service: PanditService;
    }>(
      "/api/pandit/services",
      {
        method: "POST",
        ...jsonBody({
          ...input,
          name,
        }),
      },
    );
  },

  getService(
    id: number | string,
  ):
    Promise<
      PanditApiResult<{
        service: PanditService;
      }>
    > {
    const serviceId =
      positiveIntegerId(id);

    return request<{
      service: PanditService;
    }>(
      `/api/pandit/services/${serviceId}`,
    );
  },

  updateService(
    id: number | string,
    input: PanditServiceUpdateInput,
  ):
    Promise<
      PanditApiResult<{
        service: PanditService;
      }>
    > {
    const serviceId =
      positiveIntegerId(id);

    return request<{
      service: PanditService;
    }>(
      `/api/pandit/services/${serviceId}`,
      {
        method: "PATCH",
        ...jsonBody(input),
      },
    );
  },

  deleteService(
    id: number | string,
  ):
    Promise<
      PanditApiResult<{
        deletedServiceId: number;
      }>
    > {
    const serviceId =
      positiveIntegerId(id);

    return request<{
      deletedServiceId: number;
    }>(
      `/api/pandit/services/${serviceId}`,
      {
        method: "DELETE",
      },
    );
  },

  /* ------------------------------------------------------------------------
   * Public Listing
   * ---------------------------------------------------------------------- */

  listing():
    Promise<PanditListingResponse> {
    return request<PanditListingResponse>(
      "/api/pandit/listing",
    ) as Promise<PanditListingResponse>;
  },

  setListing(
    listingActive: boolean,
  ):
    Promise<PanditSetListingResponse> {
    return request<PanditSetListingResponse>(
      "/api/pandit/listing",
      {
        method: "PATCH",
        ...jsonBody({
          listingActive:
            Boolean(listingActive),
        }),
      },
    ) as Promise<PanditSetListingResponse>;
  },

  /* ------------------------------------------------------------------------
   * Verification Documents
   * ---------------------------------------------------------------------- */

  verificationDocuments():
    Promise<VerificationDocumentsResponse> {
    return request<VerificationDocumentsResponse>(
      "/api/pandit/verification/documents",
    ) as Promise<VerificationDocumentsResponse>;
  },

  submitVerificationDocument(
    input: VerificationDocumentInput,
  ):
    Promise<
      PanditApiResult<{
        document: VerificationDocument;
      }>
    > {
    const documentType =
      validateRequiredString(
        input.documentType,
        "Document type",
      );

    const documentUrl =
      validateRequiredString(
        input.documentUrl,
        "Document URL",
      );

    return request<{
      document: VerificationDocument;
    }>(
      "/api/pandit/verification/documents",
      {
        method: "POST",
        ...jsonBody({
          documentType,

          documentName:
            input.documentName
              ?.trim() ||
            undefined,

          documentUrl,
        }),
      },
    );
  },

  resubmitVerificationDocument(
    id: number | string,
    input: VerificationDocumentResubmitInput = {},
  ):
    Promise<
      PanditApiResult<{
        document: VerificationDocument;
      }>
    > {
    const documentId =
      positiveIntegerId(id);

    return request<{
      document: VerificationDocument;
    }>(
      `/api/pandit/verification/documents/${documentId}/resubmit`,
      {
        method: "PATCH",
        ...jsonBody({
          documentName:
            input.documentName ===
            undefined
              ? undefined
              : input.documentName
                  ?.trim() ||
                null,

          documentUrl:
            input.documentUrl ===
            undefined
              ? undefined
              : input.documentUrl
                  ?.trim() ||
                null,
        }),
      },
    );
  },

  deleteVerificationDocument(
    id: number | string,
  ):
    Promise<
      PanditApiResult<{
        deletedDocumentId?: number;
      }>
    > {
    const documentId =
      positiveIntegerId(id);

    return request<{
      deletedDocumentId?: number;
    }>(
      `/api/pandit/verification/documents/${documentId}`,
      {
        method: "DELETE",
      },
    );
  },

  /* ------------------------------------------------------------------------
   * Subscription
   * ---------------------------------------------------------------------- */

  subscriptionPlans():
    Promise<PanditSubscriptionPlansResponse> {
    return request<PanditSubscriptionPlansResponse>(
      "/api/pandit/subscription/plans",
    ) as Promise<PanditSubscriptionPlansResponse>;
  },

  subscription():
    Promise<PanditSubscriptionResponse> {
    return request<PanditSubscriptionResponse>(
      "/api/pandit/subscription",
    ) as Promise<PanditSubscriptionResponse>;
  },

  subscriptionUsage():
    Promise<PanditSubscriptionUsageResponse> {
    return request<PanditSubscriptionUsageResponse>(
      "/api/pandit/subscription/usage",
    ) as Promise<PanditSubscriptionUsageResponse>;
  },

  prepareSubscription(
    input: PreparePanditSubscriptionInput,
  ):
    Promise<PreparePanditSubscriptionResponse> {
    const planId =
      positiveIntegerId(
        input.planId,
      );

    return request<PreparePanditSubscriptionResponse>(
      "/api/pandit/subscription/prepare",
      {
        method: "POST",
        ...jsonBody({
          planId,
        }),
      },
    ) as Promise<PreparePanditSubscriptionResponse>;
  },

  updateAutoRenew(
    autoRenew: boolean,
  ):
    Promise<AutoRenewResponse> {
    return request<AutoRenewResponse>(
      "/api/pandit/subscription/auto-renew",
      {
        method: "PATCH",
        ...jsonBody({
          autoRenew:
            Boolean(autoRenew),
        }),
      },
    ) as Promise<AutoRenewResponse>;
  },

  cancelSubscription():
    Promise<CancelSubscriptionResponse> {
    return request<CancelSubscriptionResponse>(
      "/api/pandit/subscription/cancel",
      {
        method: "POST",
      },
    ) as Promise<CancelSubscriptionResponse>;
  },

  /* ------------------------------------------------------------------------
   * Leads
   * ---------------------------------------------------------------------- */

  leads(
    params?: PanditLeadListParams,
  ):
    Promise<PanditLeadsResponse> {
    return request<PanditLeadsResponse>(
      appendQuery(
        "/api/pandit/leads",
        {
          page: params?.page,
          limit: params?.limit,
          status: params?.status,
          search: params?.search,
        },
      ),
    ) as Promise<PanditLeadsResponse>;
  },

  leadStats():
    Promise<PanditLeadStatsResponse> {
    return request<PanditLeadStatsResponse>(
      "/api/pandit/leads/stats",
    ) as Promise<PanditLeadStatsResponse>;
  },

  lead(
    id: number | string,
  ):
    Promise<PanditLeadDetailResponse> {
    const leadId =
      positiveIntegerId(id);

    return request<PanditLeadDetailResponse>(
      `/api/pandit/leads/${leadId}`,
    ) as Promise<PanditLeadDetailResponse>;
  },

  updateLeadStatus(
    id: number | string,
    input: UpdatePanditLeadStatusInput,
  ):
    Promise<
      PanditApiResult<{
        lead: PanditLead;
        assignment:
          | PanditLeadAssignment
          | Record<string, unknown>;
      }>
    > {
    const leadId =
      positiveIntegerId(id);

    const status =
      validateRequiredString(
        input.status,
        "Lead status",
      ) as PanditLeadStatus;

    const allowedStatuses:
      PanditLeadStatus[] = [
        "assigned",
        "accepted",
        "contacted",
        "follow_up",
        "converted",
        "rejected",
        "expired",
        "closed",
      ];

    if (
      !allowedStatuses.includes(
        status,
      )
    ) {
      throw new PanditApiError(
        "Invalid lead status.",
        400,
        "INVALID_LEAD_STATUS",
      );
    }

    return request<{
      lead: PanditLead;
      assignment:
        | PanditLeadAssignment
        | Record<string, unknown>;
    }>(
      `/api/pandit/leads/${leadId}/status`,
      {
        method: "PATCH",
        ...jsonBody({
          status,
        }),
      },
    );
  },

  addLeadNote(
    id: number | string,
    input: PanditLeadNoteInput,
  ):
    Promise<PanditLeadNoteResponse> {
    const leadId =
      positiveIntegerId(id);

    const note =
      validateRequiredString(
        input.note,
        "Lead note",
      );

    return request<PanditLeadNoteResponse>(
      `/api/pandit/leads/${leadId}/notes`,
      {
        method: "POST",
        ...jsonBody({
          note,
          isPinned:
            Boolean(
              input.isPinned,
            ),
        }),
      },
    ) as Promise<PanditLeadNoteResponse>;
  },

  createLeadFollowup(
    id: number | string,
    input: PanditLeadFollowupInput,
  ):
    Promise<PanditLeadFollowupResponse> {
    const leadId =
      positiveIntegerId(id);

    const dueAt =
      validateRequiredString(
        input.dueAt,
        "Follow-up date/time",
      );

    const followupType =
      input.followupType ??
      "call";

    const allowedTypes = [
      "call",
      "whatsapp",
      "email",
      "meeting",
      "reminder",
      "other",
    ] as const;

    if (
      !allowedTypes.includes(
        followupType,
      )
    ) {
      throw new PanditApiError(
        "Invalid follow-up type.",
        400,
        "INVALID_FOLLOWUP_TYPE",
      );
    }

    return request<PanditLeadFollowupResponse>(
      `/api/pandit/leads/${leadId}/followups`,
      {
        method: "POST",
        ...jsonBody({
          dueAt,
          followupType,

          subject:
            input.subject
              ?.trim() ||
            undefined,

          notes:
            input.notes
              ?.trim() ||
            undefined,
        }),
      },
    ) as Promise<PanditLeadFollowupResponse>;
  },

  /* ------------------------------------------------------------------------
   * Analytics
   * ---------------------------------------------------------------------- */

  analytics():
    Promise<PanditAnalytics> {
    /*
     * IMPORTANT:
     *
     * This deliberately uses the Pandit-specific endpoint:
     *
     *   /api/pandit/analytics
     *
     * because the backend applies the Pandit subscription entitlement
     * here. Do not replace this with the generic owner analytics endpoint
     * for Pandit dashboard analytics.
     */
    return request<PanditAnalytics>(
      "/api/pandit/analytics",
    ).then(
      (response) =>
        response as PanditAnalytics,
    );
  },

  /* ------------------------------------------------------------------------
   * Notifications
   * ---------------------------------------------------------------------- */

  notifications(
    limit = 25,
  ):
    Promise<PanditNotificationsResponse> {
    const numericLimit =
      Number(limit);

    const safeLimit =
      Number.isFinite(
        numericLimit,
      )
        ? Math.min(
            100,
            Math.max(
              1,
              Math.trunc(
                numericLimit,
              ),
            ),
          )
        : 25;

    return request<PanditNotificationsResponse>(
      appendQuery(
        "/api/pandit/notifications",
        {
          limit: safeLimit,
        },
      ),
    ) as Promise<PanditNotificationsResponse>;
  },

  markNotificationRead(
    id: number | string,
  ):
    Promise<MarkNotificationReadResponse> {
    const notificationId =
      positiveIntegerId(id);

    return request<MarkNotificationReadResponse>(
      `/api/pandit/notifications/${notificationId}/read`,
      {
        method: "PATCH",
      },
    ) as Promise<MarkNotificationReadResponse>;
  },

  markAllNotificationsRead():
    Promise<MarkAllNotificationsReadResponse> {
    return request<MarkAllNotificationsReadResponse>(
      "/api/pandit/notifications/read-all",
      {
        method: "POST",
      },
    ) as Promise<MarkAllNotificationsReadResponse>;
  },
};

/* ============================================================================
 * Convenience Error Helper
 * ========================================================================== */

export function getPanditApiErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof
    PanditApiError
  ) {
    return error.message;
  }

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Something went wrong while processing the Pandit request.";
}

/* ============================================================================
 * Convenience Status Helpers
 * ========================================================================== */

export function isPanditApiUnauthorized(
  error: unknown,
): boolean {
  return (
    error instanceof PanditApiError &&
    error.status === 401
  );
}

export function isPanditApiForbidden(
  error: unknown,
): boolean {
  return (
    error instanceof PanditApiError &&
    error.status === 403
  );
}

export function isPanditApiConflict(
  error: unknown,
): boolean {
  return (
    error instanceof PanditApiError &&
    error.status === 409
  );
}