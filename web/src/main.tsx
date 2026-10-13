import '@fontsource/press-start-2p/400.css';
import './styles.css';
import { loadLanguage, tr } from './lib/i18n';

const root = document.getElementById('root')!;

// Protection contre le « clickjacking » : un autre site qui afficherait Carte Mémoire
// dans un cadre invisible pour faire cliquer à son insu (supprimer, valider…) n'obtient
// qu'un lien. D'habitude un en-tête HTTP s'en charge, mais GitHub Pages ne permet pas
// d'en ajouter. Seulement sur le site publié : l'aperçu de développement peut utiliser un cadre.
if (import.meta.env.PROD && window.top !== window.self) {
  const link = document.createElement('a');
  link.href = window.location.href;
  link.target = '_top';
  link.rel = 'noopener';
  link.textContent = tr('Ouvrir Carte Mémoire dans son propre onglet');
  root.append(link);
} else {
  // La langue d'abord (dictionnaire anglais si besoin), puis le site : ses libellés
  // calculés au chargement sont ainsi déjà dans la bonne langue
  await loadLanguage();
  const { start } = await import('./start');
  start(root);
}
