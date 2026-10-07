/* eslint-disable @typescript-eslint/no-unused-vars */

import "dotenv/config";

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  closeDatabase,
  databasePath,
  getDatabaseStats,
  isDatabaseConnected,
} from "./db/database.ts";

import authRoutes from "./routes/auth.ts";
import adminRoutes from "./routes/admin.ts";
import panditRoutes from "./routes/pandit.ts";
import templeRoutes from "./routes/temples.ts";
import leadRoutes from "./routes/leads.ts";
import analyticsRoutes from "./routes/analytics.ts";
import salesRoutes from "./routes/sales.ts";
import subscriptionRoutes from "./routes/subscriptions.ts";
import paymentRoutes from "./routes/payments.ts";
import firebaseAuthRoutes from "./routes/firebase-auth.ts";
import ashramRoutes from "./routes/ashrams.ts";
import bookingRoutes from "./routes/bookings.ts";
import pujaServiceRoutes from "./routes/puja-services.ts";
import yatraRoutes from "./routes/yatra.ts";
import eventRoutes from "./routes/events.ts";
import courseRoutes from "./routes/courses.ts";
import spiritualPlaceRoutes from "./routes/spiritual-places.ts";
import seoRoutes from "./routes/seo.ts";
import youtubeRoutes from "./routes/youtube.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara API Server
|--------------------------------------------------------------------------
|
| Platform responsibilities
| -------------------------
| - Express + SQLite bootstrap
| - CORS and secure request handling
| - Razorpay raw webhook verification support
| - request IDs / structured request logging
| - authenticated business routers
| - explicit public vs protected route boundaries
| - health / diagnostics
| - final API 404 + global error handling
| - graceful HTTP + SQLite shutdown
|
| Core business principles
| ------------------------
| 1. SQLite is the canonical persistence layer.
| 2. Payments are authoritative only through payments.ts + verified gateway
|    webhooks; Sales/Analytics never fabricate payment state.
| 3. Lead creation/lifecycle belongs to leads.ts.
| 4. Subscription lifecycle belongs to subscriptions.ts.
| 5. Analytics never becomes the CRM lead system.
| 6. Catalogue modules keep their own business ownership.
| 7. Protected routers enforce their own RBAC in addition to authentication.
| 8. Ashram Manager routes are mounted at /api/ashrams and enforce their own
|    assignment-based access control in routes/ashrams.ts.
| 9. YouTube live viewer count is exposed through /api/youtube and the
|    YouTube API key remains server-side.
|--------------------------------------------------------------------------
*/

const app = express();

/*
|--------------------------------------------------------------------------
| Environment
|--------------------------------------------------------------------------
*/

const rawPort =
  process.env.PORT?.trim() || "3001";

const PORT = Number(rawPort);

const HOST =
  process.env.HOST?.trim() ||
  "0.0.0.0";

const NODE_ENV =
  process.env.NODE_ENV
    ?.trim()
    .toLowerCase() ||
  "development";

const IS_PRODUCTION =
  NODE_ENV === "production";

const API_VERSION =
  process.env.API_VERSION?.trim() ||
  "1.0.0";

const BODY_LIMIT =
  process.env.API_BODY_LIMIT?.trim() ||
  "1mb";

const WEBHOOK_BODY_LIMIT =
  process.env.RAZORPAY_WEBHOOK_BODY_LIMIT?.trim() ||
  "1mb";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/*
|--------------------------------------------------------------------------
| Runtime hardening
|--------------------------------------------------------------------------
*/

app.disable("x-powered-by");

/*
 * Only trust the first reverse-proxy hop in production.
 *
 * In development Express keeps its default trust-proxy behaviour so locally
 * supplied forwarded headers do not become trusted automatically.
 */
if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| Credentials are used because authentication/session cookies are part of the
| application flow. Origins must therefore be explicit rather than '*'.
|
| Development:
| - localhost:5173
| - 127.0.0.1:5173
| - localhost:4173
| - 127.0.0.1:4173
|
| Production:
| - only origins explicitly configured in CORS_ORIGINS are allowed
|--------------------------------------------------------------------------
*/

function normalizeOrigin(
  value: string,
): string {
  return value
    .trim()
    .replace(/\/$/, "");
}

const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

function getAllowedOrigins(): Set<string> {
  const configured =
    process.env.CORS_ORIGINS
      ?.split(",")
      .map(normalizeOrigin)
      .filter(Boolean) ?? [];

  const origins =
    new Set<string>(configured);

  /*
   * In development, local Vite origins are always allowed even when an
   * existing CORS_ORIGINS value contains only production domains.
   */
  if (!IS_PRODUCTION) {
    for (
      const origin of
        LOCAL_DEVELOPMENT_ORIGINS
    ) {
      origins.add(origin);
    }
  }

  /*
   * In production, DO NOT silently enable localhost CORS.
   *
   * If CORS_ORIGINS is missing in production, the API remains same-origin
   * accessible but does not grant cross-origin browser access.
   */
  return origins;
}

const ALLOWED_ORIGINS =
  getAllowedOrigins();

/*
|--------------------------------------------------------------------------
| CORS middleware
|--------------------------------------------------------------------------
*/

app.use(
  (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const originHeader =
      req.headers.origin;

    const origin =
      typeof originHeader === "string"
        ? normalizeOrigin(originHeader)
        : null;

    const isAllowedOrigin =
      !origin ||
      ALLOWED_ORIGINS.has(origin);

    /*
     * Explicitly grant CORS only to configured origins.
     */
    if (
      origin &&
      isAllowedOrigin
    ) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        origin,
      );

      res.setHeader(
        "Access-Control-Allow-Credentials",
        "true",
      );

      res.setHeader(
        "Vary",
        "Origin",
      );
    }

    /*
     * Keep the allow-list explicit.
     *
     * Cache-Control is particularly important for fetch requests using
     * cache: "no-store" / cache: "no-cache", because some browsers may send
     * a Cache-Control request header during preflight.
     */
    res.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Accept",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-Request-ID",
        "Cache-Control",
        "Pragma",
        "Expires",
      ].join(", "),
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    );

    res.setHeader(
      "Access-Control-Max-Age",
      "600",
    );

    /*
     * Preflight request.
     */
    if (
      req.method === "OPTIONS"
    ) {
      /*
       * Requests without Origin are not browser CORS requests and therefore
       * do not need an Origin allow-list decision.
       */
      if (
        origin &&
        !isAllowedOrigin
      ) {
        res.status(403).json({
          success: false,
          error:
            "CORS origin not allowed.",
        });

        return;
      }

      res.status(204).end();
      return;
    }

    /*
     * A browser will enforce the missing ACAO header for disallowed origins.
     * The request itself can still reach the application for same-origin,
     * server-to-server and non-browser callers.
     */
    next();
  },
);

/*
|--------------------------------------------------------------------------
| Request ID + request logger
|--------------------------------------------------------------------------
*/

function makeRequestId(): string {
  const timestamp =
    Date.now().toString(36);

  const random =
    Math.random()
      .toString(36)
      .slice(2, 10);

  return `${timestamp}-${random}`;
}

app.use(
  (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const suppliedRequestId =
      req.get("x-request-id");

    const requestId =
      suppliedRequestId
        ?.trim()
        .slice(0, 200) ||
      makeRequestId();

    res.setHeader(
      "X-Request-ID",
      requestId,
    );

    res.locals.requestId =
      requestId;

    const startedAt =
      process.hrtime.bigint();

    res.on("finish", () => {
      const elapsedNs =
        process.hrtime.bigint() -
        startedAt;

      const durationMs =
        Number(elapsedNs) /
        1_000_000;

      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(
          1,
        )}ms requestId=${requestId}`,
      );
    });

    next();
  },
);

/*
|--------------------------------------------------------------------------
| Razorpay webhook raw-body middleware
|--------------------------------------------------------------------------
|
| MUST run before express.json().
|
| Razorpay signatures are calculated against the exact raw request body.
|--------------------------------------------------------------------------
*/

app.use(
  "/api/payments/webhooks/razorpay",
  express.raw({
    type: [
      "application/json",
      "application/*+json",
      "text/json",
    ],
    limit:
      WEBHOOK_BODY_LIMIT,
  }),
);

/*
|--------------------------------------------------------------------------
| Ordinary request body parsing
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: BODY_LIMIT,
    strict: true,
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: BODY_LIMIT,
  }),
);

/*
|--------------------------------------------------------------------------
| Security + cache headers
|--------------------------------------------------------------------------
*/

app.use(
  (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    res.setHeader(
      "X-Content-Type-Options",
      "nosniff",
    );

    res.setHeader(
      "X-Frame-Options",
      "SAMEORIGIN",
    );

    res.setHeader(
      "Referrer-Policy",
      "strict-origin-when-cross-origin",
    );

    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );

    if (IS_PRODUCTION) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }

    /*
     * Auth, CRM, payment and analytics responses must not be cached by the
     * browser or an intermediary. Public catalogue routes can explicitly
     * opt into caching later when that is implemented.
     */
    if (
      !req.path.startsWith(
        "/api/dev",
      ) &&
      !req.path.startsWith(
        "/api/health",
      )
    ) {
      res.setHeader(
        "Cache-Control",
        "no-store",
      );
    }

    next();
  },
);

/*
|--------------------------------------------------------------------------
| Root API metadata
|--------------------------------------------------------------------------
*/

app.get(
  "/api",
  (
    _req: Request,
    res: Response,
  ) => {
    res.json({
      success: true,
      name: "DivyaDhara API",
      version: API_VERSION,
      environment: NODE_ENV,
      database: "SQLite",

      modules: {
        auth: "/api/auth",
        admin: "/api/admin",
        pandit: "/api/pandit",
        temples: "/api/temples",
        leads: "/api/leads",
        analytics:
          "/api/analytics",
        sales: "/api/sales",
        subscriptions:
          "/api/subscriptions",
        payments:
          "/api/payments",
        ashrams:
          "/api/ashrams",
        bookings:
          "/api/bookings",
        pujaServices:
          "/api/puja-services",
        yatra: "/api/yatra",
        events: "/api/events",
        courses: "/api/courses",
        spiritualPlaces:
          "/api/spiritual-places",
        seo: "/api/seo",
        youtube:
          "/api/youtube",
      },

      notes: {
        paymentAuthority:
          "payments",
        leadAuthority:
          "leads",
        subscriptionAuthority:
          "subscriptions",
        analyticsAuthority:
          "analytics",
        youtubeLiveCount:
          "youtube",
      },

      message:
        "DivyaDhara backend is running.",
    });
  },
);

/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

app.get(
  "/api/health",
  (
    _req: Request,
    res: Response,
  ) => {
    const connected =
      isDatabaseConnected();

    const stats = connected
      ? getDatabaseStats()
      : null;

    const healthy =
      connected &&
      Number.isInteger(PORT) &&
      PORT >= 1 &&
      PORT <= 65_535 &&
      (!stats ||
        stats.connected);

    res.status(
      healthy ? 200 : 503,
    ).json({
      success: healthy,
      service:
        "divyadhara-api",
      status: healthy
        ? "healthy"
        : "degraded",
      environment: NODE_ENV,
      version: API_VERSION,
      timestamp:
        new Date().toISOString(),
      requestId:
        res.locals.requestId ??
        null,

      database: {
        engine: "SQLite",
        connected,

        ...(stats
          ? {
              migrationVersion:
                stats.migrationVersion,

              activePlans:
                stats.activePlans,
            }
          : {}),
      },

      routes: {
        auth: "/api/auth",
        admin: "/api/admin",
        pandit: "/api/pandit",
        temples:
          "/api/temples",
        leads: "/api/leads",
        analytics:
          "/api/analytics",
        sales: "/api/sales",
        subscriptions:
          "/api/subscriptions",
        payments:
          "/api/payments",
        ashrams:
          "/api/ashrams",
        bookings:
          "/api/bookings",
        pujaServices:
          "/api/puja-services",
        yatra: "/api/yatra",
        events: "/api/events",
        courses: "/api/courses",
        spiritualPlaces:
          "/api/spiritual-places",
        seo: "/api/seo",
        youtube:
          "/api/youtube",
        youtubeLiveCount:
          "/api/youtube/live-count",
      },
    });
  },
);

/*
|--------------------------------------------------------------------------
| Development diagnostics
|--------------------------------------------------------------------------
|
| Database internals are never exposed in production.
|--------------------------------------------------------------------------
*/

if (!IS_PRODUCTION) {
  app.get(
    "/api/dev/database",
    (
      _req: Request,
      res: Response,
    ) => {
      const stats =
        getDatabaseStats();

      res.json({
        success: true,
        database: "SQLite",
        connected:
          isDatabaseConnected(),
        path: databasePath,
        stats,
      });
    },
  );
}

/*
|--------------------------------------------------------------------------
| API route mounts
|--------------------------------------------------------------------------
|
| All route modules present in server/routes are mounted here explicitly.
| Keep this section synchronized with the module registry returned by /api
| and /api/health so diagnostics never advertise an inactive endpoint.
|
| Firebase phone verification is mounted below /api/auth/firebase because the
| frontend uses /api/auth/firebase/verify. The normal auth router remains
| mounted at /api/auth.
|--------------------------------------------------------------------------
*/

/* Firebase phone verification / identity bridge */
app.use(
  "/api/auth/firebase",
  firebaseAuthRoutes,
);

/* Identity / account */
app.use(
  "/api/auth",
  authRoutes,
);

/* Super Admin control plane */
app.use(
  "/api/admin",
  adminRoutes,
);

/* Pandit self-service */
app.use(
  "/api/pandit",
  panditRoutes,
);

/* Public + Temple Manager operations */
app.use(
  "/api/temples",
  templeRoutes,
);

/* Public form intake + normalized CRM lead lifecycle */
app.use(
  "/api/leads",
  leadRoutes,
);

/* Visitor/session/page/event/conversion analytics */
app.use(
  "/api/analytics",
  analyticsRoutes,
);

/* Sales CRM / pipeline / renewals / operational visibility */
app.use(
  "/api/sales",
  salesRoutes,
);

/* Pandit / Temple / Ashram subscription lifecycle */
app.use(
  "/api/subscriptions",
  subscriptionRoutes,
);

/* Razorpay checkout / payment ledger / verification / refunds / webhooks */
app.use(
  "/api/payments",
  paymentRoutes,
);

/* Ashram catalogue + Ashram Manager operations */
app.use(
  "/api/ashrams",
  ashramRoutes,
);

/* Booking lifecycle + booking operations */
app.use(
  "/api/bookings",
  bookingRoutes,
);

/* Puja service catalogue + service operations */
app.use(
  "/api/puja-services",
  pujaServiceRoutes,
);

/* Yatra / pilgrimage catalogue + operations */
app.use(
  "/api/yatra",
  yatraRoutes,
);

/* Events catalogue + schedule / registration operations */
app.use(
  "/api/events",
  eventRoutes,
);

/* Courses catalogue + enrollment / management operations */
app.use(
  "/api/courses",
  courseRoutes,
);

/* Spiritual places catalogue + management operations */
app.use(
  "/api/spiritual-places",
  spiritualPlaceRoutes,
);

/* SEO metadata / location pages / sitemap / robots operations */
app.use(
  "/api/seo",
  seoRoutes,
);

/*
|--------------------------------------------------------------------------
| YouTube live-count API
|--------------------------------------------------------------------------
|
| Endpoint:
| GET /api/youtube/live-count?videoId=VIDEO_ID
|
| The YouTube API key stays on the backend. Frontend requests this local
| endpoint instead of calling Google/YouTube directly.
|--------------------------------------------------------------------------
*/

app.use(
  "/api/youtube",
  youtubeRoutes,
);

/*
|--------------------------------------------------------------------------
| API 404
|--------------------------------------------------------------------------
|
| Must remain after every mounted /api router.
|--------------------------------------------------------------------------
*/

app.use(
  "/api",
  (
    req: Request,
    res: Response,
  ) => {
    res.status(404).json({
      success: false,
      error:
        "API route not found",
      path: req.originalUrl,
      requestId:
        res.locals.requestId ??
        null,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Global error handler
|--------------------------------------------------------------------------
*/

type ApiError = {
  message?: string;
  status?: number;
  statusCode?: number;
  type?: string;
};

function statusFromError(
  error: unknown,
): number {
  const apiError =
    error as ApiError;

  if (
    typeof apiError.statusCode ===
    "number"
  ) {
    return apiError.statusCode;
  }

  if (
    typeof apiError.status ===
    "number"
  ) {
    return apiError.status;
  }

  if (
    apiError.type ===
    "entity.parse.failed"
  ) {
    return 400;
  }

  if (
    apiError.type ===
    "entity.too.large"
  ) {
    return 413;
  }

  return 500;
}

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error(
      "Unhandled API error:",
      error,
    );

    const apiError =
      error as ApiError;

    const candidateStatus =
      statusFromError(error);

    const status =
      candidateStatus >= 400 &&
      candidateStatus < 600
        ? candidateStatus
        : 500;

    let message =
      "Internal server error.";

    if (status === 400) {
      message =
        "Invalid request body.";
    } else if (
      status === 401
    ) {
      message =
        "Authentication required.";
    } else if (
      status === 403
    ) {
      message =
        "Access denied.";
    } else if (
      status === 404
    ) {
      message =
        "Resource not found.";
    } else if (
      status === 409
    ) {
      message =
        "Request conflicts with the current resource state.";
    } else if (
      status === 413
    ) {
      message =
        "Request body is too large.";
    } else if (
      !IS_PRODUCTION &&
      typeof apiError.message ===
        "string" &&
      apiError.message.trim()
    ) {
      message =
        apiError.message;
    }

    res.status(status).json({
      success: false,
      error: message,
      requestId:
        res.locals.requestId ??
        null,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Server lifecycle
|--------------------------------------------------------------------------
*/

let httpServer:
  | ReturnType<
      typeof app.listen
    >
  | undefined;

let shuttingDown = false;

function shutdown(
  signal: string,
): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    `\nReceived ${signal}. Shutting down...`,
  );

  const closeDatabaseSafely =
    (): void => {
      try {
        closeDatabase();

        console.log(
          "SQLite connection closed.",
        );
      } catch (error) {
        console.error(
          "Error while closing SQLite:",
          error,
        );
      }
    };

  if (!httpServer) {
    closeDatabaseSafely();

    process.exit(0);

    return;
  }

  httpServer.close(
    (
      error?: Error,
    ) => {
      if (error) {
        console.error(
          "Error while stopping HTTP server:",
          error,
        );
      }

      closeDatabaseSafely();

      process.exit(
        error ? 1 : 0,
      );
    },
  );

  setTimeout(() => {
    console.error(
      "Forced shutdown after timeout.",
    );

    try {
      closeDatabase();
    } catch {
      // Best-effort final cleanup.
    }

    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

function startServer(): void {
  if (!isDatabaseConnected()) {
    console.error(
      "❌ SQLite database connection failed.",
    );

    process.exit(1);

    return;
  }

  if (
    !Number.isInteger(PORT) ||
    PORT < 1 ||
    PORT > 65_535
  ) {
    console.error(
      `❌ Invalid PORT value: ${rawPort}`,
    );

    process.exit(1);

    return;
  }

  if (httpServer) {
    console.warn(
      "Server is already running.",
    );

    return;
  }

  httpServer = app.listen(
    PORT,
    HOST,
    () => {
      const stats =
        getDatabaseStats();

      console.log("");

      console.log(
        "==============================================",
      );

      console.log(
        "          DIVYADHARA API SERVER",
      );

      console.log(
        "==============================================",
      );

      console.log(
        `Environment     : ${NODE_ENV}`,
      );

      console.log(
        `Host            : ${HOST}`,
      );

      console.log(
        `Port            : ${PORT}`,
      );

      console.log(
        `API             : http://localhost:${PORT}/api`,
      );

      console.log(
        `Health          : http://localhost:${PORT}/api/health`,
      );

      console.log(
        `Auth            : http://localhost:${PORT}/api/auth`,
      );

      console.log(
        `Admin           : http://localhost:${PORT}/api/admin`,
      );

      console.log(
        `Pandit          : http://localhost:${PORT}/api/pandit`,
      );

      console.log(
        `Temples         : http://localhost:${PORT}/api/temples`,
      );

      console.log(
        `Leads           : http://localhost:${PORT}/api/leads`,
      );

      console.log(
        `Analytics       : http://localhost:${PORT}/api/analytics`,
      );

      console.log(
        `Sales           : http://localhost:${PORT}/api/sales`,
      );

      console.log(
        `Subscriptions   : http://localhost:${PORT}/api/subscriptions`,
      );

      console.log(
        `Payments        : http://localhost:${PORT}/api/payments`,
      );

      console.log(
        `Webhook         : http://localhost:${PORT}/api/payments/webhooks/razorpay`,
      );

      console.log(
        `Ashrams         : http://localhost:${PORT}/api/ashrams`,
      );

      console.log(
        `Bookings        : http://localhost:${PORT}/api/bookings`,
      );

      console.log(
        `Puja Services   : http://localhost:${PORT}/api/puja-services`,
      );

      console.log(
        `Yatra           : http://localhost:${PORT}/api/yatra`,
      );

      console.log(
        `Events          : http://localhost:${PORT}/api/events`,
      );

      console.log(
        `Courses         : http://localhost:${PORT}/api/courses`,
      );

      console.log(
        `Spiritual Places: http://localhost:${PORT}/api/spiritual-places`,
      );

      console.log(
        `SEO             : http://localhost:${PORT}/api/seo`,
      );

      console.log(
        `YouTube         : http://localhost:${PORT}/api/youtube`,
      );

      console.log(
        `YouTube Live    : http://localhost:${PORT}/api/youtube/live-count`,
      );

      console.log(
        "Database        : SQLite",
      );

      console.log(
        `Database OK     : ${
          stats.connected
            ? "true"
            : "false"
        }`,
      );

      console.log(
        `Migration       : ${
          stats.migrationVersion ??
          "unknown"
        }`,
      );

      console.log(
        `Active Plans    : ${
          stats.activePlans ??
          "unknown"
        }`,
      );

      console.log(
        "Webhook RawBody : enabled",
      );

      console.log(
        "YouTube Proxy   : enabled",
      );

      console.log(
        "CORS            : enabled",
      );

      console.log(
        `CORS Origins    : ${
          ALLOWED_ORIGINS.size
        } configured`,
      );

      console.log(
        "==============================================",
      );

      console.log("");
    },
  );

  httpServer.on(
    "error",
    (
      error: NodeJS.ErrnoException,
    ) => {
      console.error(
        "HTTP server error:",
        error,
      );

      if (
        error.code ===
        "EADDRINUSE"
      ) {
        console.error(
          `❌ Port ${PORT} is already in use.`,
        );
      }

      shutdown(
        "server-error",
      );
    },
  );
}

/*
|--------------------------------------------------------------------------
| Process signals / fatal error handling
|--------------------------------------------------------------------------
*/

process.on(
  "SIGINT",
  () => {
    shutdown("SIGINT");
  },
);

process.on(
  "SIGTERM",
  () => {
    shutdown("SIGTERM");
  },
);

process.on(
  "uncaughtException",
  (
    error: Error,
  ) => {
    console.error(
      "Uncaught exception:",
      error,
    );

    shutdown(
      "uncaughtException",
    );
  },
);

process.on(
  "unhandledRejection",
  (
    reason: unknown,
  ) => {
    console.error(
      "Unhandled promise rejection:",
      reason,
    );
  },
);

/*
|--------------------------------------------------------------------------
| Start application
|--------------------------------------------------------------------------
*/

startServer();

export {
  app,
  startServer,
};