/* eslint-disable react-hooks/refs */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { apiPatch, apiPost } from "../lib/api";

type AnalyticsResponse = {
  success?: boolean;
  tracking?: boolean;
  pageViewId?: number | string;
  visitorId?: number;
  sessionId?: number;
};

type ActivePage = {
  routeKey: string;
  path: string;
  pageViewId: number;
  startedAt: number;
  maxScroll: number;
  clicks: number;
  interactions: number;
  timer: ReturnType<typeof setInterval> | null;
  updatePromise: Promise<void> | null;
  exitUpdatePromise: Promise<void> | null;
  onScroll: () => void;
  onClick: (event: Event) => void;
  onInput: (event: Event) => void;
};

const PRIVATE_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/dashboard",
  "/pandit/dashboard",
  "/temple/dashboard",
  "/temple-manager/dashboard",
  "/ashram/dashboard",
  "/ashram-manager/dashboard",
  "/sales/dashboard",
  "/admin",
];

// Two different route-entry requests are serialized. This prevents a slow
// previous page-view POST from arriving after the next route has already been
// recorded and leaving the previous entry open in the database.
let pageViewQueue: Promise<void> = Promise.resolve();

// Send periodic updates less frequently to reduce analytics traffic and avoid
// contributing to API rate limits. Visibility/pagehide events still flush sooner.
const PAGE_UPDATE_INTERVAL_MS = 30_000;
const STARTUP_DELAY_MS = 0;
const API_TIMEOUT_MS = 8_000;
const UPDATE_TIMEOUT_MS = 5_000;

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function isTrackablePublicPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return !PRIVATE_PATHS.some(
    (privatePath) =>
      normalized === privatePath || normalized.startsWith(`${privatePath}/`),
  );
}

function currentScrollDepth(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  const documentElement = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || documentElement.scrollTop || 0;
  const documentHeight = Math.max(
    documentElement.scrollHeight,
    body?.scrollHeight ?? 0,
  );
  const scrollableHeight = documentHeight - window.innerHeight;

  if (scrollableHeight <= 0) return 100;
  return Math.max(
    0,
    Math.min(100, Math.round((scrollTop / scrollableHeight) * 100)),
  );
}

function pageTypeFromPath(path: string): string {
  const firstSegment = path.split("/").filter(Boolean)[0] || "home";
  return firstSegment.slice(0, 80);
}

function trackingPayload(path: string, previousPath: string | null) {
  const params = new URLSearchParams(window.location.search);
  let timezone: string | undefined;

  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    timezone = undefined;
  }

  return {
    path,
    previousPath,
    pageTitle: document.title || "DivyaDhara",
    pageType: pageTypeFromPath(path),
    referrerUrl: document.referrer || undefined,
    language: navigator.language || undefined,
    timezone,
    deviceType:
      window.innerWidth < 768
        ? "mobile"
        : window.innerWidth < 1024
          ? "tablet"
          : "desktop",
    screenWidth: window.screen?.width ?? window.innerWidth,
    screenHeight: window.screen?.height ?? window.innerHeight,
    utmSource: params.get("utm_source") || undefined,
    utmMedium: params.get("utm_medium") || undefined,
    utmCampaign: params.get("utm_campaign") || undefined,
    utmTerm: params.get("utm_term") || undefined,
    utmContent: params.get("utm_content") || undefined,
  };
}

function buildUpdatePayload(active: ActivePage, exitPage: boolean) {
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - active.startedAt) / 1000),
  );

  return {
    durationSeconds,
    scrollDepthPercent: active.maxScroll,
    clickCount: active.clicks,
    interactionCount: active.interactions,
    engaged:
      durationSeconds >= 10 ||
      active.maxScroll >= 50 ||
      active.clicks > 0 ||
      active.interactions > 0,
    exitPage,
  };
}

async function sendPageUpdate(
  active: ActivePage,
  exitPage: boolean,
  keepalive: boolean,
): Promise<void> {
  try {
    await apiPatch(
      `/api/analytics/page-view/${active.pageViewId}`,
      buildUpdatePayload(active, exitPage),
      { timeoutMs: UPDATE_TIMEOUT_MS, keepalive },
    );
  } catch {
    // Analytics is best-effort. It must never block navigation or UI actions.
  }
}

function updatePage(
  active: ActivePage,
  exitPage = false,
  keepalive = false,
): Promise<void> {
  if (exitPage) {
    if (active.exitUpdatePromise) return active.exitUpdatePromise;

    active.exitUpdatePromise = (async () => {
      if (active.updatePromise) await active.updatePromise;
      await sendPageUpdate(active, true, keepalive);
    })();
    return active.exitUpdatePromise;
  }

  if (active.exitUpdatePromise) return active.exitUpdatePromise;
  if (active.updatePromise) return active.updatePromise;

  const request = sendPageUpdate(active, false, keepalive);
  active.updatePromise = request;
  void request.then(() => {
    if (active.updatePromise === request) active.updatePromise = null;
  });
  return request;
}

function removeActivePageListeners(active: ActivePage): void {
  if (active.timer !== null) {
    clearInterval(active.timer);
    active.timer = null;
  }

  window.removeEventListener("scroll", active.onScroll);
  document.removeEventListener("click", active.onClick, true);
  document.removeEventListener("input", active.onInput, true);
}

function queuePageView(work: () => Promise<void>): Promise<void> {
  const task = pageViewQueue.then(work, work);
  // Keep the queue alive after a request failure while preserving ordering.
  pageViewQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function isValidPageViewId(value: unknown): value is number {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0;
}

export default function AnalyticsTracker() {
  const { pathname, search } = useLocation();
  const normalizedPath = normalizePathname(pathname);
  const routeKey = `${normalizedPath}${search}`;

  const routeKeyRef = useRef(routeKey);
  const activePageRef = useRef<ActivePage | null>(null);
  const previousPathRef = useRef<string | null>(null);
  // Keep this in render so an old async response can see a route change before
  // its new effect has started. The refs rule is disabled at the file level.
  routeKeyRef.current = routeKey;

  useEffect(() => {
    let cancelled = false;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;

    const existingActive = activePageRef.current;
    if (existingActive && existingActive.routeKey !== routeKey) {
      removeActivePageListeners(existingActive);
      // Do not mark exitPage here: the API currently treats exitPage=true as
      // ending the entire analytics session, whereas this is only an SPA route
      // transition. The next page-view POST closes the previous page view.
      void updatePage(existingActive, false);
      previousPathRef.current = existingActive.path;
      activePageRef.current = null;
    }

    const handlePageHide = () => {
      const active = activePageRef.current;
      if (active?.routeKey === routeKey) {
        // pagehide indicates a real document exit, so the server may end the
        // analytics session as well as close the current page view.
        void updatePage(active, true, true);
      }
    };

    const handleVisibilityChange = () => {
      const active = activePageRef.current;
      if (
        document.visibilityState === "hidden" &&
        active?.routeKey === routeKey
      ) {
        void updatePage(active, false, true);
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (isTrackablePublicPath(normalizedPath)) {
      const path = normalizedPath;
      const enteredAt = Date.now();

      // Deferring the request lets React Strict Mode's immediate setup/cleanup
      // cycle cancel the first setup before a duplicate request is sent.
      startupTimer = setTimeout(() => {
        if (cancelled || routeKeyRef.current !== routeKey) return;

        void queuePageView(async () => {
          // The route may have changed while this task was waiting in the queue.
          if (cancelled || routeKeyRef.current !== routeKey) return;

          let response: AnalyticsResponse;
          try {
            response = await apiPost<AnalyticsResponse>(
              "/api/analytics/page-view",
              trackingPayload(path, previousPathRef.current),
              { timeoutMs: API_TIMEOUT_MS },
            );
          } catch {
            // Do not retry in a tight loop when the API returns 429 or fails.
            return;
          }

          const pageViewId = Number(response.pageViewId);
          if (
            response.success !== true ||
            !isValidPageViewId(pageViewId) ||
            response.tracking === false
          ) {
            return;
          }

          // If the user navigated away while the POST was pending, still write
          // the elapsed time to the created row before the next queued page view
          // runs. This prevents a late POST from becoming an orphan open view.
          if (cancelled || routeKeyRef.current !== routeKey) {
            try {
              await apiPatch(
                `/api/analytics/page-view/${pageViewId}`,
                {
                  durationSeconds: Math.max(
                    0,
                    Math.floor((Date.now() - enteredAt) / 1000),
                  ),
                  scrollDepthPercent: currentScrollDepth(),
                  clickCount: 0,
                  interactionCount: 0,
                  engaged: Date.now() - enteredAt >= 10_000,
                  exitPage: false,
                },
                { timeoutMs: UPDATE_TIMEOUT_MS, keepalive: true },
              );
            } catch {
              // Best-effort final update; never interrupt route navigation.
            }
            return;
          }

          const active: ActivePage = {
            routeKey,
            path,
            pageViewId,
            startedAt: enteredAt,
            maxScroll: currentScrollDepth(),
            clicks: 0,
            interactions: 0,
            timer: null,
            updatePromise: null,
            exitUpdatePromise: null,
            onScroll: () => {
              const current = activePageRef.current;
              if (current?.pageViewId === pageViewId) {
                current.maxScroll = Math.max(
                  current.maxScroll,
                  currentScrollDepth(),
                );
              }
            },
            onClick: (event: Event) => {
              const current = activePageRef.current;
              const target = event.target;
              if (
                current?.pageViewId === pageViewId &&
                target instanceof Element &&
                target.closest("a,button,[role='button']")
              ) {
                current.clicks += 1;
              }
            },
            onInput: (event: Event) => {
              const current = activePageRef.current;
              const target = event.target;
              if (
                current?.pageViewId === pageViewId &&
                target instanceof Element &&
                target.closest("input,select,textarea,[contenteditable='true']")
              ) {
                current.interactions += 1;
              }
            },
          };

          const previousActive = activePageRef.current;
          if (previousActive) {
            if (previousActive.routeKey === routeKey) {
              // An existing active page means another tracker instance already
              // installed this route. Do not install duplicate listeners/timers.
              removeActivePageListeners(active);
              return;
            }
            removeActivePageListeners(previousActive);
            void updatePage(previousActive, false);
          }

          activePageRef.current = active;
          window.addEventListener("scroll", active.onScroll, { passive: true });
          document.addEventListener("click", active.onClick, true);
          document.addEventListener("input", active.onInput, true);
          active.timer = setInterval(() => {
            void updatePage(active, false);
          }, PAGE_UPDATE_INTERVAL_MS);
        });
      }, STARTUP_DELAY_MS);
    }

    return () => {
      cancelled = true;
      if (startupTimer !== null) clearTimeout(startupTimer);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      const active = activePageRef.current;
      if (active?.routeKey === routeKey) {
        removeActivePageListeners(active);
        // A route cleanup is not necessarily a document exit; don't end the
        // analytics session during React Router navigation.
        void updatePage(active, false);
        previousPathRef.current = active.path;
        activePageRef.current = null;
      }
    };
  }, [normalizedPath, routeKey, search]);

  return null;
}
