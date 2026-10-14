import { formatNumber } from '../lib/format';
import { useCountUp } from '../lib/motion';

// Nombre qui défile jusqu'à sa valeur. La largeur de la valeur finale est réservée :
// le texte autour ne bouge pas pendant le défilement.
export function CountUp({ value, format = formatNumber }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <span className="count-up" style={{ minWidth: `${format(value).length}ch` }}>{format(shown)}</span>;
}
