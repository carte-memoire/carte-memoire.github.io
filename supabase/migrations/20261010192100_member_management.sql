-- =====================================================================
-- Carte Mémoire · Gestion des membres (modération et administration)
--
-- - Modérateurs : la liste des pseudos des membres, rien d'autre (ni adresse
--   e-mail, ni dates, ni activité).
-- - Admin seul, en double authentification (passkey et navigateur de confiance
--   compris) : la fiche complète (adresse e-mail, inscription, dernière
--   connexion, double authentification, collection, propositions), renommer,
--   changer le rôle (fonction set_user_role, existante), suspendre ou rétablir,
--   supprimer.
-- - Suspension : connexion refusée (auth.users.banned_until, lu par Supabase à
--   chaque connexion et renouvellement de session), sessions et navigateurs de
--   confiance effacés, et plus aucune écriture même avec une session encore
--   ouverte (private.mfa_satisfied, commune à toutes les écritures des membres).
--   La raison n'est visible que des admins.
-- - Garde-fous : un admin ne se suspend ni ne se supprime ici (« Mon compte »
--   pour lui-même) ; il retire d'abord son rôle à un autre admin avant de le
--   suspendre ou de le supprimer ; le site garde toujours au moins un admin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Suspensions (schéma privé : jamais lisible par l'API)
-- ---------------------------------------------------------------------
create table private.member_ban (
  member_id uuid primary key references auth.users (id) on delete cascade,
  until     timestamptz not null,
  reason    text check (reason is null or length(reason) between 1 and 500),
  banned_by uuid references auth.users (id) on delete set null,
  banned_at timestamptz not null default now()
);
revoke all on private.member_ban from public, anon, authenticated;

-- La personne connectée est-elle suspendue ?
create function private.not_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from private.member_ban b
    where b.member_id = (select auth.uid()) and b.until > now()
  );
$$;
revoke execute on function private.not_banned() from public, anon;
grant execute on function private.not_banned() to authenticated;

-- Toutes les écritures des membres (collection, propositions, signalements, profil)
-- passent par cette vérification : double authentification si elle est activée,
-- ET compte non suspendu
create or replace function private.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select private.is_aal2())
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      ))
     and (select private.not_banned());
$$;

-- Réservé à un admin en double authentification
create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profile where id = (select auth.uid()) and role = 'admin')
     or not (select private.is_aal2()) then
    raise exception 'Réservé aux admins, en double authentification';
  end if;
end;
$$;
revoke execute on function private.require_admin() from public, anon;
grant execute on function private.require_admin() to authenticated;

-- Membre visé par une action d'admin : existe, n'est pas soi-même, n'est pas admin
create function private.check_member_target(target uuid, action text)
returns public.profile
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.profile;
begin
  select * into v_member from public.profile where id = target;
  if v_member.id is null then
    raise exception 'Membre introuvable';
  end if;
  if target = (select auth.uid()) then
    raise exception 'Impossible sur ton propre compte (%)', action;
  end if;
  if v_member.role = 'admin' then
    raise exception 'C''est un admin : retire-lui d''abord son rôle';
  end if;
  return v_member;
end;
$$;
revoke execute on function private.check_member_target(uuid, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Listes des membres
-- ---------------------------------------------------------------------

-- Modérateurs et admins : les pseudos seulement
create function public.member_names(search text default null, max_results integer default 50, start_at integer default 0)
returns table (username text, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_moderator()) or not (select private.is_aal2()) then
    raise exception 'Réservé aux modérateurs, en double authentification';
  end if;
  return query
    select p.username, count(*) over ()
    from public.profile p
    where search is null or p.username ilike '%' || search || '%'
    order by lower(p.username)
    limit least(greatest(max_results, 1), 200) offset greatest(start_at, 0);
end;
$$;
revoke execute on function public.member_names(text, integer, integer) from public, anon;
grant execute on function public.member_names(text, integer, integer) to authenticated;

-- Admins : la fiche complète, recherche par pseudo ou adresse e-mail
create function public.admin_members(search text default null, max_results integer default 50, start_at integer default 0)
returns table (
  id uuid, username text, role public.user_role, email text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, two_factor boolean,
  banned_until timestamptz, ban_reason text,
  owned_count integer, wanted_count integer, submission_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.username, p.role, u.email::text,
      coalesce(u.created_at, p.created_at), u.last_sign_in_at, u.email_confirmed_at is not null,
      exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
      b.until, b.reason,
      (select count(*)::int from public.collection_item c where c.profile_id = p.id and c.status = 'owned'),
      (select count(*)::int from public.collection_item c where c.profile_id = p.id and c.status = 'wanted'),
      (select count(*)::int from public.submission s where s.author_id = p.id),
      count(*) over ()
    from public.profile p
    join auth.users u on u.id = p.id
    left join private.member_ban b on b.member_id = p.id and b.until > now()
    where search is null or p.username ilike '%' || search || '%' or u.email ilike '%' || search || '%'
    order by lower(p.username)
    limit least(greatest(max_results, 1), 200) offset greatest(start_at, 0);
end;
$$;
revoke execute on function public.admin_members(text, integer, integer) from public, anon;
grant execute on function public.admin_members(text, integer, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 3. Actions de l'admin
-- ---------------------------------------------------------------------

-- Renommer (pseudo inapproprié…) : mêmes règles qu'à l'inscription
create function public.admin_rename_member(target uuid, new_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.profile where id = target) then
    raise exception 'Membre introuvable';
  end if;
  new_username := trim(new_username);
  if new_username !~ '^[A-Za-z0-9_-]{3,30}$' then
    raise exception 'Pseudo invalide : 3 à 30 caractères, lettres sans accents, chiffres, - et _';
  end if;
  if exists (select 1 from public.profile where lower(username) = lower(new_username) and id <> target) then
    raise exception 'Ce pseudo est déjà pris';
  end if;
  update public.profile set username = new_username where id = target;
end;
$$;
revoke execute on function public.admin_rename_member(uuid, text) from public, anon;
grant execute on function public.admin_rename_member(uuid, text) to authenticated;

-- Changer le rôle : le site garde toujours au moins un admin
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
  if not exists (select 1 from public.profile where id = target_user) then
    raise exception 'Membre introuvable';
  end if;
  if new_role <> 'admin'
     and exists (select 1 from public.profile where id = target_user and role = 'admin')
     and not exists (select 1 from public.profile where role = 'admin' and id <> target_user) then
    raise exception 'C''est le dernier admin : nomme d''abord un autre admin';
  end if;

  update public.profile set role = new_role where id = target_user;
end;
$$;

-- Suspendre : `days` nul = sans limite de durée (100 ans, la forme que Supabase sait lire)
create function public.admin_ban_member(target uuid, days integer default null, reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  perform private.require_admin();
  perform private.check_member_target(target, 'suspendre');
  if days is not null and (days < 1 or days > 3650) then
    raise exception 'Durée de suspension invalide : de 1 à 3650 jours, ou sans limite';
  end if;
  v_until := case when days is null then now() + interval '100 years' else now() + days * interval '1 day' end;
  reason := nullif(trim(coalesce(reason, '')), '');

  insert into private.member_ban (member_id, until, reason, banned_by, banned_at)
  values (target, v_until, reason, (select auth.uid()), now())
  on conflict (member_id) do update
    set until = excluded.until, reason = excluded.reason, banned_by = excluded.banned_by, banned_at = excluded.banned_at;

  -- Connexion refusée, et déconnexion de tous ses appareils
  update auth.users set banned_until = v_until where id = target;
  delete from auth.sessions where user_id = target;
  delete from private.trusted_browser where user_id = target;
  return v_until;
end;
$$;
revoke execute on function public.admin_ban_member(uuid, integer, text) from public, anon;
grant execute on function public.admin_ban_member(uuid, integer, text) to authenticated;

-- Rétablir un membre suspendu
create function public.admin_unban_member(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from private.member_ban where member_id = target;
  update auth.users set banned_until = null where id = target;
end;
$$;
revoke execute on function public.admin_unban_member(uuid) from public, anon;
grant execute on function public.admin_unban_member(uuid) to authenticated;

-- Supprimer un compte : comme « Supprimer mon compte » (propositions en attente
-- retirées ; propositions traitées, signalements et modifications du catalogue
-- gardés sans auteur). Confirmation : le pseudo exact du membre. Les images de
-- ses propositions sont effacées par le site, via le stockage, juste avant.
create function public.admin_delete_member(target uuid, confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.profile;
begin
  perform private.require_admin();
  v_member := private.check_member_target(target, 'supprimer');
  if confirmation is distinct from v_member.username then
    raise exception 'Pour confirmer, tape exactement le pseudo du membre';
  end if;

  -- (« target » est aussi une colonne des propositions : paramètre nommé en entier)
  delete from public.submission where author_id = admin_delete_member.target and status = 'pending';
  delete from auth.users where id = admin_delete_member.target;
end;
$$;
revoke execute on function public.admin_delete_member(uuid, text) from public, anon;
grant execute on function public.admin_delete_member(uuid, text) to authenticated;
