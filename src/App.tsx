import {
  useEffect,
  type ReactNode,
} from "react";

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import Layout from "./components/Layout";
import {
  AppProvider,
  useApp,
} from "./context/AppContext";

/* ============================================================================
 * PUBLIC / MAIN PAGES
 * ========================================================================== */

import Home from "./pages/Home";

import Temples from "./pages/Temples";
import TempleDetail from "./pages/TempleDetail";

import Services from "./pages/Services";
import ServiceDetail from "./pages/ServiceDetail";

import Pandits from "./pages/Pandits";
import PanditDetail from "./pages/PanditDetail";

import AshramList, {
  AshramDetail,
} from "./pages/Ashrams";

import {
  CourseList,
  CourseDetail,
} from "./pages/Courses";

import {
  Places,
  Packages,
  PlaceDetail,
  PackageDetail,
  PackageEnquiry,
} from "./pages/Yatra";

import {
  EventList,
  EventDetail,
} from "./pages/Events";

import { PanchangPage } from "./pages/Panchang";

import {
  Gallery,
  Videos,
  Articles,
  ArticleDetail,
} from "./pages/Media";

import {
  About,
  Contact,
} from "./pages/Info";

/* ============================================================================
 * SUBSCRIPTIONS / PRICING
 *
 * Public page:
 * - Users can view subscription plans without login.
 * - Actual checkout / activation remains controlled by backend/payment flow.
 * ========================================================================== */

import Subscriptions from "./pages/Subscriptions";

/* ============================================================================
 * AUTH
 * ========================================================================== */

import {
  Login,
  Register,
  Forgot,
} from "./pages/Auth";

/* ============================================================================
 * ACCOUNT
 * ========================================================================== */

import Dashboard from "./pages/Dashboard";

/* ============================================================================
 * ROLE DASHBOARDS
 * ========================================================================== */

import PanditDashboard from "./pages/PanditDashboard";
import TempleDashboard from "./pages/TempleDashboard";
import AshramDashboard from "./pages/AshramDashboard";
import SalesDashboard from "./pages/SalesDashboard";
import AdminDashboard from "./pages/AdminDashboard";

/* ============================================================================
 * FALLBACK
 * ========================================================================== */

import NotFound from "./pages/NotFound";

/* ============================================================================
 * SUPPORTED ROUTE ROLES
 *
 * Keep this local to the router so App.tsx remains compatible even when the
 * auth context is temporarily behind the backend role list.
 * ========================================================================== */

type SupportedRole =
  | "visitor"
  | "pandit"
  | "temple_manager"
  | "ashram_manager"
  | "sales"
  | "super_admin";

const SUPPORTED_ROLES: readonly SupportedRole[] = [
  "visitor",
  "pandit",
  "temple_manager",
  "ashram_manager",
  "sales",
  "super_admin",
];

function isSupportedRole(
  role: unknown,
): role is SupportedRole {
  return (
    typeof role === "string" &&
    SUPPORTED_ROLES.includes(role as SupportedRole)
  );
}

/* ============================================================================
 * SESSION LOADING UI
 * ========================================================================== */

function SessionLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#fdfaf5] px-5">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-orange-100">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-300 border-t-orange-700" />
        </div>

        <h1 className="mt-4 font-display text-xl font-semibold text-[#2a1a10]">
          Verifying session
        </h1>

        <p className="mt-1 text-sm text-stone-500">
          Please wait while DivyaDhara verifies your account.
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
 * AUTH / ROLE GUARD
 * ========================================================================== */

type RequireRoleProps = {
  roles: readonly SupportedRole[];
  children: ReactNode;
};

function RequireRole({
  roles,
  children,
}: RequireRoleProps) {
  const {
    user,
    isLoading,
  } = useApp();

  if (isLoading) {
    return <SessionLoader />;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  /**
   * Read runtime role defensively.
   * This keeps routing safe even if backend/context types are temporarily
   * out of sync with the role value returned by the server.
   */
  const role: unknown = user.role;

  if (!isSupportedRole(role)) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  if (!roles.includes(role)) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return <>{children}</>;
}

/* ============================================================================
 * APP ROUTES
 * ========================================================================== */

function AppRoutes() {
  return (
    <>
      <ScrollToTop />

      <Routes>
        {/* ====================================================================
         * PUBLIC WEBSITE + AUTH + VISITOR ACCOUNT
         *
         * All routes inside Layout render through the site's common layout.
         * ================================================================== */}
        <Route element={<Layout />}>

          {/* ------------------------------------------------------------------
           * HOME
           * ---------------------------------------------------------------- */}
          <Route
            index
            element={<Home />}
          />

          {/* ------------------------------------------------------------------
           * TEMPLES
           * ---------------------------------------------------------------- */}
          <Route
            path="temples"
            element={<Temples />}
          />

          <Route
            path="temples/:slug"
            element={<TempleDetail />}
          />

          <Route
            path="temple/:slug"
            element={
              <Navigate
                to="/temples"
                replace
              />
            }
          />

          {/* ------------------------------------------------------------------
           * PUJA SERVICES
           * ---------------------------------------------------------------- */}
          <Route
            path="services"
            element={<Services />}
          />

          <Route
            path="services/:slug"
            element={<ServiceDetail />}
          />

          <Route
            path="puja-services"
            element={
              <Navigate
                to="/services"
                replace
              />
            }
          />

          {/* ------------------------------------------------------------------
           * PANDITS
           * ---------------------------------------------------------------- */}
          <Route
            path="pandits"
            element={<Pandits />}
          />

          <Route
            path="pandits/:slug"
            element={<PanditDetail />}
          />

          <Route
            path="pandit/:slug"
            element={
              <Navigate
                to="/pandits"
                replace
              />
            }
          />

          {/* ------------------------------------------------------------------
           * ASHRAMS
           * ---------------------------------------------------------------- */}
          <Route
            path="ashrams"
            element={<AshramList />}
          />

          <Route
            path="ashrams/:slug"
            element={<AshramDetail />}
          />

          {/* ------------------------------------------------------------------
           * COURSES
           * ---------------------------------------------------------------- */}
          <Route
            path="courses"
            element={<CourseList />}
          />

          <Route
            path="courses/:slug"
            element={<CourseDetail />}
          />

          {/* ------------------------------------------------------------------
           * SUBSCRIPTIONS / PRICING
           *
           * Canonical:
           *   /subscriptions
           *
           * Public:
           *   No RequireRole wrapper here.
           *
           * Business rule:
           *   - Plan catalogue can be viewed publicly.
           *   - Fallback plans are informational only.
           *   - Purchase/activation is controlled by the payment/backend flow.
           * ---------------------------------------------------------------- */}
          <Route
            path="subscriptions"
            element={<Subscriptions />}
          />

          {/* Legacy / singular URL -> canonical URL */}
          <Route
            path="subscription"
            element={
              <Navigate
                to="/subscriptions"
                replace
              />
            }
          />

          {/* ------------------------------------------------------------------
           * PANCHANG / ASTROLOGY
           * ---------------------------------------------------------------- */}
          <Route
            path="panchang"
            element={<PanchangPage />}
          />

          <Route
            path="calendar"
            element={<PanchangPage />}
          />

          <Route
            path="rashifal"
            element={<PanchangPage />}
          />

          <Route
            path="kundli"
            element={<PanchangPage />}
          />

          <Route
            path="gochar"
            element={<PanchangPage />}
          />

          <Route
            path="jyotish"
            element={
              <Navigate
                to="/kundli"
                replace
              />
            }
          />

          <Route
            path="horoscope"
            element={
              <Navigate
                to="/rashifal"
                replace
              />
            }
          />

          {/* ------------------------------------------------------------------
           * EVENTS
           * ---------------------------------------------------------------- */}
          <Route
            path="events"
            element={<EventList />}
          />

          <Route
            path="events/:slug"
            element={<EventDetail />}
          />

          {/* ------------------------------------------------------------------
           * SPIRITUAL PLACES
           * ---------------------------------------------------------------- */}
          <Route
            path="spiritual-places"
            element={<Places />}
          />

          <Route
            path="spiritual-places/:slug"
            element={<PlaceDetail />}
          />

          <Route
            path="places"
            element={
              <Navigate
                to="/spiritual-places"
                replace
              />
            }
          />

          {/* ------------------------------------------------------------------
           * YATRA PACKAGES
           * ---------------------------------------------------------------- */}
          <Route
            path="packages"
            element={<Packages />}
          />

          <Route
            path="packages/:slug"
            element={<PackageDetail />}
          />

          <Route
            path="packages/:slug/enquiry"
            element={<PackageEnquiry />}
          />

          <Route
            path="yatra-packages"
            element={
              <Navigate
                to="/packages"
                replace
              />
            }
          />

          {/* ------------------------------------------------------------------
           * MEDIA
           * ---------------------------------------------------------------- */}
          <Route
            path="gallery"
            element={<Gallery />}
          />

          <Route
            path="videos"
            element={<Videos />}
          />

          <Route
            path="articles"
            element={<Articles />}
          />

          <Route
            path="articles/:slug"
            element={<ArticleDetail />}
          />

          {/* ------------------------------------------------------------------
           * INFORMATION
           * ---------------------------------------------------------------- */}
          <Route
            path="about"
            element={<About />}
          />

          <Route
            path="contact"
            element={<Contact />}
          />

          {/* ------------------------------------------------------------------
           * AUTHENTICATION
           * ---------------------------------------------------------------- */}
          <Route
            path="login"
            element={<Login />}
          />

          <Route
            path="register"
            element={<Register />}
          />

          <Route
            path="forgot-password"
            element={<Forgot />}
          />

          {/* ------------------------------------------------------------------
           * VISITOR DASHBOARD
           * ---------------------------------------------------------------- */}
          <Route
            path="dashboard"
            element={
              <RequireRole roles={["visitor"]}>
                <Dashboard />
              </RequireRole>
            }
          />
        </Route>

        {/* ====================================================================
         * PANDIT DASHBOARD
         * ================================================================== */}
        <Route
          path="pandit/dashboard"
          element={
            <RequireRole roles={["pandit"]}>
              <PanditDashboard />
            </RequireRole>
          }
        />

        {/* ====================================================================
         * TEMPLE MANAGER DASHBOARD
         *
         * Canonical:
         *   /temple/dashboard
         *
         * Legacy:
         *   /temple-manager/dashboard
         * ================================================================== */}

        <Route
          path="temple/dashboard"
          element={
            <RequireRole roles={["temple_manager"]}>
              <TempleDashboard />
            </RequireRole>
          }
        />

        <Route
          path="temple-manager/dashboard"
          element={
            <Navigate
              to="/temple/dashboard"
              replace
            />
          }
        />

        {/* ====================================================================
         * ASHRAM MANAGER DASHBOARD
         *
         * Canonical:
         *   /ashram/dashboard
         *
         * Legacy:
         *   /ashram-manager/dashboard
         * ================================================================== */}

        <Route
          path="ashram/dashboard"
          element={
            <RequireRole roles={["ashram_manager"]}>
              <AshramDashboard />
            </RequireRole>
          }
        />

        <Route
          path="ashram-manager/dashboard"
          element={
            <Navigate
              to="/ashram/dashboard"
              replace
            />
          }
        />

        {/* ====================================================================
         * SALES DASHBOARD
         * ================================================================== */}

        <Route
          path="sales/dashboard"
          element={
            <RequireRole roles={["sales"]}>
              <SalesDashboard />
            </RequireRole>
          }
        />

        {/* ====================================================================
         * SUPER ADMIN
         * ================================================================== */}

        <Route
          path="admin/dashboard"
          element={
            <RequireRole roles={["super_admin"]}>
              <AdminDashboard />
            </RequireRole>
          }
        />

        {/* Legacy admin URL */}
        <Route
          path="admin"
          element={
            <Navigate
              to="/admin/dashboard"
              replace
            />
          }
        />

        {/* ====================================================================
         * 404
         *
         * IMPORTANT:
         * This catch-all route must stay LAST.
         * ================================================================== */}
        <Route
          path="*"
          element={<NotFound />}
        />
      </Routes>
    </>
  );
}

/* ============================================================================
 * SCROLL TO TOP
 * ========================================================================== */

function ScrollToTop() {
  const {
    pathname,
    search,
  } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [pathname, search]);

  return null;
}

/* ============================================================================
 * APP ROOT
 * ========================================================================== */

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}