import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const nishantJoshi: Pandit = {
  slug: "nishant-joshi",

  name: "Nishant Joshi",

  title: "Kundli Jyotish & Samaysya Nivaran Consultant",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/निशांत श्रीकांत जोशी.jpeg",

  // Experience is based on the supplied profile data; verify before publishing.
  experience: 22,

  // Primary/base location. Keep this for compatibility with existing filters.
  location: "Navi Mumbai, Thane",

  // Approximate city-level marker for the listed Navi Mumbai service area.
  // It is not an exact address or a verified boundary of coverage.
  serviceAreas: [
    {
      id: "navi-mumbai",
      name: "Navi Mumbai",
      address: "Navi Mumbai, Thane, Maharashtra, India",
      lat: 19.0308,
      lng: 73.0199,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID only when one is provided.
  // Keep blank until then so the Story button remains hidden.
  storyVideoId: "",

  specializations: [
    "Kundli Jyotish",
    "Samaysya Nivaran",
  ],

  // No puja ceremonies are inferred from the listed consultation specializations.
  // Add puja types only after the consultant confirms they are offered.
  pujaTypes: [],

  // Keep empty until a real affiliation has been verified.
  associatedWith: "",

  about:
    "Nishant Joshi is listed on DivyaDhara as a Kundli Jyotish and Samaysya Nivaran Consultant serving the listed Navi Mumbai area in Maharashtra. Visitors looking for a Kundli Jyotish consultation or guidance about a personal concern can send an enquiry with a brief description of their question, preferred appointment date and time, locality or PIN code, and preferred language. The service-area map marker is an approximate city-level reference; it does not confirm coverage in every locality of Navi Mumbai or Thane.\n\nBefore booking, please confirm the consultation format and scope, appointment availability, expected duration, fees, and any information or documents that may be required. The profile currently lists 22 years of experience and Hindi, Sanskrit and Marathi; these details should be verified with the consultant before publication. Specific puja ceremonies are not listed on this profile, so do not assume that puja services are available unless they are confirmed separately. An enquiry is a request for information and does not itself confirm an appointment.",

  services: [
    {
      name: "Kundli Jyotish Consultation",
      duration: "To be confirmed",
    },
    {
      name: "Samaysya Nivaran Consultation",
      duration: "To be confirmed",
    },
  ],

  availability: "Monday, Tuesday, Wednesday, Thursday, Friday and Saturday, 9:00 AM to 6:00 PM (IST)",

  // Keep false until contact authorization is verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not indicate that Nishant
// Joshi performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default nishantJoshi;
