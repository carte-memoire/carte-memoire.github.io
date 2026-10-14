import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CASE_FORMATS, fixedRatio, insetQuad, type CaseFormat, type Quad } from '../lib/coverPhoto';
import { cameraError } from './ScanCamera';
import { tr } from '../lib/i18n';

interface Rect { x: number; y: number; width: number; height: number }

// Le cadre aux proportions du boîtier, centré ; un peu de marge en haut et en bas pour
// les boutons posés sur l'image (choix du cadre, déclencheur)
function frameRect(width: number, height: number, ratio: number): Rect {
  const maxW = width * 0.86, maxH = height * 0.66;
  const w = maxW / maxH > ratio ? maxH * ratio : maxW;
  const h = w / ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

// Photo de la jaquette, appareil photo en direct : un cadre aux proportions du boîtier
// (CD carré, DVD haut) aide à placer la boîte ; « Sans cadre » pour une édition
// collector, un bundle, une boîte en carton… L'image reste dans le navigateur.
export function CoverCamera({ format, onFormat, onPhoto }: {
  format: CaseFormat;
  onFormat: (format: CaseFormat) => void;
  // La photo, et les coins du cadre dans la photo (point de départ du recadrage)
  onPhoto: (image: HTMLCanvasElement, quad: Quad) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState('');
  // Hauteur disponible à l'écran pour l'image : du haut de l'image jusqu'en bas de
  // l'écran, moins la barre d'onglets du téléphone (mesurée, pas devinée)
  const viewRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const top = viewRef.current?.getBoundingClientRect().top;
      if (top === undefined) return;
      const bar = document.querySelector('.nav')?.getBoundingClientRect();
      const barHeight = bar && bar.top > window.innerHeight / 2 ? window.innerHeight - bar.top : 0;
      setRoom(Math.max(240, Math.round(window.innerHeight - Math.max(0, top) - barHeight - 12)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [error]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(tr("Ce navigateur ne permet pas d'utiliser l'appareil photo (il faut une page sécurisée en https)."));
      return;
    }
    let stopped = false;
    (async () => {
      try {
        // La meilleure définition possible : la jaquette doit rester nette une fois recadrée
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (stopped) return media.getTracks().forEach((t) => t.stop());
        stream.current = media;
        const v = video.current;
        if (!v) return;
        v.srcObject = media;
        v.onloadedmetadata = () => setSize({ width: v.videoWidth, height: v.videoHeight });
        await v.play().catch(() => undefined);
      } catch (e) {
        if (!stopped) setError(cameraError(e));
      }
    })();
    return () => {
      stopped = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  const frame = size && format !== 'free' ? frameRect(size.width, size.height, fixedRatio(format)) : null;

  function shoot() {
    const v = video.current;
    if (!v || !size) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    navigator.vibrate?.(40);
    // L'appareil photo s'arrête dès la photo prise
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    const quad: Quad = frame
      ? [{ x: frame.x, y: frame.y }, { x: frame.x + frame.width, y: frame.y },
        { x: frame.x + frame.width, y: frame.y + frame.height }, { x: frame.x, y: frame.y + frame.height }]
      : insetQuad(canvas.width, canvas.height);
    onPhoto(canvas, quad);
  }

  const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;
  const ratio = size ? size.width / size.height : 3 / 4;

  return (
    <div className="cover-camera">
      {!error && (
        <p className="hint center">
          {format === 'free'
            ? tr('Cadre la boîte entière, bien éclairée : tu placeras ses coins juste après.')
            : tr('Place la jaquette dans le cadre, à plat, bien éclairée et sans reflet.')}
        </p>
      )}
      {error ? (
        <>
          <p className="error">{error}</p>
          <FormatChoice format={format} onFormat={onFormat} />
        </>
      ) : (
        // Comme une appli photo : le choix du cadre en haut de l'image, le déclencheur en
        // bas ; l'image prend la hauteur disponible de l'écran, sans avoir à faire défiler
        <div ref={viewRef} className="cover-camera-view"
          style={{ aspectRatio: `${ratio}`, ['--ratio' as string]: ratio, ...(room ? { ['--camera-height' as string]: `${room}px` } : {}) } as CSSProperties}>
          <video ref={video} muted playsInline aria-label={tr("Image de l'appareil photo")} />
          {frame && size && (
            <span className="cover-camera-frame" aria-hidden="true" style={{
              left: percent(frame.x, size.width), top: percent(frame.y, size.height),
              width: percent(frame.width, size.width), height: percent(frame.height, size.height),
            }} />
          )}
          {!size && <span className="scan-wait">{tr("Ouverture de l'appareil photo…")}</span>}
          <div className="cover-camera-top"><FormatChoice format={format} onFormat={onFormat} /></div>
          <button type="button" className="cover-shutter" disabled={!size} onClick={shoot} aria-label={tr('Prendre la photo')} title={tr('Prendre la photo')}>
            <span aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// Boîtier CD, boîtier DVD, ou sans cadre
function FormatChoice({ format, onFormat }: { format: CaseFormat; onFormat: (format: CaseFormat) => void }) {
  return (
    <div className="pills" role="group" aria-label={tr('Cadre de la photo')}>
      {CASE_FORMATS.map((f) => (
        <button key={f.value} type="button" className={f.value === format ? 'pill active' : 'pill'} aria-pressed={f.value === format} onClick={() => onFormat(f.value)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}
