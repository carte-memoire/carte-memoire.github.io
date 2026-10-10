import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { PsSymbol } from './PsSymbol';
import { CodeInput } from './CodeInput';

// Code à 6 chiffres reçu par e-mail (inscription, mot de passe oublié). Contrairement au
// lien, il marche dans n'importe quel navigateur ou appareil : il suffit de le recopier.
// « Renvoyer » est limité à une fois par minute (comme le serveur).
export function EmailCodeForm({ email, type, onVerified, onResend }: {
  email: string;
  type: 'email' | 'recovery';
  onVerified: () => Promise<void> | void;
  onResend: () => Promise<{ error: unknown }>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function verify(token: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    if (error) {
      setBusy(false);
      setCode('');
      return setError(errorMessage(error));
    }
    await onVerified();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    verify(code);
  }

  async function resend() {
    setError('');
    setResent(false);
    const { error } = await onResend();
    if (error) return setError(errorMessage(error));
    setResent(true);
    setWait(60);
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="field">
        <span className="field-label center">Code à 6 chiffres reçu par e-mail</span>
        <CodeInput label="Code à 6 chiffres reçu par e-mail" value={code} onChange={setCode} onComplete={verify} disabled={busy} autoFocus />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {resent && <p className="success">Nouvel e-mail envoyé.</p>}
      <button type="submit" className="button button-primary button-block" disabled={busy || code.length !== 6}>
        <PsSymbol shape="cross" /> {busy ? 'Vérification…' : 'Valider le code'}
      </button>
      <p className="muted small center">
        Rien reçu ? Regarde dans les indésirables, ou{' '}
        <button type="button" className="link-button" disabled={wait > 0} onClick={resend}>
          renvoie l'e-mail{wait > 0 ? ` (dans ${wait} s)` : ''}
        </button>.
      </p>
    </form>
  );
}
