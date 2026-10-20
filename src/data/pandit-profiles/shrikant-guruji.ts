import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const shrikantGuruji: Pandit = {
  slug: "shrikant-guruji",

  name: "Shrikant Guruji",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Shrikant Guruji.jpeg",

  // Confirm the listed experience before publishing.
  experience: 15,

  // Primary/base location retained for compatibility with existing filters.
  location: "Mumbai, Maharashtra, India",

  // Approximate city-centre marker, not an exact address or verified service boundary.
  serviceAreas: [
    {
      id: "mumbai",
      name: "Mumbai",
      address: "Mumbai, Maharashtra, India",
      lat: 19.0760,
      lng: 72.8777,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add only a verified YouTube video ID; an empty ID keeps the Story button hidden.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only the services currently listed for this profile are included.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // No confirmed institutional association was supplied.
  associatedWith: "",

  about: `Shrikant Guruji is listed on DivyaDhara as an Experienced Hindu Pandit Ji based in Mumbai, Maharashtra. The profile currently lists Mumbai as the service area; the map marker is an approximate city-centre reference and does not represent an exact address or guarantee coverage in every locality. Devotees looking for a Pandit in Mumbai can enquire about the services currently listed on this profile, including Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals.

To help check whether the requested ceremony is suitable, share the puja or ritual required, preferred date and muhurat (if applicable), venue locality or PIN code, language preference and any family or sampradaya requirements. This information helps the team direct the enquiry and check service coverage before arrangements are discussed.

Before confirming a booking, please verify the exact locality served, prescribed vidhi or path, samagri list and who will arrange it, expected duration, dakshina and any travel charges, plus appointment availability. The listed experience and languages should also be confirmed directly. Availability and booking are not confirmed until the details have been agreed with the Pandit or coordinating team. Additional pujas or service locations should be added to this profile only after they are verified.`,

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

// Shared website-wide puja catalogue. This does not imply that Shrikant Guruji
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default shrikantGuruji;
