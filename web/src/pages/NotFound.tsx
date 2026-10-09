import { Link } from 'react-router-dom';
import { PsSymbol } from '../components/PsSymbol';

export function NotFound() {
  return (
    <section className="panel narrow center">
      <h1>Aucune donnée</h1>
      <p>Cette page n'existe pas sur la carte mémoire.</p>
      <Link to="/" className="button"><PsSymbol shape="circle" /> Retour à l'accueil</Link>
    </section>
  );
}
