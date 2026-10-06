/* eslint-disable @typescript-eslint/no-unused-vars */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MapPin,
  Clock,
  ArrowRight,
  Heart,
  MessageCircle,
  CalendarDays,
  BookOpen,
  Users,
  ExternalLink,
} from "lucide-react";
import { Stars } from "./ui";
import { waLink, inr, cx } from "../lib/utils";
import { useApp } from "../context/AppContext";
import type {
  Temple,
  Pandit,
  Service,
  YatraPackage,
  DhamEvent,
  Course,
  Place,
  Ashram,
} from "../data/content";

/*
|--------------------------------------------------------------------------
| Business rules used by these cards
|--------------------------------------------------------------------------
|
| 1. Cards are catalogue/navigation components. They do not create fake
|    local bookings, payments or CRM records.
| 2. Actual enquiry/booking submission belongs to the relevant detail page
|    and the backend lead/booking APIs.
| 3. WhatsApp is retained as a fast alternate channel and always uses
|    waLink() from utils.ts so there is a single configured business number.
| 4. Interactive controls are never nested inside an anchor. This avoids
|    invalid HTML and makes Save / WhatsApp controls accessible.
| 5. Public cards only show the information already supplied by the content
|    model; they do not invent availability, verification or pricing state.
|--------------------------------------------------------------------------
*/

const cardMotion = {
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
};

const actionButton =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2";

const softButton = cx(
  actionButton,
  "border border-orange-700/25 bg-orange-50 text-orange-900 hover:bg-orange-100",
);

const whatsappButton = cx(
  actionButton,
  "bg-[#25D366] text-white hover:brightness-105",
);

const saffronButton = cx(
  actionButton,
  "bg-orange-700 text-white hover:bg-orange-800",
);

function openExternal(url: string): {
  target: "_blank";
  rel: "noreferrer";
} {
  return {
    target: "_blank",
    rel: "noreferrer",
  };
}

function formatEventDate(value: string | Date): {
  day: string;
  monthYear: string;
} {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      day: "—",
      monthYear: "",
    };
  }

  return {
    day: String(date.getDate()),
    monthYear: date.toLocaleString("en-IN", {
      month: "short",
      year: "2-digit",
    }),
  };
}

export function SaveBtn({
  kind,
  slug,
}: {
  kind: "temple" | "place";
  slug: string;
}) {
  const { savedTemples, savedPlaces, toggleSave } = useApp();

  const saved =
    kind === "temple"
      ? savedTemples.includes(slug)
      : savedPlaces.includes(slug);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSave(kind, slug);
      }}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      aria-pressed={saved}
      className={cx(
        "grid h-9 w-9 place-items-center rounded-full backdrop-blur transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black/20",
        saved
          ? "bg-red-600 text-white"
          : "bg-black/35 text-white hover:bg-black/55",
      )}
    >
      <Heart
        size={15}
        fill={saved ? "currentColor" : "none"}
      />
    </button>
  );
}

export function TempleCard({
  t,
  i = 0,
}: {
  t: Temple;
  i?: number;
}) {
  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want information/help for ${t.name}, ${t.city}, ${t.state}.

Please share darshan timings, aarti details, puja options and any current guidance available.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 4) * 0.08,
      }}
      className="img-zoom group overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border"
    >
      <div className="relative h-56 overflow-hidden">
        <Link
          to={`/temples/${t.slug}`}
          className="block h-full"
          aria-label={`View ${t.name} temple details`}
        >
          <img
            src={t.image}
            alt={`${t.name}, ${t.city}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Stars value={t.rating} />
            <span className="rounded-full bg-amber-100/95 px-2.5 py-1 text-[11px] font-bold text-orange-900">
              {t.category[0]}
            </span>
          </div>

          <div className="absolute bottom-3 left-4 right-4">
            <p className="font-sanskrit text-[13px] text-amber-200">
              {t.sanskrit}
            </p>

            <h3 className="font-display text-xl font-semibold leading-tight text-white">
              {t.name}
            </h3>
          </div>
        </Link>

        <div className="absolute right-3 top-3">
          <SaveBtn
            kind="temple"
            slug={t.slug}
          />
        </div>
      </div>

      <div className="p-5">
        <Link
          to={`/temples/${t.slug}`}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-orange-800">
            <MapPin size={14} />
            {t.city}, {t.state}
          </p>

          <p className="clamp-2 mt-2 text-sm leading-relaxed text-stone-600">
            {t.summary}
          </p>

          <p className="mt-3 flex items-center gap-1 text-sm font-bold text-orange-700">
            View darshan, aarti & timings
            <ArrowRight
              size={15}
              className="transition group-hover:translate-x-1"
            />
          </p>
        </Link>

        <div className="mt-4 flex gap-2">
          <Link
            to={`/temples/${t.slug}`}
            className={cx(
              softButton,
              "flex-1",
            )}
          >
            Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal(whatsappHref)}
            className={cx(
              whatsappButton,
              "flex-1",
            )}
          >
            <MessageCircle size={14} />
            Ask
          </a>
        </div>
      </div>
    </motion.article>
  );
}

export function ServiceCard({
  s,
  i = 0,
}: {
  s: Service;
  i?: number;
}) {
  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want to enquire about: ${s.name}
Category: ${s.category}
Price shown: ${s.price}
Duration: ${s.duration}

Please share availability, muhurat, samagri list and booking process.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 4) * 0.08,
      }}
      className="img-zoom group flex flex-col overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border"
    >
      <Link
        to={`/services/${s.slug}`}
        className="block"
        aria-label={`View ${s.name} details`}
      >
        <div className="relative h-48 overflow-hidden">
          <img
            src={s.image}
            alt={s.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />

          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-orange-900">
            {s.category}
          </span>

          <span className="absolute bottom-3 left-3 rounded-full bg-emerald-950/85 px-2.5 py-1 text-[11px] font-bold text-amber-300">
            {s.price}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link
          to={`/services/${s.slug}`}
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <h3 className="font-display text-lg font-semibold leading-snug text-[#2a1a10] transition group-hover:text-orange-800">
            {s.name}
          </h3>
        </Link>

        <p className="clamp-2 mt-1.5 text-sm text-stone-600">
          {s.tagline}
        </p>

        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
          <Clock
            size={13}
            className="text-orange-600"
          />
          {s.duration}
        </p>

        <div className="mt-4 flex gap-2">
          <Link
            to={`/services/${s.slug}`}
            className={cx(
              softButton,
              "flex-1",
            )}
          >
            Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal(whatsappHref)}
            className={cx(
              whatsappButton,
              "flex-1",
            )}
          >
            <MessageCircle size={14} />
            Enquire
          </a>
        </div>
      </div>
    </motion.article>
  );
}

export function PanditCard({
  p,
  i = 0,
}: {
  p: Pandit;
  i?: number;
}) {
  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want to enquire about Pandit ${p.name}.
Specializations: ${p.specializations.slice(0, 3).join(", ")}
Location: ${p.location}

Please share availability, booking process, dakshina/fees and suitable dates.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 3) * 0.08,
      }}
      className="group overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border"
    >
      <Link
        to={`/pandits/${p.slug}`}
        className="block"
        aria-label={`View ${p.name} profile`}
      >
        <div className="relative flex items-center gap-4 bg-linear-to-br from-orange-50 via-amber-50 to-white p-5">
          <img
            src={p.photo}
            alt={`Portrait of ${p.name}`}
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded-2xl border-2 border-amber-300 object-cover shadow-md"
          />

          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold leading-tight text-[#2a1a10]">
              {p.name}
            </h3>

            <p className="text-xs font-semibold text-orange-700">
              {p.title}
            </p>

            <p className="mt-1 text-xs text-stone-500">
              {p.experience} yrs · {p.location}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="flex flex-wrap gap-1.5">
            {p.specializations
              .slice(0, 3)
              .map((specialization) => (
                <span
                  key={specialization}
                  className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-900 ring-1 ring-orange-200"
                >
                  {specialization}
                </span>
              ))}
          </div>

          <p className="mt-2 text-xs text-stone-500">
            🗣 {p.languages.join(" · ")}
          </p>

          <p className="mt-3 flex items-center gap-1 text-sm font-bold text-orange-700">
            View profile & booking
            <ArrowRight
              size={15}
              className="transition group-hover:translate-x-1"
            />
          </p>
        </div>
      </Link>

      <div className="px-5 pb-5">
        <a
          href={whatsappHref}
          {...openExternal(whatsappHref)}
          className={cx(
            whatsappButton,
            "w-full",
          )}
        >
          <MessageCircle size={14} />
          Check Availability on WhatsApp
        </a>
      </div>
    </motion.article>
  );
}

export function PackageCard({
  p,
  i = 0,
}: {
  p: YatraPackage;
  i?: number;
}) {
  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want to enquire about the Yatra: ${p.name}
Destination: ${p.destination}
Duration: ${p.duration}
Starting price shown: ${inr(p.price)} per person

Please share dates, itinerary, inclusions, availability and booking terms.`,
  );

  const savings =
    p.oldPrice && p.oldPrice > p.price
      ? p.oldPrice - p.price
      : null;

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 3) * 0.08,
      }}
      className="img-zoom group overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border"
    >
      <div className="relative h-56 overflow-hidden">
        <Link
          to={`/packages/${p.slug}`}
          className="block h-full"
          aria-label={`View ${p.name} Yatra`}
        >
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white">
              {p.duration}
            </span>
            <Stars value={p.rating} />
          </div>

          {savings !== null && (
            <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold text-[#3a2415]">
              Save {inr(savings)}
            </span>
          )}

          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="font-display text-xl font-semibold leading-tight text-white">
              {p.name}
            </h3>

            <p className="text-[13px] text-amber-200">
              {p.destination}
            </p>
          </div>
        </Link>
      </div>

      <div className="p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-stone-500">
              Starting price
            </p>

            <p className="text-xl font-extrabold text-orange-800">
              {inr(p.price)}
              <span className="text-xs font-medium text-stone-500">
                {" "}
                / person
              </span>
            </p>
          </div>

          <Link
            to={`/packages/${p.slug}`}
            className={cx(
              saffronButton,
              "shrink-0",
            )}
          >
            View Yatra
            <ArrowRight size={14} />
          </Link>
        </div>

        <a
          href={whatsappHref}
          {...openExternal(whatsappHref)}
          className={cx(
            whatsappButton,
            "mt-3 w-full",
          )}
        >
          <MessageCircle size={14} />
          Ask Dates & Availability
        </a>
      </div>
    </motion.article>
  );
}

export function EventCard({
  e,
  i = 0,
}: {
  e: DhamEvent;
  i?: number;
}) {
  const { day, monthYear } =
    formatEventDate(e.date);

  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want details for the event: ${e.title}
Venue: ${e.venue}, ${e.city}
Date: ${new Date(e.date).toLocaleDateString("en-IN")}

Please share registration details, timings and availability.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 3) * 0.08,
      }}
      className="img-zoom group overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border"
    >
      <Link
        to={`/events/${e.slug}`}
        className="block"
        aria-label={`View ${e.title}`}
      >
        <div className="relative h-48 overflow-hidden">
          <img
            src={e.image}
            alt={e.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/65 to-transparent" />

          <div className="absolute left-3 top-3 rounded-2xl bg-white/95 px-3 py-1.5 text-center shadow">
            <p className="text-lg font-extrabold leading-none text-orange-800">
              {day}
            </p>

            <p className="text-[10px] font-bold uppercase text-stone-500">
              {monthYear}
            </p>
          </div>

          <span className="absolute bottom-3 left-3 rounded-full bg-orange-600/95 px-2.5 py-1 text-[11px] font-bold text-white">
            {e.category}
          </span>
        </div>
      </Link>

      <div className="p-5">
        <Link
          to={`/events/${e.slug}`}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <h3 className="font-display clamp-2 text-lg font-semibold leading-snug text-[#2a1a10]">
            {e.title}
          </h3>

          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-stone-500">
            <MapPin
              size={13}
              className="text-orange-600"
            />
            {e.venue}, {e.city}
          </p>

          <p className="mt-3 text-sm font-bold text-orange-700">
            Programme & registration{" "}
            <ArrowRight
              size={14}
              className="inline"
            />
          </p>
        </Link>

        <div className="mt-4 flex gap-2">
          <Link
            to={`/events/${e.slug}`}
            className={cx(
              softButton,
              "flex-1",
            )}
          >
            <CalendarDays size={14} />
            Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal(whatsappHref)}
            className={cx(
              whatsappButton,
              "flex-1",
            )}
          >
            <MessageCircle size={14} />
            Enquire
          </a>
        </div>
      </div>
    </motion.article>
  );
}

export function CourseCard({
  c,
  i = 0,
}: {
  c: Course;
  i?: number;
}) {
  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want details/enrolment information for the course: ${c.title}
Category: ${c.category}
Level: ${c.level}
Instructor: ${c.instructor}
Duration: ${c.duration}
Fee shown: ${c.fee}

Please share next batch date, syllabus, live/recorded format and enrolment process.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 3) * 0.08,
      }}
      className="img-zoom group overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border"
    >
      <Link
        to={`/courses/${c.slug}`}
        className="block"
        aria-label={`View ${c.title} course`}
      >
        <div className="relative h-48 overflow-hidden">
          <img
            src={c.image}
            alt={c.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />

          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-orange-900">
            {c.category} · {c.level}
          </span>

          <span className="absolute bottom-3 left-3 rounded-full bg-emerald-950/85 px-2.5 py-1 text-[11px] font-bold text-amber-300">
            {c.fee}
          </span>
        </div>
      </Link>

      <div className="p-5">
        <Link
          to={`/courses/${c.slug}`}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <h3 className="font-display clamp-2 text-lg font-semibold leading-snug text-[#2a1a10]">
            {c.title}
          </h3>

          <p className="mt-1 text-[13px] text-stone-500">
            By {c.instructor} · {c.duration}
          </p>
        </Link>

        <div className="mt-4 flex gap-2">
          <Link
            to={`/courses/${c.slug}`}
            className={cx(
              softButton,
              "flex-1",
            )}
          >
            <BookOpen size={14} />
            View Course
          </Link>

          <a
            href={whatsappHref}
            {...openExternal(whatsappHref)}
            className={cx(
              whatsappButton,
              "flex-1",
            )}
          >
            <MessageCircle size={14} />
            Enquire
          </a>
        </div>
      </div>
    </motion.article>
  );
}

export function PlaceCard({
  p,
  i = 0,
}: {
  p: Place;
  i?: number;
}) {
  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 4) * 0.08,
      }}
      className="img-zoom group relative overflow-hidden rounded-3xl sacred-border"
    >
      <div className="relative h-72 overflow-hidden">
        <Link
          to={`/spiritual-places/${p.slug}`}
          className="block h-full"
          aria-label={`View ${p.name}`}
        >
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-5">
            <span className="rounded-full bg-amber-400/95 px-2.5 py-1 text-[11px] font-extrabold text-[#3a2415]">
              {p.type}
            </span>

            <h3 className="font-display mt-2 text-2xl font-semibold text-white">
              {p.name}
            </h3>

            <p className="flex items-center gap-1 text-[13px] font-semibold text-amber-200">
              <MapPin size={13} />
              {p.state} · Best: {p.bestTime}
            </p>
          </div>
        </Link>

        <div className="absolute right-3 top-3">
          <SaveBtn
            kind="place"
            slug={p.slug}
          />
        </div>
      </div>

      <div className="absolute bottom-4 right-4">
        <Link
          to={`/spiritual-places/${p.slug}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-[12px] font-bold text-orange-900 shadow-lg backdrop-blur transition hover:bg-white"
        >
          Explore
          <ArrowRight size={13} />
        </Link>
      </div>
    </motion.article>
  );
}

export function AshramCard({
  a,
  i = 0,
}: {
  a: Ashram;
  i?: number;
}) {
  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want to enquire about Ashram: ${a.name}
Location: ${a.place}, ${a.state}
Guru: ${a.guru}

Please share stay/seva availability, programme details, timings, pricing and booking process.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 2) * 0.08,
      }}
      className="img-zoom group overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border md:grid md:grid-cols-2"
    >
      <div className="relative h-56 overflow-hidden md:h-full md:min-h-65">
        <Link
          to={`/ashrams/${a.slug}`}
          className="block h-full"
          aria-label={`View ${a.name} Ashram`}
        >
          <img
            src={a.image}
            alt={a.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent md:bg-linear-to-r" />
        </Link>
      </div>

      <div className="flex flex-col p-6 md:p-8">
        <Link
          to={`/ashrams/${a.slug}`}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-700">
            {a.place}, {a.state}
          </p>

          <h3 className="font-display mt-1 text-2xl font-semibold text-[#2a1a10]">
            {a.name}
          </h3>

          <p className="mt-1 text-sm font-semibold text-orange-800">
            Guided by {a.guru}
          </p>

          <p className="clamp-3 mt-3 text-sm leading-relaxed text-stone-600">
            {a.summary}
          </p>

          <p className="mt-4 flex items-center gap-1 text-sm font-bold text-orange-700">
            Daily schedule, stay & seva
            <ArrowRight
              size={15}
              className="transition group-hover:translate-x-1"
            />
          </p>
        </Link>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link
            to={`/ashrams/${a.slug}`}
            className={cx(
              saffronButton,
              "w-full",
            )}
          >
            <Users size={14} />
            View Ashram
          </Link>

          <a
            href={whatsappHref}
            {...openExternal(whatsappHref)}
            className={cx(
              whatsappButton,
              "w-full",
            )}
          >
            <MessageCircle size={14} />
            Enquire
          </a>
        </div>
      </div>
    </motion.article>
  );
}
