-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (PlayStation) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console PS1 le 2026-11-23.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « PlayStationのゲームタイトル一覧 ») et remarques de cette liste ; Wikipédia
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
  (1146, 'Nekketsu Oyako', 'Q270948'),
  (1374, 'Lunatic Dawn Odyssey', 'Q744038'),
  (2028, '学園戦隊ソルブラスト', 'Q1610017'),
  (2124, 'ファンタステップ', 'Q23916'),
  (1885, 'Tiny Bullets', 'Q270948'),
  (1812, 'Not Treasure Hunter', 'Q23916'),
  (2047, '実況パワフルプロ野球2001', 'Q62019045'),
  (1884, 'Power Shovel', 'Q1610017'),
  (1868, 'CIRCADIA', 'Q23916'),
  (561, 'Twin Goddesses', 'Q846224'),
  (2041, 'ここ掘れ!プッカ', 'Q1610017'),
  (2136, 'Minton Keibu no Sousa File: Doukeshi Satsujin Jiken', 'Q23916'),
  (2145, 'Neo Atlas', 'Q1610017'),
  (770, 'Dezaemon Kids!', 'Q1044478'),
  (2076, 'HASHIRIYA 狼たちの伝説', 'Q860750'),
  (1940, 'Satomi no Nazo', 'Q744038'),
  (725, 'Crazy Climber 2000', 'Q270948'),
  (2008, 'Doki Oki', 'Q23916'),
  (1907, 'Kamen Rider', 'Q846224'),
  (2089, 'Shachou Eiyuuden: The Eagle Shooting Heroes', 'Q744038'),
  (2088, 'パンドラMAXシリーズVOL.5 ごちゃちる', 'Q23916'),
  (1822, 'Mermaid no Kisetsu', 'Q14411698'),
  (2046, 'ポポロクロイス物語II', 'Q744038'),
  (2042, 'やきとり娘〜スゴ腕繁盛記〜', 'Q270948'),
  (2050, '超魔神英雄伝ワタル ANOTHER STEP', 'Q744038'),
  (1847, 'Rurouni Kenshin: Meiji Kenkaku Romantan - Jūyūshi Inbō Hen', 'Q744038'),
  (2049, '超謎王', 'Q11298493'),
  (1865, 'SPRIGGAN LUNAR VERSE', 'Q270948'),
  (52, 'FRONT MISSION HISTORY', 'Q1529437'),
  (1873, 'Summon Night', 'Q1529437'),
  (2074, 'Wizardry Empire: Inishie no Ōjo', 'Q744038'),
  (1867, 'Jet de Go!', 'Q1610017'),
  (1327, 'Wizardry: Dimguil', 'Q744038'),
  (1565, 'Dezaemon Plus', 'Q1044478'),
  (2062, 'Boundary Gate: Daughter of Kingdom', 'Q744038'),
  (1890, 'Falcata', 'Q1610017'),
  (1286, 'Street Fighter EX Plus Alpha', 'Q846224'),
  (1895, 'BRAVE SAGA2', 'Q744038'),
  (1895, 'BRAVE SAGA2', 'Q1610017'),
  (1866, 'Spectral Force', 'Q1529437'),
  (2142, 'Kamen Rider V3', 'Q846224'),
  (2130, '天空のレストラン', 'Q19272838'),
  (1047, 'Captain Tsubasa: Aratanaru Densetsu Joshou', 'Q1478420'),
  (1047, 'Captain Tsubasa: Aratanaru Densetsu Joshou', 'Q868217'),
  (1875, 'Yarudora Series Vol. 3: Sampaguita', 'Q23916'),
  (1998, 'Chocobo Stallion', 'Q1610017'),
  (1428, 'Wing Over', 'Q1044478'),
  (2138, 'Neorude', 'Q744038'),
  (1599, 'Midori no Makibao Kuroi Inazuma Shiroi Kiseki', 'Q108611897'),
  (1935, 'Yarudora Series Vol. 4: Yukiwari no Hana', 'Q23916'),
  (2006, 'Aubirdforce After', 'Q1610017'),
  (1923, 'Touge Max G', 'Q860750'),
  (2123, 'ピックスの大冒険', 'Q270948'),
  (2274, 'Arubarea no Otome ~Uruwashi no Seishikitachi~', 'Q1339223'),
  (2281, 'Asuka 120% Final: Burning Fest. Final', 'Q846224'),
  (2283, 'Asuka 120% Special Burning Fest', 'Q846224'),
  (2300, 'Bakusou Dekotora Densetsu: Otoko Ippiki Yume Kaidoi', 'Q860750'),
  (2301, 'Bakusou Dekotora Densetsu 2: Otoko Jinsei Yume Ichiro', 'Q860750'),
  (2344, 'Blade Arts', 'Q343568'),
  (2354, 'Blue Breaker Burst: Bishou o Anata to', 'Q343568'),
  (2354, 'Blue Breaker Burst: Bishou o Anata to', 'Q744038'),
  (2355, 'Blue Breaker Burst: Egao no Asuni', 'Q343568'),
  (2355, 'Blue Breaker Burst: Egao no Asuni', 'Q744038'),
  (2484, 'Culdcept Expansion', 'Q19272838'),
  (2505, 'Dance Dance Revolution (Japan)', 'Q584105'),
  (2506, 'Dance Dance Revolution 2ndReMix', 'Q584105'),
  (2508, 'Dance Dance Revolution 2ndReMix Append Club Version Vol.2 (Expansion)', 'Q584105'),
  (2509, 'Dance Dance Revolution 3rdMix', 'Q584105'),
  (2604, 'DX Jinsei Game III', 'Q19272838'),
  (2605, 'DX Jinsei Game IV', 'Q19272838'),
  (2618, 'Eberouge Special: Koi to Mahou no Gakuen Seikatsu', 'Q1339223'),
  (2622, 'Efficus: Kono Omoi o Kimi ni...', 'Q1339223'),
  (2672, 'The FamiRes: Shijou Saikyou no Menu', 'Q1036289'),
  (2707, 'Forget Me Not: Palette', 'Q23916'),
  (2729, 'G1 Jockey 2000', 'Q1610017'),
  (2729, 'G1 Jockey 2000', 'Q108611897'),
  (2786, 'Gouketuji Ichizoku 2: Chottodake Saikyou Densetsu', 'Q846224'),
  (2806, 'Gunpey', 'Q11282930'),
  (2923, 'Houma Hunter Lime: Special Collection Vol. 1', 'Q23916'),
  (2924, 'Houma Hunter Lime: Special Collection Vol. 2', 'Q23916'),
  (2925, 'Houma Hunter Lime with Paint Maker', 'Q23916'),
  (2935, 'Hyouryuu Ki: The Reportage Beyond the Sea', 'Q1610017'),
  (3033, 'Junjou de Karen Meimai Kishi-dan: Spectral Force Seishoujo Gaiden', 'Q1529437'),
  (3054, 'Kaitohranma Miyabi', 'Q1610017'),
  (3098, 'Kidou Senshi Gundam: Giren no Yabou- Zeon no Keifu', 'Q472055'),
  (3126, 'Klaymen Gun-Hockey', 'Q270948'),
  (3126, 'Klaymen Gun-Hockey', 'Q868217'),
  (3146, 'Kōshien V', 'Q62019045'),
  (3192, 'Liberogrande International', 'Q1478420'),
  (3238, 'Magical Drop', 'Q11282930'),
  (3239, 'Magical Drop III: Yokubari Tokudaigou!', 'Q11282930'),
  (3302, 'Medarot R', 'Q744038'),
  (3307, 'Melty Lancer: Ginga Shoujo Keisatsu 2086', 'Q1610017'),
  (3316, 'Memories Off 2nd', 'Q14411698'),
  (3319, 'Mermaid no Kisetsu: Curtain Call', 'Q14411698'),
  (3320, 'Merriment Carrying Caravan', 'Q1610017'),
  (3329, 'Mezase! Senkyuu Ou', 'Q54767'),
  (3448, 'Neo Atlas II', 'Q1610017'),
  (3450, 'Neorude 2', 'Q744038'),
  (3562, 'Paca Paca Passion', 'Q584105'),
  (3685, 'Point Blank 3', 'Q3965952'),
  (3690, 'Pop''n Music 2', 'Q584105'),
  (3692, 'Pop''n Music 4 Append Disc', 'Q584105'),
  (3694, 'Pop''n Music 6', 'Q584105'),
  (3702, 'Power Dolls 2: Detachment of Limited Line Service', 'Q1610017'),
  (3703, 'Power League', 'Q868217'),
  (3708, 'Prince of Tennis', 'Q61793886'),
  (3778, 'Real Bout Garou Densetsu', 'Q846224'),
  (3809, 'RPG Tsukuru 4', 'Q744038'),
  (3837, 'Samurai Spirits Kenkaku Yubinan Pack', 'Q846224'),
  (3859, 'SD Gundam G Generation Zero', 'Q1610017'),
  (3891, 'Sentou Kokka: Air Land Battle', 'Q1610017'),
  (3917, 'Shin Megami Tensei: Devil Children - Black Book / Red Book', 'Q744038'),
  (3921, 'Shin Super Robot Taisen Special Disk (Expansion)', 'Q1529437'),
  (3922, 'Shin Theme Park', 'Q1036289'),
  (3935, 'Shiritsu Justice Gakuen: Nekketsu Seisyun Nikki 2', 'Q846224'),
  (3947, 'Shutokou Battle R', 'Q860750'),
  (3950, 'Sidewinder 2', 'Q1044478'),
  (4109, 'Spectral Force 2', 'Q1529437'),
  (4110, 'Spectral Force: Lovely Wickedness', 'Q1529437'),
  (4303, 'True Love Story ~Remember my Heart~', 'Q1339223'),
  (4303, 'True Love Story ~Remember my Heart~', 'Q23916'),
  (4304, 'True Love Story 2', 'Q1339223'),
  (4304, 'True Love Story 2', 'Q23916'),
  (4376, 'Virtual Hiyru no Ken', 'Q846224'),
  (4449, 'World Stadium 3', 'Q62019045'),
  (4450, 'World Stadium 4', 'Q62019045'),
  (4451, 'World Stadium 5', 'Q62019045'),
  (4486, 'Yukyu Gensokyoku', 'Q1610017'),
  (4487, 'Yukyu Gensokyoku 2nd Album', 'Q1610017'),
  (4488, 'Yukyu Gensokyoku 3: Perpetual Blue', 'Q1610017'),
  (4489, 'Yukyu Gensokyoku ensemble', 'Q1610017'),
  (4490, 'Yukyu Gensokyoku ensemble 2', 'Q1610017'),
  (1863, 'Kids Station - Crayon Shin-Chan - Ora to Omoide Tsukuruzo!', 'Q126598654'),
  (2079, 'Kids Station: Doraemon: Himitsu no Yojigen Pocket', 'Q126598654'),
  (1823, 'Tennis no Oujisama: Sweat & Tears', 'Q1610017'),
  (1891, 'Pandora Max Series Vol. 3: Rubbish Blazon', 'Q744038');

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
