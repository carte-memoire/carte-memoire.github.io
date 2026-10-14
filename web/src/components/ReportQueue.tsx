import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDateTime, gamePath, reportKindLabel } from '../lib/format';
import { errorMessage } from '../lib/errors';
import type { Report } from '../lib/types';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Modération : erreurs signalées par les membres, des plus anciennes aux plus récentes
export function ReportQueue({ onCount }: { onCount: (n: number) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('report')
      .select('id, game_id, release_id, kind, message, status, review_note, created_at, reviewed_at, author:author_id(username), game:game_id(id, title)')
      .eq('status', 'open').order('created_at').limit(200);
    setError(error ? errorMessage(error) : '');
    const list = (data as unknown as Report[]) ?? [];
    setReports(list);
    onCount(list.length);
  }, [onCount]);

  useEffect(() => { load(); }, [load]);

  if (reports === null) return <p className="loading">{tr('Lecture des signalements…')}</p>;
  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}
      {reports.length === 0 && <p className="panel empty">{tr('Aucun signalement en attente.')}</p>}
      <ul className="plain-list queue-list">
        {reports.map((r) => <ReportCard key={r.id} report={r} onDone={load} />)}
      </ul>
    </div>
  );
}

function ReportCard({ report: r, onDone }: { report: Report; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review(resolved: boolean) {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('review_report', { report_id: r.id, resolved, note: note.trim() || null });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onDone();
  }

  return (
    <li className={busy ? 'panel stack is-busy' : 'panel stack'}>
      <p className="queue-title">
        <span className="badge badge-todo">{reportKindLabel(r.kind)}</span>{' '}
        {r.game ? <Link to={gamePath(r.game)} target="_blank" rel="noopener">{r.game.title}</Link> : tr('Jeu supprimé')}
        {r.release_id && <span className="muted small">{tr(' · version n° ')}{r.release_id}</span>}
      </p>
      <p className="report-message">{r.message}</p>
      <p className="muted small">{tr('Signalé par ')}{r.author?.username ?? tr('compte supprimé')}{tr(' le {0}', formatDateTime(r.created_at))}</p>
      <label className="field">
        <span className="field-label">{tr("Mot pour l'auteur (facultatif)")}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={tr("Merci, c'est corrigé ! / Wikipédia et la notice disent…")} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {r.game && <Link to={`/jeu/${r.game.id}/modifier`} className="button button-small"><PsSymbol shape="triangle" />{tr(' Corriger le jeu')}</Link>}
        <button type="button" className="button button-small button-primary" onClick={() => review(true)}><PsSymbol shape="cross" />{tr(" C'est corrigé")}</button>
        <button type="button" className="button button-small button-danger" onClick={() => review(false)}>{tr('Rejeter')}</button>
      </div>
    </li>
  );
}
