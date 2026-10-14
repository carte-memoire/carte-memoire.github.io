import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';

// Silhouettes grises le temps du chargement : la page garde sa forme, rien ne saute
// quand le contenu arrive. Les lecteurs d'écran entendent « Lecture… ».
function Loading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="skeleton-wait" role="status">
      <span className="sr-only">{tr('Lecture de la carte mémoire…')}</span>
      <div className={className} aria-hidden="true">{children}</div>
    </div>
  );
}

const line = (width: string, extra = '') => <span className={`skeleton skeleton-line${extra}`} style={{ width }} />;
// Largeurs variées, pour ne pas faire une grille trop régulière
const WIDTHS = ['62%', '48%', '71%', '55%', '66%', '43%', '58%', '50%'];

// Catalogue : des lignes (jaquette, titre, pastilles des versions)
export function CatalogSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Loading>
      <ul className="catalog-list skeleton-list">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="catalog-row">
            <span className="skeleton cover cover-small" />
            <div className="catalog-main skeleton-stack">
              {line(WIDTHS[i % WIDTHS.length], ' skeleton-title')}
              <span className="skeleton-chips">
                <span className="skeleton skeleton-chip" />
                {i % 3 !== 1 && <span className="skeleton skeleton-chip" />}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

// Ma collection : des exemplaires (jaquette, titre, badges, détails)
export function CollectionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Loading>
      <ul className="memory-card skeleton-list">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="block">
            <span className="skeleton cover cover-medium" />
            <div className="block-body skeleton-stack">
              {line(WIDTHS[(i + 2) % WIDTHS.length], ' skeleton-title')}
              <span className="skeleton-chips">
                <span className="skeleton skeleton-badge" /><span className="skeleton skeleton-badge" />
              </span>
              {line('38%')}
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

// Fiche d'un jeu : l'en-tête (jaquette, titre, informations) et deux versions
export function GameSkeleton() {
  return (
    <Loading className="game">
      <div className="game-head panel">
        <span className="skeleton cover cover-large" />
        <div className="game-info skeleton-stack">
          {line('55%', ' skeleton-heading')}
          {line('40%')}
          {line('62%')}
          {line('34%')}
          {line('90%')}
          {line('84%')}
        </div>
      </div>
      <ul className="release-list">
        {[0, 1].map((i) => (
          <li key={i} className="release-card panel">
            <span className="skeleton cover cover-medium" />
            <div className="release-body skeleton-stack">
              {line(i ? '42%' : '50%', ' skeleton-title')}
              <span className="skeleton-chips">
                <span className="skeleton skeleton-badge" /><span className="skeleton skeleton-badge" /><span className="skeleton skeleton-badge" />
              </span>
              {line('36%')}
              {line('46%')}
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

// Page d'un membre : son nom, sa progression, quelques jaquettes
export function MemberSkeleton() {
  return (
    <Loading className="stack">
      <div className="panel skeleton-stack">
        {line('30%', ' skeleton-heading')}
        {line('45%')}
        <span className="skeleton skeleton-bar" />
      </div>
      <ul className="cover-grid skeleton-list">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="cover-tile">
            <span className="skeleton cover" />
            {line(WIDTHS[i % WIDTHS.length])}
          </li>
        ))}
      </ul>
    </Loading>
  );
}
