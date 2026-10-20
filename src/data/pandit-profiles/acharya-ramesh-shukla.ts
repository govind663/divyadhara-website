import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const acharyaRameshShukla: Pandit = {
  slug: "acharya-ramesh-shukla",

  name: "Acharya Ramesh Shukla",

  title: "Hindu Pandit Ji",

  // Verify that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Acharya_Ramesh_Shukla.jpg",

  // The source row did not establish years of experience; verify before publishing.
  experience: 15,

  // Primary/base location retained for existing website functionality.
  location: "Navi Mumbai, Maharashtra, India",

  // Service coverage areas are shown on listings and on the profile map.
  // Coordinates are an approximate city-centre marker, not an exact address or boundary.
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
  languages: ["Hindi", "Marathi", "Sanskrit"],

  // Keep blank until a verified YouTube video ID is provided.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only services stated in the supplied source row are listed here.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave blank until a verified temple, organisation or sampradaya association is provided.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Navi Mumbai, Maharashtra, for a traditional puja or family ceremony? On DivyaDhara, devotees can enquire with Acharya Ramesh Shukla about the listed rituals: Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. Share the occasion, preferred date or muhurat, venue, locality or PIN code, language preference and any family or sampradaya requirements so the enquiry can be reviewed with the requested ceremony in mind.\n\nNavi Mumbai, Maharashtra, is the currently listed service area for this profile. The map marker represents an approximate city-level reference; it is not an exact address or a verified service boundary. If the ceremony is planned in a particular locality, provide the full venue details and confirm travel feasibility and coverage before booking. Do not assume service in another city or locality until it has been confirmed directly.\n\nBefore finalising arrangements, confirm the prescribed vidhi or paath, puja samagri list and who will arrange the materials, expected duration, dakshina, travel charges, language and date availability. The profile lists 15 years of experience and Hindi, Marathi and Sanskrit; please verify these details with the Pandit before relying on them for your ceremony. Service duration and final charges are currently not specified, and sending an enquiry does not itself confirm availability or complete a booking.",

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

  // Keep false until contact authorization is verified through the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue; this does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default acharyaRameshShukla;
