import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { safeNext } from '../auth/RequireAuth';
import { PsSymbol } from '../components/PsSymbol';

// Deuxième étape de connexion : code à 6 chiffres de l'application d'authentification
export function MfaChallenge() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { session, loading, refresh, signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate('/connexion', { replace: true });
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.[0];
      if (totp) setFactorId(totp.id);
      else navigate(next, { replace: true });
    });
  }, [loading, session, navigate, next]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setCode('');
      return setError(errorMessage(error));
    }
    await refresh();
    navigate(next, { replace: true });
  }

  return (
    <section className="panel narrow">
      <h1>Double authentification</h1>
      <p>Saisis le code à 6 chiffres affiché par ton application d'authentification.</p>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span className="field-label">Code</span>
          <input
            className="code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary button-block" disabled={busy || code.length !== 6}><PsSymbol shape="cross" /> Valider</button>
      </form>
      <p className="small center">
        <button type="button" className="link-button" onClick={() => signOut()}>Annuler et se déconnecter</button>
      </p>
    </section>
  );
}
