import { useRef, useState, type PointerEvent } from 'react';
import { tr } from '../lib/i18n';

const LEVELS = [1, 2, 3];

// Une image en grand pour l'examiner (modération) : ajustée à l'écran, ou à 100, 200,
// 300 % ; on la déplace en la faisant glisser, double-clic pour passer de l'une à
// l'autre. Dès 200 %, les vrais pixels (flou, compression, reflets bien visibles).
export function ImageZoom({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState<number | null>(null); // null : ajustée à l'écran
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  function start(e: PointerEvent<HTMLDivElement>) {
    if (zoom === null || !stage.current) return;
    drag.current = { x: e.clientX, y: e.clientY, left: stage.current.scrollLeft, top: stage.current.scrollTop };
    try { stage.current.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !stage.current) return;
    stage.current.scrollLeft = d.left - (e.clientX - d.x);
    stage.current.scrollTop = d.top - (e.clientY - d.y);
  }

  const size = zoom !== null && natural ? { width: natural.width * zoom, height: natural.height * zoom } : undefined;
  return (
    <dialog className="image-zoom" aria-label={alt}
      ref={(node) => { if (node && !node.open) node.showModal(); }}
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="image-zoom-bar">
        <div className="pills" role="group" aria-label={tr('Zoom')}>
          <button type="button" className={zoom === null ? 'pill active' : 'pill'} onClick={() => setZoom(null)}>{tr('Ajustée')}</button>
          {LEVELS.map((level) => (
            <button key={level} type="button" className={zoom === level ? 'pill active' : 'pill'} onClick={() => setZoom(level)}>{level * 100} %</button>
          ))}
        </div>
        {natural && <span className="muted small">{natural.width} × {natural.height} px</span>}
        <button type="button" className="button button-small" onClick={onClose}>{tr('Fermer')}</button>
      </div>
      <div ref={stage} className={zoom === null ? 'image-zoom-stage is-fit' : 'image-zoom-stage'}
        onPointerDown={start} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={() => setZoom((z) => (z === null ? 2 : null))}>
        <img src={src} alt={alt} draggable={false}
          onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          style={size ? { width: size.width, height: size.height, imageRendering: zoom! >= 2 ? 'pixelated' : 'auto' } : undefined} />
      </div>
    </dialog>
  );
}
