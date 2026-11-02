import { describe, expect, it } from 'vitest';
import { lang, tr } from './i18n';

// Sans navigateur, le site est en français : tr() rend le texte tel quel, valeurs remplies
describe('tr (français, langue d’origine)', () => {
  it('est en français hors navigateur', () => {
    expect(lang).toBe('fr');
  });
  it('remplace les valeurs {0}, {1}…', () => {
    expect(tr('{0} sur {1}', 3, 12)).toBe('3 sur 12');
  });
  it('gère les pluriels {n?x} et les deux formes {n?a:b}', () => {
    expect(tr('{0} jeu{1?x}', 1, false)).toBe('1 jeu');
    expect(tr('{0} jeu{1?x}', 2, true)).toBe('2 jeux');
    expect(tr('{0} categor{1?ies:y}', 2, true)).toBe('2 categories');
    expect(tr('{0} categor{1?ies:y}', 1, false)).toBe('1 category');
  });
  it('efface une valeur absente ou nulle', () => {
    expect(tr('Jeu {0}', null)).toBe('Jeu ');
    expect(tr('Jeu {0}')).toBe('Jeu ');
  });
  it('garde les espaces au début et à la fin', () => {
    expect(tr(' Retour ')).toBe(' Retour ');
  });
});
