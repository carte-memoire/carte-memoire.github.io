import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { markRecovery } from '../lib/preferences';
import { passkeySession, presentTrustedBrowser } from '../lib/trust';
import { lang, tr } from '../lib/i18n';

type Aal = 'aal1' | 'aal2' | null;
// Double authentification satisfaite sans code : passkey, ou navigateur de confiance
type Trust = 'passkey' | 'browser' | null;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // Niveau d'authentification : actuel, et celui qu'il faudrait atteindre
  // (aal2 si l'utilisateur a activé la double authentification). Une session ouverte
  // par passkey, ou reconnue par un navigateur de confiance, compte comme aal2 (`trust`).
  aal: { current: Aal; next: Aal; trust: Trust };
  needsMfa: boolean;
  isModerator: boolean;
  refresh: () => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aal, setAal] = useState<{ current: Aal; next: Aal; trust: Trust }>({ current: null, next: null, trust: null });
  const [loading, setLoading] = useState(true);

  // Lectures successives (connexion, jeton renouvelé, « refresh »…) : seule la dernière compte
  const latest = useRef(0);
  // Compte dont l'état complet (double authentification, profil) est connu
  const known = useRef<string | null>(null);

  const load = useCallback(async (s: Session | null) => {
    const call = ++latest.current;
    if (!s) {
      known.current = null;
      setSession(null);
      setProfile(null);
      setAal({ current: null, next: null, trust: null });
      setLoading(false);
      return;
    }
    // Compte qui vient de se connecter : on attend de savoir si le code de double
    // authentification est demandé avant de laisser les pages décider où aller (sinon,
    // la page du code croyait un instant qu'il n'en fallait pas et filait ailleurs)
    if (s.user.id !== known.current) setLoading(true);
    setSession(s);
    try {
      const [{ data: level }, { data: p }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.from('profile').select('id, username, role, public_collection, avatar').eq('id', s.user.id).maybeSingle(),
      ]);
      const current = (level?.currentLevel as Aal) ?? null;
      const next = (level?.nextLevel as Aal) ?? null;
      let trust: Trust = null;
      if (next === 'aal2' && current !== 'aal2') {
        if (passkeySession(level?.currentAuthenticationMethods as { method: string }[] | undefined)) trust = 'passkey';
        else if (await presentTrustedBrowser(s)) trust = 'browser';
      }
      if (call !== latest.current) return;
      setAal({ current: trust ? 'aal2' : current, next, trust });
      setProfile(p as Profile | null);
      known.current = s.user.id;
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, []);

  // Langue des e-mails envoyés au compte (mot de passe oublié, changement d'adresse…) :
  // celle du site, mise à jour quand le membre change de langue
  const userId = session?.user.id;
  const emailLang = session?.user.user_metadata?.lang as string | undefined;
  useEffect(() => {
    if (userId && emailLang !== lang) supabase.auth.updateUser({ data: { lang } });
  }, [userId, emailLang]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      // Ne pas appeler Supabase directement dans ce rappel (risque de blocage) : on diffère
      setTimeout(() => {
        load(s);
        if (event === 'PASSWORD_RECOVERY') {
          markRecovery(true);
          navigate('/reinitialiser');
        }
        if (event === 'SIGNED_OUT') markRecovery(false);
      }, 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [load, navigate]);

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    loading,
    aal,
    needsMfa: aal.next === 'aal2' && aal.current !== 'aal2',
    isModerator: profile?.role === 'moderator' || profile?.role === 'admin',
    refresh: async () => {
      const { data } = await supabase.auth.getSession();
      await load(data.session);
    },
    signOut: async (everywhere = false) => {
      await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' });
      navigate('/');
    },
  }), [session, profile, loading, aal, load, navigate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error(tr('useAuth doit être utilisé dans <AuthProvider>'));
  return ctx;
}
