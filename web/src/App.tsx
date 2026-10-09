import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './auth/RequireAuth';
import { Home } from './pages/Home';
import { GamePage } from './pages/GamePage';
import { EditGame } from './pages/EditGame';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { MfaChallenge } from './pages/MfaChallenge';
import { Account } from './pages/Account';
import { Collection } from './pages/Collection';
import { ProposeGame } from './pages/ProposeGame';
import { MySubmissions } from './pages/MySubmissions';
import { Moderation } from './pages/Moderation';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
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
        <Route path="moderation" element={<RequireAuth moderator><Moderation /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
