import { describe, expect, it } from 'vitest';
import { ALL_CONSOLES, AUTO, cleanRoom, distribute, moveMeuble, startingRoom, type Meuble } from './room';
import { DEFAULT_SHELF_STYLE } from './preferences';

const meuble = (id: string, content: string, levels: number, perLevel: number): Meuble => ({ id, name: id, content, style: DEFAULT_SHELF_STYLE, levels, perLevel });
const games = (console: string, n: number) => Array.from({ length: n }, (_, i) => ({ console, n: i + 1 }));
const consoleOf = (g: { console: string }) => g.console;

describe('distribute', () => {
  it('remplit les meubles dans l’ordre, étage par étage, et met le reste au carton', () => {
    const { placed, boxes } = distribute(games('PS1', 25), consoleOf, [meuble('a', 'PS1', 2, 10)], () => 99);
    expect(placed[0].levels.map((l) => l.length)).toEqual([10, 10]);
    expect(boxes).toEqual([{ console: 'PS1', after: 'a', items: games('PS1', 25).slice(20) }]);
  });

  it('un meuble aux étages « auto » prend tout ce qui reste, à la largeur affichée', () => {
    const { placed, boxes } = distribute(games('PS1', 25), consoleOf, [meuble('a', 'PS1', AUTO, AUTO)], () => 12);
    expect(placed[0].levels.map((l) => l.length)).toEqual([12, 12, 1]);
    expect(boxes).toEqual([]);
  });

  it('plusieurs meubles d’une même console se suivent ; un meuble vide garde un étage', () => {
    const { placed } = distribute(games('PS1', 12), consoleOf, [meuble('a', 'PS1', 1, 10), meuble('b', 'PS1', AUTO, 10), meuble('c', 'PS1', AUTO, 10)], () => 10);
    expect(placed.map((p) => p.levels.map((l) => l.length))).toEqual([[10], [2], [0]]);
  });

  it('un meuble « toutes les consoles » les reçoit l’une après l’autre', () => {
    const items = [...games('PS1', 3), ...games('PS2', 2)];
    const { placed } = distribute(items, consoleOf, [meuble('a', ALL_CONSOLES, AUTO, 10)], () => 10);
    expect(placed[0].levels[0].map((g) => g.console)).toEqual(['PS1', 'PS1', 'PS1', 'PS2', 'PS2']);
  });

  it('une console sans meuble : ses jeux attendent dans un carton en fin de pièce', () => {
    const { boxes } = distribute([...games('PS1', 2), ...games('PS2', 2)], consoleOf, [meuble('a', 'PS1', AUTO, AUTO)], () => 10);
    expect(boxes).toEqual([{ console: 'PS2', after: null, items: games('PS2', 2) }]);
  });
});

describe('cleanRoom', () => {
  it('ne garde que ce que le site connaît', () => {
    const room = cleanRoom({ meubles: [{ id: 'x', name: ' Mes RPG ', content: 'PS1', style: { furniture: 'vitrine', finish: 'inconnu' }, levels: 7, perLevel: 20 }, 'n’importe quoi'], exposition: null });
    expect(room?.meubles).toEqual([{ id: 'x', name: 'Mes RPG', content: 'PS1', style: { ...DEFAULT_SHELF_STYLE, furniture: 'vitrine' }, levels: AUTO, perLevel: 20 }]);
    expect(room?.exposition).toEqual(DEFAULT_SHELF_STYLE);
  });

  it('rien d’enregistré : la pièce de départ, une bibliothèque par console', () => {
    expect(cleanRoom(null)).toBeNull();
    expect(cleanRoom({ PS1: {} })).toBeNull();
    expect(startingRoom([{ code: 'PS1', name: 'PlayStation' }]).meubles.map((m) => [m.content, m.name, m.levels, m.perLevel])).toEqual([['PS1', 'PlayStation', AUTO, AUTO]]);
  });

  it('change un meuble de place', () => {
    const room = { meubles: [meuble('a', 'PS1', 1, 10), meuble('b', 'PS2', 1, 10)], exposition: DEFAULT_SHELF_STYLE };
    expect(moveMeuble(room, 'b', -1).meubles.map((m) => m.id)).toEqual(['b', 'a']);
    expect(moveMeuble(room, 'a', -1)).toBe(room);
  });
});
