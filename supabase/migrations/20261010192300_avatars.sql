-- =====================================================================
-- Carte Mémoire · Photo de profil (avatar)
--
-- - Stockage : bucket « avatars », PUBLIC (photo affichée sur la page publique du
--   membre, dans le menu et la gestion des membres), WebP ou JPEG seulement,
--   200 Ko au plus : le site envoie une image carrée de 256 px, réencodée
--   (quelques dizaines de Ko, sans données cachées ni position GPS).
-- - Chacun dépose et supprime uniquement dans son propre dossier (son identifiant),
--   avec la vérification commune des écritures (double authentification si elle est
--   activée, compte non suspendu). Pas de remplacement sur place : une nouvelle photo
--   est un nouveau fichier, l'ancienne est supprimée.
-- - Personne ne liste les fichiers des autres (l'adresse publique suffit pour
--   afficher) : seulement soi-même (pour supprimer l'ancienne) et les modérateurs.
-- - profile.avatar ne peut contenir qu'un chemin de fichier dans SON PROPRE dossier
--   du bucket : jamais une adresse extérieure (image hébergée ailleurs, pixel
--   espion…). Le site construit l'adresse de l'image à partir de ce chemin.
-- - Une photo inappropriée : l'admin la retire du profil (admin_remove_avatar),
--   puis le fichier est supprimé (règle des modérateurs).
-- - La photo accompagne le pseudo partout sur le site : propositions, signalements,
--   historique, listes des membres (member_names et admin_members la renvoient).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg']);

create policy "Avatars: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.mfa_satisfied())
  );

create policy "Avatars: read own or as moderator" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_moderator()))
  );

create policy "Avatars: delete own or as moderator" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select private.mfa_satisfied()))
      or ((select private.is_moderator()) and (select private.is_aal2()))
    )
  );

-- La colonne existait sans servir (aucune valeur) : désormais un fichier de son dossier
update public.profile set avatar = null where avatar is not null;
alter table public.profile add constraint profile_avatar_own_file
  check (avatar is null or avatar ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(webp|jpg)$'));

-- Admin : retirer une photo de profil inappropriée. Renvoie le chemin du fichier, que
-- le site supprime ensuite du stockage.
create function public.admin_remove_avatar(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform private.require_admin();
  select avatar into v_path from public.profile where id = target;
  if not found then
    raise exception 'Membre introuvable';
  end if;
  update public.profile set avatar = null where id = target;
  return v_path;
end;
$$;
revoke execute on function public.admin_remove_avatar(uuid) from public, anon;
grant execute on function public.admin_remove_avatar(uuid) to authenticated;

-- Liste des membres (modérateurs) : les pseudos et leur photo de profil, publique comme
-- sur la page de chaque membre ; toujours rien d'autre
drop function public.member_names(text, integer, integer);
create function public.member_names(search text default null, max_results integer default 50, start_at integer default 0)
returns table (username text, avatar text, total_count bigint)
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
    select p.username, p.avatar, count(*) over ()
    from public.profile p
    where search is null or p.username ilike '%' || search || '%'
    order by lower(p.username)
    limit least(greatest(max_results, 1), 200) offset greatest(start_at, 0);
end;
$$;
revoke execute on function public.member_names(text, integer, integer) from public, anon;
grant execute on function public.member_names(text, integer, integer) to authenticated;

-- Fiche des membres (admin) : avec la photo de profil
drop function public.admin_members(text, integer, integer);
create function public.admin_members(search text default null, max_results integer default 50, start_at integer default 0)
returns table (
  id uuid, username text, avatar text, role public.user_role, email text,
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
    select p.id, p.username, p.avatar, p.role, u.email::text,
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
