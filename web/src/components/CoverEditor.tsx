import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  CASE_FORMATS, coverRatio, insetQuad, outputSize, rotatePhoto, warpCover, type CaseFormat, type Point, type Quad,
} from '../lib/coverPhoto';
import { encodeImage } from '../lib/images';
import { errorMessage } from '../lib/errors';
import { tr } from '../lib/i18n';

const HANDLE = 15; // rayon des poignées, en pixels d'écran
const LOUPE = 112; // taille de la loupe
const ZOOM = 3;

// Les coins forment-ils un quadrilatère « propre » (convexe, dans le bon ordre) ?
function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

// Recadrage d'une photo de jaquette : on pose chaque coin sur un coin de la boîte
// (toucher l'image déplace le coin le plus proche), l'aperçu montre le résultat redressé.
export function CoverEditor({ image, quad: initialQuad, format, onFormat, onBack, onDone }: {
  image: HTMLCanvasElement;
  quad?: Quad;
  format: CaseFormat;
  onFormat: (format: CaseFormat) => void;
  onBack: () => void;
  onDone: (blob: Blob) => Promise<void> | void;
}) {
  const [source, setSource] = useState(image);
  const [quad, setQuad] = useState<Quad>(initialQuad ?? insetQuad(image.width, image.height));
  const [drag, setDrag] = useState<number | null>(null);
  const [scale, setScale] = useState(1); // pixels de la photo par pixel d'écran
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const holder = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);

  // La photo elle-même est affichée telle quelle (canvas), sous les coins
  useEffect(() => {
    const box = holder.current;
    if (!box) return;
    source.className = 'cover-editor-photo';
    box.replaceChildren(source);
    const observer = new ResizeObserver(() => {
      const width = source.getBoundingClientRect().width;
      if (width > 0) setScale(source.width / width);
    });
    observer.observe(source);
    return () => observer.disconnect();
  }, [source]);

  // Aperçu redressé, recalculé (en petit) à chaque déplacement
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = preview.current;
      if (!target || !isConvex(quad)) return;
      const { width, height } = outputSize(coverRatio(format, quad), 150, 210);
      const out = warpCover(source, quad, width, height);
      target.width = width;
      target.height = height;
      target.getContext('2d')!.drawImage(out, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [source, quad, format]);

  // Loupe : le coin déplacé, grossi, pour le poser précisément (le doigt le cache)
  useEffect(() => {
    const target = loupe.current;
    if (drag === null || !target) return;
    const p = quad[drag];
    const context = target.getContext('2d')!;
    const half = (LOUPE / 2 / ZOOM) * scale;
    context.fillStyle = '#000';
    context.fillRect(0, 0, LOUPE, LOUPE);
    context.drawImage(source, p.x - half, p.y - half, half * 2, half * 2, 0, 0, LOUPE, LOUPE);
    context.strokeStyle = '#2fd6a6';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(LOUPE / 2, 0); context.lineTo(LOUPE / 2, LOUPE);
    context.moveTo(0, LOUPE / 2); context.lineTo(LOUPE, LOUPE / 2);
    context.stroke();
  }, [drag, quad, source, scale]);

  function pointAt(e: PointerEvent<SVGSVGElement>): Point {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: Math.min(source.width, Math.max(0, ((e.clientX - rect.left) / rect.width) * source.width)),
      y: Math.min(source.height, Math.max(0, ((e.clientY - rect.top) / rect.height) * source.height)),
    };
  }

  function start(e: PointerEvent<SVGSVGElement>) {
    e.preventDefault();
    const p = pointAt(e);
    // Le coin le plus proche du doigt ; s'il est loin, il vient s'y poser
    let nearest = 0;
    quad.forEach((c, i) => { if (Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(quad[nearest].x - p.x, quad[nearest].y - p.y)) nearest = i; });
    if (Math.hypot(quad[nearest].x - p.x, quad[nearest].y - p.y) > HANDLE * 2 * scale) {
      setQuad((q) => q.map((c, i) => (i === nearest ? p : c)) as Quad);
    }
    // Le doigt peut sortir de l'image sans lâcher le coin
    try { svg.current!.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    setDrag(nearest);
  }

  function move(e: PointerEvent<SVGSVGElement>) {
    if (drag === null) return;
    const p = pointAt(e);
    setQuad((q) => q.map((c, i) => (i === drag ? p : c)) as Quad);
  }

  function rotate(turn: 1 | -1) {
    const next = rotatePhoto(source, quad, turn);
    setSource(next.image);
    setQuad(next.quad);
  }

  async function validate() {
    if (!isConvex(quad)) return setError(tr('Les coins se croisent : replace chacun sur le coin correspondant de la jaquette.'));
    setBusy(true);
    setError('');
    try {
      const { width, height } = outputSize(coverRatio(format, quad));
      await onDone(await encodeImage(warpCover(source, quad, width, height)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const r = HANDLE * scale;
  const points = quad.map((p) => `${p.x},${p.y}`).join(' ');
  // Loupe du côté opposé au coin déplacé, pour ne pas être sous le doigt
  const loupeLeft = drag !== null && quad[drag].x < source.width / 2;

  return (
    <div className="cover-editor">
      <p className="hint">{tr('Place chaque rond sur un coin de la jaquette (touche ou clique près d’un coin pour l’y amener). L’aperçu montre le résultat redressé.')}</p>
      <div className="cover-editor-body">
        <div className="cover-editor-stage">
          <div className="cover-editor-frame">
          <div ref={holder} className="cover-editor-holder" />
          <svg ref={svg} className="cover-editor-overlay" viewBox={`0 0 ${source.width} ${source.height}`} preserveAspectRatio="none"
            onPointerDown={start} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
            role="img" aria-label={tr('Coins de la jaquette sur la photo')}>
            <path className="cover-editor-shade" fillRule="evenodd" d={`M0 0H${source.width}V${source.height}H0Z M${points.replace(/ /g, ' L')}Z`} />
            <polygon className="cover-editor-edge" points={points} />
            {quad.map((p, i) => (
              <circle key={i} className={drag === i ? 'cover-editor-handle is-active' : 'cover-editor-handle'} cx={p.x} cy={p.y} r={r} strokeWidth={2.5 * scale} />
            ))}
          </svg>
          </div>
          {drag !== null && <canvas ref={loupe} className={loupeLeft ? 'cover-editor-loupe is-right' : 'cover-editor-loupe'} width={LOUPE} height={LOUPE} aria-hidden="true" />}
        </div>
        <div className="cover-editor-side">
          <canvas ref={preview} className="cover-editor-preview" aria-label={tr('Aperçu de la jaquette recadrée')} />
          <div className="cover-editor-tools">
            <button type="button" className="button button-small" onClick={() => rotate(-1)} title={tr("Tourner d'un quart de tour vers la gauche")}>{tr('↺ Tourner')}</button>
            <button type="button" className="button button-small" onClick={() => rotate(1)} title={tr("Tourner d'un quart de tour vers la droite")}>{tr('↻ Tourner')}</button>
            <button type="button" className="link-button small" onClick={() => setQuad(insetQuad(source.width, source.height))}>{tr('Replacer les coins')}</button>
          </div>
        </div>
      </div>
      <div className="pills" role="group" aria-label={tr('Format de la jaquette')}>
        {CASE_FORMATS.map((f) => (
          <button key={f.value} type="button" className={f.value === format ? 'pill active' : 'pill'} aria-pressed={f.value === format} onClick={() => onFormat(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="button" onClick={onBack} disabled={busy}>{tr('Autre photo')}</button>
        <button type="button" className="button button-primary" onClick={validate} disabled={busy}>
          {busy ? tr('Préparation…') : tr('Valider ce recadrage')}
        </button>
      </div>
    </div>
  );
}
