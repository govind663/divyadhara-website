
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { SERVICES } from "../data/services";
import { useSEO } from "../lib/seo";
import { Breadcrumbs, SectionHead, Empty } from "../components/ui";
import { ServiceCard } from "../components/cards";
import { PageHero } from "../components/blocks";

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_OPTIONS = [12, 24, 36] as const;

type SortOption = "featured" | "az";

export default function Services() {
  useSEO({
    title: "Hindu Puja Services & Pandit Booking | Divya Dhara",
    description:
      "Explore Hindu puja services, Griha Pravesh, Rudrabhishek, Vivah, Havan and Satyanarayan Katha. Enquire about ceremony requirements, samagri, pricing and availability.",
    path: "/services",
    image: "/images/puja-thali.jpeg",
  });

  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const categories = useMemo(
    () =>
      [...new Set(SERVICES.map((service) => service.category))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [],
  );

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");

    const results = SERVICES.filter((service) => {
      const matchesCategory =
        !category || service.category === category;

      const searchableText = [
        service.name,
        service.category,
        service.tagline,
        ...(service.description ?? []),
        ...(service.pujaTypes ?? []),
        ...(service.searchTerms ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en");

      return (
        matchesCategory &&
        (!normalizedQuery || searchableText.includes(normalizedQuery))
      );
    });

    if (sortBy === "az") {
      return [...results].sort((a, b) =>
        a.name.localeCompare(b.name, "en", {
          sensitivity: "base",
        }),
      );
    }

    // Preserve the original SERVICES order for the default/featured sort.
    return results;
  }, [category, query, sortBy]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredServices.length / pageSize),
  );

  // Keep the selected page within range if the result count changes.
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedServices = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;

    return filteredServices.slice(startIndex, startIndex + pageSize);
  }, [filteredServices, safeCurrentPage, pageSize]);

  const pageNumbers = useMemo<(number | string)[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
    }

    if (safeCurrentPage >= totalPages - 3) {
      return [
        1,
        "ellipsis-start",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }

    return [
      1,
      "ellipsis-start",
      safeCurrentPage - 1,
      safeCurrentPage,
      safeCurrentPage + 1,
      "ellipsis-end",
      totalPages,
    ];
  }, [safeCurrentPage, totalPages]);

  const firstResult =
    filteredServices.length === 0
      ? 0
      : (safeCurrentPage - 1) * pageSize + 1;

  const lastResult = Math.min(
    safeCurrentPage * pageSize,
    filteredServices.length,
  );

  const hasActiveFilters =
    Boolean(query.trim()) ||
    Boolean(category) ||
    sortBy !== "featured" ||
    pageSize !== DEFAULT_PAGE_SIZE;

  const changeCategory = (value: string) => {
    setCategory(value);
    setCurrentPage(1);
  };

  const changeQuery = (value: string) => {
    setQuery(value);
    setCurrentPage(1);
  };

  const changeSort = (value: SortOption) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  const changePageSize = (value: number) => {
    if (!PAGE_SIZE_OPTIONS.includes(
      value as (typeof PAGE_SIZE_OPTIONS)[number],
    )) {
      return;
    }

    setPageSize(value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setCategory("");
    setQuery("");
    setSortBy("featured");
    setPageSize(DEFAULT_PAGE_SIZE);
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <>
      <PageHero
        eyebrow="Traditional Sevas · Puja & Sanskar"
        title="Sacred Puja Services"
        sub="Discover traditional Hindu ceremonies for your home, family and important life occasions. Explore your requirements and enquire about the right ritual arrangements."
        image="/images/puja-thali.jpeg"
      />

      <main className="min-h-screen bg-[#fbf8f2] text-[#2a1a10]">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-7 sm:px-6 lg:px-8 lg:pb-24">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Puja Services" },
            ]}
          />

          {/* Introduction */}
          <section
            aria-labelledby="services-introduction-heading"
            className="relative mt-8 overflow-hidden rounded-[2rem] border border-[#eadbc3] bg-white p-6 shadow-sm sm:p-9 lg:p-12"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#f5e6ca]/50 blur-3xl"
            />

            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-3xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#ead7b4] bg-[#fff8e9] px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#9a5717]">
                  <Sparkles size={14} aria-hidden="true" />
                  Find your sacred seva
                </span>

                <h2
                  id="services-introduction-heading"
                  className="mt-5 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl"
                >
                  Traditions that honour
                  <span className="block text-[#a95d20]">
                    life’s sacred moments.
                  </span>
                </h2>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
                  From everyday puja to important family sanskars,
                  explore ceremonies by name or category. Share your
                  preferred date, location and tradition to enquire
                  about the arrangements.
                </p>

                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-stone-600">
                  {[
                    "Ritual-specific enquiries",
                    "Samagri guidance",
                    "Date and location enquiries",
                  ].map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-2"
                    >
                      <CheckCircle2
                        size={17}
                        aria-hidden="true"
                        className="shrink-0 text-[#a95d20]"
                      />
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="#service-search"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#722f16] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#8d3e1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2"
                  >
                    Explore services
                    <ArrowDownWideNarrow size={16} aria-hidden="true" />
                  </a>

                  <Link
                    to="/contact"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#eadbc3] bg-white px-5 py-3 text-sm font-bold text-[#722f16] transition hover:bg-[#fbf5e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2"
                  >
                    Ask a question
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="relative flex items-center gap-4 rounded-2xl border border-[#eadbc3] bg-[#fbf5e9] p-5 sm:p-6 lg:min-w-48 lg:flex-col lg:items-start">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#722f16] text-[#ffdfa0]">
                  <Sparkles size={23} aria-hidden="true" />
                </div>

                <div>
                  <p className="font-display text-3xl font-semibold text-[#722f16]">
                    {SERVICES.length}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    Service listings to explore
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Search and filters */}
          <section
            id="service-search"
            aria-labelledby="service-search-heading"
            className="mt-10 scroll-mt-24"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a95d20]">
                  Explore our services
                </p>

                <h2
                  id="service-search-heading"
                  className="mt-2 font-display text-2xl font-semibold sm:text-3xl"
                >
                  Find the right puja for you
                </h2>

                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Search by ceremony, ritual or occasion.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-h-11 items-center gap-2 rounded-full border border-[#eadbc3] bg-white px-3.5 py-2.5 text-xs text-stone-600">
                  <ArrowDownWideNarrow
                    size={15}
                    aria-hidden="true"
                    className="text-[#a95d20]"
                  />

                  <label htmlFor="service-sort">Sort</label>

                  <select
                    id="service-sort"
                    value={sortBy}
                    onChange={(event) =>
                      changeSort(event.target.value as SortOption)
                    }
                    className="max-w-36 cursor-pointer bg-transparent font-semibold text-[#2a1a10] outline-none focus-visible:ring-2 focus-visible:ring-[#bd7b36]"
                  >
                    <option value="featured">Default order</option>
                    <option value="az">Name: A–Z</option>
                  </select>
                </div>

                <div className="flex min-h-11 items-center gap-2 rounded-full border border-[#eadbc3] bg-white px-3.5 py-2.5 text-xs text-stone-600">
                  <label htmlFor="service-page-size">Show</label>

                  <select
                    id="service-page-size"
                    value={pageSize}
                    onChange={(event) =>
                      changePageSize(Number(event.target.value))
                    }
                    className="cursor-pointer bg-transparent font-semibold text-[#2a1a10] outline-none focus-visible:ring-2 focus-visible:ring-[#bd7b36]"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>

                  <span>per page</span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-[#eadbc3] bg-white p-3 shadow-sm sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[#eee4d5] bg-[#fcfaf6] px-4 transition focus-within:border-[#bd7b36] focus-within:ring-2 focus-within:ring-[#bd7b36]/10">
                  <Search
                    size={19}
                    aria-hidden="true"
                    className="shrink-0 text-[#a95d20]"
                  />

                  <input
                    id="service-search-input"
                    type="search"
                    value={query}
                    onChange={(event) => changeQuery(event.target.value)}
                    placeholder="Search Rudrabhishek, Havan, Griha Pravesh..."
                    className="w-full min-w-0 bg-transparent py-2 text-sm text-[#2a1a10] outline-none placeholder:text-stone-400"
                    aria-label="Search puja services"
                    autoComplete="off"
                  />

                  {query && (
                    <button
                      type="button"
                      onClick={() => changeQuery("")}
                      aria-label="Clear search"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-[#f1e6d6] hover:text-[#722f16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20]"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </label>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="min-h-12 rounded-2xl border border-[#eadbc3] px-5 text-sm font-semibold text-[#722f16] transition hover:bg-[#fbf5e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              <div className="mt-4 border-t border-[#f0e8dc] pt-4">
                <p
                  id="service-category-label"
                  className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500"
                >
                  Browse by category
                </p>

                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-labelledby="service-category-label"
                >
                  <button
                    type="button"
                    onClick={() => changeCategory("")}
                    aria-pressed={!category}
                    className={`rounded-full px-4 py-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2 ${
                      !category
                        ? "bg-[#722f16] text-[#ffdfa0] shadow-sm"
                        : "border border-[#eadbc3] bg-white text-stone-600 hover:border-[#bd7b36] hover:text-[#722f16]"
                    }`}
                  >
                    All services
                  </button>

                  {categories.map((item) => {
                    const selected = category === item;

                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() =>
                          changeCategory(selected ? "" : item)
                        }
                        aria-pressed={selected}
                        className={`rounded-full px-4 py-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2 ${
                          selected
                            ? "bg-[#a95d20] text-white shadow-sm"
                            : "border border-[#eadbc3] bg-white text-stone-600 hover:border-[#bd7b36] hover:text-[#722f16]"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Results */}
          <section
            className="mt-8"
            aria-labelledby="service-results-heading"
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p
                  id="service-results-heading"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="text-sm font-semibold text-[#2a1a10]"
                >
                  {filteredServices.length}{" "}
                  {filteredServices.length === 1 ? "service" : "services"}{" "}
                  found
                </p>

                <p className="mt-1 text-xs text-stone-500">
                  {filteredServices.length > 0
                    ? `Showing ${firstResult}–${lastResult} of ${filteredServices.length}`
                    : "Try another search or category"}

                  {category ? ` · ${category}` : ""}
                </p>
              </div>

              <span className="text-xs text-stone-500">
                Select a service to explore its details
              </span>
            </div>

            {filteredServices.length === 0 ? (
              <div className="rounded-3xl border border-[#eadbc3] bg-white px-5 py-10 text-center sm:px-8">
                <Empty
                  title="No matching puja found"
                  sub="Try another search term or clear the filters to explore all service listings."
                />

                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#722f16] px-5 py-3 text-sm font-bold text-[#ffdfa0] transition hover:bg-[#8d3e1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2"
                >
                  View all services
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                  {paginatedServices.map((service, index) => (
                    <div key={service.slug} className="min-w-0">
                      <ServiceCard
                        s={service}
                        i={(safeCurrentPage - 1) * pageSize + index}
                      />
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <nav
                    className="mt-10 rounded-3xl border border-[#eadbc3] bg-white p-4 shadow-sm sm:p-5"
                    aria-label="Service listing pages"
                  >
                    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                      <p className="text-center text-sm text-stone-600 sm:text-left">
                        Page{" "}
                        <span className="font-bold text-[#722f16]">
                          {safeCurrentPage}
                        </span>{" "}
                        of{" "}
                        <span className="font-bold text-[#722f16]">
                          {totalPages}
                        </span>
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => goToPage(safeCurrentPage - 1)}
                          disabled={safeCurrentPage === 1}
                          aria-label="Go to previous page"
                          className="inline-flex h-10 items-center gap-1 rounded-xl border border-[#eadbc3] px-3 text-sm font-semibold text-[#722f16] transition hover:bg-[#fbf5e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft size={17} aria-hidden="true" />
                          <span className="hidden sm:inline">Previous</span>
                        </button>

                        {pageNumbers.map((page) =>
                          typeof page === "string" ? (
                            <span
                              key={page}
                              aria-hidden="true"
                              className="grid h-10 w-7 place-items-center text-sm text-stone-400"
                            >
                              …
                            </span>
                          ) : (
                            <button
                              key={page}
                              type="button"
                              onClick={() => goToPage(page)}
                              aria-label={`Go to page ${page}`}
                              aria-current={
                                safeCurrentPage === page ? "page" : undefined
                              }
                              className={`grid h-10 min-w-10 place-items-center rounded-xl px-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] focus-visible:ring-offset-2 ${
                                safeCurrentPage === page
                                  ? "bg-[#722f16] text-[#ffdfa0] shadow-sm"
                                  : "border border-transparent text-stone-600 hover:border-[#eadbc3] hover:bg-[#fbf5e9]"
                              }`}
                            >
                              {page}
                            </button>
                          ),
                        )}

                        <button
                          type="button"
                          onClick={() => goToPage(safeCurrentPage + 1)}
                          disabled={safeCurrentPage === totalPages}
                          aria-label="Go to next page"
                          className="inline-flex h-10 items-center gap-1 rounded-xl border border-[#eadbc3] px-3 text-sm font-semibold text-[#722f16] transition hover:bg-[#fbf5e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a95d20] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="hidden sm:inline">Next</span>
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </nav>
                )}
              </>
            )}
          </section>

          {/* Booking process */}
          <section
            aria-labelledby="service-booking-process-heading"
            className="mt-20 overflow-hidden rounded-[2rem] bg-[#2a1a10] text-white"
          >
            <div className="relative px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#a95d20]/20 blur-3xl"
              />

              <div className="relative">
                <SectionHead
                  eyebrow="A simple, thoughtful process"
                  title="Your puja booking, step by step"
                />

                <h2
                  id="service-booking-process-heading"
                  className="sr-only"
                >
                  How to arrange a puja booking
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300">
                  Start with your requirements. Confirm the ritual,
                  arrangements and total charges before finalising
                  your booking.
                </p>

                <div className="mt-9 grid gap-4 md:grid-cols-3">
                  {[
                    {
                      number: "01",
                      title: "Share your requirements",
                      description:
                        "Tell us the puja, city, preferred date, language and family tradition.",
                    },
                    {
                      number: "02",
                      title: "Confirm the arrangements",
                      description:
                        "Discuss availability, ceremony details, samagri, pricing and timing.",
                    },
                    {
                      number: "03",
                      title: "Prepare for your ceremony",
                      description:
                        "Proceed once the booking details and arrangements have been confirmed.",
                    },
                  ].map((step) => (
                    <article
                      key={step.number}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 transition hover:border-[#d7a45c]/50 hover:bg-white/[0.08]"
                    >
                      <span className="inline-grid h-11 w-11 place-items-center rounded-xl border border-[#d7a45c]/40 bg-[#d7a45c]/10 font-display text-sm font-bold text-[#f4c979]">
                        {step.number}
                      </span>

                      <h3 className="mt-5 font-display text-xl font-semibold text-[#fff4df]">
                        {step.title}
                      </h3>

                      <p className="mt-3 text-sm leading-6 text-stone-300">
                        {step.description}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-2xl border border-[#d7a45c]/25 bg-black/10 p-5 sm:flex-row sm:items-center sm:p-6">
                  <div>
                    <h3 className="font-display text-xl font-semibold text-[#fff4df]">
                      Looking for a specific ceremony?
                    </h3>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300">
                      Contact us with your requirements for guidance
                      on the next steps.
                    </p>
                  </div>

                  <Link
                    to="/contact"
                    className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#f2c36f] px-6 py-3 text-sm font-bold text-[#392012] transition hover:bg-[#ffda91] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c36f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a1a10]"
                  >
                    Make an enquiry
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <p className="mx-auto mt-7 max-w-3xl text-center text-xs leading-6 text-stone-500">
            Service details, prices, ceremony duration, samagri and
            location availability may vary by ritual and tradition.
            Confirm all arrangements before booking.
          </p>
        </div>
      </main>
    </>
  );
}
