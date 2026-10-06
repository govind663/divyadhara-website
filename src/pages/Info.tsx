import { useState } from "react";
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
  MapPin,
  Phone,
  Mail,
  MessageCircle,
  Send,
  CheckCircle2,
} from "lucide-react";
import { useSEO, orgSchema } from "../lib/seo";
import { Breadcrumbs, Reveal, SectionHead, Counter } from "../components/ui";
import { PageHero, WhatsAppBand } from "../components/blocks";
import { waLink, DISPLAY_PHONE, CONTACT_EMAIL } from "../lib/utils";

const OFFICE_ADDRESS =
  "Nav Durga Niwas, Plot No. 473, Sector 4, Ghansoli, Navi Mumbai – 400701, Maharashtra, India";

const OFFICE_MAP_URL =
  "https://www.google.com/maps?q=Nav+Durga+Niwas,+Plot+No.+473,+Sector+4,+Ghansoli,+Navi+Mumbai+400701,+Maharashtra,+India&output=embed";

const OFFICE_MAP_SEARCH_URL =
  "https://www.google.com/maps/search/?api=1&query=Nav+Durga+Niwas,+Plot+No.+473,+Sector+4,+Ghansoli,+Navi+Mumbai+400701,+Maharashtra,+India";

export function About() {
  useSEO({
    title: "About DivyaDhara — Mission, Trust & Philosophy | DivyaDhara",
    description:
      "DivyaDhara is India's premium digital spiritual ecosystem — our story, mission, philosophy, verification promise and community seva.",
    path: "/about",
    schema: orgSchema(),
  });

  return (
    <>
      <PageHero
        eyebrow="About · Our Sankalpa"
        title="Carrying Bharat's Sacred Light, Digitally"
        sub="We are sevaks first, technologists second — building the trusted bridge between timeless tradition and modern pilgrims."
        image="/images/hero-varanasi.jpeg"
      />

      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "About" },
          ]}
        />

        <div className="mt-10 grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-700">
              Our Story
            </p>

            <h2 className="font-display mt-2 text-3xl font-semibold md:text-4xl">
              Born on the ghats of Kashi, built for all of Bharat.
            </h2>

            <div className="prose-sacred mt-4">
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
                above all:{" "}
                <strong>never commercialise faith; always serve it.</strong>
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative overflow-hidden rounded-4xl">
              <img
                src="/images/ashram-dawn.jpeg"
                alt="Ashram at dawn"
                className="h-105 w-full object-cover"
              />

              <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-black/55 p-5 text-white backdrop-blur">
                <p className="font-sanskrit text-lg text-amber-300">
                  ॥ सेवा परमो धर्मः ॥
                </p>
                <p className="text-sm text-stone-200">
                  Seva is the highest dharma — our team's operating mantra.
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        {/* mission vision */}
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            {
              i: <Eye size={20} />,
              t: "Mission",
              d: "Make every darshan, puja and yatra simple, transparent and shastra-true — for every Indian family, in their own language.",
            },
            {
              i: <Compass size={20} />,
              t: "Vision",
              d: "A Bharat where no devotee feels lost: the right temple, pandit, muhurat and route — one trusted search away.",
            },
            {
              i: <HeartHandshake size={20} />,
              t: "Philosophy",
              d: "Shraddha with viveka — deep devotion guided by knowledge. We document, verify and explain; the shraddha remains yours.",
            },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.08}>
              <div className="sacred-border h-full rounded-3xl border border-orange-900/10 bg-white p-7 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-orange-600 to-amber-500 text-white">
                  {c.i}
                </span>

                <h3 className="font-display mt-3 text-xl font-semibold">
                  {c.t}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-stone-600">
                  {c.d}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* stats + trust */}
        <div className="mt-14 rounded-4xl bg-char-900 p-8 text-white md:p-12">
          <div className="grid gap-8 text-center md:grid-cols-4">
            {[
              { v: 1200, s: "+", l: "Temples documented" },
              { v: 350, s: "+", l: "Verified pandits" },
              { v: 52000, s: "+", l: "Pilgrims guided" },
              { v: 40, s: "+", l: "Sacred kshetras served" },
            ].map((x) => (
              <div key={x.l}>
                <p className="font-display text-4xl font-bold text-amber-300">
                  <Counter to={x.v} suffix={x.s} />
                </p>
                <p className="mt-1 text-sm text-stone-300">{x.l}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14">
          <SectionHead
            eyebrow="Trust & Verification"
            title="Why devotees trust DivyaDhara"
          />

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                i: <ShieldCheck size={20} />,
                t: "Verified, never anonymous",
                d: "Government ID, guru/parampara reference and mantra-path review for every pandit. No fake reviews — ever.",
              },
              {
                i: <BookOpen size={20} />,
                t: "Source-first documentation",
                d: "Timings, vidhis and histories recorded with temple trusts and practising archakas — not scraped.",
              },
              {
                i: <Users size={20} />,
                t: "Seva team in 7 languages",
                d: "Hindi, English, Tamil, Telugu, Kannada, Marathi, Bengali — real humans on call and WhatsApp.",
              },
              {
                i: <Landmark size={20} />,
                t: "Dharma-first commerce",
                d: "Transparent dakshina, printed receipts on yatras, and free guidance that never expires after payment.",
              },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 0.06}>
                <div className="sacred-border flex items-start gap-4 rounded-3xl border border-orange-900/10 bg-white p-6">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-900 text-amber-300">
                    {c.i}
                  </span>

                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      {c.t}
                    </h3>
                    <p className="mt-1 text-sm text-stone-600">{c.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* team */}
        <div className="mt-14">
          <SectionHead
            eyebrow="Sevaks"
            title="Guided by tradition, run with care"
            sub="A small Varanasi-rooted team of researchers, yatra experts and Vedic advisors."
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Vedic Advisory Board — Kashi Vidvat Parishad scholars review every vidhi and muhurat.",
              "Kshetra Researchers — on-ground documentation across 7 states and counting.",
              "Yatra Operations — ex-tourism professionals running sattvic, senior-friendly batches.",
              "Seva Desk — pilgrim support in 7 languages, 7 AM – 10 PM IST.",
            ].map((t, i) => (
              <Reveal key={i} delay={i * 0.07}>
                <div className="h-full rounded-3xl bg-linear-to-br from-orange-50 to-amber-50 p-6 ring-1 ring-orange-200">
                  <p className="font-display text-lg font-semibold text-[#2a1a10]">
                    {
                      [
                        "Vedic Board",
                        "Researchers",
                        "Yatra Team",
                        "Seva Desk",
                      ][i]
                    }
                  </p>

                  <p className="mt-2 text-sm text-stone-600">{t}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="mt-12">
          <WhatsAppBand
            title="Want to serve with us?"
            sub="Pandits, guides, translators and photographers — join the DivyaDhara seva network."
            message="Namaste! I want to join DivyaDhara as a seva partner (pandit/guide/translator)."
          />
        </div>

        <p className="mt-8 text-center">
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 text-sm font-bold text-orange-700 underline underline-offset-4"
          >
            Contact us <ArrowRight size={15} />
          </Link>
        </p>
      </div>
    </>
  );
}

export function Contact() {
  useSEO({
    title: "Contact DivyaDhara — Seva Desk, WhatsApp & Address",
    description:
      "Reach DivyaDhara: Navi Mumbai office address, phone, email, WhatsApp seva desk and contact form. Replies within a few hours, 7 AM – 10 PM IST.",
    path: "/contact",
  });

  const [f, setF] = useState({
    name: "",
    phone: "",
    topic: "General",
    message: "",
  });

  const [done, setDone] = useState(false);

  const input =
    "w-full rounded-xl border border-orange-900/15 bg-white px-4 py-3 text-sm outline-none placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200";

  const phoneHref = `tel:${DISPLAY_PHONE.replace(/[^\d+]/g, "")}`;
  const emailHref = `mailto:${CONTACT_EMAIL}`;

  return (
    <>
      <PageHero
        eyebrow="Sampark · Contact"
        title="We're Here to Serve"
        sub="Seva desk open 7 AM – 10 PM IST · Replies within a few hours in 7 languages."
        image="/images/hero-varanasi.jpeg"
      />

      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Contact" },
          ]}
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            {[
              {
                i: <MapPin size={18} />,
                t: "Visit / Post",
                d: OFFICE_ADDRESS,
                href: OFFICE_MAP_SEARCH_URL,
              },
              {
                i: <Phone size={18} />,
                t: "Call the Seva Desk",
                d: `${DISPLAY_PHONE} · 7 AM – 10 PM IST`,
                href: phoneHref,
              },
              {
                i: <Mail size={18} />,
                t: "Email",
                d: CONTACT_EMAIL,
                href: emailHref,
              },
              {
                i: <MessageCircle size={18} />,
                t: "WhatsApp (fastest)",
                d: "Tap to chat — darshan, puja, pandit, yatra, course help",
              },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 0.06}>
                <div className="sacred-border flex items-start gap-4 rounded-3xl border border-orange-900/10 bg-white p-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-orange-600 to-amber-500 text-white">
                    {c.i}
                  </span>

                  <div className="min-w-0">
                    <h3 className="font-bold text-[#2a1a10]">{c.t}</h3>

                    {c.href ? (
                      <a
                        href={c.href}
                        target={c.href.startsWith("http") ? "_blank" : undefined}
                        rel={
                          c.href.startsWith("http")
                            ? "noreferrer"
                            : undefined
                        }
                        className="mt-0.5 block text-sm text-stone-600 transition hover:text-orange-700 hover:underline"
                      >
                        {c.d}
                      </a>
                    ) : (
                      <p className="mt-0.5 text-sm text-stone-600">{c.d}</p>
                    )}

                    {i === 3 && (
                      <a
                        href={waLink("Namaste DivyaDhara!")}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-95"
                      >
                        <MessageCircle size={15} />
                        Open WhatsApp
                      </a>
                    )}

                    {i === 0 && (
                      <a
                        href={OFFICE_MAP_SEARCH_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-orange-700 underline underline-offset-4"
                      >
                        <MapPin size={14} />
                        Open in Google Maps
                      </a>
                    )}
                  </div>
                </div>
              </Reveal>
            ))}

            <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-stone-100 shadow-sm">
              <iframe
                title="DivyaDhara Navi Mumbai office map"
                src={OFFICE_MAP_URL}
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>

            <p className="px-1 text-xs leading-relaxed text-stone-500">
              Office: {OFFICE_ADDRESS}
            </p>
          </div>

          <Reveal delay={0.1}>
            {done ? (
              <div className="grid h-full place-items-center rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center">
                <div>
                  <CheckCircle2 size={44} className="mx-auto text-emerald-600" />

                  <h2 className="font-display mt-3 text-2xl font-semibold text-emerald-950">
                    Message received 🙏
                  </h2>

                  <p className="mt-2 text-sm text-emerald-900/80">
                    Dhanyavaad, {f.name.split(" ")[0] || "devotee"}. Our seva
                    team will respond shortly.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setDone(false);
                      setF({
                        name: "",
                        phone: "",
                        topic: "General",
                        message: "",
                      });
                    }}
                    className="mt-5 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    Send another message
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setDone(true);
                }}
                className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-xl shadow-orange-900/5 md:p-8"
              >
                <h2 className="font-display text-2xl font-semibold">
                  Send a Message
                </h2>

                <p className="mt-1 text-sm text-stone-500">
                  Grievances, partnerships, press and general help — all
                  welcome.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-1 block text-xs font-bold text-stone-600"
                      htmlFor="c-name"
                    >
                      Name *
                    </label>

                    <input
                      id="c-name"
                      required
                      value={f.name}
                      onChange={(e) => setF({ ...f, name: e.target.value })}
                      className={input}
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <label
                      className="mb-1 block text-xs font-bold text-stone-600"
                      htmlFor="c-phone"
                    >
                      Phone *
                    </label>

                    <input
                      id="c-phone"
                      type="tel"
                      required
                      value={f.phone}
                      onChange={(e) => setF({ ...f, phone: e.target.value })}
                      className={input}
                      placeholder="+91 …"
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label
                    className="mb-1 block text-xs font-bold text-stone-600"
                    htmlFor="c-topic"
                  >
                    Topic
                  </label>

                  <select
                    id="c-topic"
                    value={f.topic}
                    onChange={(e) => setF({ ...f, topic: e.target.value })}
                    className={input}
                  >
                    {[
                      "General",
                      "Darshan help",
                      "Puja / Pandit booking",
                      "Yatra",
                      "Course",
                      "Partnership",
                      "Grievance",
                    ].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <label
                    className="mb-1 block text-xs font-bold text-stone-600"
                    htmlFor="c-msg"
                  >
                    Message *
                  </label>

                  <textarea
                    id="c-msg"
                    required
                    rows={5}
                    value={f.message}
                    onChange={(e) => setF({ ...f, message: e.target.value })}
                    className={input}
                    placeholder="How may we serve you?"
                  />
                </div>

                <button
                  type="submit"
                  className="btn-saffron mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white"
                >
                  <Send size={15} />
                  Send Message
                </button>
              </form>
            )}
          </Reveal>
        </div>
      </div>
    </>
  );
}
