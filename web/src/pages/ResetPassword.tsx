import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { PasswordRules, passwordIsValid } from '../components/PasswordRules';

// Page ouverte depuis le lien « mot de passe oublié » : le lien a déjà ouvert
// une session temporaire, il ne reste qu'à choisir le nouveau mot de passe.
export function ResetPassword() {
  const navigate = useNavigate();
  const { session, loading, needsMfa } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="loading">Lecture de la carte mémoire…</p>;
  if (!session) {
    return (
      <section className="panel narrow">
        <h1>Lien invalide ou expiré</h1>
        <p>Demande un nouveau lien de réinitialisation.</p>
        <Link to="/mot-de-passe-oublie" className="button">✕ Nouveau lien</Link>
      </section>
    );
  }
  if (needsMfa) return <Navigate to="/connexion/verification?next=/reinitialiser" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passwordIsValid(password)) return setError('Le mot de passe ne respecte pas toutes les règles.');
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    // Par sécurité, toutes les autres sessions ouvertes sont fermées
    await supabase.auth.signOut({ scope: 'others' });
    navigate('/collection', { replace: true });
  }

  return (
    <section className="panel narrow">
      <h1>Nouveau mot de passe</h1>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span className="field-label">Nouveau mot de passe</span>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
        </label>
        <PasswordRules password={password} />
        <label className="field">
          <span className="field-label">Confirmer</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary button-block" disabled={busy}>✕ Enregistrer</button>
      </form>
    </section>
  );
}
