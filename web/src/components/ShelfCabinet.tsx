// Un meuble de la pièce du collectionneur (lib/room.ts), étage par étage : tablettes murales,
// bibliothèque ou vitrine, dans son aspect (ShelfStyle.tsx). Les jeux par étage sont donnés par
// la répartition ; « auto » : le meuble prend toute la largeur et dit combien de jeux y tiennent
// (`onPerRow`). Un nombre fixe : le meuble a sa largeur à lui, réduit s'il ne tient pas à l'écran
// (zoom : tout est réduit d'un bloc, tranches, cadre et plaque, comme une photo du meuble).
// Plus bas : le carton des jeux qui attendent une place.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AUTO, type Meuble } from '../lib/room';
import { shelfClass } from './ShelfStyle';

export function ShelfCabinet<T>({ meuble, levels, tall, narrow, renderItem, title, tune, editing, open, onPerRow }: {
  meuble: Meuble;
  levels: T[][];
  // Des jeux PS2 (tranches plus hautes) : des étages plus hauts
  tall: boolean;
  // Seulement des jeux PS2 : des places plus étroites
  narrow: boolean;
  renderItem: (item: T, meuble: Meuble) => ReactNode;
  title: ReactNode;
  tune?: ReactNode;
  editing?: boolean;
  // Vitrine : porte ouverte (un jeu en est sorti)
  open?: boolean;
  onPerRow?: (id: string, perRow: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const style = meuble.style;
  const fixed = meuble.perLevel !== AUTO;

  // Largeur « auto » : combien de jeux tiennent sur un étage
  useLayoutEffect(() => {
    const el = body.current;
    if (fixed || !el || !onPerRow) return;
    const measure = () => {
      const css = getComputedStyle(el);
      const inner = el.clientWidth - Number.parseFloat(css.paddingLeft) - Number.parseFloat(css.paddingRight);
      const slot = Number.parseFloat(css.getPropertyValue('--slot')) || 37;
      onPerRow(meuble.id, Math.max(1, Math.floor((inner + 0.5) / slot)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fixed, meuble.id, onPerRow, style.furniture, style.thickness, narrow]);

  // Largeur fixe : le meuble réduit s'il est plus large que la pièce
  useLayoutEffect(() => {
    const el = box.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    if (!fixed) {
      setZoom(1);
      return;
    }
    const measure = () => {
      const current = Number(getComputedStyle(el).zoom) || 1;
      const natural = el.getBoundingClientRect().width / current;
      const next = Math.min(1, parent.clientWidth / natural);
      setZoom((z) => (Math.abs(z - next) < 0.005 ? z : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fixed, meuble.perLevel, style.furniture, style.thickness, narrow]);

  // Le point de vue : quelqu'un debout devant le milieu du meuble. Les jeux à sa gauche
  // montrent un peu leur face avant (la jaquette), ceux à sa droite un peu leur dos, d'autant
  // plus qu'ils sont loin du milieu ; le dessus de chaque boîtier fuit vers le milieu.
  // En hauteur, son œil est vers le haut du meuble : plus un étage est bas, plus on voit le dessus
  // des boîtiers et des tablettes ; une tablette au-dessus de l'œil montre son dessous.
  // D'après la place réelle de chaque jeu dans le meuble (mise en page, sans les animations).
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const eye = el.clientHeight * 0.25;
    const range = Math.max(el.clientHeight * 0.75, 320);
    const view = (y: number) => Math.max(-1, Math.min(1, (y - eye) / range)).toFixed(2);
    for (const level of el.querySelectorAll<HTMLElement>(':scope > .furniture-level')) {
      const shelf = level.querySelector<HTMLElement>(':scope > .shelf');
      const board = level.querySelector<HTMLElement>(':scope > .furniture-board');
      if (shelf) level.style.setProperty('--top-view', String(Math.max(0, Number(view(level.offsetTop + shelf.offsetTop)))));
      if (board) level.style.setProperty('--board-view', view(level.offsetTop + board.offsetTop));
    }
    const center = el.clientWidth / 2;
    for (const li of el.querySelectorAll<HTMLElement>('.furniture-level > .shelf > li')) {
      let x = li.offsetWidth / 2;
      let node: HTMLElement | null = li;
      while (node && node !== el) {
        x += node.offsetLeft;
        node = node.offsetParent as HTMLElement | null;
      }
      const side = Math.max(-1, Math.min(1, (x - center) / center));
      li.dataset.side = side < 0 ? 'front' : 'back';
      li.style.setProperty('--side-w', `${(Math.abs(side) * 5).toFixed(1)}px`);
      li.style.setProperty('--skew', `${(-side * 4).toFixed(1)}px`);
    }
  });

  const kind = style.furniture;
  const lit = style.light !== 'eteint';
  const head = <div className="furniture-head">{title}{tune}</div>;
  const classes = [
    'furniture', shelfClass(style), lit && 'is-lit', fixed ? 'is-fixed' : 'is-auto', tall && 'is-tall', narrow && 'is-narrow', editing && 'is-editing', open && 'is-open',
  ].filter(Boolean).join(' ');
  return (
    <div ref={box} className={classes} data-meuble={meuble.id}
      style={{ zoom: zoom < 1 ? zoom : undefined, ['--places' as string]: fixed ? meuble.perLevel : undefined } as CSSProperties}>
      {kind === 'tablettes' ? head : <div className="furniture-crown">{head}</div>}
      <div className="furniture-body furniture-levels" ref={body}>
        {levels.map((row, k) => {
          // Sur des tablettes murales, rien au-dessus de la première : ni ombre ni lumière
          const roofed = k > 0 || kind !== 'tablettes';
          return (
            <div key={k} className="furniture-level">
              {roofed && <span className="furniture-cell" aria-hidden="true" />}
              <ul className="shelf">{row.map((item) => renderItem(item, meuble))}</ul>
              {/* Chaque tablette prend un autre morceau de la planche (le bois ne se répète pas) */}
              <span className="furniture-board" style={{ ['--tex-y' as string]: `${-((k * 53) % 150)}px` } as CSSProperties} aria-hidden="true" />
              {lit && roofed && <span className="furniture-glow" aria-hidden="true" />}
            </div>
          );
        })}
        {kind === 'vitrine' && <span className="furniture-glass" aria-hidden="true" />}
      </div>
      {kind !== 'tablettes' && <div className="furniture-plinth" aria-hidden="true" />}
    </div>
  );
}

// Le carton : les jeux d'une console qui n'ont pas (encore) de place dans un meuble
export function RoomBox({ label, children, actions }: { label: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="room-box">
      <div className="room-box-crate">
        <span className="room-box-flap" aria-hidden="true" />
        <ul className="shelf">{children}</ul>
      </div>
      <div className="room-box-label">
        <p>{label}</p>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}
