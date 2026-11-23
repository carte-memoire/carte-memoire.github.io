import { useId, useState } from 'react';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Règle du mot de passe : la même que celle imposée par Supabase (config.toml :
// minimum_password_length = 12, sans règle de composition). Comme le recommandent le
// NIST et l'ANSSI, on demande de la longueur plutôt que « une majuscule, un chiffre, un
// symbole », et on refuse les mots de passe déjà divulgués (lib/pwned.ts, à l'envoi).
// L'affichage aide ; c'est le serveur qui fait foi.
export const PASSWORD_MIN = 12;
export const passwordIsValid = (p: string) => p.length >= PASSWORD_MIN;

export function PasswordRules({ password }: { password: string }) {
  const ok = passwordIsValid(password);
  return (
    <p className={ok ? 'password-rule rule-ok' : 'password-rule rule-todo'} aria-live="polite">
      <PsSymbol shape={ok ? 'triangle' : 'circle'} />{' '}
      {ok ? tr('{0} caractères : c’est bon.', password.length) : tr('{0} caractère{1?s} sur 12 au minimum.', password.length, password.length > 1)}
      <span className="muted">{tr(' Une phrase facile à retenir convient très bien ; un mot de passe déjà divulgué sur Internet sera refusé.')}</span>
    </p>
  );
}

// Champ « mot de passe » avec un bouton Afficher (à la place d'un second champ « Confirmer » :
// on vérifie ce qu'on a tapé en le regardant), et la règle juste en dessous
export function PasswordField({ label, value, onChange, autoComplete = 'new-password', withRule = true }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: 'new-password' | 'current-password';
  withRule?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <span className="password-row">
        <input id={id} type={shown ? 'text' : 'password'} autoComplete={autoComplete} required value={value}
          onChange={(e) => onChange(e.target.value)} maxLength={128} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
        <button type="button" className="button button-small password-toggle" aria-pressed={shown} aria-controls={id}
          onClick={() => setShown((v) => !v)}>
          {shown ? tr('Masquer') : tr('Afficher')}
        </button>
      </span>
      {withRule && <PasswordRules password={value} />}
    </div>
  );
}
