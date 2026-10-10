import { useEffect, useRef } from 'react';

// Code à 6 chiffres affiché en 6 cases. Un seul vrai champ, invisible, posé sur les cases :
// la saisie, le collage d'un code entier (« 482 913 » compris) et le remplissage automatique
// du téléphone (code reçu par SMS ou e-mail) marchent comme dans un champ normal.
// onComplete : appelé dès que le 6ᵉ chiffre est saisi (validation automatique).
export function CodeInput({ value, onChange, onComplete, disabled = false, autoFocus = false, label }: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  // Après une vérification (champ désactivé le temps de l'envoi) : le curseur revient,
  // pour retaper le code tout de suite s'il a été refusé
  useEffect(() => {
    if (!disabled && autoFocus) input.current?.focus();
  }, [disabled, autoFocus]);

  function change(raw: string) {
    const next = raw.replace(/\D/g, '').slice(0, 6);
    onChange(next);
    if (next.length === 6 && value.length !== 6) onComplete?.(next);
  }

  return (
    <div className={disabled ? 'code-boxes is-disabled' : 'code-boxes'}>
      <input
        ref={input}
        className="code-boxes-input"
        aria-label={label}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        disabled={disabled}
        value={value}
        onChange={(e) => change(e.target.value)}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          // « next » : la case du prochain chiffre, mise en valeur quand le champ a le curseur (CSS :focus-within)
          className={['code-box', value[i] && 'filled', i === Math.min(value.length, 5) && 'next'].filter(Boolean).join(' ')}
        >
          {value[i] ?? ''}
        </span>
      ))}
    </div>
  );
}
