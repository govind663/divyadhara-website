import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const shrikantGuruji: Pandit = {
  slug: "shrikant-guruji",

  name: "Shrikant Guruji",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Shrikant Guruji.jpeg",

  experience: 15,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID milne par yahan set karein.
   * Example: "AbCd1234567"
   *
   * Abhi video ID available nahi hai.
   * Empty ID par Story button hidden rehna chahiye.
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

  // Currently listed services for this Pandit.
  // Confirm expertise before adding additional ceremonies.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  associatedWith: "To be confirmed",

  about:
    "Shrikant Guruji is a Hindu priest with 15 years of listed experience in traditional Hindu puja and Vedic rituals. His currently listed areas of service include Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. Devotees can enquire by sharing their preferred ceremony, date, city or PIN code, language and specific requirements. Detailed biography, service availability, ritual procedures, samagri requirements, duration and pricing should be confirmed before a booking is finalized.",

  services: [
    {
      name: "Satyanarayan Katha and Puja",
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

  // Keep false until contact details and authorization are verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue.
// This does not imply that Shrikant Guruji performs every
// ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default shrikantGuruji;