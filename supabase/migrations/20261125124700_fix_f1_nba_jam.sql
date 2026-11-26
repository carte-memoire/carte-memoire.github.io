-- =====================================================================
-- Carte Mémoire · Deux fiches qui mélangeaient deux jeux (repérées en ajoutant la Mega Drive)
--
-- - F1 (Domark, 1993) portait le titre et la version Super Nintendo de F1 World Championship
--   Edition (1995), qui a sa propre fiche ;
-- - NBA Jam (1993) portait le titre et les versions PlayStation de NBA Jam Tournament Edition
--   (1994), qui a sa propre fiche.
--
-- Les versions vont sur la bonne fiche (l'ancienne adresse y mène), puis chaque fiche reprend
-- son titre et une adresse calculée à nouveau. Rien n'est fait si une fiche manque ou si son
-- titre a déjà été corrigé à la main.
-- =====================================================================

do $$
declare
  v_f1    bigint := (select id from public.game where wikidata_id = 'Q3062970');
  v_f1wce bigint := (select id from public.game where wikidata_id = 'Q2917766');
  v_jam   bigint := (select id from public.game where wikidata_id = 'Q1959943');
  v_te    bigint := (select id from public.game where wikidata_id = 'Q2248339');
begin
  if v_f1 is not null and v_f1wce is not null
     and exists (select 1 from public.game where id = v_f1 and title = 'F1 World Championship Edition') then
    update public.release r set game_id = v_f1wce
    from public.platform p
    where p.id = r.platform_id and r.game_id = v_f1 and p.short_name = 'SNES'
      and r.local_title = 'F1 World Championship Edition';
    update public.game set title = 'F1', slug = null where id = v_f1;
    perform private.assign_game_slug(v_f1);
  end if;

  if v_jam is not null and v_te is not null
     and exists (select 1 from public.game where id = v_jam and title = 'NBA Jam Tournament Edition') then
    update public.release r set game_id = v_te
    from public.platform p
    where p.id = r.platform_id and r.game_id = v_jam and p.short_name = 'PS1'
      and r.local_title in ('NBA Jam Tournament Edition', 'NBA Jam: Tournament Edition');
    update public.game set title = 'NBA Jam', slug = null where id = v_jam;
    perform private.assign_game_slug(v_jam);
  end if;
end $$;
