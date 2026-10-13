import { formatNumber } from '../lib/format';
import { PAGE_SIZES, pageSizeFrom, pageSizeParam } from '../lib/preferences';
import { PsSymbol } from './PsSymbol';

// Nombre de jeux par page : 10, 20, 50… ou tout (0)
export function PageSizeSelect({ value, onChange, sizes = PAGE_SIZES }: {
  value: number;
  onChange: (size: number) => void;
  sizes?: number[];
}) {
  return (
    <label className="page-size">
      <span>Par page</span>
      <select value={pageSizeParam(value)} onChange={(e) => onChange(pageSizeFrom(e.target.value) ?? value)}>
        {sizes.map((n) => <option key={n} value={pageSizeParam(n)}>{n === 0 ? 'Tout' : formatNumber(n)}</option>)}
      </select>
    </label>
  );
}

// Pages : première, précédente, choix direct du numéro, suivante, dernière
export function Pagination({ page, pages, onChange, label }: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1 && page <= 1) return null;
  const count = Math.max(pages, page);
  return (
    <nav className="pagination" aria-label={label}>
      <button type="button" className="button button-small" disabled={page <= 1} onClick={() => onChange(1)} aria-label="Première page" title="Première page">«</button>
      <button type="button" className="button button-small" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Page précédente">
        <PsSymbol shape="circle" /> <span className="pagination-word">Précédente</span>
      </button>
      <label className="pagination-jump">
        <span>Page</span>
        <select value={page} onChange={(e) => onChange(Number(e.target.value))} aria-label="Aller à la page">
          {Array.from({ length: count }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
        <span>sur {formatNumber(pages)}</span>
      </label>
      <button type="button" className="button button-small" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Page suivante">
        <span className="pagination-word">Suivante</span> <PsSymbol shape="cross" />
      </button>
      <button type="button" className="button button-small" disabled={page >= pages} onClick={() => onChange(pages)} aria-label="Dernière page" title="Dernière page">»</button>
    </nav>
  );
}
