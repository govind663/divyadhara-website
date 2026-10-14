export type PanditService = {
  name: string;
  duration: string;
};

export type Pandit = {
  slug: string;
  name: string;
  title: string;
  photo: string;
  experience: number;
  location: string;
  languages: string[];
  specializations: string[];
  pujaTypes: string[];
  associatedWith: string;
  about: string;
  services: PanditService[];
  availability: string;
  authorizedContact: boolean;

  // Optional YouTube video ID for Pandit Story
  storyVideoId?: string;
};