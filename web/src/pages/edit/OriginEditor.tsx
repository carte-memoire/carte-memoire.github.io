import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { countryName } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { tr } from '../../lib/i18n';

// Pays proposés pour l'origine : le Japon d'abord, puis les autres par ordre alphabétique
const ORIGIN_COUNTRIES = ['JP', ...['US', 'GB', 'FR', 'DE', 'CA', 'AU', 'KR', 'TW', 'CN', 'HK', 'ES', 'IT', 'NL', 'BE', 'SE', 'DK', 'NO', 'FI',
  'AT', 'CH', 'CZ', 'HU', 'PL', 'RU', 'TR', 'IL', 'BR', 'NZ', 'IE'].sort((a, b) => countryName(a).localeCompare(countryName(b), 'fr'))];

interface OriginInfo {
  origin_country: string | null;
  origin: string | null;
  game_developer: { company: { name: string; country: string | null } }[];
  release: { zone: string | null; release_region: { region: { code: string } }[] }[];
}

// Origine du jeu (pays du studio) : déduite des studios s'ils sont tous du même pays connu,
// sinon le Japon pour un jeu sorti seulement au Japon (public.origin), sinon à choisir ici
// (coproduction, studio inconnu, ou cas particulier). Avec la famille
// RPG, le Japon range le jeu parmi les JRPG.
export function OriginEditor({ gameId, onSaved }: { gameId: number; onSaved: () => void }) {
  const [info, setInfo] = useState<OriginInfo | null>(null);
  const [choice, setChoice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('game').select('origin_country, origin, game_developer(company(name, country)), release(zone, release_region(region(code)))').eq('id', gameId).maybeSingle();
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
  // Sans studios d'un même pays connu : un jeu sorti seulement au Japon (toutes ses versions
  // japonaises, aucun pays de sortie hors du Japon) est japonais d'office
  const japanOnly = info.release.length > 0 && info.release.every((r) => r.zone === 'NTSC-J' && r.release_region.every((rr) => rr.region.code === 'JP'));

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
          <option value="">{deduced ? tr('Déduite des studios : {0}', countryName(deduced)) : japanOnly ? tr('Automatique : Japon (sorti seulement au Japon)') : tr('Déduite des studios : inconnue ({0})', why)}</option>
          {ORIGIN_COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success">{message}</p>}
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={choice === (info.origin_country ?? '')}>{tr('Enregistrer')}</button>
      </div>
    </form>
  );
}
