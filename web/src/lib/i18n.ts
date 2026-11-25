// Langues du site : le français (langue d'origine) et l'anglais.
//
// Le texte français sert de clé : tr('Rechercher') donne « Search » en anglais. Une
// phrase sans traduction reste en français : ajouter du texte ne casse jamais rien.
// - Valeurs : tr('Les {0} jeux', 12) ; l'ordre peut changer dans la traduction.
// - Pluriels : {1?x} vaut « x » si la valeur 1 est vraie, sinon rien ; {1?ies:y} choisit
//   entre deux formes. tr('{0} jeu{1?x}', n, n > 1) → « {0} game{1?s} » en anglais.
// - Les espaces au début et à la fin du texte sont gardés tels quels.
//
// La langue vient de l'adresse : /en/… en anglais, tout le reste en français. Chaque page a
// ainsi une adresse par langue, que les moteurs de recherche indexent séparément (balises
// hreflang écrites par scripts/prerender.mjs). Elle est fixée au chargement de la page ; le
// bouton FR/EN ouvre la même page dans l'autre langue (rechargement). Ainsi les listes de
// libellés calculées une fois (zones, états…) sont toujours dans la bonne langue.
// Qui a choisi l'anglais et ouvre une adresse française (lien partagé, favori) est renvoyé à
// la même page en anglais (redirectToChosenLanguage).
// Pas de choix d'après la langue du navigateur : le robot de Google navigue en anglais,
// et enregistrait l'interface anglaise d'un site français. Un visiteur dont le
// navigateur n'est pas en français se voit proposer l'anglais (offerEnglish).

export type Lang = 'fr' | 'en';
const KEY = 'carte-memoire:langue-site';

function savedLanguage(): Lang | null {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'fr' || saved === 'en' ? saved : null;
  } catch {
    return null;
  }
}

const saved = typeof window === 'undefined' ? null : savedLanguage();
// Langue de l'adresse : /en, /en/… → anglais ; sinon aucune (français)
const pathLang: Lang | null = typeof window !== 'undefined' && /^\/en(\/|$)/.test(window.location.pathname) ? 'en' : null;
export const lang: Lang = pathLang ?? 'fr';
// Début des adresses dans cette langue : le routeur l'ajoute à tous les liens du site
export const basePath = lang === 'en' ? '/en' : '';
// Adresse complète d'une page dans la langue affichée (liens partagés, QR codes)
export const siteUrl = (path: string) => `${window.location.origin}${basePath}${path}`;
// Aucun choix encore, page française, navigateur réglé dans une autre langue
export const offerEnglish = typeof window !== 'undefined' && saved === null && pathLang === null
  && !(navigator.languages?.[0] ?? navigator.language ?? 'fr').toLowerCase().startsWith('fr');

// Même adresse, dans l'autre langue : /jeu/x ↔ /en/jeu/x ; l'accueil est /en/
function addressIn(next: Lang): string {
  const { pathname, search, hash } = window.location;
  const plain = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  return `${next === 'en' ? `/en${plain}` : plain}${search}${hash}`;
}

// Anglais choisi, page ouverte à son adresse française : la même page en anglais. Renvoie
// true si la page change (le site ne doit alors pas se lancer).
export function redirectToChosenLanguage(): boolean {
  if (pathLang !== null || saved !== 'en') return false;
  window.location.replace(addressIn('en'));
  return true;
}

// « Rester en français » : la proposition ne revient plus
export function keepFrench() {
  try { localStorage.setItem(KEY, 'fr'); } catch { /* sans stockage : elle reviendra à la prochaine visite */ }
}
// Formats des dates et des nombres (anglais britannique : dates européennes, « 14 November 1997 »)
export const locale = lang === 'en' ? 'en-GB' : 'fr-FR';

let dictionary: Record<string, string> = {};

// Le dictionnaire anglais n'est téléchargé que par ceux qui lisent en anglais
export async function loadLanguage(): Promise<void> {
  if (lang === 'en') dictionary = (await import('./i18n-en')).EN;
  document.documentElement.lang = lang;
}

export function setLanguage(next: Lang) {
  try { localStorage.setItem(KEY, next); } catch { /* sans stockage : l'adresse suffit à garder la langue */ }
  window.location.assign(addressIn(next));
}

const PLACEHOLDER = /\{(\d+)(?:\?([^:}]*)(?::([^}]*))?)?\}/g;

export function tr(text: string, ...values: unknown[]): string {
  const [, before, core, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const translated = lang === 'en' ? dictionary[core] ?? core : core;
  const filled = translated.replace(PLACEHOLDER, (_, index: string, yes?: string, no?: string) => {
    const value = values[Number(index)];
    if (yes !== undefined) return value ? yes : (no ?? '');
    return value === undefined || value === null ? '' : String(value);
  });
  return before + (lang === 'en' ? filled : frenchSpacing(filled)) + after;
}

// Typographie française : espaces insécables à l'intérieur des guillemets (« … »),
// devant : (insécable) et devant ; ? ! (fine insécable), pour qu'un « ou un ? ne se
// retrouve jamais seul en début ou en fin de ligne
export function frenchSpacing(text: string): string {
  return text.replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»').replace(/ :/g, '\u00a0:').replace(/ ([;?!])/g, '\u202f$1');
}
