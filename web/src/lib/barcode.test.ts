import { describe, expect, it } from 'vitest';
import { formatBarcode, normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('accepte un EAN-13 dont la clé est juste', () => {
    expect(normalizeBarcode('4006381333931')).toBe('4006381333931');
  });
  it('ignore les espaces et tirets tapés ou lus', () => {
    expect(normalizeBarcode('4 006381 333931')).toBe('4006381333931');
    expect(normalizeBarcode('4006381-333931')).toBe('4006381333931');
  });
  it('complète un UPC-A (12 chiffres) en EAN-13', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
  });
  it('accepte un EAN-8', () => {
    expect(normalizeBarcode('96385074')).toBe('96385074');
  });
  it('refuse une clé de contrôle fausse (code mal lu)', () => {
    expect(normalizeBarcode('4006381333932')).toBeNull();
    expect(normalizeBarcode('96385075')).toBeNull();
  });
  it('refuse une longueur inattendue ou un texte sans chiffres', () => {
    expect(normalizeBarcode('12345')).toBeNull();
    expect(normalizeBarcode('SCES-00867')).toBeNull();
    expect(normalizeBarcode('')).toBeNull();
  });
});

describe('formatBarcode', () => {
  it('espace un EAN-13 comme sous les barres', () => {
    expect(formatBarcode('4006381333931')).toBe('4 006381 333931');
  });
  it('coupe un EAN-8 en deux', () => {
    expect(formatBarcode('96385074')).toBe('9638 5074');
  });
  it('laisse tel quel ce qui n’a pas une longueur connue', () => {
    expect(formatBarcode('12345')).toBe('12345');
  });
});
