import type { Pandit } from "../types/pandit";
import { PUJA_CATEGORIES } from "../common/puja-catalogue";

const puneetMishra: Pandit = {
  slug: "puneet-mishra",

  name: "Pandit Puneet Guruji",

  title: "Hindu Pandit Ji",

  // Confirm that this exact filename exists in public/pandits_profile_img/.
  photo: "/pandits_profile_img/Puneet Mishra.jpeg",

  // Years of experience as supplied in the profile; verify before publishing.
  experience: 5,

  // Retained as the supplied legacy location string for existing consumers.
  location: "Kalyan-Dombivli, Thane, Mumbai City & Suburban, Navi Mumbai, Panvel, Palghar.",

  // Listed service coverage. Coordinates are approximate area-centre markers,
  // not exact addresses or service-boundary polygons. Confirm coverage with the Pandit.
  serviceAreas: [
    {
      id: "kalyan-dombivli",
      name: "Kalyan-Dombivli",
      address: "Kalyan-Dombivli, Thane, Maharashtra, India",
      lat: 19.2403,
      lng: 73.1305,
    },
    {
      id: "thane",
      name: "Thane",
      address: "Thane, Maharashtra, India",
      lat: 19.2183,
      lng: 72.9781,
    },
    {
      id: "mumbai-city-suburban",
      name: "Mumbai City & Suburban",
      address: "Mumbai City and Mumbai Suburban districts, Maharashtra, India",
      lat: 19.076,
      lng: 72.8777,
    },
    {
      id: "navi-mumbai",
      name: "Navi Mumbai",
      address: "Navi Mumbai, Maharashtra, India",
      lat: 19.033,
      lng: 73.0297,
    },
    {
      id: "panvel",
      name: "Panvel",
      address: "Panvel, Raigad, Maharashtra, India",
      lat: 18.9894,
      lng: 73.1175,
    },
    {
      id: "palghar",
      name: "Palghar",
      address: "Palghar, Maharashtra, India",
      lat: 19.6967,
      lng: 72.7655,
    },
  ],

  // Confirm languages spoken before publishing the profile.
  languages: ["Hindi", "Sanskrit", "Marathi", "Gujarati", "Tamili", "Telugu"],

  // Add a verified YouTube video ID when one is provided.
  // Keep blank until then so the Story button remains hidden.
  storyVideoId: "",

  specializations: [
    "Satyanarayan Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  // Currently listed services. Add other ceremonies only after confirming
  // the Pandit's relevant expertise.
  pujaTypes: [
    "Satyanarayan Katha and Puja",
    "Rudrabhishek",
    "Havan",
    "Vastu Shanti Puja",
    "Ganesh Puja",
    "Pitru-related Rituals",
  ],

  associatedWith: "",

  about:
    "Pandit Puneet Guruji is listed on DivyaDhara as a Hindu Pandit offering enquiries for traditional puja and ritual services across the service areas currently listed on this profile: Kalyan-Dombivli, Thane, Mumbai City and Suburban, Navi Mumbai, Panvel and Palghar, Maharashtra. The map points are approximate area-centre references intended to help visitors understand the listed regions; they are not exact addresses or guaranteed service boundaries, so confirm coverage for your specific locality or PIN code before booking.\n\nThe ceremonies currently listed for enquiry include Satyanarayan Katha and Puja, Rudrabhishek, Havan, Vastu Shanti Puja, Ganesh Puja and Pitru-related Rituals. To help assess the request, share the purpose of the ceremony, preferred date and muhurat if applicable, venue locality or PIN code, preferred language, family or sampradaya requirements and any specific ritual expectations. These details can help clarify whether the requested service and location can be accommodated.\n\nBefore finalising a booking, confirm the prescribed vidhi or paath, expected duration, samagri list and who will arrange the materials, dakshina, travel charges for the venue, language availability and appointment timing. Experience, languages and actual service coverage should be verified directly; the enquiry itself does not confirm an appointment. Additional ceremonies or locations should be added to this profile only after they are confirmed with the Pandit.",

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

// Shared website-wide puja catalogue. This does not imply that Puneet Mishra
// performs every ceremony listed in the catalogue.
export { PUJA_CATEGORIES };

export default puneetMishra;
