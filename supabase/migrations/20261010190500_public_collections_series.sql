-- =====================================================================
-- Carte Mémoire · Collections publiques, séries, membres par jeu
--
-- 1. Confidentialité : une collection n'est plus lisible directement que par son
--    propriétaire. Avant, une collection publique exposait TOUTES ses colonnes
--    (prix payés, lieux et dates d'achat, notes). La page publique passe par des
--    fonctions qui ne renvoient que l'état et le contenu des exemplaires.
-- 2. Page publique d'un membre : profil, chiffres, exemplaires (colonnes sûres).
-- 3. Séries : catalogue filtré par série, résumé d'une série, progression de la
--    personne connectée série par série.
-- 4. Nombre de membres qui possèdent ou recherchent un jeu (et chaque version) :
--    des totaux seulement, jamais qui.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Collections : lecture directe par le propriétaire seulement
-- ---------------------------------------------------------------------
drop policy "Read own or public collections" on public.collection_item;
create policy "Read own collection" on public.collection_item
  for select to authenticated
  using (profile_id = (select auth.uid()));
-- (Les visiteurs gardent le droit de lecture : le catalogue lit « mes exemplaires »
-- pour tout le monde. Sans règle qui les concerne, ils n'y voient aucune ligne.)


-- ---------------------------------------------------------------------
-- 2. Page publique d'un membre
-- ---------------------------------------------------------------------

-- Le profil et ses chiffres ; les chiffres seulement si la collection est publique
-- (ou si c'est la sienne)
create function public.public_profile(member text)
returns table (
  username text, avatar text, member_since date, is_public boolean, is_me boolean,
  owned_games int, owned_copies int, complete_copies int, sealed_copies int, wanted_games int, offered int
)
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select pr.* from public.profile pr where lower(pr.username) = lower(member)
  ),
  visible as (
    select p.id from p where p.public_collection or p.id = (select auth.uid())
  ),
  items as (
    select c.*, r.game_id
    from public.collection_item c
    join public.release r on r.id = c.release_id
    where c.profile_id in (select id from visible)
  )
  select p.username, p.avatar, p.created_at::date, p.public_collection, coalesce(p.id = (select auth.uid()), false),
         case when exists (select 1 from visible) then (select count(distinct game_id)::int from items where status = 'owned') end,
         case when exists (select 1 from visible) then (select count(*)::int from items where status = 'owned') end,
         case when exists (select 1 from visible) then (select count(*)::int from items where status = 'owned' and has_box and has_manual and has_media) end,
         case when exists (select 1 from visible) then (select count(*)::int from items where status = 'owned' and condition = 'sealed') end,
         case when exists (select 1 from visible) then (select count(distinct game_id)::int from items where status = 'wanted') end,
         case when exists (select 1 from visible) then (select count(*)::int from items where status = 'owned' and trade_status is not null) end
  from p;
$$;
revoke execute on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

-- Les exemplaires d'une collection publique : la version, sa jaquette, l'état et le
-- contenu. Jamais le prix, le lieu, la date d'achat, le mode d'acquisition ni les notes.
create function public.public_collection(member text)
returns table (
  status public.item_status, release_id bigint, game_id bigint, game_title text, local_title text,
  zone public.video_zone, edition_type public.edition_type, edition_name text, languages text[], platform text,
  cover_path text, release_date date, condition public.item_condition,
  has_box boolean, has_manual boolean, has_media boolean, has_spine_card boolean, trade_status public.trade_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.status, r.id, g.id, g.title, r.local_title, r.zone, r.edition_type, r.edition_name, r.languages, pl.short_name,
         coalesce(
           (select i.path from public.image i where i.release_id = r.id and i.type = 'front' order by i.id limit 1),
           (select i.path from public.image i join public.release r2 on r2.id = i.release_id
            where r2.game_id = g.id and i.type = 'front'
            order by (r2.zone = r.zone) desc nulls last, (r2.edition_type = 'standard') desc, r2.id, i.id limit 1)
         ),
         coalesce((select min(rr.release_date) from public.release_region rr where rr.release_id = r.id), g.first_release_date),
         c.condition, c.has_box, c.has_manual, c.has_media, c.has_spine_card, c.trade_status
  from public.profile p
  join public.collection_item c on c.profile_id = p.id
  join public.release r on r.id = c.release_id
  join public.game g on g.id = r.game_id
  join public.platform pl on pl.id = r.platform_id
  where lower(p.username) = lower(member)
    and (p.public_collection or p.id = (select auth.uid()))
  order by g.title_key, r.zone, r.id, c.id;
$$;
revoke execute on function public.public_collection(text) from public;
grant execute on function public.public_collection(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Séries
-- ---------------------------------------------------------------------
drop function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint);

create function public.catalog_games(
  platform_code text default 'PS1',
  zone_code public.video_zone default null,
  first_letter text default null,
  family_code public.genre_family default null,
  release_year int default null,
  ownership text default null,
  search text default null,
  -- 'title', 'title_desc', 'date', 'date_desc', 'versions', 'added'
  sort_by text default 'title',
  page_number int default 1,
  page_size int default 50,
  -- 'japan' : studio japonais (avec la famille RPG : les JRPG) ; 'other' : studio d'un autre pays
  origin_filter text default null,
  -- Un studio : les jeux qu'il a développés, ou édités dans la zone choisie
  company_filter bigint default null,
  -- Une série (Final Fantasy, Resident Evil…)
  series_filter bigint default null
)
returns table (
  id bigint,
  title text,
  display_title text,
  release_date date,
  cover_path text,
  cover_other_zone boolean,
  releases jsonb,
  owned boolean,
  wanted boolean,
  total_count int
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      (select p.id from public.platform p where p.short_name = platform_code) as pid,
      nullif(public.normalize_name(search), '') as k,
      lower(first_letter) as l,
      least(greatest(coalesce(page_size, 50), 1), 1000) as size,
      greatest(coalesce(page_number, 1), 1) as page
  ),
  rel as (
    select r.id, r.game_id, r.local_title, r.local_title_key, r.product_code_key, r.edition_type,
           (select min(rr.release_date) from public.release_region rr where rr.release_id = r.id) as release_date
    from public.release r
    cross join params
    where (platform_code is null or r.platform_id = params.pid)
      and (zone_code is null or r.zone = zone_code)
  ),
  mine as (
    select c.release_id,
           bool_or(c.status = 'owned') as owned,
           bool_or(c.status = 'wanted') as wanted,
           (count(*) filter (where c.status = 'owned'))::int as copies,
           min(c.id) filter (where c.status = 'owned') as owned_item,
           min(c.id) filter (where c.status = 'wanted') as wanted_item
    from public.collection_item c
    where c.profile_id = (select auth.uid())
    group by c.release_id
  ),
  per_game as (
    select
      rel.game_id,
      (array_agg(rel.local_title order by (rel.edition_type = 'standard') desc, rel.id))[1] as local_title,
      (array_agg(rel.local_title_key order by (rel.edition_type = 'standard') desc, rel.id))[1] as local_key,
      min(rel.release_date) as release_date,
      count(*)::int as release_count,
      bool_or(coalesce(m.owned, false)) as owned,
      bool_or(coalesce(m.wanted, false)) as wanted,
      bool_or(params.k is not null and (rel.local_title_key like '%' || params.k || '%'
                                        or rel.product_code_key like '%' || params.k || '%')) as matches
    from rel
    cross join params
    left join mine m on m.release_id = rel.id
    group by rel.game_id
  ),
  filtered as (
    select
      g.id, g.title,
      case when zone_code is null then g.title else pg.local_title end as display_title,
      case when zone_code is null then g.title_key else pg.local_key end as display_key,
      -- Date de la zone ; sinon d'une autre zone sur la même console ; sinon la première
      -- sortie du jeu, seulement si elle suit le lancement de la console (pas la borne
      -- d'arcade ou la version d'une autre console, des années plus tôt)
      coalesce(
        pg.release_date,
        (select min(rr.release_date)
         from public.release r2
         join public.release_region rr on rr.release_id = r2.id
         where r2.game_id = g.id and (platform_code is null or r2.platform_id = params.pid)),
        case when g.first_release_date >= coalesce((select p.launch_date from public.platform p where p.id = params.pid), '-infinity')
             then g.first_release_date end
      ) as release_date,
      pg.release_count, g.created_at,
      pg.owned, pg.wanted
    from per_game pg
    join public.game g on g.id = pg.game_id
    cross join params
    where (params.k is null or pg.matches or g.title_key like '%' || params.k || '%')
      and (family_code is null or exists (
        select 1
        from public.game_genre gg
        join public.genre ge on ge.id = gg.genre_id
        where gg.game_id = g.id and family_code = any (ge.families)
      ))
      and (company_filter is null
           or exists (select 1 from public.game_developer gd where gd.game_id = g.id and gd.company_id = company_filter)
           or exists (
             select 1
             from public.release_company rc
             join public.release r3 on r3.id = rc.release_id
             where r3.game_id = g.id and rc.company_id = company_filter and rc.role = 'publisher'
               and (platform_code is null or r3.platform_id = params.pid)
               and (zone_code is null or r3.zone = zone_code)
           ))
      and (series_filter is null
           or exists (select 1 from public.game_series gs where gs.game_id = g.id and gs.series_id = series_filter))
      and (case origin_filter
             when 'japan' then public.origin(g) = 'JP'
             when 'other' then public.origin(g) <> 'JP'
             else true
           end)
      and (case ownership
             when 'owned' then pg.owned
             when 'missing' then not pg.owned
             when 'wanted' then pg.wanted
             else true
           end)
  ),
  paged as (
    select f.*, (count(*) over ())::int as total_count
    from filtered f
    cross join params
    where (params.l is null
           or (case when left(f.display_key, 1) ~ '[a-z]' then left(f.display_key, 1) else '#' end) = params.l)
      and (release_year is null or extract(year from f.release_date) = release_year)
    order by
      case when sort_by = 'date' then f.release_date end asc nulls last,
      case when sort_by = 'date_desc' then f.release_date end desc nulls last,
      case when sort_by = 'versions' then f.release_count end desc,
      case when sort_by = 'added' then f.created_at end desc,
      case when sort_by = 'added' then f.id end desc,
      case when sort_by = 'title_desc' then f.display_key end desc,
      f.display_key, f.display_title, f.id
    limit (select size from params)
    offset ((select page from params) - 1) * (select size from params)
  )
  select
    p.id,
    p.title,
    p.display_title,
    p.release_date,
    cov.path,
    cov.other_zone,
    (
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'local_title', r.local_title,
               'product_code', r.product_code,
               'languages', r.languages,
               'zone', r.zone,
               'edition_type', r.edition_type,
               'edition_name', r.edition_name,
               'platform', jsonb_build_object('short_name', pl.short_name),
               'owned', coalesce(m.owned, false),
               'wanted', coalesce(m.wanted, false),
               'copies', coalesce(m.copies, 0),
               'owned_item', m.owned_item,
               'wanted_item', m.wanted_item)
             order by r.zone, (r.edition_type = 'standard') desc, r.id)
      from public.release r
      join public.platform pl on pl.id = r.platform_id
      left join mine m on m.release_id = r.id
      where r.game_id = p.id
        and (platform_code is null or r.platform_id = (select pid from params))
        and (zone_code is null or r.zone = zone_code)
    ) as releases,
    p.owned,
    p.wanted,
    p.total_count
  from paged p
  left join lateral (
    select i.path, (zone_code is not null and r.zone is distinct from zone_code) as other_zone
    from public.image i
    join public.release r on r.id = i.release_id
    where r.game_id = p.id
      and i.type = 'front'
      and (platform_code is null or r.platform_id = (select pid from params))
    order by (zone_code is null or r.zone = zone_code) desc, (r.edition_type = 'standard') desc,
             (r.zone = 'PAL') desc nulls last, r.id, i.id
    limit 1
  ) cov on true
  order by
    case when sort_by = 'date' then p.release_date end asc nulls last,
    case when sort_by = 'date_desc' then p.release_date end desc nulls last,
    case when sort_by = 'versions' then p.release_count end desc,
    case when sort_by = 'added' then p.created_at end desc,
    case when sort_by = 'added' then p.id end desc,
    case when sort_by = 'title_desc' then p.display_key end desc,
    p.display_key, p.display_title, p.id;
$$;

revoke execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint, bigint) from public;
grant execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint, bigint) to anon, authenticated;

-- Une série sur une console : nombre de jeux, première et dernière année
create function public.series_summary(series_id bigint, platform_code text default null)
returns table (id bigint, name text, wikidata_id text, games int, first_year int, last_year int)
language sql
stable
set search_path = ''
as $$
  with params as (
    select (select p.id from public.platform p where p.short_name = platform_code) as pid
  ),
  rel as (
    select r.id, r.game_id
    from public.game_series gs
    join public.release r on r.game_id = gs.game_id
    cross join params
    where gs.series_id = series_summary.series_id and (platform_code is null or r.platform_id = params.pid)
  )
  select s.id, s.name, s.wikidata_id,
         (select count(distinct rel.game_id)::int from rel),
         (select extract(year from min(rr.release_date))::int from rel join public.release_region rr on rr.release_id = rel.id),
         (select extract(year from max(rr.release_date))::int from rel join public.release_region rr on rr.release_id = rel.id)
  from public.series s
  where s.id = series_summary.series_id;
$$;
revoke execute on function public.series_summary(bigint, text) from public;
grant execute on function public.series_summary(bigint, text) to anon, authenticated;

-- Ma progression série par série (séries d'au moins deux jeux sur la console, dont
-- j'ai au moins un jeu ; une zone donnée : jeux sortis dans cette zone)
create function public.collection_series_progress(platform_code text default 'PS1', zone_code public.video_zone default null)
returns table (series_id bigint, name text, total int, owned int)
language sql
stable
set search_path = ''
as $$
  with params as (
    select (select p.id from public.platform p where p.short_name = platform_code) as pid
  ),
  games as (
    select distinct gs.series_id, gs.game_id
    from public.game_series gs
    join public.release r on r.game_id = gs.game_id
    cross join params
    where (platform_code is null or r.platform_id = params.pid)
      and (zone_code is null or r.zone = zone_code)
  ),
  mine as (
    select distinct r.game_id
    from public.collection_item c
    join public.release r on r.id = c.release_id
    cross join params
    where c.profile_id = (select auth.uid()) and c.status = 'owned'
      and (platform_code is null or r.platform_id = params.pid)
      and (zone_code is null or r.zone = zone_code)
  )
  select s.id, s.name, count(*)::int, (count(*) filter (where g.game_id in (select game_id from mine)))::int
  from games g
  join public.series s on s.id = g.series_id
  group by s.id, s.name
  having count(*) >= 2 and count(*) filter (where g.game_id in (select game_id from mine)) > 0
  order by (count(*) filter (where g.game_id in (select game_id from mine)))::numeric / count(*) desc, count(*) desc, s.name;
$$;
revoke execute on function public.collection_series_progress(text, public.video_zone) from public;
grant execute on function public.collection_series_progress(text, public.video_zone) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Combien de membres possèdent ou recherchent ce jeu
-- ---------------------------------------------------------------------
-- Une ligne par version, et une ligne de total (release_id vide) : membres
-- différents, toutes collections comprises (privées aussi), jamais leur nom
create function public.game_popularity(target_game bigint)
returns table (release_id bigint, owners int, seekers int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         (count(distinct c.profile_id) filter (where c.status = 'owned'))::int,
         (count(distinct c.profile_id) filter (where c.status = 'wanted'))::int
  from public.release r
  left join public.collection_item c on c.release_id = r.id
  where r.game_id = target_game
  group by grouping sets ((r.id), ());
$$;
revoke execute on function public.game_popularity(bigint) from public;
grant execute on function public.game_popularity(bigint) to anon, authenticated;
