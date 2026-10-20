import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

export const sushilTripathi: Pandit = {
  slug: "sushil-tripathi",

  name: "Sushil Tripathi",

  title: "Experienced Hindu Pandit Ji",

  photo: "/pandits_profile_img/Sushil Tripathy Guruji.jpeg",

  // Experience as currently listed in the profile; verify before publishing.
  experience: 27,

  location: "Mumbai, Maharashtra, India",

  languages: ["Hindi", "Sanskrit", "Marathi"],

  /*
   * PANDIT STORY VIDEO
   * Set this only after the actual YouTube video ID is confirmed.
   * Keep blank to hide the Story button under the existing page logic.
   */
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Confirm each ceremony with the Pandit before accepting a booking.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
    "Griha Pravesh Puja",
    "Navgraha Shanti Puja",
    "Puja and Vedic Rituals",
  ],

  // Approximate Mumbai city-centre marker, not an exact address or service boundary.
  serviceAreas: [
    {
      id: "mumbai",
      name: "Mumbai",
      address: "Mumbai, Maharashtra, India",
      lat: 19.0760,
      lng: 72.8777,
    },
  ],

  // Leave empty until an association is verified.
  associatedWith: "",

  about:
    "Pandit Sushil Tripathi is listed on Divya Dhara as an experienced Hindu Pandit Ji serving devotees who enquire about traditional puja ceremonies in Mumbai, Maharashtra. His profile currently lists 27 years of experience and services related to Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja, Pitru-related rituals, Griha Pravesh Puja and Navgraha Shanti Puja. Families looking for a Pandit Ji in Mumbai can share their ceremony requirements to enquire about the appropriate ritual and possible appointment. The experience and service details should be confirmed with the Pandit before a booking is finalized.\n\nFor a useful enquiry, share your preferred puja or sanskar, date and muhurat (if known), Mumbai locality or PIN code, ceremony venue, preferred language, and any family or regional customs that need to be considered. Mention whether you have already arranged the puja samagri or would like to discuss the requirements in advance. These details can help clarify the ceremony preparation and whether the requested appointment can be considered; submitting an enquiry does not itself confirm a booking.\n\nBefore confirming, discuss the exact vidhi and ceremony requirements, samagri responsibilities, expected duration, dakshina, travel or other applicable charges, venue coverage and final availability directly with the Pandit. The puja list on this profile is provided for enquiry purposes and should not be treated as confirmation that every listed ritual is available for every date or location. The map marker represents an approximate point in Mumbai city and is not an exact address or a defined service boundary.",

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
    {
      name: "Griha Pravesh Puja",
      duration: "To be confirmed",
    },
    {
      name: "Navgraha Shanti Puja",
      duration: "To be confirmed",
    },
    {
      name: "Puja and Vedic Rituals",
      duration: "To be confirmed",
    },
  ],

  availability: "Monday, Tuesday, Wednesday, Thursday, Friday and Saturday, 9:00 AM to 6:00 PM (IST)",

  // Keep false until contact details and authorization are verified.
  authorizedContact: false,
};

// Shared website-wide puja catalogue. This does not imply that
// Sushil Tripathi performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default sushilTripathi;
