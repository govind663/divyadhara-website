import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const rohitShukla: Pandit = {
  slug: "rohit-shukla",

  name: "Rohit Shukla",

  title: "Hindu Pandit Ji",

  // Verify that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Rohit Shukla.jpeg",

  // Listed experience supplied in the profile; verify before publishing.
  experience: 5,

  // Primary/base location retained for legacy display and compatibility.
  location: "Mumbai, Maharashtra, India",

  // Mumbai is the currently listed service area. Coordinates are an approximate
  // city-centre marker, not an exact address or a boundary for all areas served.
  serviceAreas: [
    {
      id: "mumbai",
      name: "Mumbai",
      address: "Mumbai, Maharashtra, India",
      lat: 19.076,
      lng: 72.8777,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID only when the video belongs to this Pandit
  // and permission to use it has been confirmed.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Keep only the services currently listed for this profile.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave empty until an organisation association is verified.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Mumbai, Maharashtra, for a traditional puja or Hindu ritual? Rohit Shukla is listed on DivyaDhara as a Hindu Pandit Ji, with Mumbai as his currently listed service area. Devotees can enquire about the ceremonies listed on this profile: Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related Rituals.\n\nTo help assess the arrangements for your ceremony, share the occasion, preferred date or muhurat, venue locality or PIN code, language preference and any family or sampradaya requirements. The map marker indicates an approximate Mumbai city-centre location for orientation only; it does not confirm coverage in every Mumbai neighbourhood or nearby locality. Please confirm the exact service location before proceeding.\n\nBefore confirming a booking, ask about the prescribed vidhi or paath, samagri list and who will arrange it, expected duration, dakshina and any travel charges. Appointment availability, languages, exact service coverage and the listed experience should be confirmed directly. Sending an enquiry does not itself confirm availability or complete a booking.",

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

  // Keep false until contact authorization is verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue.
// This does not imply that Rohit Shukla performs every ceremony listed here.
export { PUJA_CATEGORIES };

export default rohitShukla;
