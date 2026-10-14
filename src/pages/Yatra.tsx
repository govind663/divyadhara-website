
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MapPin,
  Search,
  MessageCircle,
  Clock,
  Bus,
  BedDouble,
  UtensilsCrossed,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronRight,
  CalendarDays,
  Compass,
  Sparkles,
  Users,
  ArrowRight,
} from "lucide-react";

import { PLACES, PACKAGES } from "../data/content";
import { useSEO } from "../lib/seo";
import {
  Breadcrumbs,
  Breadcrumbs as BC,
  Reveal,
  SectionHead,
} from "../components/ui";
import { PlaceCard, PackageCard } from "../components/cards";
import { EnquiryForm, PageHero, WhatsAppBand } from "../components/blocks";
import { inr, waLink } from "../lib/utils";

/* -------------------------------------------------------------------------- */
/* Shared enquiry presentation                                                */
/* -------------------------------------------------------------------------- */

function EnquiryIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-orange-800">
        <Sparkles size={14} />
        {eyebrow}
      </span>
      <h2 className="font-display mt-4 text-3xl font-semibold leading-tight text-[#2a1a10] md:text-4xl">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-stone-600 md:text-base">
        {description}
      </p>
    </div>
  );
}

function EnquiryContactCard({
  title,
  description,
  message,
}: {
  title: string;
  description: string;
  message: string;
}) {
  const whatsappUrl = waLink(message);

  return (
    <div className="flex h-full flex-col justify-between rounded-3xl bg-[#2a1a10] p-6 text-white shadow-xl md:p-8">
      <div>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
          <MessageCircle size={23} />
        </span>
        <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.22em] text-amber-300">
          DivyaDhara Yatra Desk
        </p>
        <h3 className="font-display mt-2 text-2xl font-semibold md:text-3xl">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-7 text-stone-300">
          {description}
        </p>
        <ul className="mt-6 space-y-3 text-sm text-stone-200">
          <li className="flex items-start gap-3">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-amber-300" />
            Guidance for dates and travel planning
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-amber-300" />
            Help with stay, transport and itinerary questions
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-amber-300" />
            Discuss your family or group requirements
          </li>
        </ul>
      </div>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#1fb95a]"
      >
        <MessageCircle size={17} />
        Continue on WhatsApp
        <ArrowRight size={16} />
      </a>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Spiritual Places listing                                                   */
/* -------------------------------------------------------------------------- */

export function Places() {
  useSEO({
    title: "Spiritual Places — Jyotirlingas, Char Dham, Holy Cities | DivyaDhara",
    description:
      "Explore Jyotirlingas, Shakti Peethas, Char Dham, holy cities and sacred circuits across India. Discover their significance, best time to visit, attractions and travel guidance.",
    path: "/spiritual-places",
  });

  const [q, setQ] = useState("");

  const list = useMemo(
    () =>
      PLACES.filter(
        (p) =>
          !q ||
          `${p.name} ${p.state} ${p.type}`.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [q],
  );

  return (
    <>
      <PageHero
        eyebrow="Tirtha Kshetra · Bharat"
        title="Spiritual Places of India"
        sub="From Himalayan dhams to island temples — discover sacred significance, attractions, the best time to visit and how to reach."
        image="/images/yatra-himalaya.jpeg"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Spiritual Places" },
          ]}
        />

        <div className="mt-6">
          <label className="flex items-center gap-3 rounded-2xl border border-orange-900/15 bg-white px-4 py-3.5 shadow-sm transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
            <Search size={18} className="shrink-0 text-orange-600" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search places… (e.g. Kashi, Char Dham, Madurai)"
              className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
              aria-label="Search spiritual places"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-orange-800 hover:bg-orange-50"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-stone-500">
          <p role="status" aria-live="polite">
            Showing{" "}
            <strong className="text-stone-800">{list.length}</strong>{" "}
            sacred destinations
          </p>
          {q && (
            <p>
              Search: <strong className="text-stone-800">{q}</strong>
            </p>
          )}
        </div>

        {list.length > 0 ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((p, i) => (
              <PlaceCard key={p.slug} p={p} i={i} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-orange-200 bg-orange-50/50 px-6 py-14 text-center">
            <Search size={28} className="mx-auto text-orange-500" />
            <h2 className="font-display mt-4 text-xl font-semibold text-[#2a1a10]">
              No matching places found
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Try another destination, state or spiritual category.
            </p>
            <button
              type="button"
              onClick={() => setQ("")}
              className="btn-saffron mt-5 rounded-2xl px-5 py-3 text-sm font-bold text-white"
            >
              Show all places
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Yatra packages listing                                                     */
/* -------------------------------------------------------------------------- */

export function Packages() {
  useSEO({
    title: "Yatra Packages — Char Dham, Kashi, Tamil Circuit | DivyaDhara",
    description:
      "Explore pilgrimage packages including Char Dham, Kashi–Ayodhya–Prayagraj, Maharashtra Jyotirlingas, Tamil spiritual circuits and Do Dham. Compare prices, inclusions and itineraries.",
    path: "/packages",
  });

  const [max, setMax] = useState(200000);

  const list = useMemo(
    () => PACKAGES.filter((p) => p.price <= max),
    [max],
  );

  return (
    <>
      <PageHero
        eyebrow="Yatra · Premium Pilgrimage"
        title="Signature Yatra Packages"
        sub="Thoughtfully planned pilgrimages with sattvic stays, darshan assistance and acharya guidance — travel as sadhana."
        image="/images/hero-kedarnath.jpeg"
      >
        <Link
          to="/spiritual-places"
          className="rounded-2xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold backdrop-blur transition hover:bg-white/20"
        >
          Explore Places First
        </Link>
        <a
          href="#custom-yatra"
          className="btn-saffron inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white"
        >
          Plan a Custom Yatra
          <ArrowRight size={16} />
        </a>
      </PageHero>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Yatra Packages" },
          ]}
        />

        <section className="mt-6 rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-[#2a1a10]">
                <Compass size={18} className="text-orange-600" />
                Filter by budget
              </p>
              <p className="mt-1 text-sm text-stone-500">
                Maximum budget per person:{" "}
                <strong className="text-orange-800">{inr(max)}</strong>
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {list.length} of {PACKAGES.length} packages match your budget.
              </p>
            </div>

            <div className="w-full md:max-w-sm">
              <label
                htmlFor="yatra-budget"
                className="mb-2 flex items-center justify-between text-xs font-bold text-stone-600"
              >
                <span>Maximum price</span>
                <span>{inr(max)}</span>
              </label>
              <input
                id="yatra-budget"
                type="range"
                min={15000}
                max={200000}
                step={5000}
                value={max}
                onChange={(event) => setMax(Number(event.target.value))}
                className="w-full cursor-pointer accent-orange-700"
                aria-label="Maximum price per person"
              />
              <div className="mt-1 flex justify-between text-[11px] text-stone-400">
                <span>{inr(15000)}</span>
                <span>{inr(200000)}</span>
              </div>
            </div>
          </div>
        </section>

        {list.length > 0 ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {list.map((p, i) => (
              <PackageCard key={p.slug} p={p} i={i} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-orange-200 bg-orange-50/50 p-10 text-center">
            <h2 className="font-display text-xl font-semibold text-[#2a1a10]">
              No packages within this budget
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Increase the maximum budget to see more options.
            </p>
            <button
              type="button"
              onClick={() => setMax(200000)}
              className="btn-saffron mt-5 rounded-2xl px-5 py-3 text-sm font-bold text-white"
            >
              Show all budgets
            </button>
          </div>
        )}

        <section id="custom-yatra" className="scroll-mt-24 pt-16">
          <SectionHead
            eyebrow="Custom Yatra"
            title="A pilgrimage planned around you"
            sub="Family kul-devta visits, private or group pilgrimages, senior-friendly journeys and spiritual circuits — share your requirements with us."
          />

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <EnquiryContactCard
              title="Let's plan your journey"
              description="Tell us your preferred destination, travel dates, group size and special requirements. The DivyaDhara team can help you explore suitable options."
              message="Namaste! I want to plan a custom pilgrimage with DivyaDhara. Please guide me about destinations, dates, group size and estimated cost."
            />

            <div className="rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm md:p-6">
              <EnquiryForm
                context="Custom pilgrimage / group yatra enquiry"
                title="Plan My Custom Yatra"
              />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Spiritual place detail                                                     */
/* -------------------------------------------------------------------------- */

export function PlaceDetail() {
  const { slug } = useParams();
  const p = PLACES.find((x) => x.slug === slug);

  useSEO({
    title: p
      ? `${p.name} — History, Best Time & How to Reach | DivyaDhara`
      : "Place Not Found",
    description: p ? `${p.name} (${p.state}): ${p.summary}` : "Not found",
    path: `/spiritual-places/${slug}`,
    image: p?.image,
  });

  if (!p) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Place not found</h1>
        <Link
          to="/spiritual-places"
          className="btn-saffron mt-6 inline-block rounded-2xl px-6 py-3 text-sm font-bold text-white"
        >
          All places
        </Link>
      </div>
    );
  }

  const placeWhatsApp = waLink(
    `Namaste! I would like to plan a visit to ${p.name}, ${p.state}. Please guide me about travel, nearby places and the best time to visit.`,
  );

  return (
    <>
      <section className="relative overflow-hidden bg-char-900 text-white">
        <img
          src={p.image}
          alt={p.name}
          className="kenburns absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-char-900 via-black/50 to-black/30" />

        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-16 md:px-6 lg:px-8">
          <BC
            items={[
              { label: "Home", href: "/" },
              { label: "Spiritual Places", href: "/spiritual-places" },
              { label: p.name },
            ]}
          />

          <span className="mt-6 inline-block rounded-full bg-amber-400 px-3 py-1 text-[11px] font-extrabold text-[#3a2415]">
            {p.type}
          </span>

          <h1 className="font-display mt-3 text-4xl font-semibold md:text-6xl">
            {p.name}
          </h1>

          <p className="mt-3 max-w-2xl text-stone-200">{p.summary}</p>

          <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-200">
            <MapPin size={15} />
            {p.state} · Best time: {p.bestTime}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={placeWhatsApp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#1fb95a]"
            >
              <MessageCircle size={16} />
              Ask on WhatsApp
            </a>
            <a
              href="#place-enquiry"
              className="btn-saffron inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white"
            >
              Plan a Visit
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <div className="space-y-8">
          <Reveal>
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Significance
            </h2>
            <ul className="mt-4 space-y-2">
              {p.significance.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-xl bg-orange-50/70 px-4 py-3 text-sm text-stone-700 ring-1 ring-orange-100"
                >
                  <span className="text-orange-600">❖</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal>
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              What to Experience
            </h2>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {p.attractions.map((attraction) => (
                <p
                  key={attraction}
                  className="rounded-2xl border border-orange-900/10 bg-white p-4 text-sm font-semibold text-stone-700"
                >
                  <span className="mr-2 text-orange-600">✦</span>
                  {attraction}
                </p>
              ))}
            </div>
          </Reveal>

          <Reveal className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-char-900 p-5 text-white">
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                Best Time
              </p>
              <p className="font-display mt-1 text-lg font-semibold">
                {p.bestTime}
              </p>
            </div>

            <div className="rounded-2xl border border-orange-900/10 bg-white p-5 md:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-700">
                How to Reach
              </p>
              <p className="mt-1 text-sm leading-6 text-stone-600">{p.reach}</p>
            </div>
          </Reveal>

          <Reveal>
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Nearby Sacred Places
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {p.nearby.map((nearbyPlace) => (
                <span
                  key={nearbyPlace}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-orange-900/10"
                >
                  {nearbyPlace}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal>
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Glimpses
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <img
                src={p.image}
                alt={`${p.name} spiritual destination`}
                loading="lazy"
                className="h-48 w-full rounded-2xl object-cover sm:h-44"
              />
              <img
                src="/images/hero-varanasi.jpeg"
                alt="Sacred ghats of India"
                loading="lazy"
                className="h-48 w-full rounded-2xl object-cover sm:h-44"
              />
              <img
                src="/images/aarti-night.jpeg"
                alt="Evening aarti"
                loading="lazy"
                className="h-48 w-full rounded-2xl object-cover sm:h-44"
              />
            </div>
          </Reveal>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <SectionHead
          eyebrow="Continue Your Journey"
          title="Yatras covering this region"
          sub="Explore related pilgrimage packages and compare available itineraries."
        />
        <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PACKAGES.slice(0, 3).map((x, i) => (
            <PackageCard key={x.slug} p={x} i={i} />
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-6 md:px-6 lg:px-8">
        <WhatsAppBand
          title={`Planning a visit to ${p.name}?`}
          sub="Ask about the best season, nearby sacred destinations, transport and practical travel preparations."
          message={`Namaste! Please guide me for a visit to ${p.name}, ${p.state}.`}
        />
      </div>

      <section
        id="place-enquiry"
        className="scroll-mt-24 px-4 pb-16 pt-8 md:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-orange-200/70 bg-linear-to-br from-[#fffaf0] via-white to-orange-50/70 p-5 shadow-sm md:p-8 lg:p-10">
          <EnquiryIntro
            eyebrow="Your Sacred Journey"
            title={`Plan Your Visit to ${p.name}`}
            description="Share your travel preferences and questions with DivyaDhara. Use the enquiry form or contact the team on WhatsApp for guidance."
          />

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <EnquiryContactCard
              title="Make your visit meaningful"
              description={`Planning a visit to ${p.name} in ${p.state}? Tell us what you need help with, from choosing a suitable travel period to understanding the nearby sacred places.`}
              message={`Namaste! I want to plan a visit to ${p.name}, ${p.state}. Please guide me about travel planning and nearby sacred places.`}
            />

            <div className="min-w-0 rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm md:p-6">
              <EnquiryForm
                context={`Spiritual place enquiry: ${p.name}, ${p.state}`}
                title="Plan My Visit"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Package detail                                                             */
/* -------------------------------------------------------------------------- */

export function PackageDetail() {
  const { slug } = useParams();
  const pk = PACKAGES.find((x) => x.slug === slug);

  useSEO({
    title: pk
      ? `${pk.name} — ${inr(pk.price)} | DivyaDhara Yatras`
      : "Package Not Found",
    description: pk
      ? `${pk.name}: ${pk.duration}, ${pk.destination}. ${pk.transport}, ${pk.stay}. Dates: ${pk.dates.join(", ")}.`
      : "Not found",
    path: `/packages/${slug}`,
    image: pk?.image,
  });

  if (!pk) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">Yatra not found</h1>
        <Link
          to="/packages"
          className="btn-saffron mt-6 inline-block rounded-2xl px-6 py-3 text-sm font-bold text-white"
        >
          All yatras
        </Link>
      </div>
    );
  }

  const wa = waLink(
    `Namaste! I want to join: ${pk.name} (${pk.duration}, ${inr(pk.price)}/person). Please guide me about available dates, travellers and booking process.`,
  );

  return (
    <>
      <section className="relative overflow-hidden bg-char-900 text-white">
        <img
          src={pk.image}
          alt={pk.name}
          className="kenburns absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-char-900 via-black/50 to-black/30" />

        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-16 md:px-6 lg:px-8">
          <BC
            items={[
              { label: "Home", href: "/" },
              { label: "Yatra Packages", href: "/packages" },
              { label: pk.name },
            ]}
          />

          <div className="mt-6 flex flex-wrap gap-2 text-[12px] font-bold">
            <span className="rounded-full bg-orange-600 px-3 py-1">
              {pk.duration}
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
              {pk.groupSize}
            </span>
            {pk.oldPrice && (
              <span className="rounded-full bg-amber-400 px-3 py-1 text-[#3a2415]">
                Save {inr(pk.oldPrice - pk.price)}
              </span>
            )}
          </div>

          <h1 className="font-display mt-3 max-w-3xl text-4xl font-semibold md:text-5xl">
            {pk.name}
          </h1>
          <p className="mt-2 text-amber-200">{pk.destination}</p>

          <p className="mt-3">
            <span className="font-display text-4xl font-bold text-amber-300">
              {inr(pk.price)}
            </span>{" "}
            <span className="text-sm text-stone-300">
              per person · {pk.meals}
            </span>
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#1fb95a]"
            >
              <MessageCircle size={16} />
              Enquire on WhatsApp
            </a>
            <a
              href="#package-enquiry"
              className="btn-saffron inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white"
            >
              Book This Yatra
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <div className="space-y-8">
          <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-orange-700">
                <Bus size={14} />
                Transport
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-700">
                {pk.transport}
              </p>
            </div>

            <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-orange-700">
                <BedDouble size={14} />
                Stay
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-700">
                {pk.stay}
              </p>
            </div>

            <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-orange-700">
                <UtensilsCrossed size={14} />
                Meals
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-700">
                {pk.meals}
              </p>
            </div>
          </Reveal>

          <Reveal className="rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[#3a2415]">
              <Clock size={15} className="text-orange-700" />
              Departures: {pk.dates.join(" · ")}
            </p>
            <p className="mt-1 text-[13px] text-stone-600">
              Places covered: {pk.places.join(" · ")}
            </p>
          </Reveal>

          <Reveal>
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Day-wise Itinerary
            </h2>
            <ol className="relative mt-5 space-y-5 border-l-2 border-orange-200 pl-6">
              {pk.itinerary.map((day) => (
                <li key={day.day} className="relative">
                  <span className="absolute left-[-2.05rem] top-0 grid h-8 w-8 place-items-center rounded-full bg-linear-to-br from-orange-600 to-amber-500 text-[10px] font-extrabold text-white ring-4 ring-[#fffdf7]">
                    {day.day.replace("Day ", "D")}
                  </span>
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-700">
                    {day.day}
                  </p>
                  <p className="font-display text-lg font-semibold text-[#2a1a10]">
                    {day.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {day.desc}
                  </p>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6">
              <h3 className="flex items-center gap-2 font-bold text-emerald-950">
                <CheckCircle2 size={18} />
                Inclusions
              </h3>
              <ul className="mt-3 space-y-1.5">
                {pk.inclusions.map((item) => (
                  <li key={item} className="text-sm text-emerald-950/90">
                    ✓ {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-red-200 bg-red-50/60 p-6">
              <h3 className="flex items-center gap-2 font-bold text-red-950">
                <XCircle size={18} />
                Exclusions
              </h3>
              <ul className="mt-3 space-y-1.5">
                {pk.exclusions.map((item) => (
                  <li key={item} className="text-sm text-red-950/80">
                    ✕ {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal>
            <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[#2a1a10]">
              <FileText size={22} className="text-orange-600" />
              Terms
            </h2>
            <ul className="mt-3 space-y-1.5">
              {pk.terms.map((term) => (
                <li key={term} className="text-sm leading-6 text-stone-600">
                  • {term}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal>
            <h2 className="font-display text-2xl font-semibold">
              Glimpses of this route
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <img
                src={pk.image}
                alt={pk.name}
                loading="lazy"
                className="h-48 w-full rounded-2xl object-cover sm:h-44"
              />
              <img
                src="/images/hero-varanasi.jpeg"
                alt="Ganga ghats"
                loading="lazy"
                className="h-48 w-full rounded-2xl object-cover sm:h-44"
              />
              <img
                src="/images/aarti-night.jpeg"
                alt="Aarti"
                loading="lazy"
                className="h-48 w-full rounded-2xl object-cover sm:h-44"
              />
            </div>
          </Reveal>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-6 md:px-6 lg:px-8">
        <WhatsAppBand
          title="Travelling with seniors or a large family?"
          sub="Ask about slower itineraries, suitable accommodation, group needs and meal preferences."
          message={`Namaste! For ${pk.name}, I need family / senior-citizen travel assistance.`}
        />
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[#2a1a10]">
          More Yatras
          <ChevronRight size={20} className="text-orange-600" />
        </h2>
        <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PACKAGES.filter((x) => x.slug !== pk.slug)
            .slice(0, 3)
            .map((x, i) => (
              <PackageCard key={x.slug} p={x} i={i} />
            ))}
        </div>
      </section>

      <section
        id="package-enquiry"
        className="scroll-mt-24 px-4 pb-16 pt-6 md:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-orange-200/70 bg-linear-to-br from-[#fffaf0] via-white to-orange-50/70 p-5 shadow-sm md:p-8 lg:p-10">
          <EnquiryIntro
            eyebrow="Your Yatra Reservation"
            title={`Plan Your Journey: ${pk.name}`}
            description="Share your preferred travel dates, number of travellers and any special requirements. The enquiry form helps the team understand your request."
          />

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <EnquiryContactCard
              title="Ready for your next pilgrimage?"
              description={`${pk.name} · ${pk.duration} · ${pk.destination}. Starting from ${inr(pk.price)} per person. Contact the Yatra Desk to discuss trip details and availability.`}
              message={`Namaste! I am interested in ${pk.name}, ${pk.duration}, starting at ${inr(pk.price)} per person. Please guide me about dates, availability and booking.`}
            />

            <div className="min-w-0 rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm md:p-6">
              <EnquiryForm
                context={`Yatra booking enquiry: ${pk.name} (${pk.duration})`}
                title="Yatra Booking Enquiry"
              />
              <p className="mt-4 text-center text-xs leading-5 text-stone-500">
                Submitting an enquiry does not itself confirm a reservation.
                Dates and availability should be confirmed with the team.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Dedicated package enquiry page                                             */
/* -------------------------------------------------------------------------- */

export function PackageEnquiry() {
  const { slug } = useParams();
  const pk = PACKAGES.find((x) => x.slug === slug);

  useSEO({
    title: pk ? `Enquire — ${pk.name} | DivyaDhara` : "Yatra Enquiry | DivyaDhara",
    description: pk
      ? `Send an enquiry about ${pk.name} (${pk.duration}) with DivyaDhara.`
      : "Contact DivyaDhara to discuss a pilgrimage plan.",
    path: `/packages/${slug}/enquiry`,
    image: pk?.image,
  });

  const whatsappUrl = waLink(
    pk
      ? `Namaste! I want to enquire about ${pk.name}. Please guide me.`
      : "Namaste! I want to plan a pilgrimage with DivyaDhara. Please guide me.",
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
      <BC
        items={[
          { label: "Home", href: "/" },
          { label: "Yatra Packages", href: "/packages" },
          ...(pk ? [{ label: pk.name, href: `/packages/${pk.slug}` }] : []),
          { label: "Enquiry" },
        ]}
      />

      <section className="mt-8 rounded-[2rem] border border-orange-200/70 bg-linear-to-br from-[#fffaf0] via-white to-orange-50/70 p-5 md:p-8 lg:p-10">
        <EnquiryIntro
          eyebrow="Reserve Your Seat"
          title={pk ? `Enquire About ${pk.name}` : "Plan Your Yatra"}
          description={
            pk
              ? `${pk.duration} · ${pk.destination} · Starting from ${inr(pk.price)} per person. Share your requirements and ask the team about the next steps.`
              : "Share your destination, dates and travel requirements so the DivyaDhara team can help you plan your pilgrimage."
          }
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <EnquiryContactCard
            title="Let's plan your pilgrimage"
            description="Need help comparing destinations, dates, travel arrangements or accommodation? Contact the Yatra Desk or use the enquiry form."
            message={
              pk
                ? `Namaste! I would like to enquire about ${pk.name}. Please share details about dates, itinerary and availability.`
                : "Namaste! I want to plan a yatra with DivyaDhara. Please guide me about destinations, dates and estimated costs."
            }
          />

          <div className="min-w-0 rounded-3xl border border-orange-900/10 bg-white p-4 shadow-sm md:p-6">
            <EnquiryForm
              context={
                pk
                  ? `Yatra booking enquiry: ${pk.name} (${pk.duration})`
                  : "General yatra enquiry"
              }
              title="Travel Enquiry Form"
            />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-stone-500">
          Prefer WhatsApp?{" "}
          <a
            className="font-bold text-orange-700 underline underline-offset-4"
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
          >
            Chat with the Yatra Desk
          </a>
        </p>
      </section>
    </div>
  );
}
