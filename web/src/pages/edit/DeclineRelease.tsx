import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BOX_REGIONS, boxRegionName, editionLabel, languagesLong } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import type { Release } from '../../lib/types';
import { useRegions } from '../../lib/useRegions';
import { Dialog } from '../../components/Dialog';
import { PsSymbol } from '../../components/PsSymbol';
import { tr } from '../../lib/i18n';

// « Décliner par langue ou par pays » : crée en un clic les variantes d'une version
// (Platinum générique → Platinum française, allemande…). Rien n'est créé sans cocher :
// aucune source ne garantit qu'un jeu a eu sa Platinum dans chaque pays.
// - Par langue : quand le disque change avec la langue (FF7), une variante par
//   version standard de la zone, avec son code produit et ses langues.
// - Par pays : même disque, boîtes imprimées pour chaque pays (Crash Bash).
export function DeclineRelease({ release, siblings, onDone }: { release: Release; siblings: Release[]; onDone: () => void }) {
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
