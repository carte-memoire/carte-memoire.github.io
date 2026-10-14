import { useCallback, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { CodeInput } from './CodeInput';
import { Dialog } from './Dialog';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Réglages de sécurité (passkeys, double authentification, mot de passe) : le serveur
// de connexion exige que le code à 6 chiffres ait été tapé dans cette session, même
// sur un navigateur de confiance ou après une passkey. On le demande donc sur place,
// puis l'action continue. Sans double authentification active, rien n'est demandé.
export function useCodeConfirm(): { dialog: ReactNode; ensureCode: (reason: string) => Promise<boolean> } {
  const { refresh } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ensureCode = useCallback(async (why: string) => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!data || data.nextLevel !== 'aal2' || data.currentLevel === 'aal2') return true;
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setCode('');
      setError('');
      setReason(why);
    });
  }, []);

  function finish(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setReason(null);
  }

  async function verify(value: string) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError('');
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    const { error } = factor
      ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: value })
      : { error: new Error(tr('Aucune application d’authentification trouvée pour ce compte.')) };
    setBusy(false);
    if (error) {
      setCode('');
      return setError(errorMessage(error));
    }
    await refresh();
    finish(true);
  }

  const dialog = (
    <Dialog open={reason !== null} onClose={() => finish(false)} title={tr('Confirme avec ton code')}>
      <p>{reason}</p>
      <p className="muted small">{tr("Même sur un navigateur de confiance ou après une passkey, les réglages de sécurité demandent le code à 6 chiffres de ton application d'authentification.")}</p>
      <CodeInput label={tr("Code de l'application d'authentification")} value={code} onChange={setCode} onComplete={verify} disabled={busy} autoFocus />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button" onClick={() => finish(false)}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
        <button type="button" className="button button-primary" disabled={busy || code.length !== 6} onClick={() => verify(code)}><PsSymbol shape="cross" />{tr(' Valider')}</button>
      </div>
    </Dialog>
  );
  return { dialog, ensureCode };
}
