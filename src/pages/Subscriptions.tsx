/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";

import SubscriptionAudienceTabs from "../components/SubscriptionAudienceTabs.tsx";
import SubscriptionPlanGrid from "../components/SubscriptionPlanGrid.tsx";
import {
  fetchSubscriptionPlans,
  formatSubscriptionPrice,
  getFallbackPlans,
  type SubscriptionAudience,
  type SubscriptionPlan,
} from "../data/subscriptions.ts";

type SubscriptionsPageProps = {
  initialAudience?: SubscriptionAudience;
  showAudienceTabs?: boolean;
  onSelectPlan?: (plan: SubscriptionPlan) => void;
};

type CatalogueSource = "backend" | "fallback";

const DEFAULT_AUDIENCE: SubscriptionAudience = "pandit";

const CANONICAL_AUDIENCES: ReadonlySet<SubscriptionAudience> = new Set([
  "pandit",
  "temple",
  "ashram",
]);

function isCanonicalAudience(value: string): value is SubscriptionAudience {
  return CANONICAL_AUDIENCES.has(value as SubscriptionAudience);
}

function audienceLabelFor(audience: SubscriptionAudience): string {
  if (audience === "pandit") return "Pandit";
  if (audience === "temple") return "Temple";
  return "Ashram";
}

function billingLabel(plan: SubscriptionPlan): string {
  const interval = String(plan.billingInterval ?? "monthly").toLowerCase();

  switch (interval) {
    case "yearly":
    case "annual":
      return "Yearly";
    case "quarterly":
      return "Quarterly";
    default:
      return "Monthly";
  }
}

function isCheckoutEligiblePlan(
  plan: SubscriptionPlan,
  expectedAudience: SubscriptionAudience,
): boolean {
  return (
    plan.isActive === true &&
    plan.audience === expectedAudience &&
    plan.ownerType === expectedAudience &&
    Number.isSafeInteger(plan.id) &&
    plan.id > 0 &&
    Boolean(plan.code.trim()) &&
    Number.isFinite(plan.priceAmount) &&
    plan.priceAmount >= 0 &&
    /^[A-Z]{3}$/.test(plan.currency) &&
    Number.isInteger(plan.durationDays) &&
    plan.durationDays > 0
  );
}

export default function Subscriptions({
  initialAudience = DEFAULT_AUDIENCE,
  showAudienceTabs = true,
  onSelectPlan,
}: SubscriptionsPageProps) {
  const safeInitialAudience = isCanonicalAudience(initialAudience)
    ? initialAudience
    : DEFAULT_AUDIENCE;

  const [audience, setAudience] =
    useState<SubscriptionAudience>(safeInitialAudience);

  const [plans, setPlans] = useState<SubscriptionPlan[]>(() =>
    getFallbackPlans(safeInitialAudience),
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<CatalogueSource>("fallback");
  const [selectedPlan, setSelectedPlan] =
    useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    setLoading(true);
    setError(null);
    setSelectedPlan(null);
    setSource("fallback");

    fetchSubscriptionPlans(audience, controller.signal)
      .then((remotePlans) => {
        if (!mounted || controller.signal.aborted) return;

        const eligiblePlans = remotePlans.filter((plan) =>
          isCheckoutEligiblePlan(plan, audience),
        );

        if (eligiblePlans.length === 0) {
          setPlans(getFallbackPlans(audience));
          setSource("fallback");
          setError(
            `No active ${audienceLabelFor(audience)} plans are currently available from the backend catalogue.`,
          );
          return;
        }

        setPlans(eligiblePlans);
        setSource("backend");
      })
      .catch((requestError: unknown) => {
        if (!mounted || controller.signal.aborted) return;

        setPlans(getFallbackPlans(audience));
        setSource("fallback");

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load the live subscription catalogue.",
        );
      })
      .finally(() => {
        if (mounted && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [audience]);

  const audienceLabel = useMemo(
    () => audienceLabelFor(audience),
    [audience],
  );

  const checkoutEnabled = source === "backend" && !loading;

  function handleSelect(plan: SubscriptionPlan) {
    if (!checkoutEnabled) {
      return;
    }

    if (!isCheckoutEligiblePlan(plan, audience)) {
      setError(
        "This plan is not eligible for checkout. Please reload the live subscription catalogue.",
      );
      return;
    }

    setSelectedPlan(plan);
    onSelectPlan?.(plan);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50/70 via-white to-white">
      <section className="border-b border-orange-100">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-700 shadow-sm ring-1 ring-orange-100">
              <ShieldCheck className="h-4 w-4" />
              DivyaDhara Subscriptions
            </span>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Grow your spiritual presence on DivyaDhara
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Choose the plan for your {audienceLabel.toLowerCase()} profile.
              Live pricing, duration and entitlements come from the backend
              catalogue; the browser never becomes the commercial source of
              truth.
            </p>
          </div>

          {showAudienceTabs ? (
            <div className="mt-8">
              <SubscriptionAudienceTabs
                value={audience}
                onChange={setAudience}
                disabled={loading}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-8 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Live plan catalogue unavailable</p>
              <p className="mt-1 leading-6">{error}</p>
              <p className="mt-2 font-semibold leading-6">
                Fallback prices may be shown for reference only. Checkout is
                disabled until the live catalogue is available.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-700">
                {audienceLabel} plans
              </p>

              <span
                className={
                  source === "backend"
                    ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                    : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"
                }
              >
                {source === "backend" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <CircleHelp className="h-3.5 w-3.5" />
                )}
                {source === "backend" ? "Live catalogue" : "Reference only"}
              </span>
            </div>

            <h2 className="mt-1 text-2xl font-black text-slate-950">
              {source === "backend"
                ? "Current subscription plans"
                : "Configured plan reference"}
            </h2>
          </div>

          {loading ? (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading live catalogue
            </span>
          ) : null}
        </div>

        <SubscriptionPlanGrid
          plans={plans}
          selectedPlanId={
            source === "backend" ? selectedPlan?.id ?? null : null
          }
          loading={loading}
          onSelect={handleSelect}
        />

        <div className="mt-10 grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-3">
          <TrustItem
            title="Backend-authoritative pricing"
            text="Plan price, duration, limits and entitlements are read from the DivyaDhara backend catalogue."
          />
          <TrustItem
            title="Verified payment ledger"
            text="The browser does not decide the Razorpay amount; the payment backend resolves and verifies the commercial variant."
          />
          <TrustItem
            title="Subscription-aware lead credits"
            text="Lead capacity is consumed against the active subscription snapshot for the relevant Pandit, Temple or Ashram."
          />
        </div>

        <div className="mt-6 rounded-3xl border border-orange-100 bg-orange-50/60 p-5 text-sm leading-6 text-slate-700">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />
            <p>
              <span className="font-bold text-slate-900">Payment safety:</span>{" "}
              selecting a plan does not authorise a payment. Your existing
              backend checkout must re-resolve the plan and active price before
              creating the Razorpay order, then verify the payment before
              activating the subscription.
            </p>
          </div>
        </div>
      </section>

      {selectedPlan && !onSelectPlan ? (
        <PlanSelectionModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
        />
      ) : null}
    </main>
  );
}

function TrustItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <div className="mb-2 flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-5 w-5" />
        <span className="text-sm font-bold text-slate-900">
          {title}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-600">
        {text}
      </p>
    </div>
  );
}

function PlanSelectionModal({
  plan,
  onClose,
}: {
  plan: SubscriptionPlan;
  onClose: () => void;
}) {
  const features = plan.features.slice(0, 8);
  const billingLabelText = billingLabel(plan);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${plan.name} subscription selected`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">
              {audienceLabelFor(plan.audience)}
            </p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">
              {plan.name} plan
            </h3>
            {plan.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {plan.description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-orange-50 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                {billingLabelText}
              </p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {formatSubscriptionPrice(plan.priceAmount, plan.currency)}
              </p>
            </div>

            <span className="text-sm font-semibold text-slate-600">
              {plan.durationDays} days
            </span>
          </div>

          <p className="mt-3 text-sm font-medium text-slate-700">
            {plan.leadLimit} lead credits
          </p>
        </div>

        {features.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-900">
              Included
            </p>
            <div className="mt-3 space-y-2">
              {features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <span>
              Final amount, currency and commercial terms are confirmed by the
              backend when the payment order is created.
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            Close
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
