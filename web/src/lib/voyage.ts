import type { MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './motion';

// Jaquette « en voyage » : cliquée sur le mur de l'accueil, elle glisse et grandit
// jusqu'à sa place en haut de la fiche du jeu (transition de vue : le navigateur passe
// d'une image à l'autre). Les navigateurs sans transition de vue, ou un appareil réglé
// sur « moins d'animations », ouvrent simplement la fiche.
export const VOYAGE = 'jaquette-voyage';

// Ce que la fiche reçoit pour afficher la même jaquette avant d'avoir chargé le jeu
export interface Voyage {
  releaseId: number;
  path: string;
  platform: string;
  title: string;
}

// La fiche a posé la jaquette (image chargée) : la transition peut partir. Au-delà
// d'une demi-seconde, on part quand même (fiche lente) : la jaquette se fond alors.
// (Une minuterie et non requestAnimationFrame : pendant la préparation d'une transition,
// le navigateur ne dessine plus la page, et requestAnimationFrame ne rappelle jamais.)
function arrived(): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const image = document.querySelector<HTMLImageElement>('.voyage-target img');
      if ((image && image.complete) || performance.now() - start > 500) resolve();
      else setTimeout(check, 16);
    };
    check();
  });
}

// Au clic sur un lien vers une fiche : `cover` est la jaquette à faire voyager,
// `go` change de page (navigate avec l'état `voyage`)
export function travel(event: MouseEvent<HTMLAnchorElement>, cover: HTMLElement | null, go: () => void) {
  // Nouvel onglet, clic du milieu… : le navigateur fait comme d'habitude
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!cover || typeof document.startViewTransition !== 'function' || prefersReducedMotion()) return;
  event.preventDefault();
  const root = document.documentElement;
  cover.style.viewTransitionName = VOYAGE;
  root.classList.add('voyage');
  const transition = document.startViewTransition(async () => {
    cover.style.viewTransitionName = '';
    flushSync(go);
    window.scrollTo(0, 0);
    await arrived();
  });
  transition.finished.catch(() => undefined).finally(() => root.classList.remove('voyage'));
}
