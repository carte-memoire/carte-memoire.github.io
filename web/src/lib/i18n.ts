// Langues du site : le français (langue d'origine) et l'anglais.
//
// Le texte français sert de clé : tr('Rechercher') donne « Search » en anglais. Une
// phrase sans traduction reste en français : ajouter du texte ne casse jamais rien.
// - Valeurs : tr('Les {0} jeux', 12) ; l'ordre peut changer dans la traduction.
// - Pluriels : {1?x} vaut « x » si la valeur 1 est vraie, sinon rien ; {1?ies:y} choisit
//   entre deux formes. tr('{0} jeu{1?x}', n, n > 1) → « {0} game{1?s} » en anglais.
// - Les espaces au début et à la fin du texte sont gardés tels quels.
//
// La langue est fixée au chargement de la page : celle choisie (bouton FR/EN), sinon le
// français, langue d'origine du site ; en changer recharge la page. Ainsi les listes de
// libellés calculées une fois (zones, états…) sont toujours dans la bonne langue.
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
export const lang: Lang = saved ?? 'fr';
// Aucun choix encore, navigateur réglé dans une autre langue que le français
export const offerEnglish = typeof window !== 'undefined' && saved === null
  && !(navigator.languages?.[0] ?? navigator.language ?? 'fr').toLowerCase().startsWith('fr');

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
  try { localStorage.setItem(KEY, next); } catch { /* sans stockage : le choix ne tient que jusqu'au rechargement */ }
  window.location.reload();
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
  return before + filled + after;
}
