import { formatNumber } from '../lib/format';
import { PAGE_SIZES, pageSizeFrom, pageSizeParam } from '../lib/preferences';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Nombre de jeux par page : 10, 20, 50… ou tout (0)
export function PageSizeSelect({ value, onChange, sizes = PAGE_SIZES }: {
  value: number;
  onChange: (size: number) => void;
  sizes?: number[];
}) {
  return (
    <label className="page-size">
      <span>{tr('Par page')}</span>
      <select value={pageSizeParam(value)} onChange={(e) => onChange(pageSizeFrom(e.target.value) ?? value)}>
        {sizes.map((n) => <option key={n} value={pageSizeParam(n)}>{n === 0 ? tr('Tout') : formatNumber(n)}</option>)}
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
      <button type="button" className="button button-small" disabled={page <= 1} onClick={() => onChange(1)} aria-label={tr('Première page')} title={tr('Première page')}>«</button>
      <button type="button" className="button button-small" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={tr('Page précédente')}>
        <PsSymbol shape="circle" /> <span className="pagination-word">{tr('Précédente')}</span>
      </button>
      <label className="pagination-jump">
        <span>{tr('Page')}</span>
        <select value={page} onChange={(e) => onChange(Number(e.target.value))} aria-label={tr('Aller à la page')}>
          {Array.from({ length: count }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
        <span>{tr('sur ')}{formatNumber(pages)}</span>
      </label>
      <button type="button" className="button button-small" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={tr('Page suivante')}>
        <span className="pagination-word">{tr('Suivante')}</span> <PsSymbol shape="cross" />
      </button>
      <button type="button" className="button button-small" disabled={page >= pages} onClick={() => onChange(pages)} aria-label={tr('Dernière page')} title={tr('Dernière page')}>»</button>
    </nav>
  );
}
