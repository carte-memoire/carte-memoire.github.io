import { useEffect, useId, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { countryName, formatNumber, yearOf } from '../lib/format';
import type { CompanyResult, SearchResult } from '../lib/types';
import { Cover } from './Cover';
import { tr } from '../lib/i18n';

interface Props {
  onSelect: (game: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  initialQuery?: string;
  label?: string;
  // Code de la console (PS1, NES…) pour ne chercher que ses jeux ; null = toutes
  platform?: string | null;
  // Bouton à côté du champ (« Scanner »)
  action?: ReactNode;
  // Proposer aussi les studios qui correspondent (page d'accueil)
  onSelectStudio?: (studio: CompanyResult) => void;
}

// Champ de recherche de jeux : interroge la base pendant la frappe (après une courte pause)
export function GameSearch({ onSelect, placeholder = tr('Final Fantasy VII, Crash, Biohazard, SCES-00867…'), autoFocus, initialQuery = '', label = tr('Rechercher un jeu'), platform = null, action, onSelectStudio }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const { results, loading, error } = useGameSearch(query, 20, platform);
  const studios = useStudioSearch(onSelectStudio ? query : '', platform);
  const inputId = useId();

  return (
    <div className="game-search">
      <div className="field">
        <label className="field-label" htmlFor={inputId}>{label}</label>
        <span className="search-row">
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            data-autofocus={autoFocus ? '' : undefined}
            autoComplete="off"
            maxLength={120}
          />
          {action}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {query.trim().length >= 2 && !loading && results.length === 0 && studios.length === 0 && !error && (
        <p className="muted">{tr('Aucun jeu trouvé.')}</p>
      )}
      {studios.length > 0 && onSelectStudio && (
        <ul className="studio-results" aria-label={tr('Studios')}>
          {studios.map((s) => (
            <li key={s.id}>
              <button type="button" className="studio-result" onClick={() => onSelectStudio(s)}>
                <span className="badge badge-studio">{tr('Studio')}</span>
                <strong>{s.name}</strong>
                <span className="muted small">
                  {[s.country && countryName(s.country), studioCounts(s)].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.length > 0 && (
        <ul className="result-list">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="result" onClick={() => onSelect(r)}>
                <Cover images={r.cover_path ? [{ id: 0, type: 'front', path: r.cover_path }] : []} title={r.title} size="small" />
                <span className="result-text">
                  <span className="result-title">{r.title}</span>
                  {r.matched_title !== r.title && <span className="result-alt">« {r.matched_title} »</span>}
                  <span className="result-meta">
                    {r.matched_code && <span className="code result-code">{r.matched_code}</span>}
                    {yearOf(r.first_release_date)}
                    {r.release_count > 1 && tr(' · {0} versions', r.release_count)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// « 25 jeux développés, 40 édités »
export function studioCounts(s: Pick<CompanyResult, 'developed' | 'published'>): string {
  const parts = [];
  if (s.developed) parts.push(tr('{0} jeu{1?x} développé{2?s}', formatNumber(s.developed), s.developed > 1, s.developed > 1));
  if (s.published) parts.push(tr('{0} édité{1?s}', formatNumber(s.published), s.published > 1));
  return parts.join(', ');
}

// Studios dont le nom contient la recherche (3 au plus) ; silencieux en cas d'erreur
function useStudioSearch(query: string, platform: string | null) {
  const [studios, setStudios] = useState<CompanyResult[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return setStudios([]);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_companies', { search: q, platform_code: platform, max_results: 3 });
      if (!cancelled) setStudios((data as CompanyResult[] | null) ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, platform]);
  return studios;
}

export function useGameSearch(query: string, max = 20, platform: string | null = null) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_games', { search: q, max_results: max, platform_code: platform });
      if (cancelled) return;
      setLoading(false);
      setError(error ? tr('La recherche a échoué.') : '');
      setResults((data as SearchResult[]) ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, max, platform]);

  return { results, loading, error };
}
