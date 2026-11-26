-- =====================================================================
-- Carte Mémoire · Genres des jeux Famicom Disk System encore sans genre, depuis libretro-database
-- Fichier GÉNÉRÉ par scripts/import-genres-libretro.mjs le 2026-11-26.
-- Source : libretro-database, metadat/genre (licence CC BY-SA 4.0),
--   https://github.com/libretro/libretro-database
--
-- 40 jeux. Seulement ceux qui n'ont toujours aucun genre (de famille) au moment
-- de s'appliquer, et jamais un jeu revu par un modérateur. Jeux désignés par leur numéro ET
-- leur titre (garde-fou).
-- =====================================================================

insert into public.game_genre (game_id, genre_id)
select g.id, ge.id
from (values
  (10738, 'Professional Mahjong Gokuu', 'Q19272838', null),
  (10759, 'Fire Rock', 'Q270948', null),
  (10761, 'Big Challenge! Dogfight Spirit', 'Q1044478', null),
  (10763, 'Big Challenge! Go! Go! Bowling', 'Q868217', null),
  (10764, 'Radical Bomber!! Jirai-kun', 'Q472055', null),
  (10769, 'Matou no Houkai: The Hero of Babel', 'Q23916', null),
  (10774, 'Kamen Rider Black: Taiketsu Shadow Moon', 'Q270948', null),
  (10776, 'Konamic Tennis', 'Q868217', null),
  (10777, 'Putt Putt Golf', 'Q868217', null),
  (10783, 'Golf: US Course', 'Q868217', null),
  (10784, 'Family Composer', 'Q584105', null),
  (10785, 'Golf: Japan Course', 'Q868217', null),
  (10789, 'Igo: Kyuu Roban Taikyoku', 'Q19272838', null),
  (10790, 'Omoikkiri Tanteidan Haadogumi: Matenrou no Chousenjou', 'Q23916', null),
  (10791, 'Panic Space', 'Q54767', null),
  (10792, 'Nankin no Adventure', 'Q23916', null),
  (10794, 'Hong Kong', 'Q19272838', null),
  (10798, 'Breeder', 'Q1610017', null),
  (10800, 'Bakutoushi Patton-Kun', 'Q270948', null),
  (10803, 'Pulsar no Hikari: Space Wars Simulation', 'Q472055', null),
  (10806, 'Adian no Tsue', 'Q1224999', null),
  (10890, 'Gokuraku Yuugi: Game Tengoku', 'Q60617897', null),
  (10891, 'Pro Golfer Saru: Kage no Tournament', 'Q868217', null),
  (10892, 'Santa Claus no Takarabako', 'Q54767', null),
  (10894, 'All 1', 'Q54767', null),
  (10896, 'Aspic: Majaou no Noroi', 'Q744038', null),
  (10898, 'Big Challenge! Gun Fighter', 'Q4282636', null),
  (10902, 'Famicom Grand Prix: F-1 Race', 'Q860750', null),
  (10908, 'Green Beret', 'Q4282636', null),
  (10912, 'Kaettekita Mario Bros.', 'Q828322', null),
  (10928, 'Puzzle Boys', 'Q54767', null),
  (10929, 'SD Gundam World: Gachapon Senshi - Scramble Wars Map Collection', 'Q472055', null),
  (10930, 'Smash Ping Pong', 'Q868217', null),
  (10931, 'Super Lode Runner', 'Q54767', null),
  (10932, 'Super Lode Runner II', 'Q54767', null),
  (10933, 'Super Mario Bros.', 'Q828322', null),
  (10940, 'Wardner no Mori', 'Q828322', null),
  (10941, 'Aki to Tsukasa no Fushigi no Kabe', 'Q54767', null),
  (10951, 'BodyConQuest I: Abakareshi Musume Tachi', 'Q744038', null),
  (10953, 'Date de Blackjack', 'Q60617897', null)
) as v (game_id, title, genre_qid, genre_name)
join public.game g on g.id = v.game_id and g.title = v.title
join public.genre ge on ge.wikidata_id = v.genre_qid or (v.genre_qid is null and ge.name = v.genre_name)
where not g.genres_reviewed
  and not exists (select 1 from public.game_genre gg join public.genre x on x.id = gg.genre_id
                  where gg.game_id = g.id and cardinality(x.families) > 0)
on conflict do nothing;
