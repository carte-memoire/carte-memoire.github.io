-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (Game Boy) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console GB le 2026-11-26.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « ゲームボーイのゲームタイトル一覧 ») et remarques de cette liste ; Wikipédia
-- en japonais, CC BY-SA. Liste relue avant écriture.
--
-- 129 jeux sans genre. Garde-fous : le titre doit être identique, le jeu
-- toujours sans genre, et non revu par un modérateur.
-- =====================================================================

create temporary table ja_genre (
  game_id   bigint not null,
  title     text not null,
  genre_qid text not null
);

insert into ja_genre (game_id, title, genre_qid) values
  (12844, 'Bonk''s Adventure', 'Q270948'),
  (12849, 'Trump Boy II', 'Q19272838'),
  (12851, 'Magical Tarurūto-kun', 'Q270948'),
  (9267, 'Plotting', 'Q54767'),
  (12892, 'Xerd no Densetsu', 'Q744038'),
  (12896, 'Dungeon Land', 'Q19272838'),
  (12899, 'Trump Boy', 'Q19272838'),
  (12953, 'Aa Harimanada', 'Q868217'),
  (9943, 'Downtown Special: Kunio-kun''s Historical Period Drama!', 'Q1422746'),
  (12957, 'Yu Yu Hakusho', 'Q270948'),
  (12965, 'Game & Watch Gallery', 'Q270948'),
  (12966, 'Speedy Gonzales', 'Q270948'),
  (12078, 'Nontan to Issho: KuruKuru Puzzle', 'Q54767'),
  (13007, 'Game Boy Wars Turbo', 'Q1610017'),
  (13007, 'Game Boy Wars Turbo', 'Q472055'),
  (13083, 'Kingyo Chūihō! Wapiko no Waku Waku Stamp Rally!', 'Q126598654'),
  (13119, 'Zoids densetsu', 'Q1044478'),
  (11908, 'Uchū no Kishi: Tekkaman Blade', 'Q270948'),
  (13171, 'Power Pro GB', 'Q868217'),
  (13205, 'Aretha II', 'Q744038'),
  (13206, 'Lunar Lander', 'Q270948'),
  (13208, 'Legend of the River King GB', 'Q744038'),
  (13234, 'Aoki Densetsu Shoot!', 'Q1478420'),
  (13237, 'Aretha', 'Q744038'),
  (13238, 'Aretha III', 'Q744038'),
  (13240, 'Avenging Spirit', 'Q270948'),
  (13247, 'Battle Dodge Ball', 'Q868217'),
  (13249, 'Bikkuri Nekketsu Shin Kiroku! Dokodemo Kin Medal', 'Q270948'),
  (13249, 'Bikkuri Nekketsu Shin Kiroku! Dokodemo Kin Medal', 'Q868217'),
  (13255, 'Bonk''s Revenge', 'Q270948'),
  (13261, 'Capcom Quiz: Hatena? no Daibōken', 'Q11298493'),
  (13262, 'Captain Tsubasa J: Zenkoku Seiha Heno Chōsen', 'Q1478420'),
  (13266, 'Chacha-Maru Panic', 'Q270948'),
  (13272, 'Chibi Maruko Chan: Okozukai Daisakusen', 'Q126598654'),
  (13278, 'Collection Pocket', 'Q126598654'),
  (13281, 'Crayon Shin-Chan 2: Ora to Wanpaku Gokko Dazo', 'Q270948'),
  (13282, 'Crayon Shin-Chan 3: Ora no Gokigen Athletic', 'Q126598654'),
  (13283, 'Crayon Shin-Chan 4: Ora no Itazura Dai Henshin', 'Q270948'),
  (13285, 'Crayon Shin-Chan: Ora to Shiro ha Otomodachi Dayo', 'Q270948'),
  (13290, 'Daisenryaku', 'Q1610017'),
  (13292, 'Doraemon 2: Animal Wakusei Densetsu', 'Q343568'),
  (13301, 'Doraemon: Taiketsu Himitsu Dogu!!', 'Q1044478'),
  (13301, 'Doraemon: Taiketsu Himitsu Dogu!!', 'Q270948'),
  (13306, 'Downtown Nekketsu Kōshinkyoku: Dokodemo Daiundōkai', 'Q270948'),
  (13306, 'Downtown Nekketsu Kōshinkyoku: Dokodemo Daiundōkai', 'Q868217'),
  (13307, 'Dragon Ball Z: Goku Gekitōden', 'Q744038'),
  (13308, 'Dragon Ball Z: Goku Hishōden', 'Q1529437'),
  (13309, 'Dragon Slayer Gaiden: Nemuri no Ōkan', 'Q1422746'),
  (13309, 'Dragon Slayer Gaiden: Nemuri no Ōkan', 'Q744038'),
  (13317, 'Family Jockey 2: Meiba no Kettō', 'Q860750'),
  (13318, 'Famista 2', 'Q868217'),
  (13318, 'Famista 2', 'Q62019045'),
  (13319, 'Famista 3', 'Q868217'),
  (13319, 'Famista 3', 'Q62019045'),
  (13327, 'Flappy Special', 'Q11282930'),
  (13334, 'Game & Watch Gallery 2', 'Q270948'),
  (13337, 'Ganso!! Yancha-Maru', 'Q270948'),
  (13340, 'Gegege no Kitarō: Yōkai Sōzōshu Arawaru!', 'Q744038'),
  (13341, 'Gekitō Power Modeler', 'Q846224'),
  (13346, 'Go Go Ackman', 'Q270948'),
  (13355, 'Hero Shugo!! Pinball Party', 'Q653928'),
  (13359, 'Hitori de Dekirumon! Cooking Densetsu', 'Q744038'),
  (13360, 'Hon Shogi', 'Q96102031'),
  (13366, 'Hyper Black Bass ''95', 'Q16935625'),
  (13367, 'Ikari no Yōsai 2', 'Q1044478'),
  (13367, 'Ikari no Yōsai 2', 'Q270948'),
  (13382, 'Jikū Senki Mu', 'Q744038'),
  (13383, 'Jinsei Game', 'Q19272838'),
  (13384, 'Jinsei Game Densetsu', 'Q19272838'),
  (13385, 'Jungle no Ōja Tar-chan', 'Q270948'),
  (13386, 'Jungle Wars', 'Q744038'),
  (13388, 'Kamen Rider SD: Hashire! Mighty Riders', 'Q860750'),
  (13390, 'Karakuri Kengō Den Musashi Lord', 'Q270948'),
  (13399, 'Kenyū Densetsu Yaiba', 'Q270948'),
  (13403, 'Kinnikuman: The Dream Match', 'Q846224'),
  (13403, 'Kinnikuman: The Dream Match', 'Q105221690'),
  (13405, 'Kiteretsu Daihyakka: Bōken Ōedo Juraki', 'Q270948'),
  (13407, 'Klax (Hudson)', 'Q54767'),
  (13424, 'Kūsō Kagaku Sekai Gulliver Boy: Kūsō Kagaku Puzzle – Puritto Pon', 'Q54767'),
  (13434, 'Mahōjin GuruGuru: Yūsha to Kukuri no Daibōken', 'Q126598654'),
  (13437, 'Marmalade Boy', 'Q1339223'),
  (13457, 'Mogu Mogu Gombo: Harukanaru Chō Ryōri Densetsu', 'Q744038'),
  (13459, 'Momotaro Collection', 'Q744038'),
  (13460, 'Momotaro Collection 2', 'Q744038'),
  (13461, 'Momotaro Dengeki: Momotaro Thunderbolt', 'Q270948'),
  (13462, 'Momotaro Dengeki 2: Momotaro Thunderbolt', 'Q270948'),
  (13463, 'Momotaro Densetsu Gaiden', 'Q744038'),
  (13464, 'Momotarō Dentetsu Jr.: Zenkoku Ramen Meguri no Maki', 'Q19272838'),
  (13467, 'Monster Maker', 'Q744038'),
  (13475, 'Nada Asatarō no Powerful Mahjong: Tsugi no Itte 100 Dai', 'Q9318902'),
  (13476, 'Namco Classic', 'Q60256879'),
  (13480, 'Nangoku Shōnen Papuwa-kun: Ganmadan no Yabō', 'Q54767'),
  (13485, 'Nectaris GB', 'Q1610017'),
  (13486, 'Nekketsu Kōkō Dodgeball Bu: Kyōteki! Dodge Soldier no Maki', 'Q868217'),
  (13489, 'Nettō Garō Densetsu 2: Aratanaru Tatakai', 'Q846224'),
  (13496, 'Nintama Rantarō GB', 'Q744038'),
  (13496, 'Nintama Rantarō GB', 'Q270948'),
  (13499, 'Nobunaga''s Ambition', 'Q472055'),
  (13534, 'Picross 2', 'Q54767'),
  (13548, 'Pokémon Blue Version', 'Q744038'),
  (13556, 'Pro Mahjong Kiwame GB', 'Q9318902'),
  (13565, 'R-Type', 'Q1044478'),
  (13566, 'R-Type II', 'Q1044478'),
  (13567, 'Radar Mission', 'Q1044478'),
  (13567, 'Radar Mission', 'Q472055'),
  (13569, 'Ranma ½: Kakuren Bodesu Match', 'Q54767'),
  (13571, 'Ray-Thunder', 'Q1044478'),
  (13580, 'Sagaia', 'Q1044478'),
  (13581, 'Saigo no Nindō: Ninja Spirit', 'Q270948'),
  (13584, 'Sangokushi Game Boy Han', 'Q472055'),
  (13588, 'Scotland Yard', 'Q19272838'),
  (13589, 'SD Gundam: Sengokuden 2: Tenka Tōitsuhen', 'Q1610017'),
  (13592, 'SD Lupin Sansei: Kinko Yaburi Daisakusen', 'Q270948'),
  (10021, 'Shanghai', 'Q54767'),
  (13597, 'Shanghai Pocket', 'Q54767'),
  (13613, 'Shinseiki GPX Cyber Formula', 'Q868217'),
  (13615, 'Shogi', 'Q19272838'),
  (13615, 'Shogi', 'Q96102031'),
  (13623, 'Space Invaders (1990)', 'Q96146284'),
  (13630, 'Super Bikkuriman: Densetsu no Sekiban', 'Q270948'),
  (13631, 'Super Black Bass', 'Q16935625'),
  (13632, 'Super Black Bass Pocket 2', 'Q16935625'),
  (13636, 'Super Momotaro Dentetsu', 'Q19272838'),
  (13637, 'Super Momotaro Dentetsu II', 'Q19272838'),
  (13639, 'Super Robot Taisen', 'Q1529437'),
  (13646, 'Taiyō no Yūsha Fighbird GB', 'Q1044478'),
  (13648, 'Tekkyu Fight! The Great Battle Gaiden', 'Q270948'),
  (13649, 'Tenchi o Kurau', 'Q1529437'),
  (13650, 'Tenjin Kaisen 2: Yomihon Yumegoyomi', 'Q1044478'),
  (13654, 'Tokio Senki: Eiyū Retsuden', 'Q1610017'),
  (13658, 'Tottemo! Lucky Man: Lucky Cookie Minna Daisuki!!', 'Q19272838'),
  (13667, 'Uchū Senkan Yamato', 'Q1610017'),
  (13668, 'Ultraman', 'Q270948'),
  (13675, 'Urusei Yatsura: Miss Tomobiki o Sagase!', 'Q744038'),
  (13679, 'Wario Blast: Featuring Bomberman!', 'Q270948'),
  (13680, 'Wedding Peach: Jamapii Panic', 'Q54767'),
  (13689, 'World Heroes 2 Jet', 'Q846224'),
  (13691, 'Xenon 2 Megablast', 'Q1044478'),
  (13692, 'Xerd no Densetsu 2: Xerd!! Gishin no Ryōiki', 'Q744038'),
  (13702, 'Zen-Nippon Pro Wrestling Jet', 'Q105221690'),
  (13706, 'Genjin Collection', 'Q270948');

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
