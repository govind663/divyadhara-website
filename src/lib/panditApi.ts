const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "");

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const JSON_CONTENT_TYPE = "application/json";
const NO_STORE_HEADERS = {
  Accept: JSON_CONTENT_TYPE,
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

/*
|--------------------------------------------------------------------------
| Shared API Types
|--------------------------------------------------------------------------
*/
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
};

export type PanditServiceInput = {
  name: string;
  description?: string;
  priceAmount?: number | null;
  currency?: string;
  durationMinutes?: number | null;
  isActive?: boolean;
};

export type PanditServiceUpdateInput = Partial<PanditServiceInput>;

export type PanditApiResult<T = Record<string, unknown>> = T & {
  success?: boolean;
  message?: string;
  error?: string;
  code?: string;
};

export type PanditAnalytics = {
  success?: boolean;
  scope?: {
    analyticsLevel?: string;
    panditIds?: number[];
    templeIds?: number[];
    ashramIds?: number[];
  };
  access?: {
    level?: string;
    advanced?: boolean;
  };
  range?: {
    from?: string;
    to?: string;
    days?: number;
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
  totals?: {
    pageViews?: number;
    uniqueVisitors?: number;
    sessions?: number;
    avgPageDurationSeconds?: number;
    events?: number;
    leads?: number;
    convertedLeads?: number;
    bookings?: number;
    bookingValue?: number;
    collectedRevenue?: number;
    refunds?: number;
  };
};

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
  }
}

/*
|--------------------------------------------------------------------------
| Internal Helpers
|--------------------------------------------------------------------------
*/
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  }

  switch (status) {
    case 400:
      return "Invalid request.";
    case 401:
      return "Your session has expired. Please login again.";
    case 403:
      return "You are not authorized to perform this Pandit action.";
    case 404:
      return "Requested Pandit resource was not found.";
    case 409:
      return "This action conflicts with the current Pandit account state.";
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
    default:
      return status > 0 ? `Request failed with status ${status}.` : "Unable to complete the request.";
  }
}

function contentLengthTooLarge(response: Response): boolean {
  const length = response.headers.get("content-length");
  if (!length) return false;

  const numericLength = Number(length);
  return Number.isFinite(numericLength) && numericLength > MAX_RESPONSE_BYTES;
}

async function readJson(response: Response): Promise<unknown> {
  if (contentLengthTooLarge(response)) {
    throw new PanditApiError(
      "The server response is too large to process safely.",
      413,
      "RESPONSE_TOO_LARGE",
    );
  }

  const raw = await response.text();

  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new PanditApiError(
      "The server response is too large to process safely.",
      413,
      "RESPONSE_TOO_LARGE",
    );
  }

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw.trim() };
  }
}

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(NO_STORE_HEADERS);

  if (init.headers) {
    const incoming = new Headers(init.headers);
    incoming.forEach((value, key) => headers.set(key, value));
  }

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !(init.body instanceof Blob) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", JSON_CONTENT_TYPE);
  }

  return headers;
}

function buildUrl(path: string): string {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }

  return `${API_BASE_URL}${path}`;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<PanditApiResult<T>> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(buildUrl(path), {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: buildHeaders(init),
      signal: controller.signal,
    });

    const data = await readJson(response);

    if (!response.ok) {
      const payload = isRecord(data) ? data : undefined;
      throw new PanditApiError(
        getErrorMessage(payload, response.status),
        response.status,
        payload && typeof payload.code === "string" ? payload.code : undefined,
        data,
      );
    }

    return data as PanditApiResult<T>;
  } catch (error) {
    if (error instanceof PanditApiError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PanditApiError(
        "Request timed out. Please make sure the DivyaDhara API server is running.",
        408,
        "REQUEST_TIMEOUT",
      );
    }

    if (error instanceof TypeError) {
      throw new PanditApiError(
        `Unable to connect to the DivyaDhara API server at ${API_BASE_URL}.`,
        0,
        "API_CONNECTION_ERROR",
      );
    }

    if (error instanceof Error) throw error;

    throw new PanditApiError(
      "An unexpected error occurred while communicating with the Pandit API.",
      0,
      "UNKNOWN_API_ERROR",
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function jsonBody(value: unknown): RequestInit {
  return {
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(value),
  };
}

function appendQuery(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!params) return path;

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function normalizeAnalyticsResponse(
  response: PanditAnalytics,
): PanditAnalytics {
  if (response.summary) return response;

  return {
    ...response,
    summary: {
      pageViews: response.totals?.pageViews ?? 0,
      uniqueVisitors: response.totals?.uniqueVisitors ?? 0,
      events: response.totals?.events ?? 0,
    },
  };
}

/*
|--------------------------------------------------------------------------
| Pandit API
|--------------------------------------------------------------------------
*/
export const panditApi = {
  /* Dashboard ------------------------------------------------------------- */
  dashboard(): Promise<PanditDashboardResponse> {
    return request<PanditDashboardResponse>("/api/pandit/dashboard") as Promise<PanditDashboardResponse>;
  },

  /* Profile --------------------------------------------------------------- */
  profile(): Promise<PanditApiResult<{ profile: PanditProfile }>> {
    return request<{ profile: PanditProfile }>("/api/pandit/profile");
  },

  createProfile(
    input: PanditProfileInput,
  ): Promise<PanditApiResult<{ profile: PanditProfile }>> {
    return request<{ profile: PanditProfile }>("/api/pandit/profile", {
      method: "POST",
      ...jsonBody(input),
    });
  },

  updateProfile(
    input: PanditProfileInput,
  ): Promise<PanditApiResult<{ profile: PanditProfile }>> {
    return request<{ profile: PanditProfile }>("/api/pandit/profile", {
      method: "PATCH",
      ...jsonBody(input),
    });
  },

  /* Services -------------------------------------------------------------- */
  services(): Promise<PanditApiResult<{ services: PanditService[] }>> {
    return request<{ services: PanditService[] }>("/api/pandit/services");
  },

  createService(
    input: PanditServiceInput,
  ): Promise<PanditApiResult<{ service: PanditService }>> {
    return request<{ service: PanditService }>("/api/pandit/services", {
      method: "POST",
      ...jsonBody(input),
    });
  },

  getService(
    id: number,
  ): Promise<PanditApiResult<{ service: PanditService }>> {
    if (!Number.isInteger(id) || id <= 0) {
      return Promise.reject(
        new PanditApiError("A valid service ID is required.", 400, "INVALID_SERVICE_ID"),
      );
    }

    return request<{ service: PanditService }>(`/api/pandit/services/${id}`);
  },

  updateService(
    id: number,
    input: PanditServiceUpdateInput,
  ): Promise<PanditApiResult<{ service: PanditService }>> {
    if (!Number.isInteger(id) || id <= 0) {
      return Promise.reject(
        new PanditApiError("A valid service ID is required.", 400, "INVALID_SERVICE_ID"),
      );
    }

    return request<{ service: PanditService }>(`/api/pandit/services/${id}`, {
      method: "PATCH",
      ...jsonBody(input),
    });
  },

  deleteService(
    id: number,
  ): Promise<PanditApiResult<{ deletedServiceId: number }>> {
    if (!Number.isInteger(id) || id <= 0) {
      return Promise.reject(
        new PanditApiError("A valid service ID is required.", 400, "INVALID_SERVICE_ID"),
      );
    }

    return request<{ deletedServiceId: number }>(`/api/pandit/services/${id}`, {
      method: "DELETE",
    });
  },

  /* Listing ---------------------------------------------------------------- */
  setListing(
    listingActive: boolean,
  ): Promise<PanditApiResult<{ listingActive: boolean; eligibility?: PublicListingEligibility }>> {
    return request<{
      listingActive: boolean;
      eligibility?: PublicListingEligibility;
    }>("/api/pandit/listing", {
      method: "PATCH",
      ...jsonBody({ listingActive: Boolean(listingActive) }),
    });
  },

  /* Analytics -------------------------------------------------------------- */
  // The Pandit backend owns analytics through the scoped owner analytics route.
  // We normalize its `totals` payload into the dashboard-friendly `summary` shape.
  analytics(options?: {
    from?: string;
    to?: string;
  }): Promise<PanditAnalytics> {
    const path = appendQuery("/api/analytics/reports/owner/overview", {
      from: options?.from,
      to: options?.to,
    });

    return request<PanditAnalytics>(path).then(normalizeAnalyticsResponse);
  },
};

/*
|--------------------------------------------------------------------------
| Convenience Error Helper
|--------------------------------------------------------------------------
*/
export function getPanditApiErrorMessage(error: unknown): string {
  if (error instanceof PanditApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while processing the Pandit request.";
}
