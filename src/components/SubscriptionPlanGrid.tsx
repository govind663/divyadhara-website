import type { SubscriptionPlan } from "../data/subscriptions.ts";
import SubscriptionPlanCard from "./SubscriptionPlanCard.tsx";

type SubscriptionPlanGridProps = {
  plans: SubscriptionPlan[];
  selectedPlanId?: number | null;
  loading?: boolean;
  disabled?: boolean;
  onSelect?: (plan: SubscriptionPlan) => void;
};

export default function SubscriptionPlanGrid({
  plans,
  selectedPlanId = null,
  loading = false,
  disabled = false,
  onSelect,
}: SubscriptionPlanGridProps) {
  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <PlanSkeleton />
        <PlanSkeleton />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-orange-200 bg-orange-50/50 p-10 text-center">
        <p className="text-lg font-bold text-slate-900">
          No active plans available
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Please try again later or contact DivyaDhara support.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {plans.map((plan) => (
        <SubscriptionPlanCard
          key={plan.code}
          plan={plan}
          highlighted={selectedPlanId === plan.id || plan.name === "Premium"}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PlanSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6">
      <div className="h-10 w-40 rounded-xl bg-slate-200" />
      <div className="mt-5 h-12 w-48 rounded-xl bg-slate-200" />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="h-16 rounded-2xl bg-slate-100" />
      </div>
      <div className="mt-5 space-y-3">
        <div className="h-5 rounded bg-slate-100" />
        <div className="h-5 rounded bg-slate-100" />
        <div className="h-5 rounded bg-slate-100" />
        <div className="h-5 rounded bg-slate-100" />
      </div>
      <div className="mt-6 h-12 rounded-2xl bg-slate-200" />
    </div>
  );
}
