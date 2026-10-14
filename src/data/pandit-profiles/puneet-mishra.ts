import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const puneetMishra: Pandit = {
  slug: "puneet-mishra",

  name: "Puneet Mishra",

  title: "Hindu Pandit Ji",

  photo: "/pandits_profile_img/Puneet Mishra.jpeg",

  experience: 5,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID milne par yahan set karein.
   * Example: "AbCd1234567"
   *
   * Video ID abhi available nahi hai, isliye blank hai.
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
   * Currently listed services.
   * Add other ceremonies only after confirming
   * the Pandit's relevant expertise.
   */
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
    "Puneet Mishra is a Hindu priest with 5 years of listed experience in traditional Hindu puja and Vedic rituals. His listed areas of service include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Visitors can share their preferred ceremony, date, city or PIN code, language and specific requirements when making an enquiry. His detailed biography, service availability, ritual procedures, duration and pricing should be confirmed before a booking is finalized.",

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
// This does not indicate that Puneet Mishra performs
// every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default puneetMishra;