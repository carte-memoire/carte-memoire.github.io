import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GameSearch } from '../components/GameSearch';
import { PlatformSelect } from '../components/PlatformSelect';
import { PsSymbol } from '../components/PsSymbol';
import { gamePath } from '../lib/format';
import { ALL_PLATFORMS, DEFAULT_PLATFORM, rememberPlatform, rememberedPlatform } from '../lib/preferences';
import { usePlatforms } from '../lib/usePlatforms';

export function Home() {
  const navigate = useNavigate();
  const platforms = usePlatforms();
  const [params, setParams] = useSearchParams();
  const selected = params.get('console') ?? rememberedPlatform();
  const current = platforms.find((p) => p.short_name === selected);
  const platformCode = selected === ALL_PLATFORMS ? null : selected;

  useEffect(() => { rememberPlatform(selected); }, [selected]);

  function choose(value: string) {
    // On mémorise AVANT de changer l'adresse : pour la PlayStation, l'adresse ne
    // porte plus de console et c'est la valeur mémorisée qui est relue.
    rememberPlatform(value);
    setParams(value === DEFAULT_PLATFORM ? {} : { console: value }, { replace: true });
  }

  return (
    <section className="home">
      <div className="hero">
        <h1 className="hero-title">Carte Mémoire</h1>
        <p className="hero-subtitle">
          Tous les jeux <PlatformSelect value={selected} onChange={choose} />, version par version. Et ta collection.
        </p>
        <p className="buttons-legend" aria-hidden="true">
          <PsSymbol shape="triangle" colored /><PsSymbol shape="circle" colored />
          <PsSymbol shape="cross" colored /><PsSymbol shape="square" colored />
        </p>
      </div>

      {current && current.game_count === 0 && (
        <p className="notice center">
          Pas encore de jeux <strong>{current.name}</strong> dans la base : on commence par la PlayStation.{' '}
          <Link to="/proposer">Propose le premier !</Link>
        </p>
      )}

      <div className="panel">
        <GameSearch
          key={selected}
          platform={platformCode}
          onSelect={(g) => navigate(gamePath(g))}
          autoFocus
          label={`Rechercher un jeu${current ? ` ${current.name}` : ''} (titre, titre japonais ou européen, code produit…)`}
        />
      </div>

      <p className="center">
        <Link to="/catalogue" className="button"><PsSymbol shape="square" /> Parcourir le catalogue complet</Link>
      </p>
    </section>
  );
}
