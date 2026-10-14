import { Link, useParams } from "react-router-dom";
import {
  MapPin,
  BedDouble,
  UtensilsCrossed,
  CalendarDays,
  Camera,
  MessageCircle,
  Sparkles,
  ArrowRight,
  Clock,
  Users,
  Compass,
  // Phone,
} from "lucide-react";

import { ASHRAMS } from "../data/content";
import { useSEO } from "../lib/seo";
import { Breadcrumbs, Reveal, SectionHead } from "../components/ui";
import { AshramCard } from "../components/cards";
import { EnquiryForm, PageHero, WhatsAppBand } from "../components/blocks";
import { waLink } from "../lib/utils";

function AshramList() {
  useSEO({
    title: "Ashrams of India — Stay, Satsang & Seva | DivyaDhara",
    description:
      "Explore Indian ashrams for spiritual stays, daily satsang, yoga, meditation, sattvic food, courses and seva opportunities.",
    path: "/ashrams",
  });

  return (
    <>
      <PageHero
        eyebrow="Tapobhumi · Ashram"
        title="Ashrams & Spiritual Homes"
        sub="Stay, practise and serve — explore daily schedules, sattvic food, spiritual programmes and course calendars from India's beloved ashrams."
        image="/images/ashram-dawn.jpeg"
      />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Ashrams" },
          ]}
        />

        {ASHRAMS.map((a, i) => (
          <AshramCard key={a.slug} a={a} i={i} />
        ))}
      </div>
    </>
  );
}

export function AshramDetail() {
  const { slug } = useParams();

  const a = ASHRAMS.find((x) => x.slug === slug);

  useSEO({
    title: a
      ? `${a.name}, ${a.place} — Stay, Schedule & Seva | DivyaDhara`
      : "Ashram Not Found | DivyaDhara",
    description: a
      ? `${a.name} in ${a.place}, ${a.state}: ${a.summary} Explore the daily schedule, accommodation, food, courses and spiritual activities.`
      : "The requested ashram could not be found. Explore other spiritual homes on DivyaDhara.",
    path: `/ashrams/${slug}`,
    image: a?.image,
  });

  if (!a) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
          <MapPin size={28} />
        </div>

        <h1 className="font-display mt-5 text-3xl font-bold text-[#2a1a10]">
          Ashram not found
        </h1>

        <p className="mt-3 text-stone-600">
          This ashram page may have moved. Explore other spiritual homes and
          retreat destinations on DivyaDhara.
        </p>

        <Link
          to="/ashrams"
          className="btn-saffron mt-6 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white"
        >
          Explore All Ashrams
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const wa = waLink(
    `Namaste! I wish to stay or join a programme at ${a.name}, ${a.place}. Please guide me regarding availability, dates and registration.`
  );

  const enquiryContext = `Ashram stay and programme enquiry: ${a.name}, ${a.place}, ${a.state}`;

  return (
    <>
      {/* ASHRAM HERO */}
      <section className="relative isolate overflow-hidden bg-char-900 text-white">
        <img
          src={a.image}
          alt={`${a.name} in ${a.place}, ${a.state}`}
          className="kenburns absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-linear-to-t from-char-900 via-black/60 to-black/30" />

        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-16 md:px-6 md:pb-16 lg:px-8 lg:pt-20">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Ashrams", href: "/ashrams" },
              { label: a.name },
            ]}
          />

          <div className="mt-8 max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-black/25 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-200 backdrop-blur">
              <Sparkles size={14} />
              Sacred Stay · Satsang · Seva
            </div>

            <p className="mt-5 flex items-center gap-2 text-sm font-bold text-amber-300">
              <MapPin size={16} />
              {a.place}, {a.state}
            </p>

            <h1 className="font-display mt-3 text-4xl font-semibold leading-tight md:text-5xl lg:text-6xl">
              {a.name}
            </h1>

            <p className="mt-4 text-base text-white/85 md:text-lg">
              Guided by{" "}
              <span className="font-semibold text-amber-200">{a.guru}</span>
            </p>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/80 md:text-base">
              Discover the ashram's spiritual traditions, daily routine,
              accommodation, sattvic food and opportunities for learning,
              meditation and seva.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#visit"
                className="btn-saffron inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:-translate-y-0.5"
              >
                <CalendarDays size={17} />
                Plan Your Visit
              </a>

              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                <MessageCircle size={17} />
                Ask on WhatsApp
              </a>
            </div>
          </div>

          <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <CalendarDays size={20} className="text-amber-300" />
              <p className="mt-3 text-sm font-bold">Daily Schedule</p>
              <p className="mt-1 text-xs leading-5 text-white/70">
                Explore the daily routine
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <BedDouble size={20} className="text-amber-300" />
              <p className="mt-3 text-sm font-bold">Spiritual Stay</p>
              <p className="mt-1 text-xs leading-5 text-white/70">
                Learn about accommodation
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/20 p-4 backdrop-blur-sm">
              <Users size={20} className="text-amber-300" />
              <p className="mt-3 text-sm font-bold">Satsang & Seva</p>
              <p className="mt-1 text-xs leading-5 text-white/70">
                Discover spiritual activities
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN ASHRAM CONTENT — SINGLE COLUMN, NO FORM SIDEBAR */}
      <main className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Ashrams", href: "/ashrams" },
            { label: a.name },
          ]}
        />

        {/* HISTORY */}
        <Reveal className="mt-8">
          <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:gap-12">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
                History & Parampara
              </p>

              <h2 className="font-display mt-3 text-3xl font-semibold leading-tight text-[#2a1a10] md:text-4xl">
                A Place for Reflection, Practice and Inner Peace
              </h2>

              <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-stone-600">
                <MapPin size={16} className="text-orange-600" />
                {a.place}, {a.state}
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-stone-600">
                <Sparkles size={16} className="text-orange-600" />
                Guided by {a.guru}
              </div>
            </div>

            <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
              <p className="leading-8 text-stone-600">{a.history}</p>

              <div className="mt-6 rounded-2xl bg-orange-50/80 p-5">
                <p className="text-sm font-bold text-orange-950">
                  Before You Visit
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Programme dates, accommodation, food arrangements and
                  participation rules may vary. Contact the ashram or enquire
                  before making travel plans.
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* DAILY SCHEDULE */}
        <Reveal className="mt-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
                Rhythm of the Ashram
              </p>

              <h2 className="font-display mt-2 flex items-center gap-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                <CalendarDays size={23} className="text-orange-600" />
                Daily Schedule
              </h2>
            </div>

            <p className="max-w-md text-sm leading-6 text-stone-500">
              Review the listed activities and timings. Confirm the latest
              schedule before attending.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-orange-900/10 bg-orange-50/70 px-5 py-4">
              <Clock size={18} className="text-orange-700" />
              <p className="text-sm font-bold text-[#2a1a10]">
                Daily Activities & Timings
              </p>
            </div>

            <div>
              {a.schedule.map((s, i) => (
                <div
                  key={`${s.time}-${s.item}`}
                  className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 ${
                    i % 2 ? "bg-orange-50/40" : "bg-white"
                  } ${i !== a.schedule.length - 1 ? "border-b border-orange-900/5" : ""}`}
                >
                  <span className="flex shrink-0 items-center gap-2 text-sm font-extrabold text-orange-800 sm:w-32">
                    <Clock size={14} />
                    {s.time}
                  </span>

                  <span className="text-sm leading-6 text-stone-700">
                    {s.item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ACCOMMODATION & FOOD */}
        <Reveal className="mt-12">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
              A Simple, Sattvic Stay
            </p>

            <h2 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
              Accommodation & Food
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
              Understand the stay and food arrangements to help prepare for a
              comfortable and respectful ashram visit.
            </p>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="group rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg md:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <BedDouble size={23} />
              </div>

              <h3 className="mt-5 text-lg font-bold text-[#2a1a10]">
                Accommodation
              </h3>

              <p className="mt-3 text-sm leading-7 text-stone-600">
                {a.stay}
              </p>

              <a
                href="#visit"
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-800 underline decoration-orange-300 underline-offset-4 transition hover:text-orange-600"
              >
                Enquire about stay
                <ArrowRight size={15} />
              </a>
            </div>

            <div className="group rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg md:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <UtensilsCrossed size={23} />
              </div>

              <h3 className="mt-5 text-lg font-bold text-[#2a1a10]">
                Food & Sattvic Meals
              </h3>

              <p className="mt-3 text-sm leading-7 text-stone-600">
                {a.food}
              </p>

              <a
                href="#visit"
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-800 underline decoration-orange-300 underline-offset-4 transition hover:text-orange-600"
              >
                Ask about food arrangements
                <ArrowRight size={15} />
              </a>
            </div>
          </div>
        </Reveal>

        {/* ACTIVITIES & COURSES */}
        <Reveal className="mt-12">
          <div className="rounded-3xl border border-orange-900/10 bg-[#fffaf2] p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <Sparkles size={23} />
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
                  Learn · Practise · Serve
                </p>

                <h2 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                  Spiritual Activities & Courses
                </h2>

                <p className="mt-3 text-sm leading-7 text-stone-600">
                  Explore the spiritual practices and learning opportunities
                  listed for this ashram. Confirm eligibility, dates and
                  registration details before joining a programme.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-bold text-[#2a1a10]">
                Activities & Programmes
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {[...a.activities, ...a.courses].map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-orange-200/80 bg-white px-4 py-2 text-[13px] font-bold text-orange-900"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-orange-900/10 pt-5">
              <p className="text-sm leading-7 text-stone-600">
                {a.contactNote}
              </p>

              <Link
                to="/courses"
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-orange-800 underline decoration-orange-300 underline-offset-4 transition hover:text-orange-600"
              >
                Browse Related Courses
                <ArrowRight size={16} />
              </Link>
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
                A Visual Glimpse
              </p>

              <h2 className="font-display mt-1 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                Glimpses of the Ashram
              </h2>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="group relative overflow-hidden rounded-3xl">
              <img
                src={a.image}
                alt={`${a.name} in ${a.place}`}
                loading="lazy"
                className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-64"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
              <p className="absolute bottom-4 left-4 text-sm font-bold text-white">
                {a.name}
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-3xl">
              <img
                src="/images/yoga-course.jpeg"
                alt="Yoga and spiritual practice"
                loading="lazy"
                className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-64"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
              <p className="absolute bottom-4 left-4 text-sm font-bold text-white">
                Yoga & Practice
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-3xl">
              <img
                src="/images/puja-thali.jpeg"
                alt="Traditional puja offerings"
                loading="lazy"
                className="h-56 w-full object-cover transition duration-700 group-hover:scale-105 md:h-64"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
              <p className="absolute bottom-4 left-4 text-sm font-bold text-white">
                Sacred Traditions
              </p>
            </div>
          </div>
        </Reveal>
      </main>

      {/* WHATSAPP SUPPORT BAND */}
      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6 lg:px-8">
        <WhatsAppBand
          title={`Called to stay at ${a.place}?`}
          sub="Get guidance about room requests, programme dates, what to pack and ashram etiquette before planning your visit."
          message={`Namaste! I wish to visit ${a.name} in ${a.place}. Please guide me about accommodation, programme dates and the visit process.`}
        />
      </div>

      {/* OTHER ASHRAMS */}
      <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <SectionHead
          eyebrow="More Homes of Sadhana"
          title="Other Ashrams"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {ASHRAMS.filter((x) => x.slug !== a.slug)
            .slice(0, 2)
            .map((x, i) => (
              <AshramCard key={x.slug} a={x} i={i} />
            ))}
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            to="/ashrams"
            className="inline-flex items-center gap-2 rounded-2xl border border-orange-900/15 bg-white px-5 py-3 text-sm font-bold text-orange-900 transition hover:border-orange-700/40 hover:bg-orange-50"
          >
            Explore All Ashrams
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* FULL-WIDTH ASHRAM ENQUIRY — AFTER OTHER ASHRAMS */}
      <section
        id="visit"
        className="scroll-mt-24 border-y border-orange-900/10 bg-[#fffaf3] py-12 md:py-16"
      >
        <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-orange-900/10 bg-white shadow-[0_20px_70px_-35px_rgba(120,53,15,0.25)]">
            <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
              {/* ENQUIRY INTRODUCTION */}
              <div className="relative overflow-hidden bg-[#2a1a10] p-6 text-white md:p-9 lg:p-10">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-amber-300/15" />
                <div className="absolute -right-7 -top-7 h-40 w-40 rounded-full border border-amber-300/10" />

                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-white/5 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
                    <Sparkles size={14} />
                    Begin Your Spiritual Journey
                  </div>

                  <h2 className="font-display mt-6 text-3xl font-semibold leading-tight md:text-4xl">
                    Plan Your Visit to {a.name}
                  </h2>

                  <p className="mt-4 text-sm leading-7 text-white/75">
                    Interested in staying at this ashram, joining a course or
                    learning about its daily activities? Send an enquiry to
                    begin planning your visit.
                  </p>

                  <div className="mt-8 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <MapPin size={19} />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-white">
                          Ashram Location
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/65">
                          {a.place}, {a.state}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <CalendarDays size={19} />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-white">
                          Stay & Programme Planning
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/65">
                          Ask about your intended dates, accommodation and
                          programme participation.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <Compass size={19} />
                      </div>

                      <div>
                        <p className="text-sm font-bold text-white">
                          Prepare for Your Visit
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/65">
                          Confirm availability, travel arrangements and any
                          ashram-specific guidelines before departure.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-bold text-amber-200">
                      Prefer WhatsApp?
                    </p>

                    <p className="mt-2 text-sm leading-6 text-white/70">
                      Send a message with your questions about staying at{" "}
                      {a.name}.
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

              {/* ENQUIRY FORM */}
              <div className="p-5 md:p-8 lg:p-10">
                <div className="mb-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">
                    Ashram Visit Enquiry
                  </p>

                  <h3 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                    Tell Us About Your Visit
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    Share your requirements using the enquiry form below.
                    Include your preferred dates and the type of programme
                    you're interested in, if applicable.
                  </p>
                </div>

                <div className="rounded-2xl border border-orange-900/10 bg-[#fffdf9] p-3 sm:p-5">
                  <EnquiryForm
                    context={enquiryContext}
                    title="Plan My Ashram Visit"
                  />
                </div>

                <p className="mt-4 text-xs leading-5 text-stone-500">
                  Please confirm accommodation, programme availability and any
                  applicable charges before finalising your travel plans.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default AshramList;