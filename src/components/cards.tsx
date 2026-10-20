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
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-center text-xs font-bold leading-tight transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 sm:text-sm";

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

function openExternal(): {
  target: "_blank";
  rel: "noopener noreferrer";
} {
  return {
    target: "_blank",
    rel: "noopener noreferrer",
  };
}

function formatEventDate(value: string | Date): {
  day: string;
  monthYear: string;
  isoDate?: string;
  longDate: string;
} {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      day: "—",
      monthYear: "",
      longDate: "Please confirm the event date",
    };
  }

  return {
    day: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(date),
    monthYear: new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(date),
    isoDate: new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(date),
    longDate: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(date),
  };
}

export function SaveBtn({
  kind,
  slug,
  name,
}: {
  kind: "temple" | "place";
  slug: string;
  name?: string;
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
      aria-label={
        saved
          ? `Remove ${name || (kind === "temple" ? "temple" : "place")} from saved items`
          : `Save ${name || (kind === "temple" ? "temple" : "place")} for later`
      }
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
        aria-hidden="true"
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
      className="img-zoom group h-full overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border transition-shadow duration-200 hover:shadow-lg hover:shadow-orange-950/5"
    >
      <div className="relative h-56 overflow-hidden">
        <Link
          to={`/temples/${t.slug}`}
          className="block h-full"
          aria-label={`View ${t.name} temple details`}
        >
          <img
            src={t.image}
            alt={`${t.name} temple in ${t.city}, ${t.state}`}
            loading="lazy"
            decoding="async"
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
            name={t.name}
          />
        </div>
      </div>

      <div className="p-5">
        <Link
          to={`/temples/${t.slug}`}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-orange-800">
            <MapPin size={14} aria-hidden="true" />
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
              aria-hidden="true"
            />
          </p>
        </Link>

        <div className="mt-4 grid grid-cols-2 items-stretch gap-2">
          <Link
            to={`/temples/${t.slug}`}
            aria-label={`View ${t.name} temple details and darshan information`}
            className={cx(
              softButton,
              "min-h-12 w-full",
            )}
          >
            View Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal()}
            aria-label={`Ask about ${t.name} on WhatsApp`}
            className={cx(
              whatsappButton,
              "min-h-12 w-full",
            )}
          >
            <MessageCircle size={14} aria-hidden="true" />
            Ask on WhatsApp
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
      className="img-zoom group flex h-full flex-col overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border transition-shadow duration-200 hover:shadow-lg hover:shadow-orange-950/5"
    >
      <Link
        to={`/services/${s.slug}`}
        className="block"
        aria-label={`View ${s.name} details`}
      >
        <div className="relative h-48 overflow-hidden">
          <img
            src={s.image}
            alt={`${s.name} spiritual service`}
            loading="lazy"
            decoding="async"
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
            aria-hidden="true"
          />
          {s.duration}
        </p>

        <div className="mt-4 grid grid-cols-2 items-stretch gap-2">
          <Link
            to={`/services/${s.slug}`}
            aria-label={`View ${s.name} service details`}
            className={cx(
              softButton,
              "min-h-12 w-full",
            )}
          >
            View Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal()}
            aria-label={`Enquire about ${s.name} on WhatsApp`}
            className={cx(
              whatsappButton,
              "min-h-12 w-full",
            )}
          >
            <MessageCircle size={14} aria-hidden="true" />
            Enquire on WhatsApp
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
  // Read the optional service-area extension without assuming that every
  // legacy content record has already migrated to the shared Pandit type.
  // Do not treat a Pandit's base location as confirmed service coverage.
  const serviceAreaRecord = p as Pandit & {
    serviceAreas?: Array<{ name: string }>;
  };
  const serviceAreaNames = (serviceAreaRecord.serviceAreas ?? [])
    .map((area) => area.name.trim())
    .filter(Boolean);
  const serviceAreaText = serviceAreaNames.length
    ? serviceAreaNames.join(", ")
    : "Please enquire to confirm coverage";

  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want to enquire about Pandit ${p.name}.
Specializations: ${p.specializations.slice(0, 3).join(", ")}
Service Area: ${serviceAreaNames.length ? serviceAreaText : "To be confirmed"}

Please share confirmed service coverage, availability, booking process, dakshina/fees and suitable dates.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.45,
        delay: (i % 3) * 0.06,
      }}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border transition-shadow duration-200 hover:shadow-lg hover:shadow-orange-950/5"
    >
      <Link
        to={`/pandits/${p.slug}`}
        className="flex items-center gap-4 bg-linear-to-br from-orange-50 via-amber-50 to-white p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
        aria-label={`View ${p.name}'s Pandit profile, specializations and booking information`}
      >
        <img
          src={p.photo}
          alt={`Portrait of Pandit ${p.name}`}
          loading="lazy"
          decoding="async"
          className="h-20 w-20 shrink-0 rounded-2xl border-2 border-amber-300 object-cover shadow-sm"
        />

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold leading-tight text-[#2a1a10] transition-colors group-hover:text-orange-800">
            {p.name}
          </h3>

          <p className="mt-1 text-xs font-semibold text-orange-800">
            {p.title}
          </p>

          <p className="mt-2 flex items-start gap-1 text-xs leading-relaxed text-stone-600">
            <MapPin size={13} className="mt-0.5 shrink-0 text-orange-700" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-semibold text-stone-700">Service Area:</span>{" "}
              {serviceAreaText}
            </span>
          </p>

          <p className="mt-1 text-xs text-stone-500">
            {p.experience} years of experience
          </p>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5 pt-4">
        {p.specializations.length > 0 && (
          <div aria-label="Specializations" className="flex flex-wrap gap-1.5">
            {p.specializations.slice(0, 3).map((specialization) => (
              <span
                key={specialization}
                className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold leading-snug text-orange-900 ring-1 ring-orange-200"
              >
                {specialization}
              </span>
            ))}
          </div>
        )}

        {p.languages.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-stone-600">
            <span className="font-semibold text-stone-700">Languages:</span>{" "}
            {p.languages.join(" · ")}
          </p>
        )}

        <div className="mt-auto grid grid-cols-2 items-stretch gap-2 pt-5">
          <Link
            to={`/pandits/${p.slug}`}
            aria-label={`View ${p.name}'s profile and booking details`}
            className={cx(
              saffronButton,
              "min-h-[68px] w-full px-2 text-[11px] leading-snug sm:text-xs",
            )}
          >
            <span>View Profile &amp; Booking</span>
            <ArrowRight size={14} className="shrink-0" aria-hidden="true" />
          </Link>

          <a
            href={whatsappHref}
            {...openExternal()}
            aria-label={`Ask about ${p.name}'s availability on WhatsApp`}
            className={cx(
              whatsappButton,
              "min-h-[68px] w-full px-2 text-[11px] leading-snug sm:text-xs",
            )}
          >
            <MessageCircle size={14} className="shrink-0" aria-hidden="true" />
            <span>Check Availability on WhatsApp</span>
          </a>
        </div>
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
      className="img-zoom group h-full overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border transition-shadow duration-200 hover:shadow-lg hover:shadow-orange-950/5"
    >
      <div className="relative h-56 overflow-hidden">
        <Link
          to={`/packages/${p.slug}`}
          className="block h-full"
          aria-label={`View ${p.name} Yatra`}
        >
          <img
            src={p.image}
            alt={`${p.name} pilgrimage in ${p.destination}`}
            loading="lazy"
            decoding="async"
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
            aria-label={`View ${p.name} pilgrimage package details`}
            className={cx(
              saffronButton,
              "shrink-0",
            )}
          >
            View Yatra
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <a
          href={whatsappHref}
          {...openExternal()}
          aria-label={`Ask about ${p.name} dates and availability on WhatsApp`}
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
  const { day, monthYear, isoDate, longDate } =
    formatEventDate(e.date);

  const whatsappHref = waLink(
    `Namaste DivyaDhara! 🙏

I want details for the event: ${e.title}
Venue: ${e.venue}, ${e.city}
Date: ${longDate}

Please share registration details, timings and availability.`,
  );

  return (
    <motion.article
      {...cardMotion}
      transition={{
        duration: 0.55,
        delay: (i % 3) * 0.08,
      }}
      className="img-zoom group h-full overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border transition-shadow duration-200 hover:shadow-lg hover:shadow-orange-950/5"
    >
      <Link
        to={`/events/${e.slug}`}
        className="block"
        aria-label={`View ${e.title}`}
      >
        <div className="relative h-48 overflow-hidden">
          <img
            src={e.image}
            alt={`${e.title} spiritual event in ${e.city}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-black/65 to-transparent" />

          <time
            dateTime={isoDate}
            aria-label={longDate}
            className="absolute left-3 top-3 rounded-2xl bg-white/95 px-3 py-1.5 text-center shadow"
          >
            <span className="block text-lg font-extrabold leading-none text-orange-800">
              {day}
            </span>

            <span className="mt-0.5 block text-[10px] font-bold uppercase text-stone-500">
              {monthYear}
            </span>
          </time>

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
              aria-hidden="true"
            />
          </p>
        </Link>

        <div className="mt-4 grid grid-cols-2 items-stretch gap-2">
          <Link
            to={`/events/${e.slug}`}
            aria-label={`View ${e.title} event details and date`}
            className={cx(
              softButton,
              "min-h-12 w-full",
            )}
          >
            <CalendarDays size={14} aria-hidden="true" />
            View Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal()}
            aria-label={`Ask about ${e.title} registration on WhatsApp`}
            className={cx(
              whatsappButton,
              "min-h-12 w-full",
            )}
          >
            <MessageCircle size={14} aria-hidden="true" />
            Enquire on WhatsApp
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
      className="img-zoom group h-full overflow-hidden rounded-3xl border border-orange-900/10 bg-white sacred-border transition-shadow duration-200 hover:shadow-lg hover:shadow-orange-950/5"
    >
      <Link
        to={`/courses/${c.slug}`}
        className="block"
        aria-label={`View ${c.title} course`}
      >
        <div className="relative h-48 overflow-hidden">
          <img
            src={c.image}
            alt={`${c.title} course by ${c.instructor}`}
            loading="lazy"
            decoding="async"
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

        <div className="mt-4 grid grid-cols-2 items-stretch gap-2">
          <Link
            to={`/courses/${c.slug}`}
            aria-label={`View ${c.title} course syllabus and details`}
            className={cx(
              softButton,
              "min-h-12 w-full",
            )}
          >
            <BookOpen size={14} aria-hidden="true" />
            View Course Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal()}
            aria-label={`Enquire about ${c.title} course enrollment on WhatsApp`}
            className={cx(
              whatsappButton,
              "min-h-12 w-full",
            )}
          >
            <MessageCircle size={14} aria-hidden="true" />
            Enquire on WhatsApp
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
            alt={`${p.name}, a ${p.type} spiritual destination in ${p.state}`}
            loading="lazy"
            decoding="async"
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
              <MapPin size={13} aria-hidden="true" />
              {p.state} · Best: {p.bestTime}
            </p>
          </div>
        </Link>

        <div className="absolute right-3 top-3">
          <SaveBtn
            kind="place"
            slug={p.slug}
            name={p.name}
          />
        </div>
      </div>

      <div className="absolute bottom-4 right-4">
        <Link
          to={`/spiritual-places/${p.slug}`}
          aria-label={`Explore ${p.name} spiritual destination details`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-[12px] font-bold text-orange-900 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          Explore
          <ArrowRight size={13} aria-hidden="true" />
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
            alt={`${a.name} in ${a.place}, ${a.state}`}
            loading="lazy"
            decoding="async"
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
              aria-hidden="true"
            />
          </p>
        </Link>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link
            to={`/ashrams/${a.slug}`}
            aria-label={`View ${a.name} Ashram details`}
            className={cx(
              saffronButton,
              "w-full",
            )}
          >
            <Users size={14} aria-hidden="true" />
            View Ashram Details
          </Link>

          <a
            href={whatsappHref}
            {...openExternal()}
            aria-label={`Enquire about stay, seva and programmes at ${a.name} on WhatsApp`}
            className={cx(
              whatsappButton,
              "w-full",
            )}
          >
            <MessageCircle size={14} aria-hidden="true" />
            Enquire on WhatsApp
          </a>
        </div>
      </div>
    </motion.article>
  );
}
