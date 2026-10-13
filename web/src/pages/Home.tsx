import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ControllerButtons } from '../components/ControllerButtons';
import { ConsoleArt, hasConsoleArt } from '../components/ConsoleArt';
import { GameSearch } from '../components/GameSearch';
import { useScanner } from '../components/Scanner';
import { PlatformSelect } from '../components/PlatformSelect';
import { PsSymbol } from '../components/PsSymbol';
import { formatNumber, gamePath } from '../lib/format';
import { ALL_PLATFORMS, DEFAULT_PLATFORM, rememberPlatform, rememberedPlatform } from '../lib/preferences';
import { useKnownPlatform, usePlatforms } from '../lib/usePlatforms';
import { tr } from '../lib/i18n';

// Un code-barres
function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="nav-icon" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M7 8v8M10 8v8M13 8v8M16 8v8M18 8v8" />
    </svg>
  );
}

export function Home() {
  const navigate = useNavigate();
  const scanner = useScanner();
  const platforms = usePlatforms();
  const [params, setParams] = useSearchParams();
  // Arrivée après « Supprimer mon compte » (rechargement complet, voir Account.tsx)
  const accountDeleted = params.get('compte') === 'supprime';
  const selected = useKnownPlatform(params.get('console') ?? rememberedPlatform());
  const current = platforms.find((p) => p.short_name === selected);
  const platformCode = selected === ALL_PLATFORMS ? null : selected;
  // Nombre de jeux de la console choisie (ou de toutes), dès que la liste des consoles est lue
  const gameCount = platformCode ? current?.game_count : platforms.reduce((n, p) => n + p.game_count, 0);

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
        <h1 className="hero-title">{tr('Carte Mémoire')}</h1>
        <p className="hero-subtitle">
          {gameCount ? tr('Les {0} jeux', formatNumber(gameCount)) : tr('Les jeux')}{platformCode ? tr(' de la') : ''}{' '}
          <PlatformSelect value={selected} onChange={choose} />{tr(', version par version. Et ta collection.')}
        </p>
        {/* La console choisie, dessinée ; sinon les boutons de sa manette (rejoués à chaque changement) */}
        {hasConsoleArt(selected) ? (
          <div className="console-stage" key={selected}><ConsoleArt platform={selected} /></div>
        ) : (
          <p className="buttons-legend" aria-hidden="true" key={selected}>
            <ControllerButtons platform={selected} />
          </p>
        )}
      </div>

      {accountDeleted && <p className="success center">{tr("Ton compte a bien été supprimé. Merci d'être passé par Carte Mémoire !")}</p>}

      {current && current.game_count === 0 && (
        <p className="notice center">
          {tr('Pas encore de jeux ')}<strong>{current.name}</strong>{tr(' dans la base : on commence par la PlayStation.')}{' '}
          <Link to="/proposer">{tr('Propose le premier !')}</Link>
        </p>
      )}

      <div className="panel">
        <GameSearch
          key={selected}
          platform={platformCode}
          onSelect={(g) => navigate(gamePath(g))}
          onSelectStudio={(s) => navigate(`/catalogue?studio=${s.id}`)}
          action={(
            <button type="button" className="button scan-button" onClick={scanner.open} title={tr("Scanner le code-barres de la boîte : la fiche de ta version s'ouvre directement")}>
              <ScanIcon /> <span className="scan-button-label">{tr('Scanner')}</span>
            </button>
          )}
          autoFocus
          label={tr('Rechercher un jeu{0} ou un studio (titre, titre japonais ou européen, code produit…)', current ? ` ${current.name}` : '')}
        />
      </div>

      <p className="center">
        <Link to="/catalogue" className="button"><PsSymbol shape="square" />{tr(' Parcourir le catalogue complet')}</Link>
      </p>
    </section>
  );
}
