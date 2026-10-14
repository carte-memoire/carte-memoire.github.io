import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { formatDateTime, gamePath, reportKindLabel, zoneLabel } from '../lib/format';
import type { Report, Submission } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { PsSymbol } from '../components/PsSymbol';
import { useConfirm } from '../components/Confirm';
import { tr, locale } from '../lib/i18n';

const STATUS: Record<Submission['status'], { label: string; className: string }> = {
  pending: { label: tr('En attente'), className: 'badge-todo' },
  approved: { label: tr('Acceptée'), className: 'badge-ok' },
  rejected: { label: tr('Refusée'), className: 'badge-ko' },
};

export function MySubmissions() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Submission[]>([]);
  const [titles, setTitles] = useState<Map<number, string>>(new Map());
  // Jaquettes proposées : la version visée (son jeu et son titre sur la boîte)
  const [versions, setVersions] = useState<Map<number, { game: string; title: string }>>(new Map());
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const { session } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);

  // Mes signalements d'erreurs (un modérateur voit tous les signalements : on filtre sur l'auteur)
  useEffect(() => {
    if (!session) return;
    supabase.from('report').select('id, game_id, release_id, kind, message, status, review_note, created_at, reviewed_at, game:game_id(id, title)')
      .eq('author_id', session.user.id).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setReports((data as unknown as Report[]) ?? []));
  }, [session]);

  const load = useCallback(async () => {
    if (!session) return;
    // Seulement les miennes (un modérateur peut lire celles de tout le monde)
    const { data, error } = await supabase
      .from('submission')
      .select('id, action, target, target_id, data, sources, status, review_note, created_at, created_game_id')
      .eq('author_id', session.user.id)
      .order('created_at', { ascending: false });
    if (error) setError(errorMessage(error));
    const list = (data as Submission[]) ?? [];
    // Titres des jeux concernés par une proposition de résumé ou une nouvelle version
    const ids = [...new Set(list.filter((s) => s.target !== 'image').map((s) => s.target_id ?? s.data.game_id)
      .filter((id): id is number => typeof id === 'number'))];
    if (ids.length) {
      const { data: games } = await supabase.from('game').select('id, title').in('id', ids);
      setTitles(new Map((games ?? []).map((g) => [g.id as number, g.title as string])));
    }
    const releaseIds = [...new Set(list.filter((s) => s.target === 'image').map((s) => s.target_id).filter((id): id is number => typeof id === 'number'))];
    if (releaseIds.length) {
      const { data: releases } = await supabase.from('release').select('id, local_title, game(title)').in('id', releaseIds);
      setVersions(new Map(((releases ?? []) as unknown as { id: number; local_title: string; game: { title: string } | null }[])
        .map((r) => [r.id, { game: r.game?.title ?? r.local_title, title: r.local_title }])));
    }
    setItems(list);
    setLoaded(true);
  }, [session]);

  useEffect(() => { load(); }, [load]);

  async function withdraw(s: Submission) {
    if (!(await confirm({ title: tr('Retirer la proposition'), message: tr('Elle ne sera pas examinée par les modérateurs.'), confirmLabel: tr('Retirer'), danger: true }))) return;
    const { error } = await supabase.from('submission').delete().eq('id', s.id);
    if (error) return setError(errorMessage(error));
    if (s.data.cover_path) await supabase.storage.from('submission-images').remove([s.data.cover_path]);
    await load();
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>{tr('Mes propositions')}</h1>
        <Link to="/proposer" className="button button-primary"><PsSymbol shape="cross" />{tr(' Proposer un jeu')}</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {loaded && items.length === 0 && <p className="panel empty">{tr('Aucune proposition pour le moment.')}</p>}
      <ul className="plain-list">
        {items.map((s) => {
          const isSummary = s.action === 'update' && s.target === 'game';
          const isCover = s.target === 'image';
          const version = isCover ? versions.get(s.target_id as number) : undefined;
          const gameTitle = isCover ? version?.game : titles.get((s.target_id ?? s.data.game_id) as number);
          const name = s.data.game?.title ?? gameTitle ?? s.data.release?.local_title ?? tr('Proposition');
          return (
            <li key={s.id} className="panel list-row">
              <span>
                <strong>{name}</strong>{' '}
                <span className="muted small">
                  {isSummary ? tr('résumé') : isCover ? tr('jaquette') : s.target === 'release' ? tr('nouvelle version') : tr('nouveau jeu')}
                  {version && version.title !== version.game && ` (${version.title})`}
                  {s.data.release?.zone !== undefined && ` · ${zoneLabel(s.data.release.zone)}`}
                  {' · '}{new Date(s.created_at).toLocaleDateString(locale)}
                  {s.data.no_cover && tr(' · sans jaquette')}
                </span>
                {s.review_note && <span className="block-notes">{tr('Modération : ')}{s.review_note}</span>}
              </span>
              <span className="actions">
                <span className={`badge ${STATUS[s.status].className}`}>{STATUS[s.status].label}</span>
                {s.status === 'approved' && s.created_game_id && (
                  <Link to={`/jeu/${s.created_game_id}`} className="button button-small">{tr('Voir le jeu')}</Link>
                )}
                {s.status === 'pending' && (
                  <button type="button" className="button button-small button-danger" onClick={() => withdraw(s)}>{tr('Retirer')}</button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {reports.length > 0 && (
        <>
          <h2>{tr('Mes signalements')}</h2>
          <ul className="plain-list">
            {reports.map((r) => (
              <li key={r.id} className="panel list-row">
                <span>
                  <strong>{r.game ? <Link to={gamePath(r.game)}>{r.game.title}</Link> : tr('Jeu supprimé')}</strong>{' '}
                  <span className="muted small">{reportKindLabel(r.kind)} · {formatDateTime(r.created_at)}</span>
                  <span className="block-notes">{r.message}</span>
                  {r.review_note && <span className="block-notes">{tr('Modération : ')}{r.review_note}</span>}
                </span>
                <span className={`badge ${r.status === 'open' ? 'badge-todo' : r.status === 'resolved' ? 'badge-ok' : 'badge-ko'}`}>
                  {r.status === 'open' ? tr('En attente') : r.status === 'resolved' ? tr('Corrigé') : tr('Rejeté')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
