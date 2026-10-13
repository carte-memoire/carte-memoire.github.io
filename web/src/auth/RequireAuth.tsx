import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { tr } from '../lib/i18n';

// Protège une page : il faut être connecté, et avoir validé la double
// authentification si on l'a activée. Avec `moderator`, il faut aussi
// être modérateur ou admin.
// (C'est du confort d'affichage : la vraie protection est dans la base.)
export function RequireAuth({ children, moderator = false }: { children: ReactNode; moderator?: boolean }) {
  const { session, loading, needsMfa, isModerator } = useAuth();
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);

  if (loading) return <p className="loading">{tr('Lecture de la carte mémoire…')}</p>;
  if (!session) return <Navigate to={`/connexion?next=${next}`} replace />;
  if (needsMfa) return <Navigate to={`/connexion/verification?next=${next}`} replace />;
  if (moderator && !isModerator) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Après connexion, on ne redirige que vers une page du site (jamais vers un autre site)
export function safeNext(value: string | null): string {
  // « //site.com » mènerait ailleurs, et le navigateur lit « \ » comme « / » : refusés
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/collection';
}
