// Présentations de « Ma collection », au choix du collectionneur (retenu sur l'appareil,
// lib/preferences.ts) : rangés (seule la tranche se voit), en exposition (jaquettes de face sur
// l'étagère) ou en liste. Proposées dans Ma collection et dans Mon compte › Affichage.
// Libellés lus à l'affichage, dans la langue choisie.
import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';
import type { CollectionView } from '../lib/preferences';

export const COLLECTION_VIEWS: { value: CollectionView; readonly label: string; readonly hint: string; icon: ReactNode }[] = [
  {
    value: 'shelf', get label() { return tr('Tranches'); }, get hint() { return tr('Rangés sur l’étagère : seule la tranche se voit, on en met beaucoup'); },
    icon: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h2v10H2zM5 2h2v11H5zM8 4h2v9H8zM11 2.5h2V13h-2zM1 14h14v1H1z" fill="currentColor" /></svg>,
  },
  {
    value: 'grid', get label() { return tr('Exposition'); }, get hint() { return tr('En exposition sur l’étagère : les jaquettes de face'); },
    icon: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4h6v9h-6zM8.5 4h6v9h-6zM1 14h14v1H1z" fill="currentColor" /></svg>,
  },
  {
    value: 'list', get label() { return tr('Liste'); }, get hint() { return tr('Une ligne par exemplaire, avec tous ses détails'); },
    icon: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3h2v2H1zM5 3h10v2H5zM1 7h2v2H1zM5 7h10v2H5zM1 11h2v2H1zM5 11h10v2H5z" fill="currentColor" /></svg>,
  },
];
