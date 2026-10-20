/**
 * Individual puja or service offered by a Pandit.
 */
export type PanditService = {
  name: string;
  duration: string;
};

/**
 * A service area where a Pandit has confirmed that
 * they are available to provide services.
 *
 * Coordinates are used to place markers on the map.
 * They should represent a suitable area location,
 * not an unverified private residential address.
 */
export type PanditServiceArea = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

/**
 * Main Pandit profile type used across DivyaDhara.
 */
export type Pandit = {
  // Unique profile identifier used in routes and lookups
  slug: string;

  // Public profile information
  name: string;
  title: string;
  photo: string;
  experience: number;

  // Primary or base location retained for compatibility
  // with existing Pandit profiles and listing filters.
  location: string;

  // Confirmed service areas for listing and Google Maps.
  // Optional so existing profiles continue to work.
  serviceAreas?: PanditServiceArea[];

  // Languages and religious services
  languages: string[];
  specializations: string[];
  pujaTypes: string[];
  associatedWith: string;

  // Public profile description
  about: string;

  // Individual services offered by the Pandit
  services: PanditService[];

  // Booking and contact authorization
  availability: string;
  authorizedContact: boolean;

  // Optional YouTube video ID for Pandit Story
  storyVideoId?: string;
};