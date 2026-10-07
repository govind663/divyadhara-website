/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  Activity,
  AlertCircle,
  BadgeCheck,
  Bell,
  Building2,
  Check,
  Clock3,
  Crown,
  Database,
  Eye,
  FileClock,
  Filter,
  IndianRupee,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  RefreshCw,
  Search,
  ServerCog,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
  TicketCheck,
  TrendingUp,
  UserCheck,
  UserCog,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import {
  adminApi,
  ApiError,
  type AuthRole,
  type AuthStatus,
} from "../lib/api";

import { useApp } from "../context/AppContext";
import { useSEO } from "../lib/seo";
import { cx } from "../lib/utils";

/* ============================================================================
 * TYPES
 * ========================================================================== */

type TabId =
  | "overview"
  | "users"
  | "pandits"
  | "temple-managers"
  | "sales"
  | "plans"
  | "leads"
  | "subscriptions"
  | "temples"
  | "settings"
  | "audit";

type GenericRecord = Record<string, unknown>;

type ModalType =
  | "user"
  | "pandit"
  | "manager"
  | "sales"
  | "plan"
  | "reject"
  | null;

type RejectTarget =
  | "pandit"
  | "manager"
  | null;

type NoticeType =
  | "success"
  | "error"
  | "info";

type BackendStatus =
  | "checking"
  | "connected"
  | "degraded";

type DashboardStats = {
  totalUsers: number;
  totalVisitors: number;
  totalPandits: number;
  totalTempleManagers: number;
  totalSalesUsers: number;
  pendingPandits: number;
  pendingTempleManagers: number;
  openLeads: number;
  activeSubscriptions: number;
  activeTemples: number;
  featuredPandits: number;
  revenue: number;
};

type SalesForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

type PlanForm = {
  name: string;
  code: string;
  priceAmount: string;
  currency: string;
  leadLimit: string;
  durationDays: string;
  listingEnabled: boolean;
  featured: boolean;
  prioritySupport: boolean;
  isActive: boolean;
};

/* ============================================================================
 * CONSTANTS
 * ========================================================================== */

const DEFAULT_DASHBOARD: DashboardStats = {
  totalUsers: 0,
  totalVisitors: 0,
  totalPandits: 0,
  totalTempleManagers: 0,
  totalSalesUsers: 0,
  pendingPandits: 0,
  pendingTempleManagers: 0,
  openLeads: 0,
  activeSubscriptions: 0,
  activeTemples: 0,
  featuredPandits: 0,
  revenue: 0,
};

const EMPTY_SALES_FORM: SalesForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
};

const EMPTY_PLAN_FORM: PlanForm = {
  name: "",
  code: "",
  priceAmount: "",
  currency: "INR",
  leadLimit: "",
  durationDays: "30",
  listingEnabled: true,
  featured: false,
  prioritySupport: false,
  isActive: true,
};

const NAV_ITEMS: Array<{
  id: TabId;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
  },
  {
    id: "pandits",
    label: "Pandits",
    icon: UserCheck,
  },
  {
    id: "temple-managers",
    label: "Temple Managers",
    icon: Building2,
  },
  {
    id: "sales",
    label: "Sales Team",
    icon: TrendingUp,
  },
  {
    id: "plans",
    label: "Subscription Plans",
    icon: Crown,
  },
  {
    id: "leads",
    label: "Leads",
    icon: TicketCheck,
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    icon: Sparkles,
  },
  {
    id: "temples",
    label: "Temples",
    icon: Store,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
  {
    id: "audit",
    label: "Audit Logs",
    icon: FileClock,
  },
];

const ROLE_OPTIONS: Array<{
  value: AuthRole | "";
  label: string;
}> = [
  {
    value: "",
    label: "All roles",
  },
  {
    value: "visitor",
    label: "Visitor",
  },
  {
    value: "pandit",
    label: "Pandit",
  },
  {
    value: "temple_manager",
    label: "Temple Manager",
  },
  {
    value: "sales",
    label: "Sales",
  },
  {
    value: "super_admin",
    label: "Super Admin",
  },
];

const STATUS_OPTIONS: Array<{
  value: AuthStatus | "";
  label: string;
}> = [
  {
    value: "",
    label: "All status",
  },
  {
    value: "pending",
    label: "Pending",
  },
  {
    value: "active",
    label: "Active",
  },
  {
    value: "suspended",
    label: "Suspended",
  },
  {
    value: "rejected",
    label: "Rejected",
  },
  {
    value: "blocked",
    label: "Blocked",
  },
];

/* ============================================================================
 * GENERIC HELPERS
 * ========================================================================== */

function asRecord(
  value: unknown,
): GenericRecord {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as GenericRecord;
  }

  return {};
}

function readString(
  record: GenericRecord,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return String(value);
    }
  }

  return fallback;
}

function readNumber(
  record: GenericRecord,
  keys: string[],
  fallback = 0,
): number {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      const parsed = Number(value);

      if (
        Number.isFinite(parsed)
      ) {
        return parsed;
      }
    }
  }

  return fallback;
}

function readBoolean(
  record: GenericRecord,
  keys: string[],
  fallback = false,
): boolean {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value === 1;
    }

    if (typeof value === "string") {
      const normalized =
        value.trim().toLowerCase();

      if (
        normalized === "true" ||
        normalized === "1" ||
        normalized === "yes"
      ) {
        return true;
      }

      if (
        normalized === "false" ||
        normalized === "0" ||
        normalized === "no"
      ) {
        return false;
      }
    }
  }

  return fallback;
}

function readValue(
  record: GenericRecord,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function rowsFromResponse(
  payload: unknown,
  preferredKeys: string[] = [],
): GenericRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(asRecord);
  }

  const root =
    asRecord(payload);

  for (const key of preferredKeys) {
    const value =
      root[key];

    if (Array.isArray(value)) {
      return value.map(asRecord);
    }
  }

  const commonKeys = [
    "items",
    "rows",
    "results",
    "records",
    "users",
    "pandits",
    "templeManagers",
    "managers",
    "plans",
    "leads",
    "subscriptions",
    "temples",
    "logs",
    "auditLogs",
  ];

  for (const key of commonKeys) {
    const value =
      root[key];

    if (Array.isArray(value)) {
      return value.map(asRecord);
    }
  }

  return [];
}

function dashboardFromResponse(
  payload: unknown,
): DashboardStats {
  const root =
    asRecord(payload);

  const nestedCandidates = [
    root.stats,
    root.statistics,
    root.dashboard,
    root.data,
  ];

  let source = root;

  for (
    const candidate of
      nestedCandidates
  ) {
    const record =
      asRecord(candidate);

    if (
      Object.keys(record)
        .length > 0
    ) {
      source = record;
      break;
    }
  }

  return {
    totalUsers:
      readNumber(
        source,
        [
          "totalUsers",
          "users",
          "usersCount",
          "total_users",
        ],
      ),

    totalVisitors:
      readNumber(
        source,
        [
          "totalVisitors",
          "visitors",
          "visitorCount",
          "total_visitors",
        ],
      ),

    totalPandits:
      readNumber(
        source,
        [
          "totalPandits",
          "pandits",
          "panditCount",
          "total_pandits",
        ],
      ),

    totalTempleManagers:
      readNumber(
        source,
        [
          "totalTempleManagers",
          "templeManagers",
          "templeManagerCount",
          "total_temple_managers",
        ],
      ),

    totalSalesUsers:
      readNumber(
        source,
        [
          "totalSalesUsers",
          "salesUsers",
          "sales",
          "salesCount",
        ],
      ),

    pendingPandits:
      readNumber(
        source,
        [
          "pendingPandits",
          "panditsPending",
          "pending_pandits",
        ],
      ),

    pendingTempleManagers:
      readNumber(
        source,
        [
          "pendingTempleManagers",
          "templeManagersPending",
          "pending_temple_managers",
        ],
      ),

    openLeads:
      readNumber(
        source,
        [
          "openLeads",
          "leads",
          "open_leads",
        ],
      ),

    activeSubscriptions:
      readNumber(
        source,
        [
          "activeSubscriptions",
          "subscriptions",
          "active_subscriptions",
        ],
      ),

    activeTemples:
      readNumber(
        source,
        [
          "activeTemples",
          "temples",
          "active_temples",
        ],
      ),

    featuredPandits:
      readNumber(
        source,
        [
          "featuredPandits",
          "featured_pandits",
        ],
      ),

    revenue:
      readNumber(
        source,
        [
          "revenue",
          "totalRevenue",
          "subscriptionRevenue",
          "total_revenue",
        ],
      ),
  };
}

function humanize(
  value: string,
): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase(),
    );
}

function initials(
  value: string,
): string {
  const parts =
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length === 0
  ) {
    return "DD";
  }

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    `${parts[0][0]}${parts[parts.length - 1][0]}`
  ).toUpperCase();
}

function formatMoney(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function formatDate(
  value: unknown,
): string {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function getApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    error instanceof ApiError
  ) {
    return (
      error.message ||
      fallback
    );
  }

  if (
    error instanceof Error
  ) {
    return (
      error.message ||
      fallback
    );
  }

  return fallback;
}

/* ============================================================================
 * UI COMPONENTS
 * ========================================================================== */

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status
      .trim()
      .toLowerCase();

  const classes =
    normalized === "active" ||
    normalized === "approved" ||
    normalized === "paid" ||
    normalized === "completed"
      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
      : normalized === "pending" ||
          normalized === "processing" ||
          normalized === "open"
        ? "bg-amber-100 text-amber-800 ring-amber-200"
        : normalized ===
              "rejected" ||
            normalized === "blocked" ||
            normalized === "cancelled" ||
            normalized === "failed"
          ? "bg-rose-100 text-rose-800 ring-rose-200"
          : normalized ===
                "suspended" ||
              normalized === "inactive"
            ? "bg-stone-200 text-stone-700 ring-stone-300"
            : "bg-sky-100 text-sky-800 ring-sky-200";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1",
        classes,
      )}
    >
      {humanize(
        status || "unknown",
      )}
    </span>
  );
}

function RoleBadge({
  role,
}: {
  role: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-900 ring-1 ring-orange-200">
      <ShieldCheck size={11} />
      {humanize(role)}
    </span>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#2a1a10] md:text-2xl">
          {title}
        </h2>

        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <div className="shrink-0">
          {action}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "orange",
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Users;
  accent?:
    | "orange"
    | "emerald"
    | "blue"
    | "violet"
    | "amber";
  onClick?: () => void;
}) {
  const iconClasses =
    accent === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : accent === "blue"
        ? "bg-sky-100 text-sky-800"
        : accent === "violet"
          ? "bg-violet-100 text-violet-800"
          : accent === "amber"
            ? "bg-amber-100 text-amber-800"
            : "bg-orange-100 text-orange-800";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cx(
        "group w-full rounded-3xl border border-orange-900/10 bg-white p-5 text-left shadow-[0_10px_30px_rgba(43,27,15,0.05)] transition",
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg"
          : "cursor-default",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            {label}
          </p>

          <p className="mt-3 font-display text-3xl font-bold text-[#2a1a10]">
            {value}
          </p>

          <p className="mt-1 text-xs text-stone-500">
            {sub}
          </p>
        </div>

        <span
          className={cx(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
            iconClasses,
          )}
        >
          <Icon size={20} />
        </span>
      </div>
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-orange-900/15 bg-orange-50/40 px-6 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-orange-700 ring-1 ring-orange-200">
        <Database size={20} />
      </div>

      <h3 className="mt-4 font-display text-lg font-semibold text-[#2a1a10]">
        {title}
      </h3>

      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-stone-500">
        {description}
      </p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-stone-600">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-xl border border-orange-900/15 bg-white px-3.5 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-stone-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLSelectElement>,
  ) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-stone-600">
        {label}
      </span>

      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full rounded-xl border border-orange-900/15 bg-white px-3.5 py-3 text-sm text-stone-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-stone-100"
      >
        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {option.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  description,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-orange-900/10 bg-white p-4 text-left transition hover:border-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-stone-800">
          {label}
        </span>

        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-stone-500">
            {description}
          </span>
        ) : null}
      </span>

      <span
        className={cx(
          "relative h-6 w-11 shrink-0 rounded-full transition",
          checked
            ? "bg-orange-600"
            : "bg-stone-300",
        )}
      >
        <span
          className={cx(
            "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition",
            checked
              ? "left-6"
              : "left-1",
          )}
        />
      </span>
    </button>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-900/10 bg-[#fbf6ef] px-5 py-4 md:px-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
          DivyaDhara Admin
        </p>

        <h2 className="mt-1 font-display text-xl font-semibold text-[#2a1a10]">
          {title}
        </h2>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="grid h-10 w-10 place-items-center rounded-xl border border-orange-900/10 bg-white text-stone-600 hover:bg-orange-50"
        aria-label="Close dialog"
      >
        <X size={17} />
      </button>
    </div>
  );
}

function isSensitiveKey(
  key: string,
): boolean {
  const normalized =
    key
      .trim()
      .toLowerCase()
      .replace(/[-\s]/g, "_");

  const sensitiveTerms = [
    "password",
    "password_hash",
    "token",
    "token_hash",
    "access_token",
    "refresh_token",
    "api_key",
    "secret",
    "secret_key",
    "otp",
    "otp_secret",
    "reset_token",
  ];

  return sensitiveTerms.some(
    (term) =>
      normalized === term ||
      normalized.includes(
        term,
      ),
  );
}

function RecordDetail({
  record,
}: {
  record: GenericRecord | null;
}) {
  if (!record) {
    return (
      <div className="p-6">
        <EmptyState
          title="No record selected"
          description="The requested record is not available."
        />
      </div>
    );
  }

  const entries =
    Object.entries(
      record,
    ).filter(
      ([key]) =>
        !isSensitiveKey(
          key,
        ),
    );

  return (
    <div className="p-5 md:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(
          ([key, value]) => {
            let display = "—";

            if (
              typeof value ===
                "string" ||
              typeof value ===
                "number" ||
              typeof value ===
                "boolean"
            ) {
              display =
                String(value);
            } else if (
              value !== null &&
              value !== undefined
            ) {
              try {
                display =
                  JSON.stringify(
                    value,
                  );
              } catch {
                display =
                  String(value);
              }
            }

            return (
              <div
                key={key}
                className="rounded-2xl border border-orange-900/10 bg-white p-4"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700">
                  {humanize(key)}
                </p>

                <p className="mt-1 break-words text-sm font-semibold leading-6 text-stone-800">
                  {display}
                </p>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * MAIN ADMIN DASHBOARD
 * ========================================================================== */

export default function AdminDashboard() {
  useSEO({
    title:
      "Super Admin Dashboard | DivyaDhara",
    description:
      "Manage DivyaDhara users, Pandits, Temple Managers, sales, subscriptions, leads, temples, settings and audit activity.",
    path: "/admin/dashboard",
  });

  const {
    user,
    isLoading: authLoading,
    logout,
  } = useApp();

  const navigate =
    useNavigate();

  const [activeTab, setActiveTab] =
    useState<TabId>(
      "overview",
    );

  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [backendStatus, setBackendStatus] =
    useState<BackendStatus>(
      "checking",
    );

  const [actionKey, setActionKey] =
    useState<string | null>(
      null,
    );

  const [notice, setNotice] =
    useState<{
      type: NoticeType;
      message: string;
    } | null>(null);

  const [dashboard, setDashboard] =
    useState<DashboardStats>(
      DEFAULT_DASHBOARD,
    );

  const [users, setUsers] =
    useState<GenericRecord[]>(
      [],
    );

  const [pandits, setPandits] =
    useState<GenericRecord[]>(
      [],
    );

  const [
    templeManagers,
    setTempleManagers,
  ] = useState<GenericRecord[]>(
    [],
  );

  const [plans, setPlans] =
    useState<GenericRecord[]>(
      [],
    );

  const [leads, setLeads] =
    useState<GenericRecord[]>(
      [],
    );

  const [
    subscriptions,
    setSubscriptions,
  ] = useState<GenericRecord[]>(
    [],
  );

  const [temples, setTemples] =
    useState<GenericRecord[]>(
      [],
    );

  const [settings, setSettings] =
    useState<GenericRecord>({});

  const [
    auditLogs,
    setAuditLogs,
  ] = useState<GenericRecord[]>(
    [],
  );

  const [userSearch, setUserSearch] =
    useState("");

  const [
    userRoleFilter,
    setUserRoleFilter,
  ] = useState<
    AuthRole | ""
  >("");

  const [
    userStatusFilter,
    setUserStatusFilter,
  ] = useState<
    AuthStatus | ""
  >("");

  const [
    panditSearch,
    setPanditSearch,
  ] = useState("");

  const [
    panditStatusFilter,
    setPanditStatusFilter,
  ] = useState("");

  const [
    managerSearch,
    setManagerSearch,
  ] = useState("");

  const [leadSearch, setLeadSearch] =
    useState("");

  const [
    leadStatusFilter,
    setLeadStatusFilter,
  ] = useState("");

  const [
    subscriptionSearch,
    setSubscriptionSearch,
  ] = useState("");

  const [
    templeSearch,
    setTempleSearch,
  ] = useState("");

  const [
    auditSearch,
    setAuditSearch,
  ] = useState("");

  const [
    modalType,
    setModalType,
  ] = useState<ModalType>(null);

  const [
    selectedRecord,
    setSelectedRecord,
  ] = useState<GenericRecord | null>(
    null,
  );

  const [
    rejectTarget,
    setRejectTarget,
  ] = useState<RejectTarget>(
    null,
  );

  const [
    rejectReason,
    setRejectReason,
  ] = useState("");

  const [salesForm, setSalesForm] =
    useState<SalesForm>(
      EMPTY_SALES_FORM,
    );

  const [planForm, setPlanForm] =
    useState<PlanForm>(
      EMPTY_PLAN_FORM,
    );

  /* --------------------------------------------------------------------------
   * NOTICE
   * ---------------------------------------------------------------------- */

  const showNotice =
    useCallback(
      (
        type: NoticeType,
        message: string,
      ) => {
        setNotice({
          type,
          message,
        });

        window.setTimeout(
          () => {
            setNotice(null);
          },
          5000,
        );
      },
      [],
    );

  /* --------------------------------------------------------------------------
   * DATA LOADERS
   * ---------------------------------------------------------------------- */

  const loadDashboard =
    useCallback(
      async () => {
        const response =
          await adminApi.dashboard<unknown>();

        setDashboard(
          dashboardFromResponse(
            response,
          ),
        );
      },
      [],
    );

  const loadUsers =
    useCallback(
      async () => {
        const response =
          await adminApi.users<unknown>(
            {
              page: 1,
              limit: 100,
            },
          );

        setUsers(
          rowsFromResponse(
            response,
            ["users"],
          ),
        );
      },
      [],
    );

  const loadPandits =
    useCallback(
      async () => {
        const response =
          await adminApi.pandits<unknown>(
            {
              page: 1,
              limit: 100,
            },
          );

        setPandits(
          rowsFromResponse(
            response,
            ["pandits"],
          ),
        );
      },
      [],
    );

  const loadManagers =
    useCallback(
      async () => {
        const response =
          await adminApi.templeManagers<unknown>(
            {
              page: 1,
              limit: 100,
            },
          );

        setTempleManagers(
          rowsFromResponse(
            response,
            [
              "templeManagers",
              "managers",
            ],
          ),
        );
      },
      [],
    );

  const loadPlans =
    useCallback(
      async () => {
        const response =
          await adminApi.plans<unknown>();

        setPlans(
          rowsFromResponse(
            response,
            ["plans"],
          ),
        );
      },
      [],
    );

  const loadLeads =
    useCallback(
      async () => {
        const response =
          await adminApi.leads<unknown>(
            {
              page: 1,
              limit: 100,
            },
          );

        setLeads(
          rowsFromResponse(
            response,
            ["leads"],
          ),
        );
      },
      [],
    );

  const loadSubscriptions =
    useCallback(
      async () => {
        const response =
          await adminApi.subscriptions<unknown>(
            {
              page: 1,
              limit: 100,
            },
          );

        setSubscriptions(
          rowsFromResponse(
            response,
            ["subscriptions"],
          ),
        );
      },
      [],
    );

  const loadTemples =
    useCallback(
      async () => {
        const response =
          await adminApi.temples<unknown>(
            {
              page: 1,
              limit: 100,
            },
          );

        setTemples(
          rowsFromResponse(
            response,
            ["temples"],
          ),
        );
      },
      [],
    );

  const loadSettings =
    useCallback(
      async () => {
        const response =
          await adminApi.settings<unknown>();

        const root =
          asRecord(response);

        const nested =
          asRecord(
            root.settings ??
              root.data,
          );

        setSettings(
          Object.keys(nested)
            .length > 0
            ? nested
            : root,
        );
      },
      [],
    );

  const loadAuditLogs =
    useCallback(
      async () => {
        const response =
          await adminApi.auditLogs<unknown>(
            {
              page: 1,
              limit: 100,
            },
          );

        setAuditLogs(
          rowsFromResponse(
            response,
            [
              "auditLogs",
              "logs",
            ],
          ),
        );
      },
      [],
    );

  const refreshCore =
    useCallback(
      async () => {
        await Promise.allSettled([
          loadDashboard(),
          loadUsers(),
          loadPandits(),
          loadManagers(),
          loadPlans(),
          loadLeads(),
          loadSubscriptions(),
          loadTemples(),
          loadSettings(),
          loadAuditLogs(),
        ]);
      },
      [
        loadDashboard,
        loadUsers,
        loadPandits,
        loadManagers,
        loadPlans,
        loadLeads,
        loadSubscriptions,
        loadTemples,
        loadSettings,
        loadAuditLogs,
      ],
    );

  const loadAll =
    useCallback(
      async (
        showLoading = true,
      ) => {
        if (showLoading) {
          setLoading(true);
        }

        setBackendStatus(
          "checking",
        );

        try {
          const results =
            await Promise.allSettled([
              loadDashboard(),
              loadUsers(),
              loadPandits(),
              loadManagers(),
              loadPlans(),
              loadLeads(),
              loadSubscriptions(),
              loadTemples(),
              loadSettings(),
              loadAuditLogs(),
            ]);

          const failures =
            results.filter(
              (
                result,
              ) =>
                result.status ===
                "rejected",
            ).length;

          if (
            failures ===
            0
          ) {
            setBackendStatus(
              "connected",
            );
          } else {
            setBackendStatus(
              "degraded",
            );
          }

          if (
            failures ===
            results.length
          ) {
            showNotice(
              "error",
              "Unable to load admin data. Check the backend server and Super Admin session.",
            );
          } else if (
            failures > 0
          ) {
            showNotice(
              "info",
              `${failures} admin section(s) could not be loaded.`,
            );
          }
        } catch (
          error
        ) {
          console.error(
            "Admin load error:",
            error,
          );

          setBackendStatus(
            "degraded",
          );

          showNotice(
            "error",
            "Unable to load admin dashboard.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        loadDashboard,
        loadUsers,
        loadPandits,
        loadManagers,
        loadPlans,
        loadLeads,
        loadSubscriptions,
        loadTemples,
        loadSettings,
        loadAuditLogs,
        showNotice,
      ],
    );

  /* --------------------------------------------------------------------------
   * SESSION GUARD
   * ---------------------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      navigate(
        "/login",
        {
          replace: true,
        },
      );

      return;
    }

    if (
      user.role !==
      "super_admin"
    ) {
      navigate(
        "/",
        {
          replace: true,
        },
      );

      return;
    }

    void loadAll(true);
  }, [
    authLoading,
    user,
    navigate,
    loadAll,
  ]);

  /* --------------------------------------------------------------------------
   * ACTIONS
   * ---------------------------------------------------------------------- */

  const handleRefresh =
    async () => {
      setRefreshing(true);
      await loadAll(false);
    };

  const handleLogout =
    async () => {
      try {
        await logout();
      } finally {
        navigate(
          "/",
          {
            replace: true,
          },
        );
      }
    };

  const handleUserStatus =
    async (
      userId: number,
      status: AuthStatus,
    ) => {
      if (!userId) {
        showNotice(
          "error",
          "Invalid user ID.",
        );
        return;
      }

      const key =
        `user-status-${userId}`;

      if (actionKey) {
        return;
      }

      setActionKey(key);

      try {
        await adminApi.updateUserStatus(
          userId,
          {
            status,
          },
        );

        showNotice(
          "success",
          `User status changed to ${humanize(status)}.`,
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to update user status.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  /* --------------------------------------------------------------------------
   * PANDIT APPROVAL
   *
   * IMPORTANT:
   * Admin API identifies a Pandit by `pandit_profiles.id`, NOT users.id.
   * ---------------------------------------------------------------------- */

  const handleApprovePandit =
    async (
      panditId: number,
    ) => {
      if (!panditId) {
        showNotice(
          "error",
          "Invalid Pandit profile ID.",
        );
        return;
      }

      if (actionKey) {
        return;
      }

      const confirmed =
        window.confirm(
          "Approve this Pandit profile?\n\nThe profile will become verified and the user account will become active. Listing remains hidden until explicitly activated.",
        );

      if (!confirmed) {
        return;
      }

      const key =
        `pandit-approve-${panditId}`;

      setActionKey(key);

      try {
        await adminApi.approvePandit(
          panditId,
        );

        showNotice(
          "success",
          "Pandit approved successfully.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to approve Pandit.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const handleRejectPandit =
    async () => {
      if (!selectedRecord) {
        return;
      }

      const panditId =
        readNumber(
          selectedRecord,
          [
            "id",
            "pandit_id",
            "panditId",
          ],
          0,
        );

      if (!panditId) {
        showNotice(
          "error",
          "Pandit profile ID not found.",
        );
        return;
      }

      const reason =
        rejectReason.trim();

      if (
        reason.length <
        5
      ) {
        showNotice(
          "error",
          "Please provide a meaningful rejection reason.",
        );
        return;
      }

      if (actionKey) {
        return;
      }

      const key =
        `pandit-reject-${panditId}`;

      setActionKey(key);

      try {
        await adminApi.rejectPandit(
          panditId,
          {
            reason,
          },
        );

        setModalType(null);
        setSelectedRecord(
          null,
        );
        setRejectTarget(
          null,
        );
        setRejectReason(
          "",
        );

        showNotice(
          "success",
          "Pandit application rejected.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to reject Pandit.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const handleApproveManager =
    async (
      userId: number,
    ) => {
      if (!userId) {
        showNotice(
          "error",
          "Invalid Temple Manager user ID.",
        );
        return;
      }

      if (actionKey) {
        return;
      }

      const confirmed =
        window.confirm(
          "Approve this Temple Manager account?",
        );

      if (!confirmed) {
        return;
      }

      const key =
        `manager-approve-${userId}`;

      setActionKey(key);

      try {
        await adminApi.approveTempleManager(
          userId,
        );

        showNotice(
          "success",
          "Temple Manager approved successfully.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to approve Temple Manager.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const handleRejectManager =
    async () => {
      if (!selectedRecord) {
        return;
      }

      const userId =
        readNumber(
          selectedRecord,
          [
            "user_id",
            "userId",
            "id",
          ],
          0,
        );

      if (!userId) {
        showNotice(
          "error",
          "Temple Manager user ID not found.",
        );
        return;
      }

      const reason =
        rejectReason.trim();

      if (
        reason.length <
        5
      ) {
        showNotice(
          "error",
          "Please provide a meaningful rejection reason.",
        );
        return;
      }

      if (actionKey) {
        return;
      }

      const key =
        `manager-reject-${userId}`;

      setActionKey(key);

      try {
        await adminApi.rejectTempleManager(
          userId,
          {
            reason,
          },
        );

        setModalType(null);
        setSelectedRecord(
          null,
        );
        setRejectTarget(
          null,
        );
        setRejectReason(
          "",
        );

        showNotice(
          "success",
          "Temple Manager application rejected.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to reject Temple Manager.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const handleFeaturePandit =
    async (
      panditId: number,
      featured: boolean,
      status: string,
    ) => {
      if (!panditId) {
        showNotice(
          "error",
          "Invalid Pandit profile ID.",
        );
        return;
      }

      if (
        status !==
        "approved"
      ) {
        showNotice(
          "info",
          "Only approved Pandit profiles can be featured.",
        );
        return;
      }

      if (actionKey) {
        return;
      }

      const actionText =
        featured
          ? "mark this approved Pandit as featured"
          : "remove this Pandit from featured";

      const confirmed =
        window.confirm(
          `Do you want to ${actionText}?`,
        );

      if (!confirmed) {
        return;
      }

      const key =
        `pandit-feature-${panditId}`;

      setActionKey(key);

      try {
        await adminApi.featurePandit(
          panditId,
          featured,
        );

        showNotice(
          "success",
          featured
            ? "Pandit marked as featured."
            : "Pandit removed from featured.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to update featured status.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const handleListingPandit =
    async (
      panditId: number,
      listingActive: boolean,
      status: string,
    ) => {
      if (!panditId) {
        showNotice(
          "error",
          "Invalid Pandit profile ID.",
        );
        return;
      }

      if (
        status !==
        "approved"
      ) {
        showNotice(
          "info",
          "Only approved Pandit profiles can be listed publicly.",
        );
        return;
      }

      if (actionKey) {
        return;
      }

      const actionText =
        listingActive
          ? "activate this Pandit listing"
          : "disable this Pandit listing";

      const confirmed =
        window.confirm(
          `Do you want to ${actionText}?`,
        );

      if (!confirmed) {
        return;
      }

      const key =
        `pandit-listing-${panditId}`;

      setActionKey(key);

      try {
        await adminApi.togglePanditListing(
          panditId,
          listingActive,
        );

        showNotice(
          "success",
          listingActive
            ? "Pandit listing activated."
            : "Pandit listing disabled.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to update Pandit listing.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const handleCreateSales =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (
        actionKey
      ) {
        return;
      }

      if (
        salesForm.name
          .trim()
          .length < 2
      ) {
        showNotice(
          "error",
          "Sales user name is required.",
        );
        return;
      }

      if (
        salesForm.email
          .trim()
          .length ===
        0
      ) {
        showNotice(
          "error",
          "Sales user email is required.",
        );
        return;
      }

      if (
        salesForm.password
          .length <
        8
      ) {
        showNotice(
          "error",
          "Sales password must contain at least 8 characters.",
        );
        return;
      }

      setActionKey(
        "sales-create",
      );

      try {
        await adminApi.createSales(
          {
            name:
              salesForm.name.trim(),
            email:
              salesForm.email.trim(),
            phone:
              salesForm.phone.trim() ||
              undefined,
            password:
              salesForm.password,
          },
        );

        setSalesForm(
          EMPTY_SALES_FORM,
        );

        setModalType(null);

        showNotice(
          "success",
          "Sales account created successfully.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to create Sales account.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const openPlanEditor =
    (
      plan: GenericRecord,
    ) => {
      setSelectedRecord(
        plan,
      );

      setPlanForm({
        name: readString(
          plan,
          ["name"],
        ),

        code: readString(
          plan,
          ["code"],
        ),

        priceAmount:
          String(
            readNumber(
              plan,
              [
                "price_amount",
                "priceAmount",
                "price",
              ],
              0,
            ),
          ),

        currency:
          readString(
            plan,
            ["currency"],
          ) || "INR",

        leadLimit:
          String(
            readNumber(
              plan,
              [
                "lead_limit",
                "leadLimit",
                "leads",
              ],
              0,
            ),
          ),

        durationDays:
          String(
            readNumber(
              plan,
              [
                "duration_days",
                "durationDays",
                "days",
              ],
              30,
            ),
          ),

        listingEnabled:
          readBoolean(
            plan,
            [
              "listing_enabled",
              "listingEnabled",
            ],
            true,
          ),

        featured:
          readBoolean(
            plan,
            ["featured"],
          ),

        prioritySupport:
          readBoolean(
            plan,
            [
              "priority_support",
              "prioritySupport",
            ],
          ),

        isActive:
          readBoolean(
            plan,
            [
              "is_active",
              "isActive",
              "active",
            ],
            true,
          ),
      });

      setModalType("plan");
    };

  const handleUpdatePlan =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (actionKey) {
        return;
      }

      if (!selectedRecord) {
        return;
      }

      const planId =
        readNumber(
          selectedRecord,
          [
            "id",
            "plan_id",
            "planId",
          ],
          0,
        );

      if (!planId) {
        showNotice(
          "error",
          "Invalid subscription plan ID.",
        );
        return;
      }

      const price =
        Number(
          planForm.priceAmount,
        );

      const leadLimit =
        Number(
          planForm.leadLimit,
        );

      const durationDays =
        Number(
          planForm.durationDays,
        );

      if (
        !Number.isFinite(
          price,
        ) ||
        price < 0
      ) {
        showNotice(
          "error",
          "Plan price is invalid.",
        );
        return;
      }

      if (
        !Number.isFinite(
          leadLimit,
        ) ||
        leadLimit < 0
      ) {
        showNotice(
          "error",
          "Lead limit is invalid.",
        );
        return;
      }

      if (
        !Number.isFinite(
          durationDays,
        ) ||
        durationDays <= 0
      ) {
        showNotice(
          "error",
          "Duration must be greater than zero.",
        );
        return;
      }

      setActionKey(
        `plan-update-${planId}`,
      );

      try {
        await adminApi.updatePlan(
          planId,
          {
            name:
              planForm.name.trim(),

            code:
              planForm.code.trim(),

            priceAmount:
              Math.floor(
                price,
              ),

            currency:
              planForm.currency
                .trim() ||
              "INR",

            leadLimit:
              Math.floor(
                leadLimit,
              ),

            durationDays:
              Math.floor(
                durationDays,
              ),

            listingEnabled:
              planForm.listingEnabled,

            featured:
              planForm.featured,

            prioritySupport:
              planForm.prioritySupport,

            isActive:
              planForm.isActive,
          },
        );

        setModalType(
          null,
        );

        setSelectedRecord(
          null,
        );

        showNotice(
          "success",
          "Subscription plan updated successfully.",
        );

        await refreshCore();
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to update subscription plan.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  const handleSaveSettings =
    async () => {
      if (actionKey) {
        return;
      }

      setActionKey(
        "settings-save",
      );

      try {
        await adminApi.updateSettings(
          settings,
        );

        showNotice(
          "success",
          "Settings saved successfully.",
        );

        await Promise.allSettled([
          loadSettings(),
          loadAuditLogs(),
        ]);
      } catch (
        error
      ) {
        showNotice(
          "error",
          getApiErrorMessage(
            error,
            "Unable to save platform settings.",
          ),
        );
      } finally {
        setActionKey(null);
      }
    };

  /* --------------------------------------------------------------------------
   * FILTERED DATA
   * ---------------------------------------------------------------------- */

  const filteredUsers =
    useMemo(() => {
      const term =
        userSearch
          .trim()
          .toLowerCase();

      return users.filter(
        (
          record,
        ) => {
          const name =
            readString(
              record,
              ["name"],
            ).toLowerCase();

          const email =
            readString(
              record,
              ["email"],
            ).toLowerCase();

          const phone =
            readString(
              record,
              ["phone"],
            ).toLowerCase();

          const role =
            readString(
              record,
              [
                "role",
                "role_code",
              ],
            ).toLowerCase();

          const status =
            readString(
              record,
              ["status"],
            ).toLowerCase();

          return (
            (!term ||
              name.includes(
                term,
              ) ||
              email.includes(
                term,
              ) ||
              phone.includes(
                term,
              )) &&
            (!userRoleFilter ||
              role ===
                userRoleFilter) &&
            (!userStatusFilter ||
              status ===
                userStatusFilter)
          );
        },
      );
    }, [
      users,
      userSearch,
      userRoleFilter,
      userStatusFilter,
    ]);

  const filteredPandits =
    useMemo(() => {
      const term =
        panditSearch
          .trim()
          .toLowerCase();

      return pandits.filter(
        (
          record,
        ) => {
          const name =
            readString(
              record,
              [
                "display_name",
                "displayName",
                "name",
              ],
            ).toLowerCase();

          const email =
            readString(
              record,
              ["email"],
            ).toLowerCase();

          const status =
            readString(
              record,
              [
                "profile_status",
                "profileStatus",
                "status",
              ],
            ).toLowerCase();

          return (
            (!term ||
              name.includes(
                term,
              ) ||
              email.includes(
                term,
              )) &&
            (!panditStatusFilter ||
              status ===
                panditStatusFilter)
          );
        },
      );
    }, [
      pandits,
      panditSearch,
      panditStatusFilter,
    ]);

  const filteredManagers =
    useMemo(() => {
      const term =
        managerSearch
          .trim()
          .toLowerCase();

      return templeManagers.filter(
        (
          record,
        ) => {
          const name =
            readString(
              record,
              [
                "name",
                "manager_name",
                "managerName",
              ],
            ).toLowerCase();

          const email =
            readString(
              record,
              ["email"],
            ).toLowerCase();

          const temple =
            readString(
              record,
              [
                "temple_name",
                "templeName",
                "temple",
              ],
            ).toLowerCase();

          return (
            !term ||
            name.includes(
              term,
            ) ||
            email.includes(
              term,
            ) ||
            temple.includes(
              term,
            )
          );
        },
      );
    }, [
      templeManagers,
      managerSearch,
    ]);

  const filteredLeads =
    useMemo(() => {
      const term =
        leadSearch
          .trim()
          .toLowerCase();

      return leads.filter(
        (
          record,
        ) => {
          const searchable =
            [
              readString(
                record,
                [
                  "name",
                  "visitor_name",
                  "visitorName",
                  "customer_name",
                ],
              ),
              readString(
                record,
                ["email"],
              ),
              readString(
                record,
                ["phone"],
              ),
              readString(
                record,
                [
                  "subject",
                  "title",
                  "service_name",
                  "serviceName",
                ],
              ),
            ]
              .join(" ")
              .toLowerCase();

          const status =
            readString(
              record,
              [
                "status",
                "lead_status",
                "leadStatus",
              ],
            ).toLowerCase();

          return (
            (!term ||
              searchable.includes(
                term,
              )) &&
            (!leadStatusFilter ||
              status ===
                leadStatusFilter)
          );
        },
      );
    }, [
      leads,
      leadSearch,
      leadStatusFilter,
    ]);

  const filteredSubscriptions =
    useMemo(() => {
      const term =
        subscriptionSearch
          .trim()
          .toLowerCase();

      return subscriptions.filter(
        (
          record,
        ) => {
          const searchable =
            [
              readString(
                record,
                [
                  "pandit_name",
                  "panditName",
                  "name",
                  "email",
                ],
              ),
              readString(
                record,
                [
                  "plan_name",
                  "planName",
                ],
              ),
            ]
              .join(" ")
              .toLowerCase();

          return (
            !term ||
            searchable.includes(
              term,
            )
          );
        },
      );
    }, [
      subscriptions,
      subscriptionSearch,
    ]);

  const filteredTemples =
    useMemo(() => {
      const term =
        templeSearch
          .trim()
          .toLowerCase();

      return temples.filter(
        (
          record,
        ) => {
          const searchable =
            [
              readString(
                record,
                [
                  "name",
                  "temple_name",
                  "templeName",
                ],
              ),
              readString(
                record,
                [
                  "city",
                  "state",
                  "location",
                ],
              ),
            ]
              .join(" ")
              .toLowerCase();

          return (
            !term ||
            searchable.includes(
              term,
            )
          );
        },
      );
    }, [
      temples,
      templeSearch,
    ]);

  const filteredAuditLogs =
    useMemo(() => {
      const term =
        auditSearch
          .trim()
          .toLowerCase();

      return auditLogs.filter(
        (
          record,
        ) => {
          const searchable =
            [
              readString(
                record,
                [
                  "action",
                  "event",
                  "activity",
                ],
              ),
              readString(
                record,
                [
                  "actor_name",
                  "actorName",
                  "actor_email",
                  "email",
                ],
              ),
              readString(
                record,
                [
                  "entity_type",
                  "entityType",
                  "target_type",
                ],
              ),
            ]
              .join(" ")
              .toLowerCase();

          return (
            !term ||
            searchable.includes(
              term,
            )
          );
        },
      );
    }, [
      auditLogs,
      auditSearch,
    ]);

  const settingEntries =
    useMemo(
      () =>
        Object.entries(
          settings,
        ).filter(
          ([key]) =>
            key !== "success" &&
            key !== "message" &&
            key !== "data",
        ),
      [settings],
    );

  const updateSetting =
    (
      key: string,
      value: unknown,
    ) => {
      setSettings(
        (
          current,
        ) => ({
          ...current,
          [key]: value,
        }),
      );
    };

  /* --------------------------------------------------------------------------
   * LOADING / ACCESS STATES
   * ---------------------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="grid min-h-[70vh] place-items-center bg-[#fdfaf5]">
        <div className="text-center">
          <Loader2
            size={32}
            className="mx-auto animate-spin text-orange-700"
          />

          <p className="mt-3 text-sm font-semibold text-stone-600">
            Checking administrator
            session…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-orange-100 text-orange-800">
          <Shield size={28} />
        </div>

        <h1 className="mt-5 font-display text-3xl font-semibold text-[#2a1a10]">
          Administrator login
          required
        </h1>

        <p className="mt-2 text-sm leading-6 text-stone-500">
          Please login with your
          Super Admin account to access
          this workspace.
        </p>

        <button
          type="button"
          onClick={() =>
            navigate(
              "/login",
            )
          }
          className="btn-saffron mt-6 rounded-xl px-6 py-3 text-sm font-bold text-white"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (
    user.role !==
    "super_admin"
  ) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-100 text-rose-800">
          <XCircle size={28} />
        </div>

        <h1 className="mt-5 font-display text-3xl font-semibold text-[#2a1a10]">
          Access restricted
        </h1>

        <p className="mt-2 text-sm leading-6 text-stone-500">
          This administration area
          is reserved for Super Admin
          users.
        </p>

        <button
          type="button"
          onClick={() =>
            navigate("/")
          }
          className="mt-6 rounded-xl bg-[#2a1a10] px-6 py-3 text-sm font-bold text-white"
        >
          Return Home
        </button>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * ACTIVE TAB
   * ---------------------------------------------------------------------- */

  const activeMeta =
    NAV_ITEMS.find(
      (item) =>
        item.id ===
        activeTab,
    ) ??
    NAV_ITEMS[0];

  const ActiveIcon =
    activeMeta.icon;

  const backendBadge =
    backendStatus ===
    "connected"
      ? {
          text: "Backend Connected",
          classes:
            "border-emerald-200 bg-emerald-50 text-emerald-800",
          dot:
            "bg-emerald-500",
        }
      : backendStatus ===
          "degraded"
        ? {
            text:
              "Backend Degraded",
            classes:
              "border-amber-200 bg-amber-50 text-amber-800",
            dot:
              "bg-amber-500",
          }
        : {
            text:
              "Checking Backend",
            classes:
              "border-sky-200 bg-sky-50 text-sky-800",
            dot:
              "bg-sky-500",
          };

  /* --------------------------------------------------------------------------
   * MAIN UI
   * ---------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-[#f7f2ea] text-stone-800">
      {/* ======================================================================
       * HEADER
       * ==================================================================== */}

      <header className="sticky top-0 z-40 border-b border-orange-900/10 bg-[#20130c]/95 text-white backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 md:px-6">
          <button
            type="button"
            onClick={() =>
              setMobileMenuOpen(
                (
                  value,
                ) =>
                  !value,
              )
            }
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 lg:hidden"
            aria-label="Toggle admin navigation"
          >
            {mobileMenuOpen ? (
              <X size={19} />
            ) : (
              <Menu
                size={19}
              />
            )}
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white shadow-lg">
              <Crown size={20} />
            </div>

            <div className="min-w-0">
              <p className="font-display truncate text-lg font-semibold">
                DivyaDhara
              </p>

              <p className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-orange-200/70 sm:block">
                Super Admin Control
                Center
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void handleRefresh()
              }
              disabled={
                refreshing ||
                Boolean(
                  actionKey,
                )
              }
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                size={17}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
            </button>

            <div className="hidden items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 md:flex">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500/20 text-xs font-bold text-orange-200">
                {initials(
                  user.name,
                )}
              </span>

              <div className="max-w-48">
                <p className="truncate text-xs font-bold text-white">
                  {user.name}
                </p>

                <p className="truncate text-[10px] text-white/55">
                  {user.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void handleLogout()
              }
              disabled={
                Boolean(
                  actionKey,
                )
              }
              className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold hover:bg-white/10 disabled:opacity-50"
            >
              <LogOut size={16} />

              <span className="hidden sm:inline">
                Logout
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ======================================================================
       * PAGE LAYOUT
       * ==================================================================== */}

      <div className="mx-auto flex max-w-[1800px]">
        {/* --------------------------------------------------------------------
         * SIDEBAR
         * ------------------------------------------------------------------ */}

        <aside
          className={cx(
            "fixed inset-y-16 left-0 z-30 w-[280px] border-r border-orange-900/10 bg-[#fbf6ef] p-4 transition-transform lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:translate-x-0",
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full",
          )}
        >
          <div className="flex h-full flex-col">
            <div className="mb-4 rounded-3xl bg-linear-to-br from-[#2a1a10] via-orange-950 to-orange-800 p-5 text-white shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-200">
                Command Center
              </p>

              <p className="mt-2 font-display text-xl font-semibold">
                Jai Shri Ram 🙏
              </p>

              <p className="mt-2 text-xs leading-5 text-orange-100/75">
                Central control for the
                DivyaDhara platform.
              </p>
            </div>

            <nav
              className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
              aria-label="Super Admin navigation"
            >
              {NAV_ITEMS.map(
                (item) => {
                  const Icon =
                    item.icon;

                  const badgeCount =
                    item.id ===
                    "pandits"
                      ? dashboard.pendingPandits
                      : item.id ===
                          "temple-managers"
                        ? dashboard.pendingTempleManagers
                        : 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(
                          item.id,
                        );

                        setMobileMenuOpen(
                          false,
                        );
                      }}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-bold transition",
                        activeTab ===
                          item.id
                          ? "bg-[#2a1a10] text-orange-200 shadow-lg"
                          : "text-stone-600 hover:bg-orange-50 hover:text-orange-900",
                      )}
                    >
                      <Icon
                        size={17}
                      />

                      <span className="min-w-0 flex-1">
                        {item.label}
                      </span>

                      {badgeCount >
                      0 ? (
                        <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] text-white">
                          {
                            badgeCount
                          }
                        </span>
                      ) : null}
                    </button>
                  );
                },
              )}
            </nav>

            <div className="mt-4 rounded-2xl border border-orange-900/10 bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Activity size={16} />
                </span>

                <div>
                  <p className="text-xs font-bold text-stone-800">
                    System Access
                  </p>

                  <p className="text-[10px] font-semibold text-emerald-700">
                    Super Admin active
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {mobileMenuOpen ? (
          <button
            type="button"
            onClick={() =>
              setMobileMenuOpen(
                false,
              )
            }
            className="fixed inset-0 top-16 z-20 bg-black/25 lg:hidden"
            aria-label="Close navigation"
          />
        ) : null}

        {/* --------------------------------------------------------------------
         * MAIN
         * ------------------------------------------------------------------ */}

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          {notice ? (
            <div
              className={cx(
                "mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm",
                notice.type ===
                  "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : notice.type ===
                      "error"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-sky-200 bg-sky-50 text-sky-900",
              )}
            >
              {notice.type ===
              "success" ? (
                <Check
                  size={18}
                  className="mt-0.5 shrink-0"
                />
              ) : notice.type ===
                "error" ? (
                <AlertCircle
                  size={18}
                  className="mt-0.5 shrink-0"
                />
              ) : (
                <Bell
                  size={18}
                  className="mt-0.5 shrink-0"
                />
              )}

              <p className="flex-1 text-sm font-semibold">
                {
                  notice.message
                }
              </p>

              <button
                type="button"
                onClick={() =>
                  setNotice(null)
                }
              >
                <X size={16} />
              </button>
            </div>
          ) : null}

          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-700">
                <ActiveIcon
                  size={14}
                />
                {
                  activeMeta.label
                }
              </div>

              <h1 className="font-display text-3xl font-semibold tracking-tight text-[#2a1a10] md:text-4xl">
                {activeTab ===
                "overview"
                  ? "Super Admin Dashboard"
                  : activeMeta.label}
              </h1>

              <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
                Central administration
                for users, Pandits,
                temples, sales,
                subscriptions, leads,
                configuration and audit
                activity.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold",
                  backendBadge.classes,
                )}
              >
                <span
                  className={cx(
                    "h-2 w-2 rounded-full",
                    backendBadge.dot,
                    backendStatus ===
                      "checking"
                      ? "animate-pulse"
                      : "",
                  )}
                />

                {
                  backendBadge.text
                }
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800">
                <ShieldCheck size={14} />
                Super Admin
              </span>
            </div>
          </div>

          {loading ? (
            <div className="mb-5 overflow-hidden rounded-full bg-orange-100">
              <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-orange-600" />
            </div>
          ) : null}

          {/* ==================================================================
           * OVERVIEW
           * ================================================================ */}

          {activeTab ===
          "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Total Users"
                  value={String(
                    dashboard.totalUsers,
                  )}
                  sub="All registered accounts"
                  icon={Users}
                  onClick={() =>
                    setActiveTab(
                      "users",
                    )
                  }
                />

                <StatCard
                  label="Pandits"
                  value={String(
                    dashboard.totalPandits,
                  )}
                  sub={`${dashboard.pendingPandits} awaiting approval`}
                  icon={BadgeCheck}
                  onClick={() =>
                    setActiveTab(
                      "pandits",
                    )
                  }
                />

                <StatCard
                  label="Temple Managers"
                  value={String(
                    dashboard.totalTempleManagers,
                  )}
                  sub={`${dashboard.pendingTempleManagers} awaiting approval`}
                  icon={Building2}
                  accent="blue"
                  onClick={() =>
                    setActiveTab(
                      "temple-managers",
                    )
                  }
                />

                <StatCard
                  label="Open Leads"
                  value={String(
                    dashboard.openLeads,
                  )}
                  sub="Current business enquiries"
                  icon={TicketCheck}
                  accent="violet"
                  onClick={() =>
                    setActiveTab(
                      "leads",
                    )
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Subscriptions"
                  value={String(
                    dashboard.activeSubscriptions,
                  )}
                  sub="Active Pandit plans"
                  icon={Sparkles}
                  accent="emerald"
                  onClick={() =>
                    setActiveTab(
                      "subscriptions",
                    )
                  }
                />

                <StatCard
                  label="Active Temples"
                  value={String(
                    dashboard.activeTemples,
                  )}
                  sub="Temple records"
                  icon={Store}
                  accent="blue"
                  onClick={() =>
                    setActiveTab(
                      "temples",
                    )
                  }
                />

                <StatCard
                  label="Featured Pandits"
                  value={String(
                    dashboard.featuredPandits,
                  )}
                  sub="Featured listings"
                  icon={Crown}
                  accent="amber"
                  onClick={() =>
                    setActiveTab(
                      "pandits",
                    )
                  }
                />

                <StatCard
                  label="Revenue"
                  value={formatMoney(
                    dashboard.revenue,
                  )}
                  sub="Reported platform revenue"
                  icon={IndianRupee}
                  accent="emerald"
                  onClick={() =>
                    setActiveTab(
                      "subscriptions",
                    )
                  }
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
                <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm md:p-6">
                  <SectionHeader
                    title="Approval Queue"
                    description="Accounts waiting for administrative action."
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTab(
                          "pandits",
                        )
                      }
                      className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-left transition hover:border-orange-200"
                    >
                      <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
                        Pending Pandits
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <p className="font-display text-3xl font-bold text-orange-950">
                          {
                            dashboard.pendingPandits
                          }
                        </p>

                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-orange-700 shadow-sm">
                          <UserCheck
                            size={20}
                          />
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setActiveTab(
                          "temple-managers",
                        )
                      }
                      className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-left transition hover:border-sky-200"
                    >
                      <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
                        Pending Temple Managers
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <p className="font-display text-3xl font-bold text-sky-950">
                          {
                            dashboard.pendingTempleManagers
                          }
                        </p>

                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-sky-700 shadow-sm">
                          <Building2
                            size={20}
                          />
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm md:p-6">
                  <SectionHeader
                    title="Platform Snapshot"
                    description="Current account distribution."
                  />

                  <div className="space-y-3">
                    {[
                      {
                        label:
                          "Visitors",
                        value:
                          dashboard.totalVisitors,
                        icon:
                          UserRound,
                      },
                      {
                        label:
                          "Sales Team",
                        value:
                          dashboard.totalSalesUsers,
                        icon:
                          TrendingUp,
                      },
                      {
                        label:
                          "Pandits",
                        value:
                          dashboard.totalPandits,
                        icon:
                          BadgeCheck,
                      },
                      {
                        label:
                          "Temple Managers",
                        value:
                          dashboard.totalTempleManagers,
                        icon:
                          Building2,
                      },
                    ].map(
                      (item) => {
                        const Icon =
                          item.icon;

                        return (
                          <div
                            key={
                              item.label
                            }
                            className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3"
                          >
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-orange-800 ring-1 ring-orange-100">
                              <Icon
                                size={
                                  16
                                }
                              />
                            </span>

                            <span className="flex-1 text-sm font-bold text-stone-700">
                              {
                                item.label
                              }
                            </span>

                            <span className="font-display text-xl font-bold text-[#2a1a10]">
                              {
                                item.value
                              }
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-linear-to-br from-[#24150e] via-orange-950 to-[#4f260e] p-6 text-white shadow-xl md:p-8">
                <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-orange-200">
                      <ShieldCheck size={15} />
                      Protected Administration
                    </div>

                    <h2 className="mt-3 font-display text-2xl font-semibold md:text-3xl">
                      Complete platform
                      control.
                    </h2>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-100/75">
                      Manage onboarding,
                      approvals, plans, sales
                      accounts, leads, temples,
                      configuration and audit
                      history through the
                      protected Express API.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveTab(
                        "audit",
                      )
                    }
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-[#2a1a10] hover:bg-orange-50"
                  >
                    View Audit Activity
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* ==================================================================
           * USERS
           * ================================================================ */}

          {activeTab ===
          "users" ? (
            <div className="space-y-5">
              <SectionHeader
                title="User Management"
                description={`${filteredUsers.length} visible user(s). Super Admin accounts remain protected.`}
              />

              <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_190px_190px_auto]">
                  <div className="relative">
                    <Search
                      size={17}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                    />

                    <input
                      value={
                        userSearch
                      }
                      onChange={(
                        event,
                      ) =>
                        setUserSearch(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Search name, email or phone…"
                      className="w-full rounded-xl border border-orange-900/15 bg-stone-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <SelectField
                    label="Role"
                    value={
                      userRoleFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setUserRoleFilter(
                        event.target
                          .value as
                          | AuthRole
                          | "",
                      )
                    }
                    options={
                      ROLE_OPTIONS
                    }
                  />

                  <SelectField
                    label="Status"
                    value={
                      userStatusFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setUserStatusFilter(
                        event.target
                          .value as
                          | AuthStatus
                          | "",
                      )
                    }
                    options={
                      STATUS_OPTIONS
                    }
                  />

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setUserSearch(
                          "",
                        );

                        setUserRoleFilter(
                          "",
                        );

                        setUserStatusFilter(
                          "",
                        );
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-900/10 bg-white px-4 py-3 text-sm font-bold text-stone-600 hover:bg-orange-50"
                    >
                      <Filter size={15} />
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                {filteredUsers.length ===
                0 ? (
                  <EmptyState
                    title="No users found"
                    description="Try another search or change the filters."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[1100px] w-full text-left">
                      <thead>
                        <tr className="border-b border-orange-900/10 bg-orange-50/60 text-[11px] uppercase tracking-[0.14em] text-stone-500">
                          <th className="px-5 py-4">
                            User
                          </th>

                          <th className="px-5 py-4">
                            Role
                          </th>

                          <th className="px-5 py-4">
                            Contact
                          </th>

                          <th className="px-5 py-4">
                            Status
                          </th>

                          <th className="px-5 py-4">
                            Created
                          </th>

                          <th className="px-5 py-4 text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-orange-900/10">
                        {filteredUsers.map(
                          (
                            record,
                            index,
                          ) => {
                            const id =
                              readNumber(
                                record,
                                [
                                  "id",
                                  "user_id",
                                  "userId",
                                ],
                                0,
                              );

                            const name =
                              readString(
                                record,
                                ["name"],
                                "Unnamed User",
                              );

                            const email =
                              readString(
                                record,
                                ["email"],
                              );

                            const phone =
                              readString(
                                record,
                                ["phone"],
                              );

                            const role =
                              readString(
                                record,
                                [
                                  "role",
                                  "role_code",
                                ],
                                "visitor",
                              );

                            const status =
                              readString(
                                record,
                                ["status"],
                                "pending",
                              );

                            return (
                              <tr
                                key={`${id || "missing"}-${email || "user"}-${index}`}
                                className="hover:bg-orange-50/25"
                              >
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-100 text-xs font-bold text-orange-900">
                                      {initials(
                                        name,
                                      )}
                                    </span>

                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-stone-800">
                                        {
                                          name
                                        }
                                      </p>

                                      <p className="text-xs text-stone-500">
                                        {id
                                          ? `ID #${id}`
                                          : "ID unavailable"}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                <td className="px-5 py-4">
                                  <RoleBadge
                                    role={
                                      role
                                    }
                                  />
                                </td>

                                <td className="px-5 py-4">
                                  <p className="text-sm text-stone-700">
                                    {
                                      email ||
                                      "—"
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-stone-500">
                                    {
                                      phone ||
                                      "No phone"
                                    }
                                  </p>
                                </td>

                                <td className="px-5 py-4">
                                  <StatusBadge
                                    status={
                                      status
                                    }
                                  />
                                </td>

                                <td className="px-5 py-4 text-sm text-stone-500">
                                  {formatDate(
                                    readValue(
                                      record,
                                      [
                                        "created_at",
                                        "createdAt",
                                      ],
                                    ),
                                  )}
                                </td>

                                <td className="px-5 py-4">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedRecord(
                                          record,
                                        );

                                        setModalType(
                                          "user",
                                        );
                                      }}
                                      className="grid h-9 w-9 place-items-center rounded-xl border border-orange-900/10 bg-white text-stone-600 hover:bg-orange-50"
                                      title="View details"
                                    >
                                      <Eye
                                        size={
                                          15
                                        }
                                      />
                                    </button>

                                    {role !==
                                    "super_admin" ? (
                                      <select
                                        value={
                                          status
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          void handleUserStatus(
                                            id,
                                            event
                                              .target
                                              .value as AuthStatus,
                                          )
                                        }
                                        disabled={
                                          !id ||
                                          Boolean(
                                            actionKey,
                                          )
                                        }
                                        className="rounded-xl border border-orange-900/10 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-stone-100"
                                      >
                                        <option value="pending">
                                          Pending
                                        </option>

                                        <option value="active">
                                          Active
                                        </option>

                                        <option value="suspended">
                                          Suspended
                                        </option>

                                        <option value="rejected">
                                          Rejected
                                        </option>

                                        <option value="blocked">
                                          Blocked
                                        </option>
                                      </select>
                                    ) : (
                                      <span className="rounded-xl bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-500">
                                        Protected
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ==================================================================
           * PANDITS
           * ================================================================ */}

          {activeTab ===
          "pandits" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Pandit Verification"
                description="Approve, reject, feature and control public listing visibility for Pandit profiles."
              />

              <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <div className="relative">
                    <Search
                      size={17}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                    />

                    <input
                      value={
                        panditSearch
                      }
                      onChange={(
                        event,
                      ) =>
                        setPanditSearch(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Search Pandit name or email…"
                      className="w-full rounded-xl border border-orange-900/15 bg-stone-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <SelectField
                    label="Profile Status"
                    value={
                      panditStatusFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setPanditStatusFilter(
                        event.target
                          .value,
                      )
                    }
                    options={[
                      {
                        value: "",
                        label: "All statuses",
                      },
                      {
                        value: "pending",
                        label: "Pending",
                      },
                      {
                        value: "approved",
                        label: "Approved",
                      },
                      {
                        value: "rejected",
                        label: "Rejected",
                      },
                      {
                        value: "suspended",
                        label: "Suspended",
                      },
                    ]}
                  />
                </div>
              </div>

              {filteredPandits.length ===
              0 ? (
                <EmptyState
                  title="No Pandit records"
                  description="Pandit registrations will appear here once created."
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredPandits.map(
                    (
                      record,
                      index,
                    ) => {
                      /*
                       * CRITICAL BUSINESS MAPPING:
                       * `panditId` = pandit_profiles.id
                       * `userId`   = users.id
                       */
                      const panditId =
                        readNumber(
                          record,
                          [
                            "id",
                            "pandit_id",
                            "panditId",
                          ],
                          0,
                        );

                      const userId =
                        readNumber(
                          record,
                          [
                            "user_id",
                            "userId",
                          ],
                          0,
                        );

                      const name =
                        readString(
                          record,
                          [
                            "display_name",
                            "displayName",
                            "name",
                          ],
                          "Pandit",
                        );

                      const email =
                        readString(
                          record,
                          ["email"],
                        );

                      const status =
                        readString(
                          record,
                          [
                            "profile_status",
                            "profileStatus",
                            "status",
                          ],
                          "pending",
                        ).toLowerCase();

                      const city =
                        readString(
                          record,
                          [
                            "city",
                            "location",
                          ],
                        );

                      const state =
                        readString(
                          record,
                          ["state"],
                        );

                      const verified =
                        readBoolean(
                          record,
                          [
                            "profile_verified",
                            "profileVerified",
                          ],
                        );

                      const featured =
                        readBoolean(
                          record,
                          ["featured"],
                        );

                      const listing =
                        readBoolean(
                          record,
                          [
                            "listing_active",
                            "listingActive",
                          ],
                        );

                      const experience =
                        readNumber(
                          record,
                          [
                            "experience_years",
                            "experienceYears",
                            "experience",
                          ],
                          0,
                        );

                      const approveKey =
                        `pandit-approve-${panditId}`;

                      const rejectKey =
                        `pandit-reject-${panditId}`;

                      const featureKey =
                        `pandit-feature-${panditId}`;

                      const listingKey =
                        `pandit-listing-${panditId}`;

                      const approved =
                        status ===
                        "approved";

                      return (
                        <div
                          key={`${panditId || "missing"}-${userId || "missing"}-${index}`}
                          className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start gap-4">
                            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-orange-100 font-display text-xl font-bold text-orange-900">
                              {initials(
                                name,
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display text-xl font-semibold text-[#2a1a10]">
                                  {
                                    name
                                  }
                                </h3>

                                {verified ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                                    <BadgeCheck
                                      size={
                                        11
                                      }
                                    />
                                    Verified
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-1 text-sm text-stone-500">
                                {
                                  email ||
                                  "No email"
                                }

                                {" · "}

                                {[
                                  city,
                                  state,
                                ]
                                  .filter(
                                    Boolean,
                                  )
                                  .join(
                                    ", ",
                                  ) ||
                                  "No location"}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <StatusBadge
                                  status={
                                    status
                                  }
                                />

                                {featured ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                                    <Crown
                                      size={
                                        11
                                      }
                                    />
                                    Featured
                                  </span>
                                ) : null}

                                {listing ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800">
                                    <Eye
                                      size={
                                        11
                                      }
                                    />
                                    Listing Live
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl bg-stone-50 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                    Experience
                                  </p>

                                  <p className="mt-1 text-sm font-bold">
                                    {
                                      experience
                                    }{" "}
                                    years
                                  </p>
                                </div>

                                <div className="rounded-2xl bg-stone-50 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                    Pandit ID
                                  </p>

                                  <p className="mt-1 text-sm font-bold">
                                    {panditId
                                      ? `#${panditId}`
                                      : "Unavailable"}
                                  </p>
                                </div>

                                <div className="rounded-2xl bg-stone-50 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                    User ID
                                  </p>

                                  <p className="mt-1 text-sm font-bold">
                                    {userId
                                      ? `#${userId}`
                                      : "Unavailable"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap gap-2 border-t border-orange-900/10 pt-4">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecord(
                                  record,
                                );

                                setModalType(
                                  "pandit",
                                );
                              }}
                              className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-orange-50"
                            >
                              <Eye size={14} />
                              View
                            </button>

                            {status ===
                            "pending" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleApprovePandit(
                                      panditId,
                                    )
                                  }
                                  disabled={
                                    !panditId ||
                                    Boolean(
                                      actionKey,
                                    )
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {actionKey ===
                                  approveKey ? (
                                    <Loader2
                                      size={
                                        14
                                      }
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Check
                                      size={
                                        14
                                      }
                                    />
                                  )}

                                  Approve
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRecord(
                                      record,
                                    );

                                    setRejectReason(
                                      "",
                                    );

                                    setRejectTarget(
                                      "pandit",
                                    );

                                    setModalType(
                                      "reject",
                                    );
                                  }}
                                  disabled={
                                    !panditId ||
                                    Boolean(
                                      actionKey,
                                    )
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <XCircle
                                    size={
                                      14
                                    }
                                  />
                                  Reject
                                </button>
                              </>
                            ) : null}

                            <button
                              type="button"
                              onClick={() =>
                                void handleFeaturePandit(
                                  panditId,
                                  !featured,
                                  status,
                                )
                              }
                              disabled={
                                !approved ||
                                !panditId ||
                                Boolean(
                                  actionKey,
                                )
                              }
                              title={
                                approved
                                  ? featured
                                    ? "Remove featured status"
                                    : "Feature approved Pandit"
                                  : "Only approved Pandits can be featured"
                              }
                              className={cx(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50",
                                featured
                                  ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                                  : "border border-orange-900/10 bg-white text-stone-700 hover:bg-orange-50",
                              )}
                            >
                              {actionKey ===
                              featureKey ? (
                                <Loader2
                                  size={
                                    14
                                  }
                                  className="animate-spin"
                                />
                              ) : (
                                <Crown
                                  size={
                                    14
                                  }
                                />
                              )}

                              {featured
                                ? "Unfeature"
                                : "Feature"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleListingPandit(
                                  panditId,
                                  !listing,
                                  status,
                                )
                              }
                              disabled={
                                !approved ||
                                !panditId ||
                                Boolean(
                                  actionKey,
                                )
                              }
                              title={
                                approved
                                  ? listing
                                    ? "Disable public Pandit listing"
                                    : "Activate public Pandit listing"
                                  : "Only approved Pandits can be listed publicly"
                              }
                              className={cx(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50",
                                listing
                                  ? "bg-sky-100 text-sky-900 hover:bg-sky-200"
                                  : "border border-orange-900/10 bg-white text-stone-700 hover:bg-orange-50",
                              )}
                            >
                              {actionKey ===
                              listingKey ? (
                                <Loader2
                                  size={
                                    14
                                  }
                                  className="animate-spin"
                                />
                              ) : (
                                <Eye
                                  size={
                                    14
                                  }
                                />
                              )}

                              {listing
                                ? "Disable Listing"
                                : "Activate Listing"}
                            </button>
                          </div>

                          {!approved ? (
                            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                              Public listing and
                              featured placement
                              remain unavailable
                              until the Pandit profile
                              is approved.
                            </div>
                          ) : null}
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* ==================================================================
           * TEMPLE MANAGERS
           * ================================================================ */}

          {activeTab ===
          "temple-managers" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Temple Manager Approvals"
                description="Approve or reject manager accounts."
              />

              <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                <div className="relative">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />

                  <input
                    value={
                      managerSearch
                    }
                    onChange={(
                      event,
                    ) =>
                      setManagerSearch(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Search manager, email or temple…"
                    className="w-full rounded-xl border border-orange-900/15 bg-stone-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {filteredManagers.length ===
              0 ? (
                <EmptyState
                  title="No Temple Managers found"
                  description="Pending and approved manager accounts will appear here."
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredManagers.map(
                    (
                      record,
                      index,
                    ) => {
                      const userId =
                        readNumber(
                          record,
                          [
                            "user_id",
                            "userId",
                            "id",
                          ],
                          0,
                        );

                      const name =
                        readString(
                          record,
                          [
                            "name",
                            "manager_name",
                            "managerName",
                          ],
                          "Temple Manager",
                        );

                      const email =
                        readString(
                          record,
                          ["email"],
                        );

                      const temple =
                        readString(
                          record,
                          [
                            "temple_name",
                            "templeName",
                            "temple",
                          ],
                          "Temple not assigned",
                        );

                      const status =
                        readString(
                          record,
                          ["status"],
                          "pending",
                        ).toLowerCase();

                      return (
                        <div
                          key={`${userId || "missing"}-${email || "manager"}-${index}`}
                          className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start gap-4">
                            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-100 font-display text-lg font-bold text-sky-900">
                              {initials(
                                name,
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display text-xl font-semibold">
                                  {
                                    name
                                  }
                                </h3>

                                <StatusBadge
                                  status={
                                    status
                                  }
                                />
                              </div>

                              <p className="mt-1 text-sm text-stone-500">
                                {
                                  email ||
                                  "No email"
                                }
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                Temple
                              </p>

                              <p className="mt-1 text-sm font-bold">
                                {
                                  temple
                                }
                              </p>
                            </div>

                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                Location
                              </p>

                              <p className="mt-1 text-sm font-bold">
                                {
                                  readString(
                                    record,
                                    [
                                      "city",
                                      "location",
                                    ],
                                  ) ||
                                  "—"
                                }
                              </p>
                            </div>

                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                User ID
                              </p>

                              <p className="mt-1 text-sm font-bold">
                                {userId
                                  ? `#${userId}`
                                  : "Unavailable"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 border-t border-orange-900/10 pt-4">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecord(
                                  record,
                                );

                                setModalType(
                                  "manager",
                                );
                              }}
                              className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 bg-white px-3 py-2 text-xs font-bold hover:bg-orange-50"
                            >
                              <Eye size={14} />
                              View
                            </button>

                            {status ===
                            "pending" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleApproveManager(
                                      userId,
                                    )
                                  }
                                  disabled={
                                    !userId ||
                                    Boolean(
                                      actionKey,
                                    )
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Check
                                    size={
                                      14
                                    }
                                  />
                                  Approve
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRecord(
                                      record,
                                    );

                                    setRejectReason(
                                      "",
                                    );

                                    setRejectTarget(
                                      "manager",
                                    );

                                    setModalType(
                                      "reject",
                                    );
                                  }}
                                  disabled={
                                    !userId ||
                                    Boolean(
                                      actionKey,
                                    )
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <XCircle
                                    size={
                                      14
                                    }
                                  />
                                  Reject
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* ==================================================================
           * SALES
           * ================================================================ */}

          {activeTab ===
          "sales" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Sales Team"
                description="Sales accounts are created only by Super Admin."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setSalesForm(
                        EMPTY_SALES_FORM,
                      );

                      setModalType(
                        "sales",
                      );
                    }}
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UserCog size={16} />
                    Create Sales User
                  </button>
                }
              />

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
                    Sales Accounts
                  </p>

                  <p className="mt-3 font-display text-3xl font-bold">
                    {
                      dashboard.totalSalesUsers
                    }
                  </p>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Open Leads
                  </p>

                  <p className="mt-3 font-display text-3xl font-bold">
                    {
                      dashboard.openLeads
                    }
                  </p>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
                    Workflow
                  </p>

                  <p className="mt-3 text-sm font-bold">
                    Leads + Follow-ups
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <TrendingUp
                    size={20}
                    className="mt-0.5 text-orange-700"
                  />

                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      Sales architecture
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      Sales users will work
                      through protected lead
                      assignment and follow-up
                      workflows.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ==================================================================
           * PLANS
           * ================================================================ */}

          {activeTab ===
          "plans" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Subscription Plans"
                description="Manage Pandit plan pricing and limits."
              />

              {plans.length ===
              0 ? (
                <EmptyState
                  title="No plans found"
                  description="Seed subscription plans in the database before editing them."
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  {plans.map(
                    (
                      plan,
                      index,
                    ) => {
                      const id =
                        readNumber(
                          plan,
                          [
                            "id",
                            "plan_id",
                            "planId",
                          ],
                          0,
                        );

                      const name =
                        readString(
                          plan,
                          ["name"],
                          "Plan",
                        );

                      const code =
                        readString(
                          plan,
                          ["code"],
                        );

                      const price =
                        readNumber(
                          plan,
                          [
                            "price_amount",
                            "priceAmount",
                            "price",
                          ],
                          0,
                        );

                      const leadLimit =
                        readNumber(
                          plan,
                          [
                            "lead_limit",
                            "leadLimit",
                            "leads",
                          ],
                          0,
                        );

                      const duration =
                        readNumber(
                          plan,
                          [
                            "duration_days",
                            "durationDays",
                            "days",
                          ],
                          30,
                        );

                      const listing =
                        readBoolean(
                          plan,
                          [
                            "listing_enabled",
                            "listingEnabled",
                          ],
                          true,
                        );

                      const featured =
                        readBoolean(
                          plan,
                          ["featured"],
                        );

                      const active =
                        readBoolean(
                          plan,
                          [
                            "is_active",
                            "isActive",
                            "active",
                          ],
                          true,
                        );

                      const priority =
                        readBoolean(
                          plan,
                          [
                            "priority_support",
                            "prioritySupport",
                          ],
                        );

                      return (
                        <div
                          key={
                            id ||
                            `${name}-${index}`
                          }
                          className="relative overflow-hidden rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm"
                        >
                          {featured ? (
                            <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-900">
                              <Crown size={11} />
                              Featured
                            </span>
                          ) : null}

                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
                            {code ||
                              "subscription"}
                          </p>

                          <h3 className="mt-2 font-display text-2xl font-semibold text-[#2a1a10]">
                            {name}
                          </h3>

                          <div className="mt-5">
                            <span className="font-display text-4xl font-bold text-orange-800">
                              {formatMoney(
                                price,
                              )}
                            </span>

                            <span className="ml-1 text-sm text-stone-400">
                              /
                              {
                                duration
                              }{" "}
                              days
                            </span>
                          </div>

                          <div className="mt-5 space-y-2">
                            <div className="flex justify-between rounded-xl bg-stone-50 px-3 py-2.5">
                              <span className="text-xs text-stone-500">
                                Lead limit
                              </span>

                              <span className="text-sm font-bold">
                                {
                                  leadLimit
                                }
                              </span>
                            </div>

                            <div className="flex justify-between rounded-xl bg-stone-50 px-3 py-2.5">
                              <span className="text-xs text-stone-500">
                                Listing
                              </span>

                              <span className="text-xs font-bold">
                                {listing
                                  ? "Enabled"
                                  : "Disabled"}
                              </span>
                            </div>

                            <div className="flex justify-between rounded-xl bg-stone-50 px-3 py-2.5">
                              <span className="text-xs text-stone-500">
                                Priority support
                              </span>

                              <span className="text-xs font-bold">
                                {priority
                                  ? "Included"
                                  : "No"}
                              </span>
                            </div>
                          </div>

                          <div className="mt-5 flex items-center justify-between">
                            <StatusBadge
                              status={
                                active
                                  ? "active"
                                  : "inactive"
                              }
                            />

                            <button
                              type="button"
                              onClick={() =>
                                openPlanEditor(
                                  plan,
                                )
                              }
                              disabled={
                                !id ||
                                Boolean(
                                  actionKey,
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 bg-white px-3 py-2 text-xs font-bold hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Pencil
                                size={14}
                              />
                              Edit
                            </button>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* ==================================================================
           * LEADS
           * ================================================================ */}

          {activeTab ===
          "leads" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Lead Management"
                description="Central lead visibility for business enquiries."
              />

              <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                  <div className="relative">
                    <Search
                      size={17}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                    />

                    <input
                      value={
                        leadSearch
                      }
                      onChange={(
                        event,
                      ) =>
                        setLeadSearch(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Search lead, visitor, email or service…"
                      className="w-full rounded-xl border border-orange-900/15 bg-stone-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <SelectField
                    label="Lead Status"
                    value={
                      leadStatusFilter
                    }
                    onChange={(
                      event,
                    ) =>
                      setLeadStatusFilter(
                        event.target
                          .value,
                      )
                    }
                    options={[
                      {
                        value: "",
                        label: "All statuses",
                      },
                      {
                        value: "open",
                        label: "Open",
                      },
                      {
                        value: "pending",
                        label: "Pending",
                      },
                      {
                        value: "assigned",
                        label: "Assigned",
                      },
                      {
                        value: "converted",
                        label: "Converted",
                      },
                      {
                        value: "closed",
                        label: "Closed",
                      },
                    ]}
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                {filteredLeads.length ===
                0 ? (
                  <EmptyState
                    title="No leads found"
                    description="No leads matched the selected search and status filters."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[1000px] w-full text-left">
                      <thead>
                        <tr className="border-b border-orange-900/10 bg-orange-50/60 text-[11px] uppercase tracking-wider text-stone-500">
                          <th className="px-5 py-4">
                            Lead
                          </th>

                          <th className="px-5 py-4">
                            Service
                          </th>

                          <th className="px-5 py-4">
                            Source
                          </th>

                          <th className="px-5 py-4">
                            Status
                          </th>

                          <th className="px-5 py-4">
                            Created
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-orange-900/10">
                        {filteredLeads.map(
                          (
                            record,
                            index,
                          ) => {
                            const name =
                              readString(
                                record,
                                [
                                  "name",
                                  "visitor_name",
                                  "visitorName",
                                  "customer_name",
                                ],
                                "Visitor",
                              );

                            const contact =
                              readString(
                                record,
                                [
                                  "email",
                                  "phone",
                                ],
                                "No contact",
                              );

                            const service =
                              readString(
                                record,
                                [
                                  "subject",
                                  "title",
                                  "service_name",
                                  "serviceName",
                                ],
                                "General enquiry",
                              );

                            const source =
                              readString(
                                record,
                                [
                                  "source",
                                  "lead_source",
                                ],
                                "Website",
                              );

                            const status =
                              readString(
                                record,
                                [
                                  "status",
                                  "lead_status",
                                  "leadStatus",
                                ],
                                "open",
                              );

                            const leadId =
                              readNumber(
                                record,
                                [
                                  "id",
                                  "lead_id",
                                ],
                                0,
                              );

                            return (
                              <tr
                                key={`${leadId || "lead"}-${index}`}
                              >
                                <td className="px-5 py-4">
                                  <p className="text-sm font-bold">
                                    {
                                      name
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-stone-500">
                                    {
                                      contact
                                    }
                                  </p>
                                </td>

                                <td className="px-5 py-4 text-sm font-semibold">
                                  {
                                    service
                                  }
                                </td>

                                <td className="px-5 py-4">
                                  <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600">
                                    {
                                      source
                                    }
                                  </span>
                                </td>

                                <td className="px-5 py-4">
                                  <StatusBadge
                                    status={
                                      status
                                    }
                                  />
                                </td>

                                <td className="px-5 py-4 text-sm text-stone-500">
                                  {formatDate(
                                    readValue(
                                      record,
                                      [
                                        "created_at",
                                        "createdAt",
                                      ],
                                    ),
                                  )}
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ==================================================================
           * SUBSCRIPTIONS
           * ================================================================ */}

          {activeTab ===
          "subscriptions" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Pandit Subscriptions"
                description="Monitor active plans and subscription lifecycle."
              />

              <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                <div className="relative">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />

                  <input
                    value={
                      subscriptionSearch
                    }
                    onChange={(
                      event,
                    ) =>
                      setSubscriptionSearch(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Search Pandit, email or plan…"
                    className="w-full rounded-xl border border-orange-900/15 bg-stone-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                {filteredSubscriptions.length ===
                0 ? (
                  <EmptyState
                    title="No subscriptions found"
                    description="Subscriptions appear after a Pandit activates a plan."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[950px] w-full text-left">
                      <thead>
                        <tr className="border-b border-orange-900/10 bg-orange-50/60 text-[11px] uppercase tracking-wider text-stone-500">
                          <th className="px-5 py-4">
                            Pandit
                          </th>

                          <th className="px-5 py-4">
                            Plan
                          </th>

                          <th className="px-5 py-4">
                            Amount
                          </th>

                          <th className="px-5 py-4">
                            Start
                          </th>

                          <th className="px-5 py-4">
                            Expiry
                          </th>

                          <th className="px-5 py-4">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-orange-900/10">
                        {filteredSubscriptions.map(
                          (
                            record,
                            index,
                          ) => {
                            const name =
                              readString(
                                record,
                                [
                                  "pandit_name",
                                  "panditName",
                                  "name",
                                ],
                                "Pandit",
                              );

                            const email =
                              readString(
                                record,
                                [
                                  "email",
                                ],
                              );

                            const plan =
                              readString(
                                record,
                                [
                                  "plan_name",
                                  "planName",
                                ],
                                "—",
                              );

                            const amount =
                              readNumber(
                                record,
                                [
                                  "amount",
                                  "price_amount",
                                  "priceAmount",
                                ],
                                0,
                              );

                            const status =
                              readString(
                                record,
                                [
                                  "status",
                                  "subscription_status",
                                ],
                                "active",
                              );

                            const id =
                              readNumber(
                                record,
                                [
                                  "id",
                                  "subscription_id",
                                ],
                                0,
                              );

                            return (
                              <tr
                                key={`${id || "subscription"}-${index}`}
                              >
                                <td className="px-5 py-4">
                                  <p className="text-sm font-bold">
                                    {
                                      name
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-stone-500">
                                    {
                                      email ||
                                      "—"
                                    }
                                  </p>
                                </td>

                                <td className="px-5 py-4">
                                  <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-800">
                                    {
                                      plan
                                    }
                                  </span>
                                </td>

                                <td className="px-5 py-4 text-sm font-bold">
                                  {formatMoney(
                                    amount,
                                  )}
                                </td>

                                <td className="px-5 py-4 text-sm text-stone-500">
                                  {formatDate(
                                    readValue(
                                      record,
                                      [
                                        "starts_at",
                                        "start_at",
                                        "startDate",
                                      ],
                                    ),
                                  )}
                                </td>

                                <td className="px-5 py-4 text-sm text-stone-500">
                                  {formatDate(
                                    readValue(
                                      record,
                                      [
                                        "ends_at",
                                        "expires_at",
                                        "endDate",
                                      ],
                                    ),
                                  )}
                                </td>

                                <td className="px-5 py-4">
                                  <StatusBadge
                                    status={
                                      status
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ==================================================================
           * TEMPLES
           * ================================================================ */}

          {activeTab ===
          "temples" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Temple Directory"
                description="Review temple records and their current status."
              />

              <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                <div className="relative">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />

                  <input
                    value={
                      templeSearch
                    }
                    onChange={(
                      event,
                    ) =>
                      setTempleSearch(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Search temple, city or state…"
                    className="w-full rounded-xl border border-orange-900/15 bg-stone-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {filteredTemples.length ===
              0 ? (
                <EmptyState
                  title="No temples found"
                  description="No temple records matched your search."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredTemples.map(
                    (
                      record,
                      index,
                    ) => {
                      const id =
                        readNumber(
                          record,
                          [
                            "id",
                            "temple_id",
                            "templeId",
                          ],
                          0,
                        );

                      const name =
                        readString(
                          record,
                          [
                            "name",
                            "temple_name",
                            "templeName",
                          ],
                          "Temple",
                        );

                      const city =
                        readString(
                          record,
                          ["city"],
                        );

                      const state =
                        readString(
                          record,
                          ["state"],
                        );

                      const manager =
                        readString(
                          record,
                          [
                            "manager_name",
                            "managerName",
                          ],
                          "Not assigned",
                        );

                      const status =
                        readString(
                          record,
                          ["status"],
                          readBoolean(
                            record,
                            [
                              "is_active",
                              "isActive",
                            ],
                            true,
                          )
                            ? "active"
                            : "inactive",
                        );

                      return (
                        <div
                          key={
                            id ||
                            `${name}-${index}`
                          }
                          className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-orange-800">
                              <Store size={19} />
                            </span>

                            <StatusBadge
                              status={
                                status
                              }
                            />
                          </div>

                          <h3 className="mt-4 font-display text-xl font-semibold">
                            {name}
                          </h3>

                          <p className="mt-1 text-sm text-stone-500">
                            {[
                              city,
                              state,
                            ]
                              .filter(
                                Boolean,
                              )
                              .join(
                                ", ",
                              ) ||
                              "Location not provided"}
                          </p>

                          <div className="mt-4 rounded-2xl bg-stone-50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                              Assigned Manager
                            </p>

                            <p className="mt-1 text-sm font-bold">
                              {
                                manager
                              }
                            </p>
                          </div>

                          <p className="mt-4 text-xs text-stone-400">
                            Temple ID #
                            {id ||
                              "unavailable"}
                          </p>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* ==================================================================
           * SETTINGS
           * ================================================================ */}

          {activeTab ===
          "settings" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Platform Settings"
                description="Database-backed configuration exposed to Super Admin."
                action={
                  <button
                    type="button"
                    onClick={() =>
                      void handleSaveSettings()
                    }
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionKey ===
                    "settings-save" ? (
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <Check size={16} />
                    )}

                    Save Settings
                  </button>
                }
              />

              {settingEntries.length ===
              0 ? (
                <EmptyState
                  title="No settings loaded"
                  description="The backend returned no editable platform settings."
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {settingEntries.map(
                    ([key, value]) => {
                      const isBoolean =
                        typeof value ===
                        "boolean";

                      const isNumber =
                        typeof value ===
                        "number";

                      const textValue =
                        isBoolean ||
                        isNumber
                          ? ""
                          : typeof value ===
                              "string"
                            ? value
                            : JSON.stringify(
                                value,
                              );

                      return (
                        <div
                          key={
                            key
                          }
                          className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">
                                Platform setting
                              </p>

                              <h3 className="mt-1 font-display text-lg font-semibold">
                                {humanize(
                                  key,
                                )}
                              </h3>

                              <p className="mt-1 break-all text-xs text-stone-400">
                                {key}
                              </p>
                            </div>

                            <Settings
                              size={17}
                              className="text-orange-700"
                            />
                          </div>

                          <div className="mt-4">
                            {isBoolean ? (
                              <Toggle
                                label={
                                  value
                                    ? "Enabled"
                                    : "Disabled"
                                }
                                checked={
                                  value
                                }
                                onChange={() =>
                                  updateSetting(
                                    key,
                                    !value,
                                  )
                                }
                                disabled={
                                  Boolean(
                                    actionKey,
                                  )
                                }
                                description="Toggle this configuration value."
                              />
                            ) : (
                              <input
                                type={
                                  isNumber
                                    ? "number"
                                    : "text"
                                }
                                value={
                                  isNumber
                                    ? String(
                                        value,
                                      )
                                    : textValue
                                }
                                disabled={
                                  Boolean(
                                    actionKey,
                                  )
                                }
                                onChange={(
                                  event,
                                ) => {
                                  updateSetting(
                                    key,
                                    isNumber
                                      ? Number(
                                          event
                                            .target
                                            .value,
                                        )
                                      : event
                                          .target
                                          .value,
                                  );
                                }}
                                className="w-full rounded-xl border border-orange-900/15 bg-stone-50 px-3.5 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                              />
                            )}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}

              <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <ServerCog
                    size={20}
                    className="mt-0.5 text-orange-700"
                  />

                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      Security boundary
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      The frontend communicates
                      through the protected Express
                      API. It never connects directly
                      to SQLite.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ==================================================================
           * AUDIT LOGS
           * ================================================================ */}

          {activeTab ===
          "audit" ? (
            <div className="space-y-5">
              <SectionHeader
                title="Audit Logs"
                description="Administrative activity recorded by the backend."
              />

              <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm">
                <div className="relative">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />

                  <input
                    value={
                      auditSearch
                    }
                    onChange={(
                      event,
                    ) =>
                      setAuditSearch(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Search action, actor or entity…"
                    className="w-full rounded-xl border border-orange-900/15 bg-stone-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                {filteredAuditLogs.length ===
                0 ? (
                  <EmptyState
                    title="No audit activity"
                    description="No audit log entries matched the current search."
                  />
                ) : (
                  <div className="divide-y divide-orange-900/10">
                    {filteredAuditLogs.map(
                      (
                        record,
                        index,
                      ) => {
                        const actor =
                          readString(
                            record,
                            [
                              "actor_name",
                              "actorName",
                              "actor_email",
                              "email",
                            ],
                            "System",
                          );

                        const action =
                          readString(
                            record,
                            [
                              "action",
                              "event",
                              "activity",
                            ],
                            "Activity",
                          );

                        const entity =
                          readString(
                            record,
                            [
                              "entity_type",
                              "entityType",
                              "target_type",
                            ],
                            "System",
                          );

                        const details =
                          readString(
                            record,
                            [
                              "description",
                              "details",
                              "message",
                            ],
                          );

                        const id =
                          readNumber(
                            record,
                            [
                              "id",
                              "audit_id",
                            ],
                            0,
                          );

                        return (
                          <div
                            key={`${id || "audit"}-${index}`}
                            className="flex gap-4 p-5"
                          >
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-800">
                              <FileClock size={17} />
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold">
                                  {
                                    action
                                  }
                                </p>

                                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500">
                                  {
                                    humanize(
                                      entity,
                                    )
                                  }
                                </span>
                              </div>

                              <p className="mt-1 text-xs text-stone-500">
                                Actor:{" "}
                                <span className="font-semibold text-stone-700">
                                  {
                                    actor
                                  }
                                </span>
                              </p>

                              {details ? (
                                <p className="mt-2 text-sm leading-6 text-stone-500">
                                  {
                                    details
                                  }
                                </p>
                              ) : null}
                            </div>

                            <div className="shrink-0 text-right text-xs text-stone-400">
                              {formatDate(
                                readValue(
                                  record,
                                  [
                                    "created_at",
                                    "createdAt",
                                    "timestamp",
                                  ],
                                ),
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* ======================================================================
       * MODALS
       * ==================================================================== */}

      {modalType ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-orange-900/10 bg-[#fbf6ef] shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            {/* ----------------------------------------------------------------
             * USER
             * -------------------------------------------------------------- */}

            {modalType ===
            "user" ? (
              <>
                <ModalHeader
                  title="User Details"
                  onClose={() => {
                    setModalType(
                      null,
                    );

                    setSelectedRecord(
                      null,
                    );
                  }}
                />

                <RecordDetail
                  record={
                    selectedRecord
                  }
                />
              </>
            ) : null}

            {/* ----------------------------------------------------------------
             * PANDIT
             * -------------------------------------------------------------- */}

            {modalType ===
            "pandit" ? (
              <>
                <ModalHeader
                  title="Pandit Profile"
                  onClose={() => {
                    setModalType(
                      null,
                    );

                    setSelectedRecord(
                      null,
                    );
                  }}
                />

                <RecordDetail
                  record={
                    selectedRecord
                  }
                />
              </>
            ) : null}

            {/* ----------------------------------------------------------------
             * MANAGER
             * -------------------------------------------------------------- */}

            {modalType ===
            "manager" ? (
              <>
                <ModalHeader
                  title="Temple Manager Details"
                  onClose={() => {
                    setModalType(
                      null,
                    );

                    setSelectedRecord(
                      null,
                    );
                  }}
                />

                <RecordDetail
                  record={
                    selectedRecord
                  }
                />
              </>
            ) : null}

            {/* ----------------------------------------------------------------
             * REJECT
             * -------------------------------------------------------------- */}

            {modalType ===
            "reject" ? (
              <>
                <ModalHeader
                  title={
                    rejectTarget ===
                    "manager"
                      ? "Reject Temple Manager"
                      : "Reject Pandit Application"
                  }
                  onClose={() => {
                    setModalType(
                      null,
                    );

                    setSelectedRecord(
                      null,
                    );

                    setRejectTarget(
                      null,
                    );

                    setRejectReason(
                      "",
                    );
                  }}
                />

                <div className="p-5 md:p-6">
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle
                        size={18}
                        className="mt-0.5 shrink-0 text-rose-700"
                      />

                      <div>
                        <p className="text-sm font-bold text-rose-900">
                          This action changes
                          the application
                          status.
                        </p>

                        <p className="mt-1 text-xs leading-5 text-rose-700">
                          A rejection reason is
                          required for audit,
                          support and applicant
                          communication workflows.
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedRecord ? (
                    <div className="mt-5 rounded-2xl border border-orange-900/10 bg-white p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700">
                        Application
                      </p>

                      <p className="mt-1 text-lg font-bold text-[#2a1a10]">
                        {readString(
                          selectedRecord,
                          [
                            "display_name",
                            "displayName",
                            "name",
                            "manager_name",
                            "managerName",
                          ],
                          rejectTarget ===
                            "manager"
                            ? "Temple Manager"
                            : "Pandit",
                        )}
                      </p>

                      <p className="mt-1 text-xs text-stone-500">
                        {rejectTarget ===
                        "manager"
                          ? `User ID: ${readNumber(selectedRecord, ["user_id", "userId", "id"], 0) || "Unavailable"}`
                          : `Pandit ID: ${readNumber(selectedRecord, ["id", "pandit_id", "panditId"], 0) || "Unavailable"}`}
                      </p>
                    </div>
                  ) : null}

                  <label className="mt-5 block">
                    <span className="mb-1.5 block text-xs font-bold text-stone-600">
                      Rejection reason
                    </span>

                    <textarea
                      value={
                        rejectReason
                      }
                      onChange={(
                        event,
                      ) =>
                        setRejectReason(
                          event.target
                            .value,
                        )
                      }
                      rows={5}
                      maxLength={1000}
                      placeholder="Enter the reason for rejection…"
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                      className="w-full resize-none rounded-2xl border border-orange-900/15 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                    />

                    <p className="mt-1 text-right text-[11px] text-stone-400">
                      {
                        rejectReason.length
                      }
                      /1000
                    </p>
                  </label>

                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setModalType(
                          null,
                        );

                        setSelectedRecord(
                          null,
                        );

                        setRejectTarget(
                          null,
                        );

                        setRejectReason(
                          "",
                        );
                      }}
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                      className="rounded-xl border border-orange-900/10 bg-white px-4 py-3 text-sm font-bold text-stone-600 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          rejectTarget ===
                          "manager"
                        ) {
                          void handleRejectManager();
                        } else if (
                          rejectTarget ===
                          "pandit"
                        ) {
                          void handleRejectPandit();
                        }
                      }}
                      disabled={
                        Boolean(
                          actionKey,
                        ) ||
                        rejectReason
                          .trim()
                          .length <
                          5
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionKey ? (
                        <Loader2
                          size={15}
                          className="animate-spin"
                        />
                      ) : (
                        <XCircle
                          size={15}
                        />
                      )}

                      Reject Application
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {/* ----------------------------------------------------------------
             * SALES
             * -------------------------------------------------------------- */}

            {modalType ===
            "sales" ? (
              <form
                onSubmit={
                  handleCreateSales
                }
              >
                <ModalHeader
                  title="Create Sales Account"
                  onClose={() =>
                    setModalType(
                      null,
                    )
                  }
                />

                <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
                  <InputField
                    label="Full name"
                    value={
                      salesForm.name
                    }
                    onChange={(
                      event,
                    ) =>
                      setSalesForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          name:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    placeholder="Sales executive name"
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Email"
                    value={
                      salesForm.email
                    }
                    onChange={(
                      event,
                    ) =>
                      setSalesForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          email:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    type="email"
                    placeholder="sales@example.com"
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Phone"
                    value={
                      salesForm.phone
                    }
                    onChange={(
                      event,
                    ) =>
                      setSalesForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          phone:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    placeholder="+91 XXXXX XXXXX"
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Temporary password"
                    value={
                      salesForm.password
                    }
                    onChange={(
                      event,
                    ) =>
                      setSalesForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          password:
                            event.target
                              .value,
                        }),
                      )
                    }
                    type="password"
                    placeholder="Minimum 8 characters"
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 md:col-span-2">
                    <p className="text-xs font-bold text-orange-900">
                      Account security
                    </p>

                    <p className="mt-1 text-xs leading-5 text-orange-800/75">
                      Sales registration is
                      disabled publicly. This
                      account is created only from
                      the protected Super Admin
                      workflow.
                    </p>
                  </div>

                  <div className="flex flex-col-reverse gap-2 md:col-span-2 md:flex-row md:justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setModalType(
                          null,
                        )
                      }
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                      className="rounded-xl border border-orange-900/10 bg-white px-4 py-3 text-sm font-bold text-stone-600 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionKey ===
                      "sales-create" ? (
                        <Loader2
                          size={15}
                          className="animate-spin"
                        />
                      ) : (
                        <UserCog
                          size={15}
                        />
                      )}

                      Create Sales Account
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            {/* ----------------------------------------------------------------
             * PLAN
             * -------------------------------------------------------------- */}

            {modalType ===
            "plan" ? (
              <form
                onSubmit={
                  handleUpdatePlan
                }
              >
                <ModalHeader
                  title="Edit Subscription Plan"
                  onClose={() => {
                    setModalType(
                      null,
                    );

                    setSelectedRecord(
                      null,
                    );
                  }}
                />

                <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
                  <InputField
                    label="Plan name"
                    value={
                      planForm.name
                    }
                    onChange={(
                      event,
                    ) =>
                      setPlanForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          name:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Plan code"
                    value={
                      planForm.code
                    }
                    onChange={(
                      event,
                    ) =>
                      setPlanForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          code:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Price"
                    value={
                      planForm.priceAmount
                    }
                    onChange={(
                      event,
                    ) =>
                      setPlanForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          priceAmount:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    type="number"
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Currency"
                    value={
                      planForm.currency
                    }
                    onChange={(
                      event,
                    ) =>
                      setPlanForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          currency:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Lead limit"
                    value={
                      planForm.leadLimit
                    }
                    onChange={(
                      event,
                    ) =>
                      setPlanForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          leadLimit:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    type="number"
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <InputField
                    label="Duration (days)"
                    value={
                      planForm.durationDays
                    }
                    onChange={(
                      event,
                    ) =>
                      setPlanForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          durationDays:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    type="number"
                    required
                    disabled={
                      Boolean(
                        actionKey,
                      )
                    }
                  />

                  <div className="space-y-2 md:col-span-2">
                    <Toggle
                      label="Listing enabled"
                      checked={
                        planForm.listingEnabled
                      }
                      onChange={() =>
                        setPlanForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            listingEnabled:
                              !current.listingEnabled,
                          }),
                        )
                      }
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                    />

                    <Toggle
                      label="Featured access"
                      checked={
                        planForm.featured
                      }
                      onChange={() =>
                        setPlanForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            featured:
                              !current.featured,
                          }),
                        )
                      }
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                    />

                    <Toggle
                      label="Priority support"
                      checked={
                        planForm.prioritySupport
                      }
                      onChange={() =>
                        setPlanForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            prioritySupport:
                              !current.prioritySupport,
                          }),
                        )
                      }
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                    />

                    <Toggle
                      label="Plan active"
                      checked={
                        planForm.isActive
                      }
                      onChange={() =>
                        setPlanForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            isActive:
                              !current.isActive,
                          }),
                        )
                      }
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-2 md:col-span-2 md:flex-row md:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setModalType(
                          null,
                        );

                        setSelectedRecord(
                          null,
                        );
                      }}
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                      className="rounded-xl border border-orange-900/10 bg-white px-4 py-3 text-sm font-bold text-stone-600 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={
                        Boolean(
                          actionKey,
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionKey ? (
                        <Loader2
                          size={15}
                          className="animate-spin"
                        />
                      ) : (
                        <Check
                          size={15}
                        />
                      )}

                      Save Plan
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}