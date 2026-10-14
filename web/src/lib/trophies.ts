import { tr } from './i18n';

// Trophées de collection, propres au site (aucun lien avec un compte PlayStation).
// La base renvoie des compteurs (fonction trophy_stats) ; chaque trophée est un
// seuil sur l'un d'eux. En ajouter un : une ligne ici, sans migration.
export type TrophyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TrophyStats {
  owned_games: number;
  complete_copies: number;
  sealed_copies: number;
  priced_copies: number;
  reissue_copies: number;
  japan_games: number;
  zones: number;
  consoles: number;
  families: number;
  jrpg_games: number;
  complete_series: number;
  best_share: number | string;
  best_share_platform: string | null;
  best_share_zone: string | null;
  wanted_games: number;
  offered_copies: number;
  contributions: number;
  barcodes: number;
}

type Counter = Exclude<keyof TrophyStats, 'best_share' | 'best_share_platform' | 'best_share_zone'> | 'best_share_percent';

interface TrophyDefinition {
  code: string;
  tier: TrophyTier;
  title: string;
  description: string;
  counter: Counter;
  target: number;
}

export const TIERS: { value: TrophyTier; label: string }[] = [
  { value: 'bronze', label: tr('Bronze') },
  { value: 'silver', label: tr('Argent') },
  { value: 'gold', label: tr('Or') },
  { value: 'platinum', label: tr('Platine') },
];
export const tierLabel = (tier: TrophyTier) => TIERS.find((t) => t.value === tier)?.label ?? tier;

export const TROPHIES: TrophyDefinition[] = [
  // La collection grandit
  { code: 'nouvelle-partie', tier: 'bronze', title: tr('Nouvelle partie'), description: tr('Ajouter un premier jeu à ta collection'), counter: 'owned_games', target: 1 },
  { code: 'dix-blocs', tier: 'bronze', title: tr('Dix blocs utilisés'), description: tr('Avoir 10 jeux dans ta collection'), counter: 'owned_games', target: 10 },
  { code: 'etagere', tier: 'silver', title: tr("L'étagère se remplit"), description: tr('Avoir 50 jeux dans ta collection'), counter: 'owned_games', target: 50 },
  { code: 'centurion', tier: 'gold', title: tr('Centurion'), description: tr('Avoir 100 jeux dans ta collection'), counter: 'owned_games', target: 100 },
  { code: 'ludotheque', tier: 'gold', title: tr('Ludothèque'), description: tr('Avoir 250 jeux dans ta collection'), counter: 'owned_games', target: 250 },
  { code: 'musee', tier: 'platinum', title: tr('Musée du jeu vidéo'), description: tr('Avoir 500 jeux dans ta collection'), counter: 'owned_games', target: 500 },
  // Exemplaires
  { code: 'complet', tier: 'bronze', title: tr('Boîte, notice, disque'), description: tr('Un exemplaire complet'), counter: 'complete_copies', target: 1 },
  { code: 'exigeant', tier: 'silver', title: tr('Collectionneur exigeant'), description: tr('25 exemplaires complets'), counter: 'complete_copies', target: 25 },
  { code: 'blister', tier: 'silver', title: tr('Jamais ouvert'), description: tr('Un jeu neuf sous blister'), counter: 'sealed_copies', target: 1 },
  { code: 'reeditions', tier: 'silver', title: tr('Chasseur de rééditions'), description: tr('10 rééditions (Platinum, Greatest Hits, The Best…)'), counter: 'reissue_copies', target: 10 },
  // Horizons
  { code: 'import', tier: 'bronze', title: tr('Import japonais'), description: tr('Un jeu en version japonaise'), counter: 'japan_games', target: 1 },
  { code: 'tour-du-monde', tier: 'silver', title: tr('Tour du monde'), description: tr('Des jeux des trois zones : Japon, Amérique et Europe'), counter: 'zones', target: 3 },
  { code: 'multi-consoles', tier: 'bronze', title: tr('Multi-consoles'), description: tr('Des jeux sur deux consoles'), counter: 'consoles', target: 2 },
  { code: 'touche-a-tout', tier: 'silver', title: tr('Touche-à-tout'), description: tr('Des jeux de 8 familles de genres'), counter: 'families', target: 8 },
  { code: 'jrpg', tier: 'gold', title: tr('Héros de JRPG'), description: tr('10 RPG de studios japonais'), counter: 'jrpg_games', target: 10 },
  // Grands objectifs
  { code: 'serie-complete', tier: 'gold', title: tr('Série complète'), description: tr("Tous les jeux d'une série (trois jeux ou plus)"), counter: 'complete_series', target: 1 },
  { code: 'dixieme', tier: 'gold', title: tr('Un dixième du catalogue'), description: tr("10 % des jeux d'une console dans une région"), counter: 'best_share_percent', target: 10 },
  { code: 'moitie', tier: 'platinum', title: tr('La moitié du chemin'), description: tr("50 % des jeux d'une console dans une région"), counter: 'best_share_percent', target: 50 },
  // Communauté
  { code: 'comptable', tier: 'bronze', title: tr('Bon comptable'), description: tr('Noter le prix payé pour 10 exemplaires (il nourrit le prix médian)'), counter: 'priced_copies', target: 10 },
  { code: 'souhaits', tier: 'bronze', title: tr('Liste de souhaits'), description: tr('5 jeux dans ta liste de recherche'), counter: 'wanted_games', target: 5 },
  { code: 'brocanteur', tier: 'bronze', title: tr('Brocanteur'), description: tr('Proposer un exemplaire à échanger ou à vendre'), counter: 'offered_copies', target: 1 },
  { code: 'bip', tier: 'bronze', title: tr('Bip !'), description: tr('Associer un code-barres scanné à sa version'), counter: 'barcodes', target: 1 },
  { code: 'contributeur', tier: 'silver', title: tr('Contributeur'), description: tr('Une proposition acceptée par les modérateurs'), counter: 'contributions', target: 1 },
  { code: 'pilier', tier: 'gold', title: tr('Pilier de la base'), description: tr('25 propositions acceptées'), counter: 'contributions', target: 25 },
];

export interface Trophy extends TrophyDefinition {
  current: number;
  unlocked: boolean;
}

function counterValue(stats: TrophyStats, counter: Counter): number {
  // Part du catalogue en pour cent, arrondie vers le bas (9,96 % n'est pas 10 %)
  if (counter === 'best_share_percent') return Math.floor(Number(stats.best_share) * 1000) / 10;
  return Number(stats[counter]) || 0;
}

export function computeTrophies(stats: TrophyStats): Trophy[] {
  return TROPHIES.map((t) => {
    const current = counterValue(stats, t.counter);
    return { ...t, current, unlocked: current >= t.target };
  });
}

// Prévenir le gardien des trophées : la collection (ou une contribution) vient de changer
export const TROPHY_EVENT = 'carte-memoire:trophees';
export function notifyCollectionChanged() {
  window.dispatchEvent(new Event(TROPHY_EVENT));
}
