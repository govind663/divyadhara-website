import type { Pandit } from "./types/pandit";

import sushilTripathi from "./pandit-profiles/sushil-tripathi";
import santoshAnandaPujariGuruji from "./pandit-profiles/santosh-ananda-pujari-guruji";
import shrikantGuruji from "./pandit-profiles/shrikant-guruji";
import nishantJoshi from "./pandit-profiles/nishant-joshi";
import ashishKumarDubey from "./pandit-profiles/ashish-kumar-dubey";
import gauravDwivediGuruji from "./pandit-profiles/gaurav-dwivedi-guruji";
import puneetMishra from "./pandit-profiles/puneet-mishra";
import santoshDeshpande from "./pandit-profiles/santosh-deshpande";
import rohitShukla from "./pandit-profiles/rohit-shukla";

export { PUJA_CATEGORIES, ALL_PUJA_TYPES } from "./common/puja-catalogue";

export type { Pandit, PanditService } from "./types/pandit";

export const PANDITS: Pandit[] = [
  sushilTripathi,
  santoshAnandaPujariGuruji,
  shrikantGuruji,
  nishantJoshi,
  ashishKumarDubey,
  gauravDwivediGuruji,
  puneetMishra,
  santoshDeshpande,
  rohitShukla,
];

export function getPanditBySlug(slug: string): Pandit | undefined {
  return PANDITS.find((pandit) => pandit.slug === slug);
}