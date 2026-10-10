import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Region } from './types';

// Régions (monde, zones, pays), chargées une seule fois : pour les dates de sortie
let cache: Promise<Region[]> | null = null;

export function useRegions(): Region[] {
  const [regions, setRegions] = useState<Region[]>([]);
  useEffect(() => {
    cache ??= Promise.resolve(supabase.from('region').select('id, code, name, type, parent_id').order('name')).then(({ data, error }) => {
      if (error) {
        cache = null;
        return [];
      }
      return (data as Region[]) ?? [];
    });
    let active = true;
    cache.then((list) => { if (active) setRegions(list); });
    return () => { active = false; };
  }, []);
  return regions;
}
