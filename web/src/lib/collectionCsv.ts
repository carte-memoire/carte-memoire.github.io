// Export et import d'une collection au format CSV : colonnes, reconnaissance des
// en-têtes (« Code », « Titre », « État »… quel que soit le tableur d'origine)
// et lecture des valeurs (« Très bon état », « oui », « 15,00 € », « 12/05/2024 »…).
import { CONDITIONS, acquisitionLabel, conditionLabel, editionLabel, searchKey, tradeStatusLabel } from './format';
import type { AcquisitionType, CollectionItem, ItemCondition, ItemStatus, TradeStatus, Zone } from './types';


// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------
export const EXPORT_HEADERS = [
  'id_version', 'statut', 'titre', 'jeu', 'console', 'zone', 'edition', 'code_produit', 'etat',
  'boite', 'notice', 'disque', 'spine_card', 'obtenu', 'lieu_achat', 'prix_achat', 'date_achat', 'echange', 'notes',
];

const yesNo = (value: boolean | null) => (value === null ? '' : value ? 'oui' : 'non');
const price = (value: number | null) => (value === null ? '' : Number(value).toFixed(2).replace('.', ','));

export function itemToRow(item: CollectionItem): string[] {
  const r = item.release;
  return [
    String(r.id), item.status === 'owned' ? 'possédé' : 'recherché', r.local_title, r.game.title, r.platform.short_name,
    r.zone ?? '', editionLabel(r), r.product_code ?? '', conditionLabel(item.condition),
    yesNo(item.has_box), yesNo(item.has_manual), yesNo(item.has_media), yesNo(item.has_spine_card),
    acquisitionLabel(item.acquisition), item.purchase_place ?? '', price(item.purchase_price), item.purchase_date ?? '',
    tradeStatusLabel(item.trade_status), item.notes ?? '',
  ];
}

// Modèle à remplir pour qui part de zéro
export const TEMPLATE_ROWS = [
  EXPORT_HEADERS,
  ['', 'possédé', 'Final Fantasy VII', '', 'PS1', 'PAL', 'Black Label', 'SCES-00867', 'Très bon état', 'oui', 'oui', 'oui', '', "Acheté d'occasion", 'Brocante', '15,00', '2024-05-12', '', 'Disque 2 un peu rayé'],
  ['', 'possédé', 'Crash Bandicoot', '', 'PS1', 'PAL', 'Platinum', '', 'Bon état', 'oui', 'oui', 'oui', '', '', '', '', '', 'À échanger', ''],
  ['', 'recherché', 'Vagrant Story', '', 'PS1', 'PAL', '', '', '', '', '', '', '', '', '', '', '', '', ''],
];


// ---------------------------------------------------------------------
// Import : reconnaissance des colonnes
// ---------------------------------------------------------------------
export type Field =
  | 'release_id' | 'status' | 'title' | 'game' | 'platform' | 'zone' | 'edition' | 'code' | 'condition'
  | 'has_box' | 'has_manual' | 'has_media' | 'has_spine_card' | 'acquisition' | 'purchase_place'
  | 'purchase_price' | 'purchase_date' | 'trade_status' | 'notes';

// En-têtes acceptés, sans accents ni ponctuation (« Lieu d'achat » → « lieudachat »)
const ALIASES: Record<Field, string[]> = {
  release_id: ['idversion', 'releaseid'],
  status: ['statut', 'status'],
  title: ['titre', 'title', 'nom', 'name', 'titredujeu'],
  game: ['jeu', 'game'],
  platform: ['console', 'plateforme', 'platform', 'systeme'],
  zone: ['zone', 'region'],
  edition: ['edition', 'version'],
  code: ['codeproduit', 'code', 'serial', 'reference', 'ref', 'productcode'],
  condition: ['etat', 'condition'],
  has_box: ['boite', 'boitier', 'box'],
  has_manual: ['notice', 'manuel', 'manual'],
  has_media: ['disque', 'disc', 'cd', 'support'],
  has_spine_card: ['spinecard', 'spine', 'obi'],
  acquisition: ['obtenu', 'acquisition', 'provenance', 'neufoccasion'],
  purchase_place: ['lieuachat', 'lieudachat', 'lieu', 'boutique', 'magasin', 'ou'],
  purchase_price: ['prixachat', 'prixdachat', 'prix', 'price', 'paye', 'cout'],
  purchase_date: ['dateachat', 'datedachat', 'date', 'purchasedate'],
  trade_status: ['echange', 'trade', 'avendre', 'vente'],
  notes: ['notes', 'note', 'commentaire', 'commentaires', 'remarque', 'remarques'],
};

export const FIELD_LABELS: Record<Field, string> = {
  release_id: 'Identifiant', status: 'Statut', title: 'Titre', game: 'Jeu', platform: 'Console', zone: 'Zone',
  edition: 'Édition', code: 'Code produit', condition: 'État', has_box: 'Boîte', has_manual: 'Notice', has_media: 'Disque',
  has_spine_card: 'Spine card', acquisition: 'Obtenu', purchase_place: "Lieu d'achat", purchase_price: 'Prix',
  purchase_date: "Date d'achat", trade_status: 'Échange', notes: 'Notes',
};

export type ColumnMap = Partial<Record<Field, number>>;

export function mapColumns(header: string[]): ColumnMap {
  const keys = header.map(searchKey);
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
    const index = keys.findIndex((key, i) => !used.has(i) && aliases.includes(key));
    if (index >= 0) {
      map[field] = index;
      used.add(index);
    }
  }
  return map;
}

// Pour retrouver un jeu, il faut au moins un identifiant, un code ou un titre
export const canMatch = (map: ColumnMap) => ['release_id', 'code', 'title', 'game'].some((f) => map[f as Field] !== undefined);


// ---------------------------------------------------------------------
// Import : lecture des valeurs
// (undefined = valeur présente mais non reconnue : elle est ignorée et signalée)
// ---------------------------------------------------------------------
function parseZone(value: string): Zone | null | undefined {
  const k = searchKey(value);
  if (!k) return null;
  if (['pal', 'eu', 'eur', 'fr', 'france', 'uk'].includes(k) || k.startsWith('europe')) return 'PAL';
  if (['ntscu', 'usa', 'us', 'na'].includes(k) || k.startsWith('amerique') || k.startsWith('northamerica')) return 'NTSC-U';
  if (['ntscj', 'jp', 'jap', 'japan'].includes(k) || k.startsWith('japon')) return 'NTSC-J';
  return undefined;
}

const CONDITION_WORDS: Record<string, ItemCondition> = {
  ...Object.fromEntries(CONDITIONS.flatMap((c) => [[searchKey(c.label), c.value], [searchKey(c.value), c.value]])),
  // Libellés du site dans les deux langues : un fichier exporté en français se réimporte
  // aussi en anglais, et inversement
  neufsousblister: 'sealed', commeneuf: 'like_new', tresbonetat: 'very_good', bonetat: 'good', etatmoyen: 'fair', mauvaisetat: 'poor',
  newsealed: 'sealed', sealed: 'sealed', resealed: 'resealed', verygood: 'very_good', good: 'good', fair: 'fair', poor: 'poor',
  neuf: 'sealed', sousblister: 'sealed', blister: 'sealed', scelle: 'sealed', neufscelle: 'sealed',
  rebliste: 'resealed', reblister: 'resealed',
  quasineuf: 'like_new', mint: 'like_new', likenew: 'like_new',
  tresbon: 'very_good', tbe: 'very_good', excellent: 'very_good',
  bon: 'good', be: 'good',
  moyen: 'fair', correct: 'fair', abe: 'fair', assezbonetat: 'fair',
  mauvais: 'poor', abime: 'poor',
};

function parseCondition(value: string): ItemCondition | null | undefined {
  const k = searchKey(value);
  return k ? CONDITION_WORDS[k] : null;
}

function parseBool(value: string): boolean | null | undefined {
  if (/^[✓✔☑]$/.test(value.trim())) return true;
  const k = searchKey(value);
  if (!k) return null;
  if (['oui', 'o', 'yes', 'y', 'x', '1', 'true', 'vrai', 'ok'].includes(k)) return true;
  if (['non', 'n', 'no', '0', 'false', 'faux'].includes(k)) return false;
  return undefined;
}

function parseAcquisition(value: string): AcquisitionType | null | undefined {
  const k = searchKey(value);
  if (!k) return null;
  if (k.includes('occasion') || k.includes('used') || k.includes('secondhand')) return 'used';
  if (k.includes('cadeau') || k.includes('offert') || k.includes('gift')) return 'gift';
  if (k.includes('echang') || k.includes('trade')) return 'trade';
  if (k.includes('neuf') || k.includes('new')) return 'new';
  return undefined;
}

function parseTrade(value: string): TradeStatus | null | undefined {
  const k = searchKey(value);
  if (!k || ['non', 'no', 'garde', 'jelegarde', 'keep', 'imkeepingit'].includes(k)) return null;
  if (k.includes('vend') || k.includes('sale')) return 'for_sale';
  if (k.includes('echang') || k.includes('trade')) return 'for_trade';
  return undefined;
}

function parseStatus(value: string): ItemStatus {
  const k = searchKey(value);
  return k.includes('recherch') || ['wanted', 'wishlist', 'souhait', 'manquant'].some((w) => k.includes(w)) ? 'wanted' : 'owned';
}

function parsePrice(value: string): number | null | undefined {
  const text = value.replace(/\s|€|eur/gi, '').replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 99999 ? Math.round(n * 100) / 100 : undefined;
}

// « 2024-05-12 », « 12/05/2024 », « 12.05.2024 » ; pas de date dans le futur
function parseDate(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return null;
  let parts: string[] | null = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) parts = [m[1], m[2], m[3]];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text))) parts = [m[3], m[2], m[1]];
  if (!parts) return undefined;
  const iso = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  const valid = !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
  return valid && iso <= new Date().toISOString().slice(0, 10) ? iso : undefined;
}


// ---------------------------------------------------------------------
// Import : une ligne du fichier
// ---------------------------------------------------------------------
export interface ImportValues {
  status: ItemStatus;
  condition: ItemCondition | null;
  has_box: boolean | null;
  has_manual: boolean | null;
  has_media: boolean | null;
  has_spine_card: boolean | null;
  acquisition: AcquisitionType | null;
  purchase_place: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  trade_status: TradeStatus | null;
  notes: string | null;
}

export interface ImportRow {
  line: number; // numéro de ligne dans le fichier, en-tête compris
  cells: string[];
  label: string; // ce que la ligne désigne, pour l'affichage
  match: { release_id?: string; code?: string; title?: string; zone?: Zone; edition?: string; platform?: string };
  values: ImportValues;
  warnings: string[];
}

export function parseRow(cells: string[], map: ColumnMap, line: number): ImportRow {
  const get = (field: Field) => (map[field] === undefined ? '' : (cells[map[field]!] ?? '').trim());
  const warnings: string[] = [];
  function read<T>(field: Field, parser: (value: string) => T | null | undefined): T | null {
    const raw = get(field);
    const value = parser(raw);
    if (value === undefined) {
      warnings.push(`${FIELD_LABELS[field]} : « ${raw} » non reconnu, ignoré`);
      return null;
    }
    return value;
  }

  const title = get('title') || get('game');
  const zone = read('zone', parseZone);
  const code = get('code');
  const place = get('purchase_place');
  const notes = get('notes');
  return {
    line,
    cells,
    label: [title, code].filter(Boolean).join(' · ') || `Identifiant ${get('release_id')}`,
    match: {
      release_id: get('release_id') || undefined,
      code: code || undefined,
      title: title || undefined,
      zone: zone ?? undefined,
      edition: get('edition') || undefined,
      platform: get('platform') || undefined,
    },
    values: {
      status: parseStatus(get('status')),
      condition: read('condition', parseCondition),
      has_box: read('has_box', parseBool),
      has_manual: read('has_manual', parseBool),
      has_media: read('has_media', parseBool),
      has_spine_card: read('has_spine_card', parseBool),
      acquisition: read('acquisition', parseAcquisition),
      purchase_place: place ? place.slice(0, 80) : null,
      purchase_price: read('purchase_price', parsePrice),
      purchase_date: read('purchase_date', parseDate),
      trade_status: read('trade_status', parseTrade),
      notes: notes ? notes.slice(0, 500) : null,
    },
    warnings,
  };
}

// Ce qui est envoyé à la base : les détails d'un exemplaire possédé ne sont
// pas gardés pour un jeu recherché (la base le refuserait)
export function toInsert(values: ImportValues, releaseId: number) {
  const owned = values.status === 'owned';
  return {
    release_id: releaseId,
    status: values.status,
    condition: owned ? values.condition : null,
    has_box: owned ? values.has_box : null,
    has_manual: owned ? values.has_manual : null,
    has_media: owned ? values.has_media : null,
    has_spine_card: owned ? values.has_spine_card : null,
    acquisition: owned ? values.acquisition : null,
    purchase_place: owned ? values.purchase_place : null,
    purchase_price: owned ? values.purchase_price : null,
    purchase_date: owned ? values.purchase_date : null,
    trade_status: owned ? values.trade_status : null,
    notes: values.notes,
  };
}
