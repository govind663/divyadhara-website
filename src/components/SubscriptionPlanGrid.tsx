import type { SubscriptionPlan } from "../data/subscriptions.ts";
import SubscriptionPlanCard from "./SubscriptionPlanCard.tsx";

type SubscriptionPlanGridProps = {
  plans: SubscriptionPlan[];
  selectedPlanId?: number | null;
  loading?: boolean;
  disabled?: boolean;
  onSelect?: (plan: SubscriptionPlan) => void;
};

function isPremiumPlan(plan: SubscriptionPlan): boolean {
  return plan.name.trim().toLowerCase() === "premium";
}

function getPlanKey(plan: SubscriptionPlan): string {
  const idPart =
    Number.isSafeInteger(plan.id) && plan.id > 0
      ? String(plan.id)
      : "unknown";

  const codePart = plan.code?.trim() || "no-code";

  return `${idPart}-${codePart}`;
}

export default function SubscriptionPlanGrid({
  plans,
  selectedPlanId = null,
  loading = false,
  disabled = false,
  onSelect,
}: SubscriptionPlanGridProps) {
  if (loading) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading subscription plans"
        className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
      >
        <PlanSkeleton />
        <PlanSkeleton />
        <PlanSkeleton />
      </section>
    );
  }

  if (plans.length === 0) {
    return (
      <section
        aria-live="polite"
        className="rounded-3xl border border-dashed border-orange-200 bg-orange-50/50 px-6 py-12 text-center sm:px-10"
      >
        <div className="mx-auto max-w-lg">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-orange-700 shadow-sm ring-1 ring-orange-100">
            <span
              aria-hidden="true"
              className="text-xl font-black"
            >
              —
            </span>
          </div>

          <h2 className="mt-5 text-lg font-bold text-slate-900">
            No active plans available
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            There are currently no active subscription
            plans available for this audience. Please
            try again later or contact DivyaDhara support.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Available subscription plans"
      className={[
        "grid grid-cols-1 gap-6",
        "md:grid-cols-2",
        "xl:grid-cols-3",
        disabled ? "pointer-events-none" : "",
      ].join(" ")}
    >
      {plans.map((plan) => {
        const selected =
          selectedPlanId !== null &&
          selectedPlanId !== undefined &&
          plan.id === selectedPlanId;

        const highlighted =
          selected || isPremiumPlan(plan);

        return (
          <SubscriptionPlanCard
            key={getPlanKey(plan)}
            plan={plan}
            highlighted={highlighted}
            disabled={disabled}
            onSelect={onSelect}
          />
        );
      })}
    </section>
  );
}

/* ============================================================================
 * PLAN SKELETON
 * ========================================================================== */

function PlanSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-200" />

        <div className="min-w-0 flex-1">
          <div className="h-3 w-20 rounded bg-slate-200" />
          <div className="mt-2 h-6 w-36 rounded bg-slate-200" />
        </div>
      </div>

      {/* Description */}
      <div className="mt-5 space-y-2">
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-5/6 rounded bg-slate-100" />
        <div className="h-4 w-2/3 rounded bg-slate-100" />
      </div>

      {/* Pricing */}
      <div className="mt-6 rounded-2xl bg-slate-50 p-4">
        <div className="h-10 w-40 rounded-xl bg-slate-200" />
        <div className="mt-3 h-3 w-48 rounded bg-slate-100" />
      </div>

      {/* Metrics */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="h-16 rounded-2xl bg-slate-100" />
      </div>

      {/* Features */}
      <div className="mt-6 space-y-3">
        <div className="h-5 rounded bg-slate-100" />
        <div className="h-5 rounded bg-slate-100" />
        <div className="h-5 w-11/12 rounded bg-slate-100" />
        <div className="h-5 w-4/5 rounded bg-slate-100" />
        <div className="h-5 w-3/5 rounded bg-slate-100" />
      </div>

      {/* CTA */}
      <div className="mt-7 h-12 rounded-2xl bg-slate-200" />

      {/* Disclaimer */}
      <div className="mx-auto mt-3 h-3 w-4/5 rounded bg-slate-100" />
    </div>
  );
}