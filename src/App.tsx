import {
  Component,
  lazy,
  Suspense,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import Layout from "./components/Layout";
// import AnalyticsTracker from "./components/AnalyticsTracker";
import { AppProvider, useApp } from "./context/AppContext";

/**
 * DivyaDhara application routes.
 *
 * Important:
 * - Keep actual <Route> elements as direct children of <Routes>.
 * - Public pages are lazy-loaded to reduce the initial JavaScript bundle.
 * - Dashboard routes are protected by role.
 * - The backend must independently enforce authorization for protected APIs.
 */

/* -------------------------------------------------------------------------- */
/* Lazy page imports                                                          */
/* -------------------------------------------------------------------------- */

const Home = lazy(() => import("./pages/Home"));

const Temples = lazy(() => import("./pages/Temples"));
const TempleDetail = lazy(() => import("./pages/TempleDetail"));

const Services = lazy(() => import("./pages/Services"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));

const Pandits = lazy(() => import("./pages/Pandits"));
const PanditDetail = lazy(() => import("./pages/PanditDetail"));

const AshramList = lazy(() =>
  import("./pages/Ashrams").then((module) => ({
    default: module.default,
  })),
);
const AshramDetail = lazy(() =>
  import("./pages/Ashrams").then((module) => ({
    default: module.AshramDetail,
  })),
);

const CourseList = lazy(() =>
  import("./pages/Courses").then((module) => ({
    default: module.CourseList,
  })),
);
const CourseDetail = lazy(() =>
  import("./pages/Courses").then((module) => ({
    default: module.CourseDetail,
  })),
);

const Places = lazy(() =>
  import("./pages/Yatra").then((module) => ({
    default: module.Places,
  })),
);
const Packages = lazy(() =>
  import("./pages/Yatra").then((module) => ({
    default: module.Packages,
  })),
);
const PlaceDetail = lazy(() =>
  import("./pages/Yatra").then((module) => ({
    default: module.PlaceDetail,
  })),
);
const PackageDetail = lazy(() =>
  import("./pages/Yatra").then((module) => ({
    default: module.PackageDetail,
  })),
);
const PackageEnquiry = lazy(() =>
  import("./pages/Yatra").then((module) => ({
    default: module.PackageEnquiry,
  })),
);

const EventList = lazy(() =>
  import("./pages/Events").then((module) => ({
    default: module.EventList,
  })),
);
const EventDetail = lazy(() =>
  import("./pages/Events").then((module) => ({
    default: module.EventDetail,
  })),
);

const PanchangPage = lazy(() =>
  import("./pages/Panchang").then((module) => ({
    default: module.PanchangPage,
  })),
);

const Gallery = lazy(() =>
  import("./pages/Media").then((module) => ({
    default: module.Gallery,
  })),
);
const Videos = lazy(() =>
  import("./pages/Media").then((module) => ({
    default: module.Videos,
  })),
);
const Articles = lazy(() =>
  import("./pages/Media").then((module) => ({
    default: module.Articles,
  })),
);
const ArticleDetail = lazy(() =>
  import("./pages/Media").then((module) => ({
    default: module.ArticleDetail,
  })),
);

const About = lazy(() =>
  import("./pages/Info").then((module) => ({
    default: module.About,
  })),
);
const Contact = lazy(() =>
  import("./pages/Info").then((module) => ({
    default: module.Contact,
  })),
);

const Subscriptions = lazy(() => import("./pages/Subscriptions"));

const Login = lazy(() =>
  import("./pages/Auth").then((module) => ({
    default: module.Login,
  })),
);
const Register = lazy(() =>
  import("./pages/Auth").then((module) => ({
    default: module.Register,
  })),
);
const Forgot = lazy(() =>
  import("./pages/Auth").then((module) => ({
    default: module.Forgot,
  })),
);

const Dashboard = lazy(() => import("./pages/Dashboard"));
const PanditDashboard = lazy(() => import("./pages/PanditDashboard"));
const TempleDashboard = lazy(() => import("./pages/TempleDashboard"));
const AshramDashboard = lazy(() => import("./pages/AshramDashboard"));
const SalesDashboard = lazy(() => import("./pages/SalesDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));

/* -------------------------------------------------------------------------- */
/* Roles and access guard                                                     */
/* -------------------------------------------------------------------------- */

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

function isSupportedRole(role: unknown): role is SupportedRole {
  return (
    typeof role === "string" &&
    SUPPORTED_ROLES.includes(role as SupportedRole)
  );
}

/* -------------------------------------------------------------------------- */
/* Loading and error states                                                   */
/* -------------------------------------------------------------------------- */

function RouteLoader() {
  return (
    <div
      className="grid min-h-[60vh] place-items-center bg-[#fdfaf5] px-5"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-orange-100">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-300 border-t-orange-700" />
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold text-[#2a1a10]">
          DivyaDhara
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Loading your page. Please wait…
        </p>
      </div>
    </div>
  );
}

function SessionLoader() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-[#fdfaf5] px-5"
      role="status"
      aria-live="polite"
    >
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

type ErrorBoundaryState = {
  hasError: boolean;
};

type AppErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep details in the developer console without exposing internals to visitors.
    console.error("DivyaDhara page render failed:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Readonly<AppErrorBoundaryProps>) {
    // Reset only the error state on route changes. Do not key/remount the whole
    // AppRoutes tree: that would remount AnalyticsTracker and all route effects
    // on every navigation, producing unnecessary API requests and page views.
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-[#fdfaf5] px-5 py-12">
          <div className="w-full max-w-lg rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-[#2a1a10]">
              Page could not be loaded
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Something went wrong while opening this page. Please reload and
              try again.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-700 px-5 py-2.5 font-medium text-white transition hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
            >
              Reload page
            </button>
            <Link
              to="/"
              className="ml-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-200 px-5 py-2.5 font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
            >
              Return to home
            </Link>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/* Role guard                                                                 */
/* -------------------------------------------------------------------------- */

type RequireRoleProps = {
  roles: readonly SupportedRole[];
  children: ReactNode;
};

function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, isLoading } = useApp();

  if (isLoading) {
    return <SessionLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role: unknown = user.role;

  if (!isSupportedRole(role) || !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/* -------------------------------------------------------------------------- */
/* Scroll management                                                          */
/* -------------------------------------------------------------------------- */

function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* IMPORTANT: only <Route> elements/fragments may be children of <Routes>.     */
/* -------------------------------------------------------------------------- */

function AppRoutes() {
  return (
    <>
      {/* <AnalyticsTracker /> */}
      <ScrollToTop />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          {/* Public pages share the main site layout. */}
          <Route element={<Layout />}>
            <Route index element={<Home />} />

            {/* Temples */}
            <Route path="temples" element={<Temples />} />
            <Route path="temples/:slug" element={<TempleDetail />} />
            <Route path="temple/:slug" element={<Navigate to="/temples" replace />} />

            {/* Services */}
            <Route path="services" element={<Services />} />
            <Route path="services/:slug" element={<ServiceDetail />} />
            <Route path="puja-services" element={<Navigate to="/services" replace />} />

            {/* Pandits */}
            <Route path="pandits" element={<Pandits />} />
            <Route path="pandits/:slug" element={<PanditDetail />} />
            <Route path="pandit/:slug" element={<Navigate to="/pandits" replace />} />

            {/* Ashrams */}
            <Route path="ashrams" element={<AshramList />} />
            <Route path="ashrams/:slug" element={<AshramDetail />} />

            {/* Courses */}
            <Route path="courses" element={<CourseList />} />
            <Route path="courses/:slug" element={<CourseDetail />} />

            {/* Subscriptions */}
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="subscription" element={<Navigate to="/subscriptions" replace />} />

            {/* Panchang and astrology */}
            <Route path="panchang" element={<PanchangPage />} />
            <Route path="calendar" element={<PanchangPage />} />
            <Route path="rashifal" element={<PanchangPage />} />
            <Route path="kundli" element={<PanchangPage />} />
            <Route path="gochar" element={<PanchangPage />} />
            <Route path="jyotish" element={<Navigate to="/kundli" replace />} />
            <Route path="horoscope" element={<Navigate to="/rashifal" replace />} />

            {/* Events */}
            <Route path="events" element={<EventList />} />
            <Route path="events/:slug" element={<EventDetail />} />

            {/* Yatra and spiritual places */}
            <Route path="spiritual-places" element={<Places />} />
            <Route path="spiritual-places/:slug" element={<PlaceDetail />} />
            <Route path="places" element={<Navigate to="/spiritual-places" replace />} />
            <Route path="packages" element={<Packages />} />
            <Route path="packages/:slug" element={<PackageDetail />} />
            <Route path="packages/:slug/enquiry" element={<PackageEnquiry />} />
            <Route path="yatra-packages" element={<Navigate to="/packages" replace />} />

            {/* Media */}
            <Route path="gallery" element={<Gallery />} />
            <Route path="videos" element={<Videos />} />
            <Route path="articles" element={<Articles />} />
            <Route path="articles/:slug" element={<ArticleDetail />} />

            {/* Information */}
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />

            {/* Authentication */}
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<Forgot />} />

            {/* Visitor account */}
            <Route
              path="dashboard"
              element={
                <RequireRole roles={["visitor"]}>
                  <Dashboard />
                </RequireRole>
              }
            />
          </Route>

          {/* Role-specific dashboards are outside the public layout. */}
          <Route
            path="/pandit/dashboard"
            element={
              <RequireRole roles={["pandit"]}>
                <PanditDashboard />
              </RequireRole>
            }
          />

          <Route
            path="/temple/dashboard"
            element={
              <RequireRole roles={["temple_manager"]}>
                <TempleDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/temple-manager/dashboard"
            element={<Navigate to="/temple/dashboard" replace />}
          />

          <Route
            path="/ashram/dashboard"
            element={
              <RequireRole roles={["ashram_manager"]}>
                <AshramDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/ashram-manager/dashboard"
            element={<Navigate to="/ashram/dashboard" replace />}
          />

          <Route
            path="/sales/dashboard"
            element={
              <RequireRole roles={["sales", "super_admin"]}>
                <SalesDashboard />
              </RequireRole>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
              <RequireRole roles={["super_admin"]}>
                <AdminDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={<Navigate to="/admin/dashboard" replace />}
          />

          {/* Keep the catch-all route last. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Route-aware error boundary                                                 */
/* Reset the boundary when the user navigates to another pathname, so a      */
/* failed page does not force a full browser reload to leave the error screen. */
/* -------------------------------------------------------------------------- */

function RouteErrorBoundary() {
  const { pathname } = useLocation();

  return (
    <AppErrorBoundary resetKey={pathname}>
      <AppRoutes />
    </AppErrorBoundary>
  );
}

/* -------------------------------------------------------------------------- */
/* Application root                                                           */
/* -------------------------------------------------------------------------- */

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <RouteErrorBoundary />
      </AppProvider>
    </BrowserRouter>
  );
}
