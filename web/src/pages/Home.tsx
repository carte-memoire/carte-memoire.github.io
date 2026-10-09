import { useNavigate } from 'react-router-dom';
import { GameSearch } from '../components/GameSearch';
import { gamePath } from '../lib/format';
import { PsSymbol } from '../components/PsSymbol';

export function Home() {
  const navigate = useNavigate();
  return (
    <section className="home">
      <div className="hero">
        <h1 className="hero-title">Carte Mémoire</h1>
        <p className="hero-subtitle">Tous les jeux PlayStation, version par version. Et ta collection.</p>
        <p className="buttons-legend" aria-hidden="true">
          <PsSymbol shape="triangle" colored /><PsSymbol shape="circle" colored />
          <PsSymbol shape="cross" colored /><PsSymbol shape="square" colored />
        </p>
      </div>
      <div className="panel">
        <GameSearch onSelect={(g) => navigate(gamePath(g))} autoFocus label="Rechercher un jeu (titre, titre japonais ou européen…)" />
      </div>
    </section>
  );
}
