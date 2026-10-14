import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const ashishKumarDubey: Pandit = {
  slug: "ashish-kumar-dubey",

  name: "Ashish Kumar Dubey",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Ashish Kumar Dubey.jpeg",

  experience: 14,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID milne ke baad neeche wali line
   * uncomment karke ID enter karein.
   *
   * Example:
   * storyVideoId: "AbCd1234567",
   *
   * Sirf video ID enter karein, poora URL nahi.
   * Video ID ko tabhi set karein jab video Ashish Kumar Dubey
   * ka ho aur uska use karne ki permission ho.
   */

  // storyVideoId: "YOUR_YOUTUBE_VIDEO_ID",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  /*
   * Puja names used for profile discovery and filtering.
   * Add only services whose suitability for this Pandit
   * has been confirmed.
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
    "Ashish Kumar Dubey is a Hindu priest with 14 years of listed experience in traditional Hindu puja and Vedic rituals. His listed areas of service include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Visitors are encouraged to share their preferred ceremony, date, location, language and specific requirements before enquiring. Detailed biography, service availability, ritual procedures and pricing should be confirmed directly before a booking is finalized.",

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

  /*
   * Keep false until the contact details and authorization
   * have been checked and approved.
   */
  authorizedContact: false,
};

// Shared website-wide puja catalogue.
// This does not imply that the Pandit performs every listed puja.
export { PUJA_CATEGORIES };

export default ashishKumarDubey;