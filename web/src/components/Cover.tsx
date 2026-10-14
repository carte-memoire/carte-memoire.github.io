import { useRef, useState, type PointerEvent, type SyntheticEvent } from 'react';
import { flushSync } from 'react-dom';
import { coverUrl } from '../lib/supabase';
import type { StandIn } from '../lib/images';
import { prefersReducedMotion } from '../lib/motion';
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

// Nom partagé par la vignette et la jaquette agrandie : le navigateur passe de l'une
// à l'autre en douceur (transition de vue), là où il sait le faire
const ZOOM_NAME = 'jaquette-agrandie';

// La boîte penche vers la souris, comme quand on la prend en main
function tilt(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;
  const box = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  const style = event.currentTarget.style;
  style.setProperty('--tilt-x', `${(-y * 12).toFixed(2)}deg`);
  style.setProperty('--tilt-y', `${(x * 16).toFixed(2)}deg`);
  style.setProperty('--shine-x', `${Math.round((x + 0.5) * 100)}%`);
  style.setProperty('--shine-y', `${Math.round((y + 0.5) * 100)}%`);
}
function untilt(event: PointerEvent<HTMLElement>) {
  for (const name of ['--tilt-x', '--tilt-y', '--shine-x', '--shine-y']) event.currentTarget.style.removeProperty(name);
}

// Change d'état avec une transition de vue si le navigateur la connaît (et que le
// système ne demande pas moins d'animations), sinon directement
function withTransition(change: () => void): Promise<void> {
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    change();
    return Promise.resolve();
  }
  return document.startViewTransition(change).finished.catch(() => undefined);
}

// Jaquette (recto) d'une sortie, ou boîtier vide « pas encore de jaquette ».
// `zoomable` (fiche d'un jeu) : la boîte penche au survol et s'agrandit au clic.
export function Cover({ images, title, size = 'medium', standIn, platform, zoomable = false }: {
  images: ReleaseImage[];
  title: string;
  size?: 'small' | 'medium' | 'large';
  standIn?: StandIn | null;
  // Console de la version (PS1, PS2…), si on la connaît
  platform?: string | null;
  zoomable?: boolean;
}) {
  const [measured, setMeasured] = useState<boolean | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const thumb = useRef<HTMLImageElement>(null);
  const button = useRef<HTMLButtonElement>(null);
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
  if (!front) {
    return (
      <div className={className}>
        <span className="cover-empty" aria-label={tr('Pas encore de jaquette')}>
          <span aria-hidden="true"><PsSymbol shape="square" /></span>
        </span>
      </div>
    );
  }
  const image = <img ref={thumb} src={coverUrl(front.path)} alt={tr('Jaquette de {0}', title)} loading="lazy" onLoad={onLoad} />;
  if (!zoomable) return <div className={className}>{image}</div>;

  // La vignette prête son nom à la grande image le temps du passage, puis le reprend au retour
  function open() {
    const img = thumb.current;
    if (img) img.style.viewTransitionName = ZOOM_NAME;
    withTransition(() => {
      if (img) img.style.viewTransitionName = '';
      flushSync(() => setZoomed(true));
    });
  }
  function close() {
    const img = thumb.current;
    withTransition(() => {
      flushSync(() => setZoomed(false));
      if (img) img.style.viewTransitionName = ZOOM_NAME;
      // Le clavier reprend là où il était : sur la jaquette
      button.current?.focus({ preventScroll: true });
    }).then(() => { if (img) img.style.viewTransitionName = ''; });
  }

  return (
    <>
      <button ref={button} type="button" className={`${className} cover-zoomable${zoomed ? ' is-zoomed' : ''}`} onClick={open} onPointerMove={tilt} onPointerLeave={untilt}
        title={tr('Agrandir la jaquette')}>
        {image}
      </button>
      {zoomed && (
        <dialog className="cover-zoom" aria-label={tr('Jaquette de {0}', title)}
          ref={(node) => { if (node && !node.open) node.showModal(); }}
          onCancel={(event) => { event.preventDefault(); close(); }} onClick={close}>
          <img src={coverUrl(front.path)} alt={tr('Jaquette de {0}', title)} style={{ viewTransitionName: ZOOM_NAME }} />
          <button type="button" className="cover-zoom-close" aria-label={tr('Fermer')}>✕</button>
        </dialog>
      )}
    </>
  );
}
