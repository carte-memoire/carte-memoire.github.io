import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CATALOG_ZONES, formatNumber, formatPercent } from '../lib/format';
import { ALL_PLATFORMS, ALL_ZONES, rememberedPlatform } from '../lib/preferences';
import type { ProgressRow, Zone } from '../lib/types';
import { useKnownPlatform } from '../lib/usePlatforms';
import { tr } from '../lib/i18n';
import { initialZone } from './CollectionProgress';
import { MemoryBar } from './MemoryBar';

// La carte mémoire en une ligne : jeux possédés sur jeux existants, pour la console et la
// zone retenues dans les statistiques de Ma collection. Au-dessus des onglets de Ma
// collection (un clic ouvre les statistiques) et sur l'accueil d'un membre (lien vers sa
// collection). `refresh` : relire quand la collection change.
export function ProgressStrip({ refresh, onOpen, to, label, more, hideEmpty = false }: {
  refresh?: unknown;
  onOpen?: () => void;
  to?: string;
  label?: string;
  more: string;
  hideEmpty?: boolean;
}) {
  const platform = useKnownPlatform(rememberedPlatform());
  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const zone = initialZone();
  const zoneCode = zone === ALL_ZONES ? null : (zone as Zone);
  const [main, setMain] = useState<ProgressRow | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc('collection_progress', { platform_code: platformCode, zone_code: zoneCode }).then(({ data }) => {
      if (active) setMain(((data as ProgressRow[] | null) ?? []).find((r) => r.scope === 'zone' && r.code === (zoneCode ?? 'all')) ?? null);
    });
    return () => { active = false; };
  }, [platformCode, zoneCode, refresh]);

  if (!main || main.total === 0 || (hideEmpty && main.owned === 0)) return null;
  const scope = [platformCode, CATALOG_ZONES.find((z) => z.value === zoneCode)?.short].filter(Boolean).join(' ');
  const content: ReactNode = (
    <>
      <MemoryBar size="small" owned={main.owned} total={main.total} label={tr('Jeux possédés')} />
      <span className="progress-strip-text">
        {label && <span className="progress-strip-label">{label}</span>}
        <strong>{formatNumber(main.owned)}</strong> / {formatNumber(main.total)}{tr(' jeux')}{scope && ` ${scope}`}
        <span className="muted"> · {formatPercent(main.owned, main.total)}</span>
      </span>
      <span className="progress-strip-more">{more} <span aria-hidden="true">→</span></span>
    </>
  );
  return to
    ? <Link to={to} className="progress-strip">{content}</Link>
    : <button type="button" className="progress-strip" onClick={onOpen}>{content}</button>;
}
