import type { AcquisitionType, DatePrecision, EditionType, GenreFamily, ItemCondition, Release, ReportKind, TradeStatus, Zone } from './types';
import { tr, locale, lang } from './i18n';

export const ZONES: { value: Zone; label: string }[] = [
  { value: 'PAL', label: tr('Europe (PAL)') },
  { value: 'NTSC-U', label: tr('Amérique (NTSC-U)') },
  { value: 'NTSC-J', label: tr('Japon (NTSC-J)') },
  { value: 'region_free', label: tr('Sans zone') },
];

export function zoneLabel(zone: Zone | null): string {
  return ZONES.find((z) => z.value === zone)?.label ?? tr('Région à compléter');
}

// Ordre d'affichage des sorties : Japon, Amérique, Europe, puis le reste
export function zoneOrder(zone: Zone | null): number {
  return ({ 'NTSC-J': 0, 'NTSC-U': 1, PAL: 2, region_free: 3 } as Record<string, number>)[zone ?? ''] ?? 4;
}

export const EDITION_TYPES: { value: EditionType; label: string }[] = [
  { value: 'standard', label: tr('Standard') },
  { value: 'reissue', label: tr('Réédition (Platinum, Greatest Hits, The Best…)') },
  { value: 'collector', label: tr('Collector') },
  { value: 'demo', label: tr('Démo') },
  { value: 'promo', label: tr('Promo') },
  { value: 'bundle', label: tr('Bundle') },
];

// « Black Label » : nom donné par les collectionneurs à l'édition standard PS1 / PS2
// européenne et américaine (pas au Japon, où l'on dit simplement l'édition standard)
export function editionLabel(release: Pick<Release, 'edition_type' | 'edition_name'> & { platform: { short_name: string }; zone?: Zone | null }): string {
  if (release.edition_name) return release.edition_name;
  if (release.edition_type === 'standard') {
    return ['PS1', 'PS2'].includes(release.platform.short_name) && release.zone !== 'NTSC-J' ? tr('Black Label') : tr('Standard');
  }
  return EDITION_TYPES.find((e) => e.value === release.edition_type)?.label.split(' (')[0] ?? release.edition_type;
}

// Couleur du badge d'édition : argent pour les rééditions (Platinum…), rouge pour les
// Greatest Hits américains (leur étiquette rouge), noir pour l'édition standard
export function editionClass(release: { edition_type: string; edition_name?: string | null }): string {
  if (release.edition_type !== 'reissue') return 'badge-edition';
  return /greatest hits/i.test(release.edition_name ?? '') ? 'badge-greatest-hits' : 'badge-platinum';
}

// État d'un exemplaire, du meilleur au moins bon (échelle habituelle des collectionneurs)
export const CONDITIONS: { value: ItemCondition; label: string; hint: string }[] = [
  { value: 'sealed', label: tr('Neuf sous blister'), hint: tr("Blister d'origine, jamais ouvert") },
  { value: 'resealed', label: tr('Reblisté'), hint: tr('Sous blister, mais refait après coup (moins coté)') },
  { value: 'like_new', label: tr('Comme neuf'), hint: tr("Ouvert, aucune trace d'usure") },
  { value: 'very_good', label: tr('Très bon état'), hint: tr("Légères traces d'usage") },
  { value: 'good', label: tr('Bon état'), hint: tr('Usure visible, rayures légères') },
  { value: 'fair', label: tr('État moyen'), hint: tr('Boîte abîmée, disque rayé…') },
  { value: 'poor', label: tr('Mauvais état'), hint: tr('Fortement abîmé') },
];

export function conditionLabel(condition: ItemCondition | null): string {
  return CONDITIONS.find((c) => c.value === condition)?.label ?? '';
}

export const ACQUISITIONS: { value: AcquisitionType; label: string }[] = [
  { value: 'new', label: tr('Acheté neuf') },
  { value: 'used', label: tr("Acheté d'occasion") },
  { value: 'gift', label: tr('Reçu en cadeau') },
  { value: 'trade', label: tr('Obtenu par échange') },
];

export function acquisitionLabel(value: AcquisitionType | null): string {
  return ACQUISITIONS.find((a) => a.value === value)?.label ?? '';
}

export const TRADE_STATUSES: { value: TradeStatus; label: string }[] = [
  { value: 'for_trade', label: tr('À échanger') },
  { value: 'for_sale', label: tr('À vendre') },
];

export function tradeStatusLabel(value: TradeStatus | null): string {
  return TRADE_STATUSES.find((t) => t.value === value)?.label ?? '';
}

export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'fr', label: tr('Français') },
  { value: 'en', label: tr('Anglais') },
  { value: 'de', label: tr('Allemand') },
  { value: 'es', label: tr('Espagnol') },
  { value: 'it', label: tr('Italien') },
  { value: 'nl', label: tr('Néerlandais') },
  { value: 'pt', label: tr('Portugais') },
  { value: 'sv', label: tr('Suédois') },
  { value: 'ja', label: tr('Japonais') },
  { value: 'ko', label: tr('Coréen') },
  { value: 'zh', label: tr('Chinois') },
  { value: 'da', label: tr('Danois') },
  { value: 'fi', label: tr('Finnois') },
  { value: 'no', label: tr('Norvégien') },
  { value: 'pl', label: tr('Polonais') },
  { value: 'ru', label: tr('Russe') },
];

// Pays de la boîte : quand un même disque a eu des boîtes imprimées pour chaque pays
// (Crash Bash Platinum « boîte française », « boîte allemande »…). « europe » : boîte multi-pays.
export const BOX_REGIONS = ['europe', 'FR', 'BE', 'CH', 'LU', 'DE', 'AT', 'GB', 'IE', 'IT', 'ES', 'PT', 'NL', 'SE', 'NO', 'DK', 'FI', 'PL', 'GR', 'AU', 'NZ', 'US', 'CA', 'JP'];
export const boxRegionName = (code: string) => (code === 'europe' ? tr('Europe (multi-pays)') : countryName(code));
export const boxTag = (code: string) => (code === 'europe' ? 'EU' : code);
const COUNTRY_LANGUAGES: Record<string, string[]> = {
  FR: ['fr'], BE: ['fr', 'nl'], CH: ['fr', 'de', 'it'], LU: ['fr', 'de'], DE: ['de'], AT: ['de'], GB: ['en'], IE: ['en'],
  AU: ['en'], NZ: ['en'], US: ['en'], CA: ['en', 'fr'], IT: ['it'], ES: ['es'], PT: ['pt'], NL: ['nl'], SE: ['sv'],
  NO: ['no'], DK: ['da'], FI: ['fi'], PL: ['pl'], JP: ['ja'],
};

// La version parle-t-elle la langue choisie ? Boîte d'un pays : la langue de ce pays (une
// boîte multi-pays convient à tous) ; sinon les langues du disque (inconnues : on garde)
export function speaksLanguage(r: { languages?: string[] | null; box_country?: string | null }, language: string): boolean {
  if (r.box_country) return r.box_country === 'europe' || (COUNTRY_LANGUAGES[r.box_country] ?? []).includes(language);
  return !r.languages?.length || r.languages.includes(language);
}

// Nom d'une région de la base : un pays par son code (nom dans la langue du site), une zone traduite
export function regionName(region: { code: string; name: string }): string {
  return /^[A-Z]{2}$/.test(region.code) ? countryName(region.code) : tr(region.name);
}

// Nom d'un genre de la base (venu de Wikipédia, en français ou en anglais) : traduit s'il est connu
export const genreName = (name: string) => tr(name);

// Langues d'une version en abrégé : « FR », « EN · FR · DE », « Multi » au-delà de trois
export function languagesShort(languages: string[] | null | undefined): string {
  if (!languages?.length) return '';
  return languages.length > 3 ? tr('Multi') : languages.map((l) => l.toUpperCase()).join(' · ');
}

// Langues en toutes lettres : « Français, Anglais »
export function languagesLong(languages: string[] | null | undefined): string {
  return (languages ?? []).map((l) => LANGUAGES.find((x) => x.value === l)?.label ?? l.toUpperCase()).join(', ');
}

const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

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
  return value === null ? '' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
}

// Texte → nom de fichier ou morceau d'adresse : minuscules, sans accents ni ponctuation
export function slugify(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// Adresse d'une fiche : /jeu/ps1/final-fantasy-vii (calculée par la base, game.slug).
// Sans elle (listes qui ne la lisent pas), l'ancienne forme /jeu/36-final-fantasy-vii :
// la fiche s'ouvre et l'adresse se corrige d'elle-même.
export function gamePath(game: { id: number; title?: string; slug?: string | null }): string {
  if (game.slug) return `/jeu/${game.slug}`;
  const slug = slugify(game.title ?? '');
  return `/jeu/${game.id}${slug ? `-${slug}` : ''}`;
}

// Familles de genres, dans l'ordre d'affichage des filtres
export const FAMILIES: { value: GenreFamily; label: string }[] = [
  { value: 'action', label: tr('Action') },
  { value: 'adventure', label: tr('Aventure') },
  { value: 'fighting', label: tr('Combat') },
  { value: 'racing', label: tr('Course') },
  { value: 'horror', label: tr('Horreur') },
  { value: 'music', label: tr('Musique et rythme') },
  { value: 'party', label: tr('Société, hasard et party games') },
  { value: 'platform', label: 'Plates-formes' },
  { value: 'puzzle', label: tr('Réflexion') },
  { value: 'rpg', label: 'RPG' },
  { value: 'simulation', label: tr('Simulation') },
  { value: 'sports', label: tr('Sport') },
  { value: 'strategy', label: tr('Stratégie') },
  { value: 'shooter', label: tr('Tir') },
  { value: 'visual_novel', label: tr('Visual novel') },
];

export function familyLabel(family: string): string {
  return FAMILIES.find((f) => f.value === family)?.label ?? family;
}

// Origine d'un jeu : le pays de son studio de développement (fonction origin de la base).
// Filtre du catalogue et de la progression : studios japonais, ou d'un autre pays.
export type Origin = 'japan' | 'other';
export const ORIGINS: { value: Origin; param: string; label: string; adjective: string }[] = [
  { value: 'japan', param: 'japon', label: tr('Japon'), adjective: tr('studios japonais') },
  { value: 'other', param: 'hors-japon', label: tr('Hors Japon'), adjective: tr('hors Japon') },
];

export function originFromParam(param: string | null): Origin | null {
  return ORIGINS.find((o) => o.param === param)?.value ?? null;
}

export function originParam(origin: Origin | null): string | null {
  return ORIGINS.find((o) => o.value === origin)?.param ?? null;
}

// « JRPG », « RPG occidentaux », « Combat · studios japonais »…
export function familyOriginLabel(family: string, origin: Origin | null): string {
  if (!origin) return familyLabel(family);
  if (family === 'rpg') return origin === 'japan' ? 'JRPG' : tr('RPG occidentaux');
  return `${familyLabel(family)} · ${ORIGINS.find((o) => o.value === origin)!.adjective}`;
}

const regionNames = new Intl.DisplayNames(lang, { type: 'region' });
export function countryName(code: string): string {
  try { return regionNames.of(code) ?? code; } catch { return code; }
}

// Zones proposées par le catalogue et la progression, avec la tournure de phrase
export const CATALOG_ZONES: { value: Zone; label: string; phrase: string; short: string }[] = [
  { value: 'PAL', label: tr('Europe (PAL)'), phrase: tr('en Europe (PAL)'), short: 'PAL' },
  { value: 'NTSC-U', label: tr('Amérique (NTSC-U)'), phrase: tr('en Amérique (NTSC-U)'), short: 'NTSC-U' },
  { value: 'NTSC-J', label: tr('Japon (NTSC-J)'), phrase: tr('au Japon (NTSC-J)'), short: 'NTSC-J' },
];

const percentFormat = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });

// 312 sur 1 286 → « 24,3 % »
export function formatPercent(part: number, total: number): string {
  return percentFormat.format(total ? part / total : 0);
}

export const formatNumber = new Intl.NumberFormat(locale).format;

// Clé de recherche : sans accents, ni majuscules, ni ponctuation (« Biohazard 2 » → « biohazard2 »)
export function searchKey(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export const REPORT_KINDS: { value: ReportKind; label: string }[] = [
  { value: 'genre', label: tr('Genre') },
  { value: 'title', label: tr('Titre') },
  { value: 'release', label: tr('Version (code produit, zone, édition…)') },
  { value: 'cover', label: tr('Jaquette') },
  { value: 'duplicate', label: tr('Doublon (le jeu existe deux fois)') },
  { value: 'other', label: tr('Autre') },
];

export function reportKindLabel(kind: string): string {
  return REPORT_KINDS.find((k) => k.value === kind)?.label.split(' (')[0] ?? kind;
}

const dateTimeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
