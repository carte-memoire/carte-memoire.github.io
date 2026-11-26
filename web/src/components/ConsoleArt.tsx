// La console choisie, en image : un rendu 3D fait avec Blender (scripts/consoles/render.py),
// d'après des photos des vraies consoles, sans logo ni marque. Une image par console dans
// assets/consoles (WebP transparent, 288 × 192), chargée seulement quand elle s'affiche.
const RENDERS = import.meta.glob('../assets/consoles/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const renderOf = (platform: string): string | undefined => RENDERS[`../assets/consoles/${platform}.webp`];

export const hasConsoleArt = (platform: string): boolean => Boolean(renderOf(platform));

export function ConsoleArt({ platform, className = 'console-art' }: { platform: string; className?: string }) {
  const src = renderOf(platform);
  if (!src) return null;
  return <img className={className} src={src} alt="" width={288} height={192} loading="lazy" decoding="async" draggable={false} />;
}
