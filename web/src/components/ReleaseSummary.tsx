import { editionLabel, formatDate, zoneLabel } from '../lib/format';
import type { Release } from '../lib/types';

// Résumé d'une sortie : zone, édition, code produit, date
export function ReleaseSummary({ release }: { release: Release }) {
  const firstDate = [...release.release_region]
    .filter((r) => r.release_date)
    .sort((a, b) => (a.release_date! < b.release_date! ? -1 : 1))[0];
  return (
    <span className="release-summary">
      <span className={`badge badge-zone badge-${(release.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(release.zone)}</span>
      <span className={`badge ${release.edition_type === 'reissue' ? 'badge-platinum' : 'badge-edition'}`}>{editionLabel(release)}</span>
      {release.product_code && <span className="code">{release.product_code}</span>}
      {firstDate && <span className="muted">{formatDate(firstDate.release_date, firstDate.date_precision)}</span>}
    </span>
  );
}
