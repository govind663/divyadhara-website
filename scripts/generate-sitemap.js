/**
 * DivyaDhara — Sitemap Generator
 * File: scripts/generate-sitemap.js
 *
 * Generates public/sitemap.xml from:
 * 1. Static public routes.
 * 2. Published, indexable URLs from seo_entries.
 * 3. Published, indexable URLs from seo_location_pages.
 *
 * Environment variables:
 * SITE_URL=https://divyadhara.in
 * DIVYADHARA_DB_PATH=data/divyadhara.sqlite
 * SITEMAP_OUTPUT=public/sitemap.xml
 * SITEMAP_REQUIRE_DATABASE=true
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SITE_URL = normalizeOrigin(
  process.env.SITE_URL || "https://divyadhara.in",
);

const OUTPUT_PATH = path.resolve(
  PROJECT_ROOT,
  process.env.SITEMAP_OUTPUT || "public/sitemap.xml",
);

const DATABASE_PATH = path.resolve(
  PROJECT_ROOT,
  process.env.DIVYADHARA_DB_PATH || "data/divyadhara.sqlite",
);

const REQUIRE_DATABASE =
  String(process.env.SITEMAP_REQUIRE_DATABASE || "").toLowerCase() ===
  "true";

const STATIC_ROUTES = [
  { path: "/", changefreq: "daily", priority: 1.0 },
  { path: "/temples", changefreq: "daily", priority: 0.9 },
  { path: "/services", changefreq: "weekly", priority: 0.9 },
  { path: "/pandits", changefreq: "weekly", priority: 0.9 },
  { path: "/ashrams", changefreq: "weekly", priority: 0.8 },
  { path: "/courses", changefreq: "weekly", priority: 0.8 },
  { path: "/panchang", changefreq: "daily", priority: 0.9 },
  { path: "/calendar", changefreq: "weekly", priority: 0.7 },
  { path: "/events", changefreq: "daily", priority: 0.8 },
  { path: "/spiritual-places", changefreq: "weekly", priority: 0.9 },
  { path: "/packages", changefreq: "weekly", priority: 0.9 },
  { path: "/gallery", changefreq: "weekly", priority: 0.6 },
  { path: "/videos", changefreq: "weekly", priority: 0.6 },
  { path: "/articles", changefreq: "weekly", priority: 0.7 },
  { path: "/about", changefreq: "monthly", priority: 0.5 },
  { path: "/contact", changefreq: "monthly", priority: 0.5 },
];

const DEFAULT_CHANGEFREQ = "weekly";
const DEFAULT_PRIORITY = 0.6;

const VALID_CHANGEFREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

function normalizeOrigin(value) {
  const url = new URL(String(value).trim());

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`SITE_URL must use http or https: ${value}`);
  }

  return url.origin.replace(/\/+$/, "");
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanPath(value) {
  const raw = String(value ?? "").trim();

  if (!raw || raw.startsWith("//")) {
    return null;
  }

  let url;

  try {
    url = new URL(raw, `${SITE_URL}/`);
  } catch {
    return null;
  }

  if (url.origin !== SITE_URL) {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  // Sitemap entries should be canonical URLs without query strings.
  if (url.search || url.hash) {
    return null;
  }

  const pathname = url.pathname.replace(/\/{2,}/g, "/");

  const blockedRoutes = [
    /^\/api(?:\/|$)/i,
    /^\/admin(?:\/|$)/i,
    /^\/dashboard(?:\/|$)/i,
    /^\/login\/?$/i,
    /^\/register\/?$/i,
    /^\/forgot(?:-password)?\/?$/i,
    /^\/account(?:\/|$)/i,
    /^\/visitor\/dashboard(?:\/|$)/i,
    /^\/pandit\/dashboard(?:\/|$)/i,
    /^\/temple\/dashboard(?:\/|$)/i,
    /^\/ashram\/dashboard(?:\/|$)/i,
    /^\/sales(?:\/|$)/i,
  ];

  if (blockedRoutes.some((pattern) => pattern.test(pathname))) {
    return null;
  }

  return `${SITE_URL}${
    pathname === "/" ? "/" : pathname.replace(/\/+$/, "")
  }`;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizePriority(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_PRIORITY;
  }

  return Math.min(1, Math.max(0, number));
}

function normalizeChangefreq(value) {
  const normalized = String(value || "").toLowerCase();

  return VALID_CHANGEFREQ.has(normalized)
    ? normalized
    : DEFAULT_CHANGEFREQ;
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName),
  );
}

function tableColumns(db, tableName) {
  if (!tableExists(db, tableName)) {
    return new Set();
  }

  return new Set(
    db
      .prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`)
      .all()
      .map((column) => String(column.name)),
  );
}

function isIndexableRow(row) {
  if (
    row.is_indexable !== undefined &&
    Number(row.is_indexable) !== 1
  ) {
    return false;
  }

  if (row.status !== undefined) {
    const status = String(row.status ?? "").toLowerCase();

    if (!["published", "active", "approved"].includes(status)) {
      return false;
    }
  }

  if (row.robots !== undefined) {
    const robots = String(row.robots ?? "").toLowerCase();

    if (robots.includes("noindex")) {
      return false;
    }
  }

  return true;
}

function addUrl(urlMap, candidate) {
  const loc = cleanPath(
    candidate.loc || candidate.path || candidate.canonical_url,
  );

  if (!loc) {
    return;
  }

  const incoming = {
    loc,
    lastmod: normalizeDate(candidate.lastmod),
    changefreq: normalizeChangefreq(candidate.changefreq),
    priority: normalizePriority(candidate.priority),
  };

  const existing = urlMap.get(loc);

  if (!existing) {
    urlMap.set(loc, incoming);
    return;
  }

  if (
    incoming.lastmod &&
    (!existing.lastmod || incoming.lastmod > existing.lastmod)
  ) {
    existing.lastmod = incoming.lastmod;
  }

  existing.priority = Math.max(
    existing.priority,
    incoming.priority,
  );
}

function addStaticRoutes(urlMap) {
  for (const route of STATIC_ROUTES) {
    addUrl(urlMap, {
      loc: route.path,
      changefreq: route.changefreq,
      priority: route.priority,
    });
  }
}

function addDatabaseRoutes(urlMap) {
  if (!fs.existsSync(DATABASE_PATH)) {
    const message = `SQLite database not found at ${DATABASE_PATH}`;

    if (REQUIRE_DATABASE) {
      throw new Error(message);
    }

    console.warn(
      `[sitemap] WARNING: ${message}; generating static routes only.`,
    );

    return {
      seoEntries: 0,
      locationPages: 0,
    };
  }

  let Database;

  try {
    Database = require("better-sqlite3");
  } catch (error) {
    const message =
      "Cannot load better-sqlite3. Ensure it is installed and rebuilt for this Node.js version.";

    if (REQUIRE_DATABASE) {
      throw new Error(message, { cause: error });
    }

    console.warn(
      `[sitemap] WARNING: ${message}; generating static routes only.`,
    );

    return {
      seoEntries: 0,
      locationPages: 0,
    };
  }

  const db = new Database(DATABASE_PATH, {
    readonly: true,
    fileMustExist: true,
  });

  let seoEntries = 0;
  let locationPages = 0;

  try {
    // Central SEO records.
    if (tableExists(db, "seo_entries")) {
      const columns = tableColumns(db, "seo_entries");

      if (columns.has("path")) {
        const selectColumns = [
          "path",
          ...(columns.has("canonical_url")
            ? ["canonical_url"]
            : []),
          ...(columns.has("status") ? ["status"] : []),
          ...(columns.has("is_indexable")
            ? ["is_indexable"]
            : []),
          ...(columns.has("robots") ? ["robots"] : []),
          ...(columns.has("lastmod_at")
            ? ["lastmod_at"]
            : []),
          ...(columns.has("updated_at")
            ? ["updated_at"]
            : []),
          ...(columns.has("published_at")
            ? ["published_at"]
            : []),
          ...(columns.has("sitemap_priority")
            ? ["sitemap_priority"]
            : []),
          ...(columns.has("sitemap_changefreq")
            ? ["sitemap_changefreq"]
            : []),
        ];

        const rows = db
          .prepare(
            `SELECT ${selectColumns
              .map((name) => `"${name}"`)
              .join(", ")} FROM seo_entries`,
          )
          .all();

        for (const row of rows) {
          if (!isIndexableRow(row)) {
            continue;
          }

          const canonical = String(
            row.canonical_url || "",
          ).trim();

          addUrl(urlMap, {
            loc: canonical || row.path,
            path: row.path,
            lastmod:
              row.lastmod_at ||
              row.updated_at ||
              row.published_at,
            priority: row.sitemap_priority,
            changefreq: row.sitemap_changefreq,
          });

          seoEntries += 1;
        }
      } else {
        console.warn(
          "[sitemap] seo_entries exists but has no path column; skipped.",
        );
      }
    }

    // Published location landing pages.
    if (tableExists(db, "seo_location_pages")) {
      const columns = tableColumns(db, "seo_location_pages");

      if (columns.has("path")) {
        const selectColumns = [
          "path",
          ...(columns.has("canonical_path")
            ? ["canonical_path"]
            : []),
          ...(columns.has("status") ? ["status"] : []),
          ...(columns.has("is_indexable")
            ? ["is_indexable"]
            : []),
          ...(columns.has("lastmod_at")
            ? ["lastmod_at"]
            : []),
          ...(columns.has("updated_at")
            ? ["updated_at"]
            : []),
          ...(columns.has("published_at")
            ? ["published_at"]
            : []),
          ...(columns.has("sitemap_priority")
            ? ["sitemap_priority"]
            : []),
          ...(columns.has("sitemap_changefreq")
            ? ["sitemap_changefreq"]
            : []),
        ];

        const rows = db
          .prepare(
            `SELECT ${selectColumns
              .map((name) => `"${name}"`)
              .join(", ")} FROM seo_location_pages`,
          )
          .all();

        for (const row of rows) {
          if (!isIndexableRow(row)) {
            continue;
          }

          addUrl(urlMap, {
            loc: row.canonical_path || row.path,
            lastmod:
              row.lastmod_at ||
              row.updated_at ||
              row.published_at,
            priority: row.sitemap_priority,
            changefreq: row.sitemap_changefreq,
          });

          locationPages += 1;
        }
      } else {
        console.warn(
          "[sitemap] seo_location_pages exists but has no path column; skipped.",
        );
      }
    }
  } finally {
    db.close();
  }

  return {
    seoEntries,
    locationPages,
  };
}

function buildXml(urlMap) {
  const entries = [...urlMap.values()].sort((a, b) =>
    a.loc.localeCompare(b.loc),
  );

  // Standard sitemap limit: 50,000 URLs per sitemap file.
  if (entries.length > 50000) {
    throw new Error(
      `Found ${entries.length} URLs. Sitemap exceeds the 50,000 URL limit; implement a sitemap index and split files.`,
    );
  }

  const xmlUrls = entries.map((entry) => {
    const fields = [
      "  <url>",
      `    <loc>${xmlEscape(entry.loc)}</loc>`,
    ];

    if (entry.lastmod) {
      fields.push(
        `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`,
      );
    }

    fields.push(
      `    <changefreq>${entry.changefreq}</changefreq>`,
    );

    fields.push(
      `    <priority>${entry.priority.toFixed(1)}</priority>`,
    );

    fields.push("  </url>");

    return fields.join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...xmlUrls,
    "</urlset>",
    "",
  ].join("\n");
}

function main() {
  const urlMap = new Map();

  addStaticRoutes(urlMap);

  const stats = addDatabaseRoutes(urlMap);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), {
    recursive: true,
  });

  fs.writeFileSync(
    OUTPUT_PATH,
    buildXml(urlMap),
    "utf8",
  );

  console.log("[sitemap] Generated successfully.");
  console.log(`[sitemap] Site: ${SITE_URL}`);
  console.log(`[sitemap] Output: ${OUTPUT_PATH}`);
  console.log(
    `[sitemap] Static routes configured: ${STATIC_ROUTES.length}`,
  );
  console.log(
    `[sitemap] SEO entries scanned: ${stats.seoEntries}`,
  );
  console.log(
    `[sitemap] Location pages scanned: ${stats.locationPages}`,
  );
  console.log(
    `[sitemap] Unique URLs written: ${urlMap.size}`,
  );
  console.log(
    `[sitemap] Public URL: ${SITE_URL}/sitemap.xml`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    "[sitemap] Failed:",
    error instanceof Error ? error.message : error,
  );

  process.exitCode = 1;
}