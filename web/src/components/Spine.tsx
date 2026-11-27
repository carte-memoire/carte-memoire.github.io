// La tranche d'un jeu, telle qu'on la voit rangé sur une étagère, au format européen
// (PAL) quelle que soit la région de la version, d'après les tranches officielles :
//   PS1 : tranche noire ; marque en haut, titre en capitales étroites blanches écrit de
//         haut en bas, code produit en bas (« SLES » au-dessus du numéro) ;
//   PS2 : tranche blanche ; en haut, un grand bandeau noir (≈ 40 % de la hauteur, d'après une
//         vraie tranche) avec la marque, l'étiquette PAL et « PlayStation 2 » à la verticale ;
//         titre noir écrit de haut en bas, code produit en bas ;
//   réédition (Platinum) : tranche grise (jamais noire), titre foncé.
// Sans les logos de Sony (des marques) : la marque du haut est le nom court de la console.
// Les dimensions suivent les boîtiers PAL (styles.css) : PS1 17 × 130 mm, PS2 14 × 190 mm.

import { useLayoutEffect, useRef, type CSSProperties } from 'react';

interface SpineRelease {
  local_title: string;
  product_code: string | null;
  edition_type: string;
  platform: { short_name: string };
}

const KIND: Record<string, string> = { PS1: 'ps1', PS2: 'ps2', NES: 'nes', FDS: 'fds', SNES: 'snes', N64: 'snes', GB: 'gb', GBC: 'gb', MD: 'md' };

export function spineKind(platform: string): string | undefined {
  return KIND[platform];
}

// « SLES-00867 » → « SLES » et « 00867 », l'un au-dessus de l'autre comme sur les tranches
function splitCode(code: string | null): [string, string] | null {
  const m = code?.match(/^([A-Z]{4})[-\s]?(\d[\d.]*)/i);
  return m ? [m[1].toUpperCase(), m[2]] : null;
}

// Caractères qui tiennent sur une ligne de titre à pleine taille (place entre la marque et
// le code, capitales étroites) : au-delà, le titre est écrit plus petit, et sur deux lignes
// quand il est très long, comme sur les vrais boîtiers ; jamais coupé
const CAPACITY: Record<string, number> = { ps1: 18, ps2: 32, nes: 15, fds: 16, snes: 14, gb: 13, md: 20 };

// Tranches NES : comme sur les boîtes « black box », chaque jeu a son titre d'une couleur vive
// (bleu, rose, cyan, jaune, rouge, violet, vert, orange), toujours la même pour un même titre ;
// Super Nintendo : le titre en couleur sur la tranche noire (Amérique du Nord), ou la tranche
// entière de cette couleur (Super Famicom)
const NES_INKS = ['#35c3f3', '#f2509f', '#4ce0d2', '#f7d23a', '#f0483e', '#b46cf5', '#5ed35a', '#f8962e', '#5b86ff'];
const titleHash = (title: string) => {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};
function nesInk(title: string): string {
  return NES_INKS[titleHash(title) % NES_INKS.length];
}

// Tranches Game Boy et Game Boy Color (Amérique du Nord, Europe) : entièrement aux couleurs du
// jeu, comme sur les photos (College Slam noire, Final Fantasy Legend III violette, HAL Wrestling
// blanche, Micro Machines bleue…) : un fond et un titre bien lisible dessus, toujours les mêmes
// pour un même titre
const GB_SPINES: [string, string][] = [
  ['#141416', '#35c3f3'], ['#141416', '#f7d23a'], ['#f2f1ec', '#c8202a'], ['#f2f1ec', '#2f56c9'],
  ['#2f56c9', '#ffffff'], ['#c8202a', '#ffffff'], ['#5b3a96', '#f2c94c'], ['#1f8f5a', '#ffffff'],
  ['#f2b51c', '#18181b'], ['#e46a1c', '#ffffff'], ['#1c9ac9', '#ffffff'], ['#7a1f3d', '#ffffff'],
];
function gbSpine(title: string): CSSProperties {
  const [back, text] = GB_SPINES[titleHash(title) % GB_SPINES.length];
  return { ['--gb-back' as string]: back, ['--gb-text' as string]: text, ['--ink' as string]: back } as CSSProperties;
}

// Mega Drive : le titre de la couleur du jeu sur la tranche noire quadrillée (Europe, Amérique) ;
// au Japon, la tranche entière aux couleurs du jeu (les mêmes paires fond / titre que la Game Boy)
function mdSpine(title: string): CSSProperties {
  const [back, text] = GB_SPINES[titleHash(title) % GB_SPINES.length];
  return { ['--ink' as string]: nesInk(title), ['--md-back' as string]: back, ['--md-text' as string]: text } as CSSProperties;
}

function titleFit(kind: string, title: string): { fit: number; twoLines: boolean } {
  const capacity = CAPACITY[kind] ?? 28;
  const fit = Math.min(1, capacity / title.length);
  if (fit >= 0.62) return { fit, twoLines: false };
  // Deux lignes côte à côte dans la largeur : 0,7 au plus de la taille pleine
  return { fit: Math.min(0.7, (capacity * 2) / title.length), twoLines: true };
}

// Le titre doit tenir en entier, sans points de suspension : on le mesure dans la tranche et
// on le rétrécit (puis on le passe sur deux lignes) tant qu'il dépasse, en hauteur comme en
// largeur. On recommence quand la tranche prend sa taille réelle (boîtier 3D : la fenêtre
// s'ouvre après le premier rendu) et quand les polices ont fini de charger.
// La mesure se fait sur une copie de la tranche posée à plat hors de l'écran : la vraie peut
// être en train de tourner en 3D (boîtier sorti de l'étagère, vu de biais ou de profil),
// grandie par l'animation ou en train de tomber sur l'étagère, et ses tailles à l'écran ne
// diraient plus si le titre tient (il était alors réduit au minimum, illisible).
function fitTitle(el: HTMLElement, start: number, startTwoLines: boolean) {
  const face = el.parentElement;
  if (!face || !face.offsetWidth || !face.offsetHeight) return;
  const probe = face.cloneNode(true) as HTMLElement;
  probe.style.cssText = `position: fixed; left: -10000px; top: 0; width: ${face.offsetWidth}px; height: ${face.offsetHeight}px;`
    + ` visibility: hidden; pointer-events: none; --spine-w: ${getComputedStyle(face).getPropertyValue('--spine-w')}`;
  const title = probe.querySelector<HTMLElement>('.spine-title');
  if (!title) return;
  document.body.append(probe);
  title.classList.toggle('is-two-lines', startTwoLines);
  let fit = start;
  title.style.setProperty('--fit', fit.toFixed(3));
  // Le texte réellement dessiné (toutes ses lignes) doit tenir : en hauteur dans la place
  // réservée au titre, marges comprises (rien dans la marge qui le sépare du code), en largeur
  // dans la tranche entière (le cadre du titre lui-même n'a que la largeur d'une ligne, que les
  // lettres dessinées dépassent toujours un peu)
  const style = getComputedStyle(title);
  const overflows = () => {
    const frame = title.getBoundingClientRect();
    const top = frame.top + parseFloat(style.paddingTop);
    const bottom = frame.bottom - parseFloat(style.paddingBottom);
    const spine = probe.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = range.getBoundingClientRect();
    return text.left < spine.left - 0.5 || text.right > spine.right + 0.5 || text.top < top - 0.5 || text.bottom > bottom + 0.5;
  };
  for (let i = 0; i < 60 && overflows() && fit > 0.16; i++) {
    fit *= 0.94;
    if (fit < 0.62 && !title.classList.contains('is-two-lines')) { title.classList.add('is-two-lines'); fit = Math.min(0.7, fit * 2); }
    title.style.setProperty('--fit', fit.toFixed(3));
  }
  probe.remove();
  el.classList.toggle('is-two-lines', title.classList.contains('is-two-lines'));
  el.style.setProperty('--fit', fit.toFixed(3));
}

function useFittedTitle(title: string, start: number, startTwoLines: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => fitTitle(el, start, startTwoLines);
    run();
    const observer = new ResizeObserver(run);
    observer.observe(el.parentElement ?? el);
    document.fonts?.ready.then(run, () => undefined);
    return () => observer.disconnect();
  }, [title, start, startTwoLines]);
  return ref;
}

// region : tranche d'un boîtier américain (us) ou japonais (jp), dans le boîtier 3D d'une
// version de ces régions ; sans elle, la tranche européenne (l'étagère est toujours au format
// européen). Une réédition américaine (Greatest Hits) a son bandeau rouge.
export function SpineFace({ release, region }: { release: SpineRelease; region?: 'us' | 'jp' }) {
  const kind = spineKind(release.platform.short_name) ?? 'ps1';
  const code = splitCode(release.product_code);
  const reissue = release.edition_type === 'reissue';
  const { fit, twoLines } = titleFit(kind, release.local_title);
  const titleRef = useFittedTitle(release.local_title, fit, twoLines);
  return (
    <span className={`spine-face spine-${kind}${release.platform.short_name === 'GBC' ? ' is-gbc' : ''}${release.platform.short_name === 'N64' ? ' is-n64' : ''}${reissue ? ' is-reissue' : ''}${region ? ` spine-region-${region}` : ''}`} aria-hidden="true"
      style={kind === 'gb' ? gbSpine(release.local_title) : kind === 'md' ? mdSpine(release.local_title)
        : kind === 'nes' || kind === 'snes' ? ({ ['--ink' as string]: nesInk(release.local_title) } as CSSProperties) : undefined}>
      <span className="spine-band">
        {/* Super Nintendo : le nom de la console en texte simple, à la place de son logo
            (Super Famicom au Japon) */}
        {/* Mega Drive : « GENESIS » sur un boîtier américain */}
        <span className="spine-mark">{kind === 'snes' ? (release.platform.short_name === 'N64' ? 'NINTENDO 64' : region === 'jp' ? 'SUPER FAMICOM' : 'SUPER NES') : kind === 'gb' ? (release.platform.short_name === 'GBC' ? 'GAME BOY COLOR' : 'GAME BOY') : kind === 'md' ? (region === 'us' ? 'GENESIS' : 'MEGA DRIVE') : release.platform.short_name}</span>
        {/* PS2 : sous la marque, l'étiquette PAL (en Europe seulement) puis le nom de la
            console à la verticale, en texte simple (pas de logo) */}
        {kind === 'ps2' && <>{!region && <span className="spine-pal">PAL</span>}<span className="spine-console">PlayStation 2</span></>}
      </span>
      <span ref={titleRef} className={twoLines ? 'spine-title is-two-lines' : 'spine-title'} style={{ ['--fit' as string]: fit.toFixed(3) } as CSSProperties}>{release.local_title}</span>
      {/* La place du code est toujours gardée en bas, même sans code (laissée vide) : le titre
          ne descend jamais dessus */}
      {code
        ? <span className="spine-code">{code[0]}<br />{code[1]}</span>
        : <span className="spine-code is-empty">SLES<br />00000</span>}
    </span>
  );
}
