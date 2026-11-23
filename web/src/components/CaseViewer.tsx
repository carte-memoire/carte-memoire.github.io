import { useEffectEvent, useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { SpineFace, spineKind } from './Spine';
import { prefersReducedMotion } from '../lib/motion';
import { tr } from '../lib/i18n';

// Un jeu sorti de l'étagère : son boîtier glisse vers soi, tranche en avant, puis pivote
// pour montrer sa jaquette, au centre de l'écran. Il suit un peu la souris (on le fait
// tourner) ; à la fermeture, il retourne à sa place sur l'étagère. Boîtiers au format
// européen, aux proportions réelles : CD 142 × 125 × 10,4 mm, DVD 135 × 190 × 14 mm.
// PS1 : deux formats. Europe (PAL) : boîtier plus épais, charnière noire avec
// « PlayStation » moulé ; Amérique et Japon : boîtier CD plat à charnière transparente.
const CASE_MM: Record<string, { w: number; h: number; d: number }> = {
  // Mesures relevées sur un boîtier PAL : 143 × 130 × 17 mm
  'ps1-pal': { w: 143, h: 130, d: 17 },
  'ps1-flat': { w: 142, h: 125, d: 10.4 },
  ps2: { w: 135, h: 190, d: 14 },
};

export interface Pulled {
  from: DOMRect;
  // La tranche sur l'étagère : sa place reste vide tant que le jeu est sorti
  source?: HTMLElement;
  release: { local_title: string; product_code: string | null; edition_type: string; zone?: string | null; platform: { short_name: string } };
  src: string | null;
  meta: string;
  gameHref: string;
}


export function CaseViewer({ pulled, onClose, onEdit }: { pulled: Pulled; onClose: () => void; onEdit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const turn = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  // La tranche sur l'étagère (sa place reste vide tant que le jeu est sorti)
  const spot = useRef(pulled.source);
  const kind = spineKind(pulled.release.platform.short_name) ?? 'ps1';
  const format = kind === 'ps1' ? (!pulled.release.zone || pulled.release.zone === 'PAL' ? 'ps1-pal' : 'ps1-flat') : kind;
  const mm = CASE_MM[format];
  const height = Math.min(window.innerHeight * 0.5, 400);
  const k = height / mm.h;
  const [w, h, d] = [mm.w * k, height, mm.d * k];

  // Trajet entre la tranche sur l'étagère et le centre de la scène
  function keyframes(): Keyframe[] {
    const { from } = pulled;
    const dx = from.left + from.width / 2 - window.innerWidth / 2;
    const dy = from.top + from.height / 2 - window.innerHeight * 0.4;
    const s = from.height / h;
    // Un seul mouvement continu, calculé image par image (pas d'étapes qui marquent un
    // temps d'arrêt) : le jeu glisse hors de l'étagère vers soi, tranche en avant, et
    // dans la foulée vient au centre en grandissant et pivote jusqu'à montrer sa jaquette
    const smooth = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
    const frames: Keyframe[] = [];
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pull = smooth(0, 0.4, t);
      const travel = smooth(0.12, 1, t);
      const scale = s * (1 + 0.4 * pull) * (1 - travel) + travel;
      const lift = Math.sin(Math.PI * travel) * 28;
      const angle = 90 - 66 * smooth(0.2, 1, t);
      frames.push({ transform: `translate(${(dx * (1 - travel)).toFixed(1)}px, ${(dy * (1 - travel) - lift).toFixed(1)}px) scale(${scale.toFixed(4)}) rotateY(${angle.toFixed(2)}deg)`, offset: t });
    }
    return frames;
  }

  const opened = useEffectEvent(() => {
    dialog.current?.showModal();
    // Sa place reste vide sur l'étagère pendant qu'il est sorti
    if (spot.current) spot.current.style.visibility = 'hidden';
    if (!prefersReducedMotion()) box.current?.animate(keyframes(), { duration: 1150, fill: 'both' });
  });
  const restore = () => { if (spot.current) spot.current.style.visibility = ''; };
  useLayoutEffect(() => {
    opened();
    const el = spot.current;
    return () => { if (el) el.style.visibility = ''; };
  }, []);

  // Fermer : le boîtier refait le chemin à l'envers et se range dans sa place
  function close() {
    if (closing.current) return;
    closing.current = true;
    const done = () => { restore(); dialog.current?.close(); onClose(); };
    if (prefersReducedMotion() || !box.current) return done();
    // Le même mouvement à l'envers, d'une traite
    const back = keyframes().reverse().map((f, i, all) => ({ transform: f.transform, offset: i / (all.length - 1) }));
    box.current.animate(back, { duration: 950, fill: 'both' }).finished.then(done, done);
  }

  // Le boîtier suit la souris : quelques degrés de chaque côté
  function follow(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !turn.current) return;
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    turn.current.style.setProperty('--turn-y', `${(x * 36).toFixed(1)}deg`);
    turn.current.style.setProperty('--turn-x', `${(-y * 16).toFixed(1)}deg`);
    // Le reflet du film plastique glisse avec le boîtier
    turn.current.style.setProperty('--film', `${Math.round((x + 0.5) * 100)}%`);
  }

  const face = (style: CSSProperties) => ({ ...style, position: 'absolute' } as CSSProperties);
  const title = pulled.release.local_title;
  return (
    <dialog ref={dialog} className={`case-viewer cv-${kind} cv-${format}`} aria-label={title}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="cv-stage" onPointerMove={follow} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div ref={box} className="cv-box" style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, ['--case-h' as string]: `${h}px` } as CSSProperties}>
          <div ref={turn} className="cv-turn">
            {/* Face : la jaquette sous le plastique (couvercle transparent du boîtier CD,
                pochette du boîtier DVD), avec ce qu'on voit autour d'elle */}
            <div className="cv-face cv-front" style={face({ width: w, height: h, transform: `translateZ(${d / 2}px)` })}>
              <span className="cv-hinge">{format === 'ps1-pal' && <span className="cv-hinge-text">PlayStation</span>}</span>
              <span className="cv-inlay">{pulled.src ? <img src={pulled.src} alt="" /> : <span className="cv-nocover">{title}</span>}</span>
              <span className="cv-gloss" />
            </div>
            {/* Dos : le verso n'est pas dans la base ; on voit le dos de la jaquette, sombre */}
            <div className="cv-face cv-back" style={face({ width: w, height: h, transform: `rotateY(180deg) translateZ(${d / 2}px)` })}>
              <span className="cv-inlay cv-back-inlay"><span>{title}</span>{pulled.release.product_code && <small>{pulled.release.product_code}</small>}</span>
              <span className="cv-gloss" />
            </div>
            <div className="cv-face cv-spine" style={face({ width: d, height: h, left: (w - d) / 2, transform: `rotateY(-90deg) translateZ(${w / 2}px)`, ['--spine-w' as string]: `${d}px` })}>
              <SpineFace release={pulled.release} />
              <span className="cv-gloss" />
            </div>
            {/* Côté ouverture : la seconde tranche du verso (boîtier CD), le plastique nervuré (DVD) */}
            <div className="cv-face cv-side" style={face({ width: d, height: h, left: (w - d) / 2, transform: `rotateY(90deg) translateZ(${w / 2}px)`, ['--spine-w' as string]: `${d}px` })}>
              {kind === 'ps1' && <SpineFace release={pulled.release} />}
              <span className="cv-gloss" />
            </div>
            <div className="cv-face cv-edge cv-top" style={face({ width: w, height: d, top: (h - d) / 2, transform: `rotateX(90deg) translateZ(${h / 2}px)` })}>{kind === 'ps1' && <span className="cv-pin" />}</div>
            <div className="cv-face cv-edge cv-bottom" style={face({ width: w, height: d, top: (h - d) / 2, transform: `rotateX(-90deg) translateZ(${h / 2}px)` })}>{kind === 'ps1' && <span className="cv-pin" />}</div>
          </div>
        </div>
      </div>
      <div className="cv-info">
        <h2>{title}</h2>
        <p className="muted small">{pulled.meta}</p>
        <div className="actions">
          <Link to={pulled.gameHref} className="button button-primary">{tr('Voir la fiche')}</Link>
          <button type="button" className="button" onClick={() => { closing.current = true; dialog.current?.close(); onClose(); onEdit(); }}>{tr('Modifier')}</button>
          <button type="button" className="button" onClick={close}>{tr('Fermer')}</button>
        </div>
      </div>
    </dialog>
  );
}
