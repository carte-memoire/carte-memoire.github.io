// La pièce du collectionneur : ses meubles, dans l'ordre où il les a placés. Chacun a un nom
// (sur sa plaque), un contenu (une console, ou toutes), son aspect (ShelfStyle : meuble,
// finition, épaisseur, éclairage), un nombre d'étages et un nombre de jeux par étage — « auto »
// (0) : autant d'étages qu'il faut, ou autant de jeux que la largeur de l'écran en laisse tenir.
// Les jeux remplissent les meubles dans l'ordre de l'étagère (« Mon ordre », ou par titre) ;
// ceux qui ne trouvent pas de place attendent dans un carton, sous le dernier meuble de leur console.
// Enregistrée avec le compte (profile.shelf_style) : les visiteurs voient la même pièce.
import { cleanShelfStyle, DEFAULT_SHELF_STYLE, type ShelfStyle } from './preferences';

// Titres rangés comme sur une étagère : sans article en tête (« The Getaway » à G ; une espace
// après The, Le, La, Les : « Legacy of Kain » reste à L), ponctuation ignorée, numéros dans l'ordre
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true, ignorePunctuation: true });
const sortTitle = (title: string) => title.replace(/^(?:(?:the|le|la|les)\s+|l['’])(?=\S)/i, '');
export const compareShelfTitles = (a: string, b: string) => collator.compare(sortTitle(a), sortTitle(b));

export const ALL_CONSOLES = 'tout';
export const AUTO = 0;
export const LEVEL_CHOICES = [AUTO, 1, 2, 3, 4, 5, 6, 8];
export const PER_LEVEL_CHOICES = [AUTO, 10, 15, 20, 25, 30, 40];
export const MAX_FURNITURE = 24;
const MAX_NAME = 40;

export interface Meuble {
  id: string;
  name: string;
  content: string;
  style: ShelfStyle;
  levels: number;
  perLevel: number;
}
export interface Room {
  meubles: Meuble[];
  exposition: ShelfStyle;
}

const pick = (choices: number[], value: unknown) => (typeof value === 'number' && choices.includes(value) ? value : AUTO);
export const newMeubleId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// La pièce telle qu'enregistrée (base, appareil) : seulement ce que le site connaît.
// Rien d'enregistré : null (la pièce de départ est construite d'après la collection).
export function cleanRoom(value: unknown): Room | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.meubles)) return null;
  const seen = new Set<string>();
  const meubles: Meuble[] = [];
  for (const raw of v.meubles.slice(0, MAX_FURNITURE)) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const id = typeof m.id === 'string' && /^[\w-]{1,24}$/.test(m.id) && !seen.has(m.id) ? m.id : newMeubleId();
    seen.add(id);
    meubles.push({
      id,
      name: typeof m.name === 'string' ? m.name.trim().slice(0, MAX_NAME) : '',
      content: typeof m.content === 'string' && /^[\w-]{1,20}$/.test(m.content) ? m.content : ALL_CONSOLES,
      style: cleanShelfStyle(m.style),
      levels: pick(LEVEL_CHOICES, m.levels),
      perLevel: pick(PER_LEVEL_CHOICES, m.perLevel),
    });
  }
  return { meubles, exposition: cleanShelfStyle(v.exposition) };
}

// La pièce de départ : une bibliothèque par console de la collection, qui grandit avec elle
export function startingRoom(consoles: { code: string; name: string }[]): Room {
  return {
    meubles: consoles.map((c) => ({ id: `auto-${c.code}`, name: c.name, content: c.code, style: DEFAULT_SHELF_STYLE, levels: AUTO, perLevel: AUTO })),
    exposition: DEFAULT_SHELF_STYLE,
  };
}

export interface Placed<T> {
  meuble: Meuble;
  // Les étages, du haut vers le bas (les derniers peuvent être vides)
  levels: T[][];
}
export interface Distribution<T> {
  placed: Placed<T>[];
  // Les jeux sans place, par console : leur carton se pose après le dernier meuble qui la reçoit
  // (ou à la fin de la pièce si aucun meuble ne la reçoit)
  boxes: { console: string; after: string | null; items: T[] }[];
}

// Répartir les jeux (déjà dans l'ordre de l'étagère) dans les meubles, dans l'ordre des meubles.
// `perRow(meuble)` : nombre de places par étage quand il est « auto » (selon la largeur affichée).
// `placesOf(jeu)` : les places qu'il prend sur l'étage (une ; trois pour la grande boîte d'un pack
// PlayStation avec Multitap) ; un jeu qui ne tient plus sur l'étage passe au suivant.
export function distribute<T>(items: T[], consoleOf: (item: T) => string, meubles: Meuble[], perRow: (m: Meuble) => number,
  placesOf: (item: T) => number = () => 1): Distribution<T> {
  const queues = new Map<string, T[]>();
  for (const item of items) {
    const key = consoleOf(item);
    queues.set(key, [...(queues.get(key) ?? []), item]);
  }
  const consoles = [...queues.keys()];
  const placed: Placed<T>[] = [];
  const lastFor = new Map<string, string>();
  for (const meuble of meubles) {
    const width = Math.max(1, meuble.perLevel || perRow(meuble));
    const keys = meuble.content === ALL_CONSOLES ? consoles : [meuble.content];
    for (const key of keys) lastFor.set(key, meuble.id);
    // Contenu : les consoles reçues, l'une après l'autre, étage par étage ; un meuble au nombre
    // d'étages fixé s'arrête quand le jeu suivant ne tient plus sur son dernier étage
    const rows: T[][] = [];
    let row: T[] = [];
    let used = 0;
    const maxRows = meuble.levels || Infinity;
    fill: for (const key of keys) {
      const queue = queues.get(key);
      if (!queue) continue;
      while (queue.length > 0) {
        const size = Math.min(width, Math.max(1, placesOf(queue[0])));
        if (used + size > width) {
          if (rows.length + 1 >= maxRows) break fill;
          rows.push(row);
          row = [];
          used = 0;
        }
        row.push(queue.shift()!);
        used += size;
      }
    }
    rows.push(row);
    const count = meuble.levels || rows.length;
    placed.push({ meuble, levels: Array.from({ length: count }, (_, i) => rows[i] ?? []) });
  }
  const boxes = consoles
    .filter((key) => queues.get(key)!.length > 0)
    .map((key) => ({ console: key, after: lastFor.get(key) ?? null, items: queues.get(key)! }));
  return { placed, boxes };
}

// Ajouter un meuble pour la console donnée : juste après `after` (le dernier meuble de cette
// console, d'où viennent les jeux sans place), avec son aspect et ses dimensions ; sinon au
// bout de la pièce, avec l'aspect du dernier meuble
export function addMeuble(room: Room, content: string, name: string, after?: string | null): { room: Room; id: string } {
  if (room.meubles.length >= MAX_FURNITURE) return { room, id: '' };
  const index = after ? room.meubles.findIndex((m) => m.id === after) : -1;
  const model = index >= 0 ? room.meubles[index] : room.meubles.at(-1);
  const id = newMeubleId();
  const meuble: Meuble = {
    id, name, content, style: model?.style ?? DEFAULT_SHELF_STYLE,
    levels: index >= 0 ? model!.levels : AUTO, perLevel: index >= 0 ? model!.perLevel : AUTO,
  };
  const meubles = [...room.meubles];
  meubles.splice(index >= 0 ? index + 1 : meubles.length, 0, meuble);
  return { room: { ...room, meubles }, id };
}

export function updateMeuble(room: Room, id: string, changes: Partial<Meuble>): Room {
  return { ...room, meubles: room.meubles.map((m) => (m.id === id ? { ...m, ...changes } : m)) };
}

export function removeMeuble(room: Room, id: string): Room {
  return { ...room, meubles: room.meubles.filter((m) => m.id !== id) };
}

export function moveMeuble(room: Room, id: string, step: number): Room {
  const list = [...room.meubles];
  const from = list.findIndex((m) => m.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= list.length) return room;
  list.splice(to, 0, ...list.splice(from, 1));
  return { ...room, meubles: list };
}

export function duplicateMeuble(room: Room, id: string): { room: Room; id: string } {
  const index = room.meubles.findIndex((m) => m.id === id);
  if (index < 0 || room.meubles.length >= MAX_FURNITURE) return { room, id };
  const copy = { ...room.meubles[index], id: newMeubleId() };
  const meubles = [...room.meubles];
  meubles.splice(index + 1, 0, copy);
  return { room: { ...room, meubles }, id: copy.id };
}

// Le même aspect pour tous les meubles (et l'exposition)
export const styleEverywhere = (room: Room, style: ShelfStyle): Room => ({
  meubles: room.meubles.map((m) => ({ ...m, style })),
  exposition: style,
});
