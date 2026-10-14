import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MapPin,
  Clock,
  Flame,
  Users,
  Sparkles,
  Phone,
  MessageCircle,
  ChevronRight,
  CalendarDays,
  Camera,
  Train,
  X,
  Play,
  BookOpen,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { TEMPLES } from "../data/content";
import { useSEO } from "../lib/seo";
import { Breadcrumbs, Reveal, Faq, SectionHead, Stars } from "../components/ui";
import { TempleCard } from "../components/cards";
import { EnquiryForm, WhatsAppBand } from "../components/blocks";
import { TempleLiveDarshan } from "../components/temple/TempleLiveDarshan";
import { waLink } from "../lib/utils";

/* =========================================================
   DYNAMIC TEMPLE SEO HELPERS
   ========================================================= */

const SITE_NAME = "DivyaDhara";

const SITE_URL =
  typeof window !== "undefined" ? window.location.origin : "";

const STORY_VIDEO_OVERRIDES: Record<string, string> = {
  "kashi-vishwanath-varanasi": "XLeSpTW6XYI",
};

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function limitText(value: string, max: number) {
  const text = cleanText(value);

  if (text.length <= max) return text;

  const cut = text
    .slice(0, max - 1)
    .replace(/\s+\S*$/, "")
    .trim();

  return `${cut}…`;
}

function ensureMeta(
  nameOrProperty: "name" | "property",
  key: string,
) {
  const selector = `meta[${nameOrProperty}="${CSS.escape(key)}"]`;

  let el = document.head.querySelector<HTMLMetaElement>(selector);

  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(nameOrProperty, key);
    document.head.appendChild(el);
  }

  return el;
}

function setMeta(
  nameOrProperty: "name" | "property",
  key: string,
  content: string,
) {
  ensureMeta(nameOrProperty, key).setAttribute("content", content);
}

function ensureCanonical() {
  let link =
    document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );

  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }

  return link;
}

function upsertJsonLd(id: string, data: unknown) {
  let script =
    document.head.querySelector<HTMLScriptElement>(
      `script[data-divyadhara-schema="${CSS.escape(id)}"]`,
    );

  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-divyadhara-schema", id);
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);

  return script;
}

function getTempleArea(mapEmbedNote: string, city: string) {
  const first = cleanText(mapEmbedNote.split(",")[0] || "");
  return first || city;
}

function getFirstMeaningfulAarti(t: {
  aarti: { name: string; time: string; desc: string }[];
}) {
  return t.aarti?.[0]
    ? `${t.aarti[0].name} at ${t.aarti[0].time}`
    : "daily temple aarti";
}

/* =========================================================
   TEMPLE DETAIL
   ========================================================= */

export default function TempleDetail() {
  const { slug } = useParams();

  const t = TEMPLES.find((x) => x.slug === slug);

  const [storyVideoOpen, setStoryVideoOpen] = useState(false);

  /* ---------------------------------------------------------
     Backward-compatible Story Video field.
     --------------------------------------------------------- */

  const templeWithStory = t as
    | (NonNullable<typeof t> & { storyVideoId?: string })
    | undefined;

  const storyVideoId =
    templeWithStory?.storyVideoId ||
    (slug ? STORY_VIDEO_OVERRIDES[slug] : undefined);

  /* =========================================================
     DYNAMIC SEO DATA
     ========================================================= */

  const seoData = useMemo(() => {
    if (!t) {
      return {
        title: "Temple Not Found | DivyaDhara",
        description:
          "The requested temple page could not be found.",
        keywords: [
          "temples of India",
          "DivyaDhara",
          "spiritual places",
        ],
        area: "",
        canonical: `${SITE_URL}/temples/${slug || ""}`,
        url: `${SITE_URL}/temples/${slug || ""}`,
      };
    }

    const area = getTempleArea(t.mapEmbedNote, t.city);

    const categoryTerms = Array.isArray(t.category)
      ? t.category
      : [];

    const nearbyTerms = Array.isArray(t.nearby)
      ? t.nearby.slice(0, 8)
      : [];

    const keywordCandidates = [
      t.name,
      `${t.name} temple`,
      `${t.name} darshan`,
      `${t.name} darshan timings`,
      `${t.name} aarti timings`,
      `${t.name} temple history`,
      `${t.name} temple location`,
      `${t.name} how to reach`,
      `${t.name} live darshan`,
      `${t.city} temples`,
      `temples in ${t.city}`,
      `${t.city} pilgrimage`,
      `${t.state} temples`,
      `temples in ${t.state}`,
      `${t.district} temples`,
      `temples near ${area}`,
      `${area} temple`,
      t.deity,
      ...categoryTerms,
      ...nearbyTerms,
    ]
      .map(cleanText)
      .filter(Boolean);

    const keywords = Array.from(
      new Set(keywordCandidates),
    ).slice(0, 35);

    const title = limitText(
      `${t.name} in ${t.city} — Darshan, Aarti & Temple History | ${SITE_NAME}`,
      70,
    );

    const description = limitText(
      `${t.name} in ${area}, ${t.city}, ${t.state}: ${t.summary} Explore darshan timings, ${getFirstMeaningfulAarti(t)}, temple history, festivals, how to reach and nearby sacred places.`,
      158,
    );

    const url = `${SITE_URL}/temples/${t.slug}`;

    return {
      title,
      description,
      keywords,
      area,
      canonical: url,
      url,
    };
  }, [slug, t]);

  /* =========================================================
     USE SEO HOOK
     ========================================================= */

  useSEO({
    title: seoData.title,
    description: seoData.description,
    path: `/temples/${slug || ""}`,
    image: t?.image,
    schema: t
      ? {
          "@context": "https://schema.org",
          "@type": "TouristAttraction",
          name: t.name,
          description: seoData.description,
          url: seoData.url,
          image: t.image
            ? `${SITE_URL}${t.image}`
            : undefined,
          address: {
            "@type": "PostalAddress",
            streetAddress: seoData.area,
            addressLocality: t.city,
            addressRegion: t.state,
            addressCountry: "IN",
          },
          isAccessibleForFree: true,
          touristType: "Pilgrimage",
          sameAs: (t.sources || [])
            .map((source) => source.url)
            .filter(Boolean),
        }
      : undefined,
  });

  /* =========================================================
     DEEP DYNAMIC ON-PAGE SEO + JSON-LD
     ========================================================= */

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.title = seoData.title;

    setMeta("name", "description", seoData.description);
    setMeta("name", "keywords", seoData.keywords.join(", "));

    setMeta(
      "name",
      "robots",
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    );

    setMeta("name", "author", SITE_NAME);

    setMeta(
      "name",
      "geo.placename",
      t ? `${seoData.area}, ${t.city}` : "",
    );

    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:title", seoData.title);
    setMeta("property", "og:description", seoData.description);
    setMeta("property", "og:url", seoData.url);

    setMeta(
      "property",
      "og:image",
      t?.image
        ? `${SITE_URL}${t.image}`
        : `${SITE_URL}/images/aarti-night.jpeg`,
    );

    setMeta("property", "og:locale", "en_IN");

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", seoData.title);

    setMeta(
      "name",
      "twitter:description",
      seoData.description,
    );

    setMeta(
      "name",
      "twitter:image",
      t?.image
        ? `${SITE_URL}${t.image}`
        : `${SITE_URL}/images/aarti-night.jpeg`,
    );

    ensureCanonical().setAttribute("href", seoData.canonical);

    if (t) {
      const faqEntities = (t.faqs || [])
        .filter((item) => item.q && item.a)
        .map((item) => ({
          "@type": "Question",
          name: cleanText(item.q),
          acceptedAnswer: {
            "@type": "Answer",
            text: cleanText(item.a),
          },
        }));

      const graph: Record<string, unknown>[] = [
        {
          "@type": "WebPage",
          "@id": `${seoData.url}#webpage`,
          url: seoData.url,
          name: seoData.title,
          description: seoData.description,
          inLanguage: "en-IN",
          isPartOf: {
            "@type": "WebSite",
            name: SITE_NAME,
            url: SITE_URL,
          },
          primaryImageOfPage: t.image
            ? {
                "@type": "ImageObject",
                url: `${SITE_URL}${t.image}`,
              }
            : undefined,
          about: {
            "@type": "Thing",
            name: t.deity,
          },
        },
        {
          "@type": "TouristAttraction",
          "@id": `${seoData.url}#temple`,
          name: t.name,
          description: t.summary,
          url: seoData.url,
          image: t.image
            ? [`${SITE_URL}${t.image}`]
            : undefined,
          address: {
            "@type": "PostalAddress",
            streetAddress: seoData.area,
            addressLocality: t.city,
            addressRegion: t.state,
            addressCountry: "IN",
          },
          additionalType: "https://schema.org/Place",
          touristType: "Pilgrimage",
          isAccessibleForFree: true,
          hasMap: `https://www.google.com/maps?q=${encodeURIComponent(
            t.mapEmbedNote,
          )}`,
          sameAs: (t.sources || [])
            .map((source) => source.url)
            .filter(Boolean),
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: SITE_URL,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Temples",
              item: `${SITE_URL}/temples`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: t.name,
              item: seoData.url,
            },
          ],
        },
      ];

      if (faqEntities.length) {
        graph.push({
          "@type": "FAQPage",
          "@id": `${seoData.url}#faq`,
          mainEntity: faqEntities,
        });
      }

      upsertJsonLd(`${t.slug}-graph`, {
        "@context": "https://schema.org",
        "@graph": graph,
      });
    }

    return () => {
      const script =
        document.head.querySelector<HTMLScriptElement>(
          `script[data-divyadhara-schema="${CSS.escape(
            t ? `${t.slug}-graph` : "missing-temple",
          )}"]`,
        );

      script?.remove();
    };
  }, [seoData, t]);

  /* ---------------------------------------------------------
     Close Story modal with ESC and lock background scrolling.
     --------------------------------------------------------- */

  useEffect(() => {
    if (!storyVideoOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStoryVideoOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [storyVideoOpen]);

  /* =========================================================
     TEMPLE NOT FOUND
     ========================================================= */

  if (!t) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold">
          Temple not found
        </h1>

        <p className="mt-2 text-stone-500">
          This kshetra may be documented soon.
        </p>

        <Link
          to="/temples"
          className="btn-saffron mt-6 inline-block rounded-2xl px-6 py-3 text-sm font-bold text-white"
        >
          Back to temples
        </Link>
      </div>
    );
  }

  const wa = waLink(
    `Namaste! I want guidance for darshan at ${t.name}, ${t.city}. Please share Sugam Darshan / aarti / stay help.`,
  );

  /* =========================================================
     TEMPLE DETAIL PAGE
     ========================================================= */

  return (
    <>
      {/* =====================================================
          HERO
          ===================================================== */}

      <section className="relative overflow-hidden bg-char-900 text-white">
        <img
          src={t.image}
          alt={`${t.name}, ${t.city}`}
          className="kenburns absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-linear-to-t from-char-900 via-black/45 to-black/30" />

        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-16 md:px-6 md:pt-20 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Temples", href: "/temples" },
              { label: t.name },
            ]}
          />

          <div className="mt-6 flex flex-wrap gap-2">
            {t.category.map((c) => (
              <span
                key={c}
                className="rounded-full bg-amber-400/95 px-3 py-1 text-[11px] font-extrabold text-[#3a2415]"
              >
                {c}
              </span>
            ))}

            <Stars value={t.rating} />
          </div>

          <p className="font-sanskrit mt-4 text-xl text-amber-300">
            {t.sanskrit}
          </p>

          <h1 className="font-display mt-1 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            {t.name}
          </h1>

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-200">
            <span className="flex items-center gap-1.5">
              <MapPin size={15} className="text-amber-400" />
              {t.city}, {t.district}, {t.state}
            </span>

            <span className="flex items-center gap-1.5">
              <Sparkles size={15} className="text-amber-400" />
              {t.deity}
            </span>
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="btn-saffron flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white"
            >
              <MessageCircle size={16} />
              Darshan Enquiry
            </a>

            <a
              href="#timings"
              className="rounded-2xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold backdrop-blur transition hover:bg-white/20"
            >
              Darshan Timings
            </a>

            <a
              href="#aarti"
              className="rounded-2xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold backdrop-blur transition hover:bg-white/20"
            >
              Aarti & Festivals
            </a>

            {storyVideoId && (
              <button
                type="button"
                onClick={() => setStoryVideoOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-6 py-3 text-sm font-bold text-orange-800 shadow-lg transition hover:bg-amber-100"
                aria-label={`Watch the Temple Story of ${t.name}`}
              >
                <BookOpen size={16} />
                Temple Story
                <Play size={14} fill="currentColor" />
              </button>
            )}
          </div>

          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-stone-200">
            Discover {t.name} in {seoData.area}, {t.city},{" "}
            {t.state} — including temple history, darshan timings,
            aarti schedule, festivals, pilgrimage information,
            route guidance and nearby sacred places.
          </p>
        </div>
      </section>

      {/* =====================================================
          MAIN CONTENT
          Single-column layout: enquiry form is now at the bottom.
          ===================================================== */}

      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <div className="min-w-0">
          {/* ABOUT + HISTORY */}

          <Reveal>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
              About the Kshetra · {t.tradition}
            </p>

            <p className="mt-3 text-[17px] font-medium leading-relaxed text-[#3a2415]">
              {t.summary}
            </p>

            <p className="mt-2 text-sm text-stone-500">
              Established: {t.established} · Trust: {t.trust}
            </p>
          </Reveal>

          <Reveal className="mt-8">
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              History & Significance
            </h2>

            <div className="prose-sacred mt-4">
              {t.history.map((h, i) => (
                <p key={i}>{h}</p>
              ))}

              <ul>
                {t.significance.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* LOCAL + PROGRAMMATIC SEO CONTENT */}

          <Reveal className="mt-10">
            <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[#2a1a10]">
              <MapPin size={22} className="text-orange-600" />
              {t.name} — {seoData.area}, {t.city}, {t.state}
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
                  Temple
                </p>
                <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                  {t.name}
                </p>
                <p className="mt-1 text-xs text-stone-500">{t.deity}</p>
              </div>

              <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
                  Area
                </p>
                <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                  {seoData.area}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {t.mapEmbedNote}
                </p>
              </div>

              <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
                  City / District
                </p>
                <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                  {t.city}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {t.district}
                </p>
              </div>

              <div className="rounded-2xl border border-orange-900/10 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
                  State
                </p>
                <p className="mt-1 text-sm font-bold text-[#2a1a10]">
                  {t.state}
                </p>
                <p className="mt-1 text-xs text-stone-500">India</p>
              </div>
            </div>

            <div className="mt-4 rounded-3xl bg-linear-to-br from-orange-50 to-amber-50 p-5 ring-1 ring-orange-200 md:p-6">
              <p className="text-sm leading-relaxed text-stone-700">
                Plan a pilgrimage to {t.name} in {t.city},{" "}
                {t.state}. This page brings together
                location-specific information for devotees searching
                for {t.name} darshan, {t.name} aarti,{" "}
                {t.name} temple history, temples in {t.city}, and
                sacred places around {seoData.area}. Please verify
                ritual schedules and local access rules before travel
                because temple operations can change.
              </p>
            </div>
          </Reveal>

          {/* DARSHAN TIMINGS */}

          <Reveal className="mt-10">
            <h2
              id="timings"
              className="font-display flex scroll-mt-28 items-center gap-2 text-2xl font-semibold text-[#2a1a10]"
            >
              <Clock size={22} className="text-orange-600" />
              Darshan Timings
            </h2>

            <div className="mt-4 overflow-hidden rounded-2xl border border-orange-900/10">
              {t.darshanTimings.map((d, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-4 px-5 py-3.5 text-sm ${
                    i % 2 ? "bg-orange-50/60" : "bg-white"
                  }`}
                >
                  <span className="font-semibold text-stone-700">
                    {d.label}
                  </span>
                  <span className="shrink-0 rounded-full bg-[#2a1a10] px-3 py-1 text-[12px] font-bold text-amber-200">
                    {d.time}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* AARTI + LIVE DARSHAN */}

          <Reveal className="mt-10">
            <h2
              id="aarti"
              className="font-display flex scroll-mt-28 items-center gap-2 text-2xl font-semibold text-[#2a1a10]"
            >
              <Flame size={22} className="text-orange-600" />
              Aarti & Live Darshan
            </h2>

            <TempleLiveDarshan
              templeName={t.name}
              liveAarti={t.liveAarti}
            />

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {t.aarti.map((a) => (
                <div
                  key={a.name}
                  className="rounded-2xl border border-orange-900/10 bg-white p-4 sacred-border"
                >
                  <p className="font-display font-semibold text-[#2a1a10]">
                    {a.name}
                  </p>
                  <p className="text-xs font-bold text-orange-700">
                    {a.time}
                  </p>
                  <p className="mt-1.5 text-[13px] text-stone-600">
                    {a.desc}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* FESTIVALS */}

          <Reveal className="mt-10">
            <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[#2a1a10]">
              <CalendarDays size={22} className="text-orange-600" />
              Festivals
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {t.festivals.map((f) => (
                <div
                  key={f.name}
                  className="rounded-2xl bg-linear-to-br from-orange-50 to-amber-50 p-4 ring-1 ring-orange-200"
                >
                  <p className="text-[11px] font-bold uppercase tracking-widest text-orange-700">
                    {f.month}
                  </p>
                  <p className="font-display font-semibold text-[#2a1a10]">
                    {f.name}
                  </p>
                  <p className="mt-1 text-[13px] text-stone-600">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* TRUST + PANDITS */}

          <Reveal className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-orange-900/10 bg-white p-6 sacred-border">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold">
                <Users size={18} className="text-orange-600" />
                Trust & Committee
              </h3>

              <p className="mt-1 text-sm font-semibold text-orange-800">
                {t.trust}
              </p>

              <ul className="mt-3 space-y-2">
                {t.committee.map((c) => (
                  <li
                    key={c.name}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span className="font-semibold text-stone-700">
                      {c.name}
                    </span>
                    <span className="text-stone-500">{c.role}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl bg-char-900 p-6 text-white">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold">
                <Phone size={18} className="text-amber-400" />
                Pandit & Trust Contact
              </h3>

              <p className="mt-2 text-sm text-stone-300">
                For abhishek, sankalpa and festival sevas, our
                kshetra desk connects you to authorised temple
                pandits.
              </p>

              <div className="mt-4 flex gap-2">
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2.5 text-[13px] font-bold"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </a>

                <Link
                  to="/pandits"
                  className="flex-1 rounded-xl border border-white/20 px-3 py-2.5 text-center text-[13px] font-bold"
                >
                  Find Pandit
                </Link>
              </div>

              <p className="mt-3 text-[11px] text-stone-400">
                Personal contact numbers are shared only after
                verified booking, per temple policy.
              </p>
            </div>
          </Reveal>

          {/* FACILITIES */}

          <Reveal className="mt-10">
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Facilities
            </h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {t.facilities.map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-emerald-50 px-3.5 py-1.5 text-[13px] font-semibold text-emerald-900 ring-1 ring-emerald-200"
                >
                  ✓ {f}
                </span>
              ))}
            </div>
          </Reveal>

          {/* HOW TO REACH + MAP */}

          <Reveal className="mt-10">
            <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[#2a1a10]">
              <Train size={22} className="text-orange-600" />
              How to Reach & Location
            </h2>

            <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-500">
              <MapPin size={14} className="text-orange-600" />
              {t.mapEmbedNote}
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {t.howToReach.map((h) => (
                <div
                  key={h.mode}
                  className="rounded-2xl border border-orange-900/10 bg-white p-4"
                >
                  <p className="text-xs font-extrabold uppercase tracking-widest text-orange-700">
                    {h.mode}
                  </p>
                  <p className="mt-1 text-[13px] text-stone-600">
                    {h.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-3xl border border-orange-900/10">
              <iframe
                title={`Map of ${t.name}`}
                src={`https://www.google.com/maps?q=${encodeURIComponent(
                  t.mapEmbedNote,
                )}&output=embed`}
                className="h-64 w-full"
                loading="lazy"
              />
            </div>
          </Reveal>

          {/* GALLERY */}

          <Reveal className="mt-10">
            <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[#2a1a10]">
              <Camera size={22} className="text-orange-600" />
              Gallery Glimpses
            </h2>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                t.image,
                "/images/aarti-night.jpeg",
                "/images/puja-thali.jpeg",
              ].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${t.name} glimpse ${i + 1}`}
                  loading="lazy"
                  className="h-32 rounded-2xl object-cover md:h-44"
                />
              ))}
            </div>

            <Link
              to="/gallery"
              className="mt-3 inline-block text-sm font-bold text-orange-700 underline underline-offset-4"
            >
              Open full gallery →
            </Link>
          </Reveal>

          {/* DYNAMIC INTERNAL LINKING */}

          <Reveal className="mt-10">
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Explore More Temples Around {t.city}
            </h2>

            <p className="mt-2 text-sm text-stone-500">
              Continue your pilgrimage through related temples in{" "}
              {t.city}, {t.district} and {t.state}.
            </p>

            {(() => {
              const related = TEMPLES.filter(
                (x) => x.slug !== t.slug,
              )
                .map((x) => {
                  const sameCity =
                    x.city.toLowerCase() === t.city.toLowerCase();

                  const sameDistrict =
                    x.district.toLowerCase() ===
                    t.district.toLowerCase();

                  const sameState =
                    x.state.toLowerCase() === t.state.toLowerCase();

                  const sameCategory = x.category.some((c) =>
                    t.category.includes(c),
                  );

                  const score =
                    (sameCity ? 4 : 0) +
                    (sameDistrict ? 3 : 0) +
                    (sameState ? 2 : 0) +
                    (sameCategory ? 1 : 0);

                  return { temple: x, score };
                })
                .filter((item) => item.score > 0)
                .sort(
                  (a, b) =>
                    b.score - a.score ||
                    a.temple.name.localeCompare(b.temple.name),
                )
                .slice(0, 6)
                .map((item) => item.temple);

              if (!related.length) {
                return (
                  <div className="mt-4 rounded-2xl border border-orange-900/10 bg-orange-50/50 p-4 text-sm text-stone-600">
                    Explore the complete temple directory for more
                    pilgrimage destinations.
                  </div>
                );
              }

              return (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {related.map((relatedTemple) => (
                    <Link
                      key={relatedTemple.slug}
                      to={`/temples/${relatedTemple.slug}`}
                      className="group rounded-2xl border border-orange-900/10 bg-white p-4 transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50/40"
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
                        {relatedTemple.city} · {relatedTemple.state}
                      </p>

                      <p className="mt-1 font-display font-semibold text-[#2a1a10] group-hover:text-orange-800">
                        {relatedTemple.name}
                      </p>

                      <p className="mt-1 text-xs text-stone-500">
                        {relatedTemple.deity} ·{" "}
                        {relatedTemple.category.slice(0, 2).join(" · ")}
                      </p>
                    </Link>
                  ))}
                </div>
              );
            })()}
          </Reveal>

          {/* NEARBY SPIRITUAL PLACES */}

          <Reveal className="mt-10">
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Nearby Spiritual Places
            </h2>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {t.nearby.map((n) => (
                <Link
                  key={n}
                  to="/spiritual-places"
                  className="flex items-center justify-between rounded-xl bg-orange-50/70 px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-orange-100 transition hover:bg-orange-50"
                >
                  {n}
                  <ChevronRight size={15} className="text-orange-500" />
                </Link>
              ))}
            </div>
          </Reveal>

          {/* FAQ */}

          <Reveal className="mt-10">
            <h2 className="font-display text-2xl font-semibold text-[#2a1a10]">
              Pilgrim FAQs
            </h2>

            <div className="mt-4">
              <Faq items={t.faqs} />
            </div>
          </Reveal>
        </div>
      </div>

      {/* =====================================================
          WHATSAPP BAND
          ===================================================== */}

      <div className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <WhatsAppBand
          title={`Visiting ${t.city}? Let us arrange everything.`}
          sub="Sugam darshan tickets, aarti passes, pandit sankalpa, sattvic stay and local transport — one WhatsApp message."
          message={`Namaste! I'm visiting ${t.name}. Please help with darshan + stay.`}
        />
      </div>

      {/* =====================================================
          MORE SACRED KSHETRAS
          ===================================================== */}

      <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <SectionHead
          eyebrow="Continue the Yatra"
          title="More Sacred Kshetras"
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLES.filter((x) => x.slug !== t.slug)
            .slice(0, 4)
            .map((x, i) => (
              <TempleCard key={x.slug} t={x} i={i} />
            ))}
        </div>
      </section>

      {/* =====================================================
          TEMPLE ENQUIRY FORM
          Full-width premium panel after More Sacred Kshetras.
          The EnquiryForm component retains its own form fields,
          validation and submission handling.
          ===================================================== */}

      <section
        id="temple-enquiry"
        className="relative overflow-hidden bg-[#f8f3eb] py-14 md:py-20"
      >
        {/* Decorative background */}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          {/* Section heading */}

          <div className="mx-auto mb-9 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white/80 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-orange-800 shadow-sm">
              <Sparkles size={14} />
              DivyaDhara · Temple Assistance
            </span>

            <h2 className="font-display mt-5 text-3xl font-semibold leading-tight text-[#2a1a10] md:text-4xl lg:text-5xl">
              Plan Your Visit to{" "}
              <span className="text-orange-700">{t.name}</span>
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-600 md:text-base">
              Share your pilgrimage plans with us. Enquire about
              darshan guidance, aarti information, local travel and
              accommodation assistance for your visit to {t.name},{" "}
              {t.city}.
            </p>
          </div>

          {/* Premium enquiry layout */}

          <div className="grid items-stretch gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-8">
            {/* Left information panel */}

            <div className="relative flex flex-col overflow-hidden rounded-[2rem] bg-char-900 p-6 text-white shadow-xl md:p-8 lg:p-9">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-amber-300/15"
              />

              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-5 -top-5 h-32 w-32 rounded-full border border-amber-300/15"
              />

              <div className="relative">
                <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-amber-300">
                  <span className="h-2 w-2 rounded-full bg-amber-300" />
                  Your pilgrimage, thoughtfully planned
                </span>

                <h3 className="font-display mt-5 text-2xl font-semibold leading-snug md:text-3xl">
                  A little guidance can make your yatra easier.
                </h3>

                <p className="mt-4 text-sm leading-7 text-stone-300">
                  Let us know what you need for your temple visit.
                  Our enquiry team can help you understand the next
                  steps and available assistance.
                </p>

                <div className="mt-7 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20">
                      <CheckCircle2 size={19} />
                    </span>

                    <div>
                      <p className="text-sm font-bold text-white">
                        Darshan guidance
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-400">
                        Enquire about visit planning and temple
                        access information.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20">
                      <Flame size={19} />
                    </span>

                    <div>
                      <p className="text-sm font-bold text-white">
                        Aarti and seva information
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-400">
                        Ask about schedules, rituals and local
                        arrangements. Confirmation may be required.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20">
                      <MapPin size={19} />
                    </span>

                    <div>
                      <p className="text-sm font-bold text-white">
                        Travel and stay assistance
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-400">
                        Enquire about nearby transport, accommodation
                        and practical travel details.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Temple details */}

              <div className="relative mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-300">
                  Your selected kshetra
                </p>

                <p className="font-display mt-2 text-lg font-semibold">
                  {t.name}
                </p>

                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-stone-300">
                  <MapPin
                    size={15}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />
                  {t.city}, {t.district}, {t.state}
                </p>

                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-stone-300">
                  <Sparkles
                    size={15}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />
                  Deity: {t.deity}
                </p>
              </div>

              {/* WhatsApp alternative */}

              <div className="relative mt-auto pt-6">
                <p className="text-xs leading-5 text-stone-400">
                  Prefer WhatsApp? You can send your enquiry directly
                  through the temple assistance link.
                </p>

                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-extrabold text-white transition hover:bg-[#1fb95a] focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 focus:ring-offset-char-900"
                >
                  <MessageCircle size={18} />
                  Enquire on WhatsApp
                  <ArrowRight size={16} />
                </a>

                <p className="mt-3 text-center text-[10px] leading-5 text-stone-500">
                  Temple timings, availability and services should be
                  confirmed with the relevant temple authorities.
                </p>
              </div>
            </div>

            {/* Right form panel */}

            <div className="min-w-0 overflow-hidden rounded-[2rem] border border-orange-900/10 bg-white p-4 shadow-[0_20px_70px_rgba(64,35,15,0.10)] sm:p-6 md:p-8 lg:p-9">
              <div className="mb-6 border-b border-orange-900/10 pb-5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-orange-700">
                  Temple enquiry form
                </p>

                <h3 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                  Tell us about your visit
                </h3>

                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Complete the form below and submit your enquiry.
                  Fields and submission behaviour are managed by
                  DivyaDhara&apos;s shared enquiry form component.
                </p>
              </div>

              <EnquiryForm
                context={[
                  "Temple darshan enquiry",
                  `Temple: ${t.name}`,
                  `City: ${t.city}`,
                  `District: ${t.district}`,
                  `State: ${t.state}`,
                  `Deity: ${t.deity}`,
                  `Temple slug: ${t.slug}`,
                ].join(" | ")}
                title={`Plan Your Visit to ${t.name}`}
                compact={false}
                leadType="contact"
                formKey="temple_enquiry"
                sourceType="form"
                pagePath={`/temples/${t.slug}`}
                serviceType="temple_darshan"
              />
            </div>
          </div>

          {/* Reassurance note */}

          <div className="mx-auto mt-6 flex max-w-3xl items-start justify-center gap-2 text-center text-xs leading-5 text-stone-500">
            <CheckCircle2
              size={15}
              className="mt-0.5 shrink-0 text-emerald-700"
            />
            <p>
              Submitting an enquiry does not guarantee a booking,
              priority darshan or a temple service. Any arrangements
              depend on confirmation and the applicable temple rules.
            </p>
          </div>
        </div>
      </section>

      {/* =====================================================
          TEMPLE STORY MODAL
          YouTube story/history opens in-page.
          The iframe is unmounted when the modal closes.
          ===================================================== */}

      {storyVideoOpen && storyVideoId && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="temple-story-title"
          onClick={() => setStoryVideoOpen(false)}
        >
          <div
            className="w-full max-w-5xl overflow-hidden rounded-3xl border border-orange-200 bg-[#fffaf3] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-orange-200 bg-linear-to-r from-orange-700 via-orange-600 to-amber-500 px-4 py-4 text-white md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-xl">
                  ॐ
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-100">
                    Sacred Temple Story
                  </p>

                  <h2
                    id="temple-story-title"
                    className="truncate font-display text-lg font-semibold md:text-xl"
                  >
                    {t.name}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStoryVideoOpen(false)}
                aria-label="Close Temple Story"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
              >
                <X size={21} />
              </button>
            </div>

            <div className="aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${storyVideoId}?rel=0&playsinline=1`}
                title={`Temple Story — ${t.name}`}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-orange-100 bg-[#fffaf3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-[#2a1a10]">
                  <BookOpen size={16} className="text-orange-600" />
                  {t.name} — Temple History & Sacred Story
                </p>

                <p className="mt-1 text-xs text-stone-500">
                  Story video for devotees exploring the temple&apos;s
                  history, traditions and spiritual significance.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStoryVideoOpen(false)}
                className="rounded-xl bg-[#2a1a10] px-4 py-2.5 text-xs font-bold text-amber-200 transition hover:bg-black"
              >
                Close Story
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}