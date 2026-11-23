import { prefersReducedMotion } from './motion';

// Une version vient d'être ajoutée : sa jaquette s'envole en arc jusqu'à l'onglet « Ma
// collection », qui la reçoit (il se soulève et s'éclaire, styles.css « is-receiving »).
// Comme un jeu qu'on range sur son étagère : on voit où il est allé.
export function flyToCollection(source: Element | null) {
  if (!source || prefersReducedMotion()) return;
  const link = document.querySelector<HTMLElement>('.nav-link[href="/collection"]');
  const target = link?.querySelector('.nav-icon') ?? link;
  if (!link || !target) return;
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width || !to.width) return;

  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: '0', zIndex: '1000', pointerEvents: 'none', borderRadius: '4px', objectFit: 'cover',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.6)', transformOrigin: 'center', willChange: 'transform, opacity',
  });
  document.body.append(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const end = Math.max(0.05, (to.width * 1.2) / from.width);
  // Le sommet de l'arc : au-dessus du trajet, plus haut quand le trajet est long
  const lift = -(70 + Math.abs(dx) * 0.12);
  const flight = ghost.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    { transform: `translate(${dx * 0.42}px, ${dy * 0.42 + lift}px) scale(${Math.max(end, 0.55)}) rotate(-9deg)`, opacity: 1, offset: 0.45, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
    { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(6deg)`, opacity: 0.25 },
  ], { duration: 820, fill: 'forwards' });

  flight.finished.catch(() => undefined).finally(() => {
    ghost.remove();
    link.classList.remove('is-receiving');
    void link.offsetWidth; // relance l'animation si deux ajouts se suivent
    link.classList.add('is-receiving');
    window.setTimeout(() => link.classList.remove('is-receiving'), 700);
  });
}
