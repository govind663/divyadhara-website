
/**
 * DivyaDhara — Google Analytics 4
 * File: src/components/GoogleAnalytics.tsx
 *
 * Google tag is loaded from index.html.
 * React Router navigation is tracked through analytics.ts.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import {
  initAnalytics,
  trackPageView,
} from "../lib/analytics";

export default function GoogleAnalytics() {
  const location = useLocation();

  // Track pathname and query string changes.
  const pagePath = `${location.pathname}${location.search}`;

  // Avoid duplicate page views when React StrictMode reruns effects.
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    // Initialize analytics once (or reuse the tag from index.html).
    initAnalytics();

    // Avoid tracking the same route twice consecutively.
    if (lastTrackedPath.current === pagePath) {
      return;
    }

    // Record this route and send its page_view event.
    lastTrackedPath.current = pagePath;
    trackPageView(pagePath);
  }, [pagePath]);

  return null;
}