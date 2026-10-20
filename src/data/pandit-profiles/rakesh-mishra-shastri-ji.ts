import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const rakeshMishraShastriJi: Pandit = {
  slug: "rakesh-mishra-shastri-ji",

  name: "Rakesh Mishra Shastri Ji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Rakesh_Mishra_Shastri_Ji.jpg",

  // Verify the supplied experience value before publishing it as a factual claim.
  experience: 15,

  // Primary/base location retained for existing profile compatibility.
  location: "Navi Mumbai, Maharashtra, India",

  // Coordinates are approximate city-centre markers, not an exact address or service boundary.
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
  languages: ["Hindi", "Marathi", "Sanskrit"],

  // Keep blank until a verified YouTube video ID is supplied.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only ceremonies already listed in the supplied profile are included.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave empty so an unconfirmed placeholder is not shown to visitors.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Navi Mumbai, Maharashtra, for a traditional puja or family ritual? Rakesh Mishra Shastri Ji is listed on DivyaDhara as a Hindu Pandit Ji, with Navi Mumbai shown as the currently listed service area. The profile lists Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. The map marker is an approximate city-level reference and does not represent an exact address or a guaranteed service boundary.\n\n" +
    "To enquire, share the ceremony you need, preferred date or muhurat, venue locality or PIN code, language preference and any family or sampradaya requirements. This helps clarify whether the requested ritual and location are suitable before arrangements are discussed. Do not assume coverage in nearby localities unless it has been confirmed directly.\n\n" +
    "Before finalising a booking, confirm the prescribed vidhi or paath, samagri list and who will arrange the materials, expected duration, dakshina, possible travel charges and the appointment time. The listed experience, languages and availability should also be verified directly. Sending an enquiry does not automatically confirm a booking; additional ceremonies or service areas should be added to this profile only after confirmation.",

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

export default rakeshMishraShastriJi;
