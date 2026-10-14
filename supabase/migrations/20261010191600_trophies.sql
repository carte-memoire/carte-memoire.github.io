-- =====================================================================
-- Trophées de collection
--
-- Propres au site (rien à voir avec un compte PlayStation) : calculés à
-- partir de la collection et des contributions du membre. La base renvoie
-- seulement des compteurs ; la liste des trophées et leurs seuils sont dans
-- le site (web/src/lib/trophies.ts), pour pouvoir en ajouter sans migration.
-- Visibles par le membre lui-même, et par tous si sa collection est publique.
-- =====================================================================

create function public.trophy_stats(member text default null)
returns table (
  owned_games int,        -- jeux différents possédés (toutes consoles)
  complete_copies int,    -- exemplaires complets (boîte + notice + disque)
  sealed_copies int,      -- exemplaires neufs sous blister
  priced_copies int,      -- exemplaires dont le prix d'achat est noté
  reissue_copies int,     -- rééditions possédées (Platinum, Greatest Hits…)
  japan_games int,        -- jeux possédés en version japonaise
  zones int,              -- zones représentées (Japon, Amérique, Europe)
  consoles int,           -- consoles représentées
  families int,           -- familles de genres représentées
  jrpg_games int,         -- RPG de studios japonais possédés
  complete_series int,    -- séries (3 jeux ou plus) dont tous les jeux sont possédés
  best_share numeric,     -- meilleure part du catalogue d'une console dans une zone (0 à 1)
  best_share_platform text,
  best_share_zone public.video_zone,
  wanted_games int,       -- jeux dans la liste de recherche
  offered_copies int,     -- exemplaires à échanger ou à vendre
  contributions int,      -- propositions acceptées par les modérateurs
  barcodes int            -- codes-barres associés à une version
)
language sql
stable
security definer
set search_path = ''
as $$
  with who as (
    select p.id
    from public.profile p
    where (member is null and p.id = (select auth.uid()))
       or (member is not null and lower(p.username) = lower(member)
           and (p.public_collection or p.id = (select auth.uid())))
  ),
  items as (
    select c.status, c.condition, c.has_box, c.has_manual, c.has_media, c.purchase_price, c.trade_status,
           r.game_id, r.zone, r.platform_id, r.edition_type
    from public.collection_item c
    join public.release r on r.id = c.release_id
    where c.profile_id = (select id from who)
  ),
  owned as (select * from items where status = 'owned'),
  owned_games as (select distinct game_id from owned),
  owned_families as (
    select distinct f.family
    from owned_games og
    join public.game_genre gg on gg.game_id = og.game_id
    join public.genre ge on ge.id = gg.genre_id
    cross join lateral unnest(ge.families) as f(family)
  ),
  jrpg as (
    select distinct g.id
    from owned_games og
    join public.game g on g.id = og.game_id
    join public.game_genre gg on gg.game_id = g.id
    join public.genre ge on ge.id = gg.genre_id
    where 'rpg' = any (ge.families) and public.origin(g) = 'JP'
  ),
  series_done as (
    select gs.series_id
    from public.game_series gs
    group by gs.series_id
    having count(*) >= 3
       and count(*) = count(*) filter (where gs.game_id in (select game_id from owned_games))
  ),
  -- Part du catalogue : comme la progression de Ma collection (un jeu compte
  -- dans une zone s'il y a une version) ; consoles et zones d'au moins 100 jeux
  catalog as (
    select r.platform_id, r.zone, count(distinct r.game_id) as total
    from public.release r
    where r.zone is not null
    group by r.platform_id, r.zone
    having count(distinct r.game_id) >= 100
  ),
  mine as (
    select platform_id, zone, count(distinct game_id) as owned
    from owned
    where zone is not null
    group by platform_id, zone
  ),
  best as (
    select m.platform_id, m.zone, m.owned::numeric / c.total as share
    from mine m
    join catalog c on c.platform_id = m.platform_id and c.zone = m.zone
    order by share desc, c.total desc
    limit 1
  )
  select
    (select count(*)::int from owned_games),
    (select count(*)::int from owned where has_box and has_manual and has_media),
    (select count(*)::int from owned where condition = 'sealed'),
    (select count(*)::int from owned where purchase_price is not null),
    (select count(*)::int from owned where edition_type = 'reissue'),
    (select count(distinct game_id)::int from owned where zone = 'NTSC-J'),
    (select count(distinct zone)::int from owned where zone in ('NTSC-J', 'NTSC-U', 'PAL')),
    (select count(distinct platform_id)::int from owned),
    (select count(*)::int from owned_families),
    (select count(*)::int from jrpg),
    (select count(*)::int from series_done),
    coalesce((select round(share, 4) from best), 0),
    (select pl.short_name from best join public.platform pl on pl.id = best.platform_id),
    (select zone from best),
    (select count(distinct game_id)::int from items where status = 'wanted'),
    (select count(*)::int from owned where trade_status is not null),
    (select count(*)::int from public.submission s where s.author_id = (select id from who) and s.status = 'approved'),
    (select count(*)::int from public.release_barcode b where b.added_by = (select id from who))
  where exists (select 1 from who);
$$;
revoke execute on function public.trophy_stats(text) from public;
grant execute on function public.trophy_stats(text) to anon, authenticated;
