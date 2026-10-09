import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GameSearch } from '../components/GameSearch';
import { PsSymbol } from '../components/PsSymbol';
import { gamePath } from '../lib/format';
import { groupByManufacturer, usePlatforms } from '../lib/usePlatforms';

const ALL = 'toutes';
const DEFAULT_PLATFORM = 'PS1';
const STORAGE_KEY = 'carte-memoire:console';

// Dernière console choisie, retenue dans ce navigateur (simple confort)
function rememberedPlatform(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PLATFORM;
  } catch {
    return DEFAULT_PLATFORM;
  }
}

export function Home() {
  const navigate = useNavigate();
  const platforms = usePlatforms();
  const [params, setParams] = useSearchParams();
  const selected = params.get('console') ?? rememberedPlatform();
  const current = platforms.find((p) => p.short_name === selected);
  const platformCode = selected === ALL ? null : selected;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, selected); } catch { /* stockage indisponible : sans importance */ }
  }, [selected]);

  function choose(value: string) {
    // On mémorise AVANT de changer l'adresse : pour la PlayStation, l'adresse ne
    // porte plus de console et c'est la valeur mémorisée qui est relue.
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* stockage indisponible : sans importance */ }
    setParams(value === DEFAULT_PLATFORM ? {} : { console: value }, { replace: true });
  }

  return (
    <section className="home">
      <div className="hero">
        <h1 className="hero-title">Carte Mémoire</h1>
        <p className="hero-subtitle">
          Tous les jeux{' '}
          <span className="inline-select-wrap">
            <select className="inline-select" value={selected} onChange={(e) => choose(e.target.value)} aria-label="Choisir la console">
              <option value={ALL}>de toutes les consoles</option>
              {/* Tant que la liste n'est pas chargée, la console choisie reste affichée */}
              {platforms.length === 0 && selected !== ALL && <option value={selected}>{selected === 'PS1' ? 'PlayStation' : selected}</option>}
              {groupByManufacturer(platforms).map(([maker, list]) => (
                <optgroup key={maker} label={maker}>
                  {list.map((p) => (
                    <option key={p.short_name} value={p.short_name}>
                      {p.name}{p.game_count === 0 ? ' (bientôt)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </span>
          , version par version. Et ta collection.
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
    </section>
  );
}
