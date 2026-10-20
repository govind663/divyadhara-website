import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const atulMahashabde: Pandit = {
  slug: "atul-mahashabde",

  name: "Atul Mahashabde",

  title: "Hindu Pandit Ji",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Atul_Mahashabde.jpg",

  // Verify the listed experience before publishing.
  experience: 20,

  // Primary/base location retained for compatibility with existing filters.
  location: "Navi Mumbai, Maharashtra, India",

  // This is the only service area currently listed for this profile.
  // Coordinates indicate an approximate city centre, not an exact address or boundary.
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

  // Add a verified YouTube video ID only when it belongs to this Pandit
  // and permission to use it has been confirmed.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only ceremonies named in the supplied source row are listed here.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Keep empty until a genuine association has been verified.
  associatedWith: "",

  about: `Looking for a Hindu Pandit in Navi Mumbai, Maharashtra, for Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja or Pitru-related rituals? Atul Mahashabde is listed on DivyaDhara as a Hindu Pandit Ji, with Navi Mumbai as the currently listed service area. Devotees can review the listed puja options and send an enquiry for their ceremony requirements.

The listed services include Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. When enquiring, share the occasion, preferred date or muhurat, venue locality or PIN code, language preference and any family or sampradaya requirements. The Navi Mumbai map marker is an approximate city-level reference; it is not an exact address or a verified service boundary. Confirm coverage for your specific locality before finalising a booking.

Before confirming arrangements, discuss the required vidhi or paath, samagri list and who will arrange it, expected duration, dakshina, possible travel charges and appointment availability. The listed experience and languages should also be verified directly. Sending an enquiry does not automatically confirm availability or complete a booking.`,

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

export default atulMahashabde;
