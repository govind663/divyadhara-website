import {
  Link,
  useParams,
} from "react-router-dom";

import {
  MapPin,
  Languages,
  CalendarDays,
  CheckCircle2,
  Sparkles,
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
  useEffect,
  useMemo,
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


type PujaProcessStep = {
  title: string;
  detail: string;
};

type PujaProcess = {
  introduction: string;
  steps: PujaProcessStep[];
  note: string;
};

/**
 * Visitor-friendly overview for each puja type displayed on a Pandit profile.
 * These are general outlines, not a substitute for the Acharya's prescribed vidhi.
 * The actual sequence and samagri can vary by sampradaya, region and family custom.
 */
function getPujaProcess(pujaName: string): PujaProcess {
  const name = pujaName.toLocaleLowerCase().replace(/[–—]/g, "-");

  const commonPreparation: PujaProcessStep = {
    title: "Confirm the occasion and arrangements",
    detail: "Share your preferred date, city, language, family tradition and any muhurat requirement. The Pandit Ji confirms the vidhi, duration and samagri list before the booking is finalised.",
  };

  const commonClosing: PujaProcessStep = {
    title: "Aarti, prayers and prasad",
    detail: "The ceremony concludes with the closing prayers and aarti as applicable, followed by prasad and guidance from the Acharya.",
  };

  let steps: PujaProcessStep[];
  let introduction: string;

  if (name.includes("maha mrityunjaya") || name.includes("mrityunjay")) {
    introduction = "A general overview of a Maha Mrityunjaya Jaap. The mantra count, supporting rituals and whether a havan is included should be agreed with the Pandit Ji.";
    steps = [
      commonPreparation,
      { title: "Sankalp and invocation", detail: "The yajman's name and stated intention are included in the sankalp; preliminary worship is performed according to the chosen tradition." },
      { title: "Maha Mrityunjaya mantra jaap", detail: "The Pandit Ji recites the prescribed mantra count. The count, participation and any additional path are confirmed beforehand." },
      { title: "Offerings or havan, if included", detail: "Abhishek, offerings or a havan may form part of the arrangement when prescribed and agreed; they are not assumed to be included in every booking." },
      commonClosing,
    ];
  } else if (name.includes("rudrabhishek") || name.includes("rudra abhishek") || name.includes("shiv") || name.includes("mahadev")) {
    introduction = "A typical outline for Shiv Puja or Rudrabhishek. The abhishek materials and mantra sequence depend on the selected vidhi and family tradition.";
    steps = [
      commonPreparation,
      { title: "Sankalp and preliminary puja", detail: "The ceremony begins with sankalp and the required preliminary invocations, which may include Ganesh Puja and kalash sthapana." },
      { title: "Shiva abhishek", detail: "The Shivling is offered water or other agreed abhishek materials, such as panchamrit, where appropriate to the selected ritual." },
      { title: "Mantra, bilva and other offerings", detail: "Rudra mantras or other prescribed prayers are recited, followed by bilva leaves, flowers and naivedya as required by the vidhi." },
      commonClosing,
    ];
  } else if (name.includes("ganesh") || name.includes("ganapati")) {
    introduction = "A general outline for Ganesh Puja. Specific offerings and recitations may vary by occasion and regional practice.";
    steps = [
      commonPreparation,
      { title: "Sankalp and Ganesh avahan", detail: "The yajman's intention is stated and Shri Ganesh is invoked with the customary preliminary rites." },
      { title: "Mantra and offerings", detail: "The Pandit Ji performs the prescribed worship and mantra recitation; durva, flowers, modak or other offerings are used as appropriate." },
      { title: "Prayer for auspicious beginnings", detail: "The worship is completed with the prayers and offerings specified for the occasion." },
      commonClosing,
    ];
  } else if (name.includes("navgraha") || name.includes("nav graha") || name.includes("graha shanti") || name.includes("grah shanti")) {
    introduction = "A general outline for Navgraha or Graha Shanti Puja. The planets invoked, mantra count, offerings and any havan depend on the prescribed ritual.";
    steps = [
      commonPreparation,
      { title: "Sankalp and preliminary worship", detail: "The yajman's details and purpose are included in the sankalp, followed by preliminary worship as required." },
      { title: "Navgraha worship and mantra recitation", detail: "The Pandit Ji performs the prescribed worship for the relevant grahas and recites the agreed mantras." },
      { title: "Offerings, daan or havan if prescribed", detail: "Traditional offerings, daan or havan may be included if they form part of the agreed vidhi; confirm inclusions before booking." },
      commonClosing,
    ];
  } else if (name.includes("satyanarayan") || name.includes("satya narayan")) {
    introduction = "A general outline for Satyanarayan Puja. Katha, offerings and the arrangement of prasad should be confirmed for your family tradition.";
    steps = [
      commonPreparation,
      { title: "Sankalp and Shri Vishnu worship", detail: "The Pandit Ji performs the sankalp and the prescribed preliminary worship, including kalash or deity worship as required." },
      { title: "Satyanarayan Katha and offerings", detail: "The katha is recited or read, followed by the offerings prescribed for the chosen tradition." },
      { title: "Prarthana and puja completion", detail: "The ritual is completed with the concluding prayers and agreed offerings." },
      commonClosing,
    ];
  } else if (name.includes("lakshmi") || name.includes("diwali") || name.includes("dhanteras")) {
    introduction = "A general outline for Lakshmi Puja. The order and household preparations differ by festival, region and family custom.";
    steps = [
      commonPreparation,
      { title: "Puja place and sankalp", detail: "The worship area and required materials are prepared, and the yajman states the sankalp." },
      { title: "Lakshmi and Ganesh worship", detail: "The deities are worshipped with the mantras, flowers, diya and other offerings prescribed for the occasion." },
      { title: "Prayers and naivedya", detail: "The agreed prayers and food offerings are made; any festival-specific steps should be confirmed with the Pandit Ji." },
      commonClosing,
    ];
  } else if (name.includes("durga") || name.includes("chandi") || name.includes("devi")) {
    introduction = "A general outline for Devi or Durga Puja. The path, mantra count and any additional rites vary significantly by the selected tradition.";
    steps = [
      commonPreparation,
      { title: "Sankalp and preliminary rites", detail: "The ceremony begins with sankalp and the preliminary worship prescribed for the chosen Devi Puja." },
      { title: "Devi worship and path/mantra", detail: "The Pandit Ji performs the agreed Devi worship and recitation. A Chandi path or extended ritual is included only when specifically arranged." },
      { title: "Offerings and prayer", detail: "Flowers, naivedya and other offerings are made according to the vidhi." },
      commonClosing,
    ];
  } else if (name.includes("griha pravesh") || name.includes("griha-pravesh") || name.includes("vastu") || name.includes("house warming") || name.includes("housewarming")) {
    introduction = "A general outline for Griha Pravesh or Vastu Puja. The exact rites depend on the property, region, muhurat and family tradition.";
    steps = [
      commonPreparation,
      { title: "Muhurta and samagri confirmation", detail: "Confirm the house details, access, date and whether kalash, Vastu Puja, Ganesh Puja or havan are part of the booking." },
      { title: "Sankalp and house worship", detail: "The Pandit Ji performs the agreed preliminary worship and rites for the home or site." },
      { title: "Havan or entry rites, if included", detail: "A havan and specific house-entry customs may be performed when included in the agreed vidhi." },
      commonClosing,
    ];
  } else if (name.includes("vivah") || name.includes("wedding") || name.includes("marriage") || name.includes("saptapadi")) {
    introduction = "A high-level outline for a Vivah ceremony. The sequence is highly dependent on regional and family traditions and must be planned directly with the Pandit Ji.";
    steps = [
      commonPreparation,
      { title: "Family details and ceremony planning", detail: "Confirm both families' traditions, ceremony venue, timing, roles and the specific rites expected in the package." },
      { title: "Ganesh Puja and wedding sankalp", detail: "The ceremony typically includes preliminary worship and sankalp according to the agreed regional vidhi." },
      { title: "Main marriage rites", detail: "Rites such as kanyadaan, vivah homa, pheras or saptapadi may apply depending on the tradition and the agreed ceremony plan." },
      { title: "Blessings and conclusion", detail: "The Pandit Ji completes the prescribed concluding rites and blessings." },
    ];
  } else if (name.includes("shraddh") || name.includes("shradh") || name.includes("pind daan") || name.includes("tarpan") || name.includes("pitru")) {
    introduction = "A general outline for Shraddha, Pind Daan or Tarpan. Please confirm the tithi, location and family tradition with the Pandit Ji before arranging the ceremony.";
    steps = [
      commonPreparation,
      { title: "Tithi, details and sankalp", detail: "The family shares the relevant details and observance date so the Pandit Ji can confirm the applicable rites." },
      { title: "Prescribed offerings and rites", detail: "Tarpan, pind-related rites or other offerings are performed as prescribed for the specific observance and tradition." },
      { title: "Prayers and completion", detail: "The ceremony concludes according to the agreed vidhi. Any additional arrangements, such as bhojan or daan, should be confirmed in advance." },
    ];
  } else if (name.includes("havan") || name.includes("yajna") || name.includes("yagya") || name.includes("homam") || name.includes("homa")) {
    introduction = "A general outline for Havan or Yajna. The deity, mantra, samagri and number of ahutis depend on the specific purpose and prescribed ritual.";
    steps = [
      commonPreparation,
      { title: "Havan kund and sankalp", detail: "The kund, seating and required materials are arranged; the yajman's sankalp is taken." },
      { title: "Agni invocation and mantra ahutis", detail: "The sacred fire is invoked and offerings are made with the prescribed mantras, following the agreed vidhi." },
      { title: "Purnahuti and concluding prayers", detail: "The ritual is completed with purnahuti and the relevant concluding prayers." },
      commonClosing,
    ];
  } else if (name.includes("mundan") || name.includes("namkaran") || name.includes("naamkaran") || name.includes("upanayan") || name.includes("janeu") || name.includes("samskar") || name.includes("sanskar")) {
    introduction = "A general outline for a family samskara. The specific rites and order depend on which sanskar is being performed and the family's tradition.";
    steps = [
      commonPreparation,
      { title: "Family details and sankalp", detail: "Confirm the child's or participant's details, the occasion and the chosen muhurat with the Pandit Ji." },
      { title: "Preliminary puja", detail: "Ganesh Puja and other preliminary rites are performed if required by the selected sanskar." },
      { title: "Main sanskar rites", detail: "The rites specific to the ceremony are performed according to the agreed family and regional tradition." },
      commonClosing,
    ];
  } else if (name.includes("vishnu") || name.includes("narayan")) {
    introduction = "A general overview of Vishnu or Narayan worship. Confirm the specific path, mantra and offerings with the Pandit Ji.";
    steps = [
      commonPreparation,
      { title: "Sankalp and preliminary worship", detail: "The yajman's sankalp and the required preliminary rites are performed." },
      { title: "Vishnu/Narayan puja and mantra", detail: "The deity is worshipped with the prescribed mantra, flowers and other offerings according to the selected vidhi." },
      { title: "Naivedya and concluding prayer", detail: "The agreed offerings and concluding prayers are completed." },
      commonClosing,
    ];
  } else {
    introduction = `A general outline for ${pujaName}. This overview helps you understand the usual stages; the Acharya should confirm the exact vidhi for this puja and your tradition.`;
    steps = [
      commonPreparation,
      { title: "Sankalp and preliminary puja", detail: "The Pandit Ji confirms the purpose of the ceremony and performs the preliminary rites prescribed for the selected puja." },
      { title: "Main puja, path or mantra", detail: "The main worship and recitations are performed according to the specific ritual, deity and tradition agreed before the ceremony." },
      { title: "Offerings and completion", detail: "The prescribed offerings and concluding prayers are performed; any havan, special path or additional rites should be confirmed in advance." },
      commonClosing,
    ];
  }

  return {
    introduction,
    steps,
    note: "This is a general client guide, not a fixed or complete vidhi. Exact steps, mantras, samagri and duration can vary by sampradaya, region and family custom. Confirm the final procedure with the Acharya before booking.",
  };
}

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
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [expandedPuja, setExpandedPuja] = useState("");
  const selectedPuja = selectedServices.find((serviceName) => p?.pujaTypes.includes(serviceName)) || "";
  const selectedSeva = selectedServices.find((serviceName) => p?.services.some((service) => service.name === serviceName)) || "";

  const choosePuja = (pujaName: string) => {
    setSelectedServices((current) => current.includes(pujaName) ? current : [...current, pujaName]);
  };
  const chooseSeva = (serviceName: string) => {
    setSelectedServices((current) => current.includes(serviceName) ? current : [...current, serviceName]);
  };

  // Keep both dialogs accessible and prevent the page behind them from scrolling.
  // Escape closes whichever dialog is currently open.
  useEffect(() => {
    if (!storyVideoOpen && !expandedPuja) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (storyVideoOpen) {
        setStoryVideoOpen(false);
      } else {
        setExpandedPuja("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [storyVideoOpen, expandedPuja]);

  // Recommend services relevant to the Pandit's specialties first.
  const relatedServices = useMemo(() => {
    if (!p) return SERVICES.slice(0, 2);

    const terms = [...p.pujaTypes, ...p.specializations]
      .map((term) => term.toLowerCase().trim())
      .filter(Boolean);

    const matches = SERVICES.filter((service) => {
      const name = service.name.toLowerCase();
      const slugText = service.slug.toLowerCase().replace(/-/g, " ");
      const pujaTypes = service.pujaTypes.map((item) => item.toLowerCase());
      return terms.some((term) =>
        name.includes(term) ||
        term.includes(name) ||
        slugText.includes(term) ||
        term.includes(slugText) ||
        pujaTypes.some((item) => item.includes(term) || term.includes(item)),
      );
    });

    return (matches.length ? matches : SERVICES).slice(0, 2);
  }, [p]);

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

  // Schema.org image URLs should be absolute. Keep external image URLs as-is.
  const profileImageUrl = p?.photo
    ? /^https?:\/\//i.test(p.photo)
      ? p.photo
      : `${typeof window !== "undefined" ? window.location.origin : "https://divya-dhara.in"}${p.photo.startsWith("/") ? p.photo : `/${p.photo}`}`
    : undefined;

  const storyVideoId = p?.storyVideoId?.trim() || undefined;

  // Keep the title branded and readable; the SEO helper applies a safe length limit.
  const seoTitle = p
    ? `${p.name} | ${p.title} | DivyaDhara`
    : "Pandit Profile Not Found | DivyaDhara";

  const pujaSummary = p?.pujaTypes.slice(0, 3).join(", ") || "puja and ritual services";
  const specializationSummary = p?.specializations.slice(0, 2).join(", ");

  const seoDescription = p
    ? `Enquire with ${p.name}, ${p.title} in ${p.location}. Explore ${pujaSummary}${specializationSummary ? `. Specializations include ${specializationSummary}` : ""}. Check date, language, samagri and availability before confirming your booking.`
    : "The requested Pandit profile could not be found. Browse DivyaDhara to explore Pandits and puja services.";

  const profileDescription = p
    ? `${p.name} is listed on DivyaDhara as ${p.title} in ${p.location}. Visitors can enquire about ${specializationSummary || "puja and ritual services"}, including ${pujaSummary}. Availability and arrangements are confirmed before booking.`
    : "";

  useSEO({
    title: seoTitle,
    description: seoDescription,
    path: profilePath,
    image: profileImageUrl,
    imageAlt: p ? `${p.name}, ${p.title} in ${p.location} — DivyaDhara Pandit profile` : undefined,
    robots: p ? undefined : "noindex,follow",

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
              image: profileImageUrl,
              url: profileUrl,
              mainEntityOfPage: {
                "@id": `${profileUrl}#profile`,
              },
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
    [
      `Namaste! I want to enquire about ${p.name} (${p.title}).`,
      `Pandit profile: ${profileUrl}`,
      `Listed specialization: ${p.specializations[0] ?? "Puja enquiry"}`,
      selectedServices.length ? `Selected pujas / services: ${selectedServices.join(", ")}` : "",
      "I will share my preferred date, city/PIN code, language and requirements.",
    ].filter(Boolean).join("\n"),
  );
  const activePujaProcess = expandedPuja
    ? getPujaProcess(expandedPuja)
    : undefined;

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

                Pandit profile on DivyaDhara

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
                  {p.availability || "Availability to be confirmed"}
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
                  rel="noopener noreferrer"
                  aria-label={`Enquire with ${p.name} on WhatsApp`}
                  className="flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a1a10]"
                >
                  <MessageCircle
                    size={16}
                  />

                  Contact Pandit
                </a>

                {/* BOOKING */}

                <a
                  href="#book"
                  aria-label={`Go to booking enquiry for ${p.name}`}
                  className="btn-saffron rounded-2xl px-6 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a1a10]"
                >
                  Check availability & enquire
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

      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">

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

            {p.associatedWith?.trim() && (
              <p className="mt-3 rounded-2xl bg-orange-50 p-4 text-sm text-stone-600 ring-1 ring-orange-200">
                <strong className="text-orange-900">Associated with:</strong>{" "}
                {p.associatedWith}
              </p>
            )}

          </Reveal>

          {/* ==================================================
              SPECIALIZATIONS
          ================================================== */}

          <Reveal className="mt-8 rounded-3xl border border-orange-900/10 bg-white p-5 sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
                Find the right ritual
              </p>
              <h2 className="font-display mt-1 text-2xl font-semibold text-[#2a1a10]">
                Specializations & Puja Types
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                Explore this Acharya’s areas of expertise, open the step-by-step overview for each listed puja, and select a ritual to carry it into your booking enquiry.
              </p>
            </div>

            <div className="mt-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800">
                <Award size={16} className="text-orange-700" />
                Areas of expertise
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.specializations.length > 0 ? p.specializations.map((specialization) => (
                  <span
                    key={`specialization-${specialization}`}
                    className="inline-flex items-center rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-950"
                  >
                    {specialization}
                  </span>
                )) : (
                  <p className="text-sm text-stone-500">Enquire to learn about this Acharya’s areas of expertise.</p>
                )}
              </div>
            </div>

            <div className="mt-5 border-t border-stone-100 pt-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800">
                <BookOpen size={16} className="text-orange-700" />
                Pujas and rituals you can enquire about
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {p.pujaTypes.length > 0 ? p.pujaTypes.map((puja) => {
                  const isSelected = selectedServices.includes(puja);

                  return (
                    <article
                      key={`puja-${puja}`}
                      className={`rounded-2xl border bg-white p-4 transition ${
                        isSelected
                          ? "border-orange-400 ring-1 ring-orange-200"
                          : "border-stone-200 hover:border-orange-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-bold leading-5 text-stone-900">{puja}</h4>
                          <p className="mt-1 text-xs leading-5 text-stone-500">
                            See what usually happens during this ritual.
                          </p>
                        </div>
                        {isSelected && (
                          <span className="shrink-0 rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-900">Selected</span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedPuja(puja)}
                          aria-haspopup="dialog"
                          aria-controls="puja-process-dialog"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-900 transition hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          <BookOpen size={14} />
                          View puja process
                        </button>
                        <a
                          href="#book"
                          onClick={() => {
                            choosePuja(puja);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-orange-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
                          aria-label={`Select ${puja} for booking enquiry with ${p.name}`}
                        >
                          Choose this puja <ChevronRight size={14} />
                        </a>
                      </div>

                    </article>
                  );
                }) : (
                  <p className="text-sm text-stone-500">Contact us to discuss your puja requirements.</p>
                )}
              </div>
            </div>

            {selectedServices.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-orange-950">
                  <strong>{selectedServices.length} service{selectedServices.length === 1 ? "" : "s"} selected:</strong> {selectedServices.join(", ")}
                </p>
                <a href="#book" className="inline-flex w-fit items-center gap-1 text-sm font-bold text-orange-800 underline underline-offset-4">
                  Continue enquiry <ChevronRight size={14} />
                </a>
              </div>
            )}

            <p className="mt-5 rounded-2xl bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-600">
              Not sure which ritual is suitable? Share your occasion, city, preferred date and family-tradition requirements in the enquiry form. The team can help you confirm the appropriate puja with the Acharya.
            </p>
          </Reveal>

          {/* ==================================================
              SEVAS
          ================================================== */}

          <Reveal className="mt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
                  Understand the service before you book
                </p>
                <h2 className="font-display mt-1 text-2xl font-semibold text-[#2a1a10]">
                  Sevas & Dakshina
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                  Review the available seva options and expected duration. Ask for a complete quote before confirming your booking.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                <ShieldCheck size={14} />
                Confirm quote before booking
              </span>
            </div>

            {p.services.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {p.services.map((service) => (
                  <article
                    key={service.name}
                    className={`flex h-full flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow-md sm:p-5 ${
                      selectedServices.includes(service.name)
                        ? "border-orange-400 ring-1 ring-orange-200"
                        : "border-orange-900/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-800 ring-1 ring-orange-100">
                        <BookOpen size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold leading-5 text-stone-900">
                          {service.name}
                        </h3>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
                          <Clock size={13} />
                          {service.duration && service.duration.toLowerCase() !== "to be confirmed"
                            ? service.duration
                            : "Duration to be confirmed"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-1 items-end justify-between gap-3 border-t border-stone-100 pt-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                          Dakshina
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-emerald-800">
                          Confirm quote
                        </p>
                      </div>
                      <a
                        href="#book"
                        onClick={() => {
                          chooseSeva(service.name);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-orange-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
                        aria-label={`Ask about dakshina for ${service.name}`}
                      >
                        Enquire <ChevronRight size={14} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 p-5 text-sm text-stone-600">
                Seva details are being updated. Send an enquiry and the team will help confirm suitable options.
                <a href="#book" className="mt-3 inline-flex items-center gap-1 font-bold text-orange-800 underline underline-offset-4">
                  Ask about available sevas <ChevronRight size={14} />
                </a>
              </div>
            )}

            {selectedSeva && (
              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-orange-950">
                  <strong>Selected seva:</strong> {selectedSeva}
                </p>
                <a href="#book" className="inline-flex w-fit items-center gap-1 text-sm font-bold text-orange-800 underline underline-offset-4">
                  Continue enquiry <ChevronRight size={14} />
                </a>
              </div>
            )}

            <div className="mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
              <h3 className="text-sm font-bold text-stone-800">What should you confirm?</h3>
              <ul className="mt-2 grid gap-2 text-xs leading-5 text-stone-600 sm:grid-cols-2">
                <li className="flex gap-2"><span className="text-orange-700">•</span><span>Dakshina for your city and any travel costs</span></li>
                <li className="flex gap-2"><span className="text-orange-700">•</span><span>Expected duration and ritual requirements</span></li>
                <li className="flex gap-2"><span className="text-orange-700">•</span><span>Whether samagri is included or arranged separately</span></li>
                <li className="flex gap-2"><span className="text-orange-700">•</span><span>Preferred date, timing and availability</span></li>
              </ul>
              <p className="mt-3 border-t border-stone-200 pt-3 text-xs leading-5 text-stone-600">
                No price is assumed on this profile. Confirm the final quote, samagri inclusions and any travel charges before approving the booking.
              </p>
            </div>
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

              {relatedServices
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


      </div>

      {/* ====================================================
          PANDIT ENQUIRY FORM
          Uses the shared EnquiryForm component, matching ServiceDetail.
      ==================================================== */}

      <section
        id="book"
        aria-labelledby="enquiry-heading"
        className="mx-auto mt-12 max-w-7xl scroll-mt-24 px-4 sm:mt-16 md:px-6 lg:px-8"
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
                  Personalised Pandit booking
                </span>

                <h2
                  id="enquiry-heading"
                  className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-4xl"
                >
                  Plan your ceremony with
                  <span className="mt-1 block text-[#f2c36f]">{p.name} ji.</span>
                </h2>

                <p className="mt-4 text-sm leading-7 text-white/75">
                  Select one or more pujas and services from this Pandit’s profile, then share your date, city, language and ceremony requirements. The team can follow up about availability and arrangements.
                </p>

                <ul className="mt-7 space-y-4">
                  {[
                    "Select all relevant pujas and services",
                    "Share preferred date, location and language",
                    "Discuss vidhi, samagri and final charges",
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
                  <p className="text-xs text-white/60">Pandit profile</p>
                  <p className="mt-1 font-semibold text-[#fff4df]">{p.name}</p>
                  <p className="mt-1 text-sm text-white/75">
                    {p.title} · {p.experience} years listed experience
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    <span className="inline-flex items-center gap-2 text-[#ffdfa0]">
                      <ShieldCheck size={15} aria-hidden="true" />
                      {p.location}
                    </span>
                    <span className="inline-flex items-center gap-2 text-white/75">
                      <CalendarDays size={15} aria-hidden="true" />
                      {p.availability || "Availability to be confirmed"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-white/65">
                    Languages: {p.languages.join(", ")}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 p-5 sm:p-8 lg:p-10">
              <h3 className="font-display text-2xl font-semibold text-[#2a1a10]">
                Send your enquiry
              </h3>

              <p className="mb-6 mt-2 text-sm leading-6 text-stone-600">
                Choose the services you need and fill in your booking details. Your enquiry will include this Pandit’s profile so the request can be identified correctly.
              </p>

              <div className="w-full min-w-0">
                <EnquiryForm
                  context={`DivyaDhara Pandit profile booking enquiry for ${p.name}. The visitor started this enquiry from this specific Pandit profile.`}
                  title={`Enquiry for ${p.name}`}
                  compact={false}
                  leadType="contact"
                  formKey="contact"
                  sourceForm="pandit_booking"
                  serviceType="Pandit Booking"
                  pujaType={selectedPuja || undefined}
                  selectedPuja={selectedPuja}
                  onSelectedPujaChange={(pujaName: string) => {
                    if (pujaName) choosePuja(pujaName);
                  }}
                  selectedSeva={selectedSeva}
                  selectedServices={selectedServices}
                  onSelectedServicesChange={setSelectedServices}
                  pagePath={profilePath}
                  panditProfile={{
                    slug: p.slug,
                    name: p.name,
                    title: p.title,
                    experience: p.experience,
                    location: p.location,
                    languages: p.languages,
                    pujaTypes: p.pujaTypes,
                    services: p.services.map((service) => service.name),
                    profileUrl,
                  }}
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
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Continue your enquiry for ${p.name} on WhatsApp`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#c9dfc4] bg-[#f1f8ee] px-4 py-3 text-sm font-bold text-[#285d2c] transition hover:bg-[#e6f3e1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#62804b] focus-visible:ring-offset-2"
              >
                <MessageCircle size={18} aria-hidden="true" />
                Continue on WhatsApp
                <ChevronRight size={16} aria-hidden="true" />
              </a>

              <p className="mt-4 text-xs leading-6 text-stone-500">
                Sending an enquiry is not an automatic booking confirmation. Wait until availability, ritual details, final charges and booking terms have been confirmed.
              </p>
            </div>
          </div>
        </div>
      </section>

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
          PUJA PROCESS MODAL
          Keeps long ritual details out of the profile layout.
      ==================================================== */}

      {expandedPuja && activePujaProcess && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpandedPuja("");
          }}
        >
          <section
            id="puja-process-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="puja-process-title"
            aria-describedby="puja-process-introduction"
            className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-orange-200/70 bg-[#fffaf3] shadow-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-orange-900/10 bg-linear-to-r from-orange-50 via-amber-50 to-orange-100 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-orange-500 to-orange-700 text-white shadow-sm">
                  <BookOpen size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">
                    Ritual guide
                  </p>
                  <h2 id="puja-process-title" className="font-display mt-0.5 text-lg font-extrabold leading-snug text-[#2a1a10] sm:text-xl">
                    {expandedPuja} — Puja Process
                  </h2>
                  <p className="mt-1 text-xs text-stone-600">
                    A step-by-step overview from DivyaDhara
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedPuja("")}
                aria-label="Close puja process"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-orange-200 bg-white text-stone-600 transition hover:bg-orange-50 hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              <p id="puja-process-introduction" className="rounded-2xl border border-orange-100 bg-white p-4 text-sm leading-6 text-stone-600">
                {activePujaProcess.introduction}
              </p>

              <div className="mt-5 flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-[#2a1a10]">What usually happens</h3>
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-900">
                  {activePujaProcess.steps.length} steps
                </span>
              </div>

              <ol className="mt-4 space-y-4">
                {activePujaProcess.steps.map((step, index) => (
                  <li key={`${expandedPuja}-modal-step-${index}`} className="relative flex items-start gap-3">
                    {index < activePujaProcess.steps.length - 1 && (
                      <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%+4px)] w-px bg-orange-200" />
                    )}
                    <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-orange-200 bg-orange-100 text-xs font-extrabold text-orange-900">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 pb-1 pt-0.5">
                      <h4 className="text-sm font-bold text-stone-900">{step.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-amber-950">Important to know</p>
                <p className="mt-1.5 text-xs leading-5 text-stone-700">{activePujaProcess.note}</p>
              </div>
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-orange-900/10 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs leading-5 text-stone-500 sm:max-w-[55%]">
                Need to confirm the vidhi, samagri or duration? Ask the Acharya before booking.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setExpandedPuja("")}
                  className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  Close
                </button>
                <a
                  href="#book"
                  onClick={() => {
                    choosePuja(expandedPuja);
                    setExpandedPuja("");
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
                >
                  Choose this puja <ChevronRight size={15} />
                </a>
              </div>
            </footer>
          </section>
        </div>
      )}

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