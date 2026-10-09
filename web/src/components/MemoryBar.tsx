import { formatNumber, formatPercent } from '../lib/format';

const BLOCKS = 15;

// Progression façon carte mémoire PS1 : 15 blocs, remplis selon la part possédée.
// Dès le premier jeu, un bloc s'allume (sinon 1 jeu sur 1 300 ne se verrait pas).
export function MemoryBar({ owned, total, label, size = 'large' }: { owned: number; total: number; label: string; size?: 'large' | 'small' }) {
  const filled = owned > 0 ? Math.min(BLOCKS, Math.max(1, Math.round((owned / Math.max(total, 1)) * BLOCKS))) : 0;
  return (
    <div
      className={`memory-bar memory-bar-${size}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={owned}
      aria-valuetext={`${formatNumber(owned)} sur ${formatNumber(total)}, ${formatPercent(owned, total)}`}
    >
      {Array.from({ length: BLOCKS }, (_, i) => (
        <span key={i} className={i < filled ? 'memory-block filled' : 'memory-block'} />
      ))}
    </div>
  );
}
