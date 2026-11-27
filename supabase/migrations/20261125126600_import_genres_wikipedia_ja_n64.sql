-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (Nintendo 64) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console N64 le 2026-11-27.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « NINTENDO64のゲームタイトル一覧 ») et remarques de cette liste ; Wikipédia
-- en japonais, CC BY-SA. Liste relue avant écriture.
--
-- 2 jeux sans genre. Garde-fous : le titre doit être identique, le jeu
-- toujours sans genre, et non revu par un modérateur.
-- =====================================================================

create temporary table ja_genre (
  game_id   bigint not null,
  title     text not null,
  genre_qid text not null
);

insert into ja_genre (game_id, title, genre_qid) values
  (15904, 'Super Smash Bros.', 'Q270948'),
  (15966, 'Fushigi no Dungeon: Fūrai no Shiren 2: Oni Shūrai! Shiren-jō!', 'Q744038');

create temporary table ja_genre_match as
select distinct t.game_id as listed_id, g.id
from ja_genre t
join public.game g on g.title = t.title
where (g.id = t.game_id or (select count(*) from public.game g2 where g2.title = t.title) = 1)
  and not g.genres_reviewed
  and not exists (
    select 1 from public.game_genre gg join public.genre ge on ge.id = gg.genre_id
    where gg.game_id = g.id and cardinality(ge.families) > 0
  );

insert into public.game_genre (game_id, genre_id)
select m.id, ge.id
from ja_genre t
join ja_genre_match m on m.listed_id = t.game_id
join public.genre ge on ge.wikidata_id = t.genre_qid
on conflict do nothing;

drop table ja_genre_match;
drop table ja_genre;
