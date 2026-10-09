import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { PsSymbol } from '../components/PsSymbol';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reinitialiser`,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSent(true);
  }

  return (
    <section className="panel narrow">
      <h1>Mot de passe oublié</h1>
      {sent ? (
        <p>Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé (valable 30 minutes).</p>
      ) : (
        <form onSubmit={submit} className="form">
          <label className="field">
            <span className="field-label">Adresse e-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary button-block" disabled={busy}><PsSymbol shape="cross" /> Recevoir un lien</button>
        </form>
      )}
      <p className="small center"><Link to="/connexion"><PsSymbol shape="circle" /> Retour à la connexion</Link></p>
    </section>
  );
}
