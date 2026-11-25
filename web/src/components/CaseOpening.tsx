import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DiscFace, discMedia, type DiscLabel } from './Disc';
import { collectionTarget, receiveInCollection } from '../lib/fly';
import { prefersReducedMotion } from '../lib/motion';

// Une version vient d'entrer dans la collection : son boîtier se soulève, s'ouvre, le
// disque sort de son logement et file jusqu'à l'onglet « Ma collection », puis le boîtier
// se referme et se repose. Les boîtiers sont dessinés d'après les modèles officiels :
//   PS1 : boîtier CD simple (cristal), plateau noir, cuvette ronde, rosace à dents,
//         couvercle transparent à deux pattes pour le livret ; en Europe (PAL), une
//         charnière noire à gauche, qui reste immobile quand le couvercle en acrylique
//         s'ouvre, et le décroché de l'acrylique entre elle et la jaquette ;
//   PS2 : boîtier DVD européen, bleu translucide, tranche à nervures, deux agrafes à
//         notice à gauche ; à droite le porte-carte mémoire moulé en haut, puis la
//         cuvette et son ergot à trois branches.
// (Sans le logo PlayStation moulé : c'est une marque.)
const CASE: Record<string, string> = { PS1: 'jewel', PS2: 'dvd' };

// PS1 européen (ou de zone inconnue) : charnière noire à gauche de la jaquette (styles.css,
// .case-jewel-pal : 10,5 % de sa largeur, puis 1,6 % de décroché) ; le couvercle pivote sur
// les tétons, à 4,2 % du bord extérieur (5 mm sur un livret de 120)
function isPal(opening: Opening): boolean {
  return CASE[opening.platform] === 'jewel' && (!opening.zone || opening.zone === 'PAL');
}
const HINGE = 0.105;
const STEP = 0.016;
const PIVOT = 0.042;

export function hasCase(platform: string | undefined): boolean {
  return Boolean(platform && CASE[platform] && discMedia(platform));
}

export interface Opening {
  from: DOMRect;
  src: string;
  platform: string;
  // Zone de la version : les boîtiers PS1 européens (ou de zone inconnue) ont la charnière noire
  zone?: string | null;
  label: DiscLabel | null;
}

const DURATION = 2300;

// Épaisseur de la base, à l'échelle de la jaquette : 10 mm pour 142 de large (boîtier CD),
// 14 mm pour 135 (boîtier DVD) ; le couvercle a la sienne (CSS, .case-lid-edge)
function boxDepth(platform: string, width: number): number {
  return Math.round(width * (CASE[platform] === 'dvd' ? 0.1 : 0.07));
}

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
    // Ouvert, le couvercle d'un boîtier PS1 européen se pose plus à gauche : il pivote sur
    // les tétons, près du bord extérieur de la charnière noire
    const extra = isPal(opening) ? from.width * 2 * (HINGE + STEP - PIVOT) * scale : 0;
    const hinge = Math.min(Math.max(from.left + from.width / 2, 16 + half + extra), window.innerWidth - 16 - half);
    const shift = hinge - from.left;
    // Trajet du disque, mesuré dans le boîtier agrandi
    const cx = hinge + (from.width / 2) * scale;
    const cy = from.top + from.height / 2;
    const dx = (to.left + to.width / 2 - cx) / scale;
    const dy = (to.top + to.height / 2 - cy) / scale;
    const discSize = disc.getBoundingClientRect().width || from.width * 0.85;
    const end = Math.max(0.04, (to.width * 1.3) / (discSize * scale));
    const lift = -(60 + Math.abs(dx) * 0.1);

    // Épaisseur du boîtier : le couvercle repose sur les parois de la base. Pendant
    // l'ouverture, le boîtier penche vers soi : on voit ses parois et la tranche du
    // couvercle ; il se remet à plat avant que le disque ne parte.
    const depth = boxDepth(opening.platform, from.width);
    const tilt = 'rotateX(24deg) rotateY(-10deg)';
    const flat = 'rotateX(0deg) rotateY(0deg)';
    const animations = [
      box.animate([
        { transform: `translateX(0) scale(1) ${flat}`, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        { transform: `translateX(${shift}px) scale(${scale}) ${tilt}`, offset: 0.18 },
        { transform: `translateX(${shift}px) scale(${scale}) ${tilt}`, offset: 0.34, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        { transform: `translateX(${shift}px) scale(${scale}) ${flat}`, offset: 0.42 },
        { transform: `translateX(${shift}px) scale(${scale}) ${flat}`, offset: 0.82, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' },
        { transform: `translateX(0) scale(1) ${flat}` },
      ], { duration: DURATION, fill: 'forwards' }),
      lid.animate([
        { transform: `translateZ(${depth}px) rotateY(0deg)`, offset: 0 },
        { transform: `translateZ(${depth}px) rotateY(0deg)`, offset: 0.1, easing: 'cubic-bezier(0.3, 1.25, 0.5, 1)' },
        { transform: `translateZ(${depth}px) rotateY(-172deg)`, offset: 0.32 },
        { transform: `translateZ(${depth}px) rotateY(-172deg)`, offset: 0.62, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
        { transform: `translateZ(${depth}px) rotateY(0deg)`, offset: 0.8 },
        { transform: `translateZ(${depth}px) rotateY(0deg)` },
      ], { duration: DURATION, fill: 'forwards' }),
      disc.animate([
        { transform: 'translateZ(2px) translate(0, 0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translateZ(2px) translate(0, 0) rotate(0deg) scale(1)', opacity: 1, offset: 0.3, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { transform: `translateZ(${depth * 2}px) translate(0, -6%) rotate(40deg) scale(1.1)`, opacity: 1, offset: 0.42, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
        { transform: `translateZ(${depth * 2}px) translate(${dx * 0.45}px, ${dy * 0.45 + lift}px) rotate(320deg) scale(${Math.max(end, 0.5)})`, opacity: 1, offset: 0.57, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
        { transform: `translateZ(0px) translate(${dx}px, ${dy}px) rotate(640deg) scale(${end})`, opacity: 0.4, offset: 0.76 },
        { transform: `translateZ(0px) translate(${dx}px, ${dy}px) rotate(640deg) scale(${end})`, opacity: 0, offset: 0.78 },
        { transform: `translateZ(0px) translate(${dx}px, ${dy}px) rotate(640deg) scale(${end})`, opacity: 0 },
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
  const pal = isPal(opening);
  // PS2 d'Amérique du Nord ou du Japon : boîtier noir, sans porte-carte mémoire
  const blackDvd = kind === 'dvd' && (opening.zone === 'NTSC-U' || opening.zone === 'NTSC-J');
  const media = discMedia(opening.platform)!;
  const { from } = opening;
  const depth = boxDepth(opening.platform, from.width);
  // La perspective part du centre du boîtier (sinon il serait vu de biais depuis le
  // milieu de l'écran)
  const origin = `${from.left + from.width / 2}px ${from.top + from.height / 2}px`;
  return createPortal(
    <div ref={root} className="case-fly" aria-hidden="true" style={{ perspectiveOrigin: origin }}>
      <div className={`case-box case-${kind}${pal ? ' case-jewel-pal' : ''}${blackDvd ? ' case-dvd-black' : ''}`} style={{ left: from.left, top: from.top, width: from.width, height: from.height, ['--depth' as string]: `${depth}px`, ['--case-w' as string]: `${from.width}px` }}>
        <div className="case-base">
          {kind === 'dvd' && !blackDvd && <span className="case-memory"><span className="case-memory-slot" /><span>MEMORY CARD<br />HOLDER</span></span>}
          <span className="case-well"><span className="case-hub" /></span>
          {/* Les parois : la base a une épaisseur, le couvercle repose dessus */}
          <span className="case-wall case-wall-top" />
          <span className="case-wall case-wall-bottom" />
          <span className="case-wall case-wall-left" />
          <span className="case-wall case-wall-right" />
        </div>
        {/* PS1 Europe : la charnière noire, fixée à la base (elle ne bouge pas à l'ouverture),
            avec « PlayStation » moulé, et ses parois noires */}
        {pal && (
          <div className="case-hinge">
            <span className="case-hinge-top"><span className="case-hinge-text">PlayStation</span></span>
            <span className="case-hinge-wall case-hinge-wall-top" />
            <span className="case-hinge-wall case-hinge-wall-bottom" />
          </div>
        )}
        <div className={`case-disc media-disc-${media}`}><DiscFace media={media} label={opening.label} /></div>
        <div className="case-lid">
          <img className="case-lid-front" src={opening.src} alt="" />
          {pal && <span className="case-lid-step" />}
          <div className="case-lid-back"><span className="case-clip case-clip-top" /><span className="case-clip case-clip-bottom" /></div>
          {/* La tranche du couvercle, côté ouverture : visible quand il pivote */}
          <span className="case-lid-edge" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
