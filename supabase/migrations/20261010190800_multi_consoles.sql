-- =====================================================================
-- Carte Mémoire · Le site prêt pour plusieurs consoles (avant l'import PS2)
--
-- Un même jeu peut désormais avoir des versions PS1 ET PS2 (Wikidata décrit
-- l'œuvre, pas la console : « Tony Hawk's Pro Skater 3 » est un seul jeu).
--   1. Caractéristiques des versions PS2 (carte mémoire en Ko, commandes
--      analogiques, 16:9, 480p, son, périphériques…)
--   2. Jaquette « en attendant » : seulement celle d'une version de la MÊME
--      console (une boîte PS1 n'aide pas à reconnaître la version PS2)
--   3. File « Jaquettes manquantes » : la console de chaque version, pour
--      chercher la bonne image quand on regarde toutes les consoles
--   4. Doublons possibles : deux jeux du même nom sur deux consoles, chacun
--      avec sa fiche Wikidata, sont deux œuvres (« Spider-Man » PS1 de 2000,
--      PS2 de 2002) : ils ne sont plus signalés aux modérateurs
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Caractéristiques PS2 (mêmes conventions que la PS1 : clés et valeurs en
--    anglais, libellés en français, traduits par le site)
-- ---------------------------------------------------------------------
update public.platform
set spec_fields = $json$[
  { "key": "memory_card_kb", "label": "Carte mémoire (Ko)", "type": "integer", "min": 1, "max": 8192 },
  { "key": "analog", "label": "Commandes analogiques", "type": "choice",
    "options": [
      { "value": "no", "label": "Non" },
      { "value": "sticks", "label": "Joysticks seulement" },
      { "value": "all_buttons", "label": "Tous les boutons" }
    ] },
  { "key": "vibration", "label": "Vibrations", "type": "boolean" },
  { "key": "multitap", "label": "Compatible Multitap", "type": "boolean" },
  { "key": "online", "label": "Jeu en ligne", "type": "boolean" },
  { "key": "display", "label": "Affichage", "type": "multi_choice",
    "options": [
      { "value": "widescreen", "label": "16:9" },
      { "value": "progressive", "label": "480p (progressif)" },
      { "value": "hz60", "label": "Mode 60 Hz" }
    ] },
  { "key": "audio", "label": "Son", "type": "multi_choice",
    "options": [
      { "value": "dolby_pl2", "label": "Dolby Pro Logic II" },
      { "value": "dolby_digital", "label": "Dolby Digital" },
      { "value": "dts", "label": "DTS" }
    ] },
  { "key": "peripherals", "label": "Périphériques", "type": "multi_choice",
    "options": [
      { "value": "eyetoy", "label": "EyeToy" },
      { "value": "guncon2", "label": "GunCon 2" },
      { "value": "wheel", "label": "Volant" },
      { "value": "headset", "label": "Micro-casque" },
      { "value": "microphone", "label": "Micro" },
      { "value": "buzz", "label": "Buzzers" },
      { "value": "guitar", "label": "Guitare" },
      { "value": "dance_mat", "label": "Tapis de danse" },
      { "value": "keyboard", "label": "Clavier USB" },
      { "value": "mouse", "label": "Souris USB" },
      { "value": "hdd", "label": "Disque dur" }
    ] }
]$json$::jsonb
where short_name = 'PS2';


-- ---------------------------------------------------------------------
-- 2. et 3. File des versions sans jaquette : console de chaque version, et
--    jaquette « en attendant » prise sur la même console uniquement
--    (nouvelle colonne en sortie : on supprime l'ancienne version)
-- ---------------------------------------------------------------------
drop function public.releases_without_cover(text, public.edition_type, public.video_zone, text, int, int);

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
  total_count int,
  platform_short_name text
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
           r.edition_type, r.edition_name, r.reissue_of, r.platform_id
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
       where r.game_id = p.game_id and r.platform_id = p.platform_id and i.type = 'front'
       order by (r.zone is not distinct from p.zone) desc, (r.edition_type = 'standard') desc, r.id, i.id limit 1)
    ),
    p.total_count,
    (select pl.short_name from public.platform pl where pl.id = p.platform_id)
  from paged p
  order by p.title_key, p.id;
$$;

revoke execute on function public.releases_without_cover(text, public.edition_type, public.video_zone, text, int, int) from public, anon;
grant execute on function public.releases_without_cover(text, public.edition_type, public.video_zone, text, int, int) to authenticated;


-- ---------------------------------------------------------------------
-- 2. (suite) Page publique d'une collection : même règle pour la jaquette
--    d'un exemplaire dont la version n'a pas de recto
-- ---------------------------------------------------------------------
create or replace function public.public_collection(member text)
returns table (
  status public.item_status, release_id bigint, game_id bigint, game_title text, local_title text,
  zone public.video_zone, edition_type public.edition_type, edition_name text, languages text[], platform text,
  cover_path text, release_date date, condition public.item_condition,
  has_box boolean, has_manual boolean, has_media boolean, has_spine_card boolean, trade_status public.trade_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.status, r.id, g.id, g.title, r.local_title, r.zone, r.edition_type, r.edition_name, r.languages, pl.short_name,
         coalesce(
           (select i.path from public.image i where i.release_id = r.id and i.type = 'front' order by i.id limit 1),
           (select i.path from public.image i join public.release r2 on r2.id = i.release_id
            where r2.game_id = g.id and r2.platform_id = r.platform_id and i.type = 'front'
            order by (r2.zone = r.zone) desc nulls last, (r2.edition_type = 'standard') desc, r2.id, i.id limit 1)
         ),
         coalesce((select min(rr.release_date) from public.release_region rr where rr.release_id = r.id), g.first_release_date),
         c.condition, c.has_box, c.has_manual, c.has_media, c.has_spine_card, c.trade_status
  from public.profile p
  join public.collection_item c on c.profile_id = p.id
  join public.release r on r.id = c.release_id
  join public.game g on g.id = r.game_id
  join public.platform pl on pl.id = r.platform_id
  where lower(p.username) = lower(member)
    and (p.public_collection or p.id = (select auth.uid()))
  order by g.title_key, r.zone, r.id, c.id;
$$;


-- ---------------------------------------------------------------------
-- 4. Doublons possibles (onglet Modération) : même titre normalisé, et
--    - deux des fiches ont une version sur la même console,
--    - ou l'une n'a pas d'identifiant Wikidata (peut-être la même œuvre).
--    Deux fiches Wikidata distinctes, chacune sur sa console : pas signalées.
-- ---------------------------------------------------------------------
create or replace view public.possible_duplicate_game
with (security_invoker = true) as
select g.title_key,
       count(*)::int                 as total,
       array_agg(g.id order by g.id) as game_ids,
       array_agg(g.title order by g.id) as titles
from public.game g
group by g.title_key
having count(*) > 1
   and not exists (
     select 1 from public.dismissed_duplicate d
     where d.title_key = g.title_key
       and d.game_ids @> array_agg(g.id order by g.id)
   )
   and (
     bool_or(g.wikidata_id is null)
     or exists (
       select 1
       from public.release r1
       join public.release r2 on r2.platform_id = r1.platform_id and r2.game_id <> r1.game_id
       where r1.game_id = any (array_agg(g.id)) and r2.game_id = any (array_agg(g.id))
     )
   );
