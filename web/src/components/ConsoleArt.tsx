import { useEffect, useId, useMemo, useState } from 'react';
import { drawConsole, hasConsoleArt } from '../lib/consoleArt';
import { ControllerButtons } from './ControllerButtons';

export { hasConsoleArt } from '../lib/consoleArt';

// La console choisie, dessinée en 3D (voir lib/consoleArt.ts)
export function ConsoleArt({ platform, className = 'console-art' }: { platform: string; className?: string }) {
  const blurId = `ombre-${useId().replace(/:/g, '')}`;
  const art = useMemo(() => drawConsole(platform), [platform]);
  if (!art) return null;
  return (
    <svg className={className} viewBox={art.viewBox} aria-hidden="true" focusable="false">
      <defs>
        <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      {art.shapes.map((shape, i) => (
        <path key={i} d={shape.d} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.width} opacity={shape.opacity}
          filter={shape.blur ? `url(#${blurId})` : undefined} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}

// Sous le titre de l'accueil : la console choisie (ou les boutons de la manette pour
// « toutes les consoles »). Quand on en change, la précédente s'en va vers la gauche
// et la nouvelle arrive de la droite ; au premier affichage, l'animation de démarrage.
export function ConsoleShowcase({ platform }: { platform: string }) {
  const [current, setCurrent] = useState(platform);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [switched, setSwitched] = useState(false);
  // Nouvelle console : on garde la précédente le temps de sa sortie
  if (platform !== current) {
    setLeaving(current);
    setCurrent(platform);
    setSwitched(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), 340);
    return () => clearTimeout(timer);
  }, [leaving]);

  const visual = (code: string) => (hasConsoleArt(code)
    ? <ConsoleArt platform={code} />
    : <p className="buttons-legend"><ControllerButtons platform={code} /></p>);
  return (
    <div className="console-stage" aria-hidden="true">
      {leaving && <div key={`sortie-${leaving}`} className="console-slot console-leave">{visual(leaving)}</div>}
      <div key={current} className={switched ? 'console-slot console-enter' : 'console-slot'}>{visual(current)}</div>
    </div>
  );
}
