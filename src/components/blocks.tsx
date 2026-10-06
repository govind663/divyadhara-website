import {
  useId,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  MessageCircle,
  CheckCircle2,
  Send,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { apiPost, ApiError } from "../lib/api";
import { waLink } from "../lib/utils";
import { Reveal } from "./ui";

/*
|--------------------------------------------------------------------------
| Lead / Enquiry business model
|--------------------------------------------------------------------------
|
| Lead creation belongs to /api/leads.
| This component therefore does NOT create fake local bookings.
|
| For module-specific enquiries, pass:
|   leadType + entityId
|
| Examples:
|   leadType="puja"   entityId={service.id}
|   leadType="pandit" entityId={pandit.id}
|   leadType="temple" entityId={temple.id}
|   leadType="ashram" entityId={ashram.id}
|   leadType="yatra"  entityId={package.id}
|   leadType="event"  entityId={event.id}
|   leadType="course" entityId={course.id}
|
| For general enquiries, the default form is the backend "contact" form.
|--------------------------------------------------------------------------
*/

export type EnquiryLeadType =
  | "general"
  | "contact"
  | "puja"
  | "pandit"
  | "temple"
  | "ashram"
  | "yatra"
  | "travel"
  | "event"
  | "course"
  | "spiritual_place";

type EnquiryFormProps = {
  context: string;
  title?: string;
  compact?: boolean;

  leadType?: EnquiryLeadType;
  entityId?: number | string | null;
  formKey?: string;

  serviceType?: string;
  pujaType?: string;

  sourceType?:
    | "website"
    | "form"
    | "whatsapp"
    | "phone"
    | "organic_search"
    | "paid_search"
    | "social"
    | "email"
    | "referral"
    | "direct"
    | "video"
    | "gallery"
    | "seo_landing";

  pagePath?: string;

  defaultDate?: string;
  defaultTravellers?: string;
};

type EnquiryFormState = {
  name: string;
  mobile: string;
  email: string;
  date: string;
  travellers: string;
  contactPreference: "any" | "call" | "whatsapp" | "email";
  message: string;
  whatsappConsent: boolean;
  marketingConsent: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  website: string;
};

type LeadSubmitResponse = {
  duplicate?: boolean;
  spam?: boolean;
  accepted?: boolean;
  message?: string;
  submissionId?: number;
  lead?: {
    lead_number?: string | null;
    lead_type?: string | null;
    status?: string | null;
    priority?: string | null;
    created_at?: string | null;
  } | null;
};

function normalizeMobile(value: string): string {
  return value.trim().replace(/[^\d+()\-\s]/g, "");
}

function getTravellerCount(value: string): number | null {
  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  const firstNumber = Number.parseInt(cleaned, 10);

  if (Number.isFinite(firstNumber) && firstNumber > 0) {
    return firstNumber;
  }

  return null;
}

function getDefaultFormKey(
  leadType: EnquiryLeadType,
): string {
  switch (leadType) {
    case "general":
    case "contact":
      return "contact";
    case "puja":
      return "puja_enquiry";
    case "pandit":
      return "pandit_booking";
    case "temple":
      return "temple_enquiry";
    case "ashram":
      return "ashram_enquiry";
    case "yatra":
    case "travel":
      return "yatra_enquiry";
    case "event":
      return "event_enquiry";
    case "course":
      return "course_enquiry";
    case "spiritual_place":
      return "contact";
    default:
      return "contact";
  }
}

function getDefaultSuccessMessage(
  leadType: EnquiryLeadType,
): string {
  switch (leadType) {
    case "puja":
      return "Your puja enquiry has been received. Our seva team will contact you shortly.";
    case "pandit":
      return "Your Pandit booking request has been received.";
    case "temple":
      return "Your temple enquiry has been received.";
    case "ashram":
      return "Your Ashram enquiry has been received.";
    case "yatra":
    case "travel":
      return "Your Yatra enquiry has been received. Our travel team will contact you.";
    case "event":
      return "Your event enquiry has been received.";
    case "course":
      return "Your course enquiry has been received.";
    default:
      return "Thank you. Your enquiry has been received.";
  }
}

function getErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK_ERROR") {
      return "We could not connect to the DivyaDhara server. Please try again or use WhatsApp.";
    }

    if (error.code === "REQUEST_TIMEOUT") {
      return "The request took too long. Please try again or use WhatsApp.";
    }

    if (error.status === 429) {
      return "Too many enquiries were submitted from this connection. Please wait a little and try again.";
    }

    if (error.status === 403) {
      return error.message || "Mobile verification is required for this enquiry.";
    }

    if (error.status === 400) {
      return error.message || "Please check the enquiry details and try again.";
    }

    return error.message || "Unable to submit your enquiry right now.";
  }

  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Unable to submit your enquiry right now.";
}

function getLeadReceipt(
  response: unknown,
): LeadSubmitResponse {
  if (
    !response ||
    typeof response !== "object"
  ) {
    return {};
  }

  return response as LeadSubmitResponse;
}

export function EnquiryForm({
  context,
  title = "Send Enquiry",
  compact = false,
  leadType = "contact",
  entityId = null,
  formKey,
  serviceType,
  pujaType,
  sourceType = "form",
  pagePath,
  defaultDate = "",
  defaultTravellers = "2",
}: EnquiryFormProps) {
  const instanceId = useId();

  const resolvedFormKey =
    formKey || getDefaultFormKey(leadType);

  const [f, setF] = useState<EnquiryFormState>(() => ({
    name: "",
    mobile: "",
    email: "",
    date: defaultDate,
    travellers: defaultTravellers,
    contactPreference: "any",
    message: "",
    whatsappConsent: false,
    marketingConsent: false,
    termsAccepted: false,
    privacyAccepted: false,
    website: "",
  }));

  const [status, setStatus] = useState<
    "idle" | "submitting" | "done"
  >("idle");

  const [error, setError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<{
    leadNumber: string | null;
    duplicate: boolean;
    message: string;
  }>({
    leadNumber: null,
    duplicate: false,
    message: getDefaultSuccessMessage(leadType),
  });

  const [setErrorAnnouncement, setSetErrorAnnouncement] =
    useState(false);

  const input =
    "w-full rounded-xl border border-orange-900/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:bg-stone-50";

  const label =
    "mb-1 block text-xs font-bold text-stone-600";

  const setField =
    (
      key: keyof EnquiryFormState,
    ) =>
    (
      event: ChangeEvent<
        HTMLInputElement |
          HTMLTextAreaElement |
          HTMLSelectElement
      >,
    ) => {
      const value =
        event.target.type === "checkbox"
          ? (event.target as HTMLInputElement)
              .checked
          : event.target.value;

      setF((current) => ({
        ...current,
        [key]: value,
      }));

      if (error) {
        setError(null);
      }
    };

  const buildWhatsAppMessage = (): string => {
    return [
      "Namaste DivyaDhara! 🙏",
      context,
      "",
      `Name: ${f.name.trim() || "-"}`,
      `Mobile: ${f.mobile.trim() || "-"}`,
      `Email: ${f.email.trim() || "-"}`,
      `Preferred date: ${f.date || "-"}`,
      `Travellers: ${f.travellers || "-"}`,
      `Preferred contact: ${f.contactPreference}`,
      `Message: ${f.message.trim() || "-"}`,
    ].join("\n");
  };

  const resetForm = () => {
    setF({
      name: "",
      mobile: "",
      email: "",
      date: defaultDate,
      travellers: defaultTravellers,
      contactPreference: "any",
      message: "",
      whatsappConsent: false,
      marketingConsent: false,
      termsAccepted: false,
      privacyAccepted: false,
      website: "",
    });

    setStatus("idle");
    setError(null);
    setReceipt({
      leadNumber: null,
      duplicate: false,
      message: getDefaultSuccessMessage(leadType),
    });
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (status === "submitting") {
      return;
    }

    setError(null);
    setSetErrorAnnouncement(false);

    const name = f.name.trim();
    const mobile = normalizeMobile(f.mobile);
    const email = f.email.trim();
    const message = f.message.trim();

    if (name.length < 2) {
      setError("Please enter your full name.");
      setSetErrorAnnouncement(true);
      return;
    }

    if (!mobile || !/[0-9]/.test(mobile)) {
      setError("Please enter a valid mobile number.");
      setSetErrorAnnouncement(true);
      return;
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setError("Please enter a valid email address.");
      setSetErrorAnnouncement(true);
      return;
    }

    if (!f.termsAccepted) {
      setError("Please accept the terms to submit your enquiry.");
      setSetErrorAnnouncement(true);
      return;
    }

    if (!f.privacyAccepted) {
      setError("Please confirm that you accept the privacy policy.");
      setSetErrorAnnouncement(true);
      return;
    }

    if (
      f.contactPreference === "whatsapp" &&
      !f.whatsappConsent
    ) {
      setError(
        "Please allow WhatsApp contact when WhatsApp is selected as your preferred channel.",
      );
      setSetErrorAnnouncement(true);
      return;
    }

    if (
      leadType !== "general" &&
      leadType !== "contact" &&
      !entityId
    ) {
      setError(
        "This enquiry is linked to a specific DivyaDhara listing. Please refresh the page and try again.",
      );
      setSetErrorAnnouncement(true);
      return;
    }

    setStatus("submitting");

    try {
      const payload: Record<string, unknown> = {
        leadType,
        formKey: resolvedFormKey,
        entityId:
          entityId === null ||
          entityId === undefined ||
          entityId === ""
            ? undefined
            : Number(entityId),

        name,
        phone: mobile,
        whatsapp: mobile,
        email: email || undefined,

        preferredDate:
          f.date || undefined,
        travellersCount:
          getTravellerCount(f.travellers) ?? undefined,

        contactPreference:
          f.contactPreference,
        whatsappConsent:
          f.whatsappConsent,
        marketingConsent:
          f.marketingConsent,

        termsAccepted:
          f.termsAccepted,
        privacyAccepted:
          f.privacyAccepted,

        serviceType:
          serviceType || undefined,
        pujaType:
          pujaType || undefined,

        message: [
          context,
          message
            ? `Customer message: ${message}`
            : "Customer message: -",
        ].join("\n"),

        sourceType,
        sourceForm: resolvedFormKey,
        sourcePage:
          pagePath ||
          (typeof window !== "undefined"
            ? window.location.pathname
            : "/"),
        referrerUrl:
          typeof document !== "undefined"
            ? document.referrer || undefined
            : undefined,

        website:
          f.website.trim() || undefined,
      };

      const response = await apiPost<LeadSubmitResponse>(
        "/api/leads/submit",
        payload,
      );

      const result =
        getLeadReceipt(response);

      const leadNumber =
        result.lead?.lead_number ||
        null;

      const responseMessage =
        typeof result.message === "string" &&
        result.message.trim()
          ? result.message
          : getDefaultSuccessMessage(
              leadType,
            );

      setReceipt({
        leadNumber,
        duplicate:
          result.duplicate === true,
        message: responseMessage,
      });

      setStatus("done");
    } catch (submitError) {
      setStatus("idle");
      setError(
        getErrorText(submitError),
      );
      setSetErrorAnnouncement(true);
    }
  };

  const whatsappHref =
    waLink(buildWhatsAppMessage());

  if (status === "done") {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center md:p-8">
        <CheckCircle2
          size={40}
          className="mx-auto text-emerald-600"
        />

        <h3 className="font-display mt-3 text-2xl font-semibold text-emerald-950">
          {receipt.duplicate
            ? "Your earlier enquiry is already with us 🙏"
            : `Dhanyavaad${
                f.name
                  ? `, ${f.name.split(" ")[0]}`
                  : ""
              }! 🙏`}
        </h3>

        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-900/80">
          {receipt.message}
        </p>

        {receipt.leadNumber && (
          <div className="mx-auto mt-4 inline-flex rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-800">
            Reference:{" "}
            {receipt.leadNumber}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            to="/dashboard"
            className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            View in Dashboard
          </Link>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
          >
            New enquiry
          </button>
        </div>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-105"
        >
          <MessageCircle size={16} />
          Continue on WhatsApp
          <ExternalLink size={14} />
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-3xl border border-orange-900/10 bg-white p-6 shadow-xl shadow-orange-900/5 md:p-8"
    >
      <h3 className="font-display text-xl font-semibold text-[#2a1a10]">
        {title}
      </h3>

      <p className="mt-1 text-[13px] text-stone-500">
        Free guidance · Response within a few hours ·
        Hindi, English + 6 languages
      </p>

      <div
        className={`mt-5 grid gap-3 ${
          compact
            ? "sm:grid-cols-2"
            : "sm:grid-cols-2"
        }`}
      >
        <div>
          <label
            className={label}
            htmlFor={`${instanceId}-name`}
          >
            Full name *
          </label>

          <input
            id={`${instanceId}-name`}
            name="name"
            autoComplete="name"
            required
            value={f.name}
            onChange={setField("name")}
            placeholder="e.g., Ananya Sharma"
            className={input}
            disabled={status === "submitting"}
          />
        </div>

        <div>
          <label
            className={label}
            htmlFor={`${instanceId}-mobile`}
          >
            Mobile (WhatsApp) *
          </label>

          <input
            id={`${instanceId}-mobile`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={f.mobile}
            onChange={setField("mobile")}
            placeholder="+91 90000 00000"
            className={input}
            disabled={status === "submitting"}
          />

          <p className="mt-1 text-[10px] text-stone-400">
            Used only to respond to this enquiry.
          </p>
        </div>

        <div>
          <label
            className={label}
            htmlFor={`${instanceId}-email`}
          >
            Email
          </label>

          <input
            id={`${instanceId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            value={f.email}
            onChange={setField("email")}
            placeholder="you@example.com"
            className={input}
            disabled={status === "submitting"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className={label}
              htmlFor={`${instanceId}-date`}
            >
              Date
            </label>

            <input
              id={`${instanceId}-date`}
              name="preferredDate"
              type="date"
              value={f.date}
              onChange={setField("date")}
              className={input}
              disabled={status === "submitting"}
            />
          </div>

          <div>
            <label
              className={label}
              htmlFor={`${instanceId}-travellers`}
            >
              Travellers
            </label>

            <select
              id={`${instanceId}-travellers`}
              name="travellers"
              value={f.travellers}
              onChange={setField("travellers")}
              className={input}
              disabled={status === "submitting"}
            >
              {[
                "1",
                "2",
                "3-5",
                "6-12",
                "12+ (group)",
              ].map((option) => (
                <option key={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label
          className={label}
          htmlFor={`${instanceId}-contact-preference`}
        >
          Preferred contact
        </label>

        <select
          id={`${instanceId}-contact-preference`}
          name="contactPreference"
          value={f.contactPreference}
          onChange={setField("contactPreference")}
          className={input}
          disabled={status === "submitting"}
        >
          <option value="any">
            Any available channel
          </option>
          <option value="call">
            Phone call
          </option>
          <option value="whatsapp">
            WhatsApp
          </option>
          <option value="email">
            Email
          </option>
        </select>
      </div>

      <div className="mt-3">
        <label
          className={label}
          htmlFor={`${instanceId}-message`}
        >
          Message / preferences
        </label>

        <textarea
          id={`${instanceId}-message`}
          name="message"
          rows={3}
          value={f.message}
          onChange={setField("message")}
          placeholder="Tell us your needs — language, city, budget, special requirements…"
          className={input}
          disabled={status === "submitting"}
        />
      </div>

      {/* Honeypot — kept visually hidden for basic bot protection. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor={`${instanceId}-website`}>
          Website
        </label>

        <input
          id={`${instanceId}-website`}
          tabIndex={-1}
          autoComplete="off"
          value={f.website}
          onChange={setField("website")}
        />
      </div>

      <div className="mt-4 space-y-2 rounded-2xl bg-orange-50 p-4">
        <label className="flex items-start gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={f.whatsappConsent}
            onChange={setField("whatsappConsent")}
            className="mt-0.5 h-4 w-4 rounded border-orange-300"
            disabled={status === "submitting"}
          />
          <span>
            I agree that DivyaDhara may contact me on WhatsApp regarding
            this enquiry.
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={f.marketingConsent}
            onChange={setField("marketingConsent")}
            className="mt-0.5 h-4 w-4 rounded border-orange-300"
            disabled={status === "submitting"}
          />
          <span>
            I would also like to receive occasional DivyaDhara updates and
            offers.
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            required
            checked={f.termsAccepted}
            onChange={setField("termsAccepted")}
            className="mt-0.5 h-4 w-4 rounded border-orange-300"
            disabled={status === "submitting"}
          />
          <span>
            I agree to the terms applicable to this enquiry.
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            required
            checked={f.privacyAccepted}
            onChange={setField("privacyAccepted")}
            className="mt-0.5 h-4 w-4 rounded border-orange-300"
            disabled={status === "submitting"}
          />
          <span>
            I confirm that I have read and accept the privacy policy.
          </span>
        </label>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0"
          />
          <span>{error}</span>
          {setErrorAnnouncement && (
            <span className="sr-only">
              Please correct the highlighted issue and retry.
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="btn-saffron flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? (
            <>
              <Loader2
                size={15}
                className="animate-spin"
              />
              Sending Enquiry…
            </>
          ) : (
            <>
              <Send size={15} />
              Submit Enquiry
            </>
          )}
        </button>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-bold text-white transition hover:brightness-105"
        >
          <MessageCircle size={16} />
          WhatsApp Instead
        </a>
      </div>

      <p className="mt-3 text-center text-[11px] text-stone-400">
        Your enquiry is securely recorded in DivyaDhara's lead system. We do
        not sell your contact details.
      </p>
    </form>
  );
}

export function WhatsAppBand({
  title,
  sub,
  message,
}: {
  title: string;
  sub: string;
  message: string;
}) {
  return (
    <Reveal>
      <div className="relative overflow-hidden rounded-4xl bg-linear-to-br from-[#075E54] via-[#0b7a5f] to-[#128C7E] p-8 text-white md:p-12">
        <div
          className="mandala-bg absolute inset-0 opacity-15"
          aria-hidden
        />

        <span
          className="font-sanskrit pointer-events-none absolute -right-4 -top-8 select-none text-[11rem] leading-none text-white/10"
          aria-hidden
        >
          ॐ
        </span>

        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-200">
              Instant seva on WhatsApp
            </p>

            <h3 className="font-display mt-2 text-2xl font-semibold md:text-4xl">
              {title}
            </h3>

            <p className="mt-2 text-[15px] text-emerald-50/90">
              {sub}
            </p>
          </div>

          <a
            href={waLink(message)}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-7 py-4 font-bold text-[#075E54] shadow-xl transition hover:scale-105 active:scale-95"
          >
            <MessageCircle size={20} />
            Chat Now
          </a>
        </div>
      </div>
    </Reveal>
  );
}

export function PageHero({
  eyebrow,
  title,
  sub,
  image,
  children,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  image: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-char-900 text-white">
      <div className="absolute inset-0">
        <img
          src={image}
          alt=""
          aria-hidden
          className="kenburns h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/55 to-black/30" />

        <div className="absolute inset-0 bg-linear-to-t from-char-900 via-transparent to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-16 md:px-6 md:pb-20 md:pt-24 lg:px-8">
        <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200 backdrop-blur">
          {eyebrow}
        </p>

        <h1 className="font-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] md:text-6xl">
          {title}
        </h1>

        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-200 md:text-lg">
          {sub}
        </p>

        {children && (
          <div className="mt-7 flex flex-wrap gap-3">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
