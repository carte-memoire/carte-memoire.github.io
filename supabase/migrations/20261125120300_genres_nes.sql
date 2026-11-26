-- =====================================================================
-- Carte Mémoire · Genres des jeux NES : comme pour la PS1 et la PS2
--
-- L'import Wikidata des jeux NES n'apporte que deux genres encore inconnus, au libellé
-- anglais. Ils rejoignent le genre français qui leur correspond, et leur identifiant
-- Wikidata reste en alias : un prochain import ne les recrée pas.
--   - « Mahjong solitaire » (Shanghai…) : un jeu de correspondance de tuiles ;
--   - « Mathematical education » : un jeu éducatif.
-- =====================================================================

create function pg_temp.regenre(p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  v_old public.genre;
  v_new public.genre;
begin
  select * into v_old from public.genre where name = p_old;
  if not found then
    return;
  end if;
  select * into v_new from public.genre where name = p_new and id <> v_old.id;
  if not found then
    update public.genre set name = p_new where id = v_old.id;
    return;
  end if;
  insert into public.game_genre (game_id, genre_id)
  select gg.game_id, v_new.id from public.game_genre gg where gg.genre_id = v_old.id
  on conflict do nothing;
  delete from public.game_genre where genre_id = v_old.id;
  if v_old.wikidata_id is not null then
    insert into public.genre_alias (wikidata_id, genre_id) values (v_old.wikidata_id, v_new.id)
    on conflict (wikidata_id) do update set genre_id = excluded.genre_id;
  end if;
  delete from public.genre where id = v_old.id;
end;
$$;

select pg_temp.regenre('Mahjong solitaire video game', 'Jeu de correspondance de tuile');
select pg_temp.regenre('Mathematical education video game', 'Éducatif');
