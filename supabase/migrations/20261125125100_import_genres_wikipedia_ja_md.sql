-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (Mega Drive) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console MD le 2026-11-26.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « メガドライブのゲームタイトル一覧 ») et remarques de cette liste ; Wikipédia
-- en japonais, CC BY-SA. Liste relue avant écriture.
--
-- 19 jeux sans genre. Garde-fous : le titre doit être identique, le jeu
-- toujours sans genre, et non revu par un modérateur.
-- =====================================================================

create temporary table ja_genre (
  game_id   bigint not null,
  title     text not null,
  genre_qid text not null
);

insert into ja_genre (game_id, title, genre_qid) values
  (14696, 'Party Quiz Mega Q', 'Q11298493'),
  (14779, 'Pepen ga Pengo', 'Q270948'),
  (15034, 'G-LOC: Air Battle', 'Q1044478'),
  (15323, 'Surging Aura', 'Q744038'),
  (15331, 'Super Daisenryaku', 'Q1610017'),
  (15486, 'Advanced Daisenryaku: Deutsch Dengeki Sakusen', 'Q1610017'),
  (15496, 'Fire Mustang', 'Q1044478'),
  (15497, 'Gōketsuji Ichizoku', 'Q846224'),
  (15498, 'Gyuwambler Jiko Chūshinha: Katayama Masayuki no Mahjong Dōjō', 'Q9318902'),
  (15516, 'Phantasy Star Fukkokuban', 'Q744038'),
  (15518, 'Puzzle & Action: Ichidant-R', 'Q19272838'),
  (15519, 'Puzzle & Action: Tant-R', 'Q19272838'),
  (15520, 'Rainbow Islands Extra', 'Q270948'),
  (15521, 'Ransei no Hasha', 'Q472055'),
  (15527, 'Slaughter Sport', 'Q846224'),
  (15530, 'Space Invaders 90', 'Q96146284'),
  (15533, 'Super Hang-On', 'Q860750'),
  (15538, 'Uncharted Waters: New Horizons', 'Q472055'),
  (15542, 'Wimbledon Championship Tennis', 'Q61793886');

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
