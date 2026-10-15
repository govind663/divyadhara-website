import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  Compass,
  Flame,
  Heart,
  Landmark,
  Mail,
  MapPin,
  MapPinned,
  MessageCircle,
  MoonStar,
  Phone,
  PlayCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Images,
  BookOpen,
  Instagram,
  Youtube,
  Facebook,
  ArrowUp,
} from "lucide-react";

import {
  getDashboardPathForRole,
  useApp,
} from "../context/AppContext";

import {
  waLink,
  DISPLAY_PHONE,
  CONTACT_EMAIL,
  SITE_URL,
} from "../lib/utils";

/* =========================================================
   BUSINESS CONTACT
========================================================= */

const OFFICE_ADDRESS =
  "Nav Durga Niwas, Plot No. 473, Sector 4, Ghansoli, Navi Mumbai – 400701, Maharashtra, India";

const OFFICE_MAP_URL =
  "https://www.google.com/maps/search/?api=1&query=Nav+Durga+Niwas,+Plot+No.+473,+Sector+4,+Ghansoli,+Navi+Mumbai+400701,+Maharashtra,+India";

const PHONE_HREF = `tel:${DISPLAY_PHONE.replace(/[^\d+]/g, "")}`;
const EMAIL_HREF = `mailto:${CONTACT_EMAIL}`;

/* =========================================================
   SOCIAL MEDIA LINKS
   Configure these in the project-root .env file.
   YouTube defaults to the official DivyaDhara channel.
   Instagram/Facebook are hidden until real URLs are configured.
========================================================= */

const SOCIAL_LINKS = {
  instagram: import.meta.env.VITE_INSTAGRAM_URL?.trim() || "",
  youtube:
    import.meta.env.VITE_YOUTUBE_URL?.trim() ||
    "https://www.youtube.com/@DivyaDhara-k9t",
  facebook: import.meta.env.VITE_FACEBOOK_URL?.trim() || "",
};

type SocialItem = {
  key: "instagram" | "youtube" | "facebook";
  label: string;
  href: string;
  Icon: typeof Instagram;
  className: string;
};

const SOCIAL_ITEMS: SocialItem[] = [
  {
    key: "instagram",
    label: "Instagram",
    href: SOCIAL_LINKS.instagram,
    Icon: Instagram,
    className:
      "bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45]",
  },
  {
    key: "youtube",
    label: "YouTube",
    href: SOCIAL_LINKS.youtube,
    Icon: Youtube,
    className: "bg-[#FF0000]",
  },
  {
    key: "facebook",
    label: "Facebook",
    href: SOCIAL_LINKS.facebook,
    Icon: Facebook,
    className: "bg-[#1877F2]",
  },
];

/* =========================================================
   FOOTER NAVIGATION TYPES
========================================================= */

type FooterLink = {
  label: string;
  href: string;
  icon?: ReactNode;
};

type FooterColumn = {
  heading: string;
  links: FooterLink[];
};

/* =========================================================
   FOOTER NAVIGATION
========================================================= */

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Explore",
    links: [
      {
        label: "Temples of India",
        href: "/temples",
        icon: <Landmark size={14} />,
      },
      {
        label: "Spiritual Places",
        href: "/spiritual-places",
        icon: <MapPinned size={14} />,
      },
      {
        label: "Yatra Packages",
        href: "/packages",
        icon: <Compass size={14} />,
      },
      {
        label: "Ashrams",
        href: "/ashrams",
        icon: <Heart size={14} />,
      },
      {
        label: "Events & Kathas",
        href: "/events",
        icon: <Flame size={14} />,
      },
      {
        label: "Gallery",
        href: "/gallery",
        icon: <Images size={14} />,
      },
      {
        label: "Videos",
        href: "/videos",
        icon: <PlayCircle size={14} />,
      },
    ],
  },
  {
    heading: "Puja & Seva",
    links: [
      {
        label: "Puja Services",
        href: "/services",
        icon: <Sparkles size={14} />,
      },
      {
        label: "Book a Pandit",
        href: "/pandits",
        icon: <ShieldCheck size={14} />,
      },
      {
        label: "Cultural Courses",
        href: "/courses",
        icon: <BookOpen size={14} />,
      },
      {
        label: "Contact for Guidance",
        href: "/contact",
        icon: <MessageCircle size={14} />,
      },
    ],
  },
  {
    heading: "Panchang & Jyotish",
    links: [
      {
        label: "Today's Panchang",
        href: "/panchang",
        icon: <CalendarDays size={14} />,
      },
      {
        label: "Festival Calendar",
        href: "/calendar",
        icon: <CalendarDays size={14} />,
      },
      {
        label: "Today's Rashifal",
        href: "/rashifal",
        icon: <Sparkles size={14} />,
      },
      {
        label: "Kundli",
        href: "/kundli",
        icon: <MoonStar size={14} />,
      },
      {
        label: "Gochar",
        href: "/gochar",
        icon: <Clock3 size={14} />,
      },
    ],
  },
  {
    heading: "Trust & Support",
    links: [
      {
        label: "About DivyaDhara",
        href: "/about",
        icon: <Heart size={14} />,
      },
      {
        label: "Contact & Grievance",
        href: "/contact",
        icon: <MessageCircle size={14} />,
      },
      {
        label: "Login / Register",
        href: "/login",
        icon: <Users size={14} />,
      },
      {
        label: "Trust & Mission",
        href: "/about",
        icon: <ShieldCheck size={14} />,
      },
    ],
  },
];

/* =========================================================
   FOOTER
========================================================= */

export default function Footer() {
  const { user } = useApp();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailRequested, setEmailRequested] =
    useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const updateBackToTopVisibility = () => {
      setShowBackToTop(window.scrollY > 320);
    };

    updateBackToTopVisibility();
    window.addEventListener("scroll", updateBackToTopVisibility, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", updateBackToTopVisibility);
    };
  }, []);

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dashboardPath = user
    ? getDashboardPathForRole(user.role)
    : "/login";

  const dashboardLabel = user
    ? "My Dashboard"
    : "Login / Register";

  const handleNewsletterSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        trimmedEmail,
      )
    ) {
      setEmailError(
        "Please enter a valid email address.",
      );
      setEmailRequested(false);
      return;
    }

    setEmailError("");

    /*
     * There is no newsletter persistence route in the current application
     * contract. Do not claim that a subscription was saved. Instead, open a
     * pre-filled email request to the official DivyaDhara contact address.
     */
    const subject = encodeURIComponent(
      "Request to join Divya Patra — DivyaDhara",
    );

    const body = encodeURIComponent(
      `Namaste DivyaDhara Team,

Please add this email to the Divya Patra weekly wisdom mailing list:

${trimmedEmail}

Dhanyavaad.`,
    );

    window.location.href =
      `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;

    setEmailRequested(true);
  };

  const whatsappHref = waLink(
    "Namaste DivyaDhara! 🙏 I need guidance for darshan, puja, pandit, Ashram, yatra or spiritual learning.",
  );

  return (
    <footer className="relative overflow-hidden bg-char-900 text-stone-300">
      {/* ===================================================
          TOP DIVIDER
      ==================================================== */}

      <div className="h-1.5 bg-linear-to-r from-amber-500 via-orange-600 to-amber-500" />

      <div
        className="mandala-bg absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
      />

      {/* ===================================================
          DIVYA PATRA / CONTACT CTA
      ==================================================== */}

      <div className="relative mx-auto max-w-7xl px-4 pt-12 md:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-amber-500/20 bg-linear-to-br from-[#2a1a10] to-[#3d2c1c]">
          <div className="relative p-6 md:p-8">
            <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />

            <div className="relative flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-amber-400">
                  <Flame
                    size={13}
                    aria-hidden="true"
                  />
                  Divya Patra — Weekly Wisdom
                </p>

                <h3 className="font-display mt-2 text-2xl font-semibold leading-tight text-amber-50 md:text-3xl">
                  Panchang, festivals & sacred
                  <br className="hidden sm:block" />
                  inspiration in your inbox.
                </h3>

                <p className="mt-2 max-w-xl text-sm leading-6 text-stone-400">
                  Request the Divya Patra weekly update for
                  Panchang highlights, festival notes, spiritual
                  insights and sacred travel inspiration.
                </p>

                <p className="mt-2 text-xs font-medium text-amber-400/70">
                  Email requests are sent to the DivyaDhara
                  seva desk. You can opt out anytime.
                </p>
              </div>

              <form
                onSubmit={handleNewsletterSubmit}
                className="w-full max-w-md"
                aria-label="Request Divya Patra by email"
              >
                <div className="flex w-full gap-2">
                  <label
                    htmlFor="footer-newsletter-email"
                    className="sr-only"
                  >
                    Email address
                  </label>

                  <input
                    id="footer-newsletter-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    required
                    onChange={(event) => {
                      setEmail(event.target.value);

                      if (emailError) {
                        setEmailError("");
                      }

                      if (emailRequested) {
                        setEmailRequested(false);
                      }
                    }}
                    placeholder="you@example.com"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />

                  <button
                    type="submit"
                    className="btn-gold flex shrink-0 items-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-bold text-white transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  >
                    <Send size={15} />
                    Request
                  </button>
                </div>

                {emailError && (
                  <p
                    className="mt-2 px-1 text-xs font-medium text-red-300"
                    role="alert"
                  >
                    {emailError}
                  </p>
                )}

                {emailRequested && !emailError && (
                  <p
                    className="mt-2 px-1 text-xs font-medium text-emerald-300"
                    role="status"
                  >
                    Your email request has been prepared. Complete
                    the email message to contact the seva desk.
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================
          MAIN FOOTER
      ==================================================== */}

      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-8 md:grid-cols-[1.35fr_repeat(4,1fr)] md:px-6 lg:px-8">
        {/* =================================================
            BRAND / CONTACT
        ================================================== */}

        <div>
          <Link
            to="/"
            className="group inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-char-900"
            aria-label="DivyaDhara home"
          >
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-linear-to-br from-orange-500 to-saffron-900 shadow-lg shadow-orange-900/20">
              <span className="font-sanskrit text-2xl leading-none text-amber-100">
                ॐ
              </span>

              <span
                className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-amber-300/30"
                aria-hidden="true"
              />
            </span>

            <span>
              <span className="font-display block text-xl font-bold text-amber-50">
                दिव्य{" "}
                <span className="text-gradient-saffron">
                  धारा
                </span>
              </span>

              <span className="block text-[12px] font-semibold uppercase text-amber-400/80">
                पवित्र भारत यात्रा
              </span>
            </span>
          </Link>

          <p className="mt-4 max-w-sm text-sm leading-7 text-stone-400">
            Discover temples, connect with pandits,
            perform puja, learn sacred traditions,
            follow the Panchang and plan meaningful
            yatras across Bharat.
          </p>

          <p className="font-sanskrit mt-4 text-sm text-amber-300/90">
            ॥ तमसो मा ज्योतिर्गमय ॥
          </p>

          <div className="mt-5 space-y-3 text-sm">
            <a
              href={OFFICE_MAP_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2.5 transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <MapPin
                size={15}
                className="mt-0.5 shrink-0 text-orange-500"
                aria-hidden="true"
              />

              <span className="leading-5">
                {OFFICE_ADDRESS}
              </span>
            </a>

            <a
              href={PHONE_HREF}
              className="flex items-center gap-2.5 transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <Phone
                size={14}
                className="shrink-0 text-orange-500"
                aria-hidden="true"
              />
              {DISPLAY_PHONE}
            </a>

            <a
              href={EMAIL_HREF}
              className="flex items-center gap-2.5 break-all transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <Mail
                size={14}
                className="shrink-0 text-orange-500"
                aria-hidden="true"
              />
              {CONTACT_EMAIL}
            </a>
          </div>

          {/* Direct support actions */}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-bold text-white transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <MessageCircle size={15} />
              WhatsApp Seva Desk
            </a>

            <a
              href={OFFICE_MAP_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-stone-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <MapPinned size={15} />
              Open Map
            </a>
          </div>

          {/* =================================================
              SOCIAL MEDIA — compact, horizontally aligned
          ================================================== */}

          <section
            className="mt-4"
            aria-label="DivyaDhara social media"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400">
                Connect with us
              </h4>

              <div className="flex items-center gap-2">
                {SOCIAL_ITEMS.filter((item) => Boolean(item.href)).map(
                  ({ key, label, href, Icon, className }) => (
                    <a
                      key={key}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Visit DivyaDhara on ${label}`}
                      title={label}
                      className={`group inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition duration-200 hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-char-900 ${className}`}
                    >
                      <Icon
                        size={17}
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                    </a>
                  ),
                )}
              </div>
            </div>

            <p className="mt-1.5 max-w-xs text-[11px] leading-4 text-stone-500">
              Temple stories, puja guidance, pilgrimage inspiration and
              spiritual updates from DivyaDhara.
            </p>

            {(!SOCIAL_LINKS.instagram ||
              !SOCIAL_LINKS.facebook) && (
              <p className="mt-1 text-[10px] leading-4 text-stone-500">
                Configure Instagram and Facebook URLs in the project-root .env file.
              </p>
            )}
          </section>

          <p className="mt-3 text-[11px] leading-4 text-stone-500">
            DivyaDhara Seva Desk · 7 AM – 10 PM IST
            <br />
            For bookings, enquiries, grievances and partnership
            support.
          </p>
        </div>

        {/* =================================================
            FOOTER COLUMNS
        ================================================== */}

        {FOOTER_COLUMNS.map((column) => (
          <nav
            key={column.heading}
            aria-label={column.heading}
          >
            <h4 className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-400">
              {column.heading}
            </h4>

            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="group flex items-center gap-2 rounded-md text-sm text-stone-400 transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    {link.icon && (
                      <span className="shrink-0 text-orange-500/80 transition group-hover:text-orange-400">
                        {link.icon}
                      </span>
                    )}

                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* ===================================================
          BUSINESS CTA BAND
      ==================================================== */}

      <div className="relative border-y border-white/10 bg-black/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-amber-100">
              <Compass
                size={16}
                className="text-orange-400"
                aria-hidden="true"
              />
              Planning a sacred journey?
            </p>

            <p className="mt-1 text-xs text-stone-500">
              Explore Yatra packages, sacred places, Panchang
              and spiritual services.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/packages"
              className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              Explore Yatras
            </Link>

            <Link
              to="/panchang"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-amber-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Today's Panchang
            </Link>

            <Link
              to="/services"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-stone-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Puja Services
            </Link>

            <Link
              to="/rashifal"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-stone-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Rashifal
            </Link>
          </div>
        </div>
      </div>

      {/* ===================================================
          BOTTOM BAR
      ==================================================== */}

      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 text-xs text-stone-500 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <div>
            <p className="leading-5">
              © {new Date().getFullYear()} DivyaDhara ·
              Crafted with devotion in Bharat.
            </p>

            <p className="mt-1 leading-5 text-stone-600">
              {SITE_URL.replace(/^https?:\/\//, "")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              to="/about"
              className="transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Trust & Mission
            </Link>

            <Link
              to="/contact"
              className="transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Grievance
            </Link>

            <Link
              to="/contact"
              className="transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Contact
            </Link>

            <Link
              to={dashboardPath}
              className="transition hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              {dashboardLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* ===================================================
          FLOATING ACTIONS — WHATSAPP + BACK TO TOP
          Aligned together and styled for DivyaDhara's saffron/gold theme.
      ==================================================== */}

      <div className="fixed bottom-5 right-4 z-50 flex items-center gap-3 sm:right-5 sm:gap-3.5">
        {showBackToTop && (
          <button
            type="button"
            onClick={handleBackToTop}
            aria-label="Back to top"
            title="Back to top"
            className="group relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-amber-200/70 bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 text-[#2a1a10] shadow-[0_10px_28px_-7px_rgba(245,158,11,0.75)] transition duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-[0_14px_34px_-6px_rgba(245,158,11,0.9)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-char-900 motion-reduce:transition-none"
          >
            <span
              className="absolute inset-0 rounded-full border border-amber-200/70 opacity-70 motion-safe:animate-ping motion-reduce:animate-none"
              aria-hidden="true"
            />
            <ArrowUp
              size={22}
              strokeWidth={2.8}
              className="relative transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </button>
        )}

        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with DivyaDhara on WhatsApp"
          title="Chat with DivyaDhara on WhatsApp"
          className="group relative grid h-14 w-14 shrink-0 place-items-center rounded-full border border-emerald-200/80 bg-gradient-to-br from-[#39ed7d] via-[#25D366] to-[#0b9f50] text-white shadow-[0_12px_30px_-6px_rgba(37,211,102,0.75)] transition duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-[0_16px_36px_-6px_rgba(37,211,102,0.9)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-char-900 motion-reduce:transition-none"
        >
          <span
            className="absolute inset-0 rounded-full bg-[#25D366]/60 motion-safe:animate-ping motion-reduce:animate-none"
            aria-hidden="true"
          />
          <MessageCircle
            size={26}
            fill="currentColor"
            strokeWidth={0}
            className="relative drop-shadow-sm transition-transform duration-300 group-hover:rotate-[-8deg] motion-reduce:transition-none"
            aria-hidden="true"
          />

          <span
            className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-orange-500 shadow-sm"
            aria-hidden="true"
          />
        </a>
      </div>
    </footer>
  );
}
