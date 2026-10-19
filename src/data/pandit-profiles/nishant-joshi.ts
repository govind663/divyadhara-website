import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const nishantJoshi: Pandit = {
  slug: "nishant-joshi",

  name: "Nishant Joshi",

  title: "Kundli Jyotish & Samaysya Nivaran Consultant",

  photo: "/pandits_profile_img/निशांत श्रीकांत जोशी.jpeg",

  experience: 22,

  location: "Navi Mumbai, Thane",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID when one is provided.
  // The Story button should remain hidden while this is empty.
  storyVideoId: "",

  specializations: [
    "Kundli Jyotish",
    "Samaysya Nivaran",
  ],

  // No puja ceremonies are inferred from the listed specializations.
  // Add puja types only after the pandit confirms that they are offered.
  pujaTypes: [],

  associatedWith: "To be confirmed",

  about:
    "Nishant Joshi is listed on Divya Dhara with 22 years of experience and specializations in Kundli Jyotish and Samaysya Nivaran. Visitors can enquire about a consultation by sharing their requirements and preferred appointment time. The consultation process, availability, duration and pricing should be confirmed before an appointment is finalized. Specific puja ceremonies have not been listed and should be added only after confirmation.",

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

  availability: "To be confirmed",

  // Keep false until contact authorization is verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not indicate that Nishant
// Joshi performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default nishantJoshi;
