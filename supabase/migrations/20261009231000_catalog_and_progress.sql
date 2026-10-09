-- =====================================================================
-- Carte Mémoire · Catalogue à cocher et progression de la collection
--
-- 1. Familles de genres. Les 202 genres venus de Wikidata mélangent de vrais
--    genres (« Tactical RPG », « Action-RPG »…) et des thèmes (« science-
--    fiction », « Noël »…). Chaque genre reçoit une grande famille (RPG,
--    Course…) pour filtrer et compter ; les thèmes n'en ont pas.
-- 2. catalog_games : le catalogue d'une console page par page, filtrable,
--    avec pour chaque jeu ses versions et ce que la personne en possède.
-- 3. collection_progress : jeux possédés sur jeux existants, par zone et
--    par famille de genres.
--
-- Règle de comptage : une version possédée compte pour son jeu. Black Label
-- ou Platinum, le jeu est « dans la collection ». Les deux fonctions ne
-- regardent QUE la collection de la personne connectée, même si d'autres
-- collections sont publiques.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Familles de genres
-- ---------------------------------------------------------------------
create type public.genre_family as enum (
  'action', 'adventure', 'rpg', 'platform', 'fighting', 'shooter', 'racing', 'sports',
  'puzzle', 'strategy', 'simulation', 'music', 'horror', 'visual_novel', 'party'
);

alter table public.genre add column family public.genre_family;
comment on column public.genre.family is
  'Grande famille (RPG, Course…) pour les filtres et la progression. Vide pour un thème (science-fiction, Noël…).';

-- Classement des genres importés, par identifiant Wikidata (stable même si
-- un nom change). Les genres absents de cette liste sont des thèmes.
update public.genre set family = 'rpg' where wikidata_id in (
  'Q744038', -- RPG
  'Q1529437', -- Tactical RPG
  'Q1422746', -- Action-RPG
  'Q5923834', -- JRPG
  'Q104735362', -- JRPG au tour par tour
  'Q1143132'  -- Roguelike
);
update public.genre set family = 'action' where wikidata_id in (
  'Q270948', -- Jeu d'action
  'Q401831', -- Beat them all
  'Q1163960', -- Hack and slash
  'Q858523', -- Jeu d'infiltration
  'Q2070892', -- Jeu de combat motorisé
  'Q57775833'  -- Jeu de coureurs sans fin
);
update public.genre set family = 'adventure' where wikidata_id in (
  'Q23916', -- Jeu d'aventure
  'Q343568', -- Jeu d'action-aventure
  'Q11590806', -- Jeu d'aventure point'n click
  'Q2628513', -- Jeu d'aventure graphique
  'Q1635956', -- Film interactif
  'Q1473699', -- Full motion video
  'Q16381999', -- Myst-like
  'Q2903135', -- Interactive storytelling
  'Q60617825', -- Jeu de mystère
  'Q132151524', -- Murder mystery game
  'Q33183362'  -- Walking simulator
);
update public.genre set family = 'platform' where wikidata_id in (
  'Q828322', -- Jeu de plates-formes
  'Q116790461', -- Jeu de plateforme en 3D
  'Q116790414', -- Jeu de plates-formes 2D
  'Q62591185', -- Jeu de plates-formes et de réflexion
  'Q96195505', -- Cinematic platformer
  'Q136849242', -- Isometric platformer
  'Q19643088'  -- Metroidvania
);
update public.genre set family = 'fighting' where wikidata_id in (
  'Q846224', -- Jeu de combat
  'Q130270628', -- 3D fighting game
  'Q127602751', -- Jeu de combat en 2D
  'Q105221690'  -- Jeu de catch
);
update public.genre set family = 'shooter' where wikidata_id in (
  'Q1044478', -- Shoot 'em up
  'Q185029', -- Jeu de tir en vue subjective
  'Q380266', -- Jeu de tir à la troisième personne
  'Q4282636', -- Jeu de tir
  'Q60480500', -- Run & Gun
  'Q96146237', -- Jeu de tir à défilement vertical
  'Q3965952', -- Jeu de tir au pistolet optique
  'Q1260861', -- Jeu de tir tactique
  'Q66230650', -- Tube shooter
  'Q2127647', -- Rail shooter
  'Q821157', -- Manic shooter
  'Q96146284', -- Shoot 'em up fixe
  'Q78145485', -- Shooter multi-directionnel
  'Q107527031', -- Tir en vue de dessus
  'Q1055974', -- Pistolet optique
  'Q122207', -- Jeu d'artillerie
  'Q21154509'  -- Jeu de combat spatial
);
update public.genre set family = 'racing' where wikidata_id in (
  'Q860750', -- Jeu de course
  'Q1417032', -- Sim racing
  'Q18759108', -- Jeu de course de karting
  'Q109656536', -- Jeu de course futuriste
  'Q116680021', -- Driving video game
  'Q131317489', -- Mascot racer
  'Q111411020', -- Jeu de moto
  'Q109470190', -- Jeu de NASCAR
  'Q71477837', -- Personal watercraft racing video game
  'Q140089489'  -- Kyōtei video game
);
update public.genre set family = 'sports' where wikidata_id in (
  'Q868217', -- Jeu de sport
  'Q1478420', -- Jeu de football
  'Q63915391', -- Jeu de football américain
  'Q63915027', -- Jeu de basket-ball
  'Q71474750', -- Jeu de hockey sur glace
  'Q62019045', -- Jeu de baseball
  'Q60256879', -- Jeu de golf
  'Q61793886', -- Jeu de tennis
  'Q61719251', -- Jeu de bowling
  'Q7548531', -- Jeu de snowboard
  'Q3177953', -- Jeu de boxe
  'Q32112', -- Boxe
  'Q63645120', -- Jeu d'athlétisme
  'Q71471935', -- Jeu de sports extrêmes
  'Q71468194', -- Jeu de skateboard
  'Q108611897', -- Jeu de sport hippique
  'Q63243980', -- Jeu de billard américain
  'Q108099928', -- Billiard video game
  'Q62022558', -- Jeu de billard
  'Q71441946', -- Jeu de snooker
  'Q62019097', -- Jeu de beach-volley
  'Q62019104', -- Jeu de crosse
  'Q63915162', -- Jeu de dodgeball
  'Q71467370', -- Jeu de ski
  'Q71467408', -- Jeu de sport d'hiver
  'Q71476528', -- Jeu de sports nautiques
  'Q61793874', -- Jeu de surf
  'Q16935625', -- Jeu de pêche
  'Q71474253', -- Jeu de chasse
  'Q96678034', -- BMX video game
  'Q7089173'  -- Liste de jeux vidéo basés sur les Jeux olympiques
);
update public.genre set family = 'puzzle' where wikidata_id in (
  'Q54767', -- Jeu de réflexion
  'Q10308060', -- Falling block puzzle game
  'Q13717398', -- Jeu de labyrinthe
  'Q2941225', -- Casse-briques
  'Q110505373', -- Jeu de picross
  'Q134448311', -- Puzz Loop clone
  'Q11282930'  -- Jeu d'action puzzle
);
update public.genre set family = 'strategy' where wikidata_id in (
  'Q472055', -- Jeu de stratégie
  'Q208189', -- Stratégie en temps réel
  'Q2176159', -- Jeu de stratégie au tour par tour
  'Q2313710', -- Jeu de tactique en temps réel
  'Q4375640', -- Jeu de tactique au tour par tour
  'Q3139142', -- Jeu de grande stratégie
  'Q603555', -- Jeu 4X
  'Q2454898'  -- Jeu de guerre sur ordinateur
);
update public.genre set family = 'simulation' where wikidata_id in (
  'Q1610017', -- Jeu de simulation
  'Q1892535', -- Simulateur de vol spatial
  'Q1198141', -- Jeu de gestion économique
  'Q1199309', -- Jeu de simulation de vie
  'Q603481', -- Simulateur de vol de combat
  'Q1036289', -- Jeu de gestion
  'Q56298645', -- Jeu de gestion de football
  'Q124695018', -- Management simulation game
  'Q25861761', -- Simulateur d'animaux virtuels
  'Q4419886', -- Simulateur de mecha
  'Q4740553', -- Simulateur de vol
  'Q1080071', -- Simulateur de sous-marin
  'Q4451239', -- Simulation de tanks
  'Q578868', -- Simulation de véhicule
  'Q221181', -- Simulation ferroviaire
  'Q7551387', -- Jeu de simulation sociale
  'Q263847', -- Vie artificielle
  'Q588289', -- City-builder
  'Q536420', -- God game
  'Q61507686'  -- Jeu de commerce et de combat spatial
);
update public.genre set family = 'music' where wikidata_id in (
  'Q584105', -- Jeu vidéo musical
  'Q2632782'  -- Jeu de rythme
);
update public.genre set family = 'horror' where wikidata_id in (
  'Q333967', -- Survival horror
  'Q11338014', -- Jeu vidéo d’horreur
  'Q604725'  -- Horreur psychologique
);
update public.genre set family = 'visual_novel' where wikidata_id in (
  'Q689445', -- Visual novel
  'Q1339223', -- Simulation de drague
  'Q1323555', -- Jeu vidéo Bishōjo
  'Q1049203', -- Jeu vidéo Otome
  'Q8018891', -- Romance adventure game
  'Q14411698'  -- Romance video game
);
update public.genre set family = 'party' where wikidata_id in (
  'Q7888616', -- Party game
  'Q1192658', -- Mini-jeu
  'Q126598654', -- Minigame collection
  'Q19272838', -- Jeu de plateau
  'Q653928', -- Flipper
  'Q3177954', -- Jeu de flipper
  'Q9318902', -- Jeu de mah-jong
  'Q96102031', -- Shogi video game
  'Q71679871', -- Jeu d'échecs
  'Q48997688', -- Jeu de cartes à collectionner
  'Q67016067', -- Jeu de bataille de cartes
  'Q3742351', -- Jeu de casino
  'Q60617897', -- Jeu de hasard
  'Q60617905', -- Jeu télévisé
  'Q11298493', -- Jeu de quiz
  'Q60617948'  -- Jeu de trivia
);


-- ---------------------------------------------------------------------
-- 2. Le catalogue, page par page
--    Une ligne par jeu, avec ses versions de la console et de la zone
--    choisies. Filtres facultatifs (null = pas de filtre) :
--      first_letter : 'a' à 'z', ou '#' pour les titres qui commencent par un chiffre ;
--      ownership    : 'owned' (possédés), 'missing' (manquants), 'wanted' (recherchés) ;
--      sort_by      : 'title' (par défaut) ou 'date'.
-- ---------------------------------------------------------------------
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
  page_size int default 50
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
  -- Versions retenues : celles de la console et de la zone choisies
  rel as (
    select r.id, r.game_id, r.local_title, r.local_title_key, r.product_code_key, r.edition_type,
           (select min(rr.release_date) from public.release_region rr where rr.release_id = r.id) as release_date
    from public.release r
    cross join params
    where (platform_code is null or r.platform_id = params.pid)
      and (zone_code is null or r.zone = zone_code)
  ),
  -- Ce que la personne connectée possède ou cherche (rien pour un visiteur)
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
      -- Titre affiché : celui de la version standard de la zone (« Biohazard » au Japon)
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
        where gg.game_id = g.id and ge.family = family_code
      ))
      and (case ownership
             when 'owned' then pg.owned
             when 'missing' then not pg.owned
             when 'wanted' then pg.wanted
             else true
           end)
  ),
  -- Lettre et année, puis la page demandée (le total est compté avant la découpe)
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
  -- Jaquette : celle de la zone choisie si possible, sinon une autre (signalée)
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

revoke execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int) from public;
grant execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Progression : jeux possédés sur jeux existants
--    scope 'zone'   : une ligne par zone, plus 'all' (toutes zones) ;
--    scope 'family' : une ligne par famille de genres, dans la zone choisie
--                     (toutes si null), plus 'known' : les jeux dont au moins
--                     un genre a une famille (pour dire combien sont classés).
--    wanted : jeux pour lesquels au moins une version est « recherchée ».
-- ---------------------------------------------------------------------
create function public.collection_progress(platform_code text default 'PS1', zone_code public.video_zone default null)
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
  -- Un jeu par zone : possédé dès qu'une de ses versions de cette zone l'est
  game_zone as (
    select r.game_id, r.zone,
           bool_or(coalesce(m.owned, false)) as owned,
           bool_or(coalesce(m.wanted, false)) as wanted
    from public.release r
    cross join params
    left join mine m on m.release_id = r.id
    where platform_code is null or r.platform_id = params.pid
    group by r.game_id, r.zone
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
  scoped_family as (
    select distinct s.game_id, ge.family, s.owned, s.wanted
    from scoped s
    join public.game_genre gg on gg.game_id = s.game_id
    join public.genre ge on ge.id = gg.genre_id
    where ge.family is not null
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
  from (select distinct sf.game_id, sf.owned, sf.wanted from scoped_family sf) k;
$$;

revoke execute on function public.collection_progress(text, public.video_zone) from public;
grant execute on function public.collection_progress(text, public.video_zone) to anon, authenticated;
