import { useState, type CSSProperties } from 'react';
import { avatarUrl } from '../lib/avatar';

// Photo de profil ronde, ou l'initiale du pseudo dans un rond aux couleurs de la manette
// (toujours la même couleur pour un même pseudo). Décorative : le pseudo est écrit à côté.
const COLORS = ['var(--triangle)', 'var(--circle)', 'var(--cross)', 'var(--square)'];

export function Avatar({ username, path, size = 'small' }: { username: string; path?: string | null; size?: 'tiny' | 'small' | 'medium' | 'large' }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (path && failed !== path) {
    return <img className={`avatar avatar-${size}`} src={avatarUrl(path)} alt="" loading="lazy" onError={() => setFailed(path)} />;
  }
  const color = COLORS[[...username].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
  return (
    <span className={`avatar avatar-${size} avatar-initial`} style={{ '--avatar-color': color } as CSSProperties} aria-hidden="true">
      {(username.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
