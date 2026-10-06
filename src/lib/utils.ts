export const WHATSAPP_NUMBER = "9820108626";
export const DISPLAY_PHONE = "+91 98201 08626";
export const CONTACT_EMAIL = "dharadivya59@gmail.com";
export const SITE_URL = "https://divyadhara.in";

export function waLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

export function inr(n: number): string {
  return "\u20B9" + n.toLocaleString("en-IN");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;

  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
