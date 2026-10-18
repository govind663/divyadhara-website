/**
 * DivyaDhara Hindu festival and spiritual-event directory.
 *
 * Curated events preserve organiser/source links. The live calendar adapter
 * reads a public, state-aware Hindu-festival dataset whose maintainers describe
 * monthly refreshes and upcoming-year seeding. The feed is third-party data,
 * not an official government source; check local Panchang/organiser notices.
 */

export type DhamEvent = {
  slug: string;
  title: string;
  category: string;
  date: string; // ISO date, YYYY-MM-DD
  endDate?: string;
  time: string;
  venue: string;
  city: string;
  image: string;
  organizer: string;
  description: string;
  schedule: { t: string; item: string }[];
  fee: string;
  officialUrl?: string;
  sourceUrl?: string;
  dateNote?: string;
  /** true for a calendar observance, which is not necessarily an organised ticketed event */
  isCalendarObservance?: boolean;
  /** Regional calendar label when supplied by the live feed */
  region?: string;
};

export const HINDU_CALENDAR_SOURCE_URL =
  "https://github.com/ganeshsp1/hindu-festivals-api";
const LIVE_CALENDAR_URL =
  "https://cdn.jsdelivr.net/gh/ganeshsp1/hindu-festivals-api@main/data/latest.json";

export const EVENTS: DhamEvent[] = [
  {
    slug: "dev-deepawali-varanasi-2026",
    title: "Dev Deepawali — Varanasi Ganga Deepotsav",
    category: "Festival",
    date: "2026-11-24",
    time: "Evening observance; check local timings",
    venue: "Ganga ghats, Varanasi",
    city: "Varanasi",
    image: "/images/aarti-night.jpeg",
    organizer: "Local temple committees and Varanasi district authorities",
    description:
      "Dev Deepawali is observed on Kartik Purnima in Varanasi. The Ganga ghats and temples are traditionally illuminated with earthen lamps, and the evening draws devotees and visitors for riverfront observances. The exact public programme, crowd-control arrangements, boat access and ghat restrictions should be checked with local authorities before travelling.",
    schedule: [
      {
        t: "Evening",
        item:
          "Kartik Purnima deepdaan and illuminated ghats. Confirm the current programme and access arrangements through official local notices.",
      },
    ],
    fee:
      "General ghat access, boat services and any ticketed viewing arrangements may have different rules; verify current details locally.",
    officialUrl:
      "https://www.incredibleindia.gov.in/en/festivals-and-events/uttar-pradesh/illuminating-the-eternal-spirit-of-kashi",
    sourceUrl:
      "https://www.drikpanchang.com/diwali/dev-diwali/dev-deepawali-date-time.html?geoname-id=1253405&year=2026",
    dateNote:
      "The Government of India's Incredible India page lists 24 November 2026. Local programme timings and access rules may change.",
  },
  {
    slug: "maha-shivaratri-2027",
    title: "Maha Shivaratri — Kashi",
    category: "Festival",
    date: "2027-03-06",
    time: "Night-time observance; confirm temple timings",
    venue: "Shri Kashi Vishwanath Temple area, Varanasi",
    city: "Varanasi",
    image: "/images/aarti-night.jpeg",
    organizer: "Shri Kashi Vishwanath Temple administration; programme to be confirmed",
    description:
      "Maha Shivaratri is a Hindu observance dedicated to Lord Shiva. Devotees commonly mark the occasion with prayer, worship, mantra recitation and night-time observances. The date shown is the 2027 Panchang date; the temple's darshan arrangements, entry procedures, abhishek availability and local timings must be checked with the temple administration.",
    schedule: [
      {
        t: "Temple programme",
        item:
          "Maha Shivaratri observances. No specific aarti or abhishek timetable is asserted here; follow the temple's official notices.",
      },
    ],
    fee:
      "Check the temple administration for current darshan rules, special entry and any chargeable services.",
    officialUrl: "https://shrikashivishwanath.org/",
    sourceUrl:
      "https://www.drikpanchang.com/festivals/maha-shivaratri/maha-shivaratri-date-time.html?geoname-id=1275339&year=2027",
    dateNote:
      "Date follows the 2027 Panchang listing; confirm local temple announcements before planning travel.",
  },
  {
    slug: "international-yoga-festival-rishikesh-2027",
    title: "International Yoga Festival 2027",
    category: "Yoga & Meditation",
    date: "2027-03-09",
    endDate: "2027-03-15",
    time: "Festival runs 9–15 March; session times follow the official programme",
    venue: "Parmarth Niketan, Swargashram, Rishikesh",
    city: "Rishikesh",
    image: "/images/yoga-course.jpeg",
    organizer: "Parmarth Niketan / International Yoga Festival",
    description:
      "The International Yoga Festival is scheduled at Parmarth Niketan on the banks of the Ganga in Rishikesh. The organiser describes a programme featuring yoga teachers from different traditions, spiritual talks, kirtan and Ganga Aarti. Check the official festival website for registration, session schedules, accommodation information and current terms.",
    schedule: [
      {
        t: "9–15 March",
        item:
          "Festival week. Consult the official programme for individual classes, talks, kirtan and ceremony timings.",
      },
    ],
    fee:
      "Registration is handled by the organiser; check the official registration page for current prices and inclusions.",
    officialUrl:
      "https://internationalyogafestival.org/event/international-yoga-festival-2027/",
    sourceUrl:
      "https://courses.parmarth.org/events/international-yoga-festival-2027/",
    dateNote:
      "The organiser lists 9–15 March 2027. Individual sessions and registration conditions should be verified on the official site.",
  },
  {
    slug: "braj-holi-festival-bharatpur-2027",
    title: "Braj Holi Festival — Bharatpur",
    category: "Cultural Festival",
    date: "2027-03-17",
    endDate: "2027-03-18",
    time: "Festival dates 17–18 March; daily programme to be confirmed",
    venue: "Bharatpur, Rajasthan",
    city: "Bharatpur",
    image: "/images/festival-crowd.jpeg",
    organizer: "Rajasthan Tourism, Bharatpur",
    description:
      "Rajasthan Tourism lists the Braj Holi Festival in Bharatpur for 17–18 March 2027. The celebration draws on the cultural and devotional traditions of the Braj region associated with Radha and Krishna, with festival activities and folk-cultural performances. Confirm the programme, venues, timings and any visitor arrangements through the tourism organiser before travel.",
    schedule: [
      {
        t: "17–18 March",
        item:
          "Braj Holi festival period. Check Rajasthan Tourism for the published day-wise activities and venue arrangements.",
      },
    ],
    fee:
      "Confirm entry requirements and any ticketed activities with Rajasthan Tourism.",
    officialUrl:
      "https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/braj-holi-festival",
    sourceUrl:
      "https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/braj-holi-festival",
    dateNote:
      "Dates are listed by the Government of India's Incredible India portal, citing Rajasthan Tourism.",
  },
  {
    slug: "dhulandi-festival-jaipur-2027",
    title: "Dhulandi Festival — Jaipur",
    category: "Cultural Festival",
    date: "2027-03-22",
    time: "Festival date 22 March; event timings to be confirmed",
    venue: "Khasa Kothi, Jaipur, Rajasthan",
    city: "Jaipur",
    image: "/images/festival-crowd.jpeg",
    organizer: "Rajasthan Tourism, Jaipur",
    description:
      "The Government of India's Incredible India portal lists a Dhulandi Festival at Khasa Kothi in Jaipur on 22 March 2027. The listed celebration describes Holi-related colour play and Rajasthani folk music and dance. Confirm the current event notice, participation rules, timings, ticket requirements and any colour-safety guidance with Rajasthan Tourism before attending.",
    schedule: [
      {
        t: "22 March",
        item:
          "Dhulandi festival at Khasa Kothi. The precise start time and access arrangements should be confirmed with Rajasthan Tourism.",
      },
    ],
    fee:
      "Check the current Rajasthan Tourism notice for ticket, registration and entry details.",
    officialUrl:
      "https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/dhulandi-festival",
    sourceUrl:
      "https://www.incredibleindia.gov.in/en/festivals-and-events/rajasthan/dhulandi-festival",
    dateNote:
      "Date and venue are listed by the Government of India's Incredible India portal, citing Rajasthan Tourism.",
  },
  {
    slug: "rama-navami-ayodhya-2027",
    title: "Rama Navami — Ayodhya",
    category: "Festival",
    date: "2027-04-15",
    time: "Daytime observance; individual temple timings to be confirmed",
    venue: "Ayodhya, Uttar Pradesh; check individual temple notices",
    city: "Ayodhya",
    image: "/images/temple-corridor.jpeg",
    organizer: "Local temple authorities; specific public programmes to be confirmed",
    description:
      "Rama Navami commemorates the birth of Lord Rama and is observed with prayer and devotional activities at temples. The listed date follows the 2027 Panchang calendar for northern India. This entry is a festival observance, not a claim that a particular ticketed event or programme has been announced in Ayodhya. Check the relevant temple and local administration notices for darshan rules, procession information and timings.",
    schedule: [
      {
        t: "Temple observances",
        item:
          "Rama Navami prayers and devotional activities may be held at local temples. Specific programmes and timings have not been confirmed in this listing.",
      },
    ],
    fee:
      "Temple access, special darshan and other arrangements depend on the individual temple; verify before travel.",
    officialUrl: "https://up-tourism.gov.in/",
    sourceUrl:
      "https://www.drikpanchang.com/dashavatara/rama-navami/rama-navami-date-time.html?geoname-id=1261481&year=2027",
    dateNote:
      "Date follows the 2027 Panchang listing for New Delhi; verify the date and local arrangements with the temple you plan to visit.",
  },
  {
    slug: "buddha-purnima-bodh-gaya-2027",
    title: "Buddha Purnima — Bodh Gaya",
    category: "Buddhist Festival",
    date: "2027-05-20",
    time: "Day-long observance; temple programme to be confirmed",
    venue: "Mahabodhi Temple area, Bodh Gaya, Bihar",
    city: "Bodh Gaya",
    image: "/images/temple-corridor.jpeg",
    organizer: "Local Buddhist institutions and temple authorities; programme to be confirmed",
    description:
      "Buddha Purnima, also known as Buddha Jayanti, commemorates Gautama Buddha and is observed by Buddhist communities. Bodh Gaya is an important Buddhist pilgrimage destination. This listing records the 2027 calendar date but does not claim a confirmed organiser-run programme. Check local monastery and site notices for ceremonies, visiting hours, crowd guidance and access requirements.",
    schedule: [
      {
        t: "Temple observances",
        item:
          "Buddha Purnima observances in Bodh Gaya. Check local Buddhist institutions and site authorities for the confirmed programme.",
      },
    ],
    fee:
      "Check the relevant site or organiser for visiting rules, special events and any applicable charges.",
    officialUrl: "https://tourism.bihar.gov.in/",
    sourceUrl:
      "https://www.drikpanchang.com/festivals/buddha-purnima/buddha-purnima-date-time.html?geoname-id=1275339&year=2027",
    dateNote:
      "Date follows the 2027 Panchang listing; site-specific programme details have not been confirmed here.",
  },
  {
    slug: "jagannath-ratha-yatra-puri-2027",
    title: "Jagannath Ratha Yatra — Puri",
    category: "Festival",
    date: "2027-07-05",
    time: "Festival day; procession timings to be confirmed",
    venue: "Jagannath Temple to Gundicha Temple, Grand Road, Puri",
    city: "Puri",
    image: "/images/festival-crowd.jpeg",
    organizer: "Shree Jagannath Temple Administration (SJTA); confirm official notices",
    description:
      "Puri's Ratha Yatra is the annual chariot festival associated with Lord Jagannath, Lord Balabhadra and Devi Subhadra. The deities are traditionally taken in procession from the Jagannath Temple towards Gundicha Temple along the Grand Road. The date shown is based on a 2027 Panchang listing; the temple administration's final schedule, crowd-management instructions and access rules should be checked before travelling.",
    schedule: [
      {
        t: "Festival day",
        item:
          "Pahandi and chariot procession are part of the traditional Ratha Yatra. Exact ceremony timings and route-control notices should be confirmed with the temple administration.",
      },
    ],
    fee:
      "Check the temple administration and local authorities for public access, crowd guidance and any separately managed services.",
    officialUrl: "https://odishatourism.gov.in/en/events",
    sourceUrl:
      "https://www.drikpanchang.com/festivals/ratha-yatra/jagannatha-rathayatra-date-time.html?geoname-id=1261481&year=2027",
    dateNote:
      "5 July 2027 is the Panchang-listed date. Verify the final date and programme through SJTA/local authorities before making travel plans.",
  },
];

type RawRecord = Record<string, unknown>;

export type EventDirectoryResult = {
  events: DhamEvent[];
  status: "live" | "fallback" | "empty";
  currentYear: number;
  refreshedAt: string;
  message?: string;
};

function asRecord(value: unknown): RawRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function extractIsoDate(value: unknown): string {
  if (typeof value === "string") {
    const match = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    return match?.[1] ?? "";
  }
  const record = asRecord(value);
  if (record) {
    return extractIsoDate(
      record.iso ?? record.date ?? record.value ?? record.start ?? record.startDate,
    );
  }
  return "";
}

function rawName(record: RawRecord): string {
  const value = record.name ?? record.title ?? record.festival ?? record.event ?? record.label;
  if (typeof value === "string") return value.trim();
  const nested = asRecord(value);
  if (nested) return firstString(nested.en, nested.english, nested.name, nested.hi, nested.hindi);
  return "";
}

function rawRegion(record: RawRecord): string {
  const value =
    record.state_proxy ??
    record.region ??
    record.state ??
    record.states ??
    record.location ??
    record.region_name;

  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(", ");
  if (typeof value === "string") return value;
  return "";
}

function collectRawRecords(value: unknown, output: RawRecord[] = []): RawRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRawRecords(item, output);
    return output;
  }

  const record = asRecord(value);
  if (!record) return output;

  const name = rawName(record);
  const date = extractIsoDate(record.date ?? record.datetime ?? record.startDate ?? record.isoDate);
  if (name && date) {
    output.push(record);
    return output;
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child) || asRecord(child)) collectRawRecords(child, output);
  }
  return output;
}

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isClearlyNonHindu(record: RawRecord, name: string): boolean {
  const religion = firstString(record.religion, record.faith, record.religious_group).toLowerCase();
  if (religion && !/(hindu|sanatan|vedic)/i.test(religion)) return true;

  // Some aggregate festival datasets also include national holidays and other faiths.
  // Exclude known non-Hindu entries unless the source explicitly tags them Hindu.
  if (/(hindu|sanatan|vedic)/i.test(religion)) return false;
  return /\b(eid|ramadan|ramzan|muharram|christmas|good friday|easter|guru nanak jayanti|buddha purnima|buddha jayanti|mahavir jayanti|maharashtra diwas|parsi new year|independence day|republic day|gandhi jayanti|ambedkar jayanti|national youth day|chhatrapati shivaji maharaj jayanti)\b/i.test(name);
}

function categoryFor(name: string, record: RawRecord): string {
  if (Array.isArray(record.type)) {
    const types = record.type.filter((item): item is string => typeof item === "string");
    if (types.length) return types.join(" / ");
  }

  const supplied = firstString(record.category, record.type, record.kind);
  if (supplied) return supplied;

  if (/(ekadashi|amavasya|purnima|pradosh|chaturthi|vrat|ashtami)/i.test(name)) {
    return "Vrat & Tithi";
  }
  if (/(sankranti|pongal|bihu|ugadi|gudi padwa|new year)/i.test(name)) {
    return "Regional Hindu Festival";
  }
  return "Hindu Festival";
}

function makeLiveEvents(record: RawRecord, fallbackRegion = ""): DhamEvent[] {
  const recordName = rawName(record);
  const date = extractIsoDate(record.date ?? record.datetime ?? record.startDate ?? record.isoDate);
  if (!recordName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const dateObject = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(dateObject.getTime())) return [];

  // Some calendar feeds group several same-day observances in a comma-separated name.
  // Split those into separate searchable records while retaining slash-based aliases.
  const titles = [...new Set(recordName.split(/\s*,\s*/).map((item) => item.trim()).filter(Boolean))];
  const regionRaw = rawRegion(record) || fallbackRegion;
  const region = /^(all india|india|national|pan[- ]india)$/i.test(regionRaw)
    ? "India"
    : toTitleCase(regionRaw);
  const endDate = extractIsoDate(record.endDate ?? record.end_date);
  const originalDescription = firstString(record.description, record.details, record.summary);
  const locationDescription = region
    ? `Regional observance reported for ${region}.`
    : "Pan-India calendar observance; check your local city and regional Panchang.";
  const dateNote =
    `Date provided by the live Hindu-festival calendar feed${region ? ` for ${region}` : ""}. ` +
    "Observance can differ by city, sunrise rule and regional tradition; confirm locally before travelling.";

  const rawOfficial = firstString(record.officialUrl, record.official_url, record.organizer_url, record.canonical_url, record.url);
  const officialUrl = /^https?:\/\//i.test(rawOfficial) ? rawOfficial : undefined;

  return titles
    .filter((title) => !isClearlyNonHindu(record, title))
    .map((title) => ({
      slug: `calendar-${slugify(title)}-${date}-${slugify(region || "india")}`,
      title,
      category: categoryFor(title, record),
      date,
      ...(endDate && endDate >= date ? { endDate } : {}),
      time: "Local Panchang observance; confirm the city-specific timing",
      venue: region && region !== "India"
        ? `Regional Hindu calendar observance — ${region}`
        : "Pan-India Hindu calendar observance; confirm the local venue",
      city: region || "Pan-India",
      region: region || "Pan-India",
      image: /holi|rang/i.test(title)
        ? "/images/festival-crowd.jpeg"
        : /yoga|meditation/i.test(title)
          ? "/images/yoga-course.jpeg"
          : /aarti|deep|diwali|shiv/i.test(title)
            ? "/images/aarti-night.jpeg"
            : "/images/temple-corridor.jpeg",
      organizer: firstString(record.organizer, record.organisation, record.organization) ||
        "Not specified by the calendar feed — check the local temple or organiser",
      description: originalDescription ||
        `${title} is listed as a Hindu-calendar observance. ${locationDescription} This calendar entry does not itself confirm a ticketed event, a public programme, or an event organiser. Check the relevant temple, local Panchang or organiser for accurate timings and access information.`,
      schedule: [
        {
          t: "Calendar observance",
          item:
            "The calendar date is listed for reference. This feed does not confirm local ceremonies, procession routes, entry rules or a ticketed programme; verify details with the relevant local organiser.",
        },
      ],
      fee: "Not specified by the calendar feed. Check the local venue or organiser for any registration or charges.",
      ...(officialUrl ? { officialUrl } : {}),
      sourceUrl: HINDU_CALENDAR_SOURCE_URL,
      dateNote,
      isCalendarObservance: true,
    }));
}

function eventDateKey(event: DhamEvent): string {
  return event.date.slice(0, 10);
}

function coreTitle(title: string): string {
  return slugify(title.split(/[—–|:]/, 1)[0]);
}

function mergeEvents(preferred: DhamEvent[], live: DhamEvent[]): DhamEvent[] {
  const result: DhamEvent[] = [];
  const indexByKey = new Map<string, number>();

  for (const event of [...preferred, ...live]) {
    const key = `${eventDateKey(event)}::${coreTitle(event.title)}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, result.length);
      result.push({ ...event });
      continue;
    }

    const existing = result[existingIndex];
    // Keep organiser-sourced detail ahead of generic calendar metadata.
    if (existing.isCalendarObservance && event.isCalendarObservance) {
      const regions = [...new Set(
        `${existing.region || existing.city}, ${event.region || event.city}`
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      )];
      existing.region = regions.join(", ");
      existing.city = regions.length > 3 ? "Multiple regions" : regions.join(", ");
      existing.venue = regions.length > 1
        ? `Hindu-calendar observance across ${existing.city}`
        : existing.venue;
      existing.slug = `calendar-${slugify(existing.title)}-${existing.date}-${slugify(existing.city)}`;
      existing.dateNote =
        `Calendar date reported for: ${regions.join(", ")}. Regional observances may differ by city and tradition; verify with a local Panchang.`;
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function getCuratedEventsForCurrentAndFutureYears(
  year = new Date().getFullYear(),
): DhamEvent[] {
  return EVENTS.filter((event) => Number(event.date.slice(0, 4)) >= year);
}

const ASTROTATHYA_CITY_PROXIES = [
  { slug: "new-delhi", label: "New Delhi · North India" },
  { slug: "mumbai", label: "Mumbai · West India" },
  { slug: "bengaluru", label: "Bengaluru · South India" },
  { slug: "chennai", label: "Chennai · South India" },
  { slug: "kolkata", label: "Kolkata · East India" },
  { slug: "hyderabad", label: "Hyderabad · Deccan" },
] as const;

const panchangCache = new Map<number, { fetchedAt: number; events: DhamEvent[] }>();

/**
 * Optional city-resolved supplement for the next year, currently documented by
 * AstroTathya for 2025–2027. Errors are isolated per city so one unavailable
 * city does not block the remaining national/regional calendar feed.
 */
async function fetchCityPanchangEvents(year: number): Promise<DhamEvent[]> {
  if (year < 2025 || year > 2027) return [];

  const now = Date.now();
  const cached = panchangCache.get(year);
  if (cached && now - cached.fetchedAt < (cached.events.length ? 6 : 1) * 60 * 60 * 1000) {
    return cached.events;
  }

  const responses = await Promise.allSettled(
    ASTROTATHYA_CITY_PROXIES.map(async (city) => {
      const url = new URL("https://astrotathya.com/api/festivals");
      url.searchParams.set("year", String(year));
      url.searchParams.set("city", city.slug);

      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return [] as DhamEvent[];

      const payload: unknown = await response.json();
      return collectRawRecords(payload)
        .flatMap((record) => makeLiveEvents(record, city.label))
        .filter((event) => Number(event.date.slice(0, 4)) === year)
        .map((event) => ({
          ...event,
          sourceUrl: "https://astrotathya.com/developers",
          dateNote:
            `City-resolved Panchang date from AstroTathya for ${city.label}. ` +
            "Dates may differ across regions and observance traditions; confirm with the local temple.",
        }));
    }),
  );

  const events = responses.flatMap((response) =>
    response.status === "fulfilled" ? response.value : [],
  );

  panchangCache.set(year, { fetchedAt: now, events });
  return events;
}

/**
 * Loads the latest public Hindu-festival dataset and merges it with curated
 * organiser-linked listings. It also checks the next year's city-based Panchang
 * feed when supported. The year is resolved at runtime, so the UI rolls over
 * without manually editing dates.
 */
export async function loadEventDirectory(): Promise<EventDirectoryResult> {
  const currentYear = new Date().getFullYear();
  const refreshedAt = new Date().toISOString();
  const curated = getCuratedEventsForCurrentAndFutureYears(currentYear);

  try {
    const response = await fetch(LIVE_CALENDAR_URL, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Calendar feed returned HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    const allPrimaryEvents = collectRawRecords(payload)
      .flatMap((record) => makeLiveEvents(record))
      .filter((event) => Number(event.date.slice(0, 4)) >= currentYear)
      .filter((event) => Number(event.date.slice(0, 4)) <= currentYear + 1);

    const hasCurrentYearEntries = allPrimaryEvents.some(
      (event) => Number(event.date.slice(0, 4)) === currentYear,
    );

    // If the statewide feed has not rolled over yet, try the city-resolved
    // Panchang feed for this year (supported through 2027).
    const currentYearSupplement = hasCurrentYearEntries || currentYear > 2027
      ? []
      : await fetchCityPanchangEvents(currentYear);

    const nextYearSupplement = currentYear + 1 <= 2027
      ? await fetchCityPanchangEvents(currentYear + 1)
      : [];

    const liveEvents = [...allPrimaryEvents, ...currentYearSupplement, ...nextYearSupplement];
    const hasCurrentYearData = liveEvents.some(
      (event) => Number(event.date.slice(0, 4)) === currentYear,
    );

    if (!hasCurrentYearData) {
      throw new Error(`No current-year (${currentYear}) Hindu-calendar entries are available from the connected sources yet`);
    }

    return {
      events: mergeEvents(curated, liveEvents),
      status: "live",
      currentYear,
      refreshedAt,
    };
  } catch (error) {
    return {
      events: curated,
      status: curated.length ? "fallback" : "empty",
      currentYear,
      refreshedAt,
      message: error instanceof Error ? error.message : "Live calendar feed could not be loaded.",
    };
  }
}
