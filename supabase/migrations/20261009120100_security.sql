-- =====================================================================
-- Carte Mémoire · Migration 2 : sécurité (droits + Row Level Security)
--
-- Rappel : le site React parle directement à la base avec une clé publique.
-- Toute la sécurité est donc ICI, dans la base. Deux niveaux :
--   1. GRANT  : ce qu'un rôle a le droit de faire sur une table ou une colonne
--   2. POLICY : quelles LIGNES il peut lire ou modifier (Row Level Security)
--
-- Rôles Supabase :
--   anon          = visiteur non connecté
--   authenticated = utilisateur connecté (membre, modérateur ou admin)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Fonctions utilitaires
-- ---------------------------------------------------------------------

-- L'utilisateur connecté est-il modérateur ou admin ?
-- security definer : s'exécute avec les droits du propriétaire, pour lire
-- profile sans dépendre des règles de cette même table.
create function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile
    where id = (select auth.uid())
      and role in ('moderator', 'admin')
  );
$$;

-- Changer le rôle d'un utilisateur : réservé aux admins.
-- (Le tout premier admin se nomme à la main dans l'éditeur SQL de Supabase.)
create function public.set_user_role(target_user uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profile
    where id = (select auth.uid()) and role = 'admin'
  ) then
    raise exception 'Only an admin can change a user role';
  end if;

  update public.profile set role = new_role where id = target_user;
end;
$$;

revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Droits par table (GRANT)
--    Supabase donne par défaut tous les droits à anon et authenticated.
--    On repart de zéro et on n'accorde que le nécessaire.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- Catalogue : lecture pour tous, écriture pour les connectés
-- (les règles RLS plus bas limitent l'écriture aux modérateurs)
grant select on
  public.company, public.platform, public.game, public.genre, public.series,
  public.game_genre, public.game_series, public.game_developer, public.region,
  public.release, public.release_region, public.release_company, public.image
to anon, authenticated;

grant insert, update, delete on
  public.company, public.platform, public.game, public.genre, public.series,
  public.game_genre, public.game_series, public.game_developer, public.region,
  public.release, public.release_region, public.release_company, public.image
to authenticated;

-- Profils : lisibles par tous. Un utilisateur ne peut modifier QUE ces trois colonnes.
-- Sans cette restriction, n'importe qui pourrait se donner le rôle admin !
grant select on public.profile to anon, authenticated;
grant update (username, avatar, public_collection) on public.profile to authenticated;

-- Collections : les visiteurs peuvent voir les collections publiques
grant select on public.collection_item to anon;
grant select, insert, update, delete on public.collection_item to authenticated;

-- Propositions : un membre choisit seulement le contenu. Le statut, le
-- modérateur et la date de traitement ne sont jamais fournis par le membre.
-- (Le traitement par les modérateurs passera par une fonction à l'étape 5.)
grant select, delete on public.submission to authenticated;
grant insert (action, target, target_id, data, sources) on public.submission to authenticated;


-- ---------------------------------------------------------------------
-- 3. Activation de la Row Level Security sur TOUTES les tables
--    Une table avec RLS activée et sans règle = personne ne voit rien.
-- ---------------------------------------------------------------------
alter table public.company         enable row level security;
alter table public.platform        enable row level security;
alter table public.game            enable row level security;
alter table public.genre           enable row level security;
alter table public.series          enable row level security;
alter table public.game_genre      enable row level security;
alter table public.game_series     enable row level security;
alter table public.game_developer  enable row level security;
alter table public.region          enable row level security;
alter table public.release         enable row level security;
alter table public.release_region  enable row level security;
alter table public.release_company enable row level security;
alter table public.image           enable row level security;
alter table public.profile         enable row level security;
alter table public.collection_item enable row level security;
alter table public.submission      enable row level security;


-- ---------------------------------------------------------------------
-- 4. Règles du catalogue (RG16, RG20)
--    Les mêmes quatre règles sur chaque table : on les génère en boucle.
-- ---------------------------------------------------------------------
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
    execute format(
      'create policy "Public read" on public.%I
         for select to anon, authenticated
         using (true)', t);

    execute format(
      'create policy "Moderators insert" on public.%I
         for insert to authenticated
         with check ((select public.is_moderator()))', t);

    execute format(
      'create policy "Moderators update" on public.%I
         for update to authenticated
         using ((select public.is_moderator()))
         with check ((select public.is_moderator()))', t);

    execute format(
      'create policy "Moderators delete" on public.%I
         for delete to authenticated
         using ((select public.is_moderator()))', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Règles des profils (RG17)
-- ---------------------------------------------------------------------
create policy "Public read" on public.profile
  for select to anon, authenticated
  using (true);

create policy "Users update their own profile" on public.profile
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Pas de règle insert/delete : le profil est créé par le déclencheur à
-- l'inscription, et supprimé avec le compte.


-- ---------------------------------------------------------------------
-- 6. Règles des collections (RG21 à RG23)
-- ---------------------------------------------------------------------
create policy "Read own or public collections" on public.collection_item
  for select to anon, authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.profile p
      where p.id = collection_item.profile_id
        and p.public_collection
    )
  );

create policy "Add to own collection" on public.collection_item
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy "Update own collection" on public.collection_item
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Remove from own collection" on public.collection_item
  for delete to authenticated
  using (profile_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 7. Règles des propositions (RG18, RG19)
-- ---------------------------------------------------------------------
create policy "Read own submissions, or all for moderators" on public.submission
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (select public.is_moderator())
  );

create policy "Create a submission" on public.submission
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
  );

create policy "Withdraw own pending submission" on public.submission
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and status = 'pending'
  );
