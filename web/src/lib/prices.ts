import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { locale, tr } from './i18n';
import type { AcquisitionType, ItemCondition } from './types';

// Prix médian selon l'état : ce que les membres ont payé (voir la migration
// 20261010191500_price_medians.sql). Jamais le prix d'un membre : la médiane
// apparaît à partir de 5 membres, la fourchette à partir de 8.
export type PriceCategory = 'loose' | 'incomplete' | 'complete' | 'new';
export const MIN_PRICE_MEMBERS = 5;

export interface ReleasePrice {
  release_id: number;
  category: PriceCategory;
  members: number;
  median: number | null;
  low: number | null;
  high: number | null;
}

// Du moins cher au plus cher, en général
export const PRICE_CATEGORIES: { value: PriceCategory; label: string }[] = [
  { value: 'loose', label: tr('Disque seul') },
  { value: 'incomplete', label: tr('Incomplet') },
  { value: 'complete', label: tr('Complet') },
  { value: 'new', label: tr('Neuf') },
];
export const priceCategoryLabel = (category: PriceCategory) => PRICE_CATEGORIES.find((c) => c.value === category)?.label ?? category;

// L'état au moment de l'achat, comme la base le calcule : neuf (sous blister ou
// acheté neuf), complet (boîte + notice + disque), disque seul, sinon incomplet
export function priceCategory(condition: ItemCondition | '' | null, acquisition: AcquisitionType | '' | null,
  box: boolean | null, manual: boolean | null, media: boolean | null): PriceCategory | null {
  if (condition === 'sealed' || acquisition === 'new') return 'new';
  if (box === null && manual === null && media === null) return null;
  if (box && manual && media) return 'complete';
  if (media && !box && !manual) return 'loose';
  return 'incomplete';
}

// Prix arrondis à l'euro : « 20 € »
export const formatEuros = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format;

// « 20 € (19 – 31 €) » : la médiane, et la fourchette où se trouve la moitié des prix
export function priceText(price: ReleasePrice): string {
  if (price.median === null) return '';
  return price.low !== null && price.high !== null && price.low !== price.high
    ? tr('{0} ({1} – {2})', formatEuros(price.median), new Intl.NumberFormat(locale).format(price.low), formatEuros(price.high))
    : formatEuros(price.median);
}

// Les prix des versions d'un jeu ; relus quand `version` change (un exemplaire ajouté…)
export function useReleasePrices(gameId: number | null | undefined, version = 0): ReleasePrice[] {
  const [prices, setPrices] = useState<ReleasePrice[]>([]);
  useEffect(() => {
    if (!gameId) return setPrices([]);
    let active = true;
    supabase.rpc('release_prices', { target_game: gameId })
      .then(({ data, error }) => { if (active && !error) setPrices((data as ReleasePrice[] | null) ?? []); });
    return () => { active = false; };
  }, [gameId, version]);
  return prices;
}
