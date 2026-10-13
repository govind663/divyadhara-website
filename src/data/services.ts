// src/data/services.ts

import {
  PUJA_CATEGORIES,
  type PujaCategory,
} from "./common/puja-catalogue";

/* =========================================================
   TYPES
========================================================= */

export type ServiceFaq = {
  q: string;
  a: string;
};

export type Service = {
  slug: string;
  name: string;
  category: string;
  image: string;
  price: string;
  duration: string;
  tagline: string;
  description: string[];
  benefits: string[];
  samagri: string[];
  faqs: ServiceFaq[];
  pujaTypes: string[];

  /** SEO metadata */
  seoTitle?: string;
  seoDescription?: string;
  searchTerms?: string[];

  /** Targeting information only; not confirmed availability */
  regions?: string[];
};

/* =========================================================
   SHARED CONFIGURATION
========================================================= */

const DEFAULT_IMAGE = "/images/puja-thali.jpeg";

const PAN_INDIA_REGIONS: string[] = [
  "North India",
  "South India",
  "East India",
  "West India",
  "Central India",
];

const COMMON_FAQS: ServiceFaq[] = [
  {
    q: "How can I book a Pandit Ji?",
    a: "Share the puja name, preferred date, city, language and ceremony requirements. Booking availability and final arrangements must be confirmed before the booking is complete.",
  },
  {
    q: "Is puja samagri included in the price?",
    a: "Samagri inclusion depends on the ritual and the agreed arrangement. Confirm the final checklist and any additional charges before booking.",
  },
  {
    q: "Can I request a regional puja procedure?",
    a: "Mention your preferred regional tradition and language during the enquiry. The exact procedure and availability need to be confirmed.",
  },
];

/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

/**
 * Normalizes names for matching.
 * Does not modify display names or existing URL slugs.
 */
export function normalizePujaName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Creates a URL-friendly slug.
 */
function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "puja-service"
  );
}

/**
 * Cleans display values without unexpectedly changing
 * the capitalization or spelling supplied in the catalogue.
 */
function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Removes duplicate strings after normalization while
 * preserving the order of the first occurrence.
 */
function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);
    const key = normalizePujaName(cleaned);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

/* =========================================================
   CURATED SERVICES
   Existing slugs are preserved for URL compatibility.
========================================================= */

const FEATURED_SERVICES: Service[] = [
  {
    slug: "rudrabhishek-pandit-booking",
    name: "Pandit Booking — Rudrabhishek & Vedic Pujas",
    category: "Pandit Booking",
    image: "/images/puja-thali.jpeg",
    price: "Contact Pandit for price",
    duration: "1–4 hrs",
    tagline:
      "Enquire about a Pandit Ji for traditional Vedic pujas and family ceremonies.",
    description: [
      "Explore Pandit booking options for Rudrabhishek, Shiv Puja, graha-shanti rituals and other Vedic ceremonies. The procedure depends on your family tradition and the selected puja.",
      "Share your location, preferred date, language and ceremony requirements so the arrangements, availability and final price can be confirmed before booking.",
    ],
    benefits: [
      "Enquire about different Vedic pujas and sanskars",
      "Discuss muhurat requirements",
      "Request a ritual-specific samagri checklist",
      "Share gotra and family names for the sankalpa",
      "Confirm language and ceremony details",
    ],
    samagri: [
      "Rudraksha mala, shankh, ghanta or kalash items, as required",
      "Flowers, fruits, panchamrit and other ritual offerings, as applicable",
      "Confirm the final samagri list with the booking coordinator",
    ],
    faqs: [
      {
        q: "How far ahead should I book?",
        a: "Booking lead time depends on the puja, date, location and Pandit Ji availability. Confirm the schedule before making plans.",
      },
      {
        q: "Are online pujas available?",
        a: "Ask the coordinator whether a video-call or temple-based arrangement is available for your selected ritual.",
      },
    ],
    pujaTypes: [
      "Rudrabhishek",
      "Shiv Puja",
      "Puja and Vedic Rituals",
      "Navgraha Shanti Puja",
      "Maha Mrityunjaya Jaap",
      "Ganesh Puja",
    ],
    seoTitle: "Pandit Ji Booking for Vedic Puja | Divya Dhara",
    seoDescription:
      "Enquire about Pandit Ji booking for Rudrabhishek, Shiv Puja and Vedic rituals. Confirm location, date, samagri and availability with Divya Dhara.",
    searchTerms: [
      "pandit ji booking",
      "vedic puja pandit",
      "rudrabhishek pandit",
      "hindu puja services",
    ],
    regions: PAN_INDIA_REGIONS,
  },

  {
    slug: "griha-pravesh-house-puja",
    name: "Griha Pravesh / House-Warming Puja",
    category: "Griha/House Puja",
    image: "/images/ashram-dawn.jpeg",
    price: "Contact Pandit for price",
    duration: "2.5–3.5 hrs",
    tagline:
      "Plan a traditional Griha Pravesh ceremony for your new home.",
    description: [
      "Griha Pravesh arrangements may include Ganapati pujan, Kalash sthapana, Vastu Shanti, Navgraha puja and havan, depending on your selected tradition.",
      "Share the property location, preferred date, regional customs and ceremony requirements. Confirm the ritual sequence, availability and total cost before booking.",
    ],
    benefits: [
      "Discuss your regional puja paddhati",
      "Plan puja and havan arrangements",
      "Enquire about muhurat requirements",
      "Request a samagri checklist",
    ],
    samagri: [
      "Kalash, coconut and red cloth",
      "Mango leaves and toran, where required",
      "Navadhanya and Vastu-related ritual items, as applicable",
      "Havan kund and havan samagri, if included",
    ],
    faqs: [
      {
        q: "Can I request a Tamil or Telugu Griha Pravesh?",
        a: "Mention your preferred language and tradition. The availability of a suitable Pandit Ji and the exact ritual procedure must be confirmed.",
      },
    ],
    pujaTypes: [
      "Griha Pravesh Puja",
      "Vastu Shanti Puja",
      "New Home Havan",
      "Navgraha Shanti Puja",
    ],
    seoTitle: "Griha Pravesh Puja & Pandit Booking | Divya Dhara",
    seoDescription:
      "Plan a Griha Pravesh or housewarming puja with regional ritual preferences, muhurat enquiries and a samagri checklist.",
    searchTerms: [
      "griha pravesh puja",
      "housewarming puja",
      "new home puja",
      "vastu shanti puja",
    ],
    regions: PAN_INDIA_REGIONS,
  },

  {
    slug: "vivah-marriage-sanskar",
    name: "Vivah / Marriage Sanskar",
    category: "Marriage/Vivah",
    image: "/images/festival-crowd.jpeg",
    price: "Contact Pandit for price",
    duration: "Full day / multi-day",
    tagline:
      "Enquire about traditional Hindu wedding rituals and ceremony planning.",
    description: [
      "Wedding arrangements may include lagna muhurat discussions, Ganesh puja, Mandap puja, kanyadaan, saptapadi and other ceremonies according to family tradition.",
      "Discuss the wedding date, location, regional customs, number of priests and ceremony sequence before confirming the arrangements.",
    ],
    benefits: [
      "Discuss wedding ritual requirements",
      "Enquire about muhurat consultation",
      "Plan the ceremony sequence",
      "Confirm the number of priests required",
      "Discuss destination wedding arrangements",
    ],
    samagri: [
      "Mandap-related ritual items, as arranged",
      "Havan kund, ghee and applicable havan samagri",
      "Saptapadi and other wedding ritual items, as required",
      "Confirm the final list with the Pandit Ji",
    ],
    faqs: [
      {
        q: "Do you arrange Pandits for destination weddings?",
        a: "Share the wedding location and dates to enquire about travel arrangements and availability. Travel and accommodation costs must be agreed in advance.",
      },
    ],
    pujaTypes: [
      "Vivah Sanskar / Hindu Wedding",
      "Engagement / Sagai Puja",
      "Ganesh Puja for Marriage",
      "Mandap Puja",
      "Vivah Havan",
      "Kanyadaan and Saptapadi Rituals",
    ],
    seoTitle: "Hindu Wedding Pandit & Vivah Sanskar | Divya Dhara",
    seoDescription:
      "Enquire about Hindu wedding Pandits, Vivah Sanskar, Mandap Puja, wedding rituals and regional ceremony requirements.",
    searchTerms: [
      "hindu wedding pandit",
      "vivah sanskar",
      "marriage puja",
      "wedding ceremony pandit",
    ],
    regions: PAN_INDIA_REGIONS,
  },

  {
    slug: "maha-havan-anushthan",
    name: "Maha Havan & Anushthan",
    category: "Havan",
    image: "/images/havan-fire.jpeg",
    price: "Contact Pandit for price",
    duration: "2–5 hrs / multi-day",
    tagline:
      "Enquire about traditional havan, mantra jaap and anushthan arrangements.",
    description: [
      "Havan and anushthan arrangements may include Ganesh, Navgraha, Rudra, Durga or other ritual observances according to the selected tradition.",
      "The mantra count, number of priests, duration, samagri and completion arrangements must be confirmed for the specific ceremony.",
    ],
    benefits: [
      "Discuss the sankalpa and ritual requirements",
      "Confirm the ceremony procedure and duration",
      "Request a havan samagri checklist",
      "Enquire about multi-day arrangements",
    ],
    samagri: [
      "Havan kund and suitable fuel, as required",
      "Ghee and ritual havan samagri",
      "Herbs, coconut, camphor and other items as applicable",
      "Confirm the final list for the selected havan",
    ],
    faqs: [
      {
        q: "Can a havan be performed on a terrace?",
        a: "This depends on the ceremony, ventilation, fire safety requirements and building rules. Confirm the venue with the coordinator before booking.",
      },
    ],
    pujaTypes: [
      "Ganesh Havan",
      "Navgraha Havan",
      "Rudra Havan",
      "Durga Havan",
      "Chandi Havan",
      "Maha Mrityunjaya Jaap and Havan",
      "Gayatri Mantra Jaap",
      "Navchandi Anushthan",
      "Family Shanti Havan",
    ],
    seoTitle: "Havan, Mantra Jaap & Anushthan Booking | Divya Dhara",
    seoDescription:
      "Enquire about traditional havan, mantra jaap and anushthan arrangements, including ritual requirements, duration and samagri.",
    searchTerms: [
      "havan booking",
      "vedic havan",
      "mantra jaap",
      "religious anushthan",
    ],
    regions: PAN_INDIA_REGIONS,
  },

  {
    slug: "satyanarayan-katha-puja",
    name: "Satyanarayan Katha & Puja",
    category: "Satyanarayan Puja",
    image: "/images/aarti-night.jpeg",
    price: "Contact Pandit for price",
    duration: "2–2.5 hrs",
    tagline:
      "Plan a Satyanarayan Katha and Puja for a family occasion.",
    description: [
      "The ceremony may include Satyanarayan vrat katha, puja, panchamrit, tulsi archana, aarti and prasad according to the agreed procedure.",
      "Share your preferred language, date, location and family tradition to enquire about the arrangements.",
    ],
    benefits: [
      "Discuss your preferred language",
      "Plan the ceremony date and timing",
      "Request a samagri checklist",
      "Confirm katha and puja arrangements",
    ],
    samagri: [
      "Satyanarayan image or murti",
      "Panchamrit, banana and tulsi, as required",
      "Puja cloth, supari and applicable offerings",
      "Confirm the complete list before booking",
    ],
    faqs: [
      {
        q: "Is Purnima required for Satyanarayan Puja?",
        a: "Traditions and family preferences vary. Discuss your preferred date and muhurat with the Pandit Ji.",
      },
    ],
    pujaTypes: [
      "Satyanarayan Katha and Puja",
      "Satyanarayan Vrat",
      "Purnima and Amavasya Puja",
    ],
    seoTitle: "Satyanarayan Katha & Puja Booking | Divya Dhara",
    seoDescription:
      "Enquire about Satyanarayan Katha and Puja, vrat arrangements, preferred language, samagri and ceremony scheduling.",
    searchTerms: [
      "satyanarayan katha",
      "satyanarayan puja",
      "satyanarayan vrat",
      "purnima puja",
    ],
    regions: PAN_INDIA_REGIONS,
  },

  {
    slug: "bhoomi-pujan",
    name: "Bhoomi Pujan — Land & Foundation Ceremony",
    category: "Bhoomi Puja",
    image: "/images/yatra-himalaya.jpeg",
    price: "Contact Pandit for price",
    duration: "2–3 hrs",
    tagline:
      "Enquire about Bhoomi Pujan before construction or foundation work.",
    description: [
      "Bhoomi Pujan may include worship associated with Bhudevi, Vastu Purush and foundation rituals according to the selected tradition.",
      "Share the plot location, construction stage and preferred date so the procedure, travel feasibility and total cost can be confirmed.",
    ],
    benefits: [
      "Enquire about an on-site ceremony",
      "Discuss Shilanyas requirements",
      "Confirm muhurat arrangements",
      "Request a site-specific samagri list",
    ],
    samagri: [
      "Foundation brick or stone, if required",
      "Navadhanya and other ritual items",
      "Coconut and site-related materials, as applicable",
      "Confirm the final checklist with the Pandit Ji",
    ],
    faqs: [
      {
        q: "Can the Pandit Ji travel to my construction site?",
        a: "Provide the site location during your enquiry. Travel feasibility, charges and availability must be confirmed.",
      },
    ],
    pujaTypes: [
      "Bhoomi Puja / Land Worship",
      "Bhumi Pujan for Construction",
      "Shilanyas Ceremony",
      "Vastu Shanti Puja",
    ],
    seoTitle: "Bhoomi Pujan & Shilanyas Ceremony | Divya Dhara",
    seoDescription:
      "Enquire about Bhoomi Pujan, land worship and Shilanyas ceremonies. Discuss site location, muhurat and ritual requirements.",
    searchTerms: [
      "bhoomi pujan",
      "bhumi puja",
      "shilanyas ceremony",
      "land worship puja",
    ],
    regions: PAN_INDIA_REGIONS,
  },

  {
    slug: "car-vahan-puja",
    name: "Car / Vahan Puja",
    category: "Car Puja",
    image: "/images/temple-south.jpeg",
    price: "Contact Pandit for price",
    duration: "30–45 min",
    tagline:
      "Enquire about a traditional puja for your new car or vehicle.",
    description: [
      "Vehicle puja may include Ganapati pujan, tilak, coconut offering, aarti and other customary steps according to family tradition.",
      "Share your location, vehicle type and preferred date to enquire about the available arrangements.",
    ],
    benefits: [
      "Discuss home, parking or temple arrangements",
      "Confirm the ceremony duration",
      "Request the required samagri list",
      "Check the preferred date and time",
    ],
    samagri: [
      "Coconut and lemons, if required",
      "Flowers and toran, as applicable",
      "Roli, chawal and red cloth",
      "Camphor and aarti items, as needed",
    ],
    faqs: [
      {
        q: "Can I enquire about same-day vehicle puja?",
        a: "Same-day availability is not guaranteed. Share your location and preferred time to check the arrangements.",
      },
    ],
    pujaTypes: ["Vehicle Puja", "Ganesh Puja"],
    seoTitle: "Car Puja & Vehicle Puja Booking | Divya Dhara",
    seoDescription:
      "Enquire about car puja and vehicle puja arrangements, including preferred timing, location and ritual samagri.",
    searchTerms: [
      "car puja",
      "new vehicle puja",
      "vahan puja",
      "vehicle puja pandit",
    ],
    regions: PAN_INDIA_REGIONS,
  },

  {
    slug: "kaalsarp-dosh-nivaran",
    name: "Kaal Sarp Dosh Puja & Rahu-Ketu Shanti",
    category: "Other Puja",
    image: "/images/hero-kedarnath.jpeg",
    price: "Contact Pandit for price",
    duration: "3 hrs",
    tagline:
      "Enquire about traditional Kaal Sarp-related rituals and Rahu-Ketu Shanti.",
    description: [
      "Depending on the selected tradition, ritual arrangements may include Kaal Sarp-related puja, Rudrabhishek, mantra jaap and daan.",
      "Discuss the proposed location, ceremony details, travel arrangements and total cost before confirming a booking.",
    ],
    benefits: [
      "Discuss the intended ritual and sankalpa",
      "Enquire about Ujjain or Trimbakeshwar arrangements",
      "Request a samagri checklist",
      "Confirm travel and additional charges in advance",
    ],
    samagri: [
      "Silver Nag-Nagin pair, if required by the ritual",
      "Rahu-Ketu-related ritual items, as applicable",
      "Sesame, barley and other items as advised",
      "Confirm the exact list with the Pandit Ji",
    ],
    faqs: [
      {
        q: "Must I travel to Ujjain for this puja?",
        a: "Location requirements depend on the selected ritual and your preference. Discuss location options with the coordinator before booking.",
      },
      {
        q: "Is a particular result guaranteed?",
        a: "Religious rituals are matters of faith and tradition. No specific astrological, financial, health or personal outcome can be guaranteed.",
      },
    ],
    pujaTypes: [
      "Kaal Sarp Dosh Puja",
      "Rahu-Ketu Shanti",
      "Rudrabhishek",
      "Shiv Puja",
      "Navgraha Shanti Puja",
    ],
    seoTitle: "Kaal Sarp Dosh Puja Booking | Divya Dhara",
    seoDescription:
      "Enquire about Kaal Sarp Dosh Puja and Rahu-Ketu Shanti arrangements, including location, ritual procedure and booking details.",
    searchTerms: [
      "kaal sarp dosh puja",
      "kaalsarp puja",
      "rahu ketu shanti",
      "ujjain puja enquiry",
      "trimbakeshwar puja enquiry",
    ],
    regions: PAN_INDIA_REGIONS,
  },
];

/* =========================================================
   CATALOGUE-TO-SERVICE CONVERSION
========================================================= */

/**
 * Builds a service record for a catalogue item that does not
 * already have an exact normalized-name association with one
 * of the curated services.
 *
 * Commercial details remain enquiry-based unless actual
 * item-specific data is supplied.
 */
function createCatalogueService(
  category: PujaCategory,
  pujaName: string,
  reservedSlugs: Set<string>,
): Service {
  const name = cleanText(pujaName);
  const baseSlug = slugify(name);

  let slug = baseSlug;
  let suffix = 2;

  while (reservedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  reservedSlugs.add(slug);

  return {
    slug,
    name,
    category: cleanText(category.name),
    image: DEFAULT_IMAGE,

    price: "Contact for price",
    duration: "Confirm during enquiry",

    tagline: `Enquire about ${name} and its traditional ceremony arrangements.`,

    description: [
      `${name} is listed in the Divya Dhara puja catalogue. The ritual procedure, applicable family traditions and ceremony requirements should be discussed with the Pandit Ji before booking.`,
      `Share your preferred date, city, language and specific requirements to enquire about availability, samagri, duration and the final price.`,
    ],

    benefits: [
      `Enquire about ${name}`,
      "Discuss the preferred ritual procedure",
      "Confirm date, location and language",
      "Request the applicable samagri checklist",
      "Confirm availability and charges before booking",
    ],

    samagri: [
      "Samagri requirements depend on the specific ritual and regional tradition.",
      "Request and confirm the final itemised checklist before the ceremony.",
    ],

    faqs: [
      {
        q: `How can I enquire about ${name}?`,
        a: `Share your preferred date, location, language and requirements. The booking team must confirm the arrangements and availability.`,
      },
      ...COMMON_FAQS,
    ],

    pujaTypes: [name],

    seoTitle: `${name} Booking & Pandit Enquiry | Divya Dhara`,
    seoDescription:
      `Enquire about ${name}, Pandit booking, ritual requirements and samagri. Confirm location, availability and pricing with Divya Dhara.`,

    searchTerms: uniqueStrings([
      name,
      `${name} booking`,
      `${name} pandit`,
      `${name} puja`,
    ]),

    regions: [...PAN_INDIA_REGIONS],
  };
}

/**
 * Complete service list:
 * - Curated services keep their original slugs.
 * - Duplicate catalogue names are ignored.
 * - Catalogue names already linked to curated services
 *   do not automatically create another service page.
 * - Other unique catalogue entries receive generated records.
 */
function buildAllServices(): Service[] {
  const reservedSlugs = new Set(
    FEATURED_SERVICES.map((service) => service.slug),
  );

  const curatedPujaNames = new Set(
    FEATURED_SERVICES.flatMap((service) =>
      service.pujaTypes.map(normalizePujaName),
    ),
  );

  const seenCatalogueNames = new Set<string>();
  const catalogueServices: Service[] = [];

  for (const category of PUJA_CATEGORIES) {
    for (const rawPujaName of category.items) {
      const pujaName = cleanText(rawPujaName);
      const key = normalizePujaName(pujaName);

      if (!key || seenCatalogueNames.has(key)) {
        continue;
      }

      seenCatalogueNames.add(key);

      // The puja is already explicitly linked to a curated service.
      if (curatedPujaNames.has(key)) {
        continue;
      }

      catalogueServices.push(
        createCatalogueService(category, pujaName, reservedSlugs),
      );
    }
  }

  return [...FEATURED_SERVICES, ...catalogueServices];
}

/** All curated and catalogue-generated services. */
export const SERVICES: Service[] = buildAllServices();

/* =========================================================
   LOOKUP HELPERS
========================================================= */

/**
 * Returns catalogue categories containing at least one
 * explicitly linked puja type for the supplied service.
 */
export function getCatalogueCategoriesForService(
  service: Service,
): PujaCategory[] {
  const servicePujaNames = new Set(
    service.pujaTypes.map(normalizePujaName),
  );

  return PUJA_CATEGORIES.filter((category) =>
    category.items.some((item) =>
      servicePujaNames.has(normalizePujaName(item)),
    ),
  );
}

/** Find a service using its URL slug. */
export function getServiceBySlug(
  slug: string,
): Service | undefined {
  const normalizedSlug = slug.trim();

  return SERVICES.find((service) => service.slug === normalizedSlug);
}

/** Return every service linked to a puja name. */
export function getServicesForPuja(
  pujaName: string,
): Service[] {
  const target = normalizePujaName(pujaName);

  if (!target) {
    return [];
  }

  return SERVICES.filter((service) =>
    service.pujaTypes.some(
      (name) => normalizePujaName(name) === target,
    ),
  );
}

/** Return services linked to a catalogue category slug. */
export function getServicesForCategory(
  categorySlug: string,
): Service[] {
  const targetSlug = categorySlug.trim();

  const category = PUJA_CATEGORIES.find(
    (item) => item.slug === targetSlug,
  );

  if (!category) {
    return [];
  }

  const categoryPujaNames = new Set(
    category.items.map(normalizePujaName),
  );

  return SERVICES.filter((service) =>
    service.pujaTypes.some((name) =>
      categoryPujaNames.has(normalizePujaName(name)),
    ),
  );
}

/** Find catalogue categories for a service slug. */
export function getServiceCategoriesBySlug(
  slug: string,
): PujaCategory[] {
  const service = getServiceBySlug(slug);

  return service
    ? getCatalogueCategoriesForService(service)
    : [];
}

/* =========================================================
   SERVICE SEARCH
========================================================= */

/**
 * Search by service name, category, tagline, descriptions,
 * SEO fields, search terms and linked puja names.
 *
 * Query order does not matter. Every meaningful query token
 * must match at least one token in the searchable service data.
 */
export function searchServices(query: string): Service[] {
  const target = normalizePujaName(query);

  if (!target) {
    return [];
  }

  const queryTokens = target.split(" ").filter(Boolean);

  return SERVICES.filter((service) => {
    const searchableText = [
      service.name,
      service.category,
      service.tagline,
      service.seoTitle ?? "",
      service.seoDescription ?? "",
      ...(service.searchTerms ?? []),
      ...service.pujaTypes,
      ...service.description,
    ]
      .map(normalizePujaName)
      .filter(Boolean)
      .join(" ");

    const searchableTokens = searchableText.split(" ");

    return queryTokens.every((queryToken) =>
      searchableTokens.some(
        (searchableToken) =>
          searchableToken === queryToken ||
          searchableToken.startsWith(queryToken),
      ),
    );
  });
}

/* =========================================================
   CATALOGUE CONSISTENCY
========================================================= */

/**
 * Returns catalogue items that have no exact normalized-name
 * association with any service puja type.
 */
export function getUnlinkedPujaTypes(): string[] {
  const linkedNames = new Set(
    SERVICES.flatMap((service) =>
      service.pujaTypes.map(normalizePujaName),
    ),
  );

  return uniqueStrings(
    PUJA_CATEGORIES.flatMap((category) => category.items),
  ).filter((name) => !linkedNames.has(normalizePujaName(name)));
}

/* =========================================================
   VALIDATION
========================================================= */

/**
 * Lightweight consistency checks for development and tests.
 *
 * This function returns errors; it does not throw, modify
 * services, or claim that content is SEO-ready.
 */
export function validateServices(): string[] {
  const errors: string[] = [];

  const seenSlugs = new Set<string>();
  const seenSeoTitles = new Map<string, string>();

  for (const service of SERVICES) {
    const label = service.name.trim() || service.slug || "(unnamed service)";
    const slug = service.slug.trim();
    const name = service.name.trim();

    if (!slug) {
      errors.push(`Service "${label}" has an empty slug.`);
    } else {
      if (seenSlugs.has(slug)) {
        errors.push(`Duplicate service slug: "${slug}".`);
      }

      seenSlugs.add(slug);

      if (slug !== service.slug) {
        errors.push(
          `Service "${label}" has leading or trailing whitespace in its slug.`,
        );
      }

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        errors.push(
          `Service "${label}" has a non-URL-friendly slug: "${slug}".`,
        );
      }
    }

    if (!name) {
      errors.push(`Service "${service.slug}" has an empty name.`);
    }

    if (!service.category.trim()) {
      errors.push(`Service "${label}" has an empty category.`);
    }

    if (!service.image.trim()) {
      errors.push(`Service "${label}" has an empty image path.`);
    }

    if (!service.price.trim()) {
      errors.push(`Service "${label}" has no price information.`);
    }

    if (!service.duration.trim()) {
      errors.push(`Service "${label}" has no duration information.`);
    }

    if (!service.tagline.trim()) {
      errors.push(`Service "${label}" has an empty tagline.`);
    }

    if (service.description.length === 0) {
      errors.push(`Service "${label}" has no description paragraphs.`);
    } else if (
      service.description.some((paragraph) => !paragraph.trim())
    ) {
      errors.push(`Service "${label}" has an empty description paragraph.`);
    }

    if (service.benefits.length === 0) {
      errors.push(`Service "${label}" has no benefits.`);
    } else if (service.benefits.some((item) => !item.trim())) {
      errors.push(`Service "${label}" has an empty benefit item.`);
    }

    if (service.samagri.length === 0) {
      errors.push(`Service "${label}" has no samagri information.`);
    } else if (service.samagri.some((item) => !item.trim())) {
      errors.push(`Service "${label}" has an empty samagri item.`);
    }

    if (service.pujaTypes.length === 0) {
      errors.push(`Service "${label}" has no linked puja types.`);
    } else if (service.pujaTypes.some((item) => !item.trim())) {
      errors.push(`Service "${label}" has an empty linked puja type.`);
    }

    if (!service.seoTitle?.trim()) {
      errors.push(`Service "${label}" has no SEO title.`);
    } else {
      const normalizedTitle = normalizePujaName(service.seoTitle);
      const existingSlug = seenSeoTitles.get(normalizedTitle);

      if (existingSlug && existingSlug !== service.slug) {
        errors.push(
          `Duplicate SEO title "${service.seoTitle}" used by services "${existingSlug}" and "${service.slug}".`,
        );
      } else {
        seenSeoTitles.set(normalizedTitle, service.slug);
      }
    }

    if (!service.seoDescription?.trim()) {
      errors.push(`Service "${label}" has no SEO description.`);
    }

    if (service.faqs.some((faq) => !faq.q.trim() || !faq.a.trim())) {
      errors.push(`Service "${label}" has an FAQ with an empty question or answer.`);
    }

    const faqQuestions = service.faqs.map((faq) =>
      normalizePujaName(faq.q),
    );

    if (new Set(faqQuestions).size !== faqQuestions.length) {
      errors.push(`Service "${label}" has duplicate FAQ questions.`);
    }
  }

  return errors;
}