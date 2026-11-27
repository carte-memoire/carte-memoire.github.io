-- =====================================================================
-- Carte Mémoire · Origine d'un jeu sorti seulement au Japon
--
-- L'origine d'un jeu (public.origin, migration game_origin) :
--   1. celle choisie par un modérateur, ou importée de Wikidata (origin_country) ;
--   2. sinon, le pays de ses studios de développement, s'ils sont tous connus et du même pays ;
--   3. NOUVEAU : sinon, le Japon, si TOUTES ses versions (toutes consoles) sont japonaises :
--      zone NTSC-J, et aucun pays de sortie hors du Japon (les jeux sans licence de Taïwan, de
--      Chine ou de Hong Kong, rangés aussi en NTSC-J, n'en profitent pas) ;
--   4. sinon, inconnue.
-- Un jeu qui n'est sorti qu'au Japon vient presque toujours d'un studio japonais : avec la
-- famille RPG, il compte parmi les JRPG. Un modérateur peut toujours choisir un autre pays.
-- Calculée à la lecture, comme avant : une version sortie ailleurs plus tard l'enlève d'elle-même.
-- =====================================================================

create or replace function public.origin(g public.game)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    g.origin_country,
    (
      select min(c.country)
      from public.game_developer gd
      join public.company c on c.id = gd.company_id
      where gd.game_id = g.id
      having count(*) > 0 and count(c.country) = count(*) and count(distinct c.country) = 1
    ),
    (
      select 'JP'
      where exists (select 1 from public.release r where r.game_id = g.id)
        and not exists (select 1 from public.release r where r.game_id = g.id and r.zone is distinct from 'NTSC-J')
        and not exists (
          select 1 from public.release r
          join public.release_region rr on rr.release_id = r.id
          join public.region re on re.id = rr.region_id
          where r.game_id = g.id and re.code <> 'JP')
    ));
$$;

comment on function public.origin(public.game) is
  'Origine du jeu : choix du modérateur (origin_country), sinon pays commun de ses studios, sinon le Japon si toutes ses versions sont japonaises.';
