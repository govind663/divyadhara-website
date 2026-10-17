
export type CourseLesson = {
  slug: string;
  title: string;
  durationMinutes: number;
  summary: string;
  learningPoints: string[];
  practice: string;
  videoUrl?: string;
  videoType?: "youtube" | "vimeo" | "direct";
};

export type Course = {
  slug: string;
  title: string;
  category: string;
  image: string;
  instructor: string;
  duration: string;
  level: string;

  /** Display "Free Learning", never a paid amount. */
  fee: string;
  isFree: boolean;

  mode: string;
  overview: string;
  curriculum: string[];
  lessons: CourseLesson[];
  schedule: string;
  eligibility: string;

  metaTitle: string;
  metaDescription: string;
  keywords: string[];
};

export type CourseSharePlatform =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "threads";

export const COURSE_SHARE_PLATFORMS: {
  id: CourseSharePlatform;
  label: string;
  icon: string;
}[] = [
  { id: "whatsapp", label: "WhatsApp", icon: "message-circle" },
  { id: "instagram", label: "Instagram", icon: "instagram" },
  { id: "facebook", label: "Facebook", icon: "facebook" },
  { id: "linkedin", label: "LinkedIn", icon: "linkedin" },
  { id: "threads", label: "Threads", icon: "at-sign" },
];

/**
 * Returns a share URL for platforms with supported web sharing intents.
 * Instagram returns null because it has no standard public web URL
 * for sharing arbitrary website links into a post.
 *
 * Pass the full canonical URL of the current course page as pageUrl.
 */
export function getCourseShareUrl(
  platform: CourseSharePlatform,
  course: Course,
  pageUrl: string,
): string | null {
  const url = pageUrl.trim();

  if (!url) return null;

  const shareText = `${course.title} — Free Learning at DivyaDhara`;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${shareText}\n${url}`);

  switch (platform) {
    case "whatsapp":
      return `https://wa.me/?text=${encodedText}`;

    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

    case "threads":
      return `https://www.threads.net/intent/post?text=${encodedText}`;

    case "instagram":
      return null;

    default:
      return null;
  }
}

export function getCourseShareText(
  course: Course,
  pageUrl: string,
): string {
  return [
    `${course.title} — Free Learning at DivyaDhara`,
    course.overview,
    `Explore the course: ${pageUrl}`,
  ].join("\n\n");
}

export const COURSES: Course[] = [
  {
    slug: "sanskrit-foundation",
    title: "Sanskrit Foundation — Sambhashanam & Shlokas",
    category: "Sanskrit",
    image: "/images/temple-corridor.jpeg",
    instructor: "Dr. Lakshmi Narayanan · Vyakarana Acharya",
    duration: "12 weeks · 3 hrs/week",
    level: "Beginner",
    fee: "Free Learning",
    isFree: true,
    mode: "Self-paced learning · Video links added when available",
    overview:
      "Begin your Sanskrit journey with pronunciation, Devanagari reading, everyday conversation, meaningful shlokas and foundational grammar. Learn at your own pace with simple explanations, regular practice and revision activities. Designed for beginners; no prior Sanskrit knowledge is required.",
    curriculum: [
      "Varnamala, pronunciation and writing",
      "Basic nouns, verbs and everyday vocabulary",
      "Simple Sanskrit conversation",
      "Shlokas, Subhashita and stotra learning",
      "Introduction to Sandhi and Samasa",
      "Bhagavad Gita Chapter 2: guided reading",
    ],
    lessons: [
      {
        slug: "sanskrit-introduction",
        title: "Introduction to Sanskrit and Its Learning Method",
        durationMinutes: 15,
        summary:
          "Understand the purpose of learning Sanskrit and how to build a consistent reading, listening and speaking routine.",
        learningPoints: [
          "Recognize Sanskrit as a language of literature, philosophy and tradition.",
          "Understand the relationship between sounds, letters and pronunciation.",
          "Create a simple 15-minute daily study routine.",
        ],
        practice:
          "Write your learning goal and spend five minutes listening carefully to Sanskrit pronunciation.",
      },
      {
        slug: "devenagari-varnamala",
        title: "Devanagari Varnamala and Pronunciation",
        durationMinutes: 25,
        summary:
          "Learn the structure of Sanskrit vowels and consonants, with attention to clear pronunciation and reading practice.",
        learningPoints: [
          "Identify vowels and common consonant groups.",
          "Distinguish similar-sounding letters.",
          "Practice reading simple syllables aloud.",
        ],
        practice:
          "Write five vowels and ten consonants, then read each aloud slowly and clearly.",
      },
      {
        slug: "sanskrit-basic-words",
        title: "Everyday Words and Simple Sentences",
        durationMinutes: 25,
        summary:
          "Start forming short expressions with greetings, familiar words and beginner-friendly sentence patterns.",
        learningPoints: [
          "Recognize common words used in daily conversation.",
          "Practice greetings and simple introductions.",
          "Build confidence in reading short expressions.",
        ],
        practice:
          "Create five simple expressions and practice speaking them aloud. Check meanings before memorizing.",
      },
      {
        slug: "sanskrit-shloka-practice",
        title: "Shloka Reading and Meaning",
        durationMinutes: 25,
        summary:
          "Practice shloka recitation with attention to syllables, pauses, pronunciation and understanding the meaning.",
        learningPoints: [
          "Break a short shloka into manageable phrases.",
          "Practice clear pronunciation and steady rhythm.",
          "Record a simple meaning summary in your own words.",
        ],
        practice:
          "Choose one short shloka from a reliable source, learn its meaning and recite it slowly.",
      },
    ],
    schedule: "Original live-batch schedule: Sat–Sun, 7–8:30 AM IST.",
    eligibility: "Beginner-friendly. Originally designed for ages 12+; adult learners are welcome.",
    metaTitle: "Free Sanskrit Learning Course for Beginners | DivyaDhara",
    metaDescription:
      "Learn Sanskrit basics, Devanagari, simple conversation and shloka recitation with DivyaDhara's free, structured learning resources.",
    keywords: [
      "free Sanskrit course",
      "learn Sanskrit for beginners",
      "Sanskrit shlokas with meaning",
      "Devanagari learning",
      "Sanskrit conversation",
      "DivyaDhara",
    ],
  },

  {
    slug: "yoga-teacher-200hr",
    title: "Classical Yoga Foundations and Practice",
    category: "Yoga",
    image: "/images/yoga-course.jpeg",
    instructor: "Yogacharya Suresh Nair · Original instructor listing",
    duration: "8-week or 16-week suggested learning path",
    level: "Beginner–Intermediate",
    fee: "Free Learning",
    isFree: true,
    mode: "Self-paced educational lessons",
    overview:
      "Explore classical yoga through foundational asanas, breath awareness, Patanjali's Yoga Sutras, safe movement principles and daily-life discipline. This free educational course introduces important concepts and guided self-study. It is not a certification, a substitute for supervised teacher training or personalized medical advice.",
    curriculum: [
      "Foundations of yoga and mindful movement",
      "Asana alignment and modifications",
      "Breathing awareness and pranayama fundamentals",
      "Introduction to the Yoga Sutras",
      "Basic anatomy and practice safety",
      "Personal practice and reflective learning",
    ],
    lessons: [
      {
        slug: "yoga-foundations",
        title: "What Is Yoga? Philosophy and Everyday Practice",
        durationMinutes: 20,
        summary:
          "Understand yoga as a broader discipline involving movement, breath, attention, ethics and self-awareness.",
        learningPoints: [
          "Understand the difference between yoga philosophy and physical postures.",
          "Explore the eight-limbed framework described by Patanjali.",
          "Identify realistic ways to establish a regular personal practice.",
        ],
        practice:
          "Write down one achievable daily practice goal and reflect on your experience for seven days.",
      },
      {
        slug: "yoga-asana-basics",
        title: "Foundational Asanas and Body Awareness",
        durationMinutes: 25,
        summary:
          "Learn the principles of comfortable alignment, balanced effort, modifications and awareness of bodily limits.",
        learningPoints: [
          "Understand the importance of a stable and comfortable posture.",
          "Notice alignment, balance and ease of movement.",
          "Learn when to modify or stop a posture.",
        ],
        practice:
          "Practice only familiar, gentle movements in a comfortable range. Stop if you feel pain, dizziness or unusual discomfort.",
      },
      {
        slug: "breath-awareness",
        title: "Breath Awareness and Gentle Breathing",
        durationMinutes: 20,
        summary:
          "Explore natural breathing and relaxed observation before studying formal pranayama techniques.",
        learningPoints: [
          "Observe the breath without forcing it.",
          "Notice posture and unnecessary tension.",
          "Understand why advanced breath retention requires qualified guidance.",
        ],
        practice:
          "Sit comfortably and observe natural breathing for three to five minutes without holding or straining your breath.",
      },
      {
        slug: "yoga-philosophy-practice",
        title: "Yoga Philosophy, Discipline and Reflection",
        durationMinutes: 25,
        summary:
          "Connect introductory yoga philosophy with practical habits, self-observation and thoughtful daily decisions.",
        learningPoints: [
          "Explore selected beginner-friendly ideas from the Yoga Sutras.",
          "Reflect on consistency, self-discipline and non-harming.",
          "Build a simple personal practice and reflection journal.",
        ],
        practice:
          "Keep a seven-day journal recording your practice, observations and one lesson learned each day.",
      },
    ],
    schedule: "Self-paced; follow a consistent practice routine suited to your needs.",
    eligibility:
      "Beginners and continuing learners. Use suitable modifications and seek qualified guidance where needed.",
    metaTitle: "Free Yoga Foundations Course Online | DivyaDhara",
    metaDescription:
      "Explore yoga foundations, gentle asana practice, breath awareness and classical yoga philosophy through DivyaDhara's free learning lessons.",
    keywords: [
      "free yoga course online",
      "yoga for beginners",
      "classical yoga foundations",
      "Patanjali Yoga Sutras",
      "asana basics",
      "breath awareness",
    ],
  },

  {
    slug: "meditation-dhyana",
    title: "Dhyana — 21-Day Meditation Sadhana",
    category: "Meditation",
    image: "/images/ashram-dawn.jpeg",
    instructor: "Ma Anand Maitreyi · Original instructor listing",
    duration: "21 days · Suggested 10–20 minutes/day",
    level: "All levels",
    fee: "Free Learning",
    isFree: true,
    mode: "Self-paced guided learning",
    overview:
      "Build a gentle meditation routine through posture awareness, natural breathing, attention training, mantra reflection and guided relaxation. Progress at a comfortable pace and learn to approach practice with patience rather than pressure. Meditation experiences vary from person to person.",
    curriculum: [
      "Preparing a comfortable meditation space",
      "Posture and natural breath awareness",
      "Attention and gentle concentration",
      "Introduction to mantra meditation",
      "Guided relaxation and self-observation",
      "Personal meditation routine and reflection",
    ],
    lessons: [
      {
        slug: "meditation-preparation",
        title: "Preparing for Meditation",
        durationMinutes: 15,
        summary:
          "Choose a suitable place, comfortable posture and realistic practice duration to establish a supportive routine.",
        learningPoints: [
          "Select a quiet place where you can sit comfortably.",
          "Explore chair-based and floor-based sitting options.",
          "Understand that thoughts and distractions are normal.",
        ],
        practice:
          "Sit comfortably for three minutes. Notice sounds, posture and breath without trying to control them.",
      },
      {
        slug: "breath-meditation",
        title: "Breath Awareness Meditation",
        durationMinutes: 15,
        summary:
          "Practice observing the natural breath while gently returning attention whenever it wanders.",
        learningPoints: [
          "Observe the breath without changing its natural rhythm.",
          "Notice when attention moves elsewhere.",
          "Return to the breath without self-criticism.",
        ],
        practice:
          "Practice for five minutes. When distracted, gently return your attention to your natural breathing.",
      },
      {
        slug: "mantra-awareness",
        title: "Introduction to Mantra Meditation",
        durationMinutes: 20,
        summary:
          "Explore mantra repetition as a traditional focus of attention and learn to practice respectfully and comfortably.",
        learningPoints: [
          "Understand the role of a chosen mantra in practice.",
          "Maintain a relaxed and steady rhythm.",
          "Learn the importance of understanding a mantra's meaning and tradition.",
        ],
        practice:
          "Choose a familiar, meaningful mantra from a trusted source and practice quietly for three to five minutes.",
      },
      {
        slug: "personal-sadhana-plan",
        title: "Building a Sustainable Daily Practice",
        durationMinutes: 20,
        summary:
          "Review your experience and create a personal routine that fits your daily schedule without unnecessary pressure.",
        learningPoints: [
          "Identify the place and time that suit your routine.",
          "Recognize changes in attention without judging progress.",
          "Create a gradual and sustainable practice plan.",
        ],
        practice:
          "Prepare a seven-day plan with a realistic practice time and a short daily reflection.",
      },
    ],
    schedule: "Self-paced · Choose a convenient daily practice time.",
    eligibility: "Open to adults and older teens. Practice gently and seek professional support if meditation causes distress.",
    metaTitle: "Free 21-Day Meditation Course for Beginners | DivyaDhara",
    metaDescription:
      "Learn breath awareness, mantra meditation and simple daily mindfulness practices with DivyaDhara's free meditation course.",
    keywords: [
      "free meditation course",
      "21 day meditation challenge",
      "meditation for beginners",
      "breath awareness meditation",
      "mantra meditation",
      "daily meditation practice",
    ],
  },

  {
    slug: "bhagavad-gita-course",
    title: "Bhagavad Gita — A Beginner's Guided Study",
    category: "Vedic Knowledge",
    image: "/images/aarti-night.jpeg",
    instructor: "Swami Tattvavidananda Saraswati · Original instructor listing",
    duration: "18-week suggested study path",
    level: "Beginner–Intermediate",
    fee: "Free Learning",
    isFree: true,
    mode: "Self-paced study and reflection",
    overview:
      "Explore the Bhagavad Gita through its setting, key teachings, selected verses and practical reflection. Learn about karma yoga, jnana, bhakti, dhyana and the text's different paths of understanding. This introductory resource encourages respectful study across ages and backgrounds without requiring prior Sanskrit knowledge.",
    curriculum: [
      "Context and central questions of the Bhagavad Gita",
      "Chapters 1–6: action, duty and meditation",
      "Chapters 7–12: knowledge and devotion",
      "Chapters 13–18: self-knowledge and liberation",
      "Selected verses and Sanskrit terms",
      "Reflection and everyday application",
    ],
    lessons: [
      {
        slug: "gita-introduction",
        title: "Introduction to the Bhagavad Gita",
        durationMinutes: 20,
        summary:
          "Understand the setting of the Gita and why Arjuna's questions provide a framework for studying its teachings.",
        learningPoints: [
          "Identify the main characters and setting.",
          "Understand Arjuna's dilemma in broad terms.",
          "Learn how to read a verse alongside a reliable translation.",
        ],
        practice:
          "Read a trusted translation of the opening chapter and write down two questions it raises for you.",
      },
      {
        slug: "karma-yoga",
        title: "Karma Yoga: Action and Responsibility",
        durationMinutes: 25,
        summary:
          "Explore the Gita's discussion of action, responsibility, intention and attachment to outcomes.",
        learningPoints: [
          "Understand the introductory idea of karma yoga.",
          "Reflect on effort, responsibility and expectations.",
          "Distinguish thoughtful action from indifference to consequences.",
        ],
        practice:
          "Choose one everyday responsibility and reflect on how to perform it with care and less fixation on praise.",
      },
      {
        slug: "bhakti-and-knowledge",
        title: "Bhakti, Knowledge and Different Paths",
        durationMinutes: 25,
        summary:
          "Explore devotional understanding and the role of knowledge in the Gita's broader spiritual discussion.",
        learningPoints: [
          "Define key terms using a trusted commentary.",
          "Recognize different approaches discussed in the text.",
          "Compare interpretations respectfully.",
        ],
        practice:
          "Read one selected verse on devotion or knowledge and summarize its meaning using a trusted translation.",
      },
      {
        slug: "gita-reflection",
        title: "Applying Gita Teachings to Daily Life",
        durationMinutes: 20,
        summary:
          "Develop a personal reflection method that relates the text to conduct, choices and responsibilities.",
        learningPoints: [
          "Separate the verse's context from your personal interpretation.",
          "Reflect on patience, duty and thoughtful decision-making.",
          "Record questions for further study.",
        ],
        practice:
          "Write a short reflection on one teaching and how it could inform a real-life decision.",
      },
    ],
    schedule: "Self-paced · Follow the 18-week study plan at your own pace.",
    eligibility: "Open to all interested learners. A reliable Bhagavad Gita translation is recommended.",
    metaTitle: "Free Bhagavad Gita Study Course Online | DivyaDhara",
    metaDescription:
      "Study Bhagavad Gita teachings, karma yoga, bhakti and selected verses with DivyaDhara's free beginner-friendly learning resources.",
    keywords: [
      "free Bhagavad Gita course",
      "Bhagavad Gita for beginners",
      "Gita teachings in daily life",
      "karma yoga",
      "Bhakti yoga",
      "Bhagavad Gita verses with meaning",
    ],
  },

  {
    slug: "bhajan-music",
    title: "Bhajan and Devotional Music Foundations",
    category: "Music/Bhajan",
    image: "/images/festival-crowd.jpeg",
    instructor: "Pt. Govind Kamble · Original instructor listing",
    duration: "10-week suggested learning path",
    level: "Beginner",
    fee: "Free Learning",
    isFree: true,
    mode: "Self-paced music education",
    overview:
      "Explore devotional singing through basic sur awareness, steady rhythm, vocal warm-ups and bhajan practice. Beginners can start without owning an instrument. Lessons emphasize patient practice, respectful interpretation and learning music at a comfortable pace.",
    curriculum: [
      "Listening skills and basic sur awareness",
      "Gentle vocal warm-ups",
      "Introduction to bhajan rhythm and taal",
      "Understanding the words and meaning of bhajans",
      "Basic harmonium concepts",
      "Practice planning and devotional singing",
    ],
    lessons: [
      {
        slug: "devotional-music-basics",
        title: "Introduction to Bhajan and Devotional Music",
        durationMinutes: 15,
        summary:
          "Explore the role of devotional songs in spiritual and cultural gatherings and learn active listening.",
        learningPoints: [
          "Recognize common structures in devotional songs.",
          "Listen for melody, rhythm and repeated phrases.",
          "Understand why lyrics and meaning matter.",
        ],
        practice:
          "Listen to a devotional song from a trusted source and note its rhythm, recurring phrases and central message.",
      },
      {
        slug: "voice-and-sur",
        title: "Gentle Vocal Warm-Ups and Sur Awareness",
        durationMinutes: 20,
        summary:
          "Build listening and singing awareness through comfortable vocal exercises without straining the voice.",
        learningPoints: [
          "Begin with gentle, comfortable vocal warm-ups.",
          "Listen carefully to pitch and sustained notes.",
          "Understand when to rest your voice.",
        ],
        practice:
          "Hum gently at a comfortable pitch for a short period. Stop if you feel pain or vocal strain.",
      },
      {
        slug: "taal-and-rhythm",
        title: "Understanding Rhythm and Taal",
        durationMinutes: 20,
        summary:
          "Learn to hear a steady beat and follow simple repeating rhythmic patterns in devotional music.",
        learningPoints: [
          "Recognize a regular beat in a song.",
          "Practice clapping along with a simple rhythm.",
          "Listen for the return of a repeating rhythmic cycle.",
        ],
        practice:
          "Clap along gently with a familiar song and count the beats in each repeating phrase.",
      },
      {
        slug: "bhajan-practice",
        title: "Learning a Bhajan with Meaning",
        durationMinutes: 25,
        summary:
          "Approach a devotional song step by step by understanding its lyrics, listening to a reliable rendition and practicing short phrases.",
        learningPoints: [
          "Read and understand the song's words.",
          "Practice one phrase at a time.",
          "Develop steady timing and clear pronunciation.",
        ],
        practice:
          "Select a bhajan whose lyrics are available from a reliable source, learn one short phrase and practice it comfortably.",
      },
    ],
    schedule: "Self-paced · Practice in short, regular sessions.",
    eligibility: "Beginners welcome. No instrument is required to get started.",
    metaTitle: "Free Bhajan Singing and Music Course | DivyaDhara",
    metaDescription:
      "Explore bhajan singing, sur awareness, rhythm, taal and devotional music basics in DivyaDhara's free beginner-friendly course.",
    keywords: [
      "free bhajan course",
      "bhajan singing for beginners",
      "devotional music learning",
      "sur and taal basics",
      "harmonium basics",
      "Indian devotional music",
    ],
  },

  {
    slug: "bal-sanskar-kids",
    title: "Bal Sanskar — Stories, Values and Indian Culture",
    category: "Children",
    image: "/images/puja-thali.jpeg",
    instructor: "DivyaDhara Bal Sanskar Team",
    duration: "8-week suggested learning path",
    level: "Children and family learning",
    fee: "Free Learning",
    isFree: true,
    mode: "Family-friendly self-paced activities",
    overview:
      "Introduce children to Indian stories, festivals, simple shlokas, cultural traditions and age-appropriate values through reading, discussion, creative activities and family participation. Lessons should be adapted to a child's age, interests and learning needs. Parents and guardians are encouraged to participate.",
    curriculum: [
      "Stories from the Ramayana and Mahabharata",
      "Simple shlokas and language activities",
      "Understanding Indian festivals and traditions",
      "Mindful movement and quiet reflection",
      "Creative activities and family discussions",
      "Kindness, responsibility and community service",
    ],
    lessons: [
      {
        slug: "indian-stories",
        title: "Discovering Stories from Indian Epics",
        durationMinutes: 15,
        summary:
          "Explore age-appropriate stories from Indian epics and discuss characters, choices and different retellings.",
        learningPoints: [
          "Listen to or read a short traditional story.",
          "Identify its main characters and events.",
          "Discuss kindness, courage and responsibility.",
        ],
        practice:
          "Draw a favorite scene or retell the story in your own words with help from a parent or guardian.",
      },
      {
        slug: "shloka-and-language",
        title: "First Shlokas and Listening Activities",
        durationMinutes: 15,
        summary:
          "Introduce a short, age-appropriate shloka with its meaning, careful pronunciation and a gentle practice routine.",
        learningPoints: [
          "Listen to clear pronunciation from a trusted source.",
          "Understand the simple meaning of the selected words.",
          "Practice in short sessions without pressure.",
        ],
        practice:
          "Learn one short line with adult guidance and explain its meaning in your own words.",
      },
      {
        slug: "festivals-and-traditions",
        title: "Indian Festivals and Family Traditions",
        durationMinutes: 20,
        summary:
          "Discover the meanings, customs and regional diversity of Indian festivals through discussion and simple creative work.",
        learningPoints: [
          "Learn about a festival and its traditional stories.",
          "Recognize that customs can vary across regions and families.",
          "Explore ways to celebrate thoughtfully and safely.",
        ],
        practice:
          "Make a drawing or family activity sheet about a festival celebrated in your community.",
      },
      {
        slug: "kindness-and-seva",
        title: "Kindness, Gratitude and Seva",
        durationMinutes: 15,
        summary:
          "Connect cultural learning with everyday habits such as helping others, gratitude and caring for shared spaces.",
        learningPoints: [
          "Identify simple ways to help at home or school.",
          "Practice saying thank you and showing respect.",
          "Understand age-appropriate community responsibility.",
        ],
        practice:
          "Complete one safe, age-appropriate act of kindness with adult guidance and discuss how it felt.",
      },
    ],
    schedule: "Self-paced · Short activities suited to family routines.",
    eligibility:
      "Designed primarily for ages 5–12. Parent or guardian participation is recommended.",
    metaTitle: "Free Bal Sanskar Course for Children | DivyaDhara",
    metaDescription:
      "Explore Indian stories, shlokas, festivals and cultural values through DivyaDhara's free family-friendly Bal Sanskar learning activities.",
    keywords: [
      "free Bal Sanskar course",
      "Indian culture for children",
      "Ramayana stories for kids",
      "children's shloka learning",
      "Indian festivals for kids",
      "values education for children",
    ],
  },
];
