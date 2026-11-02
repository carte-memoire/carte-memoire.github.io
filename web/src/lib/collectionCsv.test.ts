import { describe, expect, it } from 'vitest';
import { canMatch, EXPORT_HEADERS, mapColumns, parseRow, TEMPLATE_ROWS, toInsert } from './collectionCsv';

describe('mapColumns', () => {
  it('reconnaît les en-têtes du site', () => {
    const map = mapColumns(EXPORT_HEADERS);
    expect(map.release_id).toBe(0);
    expect(map.status).toBe(1);
    expect(map.title).toBe(2);
    expect(map.purchase_price).toBe(15);
    expect(map.notes).toBe(18);
  });
  it('reconnaît les en-têtes d’un tableur quelconque, accents et apostrophes compris', () => {
    const map = mapColumns(['Titre du jeu', 'Plateforme', 'État', "Lieu d'achat", "Prix d'achat", "Date d'achat", 'Commentaires']);
    expect(map).toEqual({ title: 0, platform: 1, condition: 2, purchase_place: 3, purchase_price: 4, purchase_date: 5, notes: 6 });
  });
  it('n’attribue jamais deux champs à la même colonne', () => {
    const map = mapColumns(['Code', 'Code']);
    expect(map.code).toBe(0);
    expect(Object.values(map).filter((i) => i === 0)).toHaveLength(1);
  });
  it('sait si les lignes pourront être rattachées à un jeu', () => {
    expect(canMatch(mapColumns(['Titre']))).toBe(true);
    expect(canMatch(mapColumns(['Code produit']))).toBe(true);
    expect(canMatch(mapColumns(['État', 'Prix']))).toBe(false);
  });
});

describe('parseRow', () => {
  const map = mapColumns(EXPORT_HEADERS);

  it('lit la ligne d’exemple du modèle', () => {
    const row = parseRow(TEMPLATE_ROWS[1], map, 2);
    expect(row.match).toEqual({ title: 'Final Fantasy VII', code: 'SCES-00867', zone: 'PAL', edition: 'Black Label', platform: 'PS1' });
    expect(row.values).toMatchObject({
      status: 'owned', condition: 'very_good', has_box: true, has_manual: true, has_media: true, has_spine_card: null,
      acquisition: 'used', purchase_place: 'Brocante', purchase_price: 15, purchase_date: '2024-05-12', trade_status: null,
      notes: 'Disque 2 un peu rayé',
    });
    expect(row.warnings).toEqual([]);
    expect(row.label).toBe('Final Fantasy VII · SCES-00867');
  });

  it('comprend les écritures courantes : oui/non, prix en euros, dates françaises, états abrégés', () => {
    const cells = ['', 'possédé', 'Crash Bandicoot', '', 'PS1', 'Europe', '', '', 'TBE', 'x', 'non', 'Oui', '', 'neuf', '', '15,50 €', '12/05/2024', 'à vendre', ''];
    const { values, warnings } = parseRow(cells, map, 3);
    expect(values).toMatchObject({ condition: 'very_good', has_box: true, has_manual: false, has_media: true, acquisition: 'new', purchase_price: 15.5, purchase_date: '2024-05-12', trade_status: 'for_sale' });
    expect(warnings).toEqual([]);
  });

  it('reconnaît un jeu recherché', () => {
    expect(parseRow(TEMPLATE_ROWS[3], map, 4).values.status).toBe('wanted');
    expect(parseRow(['', 'wishlist'], map, 5).values.status).toBe('wanted');
  });

  it('signale et ignore les valeurs incompréhensibles au lieu de bloquer la ligne', () => {
    const cells = ['', '', 'Vagrant Story', '', '', 'Mars', '', '', 'cassé', 'peut-être', '', '', '', '', '', 'cher', '31/02/2024', '', ''];
    const { values, warnings } = parseRow(cells, map, 6);
    expect(values.condition).toBeNull();
    expect(values.has_box).toBeNull();
    expect(values.purchase_price).toBeNull();
    expect(values.purchase_date).toBeNull();
    expect(warnings).toHaveLength(5);
    expect(warnings[0]).toContain('Zone');
  });

  it('refuse une date d’achat dans le futur', () => {
    const { values, warnings } = parseRow(['', '', 'Titre', '', '', '', '', '', '', '', '', '', '', '', '', '', '2999-01-01', '', ''], map, 7);
    expect(values.purchase_date).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});

describe('toInsert', () => {
  it('ne garde pas les détails d’un exemplaire pour un jeu recherché', () => {
    const values = parseRow(['', 'recherché', 'Titre', '', '', '', '', '', 'Bon état', 'oui', '', '', '', '', '', '10', '', '', 'note'], mapColumns(EXPORT_HEADERS), 2).values;
    expect(toInsert(values, 42)).toEqual({
      release_id: 42, status: 'wanted', condition: null, has_box: null, has_manual: null, has_media: null, has_spine_card: null,
      acquisition: null, purchase_place: null, purchase_price: null, purchase_date: null, trade_status: null, notes: 'note',
    });
  });
});
