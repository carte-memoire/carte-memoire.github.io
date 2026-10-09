// Types des données lues dans Supabase (sous-ensemble des tables, côté affichage)

export type Zone = 'NTSC-J' | 'NTSC-U' | 'PAL' | 'region_free';
export type EditionType = 'standard' | 'reissue' | 'collector' | 'demo' | 'promo' | 'bundle';
export type DatePrecision = 'day' | 'month' | 'year';
export type ItemStatus = 'owned' | 'wanted';
export type ItemCondition = 'sealed' | 'very_good' | 'good' | 'fair' | 'poor';
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
  platform: { id: number; short_name: string };
  release_region: { release_date: string | null; date_precision: DatePrecision | null; region: { code: string; name: string } }[];
  release_company: { role: string; company: { name: string } }[];
  image: ReleaseImage[];
}

export interface Game {
  id: number;
  title: string;
  summary: string | null;
  first_release_date: string | null;
  first_release_precision: DatePrecision | null;
  game_developer: { company: { name: string } }[];
  game_genre: { genre: { name: string } }[];
  release: Release[];
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
  release: {
    id: number;
    zone: Zone | null;
    local_title: string;
    edition_type: EditionType;
    edition_name: string | null;
    product_code: string | null;
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
  };
  sources: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  created_at: string;
}
