import { Avatar } from './Avatar';
import { tr } from '../lib/i18n';

// Un membre cité (auteur d'une proposition, d'un signalement, d'une modification…) :
// sa photo de profil, ou son initiale, puis son pseudo. Compte supprimé : la mention seule.
export function UserTag({ user, strong = false }: { user?: { username: string; avatar?: string | null } | null; strong?: boolean }) {
  if (!user) return <span className="user-tag-gone">{tr('compte supprimé')}</span>;
  return (
    <span className="user-tag">
      <Avatar username={user.username} path={user.avatar} size="tiny" />
      {strong ? <strong>{user.username}</strong> : <span>{user.username}</span>}
    </span>
  );
}
