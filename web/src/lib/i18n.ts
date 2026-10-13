// Langues du site : le français (langue d'origine) et l'anglais.
//
// Le texte français sert de clé : tr('Rechercher') donne « Search » en anglais. Une
// phrase sans traduction reste en français : ajouter du texte ne casse jamais rien.
// - Valeurs : tr('Les {0} jeux', 12) ; l'ordre peut changer dans la traduction.
// - Pluriels : {1?x} vaut « x » si la valeur 1 est vraie, sinon rien ; {1?ies:y} choisit
//   entre deux formes. tr('{0} jeu{1?x}', n, n > 1) → « {0} game{1?s} » en anglais.
// - Les espaces au début et à la fin du texte sont gardés tels quels.
//
// La langue est fixée au chargement de la page (choix retenu, sinon la langue du
// navigateur) ; en changer recharge la page. Ainsi les listes de libellés calculées
// une fois (zones, états…) sont toujours dans la bonne langue.

export type Lang = 'fr' | 'en';
const KEY = 'carte-memoire:langue-site';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch { /* stockage indisponible : langue du navigateur */ }
  const preferred = (navigator.languages?.[0] ?? navigator.language ?? 'fr').toLowerCase();
  return preferred.startsWith('fr') ? 'fr' : 'en';
}

export const lang: Lang = typeof window === 'undefined' ? 'fr' : detect();
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
