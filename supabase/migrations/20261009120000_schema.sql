-- =====================================================================
-- Carte Mémoire · Migration 1 : schéma (tables, contraintes, index)
-- Traduction du MCD décrit dans docs/01-modele-de-donnees.md
-- Noms en anglais, commentaires en français.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Listes de valeurs fermées (types énumérés)
--    On pourra ajouter des valeurs plus tard avec ALTER TYPE ... ADD VALUE.
-- ---------------------------------------------------------------------
create type public.platform_type     as enum ('home', 'handheld', 'hybrid');
create type public.release_format    as enum ('physical', 'digital');
create type public.video_zone        as enum ('NTSC-J', 'NTSC-U', 'PAL', 'region_free');
create type public.edition_type      as enum ('standard', 'reissue', 'collector', 'demo', 'promo', 'bundle');
create type public.date_precision    as enum ('day', 'month', 'year');
create type public.region_type       as enum ('world', 'zone', 'country');
create type public.company_role      as enum ('publisher', 'distributor', 'porting');
create type public.image_type        as enum ('front', 'back', 'spine', 'disc', 'manual', 'screenshot');
create type public.user_role         as enum ('member', 'moderator', 'admin');
create type public.item_status       as enum ('owned', 'wanted');
create type public.item_condition    as enum ('sealed', 'very_good', 'good', 'fair', 'poor');
create type public.submission_action as enum ('create', 'update', 'delete');
create type public.submission_target as enum ('game', 'release', 'company', 'series', 'genre', 'image');
create type public.submission_status as enum ('pending', 'approved', 'rejected');


-- ---------------------------------------------------------------------
-- 2. Mise à jour automatique de la colonne updated_at
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Catalogue
-- ---------------------------------------------------------------------

-- Studios, éditeurs, distributeurs et constructeurs (RG04, RG14, RG01)
create table public.company (
  id          bigint generated always as identity primary key,
  name        text not null check (length(trim(name)) > 0),
  country     text check (country ~ '^[A-Z]{2}$'),
  wikidata_id text unique check (wikidata_id ~ '^Q[0-9]+$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.company is 'Studios, éditeurs, distributeurs et constructeurs de consoles.';

-- Consoles (RG01, RG02)
create table public.platform (
  id              bigint generated always as identity primary key,
  name            text not null check (length(trim(name)) > 0),
  short_name      text not null unique,
  generation      smallint check (generation between 1 and 20),
  type            public.platform_type not null,
  media           text,
  launch_date     date,
  spec_fields     jsonb not null default '[]' check (jsonb_typeof(spec_fields) = 'array'),
  manufacturer_id bigint references public.company (id) on delete set null,
  wikidata_id     text unique check (wikidata_id ~ '^Q[0-9]+$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.platform is 'Consoles. spec_fields décrit les champs du formulaire propres à la console.';

-- L'œuvre, indépendante de la console (RG03)
create table public.game (
  id          bigint generated always as identity primary key,
  title       text not null check (length(trim(title)) > 0),
  summary     text,
  wikidata_id text unique check (wikidata_id ~ '^Q[0-9]+$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.game is 'Un jeu en tant qu''œuvre, indépendamment de la console et de la région.';

-- Genres (RG05). Le nom est unique : c'est une liste qu'on maîtrise.
create table public.genre (
  id          bigint generated always as identity primary key,
  name        text not null unique check (length(trim(name)) > 0),
  wikidata_id text unique check (wikidata_id ~ '^Q[0-9]+$'),
  created_at  timestamptz not null default now()
);

-- Séries (RG06). Nom non unique : deux séries peuvent porter le même nom.
create table public.series (
  id          bigint generated always as identity primary key,
  name        text not null check (length(trim(name)) > 0),
  wikidata_id text unique check (wikidata_id ~ '^Q[0-9]+$'),
  created_at  timestamptz not null default now()
);

-- Associations n,n du jeu (deviennent des tables de liaison)
create table public.game_genre (
  game_id  bigint not null references public.game (id) on delete cascade,
  genre_id bigint not null references public.genre (id) on delete restrict,
  primary key (game_id, genre_id)
);

create table public.game_series (
  game_id   bigint not null references public.game (id) on delete cascade,
  series_id bigint not null references public.series (id) on delete restrict,
  primary key (game_id, series_id)
);

create table public.game_developer (
  game_id    bigint not null references public.game (id) on delete cascade,
  company_id bigint not null references public.company (id) on delete restrict,
  primary key (game_id, company_id)
);

-- Régions hiérarchisées : monde > zone > pays (RG13)
create table public.region (
  id        bigint generated always as identity primary key,
  code      text not null unique check (code ~ '^([A-Z]{2}|[a-z-]+)$'),
  name      text not null,
  type      public.region_type not null,
  parent_id bigint references public.region (id) on delete restrict,
  -- Seul « monde » n'a pas de parent
  check ((type = 'world') = (parent_id is null))
);
comment on table public.region is 'Pays (code ISO en majuscules) et zones (code en minuscules), rangés en arbre.';

-- Un produit précis mis en vente (RG07 à RG10)
create table public.release (
  id           bigint generated always as identity primary key,
  game_id      bigint not null references public.game (id) on delete restrict,
  platform_id  bigint not null references public.platform (id) on delete restrict,
  -- Pour une réédition (Platinum, Greatest Hits, The Best…) : la sortie d'origine
  reissue_of   bigint,
  local_title  text not null check (length(trim(local_title)) > 0),
  product_code text,
  barcode      text check (barcode ~ '^[0-9]{8,14}$'),
  format       public.release_format not null default 'physical',
  zone         public.video_zone,
  edition_type public.edition_type not null default 'standard',
  edition_name text,
  media_count  smallint default 1 check (media_count > 0),
  max_players  smallint check (max_players > 0),
  age_rating   text,
  -- Codes langue ISO 639-1 : {fr}, {en,fr,de}…
  languages    text[] not null default '{}'
               check (array_to_string(languages, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$'),
  specs        jsonb not null default '{}' check (jsonb_typeof(specs) = 'object'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Une sortie ne peut pas être la réédition d'elle-même
  check (reissue_of <> id),
  -- Astuce : cette clé composite oblige une réédition à concerner LE MÊME jeu
  unique (id, game_id),
  foreign key (reissue_of, game_id) references public.release (id, game_id)
    on delete set null (reissue_of)
);
comment on table public.release is 'Une version commerciale précise d''un jeu : plateforme, zone, édition, code produit.';
comment on column public.release.product_code is 'Code du disque 1 (ex. SCES-00868). Pas unique : une réédition peut garder le code de l''original.';

-- Sortie × région, avec la date (RG11, RG12)
create table public.release_region (
  release_id     bigint not null references public.release (id) on delete cascade,
  region_id      bigint not null references public.region (id) on delete restrict,
  release_date   date,
  date_precision public.date_precision,
  primary key (release_id, region_id),
  -- Une date a toujours une précision, et inversement
  check ((release_date is null) = (date_precision is null)),
  -- Convention : « novembre 1997 » est stocké 1997-11-01, « 1997 » est stocké 1997-01-01
  check (date_precision is distinct from 'month'
         or extract(day from release_date) = 1),
  check (date_precision is distinct from 'year'
         or (extract(day from release_date) = 1 and extract(month from release_date) = 1))
);

-- Sortie × société, avec le rôle (RG14)
create table public.release_company (
  release_id bigint not null references public.release (id) on delete cascade,
  company_id bigint not null references public.company (id) on delete restrict,
  role       public.company_role not null,
  primary key (release_id, company_id, role)
);


-- ---------------------------------------------------------------------
-- 4. Communauté
-- ---------------------------------------------------------------------

-- Profil public d'un compte Supabase (RG17). E-mail et mot de passe restent dans auth.users.
create table public.profile (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          text not null check (username ~ '^[A-Za-z0-9_-]{3,30}$'),
  avatar            text,
  role              public.user_role not null default 'member',
  public_collection boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Pseudo unique sans tenir compte des majuscules (« Alexis » = « alexis »)
create unique index profile_username_unique on public.profile (lower(username));

-- Jaquettes, disques, notices, captures (RG15)
create table public.image (
  id          bigint generated always as identity primary key,
  release_id  bigint not null references public.release (id) on delete cascade,
  type        public.image_type not null,
  path        text not null unique,
  uploaded_by uuid references public.profile (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Un objet de la collection d'un utilisateur, possédé ou recherché (RG21, RG22)
create table public.collection_item (
  id             bigint generated always as identity primary key,
  profile_id     uuid not null default auth.uid() references public.profile (id) on delete cascade,
  -- restrict : on ne peut pas supprimer une sortie que quelqu'un a dans sa collection
  release_id     bigint not null references public.release (id) on delete restrict,
  status         public.item_status not null default 'owned',
  condition      public.item_condition,
  has_box        boolean,
  has_manual     boolean,
  has_media      boolean,
  purchase_price numeric(10, 2) check (purchase_price >= 0),
  purchase_date  date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Contributions en attente de modération (RG18, RG19)
create table public.submission (
  id           bigint generated always as identity primary key,
  author_id    uuid default auth.uid() references public.profile (id) on delete set null,
  action       public.submission_action not null,
  target       public.submission_target not null,
  target_id    bigint,
  data         jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  sources      text,
  status       public.submission_status not null default 'pending',
  moderator_id uuid references public.profile (id) on delete set null,
  review_note  text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  -- Une création ne vise pas d'objet existant ; une modification ou suppression, si
  check ((action = 'create') = (target_id is null)),
  -- Une proposition traitée a une date de traitement, une proposition en attente n'en a pas
  check ((status = 'pending') = (reviewed_at is null))
);


-- ---------------------------------------------------------------------
-- 5. Index
--    PostgreSQL n'indexe pas automatiquement les clés étrangères :
--    sans ces index, les jointures et les suppressions deviennent lentes.
-- ---------------------------------------------------------------------
create index on public.platform (manufacturer_id);
create index on public.game_genre (genre_id);
create index on public.game_series (series_id);
create index on public.game_developer (company_id);
create index on public.region (parent_id);
create index on public.release (game_id);
create index on public.release (platform_id);
create index on public.release (reissue_of);
create index on public.release (product_code);
create index on public.release_region (region_id);
create index on public.release_company (company_id);
create index on public.image (release_id);
create index on public.image (uploaded_by);
create index on public.collection_item (profile_id);
create index on public.collection_item (release_id);
create index on public.submission (author_id);
create index on public.submission (moderator_id);
-- Index partiel : la file d'attente des modérateurs
create index submission_pending on public.submission (created_at) where status = 'pending';


-- ---------------------------------------------------------------------
-- 6. Déclencheurs
-- ---------------------------------------------------------------------
create trigger set_updated_at before update on public.company         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.platform        for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.game            for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.release         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profile         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.collection_item for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription.
-- Le pseudo choisi est transmis par le formulaire d'inscription (options.data.username).
-- S'il est absent, invalide ou déjà pris, on en génère un.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wanted   text := new.raw_user_meta_data ->> 'username';
  v_username text;
begin
  if v_wanted is null or v_wanted !~ '^[A-Za-z0-9_-]{3,30}$' then
    v_wanted := 'player';
  end if;

  v_username := v_wanted;
  if exists (select 1 from public.profile p where lower(p.username) = lower(v_username)) then
    v_username := left(v_wanted, 23) || '_' || left(replace(new.id::text, '-', ''), 6);
  end if;

  insert into public.profile (id, username) values (new.id, v_username);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- Note : certaines cardinalités minimales du MCD (un jeu a AU MOINS une
-- sortie, une sortie est vendue dans AU MOINS une région) ne peuvent pas
-- être imposées par une simple contrainte SQL. Elles seront garanties par
-- le traitement des propositions (étape 5) et par le script d'import.
-- ---------------------------------------------------------------------
