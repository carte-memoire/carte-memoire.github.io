import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { zoneLabel } from '../lib/format';
import type { Submission } from '../lib/types';
import { PsSymbol } from '../components/PsSymbol';
import { useConfirm } from '../components/Confirm';

const STATUS: Record<Submission['status'], { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'badge-todo' },
  approved: { label: 'Acceptée', className: 'badge-ok' },
  rejected: { label: 'Refusée', className: 'badge-ko' },
};

export function MySubmissions() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Submission[]>([]);
  const [titles, setTitles] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('submission')
      .select('id, action, target, target_id, data, sources, status, review_note, created_at, created_game_id')
      .order('created_at', { ascending: false });
    if (error) setError(errorMessage(error));
    const list = (data as Submission[]) ?? [];
    // Titres des jeux concernés par une proposition de résumé ou une nouvelle version
    const ids = [...new Set(list.map((s) => s.target_id ?? s.data.game_id).filter((id): id is number => typeof id === 'number'))];
    if (ids.length) {
      const { data: games } = await supabase.from('game').select('id, title').in('id', ids);
      setTitles(new Map((games ?? []).map((g) => [g.id as number, g.title as string])));
    }
    setItems(list);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function withdraw(s: Submission) {
    if (!(await confirm({ title: 'Retirer la proposition', message: 'Elle ne sera pas examinée par les modérateurs.', confirmLabel: 'Retirer', danger: true }))) return;
    const { error } = await supabase.from('submission').delete().eq('id', s.id);
    if (error) return setError(errorMessage(error));
    if (s.data.cover_path) await supabase.storage.from('submission-images').remove([s.data.cover_path]);
    await load();
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Mes propositions</h1>
        <Link to="/proposer" className="button button-primary"><PsSymbol shape="cross" /> Proposer un jeu</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {loaded && items.length === 0 && <p className="panel empty">Aucune proposition pour le moment.</p>}
      <ul className="plain-list">
        {items.map((s) => {
          const isSummary = s.action === 'update' && s.target === 'game';
          const gameTitle = titles.get((s.target_id ?? s.data.game_id) as number);
          const name = s.data.game?.title ?? gameTitle ?? s.data.release?.local_title ?? 'Proposition';
          return (
            <li key={s.id} className="panel list-row">
              <span>
                <strong>{name}</strong>{' '}
                <span className="muted small">
                  {isSummary ? 'résumé' : s.target === 'release' ? 'nouvelle version' : 'nouveau jeu'}
                  {s.data.release?.zone !== undefined && ` · ${zoneLabel(s.data.release.zone)}`}
                  {' · '}{new Date(s.created_at).toLocaleDateString('fr-FR')}
                  {s.data.no_cover && ' · sans jaquette'}
                </span>
                {s.review_note && <span className="block-notes">Modération : {s.review_note}</span>}
              </span>
              <span className="actions">
                <span className={`badge ${STATUS[s.status].className}`}>{STATUS[s.status].label}</span>
                {s.status === 'approved' && s.created_game_id && (
                  <Link to={`/jeu/${s.created_game_id}`} className="button button-small">Voir le jeu</Link>
                )}
                {s.status === 'pending' && (
                  <button type="button" className="button button-small button-danger" onClick={() => withdraw(s)}>Retirer</button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
