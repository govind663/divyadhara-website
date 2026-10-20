/* eslint-disable no-useless-escape */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
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

type PanditProfileEnquiryContext = {
  slug: string;
  name: string;
  title: string;
  experience: number;
  location: string;
  languages: string[];
  pujaTypes: string[];
  /** All services/sevas listed on this Pandit's profile. */
  services: string[];
  profileUrl: string;
};

type EnquiryFormProps = {
  context: string;
  title?: string;
  compact?: boolean;

  /** Selects the business-specific fields shown by the master form. */
  businessType?: EnquiryLeadType;

  /** Static Pandit-profile details to attach to the CRM enquiry. */
  panditProfile?: PanditProfileEnquiryContext;
  selectedPuja?: string;
  onSelectedPujaChange?: (pujaName: string) => void;
  selectedSeva?: string;
  /** All services selected by the visitor on a Pandit profile. */
  selectedServices?: string[];
  onSelectedServicesChange?: (serviceNames: string[]) => void;
  sourceForm?: string;

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
  city: string;
  state: string;
  pincode: string;
  language: string;
  preferredTime: string;
  bookingMode: "home" | "temple" | "online" | "travel" | "other";
  gotra: string;
  budgetAmount: string;
  samagriRequired: string;
  specialRequirements: string;
  contactPreference: "any" | "call" | "whatsapp" | "email";
  message: string;
  whatsappConsent: boolean;
  marketingConsent: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  /** Answers for fields that depend on the selected puja/ritual. */
  pujaDetails: Record<string, string>;
  /** Answers for business-specific fields in the shared master form. */
  businessAnswers: Record<string, string>;
  website: string;
};

type PujaQuestion = {
  key: string;
  label: string;
  type: "select" | "text" | "textarea";
  options?: string[];
  placeholder?: string;
  helper?: string;
  required?: boolean;
};

/**
 * Return only questions relevant to the selected ritual. Questions deliberately
 * ask for booking/arrangement information, not for claims about ritual outcomes.
 */
function getPujaQuestions(pujaName: string): PujaQuestion[] {
  const name = pujaName.trim().toLowerCase();
  if (!name) return [];

  if (/vivah|wedding|marriage|engagement|sagai|roka|tilak|mandap|haldi|kanyadaan|saptapadi|anniversary/.test(name)) {
    return [
      {
        key: "weddingStage",
        label: "Which ceremony do you need?",
        type: "select",
        required: true,
        options: ["Engagement / Sagai", "Roka / Tilak", "Main wedding ceremony", "Haldi / Mandap ceremony", "Wedding havan", "Anniversary puja", "Other / discuss"],
      },
      {
        key: "familyTradition",
        label: "Wedding / family tradition",
        type: "select",
        options: ["North Indian / Vedic", "Maithili / Bihari", "Marathi", "Gujarati", "Bengali", "South Indian", "Nepali", "Other regional tradition", "Please guide me"],
        helper: "The Pandit will confirm the exact vidhi with you.",
      },
      {
        key: "weddingRequirements",
        label: "Wedding schedule or other requirements",
        type: "textarea",
        placeholder: "Number of functions, venue, muhurat already decided, or anything the Pandit should know…",
      },
    ];
  }

  if (/pitru|pitr|shraddh|shraadh|tarpan|pind.?daan|ancestral|mahalaya/.test(name)) {
    return [
      {
        key: "ancestralRitual",
        label: "Which ritual are you enquiring about?",
        type: "select",
        required: true,
        options: ["Annual Shraddh", "Pitru Paksha ritual", "Amavasya Tarpan", "Pind Daan", "Tithi-based ceremony", "Not sure — please guide me", "Other / discuss"],
      },
      {
        key: "tithiStatus",
        label: "Do you know the relevant tithi/date?",
        type: "select",
        required: true,
        options: ["Yes, date/tithi is known", "I need help identifying it", "This is for a fixed date", "Please discuss with me"],
      },
      {
        key: "ritualVenue",
        label: "Preferred ritual location",
        type: "select",
        options: ["At home", "At a temple", "At a river / pilgrimage location", "At another venue", "Need guidance"],
      },
      {
        key: "ancestralNotes",
        label: "Any details to help plan the ceremony? (optional)",
        type: "textarea",
        placeholder: "Tradition followed, date constraints, venue or travel needs. Please do not share information you would prefer to keep private.",
      },
    ];
  }

  if (/griha|grih|pravesh|vastu|bhoomi|bhumi|shilanyas|property|housewarming|office opening|shop opening|factory|vehicle|machinery/.test(name)) {
    return [
      {
        key: "propertyType",
        label: "What is the puja for?",
        type: "select",
        required: true,
        options: ["New house / apartment", "Existing home", "Land / construction", "Office / shop / business", "Factory / machinery", "New vehicle", "Other property", "Please guide me"],
      },
      {
        key: "propertyStage",
        label: "Current stage / purpose",
        type: "select",
        options: ["First entry into a new home", "Before construction begins", "Before moving in", "Vastu Shanti for an existing property", "Business opening", "New vehicle delivery", "Other / discuss"],
      },
      {
        key: "propertyRequirements",
        label: "Property or venue details (optional)",
        type: "textarea",
        placeholder: "Apartment/house/plot, approximate venue size, society or access rules, construction status, etc.",
      },
      {
        key: "havanPreference",
        label: "Would you like Havan included?",
        type: "select",
        options: ["Yes, please include if suitable", "Puja only", "Please advise", "To be decided"],
      },
    ];
  }

  if (/namkaran|naamkaran|jatakarma|annaprashan|mundan|chudakarana|newborn|new born|child.?s birthday|godh bharai|garbhadhana|pumsavana/.test(name)) {
    return [
      {
        key: "childCeremony",
        label: "Which family milestone is this for?",
        type: "select",
        required: true,
        options: ["Namkaran / naming ceremony", "Annaprashan / first rice ceremony", "Mundan / Chudakarana", "Jatakarma / newborn sanskar", "Godh Bharai / related ceremony", "Child's birthday puja", "Other / discuss"],
      },
      {
        key: "familyTradition",
        label: "Family / regional tradition (optional)",
        type: "select",
        options: ["North Indian / Vedic", "Maithili / Bihari", "Marathi", "Gujarati", "Bengali", "South Indian", "Other regional tradition", "Please guide me"],
      },
      {
        key: "ceremonyNotes",
        label: "Anything important for the ceremony? (optional)",
        type: "textarea",
        placeholder: "Child's age, preferred ceremony arrangement or family custom. Avoid sharing private details unless needed.",
      },
    ];
  }

  if (/navgraha|nav.?graha|graha shanti|grah shanti|shani|mangal dosh|mangal dosha|rahu|ketu|jyotish/.test(name)) {
    return [
      {
        key: "grahaRitualFormat",
        label: "What type of arrangement are you looking for?",
        type: "select",
        required: true,
        options: ["Navgraha Shanti Puja", "Graha Shanti Havan", "Mantra Jaap", "Puja with Havan / Jaap", "Not sure — please guide me"],
      },
      {
        key: "birthDetailsAvailability",
        label: "Are birth / kundali details available, if the Pandit needs them?",
        type: "select",
        options: ["Yes, available if requested", "No", "Please discuss first", "Not applicable / not sure"],
      },
      {
        key: "sankalpPurpose",
        label: "Any context for the sankalp? (optional)",
        type: "textarea",
        placeholder: "Share only what you are comfortable sharing; the Pandit can advise what information is needed.",
      },
    ];
  }

  if (/satyanarayan|satyanarayan katha|bhagwat|bhagavat|sundarkand|sundar kand|ramayan|ramayana|katha|path|sahasranama/.test(name)) {
    return [
      {
        key: "kathaOccasion",
        label: "What is the occasion?",
        type: "select",
        required: true,
        options: ["Family puja / thanksgiving", "Griha Pravesh / new home", "Birthday / anniversary", "Festival / vrat", "Regular devotional observance", "Other / discuss"],
      },
      {
        key: "kathaFormat",
        label: "Preferred ceremony format",
        type: "select",
        options: ["Puja and Katha / Path", "Katha / Path only", "Puja with Havan", "Havan and Path", "Please recommend a suitable format"],
      },
      {
        key: "kathaRequirements",
        label: "Arrangement or recitation requirements (optional)",
        type: "textarea",
        placeholder: "Venue, approximate attendance, duration constraints, prasad or samagri questions…",
      },
    ];
  }

  if (/rudrabhishek|shiv|maha mrityunjaya|mrityunjaya|abhishek/.test(name)) {
    return [
      {
        key: "shivRitualFormat",
        label: "Preferred ritual format",
        type: "select",
        required: true,
        options: ["Jalabhishek / simple Abhishek", "Rudrabhishek", "Mantra Jaap", "Puja with Havan", "Please guide me on the suitable format"],
      },
      {
        key: "sankalpPurpose",
        label: "Occasion or sankalp context (optional)",
        type: "select",
        options: ["Shravan / festival observance", "Family puja", "Birthday / anniversary", "Personal prayer / sankalp", "Other / prefer to discuss", "No specific occasion"],
      },
      {
        key: "ritualNotes",
        label: "Any arrangements to discuss? (optional)",
        type: "textarea",
        placeholder: "Temple or home venue, abhishek materials, jaap or havan preference, etc.",
      },
    ];
  }

  if (/havan|yajna|yagya|homa|homam|chandi|durga|lakshmi|ganesh|ganpati|saraswati|hanuman|krishna|vishnu|gayatri|tulsi|puja and vedic/.test(name)) {
    return [
      {
        key: "ritualFormat",
        label: "What arrangement would you prefer?",
        type: "select",
        required: true,
        options: ["Puja only", "Puja with Havan", "Havan only", "Mantra Jaap / Path", "Puja + Jaap + Havan (please confirm suitability)", "Please guide me"],
      },
      {
        key: "pujaOccasion",
        label: "Occasion / purpose (optional)",
        type: "select",
        options: ["Festival / vrat", "Family ceremony", "New beginning / inauguration", "Birthday / anniversary", "Regular devotional puja", "Personal sankalp", "Other / discuss"],
      },
      {
        key: "ritualNotes",
        label: "Specific arrangement requirements (optional)",
        type: "textarea",
        placeholder: "Venue, puja timing, samagri, attendance or other questions…",
      },
    ];
  }

  return [
    {
      key: "pujaOccasion",
      label: "What is the occasion for this puja?",
      type: "select",
      required: true,
      options: ["Family ceremony", "Festival / vrat", "New home / new beginning", "Birthday / anniversary", "Education / career milestone", "Personal prayer / sankalp", "Other / discuss"],
    },
    {
      key: "ritualFormat",
      label: "Preferred arrangement",
      type: "select",
      options: ["Puja only", "Puja with Havan", "Mantra Jaap / Path", "Puja + Havan (please confirm suitability)", "Please guide me"],
    },
    {
      key: "ritualNotes",
      label: "Any specific requirements? (optional)",
      type: "textarea",
      placeholder: "Share the tradition, venue, timing or other details you'd like the Pandit to know…",
    },
  ];
}

type BusinessQuestion = {
  key: string;
  label: string;
  type: "select" | "text" | "date" | "number" | "textarea";
  options?: string[];
  placeholder?: string;
  helper?: string;
  required?: boolean;
};

function inferBusinessType(args: {
  businessType?: EnquiryLeadType;
  leadType: EnquiryLeadType;
  formKey?: string;
  sourceForm?: string;
  pagePath?: string;
  context: string;
  serviceType?: string;
  pujaType?: string;
  hasPanditProfile: boolean;
}): EnquiryLeadType {
  if (args.hasPanditProfile) return "pandit";
  if (args.businessType) return args.businessType;
  if (args.leadType !== "contact" && args.leadType !== "general") return args.leadType;

  const hints = `${args.sourceForm ?? ""} ${args.formKey ?? ""}`.toLowerCase();
  if (/pandit|purohit/.test(hints)) return "pandit";
  if (/puja|seva/.test(hints)) return "puja";
  if (/temple|mandir/.test(hints)) return "temple";
  if (/ashram/.test(hints)) return "ashram";
  if (/yatra|travel|pilgrimage/.test(hints)) return "yatra";
  if (/event/.test(hints)) return "event";
  if (/course|class|learning/.test(hints)) return "course";
  if (/spiritual.?place/.test(hints)) return "spiritual_place";

  const path = (args.pagePath || (typeof window !== "undefined" ? window.location.pathname : "")).toLowerCase();
  if (/\/pandits?(\/|$)/.test(path)) return "pandit";
  if (/\/(services|puja-services)(\/|$)/.test(path)) return "puja";
  if (/\/temples?(\/|$)/.test(path)) return "temple";
  if (/\/ashrams?(\/|$)/.test(path)) return "ashram";
  if (/\/(yatra|yatras|travel|pilgrimage)(\/|$)/.test(path)) return "yatra";
  if (/\/events?(\/|$)/.test(path)) return "event";
  if (/\/courses?(\/|$)/.test(path)) return "course";
  if (/\/spiritual-places?(\/|$)/.test(path)) return "spiritual_place";

  const text = `${args.context} ${args.serviceType ?? ""} ${args.pujaType ?? ""}`.toLowerCase();
  if (/pandit|purohit|acharya/.test(text)) return "pandit";
  if (/puja|pooja|havan|yajna|yagya|abhishek|katha|ritual/.test(text)) return "puja";
  if (/temple|mandir|darshan|aarti/.test(text)) return "temple";
  if (/ashram|retreat|stay enquiry|stay inquiry/.test(text)) return "ashram";
  if (/yatra|pilgrimage|travel|tour package/.test(text)) return "yatra";
  if (/event|festival registration/.test(text)) return "event";
  if (/course|class|learning|training/.test(text)) return "course";
  if (/spiritual place|sacred place|ghat visit/.test(text)) return "spiritual_place";
  return args.leadType;
}

function getBusinessLabel(type: EnquiryLeadType): string {
  switch (type) {
    case "puja": return "Puja enquiry";
    case "pandit": return "Pandit booking";
    case "temple": return "Temple enquiry";
    case "ashram": return "Ashram enquiry";
    case "yatra":
    case "travel": return "Yatra / travel enquiry";
    case "event": return "Event registration";
    case "course": return "Course enquiry";
    case "spiritual_place": return "Spiritual place enquiry";
    default: return "General enquiry";
  }
}

function getBusinessDateLabel(type: EnquiryLeadType): string {
  switch (type) {
    case "puja":
    case "pandit": return "Preferred ceremony date";
    case "temple": return "Preferred visit date";
    case "ashram": return "Check-in / arrival date";
    case "yatra":
    case "travel": return "Travel start date";
    case "event": return "Event date";
    case "course": return "Preferred start / batch date";
    case "spiritual_place": return "Preferred visit date";
    default: return "Preferred date (optional)";
  }
}

function getBusinessQuestions(type: EnquiryLeadType): BusinessQuestion[] {
  switch (type) {
    case "puja":
      return [
        { key: "occasion", label: "Occasion / purpose", type: "select", options: ["Family ceremony", "Festival / vrat", "New home / new beginning", "Birthday / anniversary", "Business opening", "Personal sankalp", "Other / please discuss"] },
        { key: "tradition", label: "Family / regional tradition", type: "select", options: ["North Indian / Vedic", "Maithili / Bihari", "Marathi", "Gujarati", "Bengali", "South Indian", "Other regional tradition", "Please guide me"] },
        { key: "ritualFormat", label: "Preferred ritual format", type: "select", options: ["Puja only", "Puja with Havan", "Mantra Jaap / Path", "Puja + Havan (please confirm suitability)", "Please guide me"] },
        { key: "samagriPlan", label: "Puja samagri arrangement", type: "select", options: ["Pandit/team to arrange", "I will arrange samagri", "Need a checklist / guidance", "To be discussed"] },
      ];
    case "pandit":
      return [
        { key: "tradition", label: "Family / regional tradition", type: "select", options: ["North Indian / Vedic", "Maithili / Bihari", "Marathi", "Gujarati", "Bengali", "South Indian", "Other regional tradition", "Please guide me"] },
        { key: "ceremonyFormat", label: "Arrangement required", type: "select", options: ["At my home / venue", "At a temple", "Online guidance", "Pandit travel required", "Please discuss"] },
      ];
    case "temple":
      return [
        { key: "visitPurpose", label: "What would you like help with?", type: "select", required: true, options: ["Darshan information", "Aarti / puja participation", "Special darshan / permitted seva", "Family or group visit", "Senior citizen / accessibility assistance", "Accommodation nearby", "Temple history / spiritual guidance", "Other / please discuss"] },
        { key: "visitorCount", label: "Number of visitors", type: "number", placeholder: "e.g., 4" },
        { key: "visitSupport", label: "Any visit support needed?", type: "select", options: ["No special support", "Senior citizens / mobility support", "Children / family group", "Group coordination", "Need guidance"] },
        { key: "templeNotes", label: "Visit questions / requirements", type: "textarea", placeholder: "Arrival time, darshan questions, transport or accessibility needs…" },
      ];
    case "ashram":
      return [
        { key: "ashramPurpose", label: "Purpose of your visit", type: "select", required: true, options: ["Day visit / darshan", "Overnight stay", "Retreat / meditation", "Satsang / spiritual programme", "Seva / volunteering enquiry", "Yoga / wellness programme", "Other / please discuss"] },
        { key: "stayDuration", label: "Expected stay duration", type: "select", options: ["Day visit only", "1 night", "2–3 nights", "4–7 nights", "More than a week", "Not decided yet"] },
        { key: "accommodation", label: "Accommodation preference", type: "select", options: ["No accommodation needed", "Shared accommodation", "Private room", "Family room", "Please advise"] },
        { key: "foodPreference", label: "Food / meal preference", type: "select", options: ["No meals needed", "Standard vegetarian meals", "Meals included if available", "Need to discuss"] },
        { key: "groupSize", label: "Number of guests", type: "number", placeholder: "e.g., 2" },
        { key: "ashramNotes", label: "Stay / programme requirements", type: "textarea", placeholder: "Arrival/departure plan, programme interests or any questions…" },
      ];
    case "yatra":
    case "travel":
      return [
        { key: "destination", label: "Destination / route", type: "text", placeholder: "Destination or pilgrimage circuit" },
        { key: "returnDate", label: "Return date (if known)", type: "date" },
        { key: "transportPreference", label: "Preferred transport", type: "select", options: ["Bus / coach", "Train", "Flight", "Private vehicle", "Own arrangement", "Please recommend"] },
        { key: "stayPreference", label: "Accommodation preference", type: "select", options: ["No stay required", "Budget", "Standard", "Premium", "Ashram / dharamshala", "Need guidance"] },
        { key: "tripPace", label: "Travel preference", type: "select", options: ["Comfortable / relaxed", "Pilgrimage-focused", "Family-friendly", "Senior-friendly", "Custom itinerary", "Please advise"] },
        { key: "travelNotes", label: "Travel requirements", type: "textarea", placeholder: "Pickup city, preferred stops, mobility needs or other details…" },
      ];
    case "event":
      return [
        { key: "registrationType", label: "Registration type", type: "select", required: true, options: ["Individual", "Family", "Group booking", "Volunteer / seva", "Speaker / stall / collaboration", "Other / please discuss"] },
        { key: "attendeeCount", label: "Number of attendees", type: "number", placeholder: "e.g., 2" },
        { key: "attendanceMode", label: "Attendance preference", type: "select", options: ["In person", "Online (if available)", "Either / please confirm"] },
        { key: "eventSupport", label: "Accessibility / attendee requirements", type: "textarea", placeholder: "Group coordination, accessibility needs or event questions…" },
      ];
    case "course":
      return [
        { key: "learningMode", label: "Preferred learning mode", type: "select", required: true, options: ["Online", "In person", "Hybrid", "Please confirm availability"] },
        { key: "experienceLevel", label: "Current experience level", type: "select", options: ["Beginner", "Some prior knowledge", "Intermediate", "Advanced", "Not sure / please guide me"] },
        { key: "preferredBatch", label: "Preferred batch / timing", type: "text", placeholder: "e.g., weekend mornings" },
        { key: "learningGoal", label: "What would you like to learn?", type: "textarea", placeholder: "Your learning goals, prior experience or questions…" },
      ];
    case "spiritual_place":
      return [
        { key: "visitInterest", label: "What information do you need?", type: "select", required: true, options: ["Darshan / visit planning", "History and traditions", "How to reach / transport", "Nearby facilities / accommodation", "Photography / filming permission information", "Spiritual significance", "Other / please discuss"] },
        { key: "visitorCount", label: "Number of visitors", type: "number", placeholder: "e.g., 3" },
        { key: "visitSupport", label: "Visit support needed", type: "select", options: ["No special support", "Family / group visit", "Senior citizen / mobility support", "Transport guidance", "Need help planning"] },
        { key: "placeNotes", label: "Questions / requirements", type: "textarea", placeholder: "Your expected visit, travel questions or other details…" },
      ];
    default:
      return [
        { key: "enquiryTopic", label: "What can we help you with?", type: "select", options: ["Puja / ritual enquiry", "Pandit booking", "Temple information", "Ashram stay / programme", "Pilgrimage / Yatra", "Event registration", "Course / learning", "Website / general support", "Other"] },
      ];
  }
}

function getBusinessLanguageOptions(type: EnquiryLeadType, languages: string[] = []): string[] {
  const defaults = type === "puja" || type === "pandit"
    ? ["Hindi", "Sanskrit", "English", "Maithili", "Bhojpuri", "Marathi", "Bengali", "Tamil", "Telugu", "Kannada", "Gujarati", "Other / discuss"]
    : ["Hindi", "English", "Sanskrit", "Maithili", "Bhojpuri", "Marathi", "Bengali", "Tamil", "Telugu", "Kannada", "Gujarati", "Other / discuss"];
  return Array.from(new Set([...languages.filter(Boolean), ...defaults]));
}

function getPujaNameFromContext(context: string): string {
  const match = context.match(/(?:puja booking enquiry|puja enquiry|enquiry about this puja|puja service)\s*:\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

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

/** Return a YYYY-MM-DD date in the visitor's local timezone (not UTC). */
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidMobileNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/^\+?[\d\s()\-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function normalizeMobile(value: string): string {
  // Validation is performed before this helper; preserve a typed country code.
  return value.trim().replace(/\s+/g, " ");
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
  businessType,
  serviceType,
  pujaType,
  panditProfile,
  selectedPuja = "",
  onSelectedPujaChange,
  selectedSeva = "",
  selectedServices,
  onSelectedServicesChange,
  sourceForm,
  sourceType = "form",
  pagePath,
  defaultDate = "",
  defaultTravellers = "2",
}: EnquiryFormProps) {
  const instanceId = useId();
  const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined)?.trim() ?? "";
  const recaptchaRef = useRef<ReCAPTCHA | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const resolvedFormKey = formKey || getDefaultFormKey(leadType);
  const resolvedBusinessType = inferBusinessType({
    businessType,
    leadType,
    formKey,
    sourceForm,
    pagePath,
    context,
    serviceType,
    pujaType,
    hasPanditProfile: Boolean(panditProfile),
  });
  // Keep the API's configured form key separate from the business-specific attribution.
  const resolvedSourceForm = sourceForm || (resolvedFormKey === "contact" ? getDefaultFormKey(resolvedBusinessType) : resolvedFormKey);
  const businessQuestions = getBusinessQuestions(resolvedBusinessType);
  const [localSelectedServices, setLocalSelectedServices] = useState<string[]>(() =>
    Array.from(new Set([selectedPuja, selectedSeva, pujaType].filter((value): value is string => Boolean(value?.trim())))),
  );
  const panditPujaOptions = Array.from(new Set((panditProfile?.pujaTypes ?? []).map((value) => value.trim()).filter(Boolean)));
  const panditSevaOptions = Array.from(new Set((panditProfile?.services ?? []).map((value) => value.trim()).filter((value) => Boolean(value) && !panditPujaOptions.includes(value))));
  const allPanditServiceOptions = [...panditPujaOptions, ...panditSevaOptions];
  const rawSelectedServiceNames = selectedServices ?? localSelectedServices;
  const selectedServiceNames = Array.from(new Set(
    panditProfile
      ? rawSelectedServiceNames.map((serviceName) => serviceName.trim()).filter((serviceName) => allPanditServiceOptions.includes(serviceName))
      : rawSelectedServiceNames.map((serviceName) => serviceName.trim()).filter(Boolean),
  ));
  const activePuja = panditProfile
    ? selectedServiceNames.find((serviceName) => panditPujaOptions.includes(serviceName)) || ""
    : selectedPuja || pujaType || (resolvedBusinessType === "puja" ? serviceType || getPujaNameFromContext(context) : "");
  const pujaQuestions = getPujaQuestions(activePuja);
  const previousPujaRef = useRef(activePuja);
  // Prevent duplicate API submissions before React has time to disable the button.
  const submissionLockRef = useRef(false);

  const updateSelectedServices = (nextServices: string[]) => {
    const uniqueServices = Array.from(new Set(nextServices));
    if (onSelectedServicesChange) {
      onSelectedServicesChange(uniqueServices);
    } else {
      setLocalSelectedServices(uniqueServices);
    }
    // Keep legacy props in sync for callers that still use a single selection.
    const nextPuja = uniqueServices.find((serviceName) => panditPujaOptions.includes(serviceName)) || "";
    onSelectedPujaChange?.(nextPuja);
    if (error) setError(null);
  };

  const togglePanditService = (serviceName: string) => {
    const next = selectedServiceNames.includes(serviceName)
      ? selectedServiceNames.filter((name) => name !== serviceName)
      : [...selectedServiceNames, serviceName];
    updateSelectedServices(next);
  };

  const [f, setF] = useState<EnquiryFormState>(() => ({
    name: "",
    mobile: "",
    email: "",
    date: defaultDate,
    travellers: defaultTravellers,
    city: "",
    state: "",
    pincode: "",
    language: "",
    preferredTime: "",
    bookingMode: "home",
    gotra: "",
    budgetAmount: "",
    samagriRequired: "",
    specialRequirements: "",
    contactPreference: "any",
    message: "",
    whatsappConsent: false,
    marketingConsent: false,
    termsAccepted: false,
    privacyAccepted: false,
    pujaDetails: {},
    businessAnswers: {},
    website: "",
  }));

  useEffect(() => {
    if (previousPujaRef.current !== activePuja) {
      previousPujaRef.current = activePuja;
      setF((current) => ({ ...current, pujaDetails: {} }));
    }
  }, [activePuja]);

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
    message: getDefaultSuccessMessage(resolvedBusinessType),
  });

  const [errorAnnouncement, setErrorAnnouncement] =
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

  const setPujaDetail = (key: string, value: string) => {
    setF((current) => ({
      ...current,
      pujaDetails: {
        ...current.pujaDetails,
        [key]: value,
      },
    }));
    if (error) setError(null);
  };

  const getPujaDetailLines = () =>
    pujaQuestions
      .filter((question) => (f.pujaDetails[question.key] || "").trim())
      .map((question) => `${question.label}: ${f.pujaDetails[question.key].trim()}`);

  const setBusinessAnswer = (key: string, value: string) => {
    setF((current) => ({
      ...current,
      businessAnswers: {
        ...current.businessAnswers,
        [key]: value,
      },
    }));
    if (error) setError(null);
  };

  const getBusinessAnswerLines = () =>
    businessQuestions
      .filter((question) => (f.businessAnswers[question.key] || "").trim())
      .map((question) => `${question.label}: ${f.businessAnswers[question.key].trim()}`);

  const buildWhatsAppMessage = (): string => {
    const isYatra = resolvedBusinessType === "yatra" || resolvedBusinessType === "travel";
    const customerDetails = [
      `Name: ${f.name.trim() || "Not provided"}`,
      `Mobile / WhatsApp: ${f.mobile.trim() || "Not provided"}`,
      `Email: ${f.email.trim() || "Not provided"}`,
      `City: ${f.city.trim() || "Not provided"}`,
      `State: ${f.state.trim() || "Not provided"}`,
      `PIN code: ${f.pincode.trim() || "Not provided"}`,
    ];
    const planningDetails = [
      `${getBusinessDateLabel(resolvedBusinessType)}: ${f.date || "Not decided yet"}`,
      ...(isYatra ? [`Number of travellers: ${f.travellers || "2"}`] : []),
      ...(f.preferredTime.trim() ? [`Preferred time: ${f.preferredTime.trim()}`] : []),
      ...(f.language.trim() ? [`Preferred language: ${f.language.trim()}`] : []),
      ...(f.budgetAmount.trim() ? [`Indicative budget: ₹${f.budgetAmount.trim()}`] : []),
      ...(f.gotra.trim() ? [`Gotra / family tradition: ${f.gotra.trim()}`] : []),
      ...(f.samagriRequired ? [`Samagri preference: ${f.samagriRequired}`] : []),
      ...(f.specialRequirements.trim() ? [`Special requirements: ${f.specialRequirements.trim()}`] : []),
    ];

    return [
      "🙏 Namaste DivyaDhara Seva Team,",
      "",
      "I am contacting you through the DivyaDhara website for guidance with the following enquiry. Please review the details below and let me know the next steps, availability and any applicable charges.",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      `ENQUIRY TYPE: ${getBusinessLabel(resolvedBusinessType)}`,
      "━━━━━━━━━━━━━━━━━━━━",
      `Enquiry / service: ${context.trim() || getBusinessLabel(resolvedBusinessType)}`,
      ...(serviceType?.trim() ? [`Service: ${serviceType.trim()}`] : []),
      ...(activePuja ? [`Selected puja / ritual: ${activePuja}`] : []),
      ...(!panditProfile ? getBusinessAnswerLines() : []),
      ...(!panditProfile && activePuja ? getPujaDetailLines() : []),
      "",
      "CUSTOMER DETAILS",
      ...customerDetails,
      "",
      "PREFERRED ARRANGEMENTS",
      ...planningDetails,
      ...(panditProfile
        ? [
            "",
            "PANDIT PROFILE DETAILS",
            `Pandit: ${panditProfile.name}`,
            `Specialization: ${panditProfile.title}`,
            `Profile: ${panditProfile.profileUrl}`,
            `Selected pujas / services: ${selectedServiceNames.length ? selectedServiceNames.join(", ") : "To be discussed"}`,
            `Booking mode: ${f.bookingMode}`,
            ...getPujaDetailLines(),
          ]
        : []),
      "",
      "CONTACT PREFERENCE",
      `Preferred contact method: ${f.contactPreference === "any" ? "Any convenient method" : f.contactPreference === "call" ? "Phone call" : f.contactPreference === "whatsapp" ? "WhatsApp" : "Email"}`,
      `Additional message: ${f.message.trim() || "No additional message"}`,
      "",
      "Kindly confirm receipt of this enquiry and guide me on the process. I understand that availability, arrangements and final pricing will be confirmed by the DivyaDhara team.",
      "",
      "Thank you. 🙏",
      "DivyaDhara | Discover Indian Spirituality",
    ].join("\n");
  };

  const resetForm = () => {
    submissionLockRef.current = false;
    setF({
      name: "",
      mobile: "",
      email: "",
      date: defaultDate,
      travellers: defaultTravellers,
      city: "",
      state: "",
      pincode: "",
      language: "",
      preferredTime: "",
      bookingMode: "home",
      gotra: "",
      budgetAmount: "",
      samagriRequired: "",
      specialRequirements: "",
      contactPreference: "any",
      message: "",
      whatsappConsent: false,
      marketingConsent: false,
      termsAccepted: false,
      privacyAccepted: false,
      pujaDetails: {},
      businessAnswers: {},
      website: "",
    });

    setStatus("idle");
    setError(null);
    setErrorAnnouncement(false);
    setRecaptchaToken(null);
    recaptchaRef.current?.reset();
    setReceipt({
      leadNumber: null,
      duplicate: false,
      message: getDefaultSuccessMessage(resolvedBusinessType),
    });
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (status === "submitting" || submissionLockRef.current) {
      return;
    }

    setError(null);
    setErrorAnnouncement(false);

    const name = f.name.trim();
    const mobile = normalizeMobile(f.mobile);
    const email = f.email.trim();
    const message = f.message.trim();

    if (name.length < 2) {
      setError("Please enter your full name.");
      setErrorAnnouncement(true);
      return;
    }

    if (!isValidMobileNumber(f.mobile)) {
      setError("Please enter a valid mobile number using 7–15 digits. Include your country code for international numbers.");
      setErrorAnnouncement(true);
      return;
    }

    if (panditProfile && allPanditServiceOptions.length > 0 && selectedServiceNames.length === 0) {
      setError("Please select at least one puja or service offered by this Pandit.");
      setErrorAnnouncement(true);
      return;
    }

    if (
      panditProfile &&
      allPanditServiceOptions.length === 0 &&
      !f.specialRequirements.trim() &&
      !message.trim()
    ) {
      setError("This Pandit's service list is still being updated. Please describe the puja or service you need in Special requirements or Message.");
      setErrorAnnouncement(true);
      return;
    }

    if (panditProfile && !f.date) {
      setError("Please select your preferred puja date.");
      setErrorAnnouncement(true);
      return;
    }

    if (panditProfile && f.date < getLocalDateString()) {
      setError("Please choose today or a future date for the Pandit booking enquiry.");
      setErrorAnnouncement(true);
      return;
    }

    const unansweredBusinessQuestion = businessQuestions.find((question) => question.required && !(f.businessAnswers[question.key] || "").trim());
    if (unansweredBusinessQuestion) {
      setError(`Please answer: ${unansweredBusinessQuestion.label}`);
      setErrorAnnouncement(true);
      return;
    }

    const invalidBusinessNumber = businessQuestions.find((question) => {
      if (question.type !== "number") return false;
      const value = (f.businessAnswers[question.key] || "").trim();
      return Boolean(value) && (!/^\d+$/.test(value) || Number(value) < 1);
    });
    if (invalidBusinessNumber) {
      setError(`${invalidBusinessNumber.label} must be a whole number greater than zero.`);
      setErrorAnnouncement(true);
      return;
    }

    const returnDate = (f.businessAnswers.returnDate || "").trim();
    if (returnDate && returnDate < getLocalDateString()) {
      setError("Please choose today or a future return date.");
      setErrorAnnouncement(true);
      return;
    }
    if (returnDate && f.date && returnDate < f.date) {
      setError("The return date cannot be earlier than the travel start date.");
      setErrorAnnouncement(true);
      return;
    }

    const unansweredPujaQuestion = (panditProfile || resolvedBusinessType === "puja")
      ? pujaQuestions.find((question) => question.required && !(f.pujaDetails[question.key] || "").trim())
      : undefined;
    if (unansweredPujaQuestion) {
      setError(`Please answer: ${unansweredPujaQuestion.label}`);
      setErrorAnnouncement(true);
      return;
    }

    if (panditProfile && !f.city.trim() && !f.pincode.trim()) {
      setError("Please enter your city or PIN code so availability can be checked.");
      setErrorAnnouncement(true);
      return;
    }

    if (panditProfile && !f.language.trim()) {
      setError("Please select your preferred language.");
      setErrorAnnouncement(true);
      return;
    }

    if (f.pincode.trim() && !/^\d{6}$/.test(f.pincode.trim())) {
      setError("Please enter a valid 6-digit Indian PIN code, or leave it blank.");
      setErrorAnnouncement(true);
      return;
    }

    if (f.budgetAmount.trim() && (!/^\d+(?:\.\d{1,2})?$/.test(f.budgetAmount.trim()) || Number(f.budgetAmount) < 0)) {
      setError("Please enter a valid budget amount in INR.");
      setErrorAnnouncement(true);
      return;
    }

    if (f.contactPreference === "email" && !email) {
      setError("Please enter an email address because Email is your preferred contact method.");
      setErrorAnnouncement(true);
      return;
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setError("Please enter a valid email address.");
      setErrorAnnouncement(true);
      return;
    }

    if (!f.termsAccepted) {
      setError("Please accept the terms to submit your enquiry.");
      setErrorAnnouncement(true);
      return;
    }

    if (!f.privacyAccepted) {
      setError("Please confirm that you accept the privacy policy.");
      setErrorAnnouncement(true);
      return;
    }

    if (
      f.contactPreference === "whatsapp" &&
      !f.whatsappConsent
    ) {
      setError(
        "Please allow WhatsApp contact when WhatsApp is selected as your preferred channel.",
      );
      setErrorAnnouncement(true);
      return;
    }

    const missingEntityId =
      entityId === null ||
      entityId === undefined ||
      String(entityId).trim() === "";

    if (
      leadType !== "general" &&
      leadType !== "contact" &&
      missingEntityId
    ) {
      setError(
        "This enquiry is linked to a specific DivyaDhara listing. Please refresh the page and try again.",
      );
      setErrorAnnouncement(true);
      return;
    }

    if (!recaptchaSiteKey) {
      setError("CAPTCHA is not configured. Please contact the website administrator.");
      setErrorAnnouncement(true);
      return;
    }

    if (!recaptchaToken) {
      setError("Please complete the I'm not a robot CAPTCHA verification.");
      setErrorAnnouncement(true);
      return;
    }

    submissionLockRef.current = true;
    setStatus("submitting");

    try {
      const payload: Record<string, unknown> = {
        recaptchaToken,
        leadType,
        formKey: resolvedFormKey,
        entityId:
          missingEntityId
            ? undefined
            : typeof entityId === "number"
              ? entityId
              : /^\d+$/.test(String(entityId).trim())
                ? Number(String(entityId).trim())
                : String(entityId).trim(),

        name,
        phone: mobile,
        whatsapp: mobile,
        email: email || undefined,

        preferredDate:
          f.date || undefined,
        preferredTime:
          f.preferredTime || undefined,
        // The Pandit booking form does not ask for traveller/guest counts.
        travellersCount:
          resolvedBusinessType === "yatra" || resolvedBusinessType === "travel" ? getTravellerCount(f.travellers) ?? undefined : undefined,
        city: f.city.trim() || undefined,
        state: f.state.trim() || undefined,
        pincode: f.pincode.trim() || undefined,
        language: f.language || undefined,
        bookingMode: panditProfile ? f.bookingMode : undefined,
        gotra: f.gotra.trim() || undefined,
        budgetAmount: f.budgetAmount.trim() ? Number(f.budgetAmount) : undefined,
        samagriRequired: f.samagriRequired || undefined,
        specialRequirements: f.specialRequirements.trim() || undefined,

        requestedPanditSlug: panditProfile?.slug,
        requestedPanditName: panditProfile?.name,
        requestedPanditTitle: panditProfile?.title,
        requestedPanditExperience: panditProfile?.experience,
        requestedPanditLocation: panditProfile?.location,
        requestedPanditLanguages: panditProfile?.languages,
        requestedPanditProfileUrl: panditProfile?.profileUrl,
        businessType: resolvedBusinessType,
        businessDetails: f.businessAnswers,
        businessAnswerSchema: Object.fromEntries(
          businessQuestions.map(({ key, label, type }) => [key, { label, type }]),
        ),
        selectedServiceNames: panditProfile ? selectedServiceNames : undefined,
        requestedPujaName: panditProfile ? (selectedServiceNames.find((serviceName) => panditPujaOptions.includes(serviceName)) || undefined) : activePuja || undefined,
        requestedSevaName: panditProfile ? (selectedServiceNames.find((serviceName) => panditSevaOptions.includes(serviceName)) || undefined) : selectedSeva || undefined,
        requestedServiceNames: panditProfile ? selectedServiceNames : undefined,
        requestedPujaNames: panditProfile ? selectedServiceNames.filter((serviceName) => panditPujaOptions.includes(serviceName)) : undefined,
        requestedSevaNames: panditProfile ? selectedServiceNames.filter((serviceName) => panditSevaOptions.includes(serviceName)) : undefined,
        pujaSpecificDetails: activePuja ? f.pujaDetails : undefined,
        pujaAnswerSchema: activePuja
          ? Object.fromEntries(
              pujaQuestions.map(({ key, label, type }) => [key, { label, type }]),
            )
          : undefined,

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
          serviceType || (resolvedBusinessType === "contact" || resolvedBusinessType === "general" ? undefined : getBusinessLabel(resolvedBusinessType)),
        pujaType:
          activePuja || pujaType || undefined,

        customerMessage: message || undefined,
        message: [
          context,
          `Business type: ${resolvedBusinessType}`,
          ...getBusinessAnswerLines().map((line) => `Business detail — ${line}`),
          ...(panditProfile
            ? [
                "",
                "===== PANDIT PROFILE BOOKING ENQUIRY =====",
                `Requested Pandit: ${panditProfile.name}`,
                `Pandit slug: ${panditProfile.slug}`,
                `Pandit title: ${panditProfile.title}`,
                `Listed experience: ${panditProfile.experience} years`,
                `Pandit service location: ${panditProfile.location}`,
                `Pandit languages: ${panditProfile.languages.join(", ")}`,
                `Pandit profile URL: ${panditProfile.profileUrl}`,
                `Selected pujas / services: ${selectedServiceNames.length ? selectedServiceNames.join(", ") : "Not selected"}`,
                `Customer city: ${f.city.trim() || "-"}`,
                `Customer state: ${f.state.trim() || "-"}`,
                `Customer PIN code: ${f.pincode.trim() || "-"}`,
                `Preferred language: ${f.language || "-"}`,
                `Preferred date: ${f.date || "-"}`,
                `Preferred time: ${f.preferredTime || "Flexible / not specified"}`,
                `Booking mode: ${f.bookingMode}`,
                `Gotra / family tradition: ${f.gotra.trim() || "-"}`,
                `Budget (INR): ${f.budgetAmount.trim() || "Not specified"}`,
                `Samagri preference: ${f.samagriRequired || "To be discussed"}`,
                `Special requirements: ${f.specialRequirements.trim() || "-"}`,
                ...getPujaDetailLines(),
              ]
            : []),
          ...(!panditProfile && activePuja ? getPujaDetailLines().map((line) => `Puja detail — ${line}`) : []),
          message
            ? `Customer message: ${message}`
            : "Customer message: -",
        ].join("\n"),

        sourceType,
        sourceForm: resolvedSourceForm,
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

      const result = getLeadReceipt(response);

      if (result.spam === true || result.accepted === false) {
        submissionLockRef.current = false;
        setStatus("idle");
        setError(
          result.message ||
            (result.spam === true
              ? "We could not accept this submission. Please review the details or use WhatsApp instead."
              : "Your enquiry was not accepted. Please review the details and try again."),
        );
        setErrorAnnouncement(true);
        return;
      }

      const leadNumber = result.lead?.lead_number || null;

      const responseMessage =
        typeof result.message === "string" &&
        result.message.trim()
          ? result.message
          : getDefaultSuccessMessage(
              resolvedBusinessType,
            );

      setReceipt({
        leadNumber,
        duplicate:
          result.duplicate === true,
        message: responseMessage,
      });

      setStatus("done");
    } catch (submitError) {
      submissionLockRef.current = false;
      setStatus("idle");
      setError(
        getErrorText(submitError),
      );
      setErrorAnnouncement(true);
    } finally {
      // Google reCAPTCHA tokens are single-use; ask the visitor to verify again.
      setRecaptchaToken(null);
      recaptchaRef.current?.reset();
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
      className={`w-full rounded-3xl border border-orange-900/10 bg-white shadow-xl shadow-orange-900/5 ${panditProfile ? "p-4 sm:p-5 xl:p-6" : "p-6 md:p-8"}`}
    >
      {panditProfile && (
        <div className="mb-5 rounded-2xl border border-orange-200 bg-linear-to-br from-orange-50 via-amber-50 to-white p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700">
            Enquiry linked to Pandit profile
          </p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold leading-snug text-[#2a1a10] sm:text-xl">
                {panditProfile.name}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-stone-600">
                {panditProfile.title} · {panditProfile.experience} years listed experience
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-stone-600">
                <span aria-hidden="true">📍</span>
                <span>{panditProfile.location}</span>
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                Languages: {panditProfile.languages.join(", ")}
              </p>
            </div>
            <a
              href={panditProfile.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-orange-800 transition hover:bg-orange-100"
            >
              View profile ↗
            </a>
          </div>
          <div className="mt-3 rounded-xl border border-orange-100 bg-white/90 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Selected puja / services</p>
                <p className="mt-1 wrap-break-word text-sm font-semibold text-stone-900">
                  {selectedServiceNames.length ? selectedServiceNames.join(", ") : "No service selected yet"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-900">
                {selectedServiceNames.length} selected
              </span>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-orange-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <label className={label}>
                  Select puja and services you need *
                </label>
                <p className="text-[11px] leading-5 text-stone-500">
                  Select one or multiple options from this Pandit's listed offerings. You can select all if you need them.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateSelectedServices(allPanditServiceOptions)}
                  className="rounded-lg border border-orange-200 px-2.5 py-1.5 text-[11px] font-bold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
                  disabled={status === "submitting" || allPanditServiceOptions.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedServices([])}
                  className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                  disabled={status === "submitting" || selectedServiceNames.length === 0}
                >
                  Clear
                </button>
              </div>
            </div>
            {panditPujaOptions.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-extrabold text-stone-800">Pujas & rituals</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {panditPujaOptions.map((puja) => (
                    <label key={puja} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${selectedServiceNames.includes(puja) ? "border-orange-400 bg-orange-50 ring-1 ring-orange-100" : "border-stone-200 hover:border-orange-200"}`}>
                      <input
                        type="checkbox"
                        name="requestedServices"
                        value={puja}
                        checked={selectedServiceNames.includes(puja)}
                        onChange={() => togglePanditService(puja)}
                        disabled={status === "submitting"}
                        className="mt-0.5 h-4 w-4 accent-orange-700"
                      />
                      <span className="font-medium text-stone-800">{puja}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {panditSevaOptions.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-extrabold text-stone-800">Other services & sevas</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {panditSevaOptions.map((service) => (
                    <label key={service} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${selectedServiceNames.includes(service) ? "border-orange-400 bg-orange-50 ring-1 ring-orange-100" : "border-stone-200 hover:border-orange-200"}`}>
                      <input
                        type="checkbox"
                        name="requestedServices"
                        value={service}
                        checked={selectedServiceNames.includes(service)}
                        onChange={() => togglePanditService(service)}
                        disabled={status === "submitting"}
                        className="mt-0.5 h-4 w-4 accent-orange-700"
                      />
                      <span className="font-medium text-stone-800">{service}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {allPanditServiceOptions.length === 0 && (
              <p className="mt-3 rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-600">
                The Pandit's service list is being updated. Please describe the puja or service you need in the requirements field.
              </p>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-stone-600">
            The Pandit name, profile URL and all selected offerings will be included in the enquiry so the DivyaDhara team can identify the exact services you requested.
          </p>
        </div>
      )}

      <h3 className="font-display text-xl font-semibold text-[#2a1a10]">
        {title}
      </h3>

      <p className="mt-1 text-[13px] leading-5 text-stone-500">
        {panditProfile
          ? "Share your ceremony details. Required fields help the team check date, location and language availability."
          : resolvedBusinessType === "general" || resolvedBusinessType === "contact"
            ? "Tell us what you need and the DivyaDhara team will route your enquiry to the relevant desk."
            : `This form is tailored for ${getBusinessLabel(resolvedBusinessType).toLowerCase()}. Details you provide will accompany your enquiry.`}
      </p>

      <div
        className={`grid sm:grid-cols-2 ${compact ? "mt-4 gap-2" : "mt-5 gap-3"}`}
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

        <div className={`grid gap-3 ${(resolvedBusinessType === "yatra" || resolvedBusinessType === "travel") && !panditProfile ? "grid-cols-2" : "grid-cols-1"}`}>
          <div>
            <label
              className={label}
              htmlFor={`${instanceId}-date`}
            >
              {getBusinessDateLabel(resolvedBusinessType)}{panditProfile ? " *" : ""}
            </label>

            <input
              id={`${instanceId}-date`}
              name="preferredDate"
              type="date"
              required={Boolean(panditProfile)}
              min={panditProfile ? getLocalDateString() : undefined}
              value={f.date}
              onChange={setField("date")}
              className={input}
              disabled={status === "submitting"}
            />
          </div>

          {(resolvedBusinessType === "yatra" || resolvedBusinessType === "travel") && !panditProfile && (
            <div>
              <label
                className={label}
                htmlFor={`${instanceId}-travellers`}
              >
                Number of travellers
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
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  "10",
                  "11+ (group)",
                ].map((option) => (
                  <option key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {!panditProfile && resolvedBusinessType !== "general" && resolvedBusinessType !== "contact" && (
        <section className="mt-5 rounded-2xl border border-orange-100 bg-[#fffcf6] p-4 sm:p-5" aria-labelledby={`${instanceId}-business-location-title`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">Planning details</p>
          <h4 id={`${instanceId}-business-location-title`} className="mt-1 text-sm font-extrabold text-[#2a1a10]">
            {resolvedBusinessType === "yatra" || resolvedBusinessType === "travel" ? "Where will your journey begin?" : resolvedBusinessType === "ashram" ? "Where are you travelling from?" : resolvedBusinessType === "course" ? "Your learning preferences" : "Location and communication preferences"}
          </h4>
          <p className="mt-1 text-xs leading-5 text-stone-500">These details help the relevant DivyaDhara team respond to this specific request. Fill in what you know; optional fields can be discussed later.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor={`${instanceId}-city`}>{resolvedBusinessType === "yatra" || resolvedBusinessType === "travel" ? "Departure city" : "Your city / town"}</label>
              <input id={`${instanceId}-city`} name="city" autoComplete="address-level2" value={f.city} onChange={setField("city")} placeholder="e.g., Navi Mumbai" className={input} disabled={status === "submitting"} />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-state`}>State</label>
              <input id={`${instanceId}-state`} name="state" autoComplete="address-level1" value={f.state} onChange={setField("state")} placeholder="e.g., Maharashtra" className={input} disabled={status === "submitting"} />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-pincode`}>PIN code (optional)</label>
              <input id={`${instanceId}-pincode`} name="pincode" type="text" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={f.pincode} onChange={(event) => setF((current) => ({ ...current, pincode: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="6-digit PIN code" className={input} disabled={status === "submitting"} />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-language`}>{resolvedBusinessType === "course" ? "Preferred instruction language" : "Preferred language"}</label>
              <select id={`${instanceId}-language`} name="language" value={f.language} onChange={setField("language")} className={input} disabled={status === "submitting"}>
                <option value="">No preference / choose later</option>
                {getBusinessLanguageOptions(resolvedBusinessType).map((language) => <option key={language} value={language}>{language}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-preferred-time`}>{resolvedBusinessType === "course" ? "Preferred class time" : "Preferred time (optional)"}</label>
              <input id={`${instanceId}-preferred-time`} name="preferredTime" type="time" value={f.preferredTime} onChange={setField("preferredTime")} className={input} disabled={status === "submitting"} />
            </div>
            {(resolvedBusinessType === "puja" || resolvedBusinessType === "pandit") && (
              <>
                <div>
                  <label className={label} htmlFor={`${instanceId}-gotra`}>Gotra / family tradition (optional)</label>
                  <input id={`${instanceId}-gotra`} name="gotra" value={f.gotra} onChange={setField("gotra")} placeholder="If relevant to the ceremony" className={input} disabled={status === "submitting"} />
                </div>
                <div>
                  <label className={label} htmlFor={`${instanceId}-budget`}>Indicative budget in INR (optional)</label>
                  <input id={`${instanceId}-budget`} name="budgetAmount" type="number" min="0" step="1" inputMode="numeric" value={f.budgetAmount} onChange={setField("budgetAmount")} placeholder="e.g., 5000" className={input} disabled={status === "submitting"} />
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {businessQuestions.length > 0 && !(resolvedBusinessType === "pandit" && panditProfile) && (
        <section className="mt-5 rounded-2xl border border-stone-200 bg-stone-50/80 p-4 sm:p-5" aria-labelledby={`${instanceId}-business-details-title`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">{getBusinessLabel(resolvedBusinessType)}</p>
          <h4 id={`${instanceId}-business-details-title`} className="mt-1 text-sm font-extrabold text-[#2a1a10]">A few details to help us assist you</h4>
          <p className="mt-1 text-xs leading-5 text-stone-500">Fields change according to the selected service. Share only what you know; the team can clarify remaining arrangements.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {businessQuestions.map((question) => (
              <div key={question.key} className={question.type === "textarea" ? "sm:col-span-2" : ""}>
                <label className={label} htmlFor={`${instanceId}-business-${question.key}`}>{question.label}{question.required ? " *" : ""}</label>
                {question.type === "select" ? (
                  <select id={`${instanceId}-business-${question.key}`} name={`businessAnswers.${question.key}`} value={f.businessAnswers[question.key] || ""} onChange={(event) => setBusinessAnswer(question.key, event.target.value)} required={Boolean(question.required)} className={input} disabled={status === "submitting"}>
                    <option value="">Choose an option</option>
                    {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : question.type === "textarea" ? (
                  <textarea id={`${instanceId}-business-${question.key}`} name={`businessAnswers.${question.key}`} rows={3} value={f.businessAnswers[question.key] || ""} onChange={(event) => setBusinessAnswer(question.key, event.target.value)} placeholder={question.placeholder || "Add details (optional)"} className={input} disabled={status === "submitting"} />
                ) : (
                  <input id={`${instanceId}-business-${question.key}`} name={`businessAnswers.${question.key}`} type={question.type} min={question.type === "number" ? "1" : undefined} value={f.businessAnswers[question.key] || ""} onChange={(event) => setBusinessAnswer(question.key, event.target.value)} placeholder={question.placeholder || "Enter details"} required={Boolean(question.required)} className={input} disabled={status === "submitting"} />
                )}
                {question.helper && <p className="mt-1 text-[10px] leading-4 text-stone-500">{question.helper}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(panditProfile || resolvedBusinessType === "puja") && activePuja && (
        <section className="mt-5 rounded-2xl border border-orange-200 bg-orange-50/60 p-4 sm:p-5" aria-labelledby={`${instanceId}-puja-specific-title`}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">Tailored to your puja</p>
          <h4 id={`${instanceId}-puja-specific-title`} className="mt-1 text-sm font-extrabold text-[#2a1a10]">A few details about {activePuja}</h4>
          <p className="mt-1 text-xs leading-5 text-stone-600">These questions apply to {activePuja}. If you selected multiple pujas/services, add any extra service-specific details in Special requirements below. The Pandit/team will confirm the exact vidhi, muhurat, samagri and arrangements with you.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {pujaQuestions.map((question) => (
              <div key={question.key} className={question.type === "textarea" ? "sm:col-span-2" : ""}>
                <label className={label} htmlFor={`${instanceId}-puja-${question.key}`}>{question.label}{question.required ? " *" : ""}</label>
                {question.type === "select" ? (
                  <select id={`${instanceId}-puja-${question.key}`} name={`pujaDetails.${question.key}`} value={f.pujaDetails[question.key] || ""} onChange={(event) => setPujaDetail(question.key, event.target.value)} required={Boolean(question.required)} className={input} disabled={status === "submitting"}>
                    <option value="">Choose an option</option>
                    {(question.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : question.type === "textarea" ? (
                  <textarea id={`${instanceId}-puja-${question.key}`} name={`pujaDetails.${question.key}`} rows={3} value={f.pujaDetails[question.key] || ""} onChange={(event) => setPujaDetail(question.key, event.target.value)} placeholder={question.placeholder || "Add details (optional)"} className={input} disabled={status === "submitting"} />
                ) : (
                  <input id={`${instanceId}-puja-${question.key}`} name={`pujaDetails.${question.key}`} value={f.pujaDetails[question.key] || ""} onChange={(event) => setPujaDetail(question.key, event.target.value)} placeholder={question.placeholder || "Enter details (optional)"} required={Boolean(question.required)} className={input} disabled={status === "submitting"} />
                )}
                {question.helper && <p className="mt-1 text-[10px] leading-4 text-stone-500">{question.helper}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {panditProfile && (
        <section className="mt-5 rounded-2xl border border-stone-200 bg-stone-50/80 p-4 sm:p-5" aria-labelledby={`${instanceId}-booking-details-title`}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">Booking details</p>
            <h4 id={`${instanceId}-booking-details-title`} className="mt-1 text-sm font-extrabold text-[#2a1a10]">
              Where and how should the puja be arranged?
            </h4>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Enter the ceremony location, preferred language and any arrangements you need. These details will be saved with the enquiry.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor={`${instanceId}-city`}>City / town</label>
              <input
                id={`${instanceId}-city`}
                name="city"
                autoComplete="address-level2"
                value={f.city}
                onChange={setField("city")}
                placeholder="e.g., Navi Mumbai"
                className={input}
                disabled={status === "submitting"}
              />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-state`}>State</label>
              <input
                id={`${instanceId}-state`}
                name="state"
                autoComplete="address-level1"
                value={f.state}
                onChange={setField("state")}
                placeholder="e.g., Maharashtra"
                className={input}
                disabled={status === "submitting"}
              />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-pincode`}>PIN code</label>
              <input
                id={`${instanceId}-pincode`}
                name="pincode"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={f.pincode}
                onChange={(event) => setF((current) => ({ ...current, pincode: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
                placeholder="6-digit PIN code"
                className={input}
                disabled={status === "submitting"}
              />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-language`}>Preferred language *</label>
              <select
                id={`${instanceId}-language`}
                name="language"
                required
                value={f.language}
                onChange={setField("language")}
                className={input}
                disabled={status === "submitting"}
              >
                <option value="">Select language</option>
                {Array.from(new Set([...(panditProfile.languages || []), "English", "Other / discuss"])).map((language) => (
                  <option key={language} value={language}>{language}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-preferred-time`}>Preferred time (optional)</label>
              <input
                id={`${instanceId}-preferred-time`}
                name="preferredTime"
                type="time"
                value={f.preferredTime}
                onChange={setField("preferredTime")}
                className={input}
                disabled={status === "submitting"}
              />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-booking-mode`}>Ceremony location type</label>
              <select
                id={`${instanceId}-booking-mode`}
                name="bookingMode"
                value={f.bookingMode}
                onChange={setField("bookingMode")}
                className={input}
                disabled={status === "submitting"}
              >
                <option value="home">At my home / venue</option>
                <option value="temple">At a temple</option>
                <option value="online">Online guidance</option>
                <option value="travel">Pandit travel required</option>
                <option value="other">Other / discuss</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-gotra`}>Gotra / family tradition (optional)</label>
              <input
                id={`${instanceId}-gotra`}
                name="gotra"
                value={f.gotra}
                onChange={setField("gotra")}
                placeholder="If relevant to your ceremony"
                className={input}
                disabled={status === "submitting"}
              />
            </div>
            <div>
              <label className={label} htmlFor={`${instanceId}-budget`}>Indicative budget in INR (optional)</label>
              <input
                id={`${instanceId}-budget`}
                name="budgetAmount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={f.budgetAmount}
                onChange={setField("budgetAmount")}
                placeholder="e.g., 5000"
                className={input}
                disabled={status === "submitting"}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor={`${instanceId}-samagri`}>Samagri arrangement</label>
              <select
                id={`${instanceId}-samagri`}
                name="samagriRequired"
                value={f.samagriRequired}
                onChange={setField("samagriRequired")}
                className={input}
                disabled={status === "submitting"}
              >
                <option value="">To be discussed</option>
                <option value="pandit_to_arrange">Please ask Pandit Ji to arrange samagri</option>
                <option value="customer_to_arrange">I will arrange samagri</option>
                <option value="guidance_needed">I need guidance on samagri</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor={`${instanceId}-special-requirements`}>Special requirements</label>
              <textarea
                id={`${instanceId}-special-requirements`}
                name="specialRequirements"
                rows={3}
                value={f.specialRequirements}
                onChange={setField("specialRequirements")}
                placeholder="Ritual tradition, venue details, family requirements, muhurat preference or accessibility needs…"
                className={input}
                disabled={status === "submitting"}
              />
            </div>
          </div>
        </section>
      )}

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
          placeholder={panditProfile ? "Any other details for this Pandit booking enquiry…" : `Tell us any other details for your ${getBusinessLabel(resolvedBusinessType).toLowerCase()}…`}
          className={input}
          disabled={status === "submitting"}
        />
      </div>

      {/* Honeypot — kept visually hidden for basic bot protection. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
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
            I consent to being contacted on WhatsApp about this enquiry. If I select WhatsApp as my preferred contact method, this consent is required.
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

      <div className="mt-4" aria-label="reCAPTCHA verification">
        {recaptchaSiteKey ? (
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey={recaptchaSiteKey}
            onChange={(token: string | null) => {
              setRecaptchaToken(token);
              if (error) setError(null);
            }}
            onExpired={() => setRecaptchaToken(null)}
            onErrored={() => {
              setRecaptchaToken(null);
              setError("Google reCAPTCHA could not load. Please check your connection and try again.");
              setErrorAnnouncement(true);
            }}
          />
        ) : (
          <p role="alert" className="text-sm text-red-700">
            CAPTCHA configuration is missing. Please contact the website administrator.
          </p>
        )}
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
          {errorAnnouncement && (
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
          className="btn-saffron flex w-full flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          {status === "submitting" ? (
            <>
              <Loader2
                size={15}
                className="animate-spin"
              />
              Submitting enquiry…
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
          className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
        >
          <MessageCircle size={16} />
          WhatsApp Instead
        </a>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-500">
        “WhatsApp Instead” opens a pre-filled message for you to review and send
        in WhatsApp. Please avoid including sensitive personal information.
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
