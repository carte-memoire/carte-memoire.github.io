-- =====================================================================
-- Carte Mémoire · Les packs PlayStation avec Multitap, et Le Monde des Bleus
-- Écrit à la main le 2026-11-28.
--
-- Trois jeux PlayStation ont été vendus en Europe dans une grande boîte en carton couchée,
-- avec l'adaptateur Multitap (378 × 234 × 45 mm, le boîtier du jeu visible par une fenêtre) :
--   - Crash Team Racing (déjà dans la base : version « Multitap ») ;
--   - Speed Freaks ;
--   - Le Monde des Bleus (France).
-- Le Monde des Bleus est la version française de This Is Football (Redump : « Monde des
-- Bleus, Le - Le Jeu officiel de l'equipe de France (France) », SCES-01701) : sa version
-- standard manquait aussi.
-- Le disque d'un pack est celui du jeu : pas de code produit propre (comme le pack CTR).
-- Le jeu est désigné par son adresse (la même dans toutes les bases) ; rejouable : rien
-- n'est ajouté deux fois.
-- =====================================================================

with v(slug, local_title, edition_type, edition_name, product_code, languages, country) as (values
  ('ps1/this-is-football', 'Le Monde des Bleus: Le Jeu officiel de l''équipe de France', 'standard'::public.edition_type, null::text, 'SCES-01701', '{fr}'::text[], 'FR'),
  ('ps1/this-is-football', 'Le Monde des Bleus: Le Jeu officiel de l''équipe de France', 'bundle'::public.edition_type, 'Multitap', null::text, '{fr}'::text[], 'FR'),
  ('ps1/speed-freaks', 'Speed Freaks', 'bundle'::public.edition_type, 'Multitap', null::text, '{}'::text[], 'europe')
),
created as (
  insert into public.release (game_id, platform_id, local_title, product_code, zone, edition_type, edition_name, languages)
  select g.id, p.id, v.local_title, v.product_code, 'PAL', v.edition_type, v.edition_name, v.languages
  from v
  join public.game g on g.slug = v.slug
  cross join (select id from public.platform where short_name = 'PS1') p
  where not exists (
    select 1 from public.release r
    where r.game_id = g.id and r.platform_id = p.id
      and (r.product_code = v.product_code
        or (v.product_code is null and r.edition_type = v.edition_type and r.edition_name = v.edition_name))
  )
  returning id, game_id, edition_type, edition_name
)
insert into public.release_region (release_id, region_id)
select c.id, rg.id
from created c
join public.game g on g.id = c.game_id
join v on v.slug = g.slug and v.edition_type = c.edition_type and v.edition_name is not distinct from c.edition_name
join public.region rg on rg.code = v.country;
