// Boîtier habituel de chaque console : forme des jaquettes affichées, cadre de
// l'appareil photo et format du recadrage. À COMPLÉTER à chaque nouvelle console
// importée (Game Boy : carré ; GameCube : proche du DVD…) ; une console absente
// prend le boîtier CD.
export type CaseFormat = 'cd' | 'dvd' | 'free';
export type BoxFormat = Exclude<CaseFormat, 'free'>;

// Largeur / hauteur du recto : boîtier CD 120 × 120 mm, boîtier DVD 135 × 190 mm
export const CASE_RATIO: Record<BoxFormat, number> = { cd: 1, dvd: 135 / 190 };

const CASE_BY_PLATFORM: Record<string, BoxFormat> = {
  PS1: 'cd',
  PS2: 'dvd',
};

// Boîtier d'une console connue, sinon rien (la forme suivra alors l'image)
export function platformCase(platform?: string | null): BoxFormat | null {
  return CASE_BY_PLATFORM[platform ?? ''] ?? null;
}

// Une édition collector ou un bundle n'a pas forcément le boîtier standard : sans cadre
export function caseFormatFor(platform?: string | null, editionType?: string | null): CaseFormat {
  if (editionType === 'collector' || editionType === 'bundle') return 'free';
  return platformCase(platform) ?? 'cd';
}
