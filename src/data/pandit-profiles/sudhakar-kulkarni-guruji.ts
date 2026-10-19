import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const sudhakarKulkarniGuruji: Pandit = {
  slug: "sudhakar-kulkarni-guruji",

  name: "Sudhakar Kulkarni Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Sudhakar_Kulkarni_Guruji.jpg",

  // Years of experience were not included in the supplied source row.
  // Replace this placeholder with a verified value before publishing.
  experience: 40,

  location: "Ghansoli, Navi Mumbai, Maharashtra, India",

  // Confirm the languages spoken before publishing this profile.
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
    "Sudhakar Kulkarni Guruji is listed on Divya Dhara as a Hindu Pandit based in Ghansoli, Navi Mumbai, Maharashtra. His listed service areas include Satyanarayan Puja, Rudrabhishek, Havan, Vastu Shanti, Ganesh Puja and Pitru-related rituals. Devotees can enquire by sharing their preferred ceremony, date, location and specific requirements. Years of experience, languages, ritual procedures, samagri requirements, service duration, pricing and availability should be confirmed before a booking is finalized. Additional ceremonies should be added only after they are confirmed with the Pandit.",

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

  // Keep false until direct-contact authorization is verified through the existing flow.
  authorizedContact: false,
};

// Business onboarding note: the supplied row lists the "Basic 99" plan.
// Plan/subscription details are intentionally kept outside the public Pandit
// object because they are not part of the existing Pandit type. Configure the
// plan through the platform's subscription/business workflow instead.

// Shared website-wide puja catalogue; this does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default sudhakarKulkarniGuruji;
