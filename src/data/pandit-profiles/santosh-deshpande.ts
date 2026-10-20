import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const santoshDeshpande: Pandit = {
  slug: "santosh-deshpande",

  name: "Santosh Deshpande",

  title: "Experienced Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Santosh Deshpande.jpeg",

  // Experience is listed in the supplied profile; verify before publishing.
  experience: 22,

  // Primary/base location retained for existing profile and location logic.
  location: "Mumbai, Maharashtra, India",

  // Approximate city-centre marker for map orientation, not an exact address
  // or a boundary for the full service area. Confirm the actual localities served.
  serviceAreas: [
    {
      id: "mumbai-maharashtra",
      name: "Mumbai",
      address: "Mumbai, Maharashtra, India",
      lat: 19.0760,
      lng: 72.8777,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID when one is provided and approved for use.
  // Keep blank until then so the Story button remains hidden.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Keep the listed ceremony names; confirm suitability with the Pandit before booking.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Empty until a specific association is verified.
  associatedWith: "",

  about:
    "Santosh Deshpande is listed on DivyaDhara as an Experienced Hindu Pandit Ji based in Mumbai, Maharashtra. The profile currently lists Mumbai as the service area, with an approximate city-centre map marker for orientation; it does not represent an exact address or guaranteed boundary for every locality.\n\nThe listed ceremonies include Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. Devotees can enquire by sharing the ceremony they need, their preferred date or muhurat, venue locality or PIN code, language preference and any family-tradition requirements.\n\nBefore confirming a booking, ask about the applicable vidhi or paath, samagri list and who will arrange it, expected duration, dakshina, travel charges and appointment availability. Exact coverage within Mumbai, spoken languages and the listed experience should be verified directly. Sending an enquiry does not itself confirm availability or complete a booking.",

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

  availability: "Monday, Tuesday, Wednesday, Thursday, Friday and Saturday, 9:00 AM to 6:00 PM (IST)",

  // Keep false until contact details and authorization are verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that Santosh Deshpande
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default santoshDeshpande;
