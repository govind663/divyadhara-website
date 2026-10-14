import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const rohitShukla: Pandit = {
  slug: "rohit-shukla",

  name: "Rohit Shukla",

  title: "Hindu Pandit Ji",

  photo: "/pandits_profile_img/Rohit Shukla.jpeg",

  experience: 5,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID milne par yahan set karein.
   *
   * Example:
   * storyVideoId: "AbCd1234567",
   *
   * Abhi ID blank hai, isliye video button hidden rehna chahiye.
   */
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Currently listed services for this Pandit.
  // Confirm expertise before adding more ceremonies.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  associatedWith: "Divya Dhara — association to be confirmed",

  about:
    "Rohit Shukla is a Hindu Pandit Ji listed on Divya Dhara with 5 years of listed experience in traditional Hindu puja and Vedic rituals. His currently listed areas of service include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. Devotees can enquire about their preferred ceremony, date, city or PIN code, language and specific requirements. Service eligibility, language preferences, pricing, ceremony duration, samagri requirements and availability should be confirmed before a booking is finalized.",

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

  // Keep false until contact authorization is verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue.
// This does not imply that Rohit Shukla performs every
// ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default rohitShukla;