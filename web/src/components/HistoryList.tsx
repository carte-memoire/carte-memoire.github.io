import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDate, formatDateTime, gamePath } from '../lib/format';
import { useRegions } from '../lib/useRegions';
import { errorMessage } from '../lib/errors';
import type { CatalogChange, DatePrecision } from '../lib/types';
import { useConfirm } from './Confirm';
import { formatBarcode } from '../lib/barcode';
import { tr } from '../lib/i18n';

// Noms lisibles des champs modifiés
const FIELDS: Record<string, string> = {
  title: tr('Titre'), summary: tr('Résumé'), summary_source: tr('Source du résumé'), first_release_date: tr('Première sortie'),
  first_release_precision: tr('Précision de la date'), wikidata_id: tr('Wikidata'), genres_reviewed: tr('Genres revus'),
  local_title: tr('Titre sur la boîte'), zone: tr('Zone'), product_code: tr('Code produit'), edition_type: tr('Édition'),
  edition_name: tr("Nom de l'édition"), media_count: tr('Disques'), languages: tr('Langues'), specs: tr('Caractéristiques'),
  game_id: tr('Jeu (fusion ou déplacement)'), reissue_of: tr('Réédition de'), barcode: 'Code-barres', box_region_id: tr('Boîte vendue en'),
};
const TABLES: Record<CatalogChange['table_name'], string> = {
  game: tr('Jeu'), release: tr('Version'), game_genre: tr('Genre'), image: tr('Image'), release_region: tr('Date de sortie'), release_barcode: 'Code-barres',
  game_developer: tr('Développeur'), release_company: tr('Éditeur'),
};
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
  const regions = useRegions();
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
    if (!(await confirm({ title: tr('Annuler cette modification'), message: tr("Les valeurs d'avant seront rétablies. L'annulation sera elle-même notée dans l'historique."), confirmLabel: tr('Oui, rétablir') }))) return;
    const { error } = await supabase.rpc('undo_catalog_change', { change_id: c.id });
    if (error) return setError(errorMessage(error));
    await load();
    onUndone?.();
  }

  function describe(c: CatalogChange): string[] {
    const v = c.new_values ?? c.old_values ?? {};
    if (c.table_name === 'game_genre') return [`${c.action === 'insert' ? tr('Ajouté') : tr('Retiré')} : ${genres.get(Number(c.row_key.split(':')[1])) ?? tr('genre n° {0}', c.row_key.split(':')[1])}`];
    if (c.table_name === 'image') return [`${c.action === 'insert' ? tr('Ajoutée') : tr('Supprimée')} (${show(v.type)})`];
    if (c.table_name === 'release_region') {
      const region = regions.find((r) => r.id === Number(c.row_key.split(':')[1]))?.name ?? tr('région inconnue');
      // Une modification ne garde que les champs changés : la précision inchangée est prise de l'autre côté
      const precision = (x: Record<string, unknown> | null) => (x?.date_precision ?? c.new_values?.date_precision ?? c.old_values?.date_precision ?? null) as DatePrecision | null;
      const when = (x: Record<string, unknown> | null) => formatDate((x?.release_date as string) ?? null, precision(x)) || tr('date inconnue');
      if (c.action === 'update') return [`${region} : ${when(c.old_values)} → ${when(c.new_values)}`];
      return [`${c.action === 'insert' ? tr('Ajoutée') : tr('Retirée')} : ${region}, ${when(v)}`];
    }
    if (c.table_name === 'game_developer' || c.table_name === 'release_company') {
      return [`${c.action === 'insert' ? tr('Ajouté') : tr('Retiré')} : ${show(v.company_name ?? tr('studio n° {0}', v.company_id))}${c.table_name === 'release_company' ? tr(' (version n° {0})', show(v.release_id)) : ''}`];
    }
    if (c.table_name === 'release_barcode') return [tr('{0} : {1} (version n° {2})', c.action === 'insert' ? tr('Associé') : tr('Retiré'), formatBarcode(String(v.barcode ?? '')), show(v.release_id))];
    if (c.action !== 'update') return [`« ${show(v.title ?? v.local_title)} »${v.zone ? ` (${show(v.zone)})` : ''}`];
    const value = (k: string, v: unknown) => (k === 'box_region_id' && v ? regions.find((r) => r.id === Number(v))?.name ?? v : v);
    return Object.keys(c.new_values ?? {}).map((k) => `${FIELDS[k] ?? k} : ${show(value(k, c.old_values?.[k]))} → ${show(value(k, c.new_values?.[k]))}`);
  }

  const undoable = (c: CatalogChange) => !c.undone_at
    && ((c.action === 'update' && (c.table_name === 'game' || c.table_name === 'release')) || ['game_genre', 'release_barcode', 'game_developer', 'release_company'].includes(c.table_name));

  if (changes === null) return <p className="loading">{tr("Lecture de l'historique…")}</p>;
  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {changes.length === 0 && <p className="muted">{tr('Aucune modification enregistrée')}{gameId ? tr(' pour ce jeu') : ''}.</p>}
      <ul className="history-list">
        {changes.map((c) => (
          <li key={c.id} className={c.undone_at ? 'history-item is-undone' : 'history-item'}>
            <p className="history-head">
              <strong>{TABLES[c.table_name]}</strong> · {ACTIONS[c.action]}
              {!gameId && c.game_id && (
                <> · {titles.has(c.game_id) ? <Link to={gamePath({ id: c.game_id, title: titles.get(c.game_id)! })}>{titles.get(c.game_id)}</Link> : <span className="muted">{tr('jeu n° ')}{c.game_id}{tr(' (supprimé)')}</span>}</>
              )}
              <span className="muted small"> · {c.author?.username ?? tr('compte supprimé')}, {formatDateTime(c.changed_at)}</span>
            </p>
            <ul className="history-details">
              {describe(c).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {c.undone_at && <p className="muted small">{tr('Annulée par ')}{c.undoer?.username ?? '?'} le {formatDateTime(c.undone_at)}</p>}
            {undoable(c) && <button type="button" className="link-button small" onClick={() => undo(c)}>{tr('Annuler')}</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
