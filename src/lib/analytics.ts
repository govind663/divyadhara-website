/**
 * DivyaDhara — Google Analytics 4
 * File: src/lib/analytics.ts
 *
 * Google tag is loaded from index.html.
 * React Router handles page_view events.
 */

const GA_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ||
  "G-0SNJG66G5W";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;

    __divyaDharaGAInitialized?: boolean;
  }

  interface ImportMetaEnv {
    readonly VITE_GA_MEASUREMENT_ID?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

/**
 * Initialize Google Analytics once.
 *
 * If index.html has already initialized the Google tag,
 * do not load or initialize it a second time.
 */
export function initAnalytics(): void {
  if (typeof window === "undefined" || !GA_ID) {
    return;
  }

  // Google tag is already initialized in index.html.
  if (
    window.__divyaDharaGAInitialized &&
    typeof window.gtag === "function"
  ) {
    return;
  }

  // Prepare the Google tag event queue.
  window.dataLayer = window.dataLayer || [];

  // Create gtag only when it does not already exist.
  window.gtag =
    window.gtag ||
    ((...args: unknown[]) => {
      window.dataLayer!.push(args);
    });

  // Check whether the Google tag script already exists.
  const existingScript =
    document.getElementById("google-analytics-script") ||
    document.querySelector<HTMLScriptElement>(
      'script[src*="googletagmanager.com/gtag/js"]',
    );

  // Load the script only if it has not already been added.
  if (!existingScript) {
    const script = document.createElement("script");

    script.id = "google-analytics-script";
    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(GA_ID);

    document.head.appendChild(script);
  }

  // Initialize GA4 without automatic page_view events.
  // React Router sends page_view events manually.
  window.gtag("js", new Date());

  window.gtag("config", GA_ID, {
    send_page_view: false,
  });

  window.__divyaDharaGAInitialized = true;
}

/**
 * Track page views during React Router navigation.
 *
 * Example:
 * /pandits
 * /temples
 * /services?category=puja
 */
export function trackPageView(pagePath: string): void {
  if (
    typeof window === "undefined" ||
    !GA_ID ||
    typeof window.gtag !== "function"
  ) {
    return;
  }

  // Normalize the path.
  const normalizedPath = pagePath.startsWith("/")
    ? pagePath
    : `/${pagePath}`;

  // Build the absolute page URL safely.
  const pageLocation = new URL(
    normalizedPath,
    window.location.origin,
  );

  // Include pathname and query parameters.
  const fullPagePath =
    pageLocation.pathname + pageLocation.search;

  // Send the GA4 page_view event.
  window.gtag("event", "page_view", {
    page_title: document.title,
    page_location: pageLocation.href,
    page_path: fullPagePath,
  });
}