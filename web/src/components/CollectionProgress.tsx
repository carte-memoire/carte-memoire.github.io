import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  CATALOG_ZONES, ORIGINS, familyOriginLabel, formatNumber, formatPercent, formatPrice, originParam, type Origin,
} from '../lib/format';
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
  // Genres d'une seule origine (studios japonais : les RPG deviennent les JRPG)
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [originRows, setOriginRows] = useState<ProgressRow[]>([]);

  // Relue quand la collection change (ajout, retrait…)
  useEffect(() => {
    let active = true;
    supabase.rpc('collection_progress', { platform_code: platformCode, zone_code: zoneCode })
      .then(({ data }) => { if (active) setRows((data as ProgressRow[]) ?? []); });
    return () => { active = false; };
  }, [platformCode, zoneCode, items]);

  useEffect(() => {
    if (!origin) return setOriginRows([]);
    let active = true;
    supabase.rpc('collection_progress', { platform_code: platformCode, zone_code: zoneCode, origin_filter: origin })
      .then(({ data }) => { if (active) setOriginRows((data as ProgressRow[]) ?? []); });
    return () => { active = false; };
  }, [platformCode, zoneCode, origin, items]);

  function choose(value: string) {
    rememberZone(value);
    setZone(value);
  }

  const main = rows.find((r) => r.scope === 'zone' && r.code === (zoneCode ?? 'all'));
  const known = rows.find((r) => r.scope === 'family' && r.code === 'known');
  const families = (origin ? originRows : rows)
    .filter((r) => r.scope === 'family' && r.code !== 'known' && r.total > 0)
    .sort((a, b) => b.total - a.total || familyOriginLabel(a.code, origin).localeCompare(familyOriginLabel(b.code, origin), 'fr'));
  const unknownOrigin = rows.find((r) => r.scope === 'origin' && r.code === 'unknown');
  const zoneInfo = CATALOG_ZONES.find((z) => z.value === zoneCode);

  // Exemplaires de la même sélection (console et zone)
  const owned = items.filter((i) => i.status === 'owned'
    && (!platformCode || i.release.platform.short_name === platformCode)
    && (!zoneCode || i.release.zone === zoneCode));
  const complete = owned.filter((i) => i.has_box && i.has_manual && i.has_media).length;
  const sealed = owned.filter((i) => i.condition === 'sealed').length;
  const spent = owned.reduce((sum, i) => sum + (i.purchase_price ?? 0), 0);
  const offered = owned.filter((i) => i.trade_status).length;

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
        <div><dt>Neufs sous blister</dt><dd>{formatNumber(sealed)}</dd></div>
        <div><dt>Recherchés</dt><dd>{formatNumber(main?.wanted ?? 0)}</dd></div>
        <div><dt>À échanger ou vendre</dt><dd>{formatNumber(offered)}</dd></div>
        <div><dt>Dépensé</dt><dd>{formatPrice(spent)}</dd></div>
      </dl>

      {(families.length > 0 || origin) && (
        <>
          <div className="progress-head">
            <h3>Par genre</h3>
            <div className="zone-switch" role="group" aria-label="Origine du studio">
              {[{ value: null, label: 'Toutes origines' }, ...ORIGINS.map((o) => ({ value: o.value, label: o.label }))].map((o) => (
                <button key={o.label} type="button" className={origin === o.value ? 'zone-option active' : 'zone-option'} aria-pressed={origin === o.value} onClick={() => setOrigin(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <ul className="family-list">
            {families.map((f) => (
              <li key={f.code}>
                <Link to={catalogLink({ genre: f.code, ...(origin ? { origine: originParam(origin)! } : {}) })} className="family-row">
                  <span className="family-name">{familyOriginLabel(f.code, origin)}</span>
                  <span className="family-count">{formatNumber(f.owned)} / {formatNumber(f.total)}</span>
                  <MemoryBar size="small" owned={f.owned} total={f.total} label={`${familyOriginLabel(f.code, origin)} : jeux possédés`} />
                </Link>
              </li>
            ))}
          </ul>
          {known && main && !origin && (
            <p className="hint">
              Genre connu pour {formatNumber(known.total)} jeux sur {formatNumber(main.total)} : les totaux par genre grandiront à mesure que la base se complète.
            </p>
          )}
          {origin && unknownOrigin && main && (
            <p className="hint">
              Origine du studio connue pour {formatNumber(main.total - unknownOrigin.total)} jeux sur {formatNumber(main.total)} : elle se déduit
              du pays des studios et se complète au fil des fiches.
            </p>
          )}
        </>
      )}
    </section>
  );
}
