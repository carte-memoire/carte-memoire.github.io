-- =====================================================================
-- Carte Mémoire · Origine des jeux : le pays du studio de développement
--
-- Pour séparer, par exemple, les RPG japonais (JRPG) des RPG occidentaux :
-- JRPG = un jeu de la famille RPG dont l'origine est le Japon.
--
-- L'origine d'un jeu :
--   1. celle choisie par un modérateur, ou importée de Wikidata (origin_country) ;
--   2. sinon, le pays de ses studios de développement, s'ils sont TOUS connus et
--      tous du même pays (une coproduction entre deux pays reste à trancher) ;
--   3. sinon, inconnue : le jeu n'apparaît ni dans « Japon » ni dans « Hors Japon ».
-- Elle est calculée à la lecture : renseigner le pays d'un studio complète
-- d'un coup tous ses jeux.
-- =====================================================================

alter table public.game add column origin_country text check (origin_country ~ '^[A-Z]{2}$');
comment on column public.game.origin_country is
  'Pays d''origine (code ISO) choisi à la main ou importé ; vide = déduit des studios (fonction origin).';

-- Champ calculé, lisible aussi par l'API : game?select=title,origin
create function public.origin(g public.game)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(g.origin_country, (
    select min(c.country)
    from public.game_developer gd
    join public.company c on c.id = gd.company_id
    where gd.game_id = g.id
    having count(*) > 0 and count(c.country) = count(*) and count(distinct c.country) = 1
  ));
$$;

grant execute on function public.origin(public.game) to anon, authenticated;


-- ---------------------------------------------------------------------
-- Catalogue : nouveau filtre par origine (nouvelle signature : on remplace)
-- ---------------------------------------------------------------------
drop function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int);

create function public.catalog_games(
  platform_code text default 'PS1',
  zone_code public.video_zone default null,
  first_letter text default null,
  family_code public.genre_family default null,
  release_year int default null,
  ownership text default null,
  search text default null,
  sort_by text default 'title',
  page_number int default 1,
  page_size int default 50,
  -- 'japan' : studio japonais (avec la famille RPG : les JRPG) ; 'other' : studio d'un autre pays
  origin_filter text default null
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
      least(greatest(coalesce(page_size, 50), 1), 100) as size,
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
      coalesce(pg.release_date, g.first_release_date) as release_date,
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
    order by case when sort_by = 'date' then f.release_date end nulls last, f.display_key, f.display_title, f.id
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
  order by case when sort_by = 'date' then p.release_date end nulls last, p.display_key, p.display_title, p.id;
$$;

revoke execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text) from public;
grant execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- Progression : même filtre, et le décompte par origine (Japon, hors
-- Japon, inconnue) des jeux de la zone choisie, toutes origines confondues
-- ---------------------------------------------------------------------
drop function public.collection_progress(text, public.video_zone);

create function public.collection_progress(
  platform_code text default 'PS1',
  zone_code public.video_zone default null,
  origin_filter text default null
)
returns table (scope text, code text, total int, owned int, wanted int)
language sql
stable
set search_path = ''
as $$
  with params as (
    select (select p.id from public.platform p where p.short_name = platform_code) as pid
  ),
  mine as (
    select c.release_id,
           bool_or(c.status = 'owned') as owned,
           bool_or(c.status = 'wanted') as wanted
    from public.collection_item c
    where c.profile_id = (select auth.uid())
    group by c.release_id
  ),
  every_zone as (
    select r.game_id, r.zone,
           bool_or(coalesce(m.owned, false)) as owned,
           bool_or(coalesce(m.wanted, false)) as wanted
    from public.release r
    cross join params
    left join mine m on m.release_id = r.id
    where platform_code is null or r.platform_id = params.pid
    group by r.game_id, r.zone
  ),
  origins as (
    select g.id as game_id,
           case when public.origin(g) is null then 'unknown'
                when public.origin(g) = 'JP' then 'japan'
                else 'other' end as origin
    from public.game g
    where g.id in (select ez.game_id from every_zone ez)
  ),
  game_zone as (
    select ez.*
    from every_zone ez
    join origins o on o.game_id = ez.game_id
    where origin_filter is null or o.origin = origin_filter
  ),
  game_all as (
    select gz.game_id, bool_or(gz.owned) as owned, bool_or(gz.wanted) as wanted
    from game_zone gz
    group by gz.game_id
  ),
  scoped as (
    select ga.game_id, ga.owned, ga.wanted from game_all ga where zone_code is null
    union all
    select gz.game_id, gz.owned, gz.wanted from game_zone gz where gz.zone = zone_code
  ),
  -- Un jeu compte une fois par famille, même si plusieurs de ses genres y mènent
  scoped_family as (
    select distinct s.game_id, f.family, s.owned, s.wanted
    from scoped s
    join public.game_genre gg on gg.game_id = s.game_id
    join public.genre ge on ge.id = gg.genre_id
    cross join lateral unnest(ge.families) as f(family)
  ),
  -- Jeux de la zone choisie, toutes origines confondues
  zone_games as (
    select ez.game_id, bool_or(ez.owned) as owned, bool_or(ez.wanted) as wanted
    from every_zone ez
    where zone_code is null or ez.zone = zone_code
    group by ez.game_id
  )
  select 'zone', 'all', count(*)::int,
         (count(*) filter (where ga.owned))::int, (count(*) filter (where ga.wanted))::int
  from game_all ga
  union all
  select 'zone', gz.zone::text, count(*)::int,
         (count(*) filter (where gz.owned))::int, (count(*) filter (where gz.wanted))::int
  from game_zone gz
  where gz.zone is not null
  group by gz.zone
  union all
  select 'family', sf.family::text, count(*)::int,
         (count(*) filter (where sf.owned))::int, (count(*) filter (where sf.wanted))::int
  from scoped_family sf
  group by sf.family
  union all
  select 'family', 'known', count(*)::int,
         (count(*) filter (where k.owned))::int, (count(*) filter (where k.wanted))::int
  from (select distinct sf.game_id, sf.owned, sf.wanted from scoped_family sf) k
  union all
  select 'origin', o.origin, count(*)::int,
         (count(*) filter (where zg.owned))::int, (count(*) filter (where zg.wanted))::int
  from zone_games zg
  join origins o on o.game_id = zg.game_id
  group by o.origin;
$$;

revoke execute on function public.collection_progress(text, public.video_zone, text) from public;
grant execute on function public.collection_progress(text, public.video_zone, text) to anon, authenticated;
