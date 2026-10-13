import { Link } from 'react-router-dom';
import { PsSymbol } from '../components/PsSymbol';
import { tr } from '../lib/i18n';

export function NotFound() {
  return (
    <section className="panel narrow center">
      <h1>{tr('Aucune donnée')}</h1>
      <p>{tr("Cette page n'existe pas sur la carte mémoire.")}</p>
      <Link to="/" className="button"><PsSymbol shape="circle" />{tr(" Retour à l'accueil")}</Link>
    </section>
  );
}
