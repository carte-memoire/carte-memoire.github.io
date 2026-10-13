import { useId, useMemo } from 'react';
import { drawConsole } from '../lib/consoleArt';

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
