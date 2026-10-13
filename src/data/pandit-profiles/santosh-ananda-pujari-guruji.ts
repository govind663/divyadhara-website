
import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const santoshAnandaPujariGuruji: Pandit = {
  slug: "santosh-ananda-pujari-guruji",

  name: "Santosh Ananda Pujari Guruji",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Santosh ananda pujari.jpeg",

  experience: 20,

  location: "Thakurli, Kalyan, Maharashtra",

  languages: [
    "Hindi",
    "Sanskrit",
    "Marathi",
  ],

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Services currently listed on this Pandit's profile.
  // Add other services only after confirming his expertise.
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
    "Santosh Ananda Pujari Guruji is a Hindu priest with 20 years of experience. His profile currently lists Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja, and Pitru-related rituals. Please confirm his detailed biography, languages, availability, and additional ritual expertise before publishing those details.",

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

  authorizedContact: false,
};

// Export the shared 12-category puja catalogue separately.
// This is the website-wide catalogue, not a claim that this
// Pandit personally performs every ceremony in the catalogue.
export { PUJA_CATEGORIES };

export default santoshAnandaPujariGuruji;
