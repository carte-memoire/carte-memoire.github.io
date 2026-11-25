// Le meuble qui porte une étagère de Ma collection (tranches ou jaquettes) : tablettes murales,
// bibliothèque ou vitrine, dans la finition, l'épaisseur et l'éclairage choisis (ShelfStyle.tsx).
//
// Les jeux gardent leur mise en page (rangées qui passent à la ligne) ; le meuble se dessine
// autour : il relève le bas de chaque rangée (`lines` : les éléments posés sur les tablettes)
// et pose une tablette pleine largeur sous chacune, une case éclairée au-dessus, la vitre
// devant. Rien de tout cela ne capte la souris : les jeux restent cliquables et déplaçables.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ShelfStyle } from '../lib/preferences';
import { shelfClass } from './ShelfStyle';

// Position verticale d'un élément dans le meuble, d'après la mise en page (sans les
// animations : une jaquette qui se soulève ne déplace pas la tablette)
function offsetWithin(el: HTMLElement, container: HTMLElement): number {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === container ? y : el.getBoundingClientRect().top - container.getBoundingClientRect().top;
}

export function ShelfFurniture({ style, lines, refresh, title, tune, children }: {
  style: ShelfStyle;
  // Sélecteur des éléments posés sur les tablettes (le bas de chaque rangée)
  lines: string;
  // Change quand le contenu change (nombre de jeux…) : les tablettes sont replacées
  refresh?: unknown;
  // Nom de l'étagère (sur la plaque du meuble) et bouton « Personnaliser »
  title?: ReactNode;
  tune?: ReactNode;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<number[]>([]);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      const found: number[] = [];
      for (const item of el.querySelectorAll<HTMLElement>(lines)) {
        const y = Math.round(offsetWithin(item, el) + item.offsetHeight);
        if (!found.some((f) => Math.abs(f - y) < 4)) found.push(y);
      }
      found.sort((a, b) => a - b);
      setRows((prev) => (prev.length === found.length && prev.every((v, i) => v === found[i]) ? prev : found));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Polices chargées après coup : les hauteurs changent
    document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [lines, refresh, style.furniture, style.thickness]);

  const kind = style.furniture;
  const lit = style.light !== 'eteint';
  // Les cases : du haut du meuble (ou de la tablette du dessus) jusqu'à la tablette suivante.
  // Sur des tablettes murales, rien au-dessus de la première rangée.
  const cells = rows.map((y, k) => ({
    key: k,
    style: (k === 0
      ? { top: 0, height: y }
      : { top: `calc(${rows[k - 1]}px + var(--board-total))`, height: `calc(${y - rows[k - 1]}px - var(--board-total))` }) as CSSProperties,
  })).filter((c) => c.key > 0 || kind !== 'tablettes');

  const head = title || tune ? <div className="furniture-head">{title}{tune}</div> : null;
  return (
    <div className={`furniture ${shelfClass(style)}${lit ? ' is-lit' : ''}`}>
      {kind === 'tablettes' ? head : <div className="furniture-crown">{head}</div>}
      <div className="furniture-body" ref={body}>
        {cells.map((c) => <span key={c.key} className="furniture-cell" style={c.style} aria-hidden="true" />)}
        {children}
        {rows.map((y, k) => (
          // Chaque tablette prend un autre morceau de la planche (le bois ne se répète pas)
          <span key={k} className="furniture-board" style={{ top: y, ['--tex-y' as string]: `${-((k * 53) % 150)}px` } as CSSProperties} aria-hidden="true" />
        ))}
        {lit && cells.map((c) => <span key={c.key} className="furniture-glow" style={c.style} aria-hidden="true" />)}
        {kind === 'vitrine' && <span className="furniture-glass" aria-hidden="true" />}
      </div>
      {kind !== 'tablettes' && <div className="furniture-plinth" aria-hidden="true" />}
    </div>
  );
}
