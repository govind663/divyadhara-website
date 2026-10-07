/* eslint-disable no-extra-boolean-cast */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/preserve-manual-memoization */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  BarChart3,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  Clock3,
  Crown,
  Edit3,
  Eye,
  FileCheck2,
  FileText,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  User,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  useApp,
} from "../context/AppContext";

import {
  useSEO,
} from "../lib/seo";

import {
  confirmAction,
  showError,
  showSuccess,
  showWarning,
  toast,
} from "../lib/swal";

import {
  panditApi,
  PanditApiError,
  type PanditAnalytics,
  type PanditDashboardResponse,
  type PanditPlan,
  type PanditProfile,
  type PanditProfileInput,
  type PanditService,
  type PanditServiceInput,
  type PanditStats,
  type PanditSubscription,
  type PublicListingEligibility,
  type VerificationDocument,
} from "../lib/panditApi";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type TabId =
  | "overview"
  | "profile"
  | "services"
  | "leads"
  | "subscription"
  | "verification"
  | "analytics"
  | "notifications";

type LoadingState = {
  page: boolean;
  savingProfile: boolean;
  savingService: boolean;
  deletingService: boolean;
  changingServiceId: number | null;
  changingListing: boolean;
  analytics: boolean;
};

type ArrayField =
  | "languages"
  | "specializations"
  | "pujaTypes"
  | "serviceAreas";

/* -------------------------------------------------------------------------- */
/* Initial state                                                              */
/* -------------------------------------------------------------------------- */

function createEmptyProfile(): PanditProfileInput {
  return {
    name: "",
    phone: "",
    city: "",
    district: "",
    state: "",
    country: "India",

    displayName: "",
    title: "",
    photo: "",

    experienceYears: 0,

    location: "",

    languages: [],
    specializations: [],
    pujaTypes: [],

    associatedWith: "",
    about: "",
    availability: "",

    serviceAreas: [],
  };
}

function createEmptyService(): PanditServiceInput {
  return {
    name: "",
    description: "",
    priceAmount: null,
    currency: "INR",
    durationMinutes: null,
    isActive: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function csvToArray(
  value: string,
): string[] {
  return value
    .split(",")
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean)
    .filter(
      (
        item,
        index,
        all,
      ) =>
        all.indexOf(item) ===
        index,
    );
}

function arrayToCsv(
  value:
    | string[]
    | undefined,
): string {
  return (
    value ?? []
  ).join(", ");
}

function prettyStatus(
  value?:
    | string
    | null,
): string {
  if (!value) {
    return "Pending";
  }

  return value
    .replace(
      /[_-]+/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function normalizeStatus(
  value?:
    | string
    | null,
): string {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase()
    .replace(
      /[-\s]+/g,
      "_",
    );
}

function statusClass(
  status?:
    | string
    | null,
): string {
  const normalized =
    normalizeStatus(
      status,
    );

  if (
    [
      "approved",
      "verified",
      "active",
      "converted",
    ].includes(
      normalized,
    )
  ) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (
    [
      "rejected",
      "suspended",
      "blocked",
      "expired",
      "cancelled",
      "canceled",
    ].includes(
      normalized,
    )
  ) {
    return "bg-rose-100 text-rose-800";
  }

  return "bg-amber-100 text-amber-900";
}

function displayCurrency(
  amount:
    | number
    | null
    | undefined,
  currency:
    | string
    | undefined,
): string {
  if (
    amount === null ||
    amount === undefined
  ) {
    return "Price on request";
  }

  try {
    return new Intl.NumberFormat(
      "en-IN",
      {
        style: "currency",
        currency:
          currency || "INR",
        maximumFractionDigits: 0,
      },
    ).format(amount);
  } catch {
    return `${
      currency || "INR"
    } ${amount}`;
  }
}

function dateLabel(
  value?:
    | string
    | null,
): string {
  if (!value) {
    return "Not available";
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(parsed);
}

function daysRemaining(
  value?:
    | string
    | null,
): number | null {
  if (!value) {
    return null;
  }

  const time =
    new Date(value).getTime();

  if (
    !Number.isFinite(time)
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(
      (time - Date.now()) /
        86400000,
    ),
  );
}

function isValidPhotoUrl(
  value: string,
): boolean {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return true;
  }

  if (
    trimmed.startsWith(
      "/",
    ) ||
    trimmed.startsWith(
      "./",
    )
  ) {
    return true;
  }

  try {
    const url =
      new URL(trimmed);

    return (
      url.protocol ===
        "http:" ||
      url.protocol ===
        "https:"
    );
  } catch {
    return false;
  }
}

function calculateStats(
  services: PanditService[],
): PanditStats {
  const activeServices =
    services.filter(
      (service) =>
        service.isActive,
    ).length;

  return {
    totalServices:
      services.length,

    activeServices,

    inactiveServices:
      services.length -
      activeServices,
  };
}

function safeNumber(
  value: unknown,
): number {
  const numberValue =
    Number(value);

  return Number.isFinite(
    numberValue,
  )
    ? numberValue
    : 0;
}

function getUnknownRecord(
  value: unknown,
): Record<
  string,
  unknown
> | null {
  if (
    typeof value !==
      "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<
    string,
    unknown
  >;
}

function getNotificationValue(
  value: unknown,
  keys: string[],
): unknown {
  const record =
    getUnknownRecord(
      value,
    );

  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (
      record[key] !==
      undefined &&
      record[key] !== null
    ) {
      return record[key];
    }
  }

  return undefined;
}

function notificationText(
  value: unknown,
): string {
  const result =
    getNotificationValue(
      value,
      [
        "text",
        "message",
        "title",
        "body",
      ],
    );

  return typeof result ===
    "string" &&
    result.trim()
    ? result.trim()
    : "You have a new DivyaDhara account notification.";
}

function notificationDate(
  value: unknown,
): string {
  const result =
    getNotificationValue(
      value,
      [
        "date",
        "createdAt",
        "created_at",
        "timestamp",
      ],
    );

  if (
    typeof result ===
    "string"
  ) {
    return dateLabel(
      result,
    );
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function PanditDashboard() {
  useSEO({
    title:
      "Pandit Dashboard — Services, Leads & Subscription | DivyaDhara",

    description:
      "Manage your DivyaDhara Pandit profile, Puja services, enquiry leads, verification, subscription and public listing.",

    path:
      "/pandit/dashboard",
  });

  const {
    user,
    logout,
    refreshUser,
    notifications,
  } = useApp();

  const navigate =
    useNavigate();

  const [
    tab,
    setTab,
  ] = useState<TabId>(
    "overview",
  );

  const [
    mobileNavOpen,
    setMobileNavOpen,
  ] = useState(
    false,
  );

  const [
    profile,
    setProfile,
  ] = useState<
    PanditProfile | null
  >(null);

  const [
    profileMissing,
    setProfileMissing,
  ] = useState(
    false,
  );

  const [
    pageError,
    setPageError,
  ] = useState<
    string | null
  >(null);

  const [
    services,
    setServices,
  ] = useState<
    PanditService[]
  >([]);

  const [
    stats,
    setStats,
  ] = useState<PanditStats>(
    calculateStats([]),
  );

  const [
    verificationDocuments,
    setVerificationDocuments,
  ] = useState<
    VerificationDocument[]
  >([]);

  const [
    subscription,
    setSubscription,
  ] = useState<
    PanditSubscription | null
  >(null);

  const [
    plans,
    setPlans,
  ] = useState<
    PanditPlan[]
  >([]);

  const [
    analytics,
    setAnalytics,
  ] = useState<
    PanditAnalytics | null
  >(null);

  const [
    analyticsError,
    setAnalyticsError,
  ] = useState<
    string | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState<LoadingState>(
    {
      page: true,
      savingProfile: false,
      savingService: false,
      deletingService: false,
      changingServiceId:
        null,
      changingListing: false,
      analytics: false,
    },
  );

  const [
    profileForm,
    setProfileForm,
  ] = useState<PanditProfileInput>(
    createEmptyProfile(),
  );

  const [
    serviceForm,
    setServiceForm,
  ] = useState<PanditServiceInput>(
    createEmptyService(),
  );

  const [
    editingServiceId,
    setEditingServiceId,
  ] = useState<
    number | null
  >(null);

  const [
    serviceModalOpen,
    setServiceModalOpen,
  ] = useState(
    false,
  );

  /* ------------------------------------------------------------------------ */
  /* Runtime guards                                                           */
  /* ------------------------------------------------------------------------ */

  const mountedRef =
    useRef(true);

  const dashboardLoadingRef =
    useRef(false);

  const analyticsLoadingRef =
    useRef(false);

  const dashboardRequestIdRef =
    useRef(0);

  const autoLoadedUserKeyRef =
    useRef<
      string | null
    >(null);

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Shared form classes                                                      */
  /* ------------------------------------------------------------------------ */

  const formInput =
    "w-full rounded-xl border border-orange-900/10 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:bg-stone-100";

  /* ------------------------------------------------------------------------ */
  /* Profile form                                                             */
  /* ------------------------------------------------------------------------ */

  const fillProfileFormFromProfile =
    useCallback(
      (
        nextProfile: PanditProfile,
      ) => {
        setProfileForm({
          name:
            user?.name ?? "",

          phone:
            user?.phone ?? "",

          city:
            user?.city ??
            nextProfile.city ??
            "",

          district:
            nextProfile.district ??
            "",

          state:
            user?.state ??
            nextProfile.state ??
            "",

          country:
            user?.country ??
            nextProfile.country ??
            "India",

          displayName:
            nextProfile.displayName,

          title:
            nextProfile.title ??
            "",

          photo:
            nextProfile.photo ??
            "",

          experienceYears:
            Number(
              nextProfile.experienceYears ??
                0,
            ),

          location:
            nextProfile.location ??
            "",

          languages:
            Array.isArray(
              nextProfile.languages,
            )
              ? nextProfile.languages
              : [],

          specializations:
            Array.isArray(
              nextProfile.specializations,
            )
              ? nextProfile.specializations
              : [],

          pujaTypes:
            Array.isArray(
              nextProfile.pujaTypes,
            )
              ? nextProfile.pujaTypes
              : [],

          associatedWith:
            nextProfile.associatedWith ??
            "",

          about:
            nextProfile.about ??
            "",

          availability:
            nextProfile.availability ??
            "",

          serviceAreas:
            Array.isArray(
              nextProfile.serviceAreas,
            )
              ? nextProfile.serviceAreas
              : [],
        });
      },
      [
        user?.city,
        user?.country,
        user?.name,
        user?.phone,
        user?.state,
      ],
    );

  const resetProfileForm =
    useCallback(() => {
      if (profile) {
        fillProfileFormFromProfile(
          profile,
        );
        return;
      }

      setProfileForm({
        ...createEmptyProfile(),

        name:
          user?.name ?? "",

        phone:
          user?.phone ?? "",

        city:
          user?.city ?? "",

        state:
          user?.state ?? "",

        country:
          user?.country ??
          "India",

        displayName:
          user?.name ?? "",
      });
    }, [
      fillProfileFormFromProfile,
      profile,
      user?.city,
      user?.country,
      user?.name,
      user?.phone,
      user?.state,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Dashboard loading                                                        */
  /* ------------------------------------------------------------------------ */

  const loadDashboard =
    useCallback(async () => {
      /*
       * Prevent duplicate requests from:
       * - React StrictMode
       * - double clicks
       * - quick tab/navigation changes
       */
      if (
        dashboardLoadingRef.current
      ) {
        return;
      }

      dashboardLoadingRef.current =
        true;

      const requestId =
        dashboardRequestIdRef.current +
        1;

      dashboardRequestIdRef.current =
        requestId;

      if (
        mountedRef.current
      ) {
        setLoading(
          (current) => ({
            ...current,
            page: true,
          }),
        );

        setPageError(
          null,
        );
      }

      try {
        const raw: PanditDashboardResponse =
          await panditApi.dashboard();

        /*
         * Ignore stale responses.
         */
        if (
          !mountedRef.current ||
          requestId !==
            dashboardRequestIdRef.current
        ) {
          return;
        }

        const nextServices =
          Array.isArray(
            raw.services,
          )
            ? raw.services
            : [];

        const nextStats =
          raw.stats ??
          calculateStats(
            nextServices,
          );

        setProfile(
          raw.profile ?? null,
        );

        setProfileMissing(
          !raw.profile,
        );

        setServices(
          nextServices,
        );

        setStats(
          nextStats,
        );

        setVerificationDocuments(
          Array.isArray(
            raw.verificationDocuments,
          )
            ? raw.verificationDocuments
            : [],
        );

        setSubscription(
          raw.subscription ??
            null,
        );

        setPlans(
          Array.isArray(
            raw.plans,
          )
            ? raw.plans
            : [],
        );

        if (raw.profile) {
          fillProfileFormFromProfile(
            raw.profile,
          );
        } else {
          setProfileForm({
            ...createEmptyProfile(),

            name:
              user?.name ?? "",

            phone:
              user?.phone ?? "",

            city:
              user?.city ?? "",

            state:
              user?.state ?? "",

            country:
              user?.country ??
              "India",

            displayName:
              user?.name ?? "",
          });

          setTab(
            "profile",
          );
        }
      } catch (error) {
        if (
          !mountedRef.current ||
          requestId !==
            dashboardRequestIdRef.current
        ) {
          return;
        }

        const profileNotFound =
          error instanceof
            PanditApiError &&
          (
            error.status ===
              404 ||
            error.code ===
              "PANDIT_PROFILE_NOT_FOUND"
          );

        if (
          profileNotFound
        ) {
          setProfile(null);
          setProfileMissing(
            true,
          );

          setServices(
            [],
          );

          setStats(
            calculateStats(
              [],
            ),
          );

          setVerificationDocuments(
            [],
          );

          setSubscription(
            null,
          );

          setPlans(
            [],
          );

          setProfileForm({
            ...createEmptyProfile(),

            name:
              user?.name ?? "",

            phone:
              user?.phone ?? "",

            city:
              user?.city ?? "",

            state:
              user?.state ?? "",

            country:
              user?.country ??
              "India",

            displayName:
              user?.name ?? "",
          });

          setTab(
            "profile",
          );

          return;
        }

        setPageError(
          error instanceof Error
            ? error.message
            : "Unable to load your Pandit dashboard.",
        );
      } finally {
        if (
          requestId ===
          dashboardRequestIdRef.current
        ) {
          dashboardLoadingRef.current =
            false;

          if (
            mountedRef.current
          ) {
            setLoading(
              (current) => ({
                ...current,
                page: false,
              }),
            );
          }
        }
      }
    }, [
      fillProfileFormFromProfile,
      user?.city,
      user?.country,
      user?.name,
      user?.phone,
      user?.state,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Role guard                                                               */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!user) {
      return;
    }

    if (
      user.role !==
      "pandit"
    ) {
      const rolePaths: Record<
        string,
        string
      > = {
        visitor:
          "/dashboard",

        pandit:
          "/pandit/dashboard",

        temple_manager:
          "/temple/dashboard",

        ashram_manager:
          "/ashram/dashboard",

        sales:
          "/sales/dashboard",

        super_admin:
          "/admin",
      };

      navigate(
        rolePaths[
          String(
            user.role,
          )
        ] ?? "/",
        {
          replace: true,
        },
      );
    }
  }, [
    navigate,
    user,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Initial dashboard load                                                   */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      user?.role !==
      "pandit"
    ) {
      return;
    }

    /*
     * StrictMode can re-run effects during development.
     * Use a stable account key so the initial automatic request
     * only happens once for the current authenticated user.
     */
    const userKey =
      `${String(
        user.email ?? "",
      )}|${String(
        user.role ?? "",
      )}`;

    if (
      autoLoadedUserKeyRef.current ===
      userKey
    ) {
      return;
    }

    autoLoadedUserKeyRef.current =
      userKey;

    void loadDashboard();
  }, [
    loadDashboard,
    user?.email,
    user?.role,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Service modal Escape handler                                             */
  /* ------------------------------------------------------------------------ */

  const closeServiceModal =
    useCallback(() => {
      if (
        loading.savingService
      ) {
        return;
      }

      setServiceModalOpen(
        false,
      );

      setEditingServiceId(
        null,
      );

      setServiceForm(
        createEmptyService(),
      );
    }, [
      loading.savingService,
    ]);

  useEffect(() => {
    if (
      !serviceModalOpen
    ) {
      return;
    }

    const handleEscape =
      (event: KeyboardEvent) => {
        if (
          event.key ===
          "Escape"
        ) {
          closeServiceModal();
        }
      };

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [
    closeServiceModal,
    serviceModalOpen,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Derived state                                                            */
  /* ------------------------------------------------------------------------ */

  const activeServices =
    useMemo(
      () =>
        services.filter(
          (service) =>
            Boolean(
              service.isActive,
            ),
        ),
      [services],
    );

  const profileCompleteness =
    useMemo(() => {
      if (!profile) {
        return 0;
      }

      const values: Array<
        string | number | undefined
      > = [
        profile.displayName,
        profile.title ??
          undefined,
        profile.about ??
          undefined,
        profile.city ??
          undefined,
        profile.state ??
          undefined,
        profile.photo ??
          undefined,
        profile.languages
          ?.length,
        profile.specializations
          ?.length,
        profile.pujaTypes
          ?.length,
        profile.serviceAreas
          ?.length,
      ];

      const completed =
        values.filter(
          (value) =>
            Boolean(value),
        ).length;

      return Math.round(
        (completed /
          values.length) *
          100,
      );
    }, [profile]);

  const listingEligibility: PublicListingEligibility =
    profile?.publicListingEligibility ??
    {};

  const listingReady =
    Boolean(
      listingEligibility.eligible,
    );

  const hasActiveSubscription =
    normalizeStatus(
      subscription?.status,
    ) === "active";

  const subscriptionDays =
    daysRemaining(
      subscription?.expiresAt,
    );

  const serviceLimit =
    Number.isFinite(
      Number(
        subscription?.serviceLimit,
      ),
    )
      ? Number(
          subscription?.serviceLimit ??
            stats.serviceLimit ??
            0,
        )
      : Number(
          stats.serviceLimit ??
            0,
        );

  const serviceAreasLimit =
    Number(
      subscription?.serviceAreaLimit ??
        stats.serviceAreaLimit ??
        0,
    );

  const servicesUsed =
    Math.max(
      0,
      safeNumber(
        stats.activeServices,
      ),
    );

  const serviceAreasUsed =
    Math.max(
      0,
      safeNumber(
        stats.serviceAreasUsed ??
          profile?.serviceAreas
            ?.length ??
          0,
      ),
    );

  const servicesRemaining =
    serviceLimit > 0
      ? Math.max(
          0,
          serviceLimit -
            servicesUsed,
        )
      : null;

  const serviceAreasRemaining =
    serviceAreasLimit > 0
      ? Math.max(
          0,
          serviceAreasLimit -
            serviceAreasUsed,
        )
      : null;

  const leadsTotal =
    Math.max(
      0,
      safeNumber(
        stats.leadsTotal,
      ),
    );

  const openLeads =
    Math.max(
      0,
      safeNumber(
        stats.openLeads,
      ),
    );

  const convertedLeads =
    Math.max(
      0,
      safeNumber(
        stats.convertedLeads,
      ),
    );

  const followUps =
    Math.max(
      0,
      safeNumber(
        stats.followUps,
      ),
    );

  const creditedLeads =
    Math.max(
      0,
      safeNumber(
        stats.creditedLeads,
      ),
    );

  const leadsRemaining =
    Math.max(
      0,
      safeNumber(
        subscription?.leadsRemaining ??
          stats.leadsRemaining,
      ),
    );

  const openServiceCapacity =
    serviceLimit > 0
      ? `${servicesUsed}/${serviceLimit}`
      : `${servicesUsed}/∞`;

  const openLeadCapacity =
    subscription
      ? `${creditedLeads}/${Math.max(
          0,
          subscription.leadLimit,
        )}`
      : "0/—";

  const analyticsDays =
    Math.max(
      1,
      safeNumber(
        analytics?.range?.days,
      ) || 30,
    );

  /* ------------------------------------------------------------------------ */
  /* Service modal                                                             */
  /* ------------------------------------------------------------------------ */

  const openCreateService =
    useCallback(() => {
      if (
        loading.savingService
      ) {
        return;
      }

      setEditingServiceId(
        null,
      );

      setServiceForm(
        createEmptyService(),
      );

      setServiceModalOpen(
        true,
      );
    }, [
      loading.savingService,
    ]);

  const openEditService =
    useCallback(
      (
        service: PanditService,
      ) => {
        if (
          loading.savingService
        ) {
          return;
        }

        setEditingServiceId(
          service.id,
        );

        setServiceForm({
          name:
            service.name,

          description:
            service.description ??
            "",

          priceAmount:
            service.priceAmount,

          currency:
            service.currency ||
            "INR",

          durationMinutes:
            service.durationMinutes,

          isActive:
            Boolean(
              service.isActive,
            ),
        });

        setServiceModalOpen(
          true,
        );
      },
      [
        loading.savingService,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Save profile                                                             */
  /* ------------------------------------------------------------------------ */

  const saveProfile =
    useCallback(
      async () => {
        if (
          loading.savingProfile
        ) {
          return;
        }

        const displayName =
          profileForm.displayName
            ?.trim() ?? "";

        if (
          displayName.length <
          2
        ) {
          toast(
            "warning",
            "Display name must contain at least 2 characters.",
          );
          return;
        }

        const experienceYears =
          Number(
            profileForm.experienceYears ??
              0,
          );

        if (
          !Number.isFinite(
            experienceYears,
          ) ||
          experienceYears <
            0 ||
          experienceYears >
            100
        ) {
          toast(
            "warning",
            "Experience must be between 0 and 100 years.",
          );
          return;
        }

        const photo =
          profileForm.photo?.trim() ??
          "";

        if (
          !isValidPhotoUrl(
            photo,
          )
        ) {
          toast(
            "warning",
            "Please enter a valid HTTP(S) photo URL or relative path.",
          );
          return;
        }

        setLoading(
          (current) => ({
            ...current,
            savingProfile:
              true,
          }),
        );

        try {
          const payload: PanditProfileInput =
            {
              name:
                profileForm.name
                  ?.trim() ||
                undefined,

              phone:
                profileForm.phone
                  ?.trim() ||
                undefined,

              city:
                profileForm.city
                  ?.trim() ||
                undefined,

              district:
                profileForm.district
                  ?.trim() ||
                undefined,

              state:
                profileForm.state
                  ?.trim() ||
                undefined,

              country:
                profileForm.country
                  ?.trim() ||
                "India",

              displayName,

              title:
                profileForm.title
                  ?.trim() ||
                undefined,

              photo:
                photo ||
                undefined,

              experienceYears:
                Math.floor(
                  experienceYears,
                ),

              location:
                profileForm.location
                  ?.trim() ||
                undefined,

              languages:
                profileForm.languages ??
                [],

              specializations:
                profileForm.specializations ??
                [],

              pujaTypes:
                profileForm.pujaTypes ??
                [],

              associatedWith:
                profileForm.associatedWith
                  ?.trim() ||
                undefined,

              about:
                profileForm.about
                  ?.trim() ||
                undefined,

              availability:
                profileForm.availability
                  ?.trim() ||
                undefined,

              serviceAreas:
                profileForm.serviceAreas ??
                [],
            };

          const creating =
            profileMissing ||
            !profile;

          const response =
            creating
              ? await panditApi.createProfile(
                  payload,
                )
              : await panditApi.updateProfile(
                  payload,
                );

          if (
            !response.profile
          ) {
            throw new Error(
              "The server did not return the saved Pandit profile.",
            );
          }

          if (
            !mountedRef.current
          ) {
            return;
          }

          setProfile(
            response.profile,
          );

          setProfileMissing(
            false,
          );

          try {
            await refreshUser();
          } catch (error) {
            console.warn(
              "Unable to refresh authenticated user after Pandit profile save:",
              error,
            );
          }

          await showSuccess(
            creating
              ? "Profile created"
              : "Profile updated",

            creating
              ? "Your Pandit profile has been created and submitted for Admin review."
              : "Your Pandit profile has been saved successfully.",
          );

          await loadDashboard();

          if (
            mountedRef.current
          ) {
            setTab(
              "overview",
            );
          }
        } catch (error) {
          await showError(
            profileMissing ||
              !profile
              ? "Profile creation failed"
              : "Profile update failed",

            error instanceof Error
              ? error.message
              : "Please try again.",
          );
        } finally {
          if (
            mountedRef.current
          ) {
            setLoading(
              (current) => ({
                ...current,
                savingProfile:
                  false,
              }),
            );
          }
        }
      },
      [
        loadDashboard,
        loading.savingProfile,
        profile,
        profileForm,
        profileMissing,
        refreshUser,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Save service                                                             */
  /* ------------------------------------------------------------------------ */

  const saveService =
    useCallback(
      async () => {
        if (
          loading.savingService
        ) {
          return;
        }

        const name =
          serviceForm.name.trim();

        if (
          name.length <
          2
        ) {
          toast(
            "warning",
            "Puja/service name must contain at least 2 characters.",
          );
          return;
        }

        const currency =
          (
            serviceForm.currency ??
            "INR"
          )
            .trim()
            .toUpperCase();

        if (
          !/^[A-Z]{3}$/.test(
            currency,
          )
        ) {
          toast(
            "warning",
            "Currency must be a valid 3-letter code such as INR.",
          );
          return;
        }

        const priceAmount =
          serviceForm.priceAmount;

        if (
          priceAmount !==
            null &&
          priceAmount !==
            undefined &&
          (
            !Number.isFinite(
              Number(
                priceAmount,
              ),
            ) ||
            Number(
              priceAmount,
            ) < 0
          )
        ) {
          toast(
            "warning",
            "Price must be a valid non-negative number.",
          );
          return;
        }

        const durationMinutes =
          serviceForm.durationMinutes;

        if (
          durationMinutes !==
            null &&
          durationMinutes !==
            undefined &&
          (
            !Number.isInteger(
              Number(
                durationMinutes,
              ),
            ) ||
            Number(
              durationMinutes,
            ) < 1 ||
            Number(
              durationMinutes,
            ) > 1440
          )
        ) {
          toast(
            "warning",
            "Duration must be between 1 and 1440 minutes.",
          );
          return;
        }

        const wantsActive =
          serviceForm.isActive !==
          false;

        if (
          wantsActive &&
          !hasActiveSubscription
        ) {
          await showWarning(
            "Active subscription required",
            "The backend requires an active Pandit subscription before a service can be published.",
          );
          return;
        }

        if (
          wantsActive &&
          serviceLimit > 0 &&
          editingServiceId ===
            null &&
          servicesUsed >=
            serviceLimit
        ) {
          await showWarning(
            "Service limit reached",
            `Your current plan allows ${serviceLimit} active services. Upgrade your plan to publish more services.`,
          );
          return;
        }

        setLoading(
          (current) => ({
            ...current,
            savingService:
              true,
          }),
        );

        try {
          const payload: PanditServiceInput =
            {
              name,

              description:
                serviceForm.description
                  ?.trim() ||
                undefined,

              priceAmount:
                priceAmount ===
                    null ||
                priceAmount ===
                  undefined
                  ? null
                  : Number(
                      priceAmount,
                    ),

              currency,

              durationMinutes:
                durationMinutes ===
                    null ||
                durationMinutes ===
                  undefined
                  ? null
                  : Math.floor(
                      Number(
                        durationMinutes,
                      ),
                    ),

              isActive:
                wantsActive,
            };

          if (
            editingServiceId !==
            null
          ) {
            const response =
              await panditApi.updateService(
                editingServiceId,
                payload,
              );

            if (
              !response.service
            ) {
              throw new Error(
                "The server did not return the updated service.",
              );
            }

            setServices(
              (current) =>
                current.map(
                  (item) =>
                    item.id ===
                    response
                      .service
                      .id
                      ? response.service
                      : item,
                ),
            );

            await showSuccess(
              "Service updated",
              "Your Puja/service offering has been updated successfully.",
            );
          } else {
            const response =
              await panditApi.createService(
                payload,
              );

            if (
              !response.service
            ) {
              throw new Error(
                "The server did not return the created service.",
              );
            }

            setServices(
              (
                current,
              ) => [
                response.service,
                ...current,
              ],
            );

            await showSuccess(
              "Service created",
              "Your new Puja/service offering has been added successfully.",
            );
          }

          closeServiceModal();

          await loadDashboard();
        } catch (error) {
          await showError(
            editingServiceId !==
              null
              ? "Service update failed"
              : "Service creation failed",

            error instanceof Error
              ? error.message
              : "Please try again.",
          );
        } finally {
          if (
            mountedRef.current
          ) {
            setLoading(
              (current) => ({
                ...current,
                savingService:
                  false,
              }),
            );
          }
        }
      },
      [
        closeServiceModal,
        editingServiceId,
        hasActiveSubscription,
        loadDashboard,
        loading.savingService,
        serviceForm,
        serviceLimit,
        servicesUsed,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Delete service                                                           */
  /* ------------------------------------------------------------------------ */

  const deleteService =
    useCallback(
      async (
        service: PanditService,
      ) => {
        if (
          loading.deletingService
        ) {
          return;
        }

        const confirmed =
          await confirmAction(
            "Delete this Puja service?",

            `${service.name} will be permanently removed from your service list.`,

            "Yes, delete it",
          );

        if (!confirmed) {
          return;
        }

        setLoading(
          (current) => ({
            ...current,
            deletingService:
              true,
          }),
        );

        try {
          await panditApi.deleteService(
            service.id,
          );

          if (
            mountedRef.current
          ) {
            setServices(
              (current) =>
                current.filter(
                  (item) =>
                    item.id !==
                    service.id,
                ),
            );
          }

          await showSuccess(
            "Service deleted",
            "The Puja/service offering has been removed.",
          );

          await loadDashboard();
        } catch (error) {
          await showError(
            "Delete failed",
            error instanceof Error
              ? error.message
              : "Please try again.",
          );
        } finally {
          if (
            mountedRef.current
          ) {
            setLoading(
              (current) => ({
                ...current,
                deletingService:
                  false,
              }),
            );
          }
        }
      },
      [
        loadDashboard,
        loading.deletingService,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Toggle service                                                           */
  /* ------------------------------------------------------------------------ */

  const toggleService =
    useCallback(
      async (
        service: PanditService,
      ) => {
        if (
          loading.changingServiceId ===
          service.id
        ) {
          return;
        }

        const nextValue =
          !service.isActive;

        if (
          nextValue &&
          !hasActiveSubscription
        ) {
          await showWarning(
            "Active subscription required",
            "An active Pandit subscription is required before activating a service.",
          );
          return;
        }

        if (
          nextValue &&
          serviceLimit > 0 &&
          !service.isActive &&
          servicesUsed >=
            serviceLimit
        ) {
          await showWarning(
            "Service limit reached",
            `Your current plan allows ${serviceLimit} active services. Upgrade to publish another service.`,
          );
          return;
        }

        const confirmed =
          await confirmAction(
            nextValue
              ? "Activate this Puja service?"
              : "Deactivate this Puja service?",

            nextValue
              ? `${service.name} will become an active offering.`
              : `${service.name} will be hidden from your active offerings.`,

            nextValue
              ? "Activate service"
              : "Deactivate service",
          );

        if (!confirmed) {
          return;
        }

        setLoading(
          (current) => ({
            ...current,
            changingServiceId:
              service.id,
          }),
        );

        try {
          const response =
            await panditApi.updateService(
              service.id,
              {
                isActive:
                  nextValue,
              },
            );

          if (
            !response.service
          ) {
            throw new Error(
              "The server did not return the updated service.",
            );
          }

          if (
            mountedRef.current
          ) {
            setServices(
              (current) =>
                current.map(
                  (item) =>
                    item.id ===
                    service.id
                      ? response.service
                      : item,
                ),
            );
          }

          toast(
            "success",
            response.service
              .isActive
              ? "Service activated successfully."
              : "Service deactivated successfully.",
          );

          await loadDashboard();
        } catch (error) {
          await showError(
            "Service status update failed",

            error instanceof Error
              ? error.message
              : "Please try again.",
          );
        } finally {
          if (
            mountedRef.current
          ) {
            setLoading(
              (current) => ({
                ...current,
                changingServiceId:
                  null,
              }),
            );
          }
        }
      },
      [
        hasActiveSubscription,
        loadDashboard,
        loading.changingServiceId,
        serviceLimit,
        servicesUsed,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Toggle listing                                                           */
  /* ------------------------------------------------------------------------ */

  const toggleListing =
    useCallback(async () => {
      if (
        loading.changingListing
      ) {
        return;
      }

      if (!profile) {
        return;
      }

      const nextValue =
        !profile.listingActive;

      if (
        nextValue &&
        !listingReady
      ) {
        await showWarning(
          "Listing is not ready yet",

          "Public listing requires an active account, approved profile, completed verification and an eligible paid plan. The backend remains the final authority.",
        );

        return;
      }

      const confirmed =
        await confirmAction(
          nextValue
            ? "Activate your public listing?"
            : "Deactivate your public listing?",

          nextValue
            ? "Your eligible Pandit profile will be made visible wherever active listings are supported."
            : "Visitors will no longer see your profile as an active listing.",

          nextValue
            ? "Activate listing"
            : "Deactivate listing",
        );

      if (!confirmed) {
        return;
      }

      setLoading(
        (current) => ({
          ...current,
          changingListing:
            true,
        }),
      );

      try {
        const response =
          await panditApi.setListing(
            nextValue,
          );

        if (
          mountedRef.current
        ) {
          setProfile(
            (current) =>
              current
                ? {
                    ...current,
                    listingActive:
                      Boolean(
                        response.listingActive,
                      ),
                  }
                : current,
          );
        }

        await showSuccess(
          response.listingActive
            ? "Listing activated"
            : "Listing deactivated",

          response.listingActive
            ? "Your Pandit listing is active."
            : "Your Pandit listing is now hidden.",
        );

        await loadDashboard();
      } catch (error) {
        await showWarning(
          "Listing update blocked",

          error instanceof Error
            ? error.message
            : "Your listing could not be updated.",
        );
      } finally {
        if (
          mountedRef.current
        ) {
          setLoading(
            (current) => ({
              ...current,
              changingListing:
                false,
            }),
          );
        }
      }
    }, [
      listingReady,
      loadDashboard,
      loading.changingListing,
      profile,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Analytics                                                                */
  /* ------------------------------------------------------------------------ */

  const loadAnalytics =
    useCallback(async () => {
      if (
        analyticsLoadingRef.current
      ) {
        return;
      }

      analyticsLoadingRef.current =
        true;

      if (
        mountedRef.current
      ) {
        setAnalyticsError(
          null,
        );

        setLoading(
          (current) => ({
            ...current,
            analytics:
              true,
          }),
        );
      }

      try {
        const response =
          await panditApi.analytics();

        if (
          !mountedRef.current
        ) {
          return;
        }

        setAnalytics(
          response,
        );
      } catch (error) {
        if (
          mountedRef.current
        ) {
          setAnalyticsError(
            error instanceof Error
              ? error.message
              : "Unable to load analytics.",
          );
        }
      } finally {
        analyticsLoadingRef.current =
          false;

        if (
          mountedRef.current
        ) {
          setLoading(
            (current) => ({
              ...current,
              analytics:
                false,
            }),
          );
        }
      }
    }, []);

  useEffect(() => {
    if (
      tab !== "analytics"
    ) {
      return;
    }

    if (
      !subscription?.analyticsAccess
    ) {
      return;
    }

    if (
      analytics ||
      analyticsError
    ) {
      return;
    }

    void loadAnalytics();
  }, [
    analytics,
    analyticsError,
    loadAnalytics,
    subscription?.analyticsAccess,
    tab,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Logout                                                                   */
  /* ------------------------------------------------------------------------ */

  const handleLogout =
    useCallback(async () => {
      const confirmed =
        await confirmAction(
          "Logout from Pandit dashboard?",
          "Your active browser session will be closed.",
          "Logout",
        );

      if (!confirmed) {
        return;
      }

      try {
        await logout();

        navigate(
          "/",
          {
            replace: true,
          },
        );
      } catch (error) {
        await showError(
          "Logout failed",
          error instanceof Error
            ? error.message
            : "Please try again.",
        );
      }
    }, [
      logout,
      navigate,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Navigation                                                               */
  /* ------------------------------------------------------------------------ */

  const navItems: Array<{
    id: TabId;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }> = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
    },

    {
      id: "profile",
      label: profileMissing
        ? "Create Profile"
        : "My Profile",
      icon: User,
    },

    {
      id: "services",
      label: "Puja Services",
      icon: ListChecks,
      badge:
        activeServices.length,
    },

    {
      id: "leads",
      label: "Enquiries & Leads",
      icon: Target,
      badge: openLeads,
    },

    {
      id: "subscription",
      label: "Subscription",
      icon: Crown,
    },

    {
      id: "verification",
      label: "Verification",
      icon: ShieldCheck,
    },

    {
      id: "analytics",
      label: "Analytics",
      icon: BarChart3,
    },

    {
      id: "notifications",
      label: "Notifications",
      icon: Mail,
      badge:
        Array.isArray(
          notifications,
        )
          ? notifications.length
          : 0,
    },
  ];

  const readinessItems = [
    {
      label: "Account active",
      ok:
        listingEligibility.accountActive,
    },

    {
      label: "Profile approved",
      ok:
        listingEligibility.profileApproved,
    },

    {
      label: "Identity verified",
      ok:
        profile?.identityVerified,
    },

    {
      label: "Profile verified",
      ok:
        profile?.profileVerified,
    },

    {
      label: "Authorized contact",
      ok:
        profile?.authorizedContact,
    },

    {
      label: "Paid plan active",
      ok:
        listingEligibility.subscriptionActive,
    },

    {
      label: "Listing entitlement",
      ok:
        listingEligibility.listingEntitled,
    },
  ];

  /* ------------------------------------------------------------------------ */
  /* Early states                                                             */
  /* ------------------------------------------------------------------------ */

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] px-4 py-20">
        <div className="mx-auto max-w-lg rounded-3xl border border-orange-900/10 bg-white p-8 text-center shadow-sm">
          <ShieldCheck
            className="mx-auto text-orange-700"
            size={38}
          />

          <h1 className="mt-4 text-2xl font-black">
            Please login first
          </h1>

          <p className="mt-2 text-sm text-stone-600">
            Your Pandit dashboard requires an authenticated Pandit account.
          </p>

          <div className="mt-6 flex justify-center gap-2">
            <Link
              to="/login"
              className="btn-saffron rounded-xl px-5 py-3 text-sm font-bold text-white"
            >
              Login
            </Link>

            <Link
              to="/register"
              className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-orange-900"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (
    user.role !==
    "pandit"
  ) {
    return null;
  }

  if (
    loading.page &&
    !profile &&
    !profileMissing
  ) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
          <div className="rounded-3xl border border-orange-900/10 bg-white px-8 py-10 text-center shadow-sm">
            <RefreshCw
              className="mx-auto animate-spin text-orange-700"
              size={28}
            />

            <p className="mt-4 font-semibold text-stone-800">
              Loading your Pandit workspace…
            </p>

            <p className="mt-1 text-xs text-stone-500">
              Syncing profile, services, verification and subscription status.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (
    pageError
  ) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 md:p-10">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-sm">
            <AlertCircle
              className="mx-auto text-rose-600"
              size={38}
            />

            <h1 className="mt-4 text-2xl font-black text-stone-900">
              Unable to load dashboard
            </h1>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              {pageError}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadDashboard()
              }
              disabled={
                loading.page
              }
              className="btn-saffron mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={
                  loading.page
                    ? "animate-spin"
                    : ""
                }
              />
              {loading.page
                ? "Trying…"
                : "Try Again"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f2ea] text-stone-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#2a1a10] text-white shadow-lg">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setMobileNavOpen(
                  (current) =>
                    !current,
                )
              }
              className="rounded-xl border border-white/10 p-2 text-orange-100 md:hidden"
              aria-label="Open Pandit navigation"
              aria-expanded={
                mobileNavOpen
              }
            >
              {mobileNavOpen ? (
                <X size={19} />
              ) : (
                <Menu size={19} />
              )}
            </button>

            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600 shadow-inner">
              <BookOpen
                size={19}
              />
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-wide">
                DivyaDhara
              </p>

              <p className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-orange-300">
                Pandit Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={
                profile?.slug
                  ? `/pandits/${profile.slug}`
                  : "/pandits"
              }
              className="hidden items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-orange-100 hover:bg-white/10 sm:flex"
            >
              <Eye
                size={14}
              />
              View Profile
            </Link>

            <button
              type="button"
              onClick={() =>
                void loadDashboard()
              }
              disabled={
                loading.page
              }
              className="rounded-xl border border-white/10 p-2 text-orange-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh dashboard"
              aria-label="Refresh dashboard"
            >
              <RefreshCw
                size={16}
                className={
                  loading.page
                    ? "animate-spin"
                    : ""
                }
              />
            </button>

            <div className="hidden min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:block">
              <p className="truncate text-xs font-bold">
                {user.name ||
                  profile?.displayName ||
                  "Pandit"}
              </p>

              <p className="truncate text-[10px] text-orange-200/70">
                {user.email}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void handleLogout()
              }
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-orange-100 transition hover:bg-white/10"
            >
              <LogOut
                size={14}
              />

              <span className="hidden sm:inline">
                Logout
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] md:grid-cols-[250px_1fr]">
        <aside
          className={[
            "border-r border-orange-900/10 bg-[#f2eadf] p-4 md:min-h-[calc(100vh-64px)] md:block",

            mobileNavOpen
              ? "block"
              : "hidden",
          ].join(" ")}
        >
          <div className="rounded-3xl bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-200">
              Pandit Command Center
            </p>

            <h2 className="mt-2 text-xl font-bold">
              Jai Shri Ram 🙏
            </h2>

            <p className="mt-2 text-xs leading-5 text-orange-100/80">
              Grow your DivyaDhara presence, manage sacred services and respond to genuine enquiries.
            </p>
          </div>

          <nav
            className="mt-5 space-y-1.5"
            aria-label="Pandit dashboard"
          >
            {navItems.map(
              (
                item,
              ) => {
                const Icon =
                  item.icon;

                const active =
                  tab ===
                  item.id;

                const disabled =
                  profileMissing &&
                  ![
                    "profile",
                    "overview",
                  ].includes(
                    item.id,
                  );

                return (
                  <button
                    key={
                      item.id
                    }
                    type="button"
                    disabled={
                      disabled
                    }
                    onClick={() => {
                      if (
                        disabled
                      ) {
                        return;
                      }

                      setTab(
                        item.id,
                      );

                      setMobileNavOpen(
                        false,
                      );
                    }}
                    className={[
                      "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition",

                      active
                        ? "bg-[#2a1a10] text-orange-200 shadow"
                        : "text-stone-700 hover:bg-white",

                      disabled
                        ? "cursor-not-allowed opacity-40"
                        : "",
                    ].join(" ")}
                  >
                    <Icon
                      size={17}
                    />

                    <span className="min-w-0 flex-1">
                      {
                        item.label
                      }
                    </span>

                    {item.badge !==
                      undefined &&
                      item.badge >
                        0 && (
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[10px] font-black",

                            active
                              ? "bg-orange-500 text-white"
                              : "bg-orange-100 text-orange-800",
                          ].join(
                            " ",
                          )}
                        >
                          {item.badge >
                          99
                            ? "99+"
                            : item.badge}
                        </span>
                      )}
                  </button>
                );
              },
            )}
          </nav>

          <div className="mt-6 rounded-2xl border border-orange-900/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-stone-600">
                Profile completeness
              </span>

              <span className="text-sm font-black text-orange-800">
                {
                  profileCompleteness
                }
                %
              </span>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100">
              <div
                className="h-full rounded-full bg-orange-600 transition-all"
                style={{
                  width: `${profileCompleteness}%`,
                }}
              />
            </div>

            <p className="mt-2 text-[11px] leading-4 text-stone-500">
              A stronger profile helps visitors understand your expertise before they enquire.
            </p>
          </div>

          <div className="mt-3 rounded-2xl border border-orange-900/10 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
              Current plan
            </p>

            <p className="mt-1 text-sm font-black text-stone-800">
              {subscription?.planName ||
                "No active plan"}
            </p>

            <p className="mt-1 text-xs text-stone-500">
              {subscription
                ? `${displayCurrency(
                    subscription.priceAmount,
                    subscription.currency,
                  )} · ${
                    subscription.planInterval ||
                    "monthly"
                  }`
                : "Choose a plan to publish offerings."}
            </p>
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-[1200px]">

            {/* ---------------------------------------------------------------- */
            /* Overview                                                         */
            /* ---------------------------------------------------------------- */}

            {tab === "overview" && (
              <div className="space-y-6">
                {!profile ? (
                  <section className="rounded-[2rem] border border-orange-900/10 bg-white p-8 text-center shadow-sm">
                    <AlertCircle
                      className="mx-auto text-orange-700"
                      size={40}
                    />

                    <h1 className="mt-4 text-2xl font-black">
                      Complete your Pandit profile
                    </h1>

                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-600">
                      Your Pandit account exists, but the professional profile has not been created yet. Complete it first; Admin approval and verification remain separate backend-controlled steps.
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        setTab(
                          "profile",
                        )
                      }
                      className="btn-saffron mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"
                    >
                      <User
                        size={16}
                      />
                      Create Pandit Profile
                    </button>
                  </section>
                ) : (
                  <>
                    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-6 text-white shadow-lg md:p-8">
                      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">
                              Pandit Workspace
                            </p>

                            {normalizeStatus(
                              profile.verificationStatus,
                            ) ===
                              "verified" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black text-emerald-100 ring-1 ring-emerald-300/20">
                                <BadgeCheck
                                  size={11}
                                />
                                Verified
                              </span>
                            )}

                            {profile.featured && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/15 px-2.5 py-1 text-[10px] font-black text-amber-100 ring-1 ring-amber-200/20">
                                <Sparkles
                                  size={11}
                                />
                                Featured
                              </span>
                            )}
                          </div>

                          <h1 className="mt-2 text-3xl font-black md:text-4xl">
                            Namaste,{" "}
                            {
                              profile.displayName
                            }{" "}
                            🙏
                          </h1>

                          <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-100/85">
                            {profile.title ||
                              "Pandit / Acharya"}{" "}
                            {profile.city
                              ? `· ${profile.city}`
                              : ""}{" "}
                            ·{" "}
                            {
                              profile.experienceYears ||
                              0
                            }{" "}
                            years experience
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Link
                            to="/subscriptions"
                            className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900 shadow-sm"
                          >
                            <Crown
                              size={16}
                            />
                            {subscription
                              ? "Manage Plan"
                              : "Choose Plan"}
                          </Link>

                          <button
                            type="button"
                            onClick={() =>
                              void toggleListing()
                            }
                            disabled={
                              loading.changingListing
                            }
                            className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {loading.changingListing ? (
                              <RefreshCw
                                size={16}
                                className="animate-spin"
                              />
                            ) : profile.listingActive ? (
                              <CircleOff
                                size={16}
                              />
                            ) : (
                              <Eye
                                size={16}
                              />
                            )}

                            {loading.changingListing
                              ? "Updating…"
                              : profile.listingActive
                                ? "Hide Listing"
                                : "Go Live"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-200">
                            Public visibility
                          </p>

                          <p className="mt-1 text-lg font-black">
                            {profile.effectivePublicListing
                              ? "Live"
                              : "Not live"}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-200">
                            Leads remaining
                          </p>

                          <p className="mt-1 text-lg font-black">
                            {hasActiveSubscription
                              ? leadsRemaining
                              : "—"}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-200">
                            Plan
                          </p>

                          <p className="mt-1 truncate text-lg font-black">
                            {subscription?.planName ||
                              "No active plan"}
                          </p>
                        </div>
                      </div>
                    </section>

                    {!listingReady && (
                      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="flex gap-3">
                            <Clock3
                              className="mt-0.5 shrink-0 text-amber-700"
                              size={20}
                            />

                            <div>
                              <p className="text-sm font-black text-amber-900">
                                Your listing is not ready to go live
                              </p>

                              <p className="mt-1 text-xs leading-5 text-amber-800/80">
                                DivyaDhara keeps approval, verification and paid listing eligibility under server control. Complete the missing steps below.
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setTab(
                                "verification",
                              )
                            }
                            className="rounded-xl bg-white px-4 py-2 text-xs font-black text-orange-900 ring-1 ring-amber-200"
                          >
                            Check readiness
                          </button>
                        </div>
                      </section>
                    )}

                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        {
                          label:
                            "Open leads",
                          value:
                            openLeads,
                          sub: `${leadsTotal} total assigned`,
                          icon:
                            Target,
                        },

                        {
                          label:
                            "Converted",
                          value:
                            convertedLeads,
                          sub: `${followUps} follow-ups`,
                          icon:
                            TrendingUp,
                        },

                        {
                          label:
                            "Active services",
                          value:
                            servicesUsed,
                          sub: `Capacity ${openServiceCapacity}`,
                          icon:
                            ListChecks,
                        },

                        {
                          label:
                            "Leads remaining",
                          value:
                            hasActiveSubscription
                              ? leadsRemaining
                              : "—",
                          sub: `Used ${openLeadCapacity}`,
                          icon:
                            Zap,
                        },
                      ].map(
                        (
                          card,
                        ) => {
                          const Icon =
                            card.icon;

                          return (
                            <div
                              key={
                                card.label
                              }
                              className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                                  {
                                    card.label
                                  }
                                </p>

                                <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-700">
                                  <Icon
                                    size={
                                      17
                                    }
                                  />
                                </span>
                              </div>

                              <p className="mt-4 text-3xl font-black">
                                {
                                  card.value
                                }
                              </p>

                              <p className="mt-1 text-xs text-stone-500">
                                {
                                  card.sub
                                }
                              </p>
                            </div>
                          );
                        },
                      )}
                    </section>

                    <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
                      <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                              Your public offerings
                            </p>

                            <h2 className="mt-1 text-xl font-black">
                              Active Puja services
                            </h2>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setTab(
                                "services",
                              )
                            }
                            className="rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-orange-800 hover:bg-orange-50"
                          >
                            Manage services
                          </button>
                        </div>

                        <div className="mt-4 space-y-3">
                          {activeServices.length ===
                          0 ? (
                            <div className="rounded-2xl bg-orange-50 p-6 text-center">
                              <FileText
                                className="mx-auto text-orange-600"
                                size={
                                  25
                                }
                              />

                              <p className="mt-2 text-sm font-black">
                                No active services yet
                              </p>

                              <p className="mt-1 text-xs text-stone-500">
                                Activate your first service after a qualifying subscription is active.
                              </p>

                              <button
                                type="button"
                                onClick={
                                  openCreateService
                                }
                                disabled={
                                  loading.savingService
                                }
                                className="btn-saffron mt-4 rounded-xl px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                              >
                                Add service
                              </button>
                            </div>
                          ) : (
                            activeServices
                              .slice(
                                0,
                                5,
                              )
                              .map(
                                (
                                  service,
                                ) => (
                                  <div
                                    key={
                                      service.id
                                    }
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-orange-900/10 p-4"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold">
                                        {
                                          service.name
                                        }
                                      </p>

                                      <p className="mt-1 text-xs text-stone-500">
                                        {service.durationMinutes
                                          ? `${service.durationMinutes} min · `
                                          : ""}
                                        {displayCurrency(
                                          service.priceAmount,
                                          service.currency,
                                        )}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        openEditService(
                                          service,
                                        )
                                      }
                                      disabled={
                                        loading.savingService
                                      }
                                      className="rounded-lg p-2 text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      title="Edit service"
                                    >
                                      <Edit3
                                        size={
                                          16
                                        }
                                      />
                                    </button>
                                  </div>
                                ),
                              )
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-orange-100 font-black text-orange-800">
                            {profile.photo ? (
                              <img
                                src={
                                  profile.photo
                                }
                                alt={
                                  profile.displayName
                                }
                                className="h-full w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              profile.displayName
                                .charAt(
                                  0,
                                )
                                .toUpperCase()
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-black">
                              {
                                profile.displayName
                              }
                            </p>

                            <p className="truncate text-xs text-stone-500">
                              {profile.title ||
                                "Pandit / Acharya"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 space-y-2.5 text-sm text-stone-600">
                          <p className="flex items-center gap-2">
                            <MapPin
                              size={
                                15
                              }
                              className="text-orange-700"
                            />
                            {profile.city ||
                              "City not set"}
                            {profile.state
                              ? `, ${profile.state}`
                              : ""}
                          </p>

                          <p className="flex items-center gap-2">
                            <Clock3
                              size={
                                15
                              }
                              className="text-orange-700"
                            />
                            {profile.experienceYears ||
                              0}{" "}
                            years experience
                          </p>

                          <p className="flex items-center gap-2">
                            <Phone
                              size={
                                15
                              }
                              className="text-orange-700"
                            />
                            {user.phone ||
                              "Phone not set"}
                          </p>

                          <p className="flex items-center gap-2">
                            <Mail
                              size={
                                15
                              }
                              className="text-orange-700"
                            />
                            {
                              user.email
                            }
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setTab(
                              "profile",
                            )
                          }
                          className="mt-5 flex w-full items-center justify-between rounded-xl bg-orange-50 px-4 py-3 text-xs font-black text-orange-900"
                        >
                          Improve profile{" "}
                          <ChevronRight
                            size={
                              14
                            }
                          />
                        </button>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                            Business readiness
                          </p>

                          <h2 className="mt-1 text-xl font-black">
                            What controls your public visibility?
                          </h2>
                        </div>

                        <ShieldCheck
                          className="text-orange-700"
                          size={
                            21
                          }
                        />
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {readinessItems
                          .slice(
                            0,
                            4,
                          )
                          .map(
                            (
                              item,
                            ) => (
                              <div
                                key={
                                  item.label
                                }
                                className="flex items-center gap-2 rounded-2xl bg-stone-50 p-3"
                              >
                                {item.ok ? (
                                  <CheckCircle2
                                    className="text-emerald-600"
                                    size={
                                      17
                                    }
                                  />
                                ) : (
                                  <Clock3
                                    className="text-amber-600"
                                    size={
                                      17
                                    }
                                  />
                                )}

                                <span className="text-xs font-bold text-stone-700">
                                  {
                                    item.label
                                  }
                                </span>
                              </div>
                            ),
                          )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {/* ---------------------------------------------------------------- */
            /* Profile                                                          */
            /* ---------------------------------------------------------------- */}

            {tab === "profile" && (
              <section className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                      Professional identity
                    </p>

                    <h1 className="mt-1 text-2xl font-black">
                      {profileMissing
                        ? "Create your Pandit profile"
                        : "My Pandit profile"}
                    </h1>

                    <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
                      Keep your information accurate. Admin-controlled approval and verification fields cannot be self-edited.
                    </p>
                  </div>

                  {profile && (
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-black ${statusClass(
                        profile.profileStatus,
                      )}`}
                    >
                      {prettyStatus(
                        profile.profileStatus,
                      )}
                    </span>
                  )}
                </div>

                {profile?.rejectionReason && (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                    <p className="font-black">
                      Admin review note
                    </p>

                    <p className="mt-1 leading-5">
                      {
                        profile.rejectionReason
                      }
                    </p>
                  </div>
                )}

                <div className="mt-7 grid gap-5 lg:grid-cols-2">
                  {[
                    [
                      "Account name",
                      "name",
                      "text",
                      "Your account name",
                    ],

                    [
                      "Phone",
                      "phone",
                      "tel",
                      "+91 90000 00000",
                    ],

                    [
                      "Display name",
                      "displayName",
                      "text",
                      "How visitors will see you",
                    ],

                    [
                      "Professional title",
                      "title",
                      "text",
                      "Vedic Pandit · Jyotish Acharya",
                    ],

                    [
                      "Photo URL",
                      "photo",
                      "url",
                      "https://…",
                    ],

                    [
                      "Experience (years)",
                      "experienceYears",
                      "number",
                      "0",
                    ],

                    [
                      "Location",
                      "location",
                      "text",
                      "Primary service location",
                    ],

                    [
                      "City",
                      "city",
                      "text",
                      "City",
                    ],

                    [
                      "District",
                      "district",
                      "text",
                      "District",
                    ],

                    [
                      "State",
                      "state",
                      "text",
                      "State",
                    ],

                    [
                      "Country",
                      "country",
                      "text",
                      "India",
                    ],

                    [
                      "Associated with",
                      "associatedWith",
                      "text",
                      "Temple / institution / lineage",
                    ],
                  ].map(
                    ([
                      label,
                      key,
                      type,
                      placeholder,
                    ]) => (
                      <div
                        key={
                          key
                        }
                      >
                        <label className="mb-1.5 block text-xs font-bold text-stone-600">
                          {label}
                        </label>

                        <input
                          className={
                            formInput
                          }
                          type={
                            type as
                              | "text"
                              | "tel"
                              | "url"
                              | "number"
                          }
                          min={
                            type ===
                            "number"
                              ? 0
                              : undefined
                          }
                          max={
                            type ===
                            "number"
                              ? 100
                              : undefined
                          }
                          value={String(
                            profileForm[
                              key as keyof PanditProfileInput
                            ] ??
                              "",
                          )}
                          placeholder={
                            placeholder
                          }
                          disabled={
                            loading.savingProfile
                          }
                          onChange={(
                            event,
                          ) => {
                            const value =
                              type ===
                              "number"
                                ? Number(
                                    event
                                      .target
                                      .value ||
                                      0,
                                  )
                                : event
                                    .target
                                    .value;

                            setProfileForm(
                              (
                                current,
                              ) => ({
                                ...current,
                                [key]:
                                  value,
                              }),
                            );
                          }}
                        />
                      </div>
                    ),
                  )}

                  {(
                    [
                      [
                        "Languages",
                        "languages",
                      ],

                      [
                        "Specializations",
                        "specializations",
                      ],

                      [
                        "Puja types",
                        "pujaTypes",
                      ],

                      [
                        "Service areas",
                        "serviceAreas",
                      ],
                    ] as Array<
                      [
                        string,
                        ArrayField,
                      ]
                    >
                  ).map(
                    ([
                      label,
                      key,
                    ]) => (
                      <div
                        key={
                          key
                        }
                      >
                        <label className="mb-1.5 block text-xs font-bold text-stone-600">
                          {label}{" "}
                          <span className="font-normal">
                            (comma separated)
                          </span>
                        </label>

                        <input
                          className={
                            formInput
                          }
                          disabled={
                            loading.savingProfile
                          }
                          value={arrayToCsv(
                            profileForm[
                              key
                            ],
                          )}
                          onChange={(
                            event,
                          ) =>
                            setProfileForm(
                              (
                                current,
                              ) => ({
                                ...current,
                                [key]:
                                  csvToArray(
                                    event
                                      .target
                                      .value,
                                  ),
                              }),
                            )
                          }
                        />
                      </div>
                    ),
                  )}

                  <div className="lg:col-span-2">
                    <label className="mb-1.5 block text-xs font-bold text-stone-600">
                      Availability
                    </label>

                    <input
                      className={
                        formInput
                      }
                      disabled={
                        loading.savingProfile
                      }
                      placeholder="Mon–Sat · 9 AM–7 PM"
                      value={
                        profileForm.availability ??
                        ""
                      }
                      onChange={(
                        event,
                      ) =>
                        setProfileForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            availability:
                              event.target.value,
                          }),
                        )
                      }
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-1.5 block text-xs font-bold text-stone-600">
                      About
                    </label>

                    <textarea
                      rows={6}
                      maxLength={
                        5000
                      }
                      disabled={
                        loading.savingProfile
                      }
                      className={
                        formInput
                      }
                      value={
                        profileForm.about ??
                        ""
                      }
                      onChange={(
                        event,
                      ) =>
                        setProfileForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            about:
                              event.target.value,
                          }),
                        )
                      }
                    />

                    <p className="mt-1 text-right text-[11px] text-stone-400">
                      {
                        (
                          profileForm.about ??
                          ""
                        ).length
                      }
                      /5000
                    </p>
                  </div>
                </div>

                <div className="mt-7 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={
                      loading.savingProfile
                    }
                    onClick={
                      resetProfileForm
                    }
                    className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-orange-50 disabled:opacity-50"
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    disabled={
                      loading.savingProfile
                    }
                    onClick={() =>
                      void saveProfile()
                    }
                    className="btn-saffron flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:opacity-60"
                  >
                    {loading.savingProfile ? (
                      <RefreshCw
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <Save
                        size={
                          16
                        }
                      />
                    )}

                    {loading.savingProfile
                      ? "Saving…"
                      : profileMissing
                        ? "Create Profile"
                        : "Save Profile"}
                  </button>
                </div>
              </section>
            )}

            {/* ---------------------------------------------------------------- */
            /* Services                                                         */
            /* ---------------------------------------------------------------- */}

            {tab === "services" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                      Service catalogue
                    </p>

                    <h1 className="mt-1 text-2xl font-black">
                      Puja & service offerings
                    </h1>

                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      The backend enforces subscription requirements and service limits; this screen mirrors those rules to prevent avoidable errors.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      openCreateService
                    }
                    disabled={
                      loading.savingService ||
                      loading.deletingService
                    }
                    className="btn-saffron flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus
                      size={
                        17
                      }
                    />
                    Add Service
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-orange-900/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold text-stone-500">
                      Active
                    </p>

                    <p className="mt-2 text-3xl font-black">
                      {
                        servicesUsed
                      }
                    </p>

                    <p className="mt-1 text-xs text-stone-500">
                      Capacity{" "}
                      {
                        openServiceCapacity
                      }
                    </p>
                  </div>

                  <div className="rounded-2xl border border-orange-900/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold text-stone-500">
                      Remaining slots
                    </p>

                    <p className="mt-2 text-3xl font-black text-emerald-700">
                      {servicesRemaining ===
                      null
                        ? "∞"
                        : servicesRemaining}
                    </p>

                    <p className="mt-1 text-xs text-stone-500">
                      Based on current plan
                    </p>
                  </div>

                  <div className="rounded-2xl border border-orange-900/10 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold text-stone-500">
                      Plan
                    </p>

                    <p className="mt-2 truncate text-xl font-black">
                      {subscription?.planName ||
                        "No plan"}
                    </p>

                    <p className="mt-1 text-xs text-stone-500">
                      {hasActiveSubscription
                        ? "Publishing enabled"
                        : "Publishing locked"}
                    </p>
                  </div>
                </div>

                {!hasActiveSubscription && (
                  <div className="rounded-3xl border border-orange-200 bg-orange-50 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-3">
                        <Crown
                          className="mt-0.5 shrink-0 text-orange-700"
                          size={
                            19
                          }
                        />

                        <div>
                          <p className="text-sm font-black text-orange-900">
                            Activate a qualifying Pandit plan before publishing services.
                          </p>

                          <p className="mt-1 text-xs leading-5 text-orange-800/80">
                            Current backend pricing is authoritative; the dashboard never acts as the payment authority.
                          </p>
                        </div>
                      </div>

                      <Link
                        to="/subscriptions"
                        className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-orange-900 ring-1 ring-orange-200"
                      >
                        View plans
                      </Link>
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                  {services.length ===
                  0 ? (
                    <div className="p-10 text-center">
                      <FileText
                        className="mx-auto text-orange-600"
                        size={
                          28
                        }
                      />

                      <h2 className="mt-3 text-lg font-black">
                        No services yet
                      </h2>

                      <p className="mt-1 text-sm text-stone-500">
                        Create your first offering to start presenting your Puja expertise.
                      </p>

                      <button
                        type="button"
                        onClick={
                          openCreateService
                        }
                        disabled={
                          loading.savingService ||
                          loading.deletingService
                        }
                        className="btn-saffron mt-5 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Create Service
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-orange-900/10">
                      {services.map(
                        (
                          service,
                        ) => {
                          const serviceBusy =
                            loading.changingServiceId ===
                            service.id;

                          return (
                            <div
                              key={
                                service.id
                              }
                              className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="flex min-w-0 gap-4">
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
                                  <IndianRupee
                                    size={
                                      18
                                    }
                                  />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="font-bold text-stone-900">
                                      {
                                        service.name
                                      }
                                    </h2>

                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                                        service.isActive
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-stone-100 text-stone-600"
                                      }`}
                                    >
                                      {service.isActive
                                        ? "active"
                                        : "inactive"}
                                    </span>
                                  </div>

                                  <p className="mt-1 line-clamp-2 text-sm text-stone-500">
                                    {service.description ||
                                      "No description"}
                                  </p>

                                  <p className="mt-2 text-xs font-bold text-orange-800">
                                    {displayCurrency(
                                      service.priceAmount,
                                      service.currency,
                                    )}

                                    {service.durationMinutes
                                      ? ` · ${service.durationMinutes} min`
                                      : ""}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void toggleService(
                                      service,
                                    )
                                  }
                                  disabled={
                                    serviceBusy ||
                                    loading.deletingService ||
                                    loading.savingService
                                  }
                                  className="inline-flex min-w-[105px] items-center justify-center gap-1.5 rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {serviceBusy && (
                                    <RefreshCw
                                      size={
                                        13
                                      }
                                      className="animate-spin"
                                    />
                                  )}

                                  {service.isActive
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditService(
                                      service,
                                    )
                                  }
                                  disabled={
                                    serviceBusy ||
                                    loading.deletingService ||
                                    loading.savingService
                                  }
                                  className="rounded-xl border border-orange-900/10 p-2.5 text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Edit"
                                  aria-label={`Edit ${service.name}`}
                                >
                                  <Edit3
                                    size={
                                      16
                                    }
                                  />
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void deleteService(
                                      service,
                                    )
                                  }
                                  disabled={
                                    loading.deletingService ||
                                    serviceBusy ||
                                    loading.savingService
                                  }
                                  className="rounded-xl border border-rose-100 p-2.5 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Delete"
                                  aria-label={`Delete ${service.name}`}
                                >
                                  {loading.deletingService ? (
                                    <RefreshCw
                                      size={
                                        16
                                      }
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2
                                      size={
                                        16
                                      }
                                    />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ---------------------------------------------------------------- */
            /* Leads                                                            */
            /* ---------------------------------------------------------------- */}

            {tab === "leads" && (
              <section className="space-y-5">
                <div className="rounded-3xl bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-6 text-white shadow-lg md:p-8">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200">
                    Lead workspace
                  </p>

                  <h1 className="mt-1 text-2xl font-black md:text-3xl">
                    Visitor enquiries that can become bookings
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-100/85">
                    Leads are generated by DivyaDhara's verified capture flow and assigned by the backend. Your subscription controls lead capacity; you cannot create or grant lead credits from this screen.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      "Total assigned",
                      leadsTotal,
                      "All lead assignments",
                    ],

                    [
                      "Open",
                      openLeads,
                      "Needs attention",
                    ],

                    [
                      "Follow-ups",
                      followUps,
                      "Scheduled next actions",
                    ],

                    [
                      "Converted",
                      convertedLeads,
                      "Marked converted",
                    ],
                  ].map(
                    ([
                      label,
                      value,
                      sub,
                    ]) => (
                      <div
                        key={String(
                          label,
                        )}
                        className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"
                      >
                        <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                          {
                            label
                          }
                        </p>

                        <p className="mt-3 text-3xl font-black">
                          {
                            value
                          }
                        </p>

                        <p className="mt-1 text-xs text-stone-500">
                          {
                            sub
                          }
                        </p>
                      </div>
                    ),
                  )}
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                        Commercial capacity
                      </p>

                      <h2 className="mt-1 text-xl font-black">
                        Lead credits
                      </h2>
                    </div>

                    <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-black text-orange-800">
                      {subscription
                        ? `${creditedLeads} / ${subscription.leadLimit} used`
                        : "No active plan"}
                    </span>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-orange-100">
                    <div
                      className="h-full rounded-full bg-orange-600 transition-all"
                      style={{
                        width: `${
                          subscription?.leadLimit
                            ? Math.min(
                                100,
                                Math.max(
                                  0,
                                  (creditedLeads /
                                    subscription.leadLimit) *
                                    100,
                                ),
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Remaining
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {hasActiveSubscription
                          ? leadsRemaining
                          : "—"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Credited
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {
                          creditedLeads
                        }
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Conversion
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {leadsTotal >
                        0
                          ? `${Math.min(
                              100,
                              Math.round(
                                (convertedLeads /
                                  leadsTotal) *
                                  100,
                              ),
                            )}%`
                          : "0%"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-dashed border-orange-900/15 bg-white p-8 text-center">
                  <MessageCircle
                    className="mx-auto text-orange-600"
                    size={
                      29
                    }
                  />

                  <h2 className="mt-3 text-lg font-black">
                    Lead detail actions stay server-controlled
                  </h2>

                  <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-stone-500">
                    Detailed lead records, status changes, notes and follow-ups are available through the authenticated Pandit lead API. This dashboard intentionally does not invent local lead data or expose another customer's information.
                  </p>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl bg-orange-50 p-4 text-left">
                      <p className="text-xs font-black text-orange-900">
                        1. Receive
                      </p>

                      <p className="mt-1 text-xs text-stone-600">
                        Verified enquiry is assigned to your Pandit profile.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-orange-50 p-4 text-left">
                      <p className="text-xs font-black text-orange-900">
                        2. Respond
                      </p>

                      <p className="mt-1 text-xs text-stone-600">
                        Use the lead workflow to contact and follow up.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-orange-50 p-4 text-left">
                      <p className="text-xs font-black text-orange-900">
                        3. Convert
                      </p>

                      <p className="mt-1 text-xs text-stone-600">
                        Mark genuine outcomes so performance reporting stays meaningful.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ---------------------------------------------------------------- */
            /* Subscription                                                     */
            /* ---------------------------------------------------------------- */}

            {tab === "subscription" && (
              <section className="space-y-5">
                <div className="rounded-3xl bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-6 text-white shadow-lg md:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200">
                        Pandit growth plans
                      </p>

                      <h1 className="mt-1 text-2xl font-black md:text-3xl">
                        Choose the capability that matches your practice
                      </h1>

                      <p className="mt-2 text-sm text-orange-100/85">
                        Pricing and entitlements below come from the backend catalogue. The client never decides the payable amount.
                      </p>
                    </div>

                    <Link
                      to="/subscriptions"
                      className="rounded-xl bg-white px-4 py-3 text-xs font-black text-orange-900"
                    >
                      Open subscription page
                    </Link>
                  </div>
                </div>

                {subscription ? (
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-black text-orange-800">
                            Current plan
                          </span>

                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-black ${statusClass(
                              subscription.status,
                            )}`}
                          >
                            {prettyStatus(
                              subscription.status,
                            )}
                          </span>
                        </div>

                        <h2 className="mt-3 text-2xl font-black">
                          {subscription.planName ||
                            subscription.planCode ||
                            "Pandit plan"}
                        </h2>

                        <p className="mt-1 text-sm text-stone-500">
                          {displayCurrency(
                            subscription.priceAmount,
                            subscription.currency,
                          )}{" "}
                          ·{" "}
                          {subscription.planInterval ||
                            "monthly"}{" "}
                          ·{" "}
                          {subscriptionDays !==
                          null
                            ? `${subscriptionDays} days remaining`
                            : `${dateLabel(
                                subscription.expiresAt,
                              )} expiry`}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            Leads
                          </p>

                          <p className="mt-1 font-black">
                            {
                              leadsRemaining
                            }
                            /
                            {
                              subscription.leadLimit
                            }
                          </p>
                        </div>

                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            Services
                          </p>

                          <p className="mt-1 font-black">
                            {
                              servicesUsed
                            }
                            /
                            {
                              subscription.serviceLimit
                            }
                          </p>
                        </div>

                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            Search
                          </p>

                          <p className="mt-1 font-black">
                            {
                              subscription.searchVisibility
                            }
                          </p>
                        </div>

                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            Analytics
                          </p>

                          <p className="mt-1 font-black">
                            {
                              subscription.analyticsLevel
                            }
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        [
                          "Listing",
                          subscription.listingEnabled,
                        ],
                        [
                          "Featured",
                          subscription.featuredListing,
                        ],
                        [
                          "Homepage promotion",
                          subscription.homepagePromotion,
                        ],
                        [
                          "Enhanced profile",
                          subscription.enhancedProfile,
                        ],
                        [
                          "Enhanced SEO",
                          subscription.enhancedSeo,
                        ],
                        [
                          "WhatsApp enquiry",
                          subscription.whatsappEnquiry,
                        ],
                        [
                          "Verification badge",
                          subscription.verificationBadge,
                        ],
                        [
                          "Analytics",
                          subscription.analyticsAccess,
                        ],
                      ].map(
                        ([
                          label,
                          enabled,
                        ]) => (
                          <div
                            key={String(
                              label,
                            )}
                            className="flex items-center gap-2 rounded-2xl bg-orange-50 p-3"
                          >
                            {Boolean(
                              enabled,
                            ) ? (
                              <CheckCircle2
                                className="text-emerald-600"
                                size={
                                  16
                                }
                              />
                            ) : (
                              <CircleOff
                                className="text-stone-400"
                                size={
                                  16
                                }
                              />
                            )}

                            <span className="text-xs font-bold text-stone-700">
                              {
                                label
                              }
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-center">
                    <Crown
                      className="mx-auto text-orange-700"
                      size={
                        30
                      }
                    />

                    <h2 className="mt-3 text-xl font-black">
                      No active Pandit plan
                    </h2>

                    <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-stone-600">
                      An active plan is needed for service publishing and public listing eligibility according to the current backend rules.
                    </p>

                    <Link
                      to="/subscriptions"
                      className="btn-saffron mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"
                    >
                      <Crown
                        size={
                          16
                        }
                      />
                      View Plans
                    </Link>
                  </div>
                )}

                <div className="grid gap-5 lg:grid-cols-2">
                  {plans.map(
                    (
                      plan,
                    ) => {
                      const isCurrent =
                        subscription?.planId ===
                        plan.id;

                      return (
                        <div
                          key={
                            plan.id
                          }
                          className={`rounded-3xl border bg-white p-6 shadow-sm ${
                            isCurrent
                              ? "border-orange-400 ring-2 ring-orange-100"
                              : "border-orange-900/10"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700">
                                {
                                  plan.code
                                }
                              </p>

                              <h2 className="mt-1 text-2xl font-black">
                                {
                                  plan.name
                                }
                              </h2>
                            </div>

                            {isCurrent && (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">
                                Current
                              </span>
                            )}
                          </div>

                          <p className="mt-3 text-3xl font-black">
                            {displayCurrency(
                              plan.priceAmount,
                              plan.currency,
                            )}

                            <span className="text-sm font-semibold text-stone-500">
                              {" "}
                              /{" "}
                              {
                                plan.durationDays
                              }{" "}
                              days
                            </span>
                          </p>

                          <p className="mt-2 text-sm leading-5 text-stone-500">
                            {plan.description ||
                              "Pandit growth plan"}
                          </p>

                          <div className="mt-5 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-[10px] font-bold text-stone-400">
                                Leads
                              </p>

                              <p className="mt-1 font-black">
                                {
                                  plan.leadLimit
                                }
                              </p>
                            </div>

                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-[10px] font-bold text-stone-400">
                                Services
                              </p>

                              <p className="mt-1 font-black">
                                {
                                  plan.serviceLimit
                                }
                              </p>
                            </div>

                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-[10px] font-bold text-stone-400">
                                Service areas
                              </p>

                              <p className="mt-1 font-black">
                                {plan.serviceAreaLimit >
                                0
                                  ? plan.serviceAreaLimit
                                  : "Unlimited"}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-[10px] font-bold text-stone-400">
                                Analytics
                              </p>

                              <p className="mt-1 font-black">
                                {
                                  plan.analyticsLevel
                                }
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            {(
                              plan.features ??
                              []
                            )
                              .slice(
                                0,
                                6,
                              )
                              .map(
                                (
                                  feature,
                                  index,
                                ) => (
                                  <p
                                    key={`${feature}-${index}`}
                                    className="flex items-start gap-2 text-xs text-stone-600"
                                  >
                                    <CheckCircle2
                                      className="mt-0.5 shrink-0 text-emerald-600"
                                      size={
                                        14
                                      }
                                    />

                                    {
                                      feature
                                    }
                                  </p>
                                ),
                              )}
                          </div>

                          <Link
                            to="/subscriptions"
                            className={`mt-5 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${
                              isCurrent
                                ? "bg-stone-100 text-stone-500"
                                : "btn-saffron text-white"
                            }`}
                          >
                            {isCurrent
                              ? "Current plan"
                              : "View / Upgrade"}

                            <ChevronRight
                              size={
                                15
                              }
                            />
                          </Link>
                        </div>
                      );
                    },
                  )}
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-xs leading-5 text-amber-900">
                  <p className="font-black">
                    Payment safety
                  </p>

                  <p className="mt-1">
                    The dashboard only displays backend subscription state. Payment orders, verification, activation and commercial authority remain with the server payment/subscription workflow.
                  </p>
                </div>
              </section>
            )}

            {/* ---------------------------------------------------------------- */
            /* Verification                                                     */
            /* ---------------------------------------------------------------- */}

            {tab === "verification" && (
              <section className="space-y-5">
                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                        Trust & readiness
                      </p>

                      <h1 className="mt-1 text-2xl font-black">
                        Verification status
                      </h1>

                      <p className="mt-1 text-sm text-stone-500">
                        Admin owns approval and verification flags. You can monitor status, but not self-verify.
                      </p>
                    </div>

                    {profile?.verificationStatus && (
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-black ${statusClass(
                          profile.verificationStatus,
                        )}`}
                      >
                        {prettyStatus(
                          profile.verificationStatus,
                        )}
                      </span>
                    )}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      [
                        "Profile approval",
                        normalizeStatus(
                          profile?.profileStatus,
                        ) ===
                          "approved",
                        prettyStatus(
                          profile?.profileStatus,
                        ),
                      ],

                      [
                        "Identity",
                        Boolean(
                          profile?.identityVerified,
                        ),
                        profile?.identityVerified
                          ? "Verified"
                          : "Pending",
                      ],

                      [
                        "Profile review",
                        Boolean(
                          profile?.profileVerified,
                        ),
                        profile?.profileVerified
                          ? "Verified"
                          : "Pending",
                      ],

                      [
                        "Authorized contact",
                        Boolean(
                          profile?.authorizedContact,
                        ),
                        profile?.authorizedContact
                          ? "Verified"
                          : "Pending",
                      ],
                    ].map(
                      ([
                        label,
                        ok,
                        value,
                      ]) => (
                        <div
                          key={String(
                            label,
                          )}
                          className="rounded-2xl border border-orange-900/10 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-stone-700">
                              {
                                label
                              }
                            </span>

                            {Boolean(
                              ok,
                            ) ? (
                              <CheckCircle2
                                className="text-emerald-600"
                                size={
                                  16
                                }
                              />
                            ) : (
                              <Clock3
                                className="text-amber-600"
                                size={
                                  16
                                }
                              />
                            )}
                          </div>

                          <p className="mt-2 text-xs text-stone-500">
                            {
                              String(
                                value,
                              )
                            }
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                        Public listing checklist
                      </p>

                      <h2 className="mt-1 text-xl font-black">
                        Why your profile is or is not live
                      </h2>
                    </div>

                    <ShieldCheck
                      className="text-orange-700"
                      size={
                        20
                      }
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {readinessItems.map(
                      (
                        item,
                      ) => (
                        <div
                          key={
                            item.label
                          }
                          className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 px-4 py-3"
                        >
                          <div className="flex items-center gap-2">
                            {item.ok ? (
                              <CheckCircle2
                                className="text-emerald-600"
                                size={
                                  16
                                }
                              />
                            ) : (
                              <Clock3
                                className="text-amber-600"
                                size={
                                  16
                                }
                              />
                            )}

                            <span className="text-sm font-bold text-stone-700">
                              {
                                item.label
                              }
                            </span>
                          </div>

                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                              item.ok
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {item.ok
                              ? "Ready"
                              : "Pending"}
                          </span>
                        </div>
                      ),
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 p-4">
                    <p className="text-sm font-black text-orange-900">
                      Effective public listing:{" "}
                      {profile?.effectivePublicListing
                        ? "LIVE"
                        : "NOT LIVE"}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-stone-600">
                      Backend rules remain authoritative; UI indicators are informational only.
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                        Documents
                      </p>

                      <h2 className="mt-1 text-xl font-black">
                        Verification documents
                      </h2>
                    </div>

                    <FileCheck2
                      className="text-orange-700"
                      size={
                        20
                      }
                    />
                  </div>

                  {verificationDocuments.length ===
                  0 ? (
                    <div className="mt-4 rounded-2xl bg-stone-50 p-6 text-center">
                      <FileText
                        className="mx-auto text-stone-400"
                        size={
                          25
                        }
                      />

                      <p className="mt-2 text-sm font-bold text-stone-700">
                        No verification documents on file
                      </p>

                      <p className="mt-1 text-xs text-stone-500">
                        Documents can be submitted through the supported verification flow when requested.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {verificationDocuments.map(
                        (
                          document,
                        ) => (
                          <div
                            key={
                              document.id
                            }
                            className="rounded-2xl border border-orange-900/10 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-bold text-stone-800">
                                  {document.documentName ||
                                    prettyStatus(
                                      document.documentType,
                                    )}
                                </p>

                                <p className="mt-1 text-xs text-stone-500">
                                  {prettyStatus(
                                    document.documentType,
                                  )}{" "}
                                  · Submitted{" "}
                                  {dateLabel(
                                    document.createdAt,
                                  )}
                                </p>
                              </div>

                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClass(
                                  document.status,
                                )}`}
                              >
                                {prettyStatus(
                                  document.status,
                                )}
                              </span>
                            </div>

                            {document.reviewerNote && (
                              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                                <strong>
                                  Reviewer note:
                                </strong>{" "}
                                {
                                  document.reviewerNote
                                }
                              </p>
                            )}

                            {document.documentUrl && (
                              <a
                                href={
                                  document.documentUrl
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-orange-800 underline"
                              >
                                Open document{" "}
                                <ChevronRight
                                  size={
                                    13
                                  }
                                />
                              </a>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex gap-3">
                    <Settings
                      className="mt-0.5 text-orange-700"
                      size={
                        19
                      }
                    />

                    <div>
                      <h2 className="font-black">
                        Listing control
                      </h2>

                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        You can request visibility through the listing control, but approval and eligibility checks remain protected on the server.
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          void toggleListing()
                        }
                        disabled={
                          loading.changingListing
                        }
                        className="btn-saffron mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading.changingListing && (
                          <RefreshCw
                            size={
                              15
                            }
                            className="animate-spin"
                          />
                        )}

                        {loading.changingListing
                          ? "Updating…"
                          : profile?.listingActive
                            ? "Deactivate Listing"
                            : "Activate Listing"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ---------------------------------------------------------------- */
            /* Analytics                                                        */
            /* ---------------------------------------------------------------- */}

            {tab === "analytics" && (
              <section className="space-y-5">
                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                        Performance
                      </p>

                      <h1 className="mt-1 text-2xl font-black">
                        Profile analytics
                      </h1>

                      <p className="mt-1 text-sm text-stone-500">
                        Analytics are subscription-gated and calculated by the backend for your Pandit entity.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void loadAnalytics()
                      }
                      disabled={
                        loading.analytics
                      }
                      className="inline-flex items-center rounded-xl border border-orange-900/10 px-4 py-2.5 text-xs font-black text-orange-900 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw
                        size={
                          14
                        }
                        className={
                          loading.analytics
                            ? "mr-1.5 animate-spin"
                            : "mr-1.5"
                        }
                      />
                      {loading.analytics
                        ? "Refreshing…"
                        : "Refresh"}
                    </button>
                  </div>
                </div>

                {!subscription?.analyticsAccess ? (
                  <div className="rounded-3xl border border-orange-200 bg-orange-50 p-8 text-center">
                    <BarChart3
                      className="mx-auto text-orange-700"
                      size={
                        31
                      }
                    />

                    <h2 className="mt-3 text-xl font-black">
                      Analytics are not included in the current plan
                    </h2>

                    <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-stone-600">
                      Choose an eligible plan to unlock the backend analytics endpoint.
                    </p>

                    <Link
                      to="/subscriptions"
                      className="btn-saffron mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"
                    >
                      <Crown
                        size={
                          16
                        }
                      />
                      Compare plans
                    </Link>
                  </div>
                ) : loading.analytics ? (
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-10 text-center">
                    <RefreshCw
                      className="mx-auto animate-spin text-orange-700"
                      size={
                        28
                      }
                    />

                    <p className="mt-3 text-sm font-bold">
                      Loading analytics…
                    </p>
                  </div>
                ) : analyticsError ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
                    <div className="flex gap-3">
                      <AlertCircle
                        className="mt-0.5 text-amber-700"
                        size={
                          19
                        }
                      />

                      <div>
                        <p className="font-black text-amber-900">
                          Unable to load analytics
                        </p>

                        <p className="mt-1 text-sm leading-6 text-amber-900/80">
                          {
                            analyticsError
                          }
                        </p>

                        <p className="mt-2 text-xs text-amber-900/70">
                          The backend analytics endpoint is subscription-gated. Please refresh or verify your current plan entitlement.
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            void loadAnalytics()
                          }
                          className="mt-4 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-orange-900 ring-1 ring-amber-200"
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  </div>
                ) : analytics ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {([
                        {
                          label:
                            "Page views",

                          value:
                            safeNumber(
                              analytics
                                .summary
                                ?.pageViews,
                            ),

                          sub: `Last ${analyticsDays} days`,

                          Icon: Eye,
                        },

                        {
                          label:
                            "Unique visitors",

                          value:
                            safeNumber(
                              analytics
                                .summary
                                ?.uniqueVisitors,
                            ),

                          sub: `Last ${analyticsDays} days`,

                          Icon: User,
                        },

                        {
                          label:
                            "Engagement events",

                          value:
                            safeNumber(
                              analytics
                                .summary
                                ?.events,
                            ),

                          sub: `Last ${analyticsDays} days`,

                          Icon: TrendingUp,
                        },

                        {
                          label:
                            "Analytics level",

                          value:
                            analytics
                              .access
                              ?.level ||
                            subscription.analyticsLevel,

                          sub:
                            "Current plan",

                          Icon: Crown,
                        },
                      ] as Array<{
                        label: string;
                        value:
                          | string
                          | number;
                        sub: string;
                        Icon: LucideIcon;
                      }>).map(
                        (
                          card,
                        ) => {
                          const Icon =
                            card.Icon;

                          return (
                            <div
                              key={
                                card.label
                              }
                              className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                                  {
                                    card.label
                                  }
                                </p>

                                <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-700">
                                  <Icon
                                    size={
                                      17
                                    }
                                  />
                                </span>
                              </div>

                              <p className="mt-4 text-3xl font-black">
                                {
                                  card.value
                                }
                              </p>

                              <p className="mt-1 text-xs text-stone-500">
                                {
                                  card.sub
                                }
                              </p>
                            </div>
                          );
                        },
                      )}
                    </div>

                    <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                        Conversions
                      </p>

                      <div className="mt-4 space-y-2">
                        {(
                          analytics.conversions ??
                          []
                        ).length === 0 ? (
                          <p className="text-sm text-stone-500">
                            No tracked conversions in this period yet.
                          </p>
                        ) : (
                          (
                            analytics.conversions ??
                            []
                          ).map(
                            (
                              item,
                              index,
                            ) => (
                              <div
                                key={`${item.conversion_type ?? "conversion"}-${index}`}
                                className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3"
                              >
                                <span className="text-sm font-bold">
                                  {prettyStatus(
                                    item.conversion_type,
                                  )}
                                </span>

                                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-800">
                                  {safeNumber(
                                    item.count,
                                  )}
                                </span>
                              </div>
                            ),
                          )
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-8 text-center">
                    <BarChart3
                      className="mx-auto text-stone-400"
                      size={
                        28
                      }
                    />

                    <p className="mt-3 text-sm font-bold text-stone-700">
                      Analytics data is not available yet.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* ---------------------------------------------------------------- */
            /* Notifications                                                    */
            /* ---------------------------------------------------------------- */}

            {tab === "notifications" && (
              <section className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                    Account communications
                  </p>

                  <h1 className="mt-1 text-2xl font-black">
                    Notifications
                  </h1>

                  <p className="mt-1 text-sm text-stone-500">
                    Important account, verification, booking and subscription updates.
                  </p>
                </div>

                {(
                  Array.isArray(
                    notifications,
                  )
                    ? notifications
                    : []
                ).length ===
                0 ? (
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-10 text-center shadow-sm">
                    <Mail
                      className="mx-auto text-orange-600"
                      size={
                        28
                      }
                    />

                    <h2 className="mt-3 text-lg font-black">
                      You are all caught up
                    </h2>

                    <p className="mt-1 text-sm text-stone-500">
                      New DivyaDhara notifications will appear here.
                    </p>
                  </div>
                ) : (
                  (
                    Array.isArray(
                      notifications,
                    )
                      ? notifications
                      : []
                  ).map(
                    (
                      notification,
                      index,
                    ) => {
                      const rawId =
                        getNotificationValue(
                          notification,
                          [
                            "id",
                            "notificationId",
                          ],
                        );

                      const key =
                        rawId !==
                          undefined &&
                        rawId !== null
                          ? String(
                              rawId,
                            )
                          : `notification-${index}`;

                      const textValue =
                        notificationText(
                          notification,
                        );

                      const dateValue =
                        notificationDate(
                          notification,
                        );

                      return (
                        <div
                          key={
                            key
                          }
                          className="rounded-2xl border border-orange-900/10 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                              <Mail
                                size={
                                  16
                                }
                              />
                            </span>

                            <div className="min-w-0">
                              <p className="text-sm font-black text-stone-800">
                                DivyaDhara update
                              </p>

                              <p className="mt-1 text-sm leading-6 text-stone-600">
                                {
                                  textValue
                                }
                              </p>

                              {dateValue && (
                                <p className="mt-1 text-[11px] text-stone-400">
                                  {
                                    dateValue
                                  }
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )
                )}
              </section>
            )}
          </div>
        </main>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Service modal                                                        */}
      {/* -------------------------------------------------------------------- */}

      {serviceModalOpen &&
        profile && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pandit-service-modal-title"
            onMouseDown={(
              event,
            ) => {
              if (
                event.target ===
                  event.currentTarget &&
                !loading.savingService
              ) {
                closeServiceModal();
              }
            }}
          >
            <div
              className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-[#fffaf5] shadow-2xl"
              onMouseDown={(
                event,
              ) =>
                event.stopPropagation()
              }
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-900/10 bg-[#fffaf5] px-5 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                    Service CRUD
                  </p>

                  <h2
                    id="pandit-service-modal-title"
                    className="mt-1 text-xl font-black"
                  >
                    {editingServiceId !==
                    null
                      ? "Edit Puja service"
                      : "Create Puja service"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={
                    closeServiceModal
                  }
                  disabled={
                    loading.savingService
                  }
                  className="rounded-xl p-2 text-stone-500 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Close"
                >
                  <X
                    size={
                      18
                    }
                  />
                </button>
              </div>

              <div className="space-y-5 p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-stone-600">
                    Service/Puja name
                  </label>

                  <input
                    className={
                      formInput
                    }
                    autoFocus
                    maxLength={
                      180
                    }
                    disabled={
                      loading.savingService
                    }
                    value={
                      serviceForm.name
                    }
                    onChange={(
                      event,
                    ) =>
                      setServiceForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          name: event
                            .target
                            .value,
                        }),
                      )
                    }
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-stone-600">
                    Description
                  </label>

                  <textarea
                    rows={4}
                    maxLength={
                      2000
                    }
                    disabled={
                      loading.savingService
                    }
                    className={
                      formInput
                    }
                    value={
                      serviceForm.description ??
                      ""
                    }
                    onChange={(
                      event,
                    ) =>
                      setServiceForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          description:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                  />

                  <p className="mt-1 text-right text-[11px] text-stone-400">
                    {
                      (
                        serviceForm.description ??
                        ""
                      ).length
                    }
                    /2000
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-stone-600">
                      Price (INR)
                    </label>

                    <input
                      type="number"
                      min={
                        0
                      }
                      step="1"
                      disabled={
                        loading.savingService
                      }
                      className={
                        formInput
                      }
                      value={
                        serviceForm.priceAmount ??
                        ""
                      }
                      onChange={(
                        event,
                      ) => {
                        const raw =
                          event.target
                            .value;

                        setServiceForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            priceAmount:
                              raw ===
                              ""
                                ? null
                                : Math.max(
                                    0,
                                    Number(
                                      raw,
                                    ) ||
                                      0,
                                  ),
                          }),
                        );
                      }}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-stone-600">
                      Currency
                    </label>

                    <input
                      maxLength={
                        3
                      }
                      disabled={
                        loading.savingService
                      }
                      className={
                        formInput
                      }
                      value={
                        serviceForm.currency ??
                        "INR"
                      }
                      onChange={(
                        event,
                      ) =>
                        setServiceForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            currency:
                              event
                                .target
                                .value
                                .replace(
                                  /[^a-zA-Z]/g,
                                  "",
                                )
                                .slice(
                                  0,
                                  3,
                                )
                                .toUpperCase(),
                          }),
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-stone-600">
                      Duration (minutes)
                    </label>

                    <input
                      type="number"
                      min={
                        1
                      }
                      max={
                        1440
                      }
                      step={
                        1
                      }
                      disabled={
                        loading.savingService
                      }
                      className={
                        formInput
                      }
                      value={
                        serviceForm.durationMinutes ??
                        ""
                      }
                      onChange={(
                        event,
                      ) => {
                        const raw =
                          event.target
                            .value;

                        setServiceForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            durationMinutes:
                              raw ===
                              ""
                                ? null
                                : Math.max(
                                    1,
                                    Math.min(
                                      1440,
                                      Number(
                                        raw,
                                      ) ||
                                        1,
                                    ),
                                  ),
                          }),
                        );
                      }}
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-orange-50 px-4 py-3">
                  <span>
                    <span className="block text-sm font-bold">
                      Active service
                    </span>

                    <span className="block text-xs text-stone-500">
                      The backend may reject activation when plan limits or subscription eligibility are not satisfied.
                    </span>
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      serviceForm.isActive !==
                      false
                    }
                    disabled={
                      loading.savingService
                    }
                    onChange={(
                      event,
                    ) =>
                      setServiceForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          isActive:
                            event
                              .target
                              .checked,
                        }),
                      )
                    }
                    className="h-5 w-5 accent-orange-700"
                  />
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={
                      closeServiceModal
                    }
                    disabled={
                      loading.savingService
                    }
                    className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={
                      loading.savingService
                    }
                    onClick={() =>
                      void saveService()
                    }
                    className="btn-saffron flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading.savingService ? (
                      <RefreshCw
                        size={
                          16
                        }
                        className="animate-spin"
                      />
                    ) : (
                      <Save
                        size={
                          16
                        }
                      />
                    )}

                    {loading.savingService
                      ? "Saving…"
                      : editingServiceId !==
                          null
                        ? "Update Service"
                        : "Create Service"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}