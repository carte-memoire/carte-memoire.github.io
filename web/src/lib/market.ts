// Liens vers les ventes réussies d'une version, sur les sites de vente de sa région : la
// recherche s'ouvre chez eux, filtrée sur les objets vendus. Carte Mémoire n'affiche ni ne
// stocke leurs prix (leurs conditions interdisent de les récupérer automatiquement).
//   - Europe : l'eBay du pays de la boîte (ou du pays de sortie), sinon eBay France (eBay
//     Royaume-Uni pour le site anglais) ;
//   - Amérique du Nord : eBay États-Unis (ou Canada) ;
//   - Japon : eBay États-Unis (titre occidental, pour les importations) et les enchères
//     terminées de Yahoo! Auctions (titre japonais).
import { lang, tr } from './i18n';

export interface SaleSearch {
  site: string;
  // Le nom du site, dans la langue du visiteur : « eBay France », « Yahoo! Auctions Japon »
  name: string;
  url: string;
}

const SITE_NAMES: Record<string, () => string> = {
  'ebay.fr': () => tr('eBay France'), 'ebay.de': () => tr('eBay Allemagne'), 'ebay.at': () => tr('eBay Autriche'),
  'ebay.ch': () => tr('eBay Suisse'), 'ebay.co.uk': () => tr('eBay Royaume-Uni'), 'ebay.ie': () => tr('eBay Irlande'),
  'ebay.es': () => tr('eBay Espagne'), 'ebay.it': () => tr('eBay Italie'), 'ebay.nl': () => tr('eBay Pays-Bas'),
  'ebay.com.au': () => tr('eBay Australie'), 'ebay.com': () => tr('eBay États-Unis'), 'ebay.ca': () => tr('eBay Canada'),
};

interface SearchableRelease {
  local_title: string;
  zone: string | null;
  edition_type: string;
  edition_name: string | null;
  box_region?: { code: string } | null;
  platform: { short_name: string };
  release_region: { region: { code: string } }[];
}

// La console telle que les vendeurs l'écrivent, selon la région
const CONSOLE_TERMS: Record<string, string | Record<string, string>> = {
  PS1: 'PS1', PS2: 'PS2', N64: 'N64', GB: 'Game Boy', GBC: 'Game Boy Color', FDS: 'Famicom Disk System',
  NES: { 'NTSC-J': 'Famicom', default: 'NES' },
  SNES: { PAL: 'Super Nintendo', 'NTSC-U': 'SNES', 'NTSC-J': 'Super Famicom', default: 'Super Nintendo' },
  MD: { 'NTSC-U': 'Genesis', default: 'Mega Drive' },
};
const JAPANESE_TERMS: Record<string, string> = {
  PS1: 'PS', PS2: 'PS2', NES: 'ファミコン', FDS: 'ディスクシステム', SNES: 'スーパーファミコン', N64: '64',
  GB: 'ゲームボーイ', GBC: 'ゲームボーイカラー', MD: 'メガドライブ',
};

const EBAY_BY_COUNTRY: Record<string, string> = {
  FR: 'ebay.fr', BE: 'ebay.fr', LU: 'ebay.fr', CH: 'ebay.ch', DE: 'ebay.de', AT: 'ebay.at', GB: 'ebay.co.uk', IE: 'ebay.ie',
  ES: 'ebay.es', PT: 'ebay.es', IT: 'ebay.it', NL: 'ebay.nl', AU: 'ebay.com.au', NZ: 'ebay.com.au', US: 'ebay.com', CA: 'ebay.ca',
};

const hasJapaneseScript = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

function consoleTerm(platform: string, zone: string | null): string {
  const term = CONSOLE_TERMS[platform];
  if (!term) return platform;
  return typeof term === 'string' ? term : term[zone ?? ''] ?? term.default;
}

// Le pays de la version : seulement celui de sa boîte (« Boîte : Allemagne »). Une date de sortie
// dans un pays ne dit pas que la boîte lui est propre (la cartouche européenne de Mario Kart 64,
// datée au Royaume-Uni, se vend partout en Europe) : le visiteur français garde eBay France
function countryOf(release: SearchableRelease): string | null {
  return release.box_region?.code && /^[A-Z]{2}$/.test(release.box_region.code) ? release.box_region.code : null;
}

function ebayHost(release: SearchableRelease, siteLang: string): string {
  const country = countryOf(release);
  if (country && EBAY_BY_COUNTRY[country] && release.zone !== 'NTSC-J') return EBAY_BY_COUNTRY[country];
  if (release.zone === 'NTSC-U' || release.zone === 'NTSC-J') return 'ebay.com';
  return siteLang === 'en' ? 'ebay.co.uk' : 'ebay.fr';
}

// gameTitle : le titre de la fiche, pour chercher une version japonaise sur eBay (son titre
// japonais n'y donnerait presque rien)
export function saleSearches(release: SearchableRelease, gameTitle: string, siteLang: string = lang): SaleSearch[] {
  // Une réédition (Platinum, Greatest Hits…) n'a pas le prix de l'édition d'origine
  const edition = release.edition_type === 'reissue' && release.edition_name ? ` ${release.edition_name}` : '';
  const westernTitle = hasJapaneseScript(release.local_title) ? gameTitle : release.local_title;
  const host = ebayHost(release, siteLang);
  const query = `${westernTitle}${edition} ${consoleTerm(release.platform.short_name, release.zone)}`;
  const searches: SaleSearch[] = [{
    site: host,
    name: SITE_NAMES[host]?.() ?? host,
    url: `https://www.${host}/sch/i.html?${new URLSearchParams({ _nkw: query, LH_Sold: '1', LH_Complete: '1' })}`,
  }];
  if (release.zone === 'NTSC-J') {
    const japanese = `${release.local_title} ${JAPANESE_TERMS[release.platform.short_name] ?? ''}`.trim();
    searches.push({
      site: 'Yahoo! Auctions',
      name: tr('Yahoo! Auctions Japon'),
      url: `https://auctions.yahoo.co.jp/closedsearch/closedsearch?${new URLSearchParams({ p: japanese })}`,
    });
  }
  return searches;
}
