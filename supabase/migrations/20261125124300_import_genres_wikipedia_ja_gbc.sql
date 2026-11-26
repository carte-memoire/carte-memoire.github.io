-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (Game Boy Color) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console GBC le 2026-11-26.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « ゲームボーイカラーのゲームタイトル一覧 ») et remarques de cette liste ; Wikipédia
-- en japonais, CC BY-SA. Liste relue avant écriture.
--
-- 43 jeux sans genre. Garde-fous : le titre doit être identique, le jeu
-- toujours sans genre, et non revu par un modérateur.
-- =====================================================================

create temporary table ja_genre (
  game_id   bigint not null,
  title     text not null,
  genre_qid text not null
);

insert into ja_genre (game_id, title, genre_qid) values
  (13870, 'Game & Watch Gallery 3', 'Q270948'),
  (13930, 'Game Boy Wars 3', 'Q1610017'),
  (13930, 'Game Boy Wars 3', 'Q472055'),
  (13972, 'DT: Lords of Genomes', 'Q23916'),
  (13999, 'Zoids: Jashin fukkatsu! Geno Breaker-hen', 'Q744038'),
  (14020, 'Super Robot Wars Link Battler', 'Q1529437'),
  (14217, 'DX Monopoly GB', 'Q19272838'),
  (14247, 'Boku no Camp Jou', 'Q1036289'),
  (14252, 'Brave Saga Shinshou Astaria', 'Q744038'),
  (14283, 'Densha de Go!', 'Q1610017'),
  (14299, 'Dragon Warrior I & II', 'Q744038'),
  (14302, 'DX Jinsei Game', 'Q19272838'),
  (14315, 'From TV Animation One Piece: Yume no Luffy Kaizokudan Tanjou!', 'Q744038'),
  (14318, 'Fushigi no Dungeon: Fuurai no Shiren GB2: Sabaku no Majou', 'Q744038'),
  (14323, 'Ganbare Goemon: Tengu-tou no Gyakushuu!', 'Q744038'),
  (14324, 'GB Harobots', 'Q744038'),
  (14332, 'Gonta no Okiraku Daibouken', 'Q23916'),
  (14335, 'The Great Battle Pocket', 'Q744038'),
  (14344, 'Hamster Club: Awasete Chuu', 'Q54767'),
  (14345, 'Hamster Club: Oshiema Chuu', 'Q11298493'),
  (14372, 'Ide Yosuke no Mahjong Kyoushitsu GB', 'Q9318902'),
  (14378, 'Jet de Go!: Let''s go by Airliner', 'Q1610017'),
  (14380, 'Jinsei Game: Tomedachi Takusan Tsukurouyo!', 'Q19272838'),
  (14408, 'Kindaichi Shounen no Jikenbo: 10nenme no Shoutaijou', 'Q689445'),
  (14451, 'Medarot 3: Parts Collection', 'Q744038'),
  (14461, 'Metamode', 'Q1422746'),
  (14463, 'Mickey''s Speedway USA', 'Q860750'),
  (14484, 'Nakayoshi Pet Series 1: Kawaii Hamster', 'Q1610017'),
  (14485, 'Nakayoshi Pet Series 2: Kawaii Usagi', 'Q1610017'),
  (14486, 'Nakayoshi Pet Series 3: Kawaii Koinu', 'Q1610017'),
  (14487, 'Nakayoshi Pet Series 4: Kawaii Koneko', 'Q1610017'),
  (14488, 'Nakayoshi Pet Series 5: Kawaii Hamster 2', 'Q1610017'),
  (14516, 'Pia Carrot e Youkoso!! 2.2', 'Q1339223'),
  (14516, 'Pia Carrot e Youkoso!! 2.2', 'Q14411698'),
  (14527, 'Pocket King', 'Q744038'),
  (14527, 'Pocket King', 'Q1610017'),
  (14549, 'Puyo Puyo Gaiden: Puyo Wars', 'Q1529437'),
  (14568, 'RPG Tsukuru GB', 'Q744038'),
  (14573, 'Sakura Taisen GB: Geki Hana Kumi Nyuutai!', 'Q23916'),
  (14574, 'Sakura Taisen GB2: Thunder Volt Sakusen', 'Q744038'),
  (14575, 'San Goku Shi: Game Boy Ban 2', 'Q472055'),
  (14590, 'Shin Megami Tensei Devil Children: Shiro no Shou', 'Q744038'),
  (14592, 'Shin Seiki Evangelion: Mahjong Hokan Keikaku', 'Q9318902'),
  (14611, 'Super Robot Pinball', 'Q270948'),
  (14633, 'Uchuu Nin Tanaka Tarou de RPG Tsukuru GB2', 'Q744038'),
  (14647, 'WWF WrestleMania 2000', 'Q105221690');

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
