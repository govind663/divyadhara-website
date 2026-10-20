import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const yogendraGuruji: Pandit = {
  slug: "yogendra-guruji",

  name: "Yogendra Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Yogendra_Guruji.jpg",

  // Verify this value with the Pandit before publishing.
  experience: 10,

  location: "Navi Mumbai, Maharashtra, India",

  // Confirm the languages spoken with the Pandit before publishing.
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

  // Approximate city-level marker; not an exact address or verified service boundary.
  serviceAreas: [
    {
      id: "navi-mumbai",
      name: "Navi Mumbai",
      address: "Navi Mumbai, Maharashtra, India",
      lat: 19.0330,
      lng: 73.0297,
    },
  ],

  // Leave empty until an affiliation is verified.
  associatedWith: "",

  about:
    "Yogendra Guruji is listed on Divya Dhara as a Hindu Pandit in Navi Mumbai, Maharashtra. Devotees can enquire about the currently listed ceremonies, including Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. This profile helps families begin an enquiry for a traditional puja; the specific ritual method and the Pandit's suitability for the requested ceremony should be discussed directly before confirming arrangements.\n\nFor a useful enquiry, share the preferred puja or ritual, proposed date and muhurat (if already selected), the venue locality or PIN code, preferred language, and any family or tradition-specific requirements. This information can help clarify whether the request can be accommodated in the required location and time. The listed Navi Mumbai map point is approximate and should not be treated as an exact address or a confirmed service-area boundary.\n\nBefore finalizing a booking, confirm the puja vidhi, samagri responsibilities, expected duration, dakshina and any applicable travel charges, along with the final date and availability. The profile lists Hindi, Marathi and Sanskrit and 10 years of experience, but these details should be verified with the Pandit before publication or reliance. Additional puja services should only be added after they have been confirmed with him.",

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

export default yogendraGuruji;
