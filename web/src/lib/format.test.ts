import { describe, expect, it } from 'vitest';
import {
  editionClass, editionLabel, formatDate, formatPercent, gamePath, languagesLong, languagesShort, searchKey, slugify, speaksLanguage, yearOf, zoneOrder,
} from './format';

describe('slugify et gamePath', () => {
  it('passe en minuscules sans accents ni ponctuation', () => {
    expect(slugify('Final Fantasy VII')).toBe('final-fantasy-vii');
    expect(slugify('Pokémon : Édition Rouge !')).toBe('pokemon-edition-rouge');
  });
  it('coupe à 60 caractères', () => {
    expect(slugify('a'.repeat(80))).toHaveLength(60);
  });
  it('préfère l’adresse lisible calculée par la base', () => {
    expect(gamePath({ id: 36, title: 'Final Fantasy VII', slug: 'ps1/final-fantasy-vii' })).toBe('/jeu/ps1/final-fantasy-vii');
  });
  it('sinon, l’ancienne forme numéro-titre, corrigée ensuite par la fiche', () => {
    expect(gamePath({ id: 36, title: 'Final Fantasy VII' })).toBe('/jeu/36-final-fantasy-vii');
    expect(gamePath({ id: 36 })).toBe('/jeu/36');
  });
});

describe('searchKey', () => {
  it('ne garde que lettres et chiffres, sans accents ni majuscules', () => {
    expect(searchKey('Biohazard 2')).toBe('biohazard2');
    expect(searchKey("Lieu d'achat")).toBe('lieudachat');
    expect(searchKey('État')).toBe('etat');
  });
});

describe('zones et éditions', () => {
  it('range Japon, Amérique, Europe, puis le reste', () => {
    expect([null, 'PAL', 'region_free', 'NTSC-J', 'NTSC-U'].map((z) => zoneOrder(z as never))).toEqual([4, 2, 3, 0, 1]);
  });
  it('appelle « Black Label » la standard PS1/PS2 hors Japon, « Standard » ailleurs', () => {
    const ps1 = { edition_type: 'standard', edition_name: null, platform: { short_name: 'PS1' } } as const;
    expect(editionLabel({ ...ps1, zone: 'PAL' })).toBe('Black Label');
    expect(editionLabel({ ...ps1, zone: 'NTSC-J' })).toBe('Standard');
    expect(editionLabel({ ...ps1, platform: { short_name: 'NES' }, zone: 'PAL' })).toBe('Standard');
  });
  it('préfère le nom d’édition, sinon le type sans sa parenthèse', () => {
    expect(editionLabel({ edition_type: 'reissue', edition_name: 'Platinum', platform: { short_name: 'PS1' } })).toBe('Platinum');
    expect(editionLabel({ edition_type: 'reissue', edition_name: null, platform: { short_name: 'PS1' } })).toBe('Réédition');
  });
  it('colore les Greatest Hits en rouge, les autres rééditions en argent', () => {
    expect(editionClass({ edition_type: 'reissue', edition_name: 'Greatest Hits' })).toBe('badge-greatest-hits');
    expect(editionClass({ edition_type: 'reissue', edition_name: 'Platinum' })).toBe('badge-platinum');
    expect(editionClass({ edition_type: 'standard' })).toBe('badge-edition');
  });
});

describe('speaksLanguage', () => {
  it('juge par le pays de la boîte quand il est connu', () => {
    expect(speaksLanguage({ box_country: 'FR', languages: ['en'] }, 'fr')).toBe(true);
    expect(speaksLanguage({ box_country: 'DE', languages: ['fr'] }, 'fr')).toBe(false);
    expect(speaksLanguage({ box_country: 'europe' }, 'fr')).toBe(true);
  });
  it('sinon par les langues du disque, inconnues = on garde', () => {
    expect(speaksLanguage({ languages: ['en', 'fr'] }, 'fr')).toBe(true);
    expect(speaksLanguage({ languages: ['en'] }, 'fr')).toBe(false);
    expect(speaksLanguage({ languages: [] }, 'fr')).toBe(true);
    expect(speaksLanguage({}, 'fr')).toBe(true);
  });
});

describe('langues', () => {
  it('abrège jusqu’à trois langues, « Multi » au-delà', () => {
    expect(languagesShort(['fr'])).toBe('FR');
    expect(languagesShort(['en', 'fr', 'de'])).toBe('EN · FR · DE');
    expect(languagesShort(['en', 'fr', 'de', 'es'])).toBe('Multi');
    expect(languagesShort(null)).toBe('');
  });
  it('écrit les langues connues en toutes lettres, les autres en code', () => {
    expect(languagesLong(['fr', 'en', 'xx'])).toBe('Français, Anglais, XX');
  });
});

describe('dates et nombres (site en français)', () => {
  it('affiche la date selon sa précision', () => {
    expect(formatDate('1997-11-14', 'day')).toBe('14 novembre 1997');
    expect(formatDate('1997-11-01', 'month')).toBe('novembre 1997');
    expect(formatDate('1997-01-01', 'year')).toBe('1997');
    expect(formatDate(null, 'day')).toBe('');
  });
  it('ne décale pas le jour selon le fuseau horaire', () => {
    expect(formatDate('2000-01-01', 'day')).toBe('1 janvier 2000');
  });
  it('donne l’année seule', () => {
    expect(yearOf('1997-11-14')).toBe('1997');
    expect(yearOf(null)).toBe('');
  });
  it('calcule un pourcentage à une décimale, 0 % quand le total est nul', () => {
    expect(formatPercent(312, 1286).replace(/\s/g, ' ')).toBe('24,3 %');
    expect(formatPercent(3, 0).replace(/\s/g, ' ')).toBe('0 %');
  });
});
