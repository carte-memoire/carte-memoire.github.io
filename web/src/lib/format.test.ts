import { describe, expect, it } from 'vitest';
import {
  editionClass, editionLabel, formatDate, formatPercent, gamePath, languagesLong, languagesShort, genreName, genresBesideFamilies, pickSummary, readableSpaces, searchKey, searchShortcut, slugify, speaksLanguage, yearOf, zoneOrder, zoneOrderFrom,
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

describe('pickSummary', () => {
  const both = { summary: 'Résumé', summary_source: 'https://fr.wikipedia.org/wiki/X', summary_en: 'Summary', summary_en_source: 'https://en.wikipedia.org/wiki/X' };
  it('prend la langue du site', () => {
    expect(pickSummary(both, 'fr')).toEqual({ text: 'Résumé', source: 'https://fr.wikipedia.org/wiki/X', lang: 'fr' });
    expect(pickSummary(both, 'en')).toEqual({ text: 'Summary', source: 'https://en.wikipedia.org/wiki/X', lang: 'en' });
  });
  it('sinon l’autre langue', () => {
    expect(pickSummary({ ...both, summary: null, summary_source: null }, 'fr')?.lang).toBe('en');
    expect(pickSummary({ ...both, summary_en: null, summary_en_source: null }, 'en')?.lang).toBe('fr');
  });
  it('rien sans aucun résumé (anciennes données sans colonnes anglaises comprises)', () => {
    expect(pickSummary({ summary: null, summary_source: null }, 'fr')).toBeNull();
  });
});

describe('readableSpaces', () => {
  it('remplace l’espace fine (invisible dans la police du site) par une insécable normale', () => {
    expect(readableSpaces('4\u202f485')).toBe('4\u00a0485');
    expect(readableSpaces('Final Fantasy VII')).toBe('Final Fantasy VII');
  });
});

describe('zoneOrderFrom', () => {
  it('met la zone du visiteur en tête, puis Japon, Amérique, Europe', () => {
    const rank = zoneOrderFrom('PAL');
    expect((['NTSC-J', 'PAL', 'NTSC-U', null] as const).slice().sort((a, b) => rank(a) - rank(b))).toEqual(['PAL', 'NTSC-J', 'NTSC-U', null]);
  });
  it('une version sans zone ne passe jamais devant', () => {
    expect(zoneOrderFrom('PAL')(null)).toBeGreaterThan(zoneOrderFrom('PAL')('NTSC-U'));
  });
});

describe('genreName et genresBesideFamilies (français)', () => {
  it('retire le « jeu » sous-entendu', () => {
    expect(genreName("Jeu d'action-aventure")).toBe('Action-aventure');
    expect(genreName('Jeu vidéo musical')).toBe('Musical');
    expect(genreName('Jeu de tir à la troisième personne')).toBe('Tir à la troisième personne');
  });
  it('le garde quand le mot ne veut plus rien dire seul', () => {
    expect(genreName('Jeu de rôle à perspectives multiples')).toBe('Jeu de rôle à perspectives multiples');
    expect(genreName('Jeu de plateau')).toBe('Jeu de plateau');
    expect(genreName('Jeu télévisé')).toBe('Jeu télévisé');
    expect(genreName('Survival horror')).toBe('Survival horror');
  });
  it('ne répète pas une famille déjà affichée', () => {
    expect(genresBesideFamilies([
      { name: 'Jeu de sport', families: ['sports'] },
      { name: 'Jeu de football', families: ['sports'] },
      { name: "Jeu d'action-aventure", families: ['adventure', 'action'] },
    ])).toEqual(['Football', 'Action-aventure']);
  });
});

describe('searchShortcut', () => {
  it('« jrpg » et ses variantes mènent aux JRPG du catalogue', () => {
    for (const q of ['jrpg', 'JRPG', ' j-rpg ', 'jrpgs', 'rpg japonais', 'Japanese RPG']) {
      expect(searchShortcut(q)?.to).toBe('/catalogue?genre=rpg&origine=japon');
    }
  });
  it('un titre reste un titre', () => {
    expect(searchShortcut('Final Fantasy')).toBeNull();
    expect(searchShortcut('jrpg maker')).toBeNull();
  });
});
