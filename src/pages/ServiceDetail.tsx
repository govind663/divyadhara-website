
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageCircle,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { SERVICES } from "../data/services";
import { useSEO } from "../lib/seo";
import { Breadcrumbs, Reveal, Faq } from "../components/ui";
import { ServiceCard } from "../components/cards";
import { EnquiryForm, WhatsAppBand } from "../components/blocks";
import { waLink } from "../lib/utils";

const GENERAL_FAQS = [
  {
    question: "How can I enquire about booking a pandit for this puja?",
    answer:
      "Use the enquiry form or WhatsApp link on this page. Share the ceremony name, city, preferred date, language and any relevant family traditions. Availability and arrangements must be confirmed before the booking is finalised.",
  },
  {
    question: "How much does this puja cost?",
    answer:
      "The price displayed is an indication from the service listing, not necessarily a final quotation. The final amount may depend on the ceremony, location, duration, samagri, travel and agreed arrangements. Request a complete cost breakdown before confirming.",
  },
  {
    question: "Who arranges the puja samagri?",
    answer:
      "Discuss samagri requirements before booking. Confirm which items are included in the quoted price, which items your family needs to arrange and whether extra purchase or delivery charges apply.",
  },
  {
    question: "Can I request a puja at my home?",
    answer:
      "Mention your city and locality in your enquiry. Home visits depend on service coverage and availability. Confirm travel arrangements and any additional charges before booking.",
  },
  {
    question: "Can I request a specific date or auspicious muhurat?",
    answer:
      "Share your preferred date, location and purpose of the ceremony. Muhurat guidance may depend on the ritual, local calendar and family tradition. Confirm the proposed time and availability directly; neither is guaranteed until agreed.",
  },
  {
    question: "Can the puja be conducted in my preferred language?",
    answer:
      "Mention your preferred language when enquiring. Language availability depends on the assigned pandit's capabilities and location. Confirm this requirement before finalising the arrangements.",
  },
  {
    question: "How far in advance should I book?",
    answer:
      "Enquire as early as practical, especially for festivals, weddings, popular dates and ceremonies requiring a particular muhurat. The required notice depends on the ceremony and local availability.",
  },
  {
    question: "What should I confirm before booking?",
    answer:
      "Confirm the ceremony and vidhi, date, start time, location, expected duration, samagri responsibilities, final price, travel costs if applicable, payment terms and cancellation or rescheduling conditions.",
  },
  {
    question: "Can the ceremony follow our family tradition?",
    answer:
      "Share relevant regional customs, family practices and specific ritual requirements in advance. The requested arrangements should be discussed with the team because not every variation may be available for every booking.",
  },
  {
    question: "Is my booking confirmed after submitting the enquiry form?",
    answer:
      "No. Submitting an enquiry is a request to discuss arrangements, not an automatic booking confirmation. Wait for confirmation of availability, date, ceremony details, charges and booking terms.",
  },
];

const bookingSteps = [
  {
    number: "01",
    title: "Share your requirements",
    description:
      "Tell us the ceremony, city, preferred date, language and family tradition.",
  },
  {
    number: "02",
    title: "Review the arrangements",
    description:
      "Discuss availability, ritual details, samagri, timing and the total charges.",
  },
  {
    number: "03",
    title: "Confirm your booking",
    description:
      "Proceed after the date, ceremony arrangements, price and booking terms have been agreed.",
  },
];

export default function ServiceDetail() {
  const { slug } = useParams();

  const service = SERVICES.find((item) => item.slug === slug);

  useSEO({
    title: service
      ? service.seoTitle ||
        `${service.name} | Puja Services & Enquiry | Divya Dhara`
      : "Service Not Found | Divya Dhara",
    description: service
      ? service.seoDescription ||
        `Explore ${service.name}, including ceremony preparation, estimated duration and price information. Enquire about samagri, location, availability and booking arrangements with Divya Dhara.`
      : "The requested puja service could not be found. Explore Hindu puja services at Divya Dhara.",
    path: service
      ? `/services/${service.slug}`
      : `/services/${slug ?? ""}`,
    image: service?.image || "/images/puja-thali.jpeg",
    robots: service ? undefined : "noindex,follow",
  });

  const relatedServices = useMemo(() => {
    if (!service) return [];

    const currentTypes = new Set(
      (service.pujaTypes ?? []).map((type) => type.toLowerCase()),
    );

    return SERVICES.filter((item) => {
      if (item.slug === service.slug) return false;

      const sharesCategory = item.category === service.category;

      const sharesPujaType = (item.pujaTypes ?? []).some((type) =>
        currentTypes.has(type.toLowerCase()),
      );

      return sharesCategory || sharesPujaType;
    }).slice(0, 4);
  }, [service]);

  if (!service) {
    return (
      <main className="flex min-h-[65vh] items-center justify-center bg-[#fbf8f2] px-4 py-20 text-[#2a1a10]">
        <div className="w-full max-w-xl rounded-[2rem] border border-[#eadbc3] bg-white p-8 text-center shadow-sm sm:p-12">
          <div
            aria-hidden="true"
            className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#fbf0dc] text-[#8b451e]"
          >
            <ScrollText size={30} />
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#a95d20]">
            Divya Dhara Sevas
          </p>

          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Service not found
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-stone-600">
            This service may have moved or the link may be incorrect.
            Browse our puja catalogue to find the ceremony you need.
          </p>

          <Link
            to="/services"
            className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#722f16] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#8d3e1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Explore all services
          </Link>
        </div>
      </main>
    );
  }

  const description = service.description ?? [];
  const benefits = service.benefits ?? [];
  const samagri = service.samagri ?? [];
  const serviceFaqs = service.faqs ?? [];

  const bookingMessage = [
    `Namaste! I would like to enquire about ${service.name}.`,
    `Listed price indication: ${service.price}.`,
    `Estimated duration: ${service.duration}.`,
    "Please share availability, ritual requirements, samagri details and the final quotation.",
  ].join(" ");

  const whatsappUrl = waLink(bookingMessage);

  return (
    <>
      {/* Service hero */}
      <section
        aria-labelledby="service-title"
        className="relative isolate overflow-hidden bg-[#2a1a10] text-white"
      >
        {service.image && (
          <img
            src={service.image}
            alt={`${service.name} ceremony`}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 -z-20 h-full w-full object-cover"
          />
        )}

        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-r from-[#21140d]/95 via-[#21140d]/80 to-[#21140d]/45"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-[#21140d]/80 via-transparent to-black/10"
        />

        <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-8 lg:pb-24">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Puja Services", href: "/services" },
              { label: service.name },
            ]}
          />

          <div className="mt-9 max-w-4xl sm:mt-14">
            <Link
              to="/services"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/75 transition hover:text-[#ffdfa0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c36f] focus-visible:ring-offset-4 focus-visible:ring-offset-[#2a1a10]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              All puja services
            </Link>

            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#f2c36f]/35 bg-[#f2c36f]/10 px-4 py-2 text-xs font-bold tracking-wide text-[#ffdfa0] backdrop-blur">
              <Sparkles size={14} aria-hidden="true" />
              {service.category}
            </span>

            <h1
              id="service-title"
              className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
            >
              {service.name}
            </h1>

            {service.tagline && (
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/80 sm:text-lg">
                {service.tagline}
              </p>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <Clock
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-[#ffdfa0]"
                />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/60">
                    Estimated duration
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {service.duration || "Confirm during enquiry"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-[#f2c36f]/35 bg-[#f2c36f]/10 px-4 py-3 backdrop-blur">
                <Wallet
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-[#ffdfa0]"
                />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/60">
                    Price indication
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-[#ffdfa0]">
                    {service.price || "Ask for a quotation"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Enquire about ${service.name} on WhatsApp`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f2c36f] px-6 py-3.5 text-sm font-extrabold text-[#392012] shadow-lg transition hover:bg-[#ffda91] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c36f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a1a10]"
              >
                <MessageCircle size={18} aria-hidden="true" />
                Enquire on WhatsApp
                <ArrowRight size={17} aria-hidden="true" />
              </a>

              <a
                href="#enquire"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c36f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a1a10]"
              >
                <CalendarDays size={17} aria-hidden="true" />
                Request a booking
              </a>
            </div>

            <p className="mt-4 max-w-2xl text-xs leading-6 text-white/70">
              Availability, final pricing and ritual arrangements are
              confirmed during your enquiry.
            </p>
          </div>
        </div>
      </section>

      {/* Main service information */}
      <main className="bg-[#fbf8f2] text-[#2a1a10]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="space-y-7">
            {/* About the service */}
            <Reveal>
              <section
                aria-labelledby="about-puja"
                className="rounded-[2rem] border border-[#eadbc3] bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <div
                    aria-hidden="true"
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#fbf0dc] text-[#8b451e]"
                  >
                    <ScrollText size={23} />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a95d20]">
                      Service overview
                    </p>
                    <h2
                      id="about-puja"
                      className="mt-2 font-display text-2xl font-semibold sm:text-3xl"
                    >
                      About {service.name}
                    </h2>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {description.length > 0 ? (
                    description.map((paragraph, index) => (
                      <p
                        key={`${index}-${paragraph.slice(0, 24)}`}
                        className="text-sm leading-7 text-stone-600 sm:text-base"
                      >
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm leading-7 text-stone-600">
                      Contact us to discuss the ceremony, your family
                      tradition and the arrangements required for this puja.
                    </p>
                  )}
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-2xl bg-[#fbf8f2] p-4">
                    <Clock
                      size={19}
                      aria-hidden="true"
                      className="mt-0.5 text-[#a95d20]"
                    />
                    <div>
                      <p className="text-xs text-stone-500">
                        Estimated duration
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {service.duration || "Confirm during enquiry"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl bg-[#fbf8f2] p-4">
                    <Wallet
                      size={19}
                      aria-hidden="true"
                      className="mt-0.5 text-[#a95d20]"
                    />
                    <div>
                      <p className="text-xs text-stone-500">
                        Price indication
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {service.price || "Ask for a quotation"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </Reveal>

            {/* Benefits and inclusions */}
            <Reveal>
              <section
                aria-labelledby="puja-benefits"
                className="rounded-[2rem] border border-[#eadbc3] bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <div
                    aria-hidden="true"
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#edf5e9] text-[#456c36]"
                  >
                    <BadgeCheck size={23} />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#62804b]">
                      What to expect
                    </p>
                    <h2
                      id="puja-benefits"
                      className="mt-2 font-display text-2xl font-semibold sm:text-3xl"
                    >
                      Benefits & inclusions
                    </h2>
                  </div>
                </div>

                {benefits.length > 0 ? (
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {benefits.map((benefit) => (
                      <li
                        key={benefit}
                        className="flex items-start gap-3 rounded-2xl border border-[#e5eddf] bg-[#f7faf4] p-4 text-sm leading-6 text-stone-700"
                      >
                        <CheckCircle2
                          size={18}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-[#62804b]"
                        />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-5 text-sm leading-7 text-stone-600">
                    Inclusions depend on the ritual, tradition and selected
                    arrangements. Confirm the details before booking.
                  </p>
                )}

                <p className="mt-5 text-xs leading-6 text-stone-500">
                  Ritual procedures and customary practices can differ
                  between families, regions and traditions.
                </p>
              </section>
            </Reveal>

            {/* Samagri checklist */}
            <Reveal>
              <section
                aria-labelledby="puja-samagri"
                className="rounded-[2rem] border border-[#eadbc3] bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <div
                    aria-hidden="true"
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#fbf0dc] text-[#8b451e]"
                  >
                    <ScrollText size={23} />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a95d20]">
                      Ceremony preparation
                    </p>
                    <h2
                      id="puja-samagri"
                      className="mt-2 font-display text-2xl font-semibold sm:text-3xl"
                    >
                      Puja samagri list
                    </h2>
                  </div>
                </div>

                {samagri.length > 0 ? (
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {samagri.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 rounded-xl border border-[#eee4d5] bg-[#fcfaf6] px-4 py-3 text-sm leading-6 text-stone-600"
                      >
                        <CheckCircle2
                          size={16}
                          aria-hidden="true"
                          className="mt-1 shrink-0 text-[#a95d20]"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-5 text-sm leading-7 text-stone-600">
                    Ask for a samagri checklist relevant to your selected
                    ceremony and family tradition.
                  </p>
                )}

                <div className="mt-5 rounded-2xl border border-[#eadbc3] bg-[#fbf5e9] p-4">
                  <p className="text-sm leading-6 text-stone-700">
                    <strong className="text-[#722f16]">
                      Before the ceremony:
                    </strong>{" "}
                    Confirm which items are included, which items your family
                    needs to arrange and whether additional costs apply.
                  </p>
                </div>
              </section>
            </Reveal>

            {/* Booking steps */}
            <Reveal>
              <section
                aria-labelledby="booking-steps"
                className="rounded-[2rem] border border-[#eadbc3] bg-white p-6 shadow-sm sm:p-8"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a95d20]">
                  Simple booking process
                </p>

                <h2
                  id="booking-steps"
                  className="mt-2 font-display text-2xl font-semibold sm:text-3xl"
                >
                  How to arrange your puja
                </h2>

                <div className="mt-7 grid gap-4 md:grid-cols-3">
                  {bookingSteps.map((step) => (
                    <article
                      key={step.number}
                      className="rounded-2xl border border-[#eee4d5] bg-[#fcfaf6] p-5"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#722f16] font-display text-sm font-bold text-[#ffdfa0]">
                        {step.number}
                      </span>

                      <h3 className="mt-4 font-semibold text-[#2a1a10]">
                        {step.title}
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {step.description}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </Reveal>

            {/* Frequently asked questions */}
            <Reveal>
              <section
                aria-labelledby="puja-faqs"
                className="rounded-[2rem] border border-[#eadbc3] bg-white p-6 shadow-sm sm:p-8"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a95d20]">
                  Helpful information
                </p>

                <h2
                  id="puja-faqs"
                  className="mt-2 font-display text-2xl font-semibold sm:text-3xl"
                >
                  {service.name}: frequently asked questions
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
                  Find practical information about {service.name}, including
                  booking, pricing, duration, samagri, location and ceremony
                  preparation. Confirm service-specific details before making
                  a booking.
                </p>

                {serviceFaqs.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-bold text-[#722f16]">
                      Questions about this specific service
                    </h3>

                    <Faq items={serviceFaqs} />
                  </div>
                )}

                <div className="mt-7">
                  <h3 className="mb-3 text-sm font-bold text-[#722f16]">
                    Booking and preparation questions
                  </h3>

                  <div className="space-y-3">
                    {GENERAL_FAQS.map((faq, index) => (
                      <details
                        key={faq.question}
                        className="group rounded-2xl border border-[#eadbc3] bg-[#fcfaf6] px-4 py-4 transition open:bg-[#fbf5e9] sm:px-5"
                      >
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-[#2a1a10] marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20]">
                          <span className="flex gap-3 text-sm leading-6 sm:text-base">
                            <span
                              aria-hidden="true"
                              className="shrink-0 text-xs font-bold text-[#a95d20]"
                            >
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            {faq.question}
                          </span>

                          <ChevronRight
                            size={18}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-[#a95d20] transition-transform group-open:rotate-90"
                          />
                        </summary>

                        <p className="ml-7 mt-3 max-w-4xl text-sm leading-7 text-stone-600">
                          {faq.answer}
                        </p>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            </Reveal>

            {/* Pandit discovery */}
            <Reveal>
              <section
                aria-label="Explore pandit services"
                className="flex flex-col gap-4 rounded-[2rem] border border-[#eadbc3] bg-[#fbf5e9] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7"
              >
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#8b451e]"
                  >
                    <ShieldCheck size={22} />
                  </div>

                  <div>
                    <h2 className="font-semibold text-[#2a1a10]">
                      Want to discuss your requirements first?
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      Ask about the ritual procedure, language and
                      availability before making a booking.
                    </p>
                  </div>
                </div>

                <Link
                  to="/pandits"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#dfc8a5] bg-white px-5 py-3 text-sm font-bold text-[#722f16] transition hover:bg-[#fffaf0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2"
                >
                  Meet pandits
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </section>
            </Reveal>
          </div>

          {/* Enquiry form */}
          <section
            id="enquire"
            aria-labelledby="enquiry-heading"
            className="mt-12 scroll-mt-24 sm:mt-16"
          >
            <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-[#eadbc3] bg-white shadow-xl shadow-[#6e421c]/5">
              <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
                <div className="relative overflow-hidden bg-[#2a1a10] p-6 text-white sm:p-9 lg:p-10">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#a95d20]/25 blur-3xl"
                  />

                  <div className="relative">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#f2c36f]/30 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#ffdfa0]">
                      <Sparkles size={14} aria-hidden="true" />
                      Personalised enquiry
                    </span>

                    <h2
                      id="enquiry-heading"
                      className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-4xl"
                    >
                      Plan your
                      <span className="block text-[#f2c36f]">
                        sacred ceremony.
                      </span>
                    </h2>

                    <p className="mt-4 text-sm leading-7 text-white/75">
                      Tell us what you need. Share your preferred date,
                      location and ceremony requirements so the arrangements
                      can be discussed with you.
                    </p>

                    <ul className="mt-7 space-y-4">
                      {[
                        "Discuss the ceremony and requirements",
                        "Clarify samagri and pricing",
                        "Check date and location availability",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-3 text-sm leading-6 text-white/85"
                        >
                          <CheckCircle2
                            size={18}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-[#f2c36f]"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs text-white/60">
                        Your selected service
                      </p>

                      <p className="mt-1 font-semibold text-[#fff4df]">
                        {service.name}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                        <span className="inline-flex items-center gap-2 text-[#ffdfa0]">
                          <Wallet size={15} aria-hidden="true" />
                          {service.price || "Quotation required"}
                        </span>

                        <span className="inline-flex items-center gap-2 text-white/75">
                          <Clock size={15} aria-hidden="true" />
                          {service.duration || "To be confirmed"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 p-5 sm:p-8 lg:p-10">
                  <h3 className="font-display text-2xl font-semibold text-[#2a1a10]">
                    Send your enquiry
                  </h3>

                  <p className="mb-6 mt-2 text-sm leading-6 text-stone-600">
                    Fill in the form below. Final pricing and availability
                    should be confirmed before booking.
                  </p>

                  <div className="w-full min-w-0">
                    <EnquiryForm
                      context={`Puja booking enquiry: ${service.name}`}
                      title="Enquire about this puja"
                    />
                  </div>

                  <div className="my-6 flex items-center gap-3">
                    <span className="h-px flex-1 bg-[#eee4d5]" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                      Prefer WhatsApp?
                    </span>
                    <span className="h-px flex-1 bg-[#eee4d5]" />
                  </div>

                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Continue your ${service.name} enquiry on WhatsApp`}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#c9dfc4] bg-[#f1f8ee] px-4 py-3 text-sm font-bold text-[#285d2c] transition hover:bg-[#e6f3e1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#62804b] focus-visible:ring-offset-2"
                  >
                    <MessageCircle size={18} aria-hidden="true" />
                    Continue on WhatsApp
                    <ArrowRight size={16} aria-hidden="true" />
                  </a>

                  <p className="mt-4 text-xs leading-6 text-stone-500">
                    Submitting an enquiry does not itself confirm a booking.
                    Please wait for confirmation of the arrangements.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* WhatsApp banner */}
      <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <WhatsAppBand
          title={`Questions about ${service.name}?`}
          sub="Tell us your city and preferred date to discuss ritual requirements, availability and arrangements."
          message={bookingMessage}
        />
      </div>

      {/* Related services */}
      {relatedServices.length > 0 && (
        <section
          aria-labelledby="related-sevas"
          className="border-t border-[#eadbc3] bg-white"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a95d20]">
                  Continue exploring
                </p>

                <h2
                  id="related-sevas"
                  className="mt-2 font-display text-2xl font-semibold text-[#2a1a10] sm:text-3xl"
                >
                  Related puja services
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
                  Explore other ceremonies in a similar category or with
                  related ritual requirements.
                </p>
              </div>

              <Link
                to="/services"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#8b451e] transition hover:text-[#a95d20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2"
              >
                View all services
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {relatedServices.map((item, index) => (
                <div key={item.slug} className="min-w-0">
                  <ServiceCard s={item} i={index} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
