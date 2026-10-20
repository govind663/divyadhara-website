import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const aniketKisanJaggamGuruji: Pandit = {
  slug: "aniket-kisan-jaggam-guruji",

  name: "Aniket Kisan Jaggam Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Aniket_Kisan_Jaggam_Guruji.jpg",

  // The supplied source lists 5 years; verify this detail before publishing.
  experience: 5,

  // Primary/base location retained for existing website functionality.
  location: "Ghansoli, Navi Mumbai, Maharashtra, India",

  // Only the supplied Ghansoli service area is listed. Coordinates are an
  // approximate locality-centre marker, not an exact address or service boundary.
  serviceAreas: [
    {
      id: "ghansoli-navi-mumbai",
      name: "Ghansoli",
      address: "Ghansoli, Navi Mumbai, Maharashtra, India",
      lat: 19.1252,
      lng: 73.0004,
    },
  ],

  // Verify the languages spoken directly before relying on them for a booking.
  languages: ["Hindi", "Sanskrit", "Marathi"],

  // Add an actual, verified YouTube video ID when one is provided.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Keep the puja list aligned with the ceremonies supplied for this profile.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Empty until a real association is confirmed; avoids displaying a placeholder.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit Ji for a puja or traditional Hindu ritual in Ghansoli, Navi Mumbai, Maharashtra? Aniket Kisan Jaggam Guruji is listed on DivyaDhara with Ghansoli as his currently listed service area. Devotees can enquire about Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related rituals. These are the ceremonies listed on this profile; the exact vidhi and any additional rites should be confirmed directly before booking. When sending an enquiry, share the occasion, preferred date or muhurat, complete venue address or PIN code, language preference, family tradition and any specific ritual requirements. Ghansoli, Navi Mumbai is the only service area currently listed for this profile. Availability in nearby localities or other parts of Navi Mumbai should be confirmed rather than assumed, and the map marker represents an approximate locality-centre reference—not an exact address or a verified service boundary. Before confirming a ceremony, ask about the prescribed procedure, expected duration, samagri list and who will arrange the items, dakshina, possible travel charges and the final appointment time. The profile lists 5 years of experience and Hindi, Sanskrit and Marathi; please verify these details and language preference directly with the Pandit Ji. The listed enquiry hours are Monday through Saturday, 9:00 AM to 6:00 PM (IST); an enquiry during these hours does not itself confirm a puja appointment. DivyaDhara visitors can use the profile enquiry to share their requirements and request confirmation of coverage, arrangements and availability before finalising a booking.",

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

  // Keep false until contact authorization is verified through the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default aniketKisanJaggamGuruji;
