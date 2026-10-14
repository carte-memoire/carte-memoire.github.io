import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EMAIL_CODES, supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { markRecovery } from '../lib/preferences';
import { useAuth } from '../auth/AuthContext';
import { EmailCodeForm } from '../components/EmailCodeForm';
import { PsSymbol } from '../components/PsSymbol';
import { tr } from '../lib/i18n';
import { usePageTitle } from '../lib/title';

export function ForgotPassword() {
  usePageTitle(tr('Mot de passe oublié'));
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
      <h1>{tr('Mot de passe oublié')}</h1>
      {sent ? (
        <>
          <p>
            {tr('Si un compte existe avec ')}<strong>{email.trim()}</strong>{tr(", un e-mail vient d'être envoyé")}
            {EMAIL_CODES ? tr(', avec un code à 6 chiffres et un lien (valables 30 minutes).') : tr(', avec un lien valable 30 minutes.')}
          </p>
          <p className="muted small">
            {EMAIL_CODES ? tr("Le code marche depuis n'importe quel appareil ; le lien, seulement dans ce navigateur-ci.")
              : tr('Ouvre le lien dans ce navigateur-ci : par sécurité, il ne marche pas ailleurs.')}
          </p>
          <EmailCodeForm email={email.trim()} type="recovery" onVerified={verified} onResend={send} />
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <label className="field">
            <span className="field-label">{tr('Adresse e-mail')}</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary button-block" disabled={busy}><PsSymbol shape="cross" /> {EMAIL_CODES ? tr('Recevoir un code') : tr('Recevoir un lien')}</button>
        </form>
      )}
      <p className="small center"><Link to="/connexion"><PsSymbol shape="circle" />{tr(' Retour à la connexion')}</Link></p>
    </section>
  );
}
