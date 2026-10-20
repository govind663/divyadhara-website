import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const anupShayamsundarJoshi: Pandit = {
  slug: "anup-shayamsundar-joshi",

  name: "Anup Shayamsundar Joshi",

  title: "Hindu Pandit Ji",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Anup_Shayamsundar_Joshi.jpg",

  // The supplied profile lists 17 years; verify this value before publishing.
  experience: 17,

  // Primary/base location retained for existing profile and location logic.
  location: "Ghansoli, Navi Mumbai, Maharashtra, India",

  // Ghansoli is the only currently listed service area.
  // Coordinates are an approximate locality-centre marker, not an exact address
  // or a verified boundary for the full service area.
  serviceAreas: [
    {
      id: "ghansoli-navi-mumbai",
      name: "Ghansoli",
      address: "Ghansoli, Navi Mumbai, Maharashtra, India",
      lat: 19.1250,
      lng: 73.0050,
    },
  ],

  // Confirm the languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID when one is provided.
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

  // Keep the supplied ceremony list aligned with the services below.
  pujaTypes: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave blank until a real association is confirmed; this avoids showing
  // a placeholder such as "To be confirmed" on the public profile.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Ghansoli, Navi Mumbai, Maharashtra, for a traditional puja or family ritual? Anup Shayamsundar Joshi is listed on DivyaDhara as a Hindu Pandit Ji whose profile currently lists Ghansoli as the service area. Devotees can enquire about the ceremonies listed on this profile, including Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. The map marker indicates an approximate locality-centre location for orientation; it is not an exact address or a verified service boundary. Before arranging a ceremony, share the puja or occasion, preferred date and muhurat (if required), venue or locality, PIN code, language preference and any family or sampradaya requirements. Confirm directly whether the requested ceremony and exact venue can be served, which vidhi or paath will be performed, the expected duration, the samagri list and who will arrange it, dakshina, any travel charges and the final availability. The profile currently does not confirm coverage outside Ghansoli, and no additional locality should be assumed to be covered without confirmation. Experience details and spoken languages should also be verified with the Pandit before relying on them for a booking. Sending an enquiry through DivyaDhara does not itself confirm an appointment or booking.",

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

  availability: "Monday, Tuesday, Wednesday, Thursday, Friday and Saturday, 9:00 AM to 6:00 PM (IST)",

  // Keep false until contact authorization is verified in the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default anupShayamsundarJoshi;
