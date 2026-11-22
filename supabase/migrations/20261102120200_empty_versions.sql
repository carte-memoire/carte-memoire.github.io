-- =====================================================================
-- Versions vides en trop (audit du 22 novembre 2026)
--
-- L'import Wikidata a créé, pour chaque jeu, une version « sans zone » sur sa
-- console. Quand la liste Wikipédia ou Redump a ensuite apporté les vraies
-- versions (zone, code, date), cette version vide est restée à côté : elle
-- n'a ni zone, ni code, ni date, ni image, personne ne l'a dans sa collection,
-- et elle s'affichait comme une version de plus sur la fiche.
-- On ne la retire QUE si le jeu a une vraie version (avec zone) sur la même
-- console : un jeu ne disparaît jamais d'une console ici. Chaque retrait est
-- noté dans le journal des suppressions, comme ceux des modérateurs.
-- =====================================================================

with gone as (
  select r.* from public.release r
  where r.zone is null and r.product_code is null and r.edition_type = 'standard' and r.edition_name is null
    and not exists (select 1 from public.image i where i.release_id = r.id)
    and not exists (select 1 from public.collection_item c where c.release_id = r.id)
    and not exists (select 1 from public.release_region rr where rr.release_id = r.id and rr.release_date is not null)
    and not exists (select 1 from public.release_barcode b where b.release_id = r.id)
    and not exists (select 1 from public.release x where x.reissue_of = r.id)
    and not exists (select 1 from public.submission s where s.created_release_id = r.id
                    or (s.target = 'image' and s.target_id = r.id))
    and exists (select 1 from public.release o
                where o.game_id = r.game_id and o.platform_id = r.platform_id and o.id <> r.id and o.zone is not null)
),
journal as (
  insert into public.catalog_deletion (kind, object_id, title, details, reason, deleted_by)
  select 'release', g.id, g.local_title,
         jsonb_build_object('game_id', g.game_id, 'zone', null, 'product_code', null, 'edition', 'standard', 'images', 0),
         'Version vide en double (import Wikidata), le jeu a déjà ses vraies versions sur cette console', null
  from gone g
  returning object_id
)
delete from public.release r using journal j where r.id = j.object_id;
