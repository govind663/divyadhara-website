/**

DivyaDhara — Google Analytics 4

File: src/lib/analytics.ts
*/

const GA_ID = (
import.meta.env.VITE_GA_MEASUREMENT_ID ?? ""
).trim();

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

Initialize Google Analytics once.
*/
export function initAnalytics(): void {
if (typeof window === "undefined" || !GA_ID) {
return;
}

if (window.__divyaDharaGAInitialized) {
return;
}

window.dataLayer = window.dataLayer || [];

window.gtag =
window.gtag ||
((...args: unknown[]) => {
window.dataLayer!.push(args);
});

if (!document.getElementById("google-analytics-script")) {
const script = document.createElement("script");

script.id = "google-analytics-script";
script.async = true;
script.src =
  "https://www.googletagmanager.com/gtag/js?id=" +
  encodeURIComponent(GA_ID);

document.head.appendChild(script);

}

window.gtag("js", new Date());

window.gtag("config", GA_ID, {
send_page_view: false,
});

window.__divyaDharaGAInitialized = true;
}

/**

Track page views during React Router navigation.
*/
export function trackPageView(pagePath: string): void {
if (
typeof window === "undefined" ||
!GA_ID ||
!window.gtag
) {
return;
}

const normalizedPath = pagePath.startsWith("/")
? pagePath
: "/" + pagePath;

const pageLocation = new URL(
normalizedPath,
window.location.origin
);

const fullPagePath =
pageLocation.pathname + pageLocation.search;

window.gtag("event", "page_view", {
page_title: document.title,
page_location: pageLocation.href,
page_path: fullPagePath,
});
}