// La tranche d'un jeu, telle qu'on la voit rangé sur une étagère, au format européen
// (PAL) quelle que soit la région de la version, d'après les tranches officielles :
//   PS1 : tranche noire ; marque en haut, titre en capitales étroites blanches écrit de
//         haut en bas, code produit en bas (« SLES » au-dessus du numéro) ;
//   PS2 : tranche blanche ; bandeau noir en haut avec la marque, titre noir écrit de bas
//         en haut, code produit en bas ;
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

const KIND: Record<string, string> = { PS1: 'ps1', PS2: 'ps2' };

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
const CAPACITY: Record<string, number> = { ps1: 18, ps2: 32 };

function titleFit(kind: string, title: string): { fit: number; twoLines: boolean } {
  const capacity = CAPACITY[kind] ?? 28;
  const fit = Math.min(1, capacity / title.length);
  if (fit >= 0.62) return { fit, twoLines: false };
  // Deux lignes côte à côte dans la largeur : 0,7 au plus de la taille pleine
  return { fit: Math.min(0.7, (capacity * 2) / title.length), twoLines: true };
}

// Le titre doit tenir en entier : on le mesure une fois affiché, et on le rétrécit (puis on
// le passe sur deux lignes) tant qu'il dépasse
function useFittedTitle(title: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let fit = Number(el.style.getPropertyValue('--fit')) || 1;
    for (let i = 0; i < 24 && el.scrollHeight > el.clientHeight + 1 && fit > 0.3; i++) {
      fit *= 0.93;
      if (fit < 0.62 && !el.classList.contains('is-two-lines')) { el.classList.add('is-two-lines'); fit = Math.min(0.7, fit * 2); }
      el.style.setProperty('--fit', fit.toFixed(3));
    }
  }, [title]);
  return ref;
}

export function SpineFace({ release }: { release: SpineRelease }) {
  const kind = spineKind(release.platform.short_name) ?? 'ps1';
  const code = splitCode(release.product_code);
  const reissue = release.edition_type === 'reissue';
  const { fit, twoLines } = titleFit(kind, release.local_title);
  const titleRef = useFittedTitle(release.local_title);
  return (
    <span className={`spine-face spine-${kind}${reissue ? ' is-reissue' : ''}`} aria-hidden="true">
      <span className="spine-band"><span className="spine-mark">{release.platform.short_name}</span></span>
      <span ref={titleRef} className={twoLines ? 'spine-title is-two-lines' : 'spine-title'} style={{ ['--fit' as string]: fit.toFixed(3) } as CSSProperties}>{release.local_title}</span>
      {code && <span className="spine-code">{code[0]}<br />{code[1]}</span>}
    </span>
  );
}
