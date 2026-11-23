-- =====================================================================
-- Carte Mémoire · Codes produit des Platinum PS1 européennes
--
-- En Europe, une réédition Platinum PS1 garde le code de sa version Black Label
-- (vérifié dans la base le 23/11/2026 : les Platinum PS1 PAL qui ont un code ont celui de
-- leur Black Label ; en PS2, les Platinum portent ce code suivi de « /P », et elles l'ont
-- toutes). 146 Platinum PS1 PAL n'avaient pas de code : on leur donne celui de leur Black
-- Label, seulement quand il n'y a aucun doute (82 attendues) :
--   1. une Black Label du même jeu (console, zone) avec les mêmes langues et la même
--      boîte, et un seul code possible ;
--   2. sinon, le jeu n'a qu'un seul code Black Label en Europe.
-- Restent à compléter à la main (64) : les jeux sortis en plusieurs Black Label de langues
-- différentes (codes différents) quand on ignore la langue de la Platinum, et ceux dont
-- aucune Black Label n'a de code.
-- Japon et États-Unis : les rééditions (The Best, Greatest Hits) ont un code à elles, on
-- n'y touche pas.
-- Garde-fou d'abord : un code américain ou japonais (SLUS, SCUS, SLPS…) sur une Platinum PS1
-- européenne est forcément recopié par erreur. La base en ligne n'en a plus, mais les données
-- d'import rejouées par les tests en ont encore 27. Ce code faux est retiré, puis remplacé comme
-- les autres quand la Black Label ne laisse aucun doute ; sinon la fiche affichera
-- « À compléter » (comme dans 20261010150000_fix_copied_codes).
-- =====================================================================

-- 0. Codes non européens sur des Platinum PS1 européennes : retirés
update public.release r
set product_code = null
from public.platform p
where p.id = r.platform_id and p.short_name = 'PS1' and r.zone = 'PAL' and r.edition_type = 'reissue'
  and r.product_code is not null and r.product_code !~ '^S[CL]E[DS]-';

-- 1. Même jeu, mêmes langues, même boîte : un seul code
with missing as (
  select r.id, r.game_id, r.platform_id, r.zone, r.languages, r.box_region_id
  from public.release r
  join public.platform p on p.id = r.platform_id
  where p.short_name = 'PS1' and r.zone = 'PAL' and r.edition_type = 'reissue' and r.product_code is null
),
matched as (
  select m.id, min(s.product_code) as code, count(distinct s.product_code) as codes
  from missing m
  join public.release s
    on s.game_id = m.game_id and s.platform_id = m.platform_id and s.zone = m.zone
   and s.edition_type = 'standard' and s.product_code is not null
   and s.box_region_id is not distinct from m.box_region_id
   and (select array_agg(x order by x) from unnest(s.languages) x)
       is not distinct from (select array_agg(x order by x) from unnest(m.languages) x)
  group by m.id
)
update public.release r
set product_code = matched.code
from matched
where matched.id = r.id and matched.codes = 1;

-- 2. Le jeu n'a qu'un seul code Black Label en Europe
with missing as (
  select r.id, r.game_id, r.platform_id, r.zone
  from public.release r
  join public.platform p on p.id = r.platform_id
  where p.short_name = 'PS1' and r.zone = 'PAL' and r.edition_type = 'reissue' and r.product_code is null
),
matched as (
  select m.id, min(s.product_code) as code, count(distinct s.product_code) as codes
  from missing m
  join public.release s
    on s.game_id = m.game_id and s.platform_id = m.platform_id and s.zone = m.zone
   and s.edition_type = 'standard' and s.product_code is not null
  group by m.id
)
update public.release r
set product_code = matched.code
from matched
where matched.id = r.id and matched.codes = 1;
