import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

type Aal = 'aal1' | 'aal2' | null;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // Niveau d'authentification : actuel, et celui qu'il faudrait atteindre
  // (aal2 si l'utilisateur a activé la double authentification)
  aal: { current: Aal; next: Aal };
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
  const [aal, setAal] = useState<{ current: Aal; next: Aal }>({ current: null, next: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setProfile(null);
      setAal({ current: null, next: null });
      setLoading(false);
      return;
    }
    const [{ data: level }, { data: p }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.from('profile').select('id, username, role, public_collection, avatar').eq('id', s.user.id).maybeSingle(),
    ]);
    setAal({ current: (level?.currentLevel as Aal) ?? null, next: (level?.nextLevel as Aal) ?? null });
    setProfile(p as Profile | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      // Ne pas appeler Supabase directement dans ce rappel (risque de blocage) : on diffère
      setTimeout(() => {
        load(s);
        if (event === 'PASSWORD_RECOVERY') navigate('/reinitialiser');
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
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
