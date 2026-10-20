/**
 * DivyaDhara static sitemap generator.
 * File: scripts/generate-sitemap.js
 *
 * Combines static routes, listing records from src/data/content.ts, public
 * internal paths referenced in src code, and by default live same-origin
 * HTML links discovered from SITE_URL. No SQLite/database access.
 *
 * Run: node scripts/generate-sitemap.js
 *
 * .env:
 * SITE_URL=https://divya-dhara.in
 * SITEMAP_OUTPUT=public/sitemap.xml
 * SITEMAP_CRAWL=true
 * SITEMAP_CRAWL_MAX_PAGES=1000
 *
 * Set SITEMAP_CRAWL=false for offline generation.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SCRIPT = fileURLToPath(import.meta.url);
const EXPORT_MODE = "DIVYADHARA_SITEMAP_EXPORTS_ONLY";
const MARKER = "__DIVYADHARA_SITEMAP_DATA__";

/* =========================================================
   ENVIRONMENT CONFIGURATION
========================================================= */

function loadEnv(file) {
  if (!fs.existsSync(file)) return;

  const text = fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "");

  for (const original of text.split(/\r?\n/)) {
    let line = original.trim();

    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
    }

    const equals = line.indexOf("=");

    if (equals < 1) continue;

    const key = line.slice(0, equals).trim();

    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
      process.env[key] !== undefined
    ) {
      continue;
    }

    let value = line.slice(equals + 1).trim();

    const first = value[0];
    const last = value[value.length - 1];

    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'")
    ) {
      value = value.slice(1, -1);

      if (first === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\"/g, '"');
      }
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, ".env"));

function getOrigin(value) {
  let url;

  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error(`SITE_URL is invalid: ${value}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("SITE_URL must use http or https.");
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "SITE_URL must be an origin only, e.g. https://divya-dhara.in",
    );
  }

  return url.origin;
}

const SITE = getOrigin(
  process.env.SITE_URL || "https://divya-dhara.in",
);

const OUTPUT = path.resolve(
  ROOT,
  process.env.SITEMAP_OUTPUT || "public/sitemap.xml",
);

const MAX_URLS = 50_000;
const MAX_BYTES = 50 * 1024 * 1024;

const DEFAULT_PRIORITY = 0.6;
const DEFAULT_FREQ = "weekly";

const VALID_FREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

/* =========================================================
   PUBLIC STATIC ROUTES
========================================================= */

const STATIC_ROUTES = [
  ["/", "daily", 1.0],
  ["/temples", "daily", 0.9],
  ["/services", "weekly", 0.9],
  ["/pandits", "weekly", 0.9],
  ["/ashrams", "weekly", 0.8],
  ["/courses", "weekly", 0.8],
  ["/subscriptions", "monthly", 0.6],
  ["/panchang", "daily", 0.9],
  ["/calendar", "weekly", 0.7],
  ["/rashifal", "daily", 0.7],
  ["/kundli", "weekly", 0.7],
  ["/gochar", "weekly", 0.6],
  ["/events", "daily", 0.8],
  ["/spiritual-places", "weekly", 0.9],
  ["/packages", "weekly", 0.9],
  ["/gallery", "weekly", 0.6],
  ["/videos", "weekly", 0.6],
  ["/articles", "weekly", 0.7],
  ["/about", "monthly", 0.5],
  ["/contact", "monthly", 0.5],
];

/* =========================================================
   PRIVATE / BLOCKED ROUTES
========================================================= */

const BLOCKED = [
  /^\/api(?:\/|$)/i,
  /^\/admin(?:\/|$)/i,
  /^\/dashboard(?:\/|$)/i,
  /^\/login\/?$/i,
  /^\/register\/?$/i,
  /^\/forgot(?:-password)?\/?$/i,
  /^\/reset(?:-password)?\/?$/i,
  /^\/account(?:\/|$)/i,
  /^\/checkout(?:\/|$)/i,
  /^\/payment(?:\/|$)/i,
  /^\/orders?(?:\/|$)/i,
  /^\/visitor\/dashboard(?:\/|$)/i,
  /^\/pandit\/dashboard(?:\/|$)/i,
  /^\/temple\/dashboard(?:\/|$)/i,
  /^\/ashram\/dashboard(?:\/|$)/i,
  /^\/sales(?:\/|$)/i,
  /^\/super[-_]?admin(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
  /^\/verify(?:-email|-mobile)?(?:\/|$)/i,
  /^\/notifications?(?:\/|$)/i,
  /^\/settings(?:\/|$)/i,
  /^\/profile(?:\/edit|\/settings)(?:\/|$)/i,
  /^\/404\/?$/i,
  /^\/not-found\/?$/i,
];

const diagnostic = {
  foreign: 0,
  query: 0,
  blocked: 0,
  invalid: 0,
  noindex: 0,
};

// Source scanning is always enabled. Live same-origin HTML crawling is enabled
// by default; use SITEMAP_CRAWL=false when generating offline.
const LIVE_CRAWL_ENABLED = !/^(?:0|false|no|off)$/i.test(
  String(process.env.SITEMAP_CRAWL ?? "true").trim(),
);
const CRAWL_MAX_PAGES = Math.max(1, Math.min(10_000,
  Number.parseInt(process.env.SITEMAP_CRAWL_MAX_PAGES || "1000", 10) || 1000));
const CRAWL_CONCURRENCY = Math.max(1, Math.min(16,
  Number.parseInt(process.env.SITEMAP_CRAWL_CONCURRENCY || "6", 10) || 6));
const CRAWL_TIMEOUT_MS = Math.max(1_000, Math.min(30_000,
  Number.parseInt(process.env.SITEMAP_CRAWL_TIMEOUT_MS || "7000", 10) || 7000));

/* =========================================================
   XML AND URL HELPERS
========================================================= */

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanUrl(value) {
  const raw = String(value ?? "").trim();

  if (!raw || raw.startsWith("//")) {
    diagnostic.invalid++;
    return null;
  }

  let url;

  try {
    url = new URL(raw, `${SITE}/`);
  } catch {
    diagnostic.invalid++;
    return null;
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    diagnostic.invalid++;
    return null;
  }

  if (url.origin !== SITE) {
    diagnostic.foreign++;
    return null;
  }

  if (url.search || url.hash) {
    diagnostic.query++;
    return null;
  }

  const pathname = url.pathname.replace(/\/{2,}/g, "/");

  if (BLOCKED.some((regex) => regex.test(pathname))) {
    diagnostic.blocked++;
    return null;
  }

  return `${SITE}${
    pathname === "/"
      ? "/"
      : pathname.replace(/\/+$/, "")
  }`;
}

function cleanDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function cleanSlug(value) {
  let slug = String(value ?? "").trim();

  while (slug.startsWith("/")) {
    slug = slug.slice(1);
  }

  while (slug.endsWith("/")) {
    slug = slug.slice(0, -1);
  }

  if (
    !slug ||
    slug.startsWith("http:") ||
    slug.startsWith("https:") ||
    slug.includes("?") ||
    slug.includes("#") ||
    slug.includes(String.fromCharCode(92))
  ) {
    return null;
  }

  const parts = slug.split("/");

  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === "..",
    )
  ) {
    return null;
  }

  return parts
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");
}

function cleanPriority(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return DEFAULT_PRIORITY;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? Math.max(0, Math.min(1, number))
    : DEFAULT_PRIORITY;
}

function cleanFreq(value) {
  const freq = String(value || "").trim().toLowerCase();

  return VALID_FREQ.has(freq)
    ? freq
    : DEFAULT_FREQ;
}

/* =========================================================
   LISTING INDEXABILITY
========================================================= */

function isIndexable(record) {
  const flag =
    record.is_indexable ??
    record.isIndexable ??
    record.indexable;

  const flagText = String(flag ?? "").trim().toLowerCase();

  if (
    flag === false ||
    flag === 0 ||
    ["false", "0", "no"].includes(flagText)
  ) {
    return false;
  }

  const isPublic =
    record.isPublic ?? record.is_public;

  if (isPublic === false || isPublic === 0) {
    return false;
  }

  const isPublished =
    record.isPublished ?? record.is_published;

  if (isPublished === false || isPublished === 0) {
    return false;
  }

  const robots = String(
    record.robots ?? record.robotsTag ?? "",
  ).toLowerCase();

  if (
    robots.includes("noindex") ||
    robots.split(/[\s,]+/).includes("none")
  ) {
    return false;
  }

  if (record.noindex === true || record.noIndex === true) {
    return false;
  }

  const status = String(record.status ?? "")
    .trim()
    .toLowerCase();

  return ![
    "draft",
    "private",
    "unpublished",
    "archived",
    "deleted",
    "hidden",
    "inactive",
    "rejected",
    "disabled",
    "pending",
  ].includes(status);
}

function lastmodOf(record) {
  return (
    record.lastmod ??
    record.lastmod_at ??
    record.updatedAt ??
    record.updated_at ??
    record.modifiedAt ??
    record.modified_at ??
    null
  );
}

/* =========================================================
   URL MAP / DEDUPLICATION
========================================================= */

function addUrl(map, candidate) {
  const loc = cleanUrl(candidate.loc ?? candidate.path);

  if (!loc) return false;

  const incoming = {
    loc,
    lastmod: cleanDate(candidate.lastmod),
    changefreq: cleanFreq(candidate.changefreq),
    priority: cleanPriority(candidate.priority),
  };

  const current = map.get(loc);

  if (!current) {
    map.set(loc, incoming);
    return true;
  }

  if (
    incoming.lastmod &&
    (!current.lastmod || incoming.lastmod > current.lastmod)
  ) {
    current.lastmod = incoming.lastmod;
  }

  current.priority = Math.max(
    current.priority,
    incoming.priority,
  );

  const ranks = {
    always: 7,
    hourly: 6,
    daily: 5,
    weekly: 4,
    monthly: 3,
    yearly: 2,
    never: 1,
  };

  if (ranks[incoming.changefreq] > ranks[current.changefreq]) {
    current.changefreq = incoming.changefreq;
  }

  return true;
}

function addStaticRoutes(map) {
  for (const [route, changefreq, priority] of STATIC_ROUTES) {
    if (
      !addUrl(map, {
        loc: route,
        changefreq,
        priority,
      })
    ) {
      throw new Error(`Invalid static route: ${route}`);
    }
  }
}

/* =========================================================
   TYPESCRIPT STATIC DATA LOADER
   Runs this same file in a child process with tsx.
   No database connection is used.
========================================================= */

async function exportStaticDataOnly() {
  const moduleUrl = pathToFileURL(
    path.join(ROOT, "src", "data", "content.ts"),
  ).href;

  const content = await import(moduleUrl);

  const definitions = [
    {
      name: "temples",
      route: "/temples",
      key: "TEMPLES",
      required: true,
    },
    {
      name: "pandits",
      route: "/pandits",
      key: "PANDITS",
      required: true,
    },
    {
      name: "services",
      route: "/services",
      key: "SERVICES",
      required: true,
    },
    {
      name: "ashrams",
      route: "/ashrams",
      key: "ASHRAMS",
    },
    {
      name: "courses",
      route: "/courses",
      key: "COURSES",
    },
    {
      name: "events",
      route: "/events",
      key: "EVENTS",
    },
    {
      name: "spiritualPlaces",
      route: "/spiritual-places",
      key: "PLACES",
    },
    {
      name: "packages",
      route: "/packages",
      key: "PACKAGES",
    },
    {
      name: "articles",
      route: "/articles",
      key: "ARTICLES",
    },
  ];

  const result = definitions.map((definition) => {
    const records = content[definition.key];

    if (!Array.isArray(records)) {
      if (definition.required) {
        throw new Error(
          `Required export ${definition.key} is missing or is not an array in src/data/content.ts`,
        );
      }

      return {
        name: definition.name,
        route: definition.route,
        total: 0,
        records: [],
      };
    }

    return {
      name: definition.name,
      route: definition.route,
      total: records.length,

      records: records.map((record) =>
        record && typeof record === "object"
          ? {
              slug: String(record.slug ?? ""),
              lastmod: lastmodOf(record),

              is_indexable:
                record.is_indexable ??
                record.isIndexable ??
                record.indexable,

              isPublic:
                record.isPublic ??
                record.is_public,

              isPublished:
                record.isPublished ??
                record.is_published,

              robots:
                record.robots ??
                record.robotsTag,

              noindex:
                record.noindex ??
                record.noIndex,

              status: record.status,
            }
          : null,
      ),
    };
  });

  console.log(`${MARKER}${JSON.stringify(result)}`);
}

function readStaticListings() {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", SCRIPT],
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
      env: {
        ...process.env,
        [EXPORT_MODE]: "true",
      },
    },
  );

  if (child.error) {
    throw new Error(
      `Could not start TypeScript loader: ${child.error.message}. Check that tsx is installed.`,
    );
  }

  if (child.status !== 0) {
    throw new Error(
      "Could not import src/data/content.ts through tsx. " +
        "Check tsx installation and source imports.\n" +
        [child.stderr, child.stdout]
          .filter(Boolean)
          .join("\n")
          .trim(),
    );
  }

  const line = child.stdout
    .split(/\r?\n/)
    .reverse()
    .find((text) => text.startsWith(MARKER));

  if (!line) {
    throw new Error(
      "Static data loader returned no JSON. Child output:\n" +
        child.stdout,
    );
  }

  try {
    return JSON.parse(line.slice(MARKER.length));
  } catch (error) {
    throw new Error(
      `Could not parse static listing data: ${
        error instanceof Error
          ? error.message
          : error
      }`,
    );
  }
}

/* =========================================================
   CREATE DETAIL URLS FROM STATIC LISTINGS
========================================================= */

function addListingRoutes(map) {
  const collections = readStaticListings();
  const report = [];

  for (const collection of collections) {
    let added = 0;
    let invalid = 0;
    let skipped = 0;

    for (const record of collection.records) {
      if (!record || typeof record !== "object") {
        invalid++;
        continue;
      }

      if (!isIndexable(record)) {
        skipped++;
        diagnostic.noindex++;
        continue;
      }

      const slug = cleanSlug(record.slug);

      if (!slug) {
        invalid++;
        continue;
      }

      const loc = `${collection.route}/${slug}`;
      const absoluteUrl = `${SITE}${loc}`;
      const existed = map.has(absoluteUrl);

      const priority =
        collection.name === "temples" ||
        collection.name === "services"
          ? 0.8
          : 0.7;

      const accepted = addUrl(map, {
        loc,
        lastmod: record.lastmod,
        changefreq:
          collection.name === "events"
            ? "weekly"
            : "monthly",
        priority,
      });

      if (accepted && !existed) added++;
    }

    report.push({
      name: collection.name,
      total: collection.total,
      added,
      invalid,
      skipped,
    });
  }

  return report;
}

/* =========================================================
   DISCOVER PUBLIC INTERNAL ROUTES FROM SOURCE CODE

   Finds literal public routes referenced by Link/NavLink, anchors, route
   declarations and common navigation calls. Dynamic patterns such as
   /temples/:slug are excluded; detail URLs must come from data or link crawling.
========================================================= */

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_SOURCE_DIRS = new Set([
  ".git", ".next", ".turbo", "dist", "build", "coverage", "node_modules",
]);

function walkSourceFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return output;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_SOURCE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        walkSourceFiles(absolute, output);
      }
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    if (/\.(?:test|spec|stories)\.[^.]+$/i.test(entry.name)) continue;
    output.push(absolute);
  }
  return output;
}

function isLikelyPagePath(value) {
  const raw = String(value ?? "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return false;
  if (/[?#]/.test(raw) || raw.includes("${") || raw.includes("\\") || raw.includes("*")) return false;
  const segments = raw.split("/").filter(Boolean);
  if (segments.some((segment) => /^:[A-Za-z_$]/.test(segment) || segment === "." || segment === "..")) return false;
  let pathname;
  try { pathname = new URL(raw, `${SITE}/`).pathname; } catch { return false; }
  // Keep the sitemap focused on crawlable page URLs, not imported assets/files.
  if (/\.(?:avif|bmp|css|csv|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|otf|pdf|png|svg|ttf|txt|wasm|wav|webm|webmanifest|webp|woff2?)$/i.test(pathname)) return false;
  return true;
}

function extractSourceRouteCandidates(source) {
  const candidates = new Set();
  const patterns = [
    /\b(?:to|href|path)\s*=\s*["'`]([^"'`\s<>]+)["'`]/g,
    /\b(?:to|href|path)\s*=\s*\{\s*["'`]([^"'`\s<>]+)["'`]\s*\}/g,
    /\b(?:to|href|path)\s*:\s*["'`]([^"'`\s<>]+)["'`]/g,
    /\b(?:navigate|redirect|push|replace)\s*\(\s*["'`]([^"'`\s<>]+)["'`]/g,
    /\b(?:window\.)?location\.href\s*=\s*["'`]([^"'`\s<>]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (isLikelyPagePath(match[1])) candidates.add(match[1]);
    }
  }
  return candidates;
}

function addSourceRoutes(map) {
  const files = walkSourceFiles(path.join(ROOT, "src"));
  const candidates = new Set();
  let readErrors = 0;
  for (const file of files) {
    try {
      if (fs.statSync(file).size > 5 * 1024 * 1024) continue;
      for (const route of extractSourceRouteCandidates(fs.readFileSync(file, "utf8"))) candidates.add(route);
    } catch {
      readErrors++;
    }
  }
  let added = 0;
  for (const route of candidates) {
    const normalized = `${SITE}${route === "/" ? "/" : route.replace(/\/+$/, "")}`;
    const existed = map.has(normalized);
    if (addUrl(map, { loc: route, changefreq: "weekly", priority: 0.5 }) && !existed) added++;
  }
  return { filesScanned: files.length, candidateRoutes: candidates.size, added, readErrors, routes: [...candidates] };
}

function decodeHtmlAttribute(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractHtmlLinks(html, pageUrl) {
  const links = new Set();
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const href = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!href || href.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let url;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (url.origin !== SITE || !isLikelyPagePath(url.pathname) || url.search || url.hash) continue;
    links.add(url.href);
  }
  return links;
}

async function fetchCrawlPage(pageUrl) {
  try {
    const response = await fetch(pageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
      headers: {
        "user-agent": "DivyaDharaSitemapBot/1.0 (+https://divya-dhara.in)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    });
    let finalUrl;
    try { finalUrl = new URL(response.url || pageUrl); }
    catch { return { links: [], failed: true, noindex: false }; }
    if (finalUrl.origin !== SITE || !response.ok) return { links: [], failed: true, noindex: false };
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return { links: [], failed: false, skipped: true, noindex: false };
    const html = await response.text();
    const headerRobots = response.headers.get("x-robots-tag") || "";
    const metaRobots = html.match(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i)?.[1] || "";
    const noindex = /\bnoindex\b|\bnone\b/i.test(`${headerRobots} ${metaRobots}`);
    return { links: noindex ? [] : [...extractHtmlLinks(html, finalUrl.href)], noindex, failed: false, canonicalUrl: cleanUrl(finalUrl.href) };
  } catch (error) {
    return { links: [], noindex: false, failed: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function crawlInternalLinks(map, seeds) {
  const queue = [];
  const queued = new Set();
  const visited = new Set();
  let discovered = 0;
  let added = 0;
  let failed = 0;
  let noindex = 0;
  for (const seed of seeds) {
    const loc = cleanUrl(seed);
    if (loc && !queued.has(loc)) { queued.add(loc); queue.push(loc); }
  }

  while (queue.length && visited.size < CRAWL_MAX_PAGES) {
    const batch = [];
    while (batch.length < CRAWL_CONCURRENCY && queue.length && visited.size + batch.length < CRAWL_MAX_PAGES) {
      const next = queue.shift();
      if (!next || visited.has(next)) continue;
      visited.add(next);
      batch.push(next);
    }
    if (!batch.length) break;
    const results = await Promise.all(batch.map(fetchCrawlPage));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.failed) { failed++; continue; }
      if (result.noindex) {
        noindex++;
        if (result.canonicalUrl) map.delete(result.canonicalUrl);
        diagnostic.noindex++;
        continue;
      }
      if (result.canonicalUrl) {
        const existed = map.has(result.canonicalUrl);
        addUrl(map, { loc: result.canonicalUrl, changefreq: "weekly", priority: 0.5 });
        if (!existed && map.has(result.canonicalUrl)) added++;
      }
      for (const link of result.links) {
        const loc = cleanUrl(link);
        if (!loc) continue;
        const existed = map.has(loc);
        addUrl(map, { loc, changefreq: "weekly", priority: 0.5 });
        if (!existed && map.has(loc)) { added++; discovered++; }
        if (!queued.has(loc) && !visited.has(loc)) { queued.add(loc); queue.push(loc); }
      }
    }
  }
  return { enabled: true, pagesVisited: visited.size, linksDiscovered: discovered, urlsAdded: added, failedPages: failed, noindexSkipped: noindex, maxPages: CRAWL_MAX_PAGES };
}

/* =========================================================
   SITEMAP XML GENERATION
========================================================= */

function buildXml(map) {
  const entries = [...map.values()].sort(
    (a, b) => a.loc.localeCompare(b.loc),
  );

  if (entries.length > MAX_URLS) {
    throw new Error(
      `Found ${entries.length} URLs; sitemap limit is ${MAX_URLS}. Split into multiple sitemaps and add a sitemap index.`,
    );
  }

  const body = entries.map((entry) => {
    const lines = [
      "  <url>",
      `    <loc>${xmlEscape(entry.loc)}</loc>`,
    ];

    if (entry.lastmod) {
      lines.push(
        `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`,
      );
    }

    lines.push(
      `    <changefreq>${entry.changefreq}</changefreq>`,
    );

    lines.push(
      `    <priority>${entry.priority.toFixed(1)}</priority>`,
      "  </url>",
    );

    return lines.join("\n");
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...body,
    "</urlset>",
    "",
  ].join("\n");

  const bytes = Buffer.byteLength(xml, "utf8");

  if (bytes > MAX_BYTES) {
    throw new Error(
      `Generated sitemap is ${bytes} bytes; maximum uncompressed sitemap size is 50 MB.`,
    );
  }

  return xml;
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  const map = new Map();
  addStaticRoutes(map);
  const listingReport = addListingRoutes(map);
  const sourceReport = addSourceRoutes(map);

  let crawlReport = { enabled: false, pagesVisited: 0, linksDiscovered: 0, urlsAdded: 0, failedPages: 0, noindexSkipped: 0, maxPages: CRAWL_MAX_PAGES };
  if (LIVE_CRAWL_ENABLED) {
    const seeds = [
      ...STATIC_ROUTES.map(([route]) => `${SITE}${route === "/" ? "/" : route}`),
      ...sourceReport.routes.map((route) => `${SITE}${route}`),
    ];
    crawlReport = await crawlInternalLinks(map, seeds);
  }

  const xml = buildXml(map);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, xml, "utf8");

  console.log("[sitemap] Generated successfully.");
  console.log(`[sitemap] Site origin: ${SITE}`);
  console.log(`[sitemap] Output file: ${OUTPUT}`);
  console.log(`[sitemap] Static routes configured: ${STATIC_ROUTES.length}`);
  console.log("[sitemap] Static listing summary:");
  for (const item of listingReport) {
    console.log(`[sitemap]   ${item.name}: ${item.total} records, ${item.added} URLs added, ${item.invalid} invalid skipped, ${item.skipped} non-indexable skipped`);
  }
  console.log(`[sitemap] Source scan: ${sourceReport.filesScanned} files scanned, ${sourceReport.candidateRoutes} route candidates, ${sourceReport.added} additional URLs, ${sourceReport.readErrors} read errors`);

  if (crawlReport.enabled) {
    console.log(`[sitemap] Live internal-link crawl: ${crawlReport.pagesVisited} pages visited, ${crawlReport.linksDiscovered} new links discovered, ${crawlReport.urlsAdded} URLs added, ${crawlReport.failedPages} pages unavailable, ${crawlReport.noindexSkipped} noindex pages skipped (limit ${crawlReport.maxPages})`);
    if (crawlReport.failedPages) console.warn("[sitemap] Some live pages could not be fetched. Static/data/source discovery still completed; check network/site availability or set SITEMAP_CRAWL=false for offline generation.");
  } else {
    console.log("[sitemap] Live crawl disabled (SITEMAP_CRAWL=false).");
  }

  console.log(`[sitemap] Unique URLs written: ${map.size}`);
  console.log(`[sitemap] Public URL after deployment: ${SITE}/sitemap.xml`);
  console.log("[sitemap] Database access: disabled (static TypeScript data only).");
  if (diagnostic.foreign || diagnostic.query || diagnostic.blocked || diagnostic.invalid || diagnostic.noindex) {
    console.log(`[sitemap] Filter counts: other-domain=${diagnostic.foreign}, query/fragment=${diagnostic.query}, blocked=${diagnostic.blocked}, invalid=${diagnostic.invalid}, non-indexable=${diagnostic.noindex}`);
  }
}

if (process.env[EXPORT_MODE] === "true") {
  try {
    await exportStaticDataOnly();
  } catch (error) {
    console.error(
      "[sitemap] Static export error:",
      error instanceof Error
        ? error.stack || error.message
        : error,
    );

    process.exitCode = 1;
  }
} else {
  try {
    await main();
  } catch (error) {
    console.error(
      "[sitemap] Failed:",
      error instanceof Error ? error.stack || error.message : error,
    );
    process.exitCode = 1;
  }
}
