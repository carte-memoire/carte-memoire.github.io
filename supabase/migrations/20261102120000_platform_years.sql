-- =====================================================================
-- Années d'activité de chaque console, pour le filtre « année » du catalogue
--
-- Le site proposait des années codées en dur (PS1 : 1994 à 2006, PS2 : 2000 à 2013) et,
-- pour toute autre console, de 1972 à aujourd'hui. La liste des consoles donne désormais
-- la première et la dernière année de sortie connues de ses jeux (dates des versions,
-- celles que le filtre « année » utilise), la date de lancement de la console comprise.
-- Une console sans jeu daté n'a pas d'années : le site garde alors sa large fourchette.
-- Ajouter une console ne demande ainsi plus de toucher au site.
-- =====================================================================

drop function public.list_platforms();

create function public.list_platforms()
returns table (
  id bigint,
  name text,
  short_name text,
  manufacturer text,
  generation smallint,
  type public.platform_type,
  game_count int,
  first_year int,
  last_year int
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.short_name, c.name, p.generation, p.type,
         (select count(distinct r.game_id)::int from public.release r where r.platform_id = p.id),
         least(extract(year from p.launch_date)::int, y.min_year),
         y.max_year
  from public.platform p
  left join public.company c on c.id = p.manufacturer_id
  left join lateral (
    select min(extract(year from rr.release_date))::int as min_year,
           max(extract(year from rr.release_date))::int as max_year
    from public.release r
    join public.release_region rr on rr.release_id = r.id
    where r.platform_id = p.id and rr.release_date is not null
  ) y on true
  order by c.name nulls last, p.launch_date nulls last, p.name;
$$;

revoke execute on function public.list_platforms() from public;
grant execute on function public.list_platforms() to anon, authenticated;
