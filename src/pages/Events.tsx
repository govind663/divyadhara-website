
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MapPin,
  Clock,
  CalendarDays,
  MessageCircle,
  Users,
  Ticket,
  Sparkles,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  Compass,
  Camera,
  Search,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Facebook,
  Linkedin,
  AtSign,
  Share2,
  Copy,
  ExternalLink,
} from "lucide-react";

import { EVENTS } from "../data/content";
import { useSEO } from "../lib/seo";
import { Breadcrumbs, Reveal, SectionHead } from "../components/ui";
import { EventCard } from "../components/cards";
import {
  EnquiryForm,
  PageHero,
  WhatsAppBand,
} from "../components/blocks";
import { waLink, formatDate } from "../lib/utils";

/* =========================================================
   GOOGLE CALENDAR INTEGRATION
   No Apple / Outlook .ics download.
   Events are interpreted in India Standard Time.
========================================================= */

type CalendarTiming = {
  allDay: boolean;
  start: Date;
  end: Date;
  approximateEnd: boolean;
};

type ClockTime = {
  hours: number;
  minutes: number;
};

function parseClockTime(value: string): ClockTime | null {
  const match = value.match(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i,
  );

  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (
    hours < 1 ||
    hours > 12 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  if (meridiem === "AM") {
    hours = hours === 12 ? 0 : hours;
  } else {
    hours = hours === 12 ? 12 : hours + 12;
  }

  return { hours, minutes };
}

function getEventEndDate(event: (typeof EVENTS)[number]) {
  if (!("endDate" in event)) return null;

  const value = event.endDate;

  if (typeof value !== "string") return null;

  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function getCalendarTiming(
  event: (typeof EVENTS)[number],
): CalendarTiming {
  const dateMatch = event.date.match(
    /^(\d{4})-(\d{2})-(\d{2})/,
  );

  if (!dateMatch) {
    const now = new Date();
    const fallback = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      ),
    );

    return {
      allDay: true,
      start: fallback,
      end: new Date(fallback.getTime() + 86400000),
      approximateEnd: false,
    };
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const endDate = getEventEndDate(event);

  const endDateMatch = endDate?.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  const range = event.time.match(
    /(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i,
  );

  const startTime = parseClockTime(
    range?.[1] ?? event.time,
  );

  const endTime = range
    ? parseClockTime(range[2])
    : null;

  const startDay = new Date(
    Date.UTC(year, month - 1, day),
  );

  /*
   * All-day events use an exclusive end date in Google Calendar.
   * For an inclusive multi-day endDate, advance one day.
   */
  if (!startTime) {
    const lastDay = endDateMatch
      ? new Date(
          Date.UTC(
            Number(endDateMatch[1]),
            Number(endDateMatch[2]) - 1,
            Number(endDateMatch[3]),
          ),
        )
      : startDay;

    return {
      allDay: true,
      start: startDay,
      end: new Date(lastDay.getTime() + 86400000),
      approximateEnd: false,
    };
  }

  /*
   * Convert local India time to UTC for the Google Calendar
   * date format. India Standard Time is UTC+05:30.
   */
  const start = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      startTime.hours,
      startTime.minutes,
    ) -
      330 * 60000,
  );

  let end: Date;
  let approximateEnd = false;

  if (endTime) {
    const endYear = endDateMatch
      ? Number(endDateMatch[1])
      : year;

    const endMonth = endDateMatch
      ? Number(endDateMatch[2])
      : month;

    const endDay = endDateMatch
      ? Number(endDateMatch[3])
      : day;

    end = new Date(
      Date.UTC(
        endYear,
        endMonth - 1,
        endDay,
        endTime.hours,
        endTime.minutes,
      ) -
        330 * 60000,
    );

    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 86400000);
    }
  } else if (endDateMatch) {
    /*
     * The start time is known but no end time is published.
     * Preserve the inclusive final event date and use a
     * disclosed two-hour placeholder on that date.
     */
    end = new Date(
      Date.UTC(
        Number(endDateMatch[1]),
        Number(endDateMatch[2]) - 1,
        Number(endDateMatch[3]),
        startTime.hours,
        startTime.minutes,
      ) -
        330 * 60000 +
        2 * 60 * 60000,
    );
    approximateEnd = true;
  } else {
    end = new Date(start.getTime() + 2 * 60 * 60000);
    approximateEnd = true;
  }

  return {
    allDay: false,
    start,
    end,
    approximateEnd,
  };
}

function formatCalendarDate(date: Date) {
  const pad = (value: number) =>
    String(value).padStart(2, "0");

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join("");
}

function formatGoogleCalendarDate(date: Date) {
  const indiaTime = new Date(
    date.getTime() + 330 * 60000,
  );

  const pad = (value: number) =>
    String(value).padStart(2, "0");

  return (
    `${indiaTime.getUTCFullYear()}` +
    `${pad(indiaTime.getUTCMonth() + 1)}` +
    `${pad(indiaTime.getUTCDate())}` +
    `T${pad(indiaTime.getUTCHours())}` +
    `${pad(indiaTime.getUTCMinutes())}00`
  );
}

function getCalendarDescription(
  event: (typeof EVENTS)[number],
  timing: CalendarTiming,
) {
  const parts = [
    event.description,
    `Organiser: ${event.organizer}`,
    `Entry information: ${event.fee}`,
    `Event details: https://divya-dhara.in/events/${event.slug}`,
  ];

  if (timing.approximateEnd) {
    parts.push(
      "The published event time does not specify an end time. A two-hour placeholder has been used; please edit it in your calendar if needed.",
    );
  }

  return parts.join("\n\n");
}

function getGoogleCalendarUrl(
  event: (typeof EVENTS)[number],
) {
  const timing = getCalendarTiming(event);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: getCalendarDescription(event, timing),
    location: `${event.venue}, ${event.city}`,
    ctz: "Asia/Kolkata",
  });

  const start = timing.allDay
    ? formatCalendarDate(timing.start)
    : formatGoogleCalendarDate(timing.start);

  const end = timing.allDay
    ? formatCalendarDate(timing.end)
    : formatGoogleCalendarDate(timing.end);

  params.set("dates", `${start}/${end}`);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function EventCalendarActions({
  event,
  compact = false,
}: {
  event: (typeof EVENTS)[number];
  compact?: boolean;
}) {
  const timing = getCalendarTiming(event);

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
      <a
        href={getGoogleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-700/20 bg-white px-3.5 py-2.5 text-xs font-bold text-[#5b3927] transition duration-300 hover:-translate-y-0.5 hover:border-orange-500 hover:bg-orange-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-sm"
      >
        <CalendarPlus
          size={16}
          className="text-orange-700"
        />
        Google Calendar
      </a>

      {timing.approximateEnd && !compact && (
        <p className="basis-full text-xs leading-5 text-white/70">
          The event is listed as “onwards”. Its end time is
          unconfirmed; a two-hour placeholder is used.
        </p>
      )}
    </div>
  );
}

/* =========================================================
   EVENT SEARCH / FILTER / PAGINATION
========================================================= */

const EVENT_PAGE_SIZE = 6;

type EventDateScope = "all" | "upcoming" | "past";

function getEventTimestamp(value: string): number | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.getTime();
}

function isEventUpcoming(value: string): boolean {
  const timestamp = getEventTimestamp(value);

  if (timestamp === null) return false;

  const eventDay = new Date(timestamp);
  eventDay.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return eventDay.getTime() >= today.getTime();
}

function getEventSearchText(
  event: (typeof EVENTS)[number],
): string {
  return [
    event.title,
    event.category,
    event.description,
    event.venue,
    event.city,
    event.organizer,
    event.time,
    ...(event.schedule ?? []).map(
      (item) => `${item.t} ${item.item}`,
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/* =========================================================
   SOCIAL SHARING
========================================================= */

function EventShareButtons({
  event,
  compact = false,
}: {
  event: (typeof EVENTS)[number];
  compact?: boolean;
}) {
  const [message, setMessage] = useState("");

  const pageUrl =
    typeof window === "undefined"
      ? `https://divya-dhara.in/events/${event.slug}`
      : window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1"
        ? `https://divya-dhara.in/events/${event.slug}`
        : `${window.location.origin}/events/${event.slug}`;

  const shareText = [
    `${event.title} | ${formatDate(event.date)}`,
    `${event.venue}, ${event.city}`,
    `Explore event details on DivyaDhara: ${pageUrl}`,
  ].join("\n");

  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedText = encodeURIComponent(shareText);

  const socialLinks = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      className:
        "bg-[#25D366] text-white hover:bg-[#128C7E] hover:shadow-[0_8px_22px_rgba(37,211,102,0.35)]",
      url: `https://wa.me/?text=${encodedText}`,
    },
    {
      id: "instagram",
      label: "Instagram",
      icon: Instagram,
      className:
        "bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white hover:shadow-[0_8px_22px_rgba(214,41,118,0.35)]",
      url: null,
    },
    {
      id: "facebook",
      label: "Facebook",
      icon: Facebook,
      className:
        "bg-[#1877F2] text-white hover:shadow-[0_8px_22px_rgba(24,119,242,0.35)]",
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      icon: Linkedin,
      className:
        "bg-[#0A66C2] text-white hover:shadow-[0_8px_22px_rgba(10,102,194,0.35)]",
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      id: "threads",
      label: "Threads",
      icon: AtSign,
      className:
        "bg-[#101010] text-white hover:bg-[#303030] hover:shadow-[0_8px_22px_rgba(0,0,0,0.25)]",
      url: `https://www.threads.net/intent/post?text=${encodedText}`,
    },
  ] as const;

  async function copy(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage("Event link and details copied.");
        return;
      }
    } catch {
      // Use the fallback below.
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";

      document.body.appendChild(textarea);
      textarea.select();

      const success = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (success) {
        setMessage("Event link and details copied.");
        return;
      }
    } catch {
      // Continue to the manual copy prompt.
    }

    window.prompt("Copy event details:", text);
    setMessage("Copy the event details from the prompt.");
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold text-stone-600">
            <Share2 size={14} />
            Share event
          </span>
        )}

        {socialLinks.map((social) => {
          const Icon = social.icon;

          return (
            <button
              key={social.id}
              type="button"
              onClick={() => {
                if (social.id === "instagram") {
                  void copy(shareText);
                  window.open(
                    "https://www.instagram.com/",
                    "_blank",
                    "noopener,noreferrer",
                  );
                  return;
                }

                window.open(
                  social.url ?? pageUrl,
                  "_blank",
                  "noopener,noreferrer",
                );

                setMessage(`Opening ${social.label} sharing.`);
              }}
              className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-transparent shadow-sm transition-all duration-300 ease-out hover:-translate-y-1.5 hover:scale-110 hover:rotate-3 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none ${social.className}`}
              title={`Share on ${social.label}`}
              aria-label={`Share ${event.title} on ${social.label}`}
            >
              <Icon
                size={compact ? 17 : 19}
                strokeWidth={2.2}
                className="relative z-10 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none"
              />

              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full motion-reduce:transition-none"
              />
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => void copy(shareText)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-900/15 bg-[#fff8ed] text-[#5b3927] transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:bg-orange-100 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transform-none motion-reduce:transition-none"
          title="Copy event link"
          aria-label={`Copy link for ${event.title}`}
        >
          <Copy size={16} />
        </button>
      </div>

      {message && (
        <p
          className="mt-2 text-xs text-emerald-700"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}
    </div>
  );
}

/* =========================================================
   EVENT LIST PAGE
========================================================= */

export function EventList() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [city, setCity] = useState("");
  const [dateScope, setDateScope] =
    useState<EventDateScope>("all");
  const [page, setPage] = useState(1);

  useSEO({
    title:
      "Spiritual Events in India — Festivals, Katha & Satsang | DivyaDhara",
    description:
      "Discover spiritual festivals, Bhagavat Katha, satsangs, yoga gatherings, Rath Yatra and cultural programmes across India. Search events by name, category, city and date, and enquire about registration.",
    path: "/events",
  });

  const categories = useMemo(
    () =>
      [
        ...new Set(
          EVENTS.map((event) => event.category).filter(Boolean),
        ),
      ].sort(),
    [],
  );

  const cities = useMemo(
    () =>
      [
        ...new Set(
          EVENTS.map((event) => event.city).filter(Boolean),
        ),
      ].sort(),
    [],
  );

  const filteredEvents = useMemo(() => {
    const search = query.trim().toLowerCase();

    const filtered = EVENTS.filter((event) => {
      const matchesSearch =
        !search || getEventSearchText(event).includes(search);

      const matchesCategory =
        !cat || event.category === cat;

      const matchesCity = !city || event.city === city;

      const upcoming = isEventUpcoming(event.date);

      const matchesDate =
        dateScope === "all" ||
        (dateScope === "upcoming" && upcoming) ||
        (dateScope === "past" && !upcoming);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesCity &&
        matchesDate
      );
    });

    return filtered.sort((a, b) => {
      const timeA = getEventTimestamp(a.date);
      const timeB = getEventTimestamp(b.date);

      if (timeA === null && timeB === null) {
        return a.title.localeCompare(b.title);
      }

      if (timeA === null) return 1;
      if (timeB === null) return -1;

      const upcomingA = isEventUpcoming(a.date);
      const upcomingB = isEventUpcoming(b.date);

      if (upcomingA !== upcomingB) {
        return upcomingA ? -1 : 1;
      }

      return upcomingA
        ? timeA - timeB
        : timeB - timeA;
    });
  }, [query, cat, city, dateScope]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEvents.length / EVENT_PAGE_SIZE),
  );

  const safePage = Math.min(page, totalPages);

  const visibleEvents = filteredEvents.slice(
    (safePage - 1) * EVENT_PAGE_SIZE,
    safePage * EVENT_PAGE_SIZE,
  );

  function resetFilters() {
    setQuery("");
    setCat("");
    setCity("");
    setDateScope("all");
    setPage(1);
  }

  return (
    <>
      <PageHero
        eyebrow="Utsav · Satsang · Katha"
        title="Spiritual Events"
        sub="Discover festivals, kathas, satsangs and cultural programmes that bring India's spiritual traditions to life. Explore event details, venues, programme schedules and registration enquiries."
        image="/images/festival-crowd.jpeg"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Events" },
          ]}
        />

        <Reveal className="mt-8">
          <div className="grid gap-5 rounded-3xl border border-orange-900/10 bg-[#fffaf3] p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
                Celebrate Together
              </p>

              <h2 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                Find Your Next Spiritual Gathering
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
                Search by event name, city or organiser, compare
                categories and review event dates before contacting
                the organiser. Reconfirm details before travelling.
              </p>
            </div>

            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              <Sparkles size={28} />
            </div>
          </div>
        </Reveal>

        {/* Search and all filters align in one row on large screens. */}
        <section
          className="mt-8 rounded-3xl border border-orange-900/10 bg-[#fffaf5] p-4 md:p-6"
          aria-label="Search and filter spiritual events"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-700">
                Explore by Interest
              </p>

              <h2 className="font-display mt-1 text-xl font-semibold text-[#2a1a10] md:text-2xl">
                Browse Events
              </h2>
            </div>

            <p
              className="text-sm text-stone-500"
              aria-live="polite"
            >
              {filteredEvents.length}{" "}
              {filteredEvents.length === 1 ? "event" : "events"} found
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto]">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-bold text-stone-600">
                Search events
              </span>

              <span className="relative block">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />

                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Event, venue, organiser..."
                  className="w-full rounded-xl border border-orange-900/15 bg-white py-3 pl-10 pr-3 text-sm text-[#2a1a10] outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
              </span>
            </label>

            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-bold text-stone-600">
                Category
              </span>

              <select
                value={cat}
                onChange={(event) => {
                  setCat(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-orange-900/15 bg-white px-3 py-3 text-sm text-[#2a1a10] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              >
                <option value="">All categories</option>

                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-bold text-stone-600">
                City
              </span>

              <select
                value={city}
                onChange={(event) => {
                  setCity(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-orange-900/15 bg-white px-3 py-3 text-sm text-[#2a1a10] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              >
                <option value="">All cities</option>

                {cities.map((eventCity) => (
                  <option key={eventCity} value={eventCity}>
                    {eventCity}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-bold text-stone-600">
                Event date
              </span>

              <select
                value={dateScope}
                onChange={(event) => {
                  setDateScope(
                    event.target.value as EventDateScope,
                  );
                  setPage(1);
                }}
                className="w-full rounded-xl border border-orange-900/15 bg-white px-3 py-3 text-sm text-[#2a1a10] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              >
                <option value="all">All events</option>
                <option value="upcoming">Upcoming events</option>
                <option value="past">Past events</option>
              </select>
            </label>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-900/15 bg-white px-4 py-3 text-sm font-bold text-stone-700 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <X size={16} />
              Reset
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-orange-900/10 pt-4 text-xs text-stone-500">
            <p className="flex items-center gap-1.5">
              <SlidersHorizontal size={14} />
              Filter results to find a suitable event.
            </p>

            <p>
              Confirm dates, venue and fees with the organiser
              before attending.
            </p>
          </div>
        </section>

        {/* Event cards */}
        <section
          className="mt-8"
          aria-label="Spiritual event listings"
        >
          {visibleEvents.length > 0 ? (
            <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visibleEvents.map((event, index) => (
                <div
                  key={event.slug}
                  className="flex min-w-0 flex-col"
                >
                  <EventCard e={event} i={index} />

                  <div className="mt-3 rounded-2xl border border-orange-900/10 bg-[#fffaf3] p-3">
                    {/* Only Google Calendar is displayed here. */}
                    <EventCalendarActions
                      event={event}
                      compact
                    />

                    <div className="mt-3 border-t border-orange-900/10 pt-3">
                      <EventShareButtons
                        event={event}
                        compact
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-orange-900/20 bg-white px-6 py-14 text-center">
              <CalendarDays
                size={34}
                className="mx-auto text-orange-600"
              />

              <h3 className="font-display mt-4 text-xl font-semibold text-[#2a1a10]">
                No matching events found
              </h3>

              <p className="mt-2 text-sm leading-6 text-stone-600">
                Try another keyword, city or date filter to discover
                more gatherings.
              </p>

              <button
                type="button"
                onClick={resetFilters}
                className="btn-saffron mt-5 rounded-2xl px-5 py-3 text-sm font-bold text-white"
              >
                Show All Events
              </button>
            </div>
          )}
        </section>

        {/* Pagination */}
        {filteredEvents.length > EVENT_PAGE_SIZE && (
          <nav
            aria-label="Event listing pagination"
            className="mt-10 flex flex-wrap items-center justify-center gap-2"
          >
            <button
              type="button"
              onClick={() => {
                setPage((current) =>
                  Math.max(1, current - 1),
                );
                window.scrollTo({
                  top: 0,
                  behavior: "smooth",
                });
              }}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 rounded-xl border border-orange-900/15 bg-white px-4 py-2.5 text-sm font-bold text-[#4a2c1a] transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            {Array.from(
              { length: totalPages },
              (_, index) => index + 1,
            ).map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => {
                  setPage(number);
                  window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  });
                }}
                aria-current={
                  safePage === number ? "page" : undefined
                }
                className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-extrabold transition ${
                  safePage === number
                    ? "bg-[#2a1a10] text-amber-300"
                    : "border border-orange-900/15 bg-white text-stone-700 hover:bg-orange-50"
                }`}
              >
                {number}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setPage((current) =>
                  Math.min(totalPages, current + 1),
                );
                window.scrollTo({
                  top: 0,
                  behavior: "smooth",
                });
              }}
              disabled={safePage === totalPages}
              className="inline-flex items-center gap-1 rounded-xl border border-orange-900/15 bg-white px-4 py-2.5 text-sm font-bold text-[#4a2c1a] transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </nav>
        )}

        {/* Visitor guidance */}
        <section className="mt-14 border-t border-orange-900/10 pt-10">
          <SectionHead
            eyebrow="Plan your visit"
            title="Before You Attend"
          />

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: CalendarCheck,
                title: "Verify the schedule",
                text: "Event dates and programme timings may change. Confirm details with the organiser before you travel.",
              },
              {
                icon: MapPin,
                title: "Check the venue",
                text: "Review the venue and route ahead of time, especially for large festivals and pilgrimage gatherings.",
              },
              {
                icon: Ticket,
                title: "Ask about entry",
                text: "Registration, tickets and charges can vary by event. Confirm availability and terms with the organiser.",
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-3xl border border-orange-900/10 bg-white p-6"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-100 text-orange-800">
                    <Icon size={22} />
                  </div>

                  <h3 className="mt-4 font-display text-lg font-semibold text-[#2a1a10]">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {item.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}

/* =========================================================
   EVENT DETAIL PAGE
========================================================= */

export function EventDetail() {
  const { slug } = useParams();
  const event = EVENTS.find((item) => item.slug === slug);

  useSEO({
    title: event
      ? `${event.title} — ${formatDate(event.date)} | DivyaDhara Events`
      : "Event Not Found | DivyaDhara",

    description: event
      ? `${event.title} at ${event.venue}, ${event.city} on ${formatDate(event.date)}. ${event.description.slice(0, 140)}`
      : "The requested event could not be found. Explore spiritual festivals, kathas and satsangs on DivyaDhara.",

    path: `/events/${slug}`,
    image: event?.image,

    schema: event
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: event.title,
          startDate: event.date,
          url: `https://divya-dhara.in/events/${event.slug}`,
          location: {
            "@type": "Place",
            name: event.venue,
            address: {
              "@type": "PostalAddress",
              addressLocality: event.city,
              addressCountry: "IN",
            },
          },
          organizer: {
            "@type": "Organization",
            name: event.organizer,
          },
          image: event.image,
          description: event.description,
        }
      : undefined,
  });

  const related = useMemo(() => {
    if (!event) return [];

    return EVENTS.filter(
      (item) => item.slug !== slug,
    )
      .map((item) => ({
        event: item,
        score:
          (item.category === event.category ? 3 : 0) +
          (item.city.toLowerCase() === event.city.toLowerCase()
            ? 2
            : 0),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.event.title.localeCompare(b.event.title),
      )
      .slice(0, 3)
      .map((item) => item.event);
  }, [slug, event]);

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
          <CalendarDays size={28} />
        </div>

        <h1 className="font-display mt-5 text-3xl font-bold text-[#2a1a10]">
          Event Not Found
        </h1>

        <p className="mt-3 text-stone-600">
          This event may have moved or may no longer be listed.
          Explore other spiritual events on DivyaDhara.
        </p>

        <Link
          to="/events"
          className="btn-saffron mt-6 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white"
        >
          Explore All Events
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const whatsappLink = waLink(
    `Namaste! I want to enquire about registration for ${event.title} on ${formatDate(event.date)} at ${event.venue}, ${event.city}. Please share the registration process, availability and any applicable charges.`,
  );

  const parsedEventDate = new Date(event.date);

  const eventDate = Number.isNaN(parsedEventDate.getTime())
    ? null
    : parsedEventDate;

  const mapQuery = encodeURIComponent(
    `${event.venue}, ${event.city}`,
  );

  const registrationContext =
    `Event registration: ${event.title}; ` +
    `date: ${formatDate(event.date)}; ` +
    `venue: ${event.venue}, ${event.city}`;

  return (
    <>
      {/* EVENT HERO */}
      <section className="relative isolate overflow-hidden bg-char-900 text-white">
        <img
          src={event.image}
          alt={`${event.title} — spiritual event`}
          className="kenburns absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-linear-to-t from-char-900 via-black/60 to-black/30" />

        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-16 md:px-6 md:pb-16 lg:px-8 lg:pt-20">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Events", href: "/events" },
              { label: event.title },
            ]}
          />

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {eventDate && (
              <div className="min-w-20 rounded-2xl bg-white px-4 py-3 text-center shadow-lg">
                <span className="block text-3xl font-extrabold leading-none text-orange-800">
                  {eventDate.getUTCDate()}
                </span>

                <span className="mt-1 block text-[10px] font-bold uppercase text-stone-500">
                  {eventDate.toLocaleString("en-IN", {
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </span>
              </div>
            )}

            <span className="rounded-full bg-orange-600 px-3.5 py-2 text-xs font-bold text-white">
              {event.category}
            </span>

            <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-bold text-white backdrop-blur">
              <Clock size={14} />
              {event.time}
            </span>
          </div>

          <h1 className="font-display mt-5 max-w-4xl text-4xl font-semibold leading-tight md:text-5xl lg:text-6xl">
            {event.title}
          </h1>

          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm leading-6 text-stone-200 md:text-base">
            <MapPin size={17} className="shrink-0 text-amber-400" />
            {event.venue}, {event.city}
          </p>

          <p className="mt-2 text-sm text-white/75">
            Organised by{" "}
            <span className="font-semibold text-amber-200">
              {event.organizer}
            </span>
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#1fb85a]"
            >
              <MessageCircle size={17} />
              Enquire on WhatsApp
              <ExternalLink size={14} />
            </a>

            <a
              href="#register"
              className="btn-saffron inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5"
            >
              <CalendarCheck size={17} />
              Registration Enquiry
            </a>
          </div>

          {/* Only Google Calendar — no ICS button. */}
          <div className="mt-6 max-w-3xl border-t border-white/15 pt-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
              Save this event to your calendar
            </p>

            <EventCalendarActions event={event} />
          </div>

          <div className="mt-6 max-w-2xl border-t border-white/15 pt-5">
            <EventShareButtons event={event} />
          </div>

          <div className="mt-9 grid max-w-3xl gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <CalendarDays size={20} className="text-amber-300" />

              <p className="mt-3 text-sm font-bold">
                Event Date
              </p>

              <p className="mt-1 text-xs leading-5 text-white/70">
                {formatDate(event.date)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <Clock size={20} className="text-amber-300" />

              <p className="mt-3 text-sm font-bold">
                Programme Time
              </p>

              <p className="mt-1 text-xs leading-5 text-white/70">
                {event.time}
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <Ticket size={20} className="text-amber-300" />

              <p className="mt-3 text-sm font-bold">
                Entry Information
              </p>

              <p className="mt-1 text-xs leading-5 text-white/70">
                {event.fee}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* EVENT INFORMATION */}
      <main className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: event.title },
          ]}
        />

        <Reveal className="mt-8">
          <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:gap-12">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
                Discover the Celebration
              </p>

              <h2 className="font-display mt-3 text-3xl font-semibold leading-tight text-[#2a1a10] md:text-4xl">
                About This Event
              </h2>

              <p className="mt-4 text-sm leading-7 text-stone-600">
                Explore the event's purpose, traditions and programme
                information before planning your visit.
              </p>
            </div>

            <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
              <p className="leading-8 text-stone-600">
                {event.description}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "Date",
                    value: formatDate(event.date),
                    icon: CalendarDays,
                  },
                  {
                    label: "Time",
                    value: event.time,
                    icon: Clock,
                  },
                  {
                    label: "Entry",
                    value: event.fee,
                    icon: Ticket,
                  },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-orange-900/10 bg-orange-50/70 p-4"
                    >
                      <Icon
                        size={19}
                        className="text-orange-700"
                      />

                      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500">
                        {item.label}
                      </p>

                      <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Reveal>

        {/* PROGRAMME SCHEDULE */}
        <Reveal className="mt-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
                Event Timetable
              </p>

              <h2 className="font-display mt-2 flex items-center gap-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                <CalendarDays
                  size={23}
                  className="text-orange-600"
                />
                Programme Schedule
              </h2>
            </div>

            <p className="max-w-md text-sm leading-6 text-stone-500">
              Review the listed activities and timings. Confirm
              the latest programme with the organiser before attending.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-orange-900/10 bg-orange-50/70 px-5 py-4">
              <Clock size={18} className="text-orange-700" />

              <p className="text-sm font-bold text-[#2a1a10]">
                Event Activities & Timings
              </p>
            </div>

            <div>
              {event.schedule.map((item, index) => (
                <div
                  key={`${item.t}-${item.item}`}
                  className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 ${
                    index % 2
                      ? "bg-orange-50/40"
                      : "bg-white"
                  } ${
                    index !== event.schedule.length - 1
                      ? "border-b border-orange-900/5"
                      : ""
                  }`}
                >
                  <span className="flex shrink-0 items-center gap-2 text-sm font-extrabold text-orange-800 sm:w-32">
                    <Clock size={14} />
                    {item.t}
                  </span>

                  <span className="text-sm leading-6 text-stone-700">
                    {item.item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ORGANISER AND VENUE */}
        <Reveal className="mt-12">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
              Plan Your Visit
            </p>

            <h2 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
              Organiser & Venue
            </h2>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <Users size={23} />
              </div>

              <h3 className="mt-5 text-lg font-bold text-[#2a1a10]">
                Event Organiser
              </h3>

              <p className="mt-3 text-sm leading-7 text-stone-600">
                {event.organizer}
              </p>

              <p className="mt-3 text-sm leading-6 text-stone-500">
                Contact the organiser to confirm registration,
                programme timings, group arrangements and other
                event-specific details.
              </p>

              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-800 underline decoration-orange-300 underline-offset-4 transition hover:text-orange-600"
              >
                <MessageCircle size={16} />
                Ask About Registration
              </a>
            </div>

            <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <MapPin size={23} />
              </div>

              <h3 className="mt-5 text-lg font-bold text-[#2a1a10]">
                Event Venue
              </h3>

              <p className="mt-3 text-sm leading-7 text-stone-600">
                {event.venue}, {event.city}
              </p>

              <div className="mt-5 overflow-hidden rounded-2xl border border-orange-900/10">
                <iframe
                  title={`Map of ${event.venue}, ${event.city}`}
                  src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                  className="h-56 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-orange-800 underline decoration-orange-300 underline-offset-4 transition hover:text-orange-600"
              >
                <Compass size={16} />
                Open Venue in Google Maps
              </a>
            </div>
          </div>
        </Reveal>

        {/* EVENT GLIMPSES */}
        <Reveal className="mt-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              <Camera size={22} />
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
                Moments of Devotion
              </p>

              <h2 className="font-display mt-1 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                Event Glimpses
              </h2>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                image: event.image,
                title: event.title,
                alt: `${event.title} event`,
              },
              {
                image: "/images/aarti-night.jpeg",
                title: "Evening Aarti",
                alt: "Traditional evening aarti",
              },
              {
                image: "/images/festival-crowd.jpeg",
                title: "Festival Gathering",
                alt: "Devotees gathering at a spiritual festival",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="group relative overflow-hidden rounded-3xl"
              >
                <img
                  src={item.image}
                  alt={item.alt}
                  loading="lazy"
                  className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-64"
                />

                <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />

                <p className="absolute bottom-4 left-4 text-sm font-bold text-white">
                  {item.title}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </main>

      {/* WHATSAPP SUPPORT */}
      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6 lg:px-8">
        <WhatsAppBand
          title="Coming with family or a bhajan mandali?"
          sub="Ask about group registration, senior assistance and visit arrangements before planning your visit."
          message={`Namaste! I would like information about group registration for ${event.title} on ${formatDate(event.date)} at ${event.venue}, ${event.city}. Please guide me.`}
        />
      </div>

      {/* RELATED EVENTS */}
      <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <SectionHead
          eyebrow="More Utsavs"
          title="Other Events"
        />

        {related.length > 0 ? (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {related.map((item, index) => (
              <EventCard
                key={item.slug}
                e={item}
                i={index}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-orange-900/10 bg-white p-6 text-sm text-stone-600">
            More events will be listed here when available.
          </p>
        )}

        <div className="mt-6 flex justify-center">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 rounded-2xl border border-orange-900/15 bg-white px-5 py-3 text-sm font-bold text-orange-900 transition hover:border-orange-700/40 hover:bg-orange-50"
          >
            Explore All Events
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* FULL-WIDTH EVENT REGISTRATION FORM */}
      <section
        id="register"
        className="scroll-mt-24 border-y border-orange-900/10 bg-[#fffaf3] py-12 md:py-16"
      >
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-orange-900/10 bg-white shadow-[0_20px_70px_-35px_rgba(120,53,15,0.25)]">
            <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
              {/* LEFT: EVENT INFORMATION */}
              <div className="relative overflow-hidden bg-[#2a1a10] p-6 text-white md:p-9 lg:p-10">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-amber-300/15" />

                <div className="absolute -right-7 -top-7 h-40 w-40 rounded-full border border-amber-300/10" />

                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-white/5 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
                    <Sparkles size={14} />
                    Join the Celebration
                  </div>

                  <h2 className="font-display mt-6 text-3xl font-semibold leading-tight md:text-4xl">
                    Register Your Interest
                  </h2>

                  <p className="mt-4 text-sm leading-7 text-white/75">
                    Interested in attending {event.title}? Share
                    your enquiry to learn about the registration
                    process, programme availability and visit arrangements.
                  </p>

                  <div className="mt-8 space-y-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <CalendarDays size={19} />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-white">
                          Event Date & Time
                        </p>

                        <p className="mt-1 text-sm leading-6 text-white/65">
                          {formatDate(event.date)} · {event.time}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <MapPin size={19} />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-white">
                          Venue
                        </p>

                        <p className="mt-1 text-sm leading-6 text-white/65">
                          {event.venue}, {event.city}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <Ticket size={19} />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-white">
                          Entry Information
                        </p>

                        <p className="mt-1 text-sm leading-6 text-white/65">
                          {event.fee}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <Users size={19} />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-white">
                          Organised By
                        </p>

                        <p className="mt-1 text-sm leading-6 text-white/65">
                          {event.organizer}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-bold text-amber-200">
                      Prefer WhatsApp?
                    </p>

                    <p className="mt-2 text-sm leading-6 text-white/70">
                      Contact us about the registration process,
                      group attendance and event arrangements.
                    </p>

                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1fb85a] sm:w-auto"
                    >
                      <MessageCircle size={17} />
                      Enquire on WhatsApp
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>

              {/* RIGHT: EXISTING ENQUIRY FORM */}
              <div className="p-5 md:p-8 lg:p-10">
                <div className="mb-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
                    Event Registration Enquiry
                  </p>

                  <h3 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                    Plan Your Event Visit
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    Fill out the enquiry form below to share your
                    interest in this event.
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-900/10 bg-[#fffdf9] p-3 sm:p-5">
                  <EnquiryForm
                    context={registrationContext}
                    title="Register for Event"
                  />
                </div>

                <p className="mt-4 text-xs leading-5 text-stone-500">
                  Submitting an enquiry does not itself confirm
                  registration or a ticket. Please verify availability,
                  applicable fees and registration details with
                  the organiser.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
