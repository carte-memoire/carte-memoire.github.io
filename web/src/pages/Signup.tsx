import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { PasswordRules, passwordIsValid } from '../components/PasswordRules';
import { PsSymbol } from '../components/PsSymbol';
import { EmailCodeForm } from '../components/EmailCodeForm';
import { useAuth } from '../auth/AuthContext';
import { TERMS_VERSION } from './Legal';

const USERNAME = /^[A-Za-z0-9_-]{3,30}$/;

export function Signup() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!USERNAME.test(username)) return setError('Pseudo : 3 à 30 caractères, lettres, chiffres, « _ » ou « - ».');
    if (!passwordIsValid(password)) return setError('Le mot de passe ne respecte pas toutes les règles.');
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    if (!accepted) return setError("Pour créer un compte, accepte les conditions d'utilisation.");
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Version des conditions acceptées, gardée avec le compte (preuve de l'acceptation)
        data: { username, terms_version: TERMS_VERSION },
        emailRedirectTo: `${window.location.origin}/connexion?confirme=1`,
      },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    // Même message que l'adresse ait déjà un compte ou non : on ne révèle pas qui est inscrit
    setSent(true);
  }

  if (sent) {
    return (
      <section className="panel narrow">
        <h1>Vérifie ta boîte mail</h1>
        <p>
          Si <strong>{email.trim()}</strong> n'a pas encore de compte, un e-mail vient de t'être envoyé, avec un code à
          6 chiffres et un lien de confirmation (valables 30 minutes).
        </p>
        <EmailCodeForm
          email={email.trim()}
          type="email"
          onVerified={async () => { await refresh(); navigate('/collection', { replace: true }); }}
          onResend={() => supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/connexion?confirme=1` } })}
        />
        <p className="small center"><Link to="/connexion"><PsSymbol shape="circle" /> Retour à la connexion</Link></p>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <h1>Créer un compte</h1>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span className="field-label">Pseudo</span>
          <input autoComplete="nickname" required value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
          <span className="hint">Visible par les autres. 3 à 30 caractères : lettres, chiffres, « _ » ou « - ».</span>
        </label>
        <label className="field">
          <span className="field-label">Adresse e-mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          <span className="hint">Jamais affichée : elle sert uniquement à te connecter.</span>
        </label>
        <label className="field">
          <span className="field-label">Mot de passe</span>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
        </label>
        <PasswordRules password={password} />
        <label className="field">
          <span className="field-label">Confirmer le mot de passe</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
        </label>
        <label className="consent">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            J'ai lu et j'accepte les <Link to="/conditions" target="_blank">conditions d'utilisation</Link> ; mes données sont
            traitées comme l'explique la page <Link to="/confidentialite" target="_blank">confidentialité</Link>.
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary button-block" disabled={busy}><PsSymbol shape="cross" /> Créer mon compte</button>
        <p className="muted small">Une fois connecté, tu pourras ajouter une passkey et la double authentification dans « Mon compte ».</p>
      </form>
    </section>
  );
}
