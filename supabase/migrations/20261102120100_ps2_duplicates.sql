-- =====================================================================
-- Doublons PS2 : le même jeu en deux fiches (audit du 22 novembre 2026)
--
-- Wikidata a souvent deux éléments pour un jeu PS2 : celui de l'œuvre d'origine
-- (souvent sur une autre console : Ys V sur Super Nintendo, Crimson Sea sur Xbox…)
-- et celui de la version PS2. L'import Wikipédia avait rattaché les versions à
-- l'élément de l'œuvre, l'import Wikidata avait créé une deuxième fiche avec
-- l'élément PS2. Pour chaque paire :
--   - tout passe sur une seule fiche (versions, genres, studios, séries, résumé) ;
--   - la fiche garde l'élément Wikidata PROPRE À LA PS2 : sans quoi, à l'import des
--     consoles rétro, le Ys V de la Super Nintendo se serait collé au remake PS2 ;
--   - les versions devenues doubles (même zone, même édition) sont fusionnées ;
--   - la date la plus précise est gardée, et l'adresse simple (/jeu/ps2/titre) revient
--     à la fiche gardée ; l'ancienne adresse du doublon mène toujours au jeu.
-- Gardés séparés, vérifiés : Cabela's Outdoor Adventures (2005 et 2009) et
-- Transformers (2003, Takara ; 2004, Atari) sont deux jeux chacun. Gadget Racers est
-- laissé à la décision d'un modérateur (titres japonais Choro Q HG et HG 3 mêlés).
-- Defender : la fiche de 1981 (jeu d'arcade) n'avait rien à faire sur PS2 ; elle est
-- fusionnée dans le Defender de 2002 SANS reprendre ses studios ni ses genres.
-- Sur une base qui n'a pas ces jeux (tests), chaque paire absente est ignorée.
-- =====================================================================

-- 1. merge_games : l'origine (pays du studio) du doublon n'est plus perdue
create or replace function public.merge_games(keep_id bigint, duplicate_id bigint, force boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  dup public.game;
begin
  -- Sans utilisateur connecté, c'est une migration ou un script serveur
  -- (les visiteurs n'ont pas le droit d'appeler la fonction).
  if (select auth.uid()) is not null
     and not ((select private.is_moderator()) and (select private.is_aal2())) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent fusionner des fiches';
  end if;
  if keep_id = duplicate_id then
    raise exception 'Impossible de fusionner un jeu avec lui-même';
  end if;

  select * into dup from public.game where id = duplicate_id;
  if not found or not exists (select 1 from public.game where id = keep_id) then
    raise exception 'Jeu introuvable';
  end if;
  if not force and exists (
    select 1 from public.game k
    where k.id = keep_id and k.wikidata_id is not null
      and dup.wikidata_id is not null and k.wikidata_id <> dup.wikidata_id
  ) then
    raise exception 'Ces deux jeux ont des identifiants Wikidata différents : ce sont sans doute deux jeux distincts';
  end if;

  insert into public.game_developer (game_id, company_id)
  select keep_id, company_id from public.game_developer where game_id = duplicate_id
  on conflict do nothing;
  insert into public.game_genre (game_id, genre_id)
  select keep_id, genre_id from public.game_genre where game_id = duplicate_id
  on conflict do nothing;
  insert into public.game_series (game_id, series_id)
  select keep_id, series_id from public.game_series where game_id = duplicate_id
  on conflict do nothing;

  update public.release set game_id = keep_id where game_id = duplicate_id;
  perform private.relink_submissions(duplicate_id, keep_id);
  delete from public.game where id = duplicate_id;

  update public.game k set
    wikidata_id             = coalesce(k.wikidata_id, dup.wikidata_id),
    summary                 = coalesce(k.summary, dup.summary),
    origin_country          = coalesce(k.origin_country, dup.origin_country),
    first_release_precision = case when k.first_release_date is null then dup.first_release_precision else k.first_release_precision end,
    first_release_date      = coalesce(k.first_release_date, dup.first_release_date)
  where k.id = keep_id;

  delete from public.release r
  where r.game_id = keep_id and r.zone is null and r.product_code is null and r.edition_type = 'standard'
    and not exists (select 1 from public.image i where i.release_id = r.id)
    and not exists (select 1 from public.collection_item c where c.release_id = r.id)
    and not exists (select 1 from public.release_region rr where rr.release_id = r.id and rr.release_date is not null)
    and not exists (select 1 from public.release x where x.reissue_of = r.id)
    and exists (select 1 from public.release o where o.game_id = keep_id and o.id <> r.id);
end;
$$;

-- 2. Une paire : p_keep = élément Wikidata de la fiche qui a les versions,
-- p_dup = celui de l'autre fiche, p_final = celui que garde la fiche fusionnée
create function pg_temp.merge_duplicate(p_keep text, p_dup text, p_final text, p_dup_links boolean default true)
returns void
language plpgsql
as $$
declare
  v_keep     bigint;
  v_dup      bigint;
  v_dup_game public.game;
  v_releases bigint[];
  v_devs     bigint[];
  v_genres   bigint[];
  v_game     public.game;
  v_plain    text;
  d          public.release;
  k          bigint;
begin
  select id into v_keep from public.game where wikidata_id = p_keep;
  select * into v_dup_game from public.game where wikidata_id = p_dup;
  v_dup := v_dup_game.id;
  if v_keep is null or v_dup is null or v_keep = v_dup then
    raise notice 'Paire % / % absente : ignorée', p_keep, p_dup;
    return;
  end if;
  select coalesce(array_agg(id), '{}') into v_releases from public.release where game_id = v_dup;
  select coalesce(array_agg(company_id), '{}') into v_devs from public.game_developer where game_id = v_keep;
  select coalesce(array_agg(genre_id), '{}') into v_genres from public.game_genre where game_id = v_keep;

  perform public.merge_games(v_keep, v_dup, true);

  -- Studios et genres d'un faux doublon (Defender de 1981) : refusés
  if not p_dup_links then
    delete from public.game_developer where game_id = v_keep and company_id <> all (v_devs);
    delete from public.game_genre where game_id = v_keep and genre_id <> all (v_genres);
  end if;

  update public.game set wikidata_id = p_final where id = v_keep and wikidata_id is distinct from p_final;

  -- La date la plus précise des deux, si elles parlent de la même année
  update public.game g set first_release_date = v_dup_game.first_release_date,
                           first_release_precision = v_dup_game.first_release_precision
  where g.id = v_keep and p_dup_links
    and v_dup_game.first_release_date is not null
    and extract(year from g.first_release_date) = extract(year from v_dup_game.first_release_date)
    and (g.first_release_precision = 'year' and v_dup_game.first_release_precision in ('month', 'day')
      or g.first_release_precision = 'month' and v_dup_game.first_release_precision = 'day');

  -- Versions devenues doubles : même console, même zone, même édition, codes compatibles
  for d in select * from public.release where id = any (v_releases) order by id loop
    select r.id into k from public.release r
    where r.game_id = v_keep and r.id <> d.id and not (r.id = any (v_releases))
      and r.platform_id = d.platform_id and r.zone is not distinct from d.zone
      and r.edition_type = d.edition_type
      and (r.product_code is null or d.product_code is null or r.product_code = d.product_code)
    order by (r.product_code is null), r.id
    limit 1;
    if k is not null then
      update public.release set product_code = d.product_code where id = k and product_code is null and d.product_code is not null;
      perform private.merge_releases(k, d.id);
    end if;
  end loop;

  -- Adresse simple (/jeu/ps2/titre), libérée par le doublon : elle revient à la fiche
  select * into v_game from public.game where id = v_keep;
  v_plain := split_part(v_game.slug, '/', 1) || '/' || public.slugify(coalesce(v_game.slug_title, v_game.title));
  if v_game.slug is not null and v_game.slug <> v_plain
     and not exists (select 1 from public.game g where g.slug = v_plain and g.id <> v_keep)
     and not exists (select 1 from public.game_slug_history h where h.slug = v_plain and h.game_id <> v_keep) then
    insert into public.game_slug_history (slug, game_id) values (v_game.slug, v_keep)
    on conflict (slug) do update set game_id = excluded.game_id;
    delete from public.game_slug_history where slug = v_plain;
    update public.game set slug = v_plain where id = v_keep;
  end if;
end;
$$;

--                              fiche aux versions   autre fiche     élément gardé
select pg_temp.merge_duplicate('Q2943865',  'Q103067818', 'Q103067818'); -- Cel Damage Overdrive
select pg_temp.merge_duplicate('Q5185708',  'Q50272813',  'Q50272813');  -- Crimson Sea 2 (rattaché à Crimson Sea, Xbox)
select pg_temp.merge_duplicate('Q5215110',  'Q5215108',   'Q5215108');   -- Dance Dance Revolution X2 (rattaché à l'arcade)
select pg_temp.merge_duplicate('Q21039876', 'Q1182593',   'Q21039876', false); -- Defender (2002 ; pas l'arcade de 1981)
select pg_temp.merge_duplicate('Q909130',   'Q8375136',   'Q8375136');   -- Gradius III and IV (rattaché à Gradius IV)
select pg_temp.merge_duplicate('Q457957',   'Q6007482',   'Q6007482');   -- Impossible Mission (remake 2007, pas l'original 1984)
select pg_temp.merge_duplicate('Q63165538', 'Q843205',    'Q63165538');  -- Kingdom Hearts Re:Chain of Memories (pas Chain of Memories GBA)
select pg_temp.merge_duplicate('Q1069373',  'Q137216114', 'Q137216114'); -- Lumines Plus (rattaché à Lumines, PSP)
select pg_temp.merge_duplicate('Q1131067',  'Q3541765',   'Q3541765');   -- Pipe Mania (remake 2008, pas l'original 1989)
select pg_temp.merge_duplicate('Q726545',   'Q2087318',   'Q2087318');   -- Quake III Revolution (rattaché à Quake III Arena)
select pg_temp.merge_duplicate('Q1050284',  'Q136756899', 'Q136756899'); -- Resident Evil Code: Veronica X
select pg_temp.merge_duplicate('Q664795',   'Q47461217',  'Q47461217');  -- Rockman: Power Battle Fighters (rattaché à l'arcade)
select pg_temp.merge_duplicate('Q1065670',  'Q61091433',  'Q61091433');  -- Shuffle! On the Stage (rattaché au jeu PC)
select pg_temp.merge_duplicate('Q88323752', 'Q2422173',   'Q88323752');  -- Sonic Mega Collection Plus (pas Sonic Mega Collection, GameCube)
select pg_temp.merge_duplicate('Q1970425',  'Q7934910',   'Q7934910');   -- Virtua Cop: Elite Edition (rattaché à Virtua Cop)
select pg_temp.merge_duplicate('Q63165269', 'Q907618',    'Q63165269');  -- Ys III: Wanderers from Ys (remake PS2)
select pg_temp.merge_duplicate('Q2450491',  'Q56707738',  'Q56707738');  -- Ys V: Lost Kefin, Kingdom of Sand (rattaché à la Super Nintendo)

drop function pg_temp.merge_duplicate(text, text, text, boolean);

-- 3. Deux jeux distincts au même titre : retirés de la liste « Doublons possibles »
insert into public.dismissed_duplicate (title_key, game_ids, dismissed_by)
select g.title_key, array_agg(g.id order by g.id), null
from public.game g
where g.wikidata_id in ('Q5015339', 'Q5015340', 'Q2119848', 'Q3997509')
group by g.title_key
having count(*) > 1
on conflict (title_key) do update set game_ids = excluded.game_ids;
