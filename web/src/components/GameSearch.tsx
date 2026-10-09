import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { yearOf } from '../lib/format';
import type { SearchResult } from '../lib/types';
import { Cover } from './Cover';

interface Props {
  onSelect: (game: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  initialQuery?: string;
  label?: string;
  // Code de la console (PS1, NES…) pour ne chercher que ses jeux ; null = toutes
  platform?: string | null;
}

// Champ de recherche de jeux : interroge la base pendant la frappe (après une courte pause)
export function GameSearch({ onSelect, placeholder = 'Final Fantasy VII, Crash, Biohazard, SCES-00867…', autoFocus, initialQuery = '', label = 'Rechercher un jeu', platform = null }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const { results, loading, error } = useGameSearch(query, 20, platform);

  return (
    <div className="game-search">
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          maxLength={120}
        />
      </label>
      {error && <p className="error">{error}</p>}
      {query.trim().length >= 2 && !loading && results.length === 0 && !error && (
        <p className="muted">Aucun jeu trouvé.</p>
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
                    {r.release_count > 1 && ` · ${r.release_count} versions`}
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
      setError(error ? 'La recherche a échoué.' : '');
      setResults((data as SearchResult[]) ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, max, platform]);

  return { results, loading, error };
}
