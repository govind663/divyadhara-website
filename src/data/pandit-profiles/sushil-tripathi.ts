import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

export const sushilTripathi: Pandit = {
  slug: "sushil-tripathi",

  name: "Sushil Tripathi",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Sushil Tripathy Guruji.jpeg",

  experience: 27,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID milne par yahan set karein.
   * Example: "AbCd1234567"
   *
   * Blank hone par existing PanditDetail.tsx logic ke
   * according Story button hidden rehna chahiye.
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

  /*
   * Currently listed puja types.
   * Confirm the Pandit's expertise and availability before
   * accepting a booking for any listed ceremony.
   */
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
    "Griha Pravesh Puja",
    "Navgraha Shanti Puja",
    "Puja and Vedic Rituals",
  ],

  associatedWith: "To be confirmed",

  about:
    "Pandit Sushil Tripathi is a Hindu priest listed on Divya Dhara with 27 years of experience in traditional Hindu puja ceremonies and Vedic rituals. His currently listed areas of service include Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja, Pitru-related rituals, Griha Pravesh Puja and Navgraha Shanti Puja. Devotees can enquire by sharing their preferred ceremony, date, city or PIN code, language and specific requirements. Ritual procedures, samagri requirements, ceremony duration, pricing, service eligibility and availability should be confirmed before a booking is finalized.",

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
    {
      name: "Griha Pravesh Puja",
      duration: "To be confirmed",
    },
    {
      name: "Navgraha Shanti Puja",
      duration: "To be confirmed",
    },
    {
      name: "Puja and Vedic Rituals",
      duration: "To be confirmed",
    },
  ],

  availability: "To be confirmed",

  // Keep false until contact details and authorization are verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue.
// This does not imply that Sushil Tripathi performs
// every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default sushilTripathi;