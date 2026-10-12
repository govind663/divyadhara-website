import { useCallback, useEffect, useState } from "react";
import { Activity, Clock3, Eye, Globe2, RefreshCw, Users } from "lucide-react";
import { apiGet } from "../lib/api";

type MetricTotals = {
  visitors?: number;
  anonymousVisitors?: number;
  sessions?: number;
  pageViews?: number;
  avgDurationSeconds?: number;
  avgPageDurationSeconds?: number;
};

type TrafficSource = {
  source?: string;
  medium?: string;
  campaign?: string;
  sessions?: number;
  unique_visitors?: number;
};

type OverviewResponse = {
  success?: boolean;
  totals?: MetricTotals;
  sourceBreakdown?: TrafficSource[];
};

type RealtimeResponse = {
  success?: boolean;
  windowMinutes?: number;
  onlineVisitors?: number;
  onlineAnonymousVisitors?: number;
  onlineSessions?: number;
  activePageViews?: number;
  asOf?: string;
};

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatDuration(value: unknown): string {
  const seconds = Math.round(numberValue(value));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function displaySource(source: unknown): string {
  const text = String(source ?? "direct").trim();
  if (!text || text === "(none)") return "Direct / unknown";
  return text.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function VisitorAnalyticsPanel() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [realtime, setRealtime] = useState<RealtimeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const today = localDateString();
    try {
      const [overviewResult, realtimeResult] = await Promise.all([
        apiGet<OverviewResponse>("/api/analytics/reports/overview", { from: today, to: today }, { timeoutMs: 12000 }) as unknown as Promise<OverviewResponse>,
        apiGet<RealtimeResponse>("/api/analytics/reports/realtime", { windowMinutes: 5 }, { timeoutMs: 12000 }) as unknown as Promise<RealtimeResponse>,
      ]);
      if (!overviewResult?.success || !realtimeResult?.success) {
        throw new Error("Analytics API returned an incomplete response.");
      }
      setOverview(overviewResult);
      setRealtime(realtimeResult);
      setLastUpdated(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analytics could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const totals = overview?.totals;
  const sources = (overview?.sourceBreakdown ?? []).slice(0, 5);
  const cards = [
    { label: "Unique anonymous visitors", value: numberValue(totals?.anonymousVisitors).toLocaleString(), detail: `${numberValue(totals?.visitors).toLocaleString()} total unique visitors today`, icon: Users },
    { label: "Page views", value: numberValue(totals?.pageViews).toLocaleString(), detail: `${numberValue(totals?.sessions).toLocaleString()} sessions today`, icon: Eye },
    { label: "Average visit duration", value: formatDuration(totals?.avgDurationSeconds), detail: `Per session · page average ${formatDuration(totals?.avgPageDurationSeconds)}`, icon: Clock3 },
    { label: "Anonymous visitors online", value: numberValue(realtime?.onlineAnonymousVisitors).toLocaleString(), detail: `Active in the last ${numberValue(realtime?.windowMinutes) || 5} minutes`, icon: Activity },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm" aria-labelledby="visitor-analytics-heading">
      <div className="flex flex-col gap-3 border-b border-orange-900/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-100 text-orange-800"><Globe2 size={20} /></span>
          <div>
            <h2 id="visitor-analytics-heading" className="text-lg font-black text-stone-900">Website visitor analytics</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">Public-site traffic · anonymous visitors included · today</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-stone-500">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading analytics…"}</p>
          <button type="button" onClick={() => void refresh(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 px-3 py-2 text-xs font-bold text-orange-900 hover:bg-orange-50 disabled:opacity-60" aria-label="Refresh visitor analytics">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="m-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:m-6">
          <p className="font-bold">Analytics data unavailable</p>
          <p className="mt-1 break-words text-xs leading-5">{error}</p>
          <p className="mt-1 text-xs">Check that the backend is deployed and this account has analytics-report access.</p>
        </div>
      ) : null}

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4 md:p-6">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-orange-900/10 bg-[#fffdfa] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-stone-500">{label}</p>
              <Icon size={17} className="text-orange-700" />
            </div>
            <p className="mt-3 text-2xl font-black tabular-nums text-[#2a1a10]">{loading && !overview ? "—" : value}</p>
            <p className="mt-1 text-[11px] leading-5 text-stone-500">{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 border-t border-orange-900/10 px-5 py-5 md:grid-cols-[1fr_1fr] md:px-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-stone-900">Top traffic sources</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Today</span>
          </div>
          {sources.length ? (
            <div className="mt-3 space-y-3">
              {sources.map((source, index) => {
                const sessions = numberValue(source.sessions);
                const maxSessions = Math.max(1, ...sources.map((item) => numberValue(item.sessions)));
                return (
                  <div key={`${source.source ?? "direct"}-${source.medium ?? "none"}-${source.campaign ?? "none"}-${index}`}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-bold text-stone-700">{displaySource(source.source)} <span className="font-normal text-stone-400">· {source.medium || "(none)"}</span></span>
                      <span className="shrink-0 tabular-nums text-stone-600">{sessions.toLocaleString()} sessions</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-orange-50"><div className="h-full rounded-full bg-orange-600" style={{ width: `${Math.min(100, (sessions / maxSessions) * 100)}%` }} /></div>
                    <p className="mt-1 text-[10px] text-stone-400">{numberValue(source.unique_visitors).toLocaleString()} unique visitors{source.campaign && source.campaign !== "(none)" ? ` · ${source.campaign}` : ""}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-stone-50 px-3 py-4 text-xs text-stone-500">No traffic-source sessions recorded today yet.</p>
          )}
        </div>
        <div className="rounded-2xl bg-[#2a1a10] p-5 text-white">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-200">How to read this</p>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-orange-50/90">
            <li><strong className="text-white">Unique anonymous visitors:</strong> distinct anonymous visitor IDs recorded today. The smaller note also shows all unique visitors.</li>
            <li><strong className="text-white">Page views:</strong> total public page visits, including repeat views.</li>
            <li><strong className="text-white">Anonymous visitors online:</strong> anonymous sessions with activity in the last five minutes; not a guaranteed exact live connection count.</li>
            <li><strong className="text-white">Traffic sources:</strong> UTM source or inferred referrer source, with direct/unknown used when no referrer is available.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
