import type { SubscriptionAudience } from "../data/subscriptions.ts";
import { SUBSCRIPTION_AUDIENCES } from "../data/subscriptions.ts";

type SubscriptionAudienceTabsProps = {
  value: SubscriptionAudience;
  onChange: (value: SubscriptionAudience) => void;
  disabled?: boolean;
};

export default function SubscriptionAudienceTabs({
  value,
  onChange,
  disabled = false,
}: SubscriptionAudienceTabsProps) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-orange-100 bg-white p-1 shadow-sm"
      role="tablist"
      aria-label="Subscription audience"
    >
      {SUBSCRIPTION_AUDIENCES.map((audience) => {
        const active = value === audience.value;

        return (
          <button
            key={audience.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(audience.value)}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "bg-orange-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-orange-50 hover:text-orange-800",
            ].join(" ")}
          >
            {audience.label}
          </button>
        );
      })}
    </div>
  );
}
