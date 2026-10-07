/* eslint-disable @typescript-eslint/no-unused-vars */
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
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import SubscriptionAudienceTabs from "../components/SubscriptionAudienceTabs.tsx";

import SubscriptionPlanGrid from "../components/SubscriptionPlanGrid.tsx";

import {
  fetchSubscriptionPlans,
  formatSubscriptionPrice,
  getFallbackPlans,
  type SubscriptionAudience,
  type SubscriptionPlan,
} from "../data/subscriptions.ts";

import {
  useSEO,
} from "../lib/seo";

import {
  useApp,
} from "../context/AppContext";

/* ============================================================================
 * Types
 * ========================================================================== */

type SubscriptionsPageProps = {
  initialAudience?: SubscriptionAudience;
  showAudienceTabs?: boolean;
  onSelectPlan?: (
    plan: SubscriptionPlan,
  ) => void;
};

type CatalogueSource =
  | "backend"
  | "fallback";

type PlanSelectionMode =
  | "purchase"
  | "reference";

/*
 * Current application roles which can own paid subscriptions.
 *
 * Business rule:
 * - Pandit owns Pandit plans.
 * - Temple Manager operates Temple subscriptions.
 * - Ashram Manager operates Ashram subscriptions.
 *
 * Sales and Super Admin are operational roles and are NOT subscription
 * owners for this public purchase flow.
 */
type SubscriptionOwnerRole =
  | "pandit"
  | "temple_manager"
  | "ashram_manager";

/* ============================================================================
 * Constants
 * ========================================================================== */

const DEFAULT_AUDIENCE: SubscriptionAudience =
  "pandit";

const CANONICAL_AUDIENCES: ReadonlySet<SubscriptionAudience> =
  new Set([
    "pandit",
    "temple",
    "ashram",
  ]);

const PENDING_SELECTION_STORAGE_KEY =
  "divyadhara_pending_subscription_selection";

const PENDING_SELECTION_MAX_AGE_MS =
  30 * 60 * 1000;

/* ============================================================================
 * Helpers
 * ========================================================================== */

function isCanonicalAudience(
  value: string,
): value is SubscriptionAudience {
  return CANONICAL_AUDIENCES.has(
    value as SubscriptionAudience,
  );
}

function audienceLabelFor(
  audience: SubscriptionAudience,
): string {
  switch (audience) {
    case "pandit":
      return "Pandit";

    case "temple":
      return "Temple";

    case "ashram":
      return "Ashram";

    default:
      return "Professional";
  }
}

function billingLabel(
  plan: SubscriptionPlan,
): string {
  const interval =
    String(
      plan.billingInterval ??
        "monthly",
    )
      .trim()
      .toLowerCase();

  switch (interval) {
    case "yearly":
    case "annual":
      return "Yearly";

    case "quarterly":
      return "Quarterly";

    case "weekly":
      return "Weekly";

    case "daily":
      return "Daily";

    default:
      return "Monthly";
  }
}

function safePositiveNumber(
  value: unknown,
): number {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric,
  ) && numeric >= 0
    ? numeric
    : 0;
}

function isCheckoutEligiblePlan(
  plan: SubscriptionPlan,
  expectedAudience: SubscriptionAudience,
): boolean {
  const audienceMatches =
    plan.audience ===
      expectedAudience &&
    plan.ownerType ===
      expectedAudience;

  const validId =
    Number.isSafeInteger(
      plan.id,
    ) &&
    plan.id > 0;

  const validCode =
    typeof plan.code ===
      "string" &&
    plan.code.trim()
      .length > 0;

  const validCurrency =
    typeof plan.currency ===
      "string" &&
    /^[A-Z]{3}$/.test(
      plan.currency
        .trim()
        .toUpperCase(),
    );

  const validPrice =
    Number.isFinite(
      plan.priceAmount,
    ) &&
    plan.priceAmount >=
      0;

  const validDuration =
    Number.isSafeInteger(
      plan.durationDays,
    ) &&
    plan.durationDays > 0;

  return (
    plan.isActive ===
      true &&
    audienceMatches &&
    validId &&
    validCode &&
    validCurrency &&
    validPrice &&
    validDuration
  );
}

function planFeatures(
  plan: SubscriptionPlan,
): string[] {
  if (
    !Array.isArray(
      plan.features,
    )
  ) {
    return [];
  }

  return plan.features
    .filter(
      (
        feature,
      ) =>
        typeof feature ===
        "string",
    )
    .map(
      (
        feature,
      ) =>
        feature.trim(),
    )
    .filter(Boolean);
}

/*
|--------------------------------------------------------------------------
| Subscription owner role helpers
|--------------------------------------------------------------------------
*/

function isSubscriptionOwnerRole(
  value: unknown,
): value is SubscriptionOwnerRole {
  const role =
    String(
      value ?? "",
    )
      .trim()
      .toLowerCase();

  return (
    role === "pandit" ||
    role === "temple_manager" ||
    role ===
      "ashram_manager"
  );
}

function expectedRoleForAudience(
  audience: SubscriptionAudience,
): SubscriptionOwnerRole {
  switch (audience) {
    case "pandit":
      return "pandit";

    case "temple":
      return "temple_manager";

    case "ashram":
      return "ashram_manager";
  }
}

function canRolePurchaseAudience(
  role: unknown,
  audience: SubscriptionAudience,
): boolean {
  if (
    !isSubscriptionOwnerRole(
      role,
    )
  ) {
    return false;
  }

  return (
    role ===
    expectedRoleForAudience(
      audience,
    )
  );
}

function dashboardPathForRole(
  role: unknown,
): string | null {
  switch (
    String(
      role ?? "",
    )
      .trim()
      .toLowerCase()
  ) {
    case "pandit":
      return "/pandit/dashboard";

    case "temple_manager":
      return "/temple/dashboard";

    case "ashram_manager":
      return "/ashram/dashboard";

    default:
      return null;
  }
}

/*
|--------------------------------------------------------------------------
| Pending selection helpers
|--------------------------------------------------------------------------
|
| This stores only non-sensitive catalogue information.
|
| Payment authority remains backend-side.
|--------------------------------------------------------------------------
*/

type PendingSubscriptionSelection = {
  planId: number;
  planCode: string;
  audience: SubscriptionAudience;
  createdAt: number;
};

function savePendingSelection(
  plan: SubscriptionPlan,
): void {
  try {
    if (
      typeof globalThis.sessionStorage ===
      "undefined"
    ) {
      return;
    }

    const payload:
      PendingSubscriptionSelection =
      {
        planId: plan.id,
        planCode: plan.code,
        audience:
          plan.audience,
        createdAt:
          Date.now(),
      };

    globalThis.sessionStorage.setItem(
      PENDING_SELECTION_STORAGE_KEY,
      JSON.stringify(
        payload,
      ),
    );
  } catch {
    /*
     * Storage failure must never block plan selection.
     */
  }
}

function clearPendingSelection(): void {
  try {
    if (
      typeof globalThis.sessionStorage ===
      "undefined"
    ) {
      return;
    }

    globalThis.sessionStorage.removeItem(
      PENDING_SELECTION_STORAGE_KEY,
    );
  } catch {
    // Best effort only.
  }
}

/* ============================================================================
 * Component
 * ========================================================================== */

export default function Subscriptions({
  initialAudience = DEFAULT_AUDIENCE,
  showAudienceTabs = true,
  onSelectPlan,
}: SubscriptionsPageProps) {
  const navigate =
    useNavigate();

  const [
    searchParams,
  ] = useSearchParams();

  const {
    user,
  } = useApp();

  /*
   * URL audience support:
   *
   * /subscriptions?audience=pandit
   * /subscriptions?audience=temple
   * /subscriptions?audience=ashram
   *
   * Invalid URL audience falls back to prop/default.
   */
  const queryAudience =
    String(
      searchParams.get(
        "audience",
      ) ?? "",
    )
      .trim()
      .toLowerCase();

  const safeInitialAudience =
    isCanonicalAudience(
      queryAudience,
    )
      ? (queryAudience as SubscriptionAudience)
      : isCanonicalAudience(
          String(
            initialAudience,
          ),
        )
        ? initialAudience
        : DEFAULT_AUDIENCE;

  const [
    audience,
    setAudience,
  ] = useState<SubscriptionAudience>(
    safeInitialAudience,
  );

  const [
    plans,
    setPlans,
  ] = useState<
    SubscriptionPlan[]
  >(() =>
    getFallbackPlans(
      safeInitialAudience,
    ),
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    source,
    setSource,
  ] = useState<CatalogueSource>(
    "fallback",
  );

  const [
    selectedPlan,
    setSelectedPlan,
  ] = useState<
    SubscriptionPlan | null
  >(null);

  const [
    selectionMode,
    setSelectionMode,
  ] = useState<PlanSelectionMode>(
    "reference",
  );

  const [
    retryCount,
    setRetryCount,
  ] = useState(0);

  const [
    actionNotice,
    setActionNotice,
  ] = useState<
    string | null
  >(null);

  const mountedRef =
    useRef(true);

  const requestIdRef =
    useRef(0);

  /* ------------------------------------------------------------------------ */
  /* Sync URL audience                                                       */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const urlAudience =
      String(
        searchParams.get(
          "audience",
        ) ?? "",
      )
        .trim()
        .toLowerCase();

    if (
      isCanonicalAudience(
        urlAudience,
      ) &&
      urlAudience !==
        audience
    ) {
      setAudience(
        urlAudience,
      );
    }
  }, [
    audience,
    searchParams,
  ]);

  /* ------------------------------------------------------------------------ */
  /* SEO                                                                     */
  /* ------------------------------------------------------------------------ */

  useSEO({
    title:
      "DivyaDhara Subscriptions — Pandit, Temple & Ashram Plans",

    description:
      "Choose a DivyaDhara subscription plan for Pandit, Temple or Ashram profiles. Pricing, limits, duration and entitlements are controlled by the live backend catalogue.",

    path:
      "/subscriptions",
  });

  /* ------------------------------------------------------------------------ */
  /* Mount lifecycle                                                         */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Live catalogue                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let active =
      true;

    const requestId =
      requestIdRef.current +
      1;

    requestIdRef.current =
      requestId;

    const controller =
      new AbortController();

    setLoading(true);
    setError(null);
    setActionNotice(null);
    setSelectedPlan(null);
    setSelectionMode(
      "reference",
    );
    setSource(
      "fallback",
    );

    void (async () => {
      try {
        const remotePlans =
          await fetchSubscriptionPlans(
            audience,
            controller.signal,
          );

        if (
          !active ||
          !mountedRef.current ||
          controller.signal.aborted ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        const eligiblePlans =
          Array.isArray(
            remotePlans,
          )
            ? remotePlans.filter(
                (
                  plan,
                ) =>
                  isCheckoutEligiblePlan(
                    plan,
                    audience,
                  ),
              )
            : [];

        if (
          eligiblePlans.length ===
          0
        ) {
          setPlans(
            getFallbackPlans(
              audience,
            ),
          );

          setSource(
            "fallback",
          );

          setError(
            `No active ${audienceLabelFor(
              audience,
            )} plans are currently available from the live backend catalogue.`,
          );

          setLoading(
            false,
          );

          return;
        }

        setPlans(
          eligiblePlans,
        );

        setSource(
          "backend",
        );

        setError(
          null,
        );

        setLoading(
          false,
        );
      } catch (
        requestError
      ) {
        if (
          !active ||
          !mountedRef.current ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        /*
         * Cancellation from audience change/unmount is not an error
         * that should be shown to the user.
         */
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setPlans(
          getFallbackPlans(
            audience,
          ),
        );

        setSource(
          "fallback",
        );

        setError(
          requestError instanceof
            Error
            ? requestError.message
            : "Unable to load the live subscription catalogue.",
        );

        setLoading(
          false,
        );
      }
    })();

    return () => {
      active =
        false;

      controller.abort();
    };
  }, [
    audience,
    retryCount,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Derived state                                                           */
  /* ------------------------------------------------------------------------ */

  const audienceLabel =
    useMemo(
      () =>
        audienceLabelFor(
          audience,
        ),
      [audience],
    );

  /*
   * "Checkout enabled" means:
   *
   * 1. live backend catalogue is loaded;
   * 2. request is no longer loading.
   *
   * It does NOT mean user is authorised.
   * User/role authorisation is handled separately.
   */
  const checkoutEnabled =
    source ===
      "backend" &&
    !loading;

  const backendPlans =
    useMemo(
      () =>
        plans.filter(
          (
            plan,
          ) =>
            isCheckoutEligiblePlan(
              plan,
              audience,
            ),
        ),
      [
        audience,
        plans,
      ],
    );

  const hasBackendPlans =
    backendPlans.length >
    0;

  const monthlyEquivalentNote =
    useMemo(() => {
      if (
        plans.length ===
        0
      ) {
        return null;
      }

      const lowest =
        plans.reduce<
          SubscriptionPlan | null
        >(
          (
            current,
            plan,
          ) => {
            if (
              current ===
              null
            ) {
              return plan;
            }

            return safePositiveNumber(
              plan.priceAmount,
            ) <
              safePositiveNumber(
                current.priceAmount,
              )
              ? plan
              : current;
          },
          null,
        );

      if (
        !lowest
      ) {
        return null;
      }

      return `${audienceLabel} plans are available in the current catalogue.`;
    }, [
      audienceLabel,
      plans,
    ]);

  const currentUserRole =
    String(
      user?.role ?? "",
    )
      .trim()
      .toLowerCase();

  const currentAudienceRole =
    expectedRoleForAudience(
      audience,
    );

  const currentUserCanPurchaseAudience =
    Boolean(
      user &&
        canRolePurchaseAudience(
          currentUserRole,
          audience,
        ),
    );

  /* ------------------------------------------------------------------------ */
  /* Audience change                                                         */
  /* ------------------------------------------------------------------------ */

  const handleAudienceChange =
    useCallback(
      (
        nextAudience: SubscriptionAudience,
      ) => {
        if (
          loading ||
          !isCanonicalAudience(
            String(
              nextAudience,
            ),
          )
        ) {
          return;
        }

        setActionNotice(
          null,
        );

        setAudience(
          nextAudience,
        );

        /*
         * Keep browser URL in sync so dashboard links such as
         * /subscriptions?audience=temple remain shareable.
         */
        navigate(
          `/subscriptions?audience=${encodeURIComponent(
            nextAudience,
          )}`,
          {
            replace: true,
          },
        );
      },
      [
        loading,
        navigate,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Plan selection                                                          */
  /* ------------------------------------------------------------------------ */

  const handleSelect =
    useCallback(
      (
        plan: SubscriptionPlan,
      ) => {
        setActionNotice(
          null,
        );

        /*
         * A fallback catalogue is display-only.
         * Never open a payment/checkout action from fallback data.
         */
        if (
          !checkoutEnabled
        ) {
          setError(
            "Live subscription pricing is currently unavailable. Reference plans are shown for information only and cannot be used for checkout.",
          );

          return;
        }

        /*
         * Re-check every commercial field before any selection
         * reaches a potential payment callback.
         */
        if (
          !isCheckoutEligiblePlan(
            plan,
            audience,
          )
        ) {
          setError(
            "This plan is not eligible for checkout. Please refresh the live subscription catalogue.",
          );

          return;
        }

        /*
         * URL audience / selected plan must remain consistent.
         */
        if (
          plan.audience !==
          audience
        ) {
          setError(
            "The selected plan does not belong to the current audience.",
          );

          return;
        }

        setSelectedPlan(
          plan,
        );

        setSelectionMode(
          "purchase",
        );

        /*
         * Visitor:
         * selection is allowed, but account authentication is required
         * before activation.
         */
        if (!user) {
          savePendingSelection(
            plan,
          );

          return;
        }

        /*
         * Authenticated non-owner roles should not purchase
         * an owner subscription.
         */
        if (
          !canRolePurchaseAudience(
            currentUserRole,
            plan.audience,
          )
        ) {
          setActionNotice(
            `This ${audienceLabelFor(
              plan.audience,
            )} plan can be activated only by an authorised ${currentAudienceRole} account.`,
          );

          return;
        }

        /*
         * Parent integration owns the real payment/checkout workflow.
         *
         * Backend should re-resolve:
         * - plan ID
         * - price variant
         * - current price
         * - duration
         * - active state
         *
         * before creating payment intent/order.
         */
        if (
          onSelectPlan
        ) {
          clearPendingSelection();

          onSelectPlan(
            plan,
          );

          return;
        }

        /*
         * No parent payment handler means this page cannot invent
         * a payment authority.
         *
         * Instead, keep selection in modal and let user move to
         * the relevant owner dashboard.
         */
      },
      [
        audience,
        checkoutEnabled,
        currentAudienceRole,
        currentUserRole,
        onSelectPlan,
        user,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Close modal                                                             */
  /* ------------------------------------------------------------------------ */

  const closeSelectionModal =
    useCallback(() => {
      setSelectedPlan(
        null,
      );

      setActionNotice(
        null,
      );
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Escape key                                                              */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      !selectedPlan
    ) {
      return;
    }

    const onKeyDown =
      (
        event: KeyboardEvent,
      ) => {
        if (
          event.key ===
          "Escape"
        ) {
          closeSelectionModal();
        }
      };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [
    closeSelectionModal,
    selectedPlan,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Retry                                                                    */
  /* ------------------------------------------------------------------------ */

  const retryCatalogue =
    useCallback(() => {
      setActionNotice(
        null,
      );

      setRetryCount(
        (
          current,
        ) =>
          current + 1,
      );
    }, []);

  /* ------------------------------------------------------------------------ */
  /* Continue authenticated flow                                             */
  /* ------------------------------------------------------------------------ */

  const handleAuthenticatedContinue =
    useCallback(() => {
      if (
        !selectedPlan
      ) {
        return;
      }

      /*
       * Visitor is handled separately.
       */
      if (!user) {
        savePendingSelection(
          selectedPlan,
        );

        closeSelectionModal();

        navigate(
          `/login?returnTo=${encodeURIComponent(
            `/subscriptions?audience=${selectedPlan.audience}`,
          )}`,
        );

        return;
      }

      /*
       * Authorisation guard.
       */
      if (
        !canRolePurchaseAudience(
          user.role,
          selectedPlan.audience,
        )
      ) {
        return;
      }

      /*
       * Parent callback is the real production checkout hand-off.
       */
      if (
        onSelectPlan
      ) {
        clearPendingSelection();

        onSelectPlan(
          selectedPlan,
        );

        closeSelectionModal();

        return;
      }

      /*
       * No direct checkout implementation should be fabricated here.
       *
       * Open owner dashboard with non-authoritative selection context.
       * Dashboard/payment workflow must re-resolve plan server-side.
       */
      const dashboardPath =
        dashboardPathForRole(
          user.role,
        );

      if (
        dashboardPath
      ) {
        clearPendingSelection();

        const query =
          new URLSearchParams();

        query.set(
          "tab",
          "subscription",
        );

        query.set(
          "planId",
          String(
            selectedPlan.id,
          ),
        );

        query.set(
          "planCode",
          selectedPlan.code,
        );

        navigate(
          `${dashboardPath}?${query.toString()}`,
        );

        closeSelectionModal();

        return;
      }

      setActionNotice(
        "Your account role is not configured for subscription activation.",
      );
    }, [
      closeSelectionModal,
      navigate,
      onSelectPlan,
      selectedPlan,
      user,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Visitor login                                                           */
  /* ------------------------------------------------------------------------ */

  const handleVisitorLogin =
    useCallback(() => {
      if (
        !selectedPlan
      ) {
        navigate(
          `/login?returnTo=${encodeURIComponent(
            `/subscriptions?audience=${audience}`,
          )}`,
        );

        return;
      }

      savePendingSelection(
        selectedPlan,
      );

      const returnTo =
        `/subscriptions?audience=${selectedPlan.audience}`;

      closeSelectionModal();

      navigate(
        `/login?returnTo=${encodeURIComponent(
          returnTo,
        )}`,
      );
    }, [
      audience,
      closeSelectionModal,
      navigate,
      selectedPlan,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Register                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleRegister =
    useCallback(() => {
      if (
        selectedPlan
      ) {
        savePendingSelection(
          selectedPlan,
        );
      }

      const returnTo =
        selectedPlan
          ? `/subscriptions?audience=${selectedPlan.audience}`
          : `/subscriptions?audience=${audience}`;

      closeSelectionModal();

      navigate(
        `/register?returnTo=${encodeURIComponent(
          returnTo,
        )}`,
      );
    }, [
      audience,
      closeSelectionModal,
      navigate,
      selectedPlan,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50/70 via-white to-white">
      {/* ================================================================== */}
      {/* HERO                                                               */}
      {/* ================================================================== */}

      <section className="border-b border-orange-100">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-700 shadow-sm ring-1 ring-orange-100">
              <ShieldCheck className="h-4 w-4" />

              DivyaDhara Subscriptions
            </span>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Grow your spiritual presence on DivyaDhara
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
              Choose the subscription designed for your{" "}
              <span className="font-bold text-slate-900">
                {
                  audienceLabel.toLowerCase()
                }
              </span>{" "}
              profile. Live prices, duration, limits and
              entitlements are controlled by the backend
              catalogue.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Server-authoritative pricing
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure payment workflow
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 ring-1 ring-orange-100">
                <Clock3 className="h-3.5 w-3.5" />
                Plan limits enforced server-side
              </span>
            </div>
          </div>

          {showAudienceTabs ? (
            <div className="mt-9">
              <SubscriptionAudienceTabs
                value={
                  audience
                }
                onChange={
                  handleAudienceChange
                }
                disabled={
                  loading
                }
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* ================================================================== */}
      {/* CATALOGUE                                                          */}
      {/* ================================================================== */}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-8 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                <div>
                  <p className="font-black text-amber-950">
                    Live plan catalogue unavailable
                  </p>

                  <p className="mt-1 text-sm leading-6 text-amber-900/80">
                    {error}
                  </p>

                  <p className="mt-2 text-xs font-semibold leading-5 text-amber-900/70">
                    Reference plans are displayed only for
                    information. No fallback value can authorize
                    or create a payment.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={
                  retryCatalogue
                }
                disabled={
                  loading
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-orange-900 ring-1 ring-amber-200 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LoaderCircle
                  className={
                    loading
                      ? "h-4 w-4 animate-spin"
                      : "h-4 w-4"
                  }
                />

                {loading
                  ? "Refreshing…"
                  : "Retry catalogue"}
              </button>
            </div>
          </div>
        ) : null}

        {actionNotice ? (
          <div className="mb-8 rounded-3xl border border-orange-200 bg-orange-50 p-5">
            <div className="flex items-start gap-3">
              <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />

              <div>
                <p className="font-black text-orange-950">
                  Subscription selection
                </p>

                <p className="mt-1 text-sm leading-6 text-orange-900/80">
                  {
                    actionNotice
                  }
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-700">
                {
                  audienceLabel
                }{" "}
                plans
              </p>

              <span
                className={
                  source ===
                  "backend"
                    ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                    : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"
                }
              >
                {source ===
                "backend" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <CircleHelp className="h-3.5 w-3.5" />
                )}

                {source ===
                "backend"
                  ? "Live catalogue"
                  : "Reference only"}
              </span>
            </div>

            <h2 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">
              {source ===
              "backend"
                ? "Current subscription plans"
                : "Configured plan reference"}
            </h2>

            {monthlyEquivalentNote ? (
              <p className="mt-2 text-sm text-slate-500">
                {
                  monthlyEquivalentNote
                }
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800">
                Signed in as{" "}
                {
                  user.role
                }
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                Login required for activation
              </span>
            )}

            {loading ? (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading live catalogue
              </span>
            ) : null}
          </div>
        </div>

        {/* ================================================================== */}
        {/* ACCOUNT / AUDIENCE INFORMATION                                    */}
        {/* ================================================================== */}

        {user &&
        !canRolePurchaseAudience(
          user.role,
          audience,
        ) ? (
          <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />

              <div>
                <p className="text-sm font-black text-slate-900">
                  Account type and plan audience
                </p>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  This catalogue is for{" "}
                  <span className="font-bold">
                    {
                      audienceLabel
                    }
                  </span>
                  . An authenticated{" "}
                  <span className="font-bold">
                    {
                      currentAudienceRole
                    }
                  </span>{" "}
                  account is required to activate it.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* ================================================================== */}
        {/* PLAN GRID                                                          */}
        {/* ================================================================== */}

        <SubscriptionPlanGrid
          plans={
            plans
          }
          selectedPlanId={
            source ===
            "backend"
              ? selectedPlan?.id ??
                null
              : null
          }
          loading={
            loading
          }
          onSelect={
            handleSelect
          }
        />

        {source ===
          "backend" &&
        hasBackendPlans ? (
          <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />

              <div>
                <p className="text-sm font-black text-emerald-950">
                  Live checkout plans verified
                </p>

                <p className="mt-1 text-xs leading-5 text-emerald-900/75">
                  {backendPlans.length} active{" "}
                  {
                    audienceLabel.toLowerCase()
                  } plan
                  {backendPlans.length ===
                  1
                    ? ""
                    : "s"}{" "}
                  passed the client-side eligibility checks.
                  The backend still remains the final authority
                  before payment/order creation.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* ================================================================== */}
        {/* BUSINESS TRUST                                                    */}
        {/* ================================================================== */}

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <TrustItem
            title="Backend-authoritative pricing"
            text="Plan amount, currency, duration, limits and entitlements are read from the live DivyaDhara backend catalogue."
          />

          <TrustItem
            title="Verified payment ledger"
            text="The browser never decides the final payable amount. The payment backend resolves the current plan before checkout."
          />

          <TrustItem
            title="Subscription-aware capacity"
            text="Services, lead credits, listing access and other commercial capabilities are enforced using backend subscription state."
          />
        </div>

        {/* ================================================================== */}
        {/* PAYMENT SAFETY                                                    */}
        {/* ================================================================== */}

        <div className="mt-6 rounded-3xl border border-orange-100 bg-orange-50/70 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />

            <div>
              <p className="text-sm font-black text-slate-900">
                Payment safety
              </p>

              <p className="mt-1 text-sm leading-6 text-slate-700">
                Selecting a plan does not itself authorise a
                payment. Final pricing, payment order creation,
                verification and subscription activation remain
                backend-controlled.
              </p>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                Reference/fallback plans are never eligible for
                checkout.
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* NOT LOGGED IN                                                     */}
        {/* ================================================================== */}

        {!user ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">
                  Ready to activate your plan?
                </p>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  You can view the live plans publicly. Login or
                  create the correct DivyaDhara business account
                  before subscription activation.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    savePendingSelection(
                      selectedPlan ??
                        plans[0],
                    );

                    navigate(
                      `/login?returnTo=${encodeURIComponent(
                        `/subscriptions?audience=${audience}`,
                      )}`,
                    );
                  }}
                  className="btn-saffron inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"
                >
                  Login
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleRegister()
                  }
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50"
                >
                  Create account
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ==================================================================== */}
      {/* PLAN SELECTION MODAL                                                 */}
      {/* ==================================================================== */}

      {selectedPlan ? (
        <PlanSelectionModal
          plan={
            selectedPlan
          }
          mode={
            selectionMode
          }
          authenticated={
            Boolean(user)
          }
          userRole={
            user?.role
          }
          actionNotice={
            actionNotice
          }
          onClose={
            closeSelectionModal
          }
          onLogin={
            handleVisitorLogin
          }
          onRegister={
            handleRegister
          }
          onContinue={
            handleAuthenticatedContinue
          }
          canContinue={
            Boolean(
              checkoutEnabled &&
                user &&
                canRolePurchaseAudience(
                  user.role,
                  selectedPlan.audience,
                ),
            )
          }
          hasParentCheckout={
            Boolean(
              onSelectPlan,
            )
          }
        />
      ) : null}
    </main>
  );
}

/* ============================================================================
 * Trust item
 * ========================================================================== */

function TrustItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
        </span>

        <span className="text-sm font-black text-slate-900">
          {title}
        </span>
      </div>

      <p className="text-sm leading-6 text-slate-600">
        {text}
      </p>
    </div>
  );
}

/* ============================================================================
 * Selection Modal
 * ========================================================================== */

function PlanSelectionModal({
  plan,
  mode,
  authenticated,
  userRole,
  actionNotice,
  onClose,
  onLogin,
  onRegister,
  onContinue,
  canContinue,
  hasParentCheckout,
}: {
  plan: SubscriptionPlan;
  mode: PlanSelectionMode;
  authenticated: boolean;
  userRole?: string | null;
  actionNotice: string | null;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onContinue: () => void;
  canContinue: boolean;
  hasParentCheckout: boolean;
}) {
  const features =
    planFeatures(
      plan,
    ).slice(
      0,
      10,
    );

  const billingText =
    billingLabel(
      plan,
    );

  const currency =
    String(
      plan.currency ??
        "INR",
    )
      .trim()
      .toUpperCase();

  const price =
    formatSubscriptionPrice(
      plan.priceAmount,
      currency,
    );

  const expectedRole =
    expectedRoleForAudience(
      plan.audience,
    );

  const roleMatches =
    canRolePurchaseAudience(
      userRole,
      plan.audience,
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-plan-title"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl"
        onMouseDown={(
          event,
        ) =>
          event.stopPropagation()
        }
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                           */}
        {/* ---------------------------------------------------------------- */}

        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">
              {audienceLabelFor(
                plan.audience,
              )}{" "}
              subscription
            </p>

            <h2
              id="subscription-plan-title"
              className="mt-1 text-2xl font-black text-slate-950"
            >
              {
                plan.name
              }
            </h2>

            {plan.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {
                  plan.description
                }
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            aria-label="Close plan selection"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* -------------------------------------------------------------- */}
          {/* Price                                                           */}
          {/* -------------------------------------------------------------- */}

          <div className="rounded-3xl bg-gradient-to-br from-orange-50 to-amber-50 p-6 ring-1 ring-orange-100">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">
                  {
                    billingText
                  }
                </p>

                <p className="mt-1 text-4xl font-black text-slate-950">
                  {
                    price
                  }
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  {plan.durationDays}{" "}
                  day subscription
                </p>
              </div>

              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-orange-100">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Lead capacity
                </p>

                <p className="mt-1 text-xl font-black text-slate-900">
                  {
                    plan.leadLimit
                  }
                </p>

                <p className="text-xs text-slate-500">
                  included credits
                </p>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Features                                                        */}
          {/* -------------------------------------------------------------- */}

          {features.length >
          0 ? (
            <div>
              <p className="text-sm font-black uppercase tracking-[0.15em] text-slate-900">
                Included capabilities
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {features.map(
                  (
                    feature,
                  ) => (
                    <div
                      key={
                        feature
                      }
                      className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

                      <span className="text-sm text-slate-700">
                        {
                          feature
                        }
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Backend authority                                               */}
          {/* -------------------------------------------------------------- */}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />

              <div>
                <p className="text-sm font-bold text-slate-900">
                  Backend verification required
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-600">
                  The displayed price is catalogue information.
                  Before payment, the backend must validate the
                  plan, current price variant, duration and
                  subscription eligibility again.
                </p>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Visitor                                                         */}
          {/* -------------------------------------------------------------- */}

          {!authenticated ? (
            <>
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-start gap-3">
                  <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />

                  <div>
                    <p className="text-sm font-black text-orange-950">
                      Login required
                    </p>

                    <p className="mt-1 text-xs leading-5 text-orange-900/80">
                      You can view and select a plan publicly,
                      but subscription activation requires the
                      appropriate authenticated DivyaDhara business
                      account.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Wrong role                                                      */}
          {/* -------------------------------------------------------------- */}

          {authenticated &&
          !roleMatches ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                <div>
                  <p className="text-sm font-black text-amber-950">
                    Account type mismatch
                  </p>

                  <p className="mt-1 text-xs leading-5 text-amber-900/80">
                    This plan is for a{" "}
                    <strong>
                      {
                        audienceLabelFor(
                          plan.audience,
                        )
                      }
                    </strong>{" "}
                    subscription and requires an authorised{" "}
                    <strong>
                      {
                        expectedRole
                      }
                    </strong>{" "}
                    account.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Action notice                                                   */}
          {/* -------------------------------------------------------------- */}

          {actionNotice ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <p className="text-sm font-black text-orange-950">
                Subscription action
              </p>

              <p className="mt-1 text-xs leading-5 text-orange-900/80">
                {
                  actionNotice
                }
              </p>
            </div>
          ) : null}

          {/* -------------------------------------------------------------- */}
          {/* Actions                                                         */}
          {/* -------------------------------------------------------------- */}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={
                onClose
              }
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>

            {!authenticated ? (
              <>
                <button
                  type="button"
                  onClick={
                    onRegister
                  }
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50"
                >
                  Create account
                </button>

                <button
                  type="button"
                  onClick={
                    onLogin
                  }
                  className="btn-saffron inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"
                >
                  Login to continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : !roleMatches ? (
              <button
                type="button"
                onClick={
                  onClose
                }
                className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-900"
              >
                Use matching account
              </button>
            ) : mode ===
              "purchase" ? (
              <button
                type="button"
                onClick={
                  onContinue
                }
                disabled={
                  !canContinue
                }
                className="btn-saffron inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {hasParentCheckout
                  ? "Continue to checkout"
                  : "Open subscription dashboard"}

                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={
                  onClose
                }
                className="btn-saffron inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}