import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDateTime, gamePath } from '../lib/format';
import { errorMessage } from '../lib/errors';
import type { CatalogChange } from '../lib/types';
import { useConfirm } from './Confirm';

// Noms lisibles des champs modifiés
const FIELDS: Record<string, string> = {
  title: 'Titre', summary: 'Résumé', summary_source: 'Source du résumé', first_release_date: 'Première sortie',
  first_release_precision: 'Précision de la date', wikidata_id: 'Wikidata', genres_reviewed: 'Genres revus',
  local_title: 'Titre sur la boîte', zone: 'Zone', product_code: 'Code produit', edition_type: 'Édition',
  edition_name: "Nom de l'édition", media_count: 'Disques', languages: 'Langues', specs: 'Caractéristiques',
  game_id: 'Jeu (fusion ou déplacement)', reissue_of: "Réédition de", barcode: 'Code-barres',
};
const TABLES: Record<CatalogChange['table_name'], string> = { game: 'Jeu', release: 'Version', game_genre: 'Genre', image: 'Image' };
const ACTIONS: Record<CatalogChange['action'], string> = { insert: 'ajout', update: 'modification', delete: 'suppression' };

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '(vide)';
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

// Historique des modifications (d'un jeu, ou de tout le catalogue) ; les
// modifications simples s'annulent d'un clic, si rien n'a changé depuis
// refresh : n'importe quelle valeur qui change quand il faut relire (ex. le jeu rechargé)
export function HistoryList({ gameId, onUndone, limit = 50, refresh }: { gameId?: number; onUndone?: () => void; limit?: number; refresh?: unknown }) {
  const confirm = useConfirm();
  const [changes, setChanges] = useState<CatalogChange[] | null>(null);
  const [genres, setGenres] = useState<Map<number, string>>(new Map());
  const [titles, setTitles] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    let query = supabase.from('catalog_change')
      .select('id, table_name, row_key, game_id, action, old_values, new_values, changed_at, undone_at, author:changed_by(username), undoer:undone_by(username)')
      .order('changed_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
    if (gameId) query = query.eq('game_id', gameId);
    const { data, error } = await query;
    setError(error ? errorMessage(error) : '');
    const list = (data as unknown as CatalogChange[]) ?? [];
    setChanges(list);
    // Noms des genres et titres des jeux cités
    const genreIds = [...new Set(list.filter((c) => c.table_name === 'game_genre').map((c) => Number(c.row_key.split(':')[1])))];
    if (genreIds.length) {
      const { data: g } = await supabase.from('genre').select('id, name').in('id', genreIds);
      setGenres(new Map((g ?? []).map((x) => [x.id as number, x.name as string])));
    }
    const gameIds = [...new Set(list.map((c) => c.game_id).filter((id): id is number => id !== null))];
    if (!gameId && gameIds.length) {
      const { data: t } = await supabase.from('game').select('id, title').in('id', gameIds);
      setTitles(new Map((t ?? []).map((x) => [x.id as number, x.title as string])));
    }
  }, [gameId, limit]);

  useEffect(() => { load(); }, [load, refresh]);

  async function undo(c: CatalogChange) {
    if (!(await confirm({ title: 'Annuler cette modification', message: "Les valeurs d'avant seront rétablies. L'annulation sera elle-même notée dans l'historique.", confirmLabel: 'Oui, rétablir' }))) return;
    const { error } = await supabase.rpc('undo_catalog_change', { change_id: c.id });
    if (error) return setError(errorMessage(error));
    await load();
    onUndone?.();
  }

  function describe(c: CatalogChange): string[] {
    const v = c.new_values ?? c.old_values ?? {};
    if (c.table_name === 'game_genre') return [`${c.action === 'insert' ? 'Ajouté' : 'Retiré'} : ${genres.get(Number(c.row_key.split(':')[1])) ?? `genre n° ${c.row_key.split(':')[1]}`}`];
    if (c.table_name === 'image') return [`${c.action === 'insert' ? 'Ajoutée' : 'Supprimée'} (${show(v.type)})`];
    if (c.action !== 'update') return [`« ${show(v.title ?? v.local_title)} »${v.zone ? ` (${show(v.zone)})` : ''}`];
    return Object.keys(c.new_values ?? {}).map((k) => `${FIELDS[k] ?? k} : ${show(c.old_values?.[k])} → ${show(c.new_values?.[k])}`);
  }

  const undoable = (c: CatalogChange) => !c.undone_at
    && ((c.action === 'update' && (c.table_name === 'game' || c.table_name === 'release')) || c.table_name === 'game_genre');

  if (changes === null) return <p className="loading">Lecture de l'historique…</p>;
  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {changes.length === 0 && <p className="muted">Aucune modification enregistrée{gameId ? ' pour ce jeu' : ''}.</p>}
      <ul className="history-list">
        {changes.map((c) => (
          <li key={c.id} className={c.undone_at ? 'history-item is-undone' : 'history-item'}>
            <p className="history-head">
              <strong>{TABLES[c.table_name]}</strong> · {ACTIONS[c.action]}
              {!gameId && c.game_id && (
                <> · {titles.has(c.game_id) ? <Link to={gamePath({ id: c.game_id, title: titles.get(c.game_id)! })}>{titles.get(c.game_id)}</Link> : <span className="muted">jeu n° {c.game_id} (supprimé)</span>}</>
              )}
              <span className="muted small"> · {c.author?.username ?? 'compte supprimé'}, {formatDateTime(c.changed_at)}</span>
            </p>
            <ul className="history-details">
              {describe(c).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {c.undone_at && <p className="muted small">Annulée par {c.undoer?.username ?? '?'} le {formatDateTime(c.undone_at)}</p>}
            {undoable(c) && <button type="button" className="link-button small" onClick={() => undo(c)}>Annuler</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
