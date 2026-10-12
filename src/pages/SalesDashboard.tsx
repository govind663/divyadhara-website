/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/preserve-manual-memoization */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  ExternalLink,
  Filter,
  Flame,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  User,
  UserCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useApp } from "../context/AppContext";
import VisitorAnalyticsPanel from "../components/VisitorAnalyticsPanel";
import { useSEO } from "../lib/seo";
import { confirmAction, showError, showSuccess, showWarning, toast } from "../lib/swal";

/*
|-----------------------------------------------------------------------------
| DivyaDhara — Sales Dashboard
|-----------------------------------------------------------------------------
| Internal Sales / CRM workspace.
|
| Business guardrails:
| - Sales and Super Admin only.
| - Sales works the lead pipeline and follow-ups.
| - Revenue/payment information is display-only here.
| - Subscription authority stays in /api/subscriptions and payment authority
|   stays in /api/payments. This screen never decides price or activates a
|   subscription.
| - Manual lead creation goes through the dedicated Sales API, which performs
|   validation, duplicate protection, entity validation and audit logging.
| - Lead ownership is changed only through the backend Sales API.
|-----------------------------------------------------------------------------
*/

const API_BASE = String(import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

const LEAD_STATUSES = [
  "new",
  "qualified",
  "assigned",
  "contacted",
  "follow_up",
  "converted",
  "lost",
  "closed",
  "spam",
] as const;

type LeadStatus = (typeof LEAD_STATUSES)[number];

const LEAD_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type LeadPriority = (typeof LEAD_PRIORITIES)[number];

const LEAD_TEMPERATURES = ["cold", "warm", "hot"] as const;
type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

const LEAD_TYPES = [
  "general",
  "contact",
  "puja",
  "pandit",
  "temple",
  "ashram",
  "yatra",
  "travel",
  "event",
  "course",
  "spiritual_place",
] as const;
type LeadType = (typeof LEAD_TYPES)[number];

const FOLLOWUP_TYPES = [
  "call",
  "whatsapp",
  "email",
  "meeting",
  "reminder",
  "other",
] as const;

type FollowupType = (typeof FOLLOWUP_TYPES)[number];

type DashboardTab =
  | "overview"
  | "leads"
  | "followups"
  | "activities"
  | "payments"
  | "bookings"
  | "renewals"
  | "profile";

type LoadingState = {
  dashboard: boolean;
  leads: boolean;
  followups: boolean;
  activities: boolean;
  payments: boolean;
  bookings: boolean;
  leadAction: boolean;
  profile: boolean;
  followup: boolean;
};

type SalesDashboardResponse = {
  success: boolean;
  viewer?: {
    id?: number;
    role?: string;
    name?: string;
  };
  totals?: Record<string, unknown>;
  conversion?: Record<string, unknown>;
  revenue?: {
    bookings?: Record<string, unknown>;
    payments?: Record<string, unknown>;
  };
  renewalPipeline?: { count?: number };
  byType?: Array<Record<string, unknown>>;
  bySource?: Array<Record<string, unknown>>;
  byLocation?: Array<Record<string, unknown>>;
  todayFollowups?: Array<Record<string, unknown>>;
  upcomingFollowups?: Array<Record<string, unknown>>;
  recentActivities?: Array<Record<string, unknown>>;
};

type LeadsResponse = {
  success: boolean;
  leads?: Array<Record<string, unknown>>;
  pagination?: {
    page?: number;
    limit?: number;
    offset?: number;
    total?: number;
    totalPages?: number;
  };
};

type FollowupsResponse = {
  success: boolean;
  followups?: Array<Record<string, unknown>>;
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
};

type ActivitiesResponse = {
  success: boolean;
  activities?: Array<Record<string, unknown>>;
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
};

type PaymentsResponse = {
  success: boolean;
  payments?: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
};

type BookingsResponse = {
  success: boolean;
  bookings?: Array<Record<string, unknown>>;
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
};

type LeadDetail = {
  lead?: Record<string, unknown>;
  followups?: Array<Record<string, unknown>>;
  communications?: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  salesActivities?: Array<Record<string, unknown>>;
  bookings?: Array<Record<string, unknown>>;
};

type Owner = {
  id: number;
  name: string;
  email?: string | null;
  role?: string;
  status?: string;
};

type ProfileForm = {
  name: string;
  phone: string;
  city: string;
  state: string;
  country: string;
};

type CreateLeadForm = {
  name: string;
  phone: string;
  email: string;
  whatsapp: string;
  leadType: LeadType;
  serviceType: string;
  pujaType: string;
  city: string;
  district: string;
  state: string;
  country: string;
  preferredDate: string;
  preferredTime: string;
  message: string;
  sourceType: string;
  priority: LeadPriority;
  temperature: LeadTemperature;
  assignToMe: boolean;
  entityType: "" | LeadType;
  entityId: string;
};

type FollowupForm = {
  leadId: number | null;
  dueAt: string;
  followupType: FollowupType;
  subject: string;
  notes: string;
};

const DEFAULT_LOADING: LoadingState = {
  dashboard: true,
  leads: false,
  followups: false,
  activities: false,
  payments: false,
  bookings: false,
  leadAction: false,
  profile: false,
  followup: false,
};

const DEFAULT_PROFILE: ProfileForm = {
  name: "",
  phone: "",
  city: "",
  state: "",
  country: "India",
};

const DEFAULT_CREATE_LEAD: CreateLeadForm = {
  name: "",
  phone: "",
  email: "",
  whatsapp: "",
  leadType: "general",
  serviceType: "",
  pujaType: "",
  city: "",
  district: "",
  state: "",
  country: "India",
  preferredDate: "",
  preferredTime: "",
  message: "",
  sourceType: "phone",
  priority: "normal",
  temperature: "cold",
  assignToMe: true,
  entityType: "",
  entityId: "",
};

const DEFAULT_FOLLOWUP: FollowupForm = {
  leadId: null,
  dueAt: "",
  followupType: "call",
  subject: "",
  notes: "",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-orange-900/10 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:bg-stone-100";

const SELECT_CLASS =
  "w-full rounded-xl border border-orange-900/10 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:bg-stone-100";

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateTimeLabel(value: unknown) {
  const raw = textValue(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function dateOnlyLabel(value: unknown) {
  const raw = textValue(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function money(value: unknown, currency = "INR") {
  const amount = numValue(value, 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "INR"} ${amount.toLocaleString("en-IN")}`;
  }
}

function paiseToMoney(value: unknown, currency = "INR") {
  return money(numValue(value, 0) / 100, currency);
}

function statusClasses(value: unknown) {
  const status = textValue(value).toLowerCase();
  if (["converted", "completed", "paid", "captured", "active", "accepted", "verified"].includes(status)) {
    return "bg-emerald-100 text-emerald-800";
  }
  if (["lost", "closed", "failed", "cancelled", "rejected", "spam", "expired"].includes(status)) {
    return "bg-rose-100 text-rose-800";
  }
  if (["contacted", "follow_up", "assigned", "qualified", "pending", "attempted", "authorized"].includes(status)) {
    return "bg-blue-100 text-blue-800";
  }
  return "bg-amber-100 text-amber-900";
}

function temperatureClasses(value: unknown) {
  const temperature = textValue(value).toLowerCase();
  if (temperature === "hot") return "bg-red-100 text-red-800";
  if (temperature === "warm") return "bg-orange-100 text-orange-800";
  return "bg-sky-100 text-sky-800";
}

function priorityClasses(value: unknown) {
  const priority = textValue(value).toLowerCase();
  if (priority === "urgent") return "bg-red-100 text-red-800";
  if (priority === "high") return "bg-orange-100 text-orange-800";
  return "bg-stone-100 text-stone-700";
}

function leadDisplayEntity(lead: Record<string, unknown>) {
  return (
    textValue(lead.puja_service_name) ||
    textValue(lead.requested_pandit_name) ||
    textValue(lead.temple_name) ||
    textValue(lead.ashram_name) ||
    textValue(lead.yatra_package_name) ||
    textValue(lead.event_name) ||
    textValue(lead.course_name) ||
    textValue(lead.spiritual_place_name) ||
    textValue(lead.service_type) ||
    textValue(lead.puja_type) ||
    titleCase(textValue(lead.lead_type, "general"))
  );
}

function leadLocation(lead: Record<string, unknown>) {
  return [lead.city, lead.district, lead.state]
    .map((value) => textValue(value))
    .filter(Boolean)
    .join(", ");
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: unknown = {};

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }

    if (!response.ok) {
      const record = payload as Record<string, unknown>;
      throw new Error(textValue(record.error, `Request failed with HTTP ${response.status}.`));
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request timed out. Please refresh and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function queryString(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

function dashboardNumber(totals: Record<string, unknown> | undefined, key: string) {
  return numValue(totals?.[key], 0);
}

function Card({
  label,
  value,
  sub,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  const content = (
    <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-stone-500">{label}</p>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-700">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-black text-stone-900">{value}</p>
      {sub ? <p className="mt-1 text-xs leading-5 text-stone-500">{sub}</p> : null}
    </div>
  );

  if (!onClick) return content;

  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {content}
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-orange-900/15 bg-white p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-700">
        <Icon size={21} />
      </span>
      <h3 className="mt-4 text-lg font-black text-stone-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-stone-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export default function SalesDashboard() {
  useSEO({
    title: "Sales Dashboard — Leads, Follow-ups & CRM | DivyaDhara",
    description:
      "Internal DivyaDhara Sales CRM dashboard for lead pipeline, follow-ups, bookings, payment visibility and renewal opportunities.",
    path: "/sales/dashboard",
  });

  const { user, isLoading, logout, updateProfile, refreshUser } = useApp();
  const navigate = useNavigate();

  const role = String(user?.role ?? "");
  const isAuthorized = role === "sales" || role === "super_admin";

  const [tab, setTab] = useState<DashboardTab>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loading, setLoading] = useState<LoadingState>(DEFAULT_LOADING);
  const [pageError, setPageError] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<SalesDashboardResponse | null>(null);
  const [leads, setLeads] = useState<Array<Record<string, unknown>>>([]);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [leadType, setLeadType] = useState("");
  const [leadPriority, setLeadPriority] = useState("");
  const [leadTemperature, setLeadTemperature] = useState("");
  const [leadOwner, setLeadOwner] = useState("");
  const [leadOpenOnly, setLeadOpenOnly] = useState(true);

  const [followups, setFollowups] = useState<Array<Record<string, unknown>>>([]);
  const [followupPage, setFollowupPage] = useState(1);
  const [followupTotalPages, setFollowupTotalPages] = useState(1);

  const [activities, setActivities] = useState<Array<Record<string, unknown>>>([]);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [activitiesTotalPages, setActivitiesTotalPages] = useState(1);

  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentTotals, setPaymentTotals] = useState<Record<string, unknown>>({});

  const [bookings, setBookings] = useState<Array<Record<string, unknown>>>([]);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsTotalPages, setBookingsTotalPages] = useState(1);

  const [owners, setOwners] = useState<Owner[]>([]);

  const [selectedLead, setSelectedLead] = useState<Record<string, unknown> | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
  const [leadDetailLoading, setLeadDetailLoading] = useState(false);

  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [createLeadForm, setCreateLeadForm] = useState<CreateLeadForm>(DEFAULT_CREATE_LEAD);

  const [followupOpen, setFollowupOpen] = useState(false);
  const [followupForm, setFollowupForm] = useState<FollowupForm>(DEFAULT_FOLLOWUP);

  const [profileForm, setProfileForm] = useState<ProfileForm>(DEFAULT_PROFILE);

  const totals = dashboard?.totals;
  const conversion = dashboard?.conversion;
  const revenue = dashboard?.revenue;

  const profileCompleteness = useMemo(() => {
    const fields = [user?.name, user?.phone, user?.city, user?.state, user?.country];
    return Math.round((fields.filter((value) => String(value ?? "").trim()).length / fields.length) * 100);
  }, [user]);

  const conversionRate = numValue(conversion?.conversion_rate_percent, 0);
  const paidBookingAmount = numValue(revenue?.bookings?.paid_booking_amount, 0);
  const pendingBookingAmount = numValue(revenue?.bookings?.pending_booking_amount, 0);
  const grossPaid = numValue(revenue?.payments?.gross_paid_paise, 0) / 100;
  const refunded = numValue(revenue?.payments?.refunded_paise, 0) / 100;
  const netPaid = numValue(revenue?.payments?.net_paid_paise, 0) / 100;

  const openLeadCount = dashboardNumber(totals, "unassigned_open_count") + dashboardNumber(totals, "my_owned_count");
  const hotLeadCount = dashboardNumber(totals, "hot_count");
  const followupCount = dashboard?.todayFollowups?.length ?? 0;
  const renewalCount = numValue(dashboard?.renewalPipeline?.count, 0);

  const setLoadingKey = useCallback(<K extends keyof LoadingState>(key: K, value: boolean) => {
    setLoading((current) => ({ ...current, [key]: value }));
  }, []);

  const resetProfileForm = useCallback(() => {
    setProfileForm({
      name: textValue(user?.name),
      phone: textValue(user?.phone),
      city: textValue(user?.city),
      state: textValue(user?.state),
      country: textValue(user?.country, "India"),
    });
  }, [user?.city, user?.country, user?.name, user?.phone, user?.state]);

  useEffect(() => {
    resetProfileForm();
  }, [resetProfileForm]);

  const loadDashboard = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingKey("dashboard", true);
    setPageError(null);

    try {
      const response = await apiRequest<SalesDashboardResponse>("/sales/dashboard");
      setDashboard(response);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load Sales dashboard.");
    } finally {
      setLoadingKey("dashboard", false);
    }
  }, [isAuthorized, setLoadingKey]);

  const loadLeads = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingKey("leads", true);
    try {
      const response = await apiRequest<LeadsResponse>(
        `/sales/leads${queryString({
          page: leadsPage,
          limit: 25,
          search: leadSearch,
          status: leadStatus,
          leadType,
          priority: leadPriority,
          temperature: leadTemperature,
          owner: ["mine", "unassigned", "owned"].includes(leadOwner) ? leadOwner : undefined,
          ownerUserId: /^\d+$/.test(leadOwner) ? Number(leadOwner) : undefined,
          openOnly: leadOpenOnly,
        })}`,
      );
      setLeads(response.leads ?? []);
      setLeadsTotal(numValue(response.pagination?.total, 0));
      setLeadsTotalPages(Math.max(1, numValue(response.pagination?.totalPages, 1)));
    } catch (error) {
      await showError("Lead pipeline could not load", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("leads", false);
    }
  }, [isAuthorized, leadOpenOnly, leadPriority, leadSearch, leadStatus, leadTemperature, leadType, leadOwner, leadsPage, setLoadingKey]);

  const loadFollowups = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingKey("followups", true);
    try {
      const response = await apiRequest<FollowupsResponse>(
        `/sales/followups${queryString({ page: followupPage, limit: 25 })}`,
      );
      setFollowups(response.followups ?? []);
      setFollowupTotalPages(Math.max(1, numValue(response.pagination?.totalPages, 1)));
    } catch (error) {
      await showError("Follow-ups could not load", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("followups", false);
    }
  }, [followupPage, isAuthorized, setLoadingKey]);

  const loadActivities = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingKey("activities", true);
    try {
      const response = await apiRequest<ActivitiesResponse>(
        `/sales/activities${queryString({ page: activitiesPage, limit: 25 })}`,
      );
      setActivities(response.activities ?? []);
      setActivitiesTotalPages(Math.max(1, numValue(response.pagination?.totalPages, 1)));
    } catch (error) {
      await showError("Activities could not load", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("activities", false);
    }
  }, [activitiesPage, isAuthorized, setLoadingKey]);

  const loadPayments = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingKey("payments", true);
    try {
      const response = await apiRequest<PaymentsResponse>(
        `/sales/payments${queryString({ page: paymentsPage, limit: 25 })}`,
      );
      setPayments(response.payments ?? []);
      setPaymentTotals(response.totals ?? {});
      setPaymentsTotalPages(Math.max(1, numValue(response.pagination?.totalPages, 1)));
    } catch (error) {
      await showError("Payment visibility could not load", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("payments", false);
    }
  }, [isAuthorized, paymentsPage, setLoadingKey]);

  const loadBookings = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingKey("bookings", true);
    try {
      const response = await apiRequest<BookingsResponse>(
        `/sales/bookings${queryString({ page: bookingsPage, limit: 25 })}`,
      );
      setBookings(response.bookings ?? []);
      setBookingsTotalPages(Math.max(1, numValue(response.pagination?.totalPages, 1)));
    } catch (error) {
      await showError("Bookings could not load", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("bookings", false);
    }
  }, [bookingsPage, isAuthorized, setLoadingKey]);

  const loadOwners = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      const response = await apiRequest<{ success: boolean; owners?: Owner[] }>("/leads/owners");
      setOwners(response.owners ?? []);
    } catch {
      // Ownership is optional for the initial UI; backend remains authoritative.
    }
  }, [isAuthorized]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadDashboard(),
      loadLeads(),
      loadFollowups(),
      loadActivities(),
      loadPayments(),
      loadBookings(),
      loadOwners(),
    ]);
  }, [loadActivities, loadBookings, loadDashboard, loadFollowups, loadLeads, loadOwners, loadPayments]);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login", { replace: true, state: { from: "/sales/dashboard" } });
    }
  }, [isLoading, navigate, user]);

  useEffect(() => {
    if (!isLoading && user && !isAuthorized) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthorized, isLoading, navigate, user]);

  useEffect(() => {
    if (!isLoading && user && isAuthorized) {
      void loadDashboard();
      void loadOwners();
    }
  }, [isAuthorized, isLoading, loadDashboard, loadOwners, user]);

  useEffect(() => {
    if (isAuthorized) void loadLeads();
  }, [isAuthorized, loadLeads]);

  useEffect(() => {
    if (isAuthorized) void loadFollowups();
  }, [followupPage, isAuthorized, loadFollowups]);

  useEffect(() => {
    if (isAuthorized) void loadActivities();
  }, [activitiesPage, isAuthorized, loadActivities]);

  useEffect(() => {
    if (isAuthorized) void loadPayments();
  }, [isAuthorized, loadPayments, paymentsPage]);

  useEffect(() => {
    if (isAuthorized) void loadBookings();
  }, [bookingsPage, isAuthorized, loadBookings]);

  const openLeadDetail = useCallback(async (lead: Record<string, unknown>) => {
    const id = numValue(lead.id, 0);
    if (!id) return;
    setSelectedLead(lead);
    setLeadDetail(null);
    setLeadDetailLoading(true);
    try {
      const response = await apiRequest<LeadDetail>(`/sales/leads/${id}`);
      setLeadDetail(response);
    } catch (error) {
      await showError("Lead details could not load", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLeadDetailLoading(false);
    }
  }, []);

  const updateLead = useCallback(
    async (leadId: number, payload: Record<string, unknown>, successText: string) => {
      setLoadingKey("leadAction", true);
      try {
        const response = await apiRequest<{ success: boolean; lead?: Record<string, unknown> }>(`/sales/leads/${leadId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        await showSuccess("Lead updated", successText);
        setSelectedLead(response.lead ?? null);
        if (response.lead) setSelectedLead(response.lead);
        await Promise.all([loadLeads(), loadDashboard(), loadFollowups()]);
        if (response.lead) {
          try {
            const detail = await apiRequest<LeadDetail>(`/sales/leads/${leadId}`);
            setLeadDetail(detail);
          } catch {
            // The update itself succeeded; detail refresh is best-effort.
          }
        }
      } catch (error) {
        await showError("Lead update failed", error instanceof Error ? error.message : "Please try again.");
      } finally {
        setLoadingKey("leadAction", false);
      }
    },
    [loadDashboard, loadFollowups, loadLeads, setLoadingKey],
  );

  const saveProfile = useCallback(async () => {
    const name = profileForm.name.trim();
    if (name.length < 2) {
      toast("warning", "Please enter your full name.");
      return;
    }
    setLoadingKey("profile", true);
    try {
      await updateProfile({
        name,
        phone: profileForm.phone.trim(),
        city: profileForm.city.trim(),
        state: profileForm.state.trim(),
        country: profileForm.country.trim() || "India",
      });
      try {
        await refreshUser();
      } catch {
        // Profile save already succeeded.
      }
      await showSuccess("Profile updated", "Your Sales profile has been saved successfully.");
    } catch (error) {
      await showError("Profile update failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("profile", false);
    }
  }, [profileForm, refreshUser, setLoadingKey, updateProfile]);

  const submitCreateLead = useCallback(async () => {
    const name = createLeadForm.name.trim();
    if (name.length < 2) {
      toast("warning", "Name must contain at least 2 characters.");
      return;
    }

    if (!createLeadForm.phone.trim() && !createLeadForm.email.trim() && !createLeadForm.whatsapp.trim()) {
      toast("warning", "Add phone, email or WhatsApp so the lead can be contacted.");
      return;
    }

    setLoadingKey("leadAction", true);
    try {
      const body: Record<string, unknown> = {
        name,
        phone: createLeadForm.phone.trim() || undefined,
        email: createLeadForm.email.trim() || undefined,
        whatsapp: createLeadForm.whatsapp.trim() || undefined,
        leadType: createLeadForm.leadType,
        serviceType: createLeadForm.serviceType.trim() || undefined,
        pujaType: createLeadForm.pujaType.trim() || undefined,
        city: createLeadForm.city.trim() || undefined,
        district: createLeadForm.district.trim() || undefined,
        state: createLeadForm.state.trim() || undefined,
        country: createLeadForm.country.trim() || "India",
        preferredDate: createLeadForm.preferredDate || undefined,
        preferredTime: createLeadForm.preferredTime || undefined,
        message: createLeadForm.message.trim() || undefined,
        sourceType: createLeadForm.sourceType,
        priority: createLeadForm.priority,
        temperature: createLeadForm.temperature,
        ownerUserId: createLeadForm.assignToMe && user?.id ? user.id : null,
        ...(createLeadForm.entityType && createLeadForm.entityId
          ? createLeadForm.entityType === "pandit"
            ? { requestedPanditId: Number(createLeadForm.entityId) }
            : { [`${createLeadForm.entityType === "puja" ? "pujaServiceId" : createLeadForm.entityType === "yatra" ? "yatraPackageId" : `${createLeadForm.entityType}Id`}`]: Number(createLeadForm.entityId) }
          : {}),
      };

      const response = await apiRequest<{ success: boolean; lead?: Record<string, unknown> }>("/sales/leads", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setCreateLeadForm(DEFAULT_CREATE_LEAD);
      setCreateLeadOpen(false);
      await showSuccess(
        "Lead created",
        `Lead ${textValue(response.lead?.lead_number, "record")} has been added to the Sales pipeline.`,
      );
      setTab("leads");
      setLeadsPage(1);
      await Promise.all([loadLeads(), loadDashboard()]);
    } catch (error) {
      await showError("Could not create lead", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("leadAction", false);
    }
  }, [createLeadForm, loadDashboard, loadLeads, setLoadingKey, user?.id]);

  const submitFollowup = useCallback(async () => {
    if (!followupForm.leadId) {
      toast("warning", "Select a lead for the follow-up.");
      return;
    }
    if (!followupForm.dueAt) {
      toast("warning", "Select a follow-up date and time.");
      return;
    }

    setLoadingKey("followup", true);
    try {
      await apiRequest<{ success: boolean }>(`/leads/${followupForm.leadId}/followups`, {
        method: "POST",
        body: JSON.stringify({
          dueAt: new Date(followupForm.dueAt).toISOString(),
          followupType: followupForm.followupType,
          subject: followupForm.subject.trim() || undefined,
          notes: followupForm.notes.trim() || undefined,
          assignedToUserId: user?.id,
        }),
      });
      setFollowupOpen(false);
      setFollowupForm(DEFAULT_FOLLOWUP);
      await showSuccess("Follow-up scheduled", "The lead has been added to your follow-up queue.");
      await Promise.all([loadFollowups(), loadDashboard()]);
    } catch (error) {
      await showError("Could not schedule follow-up", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoadingKey("followup", false);
    }
  }, [followupForm, loadDashboard, loadFollowups, setLoadingKey, user?.id]);

  const doLogout = useCallback(async () => {
    const confirmed = await confirmAction(
      "Logout from Sales dashboard?",
      "Your current browser session will be closed.",
      "Logout",
    );
    if (!confirmed) return;
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      await showError("Logout failed", error instanceof Error ? error.message : "Please try again.");
    }
  }, [logout, navigate]);

  const exportLeads = useCallback(() => {
    const url = `${API_BASE}/sales/leads/export.csv${queryString({
      search: leadSearch,
      status: leadStatus,
      leadType,
      priority: leadPriority,
      temperature: leadTemperature,
      owner: ["mine", "unassigned", "owned"].includes(leadOwner) ? leadOwner : undefined,
      ownerUserId: /^\d+$/.test(leadOwner) ? Number(leadOwner) : undefined,
      openOnly: leadOpenOnly,
    })}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [leadOpenOnly, leadOwner, leadPriority, leadSearch, leadStatus, leadTemperature, leadType]);

  const openFollowupFromLead = useCallback((lead: Record<string, unknown>) => {
    const id = numValue(lead.id, 0);
    if (!id) return;
    setFollowupForm({
      ...DEFAULT_FOLLOWUP,
      leadId: id,
      subject: `Follow-up — ${textValue(lead.name, "Lead")}`,
    });
    setFollowupOpen(true);
  }, []);

  const sidebarItems: Array<{ id: DashboardTab; label: string; icon: LucideIcon; count?: number }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "leads", label: "Lead Pipeline", icon: Users, count: leadsTotal },
    { id: "followups", label: "Follow-ups", icon: Clock3, count: followupCount },
    { id: "activities", label: "Activities", icon: Activity },
    { id: "payments", label: "Payment Visibility", icon: WalletCards },
    { id: "bookings", label: "Bookings", icon: CalendarCheck },
    { id: "renewals", label: "Renewal Pipeline", icon: TrendingUp, count: renewalCount },
    { id: "profile", label: "My Profile", icon: User },
  ];

  if (isLoading || (loading.dashboard && !dashboard && isAuthorized)) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
          <div className="rounded-3xl border border-orange-900/10 bg-white px-8 py-10 text-center shadow-sm">
            <RefreshCw className="mx-auto animate-spin text-orange-700" size={28} />
            <p className="mt-4 font-semibold text-stone-800">Loading Sales command center…</p>
            <p className="mt-1 text-xs text-stone-500">Restoring your secure CRM workspace.</p>
          </div>
        </div>
      </div>
    );
  }

  if (pageError && !dashboard) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto text-rose-600" size={40} />
            <h1 className="mt-4 text-2xl font-black text-stone-900">Sales dashboard unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">{pageError}</p>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="btn-saffron mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            >
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f2ea] text-stone-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#2a1a10] text-white shadow-lg">
        <div className="mx-auto flex min-h-16 max-w-[1540px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen((current) => !current)}
              className="rounded-xl border border-white/10 p-2 text-orange-100 md:hidden"
              aria-label="Open Sales navigation"
            >
              {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600 shadow-inner">
              <BarChart3 size={19} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-wide">DivyaDhara</p>
              <p className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-orange-300">Sales Command Center</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-orange-100 transition hover:bg-white/10 md:flex"
            >
              <ExternalLink size={14} /> Website
            </Link>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="rounded-xl border border-white/10 p-2 text-orange-100 transition hover:bg-white/10"
              title="Refresh dashboard"
            >
              <RefreshCw size={16} className={loading.dashboard ? "animate-spin" : ""} />
            </button>
            <div className="hidden min-w-0 max-w-56 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:block">
              <p className="truncate text-xs font-bold">{textValue(user?.name, "Sales")}</p>
              <p className="truncate text-[10px] text-orange-200/70">{textValue(user?.email)}</p>
            </div>
            <button
              type="button"
              onClick={() => void doLogout()}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-orange-100 transition hover:bg-white/10"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1540px] md:grid-cols-[255px_1fr]">
        <aside
          className={[
            "border-r border-orange-900/10 bg-[#f2eadf] p-4 md:min-h-[calc(100vh-64px)] md:block",
            mobileNavOpen ? "block" : "hidden",
          ].join(" ")}
        >
          <div className="rounded-3xl bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-5 text-white shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-200">Internal CRM</p>
                <h2 className="mt-2 text-xl font-black">Jai Shri Ram 🙏</h2>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-orange-100">
                <ShieldCheck size={17} />
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-orange-100/80">
              Work enquiries, follow-ups and commercial opportunities without changing payment or subscription authority.
            </p>
          </div>

          <nav className="mt-5 space-y-1.5" aria-label="Sales dashboard">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={[
                    "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition",
                    active ? "bg-[#2a1a10] text-orange-200 shadow" : "text-stone-700 hover:bg-white",
                  ].join(" ")}
                >
                  <Icon size={17} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {item.count !== undefined && item.count > 0 ? (
                    <span className={active ? "rounded-full bg-white/15 px-2 py-0.5 text-[10px]" : "rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-900"}>
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-orange-900/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-stone-600">Profile completeness</span>
              <span className="text-sm font-black text-orange-800">{profileCompleteness}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100">
              <div className="h-full rounded-full bg-orange-600 transition-all" style={{ width: `${profileCompleteness}%` }} />
            </div>
            <button
              type="button"
              onClick={() => setTab("profile")}
              className="mt-3 text-xs font-bold text-orange-800 underline underline-offset-2"
            >
              Complete profile
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-orange-900/10 bg-white p-4 text-xs leading-5 text-stone-500">
            <p className="font-black text-stone-700">Authority boundary</p>
            <p className="mt-1">Payments and subscription activation stay with their dedicated backend workflows.</p>
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-[1240px] space-y-6">
            {tab === "overview" && (
              <>
                <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-6 text-white shadow-lg md:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">Sales Workspace</p>
                        <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-300/20">
                          {role === "super_admin" ? "Super Admin View" : "Sales User"}
                        </span>
                      </div>
                      <h1 className="mt-2 text-3xl font-black md:text-4xl">Namaste, {textValue(user?.name, "Sales")}</h1>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-100/85">
                        One operational view for incoming enquiries, pipeline movement, follow-ups, revenue visibility and renewal opportunities.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateLeadOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900 shadow-sm"
                      >
                        <Plus size={16} /> New Lead
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab("followups")}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15"
                      >
                        <Clock3 size={16} /> Follow-ups
                      </button>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card
                    label="Open Sales Queue"
                    value={openLeadCount}
                    sub={`${dashboardNumber(totals, "new_count")} new · ${dashboardNumber(totals, "qualified_count")} qualified`}
                    icon={Users}
                    onClick={() => setTab("leads")}
                  />
                  <Card
                    label="Hot Leads"
                    value={hotLeadCount}
                    sub={`${dashboardNumber(totals, "high_priority_count")} high-priority / urgent`}
                    icon={Flame}
                    onClick={() => {
                      setLeadTemperature("hot");
                      setLeadOpenOnly(true);
                      setLeadsPage(1);
                      setTab("leads");
                    }}
                  />
                  <Card
                    label="30-Day Conversion"
                    value={`${conversionRate.toFixed(1)}%`}
                    sub={`${numValue(conversion?.converted_leads, 0)} converted of ${numValue(conversion?.total_leads, 0)} leads`}
                    icon={TrendingUp}
                  />
                  <Card
                    label="Renewals ≤ 30 Days"
                    value={renewalCount}
                    sub="Pandit · Temple · Ashram subscription opportunities"
                    icon={CircleDollarSign}
                    onClick={() => setTab("renewals")}
                  />
                </section>

                <VisitorAnalyticsPanel />

                <section className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Pipeline health</p>
                        <h2 className="mt-1 text-xl font-black">Lead movement at a glance</h2>
                      </div>
                      <button type="button" onClick={() => setTab("leads")} className="text-xs font-bold text-orange-800 underline underline-offset-2">Open pipeline</button>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        ["New", "new_count", "bg-amber-50"],
                        ["Assigned", "assigned_count", "bg-blue-50"],
                        ["Follow-up", "follow_up_count", "bg-orange-50"],
                        ["Converted", "converted_count", "bg-emerald-50"],
                      ].map(([label, key, bg]) => (
                        <div key={key} className={`rounded-2xl ${bg} p-4 ring-1 ring-orange-900/5`}>
                          <p className="text-[11px] font-black uppercase tracking-wider text-stone-500">{label}</p>
                          <p className="mt-2 text-2xl font-black text-stone-900">{dashboardNumber(totals, key)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-orange-900/10 p-4">
                        <p className="text-xs font-bold text-stone-500">My owned leads</p>
                        <p className="mt-1 text-2xl font-black">{dashboardNumber(totals, "my_owned_count")}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-900/10 p-4">
                        <p className="text-xs font-bold text-stone-500">Unassigned open</p>
                        <p className="mt-1 text-2xl font-black text-orange-800">{dashboardNumber(totals, "unassigned_open_count")}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-900/10 p-4">
                        <p className="text-xs font-bold text-stone-500">Closed / lost</p>
                        <p className="mt-1 text-2xl font-black text-stone-500">{dashboardNumber(totals, "closed_count")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">30-day commercial view</p>
                    <h2 className="mt-1 text-xl font-black">Money visibility</h2>
                    <p className="mt-1 text-xs leading-5 text-stone-500">Display-only values from backend payment/booking data.</p>
                    <div className="mt-5 space-y-3">
                      <div className="rounded-2xl bg-emerald-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-stone-600">Paid bookings</span>
                          <IndianRupee size={15} className="text-emerald-700" />
                        </div>
                        <p className="mt-1 text-xl font-black text-emerald-900">{money(paidBookingAmount)}</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-stone-600">Pending booking amount</span>
                          <Clock3 size={15} className="text-amber-700" />
                        </div>
                        <p className="mt-1 text-xl font-black text-amber-900">{money(pendingBookingAmount)}</p>
                      </div>
                      <div className="rounded-2xl bg-orange-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-stone-600">Net paid</span>
                          <WalletCards size={15} className="text-orange-700" />
                        </div>
                        <p className="mt-1 text-xl font-black text-orange-900">{money(netPaid)}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setTab("payments")} className="mt-4 w-full rounded-xl border border-orange-900/10 px-4 py-3 text-xs font-black text-orange-800 hover:bg-orange-50">Open payment visibility</button>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Today</p>
                        <h2 className="mt-1 text-xl font-black">Follow-up queue</h2>
                      </div>
                      <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-800">{followupCount}</span>
                    </div>
                    <div className="mt-4 space-y-2.5">
                      {(dashboard?.todayFollowups ?? []).slice(0, 6).map((item) => (
                        <div key={String(item.id)} className="rounded-2xl border border-orange-900/10 p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-stone-800">{textValue(item.lead_name, "Lead")}</p>
                              <p className="mt-1 text-xs text-stone-500">{titleCase(textValue(item.followup_type, "call"))} · {dateTimeLabel(item.due_at)}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusClasses(item.status)}`}>{titleCase(textValue(item.status))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {followupCount === 0 ? <p className="mt-4 text-sm text-stone-500">No follow-ups are due today.</p> : null}
                  </div>

                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Recent</p>
                        <h2 className="mt-1 text-xl font-black">Sales activity</h2>
                      </div>
                      <button type="button" onClick={() => setTab("activities")} className="text-xs font-bold text-orange-800 underline underline-offset-2">View all</button>
                    </div>
                    <div className="mt-4 space-y-2.5">
                      {(dashboard?.recentActivities ?? []).slice(0, 6).map((item) => (
                        <div key={String(item.id)} className="flex items-start gap-3 rounded-2xl bg-stone-50 p-3.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><Activity size={15} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-stone-800">{titleCase(textValue(item.activity_type, "Activity"))}</p>
                            <p className="mt-0.5 text-xs text-stone-500">{textValue(item.lead_name, textValue(item.description, "Sales activity"))}</p>
                            <p className="mt-1 text-[11px] text-stone-400">{dateTimeLabel(item.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(dashboard?.recentActivities?.length ?? 0) === 0 ? <p className="mt-4 text-sm text-stone-500">No sales activity has been recorded yet.</p> : null}
                  </div>
                </section>

                <section className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Lead mix</p>
                      <h2 className="mt-1 text-xl font-black">Where demand is coming from</h2>
                    </div>
                    <button type="button" onClick={() => setTab("leads")} className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 px-4 py-2.5 text-xs font-bold text-orange-800 hover:bg-orange-50"><Search size={14} /> Search pipeline</button>
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl bg-orange-50/60 p-4 ring-1 ring-orange-100">
                      <p className="text-[11px] font-black uppercase tracking-wider text-stone-500">Top lead types</p>
                      <div className="mt-3 space-y-2">
                        {(dashboard?.byType ?? []).slice(0, 6).map((item) => (
                          <div key={String(item.lead_type)} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
                            <span className="text-sm font-bold text-stone-700">{titleCase(textValue(item.lead_type, "general"))}</span>
                            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-900">{numValue(item.count, 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-[11px] font-black uppercase tracking-wider text-stone-500">Top acquisition sources</p>
                      <div className="mt-3 space-y-2">
                        {(dashboard?.bySource ?? []).slice(0, 6).map((item) => (
                          <div key={String(item.source_type)} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
                            <span className="text-sm font-bold text-stone-700">{titleCase(textValue(item.source_type, "website"))}</span>
                            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-800">{numValue(item.count, 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {tab === "leads" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">CRM pipeline</p>
                    <h1 className="mt-1 text-2xl font-black">Leads & enquiries</h1>
                    <p className="mt-1 text-sm text-stone-500">Search, qualify, assign, schedule follow-ups and move leads through the Sales lifecycle.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={exportLeads} className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 bg-white px-4 py-3 text-xs font-bold text-stone-700 hover:bg-orange-50"><Download size={15} /> Export CSV</button>
                    <button type="button" onClick={() => setCreateLeadOpen(true)} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-black text-white"><Plus size={15} /> New Lead</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="relative xl:col-span-2">
                      <span className="sr-only">Search leads</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                      <input value={leadSearch} onChange={(event) => { setLeadSearch(event.target.value); setLeadsPage(1); }} placeholder="Name, phone, email, lead no, service…" className={`${INPUT_CLASS} pl-9`} />
                    </label>
                    <select value={leadStatus} onChange={(event) => { setLeadStatus(event.target.value); setLeadsPage(1); }} className={SELECT_CLASS} aria-label="Lead status">
                      <option value="">All statuses</option>
                      {LEAD_STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                    </select>
                    <select value={leadType} onChange={(event) => { setLeadType(event.target.value); setLeadsPage(1); }} className={SELECT_CLASS} aria-label="Lead type">
                      <option value="">All lead types</option>
                      {LEAD_TYPES.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
                    </select>
                    <select value={leadPriority} onChange={(event) => { setLeadPriority(event.target.value); setLeadsPage(1); }} className={SELECT_CLASS} aria-label="Lead priority">
                      <option value="">All priorities</option>
                      {LEAD_PRIORITIES.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}
                    </select>
                    <select value={leadTemperature} onChange={(event) => { setLeadTemperature(event.target.value); setLeadsPage(1); }} className={SELECT_CLASS} aria-label="Lead temperature">
                      <option value="">All temperatures</option>
                      {LEAD_TEMPERATURES.map((temperature) => <option key={temperature} value={temperature}>{titleCase(temperature)}</option>)}
                    </select>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <select value={leadOwner} onChange={(event) => { setLeadOwner(event.target.value); setLeadsPage(1); }} className="rounded-xl border border-orange-900/10 bg-white px-3 py-2 text-xs font-bold text-stone-700">
                        <option value="">All owners</option>
                        <option value="mine">My leads</option>
                        <option value="unassigned">Unassigned</option>
                        <option value="owned">All assigned</option>
                        {owners.map((owner) => <option key={owner.id} value={String(owner.id)}>{owner.name}</option>)}
                      </select>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-orange-900/10 bg-orange-50 px-3 py-2 text-xs font-bold text-stone-700">
                        <input type="checkbox" checked={leadOpenOnly} onChange={(event) => { setLeadOpenOnly(event.target.checked); setLeadsPage(1); }} className="h-4 w-4 accent-orange-700" /> Open only
                      </label>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <Filter size={14} /> {leadsTotal.toLocaleString("en-IN")} matching lead{leadsTotal === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                  {loading.leads ? (
                    <div className="p-10 text-center"><RefreshCw className="mx-auto animate-spin text-orange-700" size={24} /><p className="mt-3 text-sm text-stone-500">Loading lead pipeline…</p></div>
                  ) : leads.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="No leads match these filters"
                      description="Try removing a filter or add a new manually sourced lead. Website form submissions will also appear here when they become CRM leads."
                      action={<button type="button" onClick={() => setCreateLeadOpen(true)} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"><Plus size={15} /> Create Lead</button>}
                    />
                  ) : (
                    <div className="divide-y divide-orange-900/10">
                      {leads.map((lead) => (
                        <div key={String(lead.id)} className="p-5 transition hover:bg-orange-50/30">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex min-w-0 gap-4">
                              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><Users size={18} /></div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button type="button" onClick={() => void openLeadDetail(lead)} className="truncate text-left text-sm font-black text-stone-900 hover:text-orange-700">{textValue(lead.name, "Unnamed lead")}</button>
                                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-stone-600">{textValue(lead.lead_number, `#${String(lead.id)}`)}</span>
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClasses(lead.status)}`}>{titleCase(textValue(lead.status, "new"))}</span>
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${temperatureClasses(lead.lead_temperature)}`}>{titleCase(textValue(lead.lead_temperature, "cold"))}</span>
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${priorityClasses(lead.priority)}`}>{titleCase(textValue(lead.priority, "normal"))}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                                  <span>{titleCase(textValue(lead.lead_type, "general"))}</span>
                                  <span>· {leadDisplayEntity(lead)}</span>
                                  {leadLocation(lead) ? <span className="inline-flex items-center gap-1"><MapPin size={11} /> {leadLocation(lead)}</span> : null}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                                  {textValue(lead.phone) ? <span className="inline-flex items-center gap-1"><Phone size={11} /> {textValue(lead.phone)}</span> : null}
                                  {textValue(lead.email) ? <span className="inline-flex items-center gap-1"><Mail size={11} /> {textValue(lead.email)}</span> : null}
                                  {lead.last_activity_at ? <span>Last activity · {dateTimeLabel(lead.last_activity_at)}</span> : null}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 xl:shrink-0">
                              <button type="button" onClick={() => void openLeadDetail(lead)} className="rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-orange-50">View</button>
                              <button type="button" onClick={() => openFollowupFromLead(lead)} className="inline-flex items-center gap-1.5 rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-orange-800 hover:bg-orange-50"><Clock3 size={13} /> Follow-up</button>
                              <select
                                value={textValue(lead.status, "new")}
                                onChange={(event) => void updateLead(numValue(lead.id, 0), { status: event.target.value }, `Status changed to ${titleCase(event.target.value)}.`)}
                                className="rounded-xl border border-orange-900/10 bg-white px-3 py-2 text-xs font-bold text-stone-700"
                                aria-label={`Update status for ${textValue(lead.name, "lead")}`}
                                disabled={loading.leadAction}
                              >
                                {LEAD_STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-900/10 bg-white px-4 py-3 text-xs text-stone-600">
                  <span>Page {leadsPage} of {leadsTotalPages}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={leadsPage <= 1} onClick={() => setLeadsPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
                    <button type="button" disabled={leadsPage >= leadsTotalPages} onClick={() => setLeadsPage((page) => Math.min(leadsTotalPages, page + 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronRight size={16} /></button>
                  </div>
                </div>
              </section>
            )}

            {tab === "followups" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Task queue</p>
                    <h1 className="mt-1 text-2xl font-black">Follow-ups</h1>
                    <p className="mt-1 text-sm text-stone-500">Work the next action first—overdue items appear before future tasks.</p>
                  </div>
                  <button type="button" onClick={() => setTab("leads")} className="rounded-xl border border-orange-900/10 bg-white px-4 py-3 text-xs font-bold text-orange-800 hover:bg-orange-50"><Search size={14} className="mr-1 inline" /> Find a Lead</button>
                </div>
                <div className="space-y-3">
                  {loading.followups ? <div className="rounded-3xl bg-white p-10 text-center"><RefreshCw className="mx-auto animate-spin text-orange-700" size={24} /></div> : followups.length === 0 ? (
                    <EmptyState icon={Clock3} title="No follow-ups in the current view" description="Schedule a follow-up from any lead so the next customer action is visible to the Sales team." />
                  ) : followups.map((item) => (
                    <div key={String(item.id)} className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-stone-900">{textValue(item.lead_name, "Lead")}</p>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClasses(item.effective_status ?? item.status)}`}>{titleCase(textValue(item.effective_status ?? item.status, "pending"))}</span>
                          </div>
                          <p className="mt-1 text-xs text-stone-500">{textValue(item.lead_number, `#${String(item.lead_id)}`)} · {titleCase(textValue(item.followup_type, "call"))}</p>
                          <p className="mt-2 text-sm font-bold text-orange-800">{dateTimeLabel(item.due_at)}</p>
                          {textValue(item.subject) ? <p className="mt-1 text-xs text-stone-500">{textValue(item.subject)}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {textValue(item.lead_phone) ? <a href={`tel:${encodeURIComponent(String(item.lead_phone))}`} className="inline-flex items-center gap-1.5 rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-orange-50"><Phone size={13} /> Call</a> : null}
                          <button type="button" onClick={() => { setFollowupForm({ ...DEFAULT_FOLLOWUP, leadId: numValue(item.lead_id, 0), subject: `Follow-up — ${textValue(item.lead_name, "Lead")}` }); setFollowupOpen(true); }} className="rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-orange-800 hover:bg-orange-50">New follow-up</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-900/10 bg-white px-4 py-3 text-xs text-stone-600">
                  <span>Page {followupPage} of {followupTotalPages}</span>
                  <div className="flex gap-2"><button type="button" disabled={followupPage <= 1} onClick={() => setFollowupPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronLeft size={16} /></button><button type="button" disabled={followupPage >= followupTotalPages} onClick={() => setFollowupPage((page) => Math.min(followupTotalPages, page + 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronRight size={16} /></button></div>
                </div>
              </section>
            )}

            {tab === "activities" && (
              <section className="space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Activity history</p>
                  <h1 className="mt-1 text-2xl font-black">Sales activities</h1>
                  <p className="mt-1 text-sm text-stone-500">Read-only history from the backend Sales activity ledger.</p>
                </div>
                <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                  {loading.activities ? <div className="p-10 text-center"><RefreshCw className="mx-auto animate-spin text-orange-700" size={24} /></div> : activities.length === 0 ? <EmptyState icon={Activity} title="No activity history" description="Recorded calls, WhatsApp touches, emails, meetings and renewal activities will appear here." /> : (
                    <div className="divide-y divide-orange-900/10">
                      {activities.map((item) => (
                        <div key={String(item.id)} className="p-5">
                          <div className="flex items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><Activity size={17} /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-stone-900">{titleCase(textValue(item.activity_type, "Activity"))}</p>
                                {item.lead_id ? <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600">{textValue(item.lead_number, `#${String(item.lead_id)}`)}</span> : null}
                              </div>
                              <p className="mt-1 text-sm text-stone-600">{textValue(item.lead_name, textValue(item.description, "Sales activity recorded."))}</p>
                              <p className="mt-1 text-xs text-stone-400">{dateTimeLabel(item.created_at)} · {textValue(item.sales_user_name, "Sales")}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-900/10 bg-white px-4 py-3 text-xs text-stone-600">
                  <span>Page {activitiesPage} of {activitiesTotalPages}</span>
                  <div className="flex gap-2"><button type="button" disabled={activitiesPage <= 1} onClick={() => setActivitiesPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronLeft size={16} /></button><button type="button" disabled={activitiesPage >= activitiesTotalPages} onClick={() => setActivitiesPage((page) => Math.min(activitiesTotalPages, page + 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronRight size={16} /></button></div>
                </div>
              </section>
            )}

            {tab === "payments" && (
              <section className="space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Commercial visibility</p>
                  <h1 className="mt-1 text-2xl font-black">Payments</h1>
                  <p className="mt-1 text-sm text-stone-500">Sales can monitor payment outcomes here; gateway verification, refunds and payment authority remain in the payment service.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card label="Gross paid" value={paiseToMoney(paymentTotals.gross_paid_amount ?? paymentTotals.gross_paid_paise)} sub="Settled payment value in the selected backend view" icon={CircleDollarSign} />
                  <Card label="Net paid" value={paiseToMoney(paymentTotals.net_paid_amount ?? paymentTotals.net_paid_paise)} sub="After recorded refunds" icon={IndianRupee} />
                  <Card label="Refunded" value={paiseToMoney(paymentTotals.refunded_amount ?? paymentTotals.refunded_paise)} sub="Recorded refund amount" icon={RefreshCw} />
                  <Card label="Payment records" value={numValue(paymentTotals.payment_count, 0)} sub="Operational payment rows returned by backend" icon={WalletCards} />
                </div>
                <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                  {loading.payments ? <div className="p-10 text-center"><RefreshCw className="mx-auto animate-spin text-orange-700" size={24} /></div> : payments.length === 0 ? <EmptyState icon={WalletCards} title="No payment records" description="Payment attempts and settlements will appear here when the backend ledger has activity." /> : (
                    <div className="divide-y divide-orange-900/10">
                      {payments.map((payment) => (
                        <div key={String(payment.id)} className="p-5">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-stone-900">{textValue(payment.payment_number, `Payment #${String(payment.id)}`)}</p>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClasses(payment.status)}`}>{titleCase(textValue(payment.status, "created"))}</span>
                              </div>
                              <p className="mt-1 text-xs text-stone-500">{textValue(payment.payer_name, "Customer")} · {textValue(payment.purpose, "payment")}</p>
                              <p className="mt-1 text-xs text-stone-400">{dateTimeLabel(payment.created_at)} · {textValue(payment.provider, "razorpay")}</p>
                            </div>
                            <div className="text-left lg:text-right">
                              <p className="text-lg font-black text-stone-900">{money(payment.amount, textValue(payment.currency, "INR"))}</p>
                              {textValue(payment.plan_name) ? <p className="text-xs text-stone-500">{textValue(payment.plan_name)}</p> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-900/10 bg-white px-4 py-3 text-xs text-stone-600">
                  <span>Page {paymentsPage} of {paymentsTotalPages}</span>
                  <div className="flex gap-2"><button type="button" disabled={paymentsPage <= 1} onClick={() => setPaymentsPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronLeft size={16} /></button><button type="button" disabled={paymentsPage >= paymentsTotalPages} onClick={() => setPaymentsPage((page) => Math.min(paymentsTotalPages, page + 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronRight size={16} /></button></div>
                </div>
              </section>
            )}

            {tab === "bookings" && (
              <section className="space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Operational visibility</p>
                  <h1 className="mt-1 text-2xl font-black">Bookings</h1>
                  <p className="mt-1 text-sm text-stone-500">Monitor booking status and payment state for sales coordination.</p>
                </div>
                <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                  {loading.bookings ? <div className="p-10 text-center"><RefreshCw className="mx-auto animate-spin text-orange-700" size={24} /></div> : bookings.length === 0 ? <EmptyState icon={CalendarCheck} title="No bookings in the current view" description="Booking records will appear here as customers request and confirm DivyaDhara services." /> : (
                    <div className="divide-y divide-orange-900/10">
                      {bookings.map((booking) => (
                        <div key={String(booking.id)} className="p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black">{textValue(booking.title, textValue(booking.booking_number, `Booking #${String(booking.id)}`))}</p>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClasses(booking.status)}`}>{titleCase(textValue(booking.status, "received"))}</span>
                              </div>
                              <p className="mt-1 text-xs text-stone-500">{textValue(booking.customer_name, "Customer")} · {titleCase(textValue(booking.kind, "booking"))}</p>
                              <p className="mt-1 text-xs text-stone-400">Payment: {titleCase(textValue(booking.payment_status, "unpaid"))} · {dateTimeLabel(booking.created_at)}</p>
                              {textValue(booking.pandit_name) || textValue(booking.temple_name) || textValue(booking.ashram_name) ? <p className="mt-1 text-xs text-orange-800">{textValue(booking.pandit_name) || textValue(booking.temple_name) || textValue(booking.ashram_name)}</p> : null}
                            </div>
                            <div className="flex items-center gap-3 lg:text-right">
                              <p className="text-lg font-black">{money(booking.amount, textValue(booking.currency, "INR"))}</p>
                              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600">{textValue(booking.booking_number, "—")}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-900/10 bg-white px-4 py-3 text-xs text-stone-600">
                  <span>Page {bookingsPage} of {bookingsTotalPages}</span>
                  <div className="flex gap-2"><button type="button" disabled={bookingsPage <= 1} onClick={() => setBookingsPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronLeft size={16} /></button><button type="button" disabled={bookingsPage >= bookingsTotalPages} onClick={() => setBookingsPage((page) => Math.min(bookingsTotalPages, page + 1))} className="rounded-xl border border-orange-900/10 p-2 disabled:opacity-40"><ChevronRight size={16} /></button></div>
                </div>
              </section>
            )}

            {tab === "renewals" && (
              <section className="space-y-5">
                <div className="rounded-[2rem] bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-6 text-white shadow-lg md:p-8">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200">Commercial opportunity queue</p>
                  <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                      <h1 className="text-3xl font-black">{renewalCount} subscriptions nearing renewal</h1>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-100/85">The backend identifies active Pandit, Temple and Ashram subscriptions expiring within 30 days. Use this signal for outreach—not for direct activation or payment mutation.</p>
                    </div>
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/10 text-orange-100 ring-1 ring-white/15"><TrendingUp size={26} /></span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6"><p className="text-xs font-bold text-stone-500">Renewal count</p><p className="mt-2 text-3xl font-black">{renewalCount}</p><p className="mt-1 text-xs text-stone-500">Across all commercial audiences</p></div>
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6"><p className="text-xs font-bold text-stone-500">Pandit / Temple / Ashram</p><p className="mt-2 text-sm font-black text-stone-900">Tracked together by backend</p><p className="mt-1 text-xs text-stone-500">The current Sales dashboard endpoint returns a combined renewal count.</p></div>
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6"><p className="text-xs font-bold text-stone-500">Next step</p><p className="mt-2 text-sm font-black text-orange-800">Open the lead pipeline</p><p className="mt-1 text-xs text-stone-500">Use customer/owner records and follow-up tasks to manage outreach.</p></div>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-6">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 text-orange-700" size={19} />
                    <div>
                      <h2 className="font-black">Business-rule protection</h2>
                      <p className="mt-1 text-sm leading-6 text-stone-600">Sales does not decide plan price, payment success, subscription activation or provider-side renewal state. Those remain authoritative in their dedicated backend services.</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {tab === "profile" && (
              <section className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Account</p>
                    <h1 className="mt-1 text-2xl font-black">My Sales profile</h1>
                    <p className="mt-1 text-sm text-stone-500">Keep your internal contact information current.</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800"><UserCheck size={14} /> {role === "super_admin" ? "Super Admin" : "Sales"}</span>
                </div>

                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="sales-name" className="mb-1.5 block text-xs font-bold text-stone-600">Name</label><input id="sales-name" value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} className={INPUT_CLASS} maxLength={150} /></div>
                  <div><label htmlFor="sales-email" className="mb-1.5 block text-xs font-bold text-stone-600">Email</label><input id="sales-email" value={textValue(user?.email)} readOnly className="w-full cursor-not-allowed rounded-xl border border-orange-900/10 bg-stone-50 px-3.5 py-3 text-sm text-stone-600" /></div>
                  <div><label htmlFor="sales-phone" className="mb-1.5 block text-xs font-bold text-stone-600">Phone</label><input id="sales-phone" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} className={INPUT_CLASS} maxLength={30} /></div>
                  <div><label htmlFor="sales-city" className="mb-1.5 block text-xs font-bold text-stone-600">City</label><input id="sales-city" value={profileForm.city} onChange={(event) => setProfileForm((current) => ({ ...current, city: event.target.value }))} className={INPUT_CLASS} maxLength={120} /></div>
                  <div><label htmlFor="sales-state" className="mb-1.5 block text-xs font-bold text-stone-600">State</label><input id="sales-state" value={profileForm.state} onChange={(event) => setProfileForm((current) => ({ ...current, state: event.target.value }))} className={INPUT_CLASS} maxLength={120} /></div>
                  <div><label htmlFor="sales-country" className="mb-1.5 block text-xs font-bold text-stone-600">Country</label><input id="sales-country" value={profileForm.country} onChange={(event) => setProfileForm((current) => ({ ...current, country: event.target.value }))} className={INPUT_CLASS} maxLength={100} /></div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <button type="button" onClick={resetProfileForm} disabled={loading.profile} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-orange-50 disabled:opacity-50">Reset</button>
                  <button type="button" onClick={() => void saveProfile()} disabled={loading.profile} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:opacity-60"><Settings size={15} /> {loading.profile ? "Saving…" : "Save Profile"}</button>
                </div>
              </section>
            )}

            {pageError && dashboard ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0 flex-1"><p className="font-bold">Some dashboard data may be stale</p><p className="mt-0.5">{pageError}</p></div>
                <button type="button" onClick={() => void refreshAll()} className="rounded-xl border border-amber-300 px-3 py-2 text-xs font-bold">Refresh</button>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {selectedLead ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-[#fffaf5] shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-orange-900/10 bg-[#fffaf5] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Lead detail</p>
                <h2 className="mt-1 truncate text-xl font-black">{textValue(selectedLead.name, "Lead")}</h2>
                <p className="mt-0.5 text-xs text-stone-500">{textValue(selectedLead.lead_number, `#${String(selectedLead.id)}`)} · {titleCase(textValue(selectedLead.lead_type, "general"))}</p>
              </div>
              <button type="button" onClick={() => { setSelectedLead(null); setLeadDetail(null); }} className="rounded-xl p-2 text-stone-500 hover:bg-orange-50" aria-label="Close lead details"><X size={18} /></button>
            </div>

            {leadDetailLoading ? (
              <div className="grid min-h-[400px] place-items-center"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-orange-700" size={24} /><p className="mt-3 text-sm text-stone-500">Loading lead details…</p></div></div>
            ) : (
              <div className="min-h-0 overflow-y-auto p-5 md:p-6">
                <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-orange-900/10"><p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Status</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusClasses(selectedLead.status)}`}>{titleCase(textValue(selectedLead.status, "new"))}</p></div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-orange-900/10"><p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Priority</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${priorityClasses(selectedLead.priority)}`}>{titleCase(textValue(selectedLead.priority, "normal"))}</p></div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-orange-900/10"><p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Temperature</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${temperatureClasses(selectedLead.lead_temperature)}`}>{titleCase(textValue(selectedLead.lead_temperature, "cold"))}</p></div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-orange-900/10"><p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Lead score</p><p className="mt-2 text-xl font-black">{numValue(selectedLead.lead_score, 0)}</p></div>
                    </div>

                    <div className="rounded-3xl border border-orange-900/10 bg-white p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Customer</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div><p className="text-xs font-bold text-stone-500">Phone</p><p className="mt-1 text-sm font-bold">{textValue(selectedLead.phone, "Not provided")}</p></div>
                        <div><p className="text-xs font-bold text-stone-500">Email</p><p className="mt-1 break-all text-sm font-bold">{textValue(selectedLead.email, "Not provided")}</p></div>
                        <div><p className="text-xs font-bold text-stone-500">Location</p><p className="mt-1 text-sm font-bold">{leadLocation(selectedLead) || "Not provided"}</p></div>
                        <div><p className="text-xs font-bold text-stone-500">Source</p><p className="mt-1 text-sm font-bold">{titleCase(textValue(selectedLead.source_type, "website"))}</p></div>
                      </div>
                      {textValue(selectedLead.message) ? <div className="mt-4 rounded-2xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">Message</p><p className="mt-1 text-sm leading-6 text-stone-700">{textValue(selectedLead.message)}</p></div> : null}
                    </div>

                    <div className="rounded-3xl border border-orange-900/10 bg-white p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Requested entity</p>
                      <p className="mt-2 text-lg font-black text-stone-900">{leadDisplayEntity(selectedLead)}</p>
                      <p className="mt-1 text-xs text-stone-500">{titleCase(textValue(selectedLead.lead_type, "general"))}</p>
                    </div>

                    <div className="rounded-3xl border border-orange-900/10 bg-white p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Lead controls</p><p className="mt-1 text-sm text-stone-500">Update only CRM fields that Sales is authorised to manage.</p></div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openFollowupFromLead(selectedLead)} className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 px-3 py-2.5 text-xs font-black text-orange-800 hover:bg-orange-50"><Clock3 size={14} /> Schedule follow-up</button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <select value={textValue(selectedLead.status, "new")} onChange={(event) => void updateLead(numValue(selectedLead.id, 0), { status: event.target.value }, `Status changed to ${titleCase(event.target.value)}.`)} className={SELECT_CLASS} disabled={loading.leadAction}><option value="">Status</option>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select>
                        <select value={textValue(selectedLead.priority, "normal")} onChange={(event) => void updateLead(numValue(selectedLead.id, 0), { priority: event.target.value }, `Priority changed to ${titleCase(event.target.value)}.`)} className={SELECT_CLASS} disabled={loading.leadAction}>{LEAD_PRIORITIES.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}</select>
                        <select value={textValue(selectedLead.lead_temperature, "cold")} onChange={(event) => void updateLead(numValue(selectedLead.id, 0), { temperature: event.target.value }, `Lead temperature changed to ${titleCase(event.target.value)}.`)} className={SELECT_CLASS} disabled={loading.leadAction}>{LEAD_TEMPERATURES.map((temperature) => <option key={temperature} value={temperature}>{titleCase(temperature)}</option>)}</select>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                        <select value={String(selectedLead.owner_user_id ?? "")} onChange={(event) => void updateLead(numValue(selectedLead.id, 0), { ownerUserId: event.target.value ? Number(event.target.value) : null }, event.target.value ? "Lead owner updated." : "Lead has been unassigned.")} className={SELECT_CLASS} disabled={loading.leadAction}>
                          <option value="">Unassigned</option>
                          {owners.filter((owner) => owner.status === "active").map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {titleCase(owner.role ?? "sales")}</option>)}
                        </select>
                        <div className="rounded-xl bg-orange-50 px-4 py-3 text-xs text-orange-900"><span className="font-bold">Current owner:</span> {textValue(selectedLead.owner_name, "Unassigned")}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-3xl border border-orange-900/10 bg-white p-5">
                      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Follow-up history</p><p className="mt-1 text-xs text-stone-500">{leadDetail?.followups?.length ?? 0} recorded</p></div><Clock3 className="text-orange-700" size={18} /></div>
                      <div className="mt-4 space-y-2.5">
                        {(leadDetail?.followups ?? []).slice(0, 8).map((item) => <div key={String(item.id)} className="rounded-2xl bg-stone-50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{titleCase(textValue(item.followup_type, "call"))}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClasses(item.status)}`}>{titleCase(textValue(item.status, "pending"))}</span></div><p className="mt-1 text-xs text-stone-500">{dateTimeLabel(item.due_at)}</p>{textValue(item.notes) ? <p className="mt-1 text-xs leading-5 text-stone-600">{textValue(item.notes)}</p> : null}</div>)}
                        {(leadDetail?.followups?.length ?? 0) === 0 ? <p className="text-sm text-stone-500">No follow-ups yet.</p> : null}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-orange-900/10 bg-white p-5">
                      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Communications</p><p className="mt-1 text-xs text-stone-500">Recent contact history</p></div><Send className="text-orange-700" size={18} /></div>
                      <div className="mt-4 space-y-2.5">
                        {(leadDetail?.communications ?? []).slice(0, 6).map((item) => <div key={String(item.id)} className="rounded-2xl border border-orange-900/10 p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-800">{titleCase(textValue(item.channel, "system"))}</span><span className="text-[11px] text-stone-400">{dateTimeLabel(item.occurred_at ?? item.created_at)}</span></div><p className="mt-2 text-xs leading-5 text-stone-700">{textValue(item.message, "Communication recorded.")}</p></div>)}
                        {(leadDetail?.communications?.length ?? 0) === 0 ? <p className="text-sm text-stone-500">No communication records yet.</p> : null}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-orange-900/10 bg-white p-5">
                      <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-orange-700" /><div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">Timeline</p><p className="mt-1 text-xs text-stone-500">Audit-friendly lead events</p></div></div>
                      <div className="mt-4 space-y-2.5">
                        {(leadDetail?.events ?? []).slice(0, 8).map((item) => <div key={String(item.id)} className="border-l-2 border-orange-200 pl-3"><p className="text-sm font-bold">{titleCase(textValue(item.event_type, "event"))}</p><p className="mt-0.5 text-xs text-stone-500">{dateTimeLabel(item.created_at)}</p>{textValue(item.notes) ? <p className="mt-0.5 text-xs text-stone-600">{textValue(item.notes)}</p> : null}</div>)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {createLeadOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-[#fffaf5] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-orange-900/10 bg-[#fffaf5] px-5 py-4">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Sales intake</p><h2 className="mt-1 text-xl font-black">Create new lead</h2></div>
              <button type="button" onClick={() => setCreateLeadOpen(false)} className="rounded-xl p-2 text-stone-500 hover:bg-orange-50"><X size={18} /></button>
            </div>
            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Name *</label><input value={createLeadForm.name} onChange={(event) => setCreateLeadForm((current) => ({ ...current, name: event.target.value }))} className={INPUT_CLASS} maxLength={150} autoFocus /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Phone</label><input value={createLeadForm.phone} onChange={(event) => setCreateLeadForm((current) => ({ ...current, phone: event.target.value }))} className={INPUT_CLASS} maxLength={30} placeholder="+91…" /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Email</label><input type="email" value={createLeadForm.email} onChange={(event) => setCreateLeadForm((current) => ({ ...current, email: event.target.value }))} className={INPUT_CLASS} maxLength={320} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">WhatsApp</label><input value={createLeadForm.whatsapp} onChange={(event) => setCreateLeadForm((current) => ({ ...current, whatsapp: event.target.value }))} className={INPUT_CLASS} maxLength={30} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Lead type</label><select value={createLeadForm.leadType} onChange={(event) => setCreateLeadForm((current) => ({ ...current, leadType: event.target.value as LeadType }))} className={SELECT_CLASS}>{LEAD_TYPES.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</select></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Source</label><select value={createLeadForm.sourceType} onChange={(event) => setCreateLeadForm((current) => ({ ...current, sourceType: event.target.value }))} className={SELECT_CLASS}>{["phone","whatsapp","website","form","organic_search","paid_search","social","email","referral","direct","video","gallery","seo_landing","admin"].map((source) => <option key={source} value={source}>{titleCase(source)}</option>)}</select></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Priority</label><select value={createLeadForm.priority} onChange={(event) => setCreateLeadForm((current) => ({ ...current, priority: event.target.value as LeadPriority }))} className={SELECT_CLASS}>{LEAD_PRIORITIES.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}</select></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Temperature</label><select value={createLeadForm.temperature} onChange={(event) => setCreateLeadForm((current) => ({ ...current, temperature: event.target.value as LeadTemperature }))} className={SELECT_CLASS}>{LEAD_TEMPERATURES.map((temperature) => <option key={temperature} value={temperature}>{titleCase(temperature)}</option>)}</select></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Service type</label><input value={createLeadForm.serviceType} onChange={(event) => setCreateLeadForm((current) => ({ ...current, serviceType: event.target.value }))} className={INPUT_CLASS} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Puja type</label><input value={createLeadForm.pujaType} onChange={(event) => setCreateLeadForm((current) => ({ ...current, pujaType: event.target.value }))} className={INPUT_CLASS} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">City</label><input value={createLeadForm.city} onChange={(event) => setCreateLeadForm((current) => ({ ...current, city: event.target.value }))} className={INPUT_CLASS} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">District</label><input value={createLeadForm.district} onChange={(event) => setCreateLeadForm((current) => ({ ...current, district: event.target.value }))} className={INPUT_CLASS} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">State</label><input value={createLeadForm.state} onChange={(event) => setCreateLeadForm((current) => ({ ...current, state: event.target.value }))} className={INPUT_CLASS} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Country</label><input value={createLeadForm.country} onChange={(event) => setCreateLeadForm((current) => ({ ...current, country: event.target.value }))} className={INPUT_CLASS} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Preferred date</label><input type="date" value={createLeadForm.preferredDate} onChange={(event) => setCreateLeadForm((current) => ({ ...current, preferredDate: event.target.value }))} className={INPUT_CLASS} /></div>
                <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Preferred time</label><input type="time" value={createLeadForm.preferredTime} onChange={(event) => setCreateLeadForm((current) => ({ ...current, preferredTime: event.target.value }))} className={INPUT_CLASS} /></div>
              </div>

              <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
                <div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 text-orange-700" /><div><p className="text-sm font-black">Ownership</p><p className="mt-0.5 text-xs leading-5 text-stone-500">By default this lead is assigned to you. The backend validates the target Sales/Super Admin user.</p></div></div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-xs font-bold text-stone-700"><input type="checkbox" checked={createLeadForm.assignToMe} onChange={(event) => setCreateLeadForm((current) => ({ ...current, assignToMe: event.target.checked }))} className="h-4 w-4 accent-orange-700" /> Assign this lead to me</label>
              </div>

              <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Primary business entity (optional)</label><div className="grid gap-3 sm:grid-cols-[.8fr_1.2fr]"><select value={createLeadForm.entityType} onChange={(event) => setCreateLeadForm((current) => ({ ...current, entityType: event.target.value as CreateLeadForm["entityType"], entityId: "" }))} className={SELECT_CLASS}><option value="">No entity</option><option value="temple">Temple</option><option value="pandit">Pandit</option><option value="ashram">Ashram</option><option value="puja">Puja Service</option><option value="yatra">Yatra Package</option><option value="event">Event</option><option value="course">Course</option><option value="spiritual_place">Spiritual Place</option></select><input inputMode="numeric" placeholder="Enter entity ID" value={createLeadForm.entityId} onChange={(event) => setCreateLeadForm((current) => ({ ...current, entityId: event.target.value.replace(/\D/g, "") }))} className={INPUT_CLASS} disabled={!createLeadForm.entityType} /></div><p className="mt-1.5 text-[11px] text-stone-400">The backend validates that the selected record exists. Only one primary entity can be attached to a lead.</p></div>

              <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Message / notes</label><textarea rows={5} maxLength={10000} value={createLeadForm.message} onChange={(event) => setCreateLeadForm((current) => ({ ...current, message: event.target.value }))} className={INPUT_CLASS} placeholder="What does the customer need?" /></div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-orange-900/10 pt-4">
                <button type="button" onClick={() => setCreateLeadOpen(false)} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-white">Cancel</button>
                <button type="button" disabled={loading.leadAction} onClick={() => void submitCreateLead()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:opacity-60"><Plus size={15} /> {loading.leadAction ? "Creating…" : "Create Lead"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {followupOpen ? (
        <div className="fixed inset-0 z-[55] grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-3xl bg-[#fffaf5] shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-orange-900/10 px-5 py-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Next action</p><h2 className="mt-1 text-xl font-black">Schedule follow-up</h2></div><button type="button" onClick={() => setFollowupOpen(false)} className="rounded-xl p-2 text-stone-500 hover:bg-orange-50"><X size={18} /></button></div>
            <div className="space-y-4 p-5">
              <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Follow-up date & time *</label><input type="datetime-local" value={followupForm.dueAt} onChange={(event) => setFollowupForm((current) => ({ ...current, dueAt: event.target.value }))} className={INPUT_CLASS} /></div>
              <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Type</label><select value={followupForm.followupType} onChange={(event) => setFollowupForm((current) => ({ ...current, followupType: event.target.value as FollowupType }))} className={SELECT_CLASS}>{FOLLOWUP_TYPES.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</select></div>
              <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Subject</label><input value={followupForm.subject} onChange={(event) => setFollowupForm((current) => ({ ...current, subject: event.target.value }))} className={INPUT_CLASS} maxLength={250} /></div>
              <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Notes</label><textarea rows={4} value={followupForm.notes} onChange={(event) => setFollowupForm((current) => ({ ...current, notes: event.target.value }))} className={INPUT_CLASS} maxLength={5000} /></div>
              <div className="rounded-2xl bg-orange-50 p-3 text-xs leading-5 text-orange-900"><p className="font-bold">Sales workflow</p><p className="mt-0.5">The follow-up is created against the selected lead. The backend controls authorization and assignment rules.</p></div>
              <div className="flex justify-end gap-2 border-t border-orange-900/10 pt-4"><button type="button" onClick={() => setFollowupOpen(false)} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-stone-700">Cancel</button><button type="button" disabled={loading.followup} onClick={() => void submitFollowup()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:opacity-60"><CalendarCheck size={15} /> {loading.followup ? "Saving…" : "Schedule"}</button></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
