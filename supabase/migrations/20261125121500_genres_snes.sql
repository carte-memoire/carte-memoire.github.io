-- =====================================================================
-- Carte Mémoire · Genres des jeux Super Nintendo : comme pour la PS1, la PS2 et la NES
--
-- L'import Wikidata des jeux Super Nintendo apporte quatre genres encore inconnus, au
-- libellé anglais. Ils rejoignent le genre français qui leur correspond (ou prennent un
-- libellé français), et leur identifiant Wikidata reste en alias : un prochain import ne
-- les recrée pas.
--   - « Pachinko video game » (Heiwa Pachinko World…) : pachinko et pachislot ;
--   - « Raising sim video game » (Princess Maker) : un jeu de simulation de vie ;
--   - « Dystopian video game » : un thème, la dystopie ;
--   - « Video game art » (Mario Paint) : une catégorie qui ne dit rien du jeu, retirée.
-- =====================================================================

-- Renomme p_old en p_new ; si p_new existe déjà, fusionne p_old dedans
create or replace function pg_temp.regenre(p_old text, p_new text)
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

-- Retire une catégorie qui ne dit rien du jeu (son identifiant reste, sans genre)
create or replace function pg_temp.drop_genre(p_name text)
returns void
language plpgsql
as $$
declare
  v public.genre;
begin
  select * into v from public.genre where name = p_name;
  if not found then
    return;
  end if;
  if v.wikidata_id is not null then
    insert into public.genre_alias (wikidata_id, genre_id) values (v.wikidata_id, null)
    on conflict (wikidata_id) do update set genre_id = null;
  end if;
  delete from public.game_genre where genre_id = v.id;
  delete from public.genre where id = v.id;
end;
$$;

select pg_temp.regenre('Pachinko video game', 'Pachinko et pachislot');
select pg_temp.regenre('Raising sim video game', 'Jeu de simulation de vie');
select pg_temp.regenre('Dystopian video game', 'Dystopie');
select pg_temp.drop_genre('Video game art');
