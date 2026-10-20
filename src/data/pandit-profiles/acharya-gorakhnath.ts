import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const acharyaGorakhnath: Pandit = {
  slug: "acharya-gorakhnath",

  name: "Acharya Gorakhnath",

  title: "Hindu Pandit Ji",

  // Verify that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Acharya_Gorakhnath.jpg",

  // The supplied profile code lists 10 years; verify before publishing.
  experience: 10,

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

  // Only ceremonies named in the supplied profile are listed here.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave empty until a real organisation, temple or sampradaya association is verified.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Navi Mumbai, Maharashtra, for a home puja or traditional Hindu ceremony? Through DivyaDhara, devotees can enquire with Acharya Gorakhnath Ji about the rituals listed on this profile, including Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. Share the occasion and family tradition so the appropriate vidhi, prayers and ceremony requirements can be discussed before booking.\n\nNavi Mumbai, Maharashtra is the service area currently listed for this profile. To help check whether the requested venue can be served, include the locality, complete venue details or PIN code, preferred date or muhurat, language preference and any specific sampradaya requirements. Do not assume that a particular locality is covered until service availability for that exact address has been confirmed; the map marker is an approximate city-level reference, not an exact address or service boundary.\n\nBefore finalising a booking, confirm the Acharya's availability, experience and spoken languages, the ritual procedure and expected duration, the samagri list and who will arrange it, dakshina and any travel charges. Sending an enquiry through DivyaDhara does not itself confirm a booking.",

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

export default acharyaGorakhnath;
