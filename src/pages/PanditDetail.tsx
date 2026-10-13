import {
  Link,
  useParams,
} from "react-router-dom";

import {
  MapPin,
  Languages,
  Award,
  Clock,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
  X,
  Play,
  BookOpen,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  PANDITS,
  SERVICES,
} from "../data/content";

import { useSEO } from "../lib/seo";

import {
  Breadcrumbs,
  Reveal,
} from "../components/ui";

import {
  ServiceCard,
} from "../components/cards";

import {
  EnquiryForm,
  WhatsAppBand,
} from "../components/blocks";

import { waLink } from "../lib/utils";

type PanditDetailRecord = (typeof PANDITS)[number] & {
  storyVideoId?: string;
};

export default function PanditDetail() {
  const { slug } = useParams();

  const p = PANDITS.find(
    (x) => x.slug === slug,
  ) as PanditDetailRecord | undefined;

  // ========================================================
  // PANDIT STORY MODAL
  // ========================================================

  const [storyVideoOpen, setStoryVideoOpen] =
    useState(false);

  // ========================================================
  // SEO
  // ========================================================

  const profilePath = p
    ? `/pandits/${p.slug}`
    : `/pandits/${slug ?? ""}`;

  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${profilePath}`
      : profilePath;

  const storyVideoId =
    p?.storyVideoId?.trim() || undefined;

  const seoTitle = p
    ? `${p.name} | ${p.title} in ${p.location} | DivyaDhara`
    : "Pandit Not Found | DivyaDhara";

  const seoDescription = p
    ? `${p.name}, ${p.title} in ${p.location}. ${p.experience} years of experience in ${p.specializations.slice(0, 3).join(", ")}. Book ${p.pujaTypes.slice(0, 4).join(", ")}. Languages: ${p.languages.join(", ")}.`
    : "The requested Pandit profile could not be found on DivyaDhara.";

  const profileDescription = p
    ? `${p.name} is a ${p.title} associated with ${p.location}, offering ${p.specializations.join(", ")} and related puja services including ${p.pujaTypes.join(", ")}.`
    : "";

  useSEO({
    title: seoTitle,

    description: seoDescription,

    path: profilePath,

    image: p?.photo,

    schema: p
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "ProfilePage",
              "@id": `${profileUrl}#profile`,
              url: profileUrl,
              name: seoTitle,
              description: profileDescription,
              mainEntity: {
                "@id": `${profileUrl}#person`,
              },
            },
            {
              "@type": "Person",
              "@id": `${profileUrl}#person`,
              name: p.name,
              alternateName: p.title,
              jobTitle: p.title,
              description: profileDescription,
              image: p.photo,
              url: profileUrl,
              identifier: p.slug,
              knowsLanguage: p.languages,
              knowsAbout: Array.from(
                new Set([
                  ...p.specializations,
                  ...p.pujaTypes,
                ]),
              ),
              areaServed: p.location,
            },
            {
              "@type": "BreadcrumbList",
              "@id": `${profileUrl}#breadcrumbs`,
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item:
                    typeof window !== "undefined"
                      ? window.location.origin
                      : "/",
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Pandits",
                  item:
                    typeof window !== "undefined"
                      ? `${window.location.origin}/pandits`
                      : "/pandits",
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: p.name,
                  item: profileUrl,
                },
              ],
            },
          ],
        }
      : undefined,
  });

  // ========================================================
  // NOT FOUND
  // ========================================================

  if (!p) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">

        <h1 className="font-display text-3xl font-bold">
          Acharya not found
        </h1>

        <Link
          to="/pandits"
          className="btn-saffron mt-6 inline-block rounded-2xl px-6 py-3 text-sm font-bold text-white"
        >
          All pandits
        </Link>

      </div>
    );
  }

  // ========================================================
  // WHATSAPP
  // ========================================================

  const wa = waLink(
    `Namaste! I want to book ${p.name} (${p.title}) for ${p.specializations[0]}. My city/date is…`,
  );

  // ========================================================
  // RENDER
  // ========================================================

  return (
    <>
      {/* ====================================================
          HERO
      ==================================================== */}

      <div className="bg-linear-to-br from-[#2a1a10] via-saffron-900 to-saffron-700 text-white">

        <div className="mx-auto max-w-7xl px-4 pb-10 pt-10 md:px-6 lg:px-8">

          <Breadcrumbs
            items={[
              {
                label: "Home",
                href: "/",
              },
              {
                label: "Pandits",
                href: "/pandits",
              },
              {
                label: p.name,
              },
            ]}
          />

          <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-center">

            {/* ==================================================
                PHOTO
            ================================================== */}

            <img
              src={p.photo}
              alt={`${p.name} — ${p.title} in ${p.location}`}
              width={208}
              height={208}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="h-40 w-40 rounded-[1.75rem] border-4 border-amber-300/70 object-cover shadow-2xl md:h-52 md:w-52"
            />

            {/* ==================================================
                INFO
            ================================================== */}

            <div className="flex-1">

              {/* VERIFIED */}

              <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200 ring-1 ring-emerald-300/40">

                <ShieldCheck
                  size={13}
                />

                Identity-verified Acharya

              </p>

              {/* NAME */}

              <h1 className="font-display mt-3 text-3xl font-semibold md:text-5xl">
                {p.name}
              </h1>

              <p className="mt-1 font-semibold text-amber-300">
                {p.title}
              </p>

              {/* META */}

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-orange-100">

                <span className="flex items-center gap-1.5">
                  <Award size={15} />
                  {p.experience} years anubhav
                </span>

                <span className="flex items-center gap-1.5">
                  <MapPin size={15} />
                  {p.location}
                </span>

                <span className="flex items-center gap-1.5">
                  <Languages size={15} />
                  {p.languages.join(" · ")}
                </span>

                <span className="flex items-center gap-1.5">
                  <Clock size={15} />
                  {p.availability}
                </span>

              </div>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-orange-100/90">
                Book {p.name} for {p.pujaTypes.slice(0, 4).join(", ")} in{" "}
                {p.location}. Specializations include{" "}
                {p.specializations.slice(0, 4).join(", ")}. Available in{" "}
                {p.languages.join(", ")}.
              </p>

              {/* ==================================================
                  ACTION BUTTONS
              ================================================== */}

              <div className="mt-5 flex flex-wrap gap-3">

                {/* CONTACT */}

                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3 text-sm font-bold text-white transition hover:brightness-110"
                >
                  <MessageCircle
                    size={16}
                  />

                  Contact Pandit
                </a>

                {/* BOOKING */}

                <a
                  href="#book"
                  className="btn-saffron rounded-2xl px-6 py-3 text-sm font-bold text-white"
                >
                  Request Booking
                </a>

                {/* ==================================================
                    PANDIT STORY
                ================================================== */}

                {storyVideoId && (
                  <button
                    type="button"
                    onClick={() =>
                      setStoryVideoOpen(true)
                    }
                    className="inline-flex items-center gap-2 rounded-2xl border border-orange-200/40 bg-white/10 px-6 py-3 text-sm font-bold text-white shadow-sm backdrop-blur-sm transition hover:bg-white/20"
                    aria-label={`Watch story of ${p.name}`}
                  >
                    <BookOpen
                      size={16}
                    />

                    Pandit Story

                    <Play
                      size={14}
                      fill="currentColor"
                    />
                  </button>
                )}

              </div>

            </div>

          </div>

        </div>

      </div>

      {/* ====================================================
          MAIN CONTENT
      ==================================================== */}

      <div className="mx-auto max-w-7xl gap-10 px-4 py-12 md:px-6 lg:grid lg:grid-cols-[1fr_360px] lg:px-8">

        <div>

          {/* ==================================================
              ABOUT
          ================================================== */}

          <Reveal>

            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              About the Acharya
            </h2>

            <p className="mt-3 leading-relaxed text-stone-600">
              {p.about}
            </p>

            <p className="mt-3 rounded-2xl bg-orange-50 p-4 text-sm text-stone-600 ring-1 ring-orange-200">

              <strong className="text-orange-900">
                Associated with:
              </strong>{" "}

              {p.associatedWith}

            </p>

          </Reveal>

          {/* ==================================================
              SPECIALIZATIONS
          ================================================== */}

          <Reveal className="mt-8">

            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Specializations & Puja Types
            </h2>

            <div className="mt-3 flex flex-wrap gap-2">

              {p.specializations.map(
                (s) => (
                  <span
                    key={s}
                    className="rounded-full bg-orange-100 px-3.5 py-1.5 text-[13px] font-bold text-orange-900"
                  >
                    {s}
                  </span>
                ),
              )}

              {p.pujaTypes.map(
                (s) => (
                  <span
                    key={s}
                    className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-stone-600 ring-1 ring-orange-200"
                  >
                    {s}
                  </span>
                ),
              )}

            </div>

          </Reveal>

          {/* ==================================================
              SEVAS
          ================================================== */}

          <Reveal className="mt-8">

            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Sevas & Dakshina
            </h2>

            <div className="mt-4 overflow-hidden rounded-2xl border border-orange-900/10">

              {p.services.map(
                (s, i) => (
                  <div
                    key={s.name}
                    className={`flex flex-wrap items-center justify-between gap-2 px-5 py-4 ${
                      i % 2
                        ? "bg-orange-50/60"
                        : "bg-white"
                    }`}
                  >

                    <div>

                      <p className="text-sm font-bold text-stone-800">
                        {s.name}
                      </p>

                      <p className="text-xs text-stone-500">
                        {s.duration}
                      </p>

                    </div>

                    <span className="rounded-full bg-emerald-950 px-3.5 py-1.5 text-[13px] font-bold text-amber-300">
                      {/* {s.price} */}
                    </span>

                  </div>
                ),
              )}

            </div>

            <p className="mt-2 text-xs text-stone-500">
              Dakshina varies by city & samagri.
              Final quote confirmed before booking —
              no hidden charges.
            </p>

          </Reveal>

          {/* ==================================================
              PRIVACY
          ================================================== */}

          <Reveal className="mt-8 rounded-3xl border border-orange-900/10 bg-white p-6 sacred-border">

            <h3 className="flex items-center gap-2 font-bold text-[#2a1a10]">

              <ShieldCheck
                size={18}
                className="text-emerald-600"
              />

              Contact & Privacy

            </h3>

            <p className="mt-2 text-sm leading-relaxed text-stone-600">

              {p.authorizedContact
                ? "This acharya has authorised WhatsApp contact through DivyaDhara. Tap Contact Pandit — your number is shared only with the acharya for this enquiry."
                : "Per this acharya's parampara maryada, direct numbers are shared only after a confirmed booking. Enquire below and the coordinator will arrange a call."}

            </p>

          </Reveal>

          {/* ==================================================
              RELATED SERVICES
          ================================================== */}

          <div className="mt-8">

            <h2 className="font-display text-2xl font-semibold">
              Related Puja Services
            </h2>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">

              {SERVICES
                .slice(0, 2)
                .map(
                  (s, i) => (
                    <ServiceCard
                      key={s.slug}
                      s={s}
                      i={i}
                    />
                  ),
                )}

            </div>

            <Link
              to="/pandits"
              className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-orange-700"
            >
              ← All pandits
            </Link>

            <Link
              to="/services"
              className="ml-4 inline-flex items-center gap-1 text-sm font-bold text-orange-700"
            >
              All services

              <ChevronRight
                size={14}
              />

            </Link>

          </div>

        </div>

        {/* ====================================================
            BOOKING SIDEBAR
        ==================================================== */}

        <aside
          id="book"
          className="mt-10 scroll-mt-28 lg:mt-0"
        >

          <div className="lg:sticky lg:top-28">

            <EnquiryForm
              context={`Pandit request: ${p.name} (${p.specializations[0]})`}
              title="Request This Pandit"
            />

          </div>

        </aside>

      </div>

      {/* ====================================================
          WHATSAPP BAND
      ==================================================== */}

      <div className="mx-auto max-w-7xl px-4 pb-14 md:px-6 lg:px-8">

        <WhatsAppBand
          title={`Want ${p.name.split(" ")[0]} ji for your sanskar?`}
          sub="Share your city, language and date — we'll confirm availability and muhurat within hours."
          message={`Namaste! I want to book ${p.name} for ${p.specializations[0]}.`}
        />

      </div>

      {/* ====================================================
          PANDIT STORY VIDEO MODAL
      ==================================================== */}

      {storyVideoOpen &&
        storyVideoId && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Pandit Story — ${p.name}`}
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setStoryVideoOpen(false);
              }
            }}
          >

            <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-orange-200/20 bg-[#fffaf3] shadow-2xl">

              {/* ==================================================
                  MODAL HEADER
              ================================================== */}

              <div className="flex items-center justify-between border-b border-orange-900/10 bg-linear-to-r from-orange-50 via-amber-50 to-orange-100 px-4 py-4 sm:px-6">

                <div className="flex items-center gap-3">

                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br from-orange-500 to-orange-700 text-white shadow-lg">

                    <BookOpen
                      size={19}
                    />

                  </span>

                  <div>

                    <h2 className="font-display text-lg font-extrabold text-[#2a1a10]">
                      Pandit Story
                    </h2>

                    <p className="text-xs text-stone-500">
                      {p.name}
                    </p>

                  </div>

                </div>

                {/* CLOSE */}

                <button
                  type="button"
                  onClick={() =>
                    setStoryVideoOpen(false)
                  }
                  aria-label="Close pandit story"
                  className="grid h-9 w-9 place-items-center rounded-xl border border-orange-200 bg-white text-stone-600 transition hover:bg-orange-50 hover:text-orange-700"
                >
                  <X size={18} />
                </button>

              </div>

              {/* ==================================================
                  VIDEO
              ================================================== */}

              <div className="bg-black p-2 sm:p-3">

                <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">

                  <iframe
                    src={`https://www.youtube.com/embed/${storyVideoId}?rel=0&playsinline=1`}
                    title={`Pandit Story — ${p.name}`}
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />

                </div>

              </div>

              {/* ==================================================
                  MODAL FOOTER
              ================================================== */}

              <div className="border-t border-orange-900/10 bg-[#fffaf3] px-4 py-3 sm:px-6">

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                  <div>

                    <p className="text-sm font-bold text-[#2a1a10]">
                      {p.name}
                    </p>

                    <p className="mt-0.5 text-[11px] text-stone-500">
                      Know more about the Acharya,
                      parampara and spiritual services.
                    </p>

                  </div>

                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700/70">

                    <Play size={11} />

                    Pandit Story

                  </span>

                </div>

              </div>

            </div>

          </div>
        )}

    </>
  );
}