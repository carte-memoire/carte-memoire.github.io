import { useId } from 'react';
import type { Zone } from '../lib/types';

// Le disque du jeu, derrière sa jaquette en haut de la fiche : il roule hors du boîtier à
// l'arrivée, et tourne au survol comme lancé à la main (styles.css, « Disque »).
// Aucune source libre n'a d'images de disques : il est dessiné selon le support de la
// console. La PlayStation reprend l'étiquette « universelle » de ses CD noirs (pastilles
// arrondies du code produit et du titre, bande PAL/NTSC, région, petit texte en tour de
// disque), avec les informations de la version affichée ; sans les logos (PlayStation,
// Sony, Compact Disc), qui sont des marques. Le recto de la jaquette est imprimé sur la
// face, recadré sur son centre : on reconnaît le jeu rien qu'au disque. Sans jaquette, la
// PS2 garde son DVD bleuté et la PS3 son Blu-ray.
// Les consoles à cartouches, ou au support encore non dessiné (UMD de la PSP…), n'en ont pas.
const MEDIA: Record<string, string> = {
  PS1: 'cd-noir',
  PS2: 'dvd-bleu',
  PS3: 'bluray',
};

export interface DiscLabel {
  title: string;
  code: string | null;
  zone: Zone | null;
  publisher: string | null;
  year: string | null;
  // Adresse du recto de la jaquette, imprimé sur le disque (sinon, l'étiquette noire seule)
  art?: string | null;
}

export function hasDisc(platform: string | undefined): boolean {
  return Boolean(platform && MEDIA[platform]);
}

// Bande sous le logo (à gauche) et pastille de région (à droite), comme sur les disques
const BAND: Partial<Record<Zone, string>> = { PAL: 'PAL', 'NTSC-U': 'NTSC U/C', 'NTSC-J': 'NTSC J' };
const REGION: Partial<Record<Zone, string>> = { PAL: 'EUROPE', 'NTSC-U': 'NORTH AMERICA', 'NTSC-J': 'JAPAN' };

const INK = '#ececef';
const FINE = '#c9c9cf';

// Largeur approximative d'un texte (police du système, en gras) : assez pour tailler les pastilles
const textWidth = (text: string, size: number) => text.length * size * 0.56;

// Étiquette d'un CD de PlayStation, dans un carré de 1000 × 1000 (le trou est fait par le
// masque CSS). Texte et illustration dans le même sens, à l'endroit, comme sur un vrai
// disque imprimé : au repos, on voit surtout l'illustration et la région dans la partie
// qui dépasse du boîtier ; le titre entier se lit au survol et dans le boîtier ouvert.
function PlayStationLabel({ label }: { label: DiscLabel }) {
  const ring = `disque-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const titleSize = Math.max(26, Math.min(46, 560 / (label.title.length * 0.56)));
  const titleWidth = Math.min(660, textWidth(label.title, titleSize) + 70);
  const codeWidth = label.code ? textWidth(label.code, 26) + 44 : 0;
  const band = label.zone ? BAND[label.zone] : undefined;
  const region = label.zone ? REGION[label.zone] : undefined;
  const regionWidth = region ? textWidth(region, 28) + 40 : 0;
  // Le petit texte du tour : les vraies informations de la version, répétées tout autour
  const facts = [label.title, label.code, label.publisher, label.year].filter(Boolean).join(' · ');
  let fine = '';
  while (fine.length < 250) fine += `${facts} · `;

  return (
    <svg className="media-disc-label" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
      <defs>
        <path id={ring} d="M 500,62 a 438,438 0 1,1 0,876 a 438,438 0 1,1 0,-876" />
        <clipPath id={`${ring}-impression`}><circle cx="500" cy="500" r="468" /></clipPath>
      </defs>
      <circle cx="500" cy="500" r="500" fill="#0c0c0f" />
      {/* La jaquette imprimée sur le disque, à l'endroit : agrandie pour couper ses bords
          (bandeau, logos de coin), un peu assombrie pour que les pastilles restent lisibles */}
      {label.art && (
        <g clipPath={`url(#${ring}-impression)`}>
          <image href={label.art} x="-75" y="-75" width="1150" height="1150" preserveAspectRatio="xMidYMid slice" />
          <circle cx="500" cy="500" r="468" fill="rgba(0, 0, 0, 0.22)" />
          {/* Couronne sombre sous le petit texte du tour */}
          <circle cx="500" cy="500" r="447" fill="none" stroke="rgba(8, 8, 10, 0.78)" strokeWidth="42" />
        </g>
      )}
      <g fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" fontWeight="700">
        <circle cx="500" cy="500" r="468" fill="none" stroke={INK} strokeWidth="3" />
        <text fontSize="19" fontWeight="500" fill={FINE} letterSpacing="0.5">
          <textPath href={`#${ring}`}>{fine.slice(0, 250)}</textPath>
        </text>
        {/* Moyeu : la zone transparente et l'anneau d'empilage autour du trou */}
        <circle cx="500" cy="500" r="140" fill="#121216" stroke="#2c2c33" strokeWidth="3" />
        <circle cx="500" cy="500" r="100" fill="none" stroke="#1f1f25" strokeWidth="2" />

        {label.code && (
          <g>
            <rect x={500 - codeWidth / 2} y="262" width={codeWidth} height="46" rx="23" fill="#0c0c0f" stroke={INK} strokeWidth="3" />
            <text x="500" y="294" fontSize="26" fill={INK} textAnchor="middle">{label.code}</text>
          </g>
        )}
        <rect x={500 - titleWidth / 2} y="330" width={titleWidth} height="78" rx="39" fill="#0c0c0f" stroke={INK} strokeWidth="5" />
        <text x="500" y={369 + titleSize * 0.36} fontSize={titleSize} fontWeight="600" fill="#fff" textAnchor="middle">{label.title}</text>

        {band && (
          <g>
            <rect x="140" y="548" width="140" height="28" fill={INK} />
            <text x="210" y="570" fontSize="21" fill="#111" textAnchor="middle">{band}</text>
          </g>
        )}
        {region && (
          <g>
            <rect x={808 - regionWidth / 2} y="420" width={regionWidth} height="46" rx="23" fill="#0c0c0f" stroke={INK} strokeWidth="3" />
            <text x="808" y="453" fontSize="28" fill={INK} textAnchor="middle">{region}</text>
          </g>
        )}

        {(label.year || label.publisher) && (
          <text x="500" y="790" fontSize="22" fontWeight="500" fill={FINE} textAnchor="middle" stroke="rgba(0, 0, 0, 0.75)" strokeWidth="5" paintOrder="stroke">
            {`© ${[label.year, label.publisher].filter(Boolean).join(' ')}`}
          </text>
        )}
        <line x1="250" y1="822" x2="750" y2="822" stroke={INK} strokeWidth="2.5" />
      </g>
    </svg>
  );
}

// Support dessiné pour la console (cd-noir, dvd-bleu, bluray), ou rien
export function discMedia(platform: string | undefined): string | undefined {
  return platform ? MEDIA[platform] : undefined;
}

// La face du disque, avec son étiquette (aussi utilisée par le boîtier qui s'ouvre,
// CaseOpening.tsx) : toujours sur les CD de PlayStation, et sur les autres disques dès que
// la jaquette est là pour être imprimée. Le parent porte la classe media-disc-<support>.
export function DiscFace({ media, label }: { media: string; label?: DiscLabel | null }) {
  const printed = label && (media === 'cd-noir' || label.art) ? label : null;
  return (
    <span className={printed ? 'media-disc-face has-label' : 'media-disc-face'}>
      {printed && <PlayStationLabel label={printed} />}
    </span>
  );
}

export function Disc({ platform, label }: { platform: string | undefined; label?: DiscLabel | null }) {
  const media = discMedia(platform);
  if (!media) return null;
  return (
    <span className={`media-disc media-disc-${media}`} aria-hidden="true">
      <span className="media-disc-roll"><DiscFace media={media} label={label} /></span>
    </span>
  );
}
