-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (Famicom Disk System) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console FDS le 2026-11-26.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « undefined ») et remarques de cette liste ; Wikipédia
-- en japonais, CC BY-SA. Liste relue avant écriture.
--
-- 18 jeux sans genre. Garde-fous : le titre doit être identique, le jeu
-- toujours sans genre, et non revu par un modérateur.
-- =====================================================================

create temporary table ja_genre (
  game_id   bigint not null,
  title     text not null,
  genre_qid text not null
);

insert into ja_genre (game_id, title, genre_qid) values
  (10732, 'Moon Ball Magic', 'Q19272838'),
  (10741, 'Tantei Jingūji Saburō: Shinjuku Chūō Kōen Satsujin Jiken', 'Q23916'),
  (10742, 'Replicart', 'Q270948'),
  (10744, 'Jikai Shounen Mettomag', 'Q11282930'),
  (10796, 'Exciting Billiard', 'Q868217'),
  (10797, 'Hikaru Genji: Roller Panic', 'Q23916'),
  (10807, 'Yūshi no Monshō: Deep Dungeon', 'Q744038'),
  (9405, 'Karate Champ', 'Q846224'),
  (9202, 'Volleyball', 'Q868217'),
  (10841, 'Exciting Baseball', 'Q868217'),
  (10846, '19: Neunzehn', 'Q1610017'),
  (10867, 'Konami''s Ping Pong', 'Q868217'),
  (10868, 'Kinnikuman: Kinniku-Sei Ōi Sōdatsusen', 'Q270948'),
  (10868, 'Kinnikuman: Kinniku-Sei Ōi Sōdatsusen', 'Q105221690'),
  (10878, 'Apple Town Monogatari: Little Computer People', 'Q1610017'),
  (10880, 'Ultraman: Kaijū Teikoku no Gyakushū', 'Q270948'),
  (10882, 'Samurai Sword', 'Q23916'),
  (10036, 'Bomberman', 'Q270948'),
  (10934, 'Super Mario Bros. 2', 'Q270948');

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
