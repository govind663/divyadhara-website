
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  X,
  Clock,
  User,
  BadgeCheck,
  MessageCircle,
  BookOpen,
  CalendarDays,
  PlayCircle,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Facebook,
  Linkedin,
  AtSign,
  Share2,
  Copy,
  ExternalLink,
  Video,
  ListChecks,
  CircleHelp,
  ArrowUpRight,
} from "lucide-react";

import {
  COURSES,
  COURSE_SHARE_PLATFORMS,
  getCourseShareUrl,
  getCourseShareText,
} from "../data/courses";

import type {
  Course,
  CourseLesson,
  CourseSharePlatform,
} from "../data/courses";

import { useSEO } from "../lib/seo";
import { Breadcrumbs, Reveal, SectionHead } from "../components/ui";
import {
  EnquiryForm,
  PageHero,
  WhatsAppBand,
} from "../components/blocks";
import { waLink } from "../lib/utils";

const PAGE_SIZE = 3;

/* Original social-platform-inspired brand colours */
const SOCIAL_BRAND_STYLES: Record<CourseSharePlatform, string> = {
  whatsapp:
    "border-transparent bg-[#25D366] text-white hover:bg-[#128C7E] hover:shadow-[0_8px_24px_rgba(37,211,102,0.4)]",
  instagram:
    "border-transparent bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white hover:shadow-[0_8px_24px_rgba(214,41,118,0.4)]",
  facebook:
    "border-transparent bg-[#1877F2] text-white hover:bg-[#0866FF] hover:shadow-[0_8px_24px_rgba(24,119,242,0.4)]",
  linkedin:
    "border-transparent bg-[#0A66C2] text-white hover:bg-[#004182] hover:shadow-[0_8px_24px_rgba(10,102,194,0.4)]",
  threads:
    "border-transparent bg-[#101010] text-white hover:bg-[#303030] hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]",
};

/* Shared animated icon styling */
const SOCIAL_ICON_BUTTON =
  "group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 ease-out hover:-translate-y-1.5 hover:scale-110 hover:rotate-3 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none";

const COPY_ICON_BUTTON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-900/15 bg-[#fff8ed] text-[#5b3927] transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:bg-orange-100 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transform-none motion-reduce:transition-none";

const SOCIAL_ICONS = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  threads: AtSign,
};

/* Always use the public course URL when sharing from localhost. */
function getCourseUrl(course: Course): string {
  if (typeof window === "undefined") {
    return `https://divya-dhara.in/courses/${course.slug}`;
  }

  const hostname = window.location.hostname;

  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local");

  const origin = isLocalhost
    ? "https://divya-dhara.in"
    : window.location.origin;

  return `${origin}/courses/${course.slug}`;
}

async function copyText(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Use the browser fallback below.
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (copied) return true;
    } catch {
      // Show a manual copy prompt as the final fallback.
    }
  }

  if (typeof window !== "undefined") {
    window.prompt("Copy this course text:", text);
  }

  return false;
}

function openShareUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function CourseShareButtons({
  course,
  compact = false,
}: {
  course: Course;
  compact?: boolean;
}) {
  const [message, setMessage] = useState("");

  async function handleShare(platform: CourseSharePlatform) {
    const pageUrl = getCourseUrl(course);
    const shareText = getCourseShareText(course, pageUrl);

    /*
     * Instagram does not provide a standard public web-share
     * intent for arbitrary website URLs. Copy the caption and
     * open Instagram as a fallback.
     */
    if (platform === "instagram") {
      openShareUrl("https://www.instagram.com/");
      const copied = await copyText(shareText);

      setMessage(
        copied
          ? "Course caption and link copied. Paste them into Instagram."
          : "Copy the course caption and link from the prompt.",
      );

      return;
    }

    const shareUrl = getCourseShareUrl(
      platform,
      course,
      pageUrl,
    );

    if (shareUrl) {
      openShareUrl(shareUrl);
      setMessage(
        `Opening ${
          platform === "threads" ? "Threads" : platform
        } sharing.`,
      );

      return;
    }

    const copied = await copyText(pageUrl);

    setMessage(
      copied ? "Course link copied." : "Copy the link from the prompt.",
    );
  }

  async function handleCopyLink() {
    const copied = await copyText(getCourseUrl(course));

    setMessage(
      copied ? "Course link copied." : "Copy the link from the prompt.",
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <span className="mr-1 flex items-center gap-1.5 text-xs font-bold text-stone-600">
            <Share2 size={14} />
            Share course
          </span>
        )}

        {COURSE_SHARE_PLATFORMS.map((platform) => {
          const Icon = SOCIAL_ICONS[platform.id] ?? Share2;

          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => void handleShare(platform.id)}
              className={`${SOCIAL_ICON_BUTTON} ${SOCIAL_BRAND_STYLES[platform.id]}`}
              title={`Share on ${platform.label}`}
              aria-label={`Share ${course.title} on ${platform.label}`}
            >
              <Icon
                size={compact ? 17 : 19}
                strokeWidth={2.25}
                className="relative z-10 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none"
              />

              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full motion-reduce:transition-none" />
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => void handleCopyLink()}
          className={COPY_ICON_BUTTON}
          title="Copy course link"
          aria-label={`Copy link for ${course.title}`}
        >
          <Copy size={16} />
        </button>
      </div>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs text-emerald-700"
        >
          {message}
        </p>
      )}
    </div>
  );
}

function CourseCardView({
  course,
  index,
}: {
  course: Course;
  index: number;
}) {
  const lessonCount = course.lessons?.length ?? 0;

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-orange-300 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Link
        to={`/courses/${course.slug}`}
        className="relative block h-52 overflow-hidden bg-orange-50"
        aria-label={`Explore ${course.title}`}
      >
        <img
          src={course.image}
          alt={course.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#21140d]/85 via-black/5 to-black/10" />

        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1.5 text-xs font-extrabold text-[#382316] shadow-sm">
          <Sparkles size={13} />
          FREE LEARNING
        </span>

        <span className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#432818]">
          {course.category}
        </span>

        <span className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs font-semibold text-white">
          <PlayCircle size={16} />
          {lessonCount} lessons
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-stone-500">
          <span className="flex items-center gap-1">
            <Clock size={14} className="text-orange-600" />
            {course.duration}
          </span>

          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-800">
            {course.level}
          </span>
        </div>

        <h2 className="mt-4 font-display text-xl font-semibold leading-snug text-[#2a1a10]">
          <Link
            to={`/courses/${course.slug}`}
            className="transition-colors hover:text-orange-700"
          >
            {course.title}
          </Link>
        </h2>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">
          {course.overview}
        </p>

        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-stone-500">
          <User
            size={15}
            className="mt-0.5 shrink-0 text-orange-700"
          />
          <span>{course.instructor}</span>
        </div>

        <div className="mt-5 rounded-2xl bg-[#fff8ed] p-3.5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#59351e]">
            <BookOpen size={16} className="text-orange-700" />
            What you will explore
          </div>

          <ul className="mt-2 space-y-1.5">
            {course.curriculum.slice(0, 3).map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-xs leading-5 text-stone-600"
              >
                <CheckCircle2
                  size={14}
                  className="mt-0.5 shrink-0 text-emerald-700"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {course.curriculum.length > 3 && (
            <p className="mt-2 text-xs font-semibold text-orange-800">
              +{course.curriculum.length - 3} more curriculum topics
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-emerald-700">
            <BadgeCheck size={17} />
            Free to learn
          </span>

          <span className="text-xs text-stone-500">
            Self-paced resources
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link
            to={`/courses/${course.slug}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2a1a10] px-3 py-3 text-center text-sm font-bold text-white transition hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <BookOpen size={16} />
            Explore course
          </Link>

          <Link
            to={`/courses/${course.slug}#lessons`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-700/25 bg-orange-50 px-3 py-3 text-center text-sm font-bold text-[#5b3927] transition hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <PlayCircle size={16} />
            View lessons
          </Link>
        </div>

        <div className="mt-5 border-t border-orange-900/10 pt-4">
          <CourseShareButtons course={course} compact />
        </div>
      </div>
    </article>
  );
}

function CourseVideo({
  lesson,
}: {
  lesson: CourseLesson;
}) {
  const url = lesson.videoUrl?.trim();

  if (!url) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-orange-900/20 bg-[#fff9f0] p-5 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-orange-100 text-orange-800">
          <Video size={22} />
        </div>

        <p className="mt-3 text-sm font-bold text-[#4a2c1a]">
          Video lesson coming soon
        </p>

        <p className="mt-1 max-w-xs text-xs leading-5 text-stone-500">
          Lesson notes and the practice activity are available below.
          A video will appear here once its real URL is added to the course data.
        </p>
      </div>
    );
  }

  const inferredType =
    lesson.videoType ??
    (/youtu\.be|youtube\.com/i.test(url)
      ? "youtube"
      : /vimeo\.com/i.test(url)
        ? "vimeo"
        : /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url)
          ? "direct"
          : undefined);

  if (inferredType === "direct") {
    return (
      <video
        controls
        preload="metadata"
        className="aspect-video w-full rounded-2xl bg-black"
        aria-label={lesson.title}
      >
        <source src={url} />
        Your browser does not support HTML video.
      </video>
    );
  }

  if (inferredType === "youtube") {
    const id = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/,
    )?.[1];

    if (id) {
      return (
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            title={lesson.title}
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      );
    }
  }

  if (inferredType === "vimeo") {
    const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];

    if (id) {
      return (
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            src={`https://player.vimeo.com/video/${id}`}
            title={lesson.title}
            className="h-full w-full"
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-orange-900/10 bg-orange-50 p-4 text-sm font-bold text-orange-900 hover:bg-orange-100"
    >
      <PlayCircle size={20} />
      Open lesson video
      <ExternalLink size={15} />
    </a>
  );
}

function CourseLessonView({
  lesson,
  index,
}: {
  lesson: CourseLesson;
  index: number;
}) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <article className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-4 p-5 text-left transition hover:bg-orange-50/60 md:p-6"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#2a1a10] text-sm font-extrabold text-amber-300">
          {String(index + 1).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold text-[#2a1a10]">
            {lesson.title}
          </span>

          <span className="mt-1 block text-sm leading-6 text-stone-600">
            {lesson.summary}
          </span>

          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-orange-800">
            <Clock size={14} />
            About {lesson.durationMinutes} minutes
          </span>
        </span>

        <span className="mt-1 shrink-0 text-xs font-bold text-orange-800">
          {expanded ? "Hide lesson" : "Open lesson"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-orange-900/10 p-5 md:p-6">
          <CourseVideo lesson={lesson} />

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-[#2a1a10]">
                <GraduationCap
                  size={18}
                  className="text-orange-700"
                />
                What you will learn
              </h3>

              <ul className="mt-3 space-y-2.5">
                {lesson.learningPoints.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 text-sm leading-6 text-stone-600"
                  >
                    <CheckCircle2
                      size={16}
                      className="mt-1 shrink-0 text-emerald-700"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-[#fff8ed] p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#2a1a10]">
                <ListChecks
                  size={18}
                  className="text-orange-700"
                />
                Practice activity
              </h3>

              <p className="mt-3 text-sm leading-6 text-stone-600">
                {lesson.practice}
              </p>

              <p className="mt-3 text-xs leading-5 text-stone-500">
                Practice at a comfortable pace and revisit the lesson
                whenever you need revision.
              </p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export function CourseList() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [level, setLevel] = useState("");
  const [page, setPage] = useState(1);

  useSEO({
    title: "Free Online Courses: Sanskrit, Yoga, Gita & More | DivyaDhara",
    description:
      "Explore free learning resources on Sanskrit, yoga, meditation, Bhagavad Gita, devotional music and Bal Sanskar. Browse structured lessons, practical activities and available course videos on DivyaDhara.",
    path: "/courses",
  });

  const categories = useMemo(
    () => [...new Set(COURSES.map((course) => course.category))],
    [],
  );

  const levels = useMemo(
    () => [...new Set(COURSES.map((course) => course.level))],
    [],
  );

  const filteredCourses = useMemo(() => {
    const search = query.trim().toLowerCase();

    return COURSES.filter((course) => {
      const matchesCategory = !cat || course.category === cat;
      const matchesLevel = !level || course.level === level;

      const searchableText = [
        course.title,
        course.category,
        course.instructor,
        course.overview,
        course.level,
        course.eligibility,
        ...course.curriculum,
        ...course.keywords,
        ...(course.lessons ?? []).map((lesson) => lesson.title),
        ...(course.lessons ?? []).map((lesson) => lesson.summary),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !search || searchableText.includes(search);

      return matchesCategory && matchesLevel && matchesSearch;
    });
  }, [query, cat, level]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCourses.length / PAGE_SIZE),
  );

  const safePage = Math.min(page, totalPages);

  const visibleCourses = filteredCourses.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function resetFilters() {
    setQuery("");
    setCat("");
    setLevel("");
    setPage(1);
  }

  return (
    <>
      <PageHero
        eyebrow="Vidya · Sadhana · Free Learning"
        title="Discover Your Learning Journey"
        sub="Explore Sanskrit, yoga, meditation, the Bhagavad Gita, devotional music and Indian culture through structured lessons and practical activities. Learn at your own pace."
        image="/images/yoga-course.jpeg"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Courses" },
          ]}
        />

        <section className="mt-8 overflow-hidden rounded-3xl bg-[#2a1a10] p-6 text-white md:p-8">
          <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                <Sparkles size={17} />
                DIVYADHARA LEARNING
              </div>

              <h2 className="mt-3 font-display text-2xl font-semibold md:text-3xl">
                Knowledge for every stage of life
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-200">
                Begin with a topic you love. Explore lesson notes, practice
                activities and available videos, and revisit the material
                whenever you need a refresher.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-300/25 bg-white/5 p-4 md:min-w-44">
              <div className="text-3xl font-extrabold text-amber-300">
                {COURSES.length}
              </div>

              <p className="mt-1 text-xs text-stone-200">
                Learning paths to explore
              </p>

              <p className="mt-3 text-sm font-bold text-white">
                Free learning resources
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Search and filter courses"
          className="mt-8 rounded-3xl border border-orange-900/10 bg-[#fffaf5] p-4 md:p-6"
        >
          <div className="flex items-center gap-2 text-lg font-bold text-[#2a1a10]">
            <SlidersHorizontal
              size={20}
              className="text-orange-700"
            />
            Find your course
          </div>

          {/* Search, category, level and reset stay aligned in one row on desktop. */}
          <div className="mt-5 grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_200px_auto] lg:gap-3">
            <label className="relative block min-w-0">
              <span className="sr-only">Search courses</span>
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search courses..."
                className="h-12 w-full rounded-2xl border border-orange-900/15 bg-white pl-11 pr-4 text-sm text-[#2a1a10] outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </label>

            <label className="block min-w-0">
              <span className="sr-only">Filter by category</span>
              <select
                aria-label="Filter by category"
                value={cat}
                onChange={(event) => {
                  setCat(event.target.value);
                  setPage(1);
                }}
                className="h-12 w-full rounded-2xl border border-orange-900/15 bg-white px-3.5 text-sm text-[#2a1a10] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-0">
              <span className="sr-only">Filter by learning level</span>
              <select
                aria-label="Filter by learning level"
                value={level}
                onChange={(event) => {
                  setLevel(event.target.value);
                  setPage(1);
                }}
                className="h-12 w-full rounded-2xl border border-orange-900/15 bg-white px-3.5 text-sm text-[#2a1a10] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              >
                <option value="">All levels</option>
                {levels.map((courseLevel) => (
                  <option key={courseLevel} value={courseLevel}>
                    {courseLevel}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-orange-900/15 bg-white px-4 text-sm font-bold text-stone-700 transition hover:border-orange-300 hover:bg-orange-50 sm:col-span-2 lg:col-span-1 lg:w-auto"
            >
              <X size={16} />
              Reset
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <p aria-live="polite">
              Showing{" "}
              <strong className="text-[#2a1a10]">
                {filteredCourses.length === 0
                  ? 0
                  : (safePage - 1) * PAGE_SIZE + 1}
                {filteredCourses.length > 0 &&
                  `–${Math.min(
                    safePage * PAGE_SIZE,
                    filteredCourses.length,
                  )}`}
              </strong>{" "}
              of{" "}
              <strong className="text-[#2a1a10]">
                {filteredCourses.length}
              </strong>{" "}
              courses
            </p>

            <p>Every course is presented as free learning.</p>
          </div>
        </section>

        {visibleCourses.length > 0 ? (
          <div className="mt-8 grid items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {visibleCourses.map((course, index) => (
              <CourseCardView
                key={course.slug}
                course={course}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-orange-900/20 bg-orange-50/70 px-6 py-16 text-center">
            <Search
              size={32}
              className="mx-auto text-orange-700"
            />

            <h2 className="mt-4 font-display text-2xl font-semibold text-[#2a1a10]">
              No courses found
            </h2>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              Try a different keyword or remove one of the filters.
            </p>

            <button
              type="button"
              onClick={resetFilters}
              className="mt-5 rounded-xl bg-[#2a1a10] px-5 py-3 text-sm font-bold text-white hover:bg-orange-800"
            >
              Show all courses
            </button>
          </div>
        )}

        {filteredCourses.length > PAGE_SIZE && (
          <nav
            aria-label="Course pagination"
            className="mt-10 flex flex-wrap items-center justify-center gap-2"
          >
            <button
              type="button"
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 rounded-xl border border-orange-900/15 bg-white px-4 py-2.5 text-sm font-bold text-[#4a2c1a] transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            {Array.from(
              { length: totalPages },
              (_, index) => index + 1,
            ).map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => {
                  setPage(number);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-current={
                  safePage === number ? "page" : undefined
                }
                className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-extrabold transition ${
                  safePage === number
                    ? "bg-[#2a1a10] text-amber-300"
                    : "border border-orange-900/15 bg-white text-stone-700 hover:bg-orange-50"
                }`}
              >
                {number}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setPage((current) =>
                  Math.min(totalPages, current + 1),
                );
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={safePage === totalPages}
              className="inline-flex items-center gap-1 rounded-xl border border-orange-900/15 bg-white px-4 py-2.5 text-sm font-bold text-[#4a2c1a] transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </nav>
        )}

        <section className="mt-14 border-t border-orange-900/10 pt-10">
          <SectionHead
            eyebrow="Learn at your own pace"
            title="Make learning a daily practice"
          />

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: BookOpen,
                title: "Structured lessons",
                text: "Explore topics one lesson at a time, with clear learning points.",
              },
              {
                icon: PlayCircle,
                title: "Videos when available",
                text: "Watch lessons where a genuine video URL is available and use the accompanying practice notes.",
              },
              {
                icon: GraduationCap,
                title: "Learn and reflect",
                text: "Build understanding through revision, practice activities and your own learning notes.",
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-3xl border border-orange-900/10 bg-white p-6"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-100 text-orange-800">
                    <Icon size={22} />
                  </div>

                  <h3 className="mt-4 font-display text-lg font-semibold text-[#2a1a10]">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {item.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

export function CourseDetail() {
  const { slug } = useParams();
  const course = COURSES.find((item) => item.slug === slug);

  useSEO({
    title: course?.metaTitle ?? "Course Not Found | DivyaDhara",
    description:
      course?.metaDescription ??
      "Explore free cultural and spiritual learning resources on DivyaDhara.",
    path: `/courses/${slug ?? ""}`,
    image: course?.image,
    schema: course
      ? {
          "@context": "https://schema.org",
          "@type": "Course",
          name: course.title,
          description: course.metaDescription,
          url: `https://divya-dhara.in/courses/${course.slug}`,
          educationalLevel: course.level,
          inLanguage: ["hi", "en", "sa"],
          isAccessibleForFree: true,
          provider: {
            "@type": "Organization",
            name: "DivyaDhara",
            url: "https://divya-dhara.in/",
          },
          hasCourseInstance: {
            "@type": "CourseInstance",
            courseMode: "Online",
            courseWorkload: course.duration,
          },
        }
      : undefined,
  });

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-orange-100 text-orange-800">
          <CircleHelp size={30} />
        </div>

        <h1 className="mt-5 font-display text-3xl font-bold text-[#2a1a10]">
          Course not found
        </h1>

        <p className="mt-3 text-sm text-stone-600">
          This course may have moved. Explore the current course collection.
        </p>

        <Link
          to="/courses"
          className="mt-6 inline-block rounded-2xl bg-[#2a1a10] px-6 py-3 text-sm font-bold text-white hover:bg-orange-800"
        >
          Explore all courses
        </Link>
      </div>
    );
  }

  const whatsappLink = waLink(
    `Namaste! I am exploring the free DivyaDhara course "${course.title}". Please share any available learning guidance or video updates.`,
  );

  const lessons = course.lessons ?? [];

  const learningOutcomes = [
    ...new Set(
      lessons.flatMap((lesson) => lesson.learningPoints),
    ),
  ].slice(0, 6);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-[#21140d] text-white">
        <img
          src={course.image}
          alt={course.title}
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-60"
        />

        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#21140d] via-[#21140d]/85 to-black/30" />

        <div className="mx-auto max-w-7xl px-4 pb-12 pt-10 md:px-6 md:pb-16 lg:px-8 lg:pt-14">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Courses", href: "/courses" },
              { label: course.title },
            ]}
          />

          <div className="mt-8 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-amber-300 px-3 py-1.5 text-[#3a2415]">
              {course.category}
            </span>

            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">
              {course.level}
            </span>

            <span className="rounded-full bg-emerald-600 px-3 py-1.5 text-white">
              FREE LEARNING
            </span>
          </div>

          <h1 className="mt-5 max-w-4xl font-display text-3xl font-semibold leading-tight md:text-5xl lg:text-6xl">
            {course.title}
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-stone-200 md:text-lg">
            {course.overview}
          </p>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-stone-200">
            <span className="flex items-start gap-2">
              <User
                size={16}
                className="mt-0.5 shrink-0 text-amber-300"
              />
              <span>{course.instructor}</span>
            </span>

            <span className="flex items-start gap-2">
              <Clock
                size={16}
                className="mt-0.5 shrink-0 text-amber-300"
              />
              <span>{course.duration}</span>
            </span>

            <span className="flex items-start gap-2">
              <CalendarDays
                size={16}
                className="mt-0.5 shrink-0 text-amber-300"
              />
              <span>{course.schedule}</span>
            </span>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#lessons"
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-300 px-6 py-3.5 text-sm font-extrabold text-[#2a1a10] transition hover:bg-amber-200"
            >
              <PlayCircle size={18} />
              Start learning
            </a>

            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#128C7E]"
            >
              <MessageCircle size={18} />
              Ask on WhatsApp
              <ExternalLink size={14} />
            </a>
          </div>

          <div className="mt-7 border-t border-white/15 pt-5">
            <CourseShareButtons course={course} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <Reveal>
              <section>
                <SectionHead
                  eyebrow="About this learning path"
                  title="What you'll discover"
                />

                <p className="mt-4 text-sm leading-7 text-stone-600 md:text-base">
                  {course.overview}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: "Learning level",
                      value: course.level,
                      icon: GraduationCap,
                    },
                    {
                      label: "Suggested duration",
                      value: course.duration,
                      icon: Clock,
                    },
                    {
                      label: "Learning format",
                      value: course.mode,
                      icon: PlayCircle,
                    },
                    {
                      label: "Who can learn",
                      value: course.eligibility,
                      icon: User,
                    },
                  ].map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-orange-900/10 bg-[#fffaf5] p-4"
                      >
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-800">
                          <Icon size={15} />
                          {item.label}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-stone-700">
                          {item.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </Reveal>

            <Reveal className="mt-12">
              <section>
                <SectionHead
                  eyebrow="Learning outcomes"
                  title="What you can work towards"
                />

                <p className="mt-3 text-sm leading-6 text-stone-600">
                  These outcomes reflect the lesson topics and practice
                  activities. Your progress depends on your participation
                  and individual learning pace.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {learningOutcomes.map((outcome) => (
                    <div
                      key={outcome}
                      className="flex items-start gap-3 rounded-2xl border border-orange-900/10 bg-white p-4"
                    >
                      <CheckCircle2
                        size={18}
                        className="mt-0.5 shrink-0 text-emerald-700"
                      />

                      <p className="text-sm leading-6 text-stone-700">
                        {outcome}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>

            <Reveal className="mt-12">
              <section>
                <SectionHead
                  eyebrow="Course outline"
                  title="Explore the curriculum"
                />

                <ol className="mt-5 space-y-3">
                  {course.curriculum.map((topic, index) => (
                    <li
                      key={topic}
                      className="flex items-start gap-3 rounded-2xl border border-orange-900/10 bg-white p-4"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-700 to-amber-500 text-xs font-extrabold text-white">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <p className="pt-1 text-sm font-semibold leading-6 text-stone-700">
                        {topic}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </Reveal>

            <Reveal className="mt-12">
              <section id="lessons" className="scroll-mt-24">
                <SectionHead
                  eyebrow="Watch · Learn · Practise"
                  title="Lessons and videos"
                />

                <p className="mt-3 text-sm leading-6 text-stone-600">
                  Work through each lesson in order. Expand a lesson to view
                  the video player, learning points and practice activity.
                  Return to lessons whenever you need revision.
                </p>

                {lessons.length > 0 ? (
                  <div className="mt-6 space-y-4">
                    {lessons.map((lesson, index) => (
                      <CourseLessonView
                        key={lesson.slug}
                        lesson={lesson}
                        index={index}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl bg-orange-50 p-6 text-sm text-stone-600">
                    Lesson details are being prepared for this course.
                  </div>
                )}
              </section>
            </Reveal>

            <Reveal className="mt-12">
              <section className="rounded-3xl bg-[#2a1a10] p-6 text-white md:p-8">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-300 text-[#2a1a10]">
                    <BadgeCheck size={26} />
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-semibold md:text-2xl">
                      Free learning, clear expectations
                    </h2>

                    <p className="mt-3 text-sm leading-7 text-stone-200">
                      The learning resources on this page are presented as
                      free. A certificate, accredited qualification, live
                      batch, instructor consultation or downloadable resource
                      should only be considered included when DivyaDhara
                      explicitly confirms its availability.
                    </p>

                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-extrabold text-[#2a1a10] hover:bg-amber-200"
                    >
                      <MessageCircle size={17} />
                      Ask about this course
                    </a>
                  </div>
                </div>
              </section>
            </Reveal>
          </div>

          <aside className="mt-2 min-w-0">
            <div className="space-y-5 lg:sticky lg:top-28">
              <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800">
                  <BadgeCheck size={15} />
                  FREE LEARNING
                </span>

                <h2 className="mt-4 font-display text-xl font-semibold text-[#2a1a10]">
                  Begin your learning journey
                </h2>

                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Start with the first lesson, practise in your own time
                  and return to the material whenever you want to revise.
                </p>

                <a
                  href="#lessons"
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2a1a10] px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-800"
                >
                  <PlayCircle size={17} />
                  Explore all lessons
                </a>

                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#128C7E]"
                >
                  <MessageCircle size={17} />
                  Ask on WhatsApp
                </a>

                <div className="mt-5 border-t border-orange-900/10 pt-4">
                  <p className="mb-3 text-sm font-bold text-[#2a1a10]">
                    Share with friends
                  </p>

                  <CourseShareButtons
                    course={course}
                    compact
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-orange-900/10 bg-[#fff8ed] p-5">
                <h3 className="flex items-center gap-2 font-bold text-[#2a1a10]">
                  <ListChecks
                    size={18}
                    className="text-orange-700"
                  />
                  Course details
                </h3>

                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="text-xs font-semibold text-stone-500">
                      Instructor
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-stone-700">
                      {course.instructor}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold text-stone-500">
                      Suggested schedule
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-stone-700">
                      {course.schedule}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold text-stone-500">
                      Lessons
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-stone-700">
                      {lessons.length} structured lessons
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-extrabold text-orange-800">
                  <Sparkles size={14} />
                  DIVYADHARA LEARNING
                </span>

                <h3 className="font-display mt-4 text-xl font-semibold text-[#2a1a10]">
                  Need help getting started?
                </h3>

                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Ask us about the course, learning topics, practice activities
                  and available video lessons.
                </p>

                <a
                  href="#course-enquiry"
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2a1a10] px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-800"
                >
                  <MessageCircle size={17} />
                  Get learning guidance
                </a>

                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#128C7E]"
                >
                  <MessageCircle size={17} />
                  Ask on WhatsApp
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-8 md:px-6 lg:px-8">
        <WhatsAppBand
          title="Need help choosing where to start?"
          sub="Ask about course topics, lesson availability or learning guidance. Course learning resources are free."
          message={`Namaste! I am interested in the DivyaDhara course "${course.title}". Please guide me about its lessons and available videos.`}
        />
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:px-8">
        <SectionHead
          eyebrow="Continue exploring"
          title="You may also enjoy"
        />

        <div className="mt-6 grid items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {COURSES.filter((item) => item.slug !== course.slug)
            .slice(0, 3)
            .map((item, index) => (
              <CourseCardView
                key={item.slug}
                course={item}
                index={index}
              />
            ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/courses"
            className="inline-flex items-center gap-2 rounded-xl border border-orange-900/15 bg-white px-5 py-3 text-sm font-bold text-[#4a2c1a] transition hover:bg-orange-50"
          >
            <BookOpen size={17} />
            Browse all courses
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>

      {/* Premium course enquiry section, following the Temple Detail form pattern. */}
      <section
        id="course-enquiry"
        className="relative scroll-mt-24 overflow-hidden bg-[#f8f3eb] py-14 md:py-20"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <div className="mx-auto mb-9 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white/80 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-orange-800 shadow-sm">
              <Sparkles size={14} />
              DivyaDhara · Learning Assistance
            </span>

            <h2 className="font-display mt-5 text-3xl font-semibold leading-tight text-[#2a1a10] md:text-4xl lg:text-5xl">
              Start Your Learning Journey
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-600 md:text-base">
              Have questions about {course.title}? Share your learning goals.
              Enquire about course topics, lesson guidance and video
              availability.
            </p>
          </div>

          <div className="grid items-stretch gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-8">
            {/* Course information panel */}
            <div className="relative flex flex-col overflow-hidden rounded-[2rem] bg-[#2a1a10] p-6 text-white shadow-xl md:p-8 lg:p-9">
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
                  Your learning, your pace
                </span>

                <h3 className="font-display mt-5 text-2xl font-semibold leading-snug md:text-3xl">
                  Let’s help you take the next step.
                </h3>

                <p className="mt-4 text-sm leading-7 text-stone-300">
                  Tell us what you want to learn. Our enquiry team can help you
                  understand the available learning resources and next steps.
                </p>

                <div className="mt-7 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20">
                      <BookOpen size={19} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">
                        Course and lesson guidance
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-400">
                        Understand the curriculum, lesson sequence and
                        suggested learning activities.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20">
                      <PlayCircle size={19} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">
                        Video learning information
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-400">
                        Ask which video lessons are currently available and how
                        to access the learning materials.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20">
                      <GraduationCap size={19} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">
                        Guidance for your learning goals
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-400">
                        Share your experience level and what you hope to
                        practise or understand.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-300">
                  Your selected course
                </p>
                <p className="font-display mt-2 text-lg font-semibold">
                  {course.title}
                </p>
                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-stone-300">
                  <GraduationCap
                    size={15}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />
                  Level: {course.level}
                </p>
                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-stone-300">
                  <Clock
                    size={15}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />
                  Duration: {course.duration}
                </p>
                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-stone-300">
                  <CalendarDays
                    size={15}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />
                  {course.category} · Free learning resources
                </p>
              </div>

              <div className="relative mt-auto pt-6">
                <p className="text-xs leading-5 text-stone-400">
                  Prefer WhatsApp? Send your question about this course directly.
                </p>
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-extrabold text-white transition hover:bg-[#1fb95a] focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 focus:ring-offset-[#2a1a10]"
                >
                  <MessageCircle size={18} />
                  Enquire on WhatsApp
                  <ArrowUpRight size={16} />
                </a>
                <p className="mt-3 text-center text-[10px] leading-5 text-stone-500">
                  Enquiry submission does not guarantee a live session,
                  certificate or other additional service.
                </p>
              </div>
            </div>

            {/* Reuse the shared form and its existing validation/submission logic. */}
            <div className="min-w-0 overflow-hidden rounded-[2rem] border border-orange-900/10 bg-white p-4 shadow-[0_20px_70px_rgba(64,35,15,0.10)] sm:p-6 md:p-8 lg:p-9">
              <div className="mb-6 border-b border-orange-900/10 pb-5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-orange-700">
                  Course enquiry form
                </p>
                <h3 className="font-display mt-2 text-2xl font-semibold text-[#2a1a10] md:text-3xl">
                  Tell Us About Your Learning Goals
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Submit your question about this course. The shared
                  DivyaDhara enquiry form manages its own fields, validation
                  and submission behaviour.
                </p>
              </div>

              <EnquiryForm
                context={[
                  "Free course learning enquiry",
                  `Course: ${course.title}`,
                  `Category: ${course.category}`,
                  `Level: ${course.level}`,
                  `Duration: ${course.duration}`,
                  `Course slug: ${course.slug}`,
                ].join(" | ")}
                title={`Learning Enquiry: ${course.title}`}
                compact={false}
                leadType="contact"
                formKey="course_enquiry"
                sourceType="form"
                pagePath={`/courses/${course.slug}`}
                serviceType="course_learning"
              />
            </div>
          </div>

          <div className="mx-auto mt-6 flex max-w-3xl items-start justify-center gap-2 text-center text-xs leading-5 text-stone-500">
            <CheckCircle2
              size={15}
              className="mt-0.5 shrink-0 text-emerald-700"
            />
            <p>
              The enquiry helps DivyaDhara understand your learning interests.
              Any additional services or live instruction should be confirmed
              separately.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
