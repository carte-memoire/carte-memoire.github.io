import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { EDITION_TYPES, editionLabel, formatDate, formatNumber, gamePath, LANGUAGES, yearOf, zoneLabel, zoneOrder } from '../lib/format';
import { RELEASE_FIELDS } from '../lib/queries';
import { ALL_PLATFORMS, rememberModerationPlatform, rememberedModerationPlatform } from '../lib/preferences';
import { useKnownPlatform, usePlatforms } from '../lib/usePlatforms';
import type { Release, ReleaseImage, Submission, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useGameSearch } from '../components/GameSearch';
import { Cover } from '../components/Cover';
import { ProposedCover, publishProposedCover } from '../components/ProposedCover';
import { PsSymbol } from '../components/PsSymbol';
import { useConfirm } from '../components/Confirm';
import { CoverQueue } from '../components/CoverQueue';
import { GenreQueue } from '../components/GenreQueue';
import { HistoryList } from '../components/HistoryList';
import { ReportQueue } from '../components/ReportQueue';
import { StudioQueue } from '../components/StudioQueue';
import { needsStudioDecision, StudioDecision, type StudioChoice } from '../components/StudioDecision';
import { forgetCompanies, useCompanies } from '../lib/useCompanies';
import { tr, locale } from '../lib/i18n';

type Tab = 'submissions' | 'reports' | 'duplicates' | 'studios' | 'genres' | 'covers' | 'history';

export function Moderation() {
  const { aal } = useAuth();
  const [tab, setTab] = useState<Tab>('submissions');
  // Console des files de jeux (doublons, jeux sans genre, jaquettes manquantes) : dans
  // l'adresse, sinon le dernier choix fait ici, sinon celle de l'accueil
  const [params, setParams] = useSearchParams();
  const platform = useKnownPlatform(params.get('console') ?? rememberedModerationPlatform());
  const consoles = usePlatforms().filter((p) => p.game_count > 0);
  function choosePlatform(value: string) {
    rememberModerationPlatform(value);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('console', value);
      return next;
    }, { replace: true });
  }
  const [counts, setCounts] = useState({ submissions: 0, reports: 0, duplicates: 0, studios: 0, genres: 0, covers: 0 });
  // Fonctions stables : sinon chaque affichage relancerait le chargement des listes
  const countSubmissions = useCallback((n: number) => setCounts((c) => ({ ...c, submissions: n })), []);
  const countDuplicates = useCallback((n: number) => setCounts((c) => ({ ...c, duplicates: n })), []);
  const countGenres = useCallback((n: number) => setCounts((c) => ({ ...c, genres: n })), []);
  const countReports = useCallback((n: number) => setCounts((c) => ({ ...c, reports: n })), []);
  const countCovers = useCallback((n: number) => setCounts((c) => ({ ...c, covers: n })), []);
  const countStudios = useCallback((n: number) => setCounts((c) => ({ ...c, studios: n })), []);

  return (
    <section className="stack">
      <div className="page-head">
        <h1>{tr('Modération')}</h1>
        {consoles.length > 1 && (
          <div className="console-choice">
            <span className="muted small" title={tr('Pour les doublons, les jeux sans genre et les jaquettes manquantes')}>{tr('Console :')}</span>
            <div className="zone-switch" role="group" aria-label={tr('Console des files de jeux')}>
              {[...consoles.map((p) => ({ value: p.short_name, label: p.short_name, title: p.name })), { value: ALL_PLATFORMS, label: tr('Toutes'), title: tr('Toutes les consoles') }].map((p) => (
                <button key={p.value} type="button" className={platform === p.value ? 'zone-option active' : 'zone-option'} aria-pressed={platform === p.value}
                  title={p.title} onClick={() => choosePlatform(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {aal.current !== 'aal2' && (
        <p className="warning">
          {tr('Accepter, refuser ou fusionner demande la double authentification.')}{' '}
          <Link to="/compte">{tr('Active-la ou valide-la dans « Mon compte »')}</Link>.
        </p>
      )}
      <div className="tabs" role="tablist">
        {([
          ['submissions', tr('Propositions'), tr('Propositions des membres'), counts.submissions],
          ['reports', tr('Signalements'), tr('Signalements d’erreurs'), counts.reports],
          ['duplicates', tr('Doublons'), tr('Doublons possibles'), counts.duplicates],
          ['studios', tr('Studios'), tr('Studios en double'), counts.studios],
          ['genres', tr('Sans genre'), tr('Jeux sans genre'), counts.genres],
          ['covers', tr('Jaquettes'), tr('Jaquettes manquantes'), counts.covers],
          ['history', tr('Historique'), tr('Historique des modifications'), null],
        ] as [Tab, string, string, number | null][]).map(([value, label, title, count]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'tab active' : 'tab'}
            title={title} onClick={() => setTab(value)}>
            {label}{count !== null && <span className="tab-count">{formatNumber(count)}</span>}
          </button>
        ))}
      </div>
      {/* Les onglets restent montés pour garder leurs compteurs à jour */}
      <div hidden={tab !== 'submissions'}><SubmissionQueue onCount={countSubmissions} /></div>
      <div hidden={tab !== 'duplicates'}><DuplicateList onCount={countDuplicates} platform={platform} /></div>
      <div hidden={tab !== 'studios'}><StudioQueue onCount={countStudios} /></div>
      <div hidden={tab !== 'genres'}><GenreQueue onCount={countGenres} platform={platform} /></div>
      <div hidden={tab !== 'reports'}><ReportQueue onCount={countReports} /></div>
      <div hidden={tab !== 'covers'}><CoverQueue onCount={countCovers} active={tab === 'covers'} platform={platform} /></div>
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
    const name = s.data.game?.title ?? s.data.release?.local_title ?? (s.data.summary ? tr('Résumé') : tr('Proposition'));
    const text = s.target === 'image'
      ? (result.approved ? tr('Jaquette acceptée : elle est en ligne') : tr('Jaquette refusée'))
      : `${name} : ${result.approved ? tr('ajouté au catalogue') : tr('refusé')}`;
    setDone((d) => [{ text, gameId: result.gameId }, ...d].slice(0, 5));
    load();
  }

  return (
    <div className="stack">
      {done.map((d, i) => (
        <p key={i} className="success">
          {d.text}{d.gameId && <> · <Link to={`/jeu/${d.gameId}`}>{tr('voir la fiche')}</Link></>}
        </p>
      ))}
      {error && <p className="error">{error}</p>}
      {loaded && items.length === 0 && <p className="panel empty">{tr('Aucune proposition en attente. ')}<PsSymbol shape="triangle" /></p>}
      {items.map((s) => s.action === 'update' && s.target === 'game'
        ? <SummaryCard key={s.id} submission={s} onDone={(r) => finished(s, r)} />
        : s.target === 'image'
          ? <CoverSubmissionCard key={s.id} submission={s} onDone={(r) => finished(s, r)} />
          : <SubmissionCard key={s.id} submission={s} onDone={(r) => finished(s, r)} />)}
    </div>
  );
}

function SubmissionCard({ submission: s, onDone }: { submission: Submission; onDone: (r: { approved: boolean; gameId?: number }) => void }) {
  const platforms = usePlatforms();
  const r = s.data.release;
  const isNewGame = s.target === 'game';
  // Jaquette recadrée par le modérateur (publiée à la place de l'originale)
  const [edited, setEdited] = useState<Blob | null>(null);
  const [existingGame, setExistingGame] = useState<{ id: number; title: string; slug: string | null } | null>(null);
  const [attachTo, setAttachTo] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Studios inconnus : créer, remplacer par un existant, ou retirer
  const companies = useCompanies();
  const [studios, setStudios] = useState<{ publisher?: StudioChoice; developer?: StudioChoice }>({});
  const undecided = Boolean(r) && companies.length > 0
    && (needsStudioDecision(companies, r!.publisher_id, r!.publisher_name, studios.publisher)
      || needsStudioDecision(companies, r!.developer_id, r!.developer_name, studios.developer));

  useEffect(() => {
    if (s.data.game_id) {
      supabase.from('game').select('id, title, slug').eq('id', s.data.game_id).maybeSingle().then(({ data }) => setExistingGame(data));
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
        // Le stockage ne se manipule pas en SQL : la jaquette passe d'abord dans l'espace public
        // (telle quelle, ou recadrée par le modérateur)
        publicCover = await publishProposedCover(s.data.cover_path, edited, `submissions/${s.id}-${crypto.randomUUID()}`);
      }
      const { data, error } = await supabase.rpc('review_submission', {
        submission_id: s.id,
        approve: true,
        note: note.trim() || null,
        cover_path: publicCover,
        attach_to_game_id: attachTo,
        studios: Object.values(studios).some((v) => v !== undefined) ? studios : null,
      });
      if (error) throw error;
      if (studios.publisher === 'create' || studios.developer === 'create') forgetCompanies();
      if (s.data.cover_path) await supabase.storage.from('submission-images').remove([s.data.cover_path]);
      onDone({ approved: true, gameId: (data as { game_id: number }).game_id });
    } catch (err) {
      if (publicCover) await supabase.storage.from('covers').remove([publicCover]);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function reject() {
    if (!note.trim()) return setError(tr("Indique le motif du refus : il sera affiché à l'auteur."));
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
        {s.data.cover_path ? (
          <ProposedCover path={s.data.cover_path} platform={platforms.find((p) => p.id === r?.platform_id)?.short_name} editionType={r?.edition_type}
            edited={edited} onEdited={setEdited} size="medium" />
        ) : (
          <div className={`cover cover-medium${s.data.no_cover ? ' cover-disabled' : ''}`}>
            <span className="cover-empty" aria-hidden="true"><PsSymbol shape="square" /></span>
          </div>
        )}
        <div className="submission-info">
          <p className="muted small">
            {isNewGame ? tr('Nouveau jeu') : tr('Nouvelle version')}{tr(' · proposé par ')}<strong>{s.author?.username ?? tr('compte supprimé')}</strong>{tr(' le {0}', new Date(s.created_at).toLocaleDateString(locale))}
          </p>
          <h2>{isNewGame ? s.data.game?.title : existingGame ? <Link to={gamePath(existingGame)}>{existingGame.title}</Link> : '…'}</h2>
          {s.data.no_cover && <p className="badge badge-todo">{tr('Déclaré sans jaquette')}</p>}
          {r && (
            <dl className="facts">
              <dt>{tr('Console')}</dt><dd>{platformName}</dd>
              <dt>{tr('Zone')}</dt><dd>{zoneLabel((r.zone ?? null) as Zone | null)}</dd>
              <dt>{tr('Titre sur la boîte')}</dt><dd>{r.local_title}</dd>
              {r.product_code && (<><dt>{tr('Code produit')}</dt><dd className="code">{r.product_code.toUpperCase()}</dd></>)}
              <dt>{tr('Édition')}</dt><dd>{EDITION_TYPES.find((t) => t.value === r.edition_type)?.label.split(' (')[0]}{r.edition_name ? ` · ${r.edition_name}` : ''}</dd>
              {r.release_date && (<><dt>{tr('Sortie')}</dt><dd>{formatDate(r.release_date, r.date_precision ?? 'day')}{r.region_code ? ` (${r.region_code})` : ''}</dd></>)}
              {r.languages && r.languages.length > 0 && (<><dt>{tr('Langues')}</dt><dd>{r.languages.map((l) => LANGUAGES.find((x) => x.value === l)?.label ?? l).join(', ')}</dd></>)}
            </dl>
          )}
          {s.sources && <p className="block-notes">{tr('Sources : ')}{s.sources}</p>}
        </div>
      </div>

      {r && (
        <div className="stack studio-decisions">
          <StudioDecision label={tr('Éditeur')} id={r.publisher_id} name={r.publisher_name} choice={studios.publisher}
            onChoice={(c) => setStudios((d) => ({ ...d, publisher: c }))} />
          <StudioDecision label={tr('Développeur')} id={r.developer_id} name={r.developer_name} choice={studios.developer}
            onChoice={(c) => setStudios((d) => ({ ...d, developer: c }))} />
        </div>
      )}

      {isNewGame && similar.length > 0 && (
        <fieldset className="notice">
          <legend className="field-label">{tr('Ce jeu existe peut-être déjà')}</legend>
          <label className="radio-row">
            <input type="radio" name={`attach-${s.id}`} checked={attachTo === null} onChange={() => setAttachTo(null)} />
            {tr("Non, c'est un nouveau jeu")}
          </label>
          {similar.map((g) => (
            <label key={g.id} className="radio-row">
              <input type="radio" name={`attach-${s.id}`} checked={attachTo === g.id} onChange={() => setAttachTo(g.id)} />
              {tr('Oui : ajouter seulement la version à ')}<Link to={gamePath(g)} target="_blank" rel="noopener">{g.title}</Link>
              <span className="muted"> {yearOf(g.first_release_date)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="field">
        <span className="field-label">{tr("Commentaire (obligatoire pour un refus, visible par l'auteur)")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button button-primary" onClick={approve} disabled={busy || undecided}
          title={undecided ? tr("Décide d'abord du nouveau studio") : undefined}>
          <PsSymbol shape="cross" /> {attachTo ? tr('Accepter (version du jeu choisi)') : tr('Accepter')}
        </button>
        <button type="button" className="button button-danger" onClick={reject} disabled={busy}>
          <PsSymbol shape="circle" />{tr(' Refuser')}
        </button>
      </div>
    </article>
  );
}

// Proposition de résumé : l'actuel et le proposé côte à côte
function SummaryCard({ submission: s, onDone }: { submission: Submission; onDone: (r: { approved: boolean; gameId?: number }) => void }) {
  const [game, setGame] = useState<{ id: number; title: string; slug: string | null; summary: string | null; summary_source: string | null } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!s.target_id) return;
    supabase.from('game').select('id, title, slug, summary, summary_source').eq('id', s.target_id).maybeSingle().then(({ data }) => setGame(data));
  }, [s.target_id]);

  async function review(approve: boolean) {
    if (!approve && !note.trim()) return setError(tr("Indique le motif du refus : il sera affiché à l'auteur."));
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
        {tr('Résumé · proposé par ')}<strong>{s.author?.username ?? tr('compte supprimé')}</strong>{tr(' le {0}', new Date(s.created_at).toLocaleDateString(locale))}
      </p>
      <h2>{game ? <Link to={gamePath(game)} target="_blank" rel="noopener">{game.title}</Link> : '…'}</h2>
      <div className="summary-compare">
        <div>
          <p className="field-label">{tr('Résumé actuel')}{game?.summary_source ? tr(' (Wikipédia)') : ''}</p>
          <p className="summary muted">{game?.summary ?? tr('Aucun résumé pour le moment.')}</p>
        </div>
        <div>
          <p className="field-label">{tr('Résumé proposé')}</p>
          <p className="summary">{s.data.summary}</p>
        </div>
      </div>
      {s.sources && <p className="block-notes">{tr('Sources : ')}{s.sources}</p>}
      <label className="field">
        <span className="field-label">{tr("Commentaire (obligatoire pour un refus, visible par l'auteur)")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button button-primary" onClick={() => review(true)} disabled={busy}>
          <PsSymbol shape="cross" />{tr(' Accepter ce résumé')}
        </button>
        <button type="button" className="button button-danger" onClick={() => review(false)} disabled={busy}>
          <PsSymbol shape="circle" />{tr(' Refuser')}
        </button>
      </div>
    </article>
  );
}

// Jaquette proposée pour une version existante : l'actuelle et la proposée côte à côte.
// Acceptée, elle remplace l'actuelle (dont le fichier est retiré du stockage).
function CoverSubmissionCard({ submission: s, onDone }: { submission: Submission; onDone: (r: { approved: boolean; gameId?: number }) => void }) {
  const [release, setRelease] = useState<(Release & { game: { id: number; title: string; slug: string | null } }) | null | undefined>(undefined);
  // Jaquette recadrée par le modérateur (publiée à la place de l'originale)
  const [edited, setEdited] = useState<Blob | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const coverPath = s.data.cover_path ?? '';

  useEffect(() => {
    if (!s.target_id) return setRelease(null);
    supabase.from('release').select(`${RELEASE_FIELDS}, game(id, title, slug)`).eq('id', s.target_id).maybeSingle()
      .then(({ data }) => setRelease((data as unknown as (Release & { game: { id: number; title: string; slug: string | null } }) | null) ?? null));
  }, [s.target_id]);

  async function approve() {
    setBusy(true);
    setError('');
    try {
      // Le stockage ne se manipule pas en SQL : la jaquette passe d'abord dans les jaquettes
      // publiques (telle quelle, ou recadrée par le modérateur)
      const publicCover = await publishProposedCover(coverPath, edited, `releases/${s.target_id}/${crypto.randomUUID()}`);
      const { data, error: reviewError } = await supabase.rpc('review_submission', { submission_id: s.id, approve: true, note: note.trim() || null, cover_path: publicCover });
      if (reviewError) {
        await supabase.storage.from('covers').remove([publicCover]);
        throw reviewError;
      }
      const result = data as { game_id: number; replaced?: string[] };
      // L'ancienne jaquette n'est plus utilisée ; l'image proposée non plus
      if (result.replaced?.length) await supabase.storage.from('covers').remove(result.replaced);
      await supabase.storage.from('submission-images').remove([coverPath]);
      onDone({ approved: true, gameId: result.game_id });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function reject() {
    if (!note.trim()) return setError(tr("Indique le motif du refus : il sera affiché à l'auteur."));
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('review_submission', { submission_id: s.id, approve: false, note: note.trim() });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    await supabase.storage.from('submission-images').remove([coverPath]);
    onDone({ approved: false });
  }

  return (
    <article className="panel submission-card">
      <p className="muted small">
        {tr('Jaquette · proposée par ')}<strong>{s.author?.username ?? tr('compte supprimé')}</strong>{tr(' le {0}', new Date(s.created_at).toLocaleDateString(locale))}
      </p>
      {release === null ? (
        <p className="notice">{tr("Cette version n'existe plus : refuse la proposition.")}</p>
      ) : (
        <>
          <h2>{release ? <Link to={`${gamePath(release.game)}?version=${release.id}`} target="_blank" rel="noopener">{release.game.title}</Link> : '…'}</h2>
          {release && (
            <p className="small">
              {[release.local_title, zoneLabel(release.zone), editionLabel(release), release.product_code, release.platform.short_name].filter(Boolean).join(' · ')}
            </p>
          )}
        </>
      )}
      <div className="cover-compare">
        <figure>
          <figcaption className="field-label">{tr('Jaquette actuelle')}</figcaption>
          {release ? <Cover images={release.image} title={release.local_title} size="large" platform={release.platform.short_name} zoomable /> : <span className="cover cover-large" />}
        </figure>
        <figure>
          <figcaption className="field-label">{tr('Jaquette proposée')}</figcaption>
          <ProposedCover path={coverPath} platform={release?.platform.short_name} editionType={release?.edition_type} edited={edited} onEdited={setEdited} />
        </figure>
      </div>
      <label className="field">
        <span className="field-label">{tr("Commentaire (obligatoire pour un refus, visible par l'auteur)")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder={tr('Ex. : image floue, reflet, pas la bonne version…')} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="button button-primary" onClick={approve} disabled={busy || !release}>
          <PsSymbol shape="cross" />{tr(' Accepter cette jaquette')}
        </button>
        <button type="button" className="button button-danger" onClick={reject} disabled={busy}>
          <PsSymbol shape="circle" />{tr(' Refuser')}
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
  slug: string | null;
  wikidata_id: string | null;
  first_release_date: string | null;
  release: { id: number; zone: Zone | null; image: ReleaseImage[]; platform: { short_name: string } }[];
}

function DuplicateList({ onCount, platform }: { onCount: (n: number) => void; platform: string }) {
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
        .select('id, title, slug, wikidata_id, first_release_date, release(id, zone, image(id, type, path), platform(short_name))')
        .in('id', ids);
      for (const g of (rows as unknown as DuplicateGame[]) ?? []) map.set(g.id, g);
    }
    setGroups(list);
    setGames(map);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Console choisie : les groupes dont au moins une fiche a une version sur cette console
  const shown = useMemo(() => (platform === ALL_PLATFORMS ? groups : groups.filter((g) =>
    g.game_ids.some((id) => games.get(id)?.release.some((r) => r.platform.short_name === platform)))), [groups, games, platform]);
  useEffect(() => { if (loaded) onCount(shown.length); }, [loaded, shown, onCount]);

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
            title: tr('Fiches Wikidata différentes'),
            message: (
              <>
                <p>
                  « {kept?.title} » ({kept?.wikidata_id}{tr(') et « ')}{b?.title} » ({b?.wikidata_id}{tr(') ont chacun leur fiche Wikidata.')}
                </p>
                <p className="muted">
                  {tr('Ce sont souvent deux jeux distincts (un original et son remake…), mais Wikidata a aussi des doublons. Vérifie avec les liens Wikidata en cas de doute. La fiche gardée conserve son identifiant.')}
                </p>
              </>
            ),
            confirmLabel: tr('Fusionner quand même'),
          });
          if (!ok) continue;
          ({ error } = await supabase.rpc('merge_games', { keep_id: keepId, duplicate_id: other, force: true }));
        }
        if (error) throw error;
        merged++;
      }
      if (merged > 0) notify(tr('« {0} » : {1} fiches fusionnées en une.', kept?.title, merged + 1));
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
    notify(tr('« {0} » : marqué comme « pas des doublons ».', group.titles[0]));
    await load();
  }

  return (
    <div className="stack">
      <p className="muted">
        {tr('Fiches qui portent le même titre (aux majuscules, accents et ponctuation près). Choisis la fiche à garder : les versions, développeurs et genres des autres y sont regroupés. Ou indique que ce ne sont pas des doublons.')}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && shown.length === 0 && <p className="panel empty">{tr('Aucun doublon possible. ')}<PsSymbol shape="triangle" /></p>}
      {shown.map((group) => (
        <article key={group.title_key} className={`panel${busyKey === group.title_key ? ' is-busy' : ''}`}>
          <div className="duplicate-row">
            {group.game_ids.map((id) => <DuplicateCard key={id} game={games.get(id)} disabled={!!busyKey} onKeep={() => keep(group, id)} />)}
          </div>
          {groupError?.key === group.title_key && <p className="error" role="alert">{groupError.text}</p>}
          <div className="actions">
            <button type="button" className="button button-small" onClick={() => dismiss(group)} disabled={!!busyKey}>
              <PsSymbol shape="circle" />{tr(' Ce ne sont pas des doublons')}
            </button>
            {busyKey === group.title_key && <span className="muted small">{tr('Fusion en cours…')}</span>}
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
          {yearOf(game.first_release_date) || tr('année inconnue')} · {game.release.length}{tr(' version{0?s} : ', game.release.length > 1)}{summary || tr('aucune')}
        </p>
        <p className="muted small">
          {game.wikidata_id
            ? <a href={`https://www.wikidata.org/wiki/${game.wikidata_id}`} target="_blank" rel="noopener noreferrer">{tr('Wikidata ')}{game.wikidata_id}</a>
            : tr('Sans fiche Wikidata')}
        </p>
        <button type="button" className="button button-small button-primary" onClick={onKeep} disabled={disabled}>
          <PsSymbol shape="cross" />{tr(' Garder celle-ci')}
        </button>
      </div>
    </div>
  );
}
