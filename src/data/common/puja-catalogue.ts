
export type PujaCategory = {
  slug: string;
  name: string;
  description: string;
  note?: string;
  seoTitle: string;
  seoDescription: string;
  searchTerms: string[];
  regions: string[];
  items: string[];
};

export type PujaSearchResult = {
  pujaName: string;
  category: PujaCategory;
  matchedTerm: string;
};

export const PUJA_PAGE_CONTENT = {
  title: "Hindu Puja Services & Vedic Rituals",
  subtitle:
    "Explore traditional Hindu pujas, sanskars, havans, kathas and family ceremonies, and enquire about a suitable Pandit Ji across India.",

  introduction:
    "Explore Hindu puja services for family milestones, weddings, newborn ceremonies, education, festivals, homes, businesses, spiritual observances and ancestral rituals. Browse ceremonies by category and enquire about a Pandit Ji suited to your location, language and family tradition.",

  suitabilityNote:
    "Ritual procedures, samagri, duration, muhurat, mantras and regional practices may vary according to family tradition, sampradaya, location and the guidance of the Pandit Ji. Confirm the ceremony requirements and availability before booking.",

  bookingTitle: "Enquire About a Pandit Ji for Your Puja",
  bookingDescription:
    "Select a ceremony and share your city or PIN code, preferred date, language, tradition and ceremony requirements so that availability can be checked.",

  bookingContactDescription:
    "Availability, pricing, travel arrangements, samagri, ceremony duration and the Pandit's relevant experience must be confirmed before a booking is finalized.",

  primaryCta: "Find a Pandit Ji",
  secondaryCta: "Explore Puja Services",

  seoTitle: "Hindu Puja Services & Pandit Ji Booking Across India",
  seoDescription:
    "Explore Hindu pujas, Vedic rituals, havans, sanskars and kathas. Enquire about Pandit Ji availability based on your location and ceremony requirements.",
} as const;

const PAN_INDIA_REGIONS = [
  "North India",
  "South India",
  "East India",
  "West India",
  "Central India",
] as const;

export const PUJA_CATEGORIES: PujaCategory[] = [
  {
    slug: "birth-newborn-ceremonies",
    name: "Birth & Newborn Ceremonies",
    description:
      "Traditional Hindu sanskars associated with pregnancy, childbirth, naming a child and early childhood milestones.",
    seoTitle: "Namkaran, Annaprashan & Newborn Sanskar Puja",
    seoDescription:
      "Explore Namkaran, Jatakarma, Annaprashan, Mundan and other traditional Hindu newborn ceremonies. Confirm regional customs and Pandit Ji availability.",
    searchTerms: [
      "namkaran puja",
      "naamkaran ceremony",
      "newborn puja",
      "baby naming ceremony",
      "annaprashan",
      "mukh jhoothi ceremony",
      "mundan ceremony",
      "chudakarana",
      "god bharai puja",
      "jatakarma",
      "ayushya homa",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Garbhadhana Sanskar",
      "Pumsavana Sanskar",
      "Simantonnayana / Godh Bharai Puja",
      "Jatakarma Sanskar",
      "Namkaran / Naming Ceremony",
      "Nishkraman Sanskar",
      "Annaprashan / First Rice Ceremony",
      "Mundan / Chudakarana Sanskar",
      "Karnavedha / Ear-Piercing Ceremony",
      "Child's Birthday Puja",
      "Ayushya Homa / Long-Life Ritual",
    ],
  },
  {
    slug: "education-childhood-sanskar",
    name: "Education & Childhood Sanskar",
    description:
      "Traditional ceremonies associated with learning, education, childhood milestones and sacred initiation.",
    seoTitle: "Vidyarambh, Saraswati Puja & Janeu Sanskar",
    seoDescription:
      "Explore Vidyarambh, Aksharabhyasam, Saraswati Puja, Upanayan and other Hindu education and childhood sanskar ceremonies.",
    searchTerms: [
      "vidyarambh puja",
      "vidyarambham",
      "aksharabhyasam",
      "aksharabhyas",
      "saraswati puja",
      "janeu sanskar",
      "upanayanam",
      "upanayana ceremony",
      "yajnopavita",
      "vedarambh",
      "education success puja",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Vidyarambh / First Writing Ceremony",
      "Aksharabhyasam",
      "Saraswati Puja",
      "Upanayan Sanskar / Janeu Ceremony",
      "Yajnopavita Sanskar",
      "Vedarambh Sanskar",
      "Educational Success Puja",
      "Examination Success Puja",
    ],
  },
  {
    slug: "marriage-relationship-ceremonies",
    name: "Marriage & Relationship Ceremonies",
    description:
      "Hindu wedding rituals, engagement ceremonies and family observances associated with marriage and married life.",
    seoTitle: "Hindu Wedding Pandit, Vivah Sanskar & Marriage Puja",
    seoDescription:
      "Explore Vivah Sanskar, wedding havan, engagement, Mandap Puja and Hindu marriage rituals. Confirm the Pandit's experience with your regional wedding tradition.",
    searchTerms: [
      "wedding pandit",
      "marriage pandit",
      "vivah sanskar",
      "vivaha",
      "hindu wedding ceremony",
      "shaadi puja",
      "lagna vidhi",
      "vivaha homam",
      "kalyanam",
      "engagement puja",
      "sagai puja",
      "mandap puja",
      "wedding havan",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Vivah Sanskar / Hindu Wedding",
      "Kundali Matching",
      "Engagement / Sagai Puja",
      "Roka and Tilak Ceremony",
      "Ganesh Puja for Marriage",
      "Haldi and Wedding Rituals",
      "Mandap Puja",
      "Vivah Havan",
      "Kanyadaan and Saptapadi Rituals",
      "Grihastha Jeevan Puja",
      "Anniversary Puja",
      "Marriage Obstacle Removal Puja",
    ],
  },
  {
    slug: "home-property-housewarming-puja",
    name: "Home, Property & Housewarming Puja",
    description:
      "Traditional ceremonies for new homes, land, construction projects, commercial premises, machinery and vehicles.",
    seoTitle: "Griha Pravesh, Vastu Shanti & Bhoomi Puja Pandit",
    seoDescription:
      "Explore Griha Pravesh, Vastu Shanti, Bhoomi Pujan, Shilanyas and property ceremonies. Enquire about a suitable Pandit Ji for your location.",
    searchTerms: [
      "griha pravesh pandit",
      "griha pravesh puja",
      "griha pravesham",
      "housewarming puja",
      "new home puja",
      "vastu shanti",
      "bhoomi pujan",
      "bhumi puja",
      "bhoomi pooja",
      "shilanyas",
      "office opening puja",
      "shop opening puja",
      "factory inauguration puja",
      "vehicle puja",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Griha Pravesh Puja",
      "Vastu Shanti Puja",
      "Bhoomi Puja / Land Worship",
      "Bhumi Pujan for Construction",
      "Shilanyas Ceremony",
      "Vastu Dosh Nivaran Puja",
      "New Home Havan",
      "Office Opening Puja",
      "Shop Opening Puja",
      "Factory Inauguration Puja",
      "New Property Purchase Puja",
      "Vehicle Puja",
      "Machinery Puja",
    ],
  },
  {
    slug: "daily-family-special-hindu-pujas",
    name: "Daily, Family & Special Hindu Pujas",
    description:
      "Common Hindu devotional ceremonies, deity worship, sacred readings and family pujas.",
    seoTitle: "Book a Pandit for Hindu Puja & Vedic Rituals",
    seoDescription:
      "Explore Ganesh Puja, Lakshmi Puja, Satyanarayan Katha, Shiv Puja, Rudrabhishek, Sundarkand Path and other Hindu devotional ceremonies.",
    searchTerms: [
      "pandit for puja",
      "puja pandit booking",
      "pooja services",
      "ganesh puja",
      "ganpati puja",
      "lakshmi puja",
      "satyanarayan katha",
      "shiv puja",
      "rudrabhishek",
      "krishna puja",
      "hanuman puja",
      "durga puja",
      "sundarkand path",
      "akhand ramayan path",
      "vedic rituals",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Ganesh Puja",
      "Lakshmi Puja",
      "Satyanarayan Katha and Puja",
      "Shiv Puja",
      "Rudrabhishek",
      "Maha Mrityunjaya Jaap",
      "Vishnu Puja",
      "Krishna Puja",
      "Ram Puja",
      "Hanuman Puja",
      "Durga Puja",
      "Chandi Path",
      "Devi Bhagwat Path",
      "Saraswati Puja",
      "Gayatri Jaap",
      "Tulsi Puja",
      "Sundarkand Path",
      "Akhand Ramayan Path",
      "Bhagwat Katha",
      "Vishnu Sahasranama Path",
      "Puja and Vedic Rituals",
    ],
  },
  {
    slug: "graha-shanti-astrology-spiritual-remedies",
    name: "Graha Shanti, Astrology & Spiritual Remedies",
    description:
      "Traditional graha shanti, mantra jaap and spiritual rituals selected according to individual circumstances and family tradition.",
    note:
      "Ritual suitability depends on the individual's circumstances, tradition and the Pandit's guidance. No spiritual ritual guarantees a particular outcome.",
    seoTitle: "Navgraha Shanti, Shani Shanti & Graha Puja",
    seoDescription:
      "Learn about traditional Navgraha Shanti, Shani Shanti, Rahu-Ketu and other graha-related pujas. Confirm ritual suitability with a knowledgeable Pandit Ji.",
    searchTerms: [
      "navgraha shanti",
      "navagraha puja",
      "navgraha havan",
      "mangal dosh puja",
      "kaal sarp dosh puja",
      "kalsarp puja",
      "pitra dosh puja",
      "shani shanti",
      "rahu ketu shanti",
      "guru puja",
      "chandra shanti",
      "nakshatra shanti",
      "graha shanti havan",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Navgraha Shanti Puja",
      "Navgraha Havan",
      "Mangal Dosh Nivaran Puja",
      "Kaal Sarp Dosh Puja",
      "Pitra Dosh Nivaran Puja",
      "Shani Shanti Puja",
      "Rahu-Ketu Shanti",
      "Brihaspati / Guru Puja",
      "Chandra Shanti Puja",
      "Maha Mrityunjaya Jaap",
      "Nakshatra Shanti",
      "Rudra Havan",
      "Vastu Dosh Shanti",
      "Janmadin Graha Shanti",
    ],
  },
  {
    slug: "hindu-festivals-vrat-puja",
    name: "Hindu Festivals & Vrat Puja",
    description:
      "Festival pujas, seasonal observances and traditional ceremonies associated with Hindu vrat and sacred days.",
    seoTitle: "Hindu Festival Puja, Vrat & Religious Ceremonies",
    seoDescription:
      "Explore Diwali, Navratri, Shivratri, Janmashtami, Ganesh Chaturthi, Chhath and other Hindu festival pujas and vrat observances.",
    searchTerms: [
      "diwali puja",
      "deepavali puja",
      "navratri puja",
      "durga ashtami",
      "dussehra puja",
      "holika dahan",
      "janmashtami puja",
      "ram navami",
      "maha shivratri",
      "ganesh chaturthi",
      "ganesh utsav",
      "karwa chauth",
      "hartalika teej",
      "chhath puja",
      "ekadashi vrat",
      "pitru paksha",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Diwali and Lakshmi-Ganesh Puja",
      "Navratri Puja",
      "Durga Ashtami Puja",
      "Dussehra Puja",
      "Holi and Holika Dahan Puja",
      "Janmashtami Puja",
      "Ram Navami Puja",
      "Hanuman Jayanti Puja",
      "Maha Shivratri Puja",
      "Shravan Maas Puja",
      "Ganesh Chaturthi Puja",
      "Vasant Panchami Puja",
      "Akshaya Tritiya Puja",
      "Raksha Bandhan Puja",
      "Karwa Chauth Puja",
      "Hartalika Teej Puja",
      "Vat Savitri Puja",
      "Chhath Puja",
      "Govardhan Puja",
      "Bhai Dooj Puja",
      "Makar Sankranti Puja",
      "Satyanarayan Vrat",
      "Ekadashi Vrat Puja",
      "Purnima and Amavasya Puja",
      "Pitru Paksha Rituals",
    ],
  },
  {
    slug: "business-career-prosperity-puja",
    name: "Business, Career & Prosperity Puja",
    description:
      "Traditional pujas for business openings, workplaces, professional milestones and prosperity-related observances.",
    seoTitle: "Business Opening, Office & Lakshmi-Kubera Puja",
    seoDescription:
      "Explore business opening pujas, office inauguration ceremonies, Lakshmi-Kubera Puja and traditional rituals for commercial premises.",
    searchTerms: [
      "business opening puja",
      "new business puja",
      "office inauguration puja",
      "shop opening puja",
      "factory puja",
      "startup puja",
      "lakshmi kubera puja",
      "kuber puja",
      "career puja",
      "machinery puja",
      "dhanteras puja",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Lakshmi-Kubera Puja",
      "Ganesh-Lakshmi Puja",
      "Business Opening Puja",
      "Office and Commercial Property Puja",
      "New Venture / Startup Puja",
      "Career Progress Puja",
      "Business Prosperity Havan",
      "Dhanteras Puja",
      "Kuber Puja",
      "Tools and Equipment Puja",
      "Vehicle and Transport Business Puja",
    ],
  },
  {
    slug: "havan-jaap-katha-anushthan",
    name: "Havan, Jaap, Katha & Anushthan",
    description:
      "Havan ceremonies, mantra recitations, religious readings and multi-day spiritual observances.",
    seoTitle: "Havan, Homam, Vedic Jaap, Katha & Anushthan",
    seoDescription:
      "Explore Ganesh Havan, Navgraha Havan, Rudra Havan, mantra jaap, Bhagwat Katha and traditional anushthan ceremonies.",
    searchTerms: [
      "havan pandit",
      "homa",
      "homam",
      "havan ceremony",
      "yagna",
      "yajna",
      "vedic homam",
      "mantra jaap",
      "maha mrityunjaya jaap",
      "bhagwat katha",
      "bhagwat saptah",
      "ram katha",
      "navchandi anushthan",
      "family shanti havan",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Ganesh Havan",
      "Navgraha Havan",
      "Rudra Havan",
      "Durga Havan",
      "Chandi Havan",
      "Maha Mrityunjaya Jaap and Havan",
      "Gayatri Mantra Jaap",
      "Navchandi Anushthan",
      "Bhagwat Saptah",
      "Ram Katha",
      "Sundarkand Path",
      "Akhand Path",
      "Vedic Mantra Jaap",
      "Special Sankalp Puja",
      "Family Shanti Havan",
    ],
  },
  {
    slug: "health-peace-family-wellbeing-puja",
    name: "Health, Peace & Family Well-Being Puja",
    description:
      "Traditional prayers and pujas associated with spiritual well-being, family harmony, peace and long-life observances.",
    seoTitle: "Ayushya Puja, Shanti Havan & Family Peace Rituals",
    seoDescription:
      "Explore Ayushya Puja, Dhanvantari Puja, Shanti Havan and traditional family peace rituals. These ceremonies do not replace medical care.",
    searchTerms: [
      "ayushya puja",
      "ayush homam",
      "dhanvantari puja",
      "family peace puja",
      "shanti havan",
      "griha shanti",
      "long life puja",
      "maha mrityunjaya puja",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Ayushya Puja",
      "Maha Mrityunjaya Puja",
      "Dhanvantari Puja",
      "Family Peace Puja",
      "Shanti Havan",
      "Birthday and Long-Life Puja",
      "Recovery and Well-Being Prayer Rituals",
      "Griha Shanti Puja",
    ],
  },
  {
    slug: "death-antyeshti-ancestor-rituals",
    name: "Death, Antyeshti & Ancestor Rituals",
    description:
      "Traditional Hindu funeral rites, shraddha, tarpan, pind daan and ancestral observances, with practices varying by family and region.",
    note:
      "These ceremonies can be time-sensitive and emotionally difficult. Confirm local customs, required documents or materials, location and ritual sequence with the relevant family and Pandit Ji.",
    seoTitle: "Antyeshti, Shraddha, Tarpan & Pind Daan Rituals",
    seoDescription:
      "Explore traditional Hindu Antyeshti, Shraddha, Asthi Visarjan, Tarpan and Pind Daan ceremonies. Confirm local customs and availability with a Pandit Ji.",
    searchTerms: [
      "antyeshti sanskar",
      "hindu funeral rites",
      "shraddha puja",
      "shradha ceremony",
      "pind daan",
      "pind dan",
      "gaya pind daan",
      "tarpan vidhi",
      "asthi visarjan",
      "asthi sanchayan",
      "terahvin ceremony",
      "dashgatra",
      "pitru paksha rituals",
      "tripindi shraddha",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Antyeshti Sanskar / Hindu Funeral Rites",
      "Funeral Prayer and Vedic Rituals",
      "Kapal Kriya Guidance, where traditionally applicable",
      "Asthi Sanchayan",
      "Asthi Visarjan",
      "Dashakriya / Dashgatra Rituals",
      "Ekoddishta Shraddha",
      "Sapindikaran Shraddha",
      "Terahvin / Thirteenth-Day Ceremony",
      "Monthly Shraddha",
      "Masik and Annual Barsi Shraddha",
      "Pind Daan",
      "Tarpan",
      "Pitru Paksha Shraddha",
      "Gaya Shraddha and Pind Daan",
      "Narayan Bali Puja, where appropriate",
      "Tripindi Shraddha",
      "Ancestor Peace Prayers",
      "Pitru-related Rituals",
    ],
  },
  {
    slug: "special-regional-hindu-ceremonies",
    name: "Special & Regional Hindu Ceremonies",
    description:
      "Regional and temple-related ceremonies that may vary by language, sampradaya, regional Panchang and family tradition.",
    note:
      "A regional term does not establish that two rituals are identical. Confirm the required tradition and the Pandit Ji's relevant experience before booking.",
    seoTitle: "Regional Hindu Puja, Temple Rituals & Vedic Ceremonies",
    seoDescription:
      "Explore regional Hindu ceremonies, temple rituals and traditional Vedic practices. Enquire about language, location and Pandit Ji availability.",
    searchTerms: [
      "regional hindu puja",
      "temple puja",
      "archana",
      "tirth puja",
      "kashi rituals",
      "gaya rituals",
      "south indian homam",
      "bengali durga puja",
      "marathi puja",
      "gujarati puja",
      "regional sanskar",
      "panchang muhurat",
      "sankalp puja",
    ],
    regions: [...PAN_INDIA_REGIONS],
    items: [
      "Kashi and Gaya-related rituals",
      "Temple Puja and Archana",
      "Kumbh and Tirtha-related rituals",
      "Rudrabhishek at sacred temples",
      "Regional marriage and family Sanskar",
      "Bengali Durga Puja",
      "Marathi Griha Pravesh and religious ceremonies",
      "Gujarati family and festival pujas",
      "South Indian Vedic homams and Sanskar",
      "Regional Panchang-based Muhurat and Sankalp Puja",
    ],
  },
];

/**
 * Alternate spellings and regional search terms.
 *
 * Aliases are search aids, not separate rituals.
 * Add an alias only when it is an appropriate name for that item.
 */
export const PUJA_SEARCH_ALIASES: Record<string, string[]> = {
  "Garbhadhana Sanskar": ["Garbhadhan Sanskar", "Garbhadhana"],
  "Simantonnayana / Godh Bharai Puja": [
    "Simantonnayana",
    "Godh Bharai",
    "Seemantham",
  ],
  "Namkaran / Naming Ceremony": [
    "Namkaran",
    "Naamkaran",
    "Naming Ceremony",
    "Namakarana",
  ],
  "Annaprashan / First Rice Ceremony": [
    "Annaprashan",
    "Annaprasana",
    "Annaprashanam",
    "First Rice Ceremony",
  ],
  "Mundan / Chudakarana Sanskar": [
    "Mundan",
    "Chudakarana",
    "Choula",
    "Mundan Ceremony",
  ],
  "Vidyarambh / First Writing Ceremony": [
    "Vidyarambh",
    "Vidyarambham",
    "Vidyarambha",
    "First Writing Ceremony",
  ],
  Aksharabhyasam: ["Aksharabhyas", "Aksharabhyasam", "Akshara Abhyasam"],
  "Upanayan Sanskar / Janeu Ceremony": [
    "Upanayan",
    "Upanayanam",
    "Upanayana",
    "Janeu Sanskar",
  ],
  "Vivah Sanskar / Hindu Wedding": [
    "Vivah",
    "Vivaah",
    "Vivaha",
    "Hindu Wedding",
  ],
  "Engagement / Sagai Puja": ["Sagai Puja", "Engagement Puja"],
  "Griha Pravesh Puja": [
    "Griha Pravesham",
    "Gruhapravesam",
    "Housewarming Puja",
    "New Home Puja",
  ],
  "Bhoomi Puja / Land Worship": [
    "Bhumi Puja",
    "Bhoomi Pooja",
    "Bhumi Pujan",
    "Bhoomi Pujan",
    "Land Worship",
  ],
  "Ganesh Puja": ["Ganesh Pooja", "Ganpati Puja", "Ganapati Puja"],
  "Lakshmi Puja": ["Lakshmi Pooja", "Mahalakshmi Puja"],
  "Satyanarayan Katha and Puja": [
    "Satyanarayan Puja",
    "Satyanarayana Puja",
    "Satyanarayan Katha",
    "Satyanarayana Vratam",
  ],
  Rudrabhishek: ["Rudra Abhishek", "Rudrabhishekam"],
  "Navgraha Shanti Puja": [
    "Navagraha Shanti",
    "Navgraha Puja",
    "Navagraha Puja",
  ],
  "Kaal Sarp Dosh Puja": ["Kalsarp Puja", "Kaal Sarp Puja"],
  "Rahu-Ketu Shanti": ["Rahu Ketu Shanti", "Rahu-Ketu Puja"],
  "Vehicle Puja": [
    "Vahan Puja",
    "Vahana Puja",
    "Car Puja",
    "Bike Puja",
  ],
  "Pind Daan": ["Pind Dan", "Pinda Daan", "Pindadan"],
  Tarpan: ["Pitru Tarpan", "Tarpanam"],
};

/**
 * Canonical catalogue names.
 * Duplicates across categories are removed while preserving order.
 */
export const ALL_PUJA_TYPES: string[] = [
  ...new Set(PUJA_CATEGORIES.flatMap((category) => category.items)),
];

/**
 * Normalize punctuation, case and common spelling variants.
 * Ritual names are not automatically converted into other ritual names.
 */
export const normalizePujaName = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bpooja\b/g, "puja")
    .replace(/\s*\/\s*/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

/**
 * Find a category by its existing URL-friendly slug.
 */
export const getPujaCategoryBySlug = (
  slug: string,
): PujaCategory | undefined =>
  PUJA_CATEGORIES.find((category) => category.slug === slug);

/**
 * Get all categories containing a canonical puja name.
 * Matching is case-insensitive and whitespace/punctuation tolerant.
 */
export const getCategoriesForPuja = (
  pujaName: string,
): PujaCategory[] => {
  const normalizedName = normalizePujaName(pujaName);

  if (!normalizedName) return [];

  return PUJA_CATEGORIES.filter((category) =>
    category.items.some(
      (item) => normalizePujaName(item) === normalizedName,
    ),
  );
};

/**
 * Return the canonical catalogue item for a name or known alias.
 */
export const getCanonicalPujaName = (
  pujaName: string,
): string | undefined => {
  const normalizedQuery = normalizePujaName(pujaName);

  if (!normalizedQuery) return undefined;

  for (const canonicalName of ALL_PUJA_TYPES) {
    if (normalizePujaName(canonicalName) === normalizedQuery) {
      return canonicalName;
    }

    const aliases = PUJA_SEARCH_ALIASES[canonicalName] ?? [];

    if (
      aliases.some(
        (alias) => normalizePujaName(alias) === normalizedQuery,
      )
    ) {
      return canonicalName;
    }
  }

  return undefined;
};

/**
 * Check whether a puja exists by canonical name or known alias.
 */
export const isPujaInCatalogue = (pujaName: string): boolean =>
  getCanonicalPujaName(pujaName) !== undefined;

/**
 * Search pujas by canonical name or known alias.
 * Results return canonical names, not duplicate alias records.
 */
export const searchPujaTypes = (query: string): string[] => {
  const normalizedQuery = normalizePujaName(query);

  if (!normalizedQuery) return [];

  return ALL_PUJA_TYPES.filter((canonicalName) => {
    const searchableNames = [
      canonicalName,
      ...(PUJA_SEARCH_ALIASES[canonicalName] ?? []),
    ];

    return searchableNames.some((term) =>
      normalizePujaName(term).includes(normalizedQuery),
    );
  });
};

/**
 * Search categories by category name, description, SEO metadata,
 * keywords or canonical puja names.
 */
export const searchPujaCategories = (
  query: string,
): PujaCategory[] => {
  const normalizedQuery = normalizePujaName(query);

  if (!normalizedQuery) return [];

  return PUJA_CATEGORIES.filter((category) => {
    const searchableTerms = [
      category.name,
      category.description,
      category.seoTitle,
      category.seoDescription,
      ...category.searchTerms,
      ...category.items,
      ...category.items.flatMap(
        (item) => PUJA_SEARCH_ALIASES[item] ?? [],
      ),
    ];

    return searchableTerms.some((term) =>
      normalizePujaName(term).includes(normalizedQuery),
    );
  });
};

/**
 * Search results include the canonical puja and its category.
 */
export const searchPujaCatalogue = (
  query: string,
): PujaSearchResult[] => {
  const matchedNames = new Set(searchPujaTypes(query));

  if (matchedNames.size === 0) return [];

  const results: PujaSearchResult[] = [];

  for (const category of PUJA_CATEGORIES) {
    for (const pujaName of category.items) {
      if (matchedNames.has(pujaName)) {
        results.push({
          pujaName,
          category,
          matchedTerm: query.trim(),
        });
      }
    }
  }

  return results;
};
