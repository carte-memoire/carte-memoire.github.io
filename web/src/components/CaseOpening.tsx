import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DiscFace, discMedia, type DiscLabel } from './Disc';
import { collectionTarget, receiveInCollection } from '../lib/fly';
import { prefersReducedMotion } from '../lib/motion';

// Une version vient d'entrer dans la collection : son boîtier se soulève, s'ouvre, le
// disque sort de son logement et file jusqu'à l'onglet « Ma collection », puis le boîtier
// se referme et se repose. Les boîtiers sont dessinés d'après les modèles officiels :
//   PS1 : boîtier CD simple (cristal), plateau noir, cuvette ronde, rosace à dents,
//         couvercle transparent à deux pattes pour le livret ;
//   PS2 : boîtier DVD européen, bleu translucide, tranche à nervures, deux agrafes à
//         notice à gauche ; à droite le porte-carte mémoire moulé en haut, puis la
//         cuvette et son ergot à trois branches.
// (Sans le logo PlayStation moulé : c'est une marque.)
const CASE: Record<string, string> = { PS1: 'jewel', PS2: 'dvd' };

export function hasCase(platform: string | undefined): boolean {
  return Boolean(platform && CASE[platform] && discMedia(platform));
}

export interface Opening {
  from: DOMRect;
  src: string;
  platform: string;
  label: DiscLabel | null;
}

const DURATION = 2100;

export function CaseOpening({ opening, onDone }: { opening: Opening; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const finish = useEffectEvent(() => onDone());

  useLayoutEffect(() => {
    const box = root.current?.querySelector<HTMLElement>('.case-box');
    const lid = root.current?.querySelector<HTMLElement>('.case-lid');
    const disc = root.current?.querySelector<HTMLElement>('.case-disc');
    const target = collectionTarget();
    if (!box || !lid || !disc || !target || prefersReducedMotion()) {
      finish();
      return;
    }
    const { from } = opening;
    const to = target.icon.getBoundingClientRect();
    // Le boîtier grandit (petites jaquettes surtout) et se décale pour que, ouvert, il
    // tienne dans l'écran : la charnière (bord gauche) au centre de la jaquette, si possible
    const scale = Math.min(1.7, Math.max(1.1, 230 / from.width));
    const half = from.width * scale;
    const hinge = Math.min(Math.max(from.left + from.width / 2, 16 + half), window.innerWidth - 16 - half);
    const shift = hinge - from.left;
    // Trajet du disque, mesuré dans le boîtier agrandi
    const cx = hinge + (from.width / 2) * scale;
    const cy = from.top + from.height / 2;
    const dx = (to.left + to.width / 2 - cx) / scale;
    const dy = (to.top + to.height / 2 - cy) / scale;
    const discSize = disc.getBoundingClientRect().width || from.width * 0.85;
    const end = Math.max(0.04, (to.width * 1.3) / (discSize * scale));
    const lift = -(60 + Math.abs(dx) * 0.1);

    const animations = [
      box.animate([
        { transform: 'translateX(0) scale(1)', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        { transform: `translateX(${shift}px) scale(${scale})`, offset: 0.16 },
        { transform: `translateX(${shift}px) scale(${scale})`, offset: 0.82, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' },
        { transform: 'translateX(0) scale(1)' },
      ], { duration: DURATION, fill: 'forwards' }),
      lid.animate([
        { transform: 'perspective(1400px) rotateY(0deg)', offset: 0 },
        { transform: 'perspective(1400px) rotateY(0deg)', offset: 0.1, easing: 'cubic-bezier(0.3, 1.25, 0.5, 1)' },
        { transform: 'perspective(1400px) rotateY(-172deg)', offset: 0.32 },
        { transform: 'perspective(1400px) rotateY(-172deg)', offset: 0.62, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
        { transform: 'perspective(1400px) rotateY(0deg)', offset: 0.8 },
        { transform: 'perspective(1400px) rotateY(0deg)' },
      ], { duration: DURATION, fill: 'forwards' }),
      disc.animate([
        { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1, offset: 0.3, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { transform: 'translate(0, -6%) rotate(40deg) scale(1.1)', opacity: 1, offset: 0.4, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 + lift}px) rotate(320deg) scale(${Math.max(end, 0.5)})`, opacity: 1, offset: 0.56, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
        { transform: `translate(${dx}px, ${dy}px) rotate(640deg) scale(${end})`, opacity: 0.4, offset: 0.76 },
        { transform: `translate(${dx}px, ${dy}px) rotate(640deg) scale(${end})`, opacity: 0, offset: 0.78 },
        { transform: `translate(${dx}px, ${dy}px) rotate(640deg) scale(${end})`, opacity: 0 },
      ], { duration: DURATION, fill: 'forwards' }),
      root.current!.animate([{ opacity: 1 }, { opacity: 1, offset: 0.86 }, { opacity: 0 }], { duration: DURATION, fill: 'forwards' }),
    ];
    const received = window.setTimeout(() => receiveInCollection(target.link), DURATION * 0.77);
    let cancelled = false;
    Promise.all(animations.map((a) => a.finished)).then(() => { if (!cancelled) finish(); }, () => undefined);
    return () => {
      cancelled = true;
      window.clearTimeout(received);
      for (const a of animations) a.cancel();
    };
  }, [opening]);

  const kind = CASE[opening.platform];
  const media = discMedia(opening.platform)!;
  const { from } = opening;
  return createPortal(
    <div ref={root} className="case-fly" aria-hidden="true">
      <div className={`case-box case-${kind}`} style={{ left: from.left, top: from.top, width: from.width, height: from.height }}>
        <div className="case-base">
          {kind === 'dvd' && <span className="case-memory"><span className="case-memory-slot" /><span>MEMORY CARD<br />HOLDER</span></span>}
          <span className="case-well"><span className="case-hub" /></span>
        </div>
        <div className={`case-disc media-disc-${media}`}><DiscFace media={media} label={opening.label} /></div>
        <div className="case-lid">
          <img className="case-lid-front" src={opening.src} alt="" />
          <div className="case-lid-back"><span className="case-clip case-clip-top" /><span className="case-clip case-clip-bottom" /></div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
