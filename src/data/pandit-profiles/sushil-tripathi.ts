import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

export const sushilTripathi: Pandit = {
  slug: "sushil-tripathi",

  name: "Sushil Tripathi",

  title: "Pandit",

  photo: "/pandits_profile_img/Sushil Tripathy Guruji.jpeg",

  experience: 27,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Personal service list: retain currently listed services.
  // Confirm each service with the Pandit before accepting bookings.
  pujaTypes: [
    "Satyanarayan Puja",
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
    "Pandit Sushil Tripathi is a Hindu priest with 27 years of experience in traditional puja ceremonies and Vedic rituals. His listed specializations include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja, and Pitru-related rituals. His additional listed services include Griha Pravesh Puja, Navgraha Shanti Puja, and Puja and Vedic Rituals. Contact details, service eligibility, and availability should be confirmed before booking.",

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

export default sushilTripathi;