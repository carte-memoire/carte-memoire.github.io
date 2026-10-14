-- =====================================================================
-- Prix médian selon l'état : ce que les membres ont réellement payé
--
-- Aucune source extérieure (pas de site de vente aspiré) : la médiane des
-- prix d'achat notés par les membres dans leur collection, version par
-- version et état par état. Personne ne voit le prix d'un autre membre :
--   - chaque membre compte une seule fois par version et par état (la
--     moyenne de ses exemplaires) ;
--   - la médiane n'apparaît qu'à partir de 5 membres, la fourchette (la
--     moitié des prix entre « bas » et « haut ») à partir de 8 ;
--   - les valeurs sont arrondies à l'euro.
-- Ne comptent que les achats (ni cadeaux ni échanges), à prix non nul, des
-- 5 dernières années (date d'achat, sinon date d'ajout à la collection) :
-- un jeu payé 50 € à sa sortie en 1999 ne dit rien de son prix d'aujourd'hui.
-- =====================================================================

-- État pour le prix : neuf, complet (boîte + notice + disque), incomplet,
-- disque seul ; inconnu si le contenu n'est pas précisé.
-- at_purchase : l'état au moment de l'achat (« acheté neuf » compte comme
-- neuf même ouvert depuis) ; sinon l'état actuel (pour estimer une collection).
create function private.price_category(
  item_condition public.item_condition,
  item_acquisition public.acquisition_type,
  box boolean, manual boolean, media boolean,
  at_purchase boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when item_condition = 'sealed' then 'new'
    when item_acquisition = 'new' and (at_purchase or item_condition is null) then 'new'
    when box is null and manual is null and media is null then null
    when box and manual and media then 'complete'
    when media and not coalesce(box, false) and not coalesce(manual, false) then 'loose'
    else 'incomplete'
  end;
$$;
revoke execute on function private.price_category(public.item_condition, public.acquisition_type, boolean, boolean, boolean, boolean) from public, anon, authenticated;

-- Un prix par membre, par version et par état (achats récents seulement)
create view private.member_price as
  select release_id, category, profile_id, avg(price)::float8 as price
  from (
    select c.release_id, c.profile_id, c.purchase_price as price,
           private.price_category(c.condition, c.acquisition, c.has_box, c.has_manual, c.has_media, true) as category
    from public.collection_item c
    where c.status = 'owned'
      and c.purchase_price > 0
      and (c.acquisition is null or c.acquisition in ('new', 'used'))
      and coalesce(c.purchase_date, c.created_at::date) >= current_date - interval '5 years'
  ) p
  where category is not null
  group by release_id, category, profile_id;

-- Par version et par état : nombre de membres, médiane et quartiles (bruts)
create view private.price_stats as
  select release_id, category, count(*)::int as members,
         percentile_cont(0.5) within group (order by price) as median,
         percentile_cont(0.25) within group (order by price) as low,
         percentile_cont(0.75) within group (order by price) as high
  from private.member_price
  group by release_id, category;

revoke all on private.member_price, private.price_stats from public, anon, authenticated;

-- Fiche d'un jeu : les prix de chacune de ses versions, état par état.
-- `members` est toujours donné (« 3 membres ont noté un prix ») ; la médiane
-- seulement à partir de 5 membres, la fourchette à partir de 8.
create function public.release_prices(target_game bigint)
returns table (release_id bigint, category text, members int, median numeric, low numeric, high numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select s.release_id, s.category, s.members,
         case when s.members >= 5 then round(s.median::numeric) end,
         case when s.members >= 8 then round(s.low::numeric) end,
         case when s.members >= 8 then round(s.high::numeric) end
  from private.price_stats s
  join public.release r on r.id = s.release_id
  where r.game_id = target_game;
$$;
revoke execute on function public.release_prices(bigint) from public;
grant execute on function public.release_prices(bigint) to anon, authenticated;

-- Ma collection : pour chacun de mes exemplaires possédés, le prix médian de
-- sa version dans son état actuel (quand au moins 5 membres en ont noté un).
-- Sert à estimer la valeur de la collection ; ne renvoie que mes exemplaires.
create function public.my_collection_prices()
returns table (item_id bigint, category text, median numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, s.category, round(s.median::numeric)
  from public.collection_item c
  join private.price_stats s
    on s.release_id = c.release_id
   and s.category = private.price_category(c.condition, c.acquisition, c.has_box, c.has_manual, c.has_media, false)
  where c.profile_id = (select auth.uid())
    and c.status = 'owned'
    and s.members >= 5;
$$;
revoke execute on function public.my_collection_prices() from public, anon;
grant execute on function public.my_collection_prices() to authenticated;
