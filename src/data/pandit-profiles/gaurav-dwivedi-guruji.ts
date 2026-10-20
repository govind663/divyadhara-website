import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const gauravDwivediGuruji: Pandit = {
  slug: "gaurav-dwivedi-guruji",

  name: "Gaurav Dwivedi Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Gaurav Dwivedi Guruji.jpeg",

  // The profile source lists 9 years; verify this value before publishing.
  experience: 9,

  // Primary/base location; service coverage is listed separately below.
  location: "Mumbai, Maharashtra, India",

  // The listed city marker is approximate and does not describe an exact
  // address or a verified boundary for the full service area.
  serviceAreas: [
    {
      id: "mumbai",
      name: "Mumbai",
      address: "Mumbai, Maharashtra, India",
      lat: 19.076,
      lng: 72.8777,
    },
  ],

  // Confirm the languages spoken before publishing the profile.
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

  // Only currently listed ceremonies are included. Confirm before adding more.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Keep blank until an organization/association is confirmed.
  associatedWith: "",

  about:
    "Gaurav Dwivedi Guruji is listed on DivyaDhara as a Hindu Pandit Ji based in Mumbai, Maharashtra. Devotees looking for a Pandit in Mumbai for a traditional Hindu puja can enquire about the ceremonies listed on this profile, including Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. The profile lists Mumbai as the service area, with an approximate city-centre map marker for orientation; the marker is not an exact address or a verified service boundary.\n\nTo help assess the enquiry, share the ceremony or occasion, preferred date and muhurat if applicable, venue locality or PIN code, language preference and any family or sampradaya requirements. This information can help clarify whether the requested ceremony and location fit the listed services. Locality-level coverage should be confirmed before making travel or booking arrangements; no additional Mumbai neighbourhoods are assumed to be covered unless confirmed.\n\nBefore finalising a booking, confirm the required vidhi or paath, samagri list and who will arrange the items, expected duration, dakshina, any travel charges and the appointment date and timing. The profile lists 9 years of experience and Hindi, Sanskrit and Marathi; these details should be verified directly before publication or booking. An enquiry does not itself confirm availability or complete a booking.",

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

// Shared website-wide puja catalogue. This does not mean that this Pandit
// performs every puja listed in the catalogue.
export { PUJA_CATEGORIES };

export default gauravDwivediGuruji;
