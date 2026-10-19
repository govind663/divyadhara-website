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
import aniketKisanJaggamGuruji from "./pandit-profiles/aniket-kisan-jaggam-guruji";
import anupShayamsundarJoshi from "./pandit-profiles/anup-shayamsundar-joshi";
import atulMahashabde from "./pandit-profiles/atul-mahashabde";
import badriPrasadGuruji from "./pandit-profiles/badri-prasad-guruji";
import dattatrayMarutiDixit from "./pandit-profiles/dattatray-maruti-dixit";
import devendraGoswamiGuruji from "./pandit-profiles/devendra-goswami-guruji";
import dilipJoshi from "./pandit-profiles/dilip-joshi";
import acharyaGorakhnath from "./pandit-profiles/acharya-gorakhnath";
import jaggamGuruji from "./pandit-profiles/jaggam-guruji";
import purohitPujariPrathaChakraborty from "./pandit-profiles/purohit-pujari-pratha-chakraborty";
import prashantMukundOakGuruji from "./pandit-profiles/prashant-mukund-oak-guruji";
import acharyaRameshShukla from "./pandit-profiles/acharya-ramesh-shukla";
import rakeshMishraShastriJi from "./pandit-profiles/rakesh-mishra-shastri-ji";
import saiprasadKulkarniGuruji from "./pandit-profiles/saiprasad-kulkarni-guruji";
import sudhakarKulkarniGuruji from "./pandit-profiles/sudhakar-kulkarni-guruji";
import yogendraGuruji from "./pandit-profiles/yogendra-guruji";

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
  aniketKisanJaggamGuruji,
  anupShayamsundarJoshi,
  atulMahashabde,
  badriPrasadGuruji,
  dattatrayMarutiDixit,
  devendraGoswamiGuruji,
  dilipJoshi,
  acharyaGorakhnath,
  jaggamGuruji,
  purohitPujariPrathaChakraborty,
  prashantMukundOakGuruji,
  acharyaRameshShukla,
  rakeshMishraShastriJi,
  saiprasadKulkarniGuruji,
  sudhakarKulkarniGuruji,
  yogendraGuruji,
];

export function getPanditBySlug(slug: string): Pandit | undefined {
  return PANDITS.find((pandit) => pandit.slug === slug);
}
