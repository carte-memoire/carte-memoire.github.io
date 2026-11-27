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
  it('Super Nintendo : couchée en Amérique et en Europe, haute et étroite au Japon', () => {
    expect(caseFormatFor('SNES', 'standard', 'NTSC-U')).toBe('carton-snes');
    expect(caseFormatFor('SNES', 'standard', 'PAL')).toBe('carton-snes');
    expect(caseFormatFor('SNES', 'standard', 'NTSC-J')).toBe('carton-sfc');
  });
  it('Game Boy : presque carrée en Amérique et en Europe, en hauteur au Japon', () => {
    expect(caseFormatFor('GB', 'standard', 'PAL')).toBe('carton-gb');
    expect(caseFormatFor('GB', 'standard', 'NTSC-J')).toBe('carton-gb-jp');
    expect(caseFormatFor('GBC', 'standard', 'NTSC-U')).toBe('carton-gb');
    expect(caseFormatFor('GBC', 'standard', 'NTSC-J')).toBe('carton-gb-jp');
    expect(caseFormatFor('MD', 'standard', 'PAL')).toBe('boitier-md');
    expect(caseFormatFor('MD', 'standard', 'NTSC-J')).toBe('boitier-md');
    expect(caseFormatFor('N64', 'standard', 'PAL')).toBe('carton-snes');
    expect(caseFormatFor('N64', 'standard', 'NTSC-J')).toBe('carton-n64-jp');
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
