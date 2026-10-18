import { Link } from "react-router-dom";
import {
  HeartHandshake,
  Eye,
  Compass,
  Users,
  Landmark,
  BookOpen,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

import { useSEO, orgSchema } from "../lib/seo";
import { Breadcrumbs, Reveal, SectionHead, Counter } from "../components/ui";
import { PageHero, WhatsAppBand } from "../components/blocks";

const missionValues = [
  {
    icon: Eye,
    title: "Mission",
    description:
      "Make every darshan, puja and yatra simple, transparent and shastra-true — for every Indian family, in their own language.",
  },
  {
    icon: Compass,
    title: "Vision",
    description:
      "A Bharat where no devotee feels lost: the right temple, pandit, muhurat and route — one trusted search away.",
  },
  {
    icon: HeartHandshake,
    title: "Philosophy",
    description:
      "Shraddha with viveka — deep devotion guided by knowledge. We document, verify and explain; the shraddha remains yours.",
  },
];

const platformStats = [
  { value: 1200, suffix: "+", label: "Temples documented" },
  { value: 350, suffix: "+", label: "Verified pandits" },
  { value: 52000, suffix: "+", label: "Pilgrims guided" },
  { value: 40, suffix: "+", label: "Sacred kshetras served" },
];

const trustCommitments = [
  {
    icon: ShieldCheck,
    title: "Verified, never anonymous",
    description:
      "Government ID, guru/parampara reference and mantra-path review for every pandit. No fake reviews — ever.",
  },
  {
    icon: BookOpen,
    title: "Source-first documentation",
    description:
      "Timings, vidhis and histories recorded with temple trusts and practising archakas — not scraped.",
  },
  {
    icon: Users,
    title: "Seva team in 7 languages",
    description:
      "Hindi, English, Tamil, Telugu, Kannada, Marathi, Bengali — real humans on call and WhatsApp.",
  },
  {
    icon: Landmark,
    title: "Dharma-first commerce",
    description:
      "Transparent dakshina, printed receipts on yatras, and free guidance that never expires after payment.",
  },
];

const sevaTeams = [
  {
    title: "Vedic Board",
    description:
      "Vedic Advisory Board — Kashi Vidvat Parishad scholars review every vidhi and muhurat.",
  },
  {
    title: "Researchers",
    description:
      "Kshetra Researchers — on-ground documentation across 7 states and counting.",
  },
  {
    title: "Yatra Team",
    description:
      "Yatra Operations — ex-tourism professionals running sattvic, senior-friendly batches.",
  },
  {
    title: "Seva Desk",
    description:
      "Seva Desk — pilgrim support in 7 languages, 7 AM – 10 PM IST.",
  },
];

export default function About() {
  useSEO({
    title: "About DivyaDhara | Mission, Trust & Spiritual Heritage",
    description:
      "Learn about DivyaDhara's mission, philosophy and seva: explore Indian temples, puja traditions, pandit discovery and pilgrimage guidance with a focus on verification and spiritual heritage.",
    path: "/about",
    schema: orgSchema(),
  });

  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-clip bg-[#fffdf8] text-[#2a1a10]"
    >
      {/* Primary page heading and hero image */}
      <PageHero
        eyebrow="About · Our Sankalpa"
        title="Carrying Bharat's Sacred Light, Digitally"
        sub="We are sevaks first, technologists second — building the trusted bridge between timeless tradition and modern pilgrims."
        image="/images/hero-varanasi.jpeg"
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "About" },
          ]}
        />

        {/* Brand story */}
        <section
          id="our-story"
          aria-labelledby="about-story-heading"
          className="mt-8 grid items-center gap-8 sm:mt-10 sm:gap-10 lg:grid-cols-2 lg:gap-12"
        >
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-700">
              Our Story
            </p>

            <h2
              id="about-story-heading"
              className="mt-2 font-display text-2xl font-semibold leading-tight tracking-tight text-[#2a1a10] sm:text-3xl lg:text-4xl"
            >
              Born on the ghats of Kashi, built for all of Bharat.
            </h2>

            <div className="prose-sacred mt-4 space-y-4 text-sm leading-7 text-stone-700 sm:text-base sm:leading-8">
              <p>
                DivyaDhara began with a simple observation: millions of devotees
                struggle with the practical side of devotion — which pandit to
                trust, what the correct vidhi is, when the temple opens, how to
                plan a yatra with elderly parents.
              </p>

              <p>
                We spent months with archakas in Kashi, Gurukkals in Madurai,
                Rawals in Ukhimath and Bhattars in Tirupati — documenting
                timings, vidhis and maryadas directly from the source. That
                fieldwork became this platform: verified pandits, transparent
                pricing, real darshan data and acharya-led learning.
              </p>

              <p>
                Today DivyaDhara guides pilgrims across Jyotirlingas, Char Dham,
                Shakti shrines and ashram circuits — while keeping one rule
                above all: <strong>never commercialise faith; always serve it.</strong>
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <figure className="relative isolate overflow-hidden rounded-3xl shadow-lg shadow-orange-950/10">
              <img
                src="/images/ashram-dawn.jpeg"
                alt="Ashram at dawn"
                loading="lazy"
                decoding="async"
                className="h-[300px] w-full object-cover sm:h-[380px] lg:h-[460px]"
                sizes="(min-width: 1024px) 50vw, (min-width: 640px) 100vw, 100vw"
              />
              <figcaption className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/65 p-4 text-white shadow-lg backdrop-blur sm:inset-x-4 sm:bottom-4 sm:p-5">
                <p className="font-sanskrit text-lg text-amber-300 sm:text-xl">
                  ॥ सेवा परमो धर्मः ॥
                </p>
                <p className="mt-1 text-sm leading-6 text-stone-100">
                  Seva is the highest dharma — our team's operating mantra.
                </p>
              </figcaption>
            </figure>
          </Reveal>
        </section>

        {/* Mission, vision and philosophy */}
        <section
          aria-label="DivyaDhara mission, vision and philosophy"
          className="mt-10 grid gap-4 sm:mt-12 md:grid-cols-3 md:gap-5 lg:mt-14"
        >
          {missionValues.map(({ icon: Icon, title, description }, index) => (
            <Reveal key={title} delay={index * 0.08}>
              <article className="sacred-border group h-full rounded-2xl border border-orange-900/10 bg-white p-6 text-center shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md sm:rounded-3xl sm:p-7">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-orange-600 to-amber-500 text-white shadow-sm">
                  <Icon size={21} aria-hidden="true" />
                </span>

                <h3 className="mt-4 font-display text-lg font-semibold text-[#2a1a10] sm:text-xl">
                  {title}
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-600 sm:leading-7">
                  {description}
                </p>
              </article>
            </Reveal>
          ))}
        </section>

        {/* Platform statistics: values retained from the supplied source */}
        <section
          aria-labelledby="about-statistics-heading"
          className="mt-8 rounded-3xl bg-char-900 px-5 py-8 text-white sm:mt-10 sm:px-8 sm:py-10 lg:mt-14 lg:rounded-4xl lg:px-12 lg:py-12"
        >
          <h2 id="about-statistics-heading" className="sr-only">
            DivyaDhara platform statistics
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-8 text-center md:grid-cols-4 md:gap-6">
            {platformStats.map(({ value, suffix, label }) => (
              <div key={label}>
                <dt className="font-display text-2xl font-bold leading-tight text-amber-300 sm:text-3xl lg:text-4xl">
                  <Counter to={value} suffix={suffix} />
                </dt>
                <dd className="mt-2 text-xs leading-5 text-stone-300 sm:text-sm">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Trust and verification */}
        <section
          id="trust-verification"
          aria-label="Trust and verification commitments"
          className="mt-12 sm:mt-14"
        >
          <SectionHead
            eyebrow="Trust & Verification"
            title="Why devotees trust DivyaDhara"
          />

          <div className="mt-7 grid gap-4 sm:mt-8 sm:grid-cols-2">
            {trustCommitments.map(({ icon: Icon, title, description }, index) => (
              <Reveal key={title} delay={index * 0.06}>
                <article className="sacred-border flex h-full items-start gap-3 rounded-2xl border border-orange-900/10 bg-white p-4 shadow-sm sm:gap-4 sm:rounded-3xl sm:p-6">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-900 text-amber-300 sm:h-12 sm:w-12 sm:rounded-2xl">
                    <Icon size={20} aria-hidden="true" />
                  </span>

                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold leading-snug text-[#2a1a10] sm:text-lg">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-stone-600 sm:leading-7">
                      {description}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Seva team */}
        <section
          id="seva-team"
          aria-label="DivyaDhara seva team"
          className="mt-12 sm:mt-14"
        >
          <SectionHead
            eyebrow="Sevaks"
            title="Guided by tradition, run with care"
            sub="A small Varanasi-rooted team of researchers, yatra experts and Vedic advisors."
          />

          <div className="mt-7 grid gap-4 sm:mt-8 sm:grid-cols-2 lg:grid-cols-4">
            {sevaTeams.map(({ title, description }, index) => (
              <Reveal key={title} delay={index * 0.07}>
                <article className="h-full rounded-2xl bg-linear-to-br from-orange-50 to-amber-50 p-5 ring-1 ring-orange-200 transition duration-300 hover:-translate-y-1 hover:shadow-md sm:rounded-3xl sm:p-6">
                  <h3 className="font-display text-base font-semibold text-[#2a1a10] sm:text-lg">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600 sm:leading-7">
                    {description}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Seva network CTA */}
        <section aria-label="Join the DivyaDhara seva network" className="mt-10 sm:mt-12">
          <WhatsAppBand
            title="Want to serve with us?"
            sub="Pandits, guides, translators and photographers — join the DivyaDhara seva network."
            message="Namaste! I want to join DivyaDhara as a seva partner (pandit/guide/translator)."
          />
        </section>

        <div className="mt-7 text-center sm:mt-8">
          <Link
            to="/contact"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-orange-700 underline decoration-orange-300 underline-offset-4 transition hover:text-orange-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
          >
            Contact us
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
