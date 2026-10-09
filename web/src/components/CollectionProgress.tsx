import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CATALOG_ZONES, familyLabel, formatNumber, formatPercent, formatPrice } from '../lib/format';
import { ALL_PLATFORMS, ALL_ZONES, rememberZone, rememberedPlatform, rememberedZone } from '../lib/preferences';
import type { CollectionItem, ProgressRow, Zone } from '../lib/types';
import { MemoryBar } from './MemoryBar';

function initialZone(): string {
  const zone = rememberedZone();
  return zone === ALL_ZONES || CATALOG_ZONES.some((z) => z.value === zone) ? zone : ALL_ZONES;
}

// En haut de « Ma collection » : jeux possédés sur jeux existants (par zone et
// par genre), et quelques chiffres sur les exemplaires de la même sélection
export function CollectionProgress({ items }: { items: CollectionItem[] }) {
  const platform = rememberedPlatform();
  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const [zone, setZone] = useState(initialZone);
  const zoneCode = zone === ALL_ZONES ? null : (zone as Zone);
  const [rows, setRows] = useState<ProgressRow[]>([]);

  // Relue quand la collection change (ajout, retrait…)
  useEffect(() => {
    let active = true;
    supabase.rpc('collection_progress', { platform_code: platformCode, zone_code: zoneCode })
      .then(({ data }) => { if (active) setRows((data as ProgressRow[]) ?? []); });
    return () => { active = false; };
  }, [platformCode, zoneCode, items]);

  function choose(value: string) {
    rememberZone(value);
    setZone(value);
  }

  const main = rows.find((r) => r.scope === 'zone' && r.code === (zoneCode ?? 'all'));
  const known = rows.find((r) => r.scope === 'family' && r.code === 'known');
  const families = rows
    .filter((r) => r.scope === 'family' && r.code !== 'known' && r.total > 0)
    .sort((a, b) => b.total - a.total || familyLabel(a.code).localeCompare(familyLabel(b.code), 'fr'));
  const zoneInfo = CATALOG_ZONES.find((z) => z.value === zoneCode);

  // Exemplaires de la même sélection (console et zone)
  const owned = items.filter((i) => i.status === 'owned'
    && (!platformCode || i.release.platform.short_name === platformCode)
    && (!zoneCode || i.release.zone === zoneCode));
  const complete = owned.filter((i) => i.has_box && i.has_manual && i.has_media).length;
  const sealed = owned.filter((i) => i.condition === 'sealed').length;
  const spent = owned.reduce((sum, i) => sum + (i.purchase_price ?? 0), 0);

  const catalogLink = (filters: Record<string, string>) => `/catalogue?${new URLSearchParams({ zone, ...filters })}`;

  return (
    <section className="panel progress-panel" aria-labelledby="progress-title">
      <div className="progress-head">
        <h2 id="progress-title">Progression</h2>
        <div className="zone-switch" role="group" aria-label="Région">
          {[...CATALOG_ZONES.map((z) => ({ value: z.value as string, label: z.short })), { value: ALL_ZONES, label: 'Toutes' }].map((z) => (
            <button key={z.value} type="button" className={zone === z.value ? 'zone-option active' : 'zone-option'} aria-pressed={zone === z.value} onClick={() => choose(z.value)}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {main && (
        <div className="progress-main">
          <p className="progress-figure">
            <strong>{formatNumber(main.owned)}</strong> / {formatNumber(main.total)} jeux{zoneInfo ? ` ${zoneInfo.short}` : ''}
            <span className="muted"> · {formatPercent(main.owned, main.total)}</span>
          </p>
          <MemoryBar owned={main.owned} total={main.total} label="Jeux possédés" />
          <p className="small">
            <Link to={catalogLink({ possession: 'missing' })}>Voir ceux qui me manquent</Link>
          </p>
        </div>
      )}

      <dl className="progress-stats">
        <div><dt>Exemplaires</dt><dd>{formatNumber(owned.length)}</dd></div>
        <div><dt>Complets</dt><dd>{formatNumber(complete)}</dd></div>
        <div><dt>Sous blister</dt><dd>{formatNumber(sealed)}</dd></div>
        <div><dt>Recherchés</dt><dd>{formatNumber(main?.wanted ?? 0)}</dd></div>
        <div><dt>Dépensé</dt><dd>{formatPrice(spent)}</dd></div>
      </dl>

      {families.length > 0 && (
        <>
          <h3>Par genre</h3>
          <ul className="family-list">
            {families.map((f) => (
              <li key={f.code}>
                <Link to={catalogLink({ genre: f.code })} className="family-row">
                  <span className="family-name">{familyLabel(f.code)}</span>
                  <span className="family-count">{formatNumber(f.owned)} / {formatNumber(f.total)}</span>
                  <MemoryBar size="small" owned={f.owned} total={f.total} label={`${familyLabel(f.code)} : jeux possédés`} />
                </Link>
              </li>
            ))}
          </ul>
          {known && main && (
            <p className="hint">
              Genre connu pour {formatNumber(known.total)} jeux sur {formatNumber(main.total)} : les totaux par genre grandiront à mesure que la base se complète.
            </p>
          )}
        </>
      )}
    </section>
  );
}
