import type { ReactNode } from "react";

import {
  Check,
  Crown,
  Image as ImageIcon,
  ListChecks,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";

import type { SubscriptionPlan } from "../data/subscriptions.ts";
import { formatSubscriptionPrice } from "../data/subscriptions.ts";

type SubscriptionPlanCardProps = {
  plan: SubscriptionPlan;
  highlighted?: boolean;
  disabled?: boolean;
  onSelect?: (plan: SubscriptionPlan) => void;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function entitlementItems(plan: SubscriptionPlan): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  const add = (label: string, condition = true) => {
    const cleanLabel = label.trim();

    if (!condition || !cleanLabel) {
      return;
    }

    const normalized = normalizeText(cleanLabel);

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    items.push(cleanLabel);
  };

  for (const feature of plan.features ?? []) {
    add(feature);
  }

  add("WhatsApp enquiries", plan.whatsappEnquiry);
  add("Verification badge", plan.verificationBadge);
  add("Advanced analytics", plan.analyticsLevel === "advanced");
  add("Higher search visibility", plan.searchVisibility === "higher");
  add("Priority support", plan.prioritySupport);
  add("Homepage promotion", plan.homepagePromotion);
  add("Enhanced SEO", plan.enhancedSeo);
  add("Enhanced profile", plan.enhancedProfile);
  add("Live aarti support", plan.liveAartiEnabled);

  return items.slice(0, 10);
}

function audienceLabel(
  audience: SubscriptionPlan["audience"],
): string {
  switch (audience) {
    case "pandit":
      return "Pandit";
    case "temple":
      return "Temple";
    case "ashram":
      return "Ashram";
    default:
      return String(audience);
  }
}

function billingIntervalLabel(
  billingInterval: SubscriptionPlan["billingInterval"],
): string {
  const value = String(
    billingInterval ?? "monthly",
  ).toLowerCase();

  switch (value) {
    case "yearly":
    case "annual":
      return "year";

    case "quarterly":
      return "quarter";

    case "monthly":
    default:
      return "month";
  }
}

function billingCycleLabel(
  plan: SubscriptionPlan,
): string {
  const duration = Number(plan.durationDays);
  const interval = String(
    plan.billingInterval ?? "monthly",
  ).toLowerCase();

  if (
    Number.isInteger(duration) &&
    duration > 0
  ) {
    return `${duration}-day subscription`;
  }

  switch (interval) {
    case "yearly":
    case "annual":
      return "Annual subscription";

    case "quarterly":
      return "Quarterly subscription";

    case "monthly":
    default:
      return "Monthly subscription";
  }
}

function pricePeriodLabel(
  plan: SubscriptionPlan,
): string {
  const interval = billingIntervalLabel(
    plan.billingInterval,
  );

  return `/ ${interval}`;
}

function formatMetric(
  value: number | null | undefined,
): number | string {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : "—";
}

function isFiniteNonNegative(
  value: number | null | undefined,
): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isSelectDisabled(
  plan: SubscriptionPlan,
  disabled: boolean,
  onSelect?: (plan: SubscriptionPlan) => void,
): boolean {
  if (disabled) {
    return true;
  }

  if (!onSelect) {
    return true;
  }

  if (plan.isActive !== true) {
    return true;
  }

  if (!Number.isSafeInteger(plan.id) || plan.id <= 0) {
    return true;
  }

  if (!plan.code?.trim()) {
    return true;
  }

  if (!isFiniteNonNegative(plan.priceAmount)) {
    return true;
  }

  if (!/^[A-Z]{3}$/.test(String(plan.currency))) {
    return true;
  }

  if (
    !Number.isInteger(plan.durationDays) ||
    plan.durationDays <= 0
  ) {
    return true;
  }

  return false;
}

export default function SubscriptionPlanCard({
  plan,
  highlighted = false,
  disabled = false,
  onSelect,
}: SubscriptionPlanCardProps) {
  const featureItems = entitlementItems(plan);

  const selectionDisabled = isSelectDisabled(
    plan,
    disabled,
    onSelect,
  );

  const planAudienceLabel = audienceLabel(
    plan.audience,
  );

  const monthlyOrCyclePrice = formatSubscriptionPrice(
    plan.priceAmount,
    plan.currency,
  );

  const leadLimit = formatMetric(plan.leadLimit);
  const serviceLimit = formatMetric(plan.serviceLimit);
  const galleryLimit = formatMetric(plan.galleryLimit);
  const videoLimit = formatMetric(plan.videoLimit);

  const billingLabel = billingCycleLabel(plan);
  const pricePeriod = pricePeriodLabel(plan);

  const buttonLabel = !onSelect
    ? "Plan selection unavailable"
    : disabled
      ? "Loading plans..."
      : "Select plan";

  return (
    <article
      aria-label={`${plan.name} subscription plan`}
      className={[
        "relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border bg-white p-6 shadow-sm",
        "transition duration-200 ease-out",
        "focus-within:ring-2 focus-within:ring-orange-200",
        disabled
          ? "opacity-80"
          : "hover:-translate-y-1 hover:shadow-xl",
        highlighted
          ? "border-orange-500 ring-2 ring-orange-100"
          : "border-slate-200",
      ].join(" ")}
    >
      {/* Popular badge */}
      {highlighted ? (
        <div
          aria-label="Popular plan"
          className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800"
        >
          <Crown
            aria-hidden="true"
            className="h-3.5 w-3.5"
          />
          Popular
        </div>
      ) : null}

      {/* Plan header */}
      <header className="mb-6">
        <div className="mb-3 flex items-start gap-3">
          <span
            aria-hidden="true"
            className={[
              "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
              highlighted
                ? "bg-orange-100 text-orange-700"
                : "bg-orange-50 text-orange-700",
            ].join(" ")}
          >
            {highlighted ? (
              <Sparkles className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>

          <div className="min-w-0 pr-16">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">
              {planAudienceLabel}
            </p>

            <h3 className="mt-1 break-words text-xl font-bold text-slate-900">
              {plan.name}
            </h3>
          </div>
        </div>

        <p className="min-h-12 text-sm leading-6 text-slate-600">
          {plan.description?.trim() ||
            "DivyaDhara subscription plan."}
        </p>
      </header>

      {/* Pricing */}
      <section
        aria-label="Plan pricing"
        className="mb-6 rounded-2xl bg-slate-50 p-4"
      >
        <div className="flex flex-wrap items-end gap-1">
          <span className="break-words text-4xl font-black tracking-tight text-slate-950">
            {monthlyOrCyclePrice}
          </span>

          <span className="pb-1 text-sm font-medium text-slate-500">
            {pricePeriod}
          </span>
        </div>

        <p className="mt-2 text-xs font-medium text-slate-500">
          {billingLabel}
          {Number.isFinite(plan.leadLimit) &&
          plan.leadLimit >= 0
            ? ` • ${plan.leadLimit} lead credits`
            : ""}
        </p>
      </section>

      {/* Key metrics */}
      <section
        aria-label="Plan limits"
        className="mb-5 grid grid-cols-2 gap-2"
      >
        <Metric
          icon={
            <MessageCircle className="h-4 w-4" />
          }
          value={leadLimit}
          label="Leads"
        />

        <Metric
          icon={
            <ListChecks className="h-4 w-4" />
          }
          value={serviceLimit}
          label="Services"
        />

        <Metric
          icon={
            <ImageIcon className="h-4 w-4" />
          }
          value={galleryLimit}
          label="Gallery"
        />

        <Metric
          icon={
            <Video className="h-4 w-4" />
          }
          value={videoLimit}
          label="Videos"
        />
      </section>

      {/* Entitlements */}
      <section
        aria-label="Included features"
        className="flex-1"
      >
        <h4 className="sr-only">
          Included features
        </h4>

        {featureItems.length > 0 ? (
          <ul className="mb-7 space-y-3">
            {featureItems.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-sm leading-5 text-slate-700"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                </span>

                <span className="break-words">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-7 text-sm text-slate-500">
            Core subscription benefits included.
          </p>
        )}
      </section>

      {/* CTA */}
      <div className="mt-auto">
        <button
          type="button"
          disabled={selectionDisabled}
          aria-disabled={selectionDisabled}
          aria-label={
            selectionDisabled
              ? buttonLabel
              : `Select ${plan.name} plan`
          }
          onClick={() => {
            if (selectionDisabled) {
              return;
            }

            onSelect?.(plan);
          }}
          className={[
            "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold",
            "outline-none transition-all duration-200",
            "focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            highlighted
              ? "bg-orange-700 text-white hover:bg-orange-800 disabled:hover:bg-orange-700"
              : "border border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 disabled:hover:bg-orange-50",
          ].join(" ")}
        >
          <span>{buttonLabel}</span>

          <Search
            aria-hidden="true"
            className="h-4 w-4"
          />
        </button>

        {!onSelect ? (
          <p className="mt-2 text-center text-[11px] leading-4 text-amber-600">
            Plan selection is available through the
            active subscription flow.
          </p>
        ) : null}

        <p className="mt-3 text-center text-[11px] leading-4 text-slate-400">
          Final price, limits and entitlements are
          confirmed by the DivyaDhara backend at
          checkout.
        </p>
      </div>
    </article>
  );
}

/* ============================================================================
 * METRIC
 * ========================================================================== */

function Metric({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div
      aria-label={`${label}: ${String(value)}`}
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3"
    >
      <div className="mb-1 flex min-w-0 items-center gap-1.5 text-orange-700">
        <span
          aria-hidden="true"
          className="shrink-0"
        >
          {icon}
        </span>

        <span className="truncate text-sm font-black text-slate-900">
          {value}
        </span>
      </div>

      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}