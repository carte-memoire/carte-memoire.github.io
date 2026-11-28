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

// Les modèles dérivés d'une console, qui lisent les mêmes jeux (une seule console dans le
// catalogue) : Game Boy Advance SP, Game Boy Pocket, PSone, PS2 « Slim », Mega Drive II
const VARIANTS: Record<string, string> = { GBA: 'GBASP', GB: 'GBP', PS1: 'PSONE', PS2: 'PS2SLIM', MD: 'MD2' };

// La console et, quand elle en a un, son modèle dérivé : l'original derrière, le dérivé devant,
// plus petit (comme en vrai)
export function ConsoleFamilyArt({ platform }: { platform: string }) {
  const variant = VARIANTS[platform];
  if (!variant || !renderOf(variant)) return <ConsoleArt platform={platform} />;
  return (
    <span className="console-pair">
      <ConsoleArt platform={platform} />
      <ConsoleArt platform={variant} className="console-art is-variant" />
    </span>
  );
}
