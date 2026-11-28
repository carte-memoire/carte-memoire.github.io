-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (Game Boy Advance) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console GBA le 2026-11-28.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « ゲームボーイアドバンスのゲームタイトル一覧 ») et remarques de cette liste ; Wikipédia
-- en japonais, CC BY-SA. Liste relue avant écriture.
--
-- 12 jeux sans genre. Garde-fous : le titre doit être identique, le jeu
-- toujours sans genre, et non revu par un modérateur.
-- =====================================================================

create temporary table ja_genre (
  game_id   bigint not null,
  title     text not null,
  genre_qid text not null
);

insert into ja_genre (game_id, title, genre_qid) values
  (16013, 'Dr. Mario & Puzzle League', 'Q11282930'),
  (16063, 'Mother 1 + 2', 'Q744038'),
  (16263, 'Domo-kun no Fushigi Terebi', 'Q270948'),
  (16376, 'Super Mario World: Super Mario Advance 2', 'Q270948'),
  (16610, 'Yoshi''s Island: Super Mario Advance 3', 'Q270948'),
  (16624, 'Game & Watch Gallery 4', 'Q270948'),
  (16629, 'Boku no Kabuto - Kuwagata', 'Q23916'),
  (16631, 'Oriental Blue - Ao no Tengai', 'Q744038'),
  (16666, 'Daisuki Teddy', 'Q23916'),
  (16667, 'Power Poke Dash', 'Q62019045'),
  (17265, 'Need for Speed: Carbon – Own the City', 'Q860750'),
  (17299, 'Play Novel Silent Hill', 'Q23916');

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
