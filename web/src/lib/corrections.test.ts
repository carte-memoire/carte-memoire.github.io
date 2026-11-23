import { describe, expect, it } from 'vitest';
import { gameChanges, normalizeDate, PRODUCT_CODE, releaseChanges } from './corrections';

describe('normalizeDate', () => {
  it('ramène une date au mois ou à l’année au premier jour', () => {
    expect(normalizeDate('1997-01-31', 'day')).toBe('1997-01-31');
    expect(normalizeDate('1997-01-31', 'month')).toBe('1997-01-01');
    expect(normalizeDate('1997-01-31', 'year')).toBe('1997-01-01');
    expect(normalizeDate('pas une date', 'day')).toBeNull();
  });
});

describe('gameChanges', () => {
  const current = { date: '1997-01-31', precision: 'day' as const, genreIds: [1, 2], developerIds: [9] };
  it('rien de changé : rien à envoyer', () => {
    expect(gameChanges(current, { date: '1997-01-31', precision: 'day', genreIds: [2, 1], developerIds: [9] })).toEqual({});
  });
  it('seuls les champs modifiés', () => {
    expect(gameChanges(current, { date: '1997-02-15', precision: 'month', genreIds: [1, 2], developerIds: [9, 10] }))
      .toEqual({ first_release_date: '1997-02-01', first_release_precision: 'month', developer_ids: [9, 10] });
  });
  it('une date effacée part vide, sans précision', () => {
    expect(gameChanges(current, { date: '', precision: 'day', genreIds: [1, 2], developerIds: [9] })).toEqual({ first_release_date: null });
  });
});

describe('releaseChanges', () => {
  const current = { zone: 'PAL' as const, code: 'SCES-00868', languages: ['fr'] };
  it('code en majuscules, sans espace autour ; inchangé : rien', () => {
    expect(releaseChanges(current, { zone: 'PAL', code: ' sces-00868 ', languages: ['fr'] })).toEqual({});
  });
  it('zone, code et langues modifiés', () => {
    expect(releaseChanges(current, { zone: 'NTSC-U', code: 'SLUS-00700', languages: ['en', 'fr'] }))
      .toEqual({ zone: 'NTSC-U', product_code: 'SLUS-00700', languages: ['en', 'fr'] });
  });
  it('les codes que la base accepte', () => {
    expect(PRODUCT_CODE.test('SCES-00867')).toBe(true);
    expect(PRODUCT_CODE.test('SLES-52760/P')).toBe(true);
    expect(PRODUCT_CODE.test('sces-00867')).toBe(false);
  });
});
