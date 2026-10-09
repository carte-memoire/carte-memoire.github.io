import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { zoneLabel } from '../lib/format';
import type { Submission } from '../lib/types';
import { PsSymbol } from '../components/PsSymbol';

const STATUS: Record<Submission['status'], { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'badge-todo' },
  approved: { label: 'Acceptée', className: 'badge-ok' },
  rejected: { label: 'Refusée', className: 'badge-ko' },
};

export function MySubmissions() {
  const [items, setItems] = useState<Submission[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('submission')
      .select('id, action, target, data, sources, status, review_note, created_at, created_game_id')
      .order('created_at', { ascending: false });
    if (error) setError(errorMessage(error));
    setItems((data as Submission[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function withdraw(s: Submission) {
    if (!window.confirm('Retirer cette proposition ?')) return;
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
          const name = s.data.game?.title ?? s.data.release?.local_title ?? 'Proposition';
          return (
            <li key={s.id} className="panel list-row">
              <span>
                <strong>{name}</strong>{' '}
                <span className="muted small">
                  {s.target === 'release' ? 'nouvelle version' : 'nouveau jeu'}
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
