import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const dilipJoshi: Pandit = {
  slug: "dilip-joshi",

  name: "Dilip Joshi",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Dilip_Joshi.jpg",

  // TODO: Replace this placeholder with the actual years of experience.
  // Experience was not included in the supplied source row.
  experience: 17,

  location: "Koparkhairane, Navi Mumbai, Maharashtra, India",

  // TODO: Confirm the languages spoken before publishing the profile.
  languages: [],

  /*
   * PANDIT STORY VIDEO
   *
   * Add a verified YouTube video ID when one is provided.
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
    "Dilip Joshi is a Hindu Pandit Ji based in Koparkhairane, Navi Mumbai, Maharashtra. His listed service areas include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Years of experience, language preferences, ritual procedures, samagri requirements, service duration, pricing and availability should be confirmed before a booking is finalized. Additional ceremonies should be added only after they are confirmed with the Pandit.",

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

export default dilipJoshi;
