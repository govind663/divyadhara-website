/* eslint-disable no-extra-boolean-cast */

import { Router } from "express";

const router = Router();

/**
 * YouTube API response
 */
type YoutubeVideosResponse = {
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

/**
 * API response returned by our backend
 */
type LiveCountValue = {
  live: boolean;
  viewers: number | null;
  updatedAt: string;
  message?: string;
};

/**
 * In-memory cache entry
 */
type CacheEntry = {
  expiresAt: number;
  value: LiveCountValue;
};

/**
 * Business requirement:
 * Don't call YouTube API on every frontend request.
 */
const CACHE_TTL_MS = 20_000;

/**
 * YouTube request timeout.
 */
const YOUTUBE_REQUEST_TIMEOUT_MS = 10_000;

/**
 * YouTube video ID format.
 */
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{6,32}$/;

/**
 * Simple in-memory cache.
 *
 * Key   => YouTube video ID
 * Value => cached live-count response
 */
const cache = new Map<string, CacheEntry>();

/**
 * Clean incoming video ID.
 */
function cleanVideoId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

/**
 * Validate YouTube video ID.
 */
function isValidVideoId(videoId: string): boolean {
  return VIDEO_ID_REGEX.test(videoId);
}

/**
 * Create standardized live count response.
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
    ...(message ? { message } : {}),
  };
}

/**
 * Save value to cache.
 */
function setCache(videoId: string, value: LiveCountValue): void {
  cache.set(videoId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

/**
 * Get valid cached value.
 */
function getCache(videoId: string): LiveCountValue | null {
  const entry = cache.get(videoId);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(videoId);
    return null;
  }

  return entry.value;
}

/**
 * Remove expired cache entries.
 *
 * This prevents the in-memory cache from growing forever
 * when many different video IDs are requested.
 */
function cleanupExpiredCache(): void {
  const now = Date.now();

  for (const [videoId, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(videoId);
    }
  }
}

/**
 * GET /live-count
 *
 * Query:
 *   ?videoId=YOUTUBE_VIDEO_ID
 *
 * Success:
 * {
 *   "success": true,
 *   "data": {
 *     "live": true,
 *     "viewers": 1250,
 *     "updatedAt": "2026-10-07T06:15:00.000Z"
 *   }
 * }
 */
router.get("/live-count", async (req, res) => {
  const videoId = cleanVideoId(req.query.videoId);

  /**
   * 1. Required parameter validation
   */
  if (!videoId) {
    return res.status(400).json({
      success: false,
      code: "VIDEO_ID_REQUIRED",
      message: "YouTube video ID is required.",
    });
  }

  /**
   * 2. Format validation
   */
  if (!isValidVideoId(videoId)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_VIDEO_ID",
      message: "Invalid YouTube video ID.",
    });
  }

  /**
   * 3. Check cache first
   */
  const cachedValue = getCache(videoId);

  if (cachedValue) {
    return res.json({
      success: true,
      data: cachedValue,
      cached: true,
    });
  }

  /**
   * Cleanup old cache entries periodically.
   */
  cleanupExpiredCache();

  /**
   * 4. Get YouTube API key
   */
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  if (!apiKey) {
    return res.status(503).json({
      success: false,
      code: "YOUTUBE_NOT_CONFIGURED",
      message: "YouTube integration is not configured.",
    });
  }

  /**
   * 5. Call YouTube Data API
   */
  try {
    const youtubeUrl = new URL(
      "https://www.googleapis.com/youtube/v3/videos",
    );

    youtubeUrl.searchParams.set("part", "liveStreamingDetails");
    youtubeUrl.searchParams.set("id", videoId);
    youtubeUrl.searchParams.set("key", apiKey);

    /**
     * AbortController is used instead of relying on
     * AbortSignal.timeout() for broader Node compatibility.
     */
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, YOUTUBE_REQUEST_TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(youtubeUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    /**
     * 6. Parse YouTube response safely
     */
    let payload: YoutubeVideosResponse = {};

    try {
      payload = (await response.json()) as YoutubeVideosResponse;
    } catch {
      payload = {};
    }

    /**
     * 7. Handle YouTube API errors
     */
    if (!response.ok) {
      console.error("YouTube API error:", {
        status: response.status,
        message: payload?.error?.message,
        code: payload?.error?.code,
      });

      /**
       * API key / quota / authorization errors
       */
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403
      ) {
        return res.status(502).json({
          success: false,
          code: "YOUTUBE_API_ERROR",
          message: "YouTube API request was rejected.",
        });
      }

      return res.status(502).json({
        success: false,
        code: "YOUTUBE_UPSTREAM_ERROR",
        message: "Unable to fetch YouTube live data.",
      });
    }

    /**
     * 8. Find requested video
     */
    const item = payload.items?.[0];

    /**
     * Video does not exist / cannot be accessed
     */
    if (!item) {
      const value = createLiveCountValue(
        false,
        null,
        "Video not found.",
      );

      setCache(videoId, value);

      return res.json({
        success: true,
        data: value,
        cached: false,
      });
    }

    /**
     * 9. Extract live streaming details
     */
    const details = item.liveStreamingDetails;

    /**
     * Video exists but is not a live broadcast.
     */
    if (!details) {
      const value = createLiveCountValue(
        false,
        null,
        "Video is not currently a live broadcast.",
      );

      setCache(videoId, value);

      return res.json({
        success: true,
        data: value,
        cached: false,
      });
    }

    /**
     * 10. Determine whether stream is currently live.
     *
     * YouTube provides:
     * - actualStartTime when stream started
     * - actualEndTime after stream ended
     */
    const live =
      Boolean(details.actualStartTime) &&
      !Boolean(details.actualEndTime);

    /**
     * 11. Parse concurrent viewers
     */
    let viewers: number | null = null;

    if (
      typeof details.concurrentViewers === "string" &&
      details.concurrentViewers.trim() !== ""
    ) {
      const parsed = Number(details.concurrentViewers);

      if (Number.isFinite(parsed)) {
        viewers = Math.max(0, Math.floor(parsed));
      }
    }

    /**
     * 12. Build final response
     */
    const value = createLiveCountValue(
      live,
      viewers,
      live && viewers === null
        ? "Live viewer count is unavailable."
        : undefined,
    );

    /**
     * 13. Cache successful response
     */
    setCache(videoId, value);

    /**
     * 14. Return response
     */
    return res.json({
      success: true,
      data: value,
      cached: false,
    });
  } catch (error) {
    /**
     * Timeout
     */
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      console.error("YouTube API request timed out.");

      return res.status(504).json({
        success: false,
        code: "YOUTUBE_REQUEST_TIMEOUT",
        message: "YouTube live data request timed out.",
      });
    }

    /**
     * Network / fetch / unexpected error
     */
    console.error("YouTube live-count request failed:", error);

    return res.status(502).json({
      success: false,
      code: "YOUTUBE_REQUEST_FAILED",
      message: "Unable to fetch YouTube live data.",
    });
  }
});

export default router;