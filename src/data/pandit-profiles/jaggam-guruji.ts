import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const jaggamGuruji: Pandit = {
  slug: "jaggam-guruji",

  name: "Jaggam Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Jaggam_Guruji_Pune.jpg",

  // Verify the listed experience before publishing as a factual claim.
  experience: 5,

  // Primary/base location retained for existing filters and profile compatibility.
  location: "Pune, Maharashtra, India",

  // Pune is the currently listed service area. Coordinates are an approximate
  // city-centre marker, not an exact address or a defined service boundary.
  serviceAreas: [
    {
      id: "pune",
      name: "Pune",
      address: "Pune, Maharashtra, India",
      lat: 18.5204,
      lng: 73.8567,
    },
  ],

  // Confirm spoken languages with the Pandit before publishing.
  languages: ["Hindi", "Marathi", "Sanskrit"],

  // Keep empty until a relevant YouTube video ID and permission are verified.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only ceremonies currently listed in the supplied profile are included.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave blank until a genuine association is confirmed.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Pune, Maharashtra, for a traditional puja or family ritual? Jaggam Guruji is listed on DivyaDhara as a Hindu Pandit Ji whose profile currently lists Pune as the service area. Devotees can enquire about Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. The exact vidhi, mantra or paath, and suitability for the occasion should be discussed with the Pandit before confirming arrangements.\n\nWhen sending an enquiry, share the ceremony you need, preferred date or muhurat, venue locality or PIN code in Pune, language preference and any family or sampradaya requirements. This helps clarify the request and whether the location can be served. Pune is the currently listed service area; the map marker is an approximate city-centre reference, not a verified service boundary, and coverage of individual neighbourhoods must be confirmed before booking.\n\nBefore finalising a booking, confirm the required samagri and who will arrange it, expected duration, dakshina, any travel charges, appointment availability and the final ritual plan. The profile lists service options for enquiry; it does not guarantee that a particular date or ceremony is available. The listed experience and spoken languages should also be verified directly. Sending an enquiry through DivyaDhara does not itself confirm a booking. Additional ceremonies or service locations should be added to this profile only after confirmation.",

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

export default jaggamGuruji;
