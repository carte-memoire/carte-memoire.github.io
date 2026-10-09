-- =====================================================================
-- Carte Mémoire · Migration : correction de la détection des doublons
--
-- Problème : normalize_name utilisait la classe [[:punct:]], dont le contenu
-- dépend des réglages de langue du serveur. Sur Supabase (règles Unicode),
-- « ~ », « + », « $ », « = »… sont des symboles et non de la ponctuation :
-- ils restaient dans la clé. « Xevious 3D/G+ » (Wikipédia) n'était donc pas
-- reconnu comme « Xevious 3D/G » (Wikidata), et 5 jeux ont été doublés.
--
-- Correction :
--   1. normalize_name n'utilise plus que des listes de caractères explicites ;
--   2. toutes les clés sont recalculées ;
--   3. une fonction merge_games permet de fusionner deux fiches (elle servira
--      aussi aux modérateurs à l'étape 5) ;
--   4. les doublons créés par l'import sont fusionnés.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Normalisation indépendante des réglages du serveur
--    \x21-\x2F \x3A-\x40 \x5B-\x60 \x7B-\x7E = toute la ponctuation et
--    tous les symboles ASCII ; puis les espaces et signes typographiques courants.
-- ---------------------------------------------------------------------
create or replace function public.normalize_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))),
      '[\s 　\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E’‘“”«»–—…・：！？「」『』〜～™®©°]+', '', 'g'),
    '');
$$;


-- ---------------------------------------------------------------------
-- 2. Recalcul des clés
--    Une colonne calculée est recalculée à chaque mise à jour de la ligne.
--    On coupe le déclencheur updated_at : rien ne change vraiment pour l'utilisateur.
-- ---------------------------------------------------------------------
alter table public.game disable trigger set_updated_at;
update public.game set title = title;
alter table public.game enable trigger set_updated_at;

alter table public.company disable trigger set_updated_at;
update public.company set name = name;
alter table public.company enable trigger set_updated_at;


-- ---------------------------------------------------------------------
-- 3. Fusion de deux fiches de jeu
--    Tout ce qui appartient au doublon (sorties, développeurs, genres, séries,
--    infos manquantes) passe sur le jeu conservé, puis le doublon est supprimé.
--    security invoker (par défaut) : les règles RLS s'appliquent, donc seuls
--    les modérateurs peuvent réellement fusionner.
-- ---------------------------------------------------------------------
create function public.merge_games(keep_id bigint, duplicate_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  dup public.game;
begin
  -- Les règles RLS bloqueraient un membre, mais en silence (0 ligne modifiée) :
  -- on préfère un refus explicite. Sans utilisateur connecté, c'est une
  -- migration ou un script serveur (les visiteurs n'ont pas le droit d'appeler la fonction).
  if (select auth.uid()) is not null and not public.is_moderator() then
    raise exception 'Seuls les modérateurs peuvent fusionner des fiches';
  end if;
  if keep_id = duplicate_id then
    raise exception 'Impossible de fusionner un jeu avec lui-même';
  end if;

  select * into dup from public.game where id = duplicate_id;
  if not found or not exists (select 1 from public.game where id = keep_id) then
    raise exception 'Jeu introuvable';
  end if;
  if exists (
    select 1 from public.game k
    where k.id = keep_id and k.wikidata_id is not null
      and dup.wikidata_id is not null and k.wikidata_id <> dup.wikidata_id
  ) then
    raise exception 'Ces deux jeux ont des identifiants Wikidata différents : ce sont sans doute deux jeux distincts';
  end if;

  -- Liens du jeu
  insert into public.game_developer (game_id, company_id)
  select keep_id, company_id from public.game_developer where game_id = duplicate_id
  on conflict do nothing;
  insert into public.game_genre (game_id, genre_id)
  select keep_id, genre_id from public.game_genre where game_id = duplicate_id
  on conflict do nothing;
  insert into public.game_series (game_id, series_id)
  select keep_id, series_id from public.game_series where game_id = duplicate_id
  on conflict do nothing;

  -- Sorties : toutes déplacées (en une seule instruction, rééditions comprises)
  update public.release set game_id = keep_id where game_id = duplicate_id;

  -- Le doublon disparaît (ses liens sont supprimés avec lui)…
  delete from public.game where id = duplicate_id;

  -- …et le jeu conservé récupère les informations qui lui manquaient
  update public.game k set
    wikidata_id             = coalesce(k.wikidata_id, dup.wikidata_id),
    summary                 = coalesce(k.summary, dup.summary),
    first_release_precision = case when k.first_release_date is null then dup.first_release_precision else k.first_release_precision end,
    first_release_date      = coalesce(k.first_release_date, dup.first_release_date)
  where k.id = keep_id;

  -- Les sorties « à compléter » devenues inutiles sont retirées : sans zone, sans code,
  -- sans image, sans date, que personne ne possède, si le jeu a d'autres sorties.
  delete from public.release r
  where r.game_id = keep_id and r.zone is null and r.product_code is null and r.edition_type = 'standard'
    and not exists (select 1 from public.image i where i.release_id = r.id)
    and not exists (select 1 from public.collection_item c where c.release_id = r.id)
    and not exists (select 1 from public.release_region rr where rr.release_id = r.id and rr.release_date is not null)
    and not exists (select 1 from public.release x where x.reissue_of = r.id)
    and exists (select 1 from public.release o where o.game_id = keep_id and o.id <> r.id);
end;
$$;

revoke execute on function public.merge_games(bigint, bigint) from public, anon;
grant execute on function public.merge_games(bigint, bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Fusion des doublons laissés par l'import
--    Exactement ce que l'import aurait fait avec la bonne normalisation :
--    un jeu Wikidata resté « à compléter » + un jeu Wikipédia sans identifiant,
--    même clé, et personne d'autre avec cette clé (sinon un humain tranche).
-- ---------------------------------------------------------------------
do $$
declare
  pair record;
begin
  for pair in
    select keep.id as keep_id, dup.id as duplicate_id
    from public.game keep
    join public.game dup on dup.title_key = keep.title_key and dup.id <> keep.id
    where keep.wikidata_id is not null
      and dup.wikidata_id is null
      and not exists (select 1 from public.release r where r.game_id = keep.id and r.zone is not null)
      and exists (select 1 from public.release r where r.game_id = dup.id and r.zone is not null)
      and (select count(*) from public.game x where x.title_key = keep.title_key) = 2
  loop
    perform public.merge_games(pair.keep_id, pair.duplicate_id);
  end loop;
end;
$$;
