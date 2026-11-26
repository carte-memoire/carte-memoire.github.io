import { describe, expect, it } from 'vitest';
import { caseFormatFor, platformCase } from './cases';

describe('boîtier selon la console et la zone', () => {
  it('une version japonaise NES (Famicom) prend la boîte en largeur', () => {
    expect(caseFormatFor('NES', 'standard', 'NTSC-J')).toBe('carton-jp');
    expect(platformCase('NES', 'NTSC-J')).toBe('carton-jp');
  });
  it('les versions américaines et européennes gardent la boîte debout', () => {
    expect(caseFormatFor('NES', 'standard', 'NTSC-U')).toBe('carton');
    expect(caseFormatFor('NES', 'standard', 'PAL')).toBe('carton');
    expect(caseFormatFor('NES', 'standard')).toBe('carton');
  });
  it('les autres consoles ne changent pas avec la zone', () => {
    expect(caseFormatFor('PS1', 'standard', 'NTSC-J')).toBe('cd');
    expect(caseFormatFor('PS2', 'standard', 'NTSC-J')).toBe('dvd');
    expect(caseFormatFor('FDS', 'standard', 'NTSC-J')).toBe('disquette');
  });
  it('un collector ou un bundle reste sans cadre', () => {
    expect(caseFormatFor('NES', 'collector', 'NTSC-J')).toBe('free');
  });
});
