import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { useConfirm } from './Confirm';
import { NavIcon, type NavIconName } from './NavIcon';
import { ScannerProvider, useScanner } from './Scanner';
import { IdleLogout } from '../auth/IdleLogout';
import { TrophyWatcher } from './TrophyWatcher';
import { tr, lang, setLanguage } from '../lib/i18n';

// Chaque rubrique prend la couleur d'un bouton de la manette quand on s'y trouve
const LINKS: { to: string; label: string; short?: string; icon: NavIconName; accent: string }[] = [
  { to: '/', label: tr('Rechercher'), icon: 'search', accent: 'cross' },
  { to: '/catalogue', label: tr('Catalogue'), icon: 'catalog', accent: 'square' },
  { to: '/collection', label: tr('Ma collection'), short: tr('Collection'), icon: 'collection', accent: 'triangle' },
  { to: '/proposer', label: tr('Proposer un jeu'), short: tr('Proposer'), icon: 'propose', accent: 'circle' },
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

// Langue du site : le bouton propose l'autre langue, écrit dans cette langue
function LanguageSwitch() {
  const next = lang === 'fr' ? 'en' : 'fr';
  return (
    <button type="button" className="lang-switch" lang={next} onClick={() => setLanguage(next)}
      title={next === 'en' ? 'Read this site in English' : 'Lire ce site en français'}
      aria-label={next === 'en' ? 'English version' : 'Version française'}>
      {next.toUpperCase()}
    </button>
  );
}

// Téléphone relié au scanner (depuis l'ordinateur) : on le rappelle, et on peut délier
function PhoneLinkBadge() {
  const { linked, unlink } = useScanner();
  if (!linked) return null;
  return (
    <button type="button" className="phone-link" onClick={unlink} title={tr('Le téléphone envoie ses scans à cet ordinateur. Cliquer pour délier.')}>
      <span aria-hidden="true">📱</span>{tr(' Relié ')}<span className="sr-only">{tr(': délier le téléphone')}</span>
    </button>
  );
}

function Frame() {
  const { session, profile, signOut, isModerator } = useAuth();
  const confirm = useConfirm();

  async function confirmSignOut() {
    if (await confirm({
      title: tr('Se déconnecter'),
      message: tr('Tu devras te reconnecter pour retrouver ta collection (mot de passe ou passkey, et ton code si la double authentification est activée).'),
      confirmLabel: tr('Se déconnecter'),
    })) await signOut();
  }
  const location = useLocation();
  const [pending, setPending] = useState(0);

  // Titre de l'onglet : celui du site à chaque page (une fiche de jeu y met son titre ensuite ;
  // une page ouverte directement arrive avec le titre écrit pour les moteurs de recherche)
  useLayoutEffect(() => { document.title = tr('Carte Mémoire'); }, [location.pathname]);

  // Modérateurs : nombre de propositions en attente, rafraîchi à chaque page
  useEffect(() => {
    if (!isModerator) return;
    supabase.from('submission').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPending(count ?? 0));
  }, [isModerator, location.pathname]);

  return (
    <div className="app">
      {/* Clavier et lecteurs d'écran : sauter le menu, aller directement à la page */}
      <a href="#contenu" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('contenu')?.focus(); }}>
        {tr('Aller au contenu')}
      </a>
      <header className="topbar">
        <Link to="/" className="logo" aria-label={tr('Carte Mémoire, accueil')}>
          <span className="logo-card" aria-hidden="true" />
          <span className="logo-text">{tr('Carte Mémoire')}</span>
        </Link>
        {/* Ordinateur : dans la barre du haut. Téléphone et tablette : barre d'onglets
            fixée en bas de l'écran, à portée de pouce (voir styles.css) */}
        <nav className="nav" aria-label={tr('Navigation principale')}>
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={`nav-link nav-${link.accent}`}>
              <NavIcon name={link.icon} />
              <NavLabel long={link.label} short={link.short} />
            </NavLink>
          ))}
          {isModerator && (
            <NavLink to="/moderation" className="nav-link nav-gold">
              <NavIcon name="moderation" />
              <NavLabel long={tr('Modération')} />
              {pending > 0 && <span className="count-badge" aria-label={tr('{0} en attente', pending)}>{pending}</span>}
            </NavLink>
          )}
        </nav>
        <div className="account">
          <LanguageSwitch />
          <PhoneLinkBadge />
          {session ? (
            <details className="account-menu">
              <summary>{profile?.username ?? tr('Mon compte')}</summary>
              <div className="account-menu-panel">
                {profile && <Link to={`/membre/${encodeURIComponent(profile.username)}`}>{tr('Ma page publique')}</Link>}
                <Link to="/trophees">{tr('Mes trophées')}</Link>
                <Link to="/compte">{tr('Mon compte et sécurité')}</Link>
                <Link to="/mes-propositions">{tr('Mes propositions')}</Link>
                <button type="button" className="link-button" onClick={confirmSignOut}>{tr('Se déconnecter')}</button>
              </div>
            </details>
          ) : (
            <>
              <Link to="/connexion" className="button button-small">{tr('Connexion')}</Link>
              <Link to="/inscription" className="button button-small button-primary">{tr('Inscription')}</Link>
            </>
          )}
        </div>
      </header>

      {/* La clé change avec la page : l'animation d'arrivée se rejoue à chaque navigation */}
      <main className="main" id="contenu" tabIndex={-1} key={location.pathname}>
        {/* Pages chargées à la demande : message d'attente le temps de les recevoir */}
        <Suspense fallback={<p className="loading">{tr('Lecture de la carte mémoire…')}</p>}>
          <Outlet />
        </Suspense>
      </main>

      {session && <IdleLogout />}
      {/* Trophées tout juste débloqués : annoncés en haut de l'écran */}
      {session && <TrophyWatcher userId={session.user.id} />}

      <footer className="footer">
        <p>
          {tr('Catalogue publié sous licence')}{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer">{tr('CC BY-SA 4.0')}</a>{tr('. Données issues en partie de')}{' '}
          {tr('Wikipédia')} (<a href="https://en.wikipedia.org/wiki/List_of_PlayStation_(console)_games_(A%E2%80%93L)" target="_blank" rel="noopener noreferrer">{tr('jeux PS1')}</a>,{' '}
          <a href="https://en.wikipedia.org/wiki/List_of_PlayStation_2_games_(A%E2%80%93K)" target="_blank" rel="noopener noreferrer">{tr('jeux PS2')}</a>){' '}
          {tr('et de ')}<a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">{tr('Wikidata')}</a>.
        </p>
        <p className="footer-note">
          {tr('Les jaquettes et visuels des jeux appartiennent à leurs éditeurs respectifs et ne sont pas couverts par la licence du catalogue.')}
        </p>
        <p className="footer-note">
          {tr('Site de fans indépendant, sans lien avec les constructeurs ni les éditeurs. Les noms de consoles et de jeux sont des marques de leurs propriétaires respectifs.')}
        </p>
        <p className="footer-note">
          {tr("Imaginé par Nameho, programmé avec l'aide d'une IA ·")}{' '}
          <a href="https://github.com/carte-memoire/carte-memoire.github.io" target="_blank" rel="noopener noreferrer">{tr('code source')}</a>
        </p>
        <p className="footer-note">
          <Link to="/mentions-legales">{tr('Mentions légales')}</Link> · <Link to="/conditions">{tr("Conditions d'utilisation")}</Link> ·{' '}
          <Link to="/confidentialite">{tr('Confidentialité')}</Link>
        </p>
      </footer>
    </div>
  );
}
