import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const badriPrasadGuruji: Pandit = {
  slug: "badri-prasad-guruji",

  name: "Badri Prasad Guruji",

  title: "Hindu Pandit Ji",

  // Confirm this exact filename exists in public/pandits_profile_img/ before publishing.
  photo: "/pandits_profile_img/Badri_Prasad_Guruji.jpg",

  // The source profile lists 21 years; verify this value before publishing.
  experience: 21,

  // Primary/base location retained for existing profile and search compatibility.
  location: "Ghansoli, Navi Mumbai, Maharashtra, India",

  // Only the currently listed service area is included.
  // Coordinates mark an approximate locality centre, not an exact address or boundary.
  serviceAreas: [
    {
      id: "ghansoli",
      name: "Ghansoli",
      address: "Ghansoli, Navi Mumbai, Maharashtra, India",
      lat: 19.1255,
      lng: 73.0059,
    },
  ],

  // Confirm the spoken languages directly before publishing.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID only when the video belongs to this Pandit
  // and permission to display it has been confirmed.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Retain only the ceremony types listed in the supplied profile.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave blank until a specific, verifiable affiliation is supplied.
  associatedWith: "",

  about:
    "Badri Prasad Guruji is listed on DivyaDhara as a Hindu Pandit Ji based in Ghansoli, Navi Mumbai, Maharashtra. Devotees looking for a Pandit for a home puja or traditional Hindu ceremony can enquire about the rituals listed on this profile, including Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. The exact vidhi, mantra or paath, and suitability for a particular occasion should be discussed with the Pandit before the ceremony is arranged.\n\nGhansoli, Navi Mumbai is the currently listed service area. The map marker is an approximate locality-centre reference for orientation; it is not an exact address or a verified service boundary. Do not assume that nearby localities are covered unless Badri Prasad Guruji confirms the venue or PIN code. When enquiring, share the ceremony you need, preferred date or muhurat, full locality or PIN code, language preference and any family or sampradaya requirements.\n\nBefore confirming a booking, ask about the ceremony sequence, expected duration, samagri list and who will arrange the materials, dakshina, any travel charges and the Pandit’s availability for the requested date. The profile currently lists Hindi, Sanskrit and Marathi, and 21 years of experience; these details should be confirmed directly before relying on them. An enquiry does not itself confirm availability or finalise a booking.",

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

export default badriPrasadGuruji;
