import type { DatePrecision, EditionType, GenreFamily, ItemCondition, Release, Zone } from './types';

export const ZONES: { value: Zone; label: string }[] = [
  { value: 'PAL', label: 'Europe (PAL)' },
  { value: 'NTSC-U', label: 'Amérique (NTSC-U)' },
  { value: 'NTSC-J', label: 'Japon (NTSC-J)' },
  { value: 'region_free', label: 'Sans zone' },
];

export function zoneLabel(zone: Zone | null): string {
  return ZONES.find((z) => z.value === zone)?.label ?? 'Région à compléter';
}

// Ordre d'affichage des sorties : Japon, Amérique, Europe, puis le reste
export function zoneOrder(zone: Zone | null): number {
  return ({ 'NTSC-J': 0, 'NTSC-U': 1, PAL: 2, region_free: 3 } as Record<string, number>)[zone ?? ''] ?? 4;
}

export const EDITION_TYPES: { value: EditionType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'reissue', label: 'Réédition (Platinum, Greatest Hits, The Best…)' },
  { value: 'collector', label: 'Collector' },
  { value: 'demo', label: 'Démo' },
  { value: 'promo', label: 'Promo' },
  { value: 'bundle', label: 'Bundle' },
];

// « Black Label » : nom donné par les collectionneurs à l'édition standard PS1 / PS2
export function editionLabel(release: Pick<Release, 'edition_type' | 'edition_name'> & { platform: { short_name: string } }): string {
  if (release.edition_name) return release.edition_name;
  if (release.edition_type === 'standard') {
    return ['PS1', 'PS2'].includes(release.platform.short_name) ? 'Black Label' : 'Standard';
  }
  return EDITION_TYPES.find((e) => e.value === release.edition_type)?.label.split(' (')[0] ?? release.edition_type;
}

export const CONDITIONS: { value: ItemCondition; label: string }[] = [
  { value: 'sealed', label: 'Neuf sous blister' },
  { value: 'very_good', label: 'Très bon état' },
  { value: 'good', label: 'Bon état' },
  { value: 'fair', label: 'État moyen' },
  { value: 'poor', label: 'Mauvais état' },
];

export function conditionLabel(condition: ItemCondition | null): string {
  return CONDITIONS.find((c) => c.value === condition)?.label ?? '';
}

export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'de', label: 'Allemand' },
  { value: 'es', label: 'Espagnol' },
  { value: 'it', label: 'Italien' },
  { value: 'nl', label: 'Néerlandais' },
  { value: 'pt', label: 'Portugais' },
  { value: 'sv', label: 'Suédois' },
  { value: 'ja', label: 'Japonais' },
  { value: 'ko', label: 'Coréen' },
  { value: 'zh', label: 'Chinois' },
  { value: 'da', label: 'Danois' },
  { value: 'fi', label: 'Finnois' },
  { value: 'no', label: 'Norvégien' },
  { value: 'pl', label: 'Polonais' },
  { value: 'ru', label: 'Russe' },
];

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// « 1997-01-31 » + précision → « 31 janvier 1997 », « janvier 1997 » ou « 1997 »
export function formatDate(date: string | null, precision: DatePrecision | null): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00Z`);
  if (precision === 'year') return String(d.getUTCFullYear());
  if (precision === 'month') return monthFormat.format(d);
  return dayFormat.format(d);
}

export function yearOf(date: string | null): string {
  return date ? date.slice(0, 4) : '';
}

export function formatPrice(value: number | null): string {
  return value === null ? '' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

// Pour des adresses lisibles : /jeu/12-final-fantasy-vii
export function slugify(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function gamePath(game: { id: number; title: string }): string {
  const slug = slugify(game.title);
  return `/jeu/${game.id}${slug ? `-${slug}` : ''}`;
}

// Familles de genres, dans l'ordre d'affichage des filtres
export const FAMILIES: { value: GenreFamily; label: string }[] = [
  { value: 'action', label: 'Action' },
  { value: 'adventure', label: 'Aventure' },
  { value: 'fighting', label: 'Combat' },
  { value: 'racing', label: 'Course' },
  { value: 'horror', label: 'Horreur' },
  { value: 'music', label: 'Musique et rythme' },
  { value: 'party', label: 'Party games et jeux de société' },
  { value: 'platform', label: 'Plates-formes' },
  { value: 'puzzle', label: 'Réflexion' },
  { value: 'rpg', label: 'RPG' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'sports', label: 'Sport' },
  { value: 'strategy', label: 'Stratégie' },
  { value: 'shooter', label: 'Tir' },
  { value: 'visual_novel', label: 'Visual novel' },
];

export function familyLabel(family: string): string {
  return FAMILIES.find((f) => f.value === family)?.label ?? family;
}

// Zones proposées par le catalogue et la progression, avec la tournure de phrase
export const CATALOG_ZONES: { value: Zone; label: string; phrase: string; short: string }[] = [
  { value: 'PAL', label: 'Europe (PAL)', phrase: 'en Europe (PAL)', short: 'PAL' },
  { value: 'NTSC-U', label: 'Amérique (NTSC-U)', phrase: 'en Amérique (NTSC-U)', short: 'NTSC-U' },
  { value: 'NTSC-J', label: 'Japon (NTSC-J)', phrase: 'au Japon (NTSC-J)', short: 'NTSC-J' },
];

const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

// 312 sur 1 286 → « 24,3 % »
export function formatPercent(part: number, total: number): string {
  return percentFormat.format(total ? part / total : 0);
}

export const formatNumber = new Intl.NumberFormat('fr-FR').format;
