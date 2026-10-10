// Types des données lues dans Supabase (sous-ensemble des tables, côté affichage)

export type Zone = 'NTSC-J' | 'NTSC-U' | 'PAL' | 'region_free';
export type EditionType = 'standard' | 'reissue' | 'collector' | 'demo' | 'promo' | 'bundle';
export type DatePrecision = 'day' | 'month' | 'year';
export type ItemStatus = 'owned' | 'wanted';
export type ItemCondition = 'sealed' | 'resealed' | 'like_new' | 'very_good' | 'good' | 'fair' | 'poor';
export type AcquisitionType = 'new' | 'used' | 'gift' | 'trade';
export type TradeStatus = 'for_trade' | 'for_sale';
export type ImageType = 'front' | 'back' | 'spine' | 'disc' | 'manual' | 'screenshot';
export type UserRole = 'member' | 'moderator' | 'admin';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface SearchResult {
  id: number;
  title: string;
  first_release_date: string | null;
  matched_title: string;
  release_count: number;
  cover_path: string | null;
  // Code produit de la version trouvée, si la recherche portait sur un code
  matched_code: string | null;
}

export interface Region {
  id: number;
  code: string;
  name: string;
  type: 'world' | 'zone' | 'country';
  parent_id: number | null;
}

export interface Platform {
  id: number;
  name: string;
  short_name: string;
}

// Console avec son constructeur et son nombre de jeux (fonction list_platforms)
export interface PlatformInfo extends Platform {
  manufacturer: string | null;
  generation: number | null;
  type: 'home' | 'handheld' | 'hybrid';
  game_count: number;
}

export interface ReleaseImage {
  id: number;
  type: ImageType;
  path: string;
}

export interface Release {
  id: number;
  game_id: number;
  zone: Zone | null;
  local_title: string;
  edition_type: EditionType;
  edition_name: string | null;
  product_code: string | null;
  media_count: number | null;
  languages: string[];
  reissue_of: number | null;
  platform: { id: number; short_name: string; spec_fields?: SpecField[] };
  specs?: Record<string, unknown>;
  release_region: { release_date: string | null; date_precision: DatePrecision | null; region: { id?: number; code: string; name: string } }[];
  release_company: { role: string; company: { name: string } }[];
  image: ReleaseImage[];
}

// Une caractéristique propre à une console (platform.spec_fields), ex. « Blocs de carte mémoire »
export interface SpecField {
  key: string;
  label: string;
  type: 'integer' | 'boolean' | 'choice' | 'multi_choice';
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}

export interface Game {
  id: number;
  title: string;
  summary: string | null;
  summary_source: string | null;
  first_release_date: string | null;
  first_release_precision: DatePrecision | null;
  game_developer: { company: { name: string } }[];
  genres_reviewed: boolean;
  game_genre: { genre: GenreInfo }[];
  release: Release[];
}

// Un genre (« Action-RPG ») et ses familles (RPG, Action) ; sans famille, c'est un thème
export interface GenreInfo {
  id: number;
  name: string;
  families: GenreFamily[];
}

export interface CollectionItem {
  id: number;
  status: ItemStatus;
  condition: ItemCondition | null;
  has_box: boolean | null;
  has_manual: boolean | null;
  has_media: boolean | null;
  purchase_price: number | null;
  purchase_date: string | null;
  notes: string | null;
  acquisition: AcquisitionType | null;
  purchase_place: string | null;
  has_spine_card: boolean | null;
  trade_status: TradeStatus | null;
  release: {
    id: number;
    zone: Zone | null;
    local_title: string;
    edition_type: EditionType;
    edition_name: string | null;
    product_code: string | null;
    reissue_of: number | null;
    platform: { short_name: string };
    image: ReleaseImage[];
    game: { id: number; title: string; first_release_date: string | null };
  };
}

export interface Profile {
  id: string;
  username: string;
  role: UserRole;
  public_collection: boolean;
  avatar: string | null;
}

export interface ReleaseProposal {
  platform_id: number;
  zone: Zone | null;
  local_title: string;
  product_code?: string;
  edition_type: EditionType;
  edition_name?: string;
  languages: string[];
  region_code?: string;
  release_date?: string;
  date_precision?: DatePrecision;
  publisher_name?: string;
  developer_name?: string;
}

export interface Submission {
  id: number;
  action: 'create' | 'update' | 'delete';
  target: string;
  data: {
    game?: { title: string };
    game_id?: number;
    release?: ReleaseProposal;
    cover_path?: string;
    no_cover?: boolean;
    summary?: string;
  };
  target_id?: number | null;
  sources: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  created_at: string;
  created_game_id?: number | null;
  author?: { username: string } | null;
}

// Familles de genres (RPG, Course…) : filtres du catalogue et progression
export type GenreFamily =
  | 'action' | 'adventure' | 'rpg' | 'platform' | 'fighting' | 'shooter' | 'racing' | 'sports'
  | 'puzzle' | 'strategy' | 'simulation' | 'music' | 'horror' | 'visual_novel' | 'party';

// Filtre « possession » du catalogue
export type Ownership = 'owned' | 'missing' | 'wanted';

// Une version dans une ligne du catalogue, avec ce que la personne connectée en possède
export interface CatalogRelease {
  id: number;
  local_title: string;
  product_code: string | null;
  zone: Zone | null;
  edition_type: EditionType;
  edition_name: string | null;
  platform: { short_name: string };
  owned: boolean;
  wanted: boolean;
  copies: number;
  owned_item: number | null;
  wanted_item: number | null;
}

// Une ligne du catalogue (fonction catalog_games) : un jeu et ses versions
export interface CatalogRow {
  id: number;
  title: string;
  display_title: string;
  release_date: string | null;
  cover_path: string | null;
  cover_other_zone: boolean;
  releases: CatalogRelease[];
  owned: boolean;
  wanted: boolean;
  total_count: number;
}

// Progression (fonction collection_progress) : jeux possédés sur jeux existants
export interface ProgressRow {
  // origin : décompte des jeux de la zone par origine (japan, other, unknown)
  scope: 'zone' | 'family' | 'origin';
  code: string;
  total: number;
  owned: number;
  wanted: number;
}

// Erreur signalée par un membre (table report)
export type ReportKind = 'genre' | 'title' | 'release' | 'cover' | 'duplicate' | 'other';
export interface Report {
  id: number;
  game_id: number;
  release_id: number | null;
  kind: ReportKind;
  message: string;
  status: 'open' | 'resolved' | 'rejected';
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  author?: { username: string } | null;
  game?: { id: number; title: string } | null;
}

// Une modification du catalogue (table catalog_change)
export interface CatalogChange {
  id: number;
  table_name: 'game' | 'release' | 'game_genre' | 'image' | 'release_region';
  row_key: string;
  game_id: number | null;
  action: 'insert' | 'update' | 'delete';
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_at: string;
  undone_at: string | null;
  author?: { username: string } | null;
  undoer?: { username: string } | null;
}
