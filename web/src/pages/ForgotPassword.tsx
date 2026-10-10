import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { markRecovery } from '../lib/preferences';
import { useAuth } from '../auth/AuthContext';
import { EmailCodeForm } from '../components/EmailCodeForm';
import { PsSymbol } from '../components/PsSymbol';

export function ForgotPassword() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = () => supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reinitialiser`,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await send();
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSent(true);
  }

  // Code valide : session de récupération ouverte, il ne reste qu'à choisir le mot de passe
  async function verified() {
    markRecovery(true);
    await refresh();
    navigate('/reinitialiser', { replace: true });
  }

  return (
    <section className="panel narrow">
      <h1>Mot de passe oublié</h1>
      {sent ? (
        <>
          <p>
            Si un compte existe avec <strong>{email.trim()}</strong>, un e-mail vient d'être envoyé, avec un code à 6 chiffres
            et un lien (valables 30 minutes).
          </p>
          <p className="muted small">
            Le code marche depuis n'importe quel appareil ; le lien, seulement dans ce navigateur-ci.
          </p>
          <EmailCodeForm email={email.trim()} type="recovery" onVerified={verified} onResend={send} />
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <label className="field">
            <span className="field-label">Adresse e-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary button-block" disabled={busy}><PsSymbol shape="cross" /> Recevoir un code</button>
        </form>
      )}
      <p className="small center"><Link to="/connexion"><PsSymbol shape="circle" /> Retour à la connexion</Link></p>
    </section>
  );
}
