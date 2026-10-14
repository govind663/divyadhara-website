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
  Compass,
  Camera,
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
   EVENTS LIST
========================================================= */

export function EventList() {
  useSEO({
    title:
      "Spiritual Events — Shivratri, Katha, Satsang, Rath Yatra | DivyaDhara",
    description:
      "Discover spiritual festivals, Bhagavat Katha, satsangs, yoga festivals, Rath Yatra and cultural programmes across India. Explore event details and registration.",
    path: "/events",
  });

  const [cat, setCat] = useState("");

  const cats = useMemo(
    () => [...new Set(EVENTS.map((e) => e.category))],
    []
  );

  const list = useMemo(
    () => EVENTS.filter((e) => !cat || e.category === cat),
    [cat]
  );

  return (
    <>
      <PageHero
        eyebrow="Utsav · Satsang · Katha"
        title="Spiritual Events"
        sub="Festivals, kathas, satsangs and cultural programmes — discover gatherings that celebrate India's spiritual traditions."
        image="/images/festival-crowd.jpeg"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Events" },
          ]}
        />

        {/* INTRODUCTION */}
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
                Explore event dates, programme schedules, venues and
                registration details. Select a category to find gatherings
                that match your interests.
              </p>
            </div>

            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              <Sparkles size={28} />
            </div>
          </div>
        </Reveal>

        {/* CATEGORY FILTERS */}
        <section className="mt-8" aria-label="Filter events by category">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-700">
                Explore by Interest
              </p>

              <h2 className="font-display mt-1 text-xl font-semibold text-[#2a1a10] md:text-2xl">
                Browse Events
              </h2>
            </div>

            <p className="text-sm text-stone-500">
              {list.length} {list.length === 1 ? "event" : "events"} found
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCat("")}
              aria-pressed={!cat}
              className={`rounded-full px-4 py-2.5 text-[13px] font-bold transition ${
                !cat
                  ? "bg-[#2a1a10] text-amber-200 shadow-sm"
                  : "bg-white text-stone-600 ring-1 ring-orange-900/15 hover:bg-orange-50"
              }`}
            >
              All Events
            </button>

            {cats.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c === cat ? "" : c)}
                aria-pressed={cat === c}
                className={`rounded-full px-4 py-2.5 text-[13px] font-bold transition ${
                  cat === c
                    ? "bg-orange-700 text-white shadow-sm"
                    : "bg-white text-stone-600 ring-1 ring-orange-900/15 hover:bg-orange-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* EVENT CARDS */}
        <section className="mt-8" aria-label="Spiritual events">
          {list.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {list.map((e, i) => (
                <EventCard key={e.slug} e={e} i={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-orange-900/20 bg-white px-6 py-14 text-center">
              <CalendarDays
                size={34}
                className="mx-auto text-orange-600"
              />

              <h3 className="font-display mt-4 text-xl font-semibold text-[#2a1a10]">
                No Events in This Category
              </h3>

              <p className="mt-2 text-sm text-stone-600">
                Try another category to discover more spiritual gatherings.
              </p>

              <button
                type="button"
                onClick={() => setCat("")}
                className="btn-saffron mt-5 rounded-2xl px-5 py-3 text-sm font-bold text-white"
              >
                Show All Events
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

/* =========================================================
   EVENT DETAIL
========================================================= */

export function EventDetail() {
  const { slug } = useParams();

  const e = EVENTS.find((x) => x.slug === slug);

  useSEO({
    title: e
      ? `${e.title} — ${formatDate(e.date)} | DivyaDhara Events`
      : "Event Not Found | DivyaDhara",
    description: e
      ? `${e.title} at ${e.venue}, ${e.city} on ${formatDate(e.date)}. ${e.description.slice(0, 140)}`
      : "The requested event could not be found. Explore spiritual festivals, kathas and satsangs on DivyaDhara.",
    path: `/events/${slug}`,
    image: e?.image,
    schema: e
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: e.title,
          startDate: e.date,
          eventStatus: "https://schema.org/EventScheduled",
          location: {
            "@type": "Place",
            name: e.venue,
            address: e.city,
          },
          organizer: {
            "@type": "Organization",
            name: e.organizer,
          },
          image: e.image,
          description: e.description,
        }
      : undefined,
  });

  const related = useMemo(
    () => EVENTS.filter((x) => x.slug !== slug).slice(0, 3),
    [slug]
  );

  if (!e) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
          <CalendarDays size={28} />
        </div>

        <h1 className="font-display mt-5 text-3xl font-bold text-[#2a1a10]">
          Event Not Found
        </h1>

        <p className="mt-3 text-stone-600">
          This event may have moved or may no longer be listed. Explore other
          spiritual events on DivyaDhara.
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

  const wa = waLink(
    `Namaste! I want to enquire about registration for ${e.title} on ${formatDate(e.date)} at ${e.venue}, ${e.city}. Please share the registration process, availability and any applicable charges.`
  );

  const d = new Date(e.date);

  const eventDate = Number.isNaN(d.getTime())
    ? null
    : d;

  const mapQuery = encodeURIComponent(`${e.venue}, ${e.city}`);

  const registrationContext =
    `Event registration: ${e.title}; ` +
    `date: ${formatDate(e.date)}; ` +
    `venue: ${e.venue}, ${e.city}`;

  return (
    <>
      {/* EVENT HERO */}
      <section className="relative isolate overflow-hidden bg-char-900 text-white">
        <img
          src={e.image}
          alt={`${e.title} — spiritual event`}
          className="kenburns absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-linear-to-t from-char-900 via-black/60 to-black/30" />

        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-16 md:px-6 md:pb-16 lg:px-8 lg:pt-20">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Events", href: "/events" },
              { label: e.title },
            ]}
          />

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {eventDate && (
              <div className="min-w-20 rounded-2xl bg-white px-4 py-3 text-center shadow-lg">
                <span className="block text-3xl font-extrabold leading-none text-orange-800">
                  {eventDate.getDate()}
                </span>

                <span className="mt-1 block text-[10px] font-bold uppercase text-stone-500">
                  {eventDate.toLocaleString("en-IN", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}

            <span className="rounded-full bg-orange-600 px-3.5 py-2 text-xs font-bold text-white">
              {e.category}
            </span>

            <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-bold text-white backdrop-blur">
              <Clock size={14} />
              {e.time}
            </span>
          </div>

          <h1 className="font-display mt-5 max-w-4xl text-4xl font-semibold leading-tight md:text-5xl lg:text-6xl">
            {e.title}
          </h1>

          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm leading-6 text-stone-200 md:text-base">
            <MapPin size={17} className="shrink-0 text-amber-400" />
            {e.venue}, {e.city}
          </p>

          <p className="mt-2 text-sm text-white/75">
            Organised by{" "}
            <span className="font-semibold text-amber-200">
              {e.organizer}
            </span>
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#1fb85a]"
            >
              <MessageCircle size={17} />
              Enquire on WhatsApp
            </a>

            <a
              href="#register"
              className="btn-saffron inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5"
            >
              <CalendarCheck size={17} />
              Registration Enquiry
            </a>
          </div>

          <div className="mt-9 grid max-w-3xl gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <CalendarDays size={20} className="text-amber-300" />

              <p className="mt-3 text-sm font-bold">Event Date</p>

              <p className="mt-1 text-xs leading-5 text-white/70">
                {formatDate(e.date)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <Clock size={20} className="text-amber-300" />

              <p className="mt-3 text-sm font-bold">Programme Time</p>

              <p className="mt-1 text-xs leading-5 text-white/70">
                {e.time}
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <Ticket size={20} className="text-amber-300" />

              <p className="mt-3 text-sm font-bold">Entry Information</p>

              <p className="mt-1 text-xs leading-5 text-white/70">
                {e.fee}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN EVENT CONTENT — FULL WIDTH, NO FORM SIDEBAR */}
      <main className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: e.title },
          ]}
        />

        {/* ABOUT THE EVENT */}
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
              <p className="leading-8 text-stone-600">{e.description}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-orange-900/10 bg-orange-50/70 p-4">
                  <CalendarDays size={19} className="text-orange-700" />

                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500">
                    Date
                  </p>

                  <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                    {formatDate(e.date)}
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-900/10 bg-orange-50/70 p-4">
                  <Clock size={19} className="text-orange-700" />

                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500">
                    Time
                  </p>

                  <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                    {e.time}
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-900/10 bg-orange-50/70 p-4">
                  <Ticket size={19} className="text-orange-700" />

                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500">
                    Entry
                  </p>

                  <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                    {e.fee}
                  </p>
                </div>
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
                <CalendarDays size={23} className="text-orange-600" />
                Programme Schedule
              </h2>
            </div>

            <p className="max-w-md text-sm leading-6 text-stone-500">
              Review the listed activities and timings. Confirm the latest
              programme with the organiser before attending.
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
              {e.schedule.map((s, i) => (
                <div
                  key={`${s.t}-${s.item}`}
                  className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 ${
                    i % 2 ? "bg-orange-50/40" : "bg-white"
                  } ${
                    i !== e.schedule.length - 1
                      ? "border-b border-orange-900/5"
                      : ""
                  }`}
                >
                  <span className="flex shrink-0 items-center gap-2 text-sm font-extrabold text-orange-800 sm:w-32">
                    <Clock size={14} />
                    {s.t}
                  </span>

                  <span className="text-sm leading-6 text-stone-700">
                    {s.item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ORGANIZER & VENUE */}
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
                {e.organizer}
              </p>

              <p className="mt-3 text-sm leading-6 text-stone-500">
                Contact the organiser to confirm registration, programme
                timings, group arrangements and other event-specific details.
              </p>

              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
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
                {e.venue}, {e.city}
              </p>

              <div className="mt-5 overflow-hidden rounded-2xl border border-orange-900/10">
                <iframe
                  title={`Map of ${e.venue}, ${e.city}`}
                  src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                  className="h-56 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-orange-800 underline decoration-orange-300 underline-offset-4 transition hover:text-orange-600"
              >
                <Compass size={16} />
                Open Venue in Google Maps
              </a>
            </div>
          </div>
        </Reveal>

        {/* GLIMPSES */}
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
            <div className="group relative overflow-hidden rounded-3xl">
              <img
                src={e.image}
                alt={`${e.title} event`}
                loading="lazy"
                className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-64"
              />

              <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />

              <p className="absolute bottom-4 left-4 text-sm font-bold text-white">
                {e.title}
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-3xl">
              <img
                src="/images/aarti-night.jpeg"
                alt="Traditional evening aarti"
                loading="lazy"
                className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-64"
              />

              <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />

              <p className="absolute bottom-4 left-4 text-sm font-bold text-white">
                Evening Aarti
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-3xl">
              <img
                src="/images/festival-crowd.jpeg"
                alt="Devotees gathering at a spiritual festival"
                loading="lazy"
                className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-64"
              />

              <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />

              <p className="absolute bottom-4 left-4 text-sm font-bold text-white">
                Festival Gathering
              </p>
            </div>
          </div>
        </Reveal>
      </main>

      {/* WHATSAPP SUPPORT BAND */}
      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6 lg:px-8">
        <WhatsAppBand
          title="Coming with family or a bhajan mandali?"
          sub="Ask about group registration, senior assistance and yajman opportunities before planning your visit."
          message={`Namaste! I would like information about group registration for ${e.title} on ${formatDate(e.date)} at ${e.venue}, ${e.city}. Please guide me.`}
        />
      </div>

      {/* RELATED EVENTS */}
      <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <SectionHead
          eyebrow="More Utsavs"
          title="Other Events"
        />

        {related.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {related.map((x, i) => (
              <EventCard key={x.slug} e={x} i={i} />
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

      {/* FULL-WIDTH EVENT REGISTRATION FORM — AFTER OTHER EVENTS */}
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
                    Interested in attending {e.title}? Share your enquiry to
                    learn about the registration process, programme
                    availability and visit arrangements.
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
                          {formatDate(e.date)} · {e.time}
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
                          {e.venue}, {e.city}
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
                          {e.fee}
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
                          {e.organizer}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-bold text-amber-200">
                      Prefer WhatsApp?
                    </p>

                    <p className="mt-2 text-sm leading-6 text-white/70">
                      Contact us about the registration process, group
                      attendance and event arrangements.
                    </p>

                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1fb85a] sm:w-auto"
                    >
                      <MessageCircle size={17} />
                      Enquire on WhatsApp
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
                    Fill out the enquiry form below to share your interest in
                    this event.
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-900/10 bg-[#fffdf9] p-3 sm:p-5">
                  <EnquiryForm
                    context={registrationContext}
                    title="Register for Event"
                  />
                </div>

                <p className="mt-4 text-xs leading-5 text-stone-500">
                  Submitting an enquiry does not itself confirm a registration
                  or ticket. Please verify availability, applicable fees and
                  registration details with the organiser.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}