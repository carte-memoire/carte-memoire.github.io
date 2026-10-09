import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GAME_FIELDS } from '../lib/queries';
import { EDITION_TYPES, gamePath, LANGUAGES, ZONES, zoneLabel, zoneOrder } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ACCEPT_ATTRIBUTE, prepareCover } from '../lib/images';
import type { DatePrecision, EditionType, Game, ImageType, Release, Zone } from '../lib/types';
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
    const { error } = await supabase.from('game').update({
      title: title.trim(),
      summary: summary.trim() || null,
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
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} maxLength={3000} />
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
    if (code && !/^[A-Z0-9][A-Z0-9 ._-]{2,19}$/.test(code)) return setError('Code produit invalide (exemple : SLES-00868).');
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
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="SLES-00868" maxLength={20} />
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
