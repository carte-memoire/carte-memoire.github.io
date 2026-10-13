import { lang } from './i18n';
// Préférences retenues dans ce navigateur (simple confort : si le stockage
// est indisponible, on retombe sur les valeurs par défaut)

export const ALL_PLATFORMS = 'toutes';
export const DEFAULT_PLATFORM = 'PS1';
export const ALL_ZONES = 'toutes';
export const DEFAULT_ZONE = 'PAL';

const PLATFORM_KEY = 'carte-memoire:console';
const ZONE_KEY = 'carte-memoire:zone';

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* stockage indisponible : sans importance */ }
}

export const rememberedPlatform = () => read(PLATFORM_KEY, DEFAULT_PLATFORM);
export const rememberPlatform = (value: string) => write(PLATFORM_KEY, value);
export const rememberedZone = () => read(ZONE_KEY, DEFAULT_ZONE);
export const rememberZone = (value: string) => write(ZONE_KEY, value);

// Session ouverte par un lien « mot de passe oublié » (le temps de cet onglet) : seule
// elle donne accès à la page « nouveau mot de passe » sans code reçu par e-mail
const RECOVERY_KEY = 'carte-memoire:recuperation';
export function markRecovery(active: boolean) {
  try {
    if (active) sessionStorage.setItem(RECOVERY_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch { /* stockage indisponible : la page renverra vers « Mon compte » */ }
}
export function inRecovery(): boolean {
  try { return sessionStorage.getItem(RECOVERY_KEY) === '1'; } catch { return false; }
}

// Langue des versions : quand un jeu existe en plusieurs versions nationales semblables
// (FF7 PAL anglais, français, allemand, espagnol), on montre d'abord celle-ci, les
// autres sont repliées. Par défaut le français, langue du site.
const LANGUAGE_KEY = 'carte-memoire:langue';
export const ALL_LANGUAGES = 'toutes';
// Par défaut, la langue du site (français ou anglais)
export const DEFAULT_LANGUAGE: string = lang;
export const rememberedLanguage = () => read(LANGUAGE_KEY, DEFAULT_LANGUAGE);
export const rememberLanguage = (value: string) => write(LANGUAGE_KEY, value);

// Nombre de jeux par page dans les listes (0 = tout afficher), retenu pour chaque liste.
// Dans l'adresse : ?par=100 ou ?par=tout
export const PAGE_SIZES = [10, 20, 50, 100, 200, 1000, 0];
export const ALL_ITEMS = 'tout';

export function pageSizeFrom(value: string | null): number | null {
  if (value === ALL_ITEMS) return 0;
  const n = Number(value);
  return PAGE_SIZES.includes(n) && n > 0 ? n : null;
}
export const pageSizeParam = (size: number) => (size === 0 ? ALL_ITEMS : String(size));
export const rememberedPageSize = (list: string, fallback: number) => pageSizeFrom(read(`carte-memoire:par-page:${list}`, '')) ?? fallback;
export const rememberPageSize = (list: string, size: number) => write(`carte-memoire:par-page:${list}`, pageSizeParam(size));

const COLLECTION_VIEW_KEY = 'carte-memoire:vue-collection';
export type CollectionView = 'list' | 'grid';
export const rememberedCollectionView = (): CollectionView => (read(COLLECTION_VIEW_KEY, 'list') === 'grid' ? 'grid' : 'list');
export const rememberCollectionView = (value: CollectionView) => write(COLLECTION_VIEW_KEY, value);

// Déconnexion après inactivité, réglée pour CET appareil (un PC partagé n'a pas besoin
// du même délai qu'un téléphone personnel). Modérateurs : une heure au plus.
export const IDLE_CHOICES = [15, 30, 60, 240, 1440, 10080];
export const DEFAULT_IDLE_MINUTES = 60;
export const MODERATOR_MAX_IDLE_MINUTES = 60;
const IDLE_KEY = 'carte-memoire:inactivite';
const ACTIVITY_KEY = 'carte-memoire:derniere-activite';

export function idleMinutes(moderator: boolean): number {
  const chosen = Number(read(IDLE_KEY, ''));
  const minutes = IDLE_CHOICES.includes(chosen) ? chosen : DEFAULT_IDLE_MINUTES;
  return moderator ? Math.min(minutes, MODERATOR_MAX_IDLE_MINUTES) : minutes;
}
export const rememberIdleMinutes = (minutes: number) => write(IDLE_KEY, String(minutes));

export const lastActivity = () => Number(read(ACTIVITY_KEY, '0')) || 0;
export const touchActivity = (at: number) => write(ACTIVITY_KEY, String(at));
