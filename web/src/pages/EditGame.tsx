import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GAME_FIELDS } from '../lib/queries';
import {
  countryName, EDITION_TYPES, familyLabel, gamePath, LANGUAGES, slugify, ZONES, zoneLabel, zoneOrder, BOX_REGIONS, boxRegionName, editionLabel, languagesLong, genreName, regionName,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ACCEPT_ATTRIBUTE, imageFromClipboard, uploadReleaseImage } from '../lib/images';
import type { DatePrecision, EditionType, Game, GenreInfo, ImageType, Release, SearchResult, SpecField, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Combobox } from '../components/Combobox';
import { GameSearch } from '../components/GameSearch';
import { HistoryList } from '../components/HistoryList';
import { StudioListEditor } from '../components/StudioListEditor';
import { useRegions } from '../lib/useRegions';
import { Dialog } from '../components/Dialog';
import { Cover } from '../components/Cover';
import { useConfirm } from '../components/Confirm';
import { PsSymbol } from '../components/PsSymbol';
import { tr } from '../lib/i18n';

const IMAGE_TYPES: { value: ImageType; label: string }[] = [
  { value: 'front', label: tr('Recto') },
  { value: 'back', label: tr('Verso') },
  { value: 'spine', label: tr('Tranche') },
  { value: 'disc', label: tr('Disque') },
  { value: 'manual', label: tr('Notice') },
  { value: 'screenshot', label: tr("Capture d'écran") },
];

// Modification d'un jeu par un modérateur ou un admin (en double authentification :
// la base refuse sinon). Les membres passent par « Proposer une version ».
export function EditGame() {
  const { id } = useParams();
  const gameId = Number.parseInt(id ?? '', 10);
  const { aal } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [missing, setMissing] = useState(false);
  const [deleted, setDeleted] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('game').select(GAME_FIELDS).eq('id', gameId).maybeSingle();
    if (!data) return setMissing(true);
    setGame(data as unknown as Game);
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  if (deleted) {
    return (
      <section className="panel stack">
        <h1>{tr('Jeu supprimé')}</h1>
        <p className="success">« {deleted}{tr(' » a été supprimé du catalogue. La suppression est notée dans le journal.')}</p>
        <p><Link to="/" className="button"><PsSymbol shape="circle" />{tr(' Retour à la recherche')}</Link></p>
      </section>
    );
  }
  if (missing) return <section className="panel"><h1>{tr('Jeu introuvable')}</h1></section>;
  if (!game) return <p className="loading">{tr('Lecture de la carte mémoire…')}</p>;

  const releases = [...game.release].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || a.id - b.id);

  return (
    <section className="stack">
      <div className="page-head">
        <h1>{tr('Modifier « ')}{game.title} »</h1>
        <Link to={gamePath(game)} className="button"><PsSymbol shape="circle" />{tr(' Retour à la fiche')}</Link>
      </div>
      {aal.current !== 'aal2' && (
        <p className="warning">
          {tr('Les modifications du catalogue demandent la double authentification.')}{' '}
          <Link to="/compte">{tr('Active-la ou valide-la dans « Mon compte »')}</Link>.
        </p>
      )}
      <GameForm game={game} onSaved={load} />
      <GenreEditor key={`${game.game_genre.map((g) => g.genre.id).join()}-${game.genres_reviewed}`} game={game} onSaved={load} />
      <section className="panel stack">
        <h2>{tr('Développeurs')}</h2>
        <StudioListEditor
          title={tr('Développeurs du jeu')}
          studios={game.game_developer.map((d) => d.company)}
          onAdd={(companyId) => supabase.from('game_developer').insert({ game_id: game.id, company_id: companyId })}
          onRemove={(companyId) => supabase.from('game_developer').delete().eq('game_id', game.id).eq('company_id', companyId)}
          onSaved={load}
        />
      </section>
      <OriginEditor key={game.game_developer.map((d) => d.company.id).join()} gameId={game.id} onSaved={load} />
      <h2>{tr('Versions')}</h2>
      {releases.map((r) => (
        <ReleaseEditor key={r.id} release={r} siblings={releases} onSaved={load} canDelete={releases.length > 1} possibleDuplicate={isEmptyTwin(r, releases)} />
      ))}
      <section className="panel stack">
        <h2>{tr('Historique')}</h2>
        <HistoryList gameId={game.id} onUndone={load} refresh={game} />
      </section>
      <MergeGame game={game} onMerged={load} />
      <DeleteGame game={game} onDeleted={() => setDeleted(game.title)} />
    </section>
  );
}

// Pays proposés pour l'origine : le Japon d'abord, puis les autres par ordre alphabétique
const ORIGIN_COUNTRIES = ['JP', ...['US', 'GB', 'FR', 'DE', 'CA', 'AU', 'KR', 'TW', 'CN', 'HK', 'ES', 'IT', 'NL', 'BE', 'SE', 'DK', 'NO', 'FI',
  'AT', 'CH', 'CZ', 'HU', 'PL', 'RU', 'TR', 'IL', 'BR', 'NZ', 'IE'].sort((a, b) => countryName(a).localeCompare(countryName(b), 'fr'))];

interface OriginInfo {
  origin_country: string | null;
  origin: string | null;
  game_developer: { company: { name: string; country: string | null } }[];
}

// Origine du jeu (pays du studio) : déduite des studios s'ils sont tous du même pays connu,
// sinon à choisir ici (coproduction, studio inconnu, ou cas particulier). Avec la famille
// RPG, le Japon range le jeu parmi les JRPG.
function OriginEditor({ gameId, onSaved }: { gameId: number; onSaved: () => void }) {
  const [info, setInfo] = useState<OriginInfo | null>(null);
  const [choice, setChoice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('game').select('origin_country, origin, game_developer(company(name, country))').eq('id', gameId).maybeSingle();
    setInfo((data as OriginInfo | null) ?? null);
    setChoice((data as OriginInfo | null)?.origin_country ?? '');
  }, [gameId]);

  useEffect(() => { load(); }, [load]);
  if (!info) return null;

  const studios = info.game_developer.map((d) => d.company);
  const countries = [...new Set(studios.map((c) => c.country))];
  const deduced = studios.length > 0 && countries.length === 1 && countries[0] ? countries[0] : null;
  const why = studios.length === 0 ? tr('aucun studio connu')
    : countries.includes(null) ? tr("pays d'un studio inconnu")
    : tr('studios de plusieurs pays');

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const { error } = await supabase.from('game').update({ origin_country: choice || null }).eq('id', gameId);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage(tr('Origine enregistrée.'));
    await load();
    onSaved();
  }

  return (
    <form onSubmit={save} className="form panel">
      <h2>{tr('Origine')}</h2>
      <p className="muted">
        {tr('Le pays du studio de développement. Avec la famille RPG, « Japon » range le jeu parmi les JRPG ; un autre pays, parmi les RPG occidentaux.')}
      </p>
      <p className="small">
        {tr('Studios : ')}{studios.length ? studios.map((c) => `${c.name} (${c.country ? countryName(c.country) : tr('pays inconnu')})`).join(', ') : tr('aucun')}.
        {' '}{tr('Origine actuelle : ')}<strong>{info.origin ? countryName(info.origin) : tr('inconnue')}</strong>.
      </p>
      <label className="field">
        <span className="field-label">{tr('Origine')}</span>
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{deduced ? tr('Déduite des studios : {0}', countryName(deduced)) : tr('Déduite des studios : inconnue ({0})', why)}</option>
          {ORIGIN_COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success">{message}</p>}
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={choice === (info.origin_country ?? '')}><PsSymbol shape="cross" />{tr(' Enregistrer')}</button>
      </div>
    </form>
  );
}

function GameForm({ game, onSaved }: { game: Game; onSaved: () => void }) {
  const [title, setTitle] = useState(game.title);
  const [summary, setSummary] = useState(game.summary ?? '');
  const [date, setDate] = useState(game.first_release_date ?? '');
  const [precision, setPrecision] = useState<DatePrecision>(game.first_release_precision ?? 'day');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!title.trim()) return setError(tr('Le titre est obligatoire.'));
    // Conventions de la base : « mois » → le 1er du mois, « année » → le 1er janvier
    const normalized = !date ? null : precision === 'year' ? `${date.slice(0, 4)}-01-01` : precision === 'month' ? `${date.slice(0, 7)}-01` : date;
    // Un résumé modifié n'est plus celui de Wikipédia : on retire le lien source
    const newSummary = summary.trim() || null;
    const summaryChanged = newSummary !== (game.summary?.trim() || null);
    const { error } = await supabase.from('game').update({
      title: title.trim(),
      summary: newSummary,
      summary_source: summaryChanged || !newSummary ? null : game.summary_source,
      first_release_date: normalized,
      first_release_precision: normalized ? precision : null,
    }).eq('id', game.id);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage(tr('Jeu enregistré.'));
    onSaved();
  }

  return (
    <form onSubmit={save} className="form panel">
      <h2>{tr('Le jeu')}</h2>
      <label className="field">
        <span className="field-label">{tr('Titre de référence')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <label className="field">
        <span className="field-label">{tr('Résumé')}</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={6} maxLength={3000} />
        {game.summary_source && (
          <span className="hint">
            {tr('Texte actuel extrait de ')}<a href={game.summary_source} target="_blank" rel="noopener noreferrer">{tr('Wikipédia')}</a>{tr('. Le modifier en fait un texte de la communauté : le lien vers Wikipédia sera retiré.')}
          </span>
        )}
      </label>
      <div className="row">
        <label className="field">
          <span className="field-label">{tr('Première sortie (toutes plateformes)')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{tr('Précision')}</span>
          <select value={precision} onChange={(e) => setPrecision(e.target.value as DatePrecision)}>
            <option value="day">{tr('Jour exact')}</option>
            <option value="month">{tr('Mois')}</option>
            <option value="year">{tr('Année seulement')}</option>
          </select>
        </label>
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary"><PsSymbol shape="cross" />{tr(' Enregistrer le jeu')}</button>
    </form>
  );
}

// Genres du jeu. Enregistrer marque le jeu « revu » : les imports automatiques
// (Wikipédia…) ne toucheront plus à ses genres.
function GenreEditor({ game, onSaved }: { game: Game; onSaved: () => void }) {
  const initial = game.game_genre.map((g) => g.genre);
  const [all, setAll] = useState<GenreInfo[]>([]);
  const [selected, setSelected] = useState<GenreInfo[]>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('genre').select('id, name, families').order('name').then(({ data }) => setAll((data as GenreInfo[]) ?? []));
  }, []);

  const chosen = new Set(selected.map((g) => g.id));
  const families = [...new Set(selected.flatMap((g) => g.families))];
  const changed = selected.length !== initial.length || initial.some((g) => !chosen.has(g.id));
  // Genres proposés à l'ajout, avec leurs familles (cherchées elles aussi : « stratégie » trouve Tactical RPG)
  const options = all
    .filter((g) => !chosen.has(g.id))
    .map((g) => ({ value: g.id, label: genreName(g.name), detail: g.families.length ? g.families.map(familyLabel).join(' + ') : tr('thème') }));

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    const before = new Set(initial.map((g) => g.id));
    const removed = initial.filter((g) => !chosen.has(g.id)).map((g) => g.id);
    const added = selected.filter((g) => !before.has(g.id)).map((g) => ({ game_id: game.id, genre_id: g.id }));
    try {
      if (removed.length) {
        const { error } = await supabase.from('game_genre').delete().eq('game_id', game.id).in('genre_id', removed);
        if (error) throw error;
      }
      if (added.length) {
        const { error } = await supabase.from('game_genre').insert(added);
        if (error) throw error;
      }
      const { error } = await supabase.from('game').update({ genres_reviewed: true }).eq('id', game.id);
      if (error) throw error;
      setMessage(tr("Genres enregistrés. Le jeu est marqué « revu » : les imports automatiques n'y toucheront plus."));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form panel">
      <h2>{tr('Genres')}</h2>
      <p className="hint">
        {tr('Familles : ')}{families.length ? families.map(familyLabel).join(', ') : tr('aucune')}.{' '}
        {game.genres_reviewed ? tr('Genres déjà revus par un modérateur.') : tr("Pas encore revus : enregistrer (même sans changement) confirme qu'ils sont justes.")}
      </p>
      <ul className="genre-chips">
        {selected.map((g) => (
          <li key={g.id} className={g.families.length ? 'genre-chip' : 'genre-chip is-theme'}>
            {genreName(g.name)}
            <span className="muted small">{g.families.length ? g.families.map(familyLabel).join(' + ') : tr('thème')}</span>
            <button type="button" className="icon-button" aria-label={tr('Retirer {0}', g.name)} onClick={() => setSelected(selected.filter((x) => x.id !== g.id))}>✕</button>
          </li>
        ))}
        {selected.length === 0 && <li className="muted">{tr('Aucun genre.')}</li>}
      </ul>
      <Combobox
        label={tr('Ajouter un genre')}
        placeholder={tr('Tape pour chercher : plates-formes, stratégie, RPG…')}
        options={options}
        emptyText={tr('Aucun genre ne correspond')}
        onSelect={(o) => { const g = all.find((x) => x.id === o.value); if (g) setSelected([...selected, g]); }}
      />
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="button button-primary" onClick={save} disabled={saving || (!changed && game.genres_reviewed)}>
        <PsSymbol shape="cross" /> {changed ? tr('Enregistrer les genres') : tr('Confirmer : les genres sont justes')}
      </button>
    </section>
  );
}

// Efface du stockage les jaquettes d'un jeu ou d'une version supprimés
async function removeCovers(paths: string[] | null) {
  for (let i = 0; i < (paths?.length ?? 0); i += 100) {
    await supabase.storage.from('covers').remove(paths!.slice(i, i + 100));
  }
}

interface MergeCandidate {
  id: number;
  title: string;
  wikidata_id: string | null;
  release: { id: number; zone: Zone | null; product_code: string | null; image: { id: number }[] }[];
}

// Fusion avec un autre jeu (doublon que la détection automatique n'a pas vu,
// comme « Kagero: Deception 2 » et « Kagero: Deception II ») : les versions, donc
// les exemplaires des membres, les genres et les propositions passent sur le jeu gardé.
function MergeGame({ game, onMerged }: { game: Game; onMerged: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<[MergeCandidate, MergeCandidate] | null>(null);
  const [keepId, setKeepId] = useState<number | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(other: SearchResult) {
    setError('');
    if (other.id === game.id) return setError(tr('Choisis un autre jeu que celui-ci.'));
    const { data, error } = await supabase.from('game')
      .select('id, title, wikidata_id, release(id, zone, product_code, image(id))').in('id', [game.id, other.id]);
    if (error || !data || data.length !== 2) return setError(errorMessage(error) || tr('Jeu introuvable.'));
    const list = data as unknown as MergeCandidate[];
    const self = list.find((g) => g.id === game.id)!;
    const target = list.find((g) => g.id === other.id)!;
    setPair([self, target]);
    setForce(false);
    // Par défaut : garder la fiche reliée à Wikidata, sinon celle qui a le plus de versions, sinon l'autre
    const score = (g: MergeCandidate) => (g.wikidata_id ? 1000 : 0) + g.release.length;
    setKeepId(score(self) > score(target) ? self.id : target.id);
  }

  async function merge(e: FormEvent) {
    e.preventDefault();
    if (!pair || !keepId) return;
    const duplicate = pair.find((g) => g.id !== keepId)!;
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('merge_games', { keep_id: keepId, duplicate_id: duplicate.id, force });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setOpen(false);
    if (keepId === game.id) onMerged();
    else navigate(`/jeu/${keepId}/modifier`);
  }

  const conflict = pair && pair[0].wikidata_id && pair[1].wikidata_id && pair[0].wikidata_id !== pair[1].wikidata_id;

  return (
    <section className="panel stack">
      <h2>{tr('Fusionner avec un autre jeu')}</h2>
      <p className="muted">
        {tr('Pour un doublon : les versions de la fiche supprimée (et donc les exemplaires des membres), ses genres, ses développeurs et ses propositions passent sur la fiche gardée. La fusion est définitive.')}
      </p>
      <div>
        <button type="button" className="button" onClick={() => { setOpen(true); setPair(null); setError(''); }}>
          <PsSymbol shape="square" />{tr(' Fusionner avec…')}
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Fusionner « {0} »', game.title)} wide>
        {!pair && (
          <>
            <GameSearch onSelect={choose} autoFocus label={tr('Avec quel jeu ? (titre ou code produit)')} />
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
        {pair && (
          <form onSubmit={merge} className="form">
            <fieldset className="merge-choice">
              <legend className="field-label">{tr('Quelle fiche garder ?')}</legend>
              {pair.map((g) => (
                <label key={g.id} className={keepId === g.id ? 'merge-option active' : 'merge-option'}>
                  <input type="radio" name="keep" checked={keepId === g.id} onChange={() => setKeepId(g.id)} />
                  <span>
                    <strong>{g.title}</strong>{g.id === game.id && <span className="muted">{tr(' (cette fiche)')}</span>}
                    <span className="muted small">
                      {' '}{tr('· n° ')}{g.id} · {g.release.length}{tr(' version{0?s}', g.release.length > 1)}
                      {' '}({[...new Set(g.release.map((r) => r.zone ?? '?'))].join(', ')})
                      {g.wikidata_id ? tr(' · Wikidata {0}', g.wikidata_id) : tr(' · sans Wikidata')}
                    </span>
                    <span className="muted small"> {g.release.map((r) => r.product_code).filter(Boolean).join(', ')}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {conflict && (
              <label className="warning switch">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                {tr("Ces deux fiches sont reliées à des fiches Wikidata différentes : ce sont peut-être deux jeux distincts. Coche pour confirmer qu'il s'agit bien du même jeu.")}
              </label>
            )}
            <p className="warning">
              {tr('La fiche « ')}{pair.find((g) => g.id !== keepId)?.title}{tr(' » (n° ')}{pair.find((g) => g.id !== keepId)?.id}{tr(') disparaîtra : ses versions rejoignent « ')}{pair.find((g) => g.id === keepId)?.title} ».
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="button" onClick={() => setPair(null)}><PsSymbol shape="circle" />{tr(' Autre jeu')}</button>
              <button type="submit" className="button button-danger" disabled={busy || Boolean(conflict && !force)}>
                {busy ? tr('Fusion…') : tr('Fusionner')}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}

// Zone dangereuse : suppression définitive, avec le titre à retaper pour confirmer
function DeleteGame({ game, onDeleted }: { game: Game; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const images = game.release.reduce((n, r) => n + r.image.length, 0);

  async function remove(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error } = await supabase.rpc('delete_game', { target_game: game.id, reason: reason.trim() || null });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    await removeCovers(data as string[]);
    onDeleted();
  }

  return (
    <section className="panel danger-zone">
      <h2>{tr('Zone dangereuse')}</h2>
      <p className="muted">
        {tr('Supprimer ce jeu efface aussi ses ')}{game.release.length}{tr(' version{0?s} et ', game.release.length > 1)}{images}{tr(" image{0?s}. C'est impossible si un membre l'a dans sa collection : pour un doublon, utilise plutôt la fusion (Modération → Doublons).", images > 1)}
      </p>
      <button type="button" className="button button-danger" onClick={() => { setOpen(true); setTyped(''); setError(''); }}>{tr('Supprimer ce jeu…')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Supprimer ce jeu')}>
        <form onSubmit={remove} className="form">
          <p className="warning">
            {tr('Suppression ')}<strong>{tr('définitive')}</strong>{tr(' de « ')}{game.title}{tr(' », de ses versions, dates, images et genres. Elle sera notée dans le journal des suppressions.')}
          </p>
          <label className="field">
            <span className="field-label">{tr('Motif (facultatif)')}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={tr('Jeu inexistant, doublon sans exemplaire…')} />
          </label>
          <label className="field">
            <span className="field-label">{tr('Pour confirmer, tape le titre exact : ')}{game.title}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="button" onClick={() => setOpen(false)}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
            <button type="submit" className="button button-danger" disabled={busy || typed.trim() !== game.title.trim()}>
              {busy ? tr('Suppression…') : tr('Supprimer définitivement')}
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

// Version sans code produit à côté d'une version de même zone et même édition qui en a un :
// souvent un doublon laissé par une fusion (« Kagero: Deception 2 » / « … II »). Renvoie la
// version jumelle, pour le message (un titre différent peut aussi être une version nationale).
function isEmptyTwin(r: Release, all: Release[]): Release | null {
  if (r.product_code) return null;
  return all.find((o) => o.id !== r.id && o.product_code && o.zone === r.zone && o.edition_type === r.edition_type
    && (o.edition_name ?? '') === (r.edition_name ?? '')) ?? null;
}

function ReleaseEditor({ release, siblings, onSaved, canDelete, possibleDuplicate }: {
  release: Release; siblings: Release[]; onSaved: () => void; canDelete: boolean; possibleDuplicate: Release | null;
}) {
  const { session } = useAuth();
  const regions = useRegions();
  const [boxRegion, setBoxRegion] = useState(release.box_region?.code ?? '');
  const confirm = useConfirm();
  const [localTitle, setLocalTitle] = useState(release.local_title);
  const [zone, setZone] = useState<Zone | ''>(release.zone ?? '');
  const [productCode, setProductCode] = useState(release.product_code ?? '');
  const [editionType, setEditionType] = useState<EditionType>(release.edition_type);
  const [editionName, setEditionName] = useState(release.edition_name ?? '');
  const [mediaCount, setMediaCount] = useState(String(release.media_count ?? 1));
  const [languages, setLanguages] = useState<string[]>(release.languages);
  const [specs, setSpecs] = useState<Record<string, unknown>>(release.specs ?? {});
  const [imageType, setImageType] = useState<ImageType>('front');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const code = productCode.trim().toUpperCase();
    if (!localTitle.trim()) return setError(tr('Le titre est obligatoire.'));
    if (code && !/^[A-Z0-9][A-Z0-9 ._-]{2,19}$/.test(code)) return setError(tr('Code produit invalide (exemple : SCES-00867).'));
    const count = Number.parseInt(mediaCount, 10);
    const { error } = await supabase.from('release').update({
      local_title: localTitle.trim(),
      zone: zone || null,
      product_code: code || null,
      edition_type: editionType,
      edition_name: editionName.trim() || null,
      media_count: Number.isInteger(count) && count > 0 ? count : null,
      languages,
      specs,
      box_region_id: regions.find((r) => r.code === boxRegion)?.id ?? null,
    }).eq('id', release.id);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage(tr('Version enregistrée.'));
    onSaved();
  }

  async function uploadImage(file: File | undefined | null) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await uploadReleaseImage(release.id, imageType, file, session!.user.id);
      setMessage(tr('Image ajoutée ({0}).', IMAGE_TYPES.find((t) => t.value === imageType)?.label.toLowerCase()));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeRelease() {
    if (!(await confirm({
      title: tr('Supprimer cette version'),
      message: tr("« {0} » ({1}) sera définitivement supprimée, avec ses {2} image(s). C'est impossible si un membre l'a dans sa collection.", release.local_title, zoneLabel(release.zone), release.image.length),
      confirmLabel: tr('Supprimer'),
      danger: true,
    }))) return;
    const { data, error } = await supabase.rpc('delete_release', { target_release: release.id });
    if (error) return setError(errorMessage(error));
    await removeCovers(data as string[]);
    onSaved();
  }

  // Récupère le fichier tel qu'il est stocké (WebP), sous un nom lisible :
  // « final-fantasy-vii-pal-recto.webp ». Un lien direct ne suffit pas : le stockage
  // est sur un autre domaine, le navigateur ouvrirait l'image au lieu de l'enregistrer.
  async function downloadImage(path: string, type: ImageType) {
    setError('');
    const { data, error } = await supabase.storage.from('covers').download(path);
    if (error || !data) return setError(errorMessage(error) || tr('Téléchargement impossible.'));
    const label = IMAGE_TYPES.find((t) => t.value === type)?.label ?? type;
    const extension = path.split('.').pop() ?? 'webp';
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(`${release.local_title} ${release.zone ?? ''} ${label}`)}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeImage(imageId: number, path: string) {
    if (!(await confirm({ title: tr("Supprimer l'image"), message: tr('Cette image sera définitivement retirée du site.'), confirmLabel: tr('Supprimer'), danger: true }))) return;
    const { error } = await supabase.from('image').delete().eq('id', imageId);
    if (error) return setError(errorMessage(error));
    await supabase.storage.from('covers').remove([path]);
    onSaved();
  }

  return (
    <div className="panel release-editor">
      <h3>{release.local_title} <span className="muted small">· {zoneLabel(release.zone)}{tr(' · n° ')}{release.id}</span></h3>
      {possibleDuplicate && (
        <p className="warning">
          {tr('Doublon possible de « ')}{possibleDuplicate.local_title}{tr(' » (n° ')}{possibleDuplicate.id}, {possibleDuplicate.product_code}{tr(') : même zone, même édition, mais sans code produit.')}
          {possibleDuplicate.local_title.trim().toLowerCase() !== release.local_title.trim().toLowerCase() && tr(' Le titre diffère : ce peut aussi être une version nationale (française, allemande…).')}
          {' '}{tr("Vérifie, puis supprime-la si c'est un doublon.")}
        </p>
      )}

      {/* Clic sur cette zone, puis Ctrl+V : colle une image copiée sur un autre site ;
          on peut aussi y déposer un fichier. Elle prend le type choisi dans la liste. */}
      <div
        className="images-editor paste-target"
        tabIndex={0}
        aria-label={tr('Images de {0} : clique ici puis colle une image (Ctrl+V), ou dépose un fichier', release.local_title)}
        onPaste={(e) => {
          const file = imageFromClipboard(e.clipboardData);
          if (file) { e.preventDefault(); uploadImage(file); }
          else setError(tr("Le presse-papiers ne contient pas d'image : sur l'autre site, fais un clic droit sur l'image puis « Copier l'image »."));
        }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { const file = imageFromClipboard(e.dataTransfer); if (file) { e.preventDefault(); uploadImage(file); } }}
      >
        {release.image.map((img) => (
          <figure key={img.id} className="image-tile">
            <Cover images={[{ ...img, type: 'front' }]} title={release.local_title} size="small" />
            <figcaption>
              {IMAGE_TYPES.find((t) => t.value === img.type)?.label}
              <button type="button" className="link-button" onClick={() => downloadImage(img.path, img.type)}>{tr('Télécharger')}</button>
              <button type="button" className="link-button danger" onClick={() => removeImage(img.id, img.path)}>{tr('Supprimer')}</button>
            </figcaption>
          </figure>
        ))}
        <div className="image-upload">
          <select value={imageType} onChange={(e) => setImageType(e.target.value as ImageType)} aria-label={tr("Type d'image")}>
            {IMAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="button button-small">
            {busy ? tr('Envoi…') : <><PsSymbol shape="square" />{tr(' Ajouter une image')}</>}
            <input type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" disabled={busy}
              onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="muted small">{tr('ou clique dans ce cadre et colle (Ctrl+V)')}</span>
        </div>
      </div>

      <ReleaseDates release={release} onSaved={onSaved} />
      <StudioListEditor
        title={tr('Éditeurs de cette version')}
        studios={release.release_company.filter((c) => c.role === 'publisher').map((c) => c.company)}
        onAdd={(companyId) => supabase.from('release_company').insert({ release_id: release.id, company_id: companyId, role: 'publisher' })}
        onRemove={(companyId) => supabase.from('release_company').delete().eq('release_id', release.id).eq('company_id', companyId).eq('role', 'publisher')}
        onSaved={onSaved}
      />

      <form onSubmit={save} className="form">
        <div className="row">
          <label className="field">
            <span className="field-label">{tr('Titre sur la boîte')}</span>
            <input value={localTitle} onChange={(e) => setLocalTitle(e.target.value)} maxLength={200} required />
          </label>
          <label className="field">
            <span className="field-label">{tr('Zone')}</span>
            <select value={zone} onChange={(e) => setZone(e.target.value as Zone | '')}>
              <option value="">{tr('À compléter')}</option>
              {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span className="field-label">{tr('Code produit')}</span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="SCES-00867" maxLength={20} />
          </label>
          <label className="field">
            <span className="field-label">{tr('Édition')}</span>
            <select value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)}>
              {EDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{tr("Nom de l'édition")}</span>
            <input value={editionName} onChange={(e) => setEditionName(e.target.value)} placeholder={tr('Platinum')} maxLength={60} />
          </label>
          <label className="field field-narrow">
            <span className="field-label">{tr('Disques')}</span>
            <input type="number" min={1} max={20} value={mediaCount} onChange={(e) => setMediaCount(e.target.value)} />
          </label>
        </div>
        {release.platform.spec_fields && release.platform.spec_fields.length > 0 && (
          <SpecsEditor fields={release.platform.spec_fields} value={specs} onChange={setSpecs} />
        )}
        <fieldset className="checks">
          <legend className="field-label">{tr('Langues du disque')}</legend>
          {LANGUAGES.map((l) => (
            <label key={l.value}>
              <input type="checkbox" checked={languages.includes(l.value)}
                onChange={(e) => setLanguages(e.target.checked ? [...languages, l.value] : languages.filter((x) => x !== l.value))} />
              {l.label}
            </label>
          ))}
        </fieldset>
        <label className="field field-box-region">
          <span className="field-label">{tr('Boîte vendue en')}</span>
          <select value={boxRegion} onChange={(e) => setBoxRegion(e.target.value)}>
            <option value="">{tr('Non précisé')}</option>
            {BOX_REGIONS.map((code) => <option key={code} value={code}>{boxRegionName(code)}</option>)}
          </select>
          <span className="hint">{tr('Seulement quand le même disque a eu des boîtes différentes selon le pays (Crash Bash Platinum : boîte française, allemande…).')}</span>
        </label>
        {message && <p className="success">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="button button-primary"><PsSymbol shape="cross" />{tr(' Enregistrer cette version')}</button>
          <DeclineRelease release={release} siblings={siblings} onDone={onSaved} />
          {canDelete && <MoveRelease release={release} onMoved={onSaved} />}
          {canDelete && <button type="button" className="button button-small button-danger" onClick={removeRelease}>{tr('Supprimer cette version')}</button>}
        </div>
      </form>
    </div>
  );
}

// « Décliner par langue ou par pays » : crée en un clic les variantes d'une version
// (Platinum générique → Platinum française, allemande…). Rien n'est créé sans cocher :
// aucune source ne garantit qu'un jeu a eu sa Platinum dans chaque pays.
// - Par langue : quand le disque change avec la langue (FF7), une variante par
//   version standard de la zone, avec son code produit et ses langues.
// - Par pays : même disque, boîtes imprimées pour chaque pays (Crash Bash).
function DeclineRelease({ release, siblings, onDone }: { release: Release; siblings: Release[]; onDone: () => void }) {
  const regions = useRegions();
  const [open, setOpen] = useState(false);
  const [byLanguage, setByLanguage] = useState<number[]>([]);
  const [byCountry, setByCountry] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const same = (r: Release) => r.id !== release.id && r.zone === release.zone && r.edition_type === release.edition_type
    && (r.edition_name ?? '') === (release.edition_name ?? '');
  // Versions standard de la zone, une par langue de disque (code produit connu)
  const standards = siblings.filter((r) => r.edition_type === 'standard' && r.zone === release.zone && r.product_code && r.languages.length > 0);
  const languageChoices = standards.length > 1
    ? standards.filter((s) => !siblings.some((r) => same(r) && r.product_code === s.product_code && !r.box_region))
    : [];
  const countryChoices = BOX_REGIONS.filter((code) => !siblings.some((r) => same(r) && r.box_region?.code === code));
  const base = standards.length === 1 ? standards[0] : null;

  async function create() {
    setBusy(true);
    setError('');
    const common = {
      game_id: release.game_id, platform_id: release.platform.id, zone: release.zone,
      edition_type: release.edition_type, edition_name: release.edition_name,
    };
    const rows = [
      ...standards.filter((s) => byLanguage.includes(s.id)).map((s) => ({
        ...common, local_title: s.local_title, product_code: s.product_code, languages: s.languages, media_count: s.media_count,
        reissue_of: release.edition_type === 'standard' ? null : s.id,
      })),
      ...byCountry.map((code) => ({
        ...common, local_title: release.local_title,
        product_code: release.product_code ?? base?.product_code ?? null,
        languages: release.languages.length ? release.languages : base?.languages ?? [],
        media_count: release.media_count ?? base?.media_count ?? null,
        reissue_of: release.reissue_of ?? (release.edition_type === 'standard' ? null : base?.id ?? null),
        box_region_id: regions.find((r) => r.code === code)?.id ?? null,
      })),
    ];
    const { error } = await supabase.from('release').insert(rows);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setOpen(false);
    setByLanguage([]);
    setByCountry([]);
    onDone();
  }

  if (languageChoices.length === 0 && countryChoices.length === 0) return null;
  return (
    <>
      <button type="button" className="button button-small" onClick={() => setOpen(true)}>{tr('Décliner par langue ou par pays')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Décliner « {0} » ({1})', release.local_title, editionLabel(release))}>
        <p className="small">
          {tr("Coche seulement les variantes qui existent vraiment (boîte en main, photo, fiche fiable) : rien n'est créé d'office. Ensuite, si cette version générique ne sert plus, supprime-la.")}
        </p>
        {languageChoices.length > 0 && (
          <fieldset className="checks">
            <legend className="field-label">{tr('Par langue (le disque change avec la langue)')}</legend>
            {languageChoices.map((s) => (
              <label key={s.id}>
                <input type="checkbox" checked={byLanguage.includes(s.id)}
                  onChange={(e) => setByLanguage(e.target.checked ? [...byLanguage, s.id] : byLanguage.filter((x) => x !== s.id))} />
                {languagesLong(s.languages)} <span className="code muted">{s.product_code}</span>
              </label>
            ))}
          </fieldset>
        )}
        <fieldset className="checks">
          <legend className="field-label">{tr('Par pays (même disque, boîte imprimée pour ce pays)')}</legend>
          {countryChoices.map((code) => (
            <label key={code}>
              <input type="checkbox" checked={byCountry.includes(code)}
                onChange={(e) => setByCountry(e.target.checked ? [...byCountry, code] : byCountry.filter((x) => x !== code))} />
              {boxRegionName(code)}
            </label>
          ))}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="button button-primary" onClick={create} disabled={busy || byLanguage.length + byCountry.length === 0}>
            <PsSymbol shape="cross" />{tr(' Créer ')}{byLanguage.length + byCountry.length || ''}{tr(' variante{0?s}', byLanguage.length + byCountry.length > 1)}
          </button>
        </div>
      </Dialog>
    </>
  );
}

// Caractéristiques propres à la console (blocs de carte mémoire, manette analogique…).
// « Non précisé » retire la valeur : on ne confond pas « inconnu » et « non ».
// ---------------------------------------------------------------------
// Dates de sortie d'une version, par pays ou par zone (« Europe », « Amérique du Nord »…).
// Chaque ligne s'enregistre seule. « Novembre 1997 » est stocké au 1er novembre et
// « 1997 » au 1er janvier (règle de la base) ; « inconnue » garde le pays sans date.
// ---------------------------------------------------------------------
type Precision = DatePrecision | '';
const PRECISIONS: { value: Precision; label: string }[] = [
  { value: 'day', label: tr('Jour') }, { value: 'month', label: tr('Mois') }, { value: 'year', label: tr('Année') }, { value: '', label: tr('Inconnue') },
];

// Date stockée → valeur du champ, selon la précision (et l'inverse)
const toInput = (date: string | null, precision: Precision) =>
  !date || !precision ? '' : precision === 'day' ? date : precision === 'month' ? date.slice(0, 7) : date.slice(0, 4);
function toStored(value: string, precision: Precision): string | null {
  if (!precision) return null;
  if (precision === 'day') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (precision === 'month') return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null;
  return /^\d{4}$/.test(value) && Number(value) >= 1970 && Number(value) <= 2100 ? `${value}-01-01` : null;
}

function DateFields({ value, precision, onValue, onPrecision, label }: {
  value: string; precision: Precision; onValue: (v: string) => void; onPrecision: (p: Precision) => void; label: string;
}) {
  // Changer de précision garde ce qui peut l'être : 1997-11-14 → 1997-11 → 1997
  function choose(next: Precision) {
    const stored = toStored(value, precision) ?? (/^\d{4}/.test(value) ? `${value.slice(0, 4)}-01-01` : null);
    onPrecision(next);
    onValue(toInput(stored, next));
  }
  return (
    <>
      <select value={precision} onChange={(e) => choose(e.target.value as Precision)} aria-label={tr('Précision de la date ({0})', label)}>
        {PRECISIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {precision === 'day' && <input type="date" value={value} onChange={(e) => onValue(e.target.value)} aria-label={tr('Date ({0})', label)} />}
      {precision === 'month' && <input type="month" value={value} onChange={(e) => onValue(e.target.value)} aria-label={tr('Mois ({0})', label)} />}
      {precision === 'year' && <input type="number" min={1970} max={2100} value={value} onChange={(e) => onValue(e.target.value)} aria-label={tr('Année ({0})', label)} />}
    </>
  );
}

function ReleaseDates({ release, onSaved }: { release: Release; onSaved: () => void }) {
  const regions = useRegions();
  const [regionId, setRegionId] = useState('');
  const [value, setValue] = useState('');
  const [precision, setPrecision] = useState<Precision>('day');
  const [error, setError] = useState('');
  const used = new Set(release.release_region.map((rr) => rr.region.id));
  const rows = [...release.release_region].sort((a, b) => (a.release_date ?? '9').localeCompare(b.release_date ?? '9'));

  async function add(e: FormEvent) {
    e.preventDefault();
    const date = toStored(value, precision);
    if (!regionId) return setError(tr('Choisis un pays ou une zone.'));
    if (precision && !date) return setError(tr('Date incomplète ou invalide.'));
    const { error } = await supabase.from('release_region')
      .insert({ release_id: release.id, region_id: Number(regionId), release_date: date, date_precision: precision || null });
    if (error) return setError(errorMessage(error));
    setError('');
    setRegionId('');
    setValue('');
    onSaved();
  }

  return (
    <div className="release-dates">
      <h4>{tr('Dates de sortie')}</h4>
      {rows.length === 0 && <p className="muted small">{tr("Aucune date pour l'instant.")}</p>}
      <ul className="plain-list release-dates-list">
        {rows.map((rr) => (
          <DateRow key={`${rr.region.id}-${rr.release_date}-${rr.date_precision}`} releaseId={release.id} row={rr} onSaved={onSaved} onError={setError} />
        ))}
      </ul>
      <form onSubmit={add} className="release-date-row">
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label={tr('Pays ou zone de la nouvelle date')}>
          <option value="">{tr('Ajouter un pays ou une zone…')}</option>
          {(['zone', 'country', 'world'] as const).map((type) => (
            <optgroup key={type} label={type === 'zone' ? tr('Zones') : type === 'country' ? tr('Pays') : tr('Monde')}>
              {regions.filter((r) => r.type === type && !used.has(r.id)).map((r) => <option key={r.id} value={r.id}>{regionName(r)}</option>)}
            </optgroup>
          ))}
        </select>
        <DateFields value={value} precision={precision} onValue={setValue} onPrecision={setPrecision} label={tr('nouvelle date')} />
        <button type="submit" className="button button-small" disabled={!regionId}><PsSymbol shape="square" />{tr(' Ajouter')}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function DateRow({ releaseId, row, onSaved, onError }: {
  releaseId: number; row: Release['release_region'][number]; onSaved: () => void; onError: (message: string) => void;
}) {
  const confirm = useConfirm();
  const [precision, setPrecision] = useState<Precision>(row.date_precision ?? '');
  const [value, setValue] = useState(toInput(row.release_date, row.date_precision ?? ''));
  const date = toStored(value, precision);
  const changed = (precision || null) !== row.date_precision || date !== row.release_date;

  async function save() {
    if (precision && !date) return onError(tr('Date incomplète ou invalide.'));
    const { error } = await supabase.from('release_region').update({ release_date: date, date_precision: precision || null })
      .eq('release_id', releaseId).eq('region_id', row.region.id!);
    if (error) return onError(errorMessage(error));
    onError('');
    onSaved();
  }

  async function remove() {
    if (!(await confirm({ title: tr('Retirer cette date'), message: tr('La sortie « {0} » sera retirée de cette version.', regionName(row.region)), confirmLabel: tr('Retirer'), danger: true }))) return;
    const { error } = await supabase.from('release_region').delete().eq('release_id', releaseId).eq('region_id', row.region.id!);
    if (error) return onError(errorMessage(error));
    onSaved();
  }

  return (
    <li className="release-date-row">
      <span className="release-date-region">{regionName(row.region)}</span>
      <DateFields value={value} precision={precision} onValue={setValue} onPrecision={setPrecision} label={regionName(row.region)} />
      <button type="button" className="button button-small" disabled={!changed} onClick={save}>{tr('Enregistrer')}</button>
      <button type="button" className="link-button danger" onClick={remove}>{tr('Retirer')}</button>
    </li>
  );
}

function SpecsEditor({ fields, value, onChange }: { fields: SpecField[]; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  function set(key: string, v: unknown) {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  }
  return (
    <fieldset className="specs-editor">
      <legend className="field-label">{tr('Caractéristiques')}</legend>
      <div className="row">
        {fields.filter((f) => f.type !== 'multi_choice').map((f) => (
          <label key={f.key} className="field">
            <span className="field-label">{f.label}</span>
            {f.type === 'integer' && (
              <input type="number" min={f.min} max={f.max} value={value[f.key] === undefined ? '' : String(value[f.key])}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))} placeholder={tr('Non précisé')} />
            )}
            {f.type === 'boolean' && (
              <select value={value[f.key] === true ? 'yes' : value[f.key] === false ? 'no' : ''}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : e.target.value === 'yes')}>
                <option value="">{tr('Non précisé')}</option>
                <option value="yes">{tr('Oui')}</option>
                <option value="no">{tr('Non')}</option>
              </select>
            )}
            {f.type === 'choice' && (
              <select value={typeof value[f.key] === 'string' ? (value[f.key] as string) : ''} onChange={(e) => set(f.key, e.target.value || undefined)}>
                <option value="">{tr('Non précisé')}</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </label>
        ))}
      </div>
      {fields.filter((f) => f.type === 'multi_choice').map((f) => {
        const list = Array.isArray(value[f.key]) ? (value[f.key] as string[]) : [];
        return (
          <fieldset key={f.key} className="checks">
            <legend className="field-label">{f.label}</legend>
            {f.options?.map((o) => (
              <label key={o.value}>
                <input type="checkbox" checked={list.includes(o.value)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value);
                    set(f.key, next.length ? next : undefined);
                  }} />
                {o.label}
              </label>
            ))}
          </fieldset>
        );
      })}
    </fieldset>
  );
}

// Version rattachée au mauvais jeu : on la déplace (les exemplaires des membres suivent)
function MoveRelease({ release, onMoved }: { release: Release; onMoved: () => void }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function move(target: SearchResult) {
    setError('');
    if (target.id === release.game_id) return setError(tr('Cette version appartient déjà à ce jeu.'));
    if (!(await confirm({
      title: tr('Déplacer cette version'),
      message: tr('« {0} » ({1}) rejoindra « {2} », avec ses images, ses dates et les exemplaires des membres.', release.local_title, zoneLabel(release.zone), target.title),
      confirmLabel: tr('Déplacer'),
    }))) return;
    const { error } = await supabase.rpc('move_release', { target_release: release.id, to_game: target.id });
    if (error) return setError(errorMessage(error));
    setOpen(false);
    onMoved();
  }

  return (
    <>
      <button type="button" className="button button-small" onClick={() => { setOpen(true); setError(''); }}>{tr('Déplacer vers un autre jeu…')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Déplacer « {0} »', release.local_title)}>
        <GameSearch onSelect={move} autoFocus label={tr('Vers quel jeu ? (titre ou code produit)')} />
        {error && <p className="error" role="alert">{error}</p>}
      </Dialog>
    </>
  );
}
