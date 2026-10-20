import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const devendraGoswamiGuruji: Pandit = {
  slug: "devendra-goswami-guruji",

  name: "Devendra Goswami Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Devendra_Goswami_Guruji.jpg",

  // The supplied source did not establish verified experience; confirm before publishing.
  experience: 16,

  // Primary/base location retained for existing profile and search compatibility.
  location: "Navi Mumbai, Maharashtra, India",

  // Only the currently listed service area is included. Coordinates are an
  // approximate city-centre marker, not an exact address or service boundary.
  serviceAreas: [
    {
      id: "navi-mumbai",
      name: "Navi Mumbai",
      address: "Navi Mumbai, Maharashtra, India",
      lat: 19.0308,
      lng: 73.0199,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add only a verified YouTube video ID for this Pandit and an approved video.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Retain only the ceremonies present in the supplied profile information.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave blank until a verified association is provided, so a placeholder is not shown.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Navi Mumbai, Maharashtra, for a traditional puja or family ritual? Devendra Goswami Guruji is listed on DivyaDhara with services including Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. Devotees can enquire about the ceremony that suits their occasion and share their preferred date or muhurat, venue or locality, PIN code, language preference and family or sampradaya requirements.\n\nNavi Mumbai is the currently listed service area. The map marker represents an approximate city-level location and is not an exact address or a verified service boundary. Coverage in a specific locality or a nearby area should be confirmed directly before making arrangements. The profile should only be updated with additional localities or ceremonies after they have been confirmed.\n\nBefore finalising a booking, confirm the required vidhi or paath, samagri list and who will arrange the materials, expected duration, dakshina, any travel charges and appointment availability. The listed experience and languages should also be verified with the Pandit. Sending an enquiry does not automatically confirm a booking; final details should be agreed before the ceremony.",

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

  // Keep false until contact details and authorization are verified in the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default devendraGoswamiGuruji;
