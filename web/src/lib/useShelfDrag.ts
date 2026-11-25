// Ranger l'étagère à la main (Ma collection, présentation « Tranches ») : on attrape une
// tranche et on la fait glisser ; les autres s'écartent pour lui faire place, et on la pose
// où l'on veut. À la souris (ou au stylet), à tout moment ; au doigt, en mode « Ranger »
// seulement (sinon le doigt fait défiler la page, et un toucher sort le jeu de l'étagère).
//
// Pendant le glisser, une copie de la tranche suit le pointeur (la « tranche en main ») et
// sa place se creuse là où elle tombera (l'ordre provisoire `order`), d'un étage ou d'un meuble
// à l'autre : tous les jeux de la même console dans la pièce ([data-shelf-room]). La place visée
// est lue sur les cases des jeux (<li>, jamais animées), pas sur les tranches qui glissent encore
// vers leur nouvelle place : elles ne font pas changer d'avis.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ShelfDrag {
  id: number;
  // L'étagère (console) où l'on range : on ne passe pas d'une console à l'autre
  shelf: string;
  // Ordre provisoire des jeux de cette étagère (ceux affichés)
  order: number[];
  // Position et taille de la tranche au moment où on l'a prise ; agrandissement du meuble
  // (un meuble trop large pour l'écran est réduit : la copie l'est aussi)
  left: number; top: number; width: number; height: number; zoom: number;
}

// Distance à parcourir avant que le glisser commence (en deçà : un simple clic)
const THRESHOLD: Record<string, number> = { mouse: 6, pen: 6, touch: 4 };
// Près du haut ou du bas de la fenêtre, la page défile toute seule
const EDGE = 70;

interface Hold {
  id: number; shelf: string; initial: number[]; order: number[];
  startX: number; startY: number; x: number; y: number; pointerId: number; started: boolean; zoom: number;
  room: HTMLElement;
  // Abandon (la page se ferme pendant un glisser)
  cancel: () => void;
}

const itemsOf = (room: HTMLElement, shelf: string) => [...room.querySelectorAll<HTMLElement>(`li[data-shelf-item][data-shelf-group="${CSS.escape(shelf)}"]`)];

export function useShelfDrag({ arranging, onDrop }: { arranging: boolean; onDrop: (shelf: string, order: number[]) => void }) {
  const [drag, setDrag] = useState<ShelfDrag | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const hold = useRef<Hold | null>(null);
  // Un glisser se termine par un « clic » du navigateur : on l'ignore (le jeu ne sort pas)
  const swallowClick = useRef(false);
  // Positions des tranches avant un changement d'ordre (pour les faire glisser à leur place)
  const before = useRef<Map<string, DOMRect> | null>(null);
  const latestDrop = useRef(onDrop);
  useEffect(() => { latestDrop.current = onDrop; });
  useEffect(() => () => hold.current?.cancel(), []);
  const order = drag?.order;

  // Les tranches écartées glissent jusqu'à leur nouvelle place (si les animations sont
  // permises) ; la tablette, elle, reste en place
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    const h = hold.current;
    if (!previous || !h || !document.documentElement.classList.contains('motion')) return;
    for (const li of itemsOf(h.room, h.shelf)) {
      const was = previous.get(li.dataset.shelfItem!);
      if (!was) continue;
      const now = li.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (dx || dy) li.firstElementChild?.animate([{ transform: `translate(${dx / h.zoom}px, ${dy / h.zoom}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    }
  }, [order]);

  // La copie de la tranche en main est sous le pointeur dès son apparition
  useLayoutEffect(() => {
    const h = hold.current;
    if (drag && h && ghost.current) ghost.current.style.transform = `translate(${(h.x - h.startX) / h.zoom}px, ${(h.y - h.startY) / h.zoom}px)`;
  }, [drag]);

  // Attraper une tranche : le glisser ne commence qu'une fois le pointeur un peu déplacé
  // (sinon, c'est un clic). Tout est suivi depuis la fenêtre dès cet instant, pour ne rien
  // manquer d'un geste rapide.
  function grab(event: React.PointerEvent<HTMLElement>, id: number, shelf: string, initial: number[]) {
    if (hold.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.pointerType === 'touch' && !arranging) return;
    const button = event.currentTarget;
    const room = button.closest<HTMLElement>('[data-shelf-room]');
    if (!room) return;
    const threshold = THRESHOLD[event.pointerType] ?? 6;
    const zoom = Number(getComputedStyle(button.closest('.furniture') ?? button).zoom) || 1;
    const h: Hold = {
      id, shelf, initial, order: initial, room, zoom, started: false, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, cancel: () => finish(false),
    };
    hold.current = h;
    let frame = 0;

    // La tranche visée : celle dont la case est sous le pointeur, ou la plus proche (au bout
    // d'un étage, entre deux étages) à moins de 48 px
    const aim = () => {
      const items = itemsOf(room, shelf);
      let target: HTMLElement | undefined;
      let best = 48;
      for (const li of items) {
        const r = li.getBoundingClientRect();
        const dx = Math.max(r.left - h.x, 0, h.x - r.right);
        const dy = Math.max(r.top - h.y, 0, h.y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < best || (d === 0 && best === 0)) { best = d; target = li; }
        if (d === 0) break;
      }
      if (!target) return;
      const targetId = Number(target.dataset.shelfItem);
      if (targetId === h.id) return;
      const next = h.order.filter((n) => n !== h.id);
      next.splice(h.order.indexOf(targetId), 0, h.id);
      before.current = new Map(items.map((li) => [li.dataset.shelfItem!, li.getBoundingClientRect()]));
      h.order = next;
      setDrag((d) => (d ? { ...d, order: next } : d));
    };
    const follow = () => {
      if (ghost.current) ghost.current.style.transform = `translate(${(h.x - h.startX) / h.zoom}px, ${(h.y - h.startY) / h.zoom}px)`;
    };
    // Près des bords de la fenêtre, la page défile (et la place visée suit)
    const tick = () => {
      const speed = h.y < EDGE ? -(EDGE - h.y) / 4 : h.y > innerHeight - EDGE ? (h.y - innerHeight + EDGE) / 4 : 0;
      if (speed) {
        window.scrollBy(0, Math.max(-18, Math.min(18, speed)));
        aim();
      }
      frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== h.pointerId) return;
      h.x = e.clientX;
      h.y = e.clientY;
      if (!h.started) {
        if (Math.hypot(h.x - h.startX, h.y - h.startY) < threshold) return;
        h.started = true;
        const rect = button.getBoundingClientRect();
        setDrag({ id, shelf, order: initial, left: rect.left / zoom, top: rect.top / zoom, width: rect.width / zoom, height: rect.height / zoom, zoom });
        document.body.classList.add('is-shelf-dragging');
        frame = requestAnimationFrame(tick);
      }
      follow();
      aim();
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== h.pointerId) return;
      const drop = e.type === 'pointerup';
      if (drop && h.started) {
        h.x = e.clientX;
        h.y = e.clientY;
        aim();
      }
      finish(drop);
    };
    // Échap : la tranche retourne à sa place
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && h.started) finish(false); };
    // Au doigt, la page ne défile pas pendant qu'on range
    const noScroll = (e: TouchEvent) => { if (h.started) e.preventDefault(); };

    function finish(drop: boolean) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchmove', noScroll);
      cancelAnimationFrame(frame);
      if (hold.current === h) hold.current = null;
      if (!h.started) return;
      document.body.classList.remove('is-shelf-dragging');
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 0);
      setDrag(null);
      if (drop && h.order.some((n, i) => n !== h.initial[i])) latestDrop.current(h.shelf, h.order);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', key);
    window.addEventListener('touchmove', noScroll, { passive: false });
  }

  return {
    drag,
    ghost,
    grab,
    // Au début du clic d'une tranche : vrai si ce clic termine un glisser
    swallowsClick: () => swallowClick.current,
  };
}
