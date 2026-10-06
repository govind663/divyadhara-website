/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Compass,
  Crown,
  Flame,
  Heart,
  Images,
  Landmark,
  MapPinned,
  Menu,
  MessageCircle,
  MoonStar,
  Package,
  PlayCircle,
  Search,
  Sparkles,
  User,
  WandSparkles,
  X,
} from "lucide-react";
import {
  getDashboardPathForRole,
  useApp,
} from "../context/AppContext";
import { waLink, cx } from "../lib/utils";
import {
  TEMPLES,
  SERVICES,
  PLACES,
  PACKAGES,
} from "../data/content";

/* =========================================================
   TYPES
========================================================= */

type HeaderChild = {
  label: string;
  href: string;
  desc?: string;
};

type HeaderLink = {
  label: string;
  href: string;
  children?: HeaderChild[];
};

type SearchResult = {
  label: string;
  sub: string;
  href: string;
  type: string;
};

type MobileNavItem =
  | {
      kind: "single";
      label: string;
      href: string;
    }
  | {
      kind: "group";
      label: string;
      href: string;
      children: HeaderChild[];
    };

/* =========================================================
   PRIMARY NAVIGATION
========================================================= */

const LINKS: HeaderLink[] = [
  { label: "Home", href: "/" },
  {
    label: "Dharma",
    href: "/temples",
    children: [
      {
        label: "Temples",
        href: "/temples",
        desc: "Discover temples, darshan, aarti & sacred places",
      },
      {
        label: "Puja Services",
        href: "/services",
        desc: "Book puja, seva and traditional ceremonies",
      },
      {
        label: "Pandits",
        href: "/pandits",
        desc: "Find pandits for puja & spiritual guidance",
      },
      {
        label: "Ashrams",
        href: "/ashrams",
        desc: "Explore spiritual ashrams and learning spaces",
      },
    ],
  },
  {
    label: "Panchang",
    href: "/panchang",
    children: [
      {
        label: "Today's Panchang",
        href: "/panchang",
        desc: "Tithi, Nakshatra, Yoga, Rahukaal & Muhurat",
      },
      {
        label: "Festival Calendar",
        href: "/calendar",
        desc: "Festivals, Ekadashi, Purnima, Amavasya & vrat",
      },
      {
        label: "Today's Rashifal",
        href: "/rashifal",
        desc: "Personal daily guidance for all 12 Rashis",
      },
      {
        label: "Kundli",
        href: "/kundli",
        desc: "Birth chart, Lagna, planets, houses & Dasha",
      },
      {
        label: "Gochar",
        href: "/gochar",
        desc: "Planetary transits and their influence",
      },
    ],
  },
  {
    label: "Yatra",
    href: "/packages",
    children: [
      {
        label: "Yatra Packages",
        href: "/packages",
        desc: "Plan spiritual journeys across Bharat",
      },
      {
        label: "Spiritual Places",
        href: "/spiritual-places",
        desc: "Jyotirlingas, Char Dham, sacred cities & dham",
      },
      {
        label: "Events",
        href: "/events",
        desc: "Spiritual festivals, yatras & special events",
      },
      {
        label: "Gallery",
        href: "/gallery",
        desc: "Temples, aarti, festivals & yatra moments",
      },
      {
        label: "Videos",
        href: "/videos",
        desc: "Darshan, katha, aarti & spiritual travel videos",
      },
    ],
  },
  {
    label: "Learn",
    href: "/courses",
    children: [
      {
        label: "Courses",
        href: "/courses",
        desc: "Learn spiritual and traditional subjects",
      },
    ],
  },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

const PANCHANG_PATHS = [
  "/panchang",
  "/calendar",
  "/rashifal",
  "/kundli",
  "/gochar",
];

const YATRA_PATHS = [
  "/packages",
  "/spiritual-places",
  "/events",
  "/gallery",
  "/videos",
];

const DHARMA_PATHS = [
  "/temples",
  "/services",
  "/pandits",
  "/ashrams",
];

const LEARN_PATHS = ["/courses"];

const MOBILE_LINKS: MobileNavItem[] = LINKS.map(
  (link) =>
    link.children?.length
      ? {
          kind: "group" as const,
          label: link.label,
          href: link.href,
          children: link.children,
        }
      : {
          kind: "single" as const,
          label: link.label,
          href: link.href,
        },
);

/* =========================================================
   CHILD ICONS
========================================================= */

function PanchangChildIcon({
  href,
}: {
  href: string;
}) {
  if (href === "/panchang" || href === "/calendar") {
    return <CalendarDays size={16} />;
  }

  if (href === "/rashifal") {
    return <Sparkles size={16} />;
  }

  if (href === "/kundli") {
    return <MoonStar size={16} />;
  }

  if (href === "/gochar") {
    return <WandSparkles size={16} />;
  }

  return <CalendarDays size={16} />;
}

function YatraChildIcon({
  href,
}: {
  href: string;
}) {
  if (href === "/packages") {
    return <Package size={16} />;
  }

  if (href === "/spiritual-places") {
    return <Landmark size={16} />;
  }

  if (href === "/events") {
    return <Bell size={16} />;
  }

  if (href === "/gallery") {
    return <Images size={16} />;
  }

  if (href === "/videos") {
    return <PlayCircle size={16} />;
  }

  return <Compass size={16} />;
}

function DharmaChildIcon({
  href,
}: {
  href: string;
}) {
  if (href === "/temples") {
    return <Landmark size={16} />;
  }

  if (href === "/services") {
    return <Sparkles size={16} />;
  }

  if (href === "/pandits") {
    return <Crown size={16} />;
  }

  if (href === "/ashrams") {
    return <Compass size={16} />;
  }

  return <Compass size={16} />;
}

function LearnChildIcon() {
  return <BookOpen size={16} />;
}

function MobileChildIcon({
  parent,
  href,
}: {
  parent: string;
  href: string;
}) {
  if (parent === "Panchang") {
    return (
      <span className="text-orange-500">
        <PanchangChildIcon href={href} />
      </span>
    );
  }

  if (parent === "Yatra") {
    return (
      <span className="text-orange-500">
        <YatraChildIcon href={href} />
      </span>
    );
  }

  if (parent === "Dharma") {
    return (
      <span className="text-orange-500">
        <DharmaChildIcon href={href} />
      </span>
    );
  }

  if (parent === "Learn") {
    return (
      <span className="text-orange-500">
        <LearnChildIcon />
      </span>
    );
  }

  return null;
}

/* =========================================================
   ROLE DASHBOARD
========================================================= */

function getDashboardLabel(
  role: string | undefined,
): string {
  switch (role) {
    case "pandit":
      return "Pandit Dashboard";
    case "temple_manager":
      return "Temple Dashboard";
    case "ashram_manager":
      return "Ashram Dashboard";
    case "sales":
      return "Sales Dashboard";
    case "super_admin":
      return "Admin Dashboard";
    default:
      return "My Dashboard";
  }
}

function DashboardIcon({
  role,
}: {
  role: string | undefined;
}) {
  switch (role) {
    case "pandit":
      return <Crown size={15} />;
    case "temple_manager":
      return <Landmark size={15} />;
    case "ashram_manager":
      return <Compass size={15} />;
    case "sales":
      return <Compass size={15} />;
    case "super_admin":
      return <Sparkles size={15} />;
    default:
      return <Heart size={15} />;
  }
}

/* =========================================================
   STATIC SEARCH PAGES
========================================================= */

const STATIC_SEARCH_PAGES = [
  {
    label: "Today's Panchang",
    sub: "Tithi, Nakshatra, Rahukaal & Muhurat",
    href: "/panchang",
    keywords: "panchang tithi nakshatra rahukaal muhurat",
    type: "Panchang",
  },
  {
    label: "Festival Calendar",
    sub: "Ekadashi, Purnima, Amavasya & festivals",
    href: "/calendar",
    keywords: "calendar festival ekadashi purnima amavasya vrat",
    type: "Calendar",
  },
  {
    label: "Today's Rashifal",
    sub: "Daily guidance for all 12 Rashis",
    href: "/rashifal",
    keywords: "rashifal rashi horoscope astrology",
    type: "Rashifal",
  },
  {
    label: "Kundli",
    sub: "Birth chart, Lagna, planets, houses & Dasha",
    href: "/kundli",
    keywords: "kundli janam kundli birth chart lagna dasha",
    type: "Kundli",
  },
  {
    label: "Gochar",
    sub: "Planetary transits and their influence",
    href: "/gochar",
    keywords: "gochar transit graha planet shani guru rahu ketu",
    type: "Gochar",
  },
  {
    label: "Temples",
    sub: "Temples, darshan, aarti and sacred places",
    href: "/temples",
    keywords: "temple mandir darshan aarti puja",
    type: "Temple",
  },
  {
    label: "Puja Services",
    sub: "Book puja, seva and traditional ceremonies",
    href: "/services",
    keywords: "puja seva pandit griha bhumi vivah",
    type: "Puja Service",
  },
  {
    label: "Pandits",
    sub: "Find pandits for puja and spiritual guidance",
    href: "/pandits",
    keywords: "pandit priest purohit puja",
    type: "Pandit",
  },
  {
    label: "Ashrams",
    sub: "Spiritual ashrams and learning spaces",
    href: "/ashrams",
    keywords: "ashram spiritual meditation guru stay seva",
    type: "Ashram",
  },
  {
    label: "Events",
    sub: "Spiritual festivals, yatras and special events",
    href: "/events",
    keywords: "events utsav festival yatra spiritual",
    type: "Event",
  },
  {
    label: "Courses",
    sub: "Spiritual and traditional learning",
    href: "/courses",
    keywords: "course learning vedic spiritual astrology",
    type: "Course",
  },
  {
    label: "About DivyaDhara",
    sub: "Mission, trust, verification and seva philosophy",
    href: "/about",
    keywords: "about divyadhara mission trust verification seva",
    type: "About",
  },
  {
    label: "Contact DivyaDhara",
    sub: "Seva desk, WhatsApp, phone and office",
    href: "/contact",
    keywords: "contact phone whatsapp office seva desk address",
    type: "Contact",
  },
];

function SearchResultIcon({
  type,
}: {
  type: string;
}) {
  switch (type) {
    case "Rashifal":
      return <Sparkles size={15} />;
    case "Kundli":
      return <MoonStar size={15} />;
    case "Calendar":
    case "Panchang":
      return <CalendarDays size={15} />;
    case "Yatra":
      return <MapPinned size={15} />;
    case "Spiritual Place":
    case "Temple":
      return <Landmark size={15} />;
    case "Puja Service":
      return <Sparkles size={15} />;
    case "Pandit":
      return <Crown size={15} />;
    case "Ashram":
      return <Compass size={15} />;
    case "Event":
      return <Bell size={15} />;
    case "Course":
      return <BookOpen size={15} />;
    case "About":
      return <Heart size={15} />;
    case "Contact":
      return <MessageCircle size={15} />;
    default:
      return <Search size={15} />;
  }
}

/* =========================================================
   HEADER
========================================================= */

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  const { user } = useApp();
  const loc = useLocation();
  const nav = useNavigate();

  const dashboardPath = user
    ? getDashboardPathForRole(user.role)
    : "/login";

  const dashboardLabel = user
    ? getDashboardLabel(user.role)
    : "Login";

  const dashboardFirstName = user?.name?.trim()
    ? user.name.trim().split(/\s+/)[0]
    : "Account";

  useEffect(() => {
    const handleScroll = () =>
      setScrolled(window.scrollY > 24);

    handleScroll();

    window.addEventListener(
      "scroll",
      handleScroll,
      { passive: true },
    );

    return () =>
      window.removeEventListener(
        "scroll",
        handleScroll,
      );
  }, []);

  useEffect(() => {
    setMobile(false);
    setSearchOpen(false);
    setQ("");
  }, [loc.pathname]);

  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    if (mobile || searchOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [mobile, searchOpen]);

  useEffect(() => {
    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key !== "Escape") {
        return;
      }

      setMobile(false);
      setSearchOpen(false);
    };

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
  }, []);

  const isPanchangActive =
    PANCHANG_PATHS.some(
      (path) =>
        loc.pathname === path ||
        loc.pathname.startsWith(
          `${path}/`,
        ),
    );

  const isYatraActive =
    YATRA_PATHS.some(
      (path) =>
        loc.pathname === path ||
        loc.pathname.startsWith(
          `${path}/`,
        ),
    );

  const isDharmaActive =
    DHARMA_PATHS.some(
      (path) =>
        loc.pathname === path ||
        loc.pathname.startsWith(
          `${path}/`,
        ),
    );

  const isLearnActive =
    LEARN_PATHS.some(
      (path) =>
        loc.pathname === path ||
        loc.pathname.startsWith(
          `${path}/`,
        ),
    );

  const isPathActive = (href: string) => {
    if (href === "/") {
      return loc.pathname === "/";
    }

    return (
      loc.pathname === href ||
      loc.pathname.startsWith(
        `${href}/`,
      )
    );
  };

  const isChildActive = (href: string) =>
    loc.pathname === href ||
    loc.pathname.startsWith(
      `${href}/`,
    );

  const results = useMemo<SearchResult[]>(
    () => {
      const searchTerm =
        q.trim().toLowerCase();

      if (searchTerm.length < 2) {
        return [];
      }

      const searchResults: SearchResult[] =
        [];

      TEMPLES.filter((temple) =>
        [
          temple.name,
          temple.city,
          temple.state,
          temple.category.join(" "),
          temple.sanskrit,
          temple.summary,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm),
      )
        .slice(0, 4)
        .forEach((temple) => {
          searchResults.push({
            label: temple.name,
            sub: `${temple.city}, ${temple.state}`,
            href: `/temples/${temple.slug}`,
            type: "Temple",
          });
        });

      SERVICES.filter((service) =>
        [
          service.name,
          service.category,
          service.tagline,
          service.duration,
          service.price,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm),
      )
        .slice(0, 4)
        .forEach((service) => {
          searchResults.push({
            label: service.name,
            sub: `${service.category} · ${service.duration}`,
            href: `/services/${service.slug}`,
            type: "Puja Service",
          });
        });

      PLACES.filter((place) =>
        [
          place.name,
          place.state,
          place.type,
          place.bestTime,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm),
      )
        .slice(0, 3)
        .forEach((place) => {
          searchResults.push({
            label: place.name,
            sub: `${place.type} · ${place.state}`,
            href: `/spiritual-places/${place.slug}`,
            type: "Spiritual Place",
          });
        });

      PACKAGES.filter((item) =>
        [
          item.name,
          item.destination,
          item.duration,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm),
      )
        .slice(0, 3)
        .forEach((item) => {
          searchResults.push({
            label: item.name,
            sub: `${item.destination} · ${item.duration}`,
            href: `/packages/${item.slug}`,
            type: "Yatra",
          });
        });

      STATIC_SEARCH_PAGES.filter((item) =>
        [
          item.label,
          item.sub,
          item.keywords,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm),
      )
        .slice(0, 6)
        .forEach((item) => {
          searchResults.push({
            label: item.label,
            sub: item.sub,
            href: item.href,
            type: item.type,
          });
        });

      const seen = new Set<string>();

      return searchResults.filter((item) => {
        const key =
          `${item.href}|${item.label}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    },
    [q],
  );

  const openSearch = () => {
    setMobile(false);
    setSearchOpen(true);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQ("");
  };

  const openSearchResult = (href: string) => {
    closeSearch();
    nav(href);
  };

  const generalWhatsappHref = waLink(
    "Namaste DivyaDhara! 🙏 I need guidance for darshan, puja, pandit, Ashram, yatra or spiritual learning.",
  );

  return (
    <>
      {/* ===================================================
          TRUST STRIP
      ==================================================== */}

      <div className="bg-linear-to-r from-saffron-900 via-saffron-700 to-saffron-900 text-center text-[12px] font-medium tracking-wide text-amber-100">
        <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5">
          <Flame
            size={13}
            className="diya-glow shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <span className="font-sanskrit text-[13px]">
            ॥ सर्वे भवन्तु सुखिनः ॥
          </span>
          <span className="hidden text-amber-200/90 sm:inline">
            Trusted guidance for darshan,
            puja, pandits, Ashrams & yatras
          </span>
        </p>
      </div>

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header
        className={cx(
          "sticky top-0 z-50 transition-all duration-300",
          scrolled
            ? "glass-warm border-b border-orange-900/10 shadow-[0_10px_40px_-15px_rgba(154,52,18,0.4)]"
            : "border-b border-orange-900/5 bg-cream-50/95",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 md:px-6 lg:px-8">
          <Link
            to="/"
            className="group flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
            aria-label="DivyaDhara home"
          >
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-linear-to-br from-orange-600 via-orange-700 to-saffron-900 shadow-lg shadow-orange-600/30 transition group-hover:scale-105">
              <span className="font-sanskrit text-2xl leading-none text-amber-100">
                ॐ
              </span>
              <span
                className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-amber-300/40"
                aria-hidden="true"
              />
            </span>

            <span className="leading-tight">
              <span className="font-display block text-xl font-bold tracking-tight text-[#2a1a10]">
                दिव्य{" "}
                <span className="text-gradient-saffron">
                  धारा
                </span>
              </span>
              <span className="block text-[12px] font-semibold uppercase text-orange-700/80">
                पवित्र भारत यात्रा
              </span>
            </span>
          </Link>

          <nav
            className="hidden items-center gap-0.5 xl:flex"
            aria-label="Primary navigation"
          >
            {LINKS.map((link) => {
              const dropdownActive =
                Boolean(
                  link.children?.some(
                    (child) =>
                      isChildActive(
                        child.href,
                      ),
                  ),
                );

              const active =
                link.label === "Panchang"
                  ? isPanchangActive
                  : link.label === "Yatra"
                    ? isYatraActive
                    : link.label === "Dharma"
                      ? isDharmaActive
                      : link.label === "Learn"
                        ? isLearnActive
                        : isPathActive(
                            link.href,
                          );

              const expanded =
                Boolean(link.children);

              return (
                <div
                  key={link.label}
                  className="group relative"
                >
                  <NavLink
                    to={link.href}
                    aria-haspopup={
                      expanded
                        ? "menu"
                        : undefined
                    }
                    aria-expanded={
                      expanded
                        ? dropdownActive
                        : undefined
                    }
                    className={({ isActive }) =>
                      cx(
                        "flex items-center gap-1 rounded-full px-3 py-2 text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2",
                        active ||
                          dropdownActive ||
                          isActive
                          ? "bg-orange-100 text-orange-900"
                          : "text-stone-700 hover:bg-orange-50 hover:text-orange-900",
                      )
                    }
                  >
                    {link.label}
                    {link.children && (
                      <ChevronDown
                        size={13}
                        className="opacity-60 transition group-hover:rotate-180 group-focus-within:rotate-180"
                        aria-hidden="true"
                      />
                    )}
                  </NavLink>

                  {link.children && (
                    <div className="invisible absolute left-0 top-full w-80 translate-y-2 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                      <div
                        className="overflow-hidden rounded-2xl border border-orange-900/10 bg-white p-2 shadow-2xl shadow-orange-900/15"
                        role="menu"
                      >
                        {link.children.map(
                          (child) => {
                            const childActive =
                              isChildActive(
                                child.href,
                              );

                            return (
                              <Link
                                key={child.href}
                                to={child.href}
                                role="menuitem"
                                className={cx(
                                  "block rounded-xl px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-inset",
                                  childActive
                                    ? "bg-orange-50"
                                    : "hover:bg-orange-50",
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={cx(
                                      "mt-0.5 shrink-0",
                                      childActive
                                        ? "text-orange-700"
                                        : "text-orange-500",
                                    )}
                                  >
                                    {link.label ===
                                    "Panchang" ? (
                                      <PanchangChildIcon
                                        href={
                                          child.href
                                        }
                                      />
                                    ) : link.label ===
                                      "Yatra" ? (
                                      <YatraChildIcon
                                        href={
                                          child.href
                                        }
                                      />
                                    ) : link.label ===
                                      "Dharma" ? (
                                      <DharmaChildIcon
                                        href={
                                          child.href
                                        }
                                      />
                                    ) : (
                                      <LearnChildIcon />
                                    )}
                                  </span>

                                  <span className="min-w-0">
                                    <span
                                      className={cx(
                                        "block text-sm font-bold",
                                        childActive
                                          ? "text-orange-800"
                                          : "text-stone-800",
                                      )}
                                    >
                                      {
                                        child.label
                                      }
                                    </span>
                                    {child.desc && (
                                      <span className="mt-0.5 block text-xs text-stone-500">
                                        {
                                          child.desc
                                        }
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </Link>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openSearch}
              aria-label="Search DivyaDhara"
              aria-expanded={searchOpen}
              className="grid h-10 w-10 place-items-center rounded-full border border-orange-900/15 bg-white text-stone-700 transition hover:border-orange-500 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
            >
              <Search
                size={17}
                aria-hidden="true"
              />
            </button>

            <a
              href={generalWhatsappHref}
              target="_blank"
              rel="noreferrer"
              className="btn-saffron hidden items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 sm:inline-flex"
            >
              <MessageCircle
                size={15}
                aria-hidden="true"
              />
              WhatsApp
            </a>

            <Link
              to={dashboardPath}
              title={
                user
                  ? dashboardLabel
                  : "Login"
              }
              aria-label={
                user
                  ? dashboardLabel
                  : "Login"
              }
              className="hidden items-center gap-1.5 rounded-full border border-orange-700/25 bg-orange-50 px-4 py-2.5 text-[13px] font-bold text-orange-900 transition hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 sm:inline-flex"
            >
              {user ? (
                <DashboardIcon role={user.role} />
              ) : (
                <User size={15} />
              )}
              <span className="max-w-28 truncate">
                {user
                  ? dashboardFirstName
                  : "Login"}
              </span>
            </Link>

            <button
              type="button"
              onClick={() =>
                setMobile(true)
              }
              aria-label="Open navigation menu"
              aria-expanded={mobile}
              className="grid h-10 w-10 place-items-center rounded-full bg-[#2a1a10] text-amber-100 transition hover:bg-[#3a2415] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 xl:hidden"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ===================================================
          MOBILE DRAWER
      ==================================================== */}

      <AnimatePresence>
        {mobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm xl:hidden"
            onClick={() =>
              setMobile(false)
            }
          >
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 260,
              }}
              onClick={(event) =>
                event.stopPropagation()
              }
              className="absolute right-0 top-0 flex h-full w-[88%] max-w-sm flex-col overflow-hidden bg-cream-50 shadow-2xl"
              aria-label="Mobile navigation"
              aria-modal="true"
              role="dialog"
            >
              <div className="relative overflow-hidden bg-linear-to-br from-saffron-900 via-saffron-700 to-orange-600 px-6 pb-8 pt-6 text-white">
                <div
                  className="mandala-bg absolute inset-0 opacity-20"
                  aria-hidden="true"
                />

                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="font-sanskrit text-3xl text-amber-200">
                      ॐ
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold">
                      DivyaDhara
                    </p>
                    <p className="text-xs uppercase tracking-[0.25em] text-amber-200/90">
                      Sacred Bharat Yatra
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setMobile(
                        false,
                      )
                    }
                    aria-label="Close menu"
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <nav
                className="flex-1 overflow-y-auto px-4 py-4"
                aria-label="Mobile navigation links"
              >
                {MOBILE_LINKS.map(
                  (item) => {
                    if (
                      item.kind ===
                      "single"
                    ) {
                      const active =
                        isPathActive(
                          item.href,
                        );

                      return (
                        <NavLink
                          key={`${item.label}-${item.href}`}
                          to={item.href}
                          onClick={() =>
                            setMobile(
                              false,
                            )
                          }
                          className={() =>
                            cx(
                              "mb-1 flex items-center justify-between rounded-xl px-4 py-3 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                              active
                                ? "bg-orange-100 text-orange-900"
                                : "text-stone-700 hover:bg-orange-50",
                            )
                          }
                        >
                          <span>
                            {item.label}
                          </span>
                          <span
                            className="text-orange-400"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </NavLink>
                      );
                    }

                    const groupActive =
                      isPathActive(
                        item.href,
                      ) ||
                      item.children.some(
                        (child) =>
                          isChildActive(
                            child.href,
                          ),
                      );

                    return (
                      <div
                        key={`${item.label}-${item.href}`}
                        className="mb-2"
                      >
                        <NavLink
                          to={item.href}
                          onClick={() =>
                            setMobile(
                              false,
                            )
                          }
                          className={() =>
                            cx(
                              "mb-1 flex items-center justify-between rounded-xl px-4 py-3 text-[15px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                              groupActive
                                ? "bg-orange-100 text-orange-900"
                                : "text-stone-800 hover:bg-orange-50",
                            )
                          }
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="text-orange-600"
                              aria-hidden="true"
                            >
                              {item.label ===
                              "Dharma" ? (
                                <Landmark size={17} />
                              ) : item.label ===
                                "Panchang" ? (
                                <CalendarDays
                                  size={17}
                                />
                              ) : item.label ===
                                "Yatra" ? (
                                <MapPinned
                                  size={17}
                                />
                              ) : (
                                <BookOpen
                                  size={17}
                                />
                              )}
                            </span>
                            {item.label}
                          </span>

                          <span
                            className="text-orange-400"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        </NavLink>

                        <div className="ml-2 space-y-1 border-l-2 border-orange-100 pl-2">
                          {item.children.map(
                            (child) => {
                              const active =
                                isChildActive(
                                  child.href,
                                );

                              return (
                                <NavLink
                                  key={
                                    child.href
                                  }
                                  to={
                                    child.href
                                  }
                                  onClick={() =>
                                    setMobile(
                                      false,
                                    )
                                  }
                                  className={() =>
                                    cx(
                                      "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                                      active
                                        ? "bg-orange-50 text-orange-900"
                                        : "text-stone-600 hover:bg-orange-50 hover:text-orange-800",
                                    )
                                  }
                                >
                                  <span className="flex min-w-0 items-center gap-2.5">
                                    <MobileChildIcon
                                      parent={
                                        item.label
                                      }
                                      href={
                                        child.href
                                      }
                                    />
                                    <span className="truncate">
                                      {
                                        child.label
                                      }
                                    </span>
                                  </span>
                                  <span
                                    className="text-xs text-orange-300"
                                    aria-hidden="true"
                                  >
                                    →
                                  </span>
                                </NavLink>
                              );
                            },
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </nav>

              <div className="space-y-2 border-t border-orange-900/10 p-4">
                <button
                  type="button"
                  onClick={() => {
                    setMobile(
                      false,
                    );
                    openSearch();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-900/15 bg-white px-4 py-3.5 font-bold text-stone-700 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <Search size={17} />
                  Search DivyaDhara
                </button>

                <a
                  href={
                    generalWhatsappHref
                  }
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    setMobile(
                      false,
                    )
                  }
                  className="btn-saffron flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2"
                >
                  <MessageCircle
                    size={17}
                  />
                  WhatsApp Us
                </a>

                <Link
                  to={dashboardPath}
                  onClick={() =>
                    setMobile(
                      false,
                    )
                  }
                  className="flex items-center justify-center gap-2 rounded-2xl border border-orange-700/25 bg-orange-50 px-4 py-3.5 font-bold text-orange-900 transition hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  {user ? (
                    <DashboardIcon
                      role={user.role}
                    />
                  ) : (
                    <User size={17} />
                  )}
                  {user
                    ? dashboardLabel
                    : "Login"}
                </Link>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================
          SEARCH OVERLAY
      ==================================================== */}

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 bg-char-900/60 p-4 backdrop-blur-sm"
            onClick={closeSearch}
            role="dialog"
            aria-modal="true"
            aria-label="DivyaDhara site search"
          >
            <motion.div
              initial={{
                y: -24,
                opacity: 0,
              }}
              animate={{
                y: 0,
                opacity: 1,
              }}
              exit={{
                y: -24,
                opacity: 0,
              }}
              onClick={(event) =>
                event.stopPropagation()
              }
              className="mx-auto mt-[8vh] max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-orange-900/10 px-5 py-4">
                <Search
                  size={19}
                  className="text-orange-600"
                  aria-hidden="true"
                />

                <input
                  autoFocus
                  value={q}
                  onChange={(event) =>
                    setQ(
                      event.target.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      const first =
                        results[0];

                      if (first) {
                        openSearchResult(
                          first.href,
                        );
                      }
                    }

                    if (
                      event.key ===
                      "Escape"
                    ) {
                      closeSearch();
                    }
                  }}
                  placeholder="Search temples, puja, Ashrams, yatras, Panchang, Rashifal, Kundli…"
                  className="w-full bg-transparent text-[15px] outline-none placeholder:text-stone-400"
                  aria-label="Search DivyaDhara"
                  role="searchbox"
                />

                <button
                  type="button"
                  onClick={closeSearch}
                  aria-label="Close search"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 transition hover:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <X size={16} />
                </button>
              </div>

              <div
                className="max-h-[50vh] overflow-y-auto p-3"
                aria-live="polite"
              >
                {q.trim().length < 2 ? (
                  <div className="px-3 py-6 text-center text-sm text-stone-500">
                    <p
                      className="font-sanskrit text-2xl text-orange-300"
                      aria-hidden="true"
                    >
                      ॐ
                    </p>
                    <p className="mt-2">
                      Try “Kashi”,
                      “Rudrabhishek”,
                      “Char Dham”,
                      “Rashifal”,
                      “Kundli” or
                      “Ashram”…
                    </p>
                  </div>
                ) : results.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-stone-500">
                    No matches found.{" "}
                    <a
                      className="font-bold text-orange-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                      href={waLink(
                        `Namaste DivyaDhara! I searched for "${q}" on the website and need guidance.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ask us on WhatsApp
                    </a>
                    .
                  </p>
                ) : (
                  results.map(
                    (
                      result,
                      index,
                    ) => (
                      <button
                        type="button"
                        key={`${result.href}-${result.label}-${index}`}
                        onClick={() =>
                          openSearchResult(
                            result.href,
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-inset"
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                            <SearchResultIcon
                              type={
                                result.type
                              }
                            />
                          </span>

                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-stone-800">
                              {
                                result.label
                              }
                            </span>

                            <span className="mt-0.5 block text-xs text-stone-500">
                              {
                                result.sub
                              }
                            </span>

                            <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-orange-500">
                              {
                                result.type
                              }
                            </span>
                          </span>
                        </span>

                        <span
                          className="shrink-0 text-orange-500"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      </button>
                    ),
                  )
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-orange-900/10 bg-orange-50/60 px-5 py-3 text-xs text-stone-500">
                <Bell
                  size={13}
                  className="shrink-0 text-orange-600"
                  aria-hidden="true"
                />
                <span>
                  Popular: Temple · Puja ·
                  Ashram · Yatra · Panchang ·
                  Rashifal · Kundli · Gochar
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
