import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const rohitShukla: Pandit = {
  slug: "rohit-shukla",

  name: "Rohit Shukla",

  title: "Hindu Pandit Ji",

  photo: "/pandits_profile_img/Rohit Shukla.jpeg",

  experience: 5,

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
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only currently listed services are included.
  // Confirm each service with the Pandit before accepting a booking.
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
    "Rohit Shukla is a Hindu Pandit Ji listed on Divya Dhara with 5 years of experience in traditional Hindu puja and Vedic rituals. His currently listed areas of service include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja, and Pitru-related rituals. Devotees can enquire about their ceremony requirements, preferred date, location, and traditional arrangements. Service eligibility, language preferences, pricing, ceremony duration, and availability should be confirmed before a booking is accepted.",

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

  authorizedContact: false,
};

// Export the shared 12-category puja catalogue separately.
// This is the website-wide catalogue, not a claim that this
// Pandit personally performs every ceremony in the catalogue.
export { PUJA_CATEGORIES };

export default rohitShukla;