-- =====================================================================
-- Carte Mémoire · Détails d'un exemplaire pour les collectionneurs
--
-- - acquisition    : acheté neuf, acheté d'occasion, reçu en cadeau, échangé ;
-- - état           : on distingue le blister d'origine d'un blister refait
--                    (« reblisté »), et on ajoute « comme neuf » ;
-- - purchase_place : où l'exemplaire a été trouvé (brocante, boutique…) ;
-- - has_spine_card : la bande cartonnée sur la tranche des jeux japonais ;
-- - trade_status   : exemplaire proposé à l'échange ou à la vente (doubles).
-- Ces détails ne concernent que les exemplaires possédés, pas les recherchés.
-- =====================================================================

create type public.acquisition_type as enum ('new', 'used', 'gift', 'trade');
create type public.trade_status as enum ('for_trade', 'for_sale');

-- Nouveaux états, rangés juste après « sous blister » (l'ordre de la liste sert au tri)
alter type public.item_condition add value if not exists 'like_new' after 'sealed';
alter type public.item_condition add value if not exists 'resealed' after 'sealed';

alter table public.collection_item
  add column acquisition    public.acquisition_type,
  add column purchase_place text check (purchase_place is null or length(trim(purchase_place)) between 1 and 80),
  add column has_spine_card boolean,
  add column trade_status   public.trade_status,
  add constraint collection_item_owned_details check (
    status = 'owned'
    or (acquisition is null and purchase_place is null and has_spine_card is null and trade_status is null)
  );

comment on column public.collection_item.acquisition is 'Comment l''exemplaire a été obtenu : new (acheté neuf), used (d''occasion), gift (cadeau), trade (échange).';
comment on column public.collection_item.has_spine_card is 'Spine card (bande cartonnée sur la tranche, surtout au Japon). Vide = non précisé.';
comment on column public.collection_item.trade_status is 'Exemplaire proposé à l''échange (for_trade) ou à la vente (for_sale). Vide = gardé.';
