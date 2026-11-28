// Ce que le site sait de chaque console, au-delà de la table platform : le boîtier
// habituel (forme des jaquettes affichées, cadre de l'appareil photo, format du
// recadrage) et le nom que les collectionneurs donnent à l'édition standard.
// À COMPLÉTER à chaque nouvelle console importée (Game Boy : carré ; GameCube : proche
// du DVD…) : c'est le seul endroit du site à toucher. Une console absente prend le
// boîtier CD et l'édition « Standard ».
import { tr } from './i18n';

export type CaseFormat = 'cd' | 'dvd' | 'carton' | 'carton-jp' | 'carton-snes' | 'carton-sfc' | 'carton-gb' | 'carton-gb-jp' | 'disquette' | 'boitier-md' | 'carton-n64-jp' | 'carton-gba-jp' | 'carton-multitap' | 'free';
export type BoxFormat = Exclude<CaseFormat, 'free'>;

// Largeur / hauteur du recto : boîtier CD 120 × 120 mm, boîtier DVD 135 × 190 mm, boîte en
// carton NES 127 × 178 mm (debout), boîte Famicom 142 × 98 mm (couchée, comme presque toutes
// les boîtes japonaises), étui de disquette Famicom Disk System 88 × 98 mm ; boîte Super
// Nintendo (Amérique du Nord et Europe) 179 × 127 mm, couchée, et Super Famicom 105 × 190 mm,
// haute et étroite (proportions des scans : 1,41 et 0,55) ; boîte Game Boy presque carrée
// (Amérique du Nord, Europe : 125 × 125 mm, la même pour la Game Boy Color) et en hauteur au Japon (98 × 114 mm, 0,86) ;
// boîtier en plastique de la Mega Drive, 133 × 187 mm (les scans des trois régions ont le même
// rapport, 0,71, à peu près celui d'un boîtier DVD) ; Nintendo 64 : la boîte couchée de la Super
// Nintendo en Amérique du Nord et en Europe (mêmes protections de collectionneurs, scans 1,43), et au
// Japon la même boîte debout (127 × 179 mm, scans 0,715) ; Game Boy Advance : la petite boîte carrée
// de la Game Boy en Amérique du Nord et en Europe (les mêmes protections de collectionneurs, 125 × 125
// mm ; scans 1,0), une petite boîte couchée au Japon (137 × 87 mm, mesures des fabricants de
// protections japonais ; scans 1,57) ; pack PlayStation avec Multitap : grande boîte
// en carton couchée, 378 × 234 mm (mesurée sur celle de Crash Team Racing)
export const CASE_RATIO: Record<BoxFormat, number> = {
  cd: 1, dvd: 135 / 190, carton: 127 / 178, 'carton-jp': 142 / 98, 'carton-snes': 179 / 127, 'carton-sfc': 105 / 190,
  'carton-gb': 1, 'carton-gb-jp': 98 / 114, disquette: 88 / 98, 'boitier-md': 133 / 187, 'carton-n64-jp': 127 / 179, 'carton-gba-jp': 137 / 87,
  'carton-multitap': 378 / 234,
};

interface ConsoleTraits {
  box: BoxFormat;
  // Boîtier des versions japonaises, s'il n'est pas le même (Famicom : la boîte en largeur)
  boxJapan?: BoxFormat;
  // « Black Label » : l'édition standard européenne et américaine (pas au Japon)
  blackLabel?: boolean;
  // Les jeux sont des cartouches, des disquettes (sinon des disques)
  cartridge?: boolean;
  diskette?: boolean;
  // Bande cartonnée glissée sur la tranche des boîtes japonaises (PlayStation)
  spineCard?: boolean;
}

const CONSOLE_TRAITS: Record<string, ConsoleTraits> = {
  PS1: { box: 'cd', blackLabel: true, spineCard: true },
  PS2: { box: 'dvd', blackLabel: true, spineCard: true },
  // NES (et Famicom, ses versions japonaises) : boîte en carton, cartouche
  NES: { box: 'carton', boxJapan: 'carton-jp', cartridge: true },
  // Famicom Disk System : la disquette dans un étui en plastique translucide
  FDS: { box: 'disquette', diskette: true },
  // Super Nintendo (et Super Famicom, ses versions japonaises) : boîte en carton couchée en
  // Amérique du Nord et en Europe, haute et étroite au Japon ; cartouche
  SNES: { box: 'carton-snes', boxJapan: 'carton-sfc', cartridge: true },
  // Game Boy : petite boîte en carton, presque carrée (en hauteur au Japon) ; cartouche
  GB: { box: 'carton-gb', boxJapan: 'carton-gb-jp', cartridge: true },
  // Game Boy Color : les mêmes petites boîtes que la Game Boy
  GBC: { box: 'carton-gb', boxJapan: 'carton-gb-jp', cartridge: true },
  // Game Boy Advance : la même boîte carrée (Amérique du Nord, Europe), couchée au Japon ; cartouche
  GBA: { box: 'carton-gb', boxJapan: 'carton-gba-jp', cartridge: true },
  // Mega Drive : boîtier en plastique qui s'ouvre comme un livre, la jaquette glissée sous une
  // pochette transparente, dans les trois régions ; cartouche
  MD: { box: 'boitier-md', cartridge: true },
  // Nintendo 64 : la boîte en carton couchée de la Super Nintendo (Amérique du Nord, Europe), debout
  // au Japon ; cartouche
  N64: { box: 'carton-snes', boxJapan: 'carton-n64-jp', cartridge: true },
};

// Boîtier d'une console connue (selon la zone de la version, si on la connaît), sinon rien
// (la forme suivra alors l'image)
export function platformCase(platform?: string | null, zone?: string | null): BoxFormat | null {
  const traits = CONSOLE_TRAITS[platform ?? ''];
  return (zone === 'NTSC-J' ? traits?.boxJapan : undefined) ?? traits?.box ?? null;
}

// L'édition standard de cette console s'appelle-t-elle « Black Label » ?
export function hasBlackLabel(platform?: string | null): boolean {
  return CONSOLE_TRAITS[platform ?? '']?.blackLabel === true;
}

// Le jeu lui-même : un disque ou une cartouche (contenu d'un exemplaire, « jeu seul »…)
export const isCartridge = (platform?: string | null): boolean => CONSOLE_TRAITS[platform ?? '']?.cartridge === true;
export const mediaName = (platform?: string | null): string =>
  (isCartridge(platform) ? tr('Cartouche') : CONSOLE_TRAITS[platform ?? '']?.diskette ? tr('Disquette') : tr('Disque'));
export const hasSpineCard = (platform?: string | null): boolean => CONSOLE_TRAITS[platform ?? '']?.spineCard === true;

// Pack PlayStation vendu avec l'adaptateur Multitap (Crash Team Racing, Speed Freaks, Le Monde
// des Bleus) : le jeu dans une grande boîte en carton couchée, 378 × 234 × 45 mm, à côté de
// l'adaptateur ; sur l'étagère, il prend la place de trois boîtiers
export function isMultitapPack(platform?: string | null, editionType?: string | null, editionName?: string | null): boolean {
  return platform === 'PS1' && editionType === 'bundle' && /multi\s*-?\s*tap/i.test(editionName ?? '');
}
export const MULTITAP_PLACES = 3;

// Une édition collector ou un bundle n'a pas forcément le boîtier standard : sans cadre (sauf
// les packs avec Multitap, tous dans la même boîte)
export function caseFormatFor(platform?: string | null, editionType?: string | null, zone?: string | null, editionName?: string | null): CaseFormat {
  if (isMultitapPack(platform, editionType, editionName)) return 'carton-multitap';
  if (editionType === 'collector' || editionType === 'bundle') return 'free';
  return platformCase(platform, zone) ?? 'cd';
}
