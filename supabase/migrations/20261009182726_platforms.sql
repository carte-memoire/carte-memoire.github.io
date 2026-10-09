-- =====================================================================
-- Carte Mémoire · Migration : les consoles les plus connues
--
-- Seule la PS1 a des jeux pour l'instant, mais toutes les consoles sont
-- déclarées : le sélecteur de la page d'accueil et les formulaires les
-- proposent déjà. Identifiants Wikidata vérifiés le 9 octobre 2026.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Constructeurs
--    Une société déjà importée (même nom) est reliée à son identifiant
--    Wikidata au lieu d'être créée une seconde fois.
-- ---------------------------------------------------------------------
create temporary table import_maker (name text, country text, wikidata_id text);
insert into import_maker values
  ('Nintendo',        'JP', 'Q8093'),
  ('Sega',            'JP', 'Q122741'),
  ('Microsoft',       'US', 'Q2283'),
  ('Atari, Inc.',     'US', 'Q13409231'),
  ('NEC',             'JP', 'Q219203'),
  ('SNK',             'JP', 'Q1073880');

with candidate as (
  select distinct on (i.wikidata_id) c.id, i.wikidata_id
  from import_maker i
  join public.company c on c.wikidata_id is null and c.name_key = public.normalize_name(i.name)
  where not exists (select 1 from public.company x where x.wikidata_id = i.wikidata_id)
  order by i.wikidata_id, c.id
)
update public.company c set wikidata_id = k.wikidata_id
from candidate k
where c.id = k.id;

insert into public.company (name, country, wikidata_id)
select name, country, wikidata_id from import_maker
on conflict (wikidata_id) do nothing;

drop table import_maker;


-- ---------------------------------------------------------------------
-- 2. Consoles (la PS1 existe déjà)
-- ---------------------------------------------------------------------
insert into public.platform (name, short_name, generation, type, media, launch_date, manufacturer_id, wikidata_id)
select v.name, v.short_name, v.generation, v.type::public.platform_type, v.media, v.launch_date::date, c.id, v.wikidata_id
from (values
  -- Sony
  ('PlayStation 2',    'PS2',  6, 'home',     'DVD',              '2000-03-04', 'Q18594',    'Q10680'),
  ('PlayStation 3',    'PS3',  7, 'home',     'Blu-ray',          '2006-11-11', 'Q18594',    'Q10683'),
  ('PlayStation 4',    'PS4',  8, 'home',     'Blu-ray',          '2013-11-15', 'Q18594',    'Q5014725'),
  ('PlayStation 5',    'PS5',  9, 'home',     'Blu-ray',          '2020-11-12', 'Q18594',    'Q63184502'),
  ('PSP',              'PSP',  7, 'handheld', 'UMD',              '2004-12-12', 'Q18594',    'Q170325'),
  ('PS Vita',          'PSV',  8, 'handheld', 'Carte de jeu',     '2011-12-17', 'Q18594',    'Q188808'),
  -- Nintendo
  ('NES',              'NES',  3, 'home',     'Cartouche',        '1983-07-15', 'Q8093',     'Q172742'),
  ('Super Nintendo',   'SNES', 4, 'home',     'Cartouche',        '1990-11-21', 'Q8093',     'Q183259'),
  ('Nintendo 64',      'N64',  5, 'home',     'Cartouche',        '1996-06-23', 'Q8093',     'Q184839'),
  ('GameCube',         'GC',   6, 'home',     'Mini-DVD',         '2001-09-14', 'Q8093',     'Q182172'),
  ('Wii',              'WII',  7, 'home',     'DVD',              '2006-11-19', 'Q8093',     'Q8079'),
  ('Wii U',            'WIIU', 8, 'home',     'Disque optique',   '2012-11-18', 'Q8093',     'Q56942'),
  ('Switch',           'NSW',  8, 'hybrid',   'Cartouche',        '2017-03-03', 'Q8093',     'Q19610114'),
  ('Switch 2',         'NSW2', 9, 'hybrid',   'Cartouche',        '2025-06-05', 'Q8093',     'Q122761124'),
  ('Game Boy',         'GB',   4, 'handheld', 'Cartouche',        '1989-04-21', 'Q8093',     'Q186437'),
  ('Game Boy Color',   'GBC',  5, 'handheld', 'Cartouche',        '1998-10-21', 'Q8093',     'Q203992'),
  ('Game Boy Advance', 'GBA',  6, 'handheld', 'Cartouche',        '2001-03-21', 'Q8093',     'Q188642'),
  ('Nintendo DS',      'NDS',  7, 'handheld', 'Carte de jeu',     '2004-11-21', 'Q8093',     'Q170323'),
  ('Nintendo 3DS',     '3DS',  8, 'handheld', 'Carte de jeu',     '2011-02-26', 'Q8093',     'Q203597'),
  -- Sega
  ('Master System',    'SMS',  3, 'home',     'Cartouche',        '1985-10-20', 'Q122741',   'Q209868'),
  ('Mega Drive',       'MD',   4, 'home',     'Cartouche',        '1988-10-29', 'Q122741',   'Q10676'),
  ('Game Gear',        'GG',   4, 'handheld', 'Cartouche',        '1990-10-06', 'Q122741',   'Q751719'),
  ('Saturn',           'SAT',  5, 'home',     'CD-ROM',           '1994-11-22', 'Q122741',   'Q200912'),
  ('Dreamcast',        'DC',   6, 'home',     'GD-ROM',           '1998-11-27', 'Q122741',   'Q184198'),
  -- Microsoft
  ('Xbox',             'XBOX', 6, 'home',     'DVD',              '2001-11-15', 'Q2283',     'Q132020'),
  ('Xbox 360',         'X360', 7, 'home',     'DVD',              '2005-11-22', 'Q2283',     'Q48263'),
  ('Xbox One',         'XONE', 8, 'home',     'Blu-ray',          '2013-11-22', 'Q2283',     'Q13361286'),
  ('Xbox Series',      'XSX',  9, 'home',     'Blu-ray',          '2020-11-10', 'Q2283',     'Q98973368'),
  -- Autres
  ('Atari 2600',       '2600', 2, 'home',     'Cartouche',        '1977-09-11', 'Q13409231', 'Q206261'),
  ('PC Engine',        'PCE',  4, 'home',     'HuCard',           '1987-10-30', 'Q219203',   'Q1057377'),
  ('Neo-Geo',          'NEO',  4, 'home',     'Cartouche',        '1990-04-26', 'Q1073880',  'Q1054350')
) as v (name, short_name, generation, type, media, launch_date, maker_qid, wikidata_id)
join public.company c on c.wikidata_id = v.maker_qid
on conflict (short_name) do nothing;


-- ---------------------------------------------------------------------
-- 3. Liste des consoles avec leur nombre de jeux (pour le sélecteur)
-- ---------------------------------------------------------------------
create function public.list_platforms()
returns table (
  id bigint,
  name text,
  short_name text,
  manufacturer text,
  generation smallint,
  type public.platform_type,
  game_count int
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.short_name, c.name, p.generation, p.type,
         (select count(distinct r.game_id)::int from public.release r where r.platform_id = p.id)
  from public.platform p
  left join public.company c on c.id = p.manufacturer_id
  order by c.name nulls last, p.launch_date nulls last, p.name;
$$;

revoke execute on function public.list_platforms() from public;
grant execute on function public.list_platforms() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Recherche filtrable par console
--    (nouveau paramètre : on supprime l'ancienne version, sinon les deux
--    coexisteraient et l'appel deviendrait ambigu)
-- ---------------------------------------------------------------------
drop function public.search_games(text, int);

create function public.search_games(search text, max_results int default 20, platform_code text default null)
returns table (
  id bigint,
  title text,
  first_release_date date,
  matched_title text,
  release_count int,
  cover_path text
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select public.normalize_name(search) as k,
           (select p.id from public.platform p where p.short_name = platform_code) as pid
  )
  select
    g.id,
    g.title,
    g.first_release_date,
    coalesce(m.local_title, g.title) as matched_title,
    (select count(*)::int from public.release r
     where r.game_id = g.id and (q.pid is null or r.platform_id = q.pid)) as release_count,
    -- Une jaquette : de préférence sur la console choisie, puis européenne
    (
      select i.path
      from public.image i
      join public.release r on r.id = i.release_id
      where r.game_id = g.id and i.type = 'front'
      order by (r.platform_id = q.pid) desc nulls last, (r.zone = 'PAL') desc nulls last, r.id, i.id
      limit 1
    ) as cover_path
  from q
  cross join public.game g
  left join lateral (
    select r.local_title
    from public.release r
    where r.game_id = g.id
      and (q.pid is null or r.platform_id = q.pid)
      and r.local_title_key like '%' || q.k || '%'
      and r.local_title_key is distinct from g.title_key
    order by length(r.local_title)
    limit 1
  ) m on true
  where length(q.k) >= 2
    -- Console inconnue : aucun résultat plutôt que tous les jeux
    and (platform_code is null or q.pid is not null)
    and (q.pid is null or exists (
      select 1 from public.release r where r.game_id = g.id and r.platform_id = q.pid
    ))
    and (
      g.title_key like '%' || q.k || '%'
      or exists (
        select 1 from public.release r
        where r.game_id = g.id
          and (q.pid is null or r.platform_id = q.pid)
          and r.local_title_key like '%' || q.k || '%'
      )
    )
  order by
    (g.title_key = q.k) desc,
    (g.title_key like q.k || '%') desc,
    extensions.similarity(g.title_key, q.k) desc,
    g.title
  limit least(greatest(coalesce(max_results, 20), 1), 50);
$$;

revoke execute on function public.search_games(text, int, text) from public;
grant execute on function public.search_games(text, int, text) to anon, authenticated;
