import type { DatePrecision, Zone } from './types';
import { tr } from './i18n';

// « Suggérer une correction » : seuls les champs modifiés partent dans la proposition
// (submission.data.changes), vérifiés ensuite par la base (check_submission_correction).
export interface GameChanges {
  first_release_date?: string | null;
  first_release_precision?: DatePrecision;
  genre_ids?: number[];
  developer_ids?: number[];
}
export interface ReleaseChanges {
  zone?: Zone | null;
  product_code?: string | null;
  languages?: string[];
}
export type CorrectionChanges = GameChanges & ReleaseChanges;

// Une date connue au mois ou à l'année s'enregistre au 1er du mois, au 1er janvier
export function normalizeDate(date: string, precision: DatePrecision): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (precision === 'year') return `${date.slice(0, 4)}-01-01`;
  if (precision === 'month') return `${date.slice(0, 7)}-01`;
  return date;
}

const sameSet = (a: (string | number)[], b: (string | number)[]) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

export function gameChanges(
  current: { date: string | null; precision: DatePrecision | null; genreIds: number[]; developerIds: number[] },
  proposed: { date: string; precision: DatePrecision; genreIds: number[]; developerIds: number[] },
): GameChanges {
  const changes: GameChanges = {};
  const date = proposed.date ? normalizeDate(proposed.date, proposed.precision) : null;
  if (date !== current.date || (date !== null && proposed.precision !== current.precision)) {
    changes.first_release_date = date;
    if (date !== null) changes.first_release_precision = proposed.precision;
  }
  if (!sameSet(proposed.genreIds, current.genreIds)) changes.genre_ids = proposed.genreIds;
  if (!sameSet(proposed.developerIds, current.developerIds)) changes.developer_ids = proposed.developerIds;
  return changes;
}

export function releaseChanges(
  current: { zone: Zone | null; code: string | null; languages: string[] },
  proposed: { zone: Zone | ''; code: string; languages: string[] },
): ReleaseChanges {
  const changes: ReleaseChanges = {};
  const zone = proposed.zone || null;
  if (zone !== current.zone) changes.zone = zone;
  const code = proposed.code.trim().toUpperCase() || null;
  if (code !== (current.code ?? null)) changes.product_code = code;
  if (!sameSet(proposed.languages, current.languages)) changes.languages = proposed.languages;
  return changes;
}

// Nom de chaque champ, pour la proposition et la carte de modération
export const CORRECTION_FIELDS: Record<keyof CorrectionChanges, string> = {
  first_release_date: tr('Première sortie'),
  first_release_precision: tr('Précision de la date'),
  genre_ids: tr('Genres'),
  developer_ids: tr('Développement'),
  zone: tr('Zone'),
  product_code: tr('Code produit'),
  languages: tr('Langues'),
};

// Code produit tel que la base l'accepte (SCES-00867, SLUS-01446GH, SLES-52760/P…)
export const PRODUCT_CODE = /^[A-Z0-9][A-Z0-9 ./-]{2,29}$/;
