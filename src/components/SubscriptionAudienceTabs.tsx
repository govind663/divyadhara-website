import type { KeyboardEvent } from "react";

import type { SubscriptionAudience } from "../data/subscriptions.ts";
import {
  SUBSCRIPTION_AUDIENCES,
} from "../data/subscriptions.ts";

type SubscriptionAudienceTabsProps = {
  value: SubscriptionAudience;
  onChange: (value: SubscriptionAudience) => void;
  disabled?: boolean;
  ariaLabel?: string;
};

export default function SubscriptionAudienceTabs({
  value,
  onChange,
  disabled = false,
  ariaLabel = "Subscription audience",
}: SubscriptionAudienceTabsProps) {
  function handleChange(
    nextAudience: SubscriptionAudience,
  ) {
    if (disabled) {
      return;
    }

    if (nextAudience === value) {
      return;
    }

    onChange(nextAudience);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    if (disabled || SUBSCRIPTION_AUDIENCES.length === 0) {
      return;
    }

    let nextIndex = currentIndex;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        nextIndex =
          currentIndex + 1 >= SUBSCRIPTION_AUDIENCES.length
            ? 0
            : currentIndex + 1;
        break;

      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        nextIndex =
          currentIndex - 1 < 0
            ? SUBSCRIPTION_AUDIENCES.length - 1
            : currentIndex - 1;
        break;

      case "Home":
        event.preventDefault();
        nextIndex = 0;
        break;

      case "End":
        event.preventDefault();
        nextIndex = SUBSCRIPTION_AUDIENCES.length - 1;
        break;

      default:
        return;
    }

    const nextAudience =
      SUBSCRIPTION_AUDIENCES[nextIndex];

    if (!nextAudience) {
      return;
    }

    handleChange(nextAudience.value);

    /**
     * Move focus only when the target button exists.
     * This gives the selector proper keyboard navigation without requiring
     * parent components to manage refs.
     */
    window.requestAnimationFrame(() => {
      const target = document.getElementById(
        `subscription-audience-${nextAudience.value}`,
      );

      target?.focus();
    });
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-busy={disabled}
      className={[
        "w-full",
        "overflow-x-auto",
        "overscroll-x-contain",
        "scrollbar-none",
        "rounded-2xl",
        "border border-orange-100",
        "bg-white",
        "p-1",
        "shadow-sm",
        "[-ms-overflow-style:none]",
        "[scrollbar-width:none]",
      ].join(" ")}
    >
      <div className="flex min-w-max items-center gap-1">
        {SUBSCRIPTION_AUDIENCES.map(
          (audience, index) => {
            const active =
              value === audience.value;

            return (
              <button
                key={audience.value}
                id={`subscription-audience-${audience.value}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${audience.label} subscription plans`}
                aria-disabled={disabled}
                disabled={disabled}
                tabIndex={active ? 0 : -1}
                title={
                  disabled
                    ? "Subscription plans are loading"
                    : `View ${audience.label} subscription plans`
                }
                onClick={() =>
                  handleChange(audience.value)
                }
                onKeyDown={(event) =>
                  handleKeyDown(event, index)
                }
                className={[
                  "relative",
                  "inline-flex",
                  "min-h-11",
                  "shrink-0",
                  "items-center",
                  "justify-center",
                  "gap-2",
                  "rounded-xl",
                  "px-4",
                  "py-2.5",
                  "text-sm",
                  "font-semibold",
                  "whitespace-nowrap",
                  "transition-all",
                  "duration-200",
                  "ease-out",
                  "select-none",
                  "touch-manipulation",
                  "outline-none",

                  "focus-visible:ring-2",
                  "focus-visible:ring-orange-500",
                  "focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-white",

                  "disabled:cursor-not-allowed",
                  "disabled:opacity-50",
                  "disabled:hover:bg-transparent",

                  active
                    ? [
                        "bg-orange-700",
                        "text-white",
                        "shadow-sm",
                        "hover:bg-orange-800",
                      ].join(" ")
                    : [
                        "text-slate-600",
                        "hover:bg-orange-50",
                        "hover:text-orange-800",
                      ].join(" "),
                ].join(" ")}
              >
                <span className="leading-none">
                  {audience.label}
                </span>

                {active ? (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-white/90"
                  />
                ) : null}
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}