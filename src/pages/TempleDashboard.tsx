/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/preserve-manual-memoization */
/* eslint-disable no-extra-boolean-cast */

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  FileImage,
  FileText,
  ImagePlus,
  IndianRupee,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  Video,
  X,
  Youtube,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useSEO } from "../lib/seo";
import { confirmAction, showError, showSuccess, showWarning, toast } from "../lib/swal";

const API_BASE = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, "");

type JsonObject = Record<string, unknown>;
type TabId =
  | "overview" | "temple" | "content" | "pujas" | "gallery" | "videos"
  | "live" | "leads" | "seo" | "subscription" | "analytics" | "notifications";

class TempleApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code: string | null = null,
  ) {
    super(message);
    this.name = "TempleApiError";
  }
}

async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    cache: "no-store",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok) {
    throw new TempleApiError(
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : `Request failed (${response.status}).`,
      response.status,
      typeof data.code === "string" ? data.code : null,
    );
  }
  return data as T;
}

type TempleListItem = {
  id: number;
  name: string;
  slug?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  status?: string | null;
};

type TempleRecord = TempleListItem & JsonObject & {
  sanskrit_name?: string | null;
  deity?: string | null;
  temple_type?: string | null;
  tradition?: string | null;
  established?: string | null;
  summary?: string | null;
  description?: string | null;
  history?: string | null;
  stay?: string | null;
  food?: string | null;
  contact_note?: string | null;
  image?: string | null;
  logo?: string | null;
  country?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  map_url?: string | null;
  trust_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  booking_enabled?: boolean | number;
  story_video_id?: string | null;
  content_note?: string | null;
  peetha_number?: number | null;
  peetha_body_part?: string | null;
  shakti_form?: string | null;
  bhairava?: string | null;
  identification_note?: string | null;
  map_embed_note?: string | null;
};

type FeatureSummary = JsonObject & {
  planCode?: string | null;
  planName?: string | null;
  listingEnabled?: boolean;
  featuredListing?: boolean;
  prioritySupport?: boolean;
  verificationBadge?: boolean;
  analyticsAccess?: boolean;
  homepagePromotion?: boolean;
  liveAartiEnabled?: boolean;
  enhancedSeo?: boolean;
  enhancedProfile?: boolean;
  whatsappEnquiry?: boolean;
  searchVisibility?: string | null;
  analyticsLevel?: string | null;
  limits?: { lead?: number; service?: number; serviceArea?: number; gallery?: number; video?: number; program?: number };
};

type TempleSubscription = JsonObject & {
  plan_name?: string | null;
  price_amount?: number | null;
  currency?: string | null;
  billing_interval?: string | null;
  duration_days?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  leads_used?: number | null;
  lead_limit?: number | null;
};

type PujaItem = JsonObject & {
  id: number;
  slug?: string | null;
  name: string;
  category?: string | null;
  tagline?: string | null;
  short_description?: string | null;
  description?: string | null;
  deity?: string | null;
  duration_text?: string | null;
  price_display?: string | null;
  price_from_amount?: number | null;
  currency?: string | null;
  image?: string | null;
  status?: string | null;
  booking_enabled?: boolean | number;
  temple_puja_featured?: boolean | number;
};

type GalleryMedia = JsonObject & { id: number; media_url?: string | null; thumbnail_url?: string | null };
type GalleryItem = JsonObject & {
  id: number; title: string; tag?: string | null; caption?: string | null;
  description?: string | null; cover_image?: string | null; source_path?: string | null;
  alt_text?: string | null; status?: string | null; media?: GalleryMedia[];
};
type VideoItem = JsonObject & {
  id: number; title: string; short_description?: string | null; description?: string | null;
  provider?: string | null; video_provider?: string | null; video_url?: string | null;
  watch_url?: string | null; thumbnail_url?: string | null; image?: string | null;
  category?: string | null; tags_json?: string | null; duration_text?: string | null;
  duration_seconds?: number | null; status?: string | null; is_active?: number | boolean;
};
type Enquiry = JsonObject & {
  id: number; lead_id?: number | null; enquiry_type?: string | null; message?: string | null;
  lead_number?: string | null; lead_name?: string | null; lead_phone?: string | null;
  lead_email?: string | null; lead_status?: string | null; lead_score?: number | null;
  lead_temperature?: string | null; contact_preference?: string | null; city?: string | null;
};
type EnquiryStats = {
  total?: number; new_count?: number; qualified_count?: number; contacted_count?: number;
  follow_up_count?: number; converted_count?: number; closed_count?: number;
};
type SeoEntry = JsonObject & {
  seo_title?: string | null; meta_description?: string | null; canonical_url?: string | null;
  og_title?: string | null; og_description?: string | null; og_image?: string | null;
  twitter_title?: string | null; twitter_description?: string | null; twitter_image?: string | null;
  focus_keyword?: string | null; area?: string | null; location_label?: string | null;
};
type ContentField = {
  key: string; label: string; type: "text" | "textarea" | "number" | "checkbox" | "select";
  required?: boolean; placeholder?: string; options?: { value: string; label: string }[];
};
type ContentSchema = { route: string; label: string; description: string; icon: LucideIcon; fields: ContentField[] };

type TempleForm = {
  name: string; sanskrit_name: string; deity: string; temple_type: string; tradition: string; established: string;
  summary: string; description: string; history: string; stay: string; food: string; contact_note: string;
  image: string; logo: string; address: string; latitude: string; longitude: string; map_url: string;
  trust_name: string; contact_phone: string; contact_email: string; website_url: string; booking_enabled: boolean;
  story_video_id: string; content_note: string; peetha_number: string; peetha_body_part: string;
  shakti_form: string; bhairava: string; identification_note: string; map_embed_note: string;
};
type SeoForm = {
  seoTitle: string; metaDescription: string; canonicalUrl: string; ogTitle: string; ogDescription: string;
  ogImage: string; twitterTitle: string; twitterDescription: string; twitterImage: string; focusKeyword: string;
  area: string; locationLabel: string;
};
type GalleryForm = {
  title: string; tag: string; caption: string; description: string; cover_image: string; source_path: string; alt_text: string;
};
type MediaForm = { media_url: string; thumbnail_url: string; alt_text: string; caption: string };
type VideoForm = {
  title: string; short_description: string; description: string; video_provider: string; video_url: string;
  watch_url: string; thumbnail_url: string; image: string; category: string; tags: string; duration_text: string;
  duration_seconds: string; sort_order: string; is_active: boolean;
};
type LiveForm = {
  enabled: boolean; provider: string; video_id: string; channel_id: string; stream_url: string;
  ipcamlive_url: string; watch_url: string; title: string; time_text: string;
};

const CONTENT_SCHEMAS: ContentSchema[] = [
  {
    route: "history", label: "History", description: "Documented temple history and heritage information.", icon: BookOpen,
    fields: [
      { key: "title", label: "Section title", type: "text" },
      { key: "content", label: "Content", type: "textarea", required: true },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "significance", label: "Significance", description: "Spiritual and cultural significance.", icon: Sparkles,
    fields: [
      { key: "content", label: "Content", type: "textarea", required: true },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "darshan-timings", label: "Darshan Timings", description: "Visitor-facing darshan timing entries.", icon: Clock3,
    fields: [
      { key: "label", label: "Label", type: "text", required: true }, { key: "time_text", label: "Time", type: "text", required: true },
      { key: "day_of_week", label: "Day (0–6)", type: "number" }, { key: "season", label: "Season", type: "text" },
      { key: "valid_from", label: "Valid from", type: "text" }, { key: "valid_to", label: "Valid to", type: "text" },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "aarti", label: "Aarti", description: "Aarti name, timing and description.", icon: Bell,
    fields: [
      { key: "name", label: "Aarti name", type: "text", required: true }, { key: "time_text", label: "Time", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" }, { key: "day_of_week", label: "Day (0–6)", type: "number" },
      { key: "season", label: "Season", type: "text" }, { key: "sort_order", label: "Sort order", type: "number" },
      { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "festivals", label: "Festivals", description: "Festival and annual celebration content.", icon: CalendarClock,
    fields: [
      { key: "name", label: "Festival name", type: "text", required: true }, { key: "month", label: "Month", type: "text" },
      { key: "description", label: "Description", type: "textarea" }, { key: "event_start_date", label: "Start date", type: "text" },
      { key: "event_end_date", label: "End date", type: "text" }, { key: "year", label: "Year", type: "number" },
      { key: "image", label: "Image URL", type: "text" }, { key: "sort_order", label: "Sort order", type: "number" },
      { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "facilities", label: "Facilities", description: "Facilities and pilgrim amenities.", icon: ShieldCheck,
    fields: [
      { key: "name", label: "Facility", type: "text", required: true }, { key: "description", label: "Description", type: "textarea" },
      { key: "icon", label: "Icon key", type: "text" }, { key: "sort_order", label: "Sort order", type: "number" },
      { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "how-to-reach", label: "How to Reach", description: "Road, rail, air and local transport guidance.", icon: Map,
    fields: [
      { key: "mode", label: "Mode", type: "text", required: true }, { key: "detail", label: "Details", type: "textarea", required: true },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "faqs", label: "FAQs", description: "Frequently asked pilgrim questions.", icon: MessageCircle,
    fields: [
      { key: "question", label: "Question", type: "text", required: true }, { key: "answer", label: "Answer", type: "textarea", required: true },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "schedules", label: "Schedules", description: "Structured recurring temple schedules.", icon: CalendarClock,
    fields: [
      { key: "schedule_type", label: "Type", type: "select", required: true, options: [
        { value: "darshan", label: "Darshan" }, { value: "aarti", label: "Aarti" }, { value: "puja", label: "Puja" }, { value: "other", label: "Other" },
      ]},
      { key: "title", label: "Title", type: "text", required: true }, { key: "day_of_week", label: "Day (0–6)", type: "number" },
      { key: "start_time", label: "Start time", type: "text" }, { key: "end_time", label: "End time", type: "text" },
      { key: "season", label: "Season", type: "text" }, { key: "notes", label: "Notes", type: "textarea" },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "nearby-places", label: "Nearby Places", description: "Useful places around the pilgrimage location.", icon: MapPin,
    fields: [
      { key: "name", label: "Place name", type: "text", required: true }, { key: "distance_text", label: "Distance", type: "text" },
      { key: "description", label: "Description", type: "textarea" }, { key: "location_id", label: "Location ID", type: "number" },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "attractions", label: "Divine Attractions", description: "Temple attractions and points of interest.", icon: Sparkles,
    fields: [
      { key: "title", label: "Title", type: "text", required: true }, { key: "description", label: "Description", type: "textarea" },
      { key: "image", label: "Image URL", type: "text" }, { key: "sort_order", label: "Sort order", type: "number" },
      { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "pilgrim-experience", label: "Pilgrim Experience", description: "Practical, respectful pilgrim guidance.", icon: Eye,
    fields: [
      { key: "content", label: "Content", type: "textarea", required: true },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "committee", label: "Committee", description: "Temple committee directory entries.", icon: ShieldCheck,
    fields: [
      { key: "name", label: "Name", type: "text", required: true }, { key: "role", label: "Role", type: "text", required: true },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
  {
    route: "sources", label: "Sources", description: "Reference sources for factual temple content.", icon: Link2,
    fields: [
      { key: "title", label: "Source title", type: "text", required: true }, { key: "organization", label: "Organization", type: "text", required: true },
      { key: "url", label: "URL", type: "text", required: true },
      { key: "source_type", label: "Source type", type: "select", required: true, options: [
        { value: "Official Temple", label: "Official Temple" }, { value: "Government", label: "Government" },
        { value: "Tourism", label: "Tourism" }, { value: "Ministry", label: "Ministry" }, { value: "Reference", label: "Reference" },
      ]},
      { key: "purpose", label: "Purpose", type: "textarea" }, { key: "last_verified", label: "Last verified", type: "text" },
      { key: "sort_order", label: "Sort order", type: "number" }, { key: "is_active", label: "Visible", type: "checkbox" },
    ],
  },
];

function s(value: unknown): string { return value == null ? "" : String(value); }
function n(value: unknown): number { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function prettyStatus(value: unknown): string {
  const valueText = s(value).trim();
  return valueText ? valueText.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Pending";
}
function tone(value: unknown): string {
  const v = s(value).toLowerCase();
  if (["published", "active", "verified", "converted", "qualified"].includes(v)) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (["rejected", "suspended", "blocked", "lost", "closed", "unpublished"].includes(v)) return "bg-rose-100 text-rose-800 ring-rose-200";
  return "bg-amber-100 text-amber-900 ring-amber-200";
}
function money(value: unknown, currency = "INR"): string {
  if (value == null || value === "") return "—";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value)); }
  catch { return `${currency} ${n(value)}`; }
}
function dateLabel(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function safeUrl(value: string): boolean {
  const x = value.trim();
  if (!x) return true;
  if (x.startsWith("/") && !x.startsWith("//")) return true;
  try { const u = new URL(x); return u.protocol === "http:" || u.protocol === "https:"; }
  catch { return false; }
}
function numberOrNull(value: string): number | null { if (!value.trim()) return null; const x = Number(value); return Number.isFinite(x) ? x : null; }
function templeForm(temple: TempleRecord | null): TempleForm {
  return {
    name: s(temple?.name), sanskrit_name: s(temple?.sanskrit_name), deity: s(temple?.deity), temple_type: s(temple?.temple_type),
    tradition: s(temple?.tradition), established: s(temple?.established), summary: s(temple?.summary), description: s(temple?.description),
    history: s(temple?.history), stay: s(temple?.stay), food: s(temple?.food), contact_note: s(temple?.contact_note), image: s(temple?.image),
    logo: s(temple?.logo), address: s(temple?.address), latitude: s(temple?.latitude), longitude: s(temple?.longitude), map_url: s(temple?.map_url),
    trust_name: s(temple?.trust_name), contact_phone: s(temple?.contact_phone), contact_email: s(temple?.contact_email), website_url: s(temple?.website_url),
    booking_enabled: Boolean(temple?.booking_enabled ?? true), story_video_id: s(temple?.story_video_id), content_note: s(temple?.content_note),
    peetha_number: s(temple?.peetha_number), peetha_body_part: s(temple?.peetha_body_part), shakti_form: s(temple?.shakti_form),
    bhairava: s(temple?.bhairava), identification_note: s(temple?.identification_note), map_embed_note: s(temple?.map_embed_note),
  };
}
function seoForm(seo: SeoEntry | null): SeoForm {
  return {
    seoTitle: s(seo?.seo_title), metaDescription: s(seo?.meta_description), canonicalUrl: s(seo?.canonical_url),
    ogTitle: s(seo?.og_title), ogDescription: s(seo?.og_description), ogImage: s(seo?.og_image),
    twitterTitle: s(seo?.twitter_title), twitterDescription: s(seo?.twitter_description), twitterImage: s(seo?.twitter_image),
    focusKeyword: s(seo?.focus_keyword), area: s(seo?.area), locationLabel: s(seo?.location_label),
  };
}
function galleryForm(item?: GalleryItem): GalleryForm {
  return {
    title: s(item?.title), tag: s(item?.tag), caption: s(item?.caption), description: s(item?.description),
    cover_image: s(item?.cover_image), source_path: s(item?.source_path), alt_text: s(item?.alt_text),
  };
}
function videoForm(item?: VideoItem): VideoForm {
  let tags = "";
  if (item?.tags_json) {
    try { const parsed = JSON.parse(item.tags_json); tags = Array.isArray(parsed) ? parsed.join(", ") : ""; } catch { tags = ""; }
  }
  return {
    title: s(item?.title), short_description: s(item?.short_description), description: s(item?.description),
    video_provider: s(item?.video_provider) || "youtube", video_url: s(item?.video_url), watch_url: s(item?.watch_url),
    thumbnail_url: s(item?.thumbnail_url), image: s(item?.image), category: s(item?.category), tags,
    duration_text: s(item?.duration_text), duration_seconds: s(item?.duration_seconds), sort_order: s(item?.sort_order ?? 0),
    is_active: Boolean(item?.is_active ?? true),
  };
}
function liveForm(data?: JsonObject | null): LiveForm {
  return {
    enabled: Boolean(data?.enabled), provider: s(data?.provider) || "youtube", video_id: s(data?.video_id),
    channel_id: s(data?.channel_id), stream_url: s(data?.stream_url), ipcamlive_url: s(data?.ipcamlive_url),
    watch_url: s(data?.watch_url), title: s(data?.title) || "Live Aarti & Darshan", time_text: s(data?.time_text),
  };
}

export default function TempleDashboard() {
  useSEO({
    title: "Temple Dashboard — DivyaDhara",
    description: "Manage your assigned temple, pilgrimage content, gallery, videos, enquiries, SEO, subscription and analytics.",
    path: "/temple/dashboard",
  });

  const { user, logout, notifications = [] } = useApp();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [assignedTemples, setAssignedTemples] = useState<TempleListItem[]>([]);
  const [selectedTempleId, setSelectedTempleId] = useState<number | null>(null);
  const [temple, setTemple] = useState<TempleRecord | null>(null);
  const [features, setFeatures] = useState<FeatureSummary | null>(null);
  const [subscription, setSubscription] = useState<TempleSubscription | null>(null);

  const [profileForm, setProfileForm] = useState<TempleForm>(templeForm(null));
  const [savingProfile, setSavingProfile] = useState(false);

  const [contentRoute, setContentRoute] = useState(CONTENT_SCHEMAS[0].route);
  const [contentItems, setContentItems] = useState<JsonObject[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentModal, setContentModal] = useState(false);
  const [contentForm, setContentForm] = useState<JsonObject>({});
  const [editingContentId, setEditingContentId] = useState<number | null>(null);
  const [savingContent, setSavingContent] = useState(false);

  const [pujas, setPujas] = useState<PujaItem[]>([]);
  const [pujaCatalog, setPujaCatalog] = useState<PujaItem[]>([]);
  const [pujaLimit, setPujaLimit] = useState(0);
  const [pujaLoading, setPujaLoading] = useState(false);
  const [pujaSearch, setPujaSearch] = useState("");
  const [attachingPujaId, setAttachingPujaId] = useState<number | null>(null);

  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryLimit, setGalleryLimit] = useState(0);
  const [galleryModal, setGalleryModal] = useState(false);
  const [galleryFormState, setGalleryFormState] = useState<GalleryForm>(galleryForm());
  const [editingGalleryId, setEditingGalleryId] = useState<number | null>(null);
  const [mediaModal, setMediaModal] = useState(false);
  const [mediaGalleryId, setMediaGalleryId] = useState<number | null>(null);
  const [mediaForm, setMediaForm] = useState<MediaForm>({ media_url: "", thumbnail_url: "", alt_text: "", caption: "" });
  const [savingGallery, setSavingGallery] = useState(false);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoLimit, setVideoLimit] = useState(0);
  const [videoModal, setVideoModal] = useState(false);
  const [videoFormState, setVideoFormState] = useState<VideoForm>(videoForm());
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [savingVideo, setSavingVideo] = useState(false);

  const [live, setLive] = useState<JsonObject | null>(null);
  const [liveFormState, setLiveFormState] = useState<LiveForm>(liveForm());
  const [savingLive, setSavingLive] = useState(false);

  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [enquiryStats, setEnquiryStats] = useState<EnquiryStats>({});
  const [searchLeads, setSearchLeads] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedLead, setSelectedLead] = useState<Enquiry | null>(null);
  const [leadNote, setLeadNote] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  const [seo, setSeo] = useState<SeoEntry | null>(null);
  const [seoKeywords, setSeoKeywords] = useState<JsonObject[]>([]);
  const [seoEntitled, setSeoEntitled] = useState(false);
  const [seoFormState, setSeoFormState] = useState<SeoForm>(seoForm(null));
  const [newKeyword, setNewKeyword] = useState("");
  const [keywordType, setKeywordType] = useState("primary");
  const [savingSeo, setSavingSeo] = useState(false);

  const [analytics, setAnalytics] = useState<JsonObject | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const schema = useMemo(
    () => CONTENT_SCHEMAS.find((x) => x.route === contentRoute) ?? CONTENT_SCHEMAS[0],
    [contentRoute],
  );

  const leadOpenCount = Number(enquiryStats.new_count ?? 0) + Number(enquiryStats.qualified_count ?? 0) +
    Number(enquiryStats.contacted_count ?? 0) + Number(enquiryStats.follow_up_count ?? 0);

  const planName = features?.planName || subscription?.plan_name || "No active plan";
  const leadUsed = Number(subscription?.leads_used ?? 0);
  const leadLimit = Number(features?.limits?.lead ?? subscription?.lead_limit ?? 0);
  const publicPublished = temple?.status === "published";
  const listingReady = Boolean(publicPublished && features?.listingEnabled);
  const serviceLimit = Number(features?.limits?.service ?? pujaLimit ?? 0);
  const hasPujaEntitlement = serviceLimit > 0;
  const hasGalleryEntitlement = Number(features?.limits?.gallery ?? galleryLimit ?? 0) > 0;
  const hasVideoEntitlement = Number(features?.limits?.video ?? videoLimit ?? 0) > 0;

  const inputClass =
    "w-full rounded-xl border border-orange-900/10 bg-white px-3.5 py-3 text-sm text-stone-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-stone-100";
  const areaClass = `${inputClass} min-h-32 resize-y`;

  const timeoutRequest = useCallback(async <T,>(path: string, options: { method?: string; body?: unknown } = {}) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try { return await apiRequest<T>(path, { ...options, signal: controller.signal }); }
    finally { window.clearTimeout(timer); }
  }, []);

  useEffect(() => {
    const role = String(user?.role ?? "");
    if (!user) return;
    const paths: Record<string, string> = {
      visitor: "/dashboard", pandit: "/pandit/dashboard", temple_manager: "/temple/dashboard",
      ashram_manager: "/ashram/dashboard", sales: "/sales/dashboard", super_admin: "/admin",
    };
    if (paths[role] && role !== "temple_manager") navigate(paths[role], { replace: true });
  }, [navigate, user]);

  const loadAssigned = useCallback(async (preferredId?: number | null) => {
    setLoading(true); setPageError(null);
    try {
      const response = await timeoutRequest<{ temples?: TempleListItem[] }>("/api/temples/manager/temples?limit=100");
      const list = response.temples ?? [];
      setAssignedTemples(list);
      setSelectedTempleId((current) =>
        (preferredId && list.some((x) => x.id === preferredId) ? preferredId : null) ??
        (current && list.some((x) => x.id === current) ? current : null) ??
        list[0]?.id ?? null,
      );
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load assigned temples.");
    } finally { setLoading(false); }
  }, [timeoutRequest]);

  useEffect(() => {
    if (String(user?.role ?? "") === "temple_manager") void loadAssigned();
  }, [loadAssigned, user?.role]);

  const loadTemple = useCallback(async (id: number) => {
    try {
      const response = await timeoutRequest<{
        temple?: TempleRecord; activeFeatures?: FeatureSummary | null; subscription?: TempleSubscription | null;
      }>(`/api/temples/manage/${id}`);
      setTemple(response.temple ?? null);
      setFeatures(response.activeFeatures ?? null);
      setSubscription(response.subscription ?? null);
      setProfileForm(templeForm(response.temple ?? null));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load temple.");
    }
  }, [timeoutRequest]);

  useEffect(() => {
    if (selectedTempleId) void loadTemple(selectedTempleId);
    else setTemple(null);
  }, [loadTemple, selectedTempleId]);

  const saveTempleProfile = useCallback(async () => {
    if (!selectedTempleId) return;
    if (profileForm.name.trim().length < 2) { toast("warning", "Temple name must contain at least 2 characters."); return; }
    for (const [label, value] of [
      ["Main image", profileForm.image], ["Logo", profileForm.logo], ["Map URL", profileForm.map_url], ["Website URL", profileForm.website_url],
    ] as Array<[string, string]>) {
      if (!safeUrl(value)) { toast("warning", `${label} must be a valid HTTP(S) URL or safe relative path.`); return; }
    }
    const lat = numberOrNull(profileForm.latitude), lng = numberOrNull(profileForm.longitude);
    if (lat !== null && (lat < -90 || lat > 90)) { toast("warning", "Latitude must be between -90 and 90."); return; }
    if (lng !== null && (lng < -180 || lng > 180)) { toast("warning", "Longitude must be between -180 and 180."); return; }
    if (profileForm.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.contact_email.trim())) {
      toast("warning", "Please enter a valid temple contact email."); return;
    }
    setSavingProfile(true);
    try {
      const response = await apiRequest<{ temple?: TempleRecord }>(`/api/temples/manage/${selectedTempleId}`, {
        method: "PATCH",
        body: {
          name: profileForm.name.trim(), sanskrit_name: profileForm.sanskrit_name.trim() || null, deity: profileForm.deity.trim() || null,
          temple_type: profileForm.temple_type.trim() || null, tradition: profileForm.tradition.trim() || null, established: profileForm.established.trim() || null,
          summary: profileForm.summary.trim() || null, description: profileForm.description.trim() || null, history: profileForm.history.trim() || null,
          stay: profileForm.stay.trim() || null, food: profileForm.food.trim() || null, contact_note: profileForm.contact_note.trim() || null,
          image: profileForm.image.trim() || null, logo: profileForm.logo.trim() || null, address: profileForm.address.trim() || null,
          latitude: lat, longitude: lng, map_url: profileForm.map_url.trim() || null, trust_name: profileForm.trust_name.trim() || null,
          contact_phone: profileForm.contact_phone.trim() || null, contact_email: profileForm.contact_email.trim() || null,
          website_url: profileForm.website_url.trim() || null, booking_enabled: profileForm.booking_enabled,
          story_video_id: profileForm.story_video_id.trim() || null, content_note: profileForm.content_note.trim() || null,
          peetha_number: numberOrNull(profileForm.peetha_number), peetha_body_part: profileForm.peetha_body_part.trim() || null,
          shakti_form: profileForm.shakti_form.trim() || null, bhairava: profileForm.bhairava.trim() || null,
          identification_note: profileForm.identification_note.trim() || null, map_embed_note: profileForm.map_embed_note.trim() || null,
        },
      });
      if (response.temple) { setTemple(response.temple); setProfileForm(templeForm(response.temple)); }
      await loadAssigned(selectedTempleId);
      await showSuccess("Temple profile saved", "The temple information has been updated successfully.");
    } catch (error) { await showError("Profile save failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingProfile(false); }
  }, [loadAssigned, profileForm, selectedTempleId]);

  const submitForReview = useCallback(async () => {
    if (!selectedTempleId || !temple || temple.status === "pending" || temple.status === "published") return;
    const ok = await confirmAction("Submit temple for Admin review?", "Temple Managers cannot directly publish or unpublish temples. The request will move to the Admin review workflow.", "Submit");
    if (!ok) return;
    try {
      const response = await apiRequest<{ temple?: TempleRecord }>(`/api/temples/manage/${selectedTempleId}/publish`, { method: "POST", body: { status: "pending" } });
      if (response.temple) { setTemple(response.temple); setProfileForm(templeForm(response.temple)); }
      await loadAssigned(selectedTempleId);
      await showSuccess("Submitted for review", "Your temple is now pending Admin review.");
    } catch (error) { await showError("Review submission failed", error instanceof Error ? error.message : "Please try again."); }
  }, [loadAssigned, selectedTempleId, temple]);

  const loadContent = useCallback(async () => {
    if (!selectedTempleId) return;
    setContentLoading(true);
    try {
      const response = await apiRequest<{ items?: JsonObject[] }>(`/api/temples/manage/${selectedTempleId}/${schema.route}`);
      setContentItems(response.items ?? []);
    } catch (error) { await showWarning("Content unavailable", error instanceof Error ? error.message : "Please try again."); }
    finally { setContentLoading(false); }
  }, [schema.route, selectedTempleId]);

  useEffect(() => { if (tab === "content") void loadContent(); }, [loadContent, tab]);

  const openContent = useCallback((item?: JsonObject) => {
    const values: JsonObject = {};
    for (const field of schema.fields) {
      values[field.key] = item?.[field.key] ?? (field.type === "checkbox" ? true : field.type === "number" ? 0 : field.options?.[0]?.value ?? "");
    }
    setEditingContentId(item ? Number(item.id) : null); setContentForm(values); setContentModal(true);
  }, [schema]);

  const saveContent = useCallback(async () => {
    if (!selectedTempleId) return;
    for (const field of schema.fields) {
      if (field.required && !s(contentForm[field.key]).trim()) { toast("warning", `${field.label} is required.`); return; }
    }
    setSavingContent(true);
    try {
      const body: JsonObject = {};
      for (const field of schema.fields) {
        if (field.type === "checkbox") body[field.key] = Boolean(contentForm[field.key]);
        else if (field.type === "number") body[field.key] = contentForm[field.key] === "" ? null : Number(contentForm[field.key]);
        else body[field.key] = s(contentForm[field.key]).trim();
      }
      const base = `/api/temples/manage/${selectedTempleId}/${schema.route}`;
      if (editingContentId) await apiRequest(`${base}/${editingContentId}`, { method: "PATCH", body });
      else await apiRequest(base, { method: "POST", body: { ...body, status: "draft" } });
      await loadContent(); setContentModal(false); setEditingContentId(null);
      await showSuccess("Content saved", "The content was saved to this temple collection.");
    } catch (error) { await showError("Content save failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingContent(false); }
  }, [contentForm, editingContentId, loadContent, schema, selectedTempleId]);

  const deleteContent = useCallback(async (item: JsonObject) => {
    if (!selectedTempleId) return;
    const ok = await confirmAction("Delete this content item?", "This structured content record will be removed.", "Delete");
    if (!ok) return;
    try { await apiRequest(`/api/temples/manage/${selectedTempleId}/${schema.route}/${Number(item.id)}`, { method: "DELETE" }); await loadContent(); toast("success", "Content deleted."); }
    catch (error) { await showError("Delete failed", error instanceof Error ? error.message : "Please try again."); }
  }, [loadContent, schema.route, selectedTempleId]);

  const loadPujas = useCallback(async () => {
    if (!selectedTempleId) return;
    setPujaLoading(true);
    try {
      const [attachedResponse, catalogResponse] = await Promise.all([
        apiRequest<{ pujas?: PujaItem[]; usage?: { count?: number; limit?: number } }>(
          `/api/temples/manage/${selectedTempleId}/pujas`,
        ),
        timeoutRequest<{ services?: PujaItem[] }>(
          `/api/puja-services?status=published&limit=100`,
        ),
      ]);

      setPujas(attachedResponse.pujas ?? []);
      setPujaLimit(Number(attachedResponse.usage?.limit ?? features?.limits?.service ?? 0));
      setPujaCatalog(catalogResponse.services ?? []);
    } catch (error) {
      await showWarning(
        "Puja services unavailable",
        error instanceof Error ? error.message : "Unable to load temple Puja services.",
      );
    } finally {
      setPujaLoading(false);
    }
  }, [features?.limits?.service, selectedTempleId, timeoutRequest]);

  useEffect(() => {
    if (tab === "pujas") void loadPujas();
  }, [loadPujas, tab]);

  const attachPuja = useCallback(async (puja: PujaItem) => {
    if (!selectedTempleId) return;
    if (!hasPujaEntitlement) {
      await showWarning(
        "Puja management requires a Temple plan",
        "Your current plan does not include temple Puja-service slots. Review your subscription to continue.",
      );
      return;
    }
    if (pujas.some((item) => item.id === puja.id)) {
      toast("warning", "This Puja is already attached to the temple.");
      return;
    }
    if (pujaLimit > 0 && pujas.length >= pujaLimit) {
      await showWarning(
        "Puja service limit reached",
        `Your current plan allows ${pujaLimit} attached Puja services.`,
      );
      return;
    }

    setAttachingPujaId(puja.id);
    try {
      await apiRequest(`/api/temples/manage/${selectedTempleId}/pujas`, {
        method: "POST",
        body: { pujaId: puja.id },
      });
      await loadPujas();
      await showSuccess("Puja attached", `${puja.name} is now available on this temple profile.`);
    } catch (error) {
      await showError(
        "Puja attach failed",
        error instanceof Error ? error.message : "Unable to attach this Puja service.",
      );
    } finally {
      setAttachingPujaId(null);
    }
  }, [hasPujaEntitlement, loadPujas, pujaLimit, pujas, selectedTempleId]);

  const detachPuja = useCallback(async (puja: PujaItem) => {
    if (!selectedTempleId) return;
    const ok = await confirmAction(
      "Remove this Puja from the temple?",
      `${puja.name} will no longer be associated with this temple profile.`,
      "Remove",
    );
    if (!ok) return;
    try {
      await apiRequest(`/api/temples/manage/${selectedTempleId}/pujas/${puja.id}`, { method: "DELETE" });
      await loadPujas();
      toast("success", "Puja removed from the temple.");
    } catch (error) {
      await showError(
        "Puja removal failed",
        error instanceof Error ? error.message : "Unable to remove this Puja service.",
      );
    }
  }, [loadPujas, selectedTempleId]);

  const filteredPujaCatalog = useMemo(() => {
    const attachedIds = new Set(pujas.map((item) => item.id));
    const q = pujaSearch.trim().toLowerCase();
    return pujaCatalog
      .filter((item) => !attachedIds.has(item.id))
      .filter((item) => !q || [item.name, item.category, item.deity, item.tagline, item.short_description]
        .some((value) => s(value).toLowerCase().includes(q)))
      .slice(0, 50);
  }, [pujaCatalog, pujaSearch, pujas]);

  const loadGallery = useCallback(async () => {
    if (!selectedTempleId) return;
    try {
      const response = await apiRequest<{ gallery?: GalleryItem[]; usage?: { items?: number; limit?: number } }>(`/api/temples/manage/${selectedTempleId}/gallery`);
      setGallery(response.gallery ?? []); setGalleryLimit(Number(response.usage?.limit ?? features?.limits?.gallery ?? 0));
    } catch (error) { await showWarning("Gallery unavailable", error instanceof Error ? error.message : "Please try again."); }
  }, [features?.limits?.gallery, selectedTempleId]);

  useEffect(() => { if (tab === "gallery") void loadGallery(); }, [loadGallery, tab]);

  const openGalleryCreate = useCallback(() => {
    if (!features || !hasGalleryEntitlement) { void showWarning("Gallery not included", "Your active Temple plan does not include gallery capacity. Review your subscription to continue."); return; }
    if (galleryLimit > 0 && gallery.length >= galleryLimit) { void showWarning("Gallery limit reached", `Your plan allows ${galleryLimit} gallery items.`); return; }
    setEditingGalleryId(null); setGalleryFormState(galleryForm()); setGalleryModal(true);
  }, [features, gallery.length, galleryLimit, hasGalleryEntitlement]);

  const saveGallery = useCallback(async () => {
    if (!selectedTempleId || !galleryFormState.title.trim()) { toast("warning", "Gallery title is required."); return; }
    if (!safeUrl(galleryFormState.cover_image) || !safeUrl(galleryFormState.source_path)) { toast("warning", "Gallery URLs must be valid HTTP(S) URLs or safe relative paths."); return; }
    setSavingGallery(true);
    try {
      const body = {
        title: galleryFormState.title.trim(), tag: galleryFormState.tag.trim() || null, caption: galleryFormState.caption.trim() || null,
        description: galleryFormState.description.trim() || null, cover_image: galleryFormState.cover_image.trim() || null,
        source_path: galleryFormState.source_path.trim() || null, alt_text: galleryFormState.alt_text.trim() || null, status: "draft",
      };
      const base = `/api/temples/manage/${selectedTempleId}/gallery`;
      if (editingGalleryId) await apiRequest(`${base}/${editingGalleryId}`, { method: "PATCH", body });
      else await apiRequest(base, { method: "POST", body });
      await loadGallery(); setGalleryModal(false); setEditingGalleryId(null);
      await showSuccess("Gallery saved", "The gallery item remains in the Manager draft workflow until it is published.");
    } catch (error) { await showError("Gallery save failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingGallery(false); }
  }, [editingGalleryId, galleryFormState, loadGallery, selectedTempleId]);

  const deleteGallery = useCallback(async (item: GalleryItem) => {
    if (!selectedTempleId) return;
    const ok = await confirmAction("Delete gallery item?", `${item.title} and its media will be removed.`, "Delete");
    if (!ok) return;
    try { await apiRequest(`/api/temples/manage/${selectedTempleId}/gallery/${item.id}`, { method: "DELETE" }); await loadGallery(); toast("success", "Gallery item deleted."); }
    catch (error) { await showError("Gallery delete failed", error instanceof Error ? error.message : "Please try again."); }
  }, [loadGallery, selectedTempleId]);

  const addMedia = useCallback(async () => {
    if (!selectedTempleId || !mediaGalleryId || !mediaForm.media_url.trim() || !safeUrl(mediaForm.media_url) || !safeUrl(mediaForm.thumbnail_url)) {
      toast("warning", "A valid media URL is required."); return;
    }
    try {
      await apiRequest(`/api/temples/manage/${selectedTempleId}/gallery/${mediaGalleryId}/media`, {
        method: "POST",
        body: { media_url: mediaForm.media_url.trim(), thumbnail_url: mediaForm.thumbnail_url.trim() || null, alt_text: mediaForm.alt_text.trim() || null, caption: mediaForm.caption.trim() || null },
      });
      await loadGallery(); setMediaModal(false); toast("success", "Media attached.");
    } catch (error) { await showError("Media upload failed", error instanceof Error ? error.message : "Please try again."); }
  }, [loadGallery, mediaForm, mediaGalleryId, selectedTempleId]);

  const removeMedia = useCallback(async (galleryId: number, mediaId: number) => {
    if (!selectedTempleId) return;
    const ok = await confirmAction("Remove this media?", "The media record will be removed from the gallery item.", "Remove");
    if (!ok) return;
    try { await apiRequest(`/api/temples/manage/${selectedTempleId}/gallery/${galleryId}/media/${mediaId}`, { method: "DELETE" }); await loadGallery(); }
    catch (error) { await showError("Media removal failed", error instanceof Error ? error.message : "Please try again."); }
  }, [loadGallery, selectedTempleId]);

  const loadVideos = useCallback(async () => {
    if (!selectedTempleId) return;
    try {
      const response = await apiRequest<{ videos?: VideoItem[]; usage?: { limit?: number } }>(`/api/temples/manage/${selectedTempleId}/videos`);
      setVideos(response.videos ?? []); setVideoLimit(Number(response.usage?.limit ?? features?.limits?.video ?? 0));
    } catch (error) { await showWarning("Videos unavailable", error instanceof Error ? error.message : "Please try again."); }
  }, [features?.limits?.video, selectedTempleId]);

  useEffect(() => { if (tab === "videos") void loadVideos(); }, [loadVideos, tab]);

  const saveVideo = useCallback(async () => {
    if (!selectedTempleId || videoFormState.title.trim().length < 2) { toast("warning", "Video title must contain at least 2 characters."); return; }
    if (!safeUrl(videoFormState.video_url) || !safeUrl(videoFormState.watch_url) || !safeUrl(videoFormState.thumbnail_url) || !safeUrl(videoFormState.image)) {
      toast("warning", "Video URLs must be valid HTTP(S) URLs or safe relative paths."); return;
    }
    setSavingVideo(true);
    try {
      const body = {
        title: videoFormState.title.trim(), short_description: videoFormState.short_description.trim() || null,
        description: videoFormState.description.trim() || null, video_provider: videoFormState.video_provider,
        video_url: videoFormState.video_url.trim(), watch_url: videoFormState.watch_url.trim() || videoFormState.video_url.trim(),
        thumbnail_url: videoFormState.thumbnail_url.trim() || null, image: videoFormState.image.trim() || null,
        category: videoFormState.category.trim() || null, tags: videoFormState.tags.split(",").map((x) => x.trim()).filter(Boolean),
        duration_text: videoFormState.duration_text.trim() || null, duration_seconds: numberOrNull(videoFormState.duration_seconds),
        sort_order: Number(videoFormState.sort_order || 0), is_active: videoFormState.is_active, status: "draft",
      };
      const base = `/api/temples/manage/${selectedTempleId}/videos`;
      if (editingVideoId) await apiRequest(`${base}/${editingVideoId}`, { method: "PATCH", body });
      else await apiRequest(base, { method: "POST", body });
      await loadVideos(); setVideoModal(false); setEditingVideoId(null);
      await showSuccess("Video saved", "The video remains a draft until the publication workflow makes it public.");
    } catch (error) { await showError("Video save failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingVideo(false); }
  }, [editingVideoId, loadVideos, selectedTempleId, videoFormState]);

  const deleteVideo = useCallback(async (item: VideoItem) => {
    if (!selectedTempleId) return;
    const ok = await confirmAction("Delete this video?", `${item.title} will be removed from the temple video library.`, "Delete");
    if (!ok) return;
    try { await apiRequest(`/api/temples/manage/${selectedTempleId}/videos/${item.id}`, { method: "DELETE" }); await loadVideos(); toast("success", "Video deleted."); }
    catch (error) { await showError("Video delete failed", error instanceof Error ? error.message : "Please try again."); }
  }, [loadVideos, selectedTempleId]);

  const loadLive = useCallback(async () => {
    if (!selectedTempleId) return;
    try {
      const response = await apiRequest<{ liveAarti?: JsonObject | null }>(`/api/temples/manage/${selectedTempleId}/live-aarti`);
      setLive(response.liveAarti ?? null); setLiveFormState(liveForm(response.liveAarti));
    } catch (error) { await showWarning("Live Aarti unavailable", error instanceof Error ? error.message : "Please try again."); }
  }, [selectedTempleId]);

  useEffect(() => { if (tab === "live") void loadLive(); }, [loadLive, tab]);

  const saveLive = useCallback(async () => {
    if (!selectedTempleId) return;
    if (liveFormState.enabled && !features?.liveAartiEnabled) {
      await showWarning("Live Aarti is not included", "Enablement is controlled by the active Temple subscription. Review your subscription to unlock Live Aarti.");
      return;
    }
    if (!safeUrl(liveFormState.stream_url) || !safeUrl(liveFormState.ipcamlive_url) || !safeUrl(liveFormState.watch_url)) {
      toast("warning", "Live URLs must be valid HTTP(S) URLs or safe relative paths."); return;
    }
    setSavingLive(true);
    try {
      const response = await apiRequest<{ liveAarti?: JsonObject | null }>(`/api/temples/manage/${selectedTempleId}/live-aarti`, {
        method: "PUT",
        body: {
          enabled: liveFormState.enabled, provider: liveFormState.provider, video_id: liveFormState.video_id.trim() || null,
          channel_id: liveFormState.channel_id.trim() || null, stream_url: liveFormState.stream_url.trim() || null,
          ipcamlive_url: liveFormState.ipcamlive_url.trim() || null, watch_url: liveFormState.watch_url.trim() || null,
          title: liveFormState.title.trim() || "Live Aarti & Darshan", time_text: liveFormState.time_text.trim() || null,
        },
      });
      setLive(response.liveAarti ?? null); setLiveFormState(liveForm(response.liveAarti));
      await showSuccess("Live Aarti saved", "The configuration was saved. Feature access remains subscription-gated.");
    } catch (error) { await showError("Live Aarti save failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingLive(false); }
  }, [features?.liveAartiEnabled, liveFormState, selectedTempleId]);

  const loadLeads = useCallback(async () => {
    if (!selectedTempleId) return;
    try {
      const q = new URLSearchParams({ limit: "50" });
      if (searchLeads.trim()) q.set("search", searchLeads.trim());
      if (statusFilter) q.set("status", statusFilter);
      const [list, stats] = await Promise.all([
        apiRequest<{ enquiries?: Enquiry[] }>(`/api/temples/manage/${selectedTempleId}/enquiries?${q.toString()}`),
        apiRequest<{ stats?: EnquiryStats }>(`/api/temples/manage/${selectedTempleId}/enquiries/stats`),
      ]);
      setEnquiries(list.enquiries ?? []); setEnquiryStats(stats.stats ?? {});
    } catch (error) { await showWarning("Leads unavailable", error instanceof Error ? error.message : "Please try again."); }
  }, [searchLeads, selectedTempleId, statusFilter]);

  useEffect(() => { if (tab === "leads") void loadLeads(); }, [loadLeads, tab]);

  const openLead = useCallback(async (item: Enquiry) => {
    if (!item.lead_id) { setSelectedLead(item); return; }
    try {
      const response = await apiRequest<{ lead?: JsonObject }>(`/api/leads/${item.lead_id}`);
      setSelectedLead({ ...item, ...(response.lead ?? {}) } as Enquiry);
    } catch { setSelectedLead(item); }
  }, []);

  const updateLeadStatus = useCallback(async (status: string) => {
    if (!selectedLead?.lead_id) return;
    setSavingLead(true);
    try {
      await apiRequest(`/api/leads/${selectedLead.lead_id}/status`, { method: "PATCH", body: { status } });
      setSelectedLead((current) => current ? { ...current, lead_status: status } : current);
      await loadLeads(); toast("success", `Lead status changed to ${prettyStatus(status)}.`);
    } catch (error) { await showError("Lead status update failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingLead(false); }
  }, [loadLeads, selectedLead]);

  const addLeadNote = useCallback(async () => {
    if (!selectedLead?.lead_id || !leadNote.trim()) return;
    setSavingLead(true);
    try {
      await apiRequest(`/api/leads/${selectedLead.lead_id}/notes`, { method: "POST", body: { note: leadNote.trim(), noteType: "internal" } });
      setLeadNote(""); toast("success", "Internal note saved.");
    } catch (error) { await showError("Note save failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingLead(false); }
  }, [leadNote, selectedLead]);

  const addFollowup = useCallback(async () => {
    if (!selectedLead?.lead_id || !followupDate) { toast("warning", "Choose a follow-up date."); return; }
    setSavingLead(true);
    try {
      await apiRequest(`/api/leads/${selectedLead.lead_id}/followups`, {
        method: "POST",
        body: { dueAt: followupDate, followupType: "call", subject: "Temple enquiry follow-up", notes: followupNote.trim() || null },
      });
      setFollowupDate(""); setFollowupNote(""); await updateLeadStatus("follow_up"); toast("success", "Follow-up scheduled.");
    } catch (error) { await showError("Follow-up failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingLead(false); }
  }, [followupDate, followupNote, selectedLead, updateLeadStatus]);

  const loadSeo = useCallback(async () => {
    if (!selectedTempleId) return;
    try {
      const response = await apiRequest<{ seo?: SeoEntry | null; keywords?: JsonObject[]; entitlement?: { enhancedSeo?: boolean } }>(`/api/temples/manage/${selectedTempleId}/seo`);
      setSeo(response.seo ?? null); setSeoKeywords(response.keywords ?? []); setSeoEntitled(Boolean(response.entitlement?.enhancedSeo));
      setSeoFormState(seoForm(response.seo ?? null));
    } catch (error) { await showWarning("SEO unavailable", error instanceof Error ? error.message : "Please try again."); }
  }, [selectedTempleId]);

  useEffect(() => { if (tab === "seo") void loadSeo(); }, [loadSeo, tab]);

  const saveSeo = useCallback(async () => {
    if (!selectedTempleId || !seoEntitled) return;
    if (!safeUrl(seoFormState.canonicalUrl) || !safeUrl(seoFormState.ogImage) || !safeUrl(seoFormState.twitterImage)) {
      toast("warning", "SEO URLs must be valid HTTP(S) URLs or safe relative paths."); return;
    }
    setSavingSeo(true);
    try {
      const response = await apiRequest<{ seo?: SeoEntry }>(`/api/temples/manage/${selectedTempleId}/seo`, {
        method: "PUT", body: seoFormState,
      });
      setSeo(response.seo ?? null); setSeoFormState(seoForm(response.seo ?? null));
      await showSuccess("SEO saved", "Enhanced SEO metadata has been updated.");
    } catch (error) { await showError("SEO save failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setSavingSeo(false); }
  }, [selectedTempleId, seoEntitled, seoFormState]);

  const addKeyword = useCallback(async () => {
    if (!selectedTempleId || !seoEntitled || !newKeyword.trim()) return;
    try {
      await apiRequest(`/api/temples/manage/${selectedTempleId}/seo/keywords`, {
        method: "POST", body: { keyword: newKeyword.trim(), keywordType, sortOrder: seoKeywords.length },
      });
      setNewKeyword(""); await loadSeo();
    } catch (error) { await showError("Keyword save failed", error instanceof Error ? error.message : "Please try again."); }
  }, [keywordType, loadSeo, newKeyword, seoEntitled, seoKeywords.length, selectedTempleId]);

  const removeKeyword = useCallback(async (id: number) => {
    if (!selectedTempleId || !seoEntitled) return;
    try { await apiRequest(`/api/temples/manage/${selectedTempleId}/seo/keywords/${id}`, { method: "DELETE" }); await loadSeo(); }
    catch (error) { await showError("Keyword removal failed", error instanceof Error ? error.message : "Please try again."); }
  }, [loadSeo, seoEntitled, selectedTempleId]);

  const loadAnalytics = useCallback(async () => {
    if (!selectedTempleId) return;
    setAnalyticsLoading(true); setAnalyticsError(null);
    try {
      const from = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); })();
      const to = new Date().toISOString().slice(0, 10);
      setAnalytics(await apiRequest<JsonObject>(`/api/temples/manage/${selectedTempleId}/insights?from=${from}%2000:00:00&to=${to}%2023:59:59`));
    } catch (error) {
      setAnalytics(null);
      setAnalyticsError(error instanceof TempleApiError && error.status === 403
        ? "Analytics are not included in the current Temple plan."
        : error instanceof Error ? error.message : "Unable to load analytics.");
    } finally { setAnalyticsLoading(false); }
  }, [selectedTempleId]);

  useEffect(() => { if (tab === "analytics") void loadAnalytics(); }, [loadAnalytics, tab]);

  const handleLogout = useCallback(async () => {
    const ok = await confirmAction("Logout from Temple Dashboard?", "Your current browser session will be closed.", "Logout");
    if (!ok) return;
    try { await logout(); navigate("/", { replace: true }); }
    catch (error) { await showError("Logout failed", error instanceof Error ? error.message : "Please try again."); }
  }, [logout, navigate]);

  if (String(user?.role ?? "") !== "temple_manager") return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-orange-900/10 bg-white p-10 text-center shadow-sm">
            <LoaderCircle className="mx-auto animate-spin text-orange-700" size={28} />
            <h1 className="mt-4 text-2xl font-black">Loading Temple Dashboard</h1>
            <p className="mt-2 text-sm text-stone-500">Checking your active temple assignment and secure management access…</p>
          </div>
        </div>
      </div>
    );
  }

  if (assignedTemples.length === 0) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-orange-900/10 bg-white p-8 text-center shadow-sm">
            <ShieldCheck className="mx-auto text-orange-700" size={38} />
            <h1 className="mt-4 text-2xl font-black">Temple assignment required</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">Your Temple Manager account is authenticated, but there is no active temple assignment. A Super Admin must assign your account before this dashboard can manage a temple.</p>
            <button type="button" onClick={() => void loadAssigned()} className="btn-saffron mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"><RefreshCw size={16} /> Check Again</button>
          </div>
        </div>
      </div>
    );
  }

  if (!temple || !selectedTempleId) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-3xl border border-orange-900/10 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto text-amber-700" size={38} />
            <h1 className="mt-4 text-2xl font-black">Temple data is not available</h1>
            <p className="mt-2 text-sm text-stone-600">{pageError || "Refresh the dashboard and try again."}</p>
            <button type="button" onClick={() => void loadAssigned(selectedTempleId)} className="btn-saffron mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"><RefreshCw size={16} /> Refresh</button>
          </div>
        </div>
      </div>
    );
  }

  const navItems: { id: TabId; label: string; icon: LucideIcon; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "temple", label: "My Temple", icon: BookOpen },
    { id: "content", label: "Temple Content", icon: FileText },
    { id: "pujas", label: "Puja Services", icon: Sparkles, badge: pujas.length || undefined },
    { id: "gallery", label: "Gallery", icon: ImagePlus, badge: gallery.length || undefined },
    { id: "videos", label: "Videos", icon: Video, badge: videos.length || undefined },
    { id: "live", label: "Live Aarti", icon: Youtube },
    { id: "leads", label: "Enquiries & Leads", icon: MessageCircle, badge: leadOpenCount || undefined },
    { id: "seo", label: "SEO", icon: Search },
    { id: "subscription", label: "Subscription", icon: IndianRupee },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "notifications", label: "Notifications", icon: Bell, badge: notifications.length || undefined },
  ];

  const cards: { label: string; value: string | number; sub: string; icon: LucideIcon }[] = [
    { label: "Temple status", value: prettyStatus(temple.status), sub: listingReady ? "Public listing is live" : "Admin publication workflow", icon: ShieldCheck },
    { label: "Open enquiries", value: leadOpenCount, sub: "Active business enquiries", icon: MessageCircle },
    { label: "Gallery", value: gallery.length, sub: galleryLimit ? `Limit ${galleryLimit}` : "No active entitlement", icon: ImagePlus },
    { label: "Videos", value: videos.length, sub: videoLimit ? `Limit ${videoLimit}` : "No active entitlement", icon: Video },
    { label: "Puja services", value: pujas.length, sub: serviceLimit ? `Limit ${serviceLimit}` : "No active entitlement", icon: Sparkles },
  ];

  const setPF = (key: keyof TempleForm, value: string | boolean) => setProfileForm((current) => ({ ...current, [key]: value }));
  const notificationsList = notifications as unknown as Array<{ id?: number | string; title?: string; message?: string; text?: string; date?: string }>;

  return (
    <div className="min-h-screen bg-[#f7f2ea] text-stone-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#2a1a10] text-white shadow-lg">
        <div className="mx-auto flex min-h-16 max-w-[1550px] items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileNav((x) => !x)} className="rounded-xl border border-white/10 p-2 md:hidden"><Menu size={18} /></button>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-600"><BookOpen size={18} /></div>
            <div className="min-w-0"><p className="truncate text-sm font-black">DivyaDhara</p><p className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-orange-300">Temple Manager Dashboard</p></div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {assignedTemples.length > 1 && (
              <select className="hidden max-w-[240px] rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white sm:block" value={selectedTempleId} onChange={(e) => { setSelectedTempleId(Number(e.target.value)); setTab("overview"); }}>
                {assignedTemples.map((item) => <option key={item.id} value={item.id} className="text-stone-900">{item.name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => { void loadTemple(selectedTempleId); void loadAssigned(selectedTempleId); }} className="rounded-xl border border-white/10 p-2 text-orange-100 hover:bg-white/10" title="Refresh"><RefreshCw size={16} /></button>
            <div className="hidden min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:block"><p className="truncate text-xs font-bold">{user?.name || "Temple Manager"}</p><p className="truncate text-[10px] text-orange-200/70">{user?.email}</p></div>
            <button type="button" onClick={() => void handleLogout()} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-orange-100"><LogOut size={14} /><span className="hidden sm:inline">Logout</span></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1550px] md:grid-cols-[255px_1fr]">
        <aside className={`${mobileNav ? "block" : "hidden"} border-r border-orange-900/10 bg-[#f2eadf] p-4 md:block md:min-h-[calc(100vh-64px)]`}>
          <div className="rounded-3xl bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-5 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-200">Temple Command Center</p>
            <h2 className="mt-2 text-xl font-black">{temple.name}</h2>
            <p className="mt-2 text-xs leading-5 text-orange-100/80">Manage temple information, pilgrimage content and commercial enquiry activity for your assigned temple.</p>
          </div>
          <nav className="mt-5 space-y-1.5" aria-label="Temple dashboard">
            {navItems.map((item) => { const Icon = item.icon; return (
              <button key={item.id} type="button" onClick={() => { setTab(item.id); setMobileNav(false); }}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold ${tab === item.id ? "bg-[#2a1a10] text-orange-200 shadow" : "text-stone-700 hover:bg-white"}`}>
                <Icon size={17} /><span className="min-w-0 flex-1">{item.label}</span>{item.badge ? <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] text-white">{item.badge}</span> : null}
              </button>
            ); })}
          </nav>
          <div className="mt-6 rounded-3xl border border-orange-900/10 bg-white p-4">
            <div className="flex items-center justify-between gap-2 text-xs"><span className="font-bold text-stone-500">Plan</span><strong className="text-orange-800">{planName}</strong></div>
            <p className="mt-1 text-[10px] text-stone-400">Commercial entitlements come from backend subscription data.</p>
            <div className="mt-4 flex items-center justify-between text-xs"><span className="font-bold text-stone-500">Lead credits</span><strong>{leadLimit ? `${leadUsed}/${leadLimit}` : `${leadUsed}/—`}</strong></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-orange-600" style={{ width: `${leadLimit ? Math.min(100, (leadUsed / leadLimit) * 100) : 0}%` }} /></div>
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-[1250px] space-y-6">
            {temple.status !== "published" && (
              <div className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3"><Clock3 className="mt-0.5 text-amber-700" size={19} /><div><p className="text-sm font-black text-amber-900">Temple workflow: {prettyStatus(temple.status)}</p><p className="mt-1 text-xs leading-5 text-amber-800/80">Managers can submit for review, but only Super Admin can publish, unpublish or feature a temple.</p></div></div>
                {temple.status !== "pending" ? <button type="button" onClick={() => void submitForReview()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-black text-white"><Send size={14} /> Submit for Review</button> : null}
              </div>
            )}

            {tab === "overview" && (
              <>
                <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2a1a10] via-orange-900 to-orange-700 p-6 text-white shadow-xl md:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-200">Assigned Temple</span><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase">{prettyStatus(temple.status)}</span></div>
                      <h1 className="mt-3 text-3xl font-black md:text-4xl">{temple.name}</h1>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-100/85">One secure workspace for your temple profile, pilgrimage information, media, business enquiries, SEO, subscription entitlements and performance insights.</p>
                      <p className="mt-4 text-xs text-orange-100/80">{temple.city || "City not set"}{temple.state ? `, ${temple.state}` : ""} · {listingReady ? "Public listing live" : "Public listing not live"}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[310px]">
                      <button type="button" onClick={() => setTab("temple")} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-orange-900"><Pencil className="mr-2 inline" size={15} /> Edit Temple</button>
                      <button type="button" onClick={() => setTab("leads")} className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black"><MessageCircle className="mr-2 inline" size={15} /> View Leads</button>
                      {temple.slug ? <button type="button" onClick={() => window.open(`/temples/${encodeURIComponent(String(temple.slug))}`, "_blank", "noopener,noreferrer")} className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black"><Eye className="mr-2 inline" size={15} /> Public Preview</button> : null}
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                  {cards.map((card) => { const Icon = card.icon; return <div key={card.label} className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><p className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">{card.label}</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-700"><Icon size={17} /></span></div><p className="mt-4 truncate text-3xl font-black">{card.value}</p><p className="mt-1 text-xs leading-5 text-stone-500">{card.sub}</p></div>; })}
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Business readiness</p><h2 className="mt-1 text-xl font-black">Temple growth controls</h2>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {[
                        ["Complete profile", Boolean(temple.summary || temple.description)], ["Public listing", listingReady],
                        ["Lead channel", Boolean(subscription)], ["Gallery entitlement", galleryLimit > 0],
                        ["Video entitlement", videoLimit > 0], ["Enhanced SEO", seoEntitled],
                        ["Live Aarti", Boolean(features?.liveAartiEnabled)], ["Analytics", Boolean(features?.analyticsAccess)],
                      ].map(([label, ok]) => <div key={String(label)} className="flex items-center justify-between rounded-2xl bg-stone-50 p-4"><span className="text-sm font-bold text-stone-700">{label}</span>{Boolean(ok) ? <CheckCircle2 className="text-emerald-600" size={18} /> : <Clock3 className="text-amber-600" size={18} />}</div>)}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Subscription</p><h2 className="mt-1 text-xl font-black">{planName}</h2>
                    {subscription ? <><p className="mt-2 text-sm text-stone-500">{money(subscription.price_amount, subscription.currency || "INR")} · {prettyStatus(subscription.billing_interval)} · {subscription.duration_days ?? 30} days</p><p className="mt-3 text-xs text-stone-500">Expires: <strong>{dateLabel(subscription.expires_at)}</strong></p><p className="mt-2 text-xs text-stone-500">Lead credits: <strong>{leadLimit ? `${leadUsed}/${leadLimit}` : "Not available"}</strong></p></> : <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">No active Temple subscription. Paid entitlements may remain unavailable.</p>}
                    <button type="button" onClick={() => setTab("subscription")} className="mt-5 w-full rounded-xl border border-orange-900/10 px-4 py-3 text-sm font-black text-orange-900 hover:bg-orange-50">View Subscription</button>
                  </div>
                </section>
              </>
            )}

            {tab === "temple" && (
              <section className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">My Temple</p><h1 className="mt-1 text-2xl font-black">Temple profile & public information</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">Maintain accurate temple details. Slug, featured placement and publication controls remain protected from Temple Manager self-editing.</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ${tone(temple.status)}`}>{prettyStatus(temple.status)}</span></div>
                <div className="mt-7 grid gap-5 lg:grid-cols-2">
                  {[
                    ["name","Temple name"],["sanskrit_name","Sanskrit / traditional name"],["deity","Deity"],["temple_type","Temple type"],
                    ["tradition","Tradition"],["established","Established / period"],["trust_name","Trust / organization"],["contact_phone","Temple phone"],
                    ["contact_email","Temple email"],["website_url","Website URL"],["image","Main image URL"],["logo","Logo URL"],
                    ["story_video_id","Story video ID"],["peetha_number","Peetha number"],["peetha_body_part","Peetha body part"],["shakti_form","Shakti form"],["bhairava","Bhairava"],
                  ].map(([key,label]) => <div key={key}><label className="mb-1.5 block text-xs font-bold text-stone-600">{label}</label><input className={inputClass} value={String(profileForm[key as keyof TempleForm] ?? "")} onChange={(e) => setPF(key as keyof TempleForm, e.target.value)} /></div>)}
                  {[
                    ["summary","Short summary"],["description","Detailed description"],["history","Temple history"],["stay","Stay information"],
                    ["food","Food / prasad information"],["contact_note","Contact note"],["content_note","Content note"],
                    ["identification_note","Identification / factual note"],["map_embed_note","Map embed note"],["address","Address"],
                  ].map(([key,label]) => <div key={key} className="lg:col-span-2"><label className="mb-1.5 block text-xs font-bold text-stone-600">{label}</label><textarea className={areaClass} value={String(profileForm[key as keyof TempleForm] ?? "")} onChange={(e) => setPF(key as keyof TempleForm, e.target.value)} /></div>)}
                  <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Latitude</label><input className={inputClass} value={profileForm.latitude} onChange={(e) => setPF("latitude", e.target.value)} /></div>
                  <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Longitude</label><input className={inputClass} value={profileForm.longitude} onChange={(e) => setPF("longitude", e.target.value)} /></div>
                  <div><label className="mb-1.5 block text-xs font-bold text-stone-600">Map URL</label><input className={inputClass} value={profileForm.map_url} onChange={(e) => setPF("map_url", e.target.value)} /></div>
                  <div className="rounded-2xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">Structured location</p><p className="mt-1 text-sm font-black">{temple.city || "City not set"}{temple.district ? `, ${temple.district}` : ""}{temple.state ? `, ${temple.state}` : ""}</p><p className="mt-1 text-[11px] leading-5 text-stone-500">Location hierarchy is structured in the backend; this manager form does not expose location IDs so SEO/location relationships are not accidentally broken.</p></div>
                  <label className="flex items-center justify-between rounded-2xl bg-orange-50 p-4"><span><span className="block text-sm font-black">Booking enabled</span><span className="mt-1 block text-xs text-stone-500">Allow supported temple booking/enquiry surfaces to use this flag.</span></span><input type="checkbox" className="h-5 w-5 accent-orange-700" checked={profileForm.booking_enabled} onChange={(e) => setPF("booking_enabled", e.target.checked)} /></label>
                </div>
                <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-orange-900/10 pt-5">
                  {temple.status !== "published" && temple.status !== "pending" ? <button type="button" onClick={() => void submitForReview()} className="inline-flex items-center gap-2 rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-black text-orange-900"><Send size={15} /> Submit for Review</button> : null}
                  <button type="button" onClick={() => setProfileForm(templeForm(temple))} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold">Reset</button>
                  <button type="button" disabled={savingProfile} onClick={() => void saveTempleProfile()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white">{savingProfile ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{savingProfile ? "Saving…" : "Save Temple Profile"}</button>
                </div>
              </section>
            )}

            {tab === "content" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Temple Content Studio</p><h1 className="mt-1 text-2xl font-black">History, timings, FAQs & pilgrim information</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">Create structured content records. Manager-created child content is saved as draft; public publication remains an Admin responsibility.</p></div><button type="button" onClick={() => openContent()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"><Plus size={16} /> Add {schema.label}</button></div>
                <div className="grid gap-4 lg:grid-cols-[275px_1fr]">
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-3 shadow-sm"><p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Collections</p>{CONTENT_SCHEMAS.map((item) => { const Icon = item.icon; return <button key={item.route} type="button" onClick={() => setContentRoute(item.route)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-xs font-bold ${item.route === contentRoute ? "bg-[#2a1a10] text-orange-200" : "text-stone-700 hover:bg-orange-50"}`}><Icon size={15} /><span className="min-w-0 flex-1">{item.label}</span></button>; })}</div>
                  <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm"><div className="border-b border-orange-900/10 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">{schema.label}</p><p className="mt-1 text-sm text-stone-500">{schema.description}</p></div>
                    {contentLoading ? <div className="p-10 text-center"><LoaderCircle className="mx-auto animate-spin text-orange-700" /></div> : contentItems.length === 0 ? <div className="p-10 text-center"><FileText className="mx-auto text-orange-600" size={28} /><h2 className="mt-3 font-black">No entries yet</h2><p className="mt-1 text-sm text-stone-500">Create the first structured entry for this collection.</p><button type="button" onClick={() => openContent()} className="btn-saffron mt-4 rounded-xl px-5 py-3 text-sm font-bold text-white">Add Entry</button></div> : <div className="divide-y divide-orange-900/10">{contentItems.map((item) => { const primary = schema.fields.find((f) => ["title","name","label","question","mode"].includes(f.key)); const secondary = schema.fields.find((f) => ["content","description","answer","detail","context","time_text","notes"].includes(f.key)); return <div key={String(item.id)} className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><h3 className="font-black">{primary ? s(item[primary.key]) || `Item #${item.id}` : `Item #${item.id}`}</h3><p className="mt-1 line-clamp-3 text-sm leading-6 text-stone-500">{secondary ? s(item[secondary.key]) : "Structured temple content"}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => openContent(item)} className="rounded-xl border border-orange-900/10 p-2.5 text-orange-700"><Pencil size={15} /></button><button type="button" onClick={() => void deleteContent(item)} className="rounded-xl border border-rose-100 p-2.5 text-rose-700"><Trash2 size={15} /></button></div></div>; })}</div>}
                  </div>
                </div>
              </section>
            )}

            {tab === "pujas" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Temple Seva Catalogue</p>
                    <h1 className="mt-1 text-2xl font-black">Puja & Seva Services</h1>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">Attach published DivyaDhara Puja services to your assigned temple. The backend remains authoritative for plan limits, publication status and duplicate protection.</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ${hasPujaEntitlement ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-amber-100 text-amber-900 ring-amber-200"}`}>
                    {hasPujaEntitlement ? `${pujas.length}/${pujaLimit} service slots used` : "No Puja-service entitlement"}
                  </span>
                </div>

                {!hasPujaEntitlement ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-amber-900">Puja services require an eligible Temple plan.</p>
                        <p className="mt-1 text-xs leading-5 text-amber-800/80">Your public temple profile can remain assigned, but attaching Puja services is controlled by the subscription service-limit entitlement.</p>
                      </div>
                      <button type="button" onClick={() => navigate("/subscriptions?audience=temple")} className="rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-black text-white">Review Plans</button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
                  <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-orange-900/10 p-5">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Attached services</p>
                        <h2 className="mt-1 text-xl font-black">Pujas on this temple</h2>
                      </div>
                      <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-black text-orange-900">{pujas.length}</span>
                    </div>
                    {pujaLoading ? (
                      <div className="p-10 text-center"><LoaderCircle className="mx-auto animate-spin text-orange-700" size={26} /></div>
                    ) : pujas.length === 0 ? (
                      <div className="p-10 text-center"><Sparkles className="mx-auto text-orange-600" size={28} /><h2 className="mt-3 font-black">No Puja services attached</h2><p className="mt-1 text-sm text-stone-500">Choose a published Puja from the catalogue to make it part of this temple profile.</p></div>
                    ) : (
                      <div className="divide-y divide-orange-900/10">
                        {pujas.map((item) => (
                          <div key={item.id} className="flex gap-4 p-5">
                            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-orange-50 text-orange-700">
                              {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" loading="lazy" /> : <Sparkles size={18} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-black">{item.name}</h3>
                                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ring-1 ${tone(item.status || "published")}`}>{prettyStatus(item.status || "published")}</span>
                              </div>
                              <p className="mt-1 text-xs text-stone-500">{item.category || item.deity || "Puja service"}{item.duration_text ? ` · ${item.duration_text}` : ""}</p>
                              <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{item.short_description || item.description || "Published DivyaDhara Puja service."}</p>
                              <p className="mt-2 text-xs font-black text-orange-800">{item.price_display || (item.price_from_amount != null ? money(item.price_from_amount, item.currency || "INR") : "Price available on service page")}</p>
                            </div>
                            <button type="button" onClick={() => void detachPuja(item)} className="h-fit rounded-xl border border-rose-100 p-2.5 text-rose-700 hover:bg-rose-50" title="Remove Puja"><Trash2 size={15} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Published catalogue</p><h2 className="mt-1 text-xl font-black">Add a Puja</h2></div>
                      <span className="text-xs text-stone-400">{filteredPujaCatalog.length} shown</span>
                    </div>
                    <div className="relative mt-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} /><input className="w-full rounded-xl border border-orange-900/10 py-3 pl-9 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200" placeholder="Search Puja, deity or category…" value={pujaSearch} onChange={(e) => setPujaSearch(e.target.value)} /></div>
                    <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                      {filteredPujaCatalog.length === 0 ? (
                        <div className="rounded-2xl bg-stone-50 p-8 text-center"><Search className="mx-auto text-stone-300" size={24} /><p className="mt-2 text-sm font-bold text-stone-700">No additional published Puja found.</p><p className="mt-1 text-xs text-stone-500">Try another search or ask Admin to publish the required Puja service.</p></div>
                      ) : filteredPujaCatalog.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-orange-900/10 p-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-orange-50 text-orange-700">{item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" loading="lazy" /> : <Sparkles size={16} />}</div>
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name}</p><p className="truncate text-xs text-stone-500">{item.category || item.deity || "Puja service"}{item.price_display ? ` · ${item.price_display}` : ""}</p></div>
                          <button type="button" disabled={attachingPujaId === item.id || !hasPujaEntitlement} onClick={() => void attachPuja(item)} className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-900 disabled:cursor-not-allowed disabled:opacity-50">{attachingPujaId === item.id ? "Adding…" : "Add"}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {tab === "gallery" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Gallery Studio</p><h1 className="mt-1 text-2xl font-black">Temple gallery</h1><p className="mt-1 text-sm text-stone-500">Plan-controlled gallery capacity with draft-first publishing protection.</p></div><button type="button" disabled={!hasGalleryEntitlement} onClick={openGalleryCreate} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Add Gallery Item</button></div>
                <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-orange-900/10 bg-white p-5"><p className="text-xs text-stone-500">Items</p><p className="mt-2 text-3xl font-black">{gallery.length}</p></div><div className="rounded-2xl border border-orange-900/10 bg-white p-5"><p className="text-xs text-stone-500">Plan limit</p><p className="mt-2 text-3xl font-black">{galleryLimit || "—"}</p></div><div className="rounded-2xl border border-orange-900/10 bg-white p-5"><p className="text-xs text-stone-500">Publication</p><p className="mt-2 text-lg font-black">{listingReady ? "Temple live" : "Admin workflow"}</p></div></div>
                {gallery.length === 0 ? <div className="rounded-3xl border border-dashed border-orange-900/20 bg-white p-12 text-center"><ImagePlus className="mx-auto text-orange-600" size={32} /><h2 className="mt-3 text-xl font-black">No gallery items yet</h2><p className="mt-1 text-sm text-stone-500">Create a draft item, then attach media.</p><button type="button" onClick={openGalleryCreate} className="btn-saffron mt-5 rounded-xl px-5 py-3 text-sm font-bold text-white">Create Gallery Item</button></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{gallery.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm"><div className="aspect-[16/9] bg-stone-100">{item.cover_image ? <img src={item.cover_image} alt={item.alt_text || item.title} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-stone-400"><FileImage size={28} /></div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{item.title}</h2><p className="mt-1 text-xs text-stone-500">{item.tag || "Temple gallery"}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-900">{prettyStatus(item.status || "draft")}</span></div><p className="mt-3 line-clamp-3 text-sm text-stone-500">{item.caption || item.description || "No caption yet."}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setMediaGalleryId(item.id); setMediaForm({ media_url: "", thumbnail_url: "", alt_text: "", caption: "" }); setMediaModal(true); }} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-900"><UploadCloud size={14} /> Add Media</button><button type="button" onClick={() => { setEditingGalleryId(item.id); setGalleryFormState(galleryForm(item)); setGalleryModal(true); }} className="rounded-xl border border-orange-900/10 p-2 text-orange-700"><Pencil size={15} /></button><button type="button" onClick={() => void deleteGallery(item)} className="rounded-xl border border-rose-100 p-2 text-rose-700"><Trash2 size={15} /></button></div>{item.media?.length ? <div className="mt-4 space-y-2">{item.media.map((media) => <div key={media.id} className="flex items-center gap-2 rounded-xl bg-stone-50 p-2"><img src={media.thumbnail_url || media.media_url || ""} alt={s(media.alt_text) || item.title} className="h-10 w-14 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-[10px] text-stone-500">{media.media_url}</span><button type="button" onClick={() => void removeMedia(item.id, media.id)} className="text-rose-700"><Trash2 size={13} /></button></div>)}</div> : null}</div></article>)}</div>}
              </section>
            )}

            {tab === "videos" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Video Studio</p><h1 className="mt-1 text-2xl font-black">Temple videos</h1><p className="mt-1 text-sm text-stone-500">YouTube, Vimeo, self-hosted and other supported references. Managers keep videos in draft workflow.</p></div><button type="button" disabled={!features} onClick={() => { if (!features) { void showWarning("Subscription required", "Video management needs an eligible Temple subscription."); return; } if (videoLimit > 0 && videos.length >= videoLimit) { void showWarning("Video limit reached", `Your plan allows ${videoLimit} videos.`); return; } setEditingVideoId(null); setVideoFormState(videoForm()); setVideoModal(true); }} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Plus size={16} /> Add Video</button></div>
                {videos.length === 0 ? <div className="rounded-3xl border border-dashed border-orange-900/20 bg-white p-12 text-center"><Video className="mx-auto text-orange-600" size={32} /><h2 className="mt-3 text-xl font-black">No videos yet</h2><p className="mt-1 text-sm text-stone-500">Create a darshan, aarti, documentary or informational video draft.</p></div> : <div className="grid gap-4 md:grid-cols-2">{videos.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm"><div className="aspect-video bg-stone-100">{item.thumbnail_url || item.image ? <img src={item.thumbnail_url || item.image || ""} alt={item.title} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-stone-400"><Video size={30} /></div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{item.title}</h2><p className="mt-1 text-xs text-stone-500">{item.video_provider || item.provider || "Video"}{item.duration_text ? ` · ${item.duration_text}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ${tone(item.status || "draft")}`}>{prettyStatus(item.status || "draft")}</span></div><p className="mt-3 line-clamp-3 text-sm text-stone-500">{item.short_description || item.description || "No description."}</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => { setEditingVideoId(item.id); setVideoFormState(videoForm(item)); setVideoModal(true); }} className="flex-1 rounded-xl border border-orange-900/10 px-3 py-2.5 text-xs font-black text-orange-900">Edit</button><button type="button" onClick={() => void deleteVideo(item)} className="rounded-xl border border-rose-100 p-2.5 text-rose-700"><Trash2 size={15} /></button></div></div></article>)}</div>}
              </section>
            )}

            {tab === "live" && (
              <section className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Live Aarti & Darshan</p><h1 className="mt-1 text-2xl font-black">Live configuration</h1><p className="mt-1 max-w-3xl text-sm text-stone-500">Feature entitlement is checked by the backend. The dashboard never bypasses the Temple subscription.</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ${features?.liveAartiEnabled ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-amber-100 text-amber-900 ring-amber-200"}`}>{features?.liveAartiEnabled ? "Entitlement available" : "Entitlement not available"}</span></div>
                <div className="mt-7 grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4"><label className="flex items-center justify-between rounded-2xl bg-orange-50 p-4"><span><span className="block text-sm font-black">Enable Live Aarti</span><span className="mt-1 block text-xs text-stone-500">Backend will enforce plan eligibility.</span></span><input type="checkbox" className="h-5 w-5 accent-orange-700" checked={liveFormState.enabled} disabled={!features?.liveAartiEnabled} onChange={(e) => setLiveFormState((x) => ({ ...x, enabled: e.target.checked }))} /></label><div><label className="mb-1.5 block text-xs font-bold">Provider</label><select className={inputClass} value={liveFormState.provider} onChange={(e) => setLiveFormState((x) => ({ ...x, provider: e.target.value }))}><option value="youtube">YouTube</option><option value="youtube-channel">YouTube Channel</option><option value="hls">HLS</option><option value="ipcamlive">IPCamlive</option><option value="external">External</option></select></div><div><label className="mb-1.5 block text-xs font-bold">Title</label><input className={inputClass} value={liveFormState.title} onChange={(e) => setLiveFormState((x) => ({ ...x, title: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">Time text</label><input className={inputClass} value={liveFormState.time_text} onChange={(e) => setLiveFormState((x) => ({ ...x, time_text: e.target.value }))} /></div></div>
                  <div className="space-y-4"><div><label className="mb-1.5 block text-xs font-bold">Video ID</label><input className={inputClass} value={liveFormState.video_id} onChange={(e) => setLiveFormState((x) => ({ ...x, video_id: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">Channel ID</label><input className={inputClass} value={liveFormState.channel_id} onChange={(e) => setLiveFormState((x) => ({ ...x, channel_id: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">Stream URL</label><input className={inputClass} value={liveFormState.stream_url} onChange={(e) => setLiveFormState((x) => ({ ...x, stream_url: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">Watch URL</label><input className={inputClass} value={liveFormState.watch_url} onChange={(e) => setLiveFormState((x) => ({ ...x, watch_url: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">IPCamlive URL</label><input className={inputClass} value={liveFormState.ipcamlive_url} onChange={(e) => setLiveFormState((x) => ({ ...x, ipcamlive_url: e.target.value }))} /></div></div>
                </div>
                <div className="mt-7 flex justify-end border-t border-orange-900/10 pt-5"><button type="button" disabled={savingLive} onClick={() => void saveLive()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white">{savingLive ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save Live Aarti</button></div>
              </section>
            )}

            {tab === "leads" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Revenue & Enquiry Desk</p><h1 className="mt-1 text-2xl font-black">Temple enquiries & leads</h1><p className="mt-1 max-w-3xl text-sm text-stone-500">Read and manage leads for the assigned temple. Reassignment stays out of this UI because Lead/CRM owns assignment and credit consumption.</p></div><button type="button" onClick={() => void loadLeads()} className="rounded-xl border border-orange-900/10 bg-white px-4 py-2.5 text-xs font-black text-orange-900"><RefreshCw className="mr-1 inline" size={13} /> Refresh</button></div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[["Total",enquiryStats.total],["New",enquiryStats.new_count],["Qualified",enquiryStats.qualified_count],["Contacted",enquiryStats.contacted_count],["Follow-up",enquiryStats.follow_up_count],["Converted",enquiryStats.converted_count]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border border-orange-900/10 bg-white p-4"><p className="text-[11px] font-black uppercase tracking-wider text-stone-400">{label}</p><p className="mt-2 text-2xl font-black">{n(value)}</p></div>)}</div>
                <div className="grid gap-5 lg:grid-cols-[1fr_390px]">
                  <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-orange-900/10 p-4 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} /><input className="w-full rounded-xl border border-orange-900/10 py-2.5 pl-9 pr-3 text-sm" placeholder="Search name, phone, email or city" value={searchLeads} onChange={(e) => setSearchLeads(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void loadLeads(); }} /></div><select className="rounded-xl border border-orange-900/10 px-3 py-2.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="new">New</option><option value="qualified">Qualified</option><option value="contacted">Contacted</option><option value="follow_up">Follow-up</option><option value="converted">Converted</option><option value="closed">Closed</option><option value="lost">Lost</option></select></div>
                    {enquiries.length === 0 ? <div className="p-10 text-center"><MessageCircle className="mx-auto text-orange-600" size={30} /><h2 className="mt-3 font-black">No matching enquiries</h2><p className="mt-1 text-sm text-stone-500">Verified business enquiries for this temple will appear here.</p></div> : <div className="divide-y divide-orange-900/10">{enquiries.map((item) => <button key={item.id} type="button" onClick={() => void openLead(item)} className="flex w-full items-start gap-4 p-4 text-left hover:bg-orange-50/40"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><User size={17} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm">{item.lead_name || "Visitor enquiry"}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ring-1 ${tone(item.lead_status || "new")}`}>{prettyStatus(item.lead_status || "new")}</span></span><span className="mt-1 block truncate text-xs text-stone-500">{item.enquiry_type || "Temple enquiry"} · {item.lead_phone || item.lead_email || "Verified contact available"}</span><span className="mt-1 block line-clamp-2 text-xs text-stone-500">{item.message || "No message supplied."}</span></span><ChevronDown className="-rotate-90 text-stone-300" size={16} /></button>)}</div>}
                  </div>
                  <div className="rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm">
                    {!selectedLead ? <div className="py-12 text-center"><MessageCircle className="mx-auto text-stone-300" size={30} /><h2 className="mt-3 font-black">Select an enquiry</h2><p className="mt-1 text-xs leading-5 text-stone-500">Review verified contact details and update the lead lifecycle.</p></div> : <div className="space-y-5"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-orange-700">Lead {selectedLead.lead_number || selectedLead.lead_id || "—"}</p><h2 className="mt-1 text-xl font-black">{selectedLead.lead_name || "Visitor enquiry"}</h2></div><button type="button" onClick={() => setSelectedLead(null)} className="rounded-xl p-2 text-stone-400"><X size={16} /></button></div><div className="space-y-2 text-sm text-stone-600"><p><strong>Phone:</strong> {selectedLead.lead_phone || "—"}</p><p><strong>Email:</strong> {selectedLead.lead_email || "—"}</p><p><strong>Preference:</strong> {selectedLead.contact_preference || "—"}</p></div><div className="rounded-2xl bg-stone-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-stone-400">Message</p><p className="mt-2 text-sm leading-6">{selectedLead.message || "No message supplied."}</p></div><div><label className="mb-1.5 block text-xs font-bold">Lead status</label><select className={inputClass} disabled={!selectedLead.lead_id || savingLead} value={selectedLead.lead_status || "new"} onChange={(e) => void updateLeadStatus(e.target.value)}><option value="new">New</option><option value="qualified">Qualified</option><option value="assigned">Assigned</option><option value="contacted">Contacted</option><option value="follow_up">Follow-up</option><option value="converted">Converted</option><option value="closed">Closed</option><option value="lost">Lost</option></select></div><div><label className="mb-1.5 block text-xs font-bold">Internal note</label><textarea className={areaClass} rows={3} value={leadNote} onChange={(e) => setLeadNote(e.target.value)} /><button type="button" disabled={savingLead || !leadNote.trim() || !selectedLead.lead_id} onClick={() => void addLeadNote()} className="mt-2 rounded-xl bg-orange-50 px-4 py-2.5 text-xs font-black text-orange-900">Save Note</button></div><div className="rounded-2xl border border-orange-900/10 p-4"><p className="text-sm font-black">Schedule follow-up</p><input type="datetime-local" className={`${inputClass} mt-3`} value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} /><textarea className={`${areaClass} mt-2`} rows={2} value={followupNote} onChange={(e) => setFollowupNote(e.target.value)} placeholder="Follow-up note" /><button type="button" disabled={savingLead || !selectedLead.lead_id} onClick={() => void addFollowup()} className="btn-saffron mt-2 rounded-xl px-4 py-2.5 text-xs font-black text-white">Schedule Follow-up</button></div></div>}
                  </div>
                </div>
              </section>
            )}

            {tab === "seo" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Search visibility</p><h1 className="mt-1 text-2xl font-black">Temple SEO</h1><p className="mt-1 text-sm text-stone-500">Enhanced SEO editing is plan-gated. Publication/crawl controls are not exposed to Temple Managers.</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ${seoEntitled ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-amber-100 text-amber-900 ring-amber-200"}`}>{seoEntitled ? "Enhanced SEO enabled" : "Standard SEO"}</span></div>
                {!seoEntitled ? <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><p className="text-sm font-black text-amber-900">Enhanced SEO is not included in the active plan.</p><p className="mt-1 text-xs leading-5 text-amber-800/80">Upgrade from Subscription when you need enhanced metadata and keyword controls.</p></div> : null}
                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm">
                  <div className="grid gap-5 lg:grid-cols-2">{[
                    ["seoTitle","SEO title"],["canonicalUrl","Canonical URL"],["ogTitle","Open Graph title"],["ogImage","Open Graph image"],
                    ["twitterTitle","Twitter title"],["twitterImage","Twitter image"],["focusKeyword","Focus keyword"],["area","Area"],["locationLabel","Location label"],
                  ].map(([key,label]) => <div key={key}><label className="mb-1.5 block text-xs font-bold">{label}</label><input disabled={!seoEntitled} className={inputClass} value={String(seoFormState[key as keyof SeoForm])} onChange={(e) => setSeoFormState((x) => ({ ...x, [key]: e.target.value }))} /></div>)}{[
                    ["metaDescription","Meta description"],["ogDescription","Open Graph description"],["twitterDescription","Twitter description"],
                  ].map(([key,label]) => <div key={key} className="lg:col-span-2"><label className="mb-1.5 block text-xs font-bold">{label}</label><textarea disabled={!seoEntitled} className={areaClass} rows={4} value={String(seoFormState[key as keyof SeoForm])} onChange={(e) => setSeoFormState((x) => ({ ...x, [key]: e.target.value }))} /></div>)}</div>
                  <div className="mt-6 flex justify-end"><button type="button" disabled={!seoEntitled || savingSeo} onClick={() => void saveSeo()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white"><Save size={15} /> Save SEO</button></div>
                </div>
                <div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-wider text-orange-700">Keywords</p><h2 className="mt-1 text-xl font-black">SEO keyword set</h2></div><div className="flex flex-wrap gap-2"><input disabled={!seoEntitled} className="rounded-xl border border-orange-900/10 px-3 py-2.5 text-sm" placeholder="Add keyword" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} /><select disabled={!seoEntitled} className="rounded-xl border border-orange-900/10 px-3 py-2.5 text-sm" value={keywordType} onChange={(e) => setKeywordType(e.target.value)}><option value="primary">Primary</option><option value="location">Location</option><option value="long_tail">Long tail</option><option value="search_intent">Search intent</option></select><button type="button" disabled={!seoEntitled || !newKeyword.trim()} onClick={() => void addKeyword()} className="rounded-xl bg-orange-50 px-4 py-2.5 text-xs font-black text-orange-900">Add</button></div></div>{seoKeywords.length ? <div className="mt-5 flex flex-wrap gap-2">{seoKeywords.map((item) => <span key={s(item.id)} className="inline-flex items-center gap-2 rounded-full bg-stone-50 px-3 py-2 text-xs font-bold">{s(item.keyword)}<button type="button" onClick={() => void removeKeyword(Number(item.id))} className="text-rose-600"><X size={12} /></button></span>)}</div> : <p className="mt-5 text-sm text-stone-500">No keywords saved.</p>}</div>
              </section>
            )}

            {tab === "subscription" && (
              <section className="space-y-5">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Commercial account</p><h1 className="mt-1 text-2xl font-black">Temple subscription</h1><p className="mt-1 max-w-3xl text-sm text-stone-500">Your plan controls lead credits and paid capabilities such as Puja services, gallery, videos, Live Aarti, Enhanced SEO and analytics. Pricing, price variants, payment verification and activation remain backend-authoritative.</p></div>
                <div className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8">{subscription ? <><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-black text-orange-800">Current plan</span><h2 className="mt-3 text-3xl font-black">{planName}</h2><p className="mt-2 text-sm text-stone-500">{money(subscription.price_amount, subscription.currency || "INR")} · {prettyStatus(subscription.billing_interval)} · {subscription.duration_days ?? 30} days</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-stone-400">Expires</p><p className="mt-1 text-lg font-black">{dateLabel(subscription.expires_at)}</p></div></div><div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Lead credits",`${leadUsed}/${leadLimit || "—"}`],["Gallery",`${gallery.length}/${features?.limits?.gallery || "—"}`],["Videos",`${videos.length}/${features?.limits?.video || "—"}`],["Analytics",features?.analyticsAccess ? prettyStatus(features.analyticsLevel) : "Not included"]].map(([label,value]) => <div key={String(label)} className="rounded-2xl bg-stone-50 p-5"><p className="text-xs text-stone-500">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>)}</div><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Listing",features?.listingEnabled],["Featured listing",features?.featuredListing],["Homepage promotion",features?.homepagePromotion],["Live Aarti",features?.liveAartiEnabled],["Enhanced SEO",features?.enhancedSeo],["WhatsApp enquiry",features?.whatsappEnquiry],["Verification badge",features?.verificationBadge],["Priority support",features?.prioritySupport],["Enhanced profile",features?.enhancedProfile]].map(([label,ok]) => <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-orange-900/10 p-4"><span className="text-sm font-bold text-stone-700">{label}</span>{Boolean(ok) ? <CheckCircle2 className="text-emerald-600" size={17} /> : <span className="text-xs text-stone-400">Not included</span>}</div>)}</div></> : <div className="rounded-3xl bg-amber-50 p-6"><h2 className="text-xl font-black text-amber-900">No active Temple subscription</h2><p className="mt-2 text-sm leading-6 text-amber-800/80">The temple can remain assigned, but subscription-gated features and lead-credit functionality will remain restricted.</p></div>}<div className="mt-7 flex flex-wrap gap-3 border-t border-orange-900/10 pt-5"><button type="button" onClick={() => navigate("/subscriptions?audience=temple")} className="btn-saffron rounded-xl px-5 py-3 text-sm font-black text-white">Review Temple Plans</button><span className="rounded-xl bg-stone-50 px-4 py-3 text-xs text-stone-500">Pricing and activation are backend-authoritative.</span></div></div>
              </section>
            )}

            {tab === "analytics" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Performance</p><h1 className="mt-1 text-2xl font-black">Temple analytics</h1><p className="mt-1 text-sm text-stone-500">Last 30 days of page engagement, leads and conversion-related signals returned by the backend.</p></div><button type="button" onClick={() => void loadAnalytics()} className="rounded-xl border border-orange-900/10 bg-white px-4 py-2.5 text-xs font-black text-orange-900"><RefreshCw className="mr-1 inline" size={13} /> Refresh</button></div>
                {analyticsLoading ? <div className="rounded-3xl border border-orange-900/10 bg-white p-12 text-center"><LoaderCircle className="mx-auto animate-spin text-orange-700" size={28} /></div> : analyticsError ? <div className="rounded-3xl border border-amber-200 bg-amber-50 p-7"><BarChart3 className="text-amber-700" size={24} /><h2 className="mt-3 text-lg font-black text-amber-900">Analytics unavailable</h2><p className="mt-1 text-sm leading-6 text-amber-800/80">{analyticsError}</p><button type="button" onClick={() => setTab("subscription")} className="mt-4 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-black text-white">Review Subscription</button></div> : analytics ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
                  { label: "Page views", value: n((analytics.pageViews as JsonObject | undefined)?.page_views) },
                  { label: "Unique visitors", value: n((analytics.pageViews as JsonObject | undefined)?.unique_visitors) },
                  { label: "Sessions", value: n((analytics.pageViews as JsonObject | undefined)?.sessions) },
                  { label: "Leads", value: n((analytics.leads as JsonObject | undefined)?.total) },
                ].map((card) => <div key={card.label} className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-stone-400">{card.label}</p><p className="mt-3 text-3xl font-black">{card.value}</p></div>)}</div><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm"><h2 className="font-black">Lead funnel</h2><div className="mt-5 space-y-3">{[
                  { label: "New", key: "new_count" },
                  { label: "Qualified", key: "qualified_count" },
                  { label: "Contacted", key: "contacted_count" },
                  { label: "Follow-up", key: "follow_up_count" },
                  { label: "Converted", key: "converted_count" },
                  { label: "Closed", key: "closed_count" },
                ].map((item) => <div key={item.key} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3"><span className="text-sm font-bold text-stone-700">{item.label}</span><strong>{n((analytics.leads as JsonObject | undefined)?.[item.key])}</strong></div>)}</div></div><div className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm"><h2 className="font-black">Engagement</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
                  { label: "Clicks", key: "clicks" },
                  { label: "Interactions", key: "interactions" },
                  { label: "Avg visit sec", key: "avg_duration_seconds" },
                  { label: "Max scroll", key: "max_scroll_depth" },
                ].map((item) => <div key={item.key} className="rounded-2xl bg-stone-50 p-4"><p className="text-xs text-stone-500">{item.label}</p><p className="mt-1 text-xl font-black">{item.key === "max_scroll_depth" ? `${Math.round(n((analytics.pageViews as JsonObject | undefined)?.[item.key]))}%` : Math.round(n((analytics.pageViews as JsonObject | undefined)?.[item.key]))}</p></div>)}</div></div></div></> : <div className="rounded-3xl border border-orange-900/10 bg-white p-10 text-center">No analytics data.</div>}
              </section>
            )}

            {tab === "notifications" && (
              <section className="rounded-[2rem] border border-orange-900/10 bg-white p-6 shadow-sm md:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Updates</p><h1 className="mt-1 text-2xl font-black">Notifications</h1><p className="mt-1 text-sm text-stone-500">Account, lead and system notifications available in your current DivyaDhara session.</p>{notificationsList.length === 0 ? <div className="mt-7 rounded-3xl bg-stone-50 p-10 text-center"><Bell className="mx-auto text-stone-300" size={30} /><h2 className="mt-3 font-black">No notifications</h2></div> : <div className="mt-6 space-y-3">{notificationsList.map((item, index) => <div key={String(item.id ?? index)} className="flex items-start gap-3 rounded-2xl border border-orange-900/10 bg-stone-50 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-600"><Bell size={17} /></span><div><p className="text-sm font-bold">{item.title || item.text || item.message || "Notification"}</p><p className="mt-1 text-xs text-stone-500">{item.message || item.text || ""}</p>{item.date ? <p className="mt-1 text-[10px] text-stone-400">{item.date}</p> : null}</div></div>)}</div>}</section>
            )}
          </div>
        </main>
      </div>

      {contentModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-[#fffaf5] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-900/10 bg-[#fffaf5] px-5 py-4"><div><p className="text-xs font-black uppercase tracking-wider text-orange-700">Content Editor</p><h2 className="mt-1 text-xl font-black">{editingContentId ? `Edit ${schema.label}` : `Add ${schema.label}`}</h2></div><button type="button" onClick={() => setContentModal(false)} className="rounded-xl p-2"><X size={18} /></button></div><div className="grid gap-5 p-5 sm:grid-cols-2">{schema.fields.map((field) => field.type === "checkbox" ? <label key={field.key} className="flex items-center justify-between rounded-2xl bg-orange-50 p-4 sm:col-span-2"><span className="text-sm font-black">{field.label}</span><input type="checkbox" className="h-5 w-5 accent-orange-700" checked={Boolean(contentForm[field.key])} onChange={(e) => setContentForm((x) => ({ ...x, [field.key]: e.target.checked }))} /></label> : <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}><label className="mb-1.5 block text-xs font-bold">{field.label}{field.required ? <span className="text-rose-600"> *</span> : null}</label>{field.type === "textarea" ? <textarea rows={6} className={areaClass} value={s(contentForm[field.key])} placeholder={field.placeholder} onChange={(e) => setContentForm((x) => ({ ...x, [field.key]: e.target.value }))} /> : field.type === "select" ? <select className={inputClass} value={s(contentForm[field.key])} onChange={(e) => setContentForm((x) => ({ ...x, [field.key]: e.target.value }))}>{field.options?.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}</select> : <input type={field.type === "number" ? "number" : "text"} className={inputClass} value={s(contentForm[field.key])} placeholder={field.placeholder} onChange={(e) => setContentForm((x) => ({ ...x, [field.key]: e.target.value }))} />}</div>)}</div><div className="flex justify-end gap-2 border-t border-orange-900/10 px-5 py-4"><button type="button" onClick={() => setContentModal(false)} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold">Cancel</button><button type="button" disabled={savingContent} onClick={() => void saveContent()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white">{savingContent ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} {editingContentId ? "Update Content" : "Create Draft"}</button></div></div></div>
      )}

      {galleryModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-[#fffaf5] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-900/10 bg-[#fffaf5] px-5 py-4"><div><p className="text-xs font-black uppercase tracking-wider text-orange-700">Gallery Editor</p><h2 className="mt-1 text-xl font-black">{editingGalleryId ? "Edit gallery item" : "Create gallery item"}</h2></div><button type="button" onClick={() => setGalleryModal(false)} className="rounded-xl p-2"><X size={18} /></button></div><div className="grid gap-5 p-5 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-bold">Title *</label><input className={inputClass} value={galleryFormState.title} onChange={(e) => setGalleryFormState((x) => ({ ...x, title: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">Tag</label><input className={inputClass} value={galleryFormState.tag} onChange={(e) => setGalleryFormState((x) => ({ ...x, tag: e.target.value }))} /></div><div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-bold">Cover image URL</label><input className={inputClass} value={galleryFormState.cover_image} onChange={(e) => setGalleryFormState((x) => ({ ...x, cover_image: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">Source path</label><input className={inputClass} value={galleryFormState.source_path} onChange={(e) => setGalleryFormState((x) => ({ ...x, source_path: e.target.value }))} /></div><div><label className="mb-1.5 block text-xs font-bold">Alt text</label><input className={inputClass} value={galleryFormState.alt_text} onChange={(e) => setGalleryFormState((x) => ({ ...x, alt_text: e.target.value }))} /></div><div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-bold">Caption</label><textarea className={areaClass} rows={3} value={galleryFormState.caption} onChange={(e) => setGalleryFormState((x) => ({ ...x, caption: e.target.value }))} /></div><div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-bold">Description</label><textarea className={areaClass} rows={4} value={galleryFormState.description} onChange={(e) => setGalleryFormState((x) => ({ ...x, description: e.target.value }))} /></div></div><div className="flex justify-end gap-2 border-t border-orange-900/10 px-5 py-4"><button type="button" onClick={() => setGalleryModal(false)} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold">Cancel</button><button type="button" disabled={savingGallery} onClick={() => void saveGallery()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white">{savingGallery ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} {savingGallery ? "Saving…" : "Save Draft"}</button></div></div></div>
      )}

      {mediaModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><div className="w-full max-w-xl rounded-3xl bg-[#fffaf5] shadow-2xl"><div className="flex items-center justify-between border-b border-orange-900/10 px-5 py-4"><div><p className="text-xs font-black uppercase tracking-wider text-orange-700">Gallery Media</p><h2 className="mt-1 text-xl font-black">Attach media</h2></div><button type="button" onClick={() => setMediaModal(false)} className="rounded-xl p-2"><X size={18} /></button></div><div className="space-y-4 p-5">{[["media_url","Media URL *"],["thumbnail_url","Thumbnail URL"],["alt_text","Alt text"],["caption","Caption"]].map(([key,label]) => <div key={key}><label className="mb-1.5 block text-xs font-bold">{label}</label><input className={inputClass} value={mediaForm[key as keyof MediaForm]} onChange={(e) => setMediaForm((x) => ({ ...x, [key]: e.target.value }))} /></div>)}</div><div className="flex justify-end gap-2 border-t border-orange-900/10 px-5 py-4"><button type="button" onClick={() => setMediaModal(false)} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold">Cancel</button><button type="button" onClick={() => void addMedia()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white"><UploadCloud size={15} /> Add Media</button></div></div></div>
      )}

      {videoModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-[#fffaf5] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-900/10 bg-[#fffaf5] px-5 py-4"><div><p className="text-xs font-black uppercase tracking-wider text-orange-700">Video Editor</p><h2 className="mt-1 text-xl font-black">{editingVideoId ? "Edit temple video" : "Add temple video"}</h2></div><button type="button" onClick={() => setVideoModal(false)} className="rounded-xl p-2"><X size={18} /></button></div><div className="grid gap-5 p-5 sm:grid-cols-2">{[
          ["title","Title"],["video_provider","Provider"],["video_url","Video URL"],["watch_url","Watch URL"],["thumbnail_url","Thumbnail URL"],["image","Image URL"],["category","Category"],["duration_text","Duration"],["tags","Tags"],["duration_seconds","Duration seconds"],["sort_order","Sort order"],
        ].map(([key,label]) => <div key={key}><label className="mb-1.5 block text-xs font-bold">{label}{key === "title" || key === "video_url" ? <span className="text-rose-600"> *</span> : null}</label>{key === "video_provider" ? <select className={inputClass} value={videoFormState.video_provider} onChange={(e) => setVideoFormState((x) => ({ ...x, video_provider: e.target.value }))}><option value="youtube">YouTube</option><option value="vimeo">Vimeo</option><option value="self_hosted">Self hosted</option><option value="other">Other</option></select> : <input type={["duration_seconds","sort_order"].includes(key) ? "number" : "text"} className={inputClass} value={String(videoFormState[key as keyof VideoForm])} onChange={(e) => setVideoFormState((x) => ({ ...x, [key]: e.target.value }))} />}</div>)}
        <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-bold">Short description</label><textarea className={areaClass} rows={3} value={videoFormState.short_description} onChange={(e) => setVideoFormState((x) => ({ ...x, short_description: e.target.value }))} /></div><div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-bold">Description</label><textarea className={areaClass} rows={5} value={videoFormState.description} onChange={(e) => setVideoFormState((x) => ({ ...x, description: e.target.value }))} /></div><label className="flex items-center justify-between rounded-2xl bg-orange-50 p-4 sm:col-span-2"><span className="text-sm font-black">Active video record</span><input type="checkbox" className="h-5 w-5 accent-orange-700" checked={videoFormState.is_active} onChange={(e) => setVideoFormState((x) => ({ ...x, is_active: e.target.checked }))} /></label></div><div className="flex justify-end gap-2 border-t border-orange-900/10 px-5 py-4"><button type="button" onClick={() => setVideoModal(false)} className="rounded-xl border border-orange-900/10 px-5 py-3 text-sm font-bold">Cancel</button><button type="button" disabled={savingVideo} onClick={() => void saveVideo()} className="btn-saffron inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white">{savingVideo ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} {savingVideo ? "Saving…" : editingVideoId ? "Update Draft" : "Create Draft"}</button></div></div></div>
      )}
    </div>
  );
}
