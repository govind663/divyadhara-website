/* eslint-disable no-extra-boolean-cast */

import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

type YouTubeResponse = {
  items?: Array<{
    id?: string;
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
      scheduledStartTime?: string;
      concurrentViewers?: string;
    };
  }>;

  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
};

type LiveCountValue = {
  live: boolean;
  viewers: number | null;
  updatedAt: string;
  message?: string;
};

type ApiSuccessResponse = {
  success: true;
  data: LiveCountValue;
  cached?: boolean;
};

type ApiErrorResponse = {
  success: false;
  code: string;
  message: string;
};

const CACHE_TTL_SECONDS = 20;
const STALE_WHILE_REVALIDATE_SECONDS = 10;
const YOUTUBE_TIMEOUT_MS = 10_000;

/**
 * YouTube video IDs are URL-safe and normally 11 characters.
 * Keeping the upper bound slightly wider allows future/edge-safe IDs
 * without accepting arbitrary input.
 */
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{6,32}$/;

/**
 * Normalize string input safely.
 */
function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

/**
 * Validate YouTube video ID.
 */
function isValidVideoId(
  videoId: string,
): boolean {
  return VIDEO_ID_REGEX.test(videoId);
}

/**
 * Send a standardized API error.
 */
function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
) {
  return res.status(status).json({
    success: false,
    code,
    message,
  } satisfies ApiErrorResponse);
}

/**
 * Build the standard successful live-count payload.
 */
function createLiveCountValue(
  live: boolean,
  viewers: number | null,
  message?: string,
): LiveCountValue {
  return {
    live,
    viewers,
    updatedAt: new Date().toISOString(),
    ...(message
      ? {
          message,
        }
      : {}),
  };
}

/**
 * Parse concurrent viewer count safely.
 */
function parseViewerCount(
  value: unknown,
): number | null {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(parsed),
  );
}

/**
 * Determine whether the YouTube stream is currently live.
 *
 * YouTube provides actualStartTime once a live broadcast has started,
 * and actualEndTime after it has ended.
 */
function isCurrentlyLive(
  details:
    | YouTubeResponse["items"][number]["liveStreamingDetails"]
    | undefined,
): boolean {
  if (!details) {
    return false;
  }

  return (
    Boolean(details.actualStartTime) &&
    !Boolean(details.actualEndTime)
  );
}

/**
 * Main Vercel serverless handler.
 *
 * Endpoint:
 *   GET /api/youtube/live-count?videoId=VIDEO_ID
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "live": true,
 *     "viewers": 1234,
 *     "updatedAt": "..."
 *   }
 * }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  /*
  |--------------------------------------------------------------------------
  | Response headers
  |--------------------------------------------------------------------------
  */

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8",
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );

  /*
  |--------------------------------------------------------------------------
  | CORS
  |--------------------------------------------------------------------------
  |
  | For same-origin production deployments, the frontend does not require
  | wildcard CORS. We use an explicit configured origin when available.
  |
  |--------------------------------------------------------------------------
  */

  const configuredOrigin =
    cleanString(
      process.env.CORS_ORIGINS,
    );

  const requestOrigin =
    cleanString(
      req.headers.origin,
    );

  if (configuredOrigin) {
    const allowedOrigins =
      configuredOrigin
        .split(",")
        .map((origin) =>
          origin.trim().replace(/\/$/, ""),
        )
        .filter(Boolean);

    const normalizedRequestOrigin =
      requestOrigin.replace(/\/$/, "");

    if (
      normalizedRequestOrigin &&
      allowedOrigins.includes(
        normalizedRequestOrigin,
      )
    ) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        normalizedRequestOrigin,
      );

      res.setHeader(
        "Vary",
        "Origin",
      );
    }
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS",
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-ID",
    ].join(", "),
  );

  /*
  |--------------------------------------------------------------------------
  | Preflight
  |--------------------------------------------------------------------------
  */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  /*
  |--------------------------------------------------------------------------
  | Method validation
  |--------------------------------------------------------------------------
  */

  if (req.method !== "GET") {
    res.setHeader(
      "Allow",
      "GET, OPTIONS",
    );

    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Feature flag
  |--------------------------------------------------------------------------
  |
  | Set:
  |   YOUTUBE_ENABLED=true
  |
  | By default the integration is enabled unless explicitly disabled.
  |--------------------------------------------------------------------------
  */

  const youtubeEnabled =
    process.env.YOUTUBE_ENABLED
      ?.trim()
      .toLowerCase() !== "false";

  if (!youtubeEnabled) {
    return sendError(
      res,
      503,
      "YOUTUBE_DISABLED",
      "YouTube integration is currently disabled.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Video ID
  |--------------------------------------------------------------------------
  */

  const videoId = cleanString(
    req.query.videoId,
  );

  if (!videoId) {
    return sendError(
      res,
      400,
      "VIDEO_ID_REQUIRED",
      "YouTube video ID is required.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Video ID validation
  |--------------------------------------------------------------------------
  */

  if (!isValidVideoId(videoId)) {
    return sendError(
      res,
      400,
      "INVALID_VIDEO_ID",
      "Invalid YouTube video ID.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | API key
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | Never use VITE_YOUTUBE_API_KEY.
  | The API key must remain server-side.
  |--------------------------------------------------------------------------
  */

  const apiKey =
    process.env.YOUTUBE_API_KEY?.trim();

  if (!apiKey) {
    console.error(
      "YOUTUBE_API_KEY environment variable is missing.",
    );

    return sendError(
      res,
      503,
      "YOUTUBE_NOT_CONFIGURED",
      "YouTube integration is not configured.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | YouTube Data API request
  |--------------------------------------------------------------------------
  */

  try {
    const youtubeUrl = new URL(
      "https://www.googleapis.com/youtube/v3/videos",
    );

    youtubeUrl.searchParams.set(
      "part",
      "liveStreamingDetails",
    );

    youtubeUrl.searchParams.set(
      "id",
      videoId,
    );

    youtubeUrl.searchParams.set(
      "key",
      apiKey,
    );

    /*
    |--------------------------------------------------------------------------
    | Timeout
    |--------------------------------------------------------------------------
    */

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(() => {
        controller.abort();
      }, YOUTUBE_TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(
        youtubeUrl.toString(),
        {
          method: "GET",

          headers: {
            Accept:
              "application/json",
          },

          signal:
            controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    /*
    |--------------------------------------------------------------------------
    | Parse response safely
    |--------------------------------------------------------------------------
    */

    let data: YouTubeResponse = {};

    try {
      data =
        (await response.json()) as YouTubeResponse;
    } catch {
      data = {};
    }

    /*
    |--------------------------------------------------------------------------
    | YouTube upstream error
    |--------------------------------------------------------------------------
    */

    if (!response.ok) {
      console.error(
        "YouTube API error:",
        {
          status:
            response.status,

          code:
            data?.error?.code,

          message:
            data?.error?.message,
        },
      );

      /*
       * Do not expose Google's raw error response to visitors.
       * The actual details remain in server logs.
       */

      return sendError(
        res,
        502,
        "YOUTUBE_UPSTREAM_ERROR",
        "Unable to fetch YouTube live data.",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Video lookup
    |--------------------------------------------------------------------------
    */

    const video =
      data.items?.[0];

    if (!video) {
      const value =
        createLiveCountValue(
          false,
          null,
          "Video not found.",
        );

      /*
       * Vercel/CDN can cache this short-lived response too.
       */
      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
      );

      return res.status(200).json({
        success: true,
        data: value,
        cached: false,
      } satisfies ApiSuccessResponse);
    }

    /*
    |--------------------------------------------------------------------------
    | Live stream details
    |--------------------------------------------------------------------------
    */

    const details =
      video.liveStreamingDetails;

    /*
    |--------------------------------------------------------------------------
    | Not a live stream
    |--------------------------------------------------------------------------
    */

    if (!details) {
      const value =
        createLiveCountValue(
          false,
          null,
          "Video is not currently a live broadcast.",
        );

      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
      );

      return res.status(200).json({
        success: true,
        data: value,
        cached: false,
      } satisfies ApiSuccessResponse);
    }

    /*
    |--------------------------------------------------------------------------
    | Determine live state
    |--------------------------------------------------------------------------
    */

    const live =
      isCurrentlyLive(
        details,
      );

    /*
    |--------------------------------------------------------------------------
    | Determine viewer count
    |--------------------------------------------------------------------------
    */

    const parsedViewers =
      parseViewerCount(
        details.concurrentViewers,
      );

    /*
     * Viewer count only has business meaning while the broadcast
     * is currently live.
     */
    const viewers =
      live
        ? parsedViewers
        : null;

    /*
    |--------------------------------------------------------------------------
    | Final business response
    |--------------------------------------------------------------------------
    */

    const value =
      createLiveCountValue(
        live,
        viewers,
        live &&
        viewers === null
          ? "Live viewer count is unavailable."
          : undefined,
      );

    /*
    |--------------------------------------------------------------------------
    | Edge/CDN cache
    |--------------------------------------------------------------------------
    |
    | 20 seconds cache keeps Google/YouTube API usage under control while
    | allowing the visitor UI to refresh frequently.
    |
    |--------------------------------------------------------------------------
    */

    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
    );

    /*
    |--------------------------------------------------------------------------
    | Request ID passthrough
    |--------------------------------------------------------------------------
    */

    const requestId =
      cleanString(
        req.headers["x-request-id"],
      );

    if (requestId) {
      res.setHeader(
        "X-Request-ID",
        requestId.slice(0, 200),
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Success
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,
      data: value,
      cached: false,
    } satisfies ApiSuccessResponse);
  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | Timeout
    |--------------------------------------------------------------------------
    */

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      console.error(
        "YouTube live-count request timed out.",
      );

      return sendError(
        res,
        504,
        "YOUTUBE_REQUEST_TIMEOUT",
        "YouTube live data request timed out.",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Network / unexpected error
    |--------------------------------------------------------------------------
    */

    console.error(
      "YouTube live-count request failed:",
      error,
    );

    return sendError(
      res,
      502,
      "YOUTUBE_REQUEST_FAILED",
      "Unable to fetch YouTube live data.",
    );
  }
}