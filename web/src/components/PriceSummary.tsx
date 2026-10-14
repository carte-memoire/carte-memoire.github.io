import { MIN_PRICE_MEMBERS, PRICE_CATEGORIES, priceText, type ReleasePrice } from '../lib/prices';
import { tr } from '../lib/i18n';

// Fiche d'une version : le prix médian payé par les membres, état par état
// (« Disque seul 6 € · Complet 20 € (19 – 31 €) · Neuf 45 € »). Sous 5 membres
// pour chaque état, seulement le nombre de prix déjà notés.
export function PriceSummary({ prices }: { prices: ReleasePrice[] }) {
  const known = PRICE_CATEGORIES
    .map((c) => ({ label: c.label, price: prices.find((p) => p.category === c.value && p.median !== null) }))
    .filter((c): c is { label: string; price: ReleasePrice } => Boolean(c.price));
  if (known.length > 0) {
    return (
      <span className="price-list">
        {known.map(({ label, price }) => (
          <span key={price.category} className="price-item" title={tr('Médiane des prix payés par {0} membres', price.members)}>
            {label} <strong>{priceText(price)}</strong>
          </span>
        ))}
      </span>
    );
  }
  const most = Math.max(0, ...prices.map((p) => p.members));
  if (most === 0) return null;
  return <span className="muted small">{tr('Pas encore assez de prix notés ({0} membre{1?s} sur les {2} nécessaires)', most, most > 1, MIN_PRICE_MEMBERS)}</span>;
}
