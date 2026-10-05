/* eslint-disable prefer-const */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-extra-boolean-cast */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  ExternalLink,
  Radio,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Users,
  Loader2,
  MessageCircle,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

// =========================================================
// LIVE AARTI TYPE
// =========================================================

type LiveAarti = {
  enabled: boolean;

  provider:
    | "youtube"
    | "youtube-channel"
    | "hls"
    | "ipcamlive"
    | "external";

  // Fixed YouTube video/live broadcast ID
  videoId?: string;

  // Official YouTube channel ID
  channelId?: string;

  // Direct HLS stream
  streamUrl?: string;

  // IPCamLive player URL
  ipcamliveUrl?: string;

  // Official external live page
  watchUrl?: string;

  title: string;
  time: string;

  // Verified official/authorized source
  isOfficial?: boolean;
};

// =========================================================
// REACTION TYPE
// =========================================================

type ReactionType =
  | "like"
  | "dislike"
  | null;

// =========================================================
// LOCAL STORAGE REACTION
// =========================================================

type StoredReactions = {
  likes: number;
  dislikes: number;
  userReaction: ReactionType;
};

// =========================================================
// YOUTUBE API RESPONSE
// =========================================================

type YouTubeLiveCountResponse = {
  live: boolean;
  viewers: number | null;
  updatedAt?: string;
  message?: string;
};

type YouTubeApiResponse = {
  items?: Array<{
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
      concurrentViewers?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

// =========================================================
// PROPS
// =========================================================

type TempleLiveDarshanProps = {
  templeName: string;
  liveAarti?: LiveAarti;
};

// =========================================================
// DIRECT YOUTUBE DATA API
// =========================================================

async function fetchYoutubeLiveCount(
  videoId: string,
): Promise<YouTubeLiveCountResponse> {
  // -------------------------------------------------------
  // VITE API KEY
  // -------------------------------------------------------

  const apiKey =
    import.meta.env.VITE_YOUTUBE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "VITE_YOUTUBE_API_KEY is not configured",
    );
  }

  // -------------------------------------------------------
  // VIDEO ID
  // -------------------------------------------------------

  const cleanVideoId =
    videoId.trim();

  if (!cleanVideoId) {
    throw new Error(
      "YouTube video ID is missing",
    );
  }

  // -------------------------------------------------------
  // YOUTUBE DATA API URL
  // -------------------------------------------------------

  const youtubeUrl = new URL(
    "https://www.googleapis.com/youtube/v3/videos",
  );

  youtubeUrl.searchParams.set(
    "part",
    "liveStreamingDetails",
  );

  youtubeUrl.searchParams.set(
    "id",
    cleanVideoId,
  );

  youtubeUrl.searchParams.set(
    "key",
    apiKey,
  );

  // -------------------------------------------------------
  // REQUEST
  // -------------------------------------------------------

  const response = await fetch(
    youtubeUrl.toString(),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  let data: YouTubeApiResponse;

  try {
    data =
      (await response.json()) as YouTubeApiResponse;
  } catch {
    throw new Error(
      "Invalid response received from YouTube API",
    );
  }

  // -------------------------------------------------------
  // API ERROR
  // -------------------------------------------------------

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `YouTube API request failed: ${response.status}`,
    );
  }

  // -------------------------------------------------------
  // VIDEO
  // -------------------------------------------------------

  const video =
    data?.items?.[0];

  if (!video) {
    return {
      live: false,
      viewers: null,
      message: "Video not found",
      updatedAt:
        new Date().toISOString(),
    };
  }

  // -------------------------------------------------------
  // LIVE STREAM DETAILS
  // -------------------------------------------------------

  const details =
    video?.liveStreamingDetails;

  if (!details) {
    return {
      live: false,
      viewers: null,
      message: "Not a live broadcast",
      updatedAt:
        new Date().toISOString(),
    };
  }

  // -------------------------------------------------------
  // CURRENT VIEWERS
  // -------------------------------------------------------

  const rawViewerCount =
    details?.concurrentViewers;

  const parsedViewerCount =
    rawViewerCount !== undefined
      ? Number(rawViewerCount)
      : null;

  const viewers =
    parsedViewerCount !== null &&
    Number.isFinite(parsedViewerCount)
      ? Math.max(
          0,
          parsedViewerCount,
        )
      : null;

  // -------------------------------------------------------
  // LIVE STATUS
  // -------------------------------------------------------

  const isCurrentlyLive =
    Boolean(
      details?.actualStartTime,
    ) &&
    !Boolean(
      details?.actualEndTime,
    );

  // -------------------------------------------------------
  // RESULT
  // -------------------------------------------------------

  return {
    live: isCurrentlyLive,
    viewers,
    message:
      isCurrentlyLive &&
      viewers === null
        ? "Live viewer count is unavailable"
        : undefined,
    updatedAt:
      new Date().toISOString(),
  };
}

// =========================================================
// FORMAT VIEWER COUNT
// =========================================================

function formatViewerCount(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  if (value >= 1_000_000) {
    return `${(
      value / 1_000_000
    ).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(
      value / 1_000
    ).toFixed(
      value >= 10_000 ? 0 : 1,
    )}K`;
  }

  return value.toLocaleString(
    "en-IN",
  );
}

// =========================================================
// YOUTUBE LIVE CHAT URL
// =========================================================

function getYoutubeLiveChatUrl(
  videoId: string,
): string | null {
  if (!videoId) {
    return null;
  }

  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  const hostname =
    window.location.hostname;

  if (!hostname) {
    return null;
  }

  return (
    "https://www.youtube.com/live_chat" +
    `?v=${encodeURIComponent(
      videoId,
    )}` +
    `&embed_domain=${encodeURIComponent(
      hostname,
    )}`
  );
}

// =========================================================
// COMPONENT
// =========================================================

export function TempleLiveDarshan({
  templeName,
  liveAarti,
}: TempleLiveDarshanProps) {
  // =======================================================
  // REACTION KEY
  // =======================================================

  const reactionKey = useMemo(() => {
    if (!liveAarti) {
      return "divyadhara-live-reaction-empty";
    }

    const source =
      liveAarti.videoId ||
      liveAarti.ipcamliveUrl ||
      liveAarti.streamUrl ||
      liveAarti.watchUrl ||
      liveAarti.title;

    return `divyadhara-live-reaction-${liveAarti.provider}-${source}`;
  }, [
    liveAarti?.provider,
    liveAarti?.videoId,
    liveAarti?.ipcamliveUrl,
    liveAarti?.streamUrl,
    liveAarti?.watchUrl,
    liveAarti?.title,
  ]);

  // =======================================================
  // WEBSITE REACTION STATE
  // =======================================================

  const [likes, setLikes] =
    useState(0);

  const [dislikes, setDislikes] =
    useState(0);

  const [userReaction, setUserReaction] =
    useState<ReactionType>(null);

  // =======================================================
  // YOUTUBE VIEWER STATE
  // =======================================================

  const [liveViewers, setLiveViewers] =
    useState<number | null>(
      null,
    );

  const [isLive, setIsLive] =
    useState(false);

  const [viewerLoading, setViewerLoading] =
    useState(false);

  const [viewerError, setViewerError] =
    useState(false);

  const [viewerMessage, setViewerMessage] =
    useState("");

  // =======================================================
  // SOURCE VALIDATION
  // =======================================================

  const hasYoutubeVideo =
    liveAarti?.provider ===
      "youtube" &&
    Boolean(
      liveAarti.videoId,
    );

  const hasYoutubeChannel =
    liveAarti?.provider ===
      "youtube-channel" &&
    Boolean(
      liveAarti.channelId,
    );

  const hasHls =
    liveAarti?.provider ===
      "hls" &&
    Boolean(
      liveAarti.streamUrl,
    );

  const hasIpcamLive =
    liveAarti?.provider ===
      "ipcamlive" &&
    Boolean(
      liveAarti.ipcamliveUrl,
    );

  const hasExternal =
    liveAarti?.provider ===
      "external" &&
    Boolean(
      liveAarti.watchUrl,
    );

  const hasPlayableSource =
    hasYoutubeVideo ||
    hasYoutubeChannel ||
    hasHls ||
    hasIpcamLive ||
    hasExternal;

  // =======================================================
  // YOUTUBE LIVE CHAT
  // =======================================================

  const youtubeLiveChatUrl =
    hasYoutubeVideo &&
    liveAarti.videoId
      ? getYoutubeLiveChatUrl(
          liveAarti.videoId,
        )
      : null;

  // =======================================================
  // LOAD SAVED REACTION
  // =======================================================

  useEffect(() => {
    if (!liveAarti?.enabled) {
      return;
    }

    try {
      const stored =
        localStorage.getItem(
          reactionKey,
        );

      if (!stored) {
        setLikes(0);
        setDislikes(0);
        setUserReaction(null);
        return;
      }

      const parsed =
        JSON.parse(
          stored,
        ) as Partial<StoredReactions>;

      setLikes(
        typeof parsed.likes ===
          "number" &&
        parsed.likes >= 0
          ? parsed.likes
          : 0,
      );

      setDislikes(
        typeof parsed.dislikes ===
          "number" &&
        parsed.dislikes >= 0
          ? parsed.dislikes
          : 0,
      );

      if (
        parsed.userReaction ===
          "like" ||
        parsed.userReaction ===
          "dislike"
      ) {
        setUserReaction(
          parsed.userReaction,
        );
      } else {
        setUserReaction(null);
      }
    } catch {
      setLikes(0);
      setDislikes(0);
      setUserReaction(null);
    }
  }, [
    reactionKey,
    liveAarti?.enabled,
  ]);

  // =======================================================
  // SAVE REACTION
  // =======================================================

  const saveReactions = (
    nextLikes: number,
    nextDislikes: number,
    nextReaction: ReactionType,
  ) => {
    try {
      const payload: StoredReactions =
        {
          likes: nextLikes,
          dislikes: nextDislikes,
          userReaction:
            nextReaction,
        };

      localStorage.setItem(
        reactionKey,
        JSON.stringify(payload),
      );
    } catch {
      // Ignore localStorage errors
    }
  };

  // =======================================================
  // LIKE / DISLIKE
  // =======================================================

  const handleReaction = (
    type:
      | "like"
      | "dislike",
  ) => {
    let nextLikes =
      likes;

    let nextDislikes =
      dislikes;

    let nextReaction:
      ReactionType =
      type;

    // ---------------------------------------------------
    // REMOVE SAME REACTION
    // ---------------------------------------------------

    if (
      userReaction ===
      type
    ) {
      if (type === "like") {
        nextLikes = Math.max(
          0,
          nextLikes - 1,
        );
      } else {
        nextDislikes =
          Math.max(
            0,
            nextDislikes - 1,
          );
      }

      nextReaction =
        null;
    }

    // ---------------------------------------------------
    // SWITCH REACTION
    // ---------------------------------------------------

    else {
      if (
        userReaction ===
        "like"
      ) {
        nextLikes =
          Math.max(
            0,
            nextLikes - 1,
          );
      }

      if (
        userReaction ===
        "dislike"
      ) {
        nextDislikes =
          Math.max(
            0,
            nextDislikes - 1,
          );
      }

      if (type === "like") {
        nextLikes += 1;
      } else {
        nextDislikes += 1;
      }
    }

    setLikes(nextLikes);
    setDislikes(
      nextDislikes,
    );
    setUserReaction(
      nextReaction,
    );

    saveReactions(
      nextLikes,
      nextDislikes,
      nextReaction,
    );
  };

  // =======================================================
  // FETCH YOUTUBE LIVE VIEWERS
  // =======================================================

  useEffect(() => {
    if (
      !liveAarti?.enabled ||
      liveAarti.provider !==
        "youtube" ||
      !liveAarti.videoId
    ) {
      setLiveViewers(null);
      setIsLive(false);
      setViewerLoading(false);
      setViewerError(false);
      setViewerMessage("");

      return;
    }

    let cancelled = false;

    let intervalId:
      | ReturnType<
          typeof setInterval
        >
      | undefined;

    const loadViewerCount =
      async () => {
        if (cancelled) {
          return;
        }

        try {
          setViewerLoading(
            true,
          );

          setViewerError(
            false,
          );

          setViewerMessage(
            "",
          );

          const result =
            await fetchYoutubeLiveCount(
              liveAarti.videoId!,
            );

          if (cancelled) {
            return;
          }

          setIsLive(
            result.live,
          );

          setLiveViewers(
            result.viewers,
          );

          setViewerMessage(
            result.message ||
              "",
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "DivyaDhara YouTube Live Count Error:",
            error,
          );

          setViewerError(
            true,
          );

          setIsLive(false);

          setLiveViewers(
            null,
          );

          setViewerMessage(
            error instanceof Error
              ? error.message
              : "Unable to fetch YouTube live viewer count.",
          );
        } finally {
          if (!cancelled) {
            setViewerLoading(
              false,
            );
          }
        }
      };

    // Initial request
    void loadViewerCount();

    // Refresh every 30 seconds
    intervalId = setInterval(
      () => {
        void loadViewerCount();
      },
      30_000,
    );

    return () => {
      cancelled = true;

      if (intervalId) {
        clearInterval(
          intervalId,
        );
      }
    };
  }, [
    liveAarti?.enabled,
    liveAarti?.provider,
    liveAarti?.videoId,
  ]);

  // =======================================================
  // NO LIVE CONFIGURATION
  // =======================================================

  if (!liveAarti?.enabled) {
    return null;
  }

  // =======================================================
  // YOUTUBE EMBED URL
  // =======================================================

  const youtubeEmbedUrl =
    hasYoutubeVideo
      ? `https://www.youtube.com/embed/${liveAarti.videoId}?rel=0&playsinline=1`
      : undefined;

  // =======================================================
  // YOUTUBE CHANNEL EMBED URL
  // =======================================================

  const youtubeChannelEmbedUrl =
    hasYoutubeChannel
      ? `https://www.youtube.com/embed/live_stream?channel=${liveAarti.channelId}&rel=0&playsinline=1`
      : undefined;

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">

      {/* ==================================================
          HEADER
      ================================================== */}

      <div className="flex flex-wrap items-center gap-3 bg-linear-to-r from-red-700 to-orange-700 px-4 py-4 text-white sm:px-5">

        {/* LIVE BADGE */}

        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-extrabold tracking-wide">

          <span className="relative flex h-2.5 w-2.5">

            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />

            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />

          </span>

          LIVE DARSHAN

        </span>

        {/* TITLE */}

        <div className="min-w-0 flex-1">

          <p className="truncate text-sm font-bold">
            {liveAarti.title}
          </p>

          {liveAarti.time && (
            <p className="mt-0.5 text-xs text-orange-100">
              {liveAarti.time}
            </p>
          )}

        </div>

        {/* OFFICIAL BADGE */}

        {liveAarti.isOfficial && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-orange-50">

            <CheckCircle2
              size={11}
            />

            Official Source

          </span>
        )}

      </div>

      {/* ==================================================
          PLAYER
      ================================================== */}

      {/* YOUTUBE VIDEO */}

      {hasYoutubeVideo &&
        youtubeEmbedUrl && (
          <div className="aspect-video w-full bg-black">

            <iframe
              src={
                youtubeEmbedUrl
              }
              title={`${liveAarti.title} — ${templeName}`}
              className="h-full w-full border-0"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />

          </div>
        )}

      {/* YOUTUBE CHANNEL */}

      {hasYoutubeChannel &&
        youtubeChannelEmbedUrl && (
          <div className="aspect-video w-full bg-black">

            <iframe
              src={
                youtubeChannelEmbedUrl
              }
              title={`${liveAarti.title} — ${templeName}`}
              className="h-full w-full border-0"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />

          </div>
        )}

      {/* HLS */}

      {hasHls && (
        <div className="aspect-video w-full bg-black">

          <video
            src={
              liveAarti.streamUrl
            }
            title={`${liveAarti.title} — ${templeName}`}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          >
            Your browser does not support
            the live video stream.
          </video>

        </div>
      )}

      {/* IPCAMLIVE */}

      {hasIpcamLive && (
        <div className="aspect-video w-full bg-black">

          <iframe
            src={
              liveAarti.ipcamliveUrl
            }
            title={`${liveAarti.title} — ${templeName}`}
            className="h-full w-full border-0"
            loading="lazy"
            allow="autoplay; fullscreen"
            allowFullScreen
          />

        </div>
      )}

      {/* EXTERNAL */}

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
              The live stream for{" "}
              {templeName} is hosted
              on the official live
              platform.
            </p>

            <a
              href={
                liveAarti.watchUrl
              }
              target="_blank"
              rel="noreferrer"
              className="btn-saffron mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
            >
              Watch Official Live

              <ExternalLink
                size={15}
              />

            </a>

          </div>

        </div>
      )}

      {/* ==================================================
          DIVYADHARA LIVE CHAT
          DESKTOP / TABLET ONLY
      ================================================== */}

      {hasYoutubeVideo &&
        youtubeLiveChatUrl && (
          <section className="hidden border-t border-orange-900/10 bg-[#fffaf3] md:block">

            {/* =================================================
                CHAT HEADER
            ================================================= */}

            <div className="relative overflow-hidden border-b border-orange-900/10 bg-linear-to-r from-[#fff7e8] via-[#fffaf3] to-[#fff1d6] px-4 py-4 sm:px-5">

              {/* DECORATIVE GLOW */}

              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-300/20 blur-2xl" />

              <div className="pointer-events-none absolute -bottom-10 left-1/3 h-20 w-20 rounded-full bg-amber-300/20 blur-2xl" />

              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                {/* BRAND / TITLE */}

                <div className="flex items-center gap-3">

                  {/* OM ICON */}

                  <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-linear-to-br from-orange-500 via-orange-600 to-saffron-900 shadow-lg shadow-orange-900/20">

                    <span className="font-sanskrit text-2xl leading-none text-amber-50">
                      ॐ
                    </span>

                    <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-amber-200/30" />

                  </span>

                  {/* TITLE */}

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

                {/* TEMPLE */}

                <div className="flex items-center gap-2 self-start rounded-xl border border-orange-200/80 bg-white/70 px-3 py-2 shadow-sm sm:self-auto">

                  <Radio
                    size={14}
                    className="shrink-0 text-orange-600"
                  />

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

            {/* =================================================
                CHAT BODY
            ================================================= */}

            <div className="bg-[#f7f1e8] p-3 sm:p-4">

              <div className="overflow-hidden rounded-2xl border border-orange-900/10 bg-white shadow-[0_8px_30px_rgba(120,53,15,0.08)]">

                {/* CHAT TOP STRIP */}

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

                {/* YOUTUBE CHAT */}

                <div className="h-[420px] w-full bg-black sm:h-[460px] lg:h-[500px]">

                  <iframe
                    src={
                      youtubeLiveChatUrl
                    }
                    title={`Live Chat — ${templeName}`}
                    className="h-full w-full border-0"
                    loading="lazy"
                    allow="clipboard-write"
                  />

                </div>

                {/* CHAT FOOTER */}

                <div className="border-t border-orange-900/10 bg-[#fffaf3] px-3 py-3 sm:px-4">

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                    <div className="flex items-center gap-2 text-[10px] leading-relaxed text-stone-500">

                      <CheckCircle2
                        size={13}
                        className="shrink-0 text-emerald-600"
                      />

                      <span>
                        Live conversation is
                        provided by the
                        streaming source.
                      </span>

                    </div>

                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-orange-700/60">
                      Sacred Live Conversation
                    </span>

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
            Live Darshan configuration
            incomplete
          </p>

          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            Please configure a valid live
            video, channel, HLS stream,
            IPCamLive URL or official live
            page.
          </p>

        </div>
      )}

      {/* ==================================================
          FOOTER
      ================================================== */}

      <div className="border-t border-orange-900/10 p-4 sm:px-5">

        <div className="flex flex-col gap-4">

          {/* =================================================
              TEMPLE INFO
          ================================================= */}

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            {/* TEMPLE */}

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

                    <Radio
                      size={11}
                    />

                    {liveAarti.time}

                  </span>
                )}

              </div>

            </div>

            {/* =================================================
                YOUTUBE LIVE VIEWERS
            ================================================= */}

            {hasYoutubeVideo && (
              <div
                className={`inline-flex min-w-[170px] items-center gap-2 rounded-xl border px-3 py-2 ${
                  isLive
                    ? "border-red-200 bg-red-50"
                    : viewerError
                      ? "border-red-200 bg-red-50"
                      : "border-orange-200 bg-orange-50"
                }`}
              >

                {/* ICON */}

                {viewerLoading ? (
                  <Loader2
                    size={16}
                    className="animate-spin text-orange-600"
                  />
                ) : (
                  <Users
                    size={16}
                    className={
                      isLive
                        ? "text-red-600"
                        : "text-orange-700"
                    }
                  />
                )}

                {/* DATA */}

                <div className="leading-none">

                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-500">

                    {isLive
                      ? "Watching Now"
                      : "Live Status"}

                  </span>

                  <span className="mt-1 block text-sm font-extrabold text-[#2a1a10]">

                    {viewerLoading
                      ? "Loading..."
                      : viewerError
                        ? "Unavailable"
                        : isLive
                          ? liveViewers !==
                            null
                            ? formatViewerCount(
                                liveViewers,
                              )
                            : "Count hidden"
                          : "Not Live"}

                  </span>

                </div>

                {/* LIVE DOT */}

                {isLive &&
                  !viewerError && (
                    <span className="relative ml-auto flex h-2.5 w-2.5">

                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />

                      <span className="relative h-2.5 w-2.5 rounded-full bg-red-600" />

                    </span>
                  )}

              </div>
            )}

            {/* =================================================
                LIKE / DISLIKE
            ================================================= */}

            <div className="flex items-center gap-2">

              <span className="mr-1 hidden text-[11px] font-semibold text-stone-500 sm:inline">
                How was this Darshan?
              </span>

              {/* LIKE */}

              <button
                type="button"
                onClick={() =>
                  handleReaction(
                    "like",
                  )
                }
                aria-label="Like this live darshan"
                aria-pressed={
                  userReaction ===
                  "like"
                }
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  userReaction ===
                  "like"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-orange-200 bg-white text-stone-600 hover:bg-orange-50 hover:text-orange-700"
                }`}
              >

                <ThumbsUp
                  size={14}
                  fill={
                    userReaction ===
                    "like"
                      ? "currentColor"
                      : "none"
                  }
                />

                <span>
                  {likes}
                </span>

              </button>

              {/* DISLIKE */}

              <button
                type="button"
                onClick={() =>
                  handleReaction(
                    "dislike",
                  )
                }
                aria-label="Dislike this live darshan"
                aria-pressed={
                  userReaction ===
                  "dislike"
                }
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  userReaction ===
                  "dislike"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-orange-200 bg-white text-stone-600 hover:bg-orange-50 hover:text-red-700"
                }`}
              >

                <ThumbsDown
                  size={14}
                  fill={
                    userReaction ===
                    "dislike"
                      ? "currentColor"
                      : "none"
                  }
                />

                <span>
                  {dislikes}
                </span>

              </button>

            </div>

          </div>

          {/* =================================================
              VIEWER ERROR
          ================================================= */}

          {viewerError &&
            hasYoutubeVideo && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-center text-[10px] leading-relaxed text-red-600">

                {viewerMessage ||
                  "Unable to fetch YouTube live viewer count."}

              </div>
            )}

          {/* =================================================
              FOOTER INFO
          ================================================= */}

          <div className="border-t border-stone-100 pt-3 text-center text-[10px] leading-relaxed text-stone-400">

            Live viewer count is fetched directly
            from YouTube when available.
            Likes and dislikes are stored on
            this website.

          </div>

        </div>

      </div>

    </div>
  );
}