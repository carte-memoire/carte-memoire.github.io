import { useEffect } from 'react';
import { tr } from './i18n';

// Titre de l'onglet : « Catalogue · Carte Mémoire » (historique, favoris, lecteurs d'écran).
// Le menu remet « Carte Mémoire » à chaque changement de page, puis la page met le sien.
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = tr('{0} · Carte Mémoire', title);
  }, [title]);
}
