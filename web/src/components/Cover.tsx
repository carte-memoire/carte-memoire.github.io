import { coverUrl } from '../lib/supabase';
import type { ReleaseImage } from '../lib/types';

// Jaquette (recto) d'une sortie, ou boîtier vide « pas encore de jaquette »
export function Cover({ images, title, size = 'medium' }: { images: ReleaseImage[]; title: string; size?: 'small' | 'medium' | 'large' }) {
  const front = images.find((i) => i.type === 'front');
  return (
    <div className={`cover cover-${size}`}>
      {front ? (
        <img src={coverUrl(front.path)} alt={`Jaquette de ${title}`} loading="lazy" />
      ) : (
        <span className="cover-empty" aria-label="Pas encore de jaquette">
          <span aria-hidden="true">□</span>
        </span>
      )}
    </div>
  );
}
