-- =====================================================================
-- Carte Mémoire · File des versions sans jaquette (page Modération)
--
-- Les versions qui n'ont pas encore de recto, page par page : d'abord les
-- rééditions (Platinum…), qui reprennent presque toujours l'illustration de
-- la version d'origine. Pour chacune, une jaquette « en attendant » :
--   - pour une réédition, le recto de la version d'origine ;
--   - sinon, un recto d'une autre version du jeu (même zone de préférence).
-- Le site l'affiche avec un bandeau, et le modérateur s'en sert pour
-- reconnaître le jeu avant de coller la vraie jaquette.
-- =====================================================================

create function public.releases_without_cover(
  platform_code text default 'PS1',
  edition public.edition_type default null,
  zone_code public.video_zone default null,
  search text default null,
  page_number int default 1,
  page_size int default 20
)
returns table (
  id bigint,
  game_id bigint,
  game_title text,
  local_title text,
  zone public.video_zone,
  product_code text,
  edition_type public.edition_type,
  edition_name text,
  stand_in_path text,
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
    select r.id, r.game_id, g.title, g.title_key, r.local_title, r.zone, r.product_code,
           r.edition_type, r.edition_name, r.reissue_of
    from public.release r
    join public.game g on g.id = r.game_id
    cross join params
    where (platform_code is null or r.platform_id = params.pid)
      and (edition is null or r.edition_type = edition)
      and (zone_code is null or r.zone = zone_code)
      and not exists (select 1 from public.image i where i.release_id = r.id and i.type = 'front')
      and (params.k is null
           or g.title_key like '%' || params.k || '%'
           or public.normalize_name(r.local_title) like '%' || params.k || '%'
           or public.normalize_name(coalesce(r.product_code, '')) like '%' || params.k || '%')
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
    p.game_id,
    p.title,
    p.local_title,
    p.zone,
    p.product_code,
    p.edition_type,
    p.edition_name,
    coalesce(
      (select i.path from public.image i where i.release_id = p.reissue_of and i.type = 'front' order by i.id limit 1),
      (select i.path from public.image i join public.release r on r.id = i.release_id
       where r.game_id = p.game_id and i.type = 'front'
       order by (r.zone is not distinct from p.zone) desc, (r.edition_type = 'standard') desc, r.id, i.id limit 1)
    ),
    p.total_count
  from paged p
  order by p.title_key, p.id;
$$;

revoke execute on function public.releases_without_cover(text, public.edition_type, public.video_zone, text, int, int) from public, anon;
grant execute on function public.releases_without_cover(text, public.edition_type, public.video_zone, text, int, int) to authenticated;
