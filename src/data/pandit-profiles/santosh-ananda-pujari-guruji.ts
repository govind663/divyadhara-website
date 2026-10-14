import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const santoshAnandaPujariGuruji: Pandit = {
  slug: "santosh-ananda-pujari-guruji",

  name: "Santosh Ananda Pujari Guruji",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Santosh ananda pujari.jpeg",

  experience: 20,

  location: "Thakurli, Kalyan, Maharashtra",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID milne par yahan set karein.
   *
   * Example:
   * storyVideoId: "AbCd1234567",
   *
   * Abhi video ID available nahi hai.
   * Blank ID par Story button hidden rehna chahiye.
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
  // Additional services should be confirmed before being added.
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
    "Santosh Ananda Pujari Guruji is a Hindu priest with 20 years of listed experience in traditional Hindu puja and Vedic rituals. His currently listed areas of service include Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. Devotees can enquire by sharing their preferred ceremony, date, city or PIN code, language and specific requirements. Ritual procedures, samagri requirements, service duration, pricing and availability should be confirmed before a booking is finalized.",

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
// This does not imply that this Pandit performs every listed ceremony.
export { PUJA_CATEGORIES };

export default santoshAnandaPujariGuruji;