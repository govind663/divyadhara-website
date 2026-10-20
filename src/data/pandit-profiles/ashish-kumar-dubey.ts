import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const ashishKumarDubey: Pandit = {
  slug: "ashish-kumar-dubey",

  name: "Ashish Kumar Dubey",

  title: "Experienced Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Ashish Kumar Dubey.jpeg",

  // Verify this experience figure with the Pandit before publishing.
  experience: 14,

  // Primary/base location retained for existing profile and search compatibility.
  location: "Mumbai, Maharashtra, India",

  // This is the currently listed service area. Coordinates indicate an
  // approximate Mumbai city-centre point, not an exact address or boundary.
  serviceAreas: [
    {
      id: "mumbai",
      name: "Mumbai",
      address: "Mumbai, Maharashtra, India",
      lat: 19.076,
      lng: 72.8777,
    },
  ],

  // Verify the languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID only when the video belongs to this Pandit
  // and permission to use it has been confirmed.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Include only ceremonies listed for this profile; confirm each before booking.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Leave empty until a verified organisation or affiliation is supplied.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Mumbai, Maharashtra, for a home puja or traditional Hindu ceremony? Ashish Kumar Dubey is listed on DivyaDhara as an Experienced Hindu Pandit Ji whom devotees can enquire with about Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. These are the services currently listed on this profile; confirm that the chosen ceremony is suitable for your occasion before booking.\n\nWhen sending an enquiry, share the occasion, preferred date or muhurat, venue and locality or PIN code, preferred language, and any family or sampradaya requirements. Mumbai, Maharashtra is the currently listed service area. The map marker is an approximate city-centre reference, not an exact address or a verified boundary; availability in a particular neighbourhood or nearby area must be confirmed directly before travel or booking arrangements are made.\n\nBefore confirming, ask about the prescribed vidhi or paath, samagri list and who will arrange the materials, expected duration, dakshina, any travel charges, and the Pandit's availability for your selected date. The profile lists Hindi, Sanskrit and Marathi; languages, experience and ceremony-specific suitability should be verified directly. An enquiry is not a booking confirmation, and additional services or service areas should only be listed after they have been verified.",

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

  // Keep false until contact details and authorization are checked and approved.
  authorizedContact: false,
};

// Shared website-wide puja catalogue.
// This does not imply that the Pandit performs every listed puja.
export { PUJA_CATEGORIES };

export default ashishKumarDubey;
