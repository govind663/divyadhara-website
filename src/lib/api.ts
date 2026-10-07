/* ============================================================================
 * DivyaDhara API Client
 * ----------------------------------------------------------------------------
 * Centralized frontend API layer for:
 * - Authentication
 * - Super Admin
 * - Pandit
 * - Temple Manager
 * - Ashram Manager
 * - Sales
 *
 * Backend:
 *   Express + SQLite
 *
 * Frontend:
 *   React + TypeScript + Vite
 *
 * API contract:
 *   Backend base     = http://localhost:3001
 *   Canonical prefix = /api
 *
 * Supported VITE_API_URL values:
 *   http://localhost:3001
 *   http://localhost:3001/api
 *   https://api.example.com
 *   https://api.example.com/api
 *   /api
 *   ""
 *
 * The client guarantees that `/api` appears exactly once in the final URL.
 * ========================================================================== */

/* ============================================================================
 * API URL Configuration
 * ========================================================================== */

const DEFAULT_API_URL = "http://localhost:3001";

function resolveApiOrigin(): string {
  const configured =
    typeof import.meta.env.VITE_API_URL === "string"
      ? import.meta.env.VITE_API_URL.trim()
      : "";

  if (!configured) {
    /*
     * Development:
     *   React/Vite = 5173
     *   Express   = 3001
     */
    if (import.meta.env.DEV) {
      return DEFAULT_API_URL;
    }

    /*
     * Production:
     * When no explicit backend origin is configured,
     * fall back to same-origin.
     *
     * Recommended production setup:
     *   VITE_API_URL=https://api.divya-dhara.in
     */
    if (typeof window !== "undefined") {
      return window.location.origin;
    }

    return "";
  }

  /*
   * Remove trailing slash.
   */
  const normalized = configured.replace(/\/+$/, "");

  /*
   * If configured as:
   *
   *   https://api.example.com/api
   *
   * keep only:
   *
   *   https://api.example.com
   *
   * because endpoint methods already include `/api`.
   */
  return normalized.replace(/\/api$/i, "");
}

const API_ORIGIN = resolveApiOrigin();

const DEFAULT_TIMEOUT_MS = 20_000;

const API_PREFIX = "/api";

/* ============================================================================
 * Types
 * ========================================================================== */

export type ApiPrimitive =
  | string
  | number
  | boolean
  | null;

export type ApiJsonValue =
  | ApiPrimitive
  | ApiJsonValue[]
  | {
      [key: string]: ApiJsonValue;
    };

export type ApiObject = Record<string, ApiJsonValue>;

export type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  [key: string]: unknown;
};

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  skipJsonHeaders?: boolean;
};

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined;

/* ============================================================================
 * API Error
 * ========================================================================== */

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      details?: unknown;
    } = {},
  ) {
    super(message);

    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "API_ERROR";
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/* ============================================================================
 * Runtime Helpers
 * ========================================================================== */

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isJsonResponse(response: Response): boolean {
  const contentType =
    response.headers.get("content-type") || "";

  return contentType
    .toLowerCase()
    .includes("application/json");
}

function getErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return fallback;
  }

  const data = payload as Record<string, unknown>;

  const candidates = [
    data.error,
    data.message,
    data.detail,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  return fallback;
}

function getApiErrorCode(
  payload: unknown,
): string {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return "API_ERROR";
  }

  const data = payload as Record<string, unknown>;

  if (
    typeof data.code === "string" &&
    data.code.trim()
  ) {
    return data.code.trim();
  }

  return "API_ERROR";
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

function encodePathId(
  value: number | string,
  fieldName = "id",
): string {
  const stringValue = String(value).trim();

  if (!stringValue) {
    throw new ApiError(
      `A valid ${fieldName} is required.`,
      {
        code: "INVALID_ID",
      },
    );
  }

  return encodeURIComponent(stringValue);
}

/* ============================================================================
 * Path Helpers
 * ========================================================================== */

/**
 * Normalize an arbitrary endpoint so the API prefix appears exactly once.
 *
 * Examples:
 *
 *   "/api/admin/users"
 *        -> "/api/admin/users"
 *
 *   "api/admin/users"
 *        -> "/api/admin/users"
 *
 *   "/admin/users"
 *        -> "/api/admin/users"
 *
 *   "admin/users"
 *        -> "/api/admin/users"
 *
 *   "/api"
 *        -> "/api"
 */
function normalizeApiPath(
  path: string,
): string {
  const trimmed = path.trim();

  if (!trimmed) {
    return API_PREFIX;
  }

  let normalized = trimmed.startsWith("/")
    ? trimmed
    : `/${trimmed}`;

  /*
   * Collapse repeated leading slashes.
   */
  normalized = normalized.replace(/^\/+/, "/");

  /*
   * Collapse repeated /api prefixes.
   *
   * /api/api/admin/users
   * becomes
   * /api/admin/users
   */
  normalized = normalized.replace(
    /^\/api(?:\/api)+/i,
    "/api",
  );

  /*
   * Already canonical.
   */
  if (
    normalized === API_PREFIX ||
    normalized
      .toLowerCase()
      .startsWith(`${API_PREFIX}/`)
  ) {
    return normalized;
  }

  return `${API_PREFIX}${normalized}`;
}

/**
 * Build complete API URL.
 */
export function buildApiUrl(
  path: string,
): string {
  const apiPath = normalizeApiPath(path);

  return `${API_ORIGIN}${apiPath}`;
}

/* ============================================================================
 * Query String
 * ========================================================================== */

export function buildQueryString(
  params:
    | Record<string, QueryValue>
    | URLSearchParams
    | undefined,
): string {
  if (!params) {
    return "";
  }

  const search =
    params instanceof URLSearchParams
      ? new URLSearchParams(params)
      : new URLSearchParams();

  if (!(params instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(params)) {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        continue;
      }

      search.set(key, String(value));
    }
  }

  const query = search.toString();

  return query ? `?${query}` : "";
}

/* ============================================================================
 * Abort Signal Helpers
 * ========================================================================== */

function mergeSignals(
  externalSignal:
    | AbortSignal
    | null
    | undefined,
  timeoutController: AbortController,
): AbortSignal {
  if (!externalSignal) {
    return timeoutController.signal;
  }

  /*
   * Modern browsers.
   */
  if (
    typeof AbortSignal !== "undefined" &&
    "any" in AbortSignal &&
    typeof AbortSignal.any === "function"
  ) {
    return AbortSignal.any([
      externalSignal,
      timeoutController.signal,
    ]);
  }

  /*
   * Compatibility fallback.
   */
  const controller = new AbortController();

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (externalSignal.aborted) {
    abort();
  }

  externalSignal.addEventListener(
    "abort",
    abort,
    { once: true },
  );

  timeoutController.signal.addEventListener(
    "abort",
    abort,
    { once: true },
  );

  return controller.signal;
}

/* ============================================================================
 * Request Body Preparation
 * ========================================================================== */

function prepareBody(
  body:
    | BodyInit
    | Record<string, unknown>
    | null
    | undefined,
):
  | BodyInit
  | null
  | undefined {
  if (
    body === null ||
    body === undefined
  ) {
    return body;
  }

  /*
   * Already-prepared request bodies.
   */
  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return body;
  }

  /*
   * JSON-like objects.
   */
  if (
    typeof body === "object" &&
    !(body instanceof ReadableStream)
  ) {
    return JSON.stringify(body);
  }

  return body;
}

/* ============================================================================
 * Core Request Function
 * ========================================================================== */

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    skipJsonHeaders = false,
    signal: externalSignal,
    headers,
    body,
    ...requestInit
  } = options;

  const controller = new AbortController();

  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const signal = mergeSignals(
    externalSignal,
    controller,
  );

  const preparedBody = prepareBody(body);

  const finalHeaders = new Headers(headers);

  if (!skipJsonHeaders) {
    if (!finalHeaders.has("Accept")) {
      finalHeaders.set(
        "Accept",
        "application/json",
      );
    }

    /*
     * JSON body is already serialized by prepareBody()
     * or by the convenience helpers below.
     */
    const canSendJson =
      preparedBody !== undefined &&
      preparedBody !== null &&
      typeof preparedBody === "string";

    if (
      canSendJson &&
      !finalHeaders.has("Content-Type")
    ) {
      finalHeaders.set(
        "Content-Type",
        "application/json",
      );
    }
  }

  const url = buildApiUrl(path);

  try {
    const response = await fetch(url, {
      ...requestInit,
      headers: finalHeaders,
      body: preparedBody,
      credentials: "include",
      cache: "no-store",
      signal,
    });

    let payload: unknown = null;

    /*
     * 204 No Content.
     */
    if (response.status !== 204) {
      if (isJsonResponse(response)) {
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
      } else {
        try {
          const text = await response.text();

          payload = text.trim()
            ? { message: text }
            : null;
        } catch {
          payload = null;
        }
      }
    }

    /*
     * HTTP-level error.
     */
    if (!response.ok) {
      const fallback =
        `API request failed with status ${response.status}.`;

      throw new ApiError(
        getErrorMessage(
          payload,
          fallback,
        ),
        {
          status: response.status,
          code: getApiErrorCode(payload),
          details: payload,
        },
      );
    }

    /*
     * Application-level API error.
     */
    if (
      payload &&
      isPlainObject(payload) &&
      payload.success === false
    ) {
      throw new ApiError(
        getErrorMessage(
          payload,
          "The API reported an error.",
        ),
        {
          status: response.status,
          code: getApiErrorCode(payload),
          details: payload,
        },
      );
    }

    /*
     * Standard JSON API envelope.
     */
    if (
      payload &&
      isPlainObject(payload)
    ) {
      return payload as ApiResponse<T>;
    }

    /*
     * Non-object successful response.
     */
    return {
      success: true,
      data: payload as T,
    };
  } catch (error) {
    /*
     * Preserve typed API errors.
     */
    if (error instanceof ApiError) {
      throw error;
    }

    /*
     * Timeout / abort.
     */
    if (isAbortError(error)) {
      throw new ApiError(
        `Request timed out after ${timeoutMs}ms.`,
        {
          code: "REQUEST_TIMEOUT",
          details: {
            url,
            timeoutMs,
          },
        },
      );
    }

    /*
     * Network / CORS / backend unavailable.
     */
    if (error instanceof TypeError) {
      const configuredOrigin =
        API_ORIGIN ||
        "the current application origin";

      throw new ApiError(
        `Unable to connect to the DivyaDhara API at ${configuredOrigin}. Please check that the backend API is running, the configured VITE_API_URL is correct, and CORS allows the frontend origin.`,
        {
          code: "NETWORK_ERROR",
          details: {
            url,
            apiOrigin: API_ORIGIN,
            originalError: error,
          },
        },
      );
    }

    throw new ApiError(
      "An unexpected API error occurred.",
      {
        code: "UNKNOWN_ERROR",
        details: error,
      },
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/* ============================================================================
 * Convenience Methods
 * ========================================================================== */

export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, QueryValue>,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const query = buildQueryString(params);

  return apiRequest<T>(
    `${path}${query}`,
    {
      ...options,
      method: "GET",
    },
  );
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  return apiRequest<T>(
    path,
    {
      ...options,
      method: "POST",
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  );
}

export async function apiPut<T = unknown>(
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  return apiRequest<T>(
    path,
    {
      ...options,
      method: "PUT",
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  );
}

export async function apiPatch<T = unknown>(
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  return apiRequest<T>(
    path,
    {
      ...options,
      method: "PATCH",
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  );
}

export async function apiDelete<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  return apiRequest<T>(
    path,
    {
      ...options,
      method: "DELETE",
    },
  );
}

/* ============================================================================
 * Authentication Types
 * ========================================================================== */

export type AuthRole =
  | "visitor"
  | "pandit"
  | "temple_manager"
  | "ashram_manager"
  | "sales"
  | "super_admin";

export type AuthStatus =
  | "pending"
  | "active"
  | "suspended"
  | "rejected"
  | "blocked";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  role: AuthRole;
  status: AuthStatus;
  avatar: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  role:
    | "visitor"
    | "pandit"
    | "temple_manager"
    | "ashram_manager";

  name: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  password: string;

  preferredLanguage?: string;
  marketingConsent?: boolean;

  /*
   * Pandit.
   */
  title?: string;
  photo?: string;
  experienceYears?: number | string;
  district?: string;
  languages?: string[];
  specializations?: string[];
  pujaTypes?: string[];
  associatedWith?: string;
  about?: string;
  availability?: string;
  serviceAreas?: string[];

  services?: Array<{
    name: string;
    description?: string;
    priceAmount?: number | string;
    durationMinutes?: number | string;
  }>;

  /*
   * Temple / Ashram Manager.
   */
  designation?: string;
  organizationName?: string;

  [key: string]: unknown;
};

export type AuthMeData = {
  authenticated: boolean;
  user: AuthUser | null;
};

export type AuthLoginData = {
  authenticated: boolean;
  user: AuthUser;
};

export type AuthRegisterData = {
  authenticated: boolean;
  user: AuthUser;
  message?: string;
  approvalRequired?: boolean;
  verificationRequired?: boolean;
};

export type AuthRoleData = {
  role: AuthRole;
  status: AuthStatus;
  userId: number;
};

/* ============================================================================
 * Authentication API
 * ========================================================================== */

export const authApi = {
  async me() {
    return apiGet<AuthMeData>(
      "/api/auth/me",
    );
  },

  async role() {
    return apiGet<AuthRoleData>(
      "/api/auth/role",
    );
  },

  async login(
    payload: LoginPayload,
  ) {
    return apiPost<AuthLoginData>(
      "/api/auth/login",
      payload,
    );
  },

  async register(
    payload: RegisterPayload,
  ) {
    return apiPost<AuthRegisterData>(
      "/api/auth/register",
      payload,
    );
  },

  async logout() {
    return apiPost<{
      authenticated: false;
    }>(
      "/api/auth/logout",
    );
  },

  async forgotPassword(
    email: string,
  ) {
    return apiPost<{
      resetToken?: string;
      expiresAt?: string;
    }>(
      "/api/auth/forgot-password",
      {
        email,
      },
    );
  },

  async resetPassword(
    payload: {
      token: string;
      password: string;
    },
  ) {
    return apiPost(
      "/api/auth/reset-password",
      payload,
    );
  },

  async verifyEmail(
    token: string,
  ) {
    return apiPost(
      "/api/auth/verify-email",
      {
        token,
      },
    );
  },

  async profile<T = AuthUser>(
    payload: Record<string, unknown>,
  ) {
    return apiPatch<T>(
      "/api/auth/profile",
      payload,
    );
  },
};

/* ============================================================================
 * Generic Admin Types
 * ========================================================================== */

export type AdminUserFilters = {
  search?: string;
  role?: AuthRole;
  status?: AuthStatus;
  page?: number;
  limit?: number;
};

export type AdminListFilters = {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export type AdminStatusPayload = {
  status:
    | "pending"
    | "active"
    | "suspended"
    | "rejected"
    | "blocked";
  reason?: string;
};

export type AdminRejectPayload = {
  reason?: string;
};

export type AdminFeaturePayload = {
  featured: boolean;
};

export type AdminListingPayload = {
  listingActive: boolean;
};

export type AdminPlanPayload = {
  name?: string;
  code?: string;
  priceAmount?: number;
  currency?: string;
  leadLimit?: number;
  durationDays?: number;
  listingEnabled?: boolean;
  featured?: boolean;
  prioritySupport?: boolean;
  isActive?: boolean;
  [key: string]: unknown;
};

export type AdminSettingsPayload =
  Record<string, unknown>;

export type CreateSalesPayload = {
  name: string;
  email: string;
  phone?: string;
  password: string;
};

/* ============================================================================
 * Super Admin API
 * ========================================================================== */

export const adminApi = {
  /* --------------------------------------------------------------------------
   * Dashboard
   * ------------------------------------------------------------------------ */

  async dashboard<T = unknown>() {
    return apiGet<T>(
      "/api/admin/dashboard",
    );
  },

  async me<T = AuthUser>() {
    return apiGet<T>(
      "/api/admin/me",
    );
  },

  /* --------------------------------------------------------------------------
   * Users
   * ------------------------------------------------------------------------ */

  async users<T = unknown>(
    filters?: AdminUserFilters,
  ) {
    return apiGet<T>(
      "/api/admin/users",
      filters,
    );
  },

  async user<T = unknown>(
    userId: number | string,
  ) {
    const id = encodePathId(
      userId,
      "user ID",
    );

    return apiGet<T>(
      `/api/admin/users/${id}`,
    );
  },

  async updateUserStatus<T = unknown>(
    userId: number | string,
    payload: AdminStatusPayload,
  ) {
    const id = encodePathId(
      userId,
      "user ID",
    );

    return apiPatch<T>(
      `/api/admin/users/${id}/status`,
      payload,
    );
  },

  /* --------------------------------------------------------------------------
   * Sales User Creation
   * ------------------------------------------------------------------------ */

  async createSales<T = unknown>(
    payload: CreateSalesPayload,
  ) {
    return apiPost<T>(
      "/api/admin/sales",
      payload,
    );
  },

  /* --------------------------------------------------------------------------
   * Pandits
   * ------------------------------------------------------------------------ */

  async pandits<T = unknown>(
    filters?: AdminListFilters,
  ) {
    return apiGet<T>(
      "/api/admin/pandits",
      filters,
    );
  },

  /**
   * IMPORTANT:
   * Backend contract:
   *
   *   PATCH /api/admin/pandits/:id/approve
   *
   * `id` here means pandit_profiles.id,
   * NOT users.id.
   */
  async approvePandit<T = unknown>(
    panditId: number | string,
  ) {
    const id = encodePathId(
      panditId,
      "Pandit profile ID",
    );

    return apiPatch<T>(
      `/api/admin/pandits/${id}/approve`,
    );
  },

  /**
   * IMPORTANT:
   * Backend contract:
   *
   *   PATCH /api/admin/pandits/:id/reject
   *
   * `id` here means pandit_profiles.id,
   * NOT users.id.
   */
  async rejectPandit<T = unknown>(
    panditId: number | string,
    payload?: AdminRejectPayload,
  ) {
    const id = encodePathId(
      panditId,
      "Pandit profile ID",
    );

    return apiPatch<T>(
      `/api/admin/pandits/${id}/reject`,
      payload ?? {},
    );
  },

  /**
   * Feature control for an already-approved Pandit.
   *
   * Backend contract:
   *   PATCH /api/admin/pandits/:id/feature
   */
  async featurePandit<T = unknown>(
    panditId: number | string,
    featured: boolean,
  ) {
    const id = encodePathId(
      panditId,
      "Pandit profile ID",
    );

    return apiPatch<T>(
      `/api/admin/pandits/${id}/feature`,
      {
        featured,
      },
    );
  },

  /**
   * Public listing control for an already-approved Pandit.
   *
   * Backend contract:
   *   PATCH /api/admin/pandits/:id/listing
   */
  async togglePanditListing<T = unknown>(
    panditId: number | string,
    listingActive: boolean,
  ) {
    const id = encodePathId(
      panditId,
      "Pandit profile ID",
    );

    return apiPatch<T>(
      `/api/admin/pandits/${id}/listing`,
      {
        listingActive,
      },
    );
  },

  /* --------------------------------------------------------------------------
   * Temple Managers
   * ------------------------------------------------------------------------ */

  async templeManagers<T = unknown>(
    filters?: AdminListFilters,
  ) {
    return apiGet<T>(
      "/api/admin/temple-managers",
      filters,
    );
  },

  /*
   * Manager approval/rejection remains POST because that is the
   * currently defined frontend/backend contract unless server route
   * definitions are changed.
   */
  async approveTempleManager<T = unknown>(
    userId: number | string,
  ) {
    const id = encodePathId(
      userId,
      "Temple Manager user ID",
    );

    return apiPost<T>(
      `/api/admin/temple-managers/${id}/approve`,
    );
  },

  async rejectTempleManager<T = unknown>(
    userId: number | string,
    payload?: AdminRejectPayload,
  ) {
    const id = encodePathId(
      userId,
      "Temple Manager user ID",
    );

    return apiPost<T>(
      `/api/admin/temple-managers/${id}/reject`,
      payload ?? {},
    );
  },

  /* --------------------------------------------------------------------------
   * Plans
   * ------------------------------------------------------------------------ */

  async plans<T = unknown>() {
    return apiGet<T>(
      "/api/admin/plans",
    );
  },

  async updatePlan<T = unknown>(
    planId: number | string,
    payload: AdminPlanPayload,
  ) {
    const id = encodePathId(
      planId,
      "plan ID",
    );

    return apiPatch<T>(
      `/api/admin/plans/${id}`,
      payload,
    );
  },

  /* --------------------------------------------------------------------------
   * Leads
   * ------------------------------------------------------------------------ */

  async leads<T = unknown>(
    filters?: AdminListFilters,
  ) {
    return apiGet<T>(
      "/api/admin/leads",
      filters,
    );
  },

  /* --------------------------------------------------------------------------
   * Subscriptions
   * ------------------------------------------------------------------------ */

  async subscriptions<T = unknown>(
    filters?: AdminListFilters,
  ) {
    return apiGet<T>(
      "/api/admin/subscriptions",
      filters,
    );
  },

  /* --------------------------------------------------------------------------
   * Temples
   * ------------------------------------------------------------------------ */

  async temples<T = unknown>(
    filters?: AdminListFilters,
  ) {
    return apiGet<T>(
      "/api/admin/temples",
      filters,
    );
  },

  /* --------------------------------------------------------------------------
   * Settings
   * ------------------------------------------------------------------------ */

  async settings<T = unknown>() {
    return apiGet<T>(
      "/api/admin/settings",
    );
  },

  async updateSettings<T = unknown>(
    payload: AdminSettingsPayload,
  ) {
    return apiPatch<T>(
      "/api/admin/settings",
      payload,
    );
  },

  /* --------------------------------------------------------------------------
   * Audit Logs
   * ------------------------------------------------------------------------ */

  async auditLogs<T = unknown>(
    filters?: AdminListFilters,
  ) {
    return apiGet<T>(
      "/api/admin/audit-logs",
      filters,
    );
  },
};

/* ============================================================================
 * Pandit API
 * ========================================================================== */

export const panditApi = {
  getProfile: <T = unknown>() =>
    apiGet<T>(
      "/api/pandit/profile",
    ),

  updateProfile: <T = unknown>(
    payload: Record<string, unknown>,
  ) =>
    apiPatch<T>(
      "/api/pandit/profile",
      payload,
    ),

  getLeads: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/pandit/leads",
      params,
    ),

  getSubscription: <T = unknown>() =>
    apiGet<T>(
      "/api/pandit/subscription",
    ),
};

/* ============================================================================
 * Temple Manager API
 * ========================================================================== */

export const templeManagerApi = {
  me: <T = unknown>() =>
    apiGet<T>(
      "/api/temple-manager/me",
    ),

  temples: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/temple-manager/temples",
      params,
    ),

  updateTemple: <T = unknown>(
    templeId: number | string,
    payload: Record<string, unknown>,
  ) => {
    const id = encodePathId(
      templeId,
      "Temple ID",
    );

    return apiPatch<T>(
      `/api/temple-manager/temples/${id}`,
      payload,
    );
  },
};

/* ============================================================================
 * Ashram Manager API
 * ========================================================================== */

export const ashramManagerApi = {
  me: <T = unknown>() =>
    apiGet<T>(
      "/api/ashram-manager/me",
    ),

  ashrams: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/ashram-manager/ashrams",
      params,
    ),

  updateAshram: <T = unknown>(
    ashramId: number | string,
    payload: Record<string, unknown>,
  ) => {
    const id = encodePathId(
      ashramId,
      "Ashram ID",
    );

    return apiPatch<T>(
      `/api/ashram-manager/ashrams/${id}`,
      payload,
    );
  },

  getSubscription: <T = unknown>() =>
    apiGet<T>(
      "/api/ashram-manager/subscription",
    ),
};

/* ============================================================================
 * Sales API
 * ========================================================================== */

export const salesApi = {
  dashboard: <T = unknown>() =>
    apiGet<T>(
      "/api/sales/dashboard",
    ),

  leads: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/sales/leads",
      params,
    ),

  lead: <T = unknown>(
    leadId: number | string,
  ) => {
    const id = encodePathId(
      leadId,
      "Lead ID",
    );

    return apiGet<T>(
      `/api/sales/leads/${id}`,
    );
  },

  createLead: <T = unknown>(
    payload: Record<string, unknown>,
  ) =>
    apiPost<T>(
      "/api/sales/leads",
      payload,
    ),

  updateLead: <T = unknown>(
    leadId: number | string,
    payload: Record<string, unknown>,
  ) => {
    const id = encodePathId(
      leadId,
      "Lead ID",
    );

    return apiPatch<T>(
      `/api/sales/leads/${id}`,
      payload,
    );
  },

  followups: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/sales/followups",
      params,
    ),

  activities: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/sales/activities",
      params,
    ),

  payments: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/sales/payments",
      params,
    ),

  bookings: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/sales/bookings",
      params,
    ),

  pandits: <T = unknown>(
    params?: Record<string, QueryValue>,
  ) =>
    apiGet<T>(
      "/api/sales/pandits",
      params,
    ),

  owners: <T = unknown>() =>
    apiGet<T>(
      "/api/leads/owners",
    ),

  scheduleFollowup: <T = unknown>(
    leadId: number | string,
    payload: Record<string, unknown>,
  ) => {
    const id = encodePathId(
      leadId,
      "Lead ID",
    );

    return apiPost<T>(
      `/api/leads/${id}/followups`,
      payload,
    );
  },

  exportLeads: (
    params?: Record<string, QueryValue>,
  ) => {
    const query = buildQueryString(params);

    return buildApiUrl(
      `/api/sales/leads/export.csv${query}`,
    );
  },
};

/* ============================================================================
 * Shared Utility API
 * ========================================================================== */

export const utilityApi = {
  health: <T = unknown>() =>
    apiGet<T>(
      "/api/health",
    ),
};

/* ============================================================================
 * API Configuration Accessors
 * ========================================================================== */

/**
 * Returns the backend origin only.
 *
 * Examples:
 *   http://localhost:3001
 *   https://api.example.com
 */
export function getApiOrigin(): string {
  return API_ORIGIN;
}

/**
 * Returns the canonical API prefix.
 */
export function getApiPrefix(): string {
  return API_PREFIX;
}

/**
 * Returns the resolved full API URL for debugging.
 */
export function getResolvedApiUrl(
  path = "",
): string {
  return buildApiUrl(path);
}

/* ============================================================================
 * Exports
 * ========================================================================== */

export {
  API_ORIGIN,
  API_PREFIX,
  DEFAULT_API_URL,
  DEFAULT_TIMEOUT_MS,
};