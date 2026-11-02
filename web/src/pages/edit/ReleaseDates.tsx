import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { regionName } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import type { DatePrecision, Release } from '../../lib/types';
import { useRegions } from '../../lib/useRegions';
import { useConfirm } from '../../components/Confirm';
import { PsSymbol } from '../../components/PsSymbol';
import { tr } from '../../lib/i18n';

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
export const toInput = (date: string | null, precision: Precision) =>
  !date || !precision ? '' : precision === 'day' ? date : precision === 'month' ? date.slice(0, 7) : date.slice(0, 4);
export function toStored(value: string, precision: Precision): string | null {
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

export function ReleaseDates({ release, onSaved }: { release: Release; onSaved: () => void }) {
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
