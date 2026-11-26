-- =====================================================================
-- Carte Mémoire · Résumés des jeux : introduction des articles de Wikipédia en français
-- Fichier GÉNÉRÉ par scripts/import-summaries.mjs le 2026-11-26 : ne pas modifier à la main.
--
-- Textes issus de Wikipédia en français, licence CC BY-SA 4.0
--   https://creativecommons.org/licenses/by-sa/4.0/deed.fr
-- Chaque résumé garde l'adresse de son article (game.summary_source), affichée
-- sur la fiche du jeu. Auteurs : voir l'historique de chaque article.
--
-- 29 résumés. Un résumé déjà présent n'est jamais écrasé.
-- =====================================================================

create temporary table import_summary (wikidata_id text primary key, summary text not null, source text not null);

insert into import_summary (wikidata_id, summary, source) values
  ('Q11328844', 'Kwirk est un jeu vidéo d''action et de puzzle développé par Atlus et édité par Acclaim Entertainment, sorti en 1989 sur PC-Engine et Game Boy.', 'https://fr.wikipedia.org/wiki/Kwirk'),
  ('Q11332611', 'Apollo Technica, puis Soft Pro International, est un éditeur et développeur de jeux vidéo japonais actif dans les années 80. La société édite et développe des jeux sur FM-7, MSX, PC-88, PC-98, Sharp X1, Famicom et Famicom Disk System.', 'https://fr.wikipedia.org/wiki/Soft_Pro_International'),
  ('Q847977', 'Nazo no Murasame Jō, aussi connu sous le nom de The Mysterious Murasame Castle, est un jeu vidéo d''action-aventure développé par Nintendo EAD et édité par Nintendo, sorti uniquement au Japon en 1986 sur Famicom Disk System et en 2004 sur Game Boy Advance.

Il se déroule dans le Japon médiéval et met en scène un apprenti samouraï nommé Takamaru qui doit atteindre cinq différents châteaux afin de les libérer de l''emprise d''une entité extraterrestre.

C''est l''un des premiers jeux sortis sur Famicom Disk System, et le deuxième jeu original après The Legend of Zelda. Il faut attendre 2014 pour qu''il sorte en Occident sur la console virtuelle de Nintendo 3DS, respectivement mai 2014 pour l''Europe et l''Australie et août 2014 pour l''Amérique du Nord.', 'https://fr.wikipedia.org/wiki/Nazo_no_Murasame_J%C5%8D'),
  ('Q761452', 'Ai Senshi Nicol est un jeu vidéo d''action sorti en 1987 sur Famicom Disk System. Le jeu a été développé et édité par Konami.', 'https://fr.wikipedia.org/wiki/Ai_Senshi_Nicol'),
  ('Q935001', 'Meikyū Jiin Dababa est un jeu vidéo d''action sorti en 1987 sur Famicom Disk System. Le jeu a été développé puis édité par Konami. Il est seulement sorti au Japon.', 'https://fr.wikipedia.org/wiki/Meiky%C5%AB_Jiin_Dababa'),
  ('Q105441766', 'Apollo Technica, puis Soft Pro International, est un éditeur et développeur de jeux vidéo japonais actif dans les années 80. La société édite et développe des jeux sur FM-7, MSX, PC-88, PC-98, Sharp X1, Famicom et Famicom Disk System.', 'https://fr.wikipedia.org/wiki/Soft_Pro_International'),
  ('Q105441230', 'Apollo Technica, puis Soft Pro International, est un éditeur et développeur de jeux vidéo japonais actif dans les années 80. La société édite et développe des jeux sur FM-7, MSX, PC-88, PC-98, Sharp X1, Famicom et Famicom Disk System.', 'https://fr.wikipedia.org/wiki/Soft_Pro_International'),
  ('Q58353434', 'Halley Wars est un shoot them up à scrolling vertical sorti en 1989 sur Famicom Disk System, puis porté en 1991 sur Game Gear. Le jeu a été développé et édité par Taito.', 'https://fr.wikipedia.org/wiki/Halley_Wars'),
  ('Q105441845', 'Apollo Technica, puis Soft Pro International, est un éditeur et développeur de jeux vidéo japonais actif dans les années 80. La société édite et développe des jeux sur FM-7, MSX, PC-88, PC-98, Sharp X1, Famicom et Famicom Disk System.', 'https://fr.wikipedia.org/wiki/Soft_Pro_International'),
  ('Q1057942', 'All Night Nippon Super Mario Bros. est un jeu vidéo de plates-formes sorti uniquement au Japon sur Famicom Disk System en 1986.

Le jeu a été distribué lors d''un concours organisé par l''émission de radio japonaise All Night Nippon.

Le jeu consiste en une version de Super Mario Bros. se passant de nuit, avec de nouveaux personnages liés à l''émission de radio et reprenant des niveaux issus de Super Mario Bros., Super Mario Bros. 2 (version japonaise) ou encore VS. Super Mario Bros..', 'https://fr.wikipedia.org/wiki/All_Night_Nippon_Super_Mario_Bros.'),
  ('Q2364133', 'Yōkai Yashiki est un jeu vidéo d''action sorti en 1986 sur MSX et porté en 1987 sur Famicom Disk System. Le jeu a été développé et édité par Casio sur MSX, puis édité par Irem sur Famicom Disk System.', 'https://fr.wikipedia.org/wiki/Y%C5%8Dkai_Yashiki'),
  ('Q2422991', 'Knight Lore est un jeu vidéo d''action-aventure en 3D isométrique développé et édité par Ultimate Play the Game en 1984 sur ZX Spectrum et Amstrad CPC. Le jeu a été adapté sur Famicom Disk System et MSX en 1986. Le personnage incarné explore un labyrinthe dans le but de conjurer la malédiction qui a fait de lui un loup-garou.

Le jeu est la suite de Sabre Wulf et Underwurlde (1984).

Malgré des environnements à deux couleurs, le jeu était techniquement très avancé pour l''époque. Le jeu inaugure le moteur de jeu Filmation qui permet de représenter les décors en perspective isométrique. Le jeu a eu un grand succès et connu plusieurs adaptations et suites. Ultimate a également produit d''autres jeux fondés sur le même moteur, comme Alien 8 (1985).', 'https://fr.wikipedia.org/wiki/Knight_Lore'),
  ('Q2705630', 'Yume Kōjō: Doki Doki Panic est un jeu vidéo de plates-formes sorti au Japon en 1987 sur Famicom Disk System. Développé par Nintendo et édité par Fuji Television, le jeu a été conçu par Shigeru Miyamoto.', 'https://fr.wikipedia.org/wiki/Yume_K%C5%8Dj%C5%8D:_Doki_Doki_Panic'),
  ('Q2866029', 'Arumana no Kiseki est un jeu vidéo de plates-formes sorti en 1987 sur Famicom Disk System par Konami. Il est sorti seulement au Japon.

Le titre du jeu peut se traduire par « Le Miracle d''Arumana ».', 'https://fr.wikipedia.org/wiki/Arumana_no_Kiseki'),
  ('Q3061844', 'Exciting Baseball est un jeu vidéo de baseball sorti en 1987 sur Famicom Disk System. Le jeu a été développé et édité par Konami.', 'https://fr.wikipedia.org/wiki/Exciting_Baseball'),
  ('Q2878424', 'Backgammon est un jeu vidéo adapté du jeu de société du même nom. Ce jeu est sorti en 1990 au Japon sur Famicom Disk System et a été édité par Nintendo.', 'https://fr.wikipedia.org/wiki/Backgammon_(jeu_vid%C3%A9o)'),
  ('Q3022851', 'Wardner est un jeu vidéo développé et édité par Taito. Il s’agit d’un de jeu de plates-formes sorti en 1987 sur borne d''arcade, Mega Drive et Famicom Disk System.', 'https://fr.wikipedia.org/wiki/Wardner'),
  ('Q2813386', 'Apollo Technica, puis Soft Pro International, est un éditeur et développeur de jeux vidéo japonais actif dans les années 80. La société édite et développe des jeux sur FM-7, MSX, PC-88, PC-98, Sharp X1, Famicom et Famicom Disk System.', 'https://fr.wikipedia.org/wiki/Soft_Pro_International'),
  ('Q3197999', 'Knight Move est un jeu vidéo de puzzle sorti en 1990 sur Famicom Disk System, puis porté sur Windows en 1995 sous le nom Knight Moves. Le jeu a été conçu par Alexey Pajitnov, plus connu pour être le créateur du jeu Tetris.', 'https://fr.wikipedia.org/wiki/Knight_Move'),
  ('Q3064867', 'Famicom Grand Prix II: 3D Hot Rally est un jeu vidéo de course sorti en 1988 sur Famicom Disk System. Le jeu a été développé et édité par Nintendo. Il est compatible avec le "Famicom 3D System", sorte de lunettes permettant de voir certains jeux (comme 3D Hot Rally ou encore Falsion) en 3 dimensions.', 'https://fr.wikipedia.org/wiki/Famicom_Grand_Prix_II:_3D_Hot_Rally'),
  ('Q3155272', 'Ishido: The Way of Stones est un jeu vidéo de puzzle sorti en 1990 sur Mac OS. Le jeu a été développé par Publishing International et édité par Accolade.', 'https://fr.wikipedia.org/wiki/Ishido:_The_Way_of_Stones'),
  ('Q3064864', 'Famicom Grand Prix: F1 Race est un jeu vidéo de course sorti en 1987 sur Famicom Disk System. Le jeu a été développé et édité par Nintendo.', 'https://fr.wikipedia.org/wiki/Famicom_Grand_Prix:_F1_Race'),
  ('Q3094765', 'Gall Force: Eternal Story est un shoot them up à scrolling vertical sorti en 1986 sur Famicom Disk System. Le jeu a été édité par HAL Laboratory. Il est basé sur la série d''animation Gall Force (en).', 'https://fr.wikipedia.org/wiki/Gall_Force:_Eternal_Story'),
  ('Q3191820', 'Kaettekita Mario Bros. est un jeu vidéo de plate-forme sorti en 1988 sur Famicom Disk System. Il s''agit d''une nouvelle version du jeu Mario Bros. apportant quelques améliorations et de nouvelles fonctionnalités.', 'https://fr.wikipedia.org/wiki/Kaettekita_Mario_Bros.'),
  ('Q3482155', 'Shin Onigashima est un jeu vidéo d''aventure textuel sorti au Japon en 1987 sur Famicom Disk System, en 1997 sur Super Famicom, puis en 2004 sur la Game Boy Advance dans le cadre de la collection Famicom Mini.', 'https://fr.wikipedia.org/wiki/Shin_Onigashima'),
  ('Q3357671', 'Otocky est un jeu vidéo sorti en 1987 sur Famicom Disk System. Développé par SEDIC et édité par ASCII, le jeu a été conçu par Toshio Iwai.', 'https://fr.wikipedia.org/wiki/Otocky'),
  ('Q3459434', 'SD Gundam World: Gachapon Senshi - Scramble Wars est un jeu vidéo de stratégie développé et édité par Bandai en novembre 1987 sur Famicom Disk System, sous forme de disquette et de Disk Writer. C''est une adaptation en jeu vidéo de la série basée sur l''anime Mobile Suit Gundam et notamment Super Deformed Gundam. C''est le premier opus d''une série de cinq jeux vidéo. Il a été porté sur Wii et Game Boy Advance. Ce jeu a connu une extension appelée SD Gundam World: Gachapon Senshi - Scramble Wars - Map Collection.', 'https://fr.wikipedia.org/wiki/SD_Gundam_World:_Gachapon_Senshi_-_Scramble_Wars'),
  ('Q6960387', 'Nakayama Miho no Tokimeki High School est un jeu vidéo de drague développé par Square et Nintendo R&D1, et édité par Nintendo, sorti sur Family Computer Disk System le 1er décembre 1987 au Japon seulement. C''est un des premiers jeux de drague parus. Le jeu est conçu par Hironobu Sakaguchi, le créateur de la série Final Fantasy, et Yoshio Sakamoto, le co-créateur de Metroid. La musique du jeu est composée par Nobuo Uematsu et Toshiaki Imai.', 'https://fr.wikipedia.org/wiki/Nakayama_Miho_no_Tokimeki_High_School'),
  ('Q631331', 'Super Mario Bros.: The Lost Levels, nommé Super Mario Bros. 2 au Japon, est un jeu vidéo de plates-formes édité par Nintendo et développé par Nintendo R&D4 faisant partie de la série Super Mario. Il sort sur Famicom Disk System en juin 1986 au Japon.

Première suite de Super Mario Bros., Super Mario Bros.: The Lost Levels est très semblable visuellement et propose un gameplay comparable à son prédécesseur, mais propose une difficulté bien plus élevée. Considérant cela, Nintendo décide de ne pas sortir le jeu en Amérique du Nord et en Europe durant la période de commercialisation de la Nintendo Entertainment System. The Lost Levels est le premier jeu dans lequel Luigi court moins vite et a une distance de freinage plus importante, mais saute plus haut que Mario, traits qui lui seront attribués dans les futurs jeux de la franchise Mario.', 'https://fr.wikipedia.org/wiki/Super_Mario_Bros.:_The_Lost_Levels');

update public.game g
set summary = i.summary, summary_source = i.source
from import_summary i
where g.wikidata_id = i.wikidata_id
  and g.summary is null;

drop table import_summary;
