import { useEffect, useRef, useState } from 'react';

// Réglage d'accessibilité du système : moins d'animations
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Nombre qui défile jusqu'à sa valeur : depuis 0 au premier affichage, puis depuis
// l'ancienne valeur quand elle change (un jeu de plus, une autre console…)
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const from = current.current;
    if (from === target || prefersReducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration);
      // Rapide au départ, il ralentit en arrivant
      const next = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return prefersReducedMotion() ? target : value;
}
