import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EMAIL_CODES, supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { PasswordRules, passwordIsValid } from '../components/PasswordRules';
import { PsSymbol } from '../components/PsSymbol';
import { EmailCodeForm } from '../components/EmailCodeForm';
import { useAuth } from '../auth/AuthContext';
import { TERMS_VERSION } from './Legal';
import { lang, tr } from '../lib/i18n';

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
    if (!USERNAME.test(username)) return setError(tr('Pseudo : 3 à 30 caractères, lettres, chiffres, « _ » ou « - ».'));
    if (!passwordIsValid(password)) return setError(tr('Le mot de passe ne respecte pas toutes les règles.'));
    if (password !== confirm) return setError(tr('Les deux mots de passe ne sont pas identiques.'));
    if (!accepted) return setError(tr("Pour créer un compte, accepte les conditions d'utilisation."));
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Version des conditions acceptées, gardée avec le compte (preuve de l'acceptation) ;
        // langue du site : celle des e-mails envoyés au compte (confirmation, mot de passe…)
        data: { username, terms_version: TERMS_VERSION, lang },
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
        <h1>{tr('Vérifie ta boîte mail')}</h1>
        <p>
          Si <strong>{email.trim()}</strong>{tr(" n'a pas encore de compte, un e-mail vient de t'être envoyé")}
          {EMAIL_CODES ? tr(', avec un code à 6 chiffres et un lien de confirmation (valables 30 minutes).')
            : tr(' : clique sur son lien pour confirmer ton adresse (valable 30 minutes).')}
        </p>
        <EmailCodeForm
          email={email.trim()}
          type="email"
          onVerified={async () => { await refresh(); navigate('/collection', { replace: true }); }}
          onResend={() => supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/connexion?confirme=1` } })}
        />
        <p className="small center"><Link to="/connexion"><PsSymbol shape="circle" />{tr(' Retour à la connexion')}</Link></p>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <h1>{tr('Créer un compte')}</h1>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span className="field-label">{tr('Pseudo')}</span>
          <input autoComplete="nickname" required value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
          <span className="hint">{tr('Visible par les autres. 3 à 30 caractères : lettres, chiffres, « _ » ou « - ».')}</span>
        </label>
        <label className="field">
          <span className="field-label">{tr('Adresse e-mail')}</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          <span className="hint">{tr('Jamais affichée : elle sert uniquement à te connecter.')}</span>
        </label>
        <label className="field">
          <span className="field-label">{tr('Mot de passe')}</span>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
        </label>
        <PasswordRules password={password} />
        <label className="field">
          <span className="field-label">{tr('Confirmer le mot de passe')}</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
        </label>
        <label className="consent">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            {tr("J'ai lu et j'accepte les ")}<Link to="/conditions" target="_blank" rel="noopener">{tr("conditions d'utilisation")}</Link>{tr(" ; mes données sont traitées comme l'explique la page ")}<Link to="/confidentialite" target="_blank" rel="noopener">{tr('confidentialité')}</Link>.
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary button-block" disabled={busy}><PsSymbol shape="cross" />{tr(' Créer mon compte')}</button>
        <p className="muted small">{tr('Une fois connecté, tu pourras ajouter une passkey et la double authentification dans « Mon compte ».')}</p>
      </form>
    </section>
  );
}
