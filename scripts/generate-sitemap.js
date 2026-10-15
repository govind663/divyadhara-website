/**
 * DivyaDhara static sitemap generator.
 * File: scripts/generate-sitemap.js
 *
 * Reads static exports from src/data/content.ts.
 * No SQLite/database access.
 *
 * Run: node scripts/generate-sitemap.js
 *
 * .env:
 * SITE_URL=https://divya-dhara.in
 * SITEMAP_OUTPUT=public/sitemap.xml
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
];

const diagnostic = {
  foreign: 0,
  query: 0,
  blocked: 0,
  invalid: 0,
  noindex: 0,
};

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

function main() {
  const map = new Map();

  addStaticRoutes(map);

  const report = addListingRoutes(map);
  const xml = buildXml(map);

  fs.mkdirSync(path.dirname(OUTPUT), {
    recursive: true,
  });

  fs.writeFileSync(OUTPUT, xml, "utf8");

  console.log("[sitemap] Generated successfully.");
  console.log(`[sitemap] Site origin: ${SITE}`);
  console.log(`[sitemap] Output file: ${OUTPUT}`);
  console.log(
    `[sitemap] Static routes configured: ${STATIC_ROUTES.length}`,
  );

  console.log("[sitemap] Static listing summary:");

  for (const item of report) {
    console.log(
      `[sitemap]   ${item.name}: ${item.total} records, ` +
        `${item.added} URLs added, ` +
        `${item.invalid} invalid skipped, ` +
        `${item.skipped} non-indexable skipped`,
    );
  }

  console.log(`[sitemap] Unique URLs written: ${map.size}`);
  console.log(`[sitemap] Public URL after deployment: ${SITE}/sitemap.xml`);
  console.log(
    "[sitemap] Database access: disabled (static TypeScript data only).",
  );

  if (
    diagnostic.foreign ||
    diagnostic.query ||
    diagnostic.blocked ||
    diagnostic.invalid ||
    diagnostic.noindex
  ) {
    console.log(
      `[sitemap] Filter counts: other-domain=${diagnostic.foreign}, ` +
        `query/fragment=${diagnostic.query}, ` +
        `blocked=${diagnostic.blocked}, ` +
        `invalid=${diagnostic.invalid}, ` +
        `non-indexable=${diagnostic.noindex}`,
    );
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
    main();
  } catch (error) {
    console.error(
      "[sitemap] Failed:",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  }
}