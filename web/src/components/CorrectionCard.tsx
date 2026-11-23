import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { formatDate, gamePath, genreName, languagesLong, zoneLabel } from '../lib/format';
import { CORRECTION_FIELDS, type CorrectionChanges } from '../lib/corrections';
import type { DatePrecision, Submission, Zone } from '../lib/types';
import { PsSymbol } from './PsSymbol';
import { UserTag } from './UserTag';
import { tr, locale } from '../lib/i18n';

interface Current {
  game: { id: number; title: string; slug: string | null };
  version: string | null;
  date: string | null;
  precision: DatePrecision | null;
  genres: string[];
  studios: string[];
  zone: Zone | null;
  code: string | null;
  languages: string[];
}

// Correction champ par champ proposée par un membre : pour chaque champ changé, la valeur
// actuelle et la valeur proposée. Acceptée, elle est appliquée telle quelle (historique).
export function CorrectionCard({ submission: s, onDone }: { submission: Submission; onDone: (r: { approved: boolean; gameId?: number }) => void }) {
  const changes = (s.data.changes ?? {}) as CorrectionChanges;
  const [current, setCurrent] = useState<Current | null>(null);
  const [names, setNames] = useState<{ genres: string[]; studios: string[] }>({ genres: [], studios: [] });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      if (s.target === 'game') {
        const { data } = await supabase.from('game')
          .select('id, title, slug, first_release_date, first_release_precision, game_genre(genre(name)), game_developer(company(name))')
          .eq('id', s.target_id!).maybeSingle();
        const g = data as unknown as { id: number; title: string; slug: string | null; first_release_date: string | null; first_release_precision: DatePrecision | null;
          game_genre: { genre: { name: string } }[]; game_developer: { company: { name: string } }[] } | null;
        if (active && g) setCurrent({ game: g, version: null, date: g.first_release_date, precision: g.first_release_precision,
          genres: g.game_genre.map((x) => genreName(x.genre.name)), studios: g.game_developer.map((x) => x.company.name), zone: null, code: null, languages: [] });
      } else {
        const { data } = await supabase.from('release')
          .select('local_title, zone, product_code, languages, platform(short_name), game(id, title, slug)')
          .eq('id', s.target_id!).maybeSingle();
        const r = data as unknown as { local_title: string; zone: Zone | null; product_code: string | null; languages: string[] | null;
          platform: { short_name: string }; game: { id: number; title: string; slug: string | null } } | null;
        if (active && r) setCurrent({ game: r.game, version: `${r.platform.short_name} · ${r.local_title}`, date: null, precision: null, genres: [], studios: [],
          zone: r.zone, code: r.product_code, languages: r.languages ?? [] });
      }
      // Noms des genres et studios proposés
      const [genres, studios] = await Promise.all([
        changes.genre_ids?.length ? supabase.from('genre').select('name').in('id', changes.genre_ids) : Promise.resolve({ data: [] }),
        changes.developer_ids?.length ? supabase.from('company').select('name').in('id', changes.developer_ids) : Promise.resolve({ data: [] }),
      ]);
      if (active) setNames({
        genres: ((genres.data ?? []) as { name: string }[]).map((g) => genreName(g.name)),
        studios: ((studios.data ?? []) as { name: string }[]).map((c) => c.name),
      });
    })();
    return () => { active = false; };
  }, [s.target, s.target_id, changes.genre_ids, changes.developer_ids]);

  async function review(approve: boolean) {
    if (!approve && !note.trim()) return setError(tr("Indique le motif du refus : il sera affiché à l'auteur."));
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('review_submission', { submission_id: s.id, approve, note: note.trim() || null });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    onDone({ approved: approve, gameId: current?.game.id });
  }

  const none = tr('(vide)');
  const list = (values: string[]) => (values.length ? values.join(', ') : none);
  const rows: [string, string, string][] = [];
  if ('first_release_date' in changes) rows.push([CORRECTION_FIELDS.first_release_date,
    formatDate(current?.date ?? null, current?.precision ?? null) || none,
    formatDate(changes.first_release_date ?? null, changes.first_release_precision ?? null) || none]);
  if (changes.genre_ids) rows.push([CORRECTION_FIELDS.genre_ids, list(current?.genres ?? []), list(names.genres)]);
  if (changes.developer_ids) rows.push([CORRECTION_FIELDS.developer_ids, list(current?.studios ?? []), list(names.studios)]);
  if ('zone' in changes) rows.push([CORRECTION_FIELDS.zone, current ? zoneLabel(current.zone) : '', zoneLabel(changes.zone ?? null)]);
  if ('product_code' in changes) rows.push([CORRECTION_FIELDS.product_code, current?.code ?? none, changes.product_code ?? none]);
  if (changes.languages) rows.push([CORRECTION_FIELDS.languages, current ? languagesLong(current.languages) || none : '', languagesLong(changes.languages) || none]);

  return (
    <article className="panel submission-card">
      <p className="muted small">
        {tr('Correction · proposée par ')}<UserTag user={s.author} strong />{tr(' le {0}', new Date(s.created_at).toLocaleDateString(locale))}
      </p>
      <h2>
        {current ? <Link to={gamePath(current.game)} target="_blank" rel="noopener">{current.game.title}</Link> : '…'}
        {current?.version && <span className="muted small"> · {current.version}</span>}
      </h2>
      <table className="correction-table">
        <thead><tr><th scope="col">{tr('Champ')}</th><th scope="col">{tr('Actuel')}</th><th scope="col">{tr('Proposé')}</th></tr></thead>
        <tbody>
          {rows.map(([field, before, after]) => (
            <tr key={field}><th scope="row">{field}</th><td className="muted">{before}</td><td><strong>{after}</strong></td></tr>
          ))}
        </tbody>
      </table>
      {s.sources && <p className="block-notes">{tr('Sources : ')}{s.sources}</p>}
      <label className="field">
        <span className="field-label">{tr("Commentaire (obligatoire pour un refus, visible par l'auteur)")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button button-primary" onClick={() => review(true)} disabled={busy || !current}>
          <PsSymbol shape="cross" />{tr(' Appliquer la correction')}
        </button>
        <button type="button" className="button button-danger" onClick={() => review(false)} disabled={busy}>
          <PsSymbol shape="circle" />{tr(' Refuser')}
        </button>
      </div>
    </article>
  );
}
