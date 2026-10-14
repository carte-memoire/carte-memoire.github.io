// Site mis à jour pendant qu'un onglet était ouvert : chaque publication renomme les
// fichiers du site, et l'ancienne version demande alors des morceaux qui n'existent plus
// (page de connexion, de collection…). On recharge la page une fois pour prendre la
// nouvelle version ; si ça échoue encore juste après, on n'insiste pas (pas de boucle).
const KEY = 'carte-memoire:rechargement';
const DELAY = 30_000;

export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < DELAY) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

// Chargement d'une page ou d'un composant à la demande, avec ce rechargement en secours
export function loadOrReload<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((error: unknown) => {
    if (reloadForNewVersion()) return new Promise<T>(() => {});
    throw error;
  });
}
