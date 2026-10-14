import { useState } from 'react';
import { formatNumber, formatPercent } from '../lib/format';

const BLOCKS = 15;

// Dès le premier jeu, un bloc s'allume (sinon 1 jeu sur 1 300 ne se verrait pas)
function filledBlocks(owned: number, total: number): number {
  return owned > 0 ? Math.min(BLOCKS, Math.max(1, Math.round((owned / Math.max(total, 1)) * BLOCKS))) : 0;
}

// Progression façon carte mémoire PS1 : 15 blocs, remplis selon la part possédée.
// À l'apparition (ou pour une autre zone, une autre console), les blocs s'allument
// l'un après l'autre ; un jeu de plus fait briller le bloc écrit, comme une sauvegarde.
export function MemoryBar({ owned, total, label, size = 'large' }: { owned: number; total: number; label: string; size?: 'large' | 'small' }) {
  const filled = filledBlocks(owned, total);
  // Ce qui vient de changer : `from` = premier bloc animé, `run` relance les animations
  const [last, setLast] = useState({ owned, total, from: 0, mode: 'boot' as 'boot' | 'save', run: 0 });
  if (owned !== last.owned || total !== last.total) {
    const before = filledBlocks(last.owned, last.total);
    const sameScope = total === last.total;
    const saved = sameScope && owned > last.owned;
    setLast({
      owned, total, run: last.run + 1,
      mode: sameScope ? 'save' : 'boot',
      // Sauvegarde : les nouveaux blocs, ou à défaut le dernier bloc plein ; retrait : rien
      from: !sameScope ? 0 : saved ? Math.min(before, filled - 1) : filled,
    });
  }
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
      {Array.from({ length: BLOCKS }, (_, i) => {
        const animated = i < filled && i >= last.from;
        const className = i >= filled ? 'memory-block' : `memory-block filled${animated ? (last.mode === 'boot' ? ' is-lit' : ' is-saved') : ''}`;
        const delay = animated ? (i - last.from) * (last.mode === 'boot' ? 35 : 80) : 0;
        return <span key={`${last.run}-${i}`} className={className} style={delay ? { animationDelay: `${delay}ms` } : undefined} />;
      })}
    </div>
  );
}
