import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { searchKey } from './format';

// Tous les studios (développeurs, éditeurs), pour les choisir dans une liste.
// Lus une seule fois (environ 1 300), par paquets de 1 000 (limite de l'API).
export interface CompanyOption {
  id: number;
  name: string;
  country: string | null;
}

let cache: Promise<CompanyOption[]> | null = null;

async function loadAll(): Promise<CompanyOption[]> {
  const all: CompanyOption[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('company').select('id, name, country').order('name').range(from, from + 999);
    if (error) throw error;
    all.push(...(data as CompanyOption[]));
    if (data.length < 1000) return all;
  }
}

export function useCompanies(): CompanyOption[] {
  const [list, setList] = useState<CompanyOption[]>([]);
  useEffect(() => {
    cache ??= loadAll().catch(() => {
      cache = null;
      return [];
    });
    let active = true;
    cache.then((l) => { if (active) setList(l); });
    return () => { active = false; };
  }, []);
  return list;
}

// Après la création d'un studio : la liste sera relue
export function forgetCompanies() {
  cache = null;
}

// Le studio qui porte exactement ce nom (sans tenir compte des accents, majuscules, espaces)
export function findCompany(list: CompanyOption[], name: string): CompanyOption | undefined {
  const key = searchKey(name);
  return key ? list.find((c) => searchKey(c.name) === key) : undefined;
}
