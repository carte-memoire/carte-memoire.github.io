import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('toCsv', () => {
  it('sépare par « ; » et termine les lignes en CRLF (Excel en français)', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a;b\r\nc;d');
  });
  it('met entre guillemets les cellules qui contiennent le séparateur, un guillemet ou un retour à la ligne', () => {
    expect(toCsv([['Crash; Bash', 'dit "ok"', 'deux\nlignes']])).toBe('"Crash; Bash";"dit ""ok""";"deux\nlignes"');
  });
  it('neutralise les formules (= + - @) avec une apostrophe', () => {
    expect(toCsv([['=SOMME(A1)', '+1', '-2', '@x', 'normal']])).toBe("'=SOMME(A1);'+1;'-2;'@x;normal");
  });
  it('accepte un autre séparateur', () => {
    expect(toCsv([['a,b', 'c']], ',')).toBe('"a,b",c');
  });
});

describe('parseCsv', () => {
  it('lit un fichier exporté par le site (BOM, « ; », CRLF)', () => {
    expect(parseCsv('﻿titre;prix\r\nFinal Fantasy VII;15,00\r\n')).toEqual([['titre', 'prix'], ['Final Fantasy VII', '15,00']]);
  });
  it('devine le séparateur : virgule ou tabulation', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('gère les guillemets : séparateur, retour à la ligne et guillemets doublés dans une cellule', () => {
    expect(parseCsv('"Crash; Bash";"dit ""ok""";"deux\nlignes"')).toEqual([['Crash; Bash', 'dit "ok"', 'deux\nlignes']]);
  });
  it('ignore les lignes vides', () => {
    expect(parseCsv('a;b\n\n;\nc;d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('retire l’apostrophe ajoutée devant une formule à l’export', () => {
    expect(parseCsv("'=SOMME(A1);'ok")).toEqual([['=SOMME(A1)', "'ok"]]);
  });
  it('relit ce que toCsv a écrit', () => {
    const rows = [['id', 'titre', 'notes'], ['1', 'Kagero: Deception II', 'Disque "2" ; rayé\nlégèrement'], ['2', '=1+1', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
