-- =====================================================================
-- Carte Mémoire · File des jeux sans genre (page Modération)
--
-- Les jeux qui n'ont encore aucun genre (les thèmes ne comptent pas) et que
-- personne n'a revus, page par page, avec de quoi décider vite : titre sur la
-- boîte, éditeur, année, zones, jaquette.
-- =====================================================================

create function public.games_without_genre(
  platform_code text default 'PS1',
  zone_code public.video_zone default null,
  search text default null,
  page_number int default 1,
  page_size int default 20
)
returns table (
  id bigint,
  title text,
  local_title text,
  release_date date,
  zones text[],
  publisher text,
  cover_path text,
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
      least(greatest(coalesce(page_size, 20), 1), 100) as size,
      greatest(coalesce(page_number, 1), 1) as page
  ),
  todo as (
    select g.id, g.title, g.title_key
    from public.game g
    cross join params
    where not g.genres_reviewed
      and not exists (
        select 1 from public.game_genre gg join public.genre ge on ge.id = gg.genre_id
        where gg.game_id = g.id and cardinality(ge.families) > 0
      )
      and exists (
        select 1 from public.release r
        where r.game_id = g.id
          and (platform_code is null or r.platform_id = params.pid)
          and (zone_code is null or r.zone = zone_code)
      )
      and (params.k is null or g.title_key like '%' || params.k || '%')
  ),
  paged as (
    select t.*, (count(*) over ())::int as total_count
    from todo t
    order by t.title_key, t.id
    limit (select size from params)
    offset ((select page from params) - 1) * (select size from params)
  )
  select
    p.id,
    p.title,
    (select r.local_title from public.release r where r.game_id = p.id and r.local_title <> p.title order by r.id limit 1),
    (select min(rr.release_date) from public.release r join public.release_region rr on rr.release_id = r.id where r.game_id = p.id),
    (select array_agg(distinct r.zone::text) from public.release r where r.game_id = p.id and r.zone is not null),
    (select c.name from public.release r
       join public.release_company rc on rc.release_id = r.id and rc.role = 'publisher'
       join public.company c on c.id = rc.company_id
     where r.game_id = p.id order by r.id limit 1),
    (select i.path from public.image i join public.release r on r.id = i.release_id
     where r.game_id = p.id and i.type = 'front' order by r.id, i.id limit 1),
    p.total_count
  from paged p
  order by p.title_key, p.id;
$$;

revoke execute on function public.games_without_genre(text, public.video_zone, text, int, int) from public, anon;
grant execute on function public.games_without_genre(text, public.video_zone, text, int, int) to authenticated;
