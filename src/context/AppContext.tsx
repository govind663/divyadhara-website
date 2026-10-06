/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/*
|--------------------------------------------------------------------------
| API Configuration
|--------------------------------------------------------------------------
|
| Canonical development setup:
|
|   Frontend : http://localhost:5173
|   Backend  : http://localhost:3001
|
| Frontend `.env`:
|
|   VITE_API_URL=/api
|
| `apiFetch()` calls remain written as:
|
|   /api/auth/me
|   /api/auth/login
|   /api/auth/logout
|
| In development we intentionally resolve `/api` to the backend origin:
|
|   http://localhost:3001/api/...
|
| This keeps authentication independent from Vite proxy configuration.
|
| In production `/api` stays same-origin so it can be handled by the
| reverse proxy / web server.
|--------------------------------------------------------------------------
*/

function resolveApiBaseUrl(): string {
  const configured =
    typeof import.meta.env.VITE_API_URL === "string"
      ? import.meta.env.VITE_API_URL.trim()
      : "";

  if (configured) {
    const normalized = configured.replace(/\/+$/, "");

    /*
     * Development:
     *
     * VITE_API_URL=/api
     *
     * becomes:
     *
     * http://localhost:3001
     *
     * because apiFetch() preserves the /api endpoint prefix.
     */
    if (
      import.meta.env.DEV &&
      normalized.toLowerCase() === "/api"
    ) {
      return "http://localhost:3001";
    }

    /*
     * Production:
     *
     * VITE_API_URL=/api
     *
     * should remain same-origin.
     */
    if (normalized.toLowerCase() === "/api") {
      return "";
    }

    /*
     * Support:
     *
     * VITE_API_URL=http://localhost:3001/api
     *
     * or:
     *
     * VITE_API_URL=https://example.com/api
     *
     * The `/api` suffix is removed because apiFetch() receives endpoints
     * which already contain the canonical `/api` prefix.
     */
    return normalized.replace(/\/api$/i, "");
  }

  /*
   * Development default.
   */
  if (import.meta.env.DEV) {
    return "http://localhost:3001";
  }

  /*
   * Production default.
   */
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

const API_BASE_URL =
  resolveApiBaseUrl();

const API_TIMEOUT_MS = 15_000;

/*
|--------------------------------------------------------------------------
| API Endpoint Normalization
|--------------------------------------------------------------------------
|
| Supports both:
|
|   /api/auth/me
|   /auth/me
|
| and makes sure the final path has the canonical `/api` prefix.
|--------------------------------------------------------------------------
*/

function normalizeApiEndpoint(
  endpoint: string,
): string {
  const trimmed =
    endpoint.trim();

  if (!trimmed) {
    return "/api";
  }

  const path =
    trimmed.startsWith("/")
      ? trimmed
      : `/${trimmed}`;

  if (
    path === "/api" ||
    path.startsWith("/api/")
  ) {
    return path;
  }

  return `/api${path}`;
}

/*
|--------------------------------------------------------------------------
| Roles
|--------------------------------------------------------------------------
*/

export type UserRole =
  | "visitor"
  | "pandit"
  | "temple_manager"
  | "ashram_manager"
  | "sales"
  | "super_admin";

export type UserStatus =
  | "pending"
  | "active"
  | "suspended"
  | "rejected"
  | "blocked";

/*
|--------------------------------------------------------------------------
| Dashboard Routes
|--------------------------------------------------------------------------
|
| Centralized role → dashboard mapping.
| Do not hard-code role dashboard paths in individual components.
|--------------------------------------------------------------------------
*/

const ROLE_DASHBOARD_PATHS: Record<
  UserRole,
  string
> = {
  visitor: "/dashboard",
  pandit: "/pandit/dashboard",
  temple_manager:
    "/temple-manager/dashboard",
  ashram_manager:
    "/ashram/dashboard",
  sales: "/sales/dashboard",
  super_admin:
    "/admin/dashboard",
};

export function getDashboardPathForRole(
  role: UserRole,
): string {
  return (
    ROLE_DASHBOARD_PATHS[role] ??
    ROLE_DASHBOARD_PATHS.visitor
  );
}

/*
|--------------------------------------------------------------------------
| Auth User
|--------------------------------------------------------------------------
*/

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  role: UserRole;
  status: UserStatus;
  avatar: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
};

/*
|--------------------------------------------------------------------------
| Profile Update
|--------------------------------------------------------------------------
*/

export type ProfileUpdateInput =
  Partial<
    Pick<
      User,
      | "name"
      | "phone"
      | "city"
      | "state"
      | "country"
      | "avatar"
    >
  >;

/*
|--------------------------------------------------------------------------
| Registration
|--------------------------------------------------------------------------
*/

export type ServiceRegistrationInput =
  {
    name: string;
    description?: string;
    priceAmount?:
      | number
      | string;
    durationMinutes?:
      | number
      | string;
  };

export type RegisterInput = {
  role: Extract<
    UserRole,
    | "visitor"
    | "pandit"
    | "temple_manager"
    | "ashram_manager"
  >;

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
   * Pandit fields.
   */
  title?: string;
  photo?: string;
  experienceYears?:
    | number
    | string;
  district?: string;
  languages?: string[];
  specializations?: string[];
  pujaTypes?: string[];
  associatedWith?: string;
  about?: string;
  availability?: string;
  serviceAreas?: string[];
  services?: ServiceRegistrationInput[];

  /*
   * Temple / Ashram Manager fields.
   */
  designation?: string;
  organizationName?: string;
};

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

export type LoginCredentials =
  {
    email: string;
    password: string;
  };

/*
|--------------------------------------------------------------------------
| Booking
|--------------------------------------------------------------------------
*/

export type Booking = {
  id: string;
  kind: string;
  title: string;
  date: string;
  status: string;
  detail: string;
};

/*
|--------------------------------------------------------------------------
| Notification
|--------------------------------------------------------------------------
*/

export type Notification = {
  id: string;
  text: string;
  date: string;
};

/*
|--------------------------------------------------------------------------
| API Envelope
|--------------------------------------------------------------------------
*/

type ApiEnvelope = {
  success?: boolean;
  authenticated?: boolean;
  user?: unknown;
  profile?: unknown;
  message?: string;
  error?: string;
  code?: string;
  approvalRequired?: boolean;
  verificationRequired?: boolean;
  dashboardPath?: string;
};

type AuthApiResponse =
  ApiEnvelope;

type ProfileApiResponse =
  ApiEnvelope;

/*
|--------------------------------------------------------------------------
| API Error Metadata
|--------------------------------------------------------------------------
*/

type ApiError =
  Error & {
    status?: number;
    code?: string;
  };

/*
|--------------------------------------------------------------------------
| App State
|--------------------------------------------------------------------------
*/

type AppState = {
  /*
   * Authentication
   */
  user: User | null;

  isAuthenticated: boolean;

  isLoading: boolean;

  authError: string | null;

  login: (
    credentials: LoginCredentials,
  ) => Promise<User>;

  register: (
    data: RegisterInput,
  ) => Promise<{
    authenticated: boolean;
    user: User;
    message: string;
  }>;

  logout: () => Promise<void>;

  refreshUser: () => Promise<User | null>;

  clearAuthError: () => void;

  /*
   * Role helpers
   */
  hasRole: (
    ...roles: UserRole[]
  ) => boolean;

  getDashboardPath: () => string;

  isVisitor: boolean;

  isPandit: boolean;

  isTempleManager: boolean;

  isAshramManager: boolean;

  isSales: boolean;

  isSuperAdmin: boolean;

  /*
   * Profile
   */
  updateProfile: (
    update: ProfileUpdateInput,
  ) => Promise<User>;

  isProfileUpdating: boolean;

  /*
   * Saved content
   */
  savedTemples: string[];

  savedPlaces: string[];

  toggleSave: (
    kind:
      | "temple"
      | "place",
    slug: string,
  ) => void;

  /*
   * Bookings
   */
  bookings: Booking[];

  addBooking: (
    booking: Omit<
      Booking,
      "id" | "status"
    >,
  ) => void;

  /*
   * Notifications
   */
  notifications: Notification[];
};

/*
|--------------------------------------------------------------------------
| Context
|--------------------------------------------------------------------------
*/

const Ctx =
  createContext<AppState | null>(
    null,
  );

/*
|--------------------------------------------------------------------------
| Runtime Helpers
|--------------------------------------------------------------------------
*/

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

const VALID_ROLES: UserRole[] =
  [
    "visitor",
    "pandit",
    "temple_manager",
    "ashram_manager",
    "sales",
    "super_admin",
  ];

const PUBLIC_REGISTRATION_ROLES: RegisterInput["role"][] =
  [
    "visitor",
    "pandit",
    "temple_manager",
    "ashram_manager",
  ];

const VALID_STATUSES: UserStatus[] =
  [
    "pending",
    "active",
    "suspended",
    "rejected",
    "blocked",
  ];

/*
|--------------------------------------------------------------------------
| Normalize API User
|--------------------------------------------------------------------------
|
| Server is the source of truth.
| Optional user fields are normalized instead of making login fail
| merely because an older endpoint omitted avatar/city/etc.
|--------------------------------------------------------------------------
*/

function normalizeUser(
  value: unknown,
): User | null {
  if (!isRecord(value)) {
    return null;
  }

  const id =
    typeof value.id ===
    "number"
      ? value.id
      : Number(value.id);

  const name =
    typeof value.name ===
    "string"
      ? value.name.trim()
      : "";

  const email =
    typeof value.email ===
    "string"
      ? value.email
          .trim()
          .toLowerCase()
      : "";

  const role =
    typeof value.role ===
    "string"
      ? value.role
      : "";

  const status =
    typeof value.status ===
    "string"
      ? value.status
      : "";

  if (
    !Number.isFinite(id) ||
    id <= 0
  ) {
    return null;
  }

  if (!name || !email) {
    return null;
  }

  if (
    !VALID_ROLES.includes(
      role as UserRole,
    )
  ) {
    return null;
  }

  if (
    !VALID_STATUSES.includes(
      status as UserStatus,
    )
  ) {
    return null;
  }

  const nullableString = (
    field: unknown,
  ): string | null => {
    if (
      typeof field !==
      "string"
    ) {
      return null;
    }

    const cleaned =
      field.trim();

    return cleaned || null;
  };

  return {
    id,
    name,
    email,
    phone:
      nullableString(
        value.phone,
      ),
    city:
      nullableString(
        value.city,
      ),
    state:
      nullableString(
        value.state,
      ),
    country:
      nullableString(
        value.country,
      ),
    role:
      role as UserRole,
    status:
      status as UserStatus,
    avatar:
      nullableString(
        value.avatar,
      ),
    emailVerifiedAt:
      nullableString(
        value.emailVerifiedAt,
      ),
    phoneVerifiedAt:
      nullableString(
        value.phoneVerifiedAt,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Local Storage
|--------------------------------------------------------------------------
*/

function loadStoredValue<T>(
  key: string,
  fallback: T,
): T {
  if (
    typeof window ===
    "undefined"
  ) {
    return fallback;
  }

  try {
    const stored =
      window.localStorage.getItem(
        key,
      );

    if (!stored) {
      return fallback;
    }

    return JSON.parse(
      stored,
    ) as T;
  } catch {
    return fallback;
  }
}

function saveStoredValue<T>(
  key: string,
  value: T,
): void {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(value),
    );
  } catch {
    /*
     * Ignore storage quota/private-mode failures.
     */
  }
}

function loadStoredStringArray(
  key: string,
  fallback: string[] = [],
): string[] {
  const value =
    loadStoredValue<unknown>(
      key,
      fallback,
    );

  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .filter(
      (item): item is string =>
        typeof item ===
        "string",
    )
    .map((item) =>
      item.trim(),
    )
    .filter(Boolean);
}

/*
|--------------------------------------------------------------------------
| API Helper
|--------------------------------------------------------------------------
*/

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "API requests are only available in the browser.",
    );
  }

  const controller =
    new AbortController();

  const timeoutId =
    window.setTimeout(
      () => {
        controller.abort();
      },
      API_TIMEOUT_MS,
    );

  try {
    const headers =
      new Headers(
        options.headers ??
          {},
      );

    if (
      !headers.has(
        "Accept",
      )
    ) {
      headers.set(
        "Accept",
        "application/json",
      );
    }

    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers.has(
        "Content-Type",
      )
    ) {
      headers.set(
        "Content-Type",
        "application/json",
      );
    }

    const apiEndpoint =
      normalizeApiEndpoint(
        endpoint,
      );

    const requestUrl =
      `${API_BASE_URL}${apiEndpoint}`;

    const response =
      await fetch(
        requestUrl,
        {
          ...options,
          credentials:
            "include",
          cache: "no-store",
          headers,
          signal:
            controller.signal,
        },
      );

    const contentType =
      response.headers.get(
        "content-type",
      ) || "";

    let data: unknown =
      null;

    if (
      response.status !== 204
    ) {
      if (
        contentType
          .toLowerCase()
          .includes(
            "application/json",
          )
      ) {
        try {
          data =
            await response.json();
        } catch {
          data = null;
        }
      } else {
        try {
          const text =
            await response.text();

          data =
            text.trim()
              ? text
              : null;
        } catch {
          data = null;
        }
      }
    }

    if (!response.ok) {
      const apiError =
        isRecord(data)
          ? data
          : null;

      const message =
        typeof apiError?.error ===
        "string"
          ? apiError.error
          : typeof apiError?.message ===
              "string"
            ? apiError.message
            : `Request failed with status ${response.status}.`;

      const error =
        new Error(
          message,
        ) as ApiError;

      error.status =
        response.status;

      if (
        typeof apiError?.code ===
        "string"
      ) {
        error.code =
          apiError.code;
      }

      throw error;
    }

    return data as T;
  } catch (error) {
    if (
      (typeof DOMException !==
        "undefined" &&
        error instanceof
          DOMException &&
        error.name ===
          "AbortError") ||
      (isRecord(error) &&
        error.name ===
          "AbortError")
    ) {
      throw new Error(
        "The DivyaDhara API request timed out. Please check that the backend server is running on port 3001.",
      );
    }

    if (
      error instanceof TypeError
    ) {
      throw new Error(
        `Unable to connect to the DivyaDhara API server at ${
          API_BASE_URL ||
          "the current website origin"
        }. Please check that the backend server is running on port 3001.`,
      );
    }

    throw error instanceof
      Error
      ? error
      : new Error(
          "Unexpected API error.",
        );
  } finally {
    window.clearTimeout(
      timeoutId,
    );
  }
}

/*
|--------------------------------------------------------------------------
| Input Helpers
|--------------------------------------------------------------------------
*/

function cleanText(
  value: string,
): string {
  return value.trim();
}

function cleanOptionalText(
  value:
    | string
    | null
    | undefined,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

function isValidPhone(
  phone: string,
): boolean {
  return /^[+0-9()\-\s]{7,20}$/.test(
    phone,
  );
}

function normalizeStringArray(
  value:
    | string[]
    | undefined,
): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned =
    Array.from(
      new Set(
        value
          .map(
            (item) =>
              item.trim(),
          )
          .filter(Boolean),
      ),
    );

  return cleaned;
}

function normalizeRegisterData(
  data: RegisterInput,
): RegisterInput {
  return {
    ...data,

    role: data.role,

    name:
      data.name.trim(),

    email:
      data.email
        .trim()
        .toLowerCase(),

    phone:
      data.phone?.trim() ||
      undefined,

    city:
      data.city?.trim() ||
      undefined,

    state:
      data.state?.trim() ||
      undefined,

    country:
      data.country?.trim() ||
      "India",

    password:
      data.password,

    preferredLanguage:
      data.preferredLanguage?.trim() ||
      undefined,

    marketingConsent:
      data.marketingConsent,

    title:
      data.title?.trim() ||
      undefined,

    photo:
      data.photo?.trim() ||
      undefined,

    experienceYears:
      data.experienceYears,

    district:
      data.district?.trim() ||
      undefined,

    languages:
      normalizeStringArray(
        data.languages,
      ),

    specializations:
      normalizeStringArray(
        data.specializations,
      ),

    pujaTypes:
      normalizeStringArray(
        data.pujaTypes,
      ),

    associatedWith:
      data.associatedWith?.trim() ||
      undefined,

    about:
      data.about?.trim() ||
      undefined,

    availability:
      data.availability?.trim() ||
      undefined,

    serviceAreas:
      normalizeStringArray(
        data.serviceAreas,
      ),

    services:
      data.services?.map(
        (service) => ({
          ...service,
          name:
            service.name.trim(),
          description:
            service.description
              ?.trim() ||
            undefined,
        }),
      ),

    designation:
      data.designation?.trim() ||
      undefined,

    organizationName:
      data.organizationName?.trim() ||
      undefined,
  };
}

/*
|--------------------------------------------------------------------------
| Default Data
|--------------------------------------------------------------------------
*/

const DEFAULT_BOOKINGS:
  Booking[] = [
    {
      id: "DD-2481",
      kind:
        "Puja Enquiry",
      title:
        "Satyanarayan Katha — Home",
      date:
        "2026-09-02",
      status:
        "Confirmed",
      detail:
        "Pandit assigned · Varanasi",
    },
    {
      id: "DD-2510",
      kind:
        "Yatra Enquiry",
      title:
        "Kashi · Ayodhya · Prayagraj 5D",
      date:
        "2026-09-05",
      status:
        "In progress",
      detail:
        "2 travellers · Oct batch",
    },
  ];

const DEFAULT_NOTIFICATIONS:
  Notification[] = [
    {
      id: "n1",
      text:
        "Your Satyanarayan Katha pandit has been assigned.",
      date:
        "2026-09-06",
    },
    {
      id: "n2",
      text:
        "Dev Deepawali boats in Varanasi are filling — reserve early.",
      date:
        "2026-09-04",
    },
    {
      id: "n3",
      text:
        "New batch: Sanskrit Foundation begins first Saturday.",
      date:
        "2026-09-01",
    },
  ];

/*
|--------------------------------------------------------------------------
| Provider
|--------------------------------------------------------------------------
*/

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  /*
   * ----------------------------------------------------------------------
   * Authentication
   * ----------------------------------------------------------------------
   */

  const [
    user,
    setUser,
  ] =
    useState<User | null>(
      null,
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    authError,
    setAuthError,
  ] =
    useState<
      string | null
    >(null);

  /*
   * ----------------------------------------------------------------------
   * Profile
   * ----------------------------------------------------------------------
   */

  const [
    isProfileUpdating,
    setIsProfileUpdating,
  ] =
    useState(false);

  /*
   * ----------------------------------------------------------------------
   * Saved Content
   * ----------------------------------------------------------------------
   */

  const [
    savedTemples,
    setSavedTemples,
  ] =
    useState<string[]>(
      () =>
        loadStoredStringArray(
          "dd_saved_t",
        ),
    );

  const [
    savedPlaces,
    setSavedPlaces,
  ] =
    useState<string[]>(
      () =>
        loadStoredStringArray(
          "dd_saved_p",
        ),
    );

  /*
   * ----------------------------------------------------------------------
   * Bookings
   * ----------------------------------------------------------------------
   */

  const [
    bookings,
    setBookings,
  ] =
    useState<Booking[]>(
      () =>
        loadStoredValue<
          Booking[]
        >(
          "dd_bookings",
          DEFAULT_BOOKINGS,
        ),
    );

  /*
   * ----------------------------------------------------------------------
   * Notifications
   * ----------------------------------------------------------------------
   */

  const [
    notifications,
  ] =
    useState<Notification[]>(
      () =>
        loadStoredValue<
          Notification[]
        >(
          "dd_notif",
          DEFAULT_NOTIFICATIONS,
        ),
    );

  /*
   * ----------------------------------------------------------------------
   * Persist Local Data
   * ----------------------------------------------------------------------
   */

  useEffect(() => {
    saveStoredValue(
      "dd_saved_t",
      savedTemples,
    );
  }, [savedTemples]);

  useEffect(() => {
    saveStoredValue(
      "dd_saved_p",
      savedPlaces,
    );
  }, [savedPlaces]);

  useEffect(() => {
    saveStoredValue(
      "dd_bookings",
      bookings,
    );
  }, [bookings]);

  /*
   * ----------------------------------------------------------------------
   * Refresh User
   * ----------------------------------------------------------------------
   */

  const refreshUser =
    useCallback(
      async (): Promise<
        User | null
      > => {
        try {
          const response =
            await apiFetch<AuthApiResponse>(
              "/api/auth/me",
            );

          const normalizedUser =
            normalizeUser(
              response.user,
            );

          if (
            response.authenticated &&
            normalizedUser
          ) {
            setUser(
              normalizedUser,
            );

            setAuthError(null);

            return normalizedUser;
          }

          /*
           * Backend explicitly says there is no authenticated session.
           */
          setUser(null);
          setAuthError(null);

          return null;
        } catch (error) {
          const apiError =
            error as ApiError;

          /*
           * 401/403 means the session is no longer valid.
           */
          if (
            apiError.status ===
              401 ||
            apiError.status ===
              403
          ) {
            setUser(null);
            setAuthError(
              error instanceof
                Error
                ? error.message
                : "Your session has expired.",
            );

            return null;
          }

          /*
           * A temporary network/server problem should not destroy the
           * current frontend authentication state.
           */
          console.error(
            "refreshUser failed:",
            error,
          );

          return user;
        }
      },
      [user],
    );

  /*
   * ----------------------------------------------------------------------
   * Initial Session Check
   * ----------------------------------------------------------------------
   */

  useEffect(() => {
    let mounted =
      true;

    const checkSession =
      async () => {
        setIsLoading(true);

        try {
          const response =
            await apiFetch<AuthApiResponse>(
              "/api/auth/me",
            );

          if (!mounted) {
            return;
          }

          const normalizedUser =
            normalizeUser(
              response.user,
            );

          if (
            response.authenticated &&
            normalizedUser
          ) {
            setUser(
              normalizedUser,
            );

            setAuthError(null);
          } else {
            setUser(null);
            setAuthError(null);
          }
        } catch (error) {
          if (!mounted) {
            return;
          }

          /*
           * At initial app boot we do not yet know whether a session
           * exists, so don't assume authentication on a failed request.
           */
          setUser(null);

          setAuthError(
            error instanceof
              Error
              ? error.message
              : "Unable to verify your session.",
          );
        } finally {
          if (mounted) {
            setIsLoading(false);
          }
        }
      };

    void checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * ----------------------------------------------------------------------
   * Login
   * ----------------------------------------------------------------------
   */

  const login =
    useCallback(
      async (
        credentials: LoginCredentials,
      ): Promise<User> => {
        setAuthError(null);
        setIsLoading(true);

        const email =
          credentials.email
            .trim()
            .toLowerCase();

        const password =
          credentials.password;

        /*
        |--------------------------------------------------------------------------
        | Local validation
        |--------------------------------------------------------------------------
        */

        if (!email) {
          const message =
            "Email address is required.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email,
          )
        ) {
          const message =
            "Please enter a valid email address.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        if (!password) {
          const message =
            "Password is required.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        try {
          const response =
            await apiFetch<AuthApiResponse>(
              "/api/auth/login",
              {
                method:
                  "POST",
                body:
                  JSON.stringify({
                    email,
                    password,
                  }),
              },
            );

          const normalizedUser =
            normalizeUser(
              response.user,
            );

          if (
            !normalizedUser
          ) {
            throw new Error(
              "Login succeeded but the server did not return a valid user account.",
            );
          }

          /*
           * Server is the source of truth.
           */
          setUser(
            normalizedUser,
          );

          setAuthError(null);

          return normalizedUser;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to login.";

          setUser(null);
          setAuthError(message);

          throw new Error(
            message,
          );
        } finally {
          setIsLoading(false);
        }
      },
      [],
    );

  /*
   * ----------------------------------------------------------------------
   * Register
   * ----------------------------------------------------------------------
   */

  const register =
    useCallback(
      async (
        data: RegisterInput,
      ): Promise<{
        authenticated: boolean;
        user: User;
        message: string;
      }> => {
        setAuthError(null);
        setIsLoading(true);

        const normalized =
          normalizeRegisterData(
            data,
          );

        if (
          !PUBLIC_REGISTRATION_ROLES.includes(
            normalized.role,
          )
        ) {
          const message =
            "This account role is not available for public registration.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Common validation
        |--------------------------------------------------------------------------
        */

        if (
          !normalized.name
        ) {
          const message =
            "Name is required.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        if (
          !normalized.email
        ) {
          const message =
            "Email address is required.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            normalized.email,
          )
        ) {
          const message =
            "Please enter a valid email address.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        if (
          !normalized.password
        ) {
          const message =
            "Password is required.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        if (
          normalized.password.length <
          8
        ) {
          const message =
            "Password must contain at least 8 characters.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Phone validation
        |--------------------------------------------------------------------------
        */

        if (
          normalized.phone &&
          !isValidPhone(
            normalized.phone,
          )
        ) {
          const message =
            "Please enter a valid phone number.";

          setAuthError(message);
          setIsLoading(false);

          throw new Error(
            message,
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Pandit validation
        |--------------------------------------------------------------------------
        */

        if (
          normalized.role ===
          "pandit"
        ) {
          if (
            normalized.experienceYears !==
              undefined &&
            normalized.experienceYears !==
              ""
          ) {
            const experience =
              Number(
                normalized.experienceYears,
              );

            if (
              !Number.isInteger(
                experience,
              ) ||
              experience < 0 ||
              experience > 100
            ) {
              const message =
                "Pandit experience must be between 0 and 100 years.";

              setAuthError(
                message,
              );
              setIsLoading(false);

              throw new Error(
                message,
              );
            }
          }
        }

        try {
          const response =
            await apiFetch<AuthApiResponse>(
              "/api/auth/register",
              {
                method:
                  "POST",
                body:
                  JSON.stringify(
                    normalized,
                  ),
              },
            );

          const normalizedUser =
            normalizeUser(
              response.user,
            );

          if (
            !normalizedUser
          ) {
            throw new Error(
              "Registration succeeded but the server did not return a valid user account.",
            );
          }

          const authenticated =
            Boolean(
              response.authenticated,
            );

          /*
           * Visitor is normally authenticated immediately.
           *
           * Pandit / Temple Manager / Ashram Manager may receive
           * authenticated=false while waiting for admin approval.
           */
          if (
            authenticated
          ) {
            setUser(
              normalizedUser,
            );
          } else {
            setUser(null);
          }

          setAuthError(null);

          return {
            authenticated,
            user:
              normalizedUser,
            message:
              response.message ||
              "Registration successful.",
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to complete registration.";

          setAuthError(message);

          throw new Error(
            message,
          );
        } finally {
          setIsLoading(false);
        }
      },
      [],
    );

  /*
   * ----------------------------------------------------------------------
   * Logout
   * ----------------------------------------------------------------------
   */

  const logout =
    useCallback(
      async (): Promise<void> => {
        setAuthError(null);

        try {
          await apiFetch<AuthApiResponse>(
            "/api/auth/logout",
            {
              method:
                "POST",
            },
          );
        } catch (error) {
          /*
           * Local session state must always be cleared.
           */
          console.error(
            "Logout request failed:",
            error,
          );
        } finally {
          setUser(null);
          setIsProfileUpdating(
            false,
          );
        }
      },
      [],
    );

  /*
   * ----------------------------------------------------------------------
   * Update Profile
   * ----------------------------------------------------------------------
   */

  const updateProfile =
    useCallback(
      async (
        update: ProfileUpdateInput,
      ): Promise<User> => {
        if (!user) {
          const message =
            "You must be logged in to update your profile.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        const payload: ProfileUpdateInput =
          {};

        /*
        |--------------------------------------------------------------------------
        | Name
        |--------------------------------------------------------------------------
        */

        if (
          update.name !==
          undefined
        ) {
          payload.name =
            cleanText(
              update.name,
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Phone
        |--------------------------------------------------------------------------
        */

        if (
          update.phone !==
          undefined
        ) {
          payload.phone =
            update.phone ===
            null
              ? null
              : cleanText(
                  update.phone,
                );
        }

        /*
        |--------------------------------------------------------------------------
        | City
        |--------------------------------------------------------------------------
        */

        if (
          update.city !==
          undefined
        ) {
          payload.city =
            cleanOptionalText(
              update.city,
            );
        }

        /*
        |--------------------------------------------------------------------------
        | State
        |--------------------------------------------------------------------------
        */

        if (
          update.state !==
          undefined
        ) {
          payload.state =
            cleanOptionalText(
              update.state,
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Country
        |--------------------------------------------------------------------------
        */

        if (
          update.country !==
          undefined
        ) {
          payload.country =
            cleanOptionalText(
              update.country,
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Avatar
        |--------------------------------------------------------------------------
        */

        if (
          update.avatar !==
          undefined
        ) {
          payload.avatar =
            cleanOptionalText(
              update.avatar,
            );
        }

        /*
        |--------------------------------------------------------------------------
        | No changes
        |--------------------------------------------------------------------------
        */

        if (
          Object.keys(
            payload,
          ).length === 0
        ) {
          return user;
        }

        /*
        |--------------------------------------------------------------------------
        | Name validation
        |--------------------------------------------------------------------------
        */

        if (
          payload.name !==
            undefined &&
          payload.name.length ===
            0
        ) {
          const message =
            "Name cannot be empty.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        if (
          payload.name !==
            undefined &&
          payload.name.length >
            150
        ) {
          const message =
            "Name cannot exceed 150 characters.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Phone validation
        |--------------------------------------------------------------------------
        */

        if (
          payload.phone &&
          !isValidPhone(
            payload.phone,
          )
        ) {
          const message =
            "Please enter a valid phone number.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        if (
          typeof payload.phone ===
            "string" &&
          payload.phone.length >
            30
        ) {
          const message =
            "Phone number is too long.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Field lengths
        |--------------------------------------------------------------------------
        */

        if (
          typeof payload.city ===
            "string" &&
          payload.city.length >
            120
        ) {
          const message =
            "City cannot exceed 120 characters.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        if (
          typeof payload.state ===
            "string" &&
          payload.state.length >
            120
        ) {
          const message =
            "State cannot exceed 120 characters.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        if (
          typeof payload.country ===
            "string" &&
          payload.country.length >
            100
        ) {
          const message =
            "Country cannot exceed 100 characters.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        if (
          typeof payload.avatar ===
            "string" &&
          payload.avatar.length >
            500
        ) {
          const message =
            "Avatar value cannot exceed 500 characters.";

          setAuthError(message);

          throw new Error(
            message,
          );
        }

        setAuthError(null);
        setIsProfileUpdating(
          true,
        );

        try {
          const response =
            await apiFetch<ProfileApiResponse>(
              "/api/auth/profile",
              {
                method:
                  "PATCH",
                body:
                  JSON.stringify(
                    payload,
                  ),
              },
            );

          const normalizedUser =
            normalizeUser(
              response.user,
            );

          if (
            !normalizedUser
          ) {
            throw new Error(
              "Profile update succeeded but the server did not return a valid updated user.",
            );
          }

          setUser(
            normalizedUser,
          );

          setAuthError(null);

          return normalizedUser;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to update your profile.";

          setAuthError(message);

          throw new Error(
            message,
          );
        } finally {
          setIsProfileUpdating(
            false,
          );
        }
      },
      [user],
    );

  /*
   * ----------------------------------------------------------------------
   * Clear Auth Error
   * ----------------------------------------------------------------------
   */

  const clearAuthError =
    useCallback(() => {
      setAuthError(null);
    }, []);

  /*
   * ----------------------------------------------------------------------
   * Role Helpers
   * ----------------------------------------------------------------------
   */

  const hasRole =
    useCallback(
      (
        ...roles: UserRole[]
      ): boolean => {
        if (!user) {
          return false;
        }

        return roles.includes(
          user.role,
        );
      },
      [user],
    );

  /*
   * ----------------------------------------------------------------------
   * Current Dashboard Path
   * ----------------------------------------------------------------------
   */

  const getDashboardPath =
    useCallback(() => {
      if (!user) {
        return "/login";
      }

      return getDashboardPathForRole(
        user.role,
      );
    }, [user]);

  /*
   * ----------------------------------------------------------------------
   * Role Flags
   * ----------------------------------------------------------------------
   */

  const isVisitor =
    user?.role ===
    "visitor";

  const isPandit =
    user?.role ===
    "pandit";

  const isTempleManager =
    user?.role ===
    "temple_manager";

  const isAshramManager =
    user?.role ===
    "ashram_manager";

  const isSales =
    user?.role ===
    "sales";

  const isSuperAdmin =
    user?.role ===
    "super_admin";

  /*
   * ----------------------------------------------------------------------
   * Toggle Save
   * ----------------------------------------------------------------------
   */

  const toggleSave =
    useCallback(
      (
        kind:
          | "temple"
          | "place",
        slug: string,
      ) => {
        const cleanSlug =
          slug.trim();

        if (!cleanSlug) {
          return;
        }

        if (
          kind ===
          "temple"
        ) {
          setSavedTemples(
            (current) => {
              if (
                current.includes(
                  cleanSlug,
                )
              ) {
                return current.filter(
                  (item) =>
                    item !==
                    cleanSlug,
                );
              }

              return [
                ...current,
                cleanSlug,
              ];
            },
          );

          return;
        }

        setSavedPlaces(
          (current) => {
            if (
              current.includes(
                cleanSlug,
              )
            ) {
              return current.filter(
                (item) =>
                  item !==
                  cleanSlug,
              );
            }

            return [
              ...current,
              cleanSlug,
            ];
          },
        );
      },
      [],
    );

  /*
   * ----------------------------------------------------------------------
   * Add Booking
   * ----------------------------------------------------------------------
   */

  const addBooking =
    useCallback(
      (
        booking: Omit<
          Booking,
          "id" | "status"
        >,
      ) => {
        const newBooking:
          Booking = {
          ...booking,
          id: `DD-${Date.now()}`,
          status:
            "Received",
        };

        setBookings(
          (current) => [
            newBooking,
            ...current,
          ],
        );
      },
      [],
    );

  /*
   * ----------------------------------------------------------------------
   * Memoized Context
   * ----------------------------------------------------------------------
   */

  const contextValue =
    useMemo<AppState>(
      () => ({
        /*
         * Authentication
         */
        user,

        isAuthenticated:
          Boolean(user),

        isLoading,

        authError,

        login,

        register,

        logout,

        refreshUser,

        clearAuthError,

        /*
         * Roles
         */
        hasRole,

        getDashboardPath,

        isVisitor,

        isPandit,

        isTempleManager,

        isAshramManager,

        isSales,

        isSuperAdmin,

        /*
         * Profile
         */
        updateProfile,

        isProfileUpdating,

        /*
         * Saved
         */
        savedTemples,

        savedPlaces,

        toggleSave,

        /*
         * Bookings
         */
        bookings,

        addBooking,

        /*
         * Notifications
         */
        notifications,
      }),
      [
        user,
        isLoading,
        authError,
        login,
        register,
        logout,
        refreshUser,
        clearAuthError,
        hasRole,
        getDashboardPath,
        isVisitor,
        isPandit,
        isTempleManager,
        isAshramManager,
        isSales,
        isSuperAdmin,
        updateProfile,
        isProfileUpdating,
        savedTemples,
        savedPlaces,
        toggleSave,
        bookings,
        addBooking,
        notifications,
      ],
    );

  return (
    <Ctx.Provider
      value={contextValue}
    >
      {children}
    </Ctx.Provider>
  );
}

/*
|--------------------------------------------------------------------------
| useApp
|--------------------------------------------------------------------------
*/

export function useApp(): AppState {
  const context =
    useContext(Ctx);

  if (!context) {
    throw new Error(
      "useApp must be used inside AppProvider.",
    );
  }

  return context;
}