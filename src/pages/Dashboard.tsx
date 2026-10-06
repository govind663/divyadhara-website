/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  User,
  CalendarCheck,
  Heart,
  Bell,
  Settings,
  LogOut,
  MessageCircle,
  MapPin,
  Phone,
  Save,
  Mail,
  ShieldCheck,
  LoaderCircle,
  Globe2,
  AlertCircle,
  CheckCircle2,
  Compass,
  Sparkles,
  Landmark,
  BookOpen,
  ArrowRight,
  Clock3,
  LifeBuoy,
  Search,
} from "lucide-react";
import { TEMPLES, PLACES } from "../data/content";
import { useSEO } from "../lib/seo";
import { Reveal, Empty } from "../components/ui";
import { useApp } from "../context/AppContext";
import { cx } from "../lib/utils";

const TABS = [
  {
    id: "overview",
    l: "Overview",
    i: <LayoutDashboard size={16} />,
  },
  {
    id: "bookings",
    l: "My Enquiries & Bookings",
    i: <CalendarCheck size={16} />,
  },
  {
    id: "saved",
    l: "Saved",
    i: <Heart size={16} />,
  },
  {
    id: "notifications",
    l: "Notifications",
    i: <Bell size={16} />,
  },
  {
    id: "profile",
    l: "Profile",
    i: <User size={16} />,
  },
  {
    id: "settings",
    l: "Settings",
    i: <Settings size={16} />,
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

type ProfileForm = {
  name: string;
  phone: string;
  city: string;
  state: string;
  country: string;
};

type NotificationPrefs = {
  whatsapp: boolean;
  email: boolean;
  festival: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  whatsapp: true,
  email: true,
  festival: true,
};

/* -------------------------------------------------------------------------- */
/* Notification Preferences                                                  */
/* -------------------------------------------------------------------------- */

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem("dd_notification_prefs");

    if (!raw) {
      return DEFAULT_PREFS;
    }

    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;

    return {
      whatsapp:
        typeof parsed.whatsapp === "boolean"
          ? parsed.whatsapp
          : DEFAULT_PREFS.whatsapp,
      email:
        typeof parsed.email === "boolean"
          ? parsed.email
          : DEFAULT_PREFS.email,
      festival:
        typeof parsed.festival === "boolean"
          ? parsed.festival
          : DEFAULT_PREFS.festival,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/* -------------------------------------------------------------------------- */
/* Role / Status Helpers                                                      */
/* -------------------------------------------------------------------------- */

function roleLabel(role?: string): string {
  switch (role) {
    case "pandit":
      return "Pandit / Acharya";
    case "temple_manager":
      return "Temple Manager";
    case "ashram_manager":
      return "Ashram Manager";
    case "sales":
      return "Sales";
    case "super_admin":
      return "Super Admin";
    case "visitor":
    default:
      return "Visitor / Devotee";
  }
}

function roleDashboard(role?: string): string | null {
  switch (role) {
    case "pandit":
      return "/pandit/dashboard";
    case "temple_manager":
      return "/temple/dashboard";
    case "ashram_manager":
      return "/ashram/dashboard";
    case "sales":
      return "/sales/dashboard";
    case "super_admin":
      return "/admin";
    case "visitor":
    default:
      return null;
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "pending":
      return "Pending Approval";
    case "suspended":
      return "Suspended";
    case "rejected":
      return "Rejected";
    case "blocked":
      return "Blocked";
    default:
      return "Active";
  }
}

function prettyStatus(value?: string): string {
  if (!value) return "Pending";

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Visitor Dashboard                                                          */
/* -------------------------------------------------------------------------- */

export default function Dashboard() {
  useSEO({
    title: "My Dashboard — DivyaDhara | Pilgrimage, Puja & Spiritual Journey",
    description:
      "Manage your DivyaDhara profile, spiritual enquiries, bookings, saved temples, saved places and notifications in one personal dashboard.",
    path: "/dashboard",
  });

  const {
    user,
    isLoading,
    authError,
    isProfileUpdating,
    logout,
    updateProfile,
    bookings,
    savedTemples,
    savedPlaces,
    toggleSave,
    notifications,
    clearAuthError,
  } = useApp();

  const nav = useNavigate();

  const [tab, setTab] = useState<TabId>("overview");
  const [f, setF] = useState<ProfileForm>({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    city: user?.city ?? "",
    state: user?.state ?? "",
    country: user?.country ?? "India",
  });
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);

  useEffect(() => {
    if (!user) return;

    setF({
      name: user.name ?? "",
      phone: user.phone ?? "",
      city: user.city ?? "",
      state: user.state ?? "",
      country: user.country ?? "India",
    });
  }, [user]);

  useEffect(() => {
    if (tab !== "profile") {
      setSaved(false);
      setProfileError(null);
    }
  }, [tab]);

  useEffect(() => {
    try {
      localStorage.setItem("dd_notification_prefs", JSON.stringify(prefs));
    } catch {
      // Local-only preference persistence should never block dashboard use.
    }
  }, [prefs]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      nav("/");
    }
  };

  const handleProfileSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setProfileError(null);
    clearAuthError();

    const name = f.name.trim();
    const phone = f.phone.trim();
    const city = f.city.trim();
    const state = f.state.trim();
    const country = f.country.trim();

    if (!name) {
      setProfileError("Please enter your full name.");
      return;
    }

    if (name.length < 2) {
      setProfileError("Full name must contain at least 2 characters.");
      return;
    }

    if (!phone) {
      setProfileError("Please enter your mobile number.");
      return;
    }

    if (phone.length < 7) {
      setProfileError("Please enter a valid mobile number.");
      return;
    }

    try {
      await updateProfile({
        name,
        phone,
        city,
        state,
        country,
      });

      setSaved(true);

      window.setTimeout(() => {
        setSaved(false);
      }, 2500);
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Unable to update your profile.",
      );
    }
  };

  const savedT = useMemo(
    () => TEMPLES.filter((t) => savedTemples.includes(t.slug)),
    [savedTemples],
  );

  const savedP = useMemo(
    () => PLACES.filter((p) => savedPlaces.includes(p.slug)),
    [savedPlaces],
  );

  const profileCompletion = useMemo(() => {
    if (!user) return 0;

    const fields = [
      user.name,
      user.email,
      user.phone,
      user.city,
      user.state,
      user.country,
    ];

    return Math.round(
      (fields.filter((value) => Boolean(String(value ?? "").trim())).length /
        fields.length) *
        100,
    );
  }, [user]);

  const firstName = user?.name.trim().split(/\s+/)[0] || "Devotee";
  const avatarLetter = user?.name.trim().charAt(0).toUpperCase() || "D";

  const input =
    "w-full rounded-xl border border-orange-900/15 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200";

  const readonlyInput =
    "w-full cursor-not-allowed rounded-xl border border-orange-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-600 outline-none";

  if (isLoading && !user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4 py-20">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-700">
            <LoaderCircle size={24} className="animate-spin" />
          </div>

          <h1 className="font-display mt-5 text-2xl font-semibold text-stone-900">
            Loading your dashboard
          </h1>

          <p className="mt-2 text-sm text-stone-500">
            Restoring your secure DivyaDhara session…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="font-sanskrit text-5xl text-orange-300">ॐ</p>

        <h1 className="font-display mt-3 text-3xl font-semibold">
          Please login first
        </h1>

        <p className="mt-2 text-stone-500">
          Your personal dashboard keeps your spiritual enquiries, bookings,
          saved places and account details together.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <Link
            to="/login"
            className="btn-saffron rounded-2xl px-6 py-3 text-sm font-bold text-white"
          >
            Login
          </Link>

          <Link
            to="/register"
            className="rounded-2xl border border-orange-700/25 px-6 py-3 text-sm font-bold text-orange-900"
          >
            Register
          </Link>
        </div>
      </div>
    );
  }

  // This page is intentionally visitor-only. Other roles have their own
  // dashboards and must not receive visitor dashboard UI/data.
  const redirectPath = roleDashboard(user.role);
  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  const statCards = [
    {
      l: "My Requests",
      v: String(bookings.length),
      d: "Enquiries & bookings",
      icon: <CalendarCheck size={18} />,
      action: () => setTab("bookings"),
    },
    {
      l: "Saved Temples",
      v: String(savedT.length),
      d: "Your sacred wishlist",
      icon: <Landmark size={18} />,
      action: () => setTab("saved"),
    },
    {
      l: "Saved Places",
      v: String(savedP.length),
      d: "Places to discover",
      icon: <MapPin size={18} />,
      action: () => setTab("saved"),
    },
    {
      l: "Notifications",
      v: String(notifications.length),
      d: "Latest account updates",
      icon: <Bell size={18} />,
      action: () => setTab("notifications"),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8 lg:py-10">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}

      <Reveal
        className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-[#24160e] via-saffron-900 to-saffron-700 p-6 text-white shadow-[0_22px_60px_rgba(91,51,20,0.20)] md:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-amber-300/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-orange-300/10 blur-3xl" />

        <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={`${user.name} profile`}
                className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-white/25 md:h-20 md:w-20"
              />
            ) : (
              <span
                className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl font-bold text-amber-200 ring-1 ring-white/25 md:h-20 md:w-20"
                aria-hidden="true"
              >
                {avatarLetter}
              </span>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300 sm:text-xs">
                  Jai Shri Ram · My DivyaDhara
                </p>

                {user.status === "active" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-300/20">
                    <ShieldCheck size={11} />
                    Active
                  </span>
                )}
              </div>

              <h1 className="font-display mt-1 truncate text-2xl font-semibold md:text-3xl">
                Namaste, {firstName} 🙏
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-orange-100/80">
                <span className="truncate">{user.email}</span>

                {user.city && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{user.city}</span>
                  </>
                )}

                <span aria-hidden="true">·</span>
                <span>{roleLabel(user.role)}</span>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <Link
              to="/services"
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[13px] font-bold text-orange-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-50"
            >
              <Sparkles size={15} />
              Explore Sevas
            </Link>

            <a
              href={`https://wa.me/919820809883?text=${encodeURIComponent(
                "Namaste! I need help with my DivyaDhara account, enquiry or booking.",
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-[13px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:brightness-95"
            >
              <MessageCircle size={15} />
              Help
            </a>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-[13px] font-bold text-white transition hover:bg-white/15"
            >
              <LogOut size={15} />
              Logout
            </button>
          </div>
        </div>
      </Reveal>

      {/* ================================================================ */}
      {/* QUICK STATS                                                      */}
      {/* ================================================================ */}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <button
            key={card.l}
            type="button"
            onClick={card.action}
            className="group rounded-3xl border border-orange-900/10 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-900/20 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-100">
                {card.icon}
              </span>
              <ArrowRight
                size={16}
                className="mt-1 text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-600"
              />
            </div>

            <p className="mt-4 font-display text-3xl font-bold text-orange-800">
              {card.v}
            </p>
            <p className="mt-0.5 text-sm font-bold text-stone-800">{card.l}</p>
            <p className="mt-0.5 text-xs text-stone-500">{card.d}</p>
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* MAIN                                                              */}
      {/* ================================================================ */}

      <div className="mt-6 grid gap-6 lg:grid-cols-[250px_1fr]">
        <nav
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
          aria-label="Visitor dashboard sections"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cx(
                "flex shrink-0 items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold transition",
                tab === t.id
                  ? "bg-[#2a1a10] text-amber-200 shadow"
                  : "bg-white text-stone-600 ring-1 ring-orange-900/10 hover:bg-orange-50 hover:text-orange-800",
              )}
            >
              {t.i}
              <span>{t.l}</span>

              {t.id === "bookings" && bookings.length > 0 && (
                <span className="ml-auto rounded-full bg-orange-600 px-2 py-0.5 text-[11px] text-white">
                  {bookings.length}
                </span>
              )}

              {t.id === "notifications" && notifications.length > 0 && (
                <span className="ml-auto rounded-full bg-orange-600 px-2 py-0.5 text-[11px] text-white">
                  {notifications.length}
                </span>
              )}
            </button>
          ))}

          <div className="mt-1 hidden rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200 lg:block">
            <div className="flex items-center gap-2 text-orange-800">
              <Compass size={18} />
              <p className="text-sm font-bold">Continue your journey</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-600">
              Discover temples, puja services, pandits and spiritual places
              through DivyaDhara.
            </p>
            <Link
              to="/temples"
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-800 underline underline-offset-2"
            >
              Discover Temples <ArrowRight size={13} />
            </Link>
          </div>
        </nav>

        <div className="min-w-0">
          {/* ============================================================ */}
          {/* OVERVIEW                                                      */}
          {/* ============================================================ */}

          {tab === "overview" && (
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
                <div className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-7">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 ring-1 ring-orange-100">
                        <Sparkles size={13} />
                        Your Spiritual Journey
                      </div>
                      <h2 className="font-display mt-3 text-2xl font-semibold text-stone-900">
                        From discovery to darshan, all in one place.
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
                        Explore India’s temples, puja traditions, pandits,
                        ashrams and pilgrimage experiences. Your enquiries,
                        bookings and saved places stay connected to your
                        account.
                      </p>
                    </div>

                    <div className="shrink-0 rounded-2xl bg-stone-50 px-4 py-3 text-center ring-1 ring-stone-100">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Profile
                      </p>
                      <p className="mt-1 text-2xl font-bold text-orange-800">
                        {profileCompletion}%
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab("profile")}
                        className="mt-0.5 text-[11px] font-bold text-orange-700 underline underline-offset-2"
                      >
                        Complete profile
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-orange-500 via-amber-500 to-orange-700 transition-all"
                      style={{ width: `${profileCompletion}%` }}
                    />
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <Link
                      to="/pandits"
                      className="group rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100 transition hover:bg-orange-50 hover:ring-orange-100"
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-orange-700 shadow-sm ring-1 ring-orange-100">
                          <User size={16} />
                        </span>
                        <ArrowRight
                          size={15}
                          className="text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-700"
                        />
                      </div>
                      <p className="mt-3 text-sm font-bold text-stone-800">
                        Find a Pandit
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Explore pandits and enquire about services.
                      </p>
                    </Link>

                    <Link
                      to="/temples"
                      className="group rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100 transition hover:bg-orange-50 hover:ring-orange-100"
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-orange-700 shadow-sm ring-1 ring-orange-100">
                          <Landmark size={16} />
                        </span>
                        <ArrowRight
                          size={15}
                          className="text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-700"
                        />
                      </div>
                      <p className="mt-3 text-sm font-bold text-stone-800">
                        Temple Darshan
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Discover temples, traditions and sacred places.
                      </p>
                    </Link>

                    <Link
                      to="/ashrams"
                      className="group rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100 transition hover:bg-orange-50 hover:ring-orange-100"
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-orange-700 shadow-sm ring-1 ring-orange-100">
                          <Compass size={16} />
                        </span>
                        <ArrowRight
                          size={15}
                          className="text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-700"
                        />
                      </div>
                      <p className="mt-3 text-sm font-bold text-stone-800">
                        Explore Ashrams
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Discover spiritual communities and programs.
                      </p>
                    </Link>

                    <Link
                      to="/yatra"
                      className="group rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100 transition hover:bg-orange-50 hover:ring-orange-100"
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-orange-700 shadow-sm ring-1 ring-orange-100">
                          <MapPin size={16} />
                        </span>
                        <ArrowRight
                          size={15}
                          className="text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-700"
                        />
                      </div>
                      <p className="mt-3 text-sm font-bold text-stone-800">
                        Plan a Tirth Yatra
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Explore pilgrimage and spiritual travel options.
                      </p>
                    </Link>
                  </div>
                </div>

                <div className="rounded-[2rem] bg-linear-to-br from-amber-50 to-orange-50 p-6 ring-1 ring-amber-200 md:p-7">
                  <div className="flex items-center gap-2 text-orange-800">
                    <BookOpen size={18} />
                    <p className="text-sm font-bold uppercase tracking-wider">
                      DivyaDhara Picks
                    </p>
                  </div>

                  <h3 className="font-display mt-3 text-xl font-semibold text-stone-900">
                    Begin with what calls you.
                  </h3>

                  <div className="mt-5 space-y-2.5">
                    <Link
                      to="/panchang"
                      className="group flex items-center gap-3 rounded-2xl bg-white/85 p-3.5 ring-1 ring-orange-100 transition hover:bg-white"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
                        <Clock3 size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-stone-800">
                          Daily Panchang
                        </span>
                        <span className="block text-xs text-stone-500">
                          Tithi, muhurat and spiritual calendar.
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-700"
                      />
                    </Link>

                    <Link
                      to="/courses"
                      className="group flex items-center gap-3 rounded-2xl bg-white/85 p-3.5 ring-1 ring-orange-100 transition hover:bg-white"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
                        <BookOpen size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-stone-800">
                          Spiritual Learning
                        </span>
                        <span className="block text-xs text-stone-500">
                          Courses and practical spiritual wisdom.
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-700"
                      />
                    </Link>

                    <Link
                      to="/services"
                      className="group flex items-center gap-3 rounded-2xl bg-white/85 p-3.5 ring-1 ring-orange-100 transition hover:bg-white"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
                        <Sparkles size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-stone-800">
                          Puja & Seva
                        </span>
                        <span className="block text-xs text-stone-500">
                          Find a service and start an enquiry.
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="text-stone-300 transition group-hover:translate-x-1 group-hover:text-orange-700"
                      />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-7">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock3 size={18} className="text-orange-700" />
                      <h3 className="font-display text-xl font-semibold">
                        Recent activity
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      Your latest requests, bookings and service activity.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTab("bookings")}
                    className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-orange-700 underline underline-offset-2"
                  >
                    View all <ArrowRight size={13} />
                  </button>
                </div>

                {bookings.length === 0 ? (
                  <div className="mt-5 rounded-2xl bg-stone-50 p-5 ring-1 ring-stone-100">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
                        <Search size={17} />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-stone-800">
                          Your journey starts here.
                        </p>
                        <p className="mt-1 text-xs leading-5 text-stone-500">
                          Explore a temple, puja service, pandit, ashram or
                          yatra and send an enquiry when you are ready.
                        </p>
                        <Link
                          to="/services"
                          className="mt-3 inline-flex items-center gap-1 rounded-xl bg-orange-700 px-3.5 py-2 text-xs font-bold text-white"
                        >
                          Explore Sevas <ArrowRight size={13} />
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ul className="mt-5 space-y-2.5">
                    {bookings.slice(0, 4).map((b) => (
                      <li
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700">
                            {b.kind} · {b.id}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-bold text-stone-800">
                            {b.title}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-stone-500">
                            <span>{b.date}</span>
                            <span aria-hidden="true">·</span>
                            <span>{b.detail}</span>
                          </p>
                        </div>

                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
                          {prettyStatus(b.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* BOOKINGS / ENQUIRIES                                          */}
          {/* ============================================================ */}

          {tab === "bookings" && (
            <div className="space-y-4">
              <div className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">
                      My Enquiries & Bookings
                    </h2>
                    <p className="mt-1 text-sm text-stone-500">
                      Track your puja, pandit, yatra, course and event requests.
                    </p>
                  </div>

                  {bookings.length > 0 && (
                    <span className="w-fit rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 ring-1 ring-orange-100">
                      {bookings.length} request{bookings.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {bookings.length === 0 ? (
                  <div className="mt-5">
                    <Empty
                      title="No requests yet"
                      sub="Your puja, pandit, yatra, course and event enquiries will appear here once you submit them."
                      action={
                        <div className="flex flex-wrap justify-center gap-2">
                          <Link
                            to="/services"
                            className="btn-saffron rounded-xl px-5 py-3 text-sm font-bold text-white"
                          >
                            Explore Sevas
                          </Link>
                          <Link
                            to="/pandits"
                            className="rounded-xl border border-orange-200 px-5 py-3 text-sm font-bold text-orange-900"
                          >
                            Find a Pandit
                          </Link>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {bookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-900/10 bg-stone-50 p-4"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-700">
                            {b.kind} · {b.id}
                          </p>
                          <p className="mt-1 text-sm font-bold text-stone-800">
                            {b.title}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-[13px] text-stone-500">
                            <span>{b.date}</span>
                            <span aria-hidden="true">·</span>
                            <span>{b.detail}</span>
                          </p>
                        </div>

                        <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-900">
                          {prettyStatus(b.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                  to="/services"
                  className="group rounded-2xl bg-orange-50 p-4 text-sm font-bold text-orange-900 ring-1 ring-orange-200 transition hover:bg-orange-100"
                >
                  <span className="flex items-center justify-between">
                    + New Puja Enquiry
                    <ArrowRight size={14} className="transition group-hover:translate-x-1" />
                  </span>
                </Link>

                <Link
                  to="/yatra"
                  className="group rounded-2xl bg-orange-50 p-4 text-sm font-bold text-orange-900 ring-1 ring-orange-200 transition hover:bg-orange-100"
                >
                  <span className="flex items-center justify-between">
                    + New Yatra Enquiry
                    <ArrowRight size={14} className="transition group-hover:translate-x-1" />
                  </span>
                </Link>

                <Link
                  to="/pandits"
                  className="group rounded-2xl bg-orange-50 p-4 text-sm font-bold text-orange-900 ring-1 ring-orange-200 transition hover:bg-orange-100"
                >
                  <span className="flex items-center justify-between">
                    + Pandit Request
                    <ArrowRight size={14} className="transition group-hover:translate-x-1" />
                  </span>
                </Link>

                <Link
                  to="/courses"
                  className="group rounded-2xl bg-orange-50 p-4 text-sm font-bold text-orange-900 ring-1 ring-orange-200 transition hover:bg-orange-100"
                >
                  <span className="flex items-center justify-between">
                    + Course Registration
                    <ArrowRight size={14} className="transition group-hover:translate-x-1" />
                  </span>
                </Link>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SAVED                                                         */}
          {/* ============================================================ */}

          {tab === "saved" && (
            <div className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  Saved Temples & Spiritual Places
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Keep the places that inspire your next journey close at hand.
                </p>
              </div>

              {savedT.length === 0 && savedP.length === 0 ? (
                <div className="mt-5">
                  <Empty
                    title="Nothing saved yet"
                    sub="Tap the heart on a temple or spiritual place to build your personal wishlist."
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <Link
                          to="/temples"
                          className="btn-saffron rounded-xl px-5 py-3 text-sm font-bold text-white"
                        >
                          Discover Temples
                        </Link>
                        <Link
                          to="/ashrams"
                          className="rounded-xl border border-orange-200 px-5 py-3 text-sm font-bold text-orange-900"
                        >
                          Explore Ashrams
                        </Link>
                      </div>
                    }
                  />
                </div>
              ) : (
                <div className="mt-6 space-y-7">
                  {savedT.length > 0 && (
                    <section>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500">
                          Saved Temples
                        </h3>
                        <Link
                          to="/temples"
                          className="text-xs font-bold text-orange-700"
                        >
                          Discover more
                        </Link>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {savedT.map((t) => (
                          <div
                            key={t.slug}
                            className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-orange-900/10"
                          >
                            <img
                              src={t.image}
                              alt={t.name}
                              className="h-16 w-16 shrink-0 rounded-xl object-cover"
                              loading="lazy"
                            />

                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/temples/${t.slug}`}
                                className="block truncate text-sm font-bold text-stone-800 hover:text-orange-700"
                              >
                                {t.name}
                              </Link>
                              <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                                <MapPin size={11} />
                                {t.city}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleSave("temple", t.slug)}
                              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {savedP.length > 0 && (
                    <section>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500">
                          Saved Spiritual Places
                        </h3>
                        <Link
                          to="/spiritual-places"
                          className="text-xs font-bold text-orange-700"
                        >
                          Discover more
                        </Link>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {savedP.map((p) => (
                          <div
                            key={p.slug}
                            className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-orange-900/10"
                          >
                            <img
                              src={p.image}
                              alt={p.name}
                              className="h-16 w-16 shrink-0 rounded-xl object-cover"
                              loading="lazy"
                            />

                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/spiritual-places/${p.slug}`}
                                className="block truncate text-sm font-bold text-stone-800 hover:text-orange-700"
                              >
                                {p.name}
                              </Link>
                              <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                                <MapPin size={11} />
                                {p.state}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleSave("place", p.slug)}
                              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* NOTIFICATIONS                                                 */}
          {/* ============================================================ */}

          {tab === "notifications" && (
            <div className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  Notifications
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Important updates related to your DivyaDhara activity.
                </p>
              </div>

              {notifications.length === 0 ? (
                <div className="mt-5">
                  <Empty
                    title="No notifications"
                    sub="You're all caught up. New account and activity updates will appear here."
                  />
                </div>
              ) : (
                <div className="mt-5 space-y-2.5">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 rounded-2xl border border-orange-900/10 bg-stone-50 p-4"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                        <Bell size={17} />
                      </span>

                      <div className="min-w-0">
                        <p className="text-sm leading-5 text-stone-700">{n.text}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-stone-400">
                          <Clock3 size={11} />
                          {n.date}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* PROFILE                                                        */}
          {/* ============================================================ */}

          {tab === "profile" && (
            <form
              onSubmit={handleProfileSave}
              className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="font-display text-2xl font-semibold">Profile</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Keep your contact and location details up to date for a smoother enquiry and booking experience.
                  </p>
                </div>

                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800 ring-1 ring-orange-100">
                  <User size={13} />
                  {roleLabel(user.role)}
                </span>
              </div>

              {authError && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold">Account update error</p>
                    <p className="mt-0.5">{authError}</p>
                  </div>
                </div>
              )}

              {profileError && !authError && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold">Unable to save profile</p>
                    <p className="mt-0.5">{profileError}</p>
                  </div>
                </div>
              )}

              {saved && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">Profile updated successfully.</p>
                    <p className="mt-0.5">Your latest profile details are saved to your account.</p>
                  </div>
                </div>
              )}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="d-n">
                    Full name
                  </label>
                  <input
                    id="d-n"
                    type="text"
                    value={f.name}
                    onChange={(e) => setF({ ...f, name: e.target.value })}
                    autoComplete="name"
                    maxLength={120}
                    className={input}
                    placeholder="Your full name"
                    disabled={isProfileUpdating}
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-bold text-stone-600" htmlFor="d-e">
                    <Mail size={12} />
                    Email
                  </label>
                  <input
                    id="d-e"
                    type="email"
                    value={user.email}
                    readOnly
                    aria-readonly="true"
                    className={readonlyInput}
                  />
                  <p className="mt-1.5 text-[11px] text-stone-400">
                    Account email is managed separately for security.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-bold text-stone-600" htmlFor="d-p">
                    <Phone size={12} />
                    Mobile
                  </label>
                  <input
                    id="d-p"
                    type="tel"
                    value={f.phone}
                    onChange={(e) => setF({ ...f, phone: e.target.value })}
                    autoComplete="tel"
                    maxLength={30}
                    className={input}
                    placeholder="+91 90000 00000"
                    disabled={isProfileUpdating}
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-bold text-stone-600" htmlFor="d-c">
                    <MapPin size={12} />
                    City
                  </label>
                  <input
                    id="d-c"
                    type="text"
                    value={f.city}
                    onChange={(e) => setF({ ...f, city: e.target.value })}
                    autoComplete="address-level2"
                    maxLength={100}
                    className={input}
                    placeholder="e.g. Mumbai"
                    disabled={isProfileUpdating}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="d-s">
                    State
                  </label>
                  <input
                    id="d-s"
                    type="text"
                    value={f.state}
                    onChange={(e) => setF({ ...f, state: e.target.value })}
                    autoComplete="address-level1"
                    maxLength={100}
                    className={input}
                    placeholder="e.g. Maharashtra"
                    disabled={isProfileUpdating}
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-bold text-stone-600" htmlFor="d-country">
                    <Globe2 size={12} />
                    Country
                  </label>
                  <input
                    id="d-country"
                    type="text"
                    value={f.country}
                    onChange={(e) => setF({ ...f, country: e.target.value })}
                    autoComplete="country-name"
                    maxLength={100}
                    className={input}
                    placeholder="India"
                    disabled={isProfileUpdating}
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-orange-900/10 pt-5 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={isProfileUpdating}
                  className="btn-saffron flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isProfileUpdating ? (
                    <>
                      <LoaderCircle size={15} className="animate-spin" />
                      Saving…
                    </>
                  ) : saved ? (
                    <>
                      <CheckCircle2 size={15} />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save size={15} />
                      Save Changes
                    </>
                  )}
                </button>

                {isProfileUpdating && (
                  <p className="text-xs text-stone-500">
                    Saving your profile to DivyaDhara…
                  </p>
                )}
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* SETTINGS                                                       */}
          {/* ============================================================ */}

          {tab === "settings" && (
            <div className="space-y-4">
              <div className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div>
                  <h2 className="font-display text-2xl font-semibold">
                    Notification Settings
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Choose which updates you would like to receive on this device.
                  </p>
                </div>

                <div className="mt-5 space-y-2.5">
                  {[
                    {
                      k: "whatsapp" as const,
                      l: "WhatsApp updates",
                      d: "Booking confirmations & enquiry-related alerts",
                    },
                    {
                      k: "email" as const,
                      l: "Email — Divya Patra",
                      d: "Weekly Panchang & festival letter",
                    },
                    {
                      k: "festival" as const,
                      l: "Festival reminders",
                      d: "Ekadashi, Purnima, Shivratri and key festival alerts",
                    },
                  ].map((o) => (
                    <label
                      key={o.k}
                      className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-orange-50/60 px-4 py-4 ring-1 ring-orange-100"
                    >
                      <span>
                        <span className="block text-sm font-bold text-stone-800">
                          {o.l}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-500">
                          {o.d}
                        </span>
                      </span>

                      <input
                        type="checkbox"
                        checked={prefs[o.k]}
                        onChange={() =>
                          setPrefs({ ...prefs, [o.k]: !prefs[o.k] })
                        }
                        className="h-5 w-5 accent-orange-700"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
                  <p className="text-xs leading-5 text-stone-500">
                    These notification preferences are currently saved on this device. This screen does not replace backend consent or lead-capture preferences; those remain governed by the account and DivyaDhara&apos;s notification/lead systems.
                  </p>
                </div>
              </div>

              <div className="rounded-[2rem] bg-linear-to-br from-stone-50 to-amber-50 p-6 ring-1 ring-orange-100 md:p-7">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-orange-700 shadow-sm ring-1 ring-orange-100">
                    <LifeBuoy size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-stone-800">
                      Need help with an enquiry or booking?
                    </p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      Use DivyaDhara support without leaving your account dashboard.
                    </p>
                    <a
                      href={`https://wa.me/919820809883?text=${encodeURIComponent(
                        "Namaste! I need help with my DivyaDhara account, enquiry or booking.",
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2 text-xs font-bold text-white"
                    >
                      <MessageCircle size={13} />
                      Contact Support
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
