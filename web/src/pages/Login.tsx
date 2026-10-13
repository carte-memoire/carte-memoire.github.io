import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { safeNext } from '../auth/RequireAuth';
import { PsSymbol } from '../components/PsSymbol';
import { tr } from '../lib/i18n';

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passkeysSupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window;

  // Après connexion : vérification du second facteur si l'utilisateur l'a activé
  async function afterSignIn() {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
      navigate(`/connexion/verification?next=${encodeURIComponent(next)}`, { replace: true });
    } else {
      navigate(next, { replace: true });
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await afterSignIn();
  }

  async function signInWithPasskey() {
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPasskey();
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await afterSignIn();
  }

  return (
    <section className="panel narrow">
      <h1>{tr('Connexion')}</h1>
      {params.get('confirme') && <p className="success">{tr('Adresse e-mail confirmée : tu peux te connecter.')}</p>}
      {params.get('raison') === 'inactivite' && (
        <p className="notice">{tr('Tu as été déconnecté après une période sans activité, pour protéger ton compte. Reconnecte-toi pour reprendre où tu en étais.')}</p>
      )}

      {passkeysSupported && (
        <>
          <button type="button" className="button button-primary button-block" onClick={signInWithPasskey} disabled={busy}>
            <PsSymbol shape="triangle" />{tr(' Se connecter avec une passkey')}
          </button>
          <p className="muted small center">{tr('Empreinte, visage, Windows Hello ou clé de sécurité : la méthode la plus sûre.')}</p>
          <p className="separator"><span>ou</span></p>
        </>
      )}

      <form onSubmit={signInWithPassword} className="form">
        <label className="field">
          <span className="field-label">{tr('Adresse e-mail')}</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </label>
        <label className="field">
          <span className="field-label">{tr('Mot de passe')}</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button button-block" disabled={busy}><PsSymbol shape="cross" />{tr(' Se connecter')}</button>
      </form>

      <p className="small center">
        <Link to="/mot-de-passe-oublie">{tr('Mot de passe oublié ?')}</Link> · <Link to="/inscription">{tr('Créer un compte')}</Link>
      </p>
    </section>
  );
}
