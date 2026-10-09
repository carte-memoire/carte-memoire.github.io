-- =====================================================================
-- Carte Mémoire · Migration : comptes sécurisés, images, propositions, recherche
--
-- 1. Fonctions internes rangées dans un schéma « private », invisible de l'API
--    (corrige les avertissements de l'audit de sécurité Supabase)
-- 2. Double authentification (MFA) exigée par la base :
--    - toute écriture d'un utilisateur qui a activé la MFA demande une session
--      validée en double authentification (niveau « aal2 ») ;
--    - les modérateurs DOIVENT utiliser la double authentification.
-- 3. Stockage des images : jaquettes proposées (privées) et jaquettes validées (publiques)
-- 4. Proposition d'un jeu ou d'une version : jaquette obligatoire, ou case
--    « il n'existe pas de jaquette » cochée
-- 5. Recherche de jeux tolérante (accents, ponctuation, titres régionaux)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Schéma privé
--    Les règles RLS continuent de fonctionner après le déplacement : elles
--    désignent la fonction elle-même, pas son nom.
-- ---------------------------------------------------------------------
create schema private;
grant usage on schema private to authenticated;

alter function public.is_moderator() set schema private;
revoke execute on function private.is_moderator() from public, anon;
grant execute on function private.is_moderator() to authenticated;

-- Fonction de déclencheur : jamais appelée directement
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- La session est-elle validée en double authentification ?
create function private.is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

-- La double authentification est-elle satisfaite ? Oui si la session est en
-- aal2, ou si l'utilisateur n'a activé aucun second facteur.
create function private.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_aal2())
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;

revoke execute on function private.is_aal2(), private.mfa_satisfied() from public, anon;
grant execute on function private.is_aal2(), private.mfa_satisfied() to authenticated;


-- ---------------------------------------------------------------------
-- 2. Double authentification exigée par la base
-- ---------------------------------------------------------------------

-- 2a. Catalogue : modérateur ET session en double authentification
do $$
declare
  t text;
begin
  foreach t in array array[
    'company', 'platform', 'game', 'genre', 'series',
    'game_genre', 'game_series', 'game_developer', 'region',
    'release', 'release_region', 'release_company', 'image'
  ]
  loop
    execute format('drop policy "Moderators insert" on public.%I', t);
    execute format('drop policy "Moderators update" on public.%I', t);
    execute format('drop policy "Moderators delete" on public.%I', t);

    execute format(
      'create policy "Moderators insert (MFA)" on public.%I
         for insert to authenticated
         with check ((select private.is_moderator()) and (select private.is_aal2()))', t);
    execute format(
      'create policy "Moderators update (MFA)" on public.%I
         for update to authenticated
         using ((select private.is_moderator()) and (select private.is_aal2()))
         with check ((select private.is_moderator()) and (select private.is_aal2()))', t);
    execute format(
      'create policy "Moderators delete (MFA)" on public.%I
         for delete to authenticated
         using ((select private.is_moderator()) and (select private.is_aal2()))', t);
  end loop;
end;
$$;

-- 2b. Profil, collection, propositions : règles RESTRICTIVES (elles s'ajoutent
-- aux autres au lieu de les remplacer). Une session volée par mot de passe
-- seul ne peut rien modifier chez quelqu'un qui a activé la MFA.
do $$
declare
  t text;
begin
  foreach t in array array['profile', 'collection_item', 'submission'] loop
    execute format(
      'create policy "MFA required to insert" on public.%I as restrictive
         for insert to authenticated with check ((select private.mfa_satisfied()))', t);
    execute format(
      'create policy "MFA required to update" on public.%I as restrictive
         for update to authenticated using ((select private.mfa_satisfied()))', t);
    execute format(
      'create policy "MFA required to delete" on public.%I as restrictive
         for delete to authenticated using ((select private.mfa_satisfied()))', t);
  end loop;
end;
$$;

-- 2c. Changement de rôle : admin ET double authentification
create or replace function public.set_user_role(target_user uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profile
    where id = (select auth.uid()) and role = 'admin'
  ) or not (select private.is_aal2()) then
    raise exception 'Only an admin with two-factor authentication can change a user role';
  end if;

  update public.profile set role = new_role where id = target_user;
end;
$$;

-- 2d. Fusion de fiches : modérateur ET double authentification
create or replace function public.merge_games(keep_id bigint, duplicate_id bigint)
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
  if exists (
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
  delete from public.game where id = duplicate_id;

  update public.game k set
    wikidata_id             = coalesce(k.wikidata_id, dup.wikidata_id),
    summary                 = coalesce(k.summary, dup.summary),
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


-- ---------------------------------------------------------------------
-- 3. Stockage des images
--    - submission-images : jaquettes envoyées avec une proposition. PRIVÉ :
--      chacun dépose dans son propre dossier (son identifiant), seuls l'auteur
--      et les modérateurs peuvent les voir.
--    - covers : jaquettes validées, PUBLIQUES, écrites par les modérateurs.
--    Formats acceptés : JPEG, PNG, WebP. 5 Mo maximum.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('submission-images', 'submission-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('covers',            'covers',            true,  5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Submission images: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submission-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.mfa_satisfied())
  );

create policy "Submission images: read own or as moderator" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submission-images'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_moderator()))
  );

create policy "Submission images: delete own or as moderator" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submission-images'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select private.mfa_satisfied()))
      or ((select private.is_moderator()) and (select private.is_aal2()))
    )
  );

create policy "Covers: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'covers');

create policy "Covers: moderators write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (select private.is_moderator()) and (select private.is_aal2()));

create policy "Covers: moderators update" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (select private.is_moderator()) and (select private.is_aal2()));

create policy "Covers: moderators delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (select private.is_moderator()) and (select private.is_aal2()));


-- ---------------------------------------------------------------------
-- 4. Propositions de jeux et de versions
--
-- Format de data pour une création :
--   jeu    : { "game": { "title": "…" }, "release": { … }, "cover_path" | "no_cover": true }
--   version: { "game_id": 123,            "release": { … }, "cover_path" | "no_cover": true }
-- release : platform_id, zone, local_title, product_code, edition_type,
--           edition_name, languages, region_code, release_date,
--           date_precision, publisher_name, developer_name
-- ---------------------------------------------------------------------
alter table public.submission
  add constraint submission_new_game_has_title check (
    not (action = 'create' and target = 'game')
    or length(trim(coalesce(data #>> '{game,title}', ''))) > 0
  ),
  -- coalesce : sans game_id, jsonb_typeof vaut NULL, et un CHECK qui vaut NULL
  -- est considéré comme respecté. On transforme donc NULL en « faux ».
  add constraint submission_new_release_has_game check (
    not (action = 'create' and target = 'release')
    or coalesce(jsonb_typeof(data -> 'game_id') = 'number', false)
  ),
  -- Jaquette obligatoire, ou absence de jaquette déclarée
  add constraint submission_cover_or_no_cover check (
    not (action = 'create' and target in ('game', 'release'))
    or (data ? 'cover_path') <> coalesce((data ->> 'no_cover') = 'true', false)
  ),
  -- La jaquette doit être dans le dossier de l'auteur
  add constraint submission_cover_in_author_folder check (
    not (data ? 'cover_path')
    or (author_id is not null and data ->> 'cover_path' like author_id::text || '/%')
  );

-- La jaquette annoncée doit vraiment avoir été envoyée
create function private.check_submission_cover()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data ? 'cover_path' and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'submission-images' and o.name = new.data ->> 'cover_path'
  ) then
    raise exception 'La jaquette envoyée est introuvable : %', new.data ->> 'cover_path';
  end if;
  return new;
end;
$$;

create trigger check_submission_cover
  before insert on public.submission
  for each row execute function private.check_submission_cover();


-- ---------------------------------------------------------------------
-- 5. Recherche de jeux
--    Cherche dans le titre du jeu ET dans les titres régionaux des sorties
--    (« Biohazard » trouve Resident Evil, « Dream Story » trouve 40 Winks).
--    Index « trigrammes » : rapides même pour une recherche au milieu d'un titre.
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

alter table public.release
  add column local_title_key text generated always as (public.normalize_name(local_title)) stored;

create index game_title_key_trgm on public.game using gin (title_key extensions.gin_trgm_ops);
create index release_local_title_key_trgm on public.release using gin (local_title_key extensions.gin_trgm_ops);

create function public.search_games(search text, max_results int default 20)
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
  with q as (select public.normalize_name(search) as k)
  select
    g.id,
    g.title,
    g.first_release_date,
    -- Le titre régional qui correspond, s'il diffère du titre principal
    coalesce(m.local_title, g.title) as matched_title,
    (select count(*)::int from public.release r where r.game_id = g.id) as release_count,
    -- Une jaquette (recto) pour illustrer le résultat, de préférence européenne
    (
      select i.path
      from public.image i
      join public.release r on r.id = i.release_id
      where r.game_id = g.id and i.type = 'front'
      order by (r.zone = 'PAL') desc nulls last, r.id, i.id
      limit 1
    ) as cover_path
  from q
  cross join public.game g
  left join lateral (
    select r.local_title
    from public.release r
    where r.game_id = g.id
      and r.local_title_key like '%' || q.k || '%'
      and r.local_title_key is distinct from g.title_key
    order by length(r.local_title)
    limit 1
  ) m on true
  where length(q.k) >= 2
    and (
      g.title_key like '%' || q.k || '%'
      or exists (
        select 1 from public.release r
        where r.game_id = g.id and r.local_title_key like '%' || q.k || '%'
      )
    )
  order by
    (g.title_key = q.k) desc,
    (g.title_key like q.k || '%') desc,
    extensions.similarity(g.title_key, q.k) desc,
    g.title
  limit least(greatest(coalesce(max_results, 20), 1), 50);
$$;

revoke execute on function public.search_games(text, int) from public;
grant execute on function public.search_games(text, int) to anon, authenticated;
