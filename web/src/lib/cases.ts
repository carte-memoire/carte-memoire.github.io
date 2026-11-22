// Ce que le site sait de chaque console, au-delà de la table platform : le boîtier
// habituel (forme des jaquettes affichées, cadre de l'appareil photo, format du
// recadrage) et le nom que les collectionneurs donnent à l'édition standard.
// À COMPLÉTER à chaque nouvelle console importée (Game Boy : carré ; GameCube : proche
// du DVD…) : c'est le seul endroit du site à toucher. Une console absente prend le
// boîtier CD et l'édition « Standard ».
export type CaseFormat = 'cd' | 'dvd' | 'free';
export type BoxFormat = Exclude<CaseFormat, 'free'>;

// Largeur / hauteur du recto : boîtier CD 120 × 120 mm, boîtier DVD 135 × 190 mm
export const CASE_RATIO: Record<BoxFormat, number> = { cd: 1, dvd: 135 / 190 };

interface ConsoleTraits {
  box: BoxFormat;
  // « Black Label » : l'édition standard européenne et américaine (pas au Japon)
  blackLabel?: boolean;
}

const CONSOLE_TRAITS: Record<string, ConsoleTraits> = {
  PS1: { box: 'cd', blackLabel: true },
  PS2: { box: 'dvd', blackLabel: true },
};

// Boîtier d'une console connue, sinon rien (la forme suivra alors l'image)
export function platformCase(platform?: string | null): BoxFormat | null {
  return CONSOLE_TRAITS[platform ?? '']?.box ?? null;
}

// L'édition standard de cette console s'appelle-t-elle « Black Label » ?
export function hasBlackLabel(platform?: string | null): boolean {
  return CONSOLE_TRAITS[platform ?? '']?.blackLabel === true;
}

// Une édition collector ou un bundle n'a pas forcément le boîtier standard : sans cadre
export function caseFormatFor(platform?: string | null, editionType?: string | null): CaseFormat {
  if (editionType === 'collector' || editionType === 'bundle') return 'free';
  return platformCase(platform) ?? 'cd';
}
