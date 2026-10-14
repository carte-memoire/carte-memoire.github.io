import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { safeNext } from '../auth/RequireAuth';
import { PsSymbol } from '../components/PsSymbol';
import { CodeInput } from '../components/CodeInput';
import { browserLabel, rememberTrust } from '../lib/trust';
import { tr } from '../lib/i18n';
import { usePageTitle } from '../lib/title';

// Deuxième étape de connexion : code à 6 chiffres de l'application d'authentification
export function MfaChallenge() {
  usePageTitle(tr('Double authentification'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { session, loading, refresh, signOut, needsMfa } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // « Faire confiance à ce navigateur » : décoché par défaut
  const [trust, setTrust] = useState(false);

  // Session déjà reconnue (passkey, navigateur de confiance) : pas de code
  useEffect(() => {
    if (!loading && session && !needsMfa) navigate(next, { replace: true });
  }, [loading, session, needsMfa, navigate, next]);

  useEffect(() => {
    if (!loading && !session) navigate('/connexion', { replace: true });
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.[0];
      if (totp) setFactorId(totp.id);
      else navigate(next, { replace: true });
    });
  }, [loading, session, navigate, next]);

  async function verify(value: string) {
    if (!factorId || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: value });
    setBusy(false);
    if (error) {
      setCode('');
      return setError(errorMessage(error));
    }
    if (trust && session) {
      const { data: token } = await supabase.rpc('trust_this_browser', { label: browserLabel() });
      if (typeof token === 'string') rememberTrust(session.user.id, token);
    }
    await refresh();
    navigate(next, { replace: true });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    verify(code);
  }

  return (
    <section className="panel narrow">
      <h1>{tr('Double authentification')}</h1>
      <p>{tr("Saisis le code à 6 chiffres affiché par ton application d'authentification.")}</p>
      <form onSubmit={submit} className="form">
        <label className="check-row">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
          <span>
            {tr('Faire confiance à ce navigateur pendant 30 jours')}
            <span className="hint">{tr("Le code ne sera plus demandé ici (le mot de passe, si). Pas sur un ordinateur partagé. Tu pourras le retirer dans Mon compte.")}</span>
          </span>
        </label>
        <CodeInput label={tr("Code de l'application d'authentification")} value={code} onChange={setCode} onComplete={verify} disabled={busy} autoFocus />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary button-block" disabled={busy || code.length !== 6}><PsSymbol shape="cross" />{tr(' Valider')}</button>
      </form>
      <p className="small center">
        <button type="button" className="link-button" onClick={() => signOut()}>{tr('Annuler et se déconnecter')}</button>
      </p>
    </section>
  );
}
