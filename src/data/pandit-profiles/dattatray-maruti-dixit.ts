import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const dattatrayMarutiDixit: Pandit = {
  slug: "dattatray-maruti-dixit",

  name: "Dattatray Maruti Dixit",

  title: "Astrologer & Vastu Consultant",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Dattatray_Maruti_Dixit.jpg",

  // The source row did not include years of experience.
  // Replace this placeholder with a verified value before publishing.
  experience: 17,

  location: "Chembur (East), Mumbai, Maharashtra, India",

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID when one is provided.
  // Leave blank until then so the Story button remains hidden.
  storyVideoId: "",

  specializations: [
    "Astrology Consultation",
    "Vastu Consultation",
  ],

  // The supplied source row did not specify individual puja types.
  // Add them only after confirming the services offered by the consultant.
  pujaTypes: [],

  associatedWith: "Dharmik Vidhi Kendra",

  about:
    "Dattatray Maruti Dixit is listed on Divya Dhara as an astrologer and Vastu consultant associated with Dharmik Vidhi Kendra, based in Chembur (East), Mumbai, Maharashtra. Visitors can enquire about astrology and Vastu consultation by sharing their requirements and preferred appointment time. Languages, experience, consultation format, availability, duration and pricing should be confirmed before an appointment is finalized. Specific puja services have not been listed and should be added only after confirmation.",

  services: [
    {
      name: "Astrology Consultation",
      duration: "To be confirmed",
    },
    {
      name: "Vastu Consultation",
      duration: "To be confirmed",
    },
  ],

  availability: "To be confirmed",

  // Keep false until contact details and authorization are verified in the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that this consultant
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default dattatrayMarutiDixit;
