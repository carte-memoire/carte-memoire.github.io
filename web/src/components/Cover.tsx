import { useState, type SyntheticEvent } from 'react';
import { coverUrl } from '../lib/supabase';
import type { StandIn } from '../lib/images';
import type { ReleaseImage } from '../lib/types';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Consoles vendues en boîtier DVD, plus haut que large (PS2 : 135 × 190 mm) ; la PS1
// est en boîtier CD, presque carré. Le cadre prend d'emblée la bonne forme.
const TALL_CASES = new Set(['PS2']);

// Console inconnue (recherche, catalogue de toutes les consoles) : le cadre suit la
// forme de l'image une fois chargée
function shapeOf(event: SyntheticEvent<HTMLImageElement>): boolean | null {
  const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
  if (!w || !h) return null;
  return h / w > 1.2 ? true : h / w < 1.1 ? false : null;
}

// Jaquette (recto) d'une sortie, ou boîtier vide « pas encore de jaquette »
export function Cover({ images, title, size = 'medium', standIn, platform }: {
  images: ReleaseImage[];
  title: string;
  size?: 'small' | 'medium' | 'large';
  standIn?: StandIn | null;
  // Console de la version (PS1, PS2…), si on la connaît
  platform?: string | null;
}) {
  const [measured, setMeasured] = useState<boolean | null>(null);
  const tall = measured ?? TALL_CASES.has(platform ?? '');
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => setMeasured(shapeOf(event));
  const className = `cover cover-${size}${tall ? ' cover-tall' : ''}`;
  const front = images.find((i) => i.type === 'front');
  if (!front && standIn) {
    return (
      <div className={`${className} cover-stand-in`} title={tr("Jaquette d'une autre version du jeu, en attendant celle de cette version ({0})", standIn.label)}>
        <img src={coverUrl(standIn.path)} alt={tr("Jaquette d'une autre version de {0}", title)} loading="lazy" onLoad={onLoad} />
        <span className="cover-ribbon">{standIn.label}</span>
      </div>
    );
  }
  return (
    <div className={className}>
      {front ? (
        <img src={coverUrl(front.path)} alt={tr('Jaquette de {0}', title)} loading="lazy" onLoad={onLoad} />
      ) : (
        <span className="cover-empty" aria-label={tr('Pas encore de jaquette')}>
          <span aria-hidden="true"><PsSymbol shape="square" /></span>
        </span>
      )}
    </div>
  );
}
