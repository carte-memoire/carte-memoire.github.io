import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GAME_FIELDS } from '../lib/queries';
import { countryName, EDITION_TYPES, familyLabel, gamePath, LANGUAGES, slugify, ZONES, zoneLabel, zoneOrder } from '../lib/format';
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

const IMAGE_TYPES: { value: ImageType; label: string }[] = [
  { value: 'front', label: 'Recto' },
  { value: 'back', label: 'Verso' },
  { value: 'spine', label: 'Tranche' },
  { value: 'disc', label: 'Disque' },
  { value: 'manual', label: 'Notice' },
  { value: 'screenshot', label: "Capture d'écran" },
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
        <h1>Jeu supprimé</h1>
        <p className="success">« {deleted} » a été supprimé du catalogue. La suppression est notée dans le journal.</p>
        <p><Link to="/" className="button"><PsSymbol shape="circle" /> Retour à la recherche</Link></p>
      </section>
    );
  }
  if (missing) return <section className="panel"><h1>Jeu introuvable</h1></section>;
  if (!game) return <p className="loading">Lecture de la carte mémoire…</p>;

  const releases = [...game.release].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || a.id - b.id);

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Modifier « {game.title} »</h1>
        <Link to={gamePath(game)} className="button"><PsSymbol shape="circle" /> Retour à la fiche</Link>
      </div>
      {aal.current !== 'aal2' && (
        <p className="warning">
          Les modifications du catalogue demandent la double authentification.{' '}
          <Link to="/compte">Active-la ou valide-la dans « Mon compte »</Link>.
        </p>
      )}
      <GameForm game={game} onSaved={load} />
      <GenreEditor key={`${game.game_genre.map((g) => g.genre.id).join()}-${game.genres_reviewed}`} game={game} onSaved={load} />
      <section className="panel stack">
        <h2>Développeurs</h2>
        <StudioListEditor
          title="Développeurs du jeu"
          studios={game.game_developer.map((d) => d.company)}
          onAdd={(companyId) => supabase.from('game_developer').insert({ game_id: game.id, company_id: companyId })}
          onRemove={(companyId) => supabase.from('game_developer').delete().eq('game_id', game.id).eq('company_id', companyId)}
          onSaved={load}
        />
      </section>
      <OriginEditor key={game.game_developer.map((d) => d.company.id).join()} gameId={game.id} onSaved={load} />
      <h2>Versions</h2>
      {releases.map((r) => (
        <ReleaseEditor key={r.id} release={r} onSaved={load} canDelete={releases.length > 1} possibleDuplicate={isEmptyTwin(r, releases)} />
      ))}
      <section className="panel stack">
        <h2>Historique</h2>
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
  const why = studios.length === 0 ? 'aucun studio connu'
    : countries.includes(null) ? "pays d'un studio inconnu"
    : 'studios de plusieurs pays';

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const { error } = await supabase.from('game').update({ origin_country: choice || null }).eq('id', gameId);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage('Origine enregistrée.');
    await load();
    onSaved();
  }

  return (
    <form onSubmit={save} className="form panel">
      <h2>Origine</h2>
      <p className="muted">
        Le pays du studio de développement. Avec la famille RPG, « Japon » range le jeu parmi les JRPG ; un autre pays, parmi les RPG occidentaux.
      </p>
      <p className="small">
        Studios : {studios.length ? studios.map((c) => `${c.name} (${c.country ? countryName(c.country) : 'pays inconnu'})`).join(', ') : 'aucun'}.
        {' '}Origine actuelle : <strong>{info.origin ? countryName(info.origin) : 'inconnue'}</strong>.
      </p>
      <label className="field">
        <span className="field-label">Origine</span>
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{deduced ? `Déduite des studios : ${countryName(deduced)}` : `Déduite des studios : inconnue (${why})`}</option>
          {ORIGIN_COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success">{message}</p>}
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={choice === (info.origin_country ?? '')}><PsSymbol shape="cross" /> Enregistrer</button>
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
    if (!title.trim()) return setError('Le titre est obligatoire.');
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
    setMessage('Jeu enregistré.');
    onSaved();
  }

  return (
    <form onSubmit={save} className="form panel">
      <h2>Le jeu</h2>
      <label className="field">
        <span className="field-label">Titre de référence</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <label className="field">
        <span className="field-label">Résumé</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={6} maxLength={3000} />
        {game.summary_source && (
          <span className="hint">
            Texte actuel extrait de <a href={game.summary_source} target="_blank" rel="noopener noreferrer">Wikipédia</a>.
            Le modifier en fait un texte de la communauté : le lien vers Wikipédia sera retiré.
          </span>
        )}
      </label>
      <div className="row">
        <label className="field">
          <span className="field-label">Première sortie (toutes plateformes)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Précision</span>
          <select value={precision} onChange={(e) => setPrecision(e.target.value as DatePrecision)}>
            <option value="day">Jour exact</option>
            <option value="month">Mois</option>
            <option value="year">Année seulement</option>
          </select>
        </label>
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary"><PsSymbol shape="cross" /> Enregistrer le jeu</button>
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
    .map((g) => ({ value: g.id, label: g.name, detail: g.families.length ? g.families.map(familyLabel).join(' + ') : 'thème' }));

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
      setMessage("Genres enregistrés. Le jeu est marqué « revu » : les imports automatiques n'y toucheront plus.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form panel">
      <h2>Genres</h2>
      <p className="hint">
        Familles : {families.length ? families.map(familyLabel).join(', ') : 'aucune'}.{' '}
        {game.genres_reviewed ? 'Genres déjà revus par un modérateur.' : "Pas encore revus : enregistrer (même sans changement) confirme qu'ils sont justes."}
      </p>
      <ul className="genre-chips">
        {selected.map((g) => (
          <li key={g.id} className={g.families.length ? 'genre-chip' : 'genre-chip is-theme'}>
            {g.name}
            <span className="muted small">{g.families.length ? g.families.map(familyLabel).join(' + ') : 'thème'}</span>
            <button type="button" className="icon-button" aria-label={`Retirer ${g.name}`} onClick={() => setSelected(selected.filter((x) => x.id !== g.id))}>✕</button>
          </li>
        ))}
        {selected.length === 0 && <li className="muted">Aucun genre.</li>}
      </ul>
      <Combobox
        label="Ajouter un genre"
        placeholder="Tape pour chercher : plates-formes, stratégie, RPG…"
        options={options}
        emptyText="Aucun genre ne correspond"
        onSelect={(o) => { const g = all.find((x) => x.id === o.value); if (g) setSelected([...selected, g]); }}
      />
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="button button-primary" onClick={save} disabled={saving || (!changed && game.genres_reviewed)}>
        <PsSymbol shape="cross" /> {changed ? 'Enregistrer les genres' : 'Confirmer : les genres sont justes'}
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
    if (other.id === game.id) return setError('Choisis un autre jeu que celui-ci.');
    const { data, error } = await supabase.from('game')
      .select('id, title, wikidata_id, release(id, zone, product_code, image(id))').in('id', [game.id, other.id]);
    if (error || !data || data.length !== 2) return setError(errorMessage(error) || 'Jeu introuvable.');
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
      <h2>Fusionner avec un autre jeu</h2>
      <p className="muted">
        Pour un doublon : les versions de la fiche supprimée (et donc les exemplaires des membres), ses genres, ses
        développeurs et ses propositions passent sur la fiche gardée. La fusion est définitive.
      </p>
      <div>
        <button type="button" className="button" onClick={() => { setOpen(true); setPair(null); setError(''); }}>
          <PsSymbol shape="square" /> Fusionner avec…
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Fusionner « ${game.title} »`} wide>
        {!pair && (
          <>
            <GameSearch onSelect={choose} autoFocus label="Avec quel jeu ? (titre ou code produit)" />
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
        {pair && (
          <form onSubmit={merge} className="form">
            <fieldset className="merge-choice">
              <legend className="field-label">Quelle fiche garder ?</legend>
              {pair.map((g) => (
                <label key={g.id} className={keepId === g.id ? 'merge-option active' : 'merge-option'}>
                  <input type="radio" name="keep" checked={keepId === g.id} onChange={() => setKeepId(g.id)} />
                  <span>
                    <strong>{g.title}</strong>{g.id === game.id && <span className="muted"> (cette fiche)</span>}
                    <span className="muted small">
                      {' '}· n° {g.id} · {g.release.length} version{g.release.length > 1 ? 's' : ''}
                      {' '}({[...new Set(g.release.map((r) => r.zone ?? '?'))].join(', ')})
                      {g.wikidata_id ? ` · Wikidata ${g.wikidata_id}` : ' · sans Wikidata'}
                    </span>
                    <span className="muted small"> {g.release.map((r) => r.product_code).filter(Boolean).join(', ')}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {conflict && (
              <label className="warning switch">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                Ces deux fiches sont reliées à des fiches Wikidata différentes : ce sont peut-être deux jeux distincts.
                Coche pour confirmer qu'il s'agit bien du même jeu.
              </label>
            )}
            <p className="warning">
              La fiche « {pair.find((g) => g.id !== keepId)?.title} » (n° {pair.find((g) => g.id !== keepId)?.id}) disparaîtra :
              ses versions rejoignent « {pair.find((g) => g.id === keepId)?.title} ».
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="button" onClick={() => setPair(null)}><PsSymbol shape="circle" /> Autre jeu</button>
              <button type="submit" className="button button-danger" disabled={busy || Boolean(conflict && !force)}>
                {busy ? 'Fusion…' : 'Fusionner'}
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
      <h2>Zone dangereuse</h2>
      <p className="muted">
        Supprimer ce jeu efface aussi ses {game.release.length} version{game.release.length > 1 ? 's' : ''} et {images} image{images > 1 ? 's' : ''}.
        C'est impossible si un membre l'a dans sa collection : pour un doublon, utilise plutôt la fusion (Modération → Doublons).
      </p>
      <button type="button" className="button button-danger" onClick={() => { setOpen(true); setTyped(''); setError(''); }}>Supprimer ce jeu…</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Supprimer ce jeu">
        <form onSubmit={remove} className="form">
          <p className="warning">
            Suppression <strong>définitive</strong> de « {game.title} », de ses versions, dates, images et genres.
            Elle sera notée dans le journal des suppressions.
          </p>
          <label className="field">
            <span className="field-label">Motif (facultatif)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Jeu inexistant, doublon sans exemplaire…" />
          </label>
          <label className="field">
            <span className="field-label">Pour confirmer, tape le titre exact : {game.title}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="button" onClick={() => setOpen(false)}><PsSymbol shape="circle" /> Annuler</button>
            <button type="submit" className="button button-danger" disabled={busy || typed.trim() !== game.title.trim()}>
              {busy ? 'Suppression…' : 'Supprimer définitivement'}
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

function ReleaseEditor({ release, onSaved, canDelete, possibleDuplicate }: { release: Release; onSaved: () => void; canDelete: boolean; possibleDuplicate: Release | null }) {
  const { session } = useAuth();
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
    if (!localTitle.trim()) return setError('Le titre est obligatoire.');
    if (code && !/^[A-Z0-9][A-Z0-9 ._-]{2,19}$/.test(code)) return setError('Code produit invalide (exemple : SCES-00867).');
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
    }).eq('id', release.id);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage('Version enregistrée.');
    onSaved();
  }

  async function uploadImage(file: File | undefined | null) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await uploadReleaseImage(release.id, imageType, file, session!.user.id);
      setMessage(`Image ajoutée (${IMAGE_TYPES.find((t) => t.value === imageType)?.label.toLowerCase()}).`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeRelease() {
    if (!(await confirm({
      title: 'Supprimer cette version',
      message: `« ${release.local_title} » (${zoneLabel(release.zone)}) sera définitivement supprimée, avec ses ${release.image.length} image(s). C'est impossible si un membre l'a dans sa collection.`,
      confirmLabel: 'Supprimer',
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
    if (error || !data) return setError(errorMessage(error) || 'Téléchargement impossible.');
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
    if (!(await confirm({ title: "Supprimer l'image", message: 'Cette image sera définitivement retirée du site.', confirmLabel: 'Supprimer', danger: true }))) return;
    const { error } = await supabase.from('image').delete().eq('id', imageId);
    if (error) return setError(errorMessage(error));
    await supabase.storage.from('covers').remove([path]);
    onSaved();
  }

  return (
    <div className="panel release-editor">
      <h3>{release.local_title} <span className="muted small">· {zoneLabel(release.zone)} · n° {release.id}</span></h3>
      {possibleDuplicate && (
        <p className="warning">
          Doublon possible de « {possibleDuplicate.local_title} » (n° {possibleDuplicate.id}, {possibleDuplicate.product_code}) : même zone,
          même édition, mais sans code produit.
          {possibleDuplicate.local_title.trim().toLowerCase() !== release.local_title.trim().toLowerCase() && ' Le titre diffère : ce peut aussi être une version nationale (française, allemande…).'}
          {' '}Vérifie, puis supprime-la si c'est un doublon.
        </p>
      )}

      {/* Clic sur cette zone, puis Ctrl+V : colle une image copiée sur un autre site ;
          on peut aussi y déposer un fichier. Elle prend le type choisi dans la liste. */}
      <div
        className="images-editor paste-target"
        tabIndex={0}
        aria-label={`Images de ${release.local_title} : clique ici puis colle une image (Ctrl+V), ou dépose un fichier`}
        onPaste={(e) => {
          const file = imageFromClipboard(e.clipboardData);
          if (file) { e.preventDefault(); uploadImage(file); }
          else setError("Le presse-papiers ne contient pas d'image : sur l'autre site, fais un clic droit sur l'image puis « Copier l'image ».");
        }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { const file = imageFromClipboard(e.dataTransfer); if (file) { e.preventDefault(); uploadImage(file); } }}
      >
        {release.image.map((img) => (
          <figure key={img.id} className="image-tile">
            <Cover images={[{ ...img, type: 'front' }]} title={release.local_title} size="small" />
            <figcaption>
              {IMAGE_TYPES.find((t) => t.value === img.type)?.label}
              <button type="button" className="link-button" onClick={() => downloadImage(img.path, img.type)}>Télécharger</button>
              <button type="button" className="link-button danger" onClick={() => removeImage(img.id, img.path)}>Supprimer</button>
            </figcaption>
          </figure>
        ))}
        <div className="image-upload">
          <select value={imageType} onChange={(e) => setImageType(e.target.value as ImageType)} aria-label="Type d'image">
            {IMAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="button button-small">
            {busy ? 'Envoi…' : <><PsSymbol shape="square" /> Ajouter une image</>}
            <input type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" disabled={busy}
              onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="muted small">ou clique dans ce cadre et colle (Ctrl+V)</span>
        </div>
      </div>

      <ReleaseDates release={release} onSaved={onSaved} />
      <StudioListEditor
        title="Éditeurs de cette version"
        studios={release.release_company.filter((c) => c.role === 'publisher').map((c) => c.company)}
        onAdd={(companyId) => supabase.from('release_company').insert({ release_id: release.id, company_id: companyId, role: 'publisher' })}
        onRemove={(companyId) => supabase.from('release_company').delete().eq('release_id', release.id).eq('company_id', companyId).eq('role', 'publisher')}
        onSaved={onSaved}
      />

      <form onSubmit={save} className="form">
        <div className="row">
          <label className="field">
            <span className="field-label">Titre sur la boîte</span>
            <input value={localTitle} onChange={(e) => setLocalTitle(e.target.value)} maxLength={200} required />
          </label>
          <label className="field">
            <span className="field-label">Zone</span>
            <select value={zone} onChange={(e) => setZone(e.target.value as Zone | '')}>
              <option value="">À compléter</option>
              {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span className="field-label">Code produit</span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="SCES-00867" maxLength={20} />
          </label>
          <label className="field">
            <span className="field-label">Édition</span>
            <select value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)}>
              {EDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Nom de l'édition</span>
            <input value={editionName} onChange={(e) => setEditionName(e.target.value)} placeholder="Platinum" maxLength={60} />
          </label>
          <label className="field field-narrow">
            <span className="field-label">Disques</span>
            <input type="number" min={1} max={20} value={mediaCount} onChange={(e) => setMediaCount(e.target.value)} />
          </label>
        </div>
        {release.platform.spec_fields && release.platform.spec_fields.length > 0 && (
          <SpecsEditor fields={release.platform.spec_fields} value={specs} onChange={setSpecs} />
        )}
        <fieldset className="checks">
          <legend className="field-label">Langues</legend>
          {LANGUAGES.map((l) => (
            <label key={l.value}>
              <input type="checkbox" checked={languages.includes(l.value)}
                onChange={(e) => setLanguages(e.target.checked ? [...languages, l.value] : languages.filter((x) => x !== l.value))} />
              {l.label}
            </label>
          ))}
        </fieldset>
        {message && <p className="success">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="button button-primary"><PsSymbol shape="cross" /> Enregistrer cette version</button>
          {canDelete && <MoveRelease release={release} onMoved={onSaved} />}
          {canDelete && <button type="button" className="button button-small button-danger" onClick={removeRelease}>Supprimer cette version</button>}
        </div>
      </form>
    </div>
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
  { value: 'day', label: 'Jour' }, { value: 'month', label: 'Mois' }, { value: 'year', label: 'Année' }, { value: '', label: 'Inconnue' },
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
      <select value={precision} onChange={(e) => choose(e.target.value as Precision)} aria-label={`Précision de la date (${label})`}>
        {PRECISIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {precision === 'day' && <input type="date" value={value} onChange={(e) => onValue(e.target.value)} aria-label={`Date (${label})`} />}
      {precision === 'month' && <input type="month" value={value} onChange={(e) => onValue(e.target.value)} aria-label={`Mois (${label})`} />}
      {precision === 'year' && <input type="number" min={1970} max={2100} value={value} onChange={(e) => onValue(e.target.value)} aria-label={`Année (${label})`} />}
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
    if (!regionId) return setError('Choisis un pays ou une zone.');
    if (precision && !date) return setError('Date incomplète ou invalide.');
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
      <h4>Dates de sortie</h4>
      {rows.length === 0 && <p className="muted small">Aucune date pour l'instant.</p>}
      <ul className="plain-list release-dates-list">
        {rows.map((rr) => (
          <DateRow key={`${rr.region.id}-${rr.release_date}-${rr.date_precision}`} releaseId={release.id} row={rr} onSaved={onSaved} onError={setError} />
        ))}
      </ul>
      <form onSubmit={add} className="release-date-row">
        <select value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="Pays ou zone de la nouvelle date">
          <option value="">Ajouter un pays ou une zone…</option>
          {(['zone', 'country', 'world'] as const).map((type) => (
            <optgroup key={type} label={type === 'zone' ? 'Zones' : type === 'country' ? 'Pays' : 'Monde'}>
              {regions.filter((r) => r.type === type && !used.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </optgroup>
          ))}
        </select>
        <DateFields value={value} precision={precision} onValue={setValue} onPrecision={setPrecision} label="nouvelle date" />
        <button type="submit" className="button button-small" disabled={!regionId}><PsSymbol shape="square" /> Ajouter</button>
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
    if (precision && !date) return onError('Date incomplète ou invalide.');
    const { error } = await supabase.from('release_region').update({ release_date: date, date_precision: precision || null })
      .eq('release_id', releaseId).eq('region_id', row.region.id!);
    if (error) return onError(errorMessage(error));
    onError('');
    onSaved();
  }

  async function remove() {
    if (!(await confirm({ title: 'Retirer cette date', message: `La sortie « ${row.region.name} » sera retirée de cette version.`, confirmLabel: 'Retirer', danger: true }))) return;
    const { error } = await supabase.from('release_region').delete().eq('release_id', releaseId).eq('region_id', row.region.id!);
    if (error) return onError(errorMessage(error));
    onSaved();
  }

  return (
    <li className="release-date-row">
      <span className="release-date-region">{row.region.name}</span>
      <DateFields value={value} precision={precision} onValue={setValue} onPrecision={setPrecision} label={row.region.name} />
      <button type="button" className="button button-small" disabled={!changed} onClick={save}>Enregistrer</button>
      <button type="button" className="link-button danger" onClick={remove}>Retirer</button>
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
      <legend className="field-label">Caractéristiques</legend>
      <div className="row">
        {fields.filter((f) => f.type !== 'multi_choice').map((f) => (
          <label key={f.key} className="field">
            <span className="field-label">{f.label}</span>
            {f.type === 'integer' && (
              <input type="number" min={f.min} max={f.max} value={value[f.key] === undefined ? '' : String(value[f.key])}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))} placeholder="Non précisé" />
            )}
            {f.type === 'boolean' && (
              <select value={value[f.key] === true ? 'yes' : value[f.key] === false ? 'no' : ''}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : e.target.value === 'yes')}>
                <option value="">Non précisé</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            )}
            {f.type === 'choice' && (
              <select value={typeof value[f.key] === 'string' ? (value[f.key] as string) : ''} onChange={(e) => set(f.key, e.target.value || undefined)}>
                <option value="">Non précisé</option>
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
    if (target.id === release.game_id) return setError('Cette version appartient déjà à ce jeu.');
    if (!(await confirm({
      title: 'Déplacer cette version',
      message: `« ${release.local_title} » (${zoneLabel(release.zone)}) rejoindra « ${target.title} », avec ses images, ses dates et les exemplaires des membres.`,
      confirmLabel: 'Déplacer',
    }))) return;
    const { error } = await supabase.rpc('move_release', { target_release: release.id, to_game: target.id });
    if (error) return setError(errorMessage(error));
    setOpen(false);
    onMoved();
  }

  return (
    <>
      <button type="button" className="button button-small" onClick={() => { setOpen(true); setError(''); }}>Déplacer vers un autre jeu…</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Déplacer « ${release.local_title} »`}>
        <GameSearch onSelect={move} autoFocus label="Vers quel jeu ? (titre ou code produit)" />
        {error && <p className="error" role="alert">{error}</p>}
      </Dialog>
    </>
  );
}
