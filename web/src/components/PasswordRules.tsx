import { PsSymbol } from './PsSymbol';
// Règles de mot de passe : les mêmes que celles imposées par Supabase (config.toml).
// L'affichage aide l'utilisateur ; c'est le serveur qui fait foi.

export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: '12 caractères minimum', test: (p) => p.length >= 12 },
  { label: 'une minuscule', test: (p) => /[a-z]/.test(p) },
  { label: 'une majuscule', test: (p) => /[A-Z]/.test(p) },
  { label: 'un chiffre', test: (p) => /[0-9]/.test(p) },
  { label: 'un symbole (!, ?, #, …)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const passwordIsValid = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="password-rules" aria-label="Règles du mot de passe">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.label} className={ok ? 'rule-ok' : 'rule-todo'}>
            <PsSymbol shape={ok ? 'triangle' : 'circle'} /> {r.label}
            <span className="sr-only">{ok ? ' : respecté' : ' : à faire'}</span>
          </li>
        );
      })}
    </ul>
  );
}
