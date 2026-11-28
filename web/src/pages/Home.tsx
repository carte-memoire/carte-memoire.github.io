import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ConsoleFamilyArt, hasConsoleArt } from '../components/ConsoleArt';
import { ControllerButtons } from '../components/ControllerButtons';
import { CountUp } from '../components/CountUp';
import { CoverWall } from '../components/CoverWall';
import { GameSearch } from '../components/GameSearch';
import { HelpWanted } from '../components/HelpWanted';
import { ProgressStrip } from '../components/ProgressStrip';
import { useScanner } from '../components/Scanner';
import type { PsShape } from '../components/PsSymbol';
import { useAuth } from '../auth/AuthContext';
import { formatNumber, gamePath, searchShortcut } from '../lib/format';
import { usePlatforms } from '../lib/usePlatforms';
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

function Welcome({ consoleNames }: { consoleNames: string }) {
  return (
    <section className="panel welcome" aria-labelledby="bienvenue">
      <h2 id="bienvenue">{tr('Bienvenue sur Carte Mémoire')}</h2>
      <p className="welcome-intro">
        {tr('La base de données collaborative des jeux vidéo, faite par et pour les collectionneurs : pour l’instant les jeux {0}. Retrouve toutes les versions de tes jeux et range ta collection au même endroit, gratuitement et sans publicité.', consoleNames)}
      </p>
      <ul className="welcome-grid">
        {FEATURES.map((f) => (
          <li key={f.shape} className={`welcome-card welcome-${f.shape}`}>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </li>
        ))}
      </ul>
      <p className="welcome-actions">
        <Link to="/inscription" className="button button-primary">{tr('Créer mon compte gratuit')}</Link>
        <span className="muted">{tr('Déjà inscrit ?')} <Link to="/connexion">{tr('Se connecter')}</Link></span>
      </p>
    </section>
  );
}

// « PlayStation et PlayStation 2 », « A, B et C »
function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')}${tr(' et ')}${names[names.length - 1]}`;
}

// L'accueil : la recherche d'abord, puis les jaquettes (ce que le site a de plus beau),
// les consoles, et pour qui découvre le site, ce qu'on peut y faire
export function Home() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const scanner = useScanner();
  // Seulement les consoles qui ont des jeux
  const platforms = usePlatforms().filter((p) => p.game_count > 0);
  const total = platforms.reduce((sum, p) => sum + p.game_count, 0);
  const [params] = useSearchParams();
  // Arrivée après « Supprimer mon compte » (rechargement complet, voir Account.tsx)
  const accountDeleted = params.get('compte') === 'supprime';
  const jrpg = searchShortcut('jrpg');

  return (
    <section className="home">
      {/* Ce qu'est le site, dit d'emblée : gérer sa collection de jeux vidéo */}
      <div className="hero">
        <h1 className="hero-title">{tr('Ta collection de jeux vidéo, version par version.')}</h1>
        <p className="hero-subtitle">
          {tr('Le site pour gérer ta collection de jeux vidéo : range tes jeux, suis ce qui te manque et partage-la, gratuitement et sans publicité.')}
        </p>
        <p className="hero-meta">
          {total > 0 && <><strong className="hero-count"><CountUp value={total} /></strong>{tr(' jeux {0}', joinNames(platforms.map((p) => p.name)))} · </>}
          {tr('Black Label, Platinum, versions japonaises et américaines…')}
        </p>
      </div>

      {accountDeleted && <p className="success center">{tr("Ton compte a bien été supprimé. Merci d'être passé par Carte Mémoire !")}</p>}

      <div className="panel home-search">
        <GameSearch
          onSelect={(g) => navigate(gamePath(g))}
          onSelectStudio={(s) => navigate(`/catalogue?studio=${s.id}`)}
          action={(
            <button type="button" className="button scan-button" onClick={scanner.open} title={tr("Scanner le code-barres de la boîte : la fiche de ta version s'ouvre directement")}>
              <ScanIcon /> <span className="scan-button-label">{tr('Scanner')}</span>
            </button>
          )}
          autoFocus
          proposeMissing
          placeholder={tr('Titre ou code produit')}
          label={tr('Rechercher un jeu{0} ou un studio (titre, titre japonais ou européen, code produit…)', '')}
        />
        <p className="home-shortcuts small">
          <span className="muted">{tr('Accès directs :')}</span>{' '}
          <Link to="/catalogue">{tr('tout le catalogue')}</Link>
          {jrpg && <> · <Link to={jrpg.to}>{tr('les JRPG')}</Link></>}
          {session && <> · <Link to="/collection">{tr('ma collection')}</Link></>}
        </p>
      </div>

      {/* Membre : sa carte mémoire, d'un coup d'œil (seulement s'il a déjà des jeux) */}
      {session && <ProgressStrip to="/collection" label={tr('Ta collection : ')} more={tr('Ouvrir')} hideEmpty />}

      <CoverWall />

      {platforms.length > 0 && (
        <section className="home-section" aria-labelledby="par-console">
          <div className="section-head">
            <h2 id="par-console">{tr('Par console')}</h2>
            <Link to="/catalogue" className="small">{tr('Tout le catalogue')} <span aria-hidden="true">→</span></Link>
          </div>
          <ul className="platform-cards">
            {platforms.map((p) => (
              <li key={p.short_name}>
                <Link to={`/catalogue?console=${encodeURIComponent(p.short_name)}`} className="platform-card">
                  <span className="platform-card-art" aria-hidden="true">
                    {hasConsoleArt(p.short_name) ? <ConsoleFamilyArt platform={p.short_name} /> : <span className="buttons-legend"><ControllerButtons platform={p.short_name} /></span>}
                  </span>
                  <span className="platform-card-name">{p.name}</span>
                  <span className="platform-card-count">{tr('{0} jeux', formatNumber(p.game_count))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pour qui découvre le site ; les membres connectés le connaissent déjà */}
      {!loading && !session && <Welcome consoleNames={joinNames(platforms.map((p) => p.name))} />}
      {/* Ce qui manque encore, et comment aider (tout le monde) */}
      {!loading && <HelpWanted signedIn={Boolean(session)} />}
    </section>
  );
}
