import { Link } from 'react-router-dom';
import { tr } from '../lib/i18n';
import { usePageTitle } from '../lib/title';

export function NotFound() {
  usePageTitle(tr('Page introuvable'));
  return (
    <section className="panel narrow center">
      <h1>{tr('Aucune donnée')}</h1>
      <p>{tr("Cette page n'existe pas sur la carte mémoire.")}</p>
      <Link to="/" className="button">{tr("Retour à l'accueil")}</Link>
    </section>
  );
}
