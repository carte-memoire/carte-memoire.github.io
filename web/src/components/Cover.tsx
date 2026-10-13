import { coverUrl } from '../lib/supabase';
import type { StandIn } from '../lib/images';
import type { ReleaseImage } from '../lib/types';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Jaquette (recto) d'une sortie, ou boîtier vide « pas encore de jaquette »
export function Cover({ images, title, size = 'medium', standIn }: {
  images: ReleaseImage[];
  title: string;
  size?: 'small' | 'medium' | 'large';
  standIn?: StandIn | null;
}) {
  const front = images.find((i) => i.type === 'front');
  if (!front && standIn) {
    return (
      <div className={`cover cover-${size} cover-stand-in`} title={tr("Jaquette d'une autre version du jeu, en attendant celle de cette version ({0})", standIn.label)}>
        <img src={coverUrl(standIn.path)} alt={tr("Jaquette d'une autre version de {0}", title)} loading="lazy" />
        <span className="cover-ribbon">{standIn.label}</span>
      </div>
    );
  }
  return (
    <div className={`cover cover-${size}`}>
      {front ? (
        <img src={coverUrl(front.path)} alt={tr('Jaquette de {0}', title)} loading="lazy" />
      ) : (
        <span className="cover-empty" aria-label={tr('Pas encore de jaquette')}>
          <span aria-hidden="true"><PsSymbol shape="square" /></span>
        </span>
      )}
    </div>
  );
}

