import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { safeNext } from '../auth/RequireAuth';
import { PsSymbol } from '../components/PsSymbol';
import { CodeInput } from '../components/CodeInput';
import { tr } from '../lib/i18n';

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
