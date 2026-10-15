/**
 * DivyaDhara — Google Analytics React Router integration
 * File: src/components/GoogleAnalytics.tsx
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  initAnalytics,
  trackPageView,
} from "../lib/analytics";

export default function GoogleAnalytics() {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const pagePath =
      `${location.pathname}${location.search}`;

    trackPageView(pagePath);
  }, [location.pathname, location.search]);

  return null;
}