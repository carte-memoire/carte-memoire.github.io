import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

export function Layout() {
  const { session, profile, signOut, isModerator } = useAuth();
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
        <nav className="nav" aria-label="Navigation principale">
          <NavLink to="/" end>Rechercher</NavLink>
          <NavLink to="/catalogue">Catalogue</NavLink>
          <NavLink to="/collection">Ma collection</NavLink>
          <NavLink to="/proposer">Proposer un jeu</NavLink>
          {isModerator && (
            <NavLink to="/moderation">
              Modération{pending > 0 && <span className="count-badge" aria-label={`${pending} en attente`}>{pending}</span>}
            </NavLink>
          )}
        </nav>
        <div className="account">
          {session ? (
            <details className="account-menu">
              <summary>{profile?.username ?? 'Mon compte'}</summary>
              <div className="account-menu-panel">
                <Link to="/compte">Mon compte et sécurité</Link>
                <Link to="/mes-propositions">Mes propositions</Link>
                <button type="button" className="link-button" onClick={() => signOut()}>Se déconnecter</button>
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
        <p className="footer-note">Site de fans, sans lien avec Sony Interactive Entertainment. « PlayStation » est une marque de Sony.</p>
      </footer>
    </div>
  );
}
