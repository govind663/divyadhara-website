/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ReactNode } from "react";

import {
  Check,
  Crown,
  Image as ImageIcon,
  Headphones,
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

function entitlementItems(plan: SubscriptionPlan): string[] {
  const items = [...plan.features];

  const add = (label: string, condition: boolean) => {
    if (condition && !items.some((item) => item.toLowerCase() === label.toLowerCase())) {
      items.push(label);
    }
  };

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

export default function SubscriptionPlanCard({
  plan,
  highlighted = false,
  disabled = false,
  onSelect,
}: SubscriptionPlanCardProps) {
  const featureItems = entitlementItems(plan);

  return (
    <article
      className={[
        "relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white p-6 shadow-sm transition duration-200",
        "hover:-translate-y-1 hover:shadow-xl",
        highlighted
          ? "border-orange-500 ring-2 ring-orange-100"
          : "border-slate-200",
      ].join(" ")}
    >
      {highlighted ? (
        <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">
          <Crown className="h-3.5 w-3.5" />
          Popular
        </div>
      ) : null}

      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-50 text-orange-700">
            {highlighted ? (
              <Sparkles className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">
              {plan.audience}
            </p>
            <h3 className="text-xl font-bold text-slate-900">
              {plan.name}
            </h3>
          </div>
        </div>

        <p className="min-h-12 text-sm leading-6 text-slate-600">
          {plan.description || "DivyaDhara subscription plan."}
        </p>
      </div>

      <div className="mb-6 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-end gap-1">
          <span className="text-4xl font-black tracking-tight text-slate-950">
            {formatSubscriptionPrice(
              plan.priceAmount,
              plan.currency,
            )}
          </span>
          <span className="pb-1 text-sm font-medium text-slate-500">
            / month
          </span>
        </div>

        <p className="mt-2 text-xs font-medium text-slate-500">
          30-day subscription • {plan.leadLimit} lead credits
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <Metric
          icon={<MessageCircle className="h-4 w-4" />}
          value={plan.leadLimit}
          label="Leads"
        />
        <Metric
          icon={<ListChecks className="h-4 w-4" />}
          value={plan.serviceLimit || "—"}
          label="Services"
        />
        <Metric
          icon={<ImageIcon className="h-4 w-4" />}
          value={plan.galleryLimit || "—"}
          label="Gallery"
        />
        <Metric
          icon={<Video className="h-4 w-4" />}
          value={plan.videoLimit || "—"}
          label="Videos"
        />
      </div>

      <ul className="mb-7 flex-1 space-y-3">
        {featureItems.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm leading-5 text-slate-700"
          >
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={disabled || !onSelect}
        onClick={() => onSelect?.(plan)}
        className={[
          "mt-auto inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold transition",
          "disabled:cursor-not-allowed disabled:opacity-50",
          highlighted
            ? "bg-orange-700 text-white hover:bg-orange-800"
            : "border border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100",
        ].join(" ")}
      >
        Select {plan.name}
        <Search className="h-4 w-4" />
      </button>

      <p className="mt-3 text-center text-[11px] leading-4 text-slate-400">
        Final price, limits and entitlements are confirmed by the DivyaDhara
        backend at checkout.
      </p>
    </article>
  );
}

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
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-1.5 text-orange-700">
        {icon}
        <span className="text-sm font-black text-slate-900">
          {value}
        </span>
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}
