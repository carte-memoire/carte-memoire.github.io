import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { PasswordRules, passwordIsValid } from '../components/PasswordRules';
import { PsSymbol } from '../components/PsSymbol';
import { inRecovery, markRecovery } from '../lib/preferences';
import { tr } from '../lib/i18n';
import { usePageTitle } from '../lib/title';
import { LEAKED_PASSWORD_MESSAGE, passwordLeaked } from '../lib/pwned';

// Page ouverte depuis le lien « mot de passe oublié » : le lien a déjà ouvert
// une session temporaire, il ne reste qu'à choisir le nouveau mot de passe.
export function ResetPassword() {
  usePageTitle(tr('Nouveau mot de passe'));
  const navigate = useNavigate();
  const { session, loading, needsMfa } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="loading">{tr('Lecture de la carte mémoire…')}</p>;
  if (!session) {
    return (
      <section className="panel narrow">
        <h1>{tr('Lien invalide ou expiré')}</h1>
        <p>
          {tr('Le lien a peut-être déjà servi, ou expiré (il est valable 30 minutes). Par sécurité, il doit aussi être ouvert dans le navigateur où tu as fait la demande : sur un autre appareil ou dans un autre navigateur, il ne marche pas.')}
        </p>
        <p>{tr('Demande un nouvel e-mail, et ouvre son lien dans le navigateur de la demande.')}</p>
        <Link to="/mot-de-passe-oublie" className="button"><PsSymbol shape="cross" />{tr(' Nouvel e-mail')}</Link>
      </section>
    );
  }
  if (needsMfa) return <Navigate to="/connexion/verification?next=/reinitialiser" replace />;
  // Connecté normalement (pas par un lien « mot de passe oublié ») : on passe par « Mon compte »,
  // qui demande un code reçu par e-mail. Sinon, quelqu'un devant un ordinateur resté connecté
  // pourrait changer le mot de passe et s'approprier le compte.
  if (!inRecovery()) {
    return (
      <section className="panel narrow">
        <h1>{tr('Changer de mot de passe')}</h1>
        <p>{tr('Tu es déjà connecté : change ton mot de passe dans « Mon compte », avec un code envoyé par e-mail.')}</p>
        <Link to="/compte" className="button"><PsSymbol shape="cross" />{tr(' Mon compte')}</Link>
      </section>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passwordIsValid(password)) return setError(tr('Le mot de passe ne respecte pas toutes les règles.'));
    if (password !== confirm) return setError(tr('Les deux mots de passe ne sont pas identiques.'));
    setBusy(true);
    if (await passwordLeaked(password)) {
      setBusy(false);
      return setError(LEAKED_PASSWORD_MESSAGE);
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    // Par sécurité, toutes les autres sessions ouvertes sont fermées
    await supabase.auth.signOut({ scope: 'others' });
    markRecovery(false);
    navigate('/collection', { replace: true });
  }

  return (
    <section className="panel narrow">
      <h1>{tr('Nouveau mot de passe')}</h1>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span className="field-label">{tr('Nouveau mot de passe')}</span>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
        </label>
        <PasswordRules password={password} />
        <label className="field">
          <span className="field-label">{tr('Confirmer')}</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary button-block" disabled={busy}><PsSymbol shape="cross" />{tr(' Enregistrer')}</button>
      </form>
    </section>
  );
}
