import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ACQUISITIONS, CATALOG_ZONES, ORIGINS, familyOriginLabel, formatNumber, formatPercent, formatPrice, gamePath, originParam, type Origin,
} from '../lib/format';
import { ALL_PLATFORMS, ALL_ZONES, rememberZone, rememberedPlatform, rememberedZone } from '../lib/preferences';
import type { CollectionItem, ProgressRow, Zone } from '../lib/types';
import { MemoryBar } from './MemoryBar';
import { useKnownPlatform } from '../lib/usePlatforms';
import { tr } from '../lib/i18n';

function initialZone(): string {
  const zone = rememberedZone();
  return zone === ALL_ZONES || CATALOG_ZONES.some((z) => z.value === zone) ? zone : ALL_ZONES;
}

// En haut de « Ma collection » : jeux possédés sur jeux existants (par zone et
// par genre), et quelques chiffres sur les exemplaires de la même sélection
export function CollectionProgress({ items }: { items: CollectionItem[] }) {
  const platform = useKnownPlatform(rememberedPlatform());
  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const [zone, setZone] = useState(initialZone);
  const zoneCode = zone === ALL_ZONES ? null : (zone as Zone);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  // Genres d'une seule origine (studios japonais : les RPG deviennent les JRPG)
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [originRows, setOriginRows] = useState<ProgressRow[]>([]);
  // Séries commencées (au moins un jeu possédé)
  const [series, setSeries] = useState<{ series_id: number; name: string; total: number; owned: number }[]>([]);
  const [allSeries, setAllSeries] = useState(false);

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

  useEffect(() => {
    let active = true;
    supabase.rpc('collection_series_progress', { platform_code: platformCode, zone_code: zoneCode })
      .then(({ data, error }) => { if (active && !error) setSeries((data as typeof series | null) ?? []); });
    return () => { active = false; };
  }, [platformCode, zoneCode, items]);

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

  // Dépenses : exemplaires dont le prix est noté
  const priced = owned.filter((i) => i.purchase_price !== null);
  const average = priced.length ? spent / priced.length : 0;
  const priciest = [...priced].sort((a, b) => (b.purchase_price ?? 0) - (a.purchase_price ?? 0)).slice(0, 3);
  const years = new Map<string, { sum: number; count: number }>();
  for (const i of priced) {
    const year = i.purchase_date?.slice(0, 4) ?? 'Date inconnue';
    const y = years.get(year) ?? { sum: 0, count: 0 };
    years.set(year, { sum: y.sum + (i.purchase_price ?? 0), count: y.count + 1 });
  }
  const byYear = [...years].sort(([a], [b]) => (a === 'Date inconnue' ? 1 : b === 'Date inconnue' ? -1 : b.localeCompare(a)));
  const maxYear = Math.max(1, ...byYear.map(([, y]) => y.sum));
  const byAcquisition = ACQUISITIONS.map((a) => {
    const list = priced.filter((i) => i.acquisition === a.value);
    return { label: a.label, count: list.length, sum: list.reduce((n, i) => n + (i.purchase_price ?? 0), 0) };
  }).filter((a) => a.count > 0);
  const shownSeries = allSeries ? series : series.slice(0, 8);

  const catalogLink = (filters: Record<string, string>) => `/catalogue?${new URLSearchParams({ zone, ...filters })}`;

  return (
    <section className="panel progress-panel" aria-labelledby="progress-title">
      <div className="progress-head">
        <h2 id="progress-title">{tr('Progression')}</h2>
        <div className="zone-switch" role="group" aria-label={tr('Région')}>
          {[...CATALOG_ZONES.map((z) => ({ value: z.value as string, label: z.short })), { value: ALL_ZONES, label: tr('Toutes') }].map((z) => (
            <button key={z.value} type="button" className={zone === z.value ? 'zone-option active' : 'zone-option'} aria-pressed={zone === z.value} onClick={() => choose(z.value)}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {main && (
        <div className="progress-main">
          <p className="progress-figure">
            <strong>{formatNumber(main.owned)}</strong> / {formatNumber(main.total)}{tr(' jeux')}{zoneInfo ? ` ${zoneInfo.short}` : ''}
            <span className="muted"> · {formatPercent(main.owned, main.total)}</span>
          </p>
          <MemoryBar owned={main.owned} total={main.total} label={tr('Jeux possédés')} />
          <p className="small">
            <Link to={catalogLink({ possession: 'missing' })}>{tr('Voir ceux qui me manquent')}</Link>
          </p>
        </div>
      )}

      <dl className="progress-stats">
        <div><dt>{tr('Exemplaires')}</dt><dd>{formatNumber(owned.length)}</dd></div>
        <div><dt>{tr('Complets')}</dt><dd>{formatNumber(complete)}</dd></div>
        <div><dt>{tr('Neufs sous blister')}</dt><dd>{formatNumber(sealed)}</dd></div>
        <div><dt>{tr('Recherchés')}</dt><dd>{formatNumber(main?.wanted ?? 0)}</dd></div>
        <div><dt>{tr('À échanger ou vendre')}</dt><dd>{formatNumber(offered)}</dd></div>
        <div><dt>{tr('Dépensé')}</dt><dd>{formatPrice(spent)}</dd></div>
      </dl>

      {series.length > 0 && (
        <>
          <h3>{tr('Par série')}</h3>
          <ul className="family-list">
            {shownSeries.map((s) => (
              <li key={s.series_id}>
                <Link to={catalogLink({ serie: String(s.series_id) })} className="family-row">
                  <span className="family-name">{s.name}</span>
                  <span className="family-count">{formatNumber(s.owned)} / {formatNumber(s.total)}</span>
                  <MemoryBar size="small" owned={s.owned} total={s.total} label={tr('{0} : jeux possédés', s.name)} />
                </Link>
              </li>
            ))}
          </ul>
          {series.length > 8 && (
            <button type="button" className="link-button small" onClick={() => setAllSeries((v) => !v)}>
              {allSeries ? tr('Moins de séries') : tr('Voir les {0} séries commencées', formatNumber(series.length))}
            </button>
          )}
        </>
      )}

      {priced.length > 0 && (
        <div className="spending">
          <h3>{tr('Dépenses')}</h3>
          <dl className="progress-stats">
            <div><dt>{tr('Total payé')}</dt><dd>{formatPrice(spent)}</dd></div>
            <div><dt>{tr('Prix moyen')}</dt><dd>{formatPrice(Math.round(average * 100) / 100)}</dd></div>
            <div><dt>{tr('Avec un prix noté')}</dt><dd>{formatNumber(priced.length)} / {formatNumber(owned.length)}</dd></div>
          </dl>
          <div className="spending-grid">
            <div>
              <h4>{tr("Par année d'achat")}</h4>
              <ul className="bar-list">
                {byYear.map(([year, y]) => (
                  <li key={year} title={tr('{0} : {1} pour {2} exemplaire{3?s}', year, formatPrice(y.sum), y.count, y.count > 1)}>
                    <span className="bar-label">{year}</span>
                    <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${Math.max(2, (y.sum / maxYear) * 100)}%` }} /></span>
                    <span className="bar-value">{formatPrice(y.sum)} <span className="muted">· {y.count}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{tr('Les plus chers')}</h4>
              <ol className="priciest">
                {priciest.map((i) => (
                  <li key={i.id}>
                    <Link to={gamePath(i.release.game)}>{i.release.local_title}</Link> <span className="muted">· {formatPrice(i.purchase_price)}</span>
                  </li>
                ))}
              </ol>
              {byAcquisition.length > 0 && (
                <>
                  <h4>{tr("Selon l'achat")}</h4>
                  <ul className="plain-list small">
                    {byAcquisition.map((a) => (
                      <li key={a.label}>{a.label} : {formatPrice(a.sum)} <span className="muted">({formatNumber(a.count)})</span></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          {priced.length < owned.length && (
            <p className="hint">{tr('Les exemplaires sans prix ne sont pas comptés : ajoute le prix payé dans « Modifier » pour des chiffres complets.')}</p>
          )}
        </div>
      )}

      {(families.length > 0 || origin) && (
        <>
          <div className="progress-head">
            <h3>{tr('Par genre')}</h3>
            <div className="zone-switch" role="group" aria-label={tr('Origine du studio')}>
              {[{ value: null, label: tr('Toutes origines') }, ...ORIGINS.map((o) => ({ value: o.value, label: o.label }))].map((o) => (
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
                  <MemoryBar size="small" owned={f.owned} total={f.total} label={tr('{0} : jeux possédés', familyOriginLabel(f.code, origin))} />
                </Link>
              </li>
            ))}
          </ul>
          {known && main && !origin && (
            <p className="hint">
              {tr('Genre connu pour ')}{formatNumber(known.total)}{tr(' jeux sur ')}{formatNumber(main.total)}{tr(' : les totaux par genre grandiront à mesure que la base se complète.')}
            </p>
          )}
          {origin && unknownOrigin && main && (
            <p className="hint">
              {tr('Origine du studio connue pour ')}{formatNumber(main.total - unknownOrigin.total)}{tr(' jeux sur ')}{formatNumber(main.total)}{tr(' : elle se déduit du pays des studios et se complète au fil des fiches.')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
