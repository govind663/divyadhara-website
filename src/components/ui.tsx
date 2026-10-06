/* eslint-disable react-hooks/set-state-in-effect */
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Star, Minus, Plus } from "lucide-react";
import { cx, SITE_URL } from "../lib/utils";

/*
|--------------------------------------------------------------------------
| Shared UI primitives
|--------------------------------------------------------------------------
|
| Business / UX rules:
| - Respect prefers-reduced-motion.
| - Keep interactive controls keyboard accessible.
| - Preserve SEO-friendly semantic markup.
| - Breadcrumb structured data uses the canonical DivyaDhara site URL.
| - UI primitives remain presentation-focused; CRM, booking and payment
|   business logic belongs to the relevant pages/API modules.
|--------------------------------------------------------------------------
*/

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{
        opacity: 0,
        y: reduce ? 0 : y,
      }}
      whileInView={{
        opacity: 1,
        y: 0,
      }}
      viewport={{
        once: true,
        margin: "-60px",
      }}
      transition={{
        duration: reduce ? 0 : 0.7,
        delay: reduce ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

export function Eyebrow({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-orange-700/20 bg-linear-to-r from-orange-50 to-amber-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-orange-800">
      {icon}
      {children}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  align = "center",
  sanskrit,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  align?: "center" | "left";
  sanskrit?: string;
}) {
  const centered = align === "center";

  return (
    <Reveal
      className={cx(
        "mb-10 max-w-3xl md:mb-14",
        centered ? "mx-auto text-center" : "text-left",
      )}
    >
      <Eyebrow>
        <span
          className="font-sanskrit text-sm normal-case tracking-normal text-orange-700"
          aria-hidden
        >
          ॥
        </span>{" "}
        {eyebrow}
      </Eyebrow>

      <h2 className="font-display mt-4 text-3xl font-semibold leading-[1.12] text-[#2a1a10] md:text-[2.75rem]">
        {title}
      </h2>

      {sanskrit && (
        <p className="font-sanskrit mt-2 text-lg text-orange-800/80">
          {sanskrit}
        </p>
      )}

      {sub && (
        <p className="mt-4 text-[15px] leading-relaxed text-stone-600 md:text-base">
          {sub}
        </p>
      )}

      <div
        className={cx(
          "mt-6 flex items-center gap-2",
          centered && "justify-center",
        )}
        aria-hidden="true"
      >
        <span className="h-px w-14 bg-linear-to-r from-transparent to-orange-500" />
        <span className="text-orange-600">❖</span>
        <span className="h-px w-14 bg-linear-to-l from-transparent to-orange-500" />
      </div>
    </Reveal>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: {
    label: string;
    href?: string;
  }[];
}) {
  const schemaItems = items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.label,
    ...(item.href
      ? {
          item: item.href.startsWith("http")
            ? item.href
            : `${SITE_URL}${item.href.startsWith("/") ? item.href : `/${item.href}`}`,
        }
      : {}),
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: schemaItems,
  };

  return (
    <nav
      aria-label="Breadcrumb"
      className="text-[13px]"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema),
        }}
      />

      <ol className="flex flex-wrap items-center gap-1.5 text-stone-500">
        {items.map((item, index) => {
          const isLast =
            index === items.length - 1;

          return (
            <li
              key={`${item.label}-${index}`}
              className="flex items-center gap-1.5"
            >
              {index > 0 && (
                <ChevronRight
                  size={13}
                  className="text-orange-400"
                  aria-hidden="true"
                />
              )}

              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="rounded-md transition hover:text-orange-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={
                    isLast ? "page" : undefined
                  }
                  className={cx(
                    isLast &&
                      "font-semibold text-orange-900",
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Stars({
  value = "4.9",
}: {
  value?: string | number;
}) {
  const label = String(value);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-900/90 px-2.5 py-1 text-xs font-bold text-amber-300"
      aria-label={`Rating ${label} out of 5`}
      title={`Rating ${label} out of 5`}
    >
      <Star
        size={12}
        fill="currentColor"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function Counter({
  to,
  suffix = "",
  duration = 1.6,
}: {
  to: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, {
    once: true,
    margin: "-40px",
  });
  const [n, setN] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!inView) {
      return;
    }

    if (reduce) {
      setN(to);
      return;
    }

    let raf = 0;
    const startedAt = performance.now();
    const safeDuration = Math.max(
      0,
      duration,
    );

    if (safeDuration === 0) {
      setN(to);
      return;
    }

    const tick = (timestamp: number) => {
      const progress = Math.min(
        1,
        (timestamp - startedAt) /
          (safeDuration * 1000),
      );

      const eased =
        1 - Math.pow(1 - progress, 3);

      setN(Math.round(to * eased));

      if (progress < 1) {
        raf = requestAnimationFrame(
          tick,
        );
      } else {
        setN(to);
      }
    };

    raf = requestAnimationFrame(tick);

    return () =>
      cancelAnimationFrame(raf);
  }, [inView, to, duration, reduce]);

  const value =
    reduce || !inView ? (inView ? to : 0) : n;

  return (
    <span
      ref={ref}
      aria-label={`${value.toLocaleString("en-IN")}${suffix}`}
    >
      {value.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

export function Faq({
  items,
}: {
  items: {
    q: string;
    a: string;
  }[];
}) {
  const [open, setOpen] = useState<number | null>(0);
  const groupId = useId();

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="divide-y divide-orange-900/10 overflow-hidden rounded-2xl border border-orange-900/10 bg-white/80"
      role="region"
      aria-label="Frequently asked questions"
    >
      {items.map((faq, index) => {
        const isOpen = open === index;
        const buttonId = `${groupId}-question-${index}`;
        const panelId = `${groupId}-answer-${index}`;

        return (
          <div key={`${faq.q}-${index}`}>
            <button
              type="button"
              id={buttonId}
              onClick={() =>
                setOpen(
                  isOpen ? null : index,
                )
              }
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-[#3a2415] transition hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-inset md:px-6"
            >
              <span className="text-[15px]">
                {faq.q}
              </span>

              <span
                className={cx(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-lg leading-none transition",
                  isOpen
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-orange-300 text-orange-700",
                )}
                aria-hidden="true"
              >
                {isOpen ? (
                  <Minus size={16} />
                ) : (
                  <Plus size={16} />
                )}
              </span>
            </button>

            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="px-5 pb-5 md:px-6"
              >
                <p className="text-[14.5px] leading-relaxed text-stone-600">
                  {faq.a}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Empty({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-3xl border border-dashed border-orange-300 bg-orange-50/50 px-6 py-14 text-center"
      role="status"
      aria-live="polite"
    >
      <div
        className="font-sanskrit mx-auto mb-3 text-4xl text-orange-400"
        aria-hidden="true"
      >
        ॐ
      </div>

      <h3 className="font-display text-xl font-semibold text-[#3a2415]">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
        {sub}
      </p>

      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
