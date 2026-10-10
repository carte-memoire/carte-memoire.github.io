import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { PlatformInfo } from './types';
import { ALL_PLATFORMS, DEFAULT_PLATFORM } from './preferences';

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

// Console demandée (adresse ou préférence) : une console inconnue (lien mal recopié,
// console retirée) est remplacée par la console par défaut, au lieu d'un catalogue vide
// qu'on ne pourrait plus quitter (elle resterait mémorisée)
export function useKnownPlatform(requested: string): string {
  const platforms = usePlatforms();
  if (requested === ALL_PLATFORMS || platforms.length === 0) return requested;
  return platforms.some((p) => p.short_name === requested) ? requested : DEFAULT_PLATFORM;
}

// Regroupement par constructeur, pour des <optgroup> : ceux qui ont le plus de
// jeux d'abord (Sony tant que la base ne contient que la PS1), puis par nom
export function groupByManufacturer(platforms: PlatformInfo[]): [string, PlatformInfo[]][] {
  const groups = new Map<string, PlatformInfo[]>();
  for (const p of platforms) {
    const key = p.manufacturer ?? 'Autres';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const total = (list: PlatformInfo[]) => list.reduce((n, p) => n + p.game_count, 0);
  return [...groups].sort(([a, la], [b, lb]) => total(lb) - total(la) || a.localeCompare(b, 'fr'));
}
