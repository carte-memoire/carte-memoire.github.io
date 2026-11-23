// Le disque du jeu, derrière sa jaquette en haut de la fiche : il roule hors du boîtier à
// l'arrivée, et tourne au survol comme lancé à la main (styles.css, « Disque »).
// Dessiné en CSS selon le support de la console : le CD noir de la PlayStation (sa face
// gravée est noire), le DVD bleuté de la PS2, le Blu-ray argenté de la PS3. Les consoles à
// cartouches, ou au support encore non dessiné (UMD de la PSP…), n'en ont pas.
const MEDIA: Record<string, string> = {
  PS1: 'cd-noir',
  PS2: 'dvd-bleu',
  PS3: 'bluray',
};

export function hasDisc(platform: string | undefined): boolean {
  return Boolean(platform && MEDIA[platform]);
}

export function Disc({ platform }: { platform: string | undefined }) {
  const media = platform ? MEDIA[platform] : undefined;
  if (!media) return null;
  return (
    <span className={`disc disc-${media}`} aria-hidden="true">
      <span className="disc-roll"><span className="disc-face" /></span>
    </span>
  );
}
