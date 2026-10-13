
import { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PANDITS } from "../data/content";
import { useSEO } from "../lib/seo";
import { Breadcrumbs, Empty } from "../components/ui";
import { PanditCard } from "../components/cards";
import { PageHero } from "../components/blocks";
import {
  getStates,
  getDistrictsByState,
  getCitiesByDistrict,
  getCityById,
  type IndiaState,
  type IndiaDistrict,
  type IndiaCity,
} from "../lib/locations";

const PAGE_SIZE = 12;

type PanditGeoFields = {
  state?: string;
  district?: string;
  city?: string;
  stateLgdCode?: string;
  districtLgdCode?: string;
  cityId?: string;
};

function getPanditGeo(pandit: (typeof PANDITS)[number]) {
  const geo = pandit as (typeof pandit) & PanditGeoFields;

  const parts = (pandit.location || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    state: geo.state?.trim() || (parts.length >= 2 ? parts[parts.length - 1] : ""),
    district: geo.district?.trim() || "",
    city: geo.city?.trim() || (parts.length > 0 ? parts[0] : ""),
    stateLgdCode: geo.stateLgdCode || "",
    districtLgdCode: geo.districtLgdCode || "",
    cityId: geo.cityId || "",
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function normalizeLocationName(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\\s+/g, " ");
}

function getCityForPandit(geo: ReturnType<typeof getPanditGeo>) {
  if (geo.cityId) return getCityById(geo.cityId);

  const cityName = normalizeLocationName(geo.city);
  if (!cityName) return undefined;

  const stateName = normalizeLocationName(geo.state);
  const matchingState = getStates().find(
    (state) => normalizeLocationName(state.name) === stateName,
  );
  const scopedCities = matchingState
    ? allCities.filter(
        (city) => city.matchedStateLgdCode === matchingState.lgdCode,
      )
    : allCities;

  // Resolve a city by name only when the remaining candidates are unique.
  const matches = scopedCities.filter(
    (city) =>
      normalizeLocationName(city.name) === cityName ||
      normalizeLocationName(city.areaNameOfficial) === cityName,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

const allCities: IndiaCity[] = getStates().length
  ? getStates().flatMap((state) =>
      getDistrictsByState(state.lgdCode).flatMap((district) =>
        getCitiesByDistrict(district.lgdCode),
      ),
    )
  : [];

export default function Pandits() {
  const [q, setQ] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [lang, setLang] = useState("");
  const [spec, setSpec] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const normalizedQuery = q.trim().toLowerCase();

  // Location choices come from the full India location dataset, not only
  // from the currently published Pandit profiles.
  const states = useMemo(() => getStates(), []);

  const selectedStateRecord = useMemo(
    () => states.find((state) => state.lgdCode === selectedState),
    [states, selectedState],
  );

  const districts = useMemo(
    () => (selectedState ? getDistrictsByState(selectedState) : []),
    [selectedState],
  );

  const selectedDistrictRecord = useMemo(
    () => districts.find((district) => district.lgdCode === selectedDistrict),
    [districts, selectedDistrict],
  );

  const cities = useMemo(
    () =>
      selectedDistrict
        ? getCitiesByDistrict(selectedDistrict)
        : selectedState
          ? allCities.filter(
              (city) => city.matchedStateLgdCode === selectedState,
            )
          : [],
    [selectedState, selectedDistrict],
  );

  const langs = useMemo(
    () => uniqueSorted(PANDITS.flatMap((pandit) => pandit.languages)),
    [],
  );

  const specs = useMemo(
    () => uniqueSorted(PANDITS.flatMap((pandit) => pandit.specializations)),
    [],
  );

  const list = useMemo(
    () =>
      PANDITS.filter((pandit) => {
        const geo = getPanditGeo(pandit);
        const matchedCity = getCityForPandit(geo);
        const searchable = [
          pandit.name,
          pandit.location,
          geo.state,
          geo.district,
          geo.city,
          matchedCity?.name,
          matchedCity?.areaNameOfficial,
          ...pandit.specializations,
          ...pandit.pujaTypes,
          ...pandit.languages,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const stateMatches =
          !selectedState ||
          geo.stateLgdCode === selectedState ||
          normalizeLocationName(geo.state) ===
            normalizeLocationName(selectedStateRecord?.name);

        const districtMatches =
          !selectedDistrict ||
          geo.districtLgdCode === selectedDistrict ||
          normalizeLocationName(geo.district) ===
            normalizeLocationName(selectedDistrictRecord?.name) ||
          matchedCity?.matchedDistrictLgdCode === selectedDistrict;

        const cityMatches =
          !selectedCity ||
          geo.cityId === selectedCity ||
          matchedCity?.id === selectedCity ||
          normalizeLocationName(geo.city) ===
            normalizeLocationName(cities.find((city) => city.id === selectedCity)?.name);

        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          stateMatches &&
          districtMatches &&
          cityMatches &&
          (!lang || pandit.languages.includes(lang)) &&
          (!spec || pandit.specializations.includes(spec))
        );
      }),
    [
      normalizedQuery,
      selectedState,
      selectedDistrict,
      selectedCity,
      lang,
      spec,
      selectedStateRecord,
      selectedDistrictRecord,
      cities,
    ],
  );

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, pageCount);

  const paginatedList = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
    return list.slice(startIndex, startIndex + PAGE_SIZE);
  }, [list, safeCurrentPage]);

  const hasFilters = Boolean(
    q || selectedState || selectedDistrict || selectedCity || lang || spec,
  );

  const resetFilters = () => {
    setQ("");
    setSelectedState("");
    setSelectedDistrict("");
    setSelectedCity("");
    setLang("");
    setSpec("");
    setCurrentPage(1);
  };

  const siteOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const panditItems = PANDITS.map((pandit, index) => {
    const profileUrl = siteOrigin
      ? `${siteOrigin}/pandits/${pandit.slug}`
      : `/pandits/${pandit.slug}`;

    return {
      "@type": "ListItem",
      position: index + 1,
      url: profileUrl,
      item: {
        "@type": "Person",
        name: pandit.name,
        url: profileUrl,
        image: pandit.photo,
        description: pandit.about,
        jobTitle: pandit.title,
        knowsLanguage: pandit.languages,
        areaServed: pandit.location,
        knowsAbout: [
          ...new Set([...pandit.specializations, ...pandit.pujaTypes]),
        ],
      },
    };
  });

  useSEO({
    title: "Verified Vedic Pandits for Puja & Rituals | DivyaDhara",
    description:
      "Find verified Vedic pandits for Rudrabhishek, Havan, Vivah, Puja and traditional rituals across India. Browse by state, district, city, language and specialization with transparent service details and booking enquiry.",
    path: "/pandits",
    image: "/images/pandit-portrait.jpeg",
    schema: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": siteOrigin
            ? `${siteOrigin}/pandits#webpage`
            : "/pandits#webpage",
          name: "Verified Vedic Pandits",
          url: siteOrigin ? `${siteOrigin}/pandits` : "/pandits",
          description:
            "Directory of verified Vedic pandits and acharyas for puja, havan, vivah and traditional spiritual services.",
          breadcrumb: {
            "@id": siteOrigin
              ? `${siteOrigin}/pandits#breadcrumb`
              : "/pandits#breadcrumb",
          },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: panditItems,
          },
        },
        {
          "@type": "BreadcrumbList",
          "@id": siteOrigin
            ? `${siteOrigin}/pandits#breadcrumb`
            : "/pandits#breadcrumb",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: siteOrigin ? `${siteOrigin}/` : "/",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Pandits",
              item: siteOrigin ? `${siteOrigin}/pandits` : "/pandits",
            },
          ],
        },
      ],
    },
  });

  return (
    <>
      <PageHero
        eyebrow="Acharyas · Verified"
        title="Pandits You Can Trust"
        sub="Parampara-trained and identity-verified. Personal contact shared only after confirmed booking — your privacy and theirs, protected."
        image="/images/pandit-portrait.jpeg"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Pandits" },
          ]}
        />

        <section
          aria-labelledby="pandit-directory-heading"
          className="mt-7"
        >
          <div className="max-w-4xl">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700">
              Vedic Pandit Directory
            </p>

            <h2
              id="pandit-directory-heading"
              className="mt-2 font-display text-2xl font-semibold tracking-tight text-[#2a1a10] sm:text-3xl"
            >
              Find a Pandit by State, District, City or Language
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600 sm:text-base">
              Explore the currently published Pandit profiles for puja,
              havan, vivah and other traditional services. Filter by
              location, language and specialization, then open a profile
              to review the available information and send a booking enquiry.
            </p>
          </div>

          <div
            className="mt-6 rounded-3xl border border-orange-900/10 bg-white p-4 shadow-[0_10px_35px_rgba(72,36,8,.05)] sm:p-5"
            aria-label="Pandit directory filters"
          >
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-stone-500">
              <SlidersHorizontal
                size={14}
                className="text-orange-600"
                aria-hidden="true"
              />
              Search & filters
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-orange-900/15 bg-[#fffaf5] px-3.5 py-2.5 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10">
                <Search
                  size={16}
                  className="shrink-0 text-orange-600"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search Pandit, city or puja…"
                  className="w-full bg-transparent text-sm outline-none"
                  aria-label="Search pandits by name, location or puja"
                  autoComplete="off"
                  spellCheck={false}
                />

                {q && (
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setCurrentPage(1);
                    }}
                    aria-label="Clear Pandit search"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-orange-100 hover:text-orange-700"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </label>

              <label className="block">
                <span className="sr-only">Filter by state</span>
                <select
                  value={selectedState}
                  onChange={(event) => {
                    setSelectedState(event.target.value);
                    setSelectedDistrict("");
                    setSelectedCity("");
                    setCurrentPage(1);
                  }}
                  className="min-h-11 w-full rounded-xl border border-orange-900/15 bg-[#fffaf5] px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
                  aria-label="Filter pandits by state"
                >
                  <option value="">All States</option>
                  {states.map((state: IndiaState) => (
                    <option key={state.lgdCode} value={state.lgdCode}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">Filter by district</span>
                <select
                  value={selectedDistrict}
                  onChange={(event) => {
                    setSelectedDistrict(event.target.value);
                    setSelectedCity("");
                    setCurrentPage(1);
                  }}
                  disabled={!selectedState || districts.length === 0}
                  className="min-h-11 w-full rounded-xl border border-orange-900/15 bg-[#fffaf5] px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Filter pandits by district"
                >
                  <option value="">All Districts</option>
                  {districts.map((district: IndiaDistrict) => (
                    <option key={district.lgdCode} value={district.lgdCode}>
                      {district.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">Filter by city</span>
                <select
                  value={selectedCity}
                  onChange={(event) => {
                    setSelectedCity(event.target.value);
                    setCurrentPage(1);
                  }}
                  disabled={!selectedState || cities.length === 0}
                  className="min-h-11 w-full rounded-xl border border-orange-900/15 bg-[#fffaf5] px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Filter pandits by city"
                >
                  <option value="">All Cities / Towns</option>
                  {cities.map((city: IndiaCity) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">Filter by language</span>
                <select
                  value={lang}
                  onChange={(event) => {
                    setLang(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="min-h-11 w-full rounded-xl border border-orange-900/15 bg-[#fffaf5] px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
                  aria-label="Filter pandits by language"
                >
                  <option value="">All Languages</option>
                  {langs.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">Filter by specialization</span>
                <select
                  value={spec}
                  onChange={(event) => {
                    setSpec(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="min-h-11 w-full rounded-xl border border-orange-900/15 bg-[#fffaf5] px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
                  aria-label="Filter pandits by specialization"
                >
                  <option value="">All Specializations</option>
                  {specs.map((specialization) => (
                    <option key={specialization} value={specialization}>
                      {specialization}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {hasFilters && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-orange-900/10 pt-4">
                <p className="text-sm text-stone-600">
                  Filters are active. Narrow or reset your search.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="min-h-10 rounded-xl border border-orange-900/15 bg-white px-4 py-2 text-sm font-bold text-orange-700 transition hover:bg-orange-50"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </div>
        </section>

        <section
          aria-labelledby="pandit-results-heading"
          className="mt-7"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700">
                Current listings
              </p>
              <h2
                id="pandit-results-heading"
                className="mt-1 font-display text-xl font-semibold text-[#2a1a10] sm:text-2xl"
              >
                Verified Acharya Profiles
              </h2>
            </div>

            <p
              className="text-sm text-stone-500"
              role="status"
              aria-live="polite"
            >
              Showing{" "}
              <strong className="text-stone-800">
                {list.length === 0
                  ? 0
                  : (safeCurrentPage - 1) * PAGE_SIZE + 1}
                {"–"}
                {Math.min(safeCurrentPage * PAGE_SIZE, list.length)}
              </strong>{" "}
              of <strong className="text-stone-800">{list.length}</strong>{" "}
              {list.length === 1 ? "acharya" : "acharyas"}
            </p>
          </div>

          {list.length === 0 ? (
            <div className="mt-6">
              <Empty
                title="No pandits match your filters"
                sub="Try another state, district, city, language or specialization. You can also reset all filters and search again."
              />
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {paginatedList.map((pandit, index) => (
                  <PanditCard
                    key={pandit.slug}
                    p={pandit}
                    i={(safeCurrentPage - 1) * PAGE_SIZE + index}
                  />
                ))}
              </div>

              {pageCount > 1 && (
                <nav
                  className="mt-8 flex flex-wrap items-center justify-center gap-2"
                  aria-label="Pandit directory pagination"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={safeCurrentPage === 1}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-orange-900/15 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Go to previous page"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    Previous
                  </button>

                  {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                    (page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        aria-label={`Go to page ${page}`}
                        aria-current={
                          safeCurrentPage === page ? "page" : undefined
                        }
                        className={`min-h-10 min-w-10 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                          safeCurrentPage === page
                            ? "border-orange-700 bg-orange-700 text-white"
                            : "border-orange-900/15 bg-white text-stone-700 hover:bg-orange-50"
                        }`}
                      >
                        {page}
                      </button>
                    ),
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(pageCount, page + 1),
                      )
                    }
                    disabled={safeCurrentPage === pageCount}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-orange-900/15 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Go to next page"
                  >
                    Next
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </nav>
              )}
            </>
          )}
        </section>

        <section
          aria-labelledby="verification-heading"
          className="mt-10 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6 text-sm leading-relaxed text-emerald-950 md:p-8"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Trust & verification
          </p>
          <h2
            id="verification-heading"
            className="mt-1 font-display text-xl font-semibold"
          >
            How we verify pandits
          </h2>
          <p className="mt-2">
            Every acharya shares government ID, parampara/guru reference and a
            recorded mantra-path sample reviewed by our Vedic board. We publish
            experience honestly and never fabricate reviews — trust is our real
            prasad.
          </p>
        </section>

        <section
          aria-labelledby="booking-help-heading"
          className="mt-8 rounded-3xl border border-orange-900/10 bg-[#fffaf5] p-6 md:p-8"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700">
            Booking guidance
          </p>
          <h2
            id="booking-help-heading"
            className="mt-1 font-display text-xl font-semibold text-[#2a1a10]"
          >
            Choose the right Pandit for your ritual
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            Compare the published specialization, puja types, languages,
            experience and location shown on each profile. Open the individual
            Pandit page for the complete profile and use the booking enquiry
            to share your city, preferred date and ritual requirements.
          </p>
        </section>
      </main>
    </>
  );
}
