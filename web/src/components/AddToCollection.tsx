import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CONDITIONS, zoneOrder } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { RELEASE_FIELDS } from '../lib/queries';
import type { CollectionItem, ItemCondition, ItemStatus, Release, SearchResult } from '../lib/types';
import { Dialog } from './Dialog';
import { GameSearch } from './GameSearch';
import { Cover } from './Cover';
import { ReleaseSummary } from './ReleaseSummary';
import { PsSymbol } from './PsSymbol';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Ouvrir directement sur une sortie (depuis la fiche d'un jeu)…
  initialReleaseId?: number | null;
  // …ou modifier un exemplaire existant
  editItem?: CollectionItem | null;
}

type Step = 'search' | 'release' | 'details';

export function AddToCollection({ open, onClose, onSaved, initialReleaseId, editItem }: Props) {
  const [step, setStep] = useState<Step>('search');
  const [game, setGame] = useState<SearchResult | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState('');

  // Réinitialisation à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setError('');
    setGame(null);
    setRelease(null);
    setStep('search');
    const releaseId = editItem?.release.id ?? initialReleaseId;
    if (releaseId) {
      supabase.from('release').select(`${RELEASE_FIELDS}, game(id, title)`).eq('id', releaseId).single()
        .then(({ data, error }) => {
          if (error || !data) return setError("Cette version n'existe plus.");
          setRelease(data as unknown as Release);
          setStep('details');
        });
    }
  }, [open, editItem, initialReleaseId]);

  async function chooseGame(g: SearchResult) {
    setGame(g);
    const { data, error } = await supabase.from('release').select(RELEASE_FIELDS).eq('game_id', g.id);
    if (error) return setError(errorMessage(error));
    const list = (data as unknown as Release[]).sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || a.id - b.id);
    setReleases(list);
    if (list.length === 1) {
      setRelease(list[0]);
      setStep('details');
    } else {
      setStep('release');
    }
  }

  const title = editItem ? 'Modifier cet exemplaire' : 'Ajouter un jeu à ma collection';

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {error && <p className="error">{error}</p>}

      {step === 'search' && !initialReleaseId && !editItem && (
        <>
          <GameSearch onSelect={chooseGame} autoFocus label="Quel jeu veux-tu ajouter ?" />
          <p className="muted small">
            Ton jeu n'est pas dans la base ? <Link to="/proposer" onClick={onClose}>Propose-le</Link>.
          </p>
        </>
      )}

      {step === 'release' && game && (
        <>
          <p>Quelle version de <strong>{game.title}</strong> as-tu ?</p>
          <ul className="choice-list">
            {releases.map((r) => (
              <li key={r.id}>
                <button type="button" className="choice" onClick={() => { setRelease(r); setStep('details'); }}>
                  <Cover images={r.image} title={r.local_title} size="small" />
                  <span>
                    <span className="choice-title">{r.local_title}</span>
                    <ReleaseSummary release={r} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Ta version n'est pas dans la liste ?{' '}
            <Link to={`/proposer?jeu=${game.id}`} onClick={onClose}>Propose cette version</Link>.
          </p>
          <button type="button" className="button" onClick={() => setStep('search')}><PsSymbol shape="circle" /> Retour</button>
        </>
      )}

      {step === 'details' && release && (
        <ItemForm release={release} item={editItem ?? null} onBack={editItem || initialReleaseId ? null : () => setStep(releases.length > 1 ? 'release' : 'search')}
          onSaved={() => { onSaved(); onClose(); }} />
      )}
    </Dialog>
  );
}

function ItemForm({ release, item, onBack, onSaved }: { release: Release; item: CollectionItem | null; onBack: (() => void) | null; onSaved: () => void }) {
  const [status, setStatus] = useState<ItemStatus>(item?.status ?? 'owned');
  const [condition, setCondition] = useState<ItemCondition | ''>(item?.condition ?? '');
  const [hasBox, setHasBox] = useState(item?.has_box ?? true);
  const [hasManual, setHasManual] = useState(item?.has_manual ?? true);
  const [hasMedia, setHasMedia] = useState(item?.has_media ?? true);
  const [price, setPrice] = useState(item?.purchase_price?.toString() ?? '');
  const [date, setDate] = useState(item?.purchase_date ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceValue = price.trim() === '' ? null : Number(price.replace(',', '.'));
    if (priceValue !== null && (Number.isNaN(priceValue) || priceValue < 0 || priceValue > 99999)) {
      return setError('Prix invalide.');
    }
    setSaving(true);
    setError('');
    const owned = status === 'owned';
    const values = {
      release_id: release.id,
      status,
      condition: owned && condition ? condition : null,
      has_box: owned ? hasBox : null,
      has_manual: owned ? hasManual : null,
      has_media: owned ? hasMedia : null,
      purchase_price: owned ? priceValue : null,
      purchase_date: owned && date ? date : null,
      notes: notes.trim() || null,
    };
    const { error } = item
      ? await supabase.from('collection_item').update(values).eq('id', item.id)
      : await supabase.from('collection_item').insert(values);
    setSaving(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="chosen">
        <Cover images={release.image} title={release.local_title} size="small" />
        <span>
          <span className="choice-title">{release.local_title}</span>
          <ReleaseSummary release={release} />
        </span>
      </div>

      <fieldset className="segmented">
        <legend className="field-label">Statut</legend>
        <label><input type="radio" name="status" checked={status === 'owned'} onChange={() => setStatus('owned')} /> Je l'ai</label>
        <label><input type="radio" name="status" checked={status === 'wanted'} onChange={() => setStatus('wanted')} /> Je le cherche</label>
      </fieldset>

      {status === 'owned' && (
        <>
          <label className="field">
            <span className="field-label">État</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition | '')}>
              <option value="">Non précisé</option>
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <fieldset className="checks">
            <legend className="field-label">Contenu</legend>
            <label><input type="checkbox" checked={hasBox} onChange={(e) => setHasBox(e.target.checked)} /> Boîte</label>
            <label><input type="checkbox" checked={hasManual} onChange={(e) => setHasManual(e.target.checked)} /> Notice</label>
            <label><input type="checkbox" checked={hasMedia} onChange={(e) => setHasMedia(e.target.checked)} /> Disque</label>
          </fieldset>
          <div className="row">
            <label className="field">
              <span className="field-label">Prix d'achat (€)</span>
              <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15,00" maxLength={10} />
            </label>
            <label className="field">
              <span className="field-label">Date d'achat</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </label>
          </div>
        </>
      )}

      <label className="field">
        <span className="field-label">Notes personnelles</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        {onBack && <button type="button" className="button" onClick={onBack}><PsSymbol shape="circle" /> Retour</button>}
        <button type="submit" className="button button-primary" disabled={saving}>
          <PsSymbol shape="cross" /> {saving ? 'Sauvegarde en cours… Ne retirez pas la carte mémoire' : item ? 'Enregistrer' : 'Ajouter à ma collection'}
        </button>
      </div>
    </form>
  );
}
