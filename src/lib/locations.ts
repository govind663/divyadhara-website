import statesJson from "../data/india-locations/states.json";
import districtsJson from "../data/india-locations/districts.json";
import citiesJson from "../data/india-locations/cities.json";

/**
 * Divya Dhara — India Location Utilities
 *
 * Dataset contracts:
 * - states.json: code, lgdCode, name, type
 * - districts.json: lgdCode, name, stateLgdCode, stateCensus2011Code,
 *   districtCensus2011Code
 * - cities.json: Census 2011 urban-area records with id, name,
 *   stateCensus2011Code, districtCensus2011Code, townCodeCensus2011
 *
 * Mapping strategy:
 * 1. Prefer an exact, unique Census state + district code match.
 * 2. If that pair is not available in the current LGD file (for example,
 *    historic-state changes), allow a fallback only when BOTH the Census
 *    district code and normalized district name uniquely identify one LGD
 *    district across the complete district dataset.
 * 3. Never guess when a match is missing or ambiguous.
 *
 * Census codes are not LGD IDs. Keep these code systems separate.
 */

export interface IndiaState {
  code: string;
  lgdCode: string;
  name: string;
  type: "state" | "union_territory" | string;
}

export interface IndiaDistrict {
  lgdCode: string;
  name: string;
  nameLocal?: string;
  stateLgdCode: string;
  stateName?: string;
  stateCensus2011Code?: string;
  districtCensus2011Code?: string;
}

export type CityDistrictMatchMethod = "census-pair" | "district-code-name";

export interface IndiaCity {
  id: string;
  name: string;
  type: string;
  administrativeType?: string;
  stateCensus2011Code: string;
  stateNameCensus2011?: string;
  districtCensus2011Code: string;
  districtNameCensus2011?: string;
  subDistrictCensus2011Code?: string;
  subDistrictNameCensus2011?: string;
  townCodeCensus2011?: string;
  areaNameOfficial?: string;
  sourceYear?: number;

  /** Added at runtime only when a safe, unique LGD district match exists. */
  matchedDistrictLgdCode?: string;
  matchedStateLgdCode?: string;
  districtMatchMethod?: CityDistrictMatchMethod;
}

export type CityMappingIssue =
  | "invalid-census-codes"
  | "ambiguous-census-pair"
  | "no-district-match"
  | "ambiguous-district-code-name-match";

export interface UnmappedIndiaCity extends IndiaCity {
  mappingIssue: CityMappingIssue;
}

export interface LocationDataReport {
  totalStates: number;
  totalDistricts: number;
  totalCitiesInSource: number;
  mappedCities: number;
  unmappedCities: number;
  exactCensusPairMappedCities: number;
  fallbackMappedCities: number;
  citiesWithInvalidCensusCodes: number;
  citiesWithAmbiguousCensusPair: number;
  citiesWithAmbiguousFallback: number;
  citiesWithoutDistrictMatch: number;
  districtsWithoutValidCensusCodes: number;
  duplicateStateCodes: number;
  duplicateDistrictLgdCodes: number;
  duplicateCityIds: number;
  mappingRatePercent: number;
}

const statesData = statesJson as IndiaState[];
const citiesData = citiesJson as IndiaCity[];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * The districts JSON may be either:
 * 1. The app-ready array using camelCase keys, or
 * 2. The raw data.gov.in LGD response with the records array and snake_case keys.
 * Normalize both forms so the location helpers do not depend on which file
 * variant was copied into src/data/india-locations/districts.json.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFirstDefined(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function normalizeDistrictRecord(value: unknown): IndiaDistrict | null {
  if (!isRecord(value)) return null;

  const lgdCode = clean(getFirstDefined(value, "lgdCode", "district_code"));
  const name = clean(
    getFirstDefined(value, "name", "district_name_english", "districtNameEnglish")
  );
  const stateLgdCode = clean(
    getFirstDefined(value, "stateLgdCode", "state_code", "stateCode")
  );

  // These fields are required by the location filters.
  if (!lgdCode || !name || !stateLgdCode) return null;

  const nameLocal = clean(
    getFirstDefined(value, "nameLocal", "district_name_local", "districtNameLocal")
  );
  const stateName = clean(
    getFirstDefined(value, "stateName", "state_name_english", "stateNameEnglish")
  );
  const stateCensus2011Code = clean(
    getFirstDefined(value, "stateCensus2011Code", "state_census2011_code")
  );
  const districtCensus2011Code = clean(
    getFirstDefined(value, "districtCensus2011Code", "district_census2011_code")
  );

  return {
    lgdCode,
    name,
    ...(nameLocal ? { nameLocal } : {}),
    stateLgdCode,
    ...(stateName ? { stateName } : {}),
    ...(stateCensus2011Code ? { stateCensus2011Code } : {}),
    ...(districtCensus2011Code ? { districtCensus2011Code } : {}),
  };
}

function normalizeDistricts(data: unknown): IndiaDistrict[] {
  let rawRecords: unknown[] = [];

  if (Array.isArray(data)) {
    rawRecords = data;
  } else if (isRecord(data) && Array.isArray(data.records)) {
    // Raw data.gov.in API response: records are nested inside the envelope.
    rawRecords = data.records;
  }

  return rawRecords
    .map(normalizeDistrictRecord)
    .filter((district): district is IndiaDistrict => district !== null);
}

const districtsData = normalizeDistricts(districtsJson as unknown);

/** Normalize labels for case-insensitive matching/search. */
function normalizeName(value: unknown): string {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Secondary form used only with an exact Census district code. */
function normalizeCompactName(value: unknown): string {
  return normalizeName(value).replace(/\s+/g, "");
}

function normalizeCode(value: unknown): string {
  return clean(value);
}

/**
 * Census source files can use 00/000/NA when a historic/current code
 * relationship is not available. Treat these as placeholders, not IDs.
 */
function isValidCensusCode(value: unknown): boolean {
  const code = normalizeCode(value).toLowerCase();

  return (
    code !== "" &&
    code !== "na" &&
    code !== "n/a" &&
    code !== "000" &&
    code !== "00" &&
    code !== "0" &&
    code !== "null" &&
    code !== "undefined" &&
    code !== "-"
  );
}

function censusPairKey(
  stateCode: unknown,
  districtCode: unknown
): string | null {
  const state = normalizeCode(stateCode);
  const district = normalizeCode(districtCode);

  if (!isValidCensusCode(state) || !isValidCensusCode(district)) {
    return null;
  }

  return `${state}::${district}`;
}

function compareLabels(a: unknown, b: unknown): number {
  return clean(a).localeCompare(clean(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function countDuplicates(values: string[]): number {
  const normalized = values.map((value) => clean(value)).filter(Boolean);
  return normalized.length - new Set(normalized).size;
}

// --------------------------------------------------
// 1. BUILD CACHED LOOKUP INDEXES
// --------------------------------------------------

const districtsByCensusPair = new Map<string, IndiaDistrict[]>();
const districtsByCensusDistrictCode = new Map<string, IndiaDistrict[]>();
const districtsByLgdCode = new Map<string, IndiaDistrict[]>();

for (const district of districtsData) {
  const pairKey = censusPairKey(
    district.stateCensus2011Code,
    district.districtCensus2011Code
  );

  if (pairKey) {
    const pairMatches = districtsByCensusPair.get(pairKey) ?? [];
    pairMatches.push(district);
    districtsByCensusPair.set(pairKey, pairMatches);
  }

  const censusDistrictCode = normalizeCode(district.districtCensus2011Code);
  if (isValidCensusCode(censusDistrictCode)) {
    const codeMatches =
      districtsByCensusDistrictCode.get(censusDistrictCode) ?? [];
    codeMatches.push(district);
    districtsByCensusDistrictCode.set(censusDistrictCode, codeMatches);
  }

  const lgdCode = normalizeCode(district.lgdCode);
  if (lgdCode) {
    const lgdMatches = districtsByLgdCode.get(lgdCode) ?? [];
    lgdMatches.push(district);
    districtsByLgdCode.set(lgdCode, lgdMatches);
  }
}

const statesByCode = new Map<string, IndiaState>();
for (const state of statesData) {
  if (clean(state.code)) statesByCode.set(clean(state.code), state);
  if (clean(state.lgdCode)) statesByCode.set(clean(state.lgdCode), state);
}

// --------------------------------------------------
// 2. SAFE CITY-TO-DISTRICT MATCHING
// --------------------------------------------------

interface CityMappingResult {
  city: IndiaCity;
  mappedCity?: IndiaCity;
  method?: CityDistrictMatchMethod;
  issue?: CityMappingIssue;
}

function mapCityToDistrict(city: IndiaCity): CityMappingResult {
  const pairKey = censusPairKey(
    city.stateCensus2011Code,
    city.districtCensus2011Code
  );

  if (!pairKey) {
    return { city, issue: "invalid-census-codes" };
  }

  const exactMatches = districtsByCensusPair.get(pairKey) ?? [];

  // Exact state + district Census pair always has priority.
  if (exactMatches.length === 1) {
    const district = exactMatches[0];
    return {
      city,
      method: "census-pair",
      mappedCity: {
        ...city,
        matchedDistrictLgdCode: normalizeCode(district.lgdCode),
        matchedStateLgdCode: normalizeCode(district.stateLgdCode),
        districtMatchMethod: "census-pair",
      },
    };
  }

  // An ambiguous exact pair must not be bypassed with a looser fallback.
  if (exactMatches.length > 1) {
    return { city, issue: "ambiguous-census-pair" };
  }

  // Safe legacy fallback for state reorganizations: district Census code
  // AND district name must uniquely identify a current LGD district.
  const districtCode = normalizeCode(city.districtCensus2011Code);
  const compactDistrictName = normalizeCompactName(city.districtNameCensus2011);

  if (!isValidCensusCode(districtCode) || !compactDistrictName) {
    return { city, issue: "invalid-census-codes" };
  }

  const candidates = (districtsByCensusDistrictCode.get(districtCode) ?? []).filter(
    (district) =>
      normalizeCompactName(district.name) === compactDistrictName
  );

  if (candidates.length === 1) {
    const district = candidates[0];
    return {
      city,
      method: "district-code-name",
      mappedCity: {
        ...city,
        matchedDistrictLgdCode: normalizeCode(district.lgdCode),
        matchedStateLgdCode: normalizeCode(district.stateLgdCode),
        districtMatchMethod: "district-code-name",
      },
    };
  }

  if (candidates.length > 1) {
    return { city, issue: "ambiguous-district-code-name-match" };
  }

  return { city, issue: "no-district-match" };
}

const mappingResults: CityMappingResult[] = citiesData.map(mapCityToDistrict);
const mappedCities: IndiaCity[] = mappingResults.flatMap((result) =>
  result.mappedCity ? [result.mappedCity] : []
);
const unmappedCities: UnmappedIndiaCity[] = mappingResults.flatMap((result) =>
  result.issue ? [{ ...result.city, mappingIssue: result.issue }] : []
);

function sortCities(cities: IndiaCity[]): IndiaCity[] {
  return [...cities].sort((a, b) => {
    const byName = compareLabels(a.name, b.name);
    if (byName !== 0) return byName;

    const byState = compareLabels(a.stateNameCensus2011, b.stateNameCensus2011);
    if (byState !== 0) return byState;

    const byDistrict = compareLabels(
      a.districtNameCensus2011,
      b.districtNameCensus2011
    );
    if (byDistrict !== 0) return byDistrict;

    return compareLabels(a.id, b.id);
  });
}

// --------------------------------------------------
// 3. STATES AND UNION TERRITORIES
// --------------------------------------------------

export function getStates(): IndiaState[] {
  return [...statesData].sort((a, b) => compareLabels(a.name, b.name));
}

/** Accepts a state slug, LGD code, or state/UT name. */
export function getStateByCode(
  stateCode: string
): IndiaState | undefined {
  const value = clean(stateCode);
  if (!value) return undefined;

  const directMatch = statesByCode.get(value);
  if (directMatch) return directMatch;

  const normalized = normalizeName(value);
  return statesData.find(
    (state) =>
      normalizeName(state.name) === normalized ||
      normalizeName(state.code) === normalized
  );
}

// --------------------------------------------------
// 4. DISTRICTS
// --------------------------------------------------

export function getDistricts(): IndiaDistrict[] {
  return [...districtsData].sort((a, b) => compareLabels(a.name, b.name));
}

export function getDistrictsByState(stateCode: string): IndiaDistrict[] {
  const state = getStateByCode(stateCode);
  if (!state) return [];

  return districtsData
    .filter(
      (district) =>
        normalizeCode(district.stateLgdCode) === normalizeCode(state.lgdCode)
    )
    .sort((a, b) => compareLabels(a.name, b.name));
}

export function getDistrictByLgdCode(
  districtLgdCode: string
): IndiaDistrict | undefined {
  const code = normalizeCode(districtLgdCode);
  const matches = districtsByLgdCode.get(code) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

/** Returns a district only for one exact Census state/district pair. */
export function getDistrictByCensusCodes(
  stateCensus2011Code: string,
  districtCensus2011Code: string
): IndiaDistrict | undefined {
  const key = censusPairKey(stateCensus2011Code, districtCensus2011Code);
  if (!key) return undefined;

  const matches = districtsByCensusPair.get(key) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

export function getDistrictsByName(
  districtName: string,
  stateCode?: string
): IndiaDistrict[] {
  const normalizedName = normalizeName(districtName);
  if (!normalizedName) return [];

  const state = stateCode ? getStateByCode(stateCode) : undefined;
  if (stateCode && !state) return [];

  return districtsData
    .filter((district) => {
      const sameName =
        normalizeName(district.name) === normalizedName ||
        normalizeName(district.nameLocal) === normalizedName;
      const sameState =
        !state || normalizeCode(district.stateLgdCode) === normalizeCode(state.lgdCode);
      return sameName && sameState;
    })
    .sort((a, b) => compareLabels(a.name, b.name));
}

// --------------------------------------------------
// 5. CITIES / TOWNS
// --------------------------------------------------

/** Returns only records safely mapped to one current LGD district. */
export function getCities(): IndiaCity[] {
  return sortCities(mappedCities);
}

export function getCitiesByDistrict(districtLgdCode: string): IndiaCity[] {
  const code = normalizeCode(districtLgdCode);
  if (!code) return [];

  return sortCities(
    mappedCities.filter(
      (city) => normalizeCode(city.matchedDistrictLgdCode) === code
    )
  );
}

/** Accepts a state slug, LGD code, or state/UT name. */
export function getCitiesByState(stateCode: string): IndiaCity[] {
  const state = getStateByCode(stateCode);
  if (!state) return [];

  return sortCities(
    mappedCities.filter(
      (city) => normalizeCode(city.matchedStateLgdCode) === normalizeCode(state.lgdCode)
    )
  );
}

/** Looks up an ID only among cities with a safe district mapping. */
export function getCityById(cityId: string): IndiaCity | undefined {
  const id = clean(cityId);
  if (!id) return undefined;
  return mappedCities.find((city) => clean(city.id) === id);
}

/**
 * Returns source records that could not be mapped safely.
 * Useful for QA/admin tooling; these are intentionally excluded from
 * state/district-filtered city results.
 */
export function getUnmappedCities(): UnmappedIndiaCity[] {
  return [...unmappedCities].sort((a, b) => {
    const byDistrict = compareLabels(
      a.districtNameCensus2011,
      b.districtNameCensus2011
    );
    return byDistrict || compareLabels(a.name, b.name);
  });
}

/** Returns matching city records; supports state and LGD district filters. */
export function searchCities(
  query: string,
  options?: {
    stateCode?: string;
    districtLgdCode?: string;
    limit?: number;
  }
): IndiaCity[] {
  const searchTerm = normalizeName(query);
  if (!searchTerm) return [];

  const requestedStateCode = clean(options?.stateCode);
  const requestedDistrictCode = clean(options?.districtLgdCode);
  const rawLimit = options?.limit;
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit)
      ? Math.max(1, Math.floor(rawLimit))
      : 50;

  let results = mappedCities;

  if (requestedStateCode) {
    const state = getStateByCode(requestedStateCode);
    if (!state) return [];

    results = results.filter(
      (city) => normalizeCode(city.matchedStateLgdCode) === normalizeCode(state.lgdCode)
    );
  }

  if (requestedDistrictCode) {
    const district = getDistrictByLgdCode(requestedDistrictCode);
    if (!district) return [];

    results = results.filter(
      (city) =>
        normalizeCode(city.matchedDistrictLgdCode) ===
        normalizeCode(district.lgdCode)
    );
  }

  const queryTokens = searchTerm.split(" ").filter(Boolean);

  return sortCities(
    results.filter((city) => {
      const searchableValues = [
        city.name,
        city.areaNameOfficial,
        city.type,
        city.administrativeType,
        city.subDistrictNameCensus2011,
        city.districtNameCensus2011,
        city.stateNameCensus2011,
        city.id,
        city.townCodeCensus2011,
      ].map(normalizeName);

      // Each query token may match a different field, so a search such as
      // "Port Blair Andaman" can still find Port Blair.
      return queryTokens.every((token) =>
        searchableValues.some((value) => value.includes(token))
      );
    })
  ).slice(0, limit);
}

// --------------------------------------------------
// 6. DATA QUALITY REPORT
// --------------------------------------------------

export function getLocationDataReport(): LocationDataReport {
  const exactCensusPairMappedCities = mappingResults.filter(
    (result) => result.method === "census-pair"
  ).length;
  const fallbackMappedCities = mappingResults.filter(
    (result) => result.method === "district-code-name"
  ).length;
  const citiesWithInvalidCensusCodes = mappingResults.filter(
    (result) => result.issue === "invalid-census-codes"
  ).length;
  const citiesWithAmbiguousCensusPair = mappingResults.filter(
    (result) => result.issue === "ambiguous-census-pair"
  ).length;
  const citiesWithAmbiguousFallback = mappingResults.filter(
    (result) => result.issue === "ambiguous-district-code-name-match"
  ).length;
  const citiesWithoutDistrictMatch = mappingResults.filter(
    (result) => result.issue === "no-district-match"
  ).length;

  const districtsWithoutValidCensusCodes = districtsData.filter(
    (district) =>
      !censusPairKey(
        district.stateCensus2011Code,
        district.districtCensus2011Code
      )
  ).length;

  const totalCitiesInSource = citiesData.length;
  const mappedCount = mappedCities.length;

  return {
    totalStates: statesData.length,
    totalDistricts: districtsData.length,
    totalCitiesInSource,
    mappedCities: mappedCount,
    unmappedCities: totalCitiesInSource - mappedCount,
    exactCensusPairMappedCities,
    fallbackMappedCities,
    citiesWithInvalidCensusCodes,
    citiesWithAmbiguousCensusPair,
    citiesWithAmbiguousFallback,
    citiesWithoutDistrictMatch,
    districtsWithoutValidCensusCodes,
    duplicateStateCodes: countDuplicates(statesData.map((state) => state.lgdCode)),
    duplicateDistrictLgdCodes: countDuplicates(
      districtsData.map((district) => district.lgdCode)
    ),
    duplicateCityIds: countDuplicates(citiesData.map((city) => city.id)),
    mappingRatePercent:
      totalCitiesInSource === 0
        ? 0
        : Number(((mappedCount / totalCitiesInSource) * 100).toFixed(2)),
  };
}
