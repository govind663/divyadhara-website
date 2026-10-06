import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

export default function Layout() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    /*
     * Browser history can otherwise restore an old scroll position when
     * moving between React Router pages. This layout owns route-level
     * scroll restoration so every page starts from a predictable position.
     */
    const previousScrollRestoration =
      window.history.scrollRestoration;

    window.history.scrollRestoration = "manual";

    /*
     * Preserve normal hash-link behaviour. For a real in-page anchor such as
     * /about#mission, do not force the browser back to the top of the page.
     */
    if (!hash) {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    }

    return () => {
      window.history.scrollRestoration =
        previousScrollRestoration;
    };
  }, [pathname, hash]);

  return (
    <div className="min-h-screen bg-cream-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-xl focus:bg-orange-700 focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2"
      >
        Skip to content
      </a>

      <Header />

      <main
        id="main"
        tabIndex={-1}
        className="min-h-[60vh] outline-none"
      >
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
