import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const dilipJoshi: Pandit = {
  slug: "dilip-joshi",

  name: "Dilip Joshi",

  title: "Hindu Pandit Ji",

  // Verify that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Dilip_Joshi.jpg",

  // The supplied source row lists 17 years; verify before presenting it as a factual claim.
  experience: 17,

  // Primary/base location retained for existing filters and profile content.
  location: "Koparkhairane, Navi Mumbai, Maharashtra, India",

  // Locality-level marker based on the supplied base location.
  // Confirm actual service coverage with the Pandit before publishing.
  // Coordinates are approximate and do not describe an exact address or boundary.
  serviceAreas: [
    {
      id: "koparkhairane",
      name: "Koparkhairane",
      address: "Koparkhairane, Navi Mumbai, Maharashtra, India",
      lat: 19.1023,
      lng: 73.0090,
    },
  ],

  // Languages have not been supplied or verified yet.
  languages: [],

  // Add a verified YouTube video ID only when one is provided.
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

  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // No association is displayed until it is verified.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Koparkhairane, Navi Mumbai, for a traditional puja or family ritual? Dilip Joshi is listed on DivyaDhara as a Hindu Pandit Ji, with Koparkhairane, Navi Mumbai, Maharashtra, shown as the profile's locality-level reference. Visitors can enquire about the listed ceremonies: Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. These services are listed for enquiry; the exact vidhi, ceremony scope and suitability for your occasion should be confirmed directly before booking.\n\nTo help coordinate an enquiry, share the ceremony you need, preferred date or muhurat, venue locality or PIN code, language preference and any family or sampradaya requirements. The map marker for Koparkhairane is approximate and does not establish a precise address or confirm coverage in neighbouring localities. Please confirm whether the requested venue is serviceable before making arrangements.\n\nBefore finalising a booking, ask about the ritual procedure and paath, samagri list and who will arrange it, expected duration, dakshina, any travel charges, and date-specific availability. The profile currently has no verified languages entered, so confirm your preferred language directly. The listed experience should also be verified. Sending an enquiry does not itself confirm availability or complete a booking.",

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

  // Keep false until contact authorization is verified in the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default dilipJoshi;
