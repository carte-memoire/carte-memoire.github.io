import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { PlatformInfo } from './types';

// Liste des consoles (avec constructeur et nombre de jeux), chargée une seule fois
let cache: Promise<PlatformInfo[]> | null = null;

export function usePlatforms(): PlatformInfo[] {
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  useEffect(() => {
    cache ??= Promise.resolve(supabase.rpc('list_platforms')).then(({ data, error }) => {
      if (error) {
        cache = null;
        return [];
      }
      return (data as PlatformInfo[]) ?? [];
    });
    let active = true;
    cache.then((list) => { if (active) setPlatforms(list); });
    return () => { active = false; };
  }, []);
  return platforms;
}

// Regroupement par constructeur, pour des <optgroup>
export function groupByManufacturer(platforms: PlatformInfo[]): [string, PlatformInfo[]][] {
  const groups = new Map<string, PlatformInfo[]>();
  for (const p of platforms) {
    const key = p.manufacturer ?? 'Autres';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return [...groups];
}
