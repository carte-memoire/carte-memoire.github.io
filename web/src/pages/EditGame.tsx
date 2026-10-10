import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GAME_FIELDS } from '../lib/queries';
import { EDITION_TYPES, FAMILIES, familyLabel, gamePath, LANGUAGES, ZONES, zoneLabel, zoneOrder } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ACCEPT_ATTRIBUTE, prepareCover } from '../lib/images';
import type { DatePrecision, EditionType, Game, GenreInfo, ImageType, Release, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
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

  const load = useCallback(async () => {
    const { data } = await supabase.from('game').select(GAME_FIELDS).eq('id', gameId).maybeSingle();
    if (!data) return setMissing(true);
    setGame(data as unknown as Game);
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

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
      <h2>Versions</h2>
      {releases.map((r) => <ReleaseEditor key={r.id} release={r} onSaved={load} />)}
    </section>
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
  // Liste d'ajout : par famille principale, puis les thèmes
  const groups = [
    ...FAMILIES.map((f) => ({ label: f.label, genres: all.filter((g) => g.families[0] === f.value && !chosen.has(g.id)) })),
    { label: 'Thèmes (sans famille)', genres: all.filter((g) => g.families.length === 0 && !chosen.has(g.id)) },
  ].filter((group) => group.genres.length > 0);

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
      <label className="field">
        <span className="field-label">Ajouter un genre</span>
        <select value="" onChange={(e) => { const g = all.find((x) => x.id === Number(e.target.value)); if (g) setSelected([...selected, g]); }}>
          <option value="">Choisir…</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.genres.map((g) => <option key={g.id} value={g.id}>{g.name}{g.families.length > 1 ? ` (${g.families.map(familyLabel).join(' + ')})` : ''}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="button button-primary" onClick={save} disabled={saving || (!changed && game.genres_reviewed)}>
        <PsSymbol shape="cross" /> {changed ? 'Enregistrer les genres' : 'Confirmer : les genres sont justes'}
      </button>
    </section>
  );
}

function ReleaseEditor({ release, onSaved }: { release: Release; onSaved: () => void }) {
  const { session } = useAuth();
  const confirm = useConfirm();
  const [localTitle, setLocalTitle] = useState(release.local_title);
  const [zone, setZone] = useState<Zone | ''>(release.zone ?? '');
  const [productCode, setProductCode] = useState(release.product_code ?? '');
  const [editionType, setEditionType] = useState<EditionType>(release.edition_type);
  const [editionName, setEditionName] = useState(release.edition_name ?? '');
  const [mediaCount, setMediaCount] = useState(String(release.media_count ?? 1));
  const [languages, setLanguages] = useState<string[]>(release.languages);
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
    }).eq('id', release.id);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage('Version enregistrée.');
    onSaved();
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    const path = `releases/${release.id}/${crypto.randomUUID()}.webp`;
    try {
      const blob = await prepareCover(file);
      const { error: uploadError } = await supabase.storage.from('covers').upload(path, blob, { contentType: 'image/webp', upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase.from('image').insert({ release_id: release.id, type: imageType, path, uploaded_by: session!.user.id });
      if (rowError) {
        await supabase.storage.from('covers').remove([path]);
        throw rowError;
      }
      setMessage('Image ajoutée.');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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

      <div className="images-editor">
        {release.image.map((img) => (
          <figure key={img.id} className="image-tile">
            <Cover images={[{ ...img, type: 'front' }]} title={release.local_title} size="small" />
            <figcaption>
              {IMAGE_TYPES.find((t) => t.value === img.type)?.label}
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
        </div>
      </div>

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
        <button type="submit" className="button button-primary"><PsSymbol shape="cross" /> Enregistrer cette version</button>
      </form>
    </div>
  );
}
