-- =====================================================================
-- Carte Mémoire · Déplacer une version vers un autre jeu (modérateurs)
--
-- Pour une version rattachée au mauvais jeu (« Clock Tower: The First Fear »
-- sous « Clock Tower »). Les exemplaires des membres, les images et les dates
-- suivent la version. Les liens « réédition de » entre l'ancien jeu et cette
-- version sont défaits (ils n'ont plus de sens), et un signalement qui visait
-- cette version reste sur l'ancien jeu, sans version.
-- La dernière version d'un jeu ne se déplace pas : on fusionne alors les jeux.
-- =====================================================================

create function public.move_release(target_release bigint, to_game bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.release;
begin
  if not (select private.is_moderator()) or not (select private.is_aal2()) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent déplacer une version';
  end if;
  select * into v_release from public.release where id = target_release for update;
  if not found then
    raise exception 'Version introuvable';
  end if;
  if not exists (select 1 from public.game where id = to_game) then
    raise exception 'Jeu de destination introuvable';
  end if;
  if v_release.game_id = to_game then
    raise exception 'Cette version appartient déjà à ce jeu';
  end if;
  if not exists (select 1 from public.release r where r.game_id = v_release.game_id and r.id <> target_release) then
    raise exception 'C''est la seule version de ce jeu : fusionne plutôt les deux jeux.';
  end if;

  -- Liens qui ne tiennent plus d'un jeu à l'autre
  update public.release set reissue_of = null where reissue_of = target_release;
  update public.report set release_id = null where release_id = target_release;

  update public.release set game_id = to_game, reissue_of = null where id = target_release;
end;
$$;

revoke execute on function public.move_release(bigint, bigint) from public, anon;
grant execute on function public.move_release(bigint, bigint) to authenticated;
