-- =====================================================================
-- Ce qui manque encore au catalogue (encart « Aide-nous à compléter la base »
-- de l'accueil) : versions sans jaquette, jeux sans résumé (ni français ni
-- anglais), jeux sans genre. Lisible par tous : ce sont des comptes sur des
-- tables déjà publiques (droits de l'appelant, aucune donnée de membre).
-- =====================================================================

create function public.catalog_gaps()
returns table (releases_without_cover int, games_without_summary int, games_without_genre int)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*)::int from public.release r
     where not exists (select 1 from public.image i where i.release_id = r.id and i.type = 'front')),
    (select count(*)::int from public.game g where g.summary is null and g.summary_en is null),
    (select count(*)::int from public.game g where not exists (select 1 from public.game_genre x where x.game_id = g.id));
$$;

revoke execute on function public.catalog_gaps() from public;
grant execute on function public.catalog_gaps() to anon, authenticated;
