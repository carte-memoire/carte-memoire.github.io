import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../lib/format';
import { prefersReducedMotion } from '../lib/motion';

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

// Nombre qui défile jusqu'à sa valeur. La largeur de la valeur finale est réservée :
// le texte autour ne bouge pas pendant le défilement.
export function CountUp({ value, format = formatNumber }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <span className="count-up" style={shown === value ? undefined : { minWidth: `${format(value).length}ch` }}>{format(shown)}</span>;
}
