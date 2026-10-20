import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const prashantMukundOakGuruji: Pandit = {
  slug: "prashant-mukund-oak-guruji",

  name: "Prashant Mukund Oak Guruji",

  title: "Hindu Pandit Ji",

  // Verify that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Prashant_Mukund_Oak_Guruji.jpg",

  // The provided profile code lists 20 years; verify before publishing.
  experience: 20,

  // Primary/base location. The listing should display serviceAreas instead.
  location: "Navi Mumbai, Maharashtra, India",

  // Service coverage locations are shown on the listing and mapped on the profile page.
  // Coordinates point to the approximate city centre, not a boundary or an exact address.
  serviceAreas: [
    {
      id: "navi-mumbai",
      name: "Navi Mumbai",
      address: "Navi Mumbai, Maharashtra, India",
      lat: 19.0308,
      lng: 73.0199,
    },
  ],

  // Verify languages spoken before publishing the profile.
  languages: ["Hindi", "Marathi", "Sanskrit"],

  // Add a verified YouTube video ID when one is provided.
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

  // Keep empty until a genuine affiliation has been confirmed.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Navi Mumbai, Maharashtra, for a traditional puja or religious ceremony? Prashant Mukund Oak Guruji is listed on DivyaDhara with Navi Mumbai as his current service area. The profile lists Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. The map marker is an approximate city-centre reference; it does not indicate an exact address or a verified service boundary.\n\nTo enquire, share the puja or ceremony you need, your preferred date or muhurat, venue locality or PIN code, language preference and any family or sampradaya requirements. This helps clarify whether the request matches the listed services and whether the location can be covered. Navi Mumbai is the only service area currently listed on this profile; coverage in other localities should be confirmed before making arrangements.\n\nBefore confirming a booking, ask about the prescribed vidhi, puja duration, samagri list and who will arrange it, dakshina, any travel charges, and availability for your chosen date and time. The profile lists Hindi, Marathi and Sanskrit, and 20 years of experience; please confirm these details directly before relying on them. Sending an enquiry is not a booking confirmation.",

  services: [
    { name: "Satyanarayan Katha and Puja", duration: "To be confirmed" },
    { name: "Rudrabhishek", duration: "To be confirmed" },
    { name: "Havan", duration: "To be confirmed" },
    { name: "Vastu Shanti Puja", duration: "To be confirmed" },
    { name: "Ganesh Puja", duration: "To be confirmed" },
    { name: "Pitru-related Rituals", duration: "To be confirmed" },
  ],

  availability: "Monday, Tuesday, Wednesday, Thursday, Friday and Saturday, 9:00 AM to 6:00 PM (IST)",

  // Keep false until contact authorization is verified in the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue; this does not imply this Pandit performs every item.
export { PUJA_CATEGORIES };

export default prashantMukundOakGuruji;
