import type { TrophyTier } from '../lib/trophies';

// Une coupe (dessin libre, sans marque), teintée selon le rang : bronze, argent,
// or, platine. Verrouillée : grise, avec un cadenas.
export function TrophyIcon({ tier, locked = false, className = '' }: { tier: TrophyTier; locked?: boolean; className?: string }) {
  return (
    <svg className={`trophy-icon trophy-${tier}${locked ? ' is-locked' : ''} ${className}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {/* Anses */}
      <path className="trophy-handle" d="M9.5 7H5.5a4.5 4.5 0 0 0 5 6.4M22.5 7h4a4.5 4.5 0 0 1-5 6.4" />
      {/* Coupe, pied, socle */}
      <path className="trophy-body" d="M9 4.5h14v5.5a7 7 0 0 1-14 0z" />
      <path className="trophy-body" d="M14.2 16.6h3.6v4.2h-3.6z" />
      <path className="trophy-body" d="M11 20.8h10l1.2 3.4H9.8z" />
      <path className="trophy-base" d="M8.5 24.2h15v3.3h-15z" />
      {/* Reflet */}
      <path className="trophy-shine" d="M11.4 6.4v3.4a4.6 4.6 0 0 0 1.8 3.7" />
      {locked && (
        <g className="trophy-lock">
          <rect x="19.5" y="19" width="9" height="8" rx="1.5" />
          <path d="M21.4 19v-2.2a2.6 2.6 0 0 1 5.2 0V19" />
        </g>
      )}
    </svg>
  );
}
