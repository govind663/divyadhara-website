import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const sudhakarKulkarniGuruji: Pandit = {
  slug: "sudhakar-kulkarni-guruji",

  name: "Sudhakar Kulkarni Guruji",

  title: "Hindu Pandit Ji",

  // Verify that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Sudhakar_Kulkarni_Guruji.jpg",

  // Supplied profile value; verify before presenting it as a factual claim.
  experience: 40,

  // Primary/base location retained for existing profile and location filters.
  location: "Ghansoli, Navi Mumbai, Maharashtra, India",

  // Ghansoli is the only area listed in this profile.
  // Coordinates are an approximate locality-centre marker, not an exact address
  // or a boundary for the full service area.
  serviceAreas: [
    {
      id: "ghansoli-navi-mumbai",
      name: "Ghansoli, Navi Mumbai",
      address: "Ghansoli, Navi Mumbai, Maharashtra, India",
      lat: 19.1255,
      lng: 73.0058,
    },
  ],

  // Confirm the languages spoken before publishing the profile.
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

  // Only ceremonies listed in the supplied profile are included here.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave blank until a specific association is verified.
  associatedWith: "",

  about: `Sudhakar Kulkarni Guruji is listed on DivyaDhara as a Hindu Pandit based in Ghansoli, Navi Mumbai, Maharashtra. Ghansoli, Navi Mumbai is the service area currently listed on this profile; the map marker is an approximate locality-centre reference and should not be treated as an exact address or a guaranteed service boundary.

Devotees can enquire about the puja services listed on this profile, including Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. When sending an enquiry, share the ceremony you need, preferred date or muhurat, venue locality or PIN code, language preference and any family or sampradaya requirements so the request can be assessed clearly.

Before confirming a booking, ask Guruji to confirm the applicable vidhi or paath, samagri list and who will arrange it, expected duration, dakshina, any travel charges, and appointment availability. The listed experience and languages should be verified directly, and any additional localities or ceremonies should be added to this profile only after they are confirmed. An enquiry does not itself confirm availability or complete a booking.`,

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

  // Keep false until direct-contact authorization is verified through the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue; this does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default sudhakarKulkarniGuruji;
