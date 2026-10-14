import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const gauravDwivediGuruji: Pandit = {
  slug: "gaurav-dwivedi-guruji",

  name: "Gaurav Dwivedi Guruji",

  title: "Hindu Pandit Ji",

  photo: "/pandits_profile_img/Gaurav Dwivedi Guruji.jpeg",

  experience: 9,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Actual YouTube video ID milne par property uncomment karein.
   *
   * Example:
   * storyVideoId: "AbCd1234567",
   *
   * Sirf valid video ID use karein.
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
   * Currently listed services.
   * Additional services should be added only after
   * confirming the Pandit's relevant experience.
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
    "Gaurav Dwivedi Guruji is a Hindu priest with 9 years of listed experience in traditional Hindu puja and Vedic rituals. His listed areas of service include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Visitors can share their preferred ceremony, date, city or PIN code, language and specific requirements when making an enquiry. His detailed biography, service availability, ritual procedures and pricing should be confirmed before a booking is finalized.",

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
// This does not mean that this Pandit performs every listed puja.
export { PUJA_CATEGORIES };

export default gauravDwivediGuruji;