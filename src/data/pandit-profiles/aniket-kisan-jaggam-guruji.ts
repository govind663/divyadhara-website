import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const aniketKisanJaggamGuruji: Pandit = {
  slug: "aniket-kisan-jaggam-guruji",

  name: "Aniket Kisan Jaggam Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  // The source list says a photo was provided by the Pandit.
  photo: "/pandits_profile_img/Aniket_Kisan_Jaggam_Guruji.jpg",

  // TODO: Replace this schema-safe placeholder with the actual years of experience.
  // Experience was not included in the source row; do not publish `0` as a factual claim.
  experience: 5,

  location: "Ghansoli, Navi Mumbai, Maharashtra, India",

  // TODO: Confirm the languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   *
   * Add an actual YouTube video ID when one is provided and verified.
   * Keep this blank until then so the Story button remains hidden.
   */
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only the ceremonies named in the source information are listed here.
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
    "Aniket Kisan Jaggam Guruji is a Hindu Pandit Ji based in Ghansoli, Navi Mumbai, Maharashtra. His listed service areas include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Years of experience, language preferences, ritual procedures, samagri requirements, service duration, pricing and availability should be confirmed before a booking is finalized. Additional ceremonies should be added only after they are confirmed with the Pandit.",

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

export default aniketKisanJaggamGuruji;
