import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { session, profile, signOut } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo" aria-label="Carte Mémoire, accueil">
          <span className="logo-card" aria-hidden="true" />
          <span className="logo-text">Carte Mémoire</span>
        </Link>
        <nav className="nav" aria-label="Navigation principale">
          <NavLink to="/" end>Rechercher</NavLink>
          <NavLink to="/collection">Ma collection</NavLink>
          <NavLink to="/proposer">Proposer un jeu</NavLink>
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

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <p>
          Catalogue publié sous licence{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.
          Données issues en partie de{' '}
          <a href="https://en.wikipedia.org/wiki/List_of_PlayStation_(console)_games_(A%E2%80%93L)" target="_blank" rel="noopener noreferrer">Wikipédia</a>{' '}
          et de <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a>.
        </p>
        <p className="footer-note">Site de fans, sans lien avec Sony Interactive Entertainment. « PlayStation » est une marque de Sony.</p>
      </footer>
    </div>
  );
}
