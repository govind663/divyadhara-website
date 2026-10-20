import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const purohitPujariPrathaChakraborty: Pandit = {
  slug: "purohit-pujari-pratha-chakraborty",

  name: "Purohit Pujari Pratha Chakraborty",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  // The source row indicates that a photo was provided by the Pandit.
  photo: "/pandits_profile_img/Purohit_Pujari_Pratha_Chakraborty.jpeg",

  // Verify the listed experience before publishing.
  experience: 15,

  // Primary/base location retained for profile details and legacy filters.
  location: "Navi Mumbai, Maharashtra, India",

  // Listed service area for the directory and profile map.
  // Coordinates are approximate city-centre markers, not exact addresses or a boundary.
  serviceAreas: [
    {
      id: "navi-mumbai",
      name: "Navi Mumbai",
      address: "Navi Mumbai, Maharashtra, India",
      lat: 19.0308,
      lng: 73.0199,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Marathi", "Sanskrit", "Bengali"],

  // Add a verified YouTube video ID when one is provided.
  // Leave blank until then so the Story button remains hidden.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only ceremonies named in the source information are listed here.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Empty to avoid displaying an unverified "To be confirmed" association.
  associatedWith: "",

  about:
    "Purohit Pujari Pratha Chakraborty is listed on DivyaDhara as a Hindu Pandit Ji with a profile location in Navi Mumbai, Maharashtra. The profile currently lists Navi Mumbai as the service area and includes Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals among the ceremonies devotees can enquire about. The map marker is an approximate city-level reference; it is not an exact address or a verified boundary for all localities.\n\nTo make an enquiry, share the ceremony you need, your preferred date or muhurat, venue locality or PIN code, language preference and any family tradition or specific ritual requirements. This helps the booking team understand the request and check whether the requested arrangement is suitable. The listed ceremonies describe enquiry options only; the exact vidhi and the inclusion of additional rites should be confirmed directly before booking.\n\nBefore finalising a booking, confirm the Pandit's availability for your date and location, expected duration, samagri list and who will arrange it, dakshina, travel charges and any other ceremony-specific requirements. The listed service area should not be taken as automatic confirmation of coverage in every nearby locality. Experience and spoken languages should also be verified before relying on them for a booking. Sending an enquiry does not itself confirm an appointment.",

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

export default purohitPujariPrathaChakraborty;
