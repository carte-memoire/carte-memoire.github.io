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

const COLLECTION_VIEW_KEY = 'carte-memoire:vue-collection';
export type CollectionView = 'list' | 'grid';
export const rememberedCollectionView = (): CollectionView => (read(COLLECTION_VIEW_KEY, 'list') === 'grid' ? 'grid' : 'list');
export const rememberCollectionView = (value: CollectionView) => write(COLLECTION_VIEW_KEY, value);
