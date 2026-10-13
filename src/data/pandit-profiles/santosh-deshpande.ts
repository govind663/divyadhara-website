import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const santoshDeshpande: Pandit = {
  slug: "santosh-deshpande",

  name: "Santosh Deshpande",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Santosh Deshpande.jpeg",

  experience: 22,

  location: "Mumbai, Maharashtra, India",

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

  // Existing services listed for this Pandit.
  // Add further services after confirming his expertise.
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
    "Santosh Deshpande is a Hindu priest with 22 years of experience in traditional Hindu puja and Vedic rituals. His listed specializations include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja, and Pitru-related rituals. His detailed biography, language preferences, service availability, and additional ritual expertise should be confirmed before publication.",

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

export default santoshDeshpande;