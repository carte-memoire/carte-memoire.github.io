import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { useConfirm } from './Confirm';
import { NavIcon, type NavIconName } from './NavIcon';
import { ScannerProvider, useScanner } from './Scanner';
import { IdleLogout } from '../auth/IdleLogout';

// Chaque rubrique prend la couleur d'un bouton de la manette quand on s'y trouve
const LINKS: { to: string; label: string; short?: string; icon: NavIconName; accent: string }[] = [
  { to: '/', label: 'Rechercher', icon: 'search', accent: 'cross' },
  { to: '/catalogue', label: 'Catalogue', icon: 'catalog', accent: 'square' },
  { to: '/collection', label: 'Ma collection', short: 'Collection', icon: 'collection', accent: 'triangle' },
  { to: '/proposer', label: 'Proposer un jeu', short: 'Proposer', icon: 'propose', accent: 'circle' },
];

// Libellé long sur grand écran, court quand la place manque
function NavLabel({ long, short }: { long: string; short?: string }) {
  if (!short) return <span className="nav-label">{long}</span>;
  return (
    <>
      <span className="nav-label nav-label-long">{long}</span>
      <span className="nav-label nav-label-short">{short}</span>
    </>
  );
}

export function Layout() {
  return (
    <ScannerProvider>
      <Frame />
    </ScannerProvider>
  );
}

// Téléphone relié au scanner (depuis l'ordinateur) : on le rappelle, et on peut délier
function PhoneLinkBadge() {
  const { linked, unlink } = useScanner();
  if (!linked) return null;
  return (
    <button type="button" className="phone-link" onClick={unlink} title="Le téléphone envoie ses scans à cet ordinateur. Cliquer pour délier.">
      <span aria-hidden="true">📱</span> Relié <span className="sr-only">: délier le téléphone</span>
    </button>
  );
}

function Frame() {
  const { session, profile, signOut, isModerator } = useAuth();
  const confirm = useConfirm();

  async function confirmSignOut() {
    if (await confirm({
      title: 'Se déconnecter',
      message: 'Tu devras te reconnecter pour retrouver ta collection (mot de passe ou passkey, et ton code si la double authentification est activée).',
      confirmLabel: 'Se déconnecter',
    })) await signOut();
  }
  const location = useLocation();
  const [pending, setPending] = useState(0);

  // Modérateurs : nombre de propositions en attente, rafraîchi à chaque page
  useEffect(() => {
    if (!isModerator) return;
    supabase.from('submission').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPending(count ?? 0));
  }, [isModerator, location.pathname]);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo" aria-label="Carte Mémoire, accueil">
          <span className="logo-card" aria-hidden="true" />
          <span className="logo-text">Carte Mémoire</span>
        </Link>
        {/* Ordinateur : dans la barre du haut. Téléphone et tablette : barre d'onglets
            fixée en bas de l'écran, à portée de pouce (voir styles.css) */}
        <nav className="nav" aria-label="Navigation principale">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={`nav-link nav-${link.accent}`}>
              <NavIcon name={link.icon} />
              <NavLabel long={link.label} short={link.short} />
            </NavLink>
          ))}
          {isModerator && (
            <NavLink to="/moderation" className="nav-link nav-gold">
              <NavIcon name="moderation" />
              <NavLabel long="Modération" />
              {pending > 0 && <span className="count-badge" aria-label={`${pending} en attente`}>{pending}</span>}
            </NavLink>
          )}
        </nav>
        <div className="account">
          <PhoneLinkBadge />
          {session ? (
            <details className="account-menu">
              <summary>{profile?.username ?? 'Mon compte'}</summary>
              <div className="account-menu-panel">
                {profile && <Link to={`/membre/${encodeURIComponent(profile.username)}`}>Ma page publique</Link>}
                <Link to="/compte">Mon compte et sécurité</Link>
                <Link to="/mes-propositions">Mes propositions</Link>
                <button type="button" className="link-button" onClick={confirmSignOut}>Se déconnecter</button>
              </div>
            </details>
          ) : (
            <>
              <Link to="/connexion" className="button button-small">Connexion</Link>
              <Link to="/inscription" className="button button-small button-primary">Inscription</Link>
            </>
          )}
        </div>
      </header>

      {/* La clé change avec la page : l'animation d'arrivée se rejoue à chaque navigation */}
      <main className="main" key={location.pathname}>
        {/* Pages chargées à la demande : message d'attente le temps de les recevoir */}
        <Suspense fallback={<p className="loading">Lecture de la carte mémoire…</p>}>
          <Outlet />
        </Suspense>
      </main>

      {session && <IdleLogout />}

      <footer className="footer">
        <p>
          Catalogue publié sous licence{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.
          Données issues en partie de{' '}
          <a href="https://en.wikipedia.org/wiki/List_of_PlayStation_(console)_games_(A%E2%80%93L)" target="_blank" rel="noopener noreferrer">Wikipédia</a>{' '}
          et de <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a>.
        </p>
        <p className="footer-note">
          Les jaquettes et visuels des jeux appartiennent à leurs éditeurs respectifs et ne sont pas couverts par la licence du catalogue.
        </p>
        <p className="footer-note">
          Site de fans indépendant, sans lien avec les constructeurs ni les éditeurs. Les noms de consoles et de jeux sont des marques
          de leurs propriétaires respectifs.
        </p>
        <p className="footer-note">
          Imaginé par Nameho, programmé avec l'aide d'une IA ·{' '}
          <a href="https://github.com/carte-memoire/carte-memoire.github.io" target="_blank" rel="noopener noreferrer">code source</a>
        </p>
        <p className="footer-note">
          <Link to="/mentions-legales">Mentions légales</Link> · <Link to="/conditions">Conditions d'utilisation</Link> ·{' '}
          <Link to="/confidentialite">Confidentialité</Link>
        </p>
      </footer>
    </div>
  );
}
