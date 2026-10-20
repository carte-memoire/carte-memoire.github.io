import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ConsoleShowcase } from '../components/ConsoleArt';
import { CountUp } from '../components/CountUp';
import { GameSearch } from '../components/GameSearch';
import { useScanner } from '../components/Scanner';
import { PlatformSelect } from '../components/PlatformSelect';
import { PsSymbol, type PsShape } from '../components/PsSymbol';
import { useAuth } from '../auth/AuthContext';
import { gamePath } from '../lib/format';
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

// Ce que propose le site, pour qui arrive sans le connaître (visiteurs non connectés)
const FEATURES: { shape: PsShape; title: string; text: string }[] = [
  { shape: 'triangle', title: tr('Explore'), text: tr('Chaque jeu, version par version : Black Label, Platinum, versions japonaises et américaines, codes produit, langues et jaquettes.') },
  { shape: 'circle', title: tr('Collectionne'), text: tr('Coche les versions que tu possèdes ou que tu cherches, note leur état et leur prix, suis ta progression et partage ta collection.') },
  { shape: 'cross', title: tr('Scanne'), text: tr('Vise le code-barres de la boîte avec ton téléphone : la fiche de ta version s’ouvre directement.') },
  { shape: 'square', title: tr('Contribue'), text: tr('Un jeu, une version ou une jaquette manque ? Propose-les : les modérateurs vérifient avant de les publier.') },
];

function Welcome() {
  return (
    <section className="panel welcome" aria-labelledby="bienvenue">
      <h2 id="bienvenue">{tr('Bienvenue sur Carte Mémoire')}</h2>
      <p className="welcome-intro">
        {tr('La base de données collaborative des jeux vidéo, faite par et pour les collectionneurs : pour l’instant les jeux PlayStation et PlayStation 2. Retrouve toutes les versions de tes jeux et range ta collection au même endroit, gratuitement et sans publicité.')}
      </p>
      <ul className="welcome-grid">
        {FEATURES.map((f) => (
          <li key={f.shape} className={`welcome-card welcome-${f.shape}`}>
            <h3><PsSymbol shape={f.shape} colored /> {f.title}</h3>
            <p>{f.text}</p>
          </li>
        ))}
      </ul>
      <p className="welcome-actions">
        <Link to="/inscription" className="button button-primary"><PsSymbol shape="cross" />{tr(' Créer mon compte gratuit')}</Link>
        <span className="muted">{tr('Déjà inscrit ?')} <Link to="/connexion">{tr('Se connecter')}</Link></span>
      </p>
    </section>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
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
  // « Les {0} jeux » : le nombre défile jusqu'à sa valeur, au milieu de la phrase traduite
  const [countBefore, countAfter] = tr('Les {0} jeux', '{n}').split('{n}');

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
          {gameCount ? <>{countBefore}<CountUp value={gameCount} />{countAfter}</> : tr('Les jeux')}{platformCode ? tr(' de la') : ''}{' '}
          <PlatformSelect value={selected} onChange={choose} />{tr(', version par version. Et ta collection.')}
        </p>
        {/* La console choisie, dessinée (ou les boutons de la manette), animée à chaque changement */}
        <ConsoleShowcase platform={selected} />
      </div>

      {accountDeleted && <p className="success center">{tr("Ton compte a bien été supprimé. Merci d'être passé par Carte Mémoire !")}</p>}

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
          proposeMissing
          label={tr('Rechercher un jeu{0} ou un studio (titre, titre japonais ou européen, code produit…)', current ? ` ${current.name}` : '')}
        />
      </div>

      {/* Sous la recherche, pour qu'elle reste à sa place quand on change de console */}
      {current && current.game_count === 0 && (
        <p className="notice center">
          {tr('Pas encore de jeux ')}<strong>{current.name}</strong>{tr(' dans la base : on commence par la PlayStation.')}{' '}
          <Link to="/proposer">{tr('Propose le premier !')}</Link>
        </p>
      )}

      <p className="center">
        <Link to="/catalogue" className="button"><PsSymbol shape="square" />{tr(' Parcourir le catalogue complet')}</Link>
      </p>

      {/* Pour qui découvre le site ; les membres connectés le connaissent déjà */}
      {!loading && !session && <Welcome />}
    </section>
  );
}
