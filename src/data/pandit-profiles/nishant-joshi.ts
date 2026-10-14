import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const nishantJoshi: Pandit = {
  slug: "nishant-joshi",

  name: "Nishant Joshi",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/निशांत श्रीकांत जोशी.jpeg",

  experience: 22,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID yahan add karein.
   * Example: "AbCd1234567"
   *
   * YouTube ID milne par empty string ko replace karein.
   * Bina valid ID ke video button display nahi hoga.
   */
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Services listed for Nishant Joshi.
  // Confirm expertise before adding additional ceremonies.
  pujaTypes: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  associatedWith: "To be confirmed",

  about:
    "Nishant Joshi is a Hindu priest with 22 years of listed experience in traditional Hindu puja and Vedic rituals. His listed specializations include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Visitors can enquire about a suitable ceremony by sharing their preferred date, city or PIN code, language and specific requirements. Ritual procedures, service availability, duration, samagri requirements and pricing should be confirmed directly before a booking is finalized.",

  services: [
    {
      name: "Satyanarayan Puja",
      duration: "To be confirmed",
    },
    {
      name: "Rudrabhishek",
      duration: "To be confirmed",
    },
    {
      name: "Havan",
      duration: "To be confirmed",
    },
    {
      name: "Vastu Shanti Puja",
      duration: "To be confirmed",
    },
    {
      name: "Ganesh Puja",
      duration: "To be confirmed",
    },
    {
      name: "Pitru-related Rituals",
      duration: "To be confirmed",
    },
  ],

  availability: "To be confirmed",

  // Keep false until contact authorization is verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue.
// This does not indicate that Nishant Joshi performs every
// ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default nishantJoshi;