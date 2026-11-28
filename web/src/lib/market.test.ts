import { describe, expect, it } from 'vitest';
import { saleSearches } from './market';

const release = (over: Partial<Parameters<typeof saleSearches>[0]> = {}) => ({
  local_title: 'Final Fantasy VII', zone: 'PAL', edition_type: 'standard', edition_name: null, box_region: null,
  platform: { short_name: 'PS1' }, release_region: [{ region: { code: 'europe' } }], ...over,
});
const query = (url: string) => new URL(url).searchParams;

describe('liens vers les ventes réussies', () => {
  it('une version européenne : eBay France, objets vendus seulement', () => {
    const [s] = saleSearches(release(), 'Final Fantasy VII', 'fr');
    expect(new URL(s.url).host).toBe('www.ebay.fr');
    expect(query(s.url).get('_nkw')).toBe('Final Fantasy VII PS1');
    expect(query(s.url).get('LH_Sold')).toBe('1');
  });
  it('…eBay Royaume-Uni pour le site anglais', () => {
    expect(new URL(saleSearches(release(), 'Final Fantasy VII', 'en')[0].url).host).toBe('www.ebay.co.uk');
  });
  it('une date de sortie au Royaume-Uni ne suffit pas : eBay France', () => {
    expect(new URL(saleSearches(release({ release_region: [{ region: { code: 'GB' } }] }), 'x', 'fr')[0].url).host).toBe('www.ebay.fr');
  });
  it('la boîte allemande : eBay Allemagne', () => {
    expect(new URL(saleSearches(release({ box_region: { code: 'DE' } }), 'x', 'fr')[0].url).host).toBe('www.ebay.de');
  });
  it('une réédition : son nom dans la recherche (Platinum)', () => {
    const [s] = saleSearches(release({ edition_type: 'reissue', edition_name: 'Platinum' }), 'x', 'fr');
    expect(query(s.url).get('_nkw')).toBe('Final Fantasy VII Platinum PS1');
  });
  it('la console comme les vendeurs l\'écrivent : Genesis en Amérique, Super Famicom au Japon', () => {
    expect(query(saleSearches(release({ zone: 'NTSC-U', local_title: 'Sonic the Hedgehog', platform: { short_name: 'MD' } }), 'x')[0].url).get('_nkw'))
      .toBe('Sonic the Hedgehog Genesis');
    expect(query(saleSearches(release({ zone: 'NTSC-J', local_title: 'Mother 2', platform: { short_name: 'SNES' } }), 'x')[0].url).get('_nkw'))
      .toBe('Mother 2 Super Famicom');
  });
  it('une version japonaise : eBay avec le titre occidental, et Yahoo! Auctions avec le titre japonais', () => {
    const searches = saleSearches(release({ zone: 'NTSC-J', local_title: 'マリオカート64', platform: { short_name: 'N64' } }), 'Mario Kart 64', 'fr');
    expect(new URL(searches[0].url).host).toBe('www.ebay.com');
    expect(query(searches[0].url).get('_nkw')).toBe('Mario Kart 64 N64');
    expect(searches[1].site).toBe('Yahoo! Auctions');
    expect(query(searches[1].url).get('p')).toBe('マリオカート64 64');
  });
});
