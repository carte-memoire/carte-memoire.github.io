-- =====================================================================
-- Carte Mémoire · Suppression d'un jeu ou d'une version (modérateurs)
--
-- delete_game / delete_release suppriment en une seule opération, réservée
-- aux modérateurs et admins en double authentification :
--   - refus si un membre possède (ou cherche) le jeu ou la version : on ne fait
--     pas disparaître un objet d'une collection ; pour un doublon, la fusion
--     (merge_games) déplace les exemplaires ;
--   - les versions, dates, éditeurs, images et genres suivent ;
--   - les propositions en attente sur l'objet supprimé sont refusées ;
--   - chaque suppression est notée dans un journal (qui, quoi, quand, pourquoi).
-- Les fonctions renvoient les chemins des jaquettes : le site les efface du
-- stockage (une ligne supprimée en SQL n'efface pas le fichier lui-même).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Journal des suppressions (lisible par les modérateurs seulement)
-- ---------------------------------------------------------------------
create table public.catalog_deletion (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('game', 'release')),
  object_id   bigint not null,
  title       text not null,
  details     jsonb not null default '{}',
  reason      text check (length(reason) <= 500),
  deleted_by  uuid default auth.uid() references public.profile (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.catalog_deletion is 'Journal des jeux et versions supprimés par les modérateurs.';

alter table public.catalog_deletion enable row level security;
revoke all on public.catalog_deletion from anon, authenticated;
grant select on public.catalog_deletion to authenticated;
create policy "Moderators read deletions" on public.catalog_deletion
  for select to authenticated
  using ((select private.is_moderator()));


-- ---------------------------------------------------------------------
-- 2. Contrôles communs
-- ---------------------------------------------------------------------
create function private.check_can_delete(release_ids bigint[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  members int;
begin
  if not (select private.is_moderator()) or not (select private.is_aal2()) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent supprimer du catalogue';
  end if;
  -- Les collections privées comptent aussi (d'où security definer) ; on ne dit pas qui
  select count(distinct c.profile_id) into members
  from public.collection_item c
  where c.release_id = any (release_ids);
  if members > 0 then
    raise exception '% membre(s) ont ce jeu dans leur collection (possédé ou recherché) : suppression impossible. Pour un doublon, utilise plutôt la fusion.', members;
  end if;
end;
$$;
revoke execute on function private.check_can_delete(bigint[]) from public;


-- ---------------------------------------------------------------------
-- 3. Supprimer un jeu (avec toutes ses versions)
-- ---------------------------------------------------------------------
create function public.delete_game(target_game bigint, reason text default null)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game  public.game;
  v_ids   bigint[];
  v_paths text[];
begin
  select * into v_game from public.game where id = target_game for update;
  if not found then
    raise exception 'Jeu introuvable';
  end if;
  select coalesce(array_agg(r.id), '{}') into v_ids from public.release r where r.game_id = target_game;
  perform private.check_can_delete(v_ids);

  select coalesce(array_agg(i.path), '{}') into v_paths
  from public.image i where i.release_id = any (v_ids);

  insert into public.catalog_deletion (kind, object_id, title, details, reason)
  values ('game', target_game, v_game.title, jsonb_build_object(
    'wikidata_id', v_game.wikidata_id,
    'releases', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'zone', r.zone, 'local_title', r.local_title, 'product_code', r.product_code,
      'edition', coalesce(r.edition_name, r.edition_type::text)) order by r.id), '[]')
      from public.release r where r.id = any (v_ids)),
    'images', cardinality(v_paths)
  ), nullif(trim(reason), ''));

  -- Propositions en attente sur ce jeu ou ses versions : refusées, avec un motif
  update public.submission s
  set status = 'rejected', review_note = 'Jeu supprimé du catalogue.', moderator_id = (select auth.uid()), reviewed_at = now()
  where s.status = 'pending'
    and ((s.target = 'game' and s.target_id = target_game)
      or (s.target = 'release' and s.target_id = any (v_ids))
      or (s.data ->> 'game_id') = target_game::text);

  update public.dismissed_duplicate set game_ids = array_remove(game_ids, target_game)
  where target_game = any (game_ids);

  delete from public.release where game_id = target_game;  -- dates, éditeurs, images suivent
  delete from public.game where id = target_game;          -- genres, séries, développeurs suivent
  return v_paths;
end;
$$;

revoke execute on function public.delete_game(bigint, text) from public, anon;
grant execute on function public.delete_game(bigint, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Supprimer une seule version
-- ---------------------------------------------------------------------
create function public.delete_release(target_release bigint, reason text default null)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.release;
  v_paths   text[];
begin
  select * into v_release from public.release where id = target_release for update;
  if not found then
    raise exception 'Version introuvable';
  end if;
  perform private.check_can_delete(array[target_release]);
  if not exists (select 1 from public.release r where r.game_id = v_release.game_id and r.id <> target_release) then
    raise exception 'C''est la seule version de ce jeu : supprime plutôt le jeu entier.';
  end if;

  select coalesce(array_agg(i.path), '{}') into v_paths from public.image i where i.release_id = target_release;

  insert into public.catalog_deletion (kind, object_id, title, details, reason)
  values ('release', target_release, v_release.local_title, jsonb_build_object(
    'game_id', v_release.game_id, 'zone', v_release.zone, 'product_code', v_release.product_code,
    'edition', coalesce(v_release.edition_name, v_release.edition_type::text), 'images', cardinality(v_paths)
  ), nullif(trim(reason), ''));

  update public.submission s
  set status = 'rejected', review_note = 'Version supprimée du catalogue.', moderator_id = (select auth.uid()), reviewed_at = now()
  where s.status = 'pending' and s.target = 'release' and s.target_id = target_release;

  delete from public.release where id = target_release;
  return v_paths;
end;
$$;

revoke execute on function public.delete_release(bigint, text) from public, anon;
grant execute on function public.delete_release(bigint, text) to authenticated;
