import { lazy, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './auth/RequireAuth';
import { Home } from './pages/Home';
import { GamePage } from './pages/GamePage';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { loadOrReload } from './lib/reload';

// Pages chargées seulement quand on y va (le premier affichage reste léger) :
// tout ce qui sert après la connexion, la modération, les comptes. Après une mise à jour
// du site, un onglet resté ouvert se recharge pour trouver les nouvelles pages
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => loadOrReload(load).then((m) => ({ default: m[name] })));
const Catalog = page(() => import('./pages/Catalog'), 'Catalog');
const Collection = page(() => import('./pages/Collection'), 'Collection');
const EditGame = page(() => import('./pages/EditGame'), 'EditGame');
const Moderation = page(() => import('./pages/Moderation'), 'Moderation');
const ProposeGame = page(() => import('./pages/ProposeGame'), 'ProposeGame');
const MySubmissions = page(() => import('./pages/MySubmissions'), 'MySubmissions');
const Account = page(() => import('./pages/Account'), 'Account');
const Signup = page(() => import('./pages/Signup'), 'Signup');
const ForgotPassword = page(() => import('./pages/ForgotPassword'), 'ForgotPassword');
const ResetPassword = page(() => import('./pages/ResetPassword'), 'ResetPassword');
const MfaChallenge = page(() => import('./pages/MfaChallenge'), 'MfaChallenge');
const LegalNotice = page(() => import('./pages/Legal'), 'LegalNotice');
const Privacy = page(() => import('./pages/Legal'), 'Privacy');
const Terms = page(() => import('./pages/Legal'), 'Terms');
const ScannerPage = page(() => import('./pages/Scanner'), 'ScannerPage');
const MemberPage = page(() => import('./pages/Member'), 'MemberPage');
const TrophiesPage = page(() => import('./pages/Trophies'), 'TrophiesPage');

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="catalogue" element={<Catalog />} />
        {/* /jeu/ps1/final-fantasy-vii ; anciennes adresses /jeu/36-final-fantasy-vii : corrigées par la fiche */}
        <Route path="jeu/:console/:slug" element={<GamePage />} />
        <Route path="jeu/:id" element={<GamePage />} />
        <Route path="jeu/:id/modifier" element={<RequireAuth moderator><EditGame /></RequireAuth>} />
        <Route path="connexion" element={<Login />} />
        <Route path="connexion/verification" element={<MfaChallenge />} />
        <Route path="inscription" element={<Signup />} />
        <Route path="mot-de-passe-oublie" element={<ForgotPassword />} />
        <Route path="reinitialiser" element={<ResetPassword />} />
        <Route path="compte" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="collection" element={<RequireAuth><Collection /></RequireAuth>} />
        <Route path="proposer" element={<RequireAuth><ProposeGame /></RequireAuth>} />
        <Route path="mes-propositions" element={<RequireAuth><MySubmissions /></RequireAuth>} />
        <Route path="trophees" element={<RequireAuth><TrophiesPage /></RequireAuth>} />
        <Route path="moderation" element={<RequireAuth moderator><Moderation /></RequireAuth>} />
        <Route path="scanner" element={<ScannerPage />} />
        <Route path="membre/:pseudo" element={<MemberPage />} />
        <Route path="mentions-legales" element={<LegalNotice />} />
        <Route path="conditions" element={<Terms />} />
        <Route path="confidentialite" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
