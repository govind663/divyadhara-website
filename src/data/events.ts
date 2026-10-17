/**
 * DivyaDhara event directory.
 *
 * Data policy:
 * - Include real, publicly documented festivals and organiser-listed events.
 * - Do not invent event schedules, prices, DivyaDhara partnerships or registrations.
 * - Source URLs are retained so dates and organiser details can be checked.
 * - Annual observance dates based on a Panchang should be rechecked before travel.
 */

export type DhamEvent = {
  slug: string;
  title: string;
  category: string;
  date: string; // ISO date, YYYY-MM-DD
  endDate?: string; // ISO date for multi-day events
  time: string;
  venue: string;
  city: string;
  image: string;
  organizer: string;
  description: string;
  schedule: { t: string; item: string }[];
  fee: string;

  /** Public page about the event or its official organiser. */
  officialUrl?: string;
  /** Page used to check the published date or calendar observance. */
  sourceUrl?: string;
  /** Explain whether the date/programme still needs organiser confirmation. */
  dateNote?: string;
};

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
