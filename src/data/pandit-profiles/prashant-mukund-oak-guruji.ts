import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const prashantMukundOakGuruji: Pandit = {
  slug: "prashant-mukund-oak-guruji",

  name: "Prashant Mukund Oak Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Prashant_Mukund_Oak_Guruji.jpg",

  // The supplied source row did not include verified years of experience.
  // Replace this placeholder with the actual value before publishing.
  experience: 20,

  location: "Navi Mumbai, Maharashtra, India",

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Marathi", "Sanskrit"],

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

  // Only ceremonies named in the supplied source row are listed here.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  associatedWith: "To be confirmed",

  about:
    "Prashant Mukund Oak Guruji is a Hindu Pandit Ji listed on Divya Dhara and based in Navi Mumbai, Maharashtra. His listed service areas include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Years of experience, languages, ritual procedures, samagri requirements, service duration, pricing and availability should be confirmed before a booking is finalized. Additional ceremonies should be added only after they are confirmed with the Pandit.",

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

  // Keep false until contact authorization is verified in the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default prashantMukundOakGuruji;
