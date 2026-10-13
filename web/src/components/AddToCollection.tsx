import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ACQUISITIONS, CONDITIONS, TRADE_STATUSES, zoneOrder } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { RELEASE_FIELDS } from '../lib/queries';
import { standInFor } from '../lib/images';
import type { AcquisitionType, CollectionItem, ItemCondition, ItemStatus, Release, SearchResult, TradeStatus } from '../lib/types';
import { Dialog } from './Dialog';
import { GameSearch } from './GameSearch';
import { Cover } from './Cover';
import { ReleaseSummary } from './ReleaseSummary';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

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
          if (error || !data) return setError(tr("Cette version n'existe plus."));
          setRelease(data as unknown as Release);
          setStep('details');
        });
    }
  }, [open, editItem, initialReleaseId]);

  async function chooseGame(g: SearchResult) {
    setGame(g);
    const { data, error } = await supabase.from('release').select(RELEASE_FIELDS).eq('game_id', g.id);
    if (error) return setError(errorMessage(error));
    // Console par console (PS1, puis PS2…), puis zone par zone
    const list = (data as unknown as Release[]).sort((a, b) => (a.platform.launch_date ?? '').localeCompare(b.platform.launch_date ?? '')
      || zoneOrder(a.zone) - zoneOrder(b.zone) || a.id - b.id);
    setReleases(list);
    if (list.length === 1) {
      setRelease(list[0]);
      setStep('details');
    } else {
      setStep('release');
    }
  }

  const title = editItem ? tr('Modifier cet exemplaire') : tr('Ajouter un jeu à ma collection');
  // Jeu sorti sur plusieurs consoles : chaque version dit la sienne
  const multiPlatform = new Set(releases.map((r) => r.platform.id)).size > 1;

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {error && <p className="error">{error}</p>}

      {step === 'search' && !initialReleaseId && !editItem && (
        <>
          <GameSearch onSelect={chooseGame} autoFocus label={tr('Quel jeu veux-tu ajouter ?')} />
          <p className="muted small">
            {tr("Ton jeu n'est pas dans la base ? ")}<Link to="/proposer" onClick={onClose}>{tr('Propose-le')}</Link>.
          </p>
        </>
      )}

      {step === 'release' && game && (
        <>
          <p>{tr('Quelle version de ')}<strong>{game.title}</strong>{tr(' as-tu ?')}</p>
          <ul className="choice-list">
            {releases.map((r) => (
              <li key={r.id}>
                <button type="button" className="choice" onClick={() => { setRelease(r); setStep('details'); }}>
                  <Cover images={r.image} title={r.local_title} size="small" standIn={standInFor(r, releases.filter((x) => x.platform.id === r.platform.id))} />
                  <span>
                    <span className="choice-title">{r.local_title}</span>
                    <ReleaseSummary release={r} showPlatform={multiPlatform} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {tr("Ta version n'est pas dans la liste ?")}{' '}
            <Link to={`/proposer?jeu=${game.id}`} onClick={onClose}>{tr('Propose cette version')}</Link>.
          </p>
          <button type="button" className="button" onClick={() => setStep('search')}><PsSymbol shape="circle" />{tr(' Retour')}</button>
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
  const [acquisition, setAcquisition] = useState<AcquisitionType | ''>(item?.acquisition ?? '');
  const [place, setPlace] = useState(item?.purchase_place ?? '');
  const [hasSpineCard, setHasSpineCard] = useState(item?.has_spine_card ?? false);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus | ''>(item?.trade_status ?? '');
  // La spine card (bande sur la tranche) n'existe que sur les boîtes japonaises
  const spineCard = release.zone === 'NTSC-J';

  // Sous blister : forcément complet
  function chooseCondition(value: ItemCondition | '') {
    setCondition(value);
    if (value === 'sealed' || value === 'resealed') {
      setHasBox(true);
      setHasManual(true);
      setHasMedia(true);
    }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceValue = price.trim() === '' ? null : Number(price.replace(',', '.'));
    if (priceValue !== null && (Number.isNaN(priceValue) || priceValue < 0 || priceValue > 99999)) {
      return setError(tr('Prix invalide.'));
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
      acquisition: owned && acquisition ? acquisition : null,
      purchase_place: owned && place.trim() ? place.trim() : null,
      has_spine_card: owned && spineCard ? hasSpineCard : null,
      trade_status: owned && tradeStatus ? tradeStatus : null,
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
          <ReleaseSummary release={release} showPlatform />
        </span>
      </div>

      <fieldset className="segmented">
        <legend className="field-label">{tr('Statut')}</legend>
        <label><input type="radio" name="status" checked={status === 'owned'} onChange={() => setStatus('owned')} />{tr(" Je l'ai")}</label>
        <label><input type="radio" name="status" checked={status === 'wanted'} onChange={() => setStatus('wanted')} />{tr(' Je le cherche')}</label>
      </fieldset>

      {status === 'owned' && (
        <>
          <PillChoice
            legend={tr('État')}
            name="condition"
            value={condition}
            options={CONDITIONS}
            onChange={(v) => chooseCondition(v as ItemCondition | '')}
            hint={CONDITIONS.find((c) => c.value === condition)?.hint}
          />
          <fieldset className="checks">
            <legend className="field-label">{tr('Contenu')}</legend>
            <label><input type="checkbox" checked={hasBox} onChange={(e) => setHasBox(e.target.checked)} />{tr(' Boîte')}</label>
            <label><input type="checkbox" checked={hasManual} onChange={(e) => setHasManual(e.target.checked)} />{tr(' Notice')}</label>
            <label><input type="checkbox" checked={hasMedia} onChange={(e) => setHasMedia(e.target.checked)} />{tr(' Disque')}</label>
            {spineCard && (
              <label title={tr('Bande cartonnée glissée sur la tranche des boîtes japonaises')}>
                <input type="checkbox" checked={hasSpineCard} onChange={(e) => setHasSpineCard(e.target.checked)} />{tr(' Spine card')}
              </label>
            )}
          </fieldset>
          <PillChoice legend={tr('Obtenu')} name="acquisition" value={acquisition} options={ACQUISITIONS} onChange={(v) => setAcquisition(v as AcquisitionType | '')} />
          <label className="field">
            <span className="field-label">{tr('Où ?')}</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={tr('Brocante, boutique, Leboncoin, eBay…')} maxLength={80} />
          </label>
          <div className="row">
            <label className="field">
              <span className="field-label">{tr("Prix d'achat (€)")}</span>
              <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15,00" maxLength={10} />
            </label>
            <label className="field">
              <span className="field-label">{tr("Date d'achat")}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </label>
          </div>
        </>
      )}

      {status === 'owned' && (
        <PillChoice legend={tr('Cet exemplaire')} name="trade" value={tradeStatus} options={TRADE_STATUSES} emptyLabel={tr('Je le garde')}
          onChange={(v) => setTradeStatus(v as TradeStatus | '')} />
      )}

      <label className="field">
        <span className="field-label">{tr('Notes personnelles')}</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        {onBack && <button type="button" className="button" onClick={onBack}><PsSymbol shape="circle" />{tr(' Retour')}</button>}
        <button type="submit" className="button button-primary" disabled={saving}>
          <PsSymbol shape="cross" /> {saving ? tr('Sauvegarde en cours… Ne retirez pas la carte mémoire') : item ? tr('Enregistrer') : tr('Ajouter à ma collection')}
        </button>
      </div>
    </form>
  );
}

// Choix unique en pastilles (plus lisible qu'une liste déroulante) ; « Non précisé » en dernier
function PillChoice({ legend, name, value, options, onChange, hint, emptyLabel = 'Non précisé' }: {
  legend: string;
  name: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
  hint?: string;
  emptyLabel?: string;
}) {
  const all = [...options, { value: '', label: emptyLabel, hint: undefined }];
  // « Je le garde » se place en premier : c'est le cas habituel
  if (emptyLabel !== 'Non précisé') all.unshift(all.pop()!);
  return (
    <fieldset className="pill-choice">
      <legend className="field-label">{legend}</legend>
      <div className="pills">
        {all.map((o) => (
          <label key={o.value || 'none'} className={value === o.value ? 'pill active' : 'pill'} title={o.hint}>
            <input type="radio" name={name} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </fieldset>
  );
}
