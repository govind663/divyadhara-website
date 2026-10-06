/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Crown,
  Edit3,
  Eye,
  FileImage,
  ImagePlus,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  User as UserIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useSEO } from "../lib/seo";
import {
  confirmAction,
  showError,
  showSuccess,
  showWarning,
  toast,
} from "../lib/swal";
import { buildApiUrl } from "../lib/api";

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 20_000;

class AshramApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code: string | null = null,
  ) {
    super(message);
    this.name = "AshramApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type JsonObject = Record<string, unknown>;

async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const url = buildApiUrl(path);

  const forwardAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (options.signal) {
    if (options.signal.aborted) {
      forwardAbort();
    } else {
      options.signal.addEventListener(
        "abort",
        forwardAbort,
        { once: true },
      );
    }
  }

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });

    const raw = await response.text();
    let data: JsonObject = {};

    if (raw.trim()) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          data = parsed as JsonObject;
        }
      } catch {
        data = {
          error: raw.trim().slice(0, 1000),
        };
      }
    }

    if (!response.ok) {
      throw new AshramApiError(
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : `Request failed with status ${response.status}.`,
        response.status,
        typeof data.code === "string"
          ? data.code
          : null,
      );
    }

    if (data.success === false) {
      throw new AshramApiError(
        typeof data.error === "string"
          ? data.error
          : typeof data.message === "string"
            ? data.message
            : "The Ashram request was rejected by the server.",
        response.status || 400,
        typeof data.code === "string"
          ? data.code
          : null,
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof AshramApiError) {
      throw error;
    }

    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new AshramApiError(
        "The Ashram dashboard request timed out. Please check that the DivyaDhara API server is running.",
        408,
        "REQUEST_TIMEOUT",
      );
    }

    if (error instanceof TypeError) {
      throw new AshramApiError(
        "Unable to connect to the DivyaDhara API server.",
        0,
        "API_CONNECTION_ERROR",
      );
    }

    throw error instanceof Error
      ? error
      : new AshramApiError(
          "Unexpected Ashram dashboard error.",
        );
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener(
      "abort",
      forwardAbort,
    );
  }
}

/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type TabId =
  | "overview"
  | "ashram"
  | "programs"
  | "gallery"
  | "leads"
  | "subscription"
  | "analytics"
  | "notifications"
  | "settings";

type LoadingState = {
  workspace: boolean;
  dashboard: boolean;
  leads: boolean;
  analytics: boolean;
  savingAshram: boolean;
  savingGallery: boolean;
  savingProgram: boolean;
};

type AshramRecord = {
  id: number;
  slug?: string | null;
  name: string;
  shortName?: string | null;
  founder?: string | null;
  spiritualHead?: string | null;
  tradition?: string | null;
  founded?: string | null;
  summary?: string | null;
  description?: string | null;
  history?: string | null;
  activities?: unknown[];
  stay?: string | null;
  food?: string | null;
  courses?: unknown[];
  contactNote?: string | null;
  image?: string | null;
  gallery?: unknown[];
  city?: string | null;
  district?: string | null;
  state?: string | null;
  country?: string | null;
  locationId?: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  stayAvailable?: number;
  retreatAvailable?: number;
  facilities?: unknown[];
  programs?: unknown[];
  timings?: Record<string, unknown> | null;
  bookingEnabled?: number;
  status?: string | null;
  featured?: number;
  listingActive?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  subscription?: AshramSubscription | null;
  activeAssignment?: JsonObject | null;
};

type AshramWorkspaceItem = AshramRecord & {
  subscription?: AshramSubscription | null;
  latestAssignment?: JsonObject | null;
};

type AshramSubscription = {
  id: number;
  ashramId?: number;
  status?: string | null;
  planId?: number | null;
  planCode?: string | null;
  planName?: string | null;
  planDescription?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  subscriptionPlanPriceId?: number | null;
  billingInterval?: string | null;
  durationDays?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  leadLimit?: number;
  leadsUsed?: number;
  leadsRemaining?: number;
  serviceLimit?: number;
  serviceAreaLimit?: number;
  programLimit?: number;
  galleryLimit?: number;
  videoLimit?: number;
  listingEnabled?: number;
  featuredListing?: number;
  prioritySupport?: number;
  verificationBadge?: number;
  analyticsAccess?: number;
  analyticsLevel?: string | null;
  homepagePromotion?: number;
  liveAartiEnabled?: number;
  enhancedSeo?: number;
  enhancedProfile?: number;
  whatsappEnquiry?: number;
  searchVisibility?: string | null;
  autoRenew?: number;
  managerUserId?: number | null;
  planFeatures?: unknown[];
};

type AshramPlan = {
  id: number;
  code?: string | null;
  audience?: string | null;
  name?: string | null;
  description?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  billingInterval?: string | null;
  durationDays?: number | null;
  leadLimit?: number;
  galleryLimit?: number;
  videoLimit?: number;
  programLimit?: number;
  listingEnabled?: number;
  featuredListing?: number;
  analyticsLevel?: string | null;
  enhancedSeo?: number;
  enhancedProfile?: number;
  homepagePromotion?: number;
  prioritySupport?: number;
  whatsappEnquiry?: number;
  planFeatures?: unknown[];
  features?: unknown[];
  plan_features_json?: string | null;
  [key: string]: unknown;
};

type AshramProgram = {
  id: number;
  ashramId?: number;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  programType?: string | null;
  durationText?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  image?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: number | boolean;
  sortOrder?: number;
};

type WorkspaceResponse = {
  success: boolean;
  ashrams?: AshramWorkspaceItem[];
};

type LeadRecord = {
  id: number;
  ashram_id?: number | null;
  lead_number?: string | null;
  leadNumber?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  priority?: string | null;
  lead_temperature?: string | null;
  leadTemperature?: string | null;
  service_type?: string | null;
  serviceType?: string | null;
  puja_type?: string | null;
  pujaType?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  country?: string | null;
  source_page?: string | null;
  sourcePage?: string | null;
  ashram_name?: string | null;
  ashramName?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
};

type LeadListResponse = {
  success: boolean;
  leads?: LeadRecord[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
};

type AnalyticsOverviewResponse = {
  success: boolean;
  range?: { from?: string; to?: string };
  scope?: { analyticsLevel?: string; ashramIds?: number[] };
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
  conversions?: Array<{
    conversion_type?: string;
    count?: number;
    value_amount?: number;
    unique_visitors?: number;
  }>;
};

type DashboardResponse = {
  success: boolean;
  ashram: AshramRecord;
  subscription?: AshramSubscription | null;
  plans?: AshramPlan[];
  managerAssignments?: {
    active?: JsonObject[];
    history?: JsonObject[];
  };
  counts?: {
    programs?: number;
    linkedCourses?: number;
    totalProgramsAndCourses?: number;
    galleryItems?: number;
    leads?: {
      total?: number;
      open?: number;
      converted?: number;
      followUps?: number;
    };
    bookings?: {
      total?: number;
      open?: number;
      completed?: number;
      paidAmount?: number;
    };
    unreadNotifications?: number;
  };
};

type AshramForm = {
  name: string;
  shortName: string;
  founder: string;
  spiritualHead: string;
  tradition: string;
  founded: string;
  summary: string;
  description: string;
  history: string;
  stay: string;
  food: string;
  contactNote: string;
  image: string;
  city: string;
  district: string;
  state: string;
  country: string;
  address: string;
  mapUrl: string;
  latitude: string;
  longitude: string;
  contactPhone: string;
  contactEmail: string;
  websiteUrl: string;
  activities: string;
  facilities: string;
  timingsJson: string;
  stayAvailable: boolean;
  retreatAvailable: boolean;
  bookingEnabled: boolean;
};

type ProgramForm = {
  title: string;
  description: string;
  programType: string;
  durationText: string;
  priceAmount: string;
  currency: string;
  image: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  sortOrder: string;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function bool(value: unknown): boolean {
  return value === true || Number(value) === 1 || value === "true";
}

function number(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function prettyStatus(value?: string | null): string {
  if (!value) return "Not set";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(value?: string | null): string {
  const normalized = text(value).toLowerCase();
  if (["active", "published", "verified", "converted"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (["rejected", "suspended", "blocked", "expired", "unpublished"].includes(normalized)) {
    return "bg-rose-100 text-rose-800";
  }
  return "bg-amber-100 text-amber-900";
}

function displayCurrency(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) {
    return "Price on request";
  }
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return `${currency || "INR"} ${amount}`;
  }
}

function dateLabel(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function safeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function daysRemaining(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000));
}

function csvToArray(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function arrayToCsv(value: unknown[] | undefined): string {
  return (value ?? []).map((item) => text(item)).filter(Boolean).join(", ");
}

function mediaUrl(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as JsonObject;
    return text(record.url || record.image || record.src);
  }
  return "";
}

function createEmptyAshramForm(ashram?: AshramRecord | null): AshramForm {
  return {
    name: text(ashram?.name),
    shortName: text(ashram?.shortName),
    founder: text(ashram?.founder),
    spiritualHead: text(ashram?.spiritualHead),
    tradition: text(ashram?.tradition),
    founded: text(ashram?.founded),
    summary: text(ashram?.summary),
    description: text(ashram?.description),
    history: text(ashram?.history),
    stay: text(ashram?.stay),
    food: text(ashram?.food),
    contactNote: text(ashram?.contactNote),
    image: text(ashram?.image),
    city: text(ashram?.city),
    district: text(ashram?.district),
    state: text(ashram?.state),
    country: text(ashram?.country || "India"),
    address: text(ashram?.address),
    mapUrl: text(ashram?.mapUrl),
    latitude: ashram?.latitude == null ? "" : String(ashram.latitude),
    longitude: ashram?.longitude == null ? "" : String(ashram.longitude),
    contactPhone: text(ashram?.contactPhone),
    contactEmail: text(ashram?.contactEmail),
    websiteUrl: text(ashram?.websiteUrl),
    activities: arrayToCsv(ashram?.activities),
    facilities: arrayToCsv(ashram?.facilities),
    timingsJson: JSON.stringify(ashram?.timings ?? {}, null, 2),
    stayAvailable: bool(ashram?.stayAvailable),
    retreatAvailable: bool(ashram?.retreatAvailable),
    bookingEnabled: bool(ashram?.bookingEnabled),
  };
}

function createEmptyProgramForm(): ProgramForm {
  return {
    title: "",
    description: "",
    programType: "",
    durationText: "",
    priceAmount: "",
    currency: "INR",
    image: "",
    startDate: "",
    endDate: "",
    isActive: true,
    sortOrder: "0",
  };
}

function profileCompletion(ashram?: AshramRecord | null): number {
  if (!ashram) return 0;
  const checks: unknown[] = [
    ashram.name,
    ashram.summary,
    ashram.description,
    ashram.history,
    ashram.image,
    ashram.city,
    ashram.state,
    ashram.address,
    ashram.contactPhone,
    ashram.contactEmail,
    ashram.websiteUrl,
    ashram.activities?.length,
    ashram.facilities?.length,
    ashram.timings && Object.keys(ashram.timings).length,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AshramDashboard() {
  useSEO({
    title: "Ashram Dashboard — DivyaDhara | Ashram Management",
    description:
      "Manage your assigned DivyaDhara Ashram profile, programs, gallery, enquiry performance and subscription entitlements.",
    path: "/ashram/dashboard",
  });

  const { user, logout, refreshUser, notifications } = useApp();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workspace, setWorkspace] = useState<AshramWorkspaceItem[]>([]);
  const [selectedAshramId, setSelectedAshramId] = useState<number | null>(null);
  const [ashram, setAshram] = useState<AshramRecord | null>(null);
  const [subscription, setSubscription] = useState<AshramSubscription | null>(null);
  const [plans, setPlans] = useState<AshramPlan[]>([]);
  const [programs, setPrograms] = useState<AshramProgram[]>([]);
  const [managerAssignments, setManagerAssignments] = useState<{
    active: JsonObject[];
    history: JsonObject[];
  }>({ active: [], history: [] });
  const [counts, setCounts] = useState<DashboardResponse["counts"]>({});
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [leadPage, setLeadPage] = useState(1);
  const [leadTotalPages, setLeadTotalPages] = useState(1);
  const [leadTotal, setLeadTotal] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [analytics, setAnalytics] = useState<AnalyticsOverviewResponse["totals"] | null>(null);
  const [analyticsConversions, setAnalyticsConversions] = useState<NonNullable<AnalyticsOverviewResponse["conversions"]>>([]);
  const [analyticsRange, setAnalyticsRange] = useState<{ from: string; to: string } | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState({
    whatsapp: true,
    email: true,
    updates: true,
  });
  const [pageError, setPageError] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    workspace: true,
    dashboard: false,
    leads: false,
    analytics: false,
    savingAshram: false,
    savingGallery: false,
    savingProgram: false,
  });
  const [ashramForm, setAshramForm] = useState<AshramForm>(createEmptyAshramForm());
  const [gallery, setGallery] = useState<unknown[]>([]);
  const [galleryInput, setGalleryInput] = useState("");
  const [programModalOpen, setProgramModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null);
  const [programForm, setProgramForm] = useState<ProgramForm>(createEmptyProgramForm());
  const [refreshing, setRefreshing] = useState(false);

  const formInput =
    "w-full rounded-xl border border-orange-900/10 bg-white px-3.5 py-3 text-sm text-stone-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:bg-stone-100";
  const readOnlyInput =
    "w-full rounded-xl border border-orange-900/10 bg-stone-50 px-3.5 py-3 text-sm text-stone-600 outline-none";

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dd_ashram_manager_notification_prefs");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setNotificationPrefs({
        whatsapp: typeof parsed.whatsapp === "boolean" ? parsed.whatsapp : true,
        email: typeof parsed.email === "boolean" ? parsed.email : true,
        updates: typeof parsed.updates === "boolean" ? parsed.updates : true,
      });
    } catch {
      // Keep defaults when local storage is unavailable or malformed.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("dd_ashram_manager_notification_prefs", JSON.stringify(notificationPrefs));
    } catch {
      // Ignore localStorage failures; backend notifications remain authoritative.
    }
  }, [notificationPrefs]);

  /* ---------------------------------------------------------------------- */
  /* Role guard                                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!user) return;

    const role = String(user.role ?? "");
    if (role === "ashram_manager") return;

    const paths: Record<string, string> = {
      visitor: "/dashboard",
      pandit: "/pandit/dashboard",
      temple_manager: "/temple/dashboard",
      ashram_manager: "/ashram/dashboard",
      sales: "/sales/dashboard",
      super_admin: "/admin",
    };

    navigate(paths[role] ?? "/", { replace: true });
  }, [navigate, user]);

  /* ---------------------------------------------------------------------- */
  /* Workspace                                                               */
  /* ---------------------------------------------------------------------- */

  const loadWorkspace = useCallback(async () => {
    setLoading((current) => ({ ...current, workspace: true }));
    setPageError(null);

    try {
      const response = await apiRequest<WorkspaceResponse>(
        "/api/ashrams/manager/ashrams",
      );
      const items = response.ashrams ?? [];
      setWorkspace(items);

      setSelectedAshramId((current) => {
        if (current && items.some((item) => Number(item.id) === current)) return current;
        return items[0]?.id ? Number(items[0].id) : null;
      });
    } catch (error) {
      setWorkspace([]);
      setSelectedAshramId(null);
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to load your assigned Ashram workspace.",
      );
    } finally {
      setLoading((current) => ({ ...current, workspace: false }));
    }
  }, []);

  useEffect(() => {
    if (String(user?.role ?? "") === "ashram_manager") {
      void loadWorkspace();
    }
  }, [loadWorkspace, user?.role]);

  /* ---------------------------------------------------------------------- */
  /* Dashboard                                                               */
  /* ---------------------------------------------------------------------- */

  const loadDashboard = useCallback(async (ashramId: number) => {
    setLoading((current) => ({ ...current, dashboard: true }));
    setPageError(null);

    try {
      const response = await apiRequest<DashboardResponse>(
        `/api/ashrams/${ashramId}/dashboard`,
      );

      setAshram(response.ashram);
      setSubscription(response.subscription ?? null);
      setPlans(response.plans ?? []);
      setCounts(response.counts ?? {});
      setManagerAssignments({
        active: response.managerAssignments?.active ?? [],
        history: response.managerAssignments?.history ?? [],
      });
      setAshramForm(createEmptyAshramForm(response.ashram));
      setGallery(response.ashram.gallery ?? []);

      const responsePrograms = Array.isArray(response.ashram.programs)
        ? response.ashram.programs
        : [];
      if (responsePrograms.length > 0) {
        setPrograms(
          responsePrograms.filter((item): item is AshramProgram =>
            Boolean(item && typeof item === "object" && "id" in item),
          ),
        );
      } else {
        const programResponse = await apiRequest<{ programs?: AshramProgram[] }>(
          `/api/ashrams/${ashramId}/programs`,
        );
        setPrograms(programResponse.programs ?? []);
      }
    } catch (error) {
      setAshram(null);
      setSubscription(null);
      setPlans([]);
      setPrograms([]);
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to load the assigned Ashram dashboard.",
      );
    } finally {
      setLoading((current) => ({ ...current, dashboard: false }));
    }
  }, []);

  useEffect(() => {
    if (selectedAshramId) {
      void loadDashboard(selectedAshramId);
    }
  }, [loadDashboard, selectedAshramId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadWorkspace();
      if (selectedAshramId) await loadDashboard(selectedAshramId);
      toast("success", "Ashram dashboard refreshed.");
    } catch {
      // Individual loaders surface their own error state.
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, loadWorkspace, selectedAshramId]);

  /* ---------------------------------------------------------------------- */
  /* Derived state                                                           */
  /* ---------------------------------------------------------------------- */

  const activeSubscription = subscription?.status === "active" ? subscription : null;
  const programLimit = number(activeSubscription?.programLimit);
  const galleryLimit = number(activeSubscription?.galleryLimit);
  const videoLimit = number(activeSubscription?.videoLimit);
  const leadLimit = number(activeSubscription?.leadLimit);
  const leadsUsed = number(activeSubscription?.leadsUsed);
  const leadsRemaining = number(activeSubscription?.leadsRemaining ?? Math.max(0, leadLimit - leadsUsed));
  const activePrograms = useMemo(() => programs.filter((program) => bool(program.isActive)), [programs]);
  const programCount = activePrograms.length;
  const galleryCount = gallery.length;
  const videosFeature = videoLimit > 0;
  const profilePercent = profileCompletion(ashram);
  const subscriptionDays = daysRemaining(activeSubscription?.expiresAt);
  const currentAssignment = managerAssignments.active[0] ?? null;
  const managerRecord = currentAssignment?.manager as JsonObject | undefined;
  const managerVerification = text(
    managerRecord?.verificationStatus ||
      currentAssignment?.managerVerificationStatus ||
      currentAssignment?.verificationStatus,
  );
  const programCapacityUsed = number(
    counts?.totalProgramsAndCourses ??
      programCount + number(counts?.linkedCourses),
  );

  const canManagePrograms = Boolean(
    activeSubscription &&
      programLimit > 0,
  );

  const canManageGallery = Boolean(
    activeSubscription &&
      galleryLimit > 0,
  );

  const canAddProgram =
    canManagePrograms &&
    programCapacityUsed < programLimit;
  const canAddGallery = canManageGallery && galleryCount < galleryLimit;

  const locationLabel = [ashram?.city, ashram?.district, ashram?.state]
    .filter(Boolean)
    .join(", ");

  const activeLeads = number(counts?.leads?.open);
  const convertedLeads = number(counts?.leads?.converted);
  const followUpLeads = number(counts?.leads?.followUps);
  const totalLeads = number(counts?.leads?.total);
  const totalBookings = number(counts?.bookings?.total);
  const completedBookings = number(counts?.bookings?.completed);
  const paidAmount = number(counts?.bookings?.paidAmount);

  /* ---------------------------------------------------------------------- */
  /* Profile update                                                          */
  /* ---------------------------------------------------------------------- */

  const saveAshram = useCallback(async () => {
    if (!selectedAshramId) return;

    const name = ashramForm.name.trim();
    if (name.length < 2) {
      toast("warning", "Ashram name must contain at least 2 characters.");
      return;
    }

    let timings: Record<string, unknown> = {};
    if (ashramForm.timingsJson.trim()) {
      try {
        const parsed = JSON.parse(ashramForm.timingsJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast("warning", "Timings must be a valid JSON object.");
          return;
        }
        timings = parsed as Record<string, unknown>;
      } catch {
        toast("warning", "Please correct the Timings JSON before saving.");
        return;
      }
    }

    for (const [label, value] of [
      ["Primary image", ashramForm.image],
      ["Map URL", ashramForm.mapUrl],
      ["Website URL", ashramForm.websiteUrl],
    ] as Array<[string, string]>) {
      if (!safeUrl(value)) {
        toast(
          "warning",
          `${label} must be a valid HTTP(S) URL or safe relative path.`,
        );
        return;
      }
    }

    const contactEmail =
      ashramForm.contactEmail.trim();

    if (
      contactEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        contactEmail,
      )
    ) {
      toast(
        "warning",
        "Please enter a valid Ashram contact email.",
      );
      return;
    }

    const latitude = ashramForm.latitude.trim() === "" ? null : Number(ashramForm.latitude);
    const longitude = ashramForm.longitude.trim() === "" ? null : Number(ashramForm.longitude);

    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      toast("warning", "Latitude must be between -90 and 90.");
      return;
    }
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      toast("warning", "Longitude must be between -180 and 180.");
      return;
    }

    setLoading((current) => ({ ...current, savingAshram: true }));

    try {
      const response = await apiRequest<{ ashram?: AshramRecord }>(
        `/api/ashrams/${selectedAshramId}`,
        {
          method: "PATCH",
          body: {
            name,
            shortName: ashramForm.shortName.trim() || undefined,
            founder: ashramForm.founder.trim() || undefined,
            spiritualHead: ashramForm.spiritualHead.trim() || undefined,
            tradition: ashramForm.tradition.trim() || undefined,
            founded: ashramForm.founded.trim() || undefined,
            summary: ashramForm.summary.trim() || undefined,
            description: ashramForm.description.trim() || undefined,
            history: ashramForm.history.trim() || undefined,
            stay: ashramForm.stay.trim() || undefined,
            food: ashramForm.food.trim() || undefined,
            contactNote: ashramForm.contactNote.trim() || undefined,
            image: ashramForm.image.trim() || undefined,
            address: ashramForm.address.trim() || undefined,
            mapUrl: ashramForm.mapUrl.trim() || undefined,
            latitude,
            longitude,
            contactPhone: ashramForm.contactPhone.trim() || undefined,
            contactEmail: ashramForm.contactEmail.trim() || undefined,
            websiteUrl: ashramForm.websiteUrl.trim() || undefined,
            activities: csvToArray(ashramForm.activities),
            facilities: csvToArray(ashramForm.facilities),
            timings,
            stayAvailable: ashramForm.stayAvailable,
            retreatAvailable: ashramForm.retreatAvailable,
            bookingEnabled: ashramForm.bookingEnabled,
          },
        },
      );

      if (response.ashram) {
        setAshram(response.ashram);
        setAshramForm(createEmptyAshramForm(response.ashram));
        setGallery(response.ashram.gallery ?? gallery);
      } else {
        await loadDashboard(selectedAshramId);
      }

      try {
        await refreshUser();
      } catch (error) {
        console.warn("Unable to refresh user after Ashram update:", error);
      }

      await showSuccess(
        "Ashram profile saved",
        "Your assigned Ashram information has been updated successfully. Moderation and public visibility remain controlled by the DivyaDhara business rules.",
      );
    } catch (error) {
      await showError(
        "Ashram update blocked",
        error instanceof Error ? error.message : "Unable to save Ashram information.",
      );
    } finally {
      setLoading((current) => ({ ...current, savingAshram: false }));
    }
  }, [ashramForm, gallery, loadDashboard, refreshUser, selectedAshramId]);

  /* ---------------------------------------------------------------------- */
  /* Gallery                                                                 */
  /* ---------------------------------------------------------------------- */

  const saveGallery = useCallback(async () => {
    if (!selectedAshramId) return;
    if (!activeSubscription) {
      await showWarning(
        "Active subscription required",
        "Gallery capacity is controlled by the active Ashram plan.",
      );
      return;
    }

    if (gallery.length > galleryLimit) {
      await showWarning(
        "Gallery limit exceeded",
        `Your current plan allows ${galleryLimit} gallery item${galleryLimit === 1 ? "" : "s"}.`,
      );
      return;
    }

    setLoading((current) => ({ ...current, savingGallery: true }));
    try {
      const response = await apiRequest<{ ashram?: AshramRecord }>(
        `/api/ashrams/${selectedAshramId}`,
        {
          method: "PATCH",
          body: { gallery },
        },
      );

      if (response.ashram) {
        setAshram(response.ashram);
        setGallery(response.ashram.gallery ?? []);
      }

      await showSuccess(
        "Gallery saved",
        "Your Ashram gallery has been updated within the current plan entitlement.",
      );
    } catch (error) {
      await showError(
        "Gallery update blocked",
        error instanceof Error ? error.message : "Unable to save gallery.",
      );
    } finally {
      setLoading((current) => ({ ...current, savingGallery: false }));
    }
  }, [activeSubscription, gallery, galleryLimit, selectedAshramId]);

  const addGalleryUrl = useCallback(() => {
    const value = galleryInput.trim();
    if (!value) return;

    if (!safeUrl(value)) {
      toast("warning", "Use an HTTPS/HTTP image URL or a site-relative path.");
      return;
    }

    if (!canAddGallery) {
      toast(
        "warning",
        activeSubscription
          ? `Your ${activeSubscription.planName || "current"} plan has reached its gallery limit.`
          : "An active Ashram subscription is required for gallery capacity.",
      );
      return;
    }

    setGallery((current) => [...current, value]);
    setGalleryInput("");
  }, [activeSubscription, canAddGallery, galleryInput]);

  /* ---------------------------------------------------------------------- */
  /* Programs CRUD                                                           */
  /* ---------------------------------------------------------------------- */

  const closeProgramModal = useCallback(() => {
    setProgramModalOpen(false);
    setEditingProgramId(null);
    setProgramForm(createEmptyProgramForm());
  }, []);

  const openCreateProgram = useCallback(() => {
    if (!canAddProgram) {
      toast(
        "warning",
        activeSubscription
          ? `Your current Ashram plan allows up to ${programLimit} programs/courses.`
          : "An active Ashram subscription is required before programs can be managed.",
      );
      return;
    }
    setEditingProgramId(null);
    setProgramForm(createEmptyProgramForm());
    setProgramModalOpen(true);
  }, [activeSubscription, canAddProgram, programLimit]);

  const openEditProgram = useCallback((program: AshramProgram) => {
    setEditingProgramId(program.id);
    setProgramForm({
      title: text(program.title),
      description: text(program.description),
      programType: text(program.programType),
      durationText: text(program.durationText),
      priceAmount: program.priceAmount == null ? "" : String(program.priceAmount),
      currency: text(program.currency || "INR").toUpperCase(),
      image: text(program.image),
      startDate: text(program.startDate),
      endDate: text(program.endDate),
      isActive: bool(program.isActive),
      sortOrder: String(number(program.sortOrder)),
    });
    setProgramModalOpen(true);
  }, []);

  const saveProgram = useCallback(async () => {
    if (!selectedAshramId) return;

    const title = programForm.title.trim();
    if (title.length < 2) {
      toast("warning", "Program title must contain at least 2 characters.");
      return;
    }

    const price = programForm.priceAmount.trim() === "" ? null : Number(programForm.priceAmount);
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1000000000)) {
      toast("warning", "Please enter a valid non-negative program price.");
      return;
    }

    const sortOrder = programForm.sortOrder.trim() === "" ? 0 : Number(programForm.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
      toast("warning", "Sort order must be a whole number between 0 and 100000.");
      return;
    }

    if (
      !editingProgramId &&
      !canAddProgram
    ) {
      await showWarning(
        "Program capacity unavailable",
        activeSubscription
          ? `Your current plan allows ${programLimit} combined programs/courses and the available capacity has been reached.`
          : "An active Ashram subscription is required before creating a program.",
      );
      return;
    }

    if (!safeUrl(programForm.image)) {
      toast(
        "warning",
        "Program image must be a valid HTTP(S) URL or safe relative path.",
      );
      return;
    }

    const payload = {
      title,
      description: programForm.description.trim() || undefined,
      programType: programForm.programType.trim() || undefined,
      durationText: programForm.durationText.trim() || undefined,
      priceAmount: price,
      currency: programForm.currency.trim().toUpperCase() || "INR",
      image: programForm.image.trim() || undefined,
      startDate: programForm.startDate.trim() || undefined,
      endDate: programForm.endDate.trim() || undefined,
      isActive: programForm.isActive,
      sortOrder,
    };

    setLoading((current) => ({ ...current, savingProgram: true }));

    try {
      if (editingProgramId) {
        const response = await apiRequest<{ program?: AshramProgram }>(
          `/api/ashrams/${selectedAshramId}/programs/${editingProgramId}`,
          { method: "PATCH", body: payload },
        );
        if (response.program) {
          setPrograms((current) =>
            current.map((item) =>
              item.id === response.program?.id ? response.program : item,
            ),
          );
        }
        await showSuccess("Program updated", "The Ashram program has been updated successfully.");
      } else {
        const response = await apiRequest<{ program?: AshramProgram }>(
          `/api/ashrams/${selectedAshramId}/programs`,
          { method: "POST", body: payload },
        );
        if (response.program) {
          setPrograms((current) => [...current, response.program as AshramProgram].sort((a, b) => number(a.sortOrder) - number(b.sortOrder) || a.id - b.id));
        }
        await showSuccess("Program created", "Your new Ashram program has been added successfully.");
      }
      closeProgramModal();
      await loadDashboard(selectedAshramId);
    } catch (error) {
      await showError(
        editingProgramId ? "Program update blocked" : "Program creation blocked",
        error instanceof Error ? error.message : "Unable to save Ashram program.",
      );
    } finally {
      setLoading((current) => ({ ...current, savingProgram: false }));
    }
  }, [
    activeSubscription,
    canAddProgram,
    closeProgramModal,
    editingProgramId,
    loadDashboard,
    programForm,
    programLimit,
    selectedAshramId,
  ]);

  const deleteProgram = useCallback(
    async (program: AshramProgram) => {
      const confirmed = await confirmAction(
        "Delete this Ashram program?",
        `${text(program.title) || "This program"} will be permanently removed from the Ashram program list.`,
        "Yes, delete it",
      );
      if (!confirmed || !selectedAshramId) return;

      try {
        await apiRequest(
          `/api/ashrams/${selectedAshramId}/programs/${program.id}`,
          { method: "DELETE" },
        );
        setPrograms((current) => current.filter((item) => item.id !== program.id));
        await showSuccess("Program deleted", "The Ashram program has been removed.");
      } catch (error) {
        await showError(
          "Program deletion blocked",
          error instanceof Error ? error.message : "Unable to delete this program.",
        );
      }
    },
    [selectedAshramId],
  );

  const toggleProgram = useCallback(
    async (program: AshramProgram) => {
      if (!selectedAshramId) return;
      const next = !bool(program.isActive);
      if (next && !canManagePrograms) {
        toast(
          "warning",
          "An active Ashram subscription is required to activate programs.",
        );
        return;
      }

      if (
        next &&
        programCapacityUsed >=
          programLimit
      ) {
        await showWarning(
          "Program capacity reached",
          `Your current plan allows ${programLimit} combined programs/courses.`,
        );
        return;
      }
      try {
        const response = await apiRequest<{ program?: AshramProgram }>(
          `/api/ashrams/${selectedAshramId}/programs/${program.id}`,
          { method: "PATCH", body: { isActive: next } },
        );
        if (response.program) {
          setPrograms((current) => current.map((item) => item.id === program.id ? response.program as AshramProgram : item));
        }
        toast("success", next ? "Program activated." : "Program deactivated.");
      } catch (error) {
        await showError(
          "Program status update blocked",
          error instanceof Error ? error.message : "Unable to update program status.",
        );
      }
    },
    [
      canManagePrograms,
      programCapacityUsed,
      programLimit,
      selectedAshramId,
    ],
  );

  /* ---------------------------------------------------------------------- */
  /* Leads                                                                   */
  /* ---------------------------------------------------------------------- */

  const loadLeads = useCallback(
    async (
      page = 1,
      status = leadStatusFilter,
    ) => {
      if (!selectedAshramId) return;

      setLoading((current) => ({
        ...current,
        leads: true,
      }));

      try {
        const params =
          new URLSearchParams({
            page: String(page),
            limit: "100",
          });

        if (status && status !== "all") {
          params.set(
            "status",
            status,
          );
        }

        const response =
          await apiRequest<LeadListResponse>(
            `/api/ashrams/${selectedAshramId}/leads?${params.toString()}`,
          );

        setLeads(
          response.leads ?? [],
        );

        setLeadPage(
          Number(
            response.pagination?.page ??
              page,
          ),
        );

        setLeadTotal(
          Number(
            response.pagination?.total ??
              0,
          ),
        );

        setLeadTotalPages(
          Math.max(
            1,
            Number(
              response.pagination?.totalPages ??
                1,
            ),
          ),
        );
      } catch (error) {
        if (
          error instanceof AshramApiError &&
          error.status === 403
        ) {
          await showWarning(
            "Lead access unavailable",
            "Your Ashram Manager assignment does not currently have lead-view access.",
          );
        } else {
          await showError(
            "Unable to load Ashram enquiries",
            error instanceof Error
              ? error.message
              : "Please try again.",
          );
        }
      } finally {
        setLoading((current) => ({
          ...current,
          leads: false,
        }));
      }
    },
    [
      leadStatusFilter,
      selectedAshramId,
    ],
  );

  const filteredLeads = useMemo(() => {
    const query =
      leadSearch.trim().toLowerCase();

    if (!query) {
      return leads;
    }

    return leads.filter((lead) =>
      [
        lead.lead_number,
        lead.leadNumber,
        lead.name,
        lead.email,
        lead.phone,
        lead.service_type,
        lead.serviceType,
        lead.puja_type,
        lead.pujaType,
        lead.city,
        lead.source_page,
        lead.sourcePage,
      ].some((value) =>
        text(value)
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [
    leadSearch,
    leads,
  ]);

  const loadAnalytics = useCallback(async () => {
    setLoading((current) => ({ ...current, analytics: true }));
    try {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 29);
      const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
      const params = new URLSearchParams({ from: dateOnly(from), to: dateOnly(to) });
      const response = await apiRequest<AnalyticsOverviewResponse>(
        `/api/analytics/reports/owner/overview?${params.toString()}`,
      );
      setAnalytics(response.totals ?? null);
      setAnalyticsConversions(response.conversions ?? []);
      setAnalyticsRange({
        from: response.range?.from ?? dateOnly(from),
        to: response.range?.to ?? dateOnly(to),
      });
    } catch (error) {
      setAnalytics(null);
      setAnalyticsConversions([]);
      setAnalyticsRange(null);
      if (error instanceof AshramApiError && error.status === 403) {
        setAnalytics(null);
        setAnalyticsConversions([]);
        setAnalyticsRange(null);
        await showWarning(
          "Analytics unavailable",
          "Detailed analytics are not available for this Ashram Manager account or current plan.",
        );
        return;
      }
      await showError(
        "Unable to load detailed analytics",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading((current) => ({ ...current, analytics: false }));
    }
  }, []);

  useEffect(() => {
    if (tab === "leads") {
      setLeadPage(1);
      void loadLeads(1, leadStatusFilter);
    }
  }, [
    leadStatusFilter,
    loadLeads,
    selectedAshramId,
    tab,
  ]);

  useEffect(() => {
    if (tab === "analytics") {
      void loadAnalytics();
    }
  }, [loadAnalytics, tab]);

  /* ---------------------------------------------------------------------- */
  /* Logout                                                                  */
  /* ---------------------------------------------------------------------- */

  const handleLogout = useCallback(async () => {
    const confirmed = await confirmAction(
      "Logout from Ashram dashboard?",
      "Your active browser session will be closed.",
      "Logout",
    );
    if (!confirmed) return;

    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      await showError(
        "Logout failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }, [logout, navigate]);

  /* ---------------------------------------------------------------------- */
  /* Navigation                                                               */
  /* ---------------------------------------------------------------------- */

  const navItems: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "ashram", label: "My Ashram", icon: BookOpen },
    { id: "programs", label: "Programs & Courses", icon: CalendarClock },
    { id: "gallery", label: "Gallery & Media", icon: ImagePlus },
    { id: "leads", label: "Enquiries & Leads", icon: MessageCircle },
    { id: "subscription", label: "Subscription", icon: Crown },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "notifications", label: "Notifications", icon: ShieldCheck },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  const switchTab = useCallback((next: TabId) => {
    setTab(next);
    setMobileNavOpen(false);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Loading / access states                                                 */
  /* ---------------------------------------------------------------------- */

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-orange-900/10 bg-white p-8 text-center shadow-sm">
            <ShieldCheck className="mx-auto text-orange-700" size={40} />
            <h1 className="mt-4 text-2xl font-black">Please sign in to continue</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">Your Ashram Manager dashboard is available only to an authenticated Ashram Manager account.</p>
            <button type="button" onClick={() => navigate("/login", { replace: true })} className="btn-saffron mt-6 rounded-xl px-5 py-3 text-sm font-black text-white">Go to Login</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading.workspace) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-orange-900/10 bg-white p-10 text-center shadow-sm">
            <LoaderCircle className="mx-auto animate-spin text-orange-700" size={32} />
            <h1 className="mt-4 text-2xl font-black text-stone-900">Loading your Ashram workspace</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Checking your active Ashram Manager assignments securely…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (pageError && workspace.length === 0) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-orange-900/10 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto text-amber-600" size={42} />
            <h1 className="mt-4 text-2xl font-black text-stone-900">Ashram assignment not available</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {pageError || "No active Ashram has been assigned to your account yet."}
            </p>
            <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-left text-xs leading-5 text-amber-900">
              Your Ashram Manager account can manage an Ashram only after DivyaDhara administration creates an active assignment. The subscription record alone does not grant management access.
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => void loadWorkspace()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white">
                <RefreshCw size={16} /> Check Again
              </button>
              <button type="button" onClick={() => navigate("/")} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-orange-50">
                Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!ashram || !selectedAshramId) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-orange-900/10 bg-white p-8 text-center shadow-sm">
            <BookOpen className="mx-auto text-orange-700" size={42} />
            <h1 className="mt-4 text-2xl font-black">Your Ashram workspace is ready when assigned</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              No active assignment is currently available for this account.
            </p>
            <button type="button" onClick={() => void loadWorkspace()} className="btn-saffron mt-6 rounded-xl px-5 py-3 text-sm font-black text-white">
              Refresh Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Main UI                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-[#f7f2ea] text-stone-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#2a1a10] text-white shadow-lg">
        <div className="mx-auto flex min-h-16 max-w-[1550px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-white/10 p-2 text-orange-100 md:hidden"
              onClick={() => setMobileNavOpen((current) => !current)}
              aria-label="Open Ashram navigation"
            >
              {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600">
              <BookOpen size={19} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-wide">DivyaDhara</p>
              <p className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-orange-300">Ashram Manager Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {workspace.length > 1 && (
              <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 lg:flex">
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-200">Ashram</span>
                <select
                  value={selectedAshramId}
                  onChange={(event) => setSelectedAshramId(Number(event.target.value))}
                  className="max-w-52 bg-transparent text-sm font-bold outline-none"
                >
                  {workspace.map((item) => (
                    <option key={item.id} value={item.id} className="text-stone-900">
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="rounded-xl border border-white/10 p-2 text-orange-100 hover:bg-white/10"
              title="Refresh dashboard"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
            <div className="hidden min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:block">
              <p className="truncate text-xs font-bold">{user?.name || "Ashram Manager"}</p>
              <p className="truncate text-[10px] text-orange-200/70">{user?.email}</p>
            </div>
            <button type="button" onClick={() => void handleLogout()} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-orange-100 hover:bg-white/10">
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1550px] md:grid-cols-[255px_1fr]">
        <aside className={`border-r border-orange-900/10 bg-[#f2eadf] p-4 md:min-h-[calc(100vh-64px)] md:block ${mobileNavOpen ? "block" : "hidden"}`}>
          {workspace.length > 1 && (
            <div className="mb-4 rounded-2xl border border-orange-900/10 bg-white p-3 lg:hidden">
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-stone-500">Managed Ashram</label>
              <div className="relative">
                <select
                  value={selectedAshramId}
                  onChange={(event) => setSelectedAshramId(Number(event.target.value))}
                  className="w-full appearance-none rounded-xl bg-stone-50 px-3 py-2.5 pr-8 text-sm font-bold outline-none"
                >
                  {workspace.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-500" size={15} />
              </div>
            </div>
          )}

          <div className="rounded-3xl bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-200">Ashram Command Center</p>
            <h2 className="mt-2 text-xl font-black">{ashram.name}</h2>
            <p className="mt-2 flex items-center gap-1 text-xs text-orange-100/80">
              <MapPin size={12} /> {locationLabel || "Location not set"}
            </p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClass(ashram.status)}`}>{prettyStatus(ashram.status)}</span>
              <span className="text-[10px] font-bold text-orange-100/80">Profile {profilePercent}%</span>
            </div>
          </div>

          <nav className="mt-5 space-y-1.5" aria-label="Ashram dashboard">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              const badge = item.id === "leads" ? totalLeads : item.id === "notifications" ? number(counts?.unreadNotifications) : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${active ? "bg-[#2a1a10] text-orange-200 shadow" : "text-stone-700 hover:bg-white"}`}
                >
                  <Icon size={17} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {badge > 0 && <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] text-white">{badge}</span>}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-orange-900/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-stone-600">Profile completeness</span>
              <span className="text-sm font-black text-orange-800">{profilePercent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100">
              <div className="h-full rounded-full bg-orange-600 transition-all" style={{ width: `${profilePercent}%` }} />
            </div>
            {profilePercent < 80 && <p className="mt-2 text-[11px] leading-4 text-stone-500">Complete your public information to make the Ashram listing more useful to visitors.</p>}
          </div>

          <div className="mt-4 rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
            <div className="flex items-start gap-2">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-orange-700" />
              <p className="text-[11px] leading-5 text-orange-900">
                Your dashboard is limited to Ashrams that are actively assigned to this Ashram Manager account.
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-[1250px]">
            {/* ======================================================== */}
            {/* OVERVIEW                                                  */}
            {/* ======================================================== */}
            {tab === "overview" && (
              <section className="space-y-6">
                <div className="rounded-[2rem] bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-6 text-white shadow-lg md:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">Ashram Workspace</p>
                      <h1 className="mt-2 text-3xl font-black md:text-4xl">Namaste 🙏</h1>
                      <h2 className="mt-1 text-xl font-bold text-orange-100">{ashram.name}</h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-orange-100/85">
                        Manage the information visitors discover about your Ashram, keep programs current, monitor enquiry performance and review your subscription capacity.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
                      <button type="button" onClick={() => switchTab("ashram")} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900">
                        <Pencil size={16} /> Edit Ashram
                      </button>
                      <button type="button" onClick={() => switchTab("programs")} className="flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-black text-white">
                        <Plus size={16} /> Add Program
                      </button>
                    </div>
                  </div>
                </div>

                {!activeSubscription ? (
                  <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        <Crown className="mt-0.5 shrink-0 text-amber-700" size={24} />
                        <div>
                          <h2 className="text-lg font-black text-amber-950">Choose an Ashram plan to unlock capacity</h2>
                          <p className="mt-1 text-sm leading-6 text-amber-900/80">
                            Program, gallery and lead capacity are controlled by the current Ashram subscription. Your basic profile can remain available while commercial entitlements are inactive.
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => navigate("/subscriptions")} className="btn-saffron shrink-0 rounded-xl px-5 py-3 text-sm font-black text-white">View Ashram Plans</button>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">Current plan</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-black">{subscription?.planName || "Ashram Plan"}</h2>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800">{prettyStatus(subscription?.status)}</span>
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          {displayCurrency(subscription?.priceAmount, subscription?.currency)} · {prettyStatus(subscription?.billingInterval)} · {number(subscription?.durationDays) || 30} days
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => switchTab("subscription")} className="rounded-xl border border-orange-900/10 px-4 py-2.5 text-xs font-black text-orange-800 hover:bg-orange-50">View Entitlements</button>
                        <button type="button" onClick={() => navigate("/subscriptions")} className="btn-saffron rounded-xl px-4 py-2.5 text-xs font-black text-white">Explore Plans</button>
                      </div>
                    </div>
                  </section>
                )}

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Open Enquiries", activeLeads, "Needs attention", MessageCircle],
                    ["Converted Leads", convertedLeads, "Completed conversions", CheckCircle2],
                    ["Programs", programCount, programLimit > 0 ? `${programCapacityUsed} of ${programLimit} combined` : "Plan not enabled", CalendarClock],
                    ["Gallery", galleryCount, galleryLimit > 0 ? `of ${galleryLimit}` : "Plan not enabled", ImagePlus],
                  ].map(([label, value, sub, Icon]) => {
                    const CardIcon = Icon as LucideIcon;
                    return (
                      <div key={String(label)} className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{String(label)}</p>
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-700"><CardIcon size={17} /></span>
                        </div>
                        <p className="mt-4 text-3xl font-black text-stone-900">{String(value)}</p>
                        <p className="mt-1 text-xs text-stone-500">{String(sub)}</p>
                      </div>
                    );
                  })}
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Business snapshot</p>
                        <h2 className="mt-1 text-xl font-black">Visitor interest & operational activity</h2>
                      </div>
                      <Sparkles size={19} className="text-orange-600" />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <MetricRow label="Total enquiries" value={totalLeads} />
                      <MetricRow label="Follow-ups" value={followUpLeads} />
                      <MetricRow label="Bookings / requests" value={totalBookings} />
                      <MetricRow label="Completed bookings" value={completedBookings} />
                      <MetricRow label="Paid booking value" value={displayCurrency(paidAmount, "INR")} />
                      <MetricRow label="Remaining lead credits" value={activeSubscription ? leadsRemaining : "—"} />
                    </div>
                    <div className="mt-5 rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
                      <p className="text-xs font-bold text-orange-950">Conversion focus</p>
                      <p className="mt-1 text-xs leading-5 text-orange-900/80">
                        Keep programs, public contact information and Ashram details current. Better content can improve visitor confidence, while the subscription controls the commercial capacity for leads and content.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Manager readiness</p>
                    <h2 className="mt-1 text-xl font-black">Assignment & public status</h2>
                    <div className="mt-5 space-y-3">
                      <StatusRow label="Manager assignment" value={currentAssignment ? "Active" : "Not assigned"} ok={Boolean(currentAssignment)} />
                      <StatusRow label="Manager verification" value={managerVerification ? prettyStatus(managerVerification) : "Not available"} ok={managerVerification.toLowerCase() === "verified"} />
                      <StatusRow label="Ashram moderation status" value={prettyStatus(ashram.status)} ok={String(ashram.status).toLowerCase() === "published"} />
                      <StatusRow label="Public listing" value={Number(ashram.listingActive) === 1 ? "Live" : "Hidden"} ok={Number(ashram.listingActive) === 1} />
                      <StatusRow label="Featured entitlement" value={Number(activeSubscription?.featuredListing) === 1 ? "Included" : "Not included"} ok={Number(activeSubscription?.featuredListing) === 1} />
                    </div>
                    <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-xs leading-5 text-stone-600">
                      Public listing state, moderation status and featured visibility are not self-service controls for the Ashram Manager. They remain protected by the backend business workflow.
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Active programs</p>
                      <h2 className="mt-1 text-xl font-black">What visitors can discover</h2>
                    </div>
                    <button type="button" onClick={() => switchTab("programs")} className="rounded-xl border border-orange-900/10 px-4 py-2.5 text-xs font-black text-orange-800 hover:bg-orange-50">Manage Programs</button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {activePrograms.slice(0, 4).map((program) => (
                      <div key={program.id} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-orange-900/5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-black">{text(program.title) || "Untitled program"}</p>
                            <p className="mt-1 text-xs text-stone-500">{text(program.programType) || "Ashram program"} {program.durationText ? `· ${program.durationText}` : ""}</p>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">Active</span>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs leading-5 text-stone-600">{text(program.description) || "No program description added yet."}</p>
                      </div>
                    ))}
                    {activePrograms.length === 0 && (
                      <div className="md:col-span-2 rounded-2xl bg-orange-50 p-6 text-center">
                        <CalendarClock className="mx-auto text-orange-600" size={26} />
                        <p className="mt-2 font-black">No active programs yet</p>
                        <p className="mt-1 text-xs text-stone-500">Add a retreat, spiritual program or other genuine Ashram offering when your plan permits it.</p>
                        <button type="button" onClick={openCreateProgram} className="btn-saffron mt-4 rounded-xl px-4 py-2.5 text-xs font-black text-white">Add First Program</button>
                      </div>
                    )}
                  </div>
                </section>
              </section>
            )}

            {/* ======================================================== */}
            {/* ASHRAM PROFILE                                             */}
            {/* ======================================================== */}
            {tab === "ashram" && (
              <section className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Assigned Ashram · Profile Management</p>
                    <h1 className="mt-1 text-2xl font-black">{ashram.name}</h1>
                    <p className="mt-1 text-sm text-stone-500">Update approved Ashram information without changing moderation, assignment or billing authority.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-black ${statusClass(ashram.status)}`}>{prettyStatus(ashram.status)}</span>
                    {Number(ashram.listingActive) === 1 && <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800"><Eye size={12} className="mr-1 inline" />Public</span>}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 rounded-3xl bg-orange-50 p-5 ring-1 ring-orange-100 md:grid-cols-[auto_1fr]">
                  <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl bg-white text-orange-800 shadow-sm">
                    {ashram.image ? <img src={ashram.image} alt={ashram.name} className="h-full w-full object-cover" /> : <BookOpen size={30} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-800">Public profile preview</p>
                    <h2 className="mt-1 text-xl font-black">{ashram.name}</h2>
                    <p className="mt-1 text-sm text-stone-600">{ashram.summary || "Add a concise summary to explain what makes this Ashram meaningful to visitors."}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span><MapPin size={11} className="mr-1 inline" />{locationLabel || "Location not set"}</span>
                      {ashram.tradition && <span>· {ashram.tradition}</span>}
                    </p>
                  </div>
                </div>

                <div className="mt-7 grid gap-5 lg:grid-cols-2">
                  <Field label="Ashram name" value={ashramForm.name} onChange={(value) => setAshramForm((current) => ({ ...current, name: value }))} inputClass={formInput} />
                  <Field label="Short name" value={ashramForm.shortName} onChange={(value) => setAshramForm((current) => ({ ...current, shortName: value }))} inputClass={formInput} />
                  <Field label="Founder" value={ashramForm.founder} onChange={(value) => setAshramForm((current) => ({ ...current, founder: value }))} inputClass={formInput} />
                  <Field label="Spiritual head" value={ashramForm.spiritualHead} onChange={(value) => setAshramForm((current) => ({ ...current, spiritualHead: value }))} inputClass={formInput} />
                  <Field label="Tradition" value={ashramForm.tradition} onChange={(value) => setAshramForm((current) => ({ ...current, tradition: value }))} inputClass={formInput} />
                  <Field label="Founded" value={ashramForm.founded} onChange={(value) => setAshramForm((current) => ({ ...current, founded: value }))} inputClass={formInput} />
                  <Field label="Primary image URL" value={ashramForm.image} onChange={(value) => setAshramForm((current) => ({ ...current, image: value }))} inputClass={formInput} />
                  <Field label="Website URL" value={ashramForm.websiteUrl} onChange={(value) => setAshramForm((current) => ({ ...current, websiteUrl: value }))} inputClass={formInput} />
                  <Field label="Contact phone" value={ashramForm.contactPhone} onChange={(value) => setAshramForm((current) => ({ ...current, contactPhone: value }))} inputClass={formInput} />
                  <Field label="Contact email" value={ashramForm.contactEmail} onChange={(value) => setAshramForm((current) => ({ ...current, contactEmail: value }))} inputClass={formInput} />
                  <Field label="City" value={ashramForm.city} onChange={() => undefined} inputClass={readOnlyInput} disabled />
                  <Field label="District" value={ashramForm.district} onChange={() => undefined} inputClass={readOnlyInput} disabled />
                  <Field label="State" value={ashramForm.state} onChange={() => undefined} inputClass={readOnlyInput} disabled />
                  <Field label="Country" value={ashramForm.country} onChange={() => undefined} inputClass={readOnlyInput} disabled />
                  <div className="lg:col-span-2 rounded-2xl bg-stone-50 p-4 text-xs leading-5 text-stone-500">Location hierarchy is protected by the backend. City, district, state and country are read-only here; changing location requires the canonical <code className="font-mono">locationId</code> workflow.</div>
                  <Field label="Latitude" value={ashramForm.latitude} onChange={(value) => setAshramForm((current) => ({ ...current, latitude: value }))} inputClass={formInput} />
                  <Field label="Longitude" value={ashramForm.longitude} onChange={(value) => setAshramForm((current) => ({ ...current, longitude: value }))} inputClass={formInput} />
                  <Field label="Map URL" value={ashramForm.mapUrl} onChange={(value) => setAshramForm((current) => ({ ...current, mapUrl: value }))} inputClass={formInput} />
                  <Field label="Address" value={ashramForm.address} onChange={(value) => setAshramForm((current) => ({ ...current, address: value }))} inputClass={formInput} className="lg:col-span-2" />
                  <TextAreaField label="Summary" value={ashramForm.summary} onChange={(value) => setAshramForm((current) => ({ ...current, summary: value }))} rows={3} maxLength={1200} className="lg:col-span-2" />
                  <TextAreaField label="Description" value={ashramForm.description} onChange={(value) => setAshramForm((current) => ({ ...current, description: value }))} rows={6} maxLength={10000} className="lg:col-span-2" />
                  <TextAreaField label="History" value={ashramForm.history} onChange={(value) => setAshramForm((current) => ({ ...current, history: value }))} rows={6} maxLength={10000} className="lg:col-span-2" />
                  <TextAreaField label="Stay information" value={ashramForm.stay} onChange={(value) => setAshramForm((current) => ({ ...current, stay: value }))} rows={4} maxLength={5000} />
                  <TextAreaField label="Food information" value={ashramForm.food} onChange={(value) => setAshramForm((current) => ({ ...current, food: value }))} rows={4} maxLength={5000} />
                  <TextAreaField label="Contact note" value={ashramForm.contactNote} onChange={(value) => setAshramForm((current) => ({ ...current, contactNote: value }))} rows={4} maxLength={5000} />
                  <Field label="Activities · comma separated" value={ashramForm.activities} onChange={(value) => setAshramForm((current) => ({ ...current, activities: value }))} inputClass={formInput} />
                  <Field label="Facilities · comma separated" value={ashramForm.facilities} onChange={(value) => setAshramForm((current) => ({ ...current, facilities: value }))} inputClass={formInput} />
                  <TextAreaField label="Timings JSON" value={ashramForm.timingsJson} onChange={(value) => setAshramForm((current) => ({ ...current, timingsJson: value }))} rows={7} className="lg:col-span-2" />
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <BooleanField label="Stay available" checked={ashramForm.stayAvailable} onChange={(value) => setAshramForm((current) => ({ ...current, stayAvailable: value }))} />
                  <BooleanField label="Retreat available" checked={ashramForm.retreatAvailable} onChange={(value) => setAshramForm((current) => ({ ...current, retreatAvailable: value }))} />
                  <BooleanField label="Booking enabled" checked={ashramForm.bookingEnabled} onChange={(value) => setAshramForm((current) => ({ ...current, bookingEnabled: value }))} />
                </div>

                <div className="mt-7 flex flex-col gap-3 border-t border-orange-900/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs leading-5 text-stone-500">
                    <strong className="text-stone-700">Protected controls:</strong> moderation status, manager assignment, featured state and public listing activation cannot be changed from this dashboard.
                  </div>
                  <button type="button" disabled={loading.savingAshram} onClick={() => void saveAshram()} className="btn-saffron flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:opacity-60">
                    {loading.savingAshram ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                    {loading.savingAshram ? "Saving…" : "Save Ashram Profile"}
                  </button>
                </div>
              </section>
            )}

            {/* ======================================================== */}
            {/* PROGRAMS                                                    */}
            {/* ======================================================== */}
            {tab === "programs" && (
              <section className="space-y-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Programs & Courses</p>
                    <h1 className="mt-1 text-2xl font-black">Ashram programs</h1>
                    <p className="mt-1 text-sm text-stone-500">Manage genuine Ashram offerings such as retreats, learning programs and spiritual activities.</p>
                  </div>
                  <button type="button" disabled={!canAddProgram} onClick={openCreateProgram} className="btn-saffron flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                    <Plus size={17} /> Add Program
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <CapacityCard label="Program capacity" used={programCapacityUsed} limit={programLimit} icon={CalendarClock} />
                  <CapacityCard label="Linked courses" used={number(counts?.linkedCourses)} limit={programLimit} icon={BookOpen} />
                  <CapacityCard label="Combined capacity" used={number(counts?.totalProgramsAndCourses ?? programCount + number(counts?.linkedCourses))} limit={programLimit} icon={Link2} />
                </div>

                {!activeSubscription && (
                  <LockedPlan message="Program management is locked until an active Ashram subscription is available." onAction={() => navigate("/subscriptions")} />
                )}

                {activeSubscription && programLimit === 0 && (
                  <LockedPlan message="Your current Ashram plan does not include program/course capacity." onAction={() => navigate("/subscriptions")} />
                )}

                <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                  {programs.length === 0 ? (
                    <div className="p-10 text-center">
                      <CalendarClock className="mx-auto text-orange-600" size={30} />
                      <h2 className="mt-3 text-lg font-black">No programs yet</h2>
                      <p className="mt-1 text-sm text-stone-500">Create a program when your plan has available capacity.</p>
                      <button type="button" disabled={!canAddProgram} onClick={openCreateProgram} className="btn-saffron mt-5 rounded-xl px-5 py-3 text-sm font-black text-white disabled:opacity-50">Create First Program</button>
                    </div>
                  ) : (
                    <div className="divide-y divide-orange-900/10">
                      {programs.map((program) => (
                        <div key={program.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                          <div className="flex min-w-0 gap-4">
                            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-orange-50 text-orange-700">
                              {program.image ? <img src={program.image} alt={text(program.title)} className="h-full w-full object-cover" /> : <CalendarClock size={19} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-black">{text(program.title) || "Untitled program"}</h2>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${bool(program.isActive) ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>{bool(program.isActive) ? "active" : "inactive"}</span>
                              </div>
                              <p className="mt-1 text-xs text-stone-500">{text(program.programType) || "Ashram program"} {program.durationText ? `· ${program.durationText}` : ""}</p>
                              <p className="mt-2 line-clamp-2 text-sm text-stone-600">{text(program.description) || "No description"}</p>
                              <p className="mt-2 text-xs font-bold text-orange-800">{displayCurrency(program.priceAmount, program.currency)}{program.startDate ? ` · ${dateLabel(program.startDate)}` : ""}{program.endDate ? ` – ${dateLabel(program.endDate)}` : ""}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                            <button type="button" onClick={() => void toggleProgram(program)} className="rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-orange-50">{bool(program.isActive) ? "Deactivate" : "Activate"}</button>
                            <button type="button" onClick={() => openEditProgram(program)} className="rounded-xl border border-orange-900/10 p-2.5 text-orange-700 hover:bg-orange-50" title="Edit program"><Edit3 size={16} /></button>
                            <button type="button" onClick={() => void deleteProgram(program)} className="rounded-xl border border-rose-100 p-2.5 text-rose-700 hover:bg-rose-50" title="Delete program"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-stone-50 p-5">
                  <div className="flex items-start gap-3">
                    <BookOpen size={18} className="mt-0.5 text-orange-700" />
                    <div>
                      <h2 className="font-black">Linked courses</h2>
                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        {number(counts?.linkedCourses)} course{number(counts?.linkedCourses) === 1 ? "" : "s"} are currently associated with this Ashram. Course catalogue creation is managed separately; this dashboard keeps the combined program/course entitlement visible so commercial capacity is not exceeded.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ======================================================== */}
            {/* GALLERY                                                     */}
            {/* ======================================================== */}
            {tab === "gallery" && (
              <section className="space-y-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Gallery & Media</p>
                    <h1 className="mt-1 text-2xl font-black">Ashram gallery</h1>
                    <p className="mt-1 text-sm text-stone-500">Add image URLs and keep the public Ashram media collection current.</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-orange-900/10">
                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Capacity</p>
                    <p className="mt-1 text-lg font-black">{galleryCount} / {galleryLimit || "—"}</p>
                  </div>
                </div>

                {!activeSubscription || galleryLimit === 0 ? (
                  <LockedPlan message="Gallery capacity is controlled by your active Ashram subscription." onAction={() => navigate("/subscriptions")} />
                ) : (
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="relative min-w-0 flex-1">
                        <ImagePlus className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={17} />
                        <input value={galleryInput} onChange={(event) => setGalleryInput(event.target.value)} placeholder="https://example.com/ashram-photo.jpg" className={`${formInput} pl-10`} />
                      </div>
                      <button type="button" onClick={addGalleryUrl} disabled={!canAddGallery} className="btn-saffron flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Plus size={16} /> Add Image</button>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">The backend remains the final authority on gallery entitlement and accepts only the number of items permitted by the active plan.</p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {gallery.map((item, index) => {
                    const url = mediaUrl(item);
                    return (
                      <div key={`${url}-${index}`} className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                        <div className="aspect-[4/3] bg-stone-100">
                          {url ? <img src={url} alt={`${ashram.name} gallery ${index + 1}`} className="h-full w-full object-cover" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <div className="grid h-full place-items-center"><FileImage className="text-stone-300" size={34} /></div>}
                        </div>
                        <div className="p-4">
                          <p className="line-clamp-2 break-all text-xs text-stone-500">{url || "Unsupported gallery item"}</p>
                          <button type="button" onClick={() => setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="mt-3 rounded-lg px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">Remove</button>
                        </div>
                      </div>
                    );
                  })}
                  {gallery.length === 0 && (
                    <div className="sm:col-span-2 lg:col-span-3 rounded-3xl bg-stone-50 p-10 text-center">
                      <ImagePlus className="mx-auto text-orange-500" size={30} />
                      <h2 className="mt-3 font-black">No gallery images yet</h2>
                      <p className="mt-1 text-sm text-stone-500">Add your first genuine Ashram image using the field above.</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-orange-900/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-stone-500">{galleryCount} image{galleryCount === 1 ? "" : "s"} currently staged for saving.</p>
                  <button type="button" onClick={() => void saveGallery()} disabled={loading.savingGallery || !activeSubscription || galleryCount > galleryLimit} className="btn-saffron flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:opacity-50">
                    {loading.savingGallery ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                    {loading.savingGallery ? "Saving…" : "Save Gallery"}
                  </button>
                </div>
              </section>
            )}

            {/* ======================================================== */}
            {/* LEADS                                                        */}
            {/* ======================================================== */}
            {tab === "leads" && (
              <section className="space-y-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Enquiries & Leads</p>
                    <h1 className="mt-1 text-2xl font-black">Manage visitor demand for this Ashram</h1>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
                      This list is restricted by the backend to Ashram leads accessible to your active Manager assignment. Lead ownership, quota consumption and CRM authority stay server-side controlled.
                    </p>
                  </div>
                  <button type="button" onClick={() => void loadLeads(leadPage, leadStatusFilter)} className="rounded-xl border border-orange-900/10 bg-white px-4 py-2.5 text-xs font-black text-orange-800 hover:bg-orange-50">
                    <RefreshCw size={14} className="mr-1.5 inline" /> Refresh Leads
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <LeadCard label="Total enquiries" value={totalLeads} sub="Assigned to this Ashram scope" icon={MessageCircle} />
                  <LeadCard label="Open" value={activeLeads} sub="Needs attention" icon={Clock3} />
                  <LeadCard label="Follow-ups" value={followUpLeads} sub="Follow-up workflow" icon={CalendarClock} />
                  <LeadCard label="Converted" value={convertedLeads} sub="Converted enquiries" icon={CheckCircle2} />
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-[1fr_210px_auto]">
                    <div className="relative">
                      <MessageCircle className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                      <input
                        value={leadSearch}
                        onChange={(event) => setLeadSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void loadLeads(1, leadStatusFilter);
                        }}
                        placeholder="Filter loaded leads by name, phone, email, service or lead number…"
                        className={`${formInput} pl-9`}
                      />
                    </div>
                    <select
                      value={leadStatusFilter}
                      onChange={(event) => setLeadStatusFilter(event.target.value)}
                      className={formInput}
                    >
                      <option value="all">All statuses</option>
                      <option value="new">New</option>
                      <option value="qualified">Qualified</option>
                      <option value="assigned">Assigned</option>
                      <option value="contacted">Contacted</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="converted">Converted</option>
                      <option value="closed">Closed</option>
                      <option value="lost">Lost</option>
                    </select>
                    <button type="button" onClick={() => void loadLeads(1, leadStatusFilter)} className="btn-saffron rounded-xl px-5 py-3 text-sm font-black text-white">Search</button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                  {loading.leads ? (
                    <div className="p-10 text-center"><LoaderCircle className="mx-auto animate-spin text-orange-700" size={28} /><p className="mt-3 text-sm font-bold text-stone-700">Loading Ashram enquiries…</p></div>
                  ) : filteredLeads.length === 0 ? (
                    <div className="p-10 text-center">
                      <MessageCircle className="mx-auto text-stone-300" size={32} />
                      <h2 className="mt-3 text-lg font-black">No enquiries found</h2>
                      <p className="mt-1 text-sm text-stone-500">New verified visitor enquiries will appear here when they are associated with this Ashram.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-orange-900/10">
                      {filteredLeads.map((lead) => {
                        const leadNumber = text(lead.lead_number ?? lead.leadNumber) || `#${lead.id}`;
                        const leadName = text(lead.name) || "Visitor";
                        const contact = text(lead.phone) || text(lead.email) || "Contact details protected";
                        const service = text(lead.puja_type ?? lead.pujaType) || text(lead.service_type ?? lead.serviceType) || "Ashram enquiry";
                        const created = text(lead.created_at ?? lead.createdAt);
                        return (
                          <div key={lead.id} className="p-5 transition hover:bg-orange-50/40">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase text-orange-900">{leadNumber}</span>
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass(lead.status)}`}>{prettyStatus(lead.status)}</span>
                                  {lead.priority && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black uppercase text-stone-600">{prettyStatus(lead.priority)} priority</span>}
                                  {lead.lead_temperature && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">{prettyStatus(lead.lead_temperature)}</span>}
                                </div>
                                <h2 className="mt-2 text-base font-black text-stone-900">{leadName}</h2>
                                <p className="mt-1 text-sm text-stone-600">{service}</p>
                                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                                  <span>{contact}</span>
                                  {created && <span>Received {dateLabel(created)}</span>}
                                  {(lead.source_page ?? lead.sourcePage) && <span>Source: {text(lead.source_page ?? lead.sourcePage)}</span>}
                                </p>
                              </div>
                              <div className="rounded-2xl bg-stone-50 p-4 text-xs leading-5 text-stone-600 xl:max-w-sm">
                                <div className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-orange-700" /><span>Lead visibility is Ashram-assignment scoped. Status changes and CRM actions are intentionally kept behind server-side permissions.</span></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-stone-500">Showing {filteredLeads.length} of {leadTotal} entr{leadTotal === 1 ? "y" : "ies"} in the current filtered scope.</p>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={leadPage <= 1 || loading.leads} onClick={() => void loadLeads(leadPage - 1, leadStatusFilter)} className="rounded-xl border border-orange-900/10 bg-white px-4 py-2 text-xs font-black text-stone-700 disabled:opacity-40">Previous</button>
                    <span className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-black text-stone-700">Page {leadPage} / {leadTotalPages}</span>
                    <button type="button" disabled={leadPage >= leadTotalPages || loading.leads} onClick={() => void loadLeads(leadPage + 1, leadStatusFilter)} className="rounded-xl border border-orange-900/10 bg-white px-4 py-2 text-xs font-black text-stone-700 disabled:opacity-40">Next</button>
                  </div>
                </div>

                {activeSubscription && (
                  <div className="rounded-3xl border border-orange-900/10 bg-stone-50 p-5">
                    <div className="flex items-start gap-3">
                      <Crown size={18} className="mt-0.5 shrink-0 text-orange-700" />
                      <div className="min-w-0">
                        <h2 className="font-black">Lead capacity</h2>
                        <p className="mt-1 text-sm text-stone-600">{leadsUsed} of {leadLimit} lead credits have been used in the current subscription snapshot, with {leadsRemaining} remaining. Credits are consumed only by the backend assignment workflow.</p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-orange-600" style={{ width: leadLimit > 0 ? `${Math.min(100, (leadsUsed / leadLimit) * 100)}%` : "0%" }} /></div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ======================================================== */}
            {/* SUBSCRIPTION                                                 */}
            {/* ======================================================== */}
            {tab === "subscription" && (
              <section className="space-y-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Commercial Account</p>
                    <h1 className="mt-1 text-2xl font-black">Ashram subscription</h1>
                    <p className="mt-1 text-sm text-stone-500">Pricing and entitlements are read from the backend catalogue; the frontend never becomes the payment authority.</p>
                  </div>
                  <button type="button" onClick={() => navigate("/subscriptions")} className="btn-saffron rounded-xl px-5 py-3 text-sm font-black text-white">Open Subscription Plans</button>
                </div>

                {activeSubscription ? (
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase text-orange-900">Current</span>
                          <h2 className="text-2xl font-black">{activeSubscription.planName || activeSubscription.planCode || "Ashram Plan"}</h2>
                        </div>
                        <p className="mt-2 text-sm text-stone-600">{activeSubscription.planDescription || "Your active Ashram commercial entitlement."}</p>
                        <p className="mt-2 text-sm font-bold text-orange-800">{displayCurrency(activeSubscription.priceAmount, activeSubscription.currency)} · {prettyStatus(activeSubscription.billingInterval)} · {number(activeSubscription.durationDays) || 30} days</p>
                      </div>
                      <div className="rounded-2xl bg-orange-50 p-5 text-center ring-1 ring-orange-100">
                        <p className="text-[10px] font-black uppercase tracking-wider text-orange-800">Renewal / expiry</p>
                        <p className="mt-1 text-xl font-black">{activeSubscription.expiresAt ? dateLabel(activeSubscription.expiresAt) : "Not available"}</p>
                        <p className="mt-1 text-xs text-stone-500">{subscriptionDays === null ? "" : `${subscriptionDays} day${subscriptionDays === 1 ? "" : "s"} remaining`}</p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <EntitlementCard label="Leads" value={`${leadsUsed} / ${leadLimit}`} progress={leadLimit ? (leadsUsed / leadLimit) * 100 : 0} />
                      <EntitlementCard label="Programs/Courses" value={`${programCount} / ${programLimit || 0}`} progress={programLimit ? (programCount / programLimit) * 100 : 0} />
                      <EntitlementCard label="Gallery" value={`${galleryCount} / ${galleryLimit || 0}`} progress={galleryLimit ? (galleryCount / galleryLimit) * 100 : 0} />
                      <EntitlementCard label="Videos" value={videoLimit > 0 ? `Up to ${videoLimit}` : "Not included"} progress={0} />
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <FeaturePill label="Enhanced SEO" enabled={Number(activeSubscription.enhancedSeo) === 1} />
                      <FeaturePill label="Enhanced profile" enabled={Number(activeSubscription.enhancedProfile) === 1} />
                      <FeaturePill label="Featured listing" enabled={Number(activeSubscription.featuredListing) === 1} />
                      <FeaturePill label="Homepage promotion" enabled={Number(activeSubscription.homepagePromotion) === 1} />
                      <FeaturePill label="Priority support" enabled={Number(activeSubscription.prioritySupport) === 1} />
                      <FeaturePill label="WhatsApp enquiry" enabled={Number(activeSubscription.whatsappEnquiry) === 1} />
                      <FeaturePill label="Verification badge" enabled={Number(activeSubscription.verificationBadge) === 1} />
                      <FeaturePill label="Analytics" enabled={Number(activeSubscription.analyticsAccess) === 1} />
                    </div>

                    {Number(activeSubscription.autoRenew) === 1 && (
                      <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-xs leading-5 text-stone-600">
                        Auto-renew is recorded as a subscription preference. Provider-side renewal synchronization is handled by the payment/subscription workflow, not by this dashboard toggle.
                      </div>
                    )}
                  </div>
                ) : (
                  <LockedPlan message="There is no currently active Ashram subscription for this assigned entity." onAction={() => navigate("/subscriptions")} />
                )}

                <div className="grid gap-5 lg:grid-cols-2">
                  {plans.map((plan) => {
                    const planName = text(plan.name || plan.code) || "Ashram Plan";
                    const features = Array.isArray(plan.features)
                      ? plan.features.map(text).filter(Boolean)
                      : [];
                    return (
                      <div key={plan.id} className={`rounded-3xl border bg-white p-6 shadow-sm ${planName.toLowerCase() === "premium" ? "border-orange-300 ring-2 ring-orange-100" : "border-orange-900/10"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Ashram catalogue</p>
                            <h2 className="mt-1 text-xl font-black">{planName}</h2>
                          </div>
                          {planName.toLowerCase() === "premium" && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black text-orange-900">Growth</span>}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-stone-500">{text(plan.description)}</p>
                        <p className="mt-4 text-2xl font-black">{displayCurrency(number(plan.priceAmount), text(plan.currency || "INR"))}<span className="ml-1 text-xs font-medium text-stone-500">/ {prettyStatus(text(plan.billingInterval) || "monthly")}</span></p>
                        <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                          <QuotaMini label="Leads" value={number(plan.leadLimit)} />
                          <QuotaMini label="Programs" value={number(plan.programLimit)} />
                          <QuotaMini label="Gallery" value={number(plan.galleryLimit)} />
                          <QuotaMini label="Videos" value={number(plan.videoLimit)} />
                          <QuotaMini label="Analytics" value={text(plan.analyticsLevel || "none")} />
                          <QuotaMini label="Search" value={text(plan.searchVisibility || "standard")} />
                        </div>
                        {features.length > 0 && <ul className="mt-5 space-y-2">{features.slice(0, 8).map((feature) => <li key={feature} className="flex items-start gap-2 text-xs text-stone-600"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />{feature}</li>)}</ul>}
                        <button type="button" onClick={() => navigate("/subscriptions")} className="mt-6 w-full rounded-xl border border-orange-900/10 px-4 py-3 text-sm font-black text-orange-800 hover:bg-orange-50">Open Subscription Centre</button>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-stone-50 p-5 text-xs leading-5 text-stone-600">
                  Annual/yearly commercial pricing is not displayed here because the current canonical catalogue is monthly INR / 30-day. Any payment action must re-resolve the authoritative plan/price variant on the backend.
                </div>
              </section>
            )}

            {/* ======================================================== */}
            {/* ANALYTICS                                                   */}
            {/* ======================================================== */}
            {tab === "analytics" && (
              <section className="space-y-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Performance</p>
                    <h1 className="mt-1 text-2xl font-black">Ashram analytics</h1>
                    <p className="mt-1 text-sm text-stone-500">Detailed reporting is loaded from the owner-scoped analytics service for this Manager account and is never calculated from frontend guesses.</p>
                  </div>
                  <button type="button" onClick={() => void loadAnalytics()} disabled={loading.analytics} className="rounded-xl border border-orange-900/10 bg-white px-4 py-2.5 text-xs font-black text-orange-800 hover:bg-orange-50 disabled:opacity-50">
                    {loading.analytics ? <LoaderCircle size={14} className="mr-1.5 inline animate-spin" /> : <RefreshCw size={14} className="mr-1.5 inline" />} Refresh Analytics
                  </button>
                </div>

                {!Number(activeSubscription?.analyticsAccess) ? (
                  <LockedPlan message="Detailed analytics are not included in the current Ashram subscription snapshot. The operational counters on Overview remain available." onAction={() => navigate("/subscriptions")} />
                ) : (
                  <>
                    {loading.analytics && !analytics ? (
                      <div className="rounded-3xl border border-orange-900/10 bg-white p-10 text-center shadow-sm"><LoaderCircle className="mx-auto animate-spin text-orange-700" size={30} /><p className="mt-3 text-sm font-bold">Loading analytics…</p></div>
                    ) : (
                      <>
                        <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">Reporting window</p><p className="mt-1 text-sm font-black">{analyticsRange ? `${dateLabel(analyticsRange.from)} → ${dateLabel(analyticsRange.to)}` : "Last 30 days"}</p></div>
                            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">{prettyStatus(activeSubscription?.analyticsLevel ?? "none")} analytics</span>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <AnalyticsCard label="Page views" value={number(analytics?.pageViews)} sub="Real visitor page views" icon={Eye} />
                          <AnalyticsCard label="Unique visitors" value={number(analytics?.uniqueVisitors)} sub="Distinct tracked visitors" icon={UserIcon} />
                          <AnalyticsCard label="Sessions" value={number(analytics?.sessions)} sub="Tracked sessions" icon={Clock3} />
                          <AnalyticsCard label="Events" value={number(analytics?.events)} sub="Tracked interactions" icon={Sparkles} />
                          <AnalyticsCard label="Leads" value={number(analytics?.leads)} sub="Attributed owner-scope leads" icon={MessageCircle} />
                          <AnalyticsCard label="Converted leads" value={number(analytics?.convertedLeads)} sub="Lead conversions" icon={CheckCircle2} />
                          <AnalyticsCard label="Bookings" value={number(analytics?.bookings)} sub="Owner-scope bookings" icon={CalendarClock} />
                          <AnalyticsCard label="Avg. page duration" value={`${Math.round(number(analytics?.avgPageDurationSeconds))}s`} sub="Average tracked duration" icon={Clock3} />
                        </div>

                        <div className="grid gap-5 lg:grid-cols-[1fr_.75fr]">
                          <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Conversion mix</p>
                            <h2 className="mt-1 text-xl font-black">What visitors are doing</h2>
                            <div className="mt-5 space-y-3">
                              {analyticsConversions.length === 0 ? (
                                <div className="rounded-2xl bg-stone-50 p-5 text-center text-sm text-stone-500">No attributed conversions in the selected window.</div>
                              ) : analyticsConversions.map((item) => (
                                <div key={text(item.conversion_type)} className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 px-4 py-3">
                                  <div><p className="text-sm font-black">{prettyStatus(item.conversion_type)}</p><p className="text-[11px] text-stone-500">{number(item.unique_visitors)} unique visitors</p></div>
                                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-900">{number(item.count)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Commercial snapshot</p>
                            <h2 className="mt-1 text-xl font-black">Revenue & demand</h2>
                            <div className="mt-5 space-y-3">
                              <MetricRow label="Booking value" value={displayCurrency(number(analytics?.bookingValue), "INR")} />
                              <MetricRow label="Collected payments" value={displayCurrency(number(analytics?.collectedRevenue), "INR")} />
                              <MetricRow label="Refunds" value={displayCurrency(number(analytics?.refunds), "INR")} />
                              <MetricRow label="Lead conversion rate" value={number(analytics?.leads) > 0 ? `${Math.round((number(analytics?.convertedLeads) / number(analytics?.leads)) * 100)}%` : "0%"} />
                            </div>
                            <p className="mt-4 text-[11px] leading-5 text-stone-500">Payment and booking values shown here are reporting data returned by the owner-scoped analytics service; they do not change subscription or payment authority.</p>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                <div className="rounded-3xl border border-orange-900/10 bg-stone-50 p-5 text-xs leading-5 text-stone-600">
                  Analytics access remains tied to the active Ashram entitlement. The detailed endpoint enforces the authenticated owner scope for the Manager account. A Manager can only receive analytics for Ashrams included in the server-authorized assignment scope.
                </div>
              </section>
            )}

            {/* ======================================================== */}
            {/* NOTIFICATIONS                                               */}
            {/* ======================================================== */}
            {tab === "notifications" && (
              <section className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Updates</p>
                    <h1 className="mt-1 text-2xl font-black">Notifications</h1>
                    <p className="mt-1 text-sm text-stone-500">Account, assignment, lead and system notifications available to your current session.</p>
                  </div>
                  {number(counts?.unreadNotifications) > 0 && <span className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-black text-orange-900">{number(counts?.unreadNotifications)} unread</span>}
                </div>

                {(notifications?.length ?? 0) === 0 ? (
                  <div className="mt-7 rounded-3xl bg-stone-50 p-10 text-center">
                    <ShieldCheck className="mx-auto text-stone-300" size={30} />
                    <h2 className="mt-3 font-black">You are all caught up</h2>
                    <p className="mt-1 text-sm text-stone-500">New DivyaDhara notifications will appear here.</p>
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    {notifications.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-orange-900/10 bg-stone-50 p-4">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600"><ShieldCheck size={17} /></span>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-stone-800">DivyaDhara update</p>
                          <p className="mt-1 text-sm leading-6 text-stone-600">{item.text}</p>
                          <p className="mt-1 text-[11px] text-stone-400">{item.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ======================================================== */}
            {/* SETTINGS                                                    */}
            {/* ======================================================== */}
            {tab === "settings" && (
              <section className="space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Account preferences</p>
                  <h1 className="mt-1 text-2xl font-black">Settings</h1>
                  <p className="mt-1 text-sm text-stone-500">Manage local notification preferences and review the controls that remain protected by DivyaDhara business permissions.</p>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={19} className="mt-0.5 text-orange-700" />
                    <div>
                      <h2 className="font-black">Account & assignment protection</h2>
                      <p className="mt-1 text-sm leading-6 text-stone-600">Your role is <strong>Ashram Manager</strong>. Access to Ashram data is determined by active assignments in the backend. Subscription records do not replace assignment authorization.</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <MetricRow label="Account email" value={user?.email || "—"} />
                    <MetricRow label="Role" value="Ashram Manager" />
                    <MetricRow label="Active Ashram" value={ashram.name} />
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Notification preferences</p>
                  <h2 className="mt-1 text-xl font-black">Choose device-level preferences</h2>
                  <p className="mt-1 text-sm text-stone-500">These switches are saved locally on this browser. They do not override server-side communication, consent or notification permissions.</p>
                  <div className="mt-5 space-y-3">
                    {[
                      ["whatsapp", "WhatsApp lead updates", "Helpful updates when the backend workflow sends an eligible WhatsApp notification."],
                      ["email", "Email updates", "Account, subscription and important business notifications."],
                      ["updates", "General DivyaDhara updates", "Operational alerts, assignments and system notices."],
                    ].map(([key, label, description]) => {
                      const preferenceKey = key as keyof typeof notificationPrefs;
                      return (
                        <label key={key} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-orange-50 px-4 py-4 ring-1 ring-orange-100">
                          <span><span className="block text-sm font-black text-stone-800">{label}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span></span>
                          <input type="checkbox" checked={notificationPrefs[preferenceKey]} onChange={() => setNotificationPrefs((current) => ({ ...current, [preferenceKey]: !current[preferenceKey] }))} className="h-5 w-5 accent-orange-700" />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-stone-50 p-5 text-xs leading-5 text-stone-600">
                  Protected controls such as Ashram moderation status, Manager assignment, featured state, subscription activation and payment reconciliation are not editable from Settings. Those workflows remain owned by the appropriate backend/admin roles.
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {/* ================================================================ */}
      {/* PROGRAM MODAL                                                    */}
      {/* ================================================================ */}
      {programModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-[#fffaf5] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-900/10 bg-[#fffaf5] px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Program CRUD</p>
                <h2 className="mt-1 text-xl font-black">{editingProgramId ? "Edit Ashram program" : "Create Ashram program"}</h2>
              </div>
              <button type="button" onClick={closeProgramModal} className="rounded-xl p-2 text-stone-500 hover:bg-orange-50"><X size={18} /></button>
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <Field label="Program title" required value={programForm.title} onChange={(value) => setProgramForm((current) => ({ ...current, title: value }))} inputClass={formInput} />
              <Field label="Program type" value={programForm.programType} onChange={(value) => setProgramForm((current) => ({ ...current, programType: value }))} inputClass={formInput} placeholder="Retreat · Satsang · Workshop" />
              <Field label="Duration" value={programForm.durationText} onChange={(value) => setProgramForm((current) => ({ ...current, durationText: value }))} inputClass={formInput} placeholder="3 days · 7 sessions" />
              <Field label="Image URL" value={programForm.image} onChange={(value) => setProgramForm((current) => ({ ...current, image: value }))} inputClass={formInput} />
              <Field label="Price" value={programForm.priceAmount} onChange={(value) => setProgramForm((current) => ({ ...current, priceAmount: value }))} inputClass={formInput} type="number" />
              <Field label="Currency" value={programForm.currency} onChange={(value) => setProgramForm((current) => ({ ...current, currency: value.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() }))} inputClass={formInput} />
              <Field label="Start date / text" value={programForm.startDate} onChange={(value) => setProgramForm((current) => ({ ...current, startDate: value }))} inputClass={formInput} />
              <Field label="End date / text" value={programForm.endDate} onChange={(value) => setProgramForm((current) => ({ ...current, endDate: value }))} inputClass={formInput} />
              <Field label="Sort order" value={programForm.sortOrder} onChange={(value) => setProgramForm((current) => ({ ...current, sortOrder: value }))} inputClass={formInput} type="number" />
              <div className="flex items-end">
                <BooleanField label="Active program" checked={programForm.isActive} onChange={(value) => setProgramForm((current) => ({ ...current, isActive: value }))} />
              </div>
              <TextAreaField label="Description" value={programForm.description} onChange={(value) => setProgramForm((current) => ({ ...current, description: value }))} rows={6} maxLength={10000} className="sm:col-span-2" />
            </div>
            <div className="flex justify-end gap-2 border-t border-orange-900/10 px-5 py-4">
              <button type="button" onClick={closeProgramModal} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-white">Cancel</button>
              <button type="button" disabled={loading.savingProgram} onClick={() => void saveProgram()} className="btn-saffron flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:opacity-60">
                {loading.savingProgram ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                {loading.savingProgram ? "Saving…" : editingProgramId ? "Update Program" : "Create Program"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Presentational helpers                                                     */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  value,
  onChange,
  inputClass,
  placeholder,
  type = "text",
  required = false,
  disabled = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputClass: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-bold text-stone-600">
        {label}{required && <span className="text-rose-600"> *</span>}
      </label>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 5,
  maxLength,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-bold text-stone-600">{label}</label>
      <textarea rows={rows} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-orange-900/10 bg-white px-3.5 py-3 text-sm text-stone-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200" />
      {maxLength && <p className="mt-1 text-right text-[10px] text-stone-400">{value.length} / {maxLength}</p>}
    </div>
  );
}

function BooleanField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl bg-orange-50 px-4 py-3.5 ring-1 ring-orange-100">
      <span className="text-sm font-bold text-stone-800">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-orange-700" />
    </label>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3">
      <span className="text-xs font-bold text-stone-600">{label}</span>
      <span className="text-sm font-black text-stone-900">{value}</span>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3">
      <span className="text-sm font-bold text-stone-700">{label}</span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
        {ok ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
        {value}
      </span>
    </div>
  );
}

function CapacityCard({ label, used, limit, icon: Icon }: { label: string; used: number; limit: number; icon: LucideIcon }) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-700"><Icon size={17} /></span>
      </div>
      <p className="mt-3 text-2xl font-black">{used} / {limit || "—"}</p>
      {limit > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-orange-600" style={{ width: `${percent}%` }} /></div>}
    </div>
  );
}

function LockedPlan({ message, onAction }: { message: string; onAction: () => void }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Crown size={21} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <h2 className="font-black text-amber-950">Plan-controlled feature</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900/80">{message}</p>
          </div>
        </div>
        <button type="button" onClick={onAction} className="btn-saffron shrink-0 rounded-xl px-5 py-3 text-sm font-black text-white">View Plans</button>
      </div>
    </div>
  );
}

function LeadCard({ label, value, sub, icon: Icon }: { label: string; value: number; sub: string; icon: LucideIcon }) {
  return (
    <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{label}</p>
          <p className="mt-2 text-3xl font-black">{value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-700"><Icon size={18} /></span>
      </div>
      <p className="mt-2 text-xs text-stone-500">{sub}</p>
    </div>
  );
}

function ActionHint({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-stone-50 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><Icon size={16} /></span>
      <div><p className="text-sm font-black">{title}</p><p className="mt-1 text-xs leading-5 text-stone-500">{body}</p></div>
    </div>
  );
}

function EntitlementCard({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-orange-600" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
    </div>
  );
}

function FeaturePill({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${enabled ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100" : "bg-stone-50 text-stone-500 ring-1 ring-stone-100"}`}>
      {enabled ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
      {label}
    </div>
  );
}

function QuotaMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-0.5 text-sm font-black text-stone-800">{value || "—"}</p>
    </div>
  );
}

function AnalyticsCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-stone-500">{label}</p><Icon size={16} className="text-orange-700" /></div>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-1 text-[11px] text-stone-500">{sub}</p>
    </div>
  );
}

function ReadinessBar({ label, value }: { label: string; value: number }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-stone-600">{label}</span><span className="text-xs font-black text-stone-800">{Math.round(safe)}%</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-orange-600" style={{ width: `${safe}%` }} /></div>
    </div>
  );
}
