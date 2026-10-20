/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * ============================================================================
 * DIVYADHARA — MASTER SEO ENGINE
 * ============================================================================
 *
 * Purpose:
 * - Centralize on-page SEO for the React application.
 * - Keep canonical URLs, robots, Open Graph, Twitter/X metadata and JSON-LD
 *   consistent across all routes.
 * - Provide reusable Schema.org builders for page-specific structured data.
 * - Avoid duplicate <meta>, <link> and <script> tags.
 * - Remain safe during browser-only React/Vite rendering and avoid accessing
 *   `document` during SSR. This hook applies metadata client-side; SSR/prerender
 *   deployments should also emit the required head tags into the initial HTML.
 *
 * Important:
 * - This file does NOT replace visible on-page content.
 * - Unique, useful H1/H2/content, crawlable internal links, indexable URLs and
 *   sitemap coverage are still required outside this helper.
 * - Structured data must describe content that is actually present on the page.
 * - Never use this file to fabricate reviews, ratings, prices, events, authors,
 *   organizations, locations or other facts.
 * ============================================================================
 */

import { useEffect } from "react";
import { SITE_URL } from "../lib/utils";

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type SEOPageType =
  | "website"
  | "article"
  | "profile"
  | "event"
  | "service"
  | "course"
  | "place"
  | "faq"
  | "search";

export type SEORobots =
  | string
  | {
      index?: boolean;
      follow?: boolean;
      noarchive?: boolean;
      nosnippet?: boolean;
      noimageindex?: boolean;
      maxSnippet?: number;
      maxImagePreview?: "none" | "standard" | "large";
      maxVideoPreview?: number;
      unavailableAfter?: string;
    };

export type SEOAlternate = {
  hrefLang: string;
  href: string;
};

/**
 * Explicit service-area representation for structured data.
 * Existing string inputs remain supported and default to AdministrativeArea.
 */
export type SEOAreaServed =
  | string
  | {
      name: string;
      type?: "City" | "AdministrativeArea" | "Place";
    };

export type SEOProps = {
  /** Visible page title used for document.title and social metadata. */
  title: string;

  /** Search-snippet description. Keep it genuinely representative of page content. */
  description: string;

  /** Site-relative route, e.g. "/temples/kashi-vishwanath-varanasi". */
  path?: string;

  /** Absolute or site-relative social/share image URL. */
  image?: string;

  /** Useful for OG/Twitter image alt text. */
  imageAlt?: string;

  /** Open Graph type. */
  type?: "website" | "article";

  /** HTML document language. */
  language?: string;

  /** Indexing instructions. Defaults to index + follow. */
  robots?: SEORobots;

  /** Optional hreflang alternates. Only pass real, equivalent language/region URLs. */
  alternates?: SEOAlternate[];

  /** JSON-LD object(s). */
  schema?: Record<string, unknown> | Record<string, unknown>[];

  /** Optional page author displayed in metadata only when genuinely known. */
  author?: string;

  /** Optional published/modified timestamps for relevant content pages. */
  publishedTime?: string;
  modifiedTime?: string;

  /** Optional section for article/social metadata. */
  section?: string;
};

/* ============================================================================
 * CONSTANTS
 * ========================================================================== */

export const SEO_SITE_NAME = "DivyaDhara";

export const SEO_DEFAULT_DESCRIPTION =
  "DivyaDhara connects devotees with temples, puja services, pandits, ashrams, spiritual courses, yatras, Panchang, festivals and sacred places across India.";

export const SEO_DEFAULT_IMAGE = "/images/hero-varanasi.jpeg";

export const SEO_DEFAULT_IMAGE_ALT =
  "DivyaDhara — spiritual journeys, temples and devotional services across India";

export const SEO_DEFAULT_LOCALE = "en_IN";

export const SEO_DEFAULT_ROBOTS =
  "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

const MANAGED_SEO_SCHEMA_ATTRIBUTE = "data-divyadhara-seo-schema";

/* ============================================================================
 * CORE URL HELPERS
 * ========================================================================== */

/**
 * Return a clean absolute production URL.
 *
 * SITE_URL is the project's configured source of truth. We intentionally do
 * not hard-code a production hostname here.
 */
export function absoluteUrl(value: string = "/"): string {
  const raw = String(value || "/").trim();

  if (!raw) {
    return normalizeBaseUrl(SITE_URL);
  }

  // Keep absolute URLs untouched, including third-party share images.
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  // Protocol-relative URLs are already absolute references.
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  // Non-web schemes (for example data: or mailto:) must not be prefixed.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return raw;
  }

  const base = normalizeBaseUrl(SITE_URL);
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  // Avoid malformed relative URLs if the site URL is not configured.
  return base ? `${base}${path}` : path;
}

/**
 * Normalize the configured site URL once at the boundary.
 */
export function normalizeBaseUrl(value: string): string {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  return raw.replace(/\/+$/, "");
}

/**
 * Turn a user/page supplied path into a stable canonical URL.
 *
 * The path is preserved intentionally, including legitimate query parameters
 * when a page has explicitly chosen to make them canonical.
 */
export function canonicalUrl(
  path: string = "/",
): string {
  const url = absoluteUrl(path || "/");

  // Fragments identify an in-page position, not a separate canonical page.
  const hashIndex = url.indexOf("#");
  return hashIndex >= 0 ? url.slice(0, hashIndex) : url;
}

/* ============================================================================
 * TEXT HELPERS
 * ========================================================================== */

/**
 * Collapse repeated whitespace and remove surrounding whitespace.
 */
export function cleanSEOText(
  value: string | null | undefined,
): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Conservative title/description helper.
 *
 * Search engines may rewrite snippets, so these are practical hygiene limits,
 * not guarantees of how the final SERP will display them.
 */
export function limitSEOText(
  value: string,
  maxLength: number,
): string {
  const text = cleanSEOText(value);
  const limit = Number.isFinite(maxLength)
    ? Math.max(0, Math.trunc(maxLength))
    : text.length;

  if (limit === 0 || !text) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  const cut = text
    .slice(0, Math.max(1, limit - 1))
    .replace(/\s+\S*$/, "")
    .trim();

  return cut ? `${cut}…` : text.slice(0, limit);
}

/**
 * Convert supported robot options into the content attribute value.
 */
export function formatRobots(
  robots: SEORobots = SEO_DEFAULT_ROBOTS,
): string {
  if (typeof robots === "string") {
    return cleanSEOText(robots) || SEO_DEFAULT_ROBOTS;
  }

  const directives: string[] = [];

  directives.push(
    robots.index === false ? "noindex" : "index",
  );

  directives.push(
    robots.follow === false ? "nofollow" : "follow",
  );

  if (robots.noarchive) {
    directives.push("noarchive");
  }

  if (robots.nosnippet) {
    directives.push("nosnippet");
  }

  if (robots.noimageindex) {
    directives.push("noimageindex");
  }

  if (typeof robots.maxSnippet === "number") {
    directives.push(
      `max-snippet:${Math.trunc(robots.maxSnippet)}`,
    );
  }

  if (robots.maxImagePreview) {
    directives.push(
      `max-image-preview:${robots.maxImagePreview}`,
    );
  }

  if (typeof robots.maxVideoPreview === "number") {
    directives.push(
      `max-video-preview:${Math.trunc(robots.maxVideoPreview)}`,
    );
  }

  if (robots.unavailableAfter) {
    directives.push(
      `unavailable_after:${robots.unavailableAfter}`,
    );
  }

  return directives.join(",");
}

/* ============================================================================
 * DOM HELPERS
 * ========================================================================== */

function getMetaByName(
  name: string,
): HTMLMetaElement | null {
  if (typeof document === "undefined" || !document.head) {
    return null;
  }

  return Array.from(
    document.head.querySelectorAll<HTMLMetaElement>("meta[name]"),
  ).find((meta) => meta.getAttribute("name") === name) ?? null;
}

function getMetaByProperty(
  property: string,
): HTMLMetaElement | null {
  if (typeof document === "undefined" || !document.head) {
    return null;
  }

  return Array.from(
    document.head.querySelectorAll<HTMLMetaElement>("meta[property]"),
  ).find((meta) => meta.getAttribute("property") === property) ?? null;
}

function ensureMeta(
  attribute: "name" | "property",
  value: string,
): HTMLMetaElement | null {
  if (
    typeof document === "undefined" ||
    !document.head
  ) {
    return null;
  }

  const candidates = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>(
      attribute === "name" ? "meta[name]" : "meta[property]",
    ),
  ).filter((meta) => meta.getAttribute(attribute) === value);

  const existing = candidates.shift() ?? null;
  candidates.forEach((duplicate) => duplicate.remove());

  if (existing) {
    return existing;
  }

  const meta =
    document.createElement("meta");

  meta.setAttribute(attribute, value);
  document.head.appendChild(meta);

  return meta;
}

function setMetaName(
  name: string,
  content: string,
): void {
  const meta = ensureMeta("name", name);

  if (!meta) {
    return;
  }

  meta.setAttribute(
    "content",
    content,
  );
}

function setMetaProperty(
  property: string,
  content: string,
): void {
  const meta = ensureMeta(
    "property",
    property,
  );

  if (!meta) {
    return;
  }

  meta.setAttribute(
    "content",
    content,
  );
}

function removeMetaByName(name: string): void {
  if (typeof document === "undefined" || !document.head) return;

  document.head
    .querySelectorAll<HTMLMetaElement>("meta[name]")
    .forEach((meta) => {
      if (meta.getAttribute("name") === name) meta.remove();
    });
}

function removeMetaByProperty(property: string): void {
  if (typeof document === "undefined" || !document.head) return;

  document.head
    .querySelectorAll<HTMLMetaElement>("meta[property]")
    .forEach((meta) => {
      if (meta.getAttribute("property") === property) meta.remove();
    });
}

function ensureLink(
  rel: string,
): HTMLLinkElement | null {
  if (
    typeof document === "undefined" ||
    !document.head
  ) {
    return null;
  }

  const candidates = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>("link[rel]"),
  ).filter((link) => link.getAttribute("rel") === rel);

  const existing = candidates.shift() ?? null;
  candidates.forEach((duplicate) => duplicate.remove());

  if (existing) {
    return existing;
  }

  const link =
    document.createElement("link");

  link.rel = rel;
  document.head.appendChild(link);

  return link;
}

function setCanonical(
  href: string,
): void {
  const link =
    ensureLink("canonical");

  if (!link) {
    return;
  }

  link.setAttribute(
    "href",
    href,
  );
}

function upsertAlternateLinks(
  alternates: SEOAlternate[] = [],
): void {
  if (
    typeof document === "undefined" ||
    !document.head
  ) {
    return;
  }

  document.head
    .querySelectorAll<HTMLLinkElement>(
      'link[data-divyadhara-hreflang="true"]',
    )
    .forEach((link) => link.remove());

  const unique = new Map<
    string,
    SEOAlternate
  >();

  for (const item of alternates) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const hrefLang = cleanSEOText(item.hrefLang);
    const href = cleanSEOText(item.href);

    if (!hrefLang || !href) {
      continue;
    }

    const isWebHref = /^https?:\/\//i.test(href) || href.startsWith("/");
    if (!isWebHref) {
      continue;
    }

    unique.set(
      hrefLang.toLowerCase(),
      {
        hrefLang,
        href: canonicalUrl(href),
      },
    );
  }

  unique.forEach((item) => {
    const link =
      document.createElement("link");

    link.rel = "alternate";
    link.hreflang = item.hrefLang;
    link.href = item.href;
    link.setAttribute(
      "data-divyadhara-hreflang",
      "true",
    );

    document.head.appendChild(link);
  });
}

function removeManagedSchema(): void {
  if (
    typeof document === "undefined" ||
    !document.head
  ) {
    return;
  }

  document.head
    .querySelectorAll<HTMLScriptElement>(
      `script[${MANAGED_SEO_SCHEMA_ATTRIBUTE}]`,
    )
    .forEach((script) => script.remove());
}

function addSchemaScript(
  schema: Record<string, unknown> | Record<string, unknown>[],
): void {
  if (
    typeof document === "undefined" ||
    !document.head
  ) {
    return;
  }

  const schemas = Array.isArray(schema)
    ? schema
    : [schema];

  const validSchemas = schemas.filter(
    (item) =>
      Boolean(item) &&
      typeof item === "object" &&
      !Array.isArray(item),
  );

  if (!validSchemas.length) {
    return;
  }

  const script =
    document.createElement("script");

  script.type =
    "application/ld+json";

  script.setAttribute(
    MANAGED_SEO_SCHEMA_ATTRIBUTE,
    "true",
  );

  /*
   * Using one @graph container prevents a page from accumulating multiple
   * unrelated script tags while still allowing multiple schema entities.
   */
  const jsonLd =
    validSchemas.length === 1
      ? validSchemas[0]
      : {
          "@context": "https://schema.org",
          "@graph": validSchemas,
        };

  try {
    script.textContent =
      JSON.stringify(
        jsonLd,
        null,
        0,
      );
  } catch (error) {
    console.error(
      "DivyaDhara JSON-LD serialization failed:",
      error,
    );
    return;
  }

  document.head.appendChild(
    script,
  );
}

/* ============================================================================
 * PAGE-LEVEL SEO
 * ========================================================================== */

export function useSEO({
  title,
  description,
  path = "/",
  image = SEO_DEFAULT_IMAGE,
  imageAlt = SEO_DEFAULT_IMAGE_ALT,
  type = "website",
  language = "en-IN",
  robots = SEO_DEFAULT_ROBOTS,
  alternates = [],
  schema,
  author,
  publishedTime,
  modifiedTime,
  section,
}: SEOProps): void {
  const normalizedTitle = limitSEOText(
    cleanSEOText(title) || SEO_SITE_NAME,
    70,
  );

  // Whitespace-only descriptions must not produce an empty meta description.
  const normalizedDescription = limitSEOText(
    cleanSEOText(description) || SEO_DEFAULT_DESCRIPTION,
    180,
  );

  const canonical = canonicalUrl(path || "/");
  const absoluteImage = absoluteUrl(
    cleanSEOText(image) || SEO_DEFAULT_IMAGE,
  );
  const normalizedImageAlt =
    cleanSEOText(imageAlt) || SEO_DEFAULT_IMAGE_ALT;
  const normalizedLanguage = cleanSEOText(language) || "en-IN";
  const normalizedRobots = formatRobots(robots);
  const normalizedAuthor = cleanSEOText(author);
  const normalizedPublishedTime = cleanSEOText(publishedTime);
  const normalizedModifiedTime = cleanSEOText(modifiedTime);
  const normalizedSection = cleanSEOText(section);

  /*
   * Serialize reference-type inputs so inline arrays/objects do not cause
   * unnecessary metadata DOM rewrites on every render.
   */
  const serializedAlternates = safeJSONStringify(alternates ?? []);
  const serializedSchema = schema !== undefined
    ? safeJSONStringify(schema)
    : "";

  useEffect(() => {
    if (typeof document === "undefined" || !document.head) {
      return;
    }

    /* Document basics */
    document.title = normalizedTitle;
    document.documentElement.lang = normalizedLanguage;

    /* Standard SEO */
    setMetaName("description", normalizedDescription);
    setMetaName("robots", normalizedRobots);
    setMetaName("googlebot", normalizedRobots);
    setMetaName("theme-color", "#fffaf5");
    setMetaName("application-name", SEO_SITE_NAME);

    if (normalizedAuthor) {
      setMetaName("author", normalizedAuthor);
    } else {
      removeMetaByName("author");
    }

    /* Canonical URL */
    setCanonical(canonical);

    /* Open Graph */
    setMetaProperty("og:title", normalizedTitle);
    setMetaProperty("og:description", normalizedDescription);
    setMetaProperty("og:url", canonical);
    setMetaProperty("og:image", absoluteImage);
    setMetaProperty("og:image:alt", normalizedImageAlt);
    setMetaProperty("og:type", type);
    setMetaProperty("og:site_name", SEO_SITE_NAME);
    setMetaProperty("og:locale", SEO_DEFAULT_LOCALE);

    if (normalizedPublishedTime) {
      setMetaProperty("article:published_time", normalizedPublishedTime);
    } else {
      removeMetaByProperty("article:published_time");
    }

    if (normalizedModifiedTime) {
      setMetaProperty("article:modified_time", normalizedModifiedTime);
    } else {
      removeMetaByProperty("article:modified_time");
    }

    if (normalizedSection) {
      setMetaProperty("article:section", normalizedSection);
    } else {
      removeMetaByProperty("article:section");
    }

    /* Twitter / X */
    setMetaName("twitter:card", "summary_large_image");
    setMetaName("twitter:title", normalizedTitle);
    setMetaName("twitter:description", normalizedDescription);
    setMetaName("twitter:image", absoluteImage);
    setMetaName("twitter:image:alt", normalizedImageAlt);

    /* Alternate language URLs */
    const parsedAlternates = safeJSONParse<SEOAlternate[]>(serializedAlternates);
    upsertAlternateLinks(
      Array.isArray(parsedAlternates) ? parsedAlternates : [],
    );

    /* JSON-LD: only scripts owned by this helper are replaced. */
    removeManagedSchema();

    if (serializedSchema) {
      const parsedSchema = safeJSONParse<
        Record<string, unknown> | Record<string, unknown>[]
      >(serializedSchema);

      if (parsedSchema) {
        addSchemaScript(parsedSchema);
      }
    }

    /*
     * Deliberately do not auto-scroll. Page scroll restoration belongs to the
     * router/layout, not SEO metadata management.
     */
  }, [
    normalizedTitle,
    normalizedDescription,
    canonical,
    absoluteImage,
    normalizedImageAlt,
    type,
    normalizedLanguage,
    normalizedRobots,
    normalizedAuthor,
    normalizedPublishedTime,
    normalizedModifiedTime,
    normalizedSection,
    serializedAlternates,
    serializedSchema,
  ]);
}

/* ============================================================================
 * JSON-LD HELPERS
 * ========================================================================== */

export function organizationSchema(
  options: {
    name?: string;
    url?: string;
    description?: string;
    email?: string;
    telephone?: string;
    sameAs?: string[];
  } = {},
): Record<string, unknown> {
  const sameAs = (
    options.sameAs ?? []
  )
    .map((item) => cleanSEOText(item))
    .filter((item) => Boolean(item))
    .map((item) => absoluteUrlIfNeeded(item))
    .filter((item) => /^https?:\/\//i.test(item));

  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      "Organization",
    name:
      cleanSEOText(
        options.name ||
          SEO_SITE_NAME,
      ),
    url:
      options.url
        ? absoluteUrl(options.url)
        : normalizeBaseUrl(
            SITE_URL,
          ),
    description:
      cleanSEOText(
        options.description ||
          SEO_DEFAULT_DESCRIPTION,
      ),
  };

  if (options.telephone) {
    schema.telephone =
      cleanSEOText(
        options.telephone,
      );
  }

  if (options.email) {
    schema.email =
      cleanSEOText(
        options.email,
      );
  }

  if (sameAs.length) {
    schema.sameAs =
      sameAs;
  }

  return schema;
}

/**
 * Backward-compatible alias used by existing pages.
 */
export function orgSchema(): Record<
  string,
  unknown
> {
  return organizationSchema({
    name: SEO_SITE_NAME,
    description:
      "India's digital spiritual ecosystem for temples, pandits, pujas, ashrams, courses, Panchang, festivals, yatras and Vedic astrology resources.",
  });
}

export function websiteSchema(
  options: {
    name?: string;
    url?: string;
    description?: string;
    searchPath?: string;
  } = {},
): Record<string, unknown> {
  const url =
    options.url
      ? absoluteUrl(options.url)
      : normalizeBaseUrl(
          SITE_URL,
        );

  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      "WebSite",
    name:
      cleanSEOText(
        options.name ||
          SEO_SITE_NAME,
      ),
    url,
    description:
      cleanSEOText(
        options.description ||
          SEO_DEFAULT_DESCRIPTION,
      ),
  };

  if (options.searchPath) {
    const target =
      absoluteUrl(
        options.searchPath,
      );

    schema.potentialAction = {
      "@type":
        "SearchAction",
      target,
      "query-input":
        "required name=query",
    };
  }

  return schema;
}

export function webPageSchema(
  options: {
    name: string;
    description: string;
    url: string;
    type?: string;
    image?: string;
    inLanguage?: string;
    isPartOf?: Record<string, unknown>;
    about?: Record<string, unknown> | Record<string, unknown>[];
  },
): Record<string, unknown> {
  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      options.type ||
      "WebPage",
    name:
      cleanSEOText(
        options.name,
      ),
    description:
      cleanSEOText(
        options.description,
      ),
    url:
      absoluteUrl(options.url),
    inLanguage:
      options.inLanguage ||
      "en-IN",
  };

  if (options.image) {
    schema.image =
      absoluteUrl(
        options.image,
      );
  }

  if (options.isPartOf) {
    schema.isPartOf =
      options.isPartOf;
  }

  if (options.about) {
    schema.about =
      options.about;
  }

  return schema;
}

export function breadcrumbSchema(
  items: Array<{
    name: string;
    url?: string;
  }>,
): Record<string, unknown> {
  const itemList =
    items
      .map((item) => ({
        name: cleanSEOText(
          item.name,
        ),
        url: item.url
          ? absoluteUrl(
              item.url,
            )
          : undefined,
      }))
      .filter(
        (item) =>
          Boolean(item.name),
      )
      .map(
        (item, index) => ({
          "@type":
            "ListItem",
          position:
            index + 1,
          name:
            item.name,
          ...(item.url
            ? {
                item:
                  item.url,
              }
            : {}),
        }),
      );

  return {
    "@context":
      "https://schema.org",
    "@type":
      "BreadcrumbList",
    itemListElement:
      itemList,
  };
}

export function itemListSchema(
  options: {
    name: string;
    url?: string;
    items: Array<{
      name: string;
      url: string;
      position?: number;
      image?: string;
      description?: string;
    }>;
  },
): Record<string, unknown> {
  return {
    "@context":
      "https://schema.org",
    "@type":
      "ItemList",
    name:
      cleanSEOText(
        options.name,
      ),
    ...(options.url
      ? {
          url: absoluteUrl(
            options.url,
          ),
        }
      : {}),
    itemListElement:
      options.items
        .map(
          (item, index) => ({
            "@type":
              "ListItem",
            position:
              item.position ??
              index + 1,
            name:
              cleanSEOText(
                item.name,
              ),
            url:
              absoluteUrl(
                item.url,
              ),
            ...(item.image
              ? {
                  image:
                    absoluteUrl(
                      item.image,
                    ),
                }
              : {}),
            ...(item.description
              ? {
                  description:
                    cleanSEOText(
                      item.description,
                    ),
                }
              : {}),
          }),
        ),
  };
}

export function faqSchema(
  items: Array<{
    question: string;
    answer: string;
  }>,
): Record<string, unknown> {
  return {
    "@context":
      "https://schema.org",
    "@type":
      "FAQPage",
    mainEntity:
      items
        .map(
          (item) => ({
            "@type":
              "Question",
            name:
              cleanSEOText(
                item.question,
              ),
            acceptedAnswer: {
              "@type":
                "Answer",
              text:
                cleanSEOText(
                  item.answer,
                ),
            },
          }),
        )
        .filter(
          (item) =>
            item.name &&
            item.acceptedAnswer
              .text,
        ),
  };
}

export function articleSchema(
  options: {
    headline: string;
    description: string;
    url: string;
    image?: string | string[];
    datePublished?: string;
    dateModified?: string;
    author?: {
      name: string;
      url?: string;
    };
    section?: string;
    inLanguage?: string;
  },
): Record<string, unknown> {
  const images = (
    Array.isArray(options.image)
      ? options.image
      : options.image
        ? [options.image]
        : []
  )
    .map((item) =>
      absoluteUrl(item),
    )
    .filter(Boolean);

  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      "Article",
    headline:
      cleanSEOText(
        options.headline,
      ),
    description:
      cleanSEOText(
        options.description,
      ),
    url:
      absoluteUrl(
        options.url,
      ),
    inLanguage:
      options.inLanguage ||
      "en-IN",
  };

  if (images.length) {
    schema.image =
      images;
  }

  if (options.datePublished) {
    schema.datePublished =
      options.datePublished;
  }

  if (options.dateModified) {
    schema.dateModified =
      options.dateModified;
  }

  if (options.author?.name) {
    schema.author = {
      "@type":
        "Person",
      name:
        cleanSEOText(
          options.author.name,
        ),
      ...(options.author.url
        ? {
            url:
              absoluteUrl(
                options.author.url,
              ),
          }
        : {}),
    };
  }

  if (options.section) {
    schema.articleSection =
      cleanSEOText(
        options.section,
      );
  }

  return schema;
}

export function serviceSchema(
  options: {
    name: string;
    description: string;
    url: string;
    provider?: {
      name: string;
      url?: string;
    };
    areaServed?: SEOAreaServed | SEOAreaServed[];
    image?: string;
  },
): Record<string, unknown> {
  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      "Service",
    name:
      cleanSEOText(
        options.name,
      ),
    description:
      cleanSEOText(
        options.description,
      ),
    url:
      absoluteUrl(
        options.url,
      ),
  };

  if (options.provider?.name) {
    schema.provider = {
      "@type":
        "Organization",
      name:
        cleanSEOText(
          options.provider.name,
        ),
      ...(options.provider.url
        ? {
            url:
              absoluteUrl(
                options.provider.url,
              ),
          }
        : {}),
    };
  }

  if (options.areaServed) {
    const areas: SEOAreaServed[] = Array.isArray(options.areaServed)
      ? options.areaServed
      : [options.areaServed];

    schema.areaServed = areas
      .map((area) => {
        if (typeof area === "string") {
          return {
            "@type": "AdministrativeArea",
            name: cleanSEOText(area),
          };
        }

        return {
          "@type": area.type || "AdministrativeArea",
          name: cleanSEOText(area.name),
        };
      })
      .filter((area) => Boolean(area.name));

    if ((schema.areaServed as unknown[]).length === 0) {
      delete schema.areaServed;
    }
  }

  if (options.image) {
    schema.image =
      absoluteUrl(
        options.image,
      );
  }

  return schema;
}

export function eventSchema(
  options: {
    name: string;
    description: string;
    url: string;
    startDate: string;
    endDate?: string;
    image?: string;
    location?: {
      name: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
    };
    organizer?: {
      name: string;
      url?: string;
    };
  },
): Record<string, unknown> {
  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      "Event",
    name:
      cleanSEOText(
        options.name,
      ),
    description:
      cleanSEOText(
        options.description,
      ),
    url:
      absoluteUrl(
        options.url,
      ),
    startDate:
      options.startDate,
  };

  if (options.endDate) {
    schema.endDate =
      options.endDate;
  }

  if (options.image) {
    schema.image =
      absoluteUrl(
        options.image,
      );
  }

  if (options.location?.name) {
    const address =
      options.location;

    schema.location = {
      "@type":
        "Place",
      name:
        cleanSEOText(
          address.name,
        ),
      ...(address.address ||
      address.city ||
      address.state ||
      address.country
        ? {
            address: {
              "@type":
                "PostalAddress",
              ...(address.address
                ? {
                    streetAddress:
                      cleanSEOText(
                        address.address,
                      ),
                  }
                : {}),
              ...(address.city
                ? {
                    addressLocality:
                      cleanSEOText(
                        address.city,
                      ),
                  }
                : {}),
              ...(address.state
                ? {
                    addressRegion:
                      cleanSEOText(
                        address.state,
                      ),
                  }
                : {}),
              ...(address.country
                ? {
                    addressCountry:
                      cleanSEOText(
                        address.country,
                      ),
                  }
                : {}),
            },
          }
        : {}),
    };
  }

  if (options.organizer?.name) {
    schema.organizer = {
      "@type":
        "Organization",
      name:
        cleanSEOText(
          options.organizer.name,
        ),
      ...(options.organizer.url
        ? {
            url:
              absoluteUrl(
                options.organizer.url,
              ),
          }
        : {}),
    };
  }

  return schema;
}

export function courseSchema(
  options: {
    name: string;
    description: string;
    url: string;
    provider?: {
      name: string;
      url?: string;
    };
    image?: string;
    inLanguage?: string;
  },
): Record<string, unknown> {
  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      "Course",
    name:
      cleanSEOText(
        options.name,
      ),
    description:
      cleanSEOText(
        options.description,
      ),
    url:
      absoluteUrl(
        options.url,
      ),
    inLanguage:
      options.inLanguage ||
      "en-IN",
  };

  if (options.image) {
    schema.image =
      absoluteUrl(
        options.image,
      );
  }

  if (options.provider?.name) {
    schema.provider = {
      "@type":
        "Organization",
      name:
        cleanSEOText(
          options.provider.name,
        ),
      ...(options.provider.url
        ? {
            url:
              absoluteUrl(
                options.provider.url,
              ),
          }
        : {}),
    };
  }

  return schema;
}

export function profilePageSchema(
  options: {
    name: string;
    description: string;
    url: string;
    image?: string;
    person?: {
      name: string;
      jobTitle?: string;
      image?: string;
      url?: string;
      telephone?: string;
      areaServed?: SEOAreaServed | SEOAreaServed[];
      knowsLanguage?: string[];
      knowsAbout?: string[];
      sameAs?: string[];
    };
  },
): Record<string, unknown> {
  const schema: Record<
    string,
    unknown
  > = {
    "@context":
      "https://schema.org",
    "@type":
      "ProfilePage",
    name:
      cleanSEOText(
        options.name,
      ),
    description:
      cleanSEOText(
        options.description,
      ),
    url:
      absoluteUrl(
        options.url,
      ),
  };

  if (options.image) {
    schema.image =
      absoluteUrl(
        options.image,
      );
  }

  if (options.person?.name) {
    const personLanguages = (options.person.knowsLanguage ?? [])
      .map(cleanSEOText)
      .filter(Boolean);
    const personKnowsAbout = (options.person.knowsAbout ?? [])
      .map(cleanSEOText)
      .filter(Boolean);
    const personSameAs = (options.person.sameAs ?? [])
      .map(cleanSEOText)
      .filter((item) => /^https?:\/\//i.test(item));
    const rawAreas = options.person.areaServed
      ? Array.isArray(options.person.areaServed)
        ? options.person.areaServed
        : [options.person.areaServed]
      : [];
    const personAreas = rawAreas
      .map((area) => typeof area === "string"
        ? { "@type": "AdministrativeArea", name: cleanSEOText(area) }
        : { "@type": area.type || "AdministrativeArea", name: cleanSEOText(area.name) }
      )
      .filter((area) => Boolean(area.name));

    schema.mainEntity = {
      "@type":
        "Person",
      name:
        cleanSEOText(
          options.person.name,
        ),
      ...(options.person.jobTitle
        ? {
            jobTitle:
              cleanSEOText(
                options.person
                  .jobTitle,
              ),
          }
        : {}),
      ...(options.person.image
        ? {
            image:
              absoluteUrl(
                options.person.image,
              ),
          }
        : {}),
      ...(options.person.url
        ? {
            url:
              absoluteUrl(
                options.person.url,
              ),
          }
        : {}),
      ...(options.person.telephone
        ? {
            telephone: cleanSEOText(options.person.telephone),
          }
        : {}),
      ...(personLanguages.length ? { knowsLanguage: personLanguages } : {}),
      ...(personKnowsAbout.length ? { knowsAbout: personKnowsAbout } : {}),
      ...(personSameAs.length ? { sameAs: personSameAs } : {}),
      ...(personAreas.length ? { areaServed: personAreas } : {}),
    };
  }

  return schema;
}

/* ============================================================================
 * SAFE JSON HELPERS
 * ========================================================================== */

function safeJSONStringify(
  value: unknown,
): string {
  try {
    const serialized =
      JSON.stringify(value);

    return typeof serialized ===
      "string"
      ? serialized
      : "";
  } catch (error) {
    console.error(
      "DivyaDhara SEO schema stringify failed:",
      error,
    );

    return "";
  }
}

function safeJSONParse<T>(
  value: string,
): T | null {
  try {
    return JSON.parse(
      value,
    ) as T;
  } catch (error) {
    console.error(
      "DivyaDhara SEO schema parse failed:",
      error,
    );

    return null;
  }
}

function absoluteUrlIfNeeded(
  value: string,
): string {
  return /^https?:\/\//i.test(
    value,
  )
    ? value
    : absoluteUrl(value);
}
