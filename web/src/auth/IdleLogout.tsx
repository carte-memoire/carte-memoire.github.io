import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { idleMinutes, lastActivity, touchActivity } from '../lib/preferences';
import { Dialog } from '../components/Dialog';
import { useAuth } from './AuthContext';
import { tr } from '../lib/i18n';

// Déconnexion automatique après une période sans activité (clic, toucher, clavier,
// défilement), pour qu'un appareil oublié ouvert (PC partagé, téléphone posé) ne
// laisse pas la collection et le compte à la portée de n'importe qui.
// - La dernière activité est partagée entre les onglets (stockage du navigateur).
// - Une minute avant, une fenêtre propose de rester connecté.
// - Au retour sur un appareil resté en veille trop longtemps : déconnexion immédiate.
// Seule la session de cet appareil est fermée.

const WARNING_MS = 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function IdleLogout() {
  const { session, isModerator, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const where = useRef('');
  where.current = location.pathname + location.search;
  const userId = session?.user.id ?? null;
  // La connexion compte comme une activité (date du serveur, la même dans tous les onglets)
  const signedInAt = Date.parse(session?.user.last_sign_in_at ?? '') || 0;
  const timeout = idleMinutes(isModerator) * 60_000;

  useEffect(() => {
    if (!userId) return setSecondsLeft(null);
    let expired = false;
    let lastWrite = 0;

    const touch = () => {
      const now = Date.now();
      if (now - lastWrite < 10_000) return;
      lastWrite = now;
      touchActivity(now);
      setSecondsLeft(null);
    };

    const expire = async () => {
      if (expired) return;
      expired = true;
      const next = where.current;
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      navigate(`/connexion?raison=inactivite&next=${encodeURIComponent(next)}`, { replace: true });
    };

    const check = () => {
      const left = Math.max(lastActivity(), signedInAt) + timeout - Date.now();
      if (left <= 0) return void expire();
      setSecondsLeft(left <= WARNING_MS ? Math.ceil(left / 1000) : null);
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, touch, { passive: true, capture: true });
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    check();
    const timer = setInterval(check, 1000);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, touch, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [userId, signedInAt, timeout, navigate]);

  function stay() {
    touchActivity(Date.now());
    setSecondsLeft(null);
  }

  return (
    <Dialog open={secondsLeft !== null} onClose={stay} title={tr('Toujours là ?')}>
      <p aria-live="polite">
        {tr('Sans activité de ta part, tu seras déconnecté dans ')}<strong>{secondsLeft ?? 0} s</strong>{tr(', pour protéger ton compte.')}
      </p>
      <div className="actions">
        <button type="button" className="button button-primary" onClick={stay} data-autofocus>{tr('Rester connecté')}</button>
        <button type="button" className="link-button" onClick={() => { setSecondsLeft(null); signOut(); }}>{tr('Me déconnecter maintenant')}</button>
      </div>
    </Dialog>
  );
}
