import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const saiprasadKulkarniGuruji: Pandit = {
  slug: "saiprasad-kulkarni-guruji",

  name: "Saiprasad Kulkarni Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  // The supplied source row indicates that the photo was provided by the Pandit.
  photo: "/pandits_profile_img/Saiprasad_Kulkarni_Guruji.jpg",

  // Verify the listed experience before publishing.
  experience: 20,

  // Primary/base location retained for compatibility with existing filters.
  location: "Kalyan East, Kalyan, Maharashtra, India",

  // The listed service area is Kalyan East, Kalyan. Coordinates are approximate
  // locality-centre markers, not exact addresses or service-boundary polygons.
  serviceAreas: [
    {
      id: "kalyan-east-kalyan",
      name: "Kalyan East, Kalyan",
      address: "Kalyan East, Kalyan, Maharashtra, India",
      lat: 19.2409,
      lng: 73.1450,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Marathi", "Sanskrit"],

  // Keep blank until a verified YouTube video ID is provided.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Only services stated in the supplied source row are listed here.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Do not show an unverified association placeholder on the public profile.
  associatedWith: "",

  about:
    "Looking for a Hindu Pandit in Kalyan East, Kalyan, Maharashtra, for a traditional puja or family ritual? Saiprasad Kulkarni Guruji is listed on DivyaDhara as a Hindu Pandit Ji whose profile currently lists Kalyan East, Kalyan as the service area. The map marker is an approximate locality-centre reference and should not be interpreted as an exact address or a guaranteed service boundary.\n\nThe puja services listed on this profile include Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related Rituals. When making an enquiry, share the ceremony you need, preferred date or muhurat, venue locality or PIN code, language preference and any family or sampradaya requirements. This helps clarify whether the requested ritual and location are suitable before arrangements are made.\n\nBefore confirming a booking, ask Guruji to confirm the exact vidhi or paath, expected duration, samagri list and who will arrange it, dakshina, any travel charges, and appointment availability. Additional localities or services should be displayed only after they are confirmed. The listed experience and languages should also be verified directly; submitting an enquiry does not itself confirm a booking.",

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

  // Keep false until direct-contact authorization is verified through the existing flow.
  authorizedContact: false,
};

// Shared website-wide puja catalogue; this does not imply that this Pandit
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default saiprasadKulkarniGuruji;
