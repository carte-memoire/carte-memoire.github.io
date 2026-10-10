-- =====================================================================
-- Carte Mémoire · Supprimer son compte (droit à l'effacement, RGPD)
--
-- La personne connectée supprime elle-même son compte :
--   - effacés : compte, profil, collection, passkeys, double authentification ;
--   - retirées : ses propositions encore en attente ;
--   - gardées sans auteur (« compte supprimé ») : propositions traitées,
--     signalements, modifications du catalogue — elles font partie du catalogue
--     collaboratif et ne disent plus qui en est l'auteur.
-- Garde-fous : taper « SUPPRIMER », double authentification validée si elle est
-- activée, et le dernier admin ne peut pas partir (le site resterait sans admin).
-- Les images envoyées avec des propositions sont effacées par le site, via le
-- stockage, juste avant l'appel.
-- =====================================================================

create function public.delete_my_account(confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Connecte-toi pour supprimer ton compte';
  end if;
  if confirmation is distinct from 'SUPPRIMER' then
    raise exception 'Pour confirmer, tape SUPPRIMER en majuscules';
  end if;
  if not (select private.mfa_satisfied()) then
    raise exception 'Valide d''abord ta double authentification';
  end if;
  if exists (select 1 from public.profile where id = uid and role = 'admin')
     and not exists (select 1 from public.profile where role = 'admin' and id <> uid) then
    raise exception 'Tu es le dernier admin : nomme d''abord un autre admin, sinon le site resterait sans administrateur';
  end if;

  delete from public.submission where author_id = uid and status = 'pending';
  -- Le reste suit : profil et collection (cascade), auteur effacé partout ailleurs
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
