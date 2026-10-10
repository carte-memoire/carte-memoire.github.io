import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { EDITION_TYPES, formatDate, gamePath, LANGUAGES, yearOf, zoneLabel, zoneOrder } from '../lib/format';
import { usePlatforms } from '../lib/usePlatforms';
import type { ReleaseImage, Submission, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useGameSearch } from '../components/GameSearch';
import { Cover } from '../components/Cover';
import { PsSymbol } from '../components/PsSymbol';
import { useConfirm } from '../components/Confirm';
import { GenreQueue } from '../components/GenreQueue';
import { HistoryList } from '../components/HistoryList';
import { ReportQueue } from '../components/ReportQueue';

type Tab = 'submissions' | 'reports' | 'duplicates' | 'genres' | 'history';

export function Moderation() {
  const { aal } = useAuth();
  const [tab, setTab] = useState<Tab>('submissions');
  const [counts, setCounts] = useState({ submissions: 0, reports: 0, duplicates: 0, genres: 0 });
  // Fonctions stables : sinon chaque affichage relancerait le chargement des listes
  const countSubmissions = useCallback((n: number) => setCounts((c) => ({ ...c, submissions: n })), []);
  const countDuplicates = useCallback((n: number) => setCounts((c) => ({ ...c, duplicates: n })), []);
  const countGenres = useCallback((n: number) => setCounts((c) => ({ ...c, genres: n })), []);
  const countReports = useCallback((n: number) => setCounts((c) => ({ ...c, reports: n })), []);

  return (
    <section className="stack">
      <h1>Modération</h1>
      {aal.current !== 'aal2' && (
        <p className="warning">
          Accepter, refuser ou fusionner demande la double authentification.{' '}
          <Link to="/compte">Active-la ou valide-la dans « Mon compte »</Link>.
        </p>
      )}
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'submissions'} className={tab === 'submissions' ? 'tab active' : 'tab'} onClick={() => setTab('submissions')}>
          Propositions ({counts.submissions})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'tab active' : 'tab'} onClick={() => setTab('reports')}>
          Signalements ({counts.reports})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'duplicates'} className={tab === 'duplicates' ? 'tab active' : 'tab'} onClick={() => setTab('duplicates')}>
          Doublons possibles ({counts.duplicates})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'genres'} className={tab === 'genres' ? 'tab active' : 'tab'} onClick={() => setTab('genres')}>
          Jeux sans genre ({counts.genres})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>
          Historique
        </button>
      </div>
      {/* Les onglets restent montés pour garder leurs compteurs à jour */}
      <div hidden={tab !== 'submissions'}><SubmissionQueue onCount={countSubmissions} /></div>
      <div hidden={tab !== 'duplicates'}><DuplicateList onCount={countDuplicates} /></div>
      <div hidden={tab !== 'genres'}><GenreQueue onCount={countGenres} /></div>
      <div hidden={tab !== 'reports'}><ReportQueue onCount={countReports} /></div>
      {tab === 'history' && <HistoryList limit={100} />}
    </section>
  );
}

/* ===================================================================
   File d'attente des propositions
   =================================================================== */

function SubmissionQueue({ onCount }: { onCount: (n: number) => void }) {
  const [items, setItems] = useState<Submission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ text: string; gameId?: number }[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('submission')
      .select('id, action, target, target_id, data, sources, status, review_note, created_at, author:author_id(username)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) setError(errorMessage(error));
    const list = (data as unknown as Submission[]) ?? [];
    setItems(list);
    onCount(list.length);
    setLoaded(true);
  }, [onCount]);

  useEffect(() => { load(); }, [load]);

  function finished(s: Submission, result: { approved: boolean; gameId?: number }) {
    const name = s.data.game?.title ?? s.data.release?.local_title ?? (s.data.summary ? 'Résumé' : 'Proposition');
    setDone((d) => [{ text: `${name} : ${result.approved ? 'ajouté au catalogue' : 'refusé'}`, gameId: result.gameId }, ...d].slice(0, 5));
    load();
  }

  return (
    <div className="stack">
      {done.map((d, i) => (
        <p key={i} className="success">
          {d.text}{d.gameId && <> · <Link to={`/jeu/${d.gameId}`}>voir la fiche</Link></>}
        </p>
      ))}
      {error && <p className="error">{error}</p>}
      {loaded && items.length === 0 && <p className="panel empty">Aucune proposition en attente. <PsSymbol shape="triangle" /></p>}
      {items.map((s) => s.action === 'update' && s.target === 'game'
        ? <SummaryCard key={s.id} submission={s} onDone={(r) => finished(s, r)} />
        : <SubmissionCard key={s.id} submission={s} onDone={(r) => finished(s, r)} />)}
    </div>
  );
}

function SubmissionCard({ submission: s, onDone }: { submission: Submission; onDone: (r: { approved: boolean; gameId?: number }) => void }) {
  const platforms = usePlatforms();
  const r = s.data.release;
  const isNewGame = s.target === 'game';
  const [coverUrl, setCoverUrl] = useState('');
  const [existingGame, setExistingGame] = useState<{ id: number; title: string } | null>(null);
  const [attachTo, setAttachTo] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // La jaquette est privée : lien temporaire (10 minutes) pour l'afficher
  useEffect(() => {
    if (!s.data.cover_path) return;
    supabase.storage.from('submission-images').createSignedUrl(s.data.cover_path, 600)
      .then(({ data }) => setCoverUrl(data?.signedUrl ?? ''));
  }, [s.data.cover_path]);

  useEffect(() => {
    if (s.data.game_id) {
      supabase.from('game').select('id, title').eq('id', s.data.game_id).maybeSingle().then(({ data }) => setExistingGame(data));
    }
  }, [s.data.game_id]);

  // Doublons possibles d'un nouveau jeu
  const { results: similar } = useGameSearch(isNewGame ? s.data.game?.title ?? '' : '', 5);

  async function approve() {
    setBusy(true);
    setError('');
    let publicCover: string | null = null;
    try {
      if (s.data.cover_path) {
        // Le stockage ne se manipule pas en SQL : on copie d'abord la jaquette dans l'espace public
        publicCover = `submissions/${s.id}-${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage.from('submission-images').copy(s.data.cover_path, publicCover, { destinationBucket: 'covers' });
        if (error) { publicCover = null; throw error; }
      }
      const { data, error } = await supabase.rpc('review_submission', {
        submission_id: s.id,
        approve: true,
        note: note.trim() || null,
        cover_path: publicCover,
        attach_to_game_id: attachTo,
      });
      if (error) throw error;
      if (s.data.cover_path) await supabase.storage.from('submission-images').remove([s.data.cover_path]);
      onDone({ approved: true, gameId: (data as { game_id: number }).game_id });
    } catch (err) {
      if (publicCover) await supabase.storage.from('covers').remove([publicCover]);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function reject() {
    if (!note.trim()) return setError("Indique le motif du refus : il sera affiché à l'auteur.");
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('review_submission', { submission_id: s.id, approve: false, note: note.trim() });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    if (s.data.cover_path) await supabase.storage.from('submission-images').remove([s.data.cover_path]);
    onDone({ approved: false });
  }

  const platformName = platforms.find((p) => p.id === r?.platform_id)?.name ?? '';

  return (
    <article className="panel submission-card">
      <div className="submission-head">
        <div className={`cover cover-medium${s.data.no_cover ? ' cover-disabled' : ''}`}>
          {coverUrl ? <img src={coverUrl} alt="Jaquette proposée" /> : <span className="cover-empty" aria-hidden="true"><PsSymbol shape="square" /></span>}
        </div>
        <div className="submission-info">
          <p className="muted small">
            {isNewGame ? 'Nouveau jeu' : 'Nouvelle version'} · proposé par <strong>{s.author?.username ?? 'compte supprimé'}</strong> le {new Date(s.created_at).toLocaleDateString('fr-FR')}
          </p>
          <h2>{isNewGame ? s.data.game?.title : existingGame ? <Link to={gamePath(existingGame)}>{existingGame.title}</Link> : '…'}</h2>
          {s.data.no_cover && <p className="badge badge-todo">Déclaré sans jaquette</p>}
          {r && (
            <dl className="facts">
              <dt>Console</dt><dd>{platformName}</dd>
              <dt>Zone</dt><dd>{zoneLabel((r.zone ?? null) as Zone | null)}</dd>
              <dt>Titre sur la boîte</dt><dd>{r.local_title}</dd>
              {r.product_code && (<><dt>Code produit</dt><dd className="code">{r.product_code.toUpperCase()}</dd></>)}
              <dt>Édition</dt><dd>{EDITION_TYPES.find((t) => t.value === r.edition_type)?.label.split(' (')[0]}{r.edition_name ? ` · ${r.edition_name}` : ''}</dd>
              {r.release_date && (<><dt>Sortie</dt><dd>{formatDate(r.release_date, r.date_precision ?? 'day')}{r.region_code ? ` (${r.region_code})` : ''}</dd></>)}
              {r.languages && r.languages.length > 0 && (<><dt>Langues</dt><dd>{r.languages.map((l) => LANGUAGES.find((x) => x.value === l)?.label ?? l).join(', ')}</dd></>)}
              {r.publisher_name && (<><dt>Éditeur</dt><dd>{r.publisher_name}</dd></>)}
              {r.developer_name && (<><dt>Développeur</dt><dd>{r.developer_name}</dd></>)}
            </dl>
          )}
          {s.sources && <p className="block-notes">Sources : {s.sources}</p>}
        </div>
      </div>

      {isNewGame && similar.length > 0 && (
        <fieldset className="notice">
          <legend className="field-label">Ce jeu existe peut-être déjà</legend>
          <label className="radio-row">
            <input type="radio" name={`attach-${s.id}`} checked={attachTo === null} onChange={() => setAttachTo(null)} />
            Non, c'est un nouveau jeu
          </label>
          {similar.map((g) => (
            <label key={g.id} className="radio-row">
              <input type="radio" name={`attach-${s.id}`} checked={attachTo === g.id} onChange={() => setAttachTo(g.id)} />
              Oui : ajouter seulement la version à <Link to={gamePath(g)} target="_blank" rel="noopener">{g.title}</Link>
              <span className="muted"> {yearOf(g.first_release_date)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="field">
        <span className="field-label">Commentaire (obligatoire pour un refus, visible par l'auteur)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button button-primary" onClick={approve} disabled={busy}>
          <PsSymbol shape="cross" /> {attachTo ? 'Accepter (version du jeu choisi)' : 'Accepter'}
        </button>
        <button type="button" className="button button-danger" onClick={reject} disabled={busy}>
          <PsSymbol shape="circle" /> Refuser
        </button>
      </div>
    </article>
  );
}

// Proposition de résumé : l'actuel et le proposé côte à côte
function SummaryCard({ submission: s, onDone }: { submission: Submission; onDone: (r: { approved: boolean; gameId?: number }) => void }) {
  const [game, setGame] = useState<{ id: number; title: string; summary: string | null; summary_source: string | null } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!s.target_id) return;
    supabase.from('game').select('id, title, summary, summary_source').eq('id', s.target_id).maybeSingle().then(({ data }) => setGame(data));
  }, [s.target_id]);

  async function review(approve: boolean) {
    if (!approve && !note.trim()) return setError("Indique le motif du refus : il sera affiché à l'auteur.");
    setBusy(true);
    setError('');
    const { data, error } = await supabase.rpc('review_submission', { submission_id: s.id, approve, note: note.trim() || null });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    onDone({ approved: approve, gameId: approve ? (data as { game_id: number }).game_id : undefined });
  }

  return (
    <article className="panel submission-card">
      <p className="muted small">
        Résumé · proposé par <strong>{s.author?.username ?? 'compte supprimé'}</strong> le {new Date(s.created_at).toLocaleDateString('fr-FR')}
      </p>
      <h2>{game ? <Link to={gamePath(game)} target="_blank" rel="noopener">{game.title}</Link> : '…'}</h2>
      <div className="summary-compare">
        <div>
          <p className="field-label">Résumé actuel{game?.summary_source ? ' (Wikipédia)' : ''}</p>
          <p className="summary muted">{game?.summary ?? 'Aucun résumé pour le moment.'}</p>
        </div>
        <div>
          <p className="field-label">Résumé proposé</p>
          <p className="summary">{s.data.summary}</p>
        </div>
      </div>
      {s.sources && <p className="block-notes">Sources : {s.sources}</p>}
      <label className="field">
        <span className="field-label">Commentaire (obligatoire pour un refus, visible par l'auteur)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button button-primary" onClick={() => review(true)} disabled={busy}>
          <PsSymbol shape="cross" /> Accepter ce résumé
        </button>
        <button type="button" className="button button-danger" onClick={() => review(false)} disabled={busy}>
          <PsSymbol shape="circle" /> Refuser
        </button>
      </div>
    </article>
  );
}

/* ===================================================================
   Doublons possibles
   =================================================================== */

interface DuplicateGroup { title_key: string; total: number; game_ids: number[]; titles: string[] }
interface DuplicateGame {
  id: number;
  title: string;
  wikidata_id: string | null;
  first_release_date: string | null;
  release: { id: number; zone: Zone | null; image: ReleaseImage[]; platform: { short_name: string } }[];
}

function DuplicateList({ onCount }: { onCount: (n: number) => void }) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [games, setGames] = useState<Map<number, DuplicateGame>>(new Map());
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('possible_duplicate_game').select('title_key, total, game_ids, titles').order('title_key');
    if (error) return setError(errorMessage(error));
    const list = (data as DuplicateGroup[]) ?? [];
    const ids = list.flatMap((g) => g.game_ids);
    const map = new Map<number, DuplicateGame>();
    if (ids.length) {
      const { data: rows } = await supabase
        .from('game')
        .select('id, title, wikidata_id, first_release_date, release(id, zone, image(id, type, path), platform(short_name))')
        .in('id', ids);
      for (const g of (rows as unknown as DuplicateGame[]) ?? []) map.set(g.id, g);
    }
    setGroups(list);
    setGames(map);
    onCount(list.length);
    setLoaded(true);
  }, [onCount]);

  useEffect(() => { load(); }, [load]);

  const confirm = useConfirm();
  // Erreur affichée DANS le groupe concerné (et pas seulement en haut de page)
  const [groupError, setGroupError] = useState<{ key: string; text: string } | null>(null);
  const [toast, setToast] = useState('');

  function notify(text: string) {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? '' : t)), 4000);
  }

  async function keep(group: DuplicateGroup, keepId: number) {
    setBusyKey(group.title_key);
    setGroupError(null);
    const kept = games.get(keepId);
    let merged = 0;
    try {
      for (const other of group.game_ids.filter((id) => id !== keepId)) {
        let { error } = await supabase.rpc('merge_games', { keep_id: keepId, duplicate_id: other, force: false });
        if (error?.message.includes('identifiants Wikidata différents')) {
          const b = games.get(other);
          const ok = await confirm({
            title: 'Fiches Wikidata différentes',
            message: (
              <>
                <p>
                  « {kept?.title} » ({kept?.wikidata_id}) et « {b?.title} » ({b?.wikidata_id}) ont chacun leur fiche Wikidata.
                </p>
                <p className="muted">
                  Ce sont souvent deux jeux distincts (un original et son remake…), mais Wikidata a aussi des doublons.
                  Vérifie avec les liens Wikidata en cas de doute. La fiche gardée conserve son identifiant.
                </p>
              </>
            ),
            confirmLabel: 'Fusionner quand même',
          });
          if (!ok) continue;
          ({ error } = await supabase.rpc('merge_games', { keep_id: keepId, duplicate_id: other, force: true }));
        }
        if (error) throw error;
        merged++;
      }
      if (merged > 0) notify(`« ${kept?.title} » : ${merged + 1} fiches fusionnées en une.`);
      await load();
    } catch (err) {
      setGroupError({ key: group.title_key, text: errorMessage(err) });
    } finally {
      setBusyKey('');
    }
  }

  async function dismiss(group: DuplicateGroup) {
    setBusyKey(group.title_key);
    setGroupError(null);
    await supabase.from('dismissed_duplicate').delete().eq('title_key', group.title_key);
    const { error } = await supabase.from('dismissed_duplicate').insert({ title_key: group.title_key, game_ids: group.game_ids });
    setBusyKey('');
    if (error) return setGroupError({ key: group.title_key, text: errorMessage(error) });
    notify(`« ${group.titles[0]} » : marqué comme « pas des doublons ».`);
    await load();
  }

  return (
    <div className="stack">
      <p className="muted">
        Fiches qui portent le même titre (aux majuscules, accents et ponctuation près). Choisis la fiche à garder :
        les versions, développeurs et genres des autres y sont regroupés. Ou indique que ce ne sont pas des doublons.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && groups.length === 0 && <p className="panel empty">Aucun doublon possible. <PsSymbol shape="triangle" /></p>}
      {groups.map((group) => (
        <article key={group.title_key} className={`panel${busyKey === group.title_key ? ' is-busy' : ''}`}>
          <div className="duplicate-row">
            {group.game_ids.map((id) => <DuplicateCard key={id} game={games.get(id)} disabled={!!busyKey} onKeep={() => keep(group, id)} />)}
          </div>
          {groupError?.key === group.title_key && <p className="error" role="alert">{groupError.text}</p>}
          <div className="actions">
            <button type="button" className="button button-small" onClick={() => dismiss(group)} disabled={!!busyKey}>
              <PsSymbol shape="circle" /> Ce ne sont pas des doublons
            </button>
            {busyKey === group.title_key && <span className="muted small">Fusion en cours…</span>}
          </div>
        </article>
      ))}
      {toast && <p className="toast" role="status">{toast}</p>}
    </div>
  );
}

function DuplicateCard({ game, disabled, onKeep }: { game?: DuplicateGame; disabled: boolean; onKeep: () => void }) {
  const summary = useMemo(() => {
    if (!game) return '';
    return [...game.release]
      .sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone))
      .map((r) => `${r.platform.short_name} ${r.zone ?? '?'}`)
      .join(' · ');
  }, [game]);
  if (!game) return null;
  const images = game.release.flatMap((r) => r.image);
  return (
    <div className="duplicate-card">
      <Cover images={images} title={game.title} size="small" />
      <div>
        <Link to={gamePath(game)} target="_blank" rel="noopener" className="block-title">{game.title}</Link>
        <p className="muted small">
          {yearOf(game.first_release_date) || 'année inconnue'} · {game.release.length} version{game.release.length > 1 ? 's' : ''} : {summary || 'aucune'}
        </p>
        <p className="muted small">
          {game.wikidata_id
            ? <a href={`https://www.wikidata.org/wiki/${game.wikidata_id}`} target="_blank" rel="noopener noreferrer">Wikidata {game.wikidata_id}</a>
            : 'Sans fiche Wikidata'}
        </p>
        <button type="button" className="button button-small button-primary" onClick={onKeep} disabled={disabled}>
          <PsSymbol shape="cross" /> Garder celle-ci
        </button>
      </div>
    </div>
  );
}
