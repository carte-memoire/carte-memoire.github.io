// Un meuble de la pièce du collectionneur (lib/room.ts), étage par étage : tablettes murales,
// bibliothèque ou vitrine, dans son aspect (ShelfStyle.tsx). Les jeux par étage sont donnés par
// la répartition ; « auto » : le meuble prend toute la largeur et dit combien de jeux y tiennent
// (`onPerRow`). Un nombre fixe : le meuble a sa largeur à lui, réduit s'il ne tient pas à l'écran
// (zoom : tout est réduit d'un bloc, tranches, cadre et plaque, comme une photo du meuble).
// Plus bas : le carton des jeux qui attendent une place.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AUTO, type Meuble } from '../lib/room';
import { shelfClass } from './ShelfStyle';

export function ShelfCabinet<T>({ meuble, levels, consoles, renderItem, title, tune, editing, open, onPerRow }: {
  meuble: Meuble;
  levels: T[][];
  // Les consoles des jeux du meuble (et celle qu'il reçoit) : hauteur des étages (PS2, NES :
  // plus hauts), largeur des places (PS2 seule : plus étroites ; NES : boîtes épaisses)
  consoles: string[];
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
  const tall = consoles.includes('PS2') || consoles.includes('NES');
  const narrow = consoles.length > 0 && consoles.every((c) => c === 'PS2');
  const wide = consoles.includes('NES');
  const thin = consoles.length > 0 && consoles.every((c) => c === 'FDS');
  // Super Nintendo : boîtes épaisses (33 mm), les places les plus larges
  const chunky = consoles.includes('SNES');

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
  }, [fixed, meuble.id, onPerRow, style.furniture, style.thickness, narrow, wide, thin, chunky]);

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
  }, [fixed, meuble.perLevel, style.furniture, style.thickness, narrow, wide, thin, chunky]);

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
    const view = (y: number) => Math.max(-1, Math.min(1, (y - eye) / range));
    // Profondeur visible du dessus d'un boîtier (au plus bas), et décalage de côté (au bord)
    const depth = window.matchMedia('(max-width: 640px)').matches ? 8 : 11;
    const sideMax = 5;
    const center = el.clientWidth / 2;
    for (const level of el.querySelectorAll<HTMLElement>(':scope > .furniture-level')) {
      const shelf = level.querySelector<HTMLElement>(':scope > .shelf');
      const board = level.querySelector<HTMLElement>(':scope > .furniture-board');
      const topView = shelf ? Math.max(0, view(level.offsetTop + shelf.offsetTop)) : 0;
      if (board) level.style.setProperty('--board-view', view(level.offsetTop + board.offsetTop).toFixed(2));
      // Chaque boîtier : le coin du fond est décalé de (vx, -vy) par rapport à la tranche,
      // vers le milieu du meuble et vers le haut. Le dessus et la face de côté partent tous deux
      // de ce même coin : leurs arêtes se rejoignent exactement.
      const vy = depth * topView;
      for (const li of level.querySelectorAll<HTMLElement>(':scope > .shelf > li')) {
        const spine = li.firstElementChild as HTMLElement | null;
        if (!spine) continue;
        let x = li.offsetWidth / 2;
        let node: HTMLElement | null = li;
        while (node && node !== el) {
          x += node.offsetLeft;
          node = node.offsetParent as HTMLElement | null;
        }
        const side = Math.max(-1, Math.min(1, (x - center) / center));
        const vx = -side * sideMax;
        const ax = Math.abs(vx);
        const w = spine.offsetWidth;
        // À gauche du milieu, on voit la face de droite (le recto) ; à droite, celle de gauche (le dos)
        li.dataset.side = vx > 0 ? 'front' : 'back';
        li.style.setProperty('--vy', `${vy.toFixed(1)}px`);
        li.style.setProperty('--top-x', `${Math.min(0, vx).toFixed(1)}px`);
        li.style.setProperty('--top-w', `${(w + ax).toFixed(1)}px`);
        li.style.setProperty('--top-clip', vx < 0
          ? `polygon(0px 0px, ${w}px 0px, ${(w + ax).toFixed(1)}px 100%, ${ax.toFixed(1)}px 100%)`
          : `polygon(${ax.toFixed(1)}px 0px, ${(w + ax).toFixed(1)}px 0px, ${w}px 100%, 0px 100%)`);
        li.style.setProperty('--side-x', `${(vx < 0 ? vx : w).toFixed(1)}px`);
        li.style.setProperty('--side-w', `${ax.toFixed(1)}px`);
        li.style.setProperty('--side-clip', vx < 0
          ? `polygon(0px 0px, 100% ${vy.toFixed(1)}px, 100% 100%, 0px calc(100% - ${vy.toFixed(1)}px))`
          : `polygon(0px ${vy.toFixed(1)}px, 100% 0px, 100% calc(100% - ${vy.toFixed(1)}px), 0px 100%)`);
      }
    }
  });

  const kind = style.furniture;
  const lit = style.light !== 'eteint';
  const head = <div className="furniture-head">{title}{tune}</div>;
  const classes = [
    'furniture', shelfClass(style), lit && 'is-lit', fixed ? 'is-fixed' : 'is-auto', tall && 'is-tall', narrow && 'is-narrow', wide && 'is-wide', chunky && 'is-chunky', thin && 'is-thin', editing && 'is-editing', open && 'is-open',
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
