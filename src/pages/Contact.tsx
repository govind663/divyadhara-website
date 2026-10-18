import { Link } from "react-router-dom";
import {
  ArrowRight,
  MapPin,
  Phone,
  Mail,
  MessageCircle,
  Headphones,
  Facebook,
  Instagram,
  Youtube,
} from "lucide-react";

import { useSEO } from "../lib/seo";
import { Breadcrumbs, Reveal, SectionHead } from "../components/ui";
import { EnquiryForm, PageHero, WhatsAppBand } from "../components/blocks";
import { waLink, DISPLAY_PHONE, CONTACT_EMAIL } from "../lib/utils";

const OFFICE_ADDRESS =
  "Nav Durga Niwas, Plot No. 473, Sector 4, Ghansoli, Navi Mumbai – 400701, Maharashtra, India";

const OFFICE_MAP_URL =
  "https://www.google.com/maps?q=Nav+Durga+Niwas,+Plot+No.+473,+Sector+4,+Ghansoli,+Navi+Mumbai+400701,+Maharashtra,+India&output=embed";

const OFFICE_MAP_SEARCH_URL =
  "https://www.google.com/maps/search/?api=1&query=Nav+Durga+Niwas,+Plot+No.+473,+Sector+4,+Ghansoli,+Navi+Mumbai+400701,+Maharashtra,+India";

const contactDetails = [
  {
    key: "address",
    icon: MapPin,
    title: "Visit / Post",
    description: OFFICE_ADDRESS,
    href: OFFICE_MAP_SEARCH_URL,
  },
  {
    key: "phone",
    icon: Phone,
    title: "Call the Seva Desk",
    description: `${DISPLAY_PHONE} · 7 AM – 10 PM IST`,
    href: `tel:${DISPLAY_PHONE.replace(/[^\d+]/g, "")}`,
  },
  {
    key: "email",
    icon: Mail,
    title: "Email",
    description: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
  },
  {
    key: "whatsapp",
    icon: MessageCircle,
    title: "WhatsApp (fastest)",
    description: "Tap to chat — darshan, puja, pandit, yatra, course help",
  },
];

const socialProfiles = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61595158181892",
    icon: Facebook,
    iconClass: "text-[#1877F2]",
    description: "Updates and community posts",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/divya_dhara108/",
    icon: Instagram,
    iconClass: "text-[#C13584]",
    description: "Spiritual visuals and stories",
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@DivyaDhara-k9t",
    icon: Youtube,
    iconClass: "text-[#FF0000]",
    description: "Temple videos and spiritual guides",
  },
];

export default function Contact() {
  useSEO({
    title: "Contact DivyaDhara | Seva Desk, WhatsApp & Social Media",
    description:
      "Contact DivyaDhara for temple, puja, pandit and pilgrimage enquiries. Find our Navi Mumbai office details, phone, email, WhatsApp contact form and official Facebook, Instagram and YouTube profiles.",
    path: "/contact",
  });

  return (
    <main className="min-h-screen overflow-hidden bg-[#fffdf8] text-stone-800">
      <PageHero
        eyebrow="Sampark · Contact"
        title="We're Here to Serve"
        sub="Seva desk open 7 AM – 10 PM IST · Replies within a few hours in 7 languages."
        image="/images/hero-varanasi.jpeg"
      >
        <a
          href="#contact-form"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-semibold text-stone-950 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
        >
          Send an Enquiry
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </PageHero>

      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Contact" },
          ]}
        />

        <section
          aria-label="DivyaDhara contact details and general enquiry form"
          className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start"
        >
          <div className="space-y-4">
            {contactDetails.map((contact, index) => {
              const Icon = contact.icon;

              return (
                <Reveal key={contact.key} delay={index * 0.06}>
                  <article className="sacred-border flex items-start gap-4 rounded-3xl border border-orange-900/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-orange-600 to-amber-500 text-white">
                      <Icon size={18} aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold text-[#2a1a10]">
                        {contact.title}
                      </h2>

                      {contact.href ? (
                        <a
                          href={contact.href}
                          target={contact.href.startsWith("http") ? "_blank" : undefined}
                          rel={contact.href.startsWith("http") ? "noopener noreferrer" : undefined}
                          className="mt-0.5 block break-words text-sm leading-6 text-stone-600 transition hover:text-orange-700 hover:underline"
                        >
                          {contact.description}
                        </a>
                      ) : (
                        <p className="mt-0.5 text-sm leading-6 text-stone-600">
                          {contact.description}
                        </p>
                      )}

                      {contact.key === "whatsapp" && (
                        <a
                          href={waLink("Namaste DivyaDhara!")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
                        >
                          <MessageCircle size={15} aria-hidden="true" />
                          Open WhatsApp
                        </a>
                      )}

                      {contact.key === "address" && (
                        <a
                          href={OFFICE_MAP_SEARCH_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-orange-700 underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:ring-offset-2"
                        >
                          <MapPin size={14} aria-hidden="true" />
                          Open in Google Maps
                        </a>
                      )}
                    </div>
                  </article>
                </Reveal>
              );
            })}

            <div className="overflow-hidden rounded-3xl border border-orange-900/10 bg-stone-100 shadow-sm">
              <iframe
                title="DivyaDhara Navi Mumbai office location on Google Maps"
                src={OFFICE_MAP_URL}
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>

            <p className="px-1 text-xs leading-relaxed text-stone-500">
              Office: {OFFICE_ADDRESS}
            </p>
          </div>

          <Reveal delay={0.1}>
            <div
              id="contact-form"
              className="scroll-mt-24 rounded-3xl border border-orange-900/10 bg-white p-5 shadow-lg shadow-orange-900/5 sm:p-6"
            >
              <div className="mb-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-orange-800">
                  <Headphones size={14} aria-hidden="true" />
                  General Enquiry
                </span>
                <h2 className="font-display mt-3 text-2xl font-semibold text-[#2a1a10]">
                  Send a Message
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-stone-600">
                  Have a question or suggestion? Leave your details and a short message.
                </p>
              </div>

              <EnquiryForm
                context="General enquiry submitted through the DivyaDhara contact page."
                title="Send a Message"
                compact
                leadType="contact"
                formKey="contact"
                sourceForm="contact"
                pagePath="/contact"
              />
            </div>
          </Reveal>
        </section>

        {/* Official social media profiles */}
        <section
          aria-label="Official DivyaDhara social media profiles"
          className="mt-12 rounded-3xl border border-orange-900/10 bg-white p-6 shadow-sm sm:p-8"
        >
          <SectionHead
            eyebrow="Stay Connected"
            title="Follow DivyaDhara on Social Media"
            sub="Explore spiritual stories, temple discoveries, pilgrimage inspiration and videos through our official social channels."
          />

          <div className="mx-auto mt-7 grid max-w-4xl gap-4 sm:grid-cols-3">
            {socialProfiles.map((profile, index) => {
              const Icon = profile.icon;

              return (
                <Reveal key={profile.name} delay={index * 0.06}>
                  <a
                    href={profile.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit DivyaDhara on ${profile.name} (opens in a new tab)`}
                    className="group flex h-full items-center gap-4 rounded-2xl border border-stone-200 bg-[#fffdf8] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-600 focus:ring-offset-2"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-stone-100 transition group-hover:scale-105">
                      <Icon
                        size={24}
                        aria-hidden="true"
                        className={profile.iconClass}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#2a1a10]">
                        {profile.name}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-stone-600">
                        {profile.description}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-stone-400 transition group-hover:translate-x-1 group-hover:text-orange-800"
                    />
                  </a>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <SectionHead
            eyebrow="Need Guidance?"
            title="The DivyaDhara Seva Desk is here to help"
            sub="For darshan, puja, pandit, yatra and course questions, contact the team through WhatsApp or send an enquiry above."
          />
          <WhatsAppBand
            title="Need More Information?"
            sub="Connect with DivyaDhara for guidance about our spiritual resources and services."
            message="Namaste DivyaDhara! I need help with darshan, puja, pandit, yatra or course information."
          />
        </section>

        <p className="mt-8 text-center">
          <Link
            to="/about"
            className="inline-flex items-center gap-2 text-sm font-bold text-orange-700 underline underline-offset-4 transition hover:text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:ring-offset-2"
          >
            About DivyaDhara <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </p>
      </div>
    </main>
  );
}
