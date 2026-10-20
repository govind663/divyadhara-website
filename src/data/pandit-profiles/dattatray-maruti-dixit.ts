import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const dattatrayMarutiDixit: Pandit = {
  slug: "dattatray-maruti-dixit",

  name: "Dattatray Maruti Dixit",

  title: "Astrologer & Vastu Consultant",

  // Confirm that this exact image filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Dattatray_Maruti_Dixit.jpg",

  // Verify this value with the consultant before publishing.
  experience: 17,

  // Primary/base location retained for profile compatibility.
  location: "Chembur (East), Mumbai, Maharashtra, India",

  // Locality-level marker for the profile map; it is not an exact address
  // or a verified boundary for the full area served.
  serviceAreas: [
    {
      id: "chembur-east",
      name: "Chembur (East)",
      address: "Chembur (East), Mumbai, Maharashtra, India",
      lat: 19.0522,
      lng: 72.9023,
    },
  ],

  // Confirm the languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add a verified YouTube video ID only when the video belongs to this
  // consultant and permission to use it has been confirmed.
  storyVideoId: "",

  specializations: [
    "Astrology Consultation",
    "Vastu Consultation",
  ],

  // No individual puja types were specified in the supplied profile.
  // Keep empty until specific ceremonies are confirmed with the consultant.
  pujaTypes: [],

  associatedWith: "Dharmik Vidhi Kendra",

  about:
    "Looking for an astrology consultation or Vastu consultant in Chembur (East), Mumbai? Dattatray Maruti Dixit is listed on DivyaDhara as an Astrologer & Vastu Consultant associated with Dharmik Vidhi Kendra. The profile currently lists Chembur (East), Mumbai, Maharashtra, as the service-area location; the map marker is an approximate locality reference and does not represent an exact address or a verified service boundary.\n\nFor a useful enquiry, share whether you need an astrology consultation or Vastu consultation, your preferred appointment date and time, the locality or PIN code, and the main questions or property-related requirements you would like to discuss. Please confirm directly whether the consultation is available in person or remotely, what information or documents may be needed, the expected duration, consultation charges, and the next available appointment.\n\nThe profile currently lists Astrology Consultation and Vastu Consultation only; specific puja ceremonies have not been listed. Exact service coverage outside Chembur (East), the listed 17 years of experience, spoken languages, consultation process and availability should be verified with the consultant before booking. Sending an enquiry does not itself confirm an appointment.",

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

  availability: "Monday, Tuesday, Wednesday, Thursday, Friday and Saturday, 9:00 AM to 6:00 PM (IST)",

  // Keep false until contact details and authorization are verified in the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that this consultant
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default dattatrayMarutiDixit;
