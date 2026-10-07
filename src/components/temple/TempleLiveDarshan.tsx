/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable prefer-const */
/*
 * DivyaDhara — Temple Live Darshan
 *
 * Production-safe version:
 * - Never exposes a YouTube API key in browser code.
 * - Viewer count is requested from the DivyaDhara backend.
 * - Uses the centralized API client so /api is resolved consistently.
 * - Aborts stale/in-flight viewer requests.
 * - Fails gracefully when viewer count is unavailable.
 * - Removes the unsupported `web-share` iframe permission warning.
 * - Keeps reactions browser-local and clearly labels them as such.
 */

/* eslint-disable react-hooks/exhaustive-deps */

import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Radio,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiGet, type ApiResponse } from "../../lib/api";

// =========================================================
// TYPES
// =========================================================

type LiveProvider =
  | "youtube"
  | "youtube-channel"
  | "hls"
  | "ipcamlive"
  | "external";

type LiveAarti = {
  enabled: boolean;
  provider: LiveProvider;
  videoId?: string;
  channelId?: string;
  streamUrl?: string;
  ipcamliveUrl?: string;
  watchUrl?: string;
  title: string;
  time: string;
  isOfficial?: boolean;
};

type ReactionType = "like" | "dislike" | null;

type StoredReactions = {
  likes: number;
  dislikes: number;
  userReaction: ReactionType;
};

type YouTubeLiveCount = {
  live: boolean;
  viewers: number | null;
  updatedAt?: string;
  message?: string;
};

type YouTubeLiveCountEnvelope = {
  success?: boolean;
  data?: YouTubeLiveCount | null;
  live?: boolean;
  viewers?: number | null;
  updatedAt?: string;
  message?: string;
};

type TempleLiveDarshanProps = {
  templeName: string;
  liveAarti?: LiveAarti;
};

const LIVE_COUNT_PATH = "/api/youtube/live-count";
const LIVE_COUNT_REFRESH_MS = 30_000;
const REACTION_PREFIX = "divyadhara-live-reaction";

// =========================================================
// HELPERS
// =========================================================

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeVideoId(value: unknown): string {
  const id = cleanString(value);

  // YouTube video IDs are normally 11 URL-safe characters.
  // Do not reject valid-looking IDs solely on length, but strip
  // obvious URL input so accidental full URLs do not break the API.
  if (id.includes("youtube.com") || id.includes("youtu.be")) {
    try {
      const url = new URL(id);
      const fromQuery = url.searchParams.get("v");
      if (fromQuery) return fromQuery.trim();

      const last = url.pathname.split("/").filter(Boolean).pop();
      return last?.trim() || "";
    } catch {
      return "";
    }
  }

  return id;
}

function getYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function getYoutubeEmbedUrl(videoId: string): string {
  return (
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` +
    "?rel=0&playsinline=1"
  );
}

function getYoutubeChannelEmbedUrl(channelId: string): string {
  return (
    "https://www.youtube.com/embed/live_stream" +
    `?channel=${encodeURIComponent(channelId)}` +
    "&rel=0&playsinline=1"
  );
}

function getYoutubeLiveChatUrl(videoId: string): string | null {
  if (!videoId || typeof window === "undefined") {
    return null;
  }

  const hostname = window.location.hostname.trim();
  if (!hostname) return null;

  return (
    "https://www.youtube.com/live_chat" +
    `?v=${encodeURIComponent(videoId)}` +
    `&embed_domain=${encodeURIComponent(hostname)}`
  );
}

function formatViewerCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const safe = Math.max(0, Math.floor(value));

  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1)}M`;
  }

  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(safe >= 10_000 ? 0 : 1)}K`;
  }

  return safe.toLocaleString("en-IN");
}

function isValidReactionStore(value: unknown): value is StoredReactions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;
  const validReaction =
    data.userReaction === null ||
    data.userReaction === "like" ||
    data.userReaction === "dislike";

  return (
    typeof data.likes === "number" &&
    Number.isFinite(data.likes) &&
    data.likes >= 0 &&
    typeof data.dislikes === "number" &&
    Number.isFinite(data.dislikes) &&
    data.dislikes >= 0 &&
    validReaction
  );
}

function extractLiveCount(
  response: ApiResponse<YouTubeLiveCountEnvelope>,
): YouTubeLiveCount {
  const envelope = response.data;

  const source =
    envelope?.data && typeof envelope.data === "object"
      ? envelope.data
      : envelope && typeof envelope === "object"
        ? envelope
        : {};

  const viewers =
    typeof source.viewers === "number" && Number.isFinite(source.viewers)
      ? Math.max(0, Math.floor(source.viewers))
      : null;

  return {
    live: Boolean(source.live),
    viewers,
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : undefined,
    message:
      typeof source.message === "string"
        ? source.message
        : undefined,
  };
}

// =========================================================
// BACKEND YOUTUBE VIEWER COUNT
// =========================================================
// IMPORTANT:
// The YouTube API key stays on the Express server as
// YOUTUBE_API_KEY. It must NOT be placed in VITE_* variables.
// The frontend only calls our same-origin endpoint.
// =========================================================

async function fetchYoutubeLiveCount(
  videoId: string,
  signal?: AbortSignal,
): Promise<YouTubeLiveCount> {
  const cleanId = safeVideoId(videoId);

  if (!cleanId) {
    throw new Error("YouTube video ID is missing.");
  }

  const response = await apiGet<YouTubeLiveCountEnvelope>(
    LIVE_COUNT_PATH,
    { videoId: cleanId },
    {
      signal,
      timeoutMs: 12_000,
    },
  );

  return extractLiveCount(response);
}

// =========================================================
// COMPONENT
// =========================================================

export function TempleLiveDarshan({
  templeName,
  liveAarti,
}: TempleLiveDarshanProps) {
  // -------------------------------------------------------
  // Stable local reaction key
  // -------------------------------------------------------

  const reactionKey = useMemo(() => {
    if (!liveAarti) {
      return `${REACTION_PREFIX}-empty`;
    }

    const source =
      safeVideoId(liveAarti.videoId) ||
      cleanString(liveAarti.ipcamliveUrl) ||
      cleanString(liveAarti.streamUrl) ||
      cleanString(liveAarti.watchUrl) ||
      cleanString(liveAarti.title) ||
      "unknown";

    return `${REACTION_PREFIX}-${liveAarti.provider}-${source}`;
  }, [
    liveAarti?.provider,
    liveAarti?.videoId,
    liveAarti?.ipcamliveUrl,
    liveAarti?.streamUrl,
    liveAarti?.watchUrl,
    liveAarti?.title,
  ]);

  // -------------------------------------------------------
  // Reaction state
  // -------------------------------------------------------

  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userReaction, setUserReaction] =
    useState<ReactionType>(null);

  // -------------------------------------------------------
  // Viewer state
  // -------------------------------------------------------

  const [liveViewers, setLiveViewers] =
    useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [viewerLoading, setViewerLoading] =
    useState(false);
  const [viewerError, setViewerError] =
    useState(false);
  const [viewerMessage, setViewerMessage] =
    useState("");

  // -------------------------------------------------------
  // Source validation
  // -------------------------------------------------------

  const youtubeVideoId = safeVideoId(liveAarti?.videoId);
  const youtubeChannelId = cleanString(liveAarti?.channelId);
  const hlsUrl = cleanString(liveAarti?.streamUrl);
  const ipcamliveUrl = cleanString(liveAarti?.ipcamliveUrl);
  const externalWatchUrl = cleanString(liveAarti?.watchUrl);

  const hasYoutubeVideo =
    liveAarti?.provider === "youtube" && Boolean(youtubeVideoId);

  const hasYoutubeChannel =
    liveAarti?.provider === "youtube-channel" &&
    Boolean(youtubeChannelId);

  const hasHls =
    liveAarti?.provider === "hls" && Boolean(hlsUrl);

  const hasIpcamLive =
    liveAarti?.provider === "ipcamlive" && Boolean(ipcamliveUrl);

  const hasExternal =
    liveAarti?.provider === "external" && Boolean(externalWatchUrl);

  const hasPlayableSource =
    hasYoutubeVideo ||
    hasYoutubeChannel ||
    hasHls ||
    hasIpcamLive ||
    hasExternal;

  const youtubeLiveChatUrl = hasYoutubeVideo
    ? getYoutubeLiveChatUrl(youtubeVideoId)
    : null;

  const youtubeEmbedUrl = hasYoutubeVideo
    ? getYoutubeEmbedUrl(youtubeVideoId)
    : undefined;

  const youtubeChannelEmbedUrl = hasYoutubeChannel
    ? getYoutubeChannelEmbedUrl(youtubeChannelId)
    : undefined;

  // -------------------------------------------------------
  // Load reactions
  // -------------------------------------------------------

  useEffect(() => {
    if (!liveAarti?.enabled || typeof window === "undefined") {
      setLikes(0);
      setDislikes(0);
      setUserReaction(null);
      return;
    }

    try {
      const stored = window.localStorage.getItem(reactionKey);

      if (!stored) {
        setLikes(0);
        setDislikes(0);
        setUserReaction(null);
        return;
      }

      const parsed: unknown = JSON.parse(stored);

      if (!isValidReactionStore(parsed)) {
        throw new Error("Invalid reaction store");
      }

      setLikes(Math.floor(parsed.likes));
      setDislikes(Math.floor(parsed.dislikes));
      setUserReaction(parsed.userReaction);
    } catch {
      setLikes(0);
      setDislikes(0);
      setUserReaction(null);
    }
  }, [reactionKey, liveAarti?.enabled]);

  // -------------------------------------------------------
  // Persist reactions
  // -------------------------------------------------------

  const saveReactions = (
    nextLikes: number,
    nextDislikes: number,
    nextReaction: ReactionType,
  ) => {
    if (typeof window === "undefined") return;

    try {
      const payload: StoredReactions = {
        likes: Math.max(0, Math.floor(nextLikes)),
        dislikes: Math.max(0, Math.floor(nextDislikes)),
        userReaction: nextReaction,
      };

      window.localStorage.setItem(
        reactionKey,
        JSON.stringify(payload),
      );
    } catch {
      // Storage can be disabled or unavailable; UI state still works.
    }
  };

  // -------------------------------------------------------
  // Like / dislike
  // -------------------------------------------------------

  const handleReaction = (type: "like" | "dislike") => {
    let nextLikes = likes;
    let nextDislikes = dislikes;
    let nextReaction: ReactionType = type;

    if (userReaction === type) {
      if (type === "like") {
        nextLikes = Math.max(0, nextLikes - 1);
      } else {
        nextDislikes = Math.max(0, nextDislikes - 1);
      }
      nextReaction = null;
    } else {
      if (userReaction === "like") {
        nextLikes = Math.max(0, nextLikes - 1);
      }

      if (userReaction === "dislike") {
        nextDislikes = Math.max(0, nextDislikes - 1);
      }

      if (type === "like") {
        nextLikes += 1;
      } else {
        nextDislikes += 1;
      }
    }

    setLikes(nextLikes);
    setDislikes(nextDislikes);
    setUserReaction(nextReaction);
    saveReactions(nextLikes, nextDislikes, nextReaction);
  };

  // -------------------------------------------------------
  // YouTube live count polling
  // -------------------------------------------------------

  useEffect(() => {
    if (
      !liveAarti?.enabled ||
      !hasYoutubeVideo
    ) {
      setLiveViewers(null);
      setIsLive(false);
      setViewerLoading(false);
      setViewerError(false);
      setViewerMessage("");
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let controller: AbortController | undefined;

    const loadViewerCount = async () => {
      if (cancelled || inFlight) return;

      inFlight = true;
      controller?.abort();
      controller = new AbortController();

      setViewerLoading(true);
      setViewerError(false);
      setViewerMessage("");

      try {
        const result = await fetchYoutubeLiveCount(
          youtubeVideoId,
          controller.signal,
        );

        if (cancelled) return;

        setIsLive(result.live);
        setLiveViewers(result.viewers);
        setViewerMessage(result.message || "");
      } catch (error) {
        if (cancelled) return;

        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "DivyaDhara YouTube Live Count Error:",
          error,
        );

        setViewerError(true);
        setIsLive(false);
        setLiveViewers(null);

        // Never surface internal configuration details or raw API
        // errors to visitors. Keep the public message generic.
        setViewerMessage(
          "Live viewer count is temporarily unavailable.",
        );
      } finally {
        if (!cancelled) {
          setViewerLoading(false);
        }
        inFlight = false;
      }
    };

    void loadViewerCount();

    intervalId = setInterval(() => {
      void loadViewerCount();
    }, LIVE_COUNT_REFRESH_MS);

    return () => {
      cancelled = true;
      controller?.abort();

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [
    liveAarti?.enabled,
    liveAarti?.provider,
    youtubeVideoId,
    hasYoutubeVideo,
  ]);

  // =======================================================
  // NO LIVE CONFIGURATION
  // =======================================================

  if (!liveAarti?.enabled) {
    return null;
  }

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
      {/* ==================================================
          HEADER
      ================================================== */}
      <div className="flex flex-wrap items-center gap-3 bg-linear-to-r from-red-700 to-orange-700 px-4 py-4 text-white sm:px-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-extrabold tracking-wide">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          LIVE DARSHAN
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {liveAarti.title || "Live Darshan"}
          </p>
          {liveAarti.time && (
            <p className="mt-0.5 text-xs text-orange-100">
              {liveAarti.time}
            </p>
          )}
        </div>

        {liveAarti.isOfficial && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-orange-50">
            <CheckCircle2 size={11} />
            Official Source
          </span>
        )}
      </div>

      {/* ==================================================
          PLAYER
      ================================================== */}
      {hasYoutubeVideo && youtubeEmbedUrl && (
        <div className="aspect-video w-full bg-black">
          <iframe
            src={youtubeEmbedUrl}
            title={`${liveAarti.title || "Live Darshan"} — ${templeName}`}
            className="h-full w-full border-0"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}

      {hasYoutubeChannel && youtubeChannelEmbedUrl && (
        <div className="aspect-video w-full bg-black">
          <iframe
            src={youtubeChannelEmbedUrl}
            title={`${liveAarti.title || "Live Darshan"} — ${templeName}`}
            className="h-full w-full border-0"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}

      {hasHls && (
        <div className="aspect-video w-full bg-black">
          <video
            src={hlsUrl}
            title={`${liveAarti.title || "Live Darshan"} — ${templeName}`}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          >
            Your browser does not support the live video stream.
          </video>
        </div>
      )}

      {hasIpcamLive && (
        <div className="aspect-video w-full bg-black">
          <iframe
            src={ipcamliveUrl}
            title={`${liveAarti.title || "Live Darshan"} — ${templeName}`}
            className="h-full w-full border-0"
            loading="lazy"
            allow="autoplay; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}

      {hasExternal && (
        <div className="bg-linear-to-br from-orange-50 via-amber-50 to-white p-6 sm:p-8">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <Radio size={24} />
            </div>

            <h3 className="mt-4 font-display text-xl font-semibold text-[#2a1a10]">
              Live Darshan Available
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              The live stream for {templeName} is hosted on the official live platform.
            </p>

            <a
              href={externalWatchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-saffron mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            >
              Watch Official Live
              <ExternalLink size={15} />
            </a>
          </div>
        </div>
      )}

      {/* ==================================================
          YOUTUBE LIVE CHAT — DESKTOP / TABLET
      ================================================== */}
      {hasYoutubeVideo && youtubeLiveChatUrl && (
        <section className="hidden border-t border-orange-900/10 bg-[#fffaf3] md:block">
          <div className="relative overflow-hidden border-b border-orange-900/10 bg-linear-to-r from-[#fff7e8] via-[#fffaf3] to-[#fff1d6] px-4 py-4 sm:px-5">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-300/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-10 left-1/3 h-20 w-20 rounded-full bg-amber-300/20 blur-2xl" />

            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-linear-to-br from-orange-500 via-orange-600 to-saffron-900 shadow-lg shadow-orange-900/20">
                  <span className="font-sanskrit text-2xl leading-none text-amber-50">ॐ</span>
                  <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-amber-200/30" />
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-extrabold text-[#2a1a10] sm:text-lg">
                      Live Darshan Chat
                    </h3>

                    {isLive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-red-700 ring-1 ring-red-200">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                          <span className="relative h-1.5 w-1.5 rounded-full bg-red-600" />
                        </span>
                        Live
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500 sm:text-xs">
                    भक्तों के साथ Live Darshan का अनुभव साझा करें
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start rounded-xl border border-orange-200/80 bg-white/70 px-3 py-2 shadow-sm sm:self-auto">
                <Radio size={14} className="shrink-0 text-orange-600" />
                <div className="min-w-0">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-orange-700/70">
                    Present Darshan
                  </span>
                  <span className="block max-w-[220px] truncate text-[11px] font-bold text-[#2a1a10]">
                    {templeName}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#f7f1e8] p-3 sm:p-4">
            <div className="overflow-hidden rounded-2xl border border-orange-900/10 bg-white shadow-[0_8px_30px_rgba(120,53,15,0.08)]">
              <div className="flex items-center justify-between border-b border-orange-900/10 bg-linear-to-r from-[#fffaf3] to-[#fff4df] px-3 py-2 sm:px-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-100 text-orange-700">
                    <Radio size={13} />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-800">
                    Sacred Live Conversation
                  </span>
                </div>

                {isLive && (
                  <span className="text-[10px] font-bold text-emerald-700">
                    ● Broadcast Active
                  </span>
                )}
              </div>

              <div className="h-[420px] w-full bg-black sm:h-[460px] lg:h-[500px]">
                <iframe
                  src={youtubeLiveChatUrl}
                  title={`Live Chat — ${templeName}`}
                  className="h-full w-full border-0"
                  loading="lazy"
                  allow="clipboard-write"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>

              <div className="border-t border-orange-900/10 bg-[#fffaf3] px-3 py-3 sm:px-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-[10px] leading-relaxed text-stone-500">
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                    <span>Live conversation is provided by the streaming source.</span>
                  </div>

                  <a
                    href={getYoutubeWatchUrl(youtubeVideoId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-orange-700/70 hover:text-orange-800"
                  >
                    Open on YouTube
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==================================================
          FALLBACK
      ================================================== */}
      {!hasPlayableSource && (
        <div className="bg-stone-50 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-700">
            <Radio size={20} />
          </div>

          <p className="mt-3 text-sm font-bold text-[#2a1a10]">
            Live Darshan configuration incomplete
          </p>

          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            Please configure a valid live video, channel, HLS stream, IPCamLive URL or official live page.
          </p>
        </div>
      )}

      {/* ==================================================
          FOOTER
      ================================================== */}
      <div className="border-t border-orange-900/10 p-4 sm:px-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#2a1a10]">
                {templeName}
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                {liveAarti.isOfficial && (
                  <span className="font-semibold text-emerald-700">
                    ✓ Official source
                  </span>
                )}

                {liveAarti.time && (
                  <span className="flex items-center gap-1">
                    <Radio size={11} />
                    {liveAarti.time}
                  </span>
                )}
              </div>
            </div>

            {hasYoutubeVideo && (
              <div
                className={`inline-flex min-w-[170px] items-center gap-2 rounded-xl border px-3 py-2 ${
                  isLive
                    ? "border-red-200 bg-red-50"
                    : viewerError
                      ? "border-amber-200 bg-amber-50"
                      : "border-orange-200 bg-orange-50"
                }`}
                aria-live="polite"
                aria-label="YouTube live viewer status"
              >
                {viewerLoading ? (
                  <Loader2 size={16} className="animate-spin text-orange-600" />
                ) : (
                  <Users size={16} className={isLive ? "text-red-600" : "text-orange-700"} />
                )}

                <div className="leading-none">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    {isLive ? "Watching Now" : "Live Status"}
                  </span>

                  <span className="mt-1 block text-sm font-extrabold text-[#2a1a10]">
                    {viewerLoading
                      ? "Checking..."
                      : viewerError
                        ? "Unavailable"
                        : isLive
                          ? liveViewers !== null
                            ? formatViewerCount(liveViewers)
                            : "Count hidden"
                          : "Not Live"}
                  </span>
                </div>

                {isLive && !viewerError && (
                  <span className="relative ml-auto flex h-2.5 w-2.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                    <span className="relative h-2.5 w-2.5 rounded-full bg-red-600" />
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="mr-1 hidden text-[11px] font-semibold text-stone-500 sm:inline">
                How was this Darshan?
              </span>

              <button
                type="button"
                onClick={() => handleReaction("like")}
                aria-label="Like this live darshan"
                aria-pressed={userReaction === "like"}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  userReaction === "like"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-orange-200 bg-white text-stone-600 hover:bg-orange-50 hover:text-orange-700"
                }`}
              >
                <ThumbsUp
                  size={14}
                  fill={userReaction === "like" ? "currentColor" : "none"}
                />
                <span>{likes}</span>
              </button>

              <button
                type="button"
                onClick={() => handleReaction("dislike")}
                aria-label="Dislike this live darshan"
                aria-pressed={userReaction === "dislike"}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  userReaction === "dislike"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-orange-200 bg-white text-stone-600 hover:bg-orange-50 hover:text-red-700"
                }`}
              >
                <ThumbsDown
                  size={14}
                  fill={userReaction === "dislike" ? "currentColor" : "none"}
                />
                <span>{dislikes}</span>
              </button>
            </div>
          </div>

          {viewerError && hasYoutubeVideo && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[10px] leading-relaxed text-amber-700">
              {viewerMessage || "Live viewer count is temporarily unavailable."}
            </div>
          )}

          <div className="border-t border-stone-100 pt-3 text-center text-[10px] leading-relaxed text-stone-400">
            Live viewer count is provided by the DivyaDhara backend when YouTube data is available.
            Likes and dislikes are stored locally in this browser.
          </div>
        </div>
      </div>
    </div>
  );
}
