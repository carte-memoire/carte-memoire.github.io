-- =====================================================================
-- Carte Mémoire · Ma collection : l'ordre de l'étagère choisi par le collectionneur
--
-- Chacun peut ranger son étagère à sa façon, en faisant glisser les tranches (tri
-- « Mon ordre » dans Ma collection). La place de chaque exemplaire est gardée dans la base,
-- pour la retrouver sur tous ses appareils :
--   - collection_item.shelf_position : la place sur l'étagère de sa console (1, 2, 3…) ;
--     null tant que l'exemplaire n'a pas été placé (il se range alors par titre, après) ;
--   - set_shelf_order(ids) : enregistre en une fois l'ordre d'une étagère, dans l'ordre des
--     identifiants donnés. Seulement ses propres exemplaires (règles d'accès de la table :
--     la fonction s'exécute avec les droits de celui qui l'appelle).
-- =====================================================================

alter table public.collection_item add column shelf_position integer;
comment on column public.collection_item.shelf_position is
  'Place sur l''étagère choisie par le collectionneur (tri « Mon ordre ») ; null : pas encore placé';

create function public.set_shelf_order(item_ids bigint[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Garde-fou : une étagère de 5 000 jeux au plus par appel
  if cardinality(item_ids) > 5000 then
    raise exception 'Trop de jeux sur une même étagère (5 000 au plus)';
  end if;
  update public.collection_item c
  set shelf_position = o.n::int
  from unnest(item_ids) with ordinality as o(id, n)
  where c.id = o.id
    and c.profile_id = (select auth.uid());
end;
$$;
revoke execute on function public.set_shelf_order(bigint[]) from public, anon;
grant execute on function public.set_shelf_order(bigint[]) to authenticated;

-- ---------------------------------------------------------------------
-- L'aspect de chaque étagère (meuble, finition, épaisseur, éclairage), choisi étagère par
-- étagère dans Ma collection : un petit objet JSON par compte, lu et écrit par le site
--   { "default": {...}, "PS1": {...}, "PS2": {...}, "exposition": {...} }
-- Le site ne garde que les valeurs qu'il connaît ; la base veille à la forme et à la taille.
-- ---------------------------------------------------------------------
alter table public.profile add column shelf_style jsonb;
alter table public.profile add constraint profile_shelf_style_check
  check (shelf_style is null or (jsonb_typeof(shelf_style) = 'object' and pg_column_size(shelf_style) <= 8000));
comment on column public.profile.shelf_style is
  'Aspect des étagères de Ma collection, étagère par étagère (meuble, finition, épaisseur, éclairage)';
grant update (shelf_style) on public.profile to authenticated;

-- ---------------------------------------------------------------------
-- La page publique d'une collection montre la pièce du collectionneur (ses meubles, ses
-- étagères rangées à sa façon) : public_collection renvoie en plus l'exemplaire, le code
-- produit (sur la tranche) et sa place sur l'étagère. Toujours rien de privé (prix, lieux,
-- dates, notes).
-- ---------------------------------------------------------------------
drop function public.public_collection(text);
create function public.public_collection(member text)
returns table (
  status public.item_status, release_id bigint, game_id bigint, game_title text, local_title text,
  zone public.video_zone, edition_type public.edition_type, edition_name text, languages text[], platform text,
  cover_path text, release_date date, condition public.item_condition,
  has_box boolean, has_manual boolean, has_media boolean, has_spine_card boolean, trade_status public.trade_status,
  game_slug text, item_id bigint, product_code text, shelf_position integer
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
         c.condition, c.has_box, c.has_manual, c.has_media, c.has_spine_card, c.trade_status, g.slug,
         c.id, r.product_code, c.shelf_position
  from public.profile p
  join public.collection_item c on c.profile_id = p.id
  join public.release r on r.id = c.release_id
  join public.game g on g.id = r.game_id
  join public.platform pl on pl.id = r.platform_id
  where lower(p.username) = lower(member)
    and (p.public_collection or p.id = (select auth.uid()))
  order by g.title_key, r.zone, r.id, c.id;
$$;
revoke execute on function public.public_collection(text) from public;
grant execute on function public.public_collection(text) to anon, authenticated;
