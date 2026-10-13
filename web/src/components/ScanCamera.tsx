import { useEffect, useRef, useState } from 'react';
import { normalizeBarcode } from '../lib/barcode';

// Lecture des codes-barres dans l'image de l'appareil photo. Tout se passe dans le
// navigateur : aucune image ne quitte l'appareil. Le lecteur intégré au navigateur
// (BarcodeDetector, Chrome sur Android) est utilisé s'il existe ; sinon ZXing, une
// bibliothèque chargée seulement à ce moment-là (iPhone, Firefox…).

interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a'];

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return "Accès à l'appareil photo refusé. Autorise-le dans les réglages du navigateur (icône à gauche de l'adresse), puis réessaie.";
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucun appareil photo trouvé sur cet appareil.';
  if (name === 'NotReadableError') return "L'appareil photo est déjà utilisé par une autre application.";
  return "Impossible d'ouvrir l'appareil photo.";
}

// continuous : continue après chaque code (scan d'une pile de jeux) ; sinon s'arrête au premier
export function ScanCamera({ onCode, continuous = false }: { onCode: (code: string) => void; continuous?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  // Toujours la dernière version du rappel, sans relancer la caméra
  const callback = useRef(onCode);
  callback.current = onCode;

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Ce navigateur ne permet pas d'utiliser l'appareil photo (il faut une page sécurisée en https).");
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopZxing: (() => void) | undefined;
    let last = { code: '', at: 0 };

    // Un code lu : clé de contrôle vérifiée, et pas deux fois le même coup sur coup
    const found = (raw: string) => {
      const code = normalizeBarcode(raw);
      if (!code || stopped) return;
      const now = Date.now();
      if (code === last.code && now - last.at < 3000) return;
      last = { code, at: now };
      navigator.vibrate?.(60);
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
      if (!continuous) stop();
      callback.current(code);
    };

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (!stopped) setError(cameraError(e));
        return;
      }
      const v = video.current;
      if (stopped || !v) return stream.getTracks().forEach((t) => t.stop());
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      setReady(true);

      const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
      const supported = Native ? await Native.getSupportedFormats?.().catch(() => []) : [];
      if (Native && supported?.includes('ean_13')) {
        const detector = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
        const loop = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(v);
            for (const c of codes) found(c.rawValue);
          } catch { /* image pas encore prête */ }
          timer = setTimeout(loop, 150);
        };
        loop();
      } else {
        const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
        if (stopped) return;
        const hints = new Map<number, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromVideoElement(v, (result) => { if (result) found(result.getText()); });
        stopZxing = () => controls.stop();
        if (stopped) controls.stop();
      }
    })();

    return stop;
  }, [continuous]);

  return (
    <div className="scan-camera">
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <div className={flash ? 'scan-view is-flash' : 'scan-view'}>
          <video ref={video} muted playsInline aria-label="Image de l'appareil photo" />
          <span className="scan-frame" aria-hidden="true" />
          {!ready && <span className="scan-wait">Ouverture de l'appareil photo…</span>}
        </div>
      )}
      {!error && <p className="hint center">Place le code-barres de la boîte dans le cadre, bien à plat et éclairé.</p>}
    </div>
  );
}
