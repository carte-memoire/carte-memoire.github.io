-- =====================================================================
-- Carte Mémoire · Résumés des jeux : introduction des articles de Wikipédia en français
-- Fichier GÉNÉRÉ par scripts/import-summaries.mjs le 2026-11-27 : ne pas modifier à la main.
--
-- Textes issus de Wikipédia en français, licence CC BY-SA 4.0
--   https://creativecommons.org/licenses/by-sa/4.0/deed.fr
-- Chaque résumé garde l'adresse de son article (game.summary_source), affichée
-- sur la fiche du jeu. Auteurs : voir l'historique de chaque article.
--
-- 224 résumés. Un résumé déjà présent n'est jamais écrasé.
-- =====================================================================

create temporary table import_summary (wikidata_id text primary key, summary text not null, source text not null);

insert into import_summary (wikidata_id, summary, source) values
  ('Q3049396', 'Eikō no Saint Andrews est un jeu vidéo de golf sorti en 1996 sur Nintendo 64 et PlayStation uniquement au Japon. Le jeu a été développé et édité par Seta.

Il s''agit du premier jeu de golf à sortir sur Nintendo 64.', 'https://fr.wikipedia.org/wiki/Eik%C5%8D_no_Saint_Andrews'),
  ('Q3062635', 'Extreme-G 2 (XG2) est un jeu vidéo de course sorti en 1997 sur Nintendo 64. Le jeu a été développé par Probe Entertainment et édité par Acclaim. C''est le second opus de la série Extreme-G.', 'https://fr.wikipedia.org/wiki/Extreme-G_2'),
  ('Q3071637', 'Fighter Destiny 2 (Kakutō Denshō: F-Cup Maniax au Japon) est un jeu vidéo de combat sorti en 1999 sur Nintendo 64. Le jeu a été développé et édité par Imagineer.

Le jeu est la suite de Fighters Destiny.', 'https://fr.wikipedia.org/wiki/Fighter_Destiny_2'),
  ('Q3080185', 'Fox Sports College Hoops ''99 est un jeu vidéo de basket-ball sorti en 1998 sur Nintendo 64 uniquement en Amérique du Nord. Le jeu a été développé par Z-Axis et édité par Fox Interactive.', 'https://fr.wikipedia.org/wiki/Fox_Sports_College_Hoops_%2799'),
  ('Q3063231', 'FIFA 64 (ou FIFA Soccer 64 en Amérique) est un jeu vidéo de football sorti en 1997 sur Nintendo 64. Le jeu a été développé par Electronic Arts et édité par EA Sports.

Il s''agit d''un portage tardif de FIFA 97 sur la Nintendo 64.', 'https://fr.wikipedia.org/wiki/FIFA_64'),
  ('Q3066275', 'Famista 64 est un jeu vidéo de baseball sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Namco.', 'https://fr.wikipedia.org/wiki/Famista_64'),
  ('Q129000', 'Banjo-Kazooie est un jeu vidéo de plates-formes en trois dimensions développé par Rare et édité par Nintendo en 1998 sur Nintendo 64. Il relate l''histoire de Banjo, l''ours, et de son amie Kazooie, l''oiseau, luttant contre la sorcière Gruntilda qui a enlevé la sœur de Banjo, Tooty, pour lui voler sa beauté. Le jeu comporte neuf niveaux non linéaires dans lesquels le joueur doit utiliser le large éventail de capacités des personnages pour récolter des pièces de puzzle et des notes de musique. Le jeu propose des mini-jeux tels que résoudre des énigmes, sauter par-dessus des obstacles, collecter des objets et vaincre des adversaires.', 'https://fr.wikipedia.org/wiki/Banjo-Kazooie_(jeu_vid%C3%A9o)'),
  ('Q149998', 'Paper Mario est un jeu vidéo de rôle développé par Intelligent Systems et édité par Nintendo sur Nintendo 64. Il est d''abord sorti le 11 août 2000 au Japon, le 5 février 2001 en Amérique du Nord et le 5 octobre 2001 en Europe et en Australie. Le jeu est ensuite ressorti sur la Console virtuelle de la Wii en 2007, sur celle de la Wii U en 2015, et aussi jouable depuis le Nintendo Switch Online de la Nintendo Switch depuis le 10 décembre 2021.

Paper Mario se déroule dans le Royaume Champignon, où le protagoniste Mario tente de sauver la princesse Peach de la menace de Bowser. Pour ce faire, il doit libérer sept « esprits Étoiles » pour annuler les effets de la baguette Étoile qui rend Bowser invincible. Le joueur contrôle Mario et plusieurs de ses partenaires pour résoudre des énigmes et vaincre des ennemis dans un système de combats au tour par tour.', 'https://fr.wikipedia.org/wiki/Paper_Mario_(jeu_vid%C3%A9o)'),
  ('Q2602179', 'Duke Nukem: Zero Hour est un jeu de tir à la troisième personne de la série Duke Nukem, développé par Eurocom pour la Nintendo 64. Le jeu utilise une cartouche de 32 mégaoctets et peut également utiliser l''Expansion Pak pour afficher des graphismes plus fins. Le mode multijoueur propose un écran divisé en 4, et une vue à la première personne.

L''histoire du jeu fait appel au voyage dans le temps lorsque des aliens essayent de modifier le cours de l''histoire afin d''éliminer les ancêtres de Duke Nukem. Chaque période possède ainsi ses propres lieux, armes, objets et habits.

Du vieux Londres plongé dans le smog au New York Post-apocalyptique en passant par la rencontre de Jack l''Éventreur, l''univers du jeu est plutôt sombre.', 'https://fr.wikipedia.org/wiki/Duke_Nukem:_Zero_Hour'),
  ('Q2609497', 'F-Zero X est un jeu vidéo de course futuriste développé et édité par Nintendo pour la Nintendo 64. Il est sorti au Japon le 14 juillet 1998, en Amérique du Nord le 26 octobre 1998 et en Europe le 6 novembre 1998. En 2000 est sorti uniquement au Japon un add-on comportant entre autres de nouveaux circuits, un éditeur de circuits et un éditeur de véhicules. F-Zero X a été porté sur l''iQue Player en 2004 et est ressorti sur Console virtuelle en 2007.

Le jeu est le deuxième épisode de la série F-Zero et le premier à utiliser des graphismes 3D. Il est assez difficile, et similaire au premier F-Zero sorti sur Super Nintendo. Il propose cependant deux nouveaux modes de jeu: la Death Race (« Course de la Mort »), dont le but est d''anéantir les 29 autres pilotes le plus vite possible, et la X-Cup, un générateur de circuits aléatoires.', 'https://fr.wikipedia.org/wiki/F-Zero_X'),
  ('Q2614473', 'Earthworm Jim 3D est un jeu vidéo de plates-formes sorti en 1999 sur Windows et Nintendo 64. Le jeu a été développé par VIS Entertainment et édité par Interplay.

Le jeu fait partie de la série Earthworm Jim.', 'https://fr.wikipedia.org/wiki/Earthworm_Jim_3D'),
  ('Q2616525', 'Xena: Warrior Princess - The Talisman of Fate est un jeu vidéo de combat sorti en 1999 sur Nintendo 64. Le jeu a été développé par Saffire et édité par Titus Software.

Le jeu est basé sur la série télévisée Xena, la guerrière.', 'https://fr.wikipedia.org/wiki/Xena:_Warrior_Princess_-_The_Talisman_of_Fate'),
  ('Q2034425', 'Pokémon Stadium (Pokémon Stadium 2 au Japon) est un jeu vidéo de la série Pokémon édité par Nintendo, sorti le 30 avril 1999 au Japon, le 20 mars 2000 au Canada et aux États-Unis, et le 7 avril 2000 en Europe sur Nintendo 64.

Malgré ce que son titre occidental laisse indiquer, le jeu est la suite de Pokémon Stadium qui est sorti uniquement au Japon.', 'https://fr.wikipedia.org/wiki/Pok%C3%A9mon_Stadium'),
  ('Q2039398', 'Star Soldier: Vanishing Earth est un shoot ''em up sorti en 1998 sur arcade et Nintendo 64. Le jeu a initialement été développé et édité par Hudson Soft.

Le jeu fait partie de la série Star Soldier.', 'https://fr.wikipedia.org/wiki/Star_Soldier:_Vanishing_Earth'),
  ('Q3142278', 'Wave Race 64 est un jeu vidéo de course aquatique (motomarine) édité par Nintendo et développé par Nintendo EAD. Il est sorti en 1996 sur Nintendo 64.', 'https://fr.wikipedia.org/wiki/Wave_Race_64'),
  ('Q3109329', 'Last Legion UX est un jeu vidéo de combat de robot sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Yuke''s et édité par Hudson Soft.', 'https://fr.wikipedia.org/wiki/Last_Legion_UX'),
  ('Q3109832', 'Goemon Mononoke Sugoroku est un jeu vidéo de société sorti en 1999 sur Nintendo 64 et Game Boy Color uniquement au Japon. Le jeu a été développé et édité par Konami.

Le jeu fait partie de la série Ganbare Goemon. Le jeu s''inspire du jeu de société japonais Sugoroku.', 'https://fr.wikipedia.org/wiki/Goemon_Mononoke_Sugoroku'),
  ('Q3143650', 'Hybrid Heaven est un jeu vidéo d''action-RPG sorti en 1999 sur Nintendo 64. Le jeu a été développé et édité par Konami.', 'https://fr.wikipedia.org/wiki/Hybrid_Heaven'),
  ('Q3129566', 'Heiwa Pachinko World 64 est un jeu vidéo de pachinko sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Heiwa et édité par Amtex.', 'https://fr.wikipedia.org/wiki/Heiwa_Pachinko_World_64'),
  ('Q3110091', 'Golden Nugget 64 est un jeu vidéo de casino sorti en 1998 sur Nintendo 64. Le jeu a été développé par Westwood Studios puis édité par Electronic Arts.', 'https://fr.wikipedia.org/wiki/Golden_Nugget_64'),
  ('Q3109941', 'Ridge Racer 64 (RR64) est un jeu vidéo de course sorti en 2000 sur Nintendo 64. Le jeu a été développé par Nintendo Software Technology et édité par Nintendo. En 2004, le jeu est adapté sur Nintendo DS.

Il fait partie de la série Ridge Racer.', 'https://fr.wikipedia.org/wiki/Ridge_Racer_64'),
  ('Q3497241', 'Starshot: Panique au Space Circus (Starshot: Space Circus Fever) est un jeu vidéo de plates-formes sorti en 1998 sur Nintendo 64 et Windows. Le jeu a été développé et édité par Infogrames.', 'https://fr.wikipedia.org/wiki/Starshot_:_Panique_au_Space_Circus'),
  ('Q3434074', 'Road Rash 64 est un jeu vidéo de course de moto sorti en 1999 sur Nintendo 64. Le jeu a été développé par Pacific Coast Power and Light et édité par THQ. Il est le cinquième opus de la série Road Rash.', 'https://fr.wikipedia.org/wiki/Road_Rash_64'),
  ('Q3400907', 'Power League 64 est un jeu vidéo de baseball sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Hudson Soft.', 'https://fr.wikipedia.org/wiki/Power_League_64'),
  ('Q3406168', 'Pro Mahjong Kiwame 64 est un jeu vidéo de mah-jong sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Athena. Il fait partie de la série Kiwame.', 'https://fr.wikipedia.org/wiki/Pro_Mahjong_Kiwame_64'),
  ('Q3406180', 'Pro Shinan Mahjong Tsuwamono 64: Jansō Battle ni Chōsen est un jeu vidéo de mah-jong sorti le 5 novembre 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Culture Brain.', 'https://fr.wikipedia.org/wiki/Pro_Shinan_Mahjong_Tsuwamono_64:_Jans%C5%8D_Battle_ni_Ch%C5%8Dsen'),
  ('Q3437940', 'Rocket: Robot on Wheels est un jeu vidéo de plates-formes sorti en 1999 sur Nintendo 64. Le jeu a été développé par Sucker Punch Productions et édité par Ubisoft.', 'https://fr.wikipedia.org/wiki/Rocket:_Robot_on_Wheels'),
  ('Q3501136', 'Stunt Racer 64 est un jeu vidéo de course sorti en 2000 sur Nintendo 64. Le jeu a été développé par Boss Game Studios et édité par Midway.', 'https://fr.wikipedia.org/wiki/Stunt_Racer_64'),
  ('Q3418096', 'Rakuga Kids, aussi appelé Rakugakids, est un jeu vidéo de combat sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Konami.', 'https://fr.wikipedia.org/wiki/Rakuga_Kids'),
  ('Q3504270', 'Super Robot Spirits est un jeu vidéo de combat développé par Vertex et édité par Banpresto en 1998 sur Nintendo 64. Le jeu fait partie de la série Super Robot Wars.', 'https://fr.wikipedia.org/wiki/Super_Robot_Spirits'),
  ('Q2295559', 'Ogre Battle 64: Person of Lordly Caliber est un tactical RPG développé par Quest et édité par Nintendo au Japon et Atlus en Amérique du Nord. Il sort sur Nintendo 64 en 1999 au Japon, puis en 2000 en Amérique du Nord. Le jeu est par la suite réédité sur la Console virtuelle de la Wii en Europe en 2010, puis sur la Console virtuelle de la Wii U en 2017. Il constitue le troisième épisode de la série Ogre Battle.

L''histoire est ancrée dans un univers d''heroic fantasy.', 'https://fr.wikipedia.org/wiki/Ogre_Battle_64:_Person_of_Lordly_Caliber'),
  ('Q1988494', 'Super Robot Wars 64 (Super Robot Taisen 64 au Japon) est un jeu vidéo de rôle sorti en 1999 sur Nintendo 64. Le jeu a été développé par AI et édité par Banpresto.

Le jeu fait partie de la série Super Robot Wars.', 'https://fr.wikipedia.org/wiki/Super_Robot_Wars_64'),
  ('Q2266230', '64 de Hakken! Tamagotchi Minna de Tamagotchi World est un jeu vidéo de type party game sorti en 1997 sur Nintendo 64. Le jeu a été développé par AI et édité par Bandai.', 'https://fr.wikipedia.org/wiki/64_de_Hakken!_Tamagotchi_Minna_de_Tamagotchi_World'),
  ('Q2271204', 'Air Boarder 64 (AirBoardin'' USA aux États-Unis) est un jeu vidéo de skateboard sorti en 1998 sur Nintendo 64. Le jeu a été développé par Human Entertainment et édité par GAGA Communications en Europe.', 'https://fr.wikipedia.org/wiki/Air_Boarder_64'),
  ('Q3149583', 'In-Fisherman Bass Hunter 64 (ou simplement Bass Hunter 64) est un jeu vidéo de pêche sorti en 1999 sur Nintendo 64. Le jeu a été développé par Gear Head Studios et édité par Take-Two Interactive.', 'https://fr.wikipedia.org/wiki/In-Fisherman_Bass_Hunter_64'),
  ('Q3156715', 'J.League Eleven Beat 1997 est un jeu vidéo de football sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Hudson Soft.

Le jeu n''intègre pas de joueurs officiels de la J.League et se distingue par son graphisme « cartoon ».', 'https://fr.wikipedia.org/wiki/J.League_Eleven_Beat_1997'),
  ('Q3156716', 'J.League Dynamite Soccer 64 est un jeu vidéo de football sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par A-max et édité par Imagineer.

Les noms des footballeurs dans le jeu sont ceux des joueurs officiels de la J.League.', 'https://fr.wikipedia.org/wiki/J.League_Dynamite_Soccer_64'),
  ('Q3505760', 'Susume! Taisen Puzzle Dama: Tōkon! Marutama Chō est un jeu vidéo de puzzle sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Konami.

Le jeu fait partie de la série Taisen Puzzle-Dama et Taisen Tokkae-Dama.', 'https://fr.wikipedia.org/wiki/Susume!_Taisen_Puzzle-Dama:_T%C5%8Dkon!_Marutama_Ch%C5%8D'),
  ('Q2290930', 'Pokémon Stadium 2 (Pokémon Stadium Kin Gin au Japon), est un jeu vidéo pour la Nintendo 64. Il comporte tous les 251 Pokémon de la première et deuxième générations. Il est sorti en Amérique du Nord et en Europe comme simplement Pokémon Stadium 2, puisque c''était le deuxième Stadium à y être paru. Au Japon, Pokémon Stadium Kin Gin a été le troisième jeu de la série Pokémon Stadium. L''édition japonaise avait également la possibilité d''utiliser le système du Pokémon Mobile de Pokémon Cristal.

Ce jeu supporte les trois versions officielles de Pokémon sur Game Boy (Rouge, Bleu et Jaune) ainsi que les trois versions officielles sur Game Boy Color (Or, Argent et Cristal).', 'https://fr.wikipedia.org/wiki/Pok%C3%A9mon_Stadium_2'),
  ('Q3156816', 'J.League Live 64 est un jeu vidéo de football sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Electronic Arts.', 'https://fr.wikipedia.org/wiki/J.League_Live_64'),
  ('Q3147788', 'Ide Yōsuke no Mahjong Juku est un jeu vidéo de mah-jong sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été édité et développé par Seta.', 'https://fr.wikipedia.org/wiki/Ide_Y%C5%8Dsuke_no_Mahjong_Juku'),
  ('Q3150637', 'Indy Racing 2000 est un jeu vidéo de course automobile sorti en 2000 sur Nintendo 64. Le jeu a été développé par Paradigm Entertainment et édité par Infogrames.', 'https://fr.wikipedia.org/wiki/Indy_Racing_2000'),
  ('Q3156718', 'J.League Tactics Soccer est un jeu vidéo de football sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par ASCII Entertainment.', 'https://fr.wikipedia.org/wiki/J.League_Tactics_Soccer'),
  ('Q3161953', 'Jangō Simulation Mahjong-dō 64 est un jeu vidéo de mah-jong sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Video System.', 'https://fr.wikipedia.org/wiki/Jang%C5%8D_Simulation_Mahjong-d%C5%8D_64'),
  ('Q1957354', 'Dr. Mario 64 est un jeu vidéo de puzzle sorti en 2001 en Amérique du Nord sur Nintendo 64. Le jeu a été développé par Newcom et édité par Nintendo. Il fait partie de la série Dr. Mario.', 'https://fr.wikipedia.org/wiki/Dr._Mario_64'),
  ('Q3519194', 'Tetrisphere est un jeu vidéo de puzzle développé par H2O Entertainment et édité par Nintendo. Il est sorti sur Nintendo 64 en 1997 en Amérique du Nord et en 1998 en Europe.', 'https://fr.wikipedia.org/wiki/Tetrisphere'),
  ('Q3504117', 'Super Bowling est un jeu vidéo de bowling sorti en 2000 sur Nintendo 64. Le jeu a été développé par Ahtena et édité par Tommo.', 'https://fr.wikipedia.org/wiki/Super_Bowling_(jeu_vid%C3%A9o,_2000)'),
  ('Q3516512', 'Taz Express est un jeu vidéo de plates-formes sorti en 2000 sur Nintendo 64. Le jeu a été développé par Zed Two et édité par Infogrames.

Le jeu met en scène Taz, un personnage des Looney Tunes.', 'https://fr.wikipedia.org/wiki/Taz_Express'),
  ('Q3522012', 'The New Tetris est un jeu vidéo de puzzle sorti en 1999 sur Nintendo 64. Le jeu a été développé par Blue Planet Software et édité par Nintendo.', 'https://fr.wikipedia.org/wiki/The_New_Tetris'),
  ('Q3504104', 'Super B-Daman: Battle Phoenix 64 est un jeu vidéo d''action sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Hudson Soft.', 'https://fr.wikipedia.org/wiki/Super_B-Daman:_Battle_Phoenix_64'),
  ('Q2872664', 'Automobili Lamborghini (Super Speed Race 64 au Japon), aussi connu sous le nom Lamborghini 64, est un jeu vidéo de course sorti en 1997 sur Nintendo 64. Le jeu a été développé et édité par Titus Interactive.', 'https://fr.wikipedia.org/wiki/Automobili_Lamborghini'),
  ('Q2745706', 'ClayFighter 63⅓ est un jeu vidéo de combat sorti en 1997 sur Nintendo 64. Le jeu a été développé et édité par Interplay.

Une version du jeu, ClayFighter 63⅓: Sculptor''s Cut, est sortie par la suite. Elle contient des personnages supplémentaires.', 'https://fr.wikipedia.org/wiki/ClayFighter_63%E2%85%93'),
  ('Q2817981', '64 Ōzumō 2 est un jeu vidéo de sumo sorti en 1999 sur Nintendo 64. Le jeu a été développé et édité par Bottom Up. Il s''agit de la suite de 64 Ōzumō qui est également sorti sur Nintendo 64.', 'https://fr.wikipedia.org/wiki/64_%C5%8Czum%C5%8D_2'),
  ('Q2779691', '64 Trump Collection: Alice no Waku Waku Trump World est un jeu vidéo de cartes sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Bottom Up.

Le jeu est basé sur l''univers d’Alice au pays des merveilles.', 'https://fr.wikipedia.org/wiki/64_Trump_Collection:_Alice_no_Waku_Waku_Trump_World'),
  ('Q2880360', 'Bakushō Jinsei 64: Mezase! Resort Ō est un jeu vidéo party game sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Taito.

Le jeu s''inspire du jeu de société Destins.', 'https://fr.wikipedia.org/wiki/Bakush%C5%8D_Jinsei_64:_Mezase!_Resort_%C5%8C'),
  ('Q2297514', 'Fighters Destiny (Fighting Cup au Japon) est un jeu vidéo de combat sorti en 1997 sur Nintendo 64. Le jeu a été développé par Imagineer et édité par Ocean Software.

Le jeu a eu une suite, Fighters Destiny 2.', 'https://fr.wikipedia.org/wiki/Fighters_Destiny'),
  ('Q2525984', 'Hey You, Pikachu! est un jeu vidéo de simulation de vie sorti le 12 décembre 1998 au Japon et le 6 novembre 2000 en Amérique du Nord sur Nintendo 64.

Ce jeu et Densha de Go! 64 sont les seuls à utiliser le microphone de la Nintendo 64.', 'https://fr.wikipedia.org/wiki/Hey_You,_Pikachu!'),
  ('Q2337280', 'Yoshi''s Story est un jeu vidéo de plates-formes développé par Nintendo EAD puis édité par Nintendo pour la Nintendo 64. Le jeu est sorti le 3 avril 1998 en Europe, et était parmi la première génération à supporter le Rumble pak. Il comporte une reproduction 2D de modèles en 3D (comme Donkey-Kong Country) ressemblant à des rapiéçages de tissu et autres matières, lui conférant un aspect unique. Il est souvent évoqué comme étant de la « 2D et demi ».

Yoshi''s Story est développé par la même équipe que Yoshi''s Island, dirigée par Hideki Konno et produit par Takashi Tezuka. C''est l''un des premiers jeux développés par le studio Nintendo EAD et n''étant pas produit par Shigeru Miyamoto.', 'https://fr.wikipedia.org/wiki/Yoshi%27s_Story'),
  ('Q2374144', 'Hamster Monogatari 64 est un jeu vidéo de simulation de vie sorti en 2001 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Culture Brain et fait partie de la série Ferret and Hamster Monogatari.', 'https://fr.wikipedia.org/wiki/Hamster_Monogatari_64'),
  ('Q2312312', 'Iggy''s Reckin'' Balls (Iggy-kun no Bura 2 Poyon au Japon) est un jeu vidéo de plates-formes et de course sorti en 1998 sur Nintendo 64. Le jeu a été développé par Iguana Entertainment et édité par Acclaim.

Iggy, l''iguane héros du jeu, est la mascotte de la firme Iguana Entertainment.

Iggy''s Reckin'' Balls fait son retour en 2024 grâce à l''abonnement Nintendo Switch Online. Le jeu est disponible sur l''application Nintendo 64 de la Nintendo Switch depuis le 24 avril 2024.', 'https://fr.wikipedia.org/wiki/Iggy%27s_Reckin%27_Balls'),
  ('Q2398156', 'International Superstar Soccer 98, est un jeu vidéo de football sorti en 1998 sur Nintendo 64. Édité par Konami, le jeu fut développé, comme les autres ISS sur Nintendo64, par leur studio d''Osaka.', 'https://fr.wikipedia.org/wiki/International_Superstar_Soccer_98'),
  ('Q2484974', 'WWF No Mercy est un jeu vidéo de catch professionnel commercialisé et publié par THQ en 2000 sur Nintendo 64. Développé par Asmik Entertainment et Aki Corporation, publié par THQ, il fait référence au pay-per-view WWE No Mercy. Il est régulièrement cité comme étant le meilleur jeu de catch toutes plateformes confondues, brillant par son système de jeu, sa durée de vie, sa diversité et sa liste étendue de catcheurs jouables.', 'https://fr.wikipedia.org/wiki/WWF_No_Mercy_(jeu_vid%C3%A9o)'),
  ('Q2387749', 'International Superstar Soccer 64 (J.League Perfect Striker, ou Jikkyō World Soccer 3 dans sa version internationale, au Japon) est un jeu vidéo de football sorti en 1996 sur Nintendo 64. Le jeu a été développé et édité par Konami.', 'https://fr.wikipedia.org/wiki/International_Superstar_Soccer_64'),
  ('Q55263', 'Star Wars: Shadows of the Empire est un jeu d’action développé et édité par LucasArts. Il est sorti en 1996 sur Nintendo 64. La version Windows est sortie près d''un an plus tard.

Dans ce jeu, le joueur incarne Dash Rendar, qui doit aider Luke Skywalker et sauver la princesse Leia des griffes du prince Xizor. Le jeu s''inscrit dans le projet multimédia Les Ombres de l''Empire, développé par Lucasfilm pour raconter une histoire située entre les événements de L''Empire contre-attaque et du Retour du Jedi à travers plusieurs supports complémentaires.', 'https://fr.wikipedia.org/wiki/Star_Wars:_Shadows_of_the_Empire'),
  ('Q165929', 'StarCraft est un jeu vidéo de stratégie en temps réel (STR) développé par Blizzard Entertainment. La version PC du jeu fonctionnant sous Microsoft Windows sort le 31 mars 1998 et s’inscrit dans la droite lignée des deux premiers succès de Blizzard Entertainment dans le domaine des jeux de stratégie en temps réel: Warcraft: Orcs and Humans et Warcraft II: Tides of Darkness. Avec plus de onze millions de copies vendues dans le monde, il est l’un des jeux vidéo sur PC les mieux vendus et reste à ce jour le jeu de stratégie en temps réel le plus vendu de tous les temps.

En novembre 1998, la sortie de l’extension StarCraft: Brood War également développée par Blizzard Entertainment précède les sorties des versions Macintosh et Nintendo 64 qui ont lieu respectivement en mars 1999 et en juin 2000. Une suite est publiée le 27 juillet 2010 sous le nom de StarCraft 2: Wings of Liberty, et rencontre également un grand succès commercial avec plus de 4,5 millions de copies vendues six mois après sa sortie. Une édition mise à jour intitulée StarCraft: Remastered, comprenant le jeu original et son extension, est sortie le 14 août 2017.', 'https://fr.wikipedia.org/wiki/StarCraft_(jeu_vid%C3%A9o)'),
  ('Q2413620', 'Madden Football 64 est un jeu vidéo de football américain sorti en 1997 sur Nintendo 64. Le jeu a été développé et édité par Electronic Arts.

Le jeu intègre des commentaires de Pat Summerall et John Madden.', 'https://fr.wikipedia.org/wiki/Madden_Football_64'),
  ('Q168615', '1080° Snowboarding (également TenEighty Snowboarding, ou simplement 1080°) est un jeu vidéo de course de snowboard, développé par Nintendo EAD et édité par Nintendo sur Nintendo 64 en 1998 au Japon, en Amérique du Nord et en Europe. Le jeu, affiché dans une vue à la troisième personne, permet au joueur de contrôler l''un des cinq snowboarders jouables sur les huit pistes disponibles, où il doit récolter un maximum de points en faisant des sauts et des figures.

Le développement de 1080° dure neuf mois. Lors de sa sortie, il est bien reçu par les critiques et obtient un Interactive Achievement Award de la part de l''Academy of Interactive Arts and Sciences. Le jeu s''est vendu à plus d''un million d''exemplaires. Son succès lui a permis de connaitre une suite intitulée Avalanche, sortie sur GameCube en 2003. 1080° Snowboarding est réédité en 2008 sur la Console virtuelle de la Wii, et en 2015 sur celle de la Wii U.', 'https://fr.wikipedia.org/wiki/1080%C2%B0_Snowboarding'),
  ('Q2397985', 'Mario Tennis, connu au Japon sous le nom de Mario Tennis 64, est un jeu vidéo de tennis sur Nintendo 64 se déroulant dans l''univers Mario. Le jeu est adapté sur Game Boy Color fin novembre 2000 au Japon sous le nom, Mario Tennis GB, puis début 2001 dans le reste du monde sous le nom Mario Tennis.', 'https://fr.wikipedia.org/wiki/Mario_Tennis_(jeu_vid%C3%A9o,_2000)'),
  ('Q2389716', 'NBA Courtside 2: Featuring Kobe Bryant est un jeu vidéo de basket-ball sorti en 1999 sur Nintendo 64. Le jeu a été développé par Left Field Productions et édité par Nintendo.

Le jeu est la suite de Kobe Bryant in NBA Courtside.', 'https://fr.wikipedia.org/wiki/NBA_Courtside_2:_Featuring_Kobe_Bryant'),
  ('Q54840', 'Star Wars: Battle for Naboo est un jeu vidéo de combats spatiaux situés dans l''univers fictif de Star Wars. Il est développé par Factor 5 et édité par LucasArts en 2000 sur Nintendo 64 et 2001 sur Windows.

Dans la lignée de Rogue Squadron, il met le joueur aux commandes de divers engins aperçus sur Naboo dans le film La Menace fantôme.', 'https://fr.wikipedia.org/wiki/Star_Wars:_Battle_for_Naboo'),
  ('Q213911', 'The Legend of Zelda: Ocarina of Time est un jeu vidéo d''action-aventure développé par Nintendo EAD et édité par Nintendo sur Nintendo 64. Il est sorti le 21 novembre 1998 au Japon, le 23 novembre 1998 en Amérique du Nord, puis le 11 décembre 1998 en Europe et en Australie. Il est le cinquième épisode de la série The Legend of Zelda, cinq ans après The Legend of Zelda: Link''s Awakening, et est le premier épisode en trois dimensions.

Ocarina of Time raconte l''histoire de Link, un jeune garçon vivant dans un village perdu dans la forêt, qui parcourt le royaume d''Hyrule pour empêcher Ganondorf d''obtenir la Triforce, une relique sacrée partagée en trois: le courage (Link), la sagesse (Zelda) et la force (Ganondorf). La Triforce, une fois rassemblée, donne à son détenteur des pouvoirs surhumains. Le principal antagoniste du jeu, Ganondorf, la désire pour pouvoir régner sur le monde. Par conséquent, Link doit alors traverser différentes époques grâce à l''épée de Légende afin de réveiller les sages et de mettre un terme au règne de Ganondorf.', 'https://fr.wikipedia.org/wiki/The_Legend_of_Zelda:_Ocarina_of_Time'),
  ('Q2431467', 'Turok: Dinosaur Hunter (ou simplement Turok) est un jeu vidéo de tir en vue à la première personne sorti sur la console Nintendo 64 en 1997 dans le monde. Le jeu est développé par Iguana Entertainment et édité par Acclaim, et il est le premier jeu de ces compagnies à être sorti sur Nintendo 64.

Le jeu a fait l''objet d''un remaster sur Windows, Xbox One et Nintendo Switch.', 'https://fr.wikipedia.org/wiki/Turok:_Dinosaur_Hunter'),
  ('Q2453573', 'Castlevania est un jeu vidéo d''action-aventure sorti en 1999 sur Nintendo 64. Le jeu a été développé par Konami CEK puis édité par Konami.', 'https://fr.wikipedia.org/wiki/Castlevania_(jeu_vid%C3%A9o,_1999)'),
  ('Q216995', 'Super Mario 64 est un jeu de plates-formes développé par le studio japonais Nintendo Entertainment Analysis and Development sous la direction de Shigeru Miyamoto et publié par Nintendo pour la Nintendo 64. Il sort au Japon et aux États-Unis en 1996 puis en Europe et en Australie en 1997.

Il est le premier jeu Mario entièrement en 3D temps réel et propose une liberté totale de mouvement, de larges niveaux ouverts, et une 3D polygonale en contraste avec les sprites en 2D des Mario précédents. Il conserve également de nombreux éléments du gameplay et de l''univers des précédents volets.

Un remake amélioré Super Mario 64 DS sort en 2005 sur la console portable Nintendo DS. Le 18 septembre 2020, Super Mario 64 ressort sur Nintendo Switch dans la compilation Super Mario 3D All-Stars.', 'https://fr.wikipedia.org/wiki/Super_Mario_64'),
  ('Q54297', 'Star Wars: Rogue Squadron (intitulé Star Wars: Rogue Squadron 3D sur ordinateur, ou simplement Rogue Squadron) est un jeu vidéo de type simulateur de vol spatial au gameplay orienté arcade, codéveloppé par Factor 5 et LucasArts. Il est le premier jeu de la série Rogue Squadron dans l''univers Star Wars. Il est édité par LucasArts sur PC (Windows), et coédité avec Nintendo sur Nintendo 64 en décembre 1998. Rogue Squadron est l''un des premiers jeux à utiliser l''Expansion Pak de la Nintendo 64, ce qui lui permet de bénéficier d''une résolution de 640 × 480 au lieu de 320 × 240. Le jeu s’inspire du comics Star Wars: X-wing Rogue Squadron et prend place entre les événements des films Star Wars, épisode IV: Un nouvel espoir et Star Wars, épisode V: L''Empire contre-attaque. Le joueur contrôle Luke Skywalker, commandant de l''escadron Rogue composé de l''élite des pilotes de vaisseaux spatiaux X-wing. Il combat l''Empire galactique à travers seize missions réparties sur diverses planètes.', 'https://fr.wikipedia.org/wiki/Star_Wars:_Rogue_Squadron'),
  ('Q108269987', 'Pachinko 365 Nichi est un jeu vidéo de pachinko sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Seta.', 'https://fr.wikipedia.org/wiki/Pachinko_365_Hi'),
  ('Q2909712', 'Bomberman 64 (parfois appelé Bomberman 64: Arcade Edition) est un jeu vidéo d''action sorti en 2001 sur Nintendo 64. Le jeu a été développé par Racjin et édité par Hudson Soft.', 'https://fr.wikipedia.org/wiki/Bomberman_64_(jeu_vid%C3%A9o,_2001)'),
  ('Q3566832', 'The NHLPA and NHL Present: Wayne Gretzky''s 3D Hockey est un jeu vidéo de hockey sur glace sorti en 1996 sur arcade, Nintendo 64 et PlayStation. Le jeu a été développé par Williams Entertainment et édité par Midway Games.', 'https://fr.wikipedia.org/wiki/The_NHLPA_and_NHL_Present:_Wayne_Gretzky%27s_3D_Hockey'),
  ('Q2907306', 'Blues Brothers 2000 est un jeu vidéo de plates-formes sorti en 2000 sur Nintendo 64. Le jeu a été développé par Player 1 et édité par Titus Interactive.

Le jeu est basé sur le film Blues Brothers 2000.', 'https://fr.wikipedia.org/wiki/Blues_Brothers_2000_(jeu_vid%C3%A9o)'),
  ('Q2712783', '64 Ōzumō est un jeu vidéo de sumo sorti en 1997 sur Nintendo 64. Le jeu a été développé et édité par Bottom Up. Une suite, nommée 64 Ōzumō 2, est sorti au Japon en 1999.', 'https://fr.wikipedia.org/wiki/64_%C5%8Czum%C5%8D'),
  ('Q3564638', 'WCW/nWo Revenge est la suite du jeu vidéo de catch professionnel commercialisé en 1998 sur console Nintendo 64. Il s''agit de la suite du jeu vidéo WCW vs. nWo: World Tour commercialisé en 1997. Comme le jeu précédent, il comprend le système révolutionnaire de jouabilité mis en place par AKI, avec des graphismes améliorés, un meilleur mode championnat, et une large liste de catcheurs (réels et fictifs).

Revenge est positivement accueilli et est également un succès commercial. D''après un article posté par le site IGN en 1999, Revenge est le jeu de catch le plus vendu sur console Nintendo 64 et également le jeu Nintendo le mieux vendu à son époque. En date du 20 avril 2013, un total de 2,38 millions d''exemplaires ont été vendus.', 'https://fr.wikipedia.org/wiki/WCW/nWo_Revenge'),
  ('Q2902310', 'Big Mountain 2000 (Snow Speeder au Japon) est un jeu vidéo de sport de glisse sorti en 1998 sur Nintendo 64. Le jeu est développé par Imagineer et édité par SouthPeak Interactive.', 'https://fr.wikipedia.org/wiki/Big_Mountain_2000'),
  ('Q2705639', 'Bomberman 64: The Second Attack (Baku Bomberman 2 au Japon) est un jeu vidéo de puzzle sorti en 1999 sur Nintendo 64. Le jeu a été développé et édité par Hudson Soft au Japon, et édité par Vatical Entertainment en Amérique du Nord. Le jeu n''est jamais sorti en Europe.', 'https://fr.wikipedia.org/wiki/Bomberman_64:_The_Second_Attack'),
  ('Q2882468', 'Bangai-O (Bakuretsu Muteki Bangaioh!) est un jeu vidéo développé par Treasure et édité par Virgin Interactive en 1999 au japon puis sorti le 20 octobre 2000 en France. Il s''agit d''un shoot them up sorti à la fois sur Dreamcast et sur Nintendo 64. Une suite, Bangai-O Spirits, est sortie en 2008 sur DS.

Un remake du jeu en haute définition, titrée Bangai-O HD: Missile Fury, est sortie en 2011 sur Xbox Live Arcade.', 'https://fr.wikipedia.org/wiki/Bangai-O'),
  ('Q2719351', 'Buck Bumble est un jeu vidéo d''action sorti en 1998 sur Nintendo 64. Il a été développé par Argonaut Games et édité par Ubisoft.', 'https://fr.wikipedia.org/wiki/Buck_Bumble'),
  ('Q3564656', 'WCW vs nWo: World Tour est un jeu vidéo de catch professionnel commercialisé en 1997 sur console Nintendo 64. Il s''agit du premier jeu de catch développé par THQ sur Nintendo 64, et est une sorte de suite de WCW vs. The World sur PlayStation. C''est le second jeu le plus vendu sur la console.', 'https://fr.wikipedia.org/wiki/WCW_vs._nWo:_World_Tour'),
  ('Q2887274', 'BassMasters 2000 est un jeu vidéo de pêche sorti en 1999 sur Nintendo 64. Le jeu a été développé par Mass Media et édité par THQ.', 'https://fr.wikipedia.org/wiki/BassMasters_2000'),
  ('Q2887309', 'Bass Rush: ECOGEAR PowerWorm Championship est un jeu vidéo de pêche sorti en 2000 sur Nintendo 64 et Dreamcast. Le jeu a été développé et édité par Visco Corporation.', 'https://fr.wikipedia.org/wiki/Bass_Rush:_ECOGEAR_PowerWorm_Championship'),
  ('Q3569792', 'Wonder Project J2: Koruro no Mori no Josette est un jeu vidéo de simulation de vie sorti en 1996 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Givro et édité par Enix.

Le jeu est la suite de Wonder Project J: Kikai no Shōnen Pīno, sorti sur Super Nintendo.', 'https://fr.wikipedia.org/wiki/Wonder_Project_J2:_Koruro_no_Mori_no_Josette'),
  ('Q2702506', 'Harvest Moon 64 est un jeu vidéo de type simulation de vie / RPG sorti en 1999 sur Nintendo 64. Le jeu a été développé par Victor Interactive Software et édité par Natsume.

Jamais sorti en Europe, le jeu a toutefois bénéficié de deux parutions ultérieures: le 23 février 2017 sur Console Virtuelle Wii U, puis dans le cadre de nouveaux jeux ajoutés à la console Nintendo 64 du Pack d''expansion Nintendo Switch Online, le 8 décembre 2023.', 'https://fr.wikipedia.org/wiki/Harvest_Moon_64'),
  ('Q3565145', 'Waialae Country Club: True Golf Classics est un jeu vidéo de golf sorti en 1998 et fonctionne sur Nintendo 64. Le jeu a été développé par T&E Soft et édité par Nintendo.

Le jeu se déroule dans le Waialae Country Club à Hawaï.', 'https://fr.wikipedia.org/wiki/Waialae_Country_Club:_True_Golf_Classics'),
  ('Q3567573', 'Wetrix (Wetrix+ sur Dreamcast) est un jeu vidéo de puzzle sorti en 1998 sur Nintendo 64, Dreamcast, Windows et Game Boy Color. Le jeu a été développé par Zed Two et édité par Ocean Software.

En 2000, le jeu a eu une suite, Aqua Aqua, sur PlayStation 2.', 'https://fr.wikipedia.org/wiki/Wetrix'),
  ('Q3179240', 'Jinsei Game 64 est un jeu vidéo de société sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Takara.

Le jeu est inspiré du jeu de société Destins.', 'https://fr.wikipedia.org/wiki/Jinsei_Game_64'),
  ('Q3178667', 'Jikkyō Powerful Pro Yakyū 5 est un jeu vidéo de baseball sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Konami.

Le jeu fait partie de la série Jikkyō Powerful Pro Yakyū.', 'https://fr.wikipedia.org/wiki/Jikky%C5%8D_Powerful_Pro_Yaky%C5%AB_5'),
  ('Q3178664', 'Jikkyō Powerful Pro Yakyū 2000 est un jeu vidéo de baseball sorti en 2000 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Konami.

Le jeu fait partie de la série Jikkyō Powerful Pro Yakyū.', 'https://fr.wikipedia.org/wiki/Jikky%C5%8D_Powerful_Pro_Yaky%C5%AB_2000'),
  ('Q3178665', 'Jikkyō Powerful Pro Yakyū 4 est un jeu vidéo de baseball sorti le 14 mars 1997 sur Nintendo 64. Le jeu a été développé et édité par Konami.

Le jeu fait partie de la série Jikkyō Powerful Pro Yakyū.', 'https://fr.wikipedia.org/wiki/Jikky%C5%8D_Powerful_Pro_Yaky%C5%AB_4'),
  ('Q3178674', 'Jikkyō Powerful Pro Yakyū Basic-ban 2001 est un jeu vidéo de baseball sorti en 2001 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Konami.

Le jeu fait partie de la série Jikkyō Powerful Pro Yakyū.', 'https://fr.wikipedia.org/wiki/Jikky%C5%8D_Powerful_Pro_Yaky%C5%AB_Basic-ban_2001'),
  ('Q3178672', 'Jikkyō Powerful Pro Yakyū 6 est un jeu vidéo de baseball sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Konami.

Le jeu fait partie de la série Jikkyō Powerful Pro Yakyū.', 'https://fr.wikipedia.org/wiki/Jikky%C5%8D_Powerful_Pro_Yaky%C5%AB_6'),
  ('Q3011830', 'Daffy Duck dans le rôle de Duck Dodgers (Duck Dodgers Starring Daffy Duck) est un jeu de plates-formes, développé par Paradigm Entertainment pour la Nintendo 64 en 2000. Le joueur y incarne Daffy Duck, célèbre canard des Looney Tunes.', 'https://fr.wikipedia.org/wiki/Daffy_Duck_dans_le_r%C3%B4le_de_Duck_Dodgers'),
  ('Q3024754', 'Destruction Derby 64 est un jeu vidéo de course automobile développé par Looking Glass Studios, sorti en 1999 sur Nintendo. Il fait partie de la série Destruction Derby.', 'https://fr.wikipedia.org/wiki/Destruction_Derby_64'),
  ('Q3016256', 'Dark Rift (Space Dynamites au Japon) est un jeu vidéo de combat sorti en 1997 sur Nintendo 64 et Windows. Le jeu a été développé par Kronos Digital Entertainment et édité par Vic Tokai.', 'https://fr.wikipedia.org/wiki/Dark_Rift'),
  ('Q3015143', 'Wipeout 64 (stylisé wipEout 64) est un jeu vidéo de course futuriste développé par Psygnosis et édité par Midway Games. Il est sorti en 1998 sur la console Nintendo 64.', 'https://fr.wikipedia.org/wiki/Wipeout_64'),
  ('Q3007916', 'Custom Robo V2 est un jeu vidéo de combat sorti en 2000 sur Nintendo 64. Le jeu a été développé par Noise et édité par Nintendo.

Le jeu est sorti en 2008 sur la Console virtuelle de la Wii. Il fait partie de la série Custom Robo.', 'https://fr.wikipedia.org/wiki/Custom_Robo_V2'),
  ('Q3023601', 'Derby Stallion 64 est un jeu vidéo d''équitation sorti en 2001 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Parity Bit et édité par Media Factory.

Il fait partie de la série des Derby Stallion.', 'https://fr.wikipedia.org/wiki/Derby_Stallion_64'),
  ('Q2909714', 'Bomberman 64 (Baku Bomberman au Japon) est un jeu vidéo d''action sorti en 1997 sur Nintendo 64. Le jeu a été développé et édité par Hudson Soft au Japon, mais édité par Nintendo en Amérique du Nord et en Europe.', 'https://fr.wikipedia.org/wiki/Bomberman_64_(jeu_vid%C3%A9o,_1997)'),
  ('Q16266960', 'NHL Breakaway 99 est un jeu vidéo de hockey sur glace développé par Iguana SLC et édité par Acclaim Entertainment, sorti en 1998 sur Nintendo 64.

Il fait suite à NHL Breakaway 98.', 'https://fr.wikipedia.org/wiki/NHL_Breakaway_99'),
  ('Q3374797', 'Penny Racers (Choro Q 64 au Japon) est un jeu vidéo de course sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Takara.

Le jeu fait partie de la série Choro Q. Sur Nintendo 64, le jeu a eu une suite, Choro Q 64 2: Hachamecha Grand Prix Race, sortie uniquement au Japon.', 'https://fr.wikipedia.org/wiki/Penny_Racers_(jeu_vid%C3%A9o,_1998)'),
  ('Q3351655', 'Olympic Hockey Nagano ''98 est un jeu vidéo de hockey sur glace sorti en 1998 sur Nintendo 64. Le jeu a été développé par Treyarch et édité par Midway.

Le jeu a pour licence les Jeux olympiques d''hiver de 1998.', 'https://fr.wikipedia.org/wiki/Olympic_Hockey_Nagano_%2798'),
  ('Q13743368', 'Killer Instinct Gold est un jeu vidéo de combat de 1996 basé sur le jeu d''arcade Killer Instinct 2. Le jeu a été développé par Rare et publié par Nintendo pour la console de jeux vidéo Nintendo 64. Comme dans les autres jeux de la série, les joueurs contrôlent des personnages qui se battent dans un plan 2D sur un fond 3D. Les joueurs appuient sur des boutons pour frapper et donner un coup de pied à leur adversaire en enchaînant des coups successifs, appelés combos. Les combos successifs permettent d''obtenir des attaques plus puissantes et des mouvements de finition brutaux et stylistiques soulignés par un annonceur. Les personnages — dont une gargouille, un ninja et une femme fatale — se battent dans des décors tels qu''une jungle et un vaisseau spatial. Killer Instinct Gold comprend les personnages, les combos et les environnements 3D de la version arcade, mais exclut ses séquences vidéo animées et certaines voix off en raison des restrictions du format de la cartouche. La version Gold ajoute un mode d''entraînement, de nouvelles vues de caméra et des audiovisuels améliorés.', 'https://fr.wikipedia.org/wiki/Killer_Instinct_Gold'),
  ('Q3359641', 'PD Ultraman Battle Collection 64 est un jeu vidéo de rôle sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Bandai.

Le jeu est basé sur le super-héros Ultraman.', 'https://fr.wikipedia.org/wiki/PD_Ultraman_Battle_Collection_64'),
  ('Q3365593', 'Parlor! Pro 64: Pachinko Jikki Simulation est un jeu vidéo de pachinko sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Nihon Telenet.', 'https://fr.wikipedia.org/wiki/Parlor!_Pro_64:_Pachinko_Jikki_Simulation'),
  ('Q2964517', 'Choro Q 64 2: Hachamecha Grand Prix Race est un jeu vidéo de course sorti en 1999 sur Nintendo 64. Le jeu a été développé par Locomotive Games et édité par Takara.

Le jeu fait partie de la série Choro Q. Il est compatible avec le jeu Choro Q Hyper Customable, sorti sur Game Boy, en utilisant le Transfer Pak.', 'https://fr.wikipedia.org/wiki/Choro_Q_64_2:_Hachamecha_Grand_Prix_Race'),
  ('Q3359657', 'PGA European Tour est un jeu vidéo de golf, développé et édité par Infogrames, sorti en 2000 sur Nintendo 64

Le jeu s''inspire du Tour européen PGA.', 'https://fr.wikipedia.org/wiki/PGA_European_Tour_(jeu_vid%C3%A9o,_2000)'),
  ('Q2933987', 'California Speed est un jeu vidéo de course sorti en 1999 sur Nintendo 64 et arcade. Le jeu a été développé par Atari et édité par Midway.', 'https://fr.wikipedia.org/wiki/California_Speed'),
  ('Q2964476', 'Chopper Attack, connu sous le nom de Wild Choppers au Japon, est un jeu de tir à la troisième personne basé sur des hélicoptères développé par SETA Corporation pour la Nintendo 64. Il a été publié en 1997 au Japon et en 1998 dans d''autres régions.', 'https://fr.wikipedia.org/wiki/Chopper_Attack'),
  ('Q2972138', 'Chōkūkan Night: Pro Yakyū King est un jeu vidéo de baseball sorti en 1996 sur Nintendo 64. Le jeu a été développé par Genki et édité par Imagineer.

Le jeu est sorti uniquement au Japon et a eu une suite, Chōkūkan Night: Pro Yakyū King 2.', 'https://fr.wikipedia.org/wiki/Ch%C5%8Dk%C5%ABkan_Night:_Pro_Yaky%C5%AB_King'),
  ('Q2948512', 'Chameleon Twist 2 est un jeu vidéo de plates-formes sorti en 1999 sur Nintendo 64. Le jeu a été développé par Japan System Supply et édité par Sunsoft.

Le jeu est la suite de Chameleon Twist.', 'https://fr.wikipedia.org/wiki/Chameleon_Twist_2'),
  ('Q2948513', 'Chameleon Twist est un jeu vidéo de plates-formes 3D sorti sur Nintendo 64 en 1997 en Amérique du Nord et en 1998 en Europe et au Japon, développé par Japan System Supply et édité par Sunsoft.

Le joueur incarne un caméléon anthropomorphe voyageant dans six mondes thématiques. La langue du caméléon peut être utilisée comme une arme, pour traverser un vide ou sauter sur une plate-forme. Une fois la langue déroulée, elle peut être guidée dans n''importe quelle direction à l''aide du stick analogique. Une zone d''entraînement permet au joueur de s''exercer. Le jeu consiste à progresser dans des environnements principalement intérieurs, chacun se terminant par un combat contre un boss.', 'https://fr.wikipedia.org/wiki/Chameleon_Twist'),
  ('Q16838717', 'Flying Dragon (Hiryū no Ken Twin au Japon) est un jeu vidéo de combat sorti en 1998 sur Nintendo 64. Le jeu a été développé par Culture Brain et édité par Natsume.

Une version évoluée du jeu en super deformed, intitulée SD Hiryu no Ken Densetsu, est sortie uniquement au Japon.', 'https://fr.wikipedia.org/wiki/Flying_Dragon'),
  ('Q3346498', 'Nushi Tsuri 64 est un jeu vidéo de pêche sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Pack-In-Video.

Le jeu a eu une suite, Nushi Tsuri 64: Shiokaze Ninotte.', 'https://fr.wikipedia.org/wiki/Nushi_Tsuri_64'),
  ('Q3346501', 'Nushi Tsuri 64: Shiokaze Ninotte est un jeu vidéo de pêche sorti en 2000 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par VIS Interactive.

Le jeu est la suite de Nushi Tsuri 64.', 'https://fr.wikipedia.org/wiki/Nushi_Tsuri_64:_Shiokaze_Ninotte'),
  ('Q2960825', 'Charlie Blast''s Territory (parfois appelé Charlie Blast''s Challenge) est un jeu vidéo de puzzle sorti en 1999 sur Nintendo 64. Le jeu a été développé par Realtime Associates et édité par Kemco.', 'https://fr.wikipedia.org/wiki/Charlie_Blast%27s_Territory'),
  ('Q14761493', 'Aerofighters Assault (Sonic Wings Assault au Japon) est un simulateur de vol de combat et de shoot them up sorti en 1997 sur Nintendo 64. Le jeu a été développé par Paradigm Entertainment et édité par Video System.

Il s''agit du premier simulateur de vol sorti sur Nintendo 64.', 'https://fr.wikipedia.org/wiki/Aerofighters_Assault'),
  ('Q369086', 'GoldenEye 007 est un jeu vidéo de tir à la première personne, développé par Rare et édité par Nintendo, sorti sur Nintendo 64 en 1997. Il est basé sur le film de la saga James Bond GoldenEye, sorti deux ans plus tôt et dont le rôle-titre est tenu par Pierce Brosnan.

Initialement prévu pour être un jeu de plates-formes sur Super Nintendo, le jeu est ensuite destiné à devenir un rail shooter sur Nintendo 64, avant d''évoluer en véritable jeu de tir à la première personne (ou Doom-like). GoldenEye 007 reprend la trame du film dont il est issu, en y ajoutant de nombreuses digressions, et met en scène James Bond aux prises avec un syndicat du crime voulant contrôler le satellite militaire GoldenEye.', 'https://fr.wikipedia.org/wiki/GoldenEye_007'),
  ('Q518629', 'Rally Challenge 2000 est un jeu vidéo de course sorti en 1999 sur Nintendo 64. Le jeu a été développé par Genki et Xicat Interactive puis édité par SouthPeak Interactive.

Le jeu est la suite de Rally ''99.', 'https://fr.wikipedia.org/wiki/Rally_Challenge_2000'),
  ('Q339222', 'Blast Corps (Blast Dozer au Japon) est un jeu vidéo d''action et réflexion sorti en 1997 sur Nintendo 64. Le jeu a été développé par Rare et édité par Nintendo.', 'https://fr.wikipedia.org/wiki/Blast_Corps'),
  ('Q7886388', 'Robotron 64 est un jeu vidéo d''action sorti en 1998 sur Nintendo 64. Le jeu a été développé par Player 1 et édité par Crave Entertainment.

Le jeu est un remake du jeu d''arcade Robotron: 2084.', 'https://fr.wikipedia.org/wiki/Robotron_64'),
  ('Q217423', 'Quake est un jeu vidéo de tir à la première personne (FPS) développé par id Software et publié en version shareware le 22 juin 1996 puis en version commerciale par GT Interactive le 22 juillet 1996.

Quake s’inscrit dans la lignée des précédents titres d’id Software — Wolfenstein 3D, Doom et Doom II — dont il se distingue grâce à un moteur 3D permettant d’afficher la totalité des éléments du jeu en trois dimensions. Le jeu se déroule dans un futur proche dans lequel des chercheurs ont réussi à développer un prototype permettant la téléportation. Celui-ci est cependant corrompu par un démon appelé Quake qui projette de l''utiliser pour envahir la Terre. Le joueur incarne le seul survivant d’une équipe envoyée par le gouvernement à travers le portail pour éliminer cette menace. Il doit traverser quatre dimensions, chacune étant peuplée de nombreuses créatures hostiles qu’il peut combattre à l''aide des armes et des bonus trouvés au fur et à mesure de son avancée dans le jeu.', 'https://fr.wikipedia.org/wiki/Quake_(jeu_vid%C3%A9o)'),
  ('Q3099600', 'Sin and Punishment: Successor of the Earth (罪と罰～地球の継承者～, Tsumi to Batsu: Hoshi no Keishōsha) est un jeu vidéo de Treasure. Distribué par Nintendo, il est sorti au Japon sur Nintendo 64 en 2000, en Chine sur iQue en 2004 et partout dans le monde en téléchargement sur la Console virtuelle de la Wii en 2007.

La faible quantité de jeux mis en vente ajoutée à une forte demande en import ont fait de ce titre, sorti en fin de vie de la Nintendo 64, un jeu rare et fortement recherché.

Le jeu a aussi été édité hors du Japon sur la Console virtuelle de la Wii à l’occasion du "Hanabi Festival" le 28 septembre 2007, il a été pour l''occasion traduit en anglais.', 'https://fr.wikipedia.org/wiki/Sin_and_Punishment:_Hoshi_no_Keish%C5%8Dsha'),
  ('Q3093039', 'G.A.S.P!! Fighters'' NEXTream (Deadly Arts aux États-Unis) est un jeu vidéo de combat sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Konami.', 'https://fr.wikipedia.org/wiki/G.A.S.P!!_Fighters%27_NEXTream'),
  ('Q3093445', 'GT 64: Championship Edition (City Tour Grand Prix: Zen Nihon GT Senshuken au Japon) est un jeu vidéo de course sorti en 1998 sur Nintendo 64. Le jeu a été développé par Imagineer et édité par Ocean Software.', 'https://fr.wikipedia.org/wiki/GT_64:_Championship_Edition'),
  ('Q3089600', 'Mischief Makers (ou Yuke Yuke! Troublemakers au Japon) est un jeu vidéo de plate-forme en 2D développé par Treasure, et publié par Enix au Japon et Nintendo en Amérique pour la Nintendo 64 en 1997. L''héroïne du jeu est Marina Liteyears (ou Marina Naget au Japon) alias Ultra-Intergalactic-Cybot G, qui est la création de Professor Theo (ou Ganbell H. Jorb au Japon), un vieil homme excentrique et quelque peu pervers.', 'https://fr.wikipedia.org/wiki/Mischief_Makers'),
  ('Q3104670', 'Getter Love!! Cho Renai Party Game est un jeu vidéo party game sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Hudson Soft.', 'https://fr.wikipedia.org/wiki/Getter_Love!!_Cho_Renai_Party_Game'),
  ('Q3098037', 'Turok 2: Seeds of Evil est un jeu de tir à la première personne sorti en 1998 sur Windows, Nintendo 64 et Game Boy Color. Il est basé sur le comics Turok. Ce fut un jeu très attendu car il proposait des graphismes impressionnants pour l''époque et un grand nombre d''ennemis et d''armes originaux. Ce fut un des premiers jeu de la Nintendo 64 à utiliser l''Expansion Pak, avec Star Wars: Rogue Squadron, Top Gear OverDrive et NFL Quarterback Club ''99. Il a fait l''objet d''un remaster sur Windows, Xbox One et Nintendo Switch.

Le jeu est un peu différent de son prédécesseur car il s''inspire plus de jeu comme GoldenEye 007. Il y a maintenant des objectifs de mission à accomplir, le maniement du personnage est similaire au jeu GoldenEye 007, il y a un Styracosaurus à chevaucher et un mode multijoueur. Une musique plus orchestrale remplace les bruits de jungle du premier épisode. Les ennemis quant à eux sont beaucoup plus intelligents: ils se mettent a couvert, ouvrent le feu, attaquent en groupe et même fuient quand le joueur transporte des armes de destruction massive. Le joueur peut passer à n''importe quelle arme immédiatement grâce à un menu qui a inspiré la suite de GoldenEye 007: Perfect Dark. Le jeu est assez gore et permet la décapitation et/ou le démembrement des ennemis comme dans Soldier of Fortune bien que ces démembrements soient scriptés (pré-calculé). Le jeu possède aussi de nombreuses voix d''acteurs enregistrés en studio, un fait assez rare sur des titres N64.', 'https://fr.wikipedia.org/wiki/Turok_2:_Seeds_of_Evil'),
  ('Q591956', 'Battlezone: Rise of the Black Dogs est un jeu vidéo d''action et de stratégie en temps réel sorti en 2000 sur Nintendo 64. Le jeu a été développé par Climax Group et édité par Crave Entertainment.

Le jeu est basé sur Battlezone, la version PC sortie en 1998.', 'https://fr.wikipedia.org/wiki/Battlezone:_Rise_of_the_Black_Dogs'),
  ('Q545072', 'Diddy Kong Racing est un jeu vidéo de course développé par Rare, et édité par Nintendo, sorti en 1997 sur Nintendo 64. Pour la version Nintendo DS du jeu, sorti en 2007, le jeu fut développé par Rare et édité par Nintendo.', 'https://fr.wikipedia.org/wiki/Diddy_Kong_Racing'),
  ('Q596596', 'Daikatana est un jeu de tir à la première personne développé par Ion Storm et édité par Eidos Interactive en juin 2000 pour Windows. Conçu par John Romero, l''un des fondateurs d''id software et créateurs de la série à succès Doom, le jeu souffre d''un développement chaotique de trois ans et de multiples reports qui en font un célèbre vaporware de la fin des années 1990. Si Daikatana est très attendu et bénéficie d''une campagne publicitaire de grande ampleur, à sa sortie il est considéré comme techniquement très en retard sur les jeux de la concurrence, principalement Deus Ex du même éditeur, et Half-Life de Valve Software. En conséquence il subit un échec critique et commercial retentissant et reste considéré comme l''une des pires déceptions de l''histoire du jeu vidéo.', 'https://fr.wikipedia.org/wiki/Daikatana'),
  ('Q545348', 'Twisted Edge Snowboarding (nommé Twisted Edge Extreme Snowboarding en Amérique du Nord) est un jeu vidéo de glisse sorti en 1998 sur Nintendo 64. Le jeu est développé par Boss Game Studios et édité par Midway.', 'https://fr.wikipedia.org/wiki/Twisted_Edge_Snowboarding'),
  ('Q617065', 'Dance Dance Revolution: Disney Dancing Museum est un jeu vidéo de rythme sorti en 2000 sur Nintendo 64. Le jeu a été développé par Bemani et édité par Konami.', 'https://fr.wikipedia.org/wiki/Dance_Dance_Revolution:_Disney_Dancing_Museum'),
  ('Q690394', 'Bomberman Hero est un jeu vidéo d''action sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Hudson Soft au Japon, mais édité par Nintendo en Amérique du Nord et en Europe.', 'https://fr.wikipedia.org/wiki/Bomberman_Hero'),
  ('Q690386', 'Kira to Kaiketsu! 64 Tanteidan est un jeu vidéo de type party game sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu est développé par Pandora Box et édité par Imagineer.', 'https://fr.wikipedia.org/wiki/Kira_to_Kaiketsu!_64_Tanteidan'),
  ('Q668397', 'AeroGauge est un jeu vidéo de course futuriste sorti en 1997 sur Nintendo 64. Le jeu a été développé par Locomotive et édité par ASCII Entertainment.', 'https://fr.wikipedia.org/wiki/AeroGauge'),
  ('Q2539560', 'F1 Pole Position 64 (Human Grand Prix: The New Generation au Japon) est un jeu vidéo de Formule 1 sorti en 1997 sur Nintendo 64. Le jeu a été développé par Human Entertainment et édité par Ubisoft.', 'https://fr.wikipedia.org/wiki/F1_Pole_Position_64'),
  ('Q2562893', 'Mystical Ninja starring Goemon est un jeu vidéo développé et édité par Konami sur Nintendo 64 en 1997. Il est le cinquième jeu de la série Ganbare Goemon et le second à être sorti hors du Japon.

Comportant des éléments de plates-formes et d''action-aventure, Mystical Ninja est un hybride de Super Mario 64 et de la série des The Legend of Zelda.

L''histoire suit Goemon dans son combat pour empêcher le gang des « Shoguns de la Montagne Pêche » de transformer le Japon en un théâtre de beaux-arts. Le voyage fait passer Goemon par des scènes de comédie musicale et des combats entre des robots géants. Comme d''autres jeux Gambare Goemon, il est saupoudré d''humour surréaliste et d''anachronismes.', 'https://fr.wikipedia.org/wiki/Mystical_Ninja_starring_Goemon'),
  ('Q2530979', 'Superman, aussi connu sous le nom Superman 64, est un jeu vidéo sorti en 1999 sur Nintendo 64. Le jeu a été développé et édité par Titus Interactive.

Le jeu est adapté de la série d''animation Superman, l''Ange de Metropolis.

Comme Castlevania 64, le 64 de Superman 64 n''est pas écrit sur la boite ni sur l''écran d''introduction mais a été ajouté par les joueurs pour éviter la confusion avec les autres médias Superman.', 'https://fr.wikipedia.org/wiki/Superman_(jeu_vid%C3%A9o,_1999)'),
  ('Q2553121', 'Castlevania: Legacy of Darkness est un jeu vidéo d''action-aventure sorti en 1999 sur Nintendo 64. Le jeu a été développé par KCE Kobe et édité par Konami.', 'https://fr.wikipedia.org/wiki/Castlevania:_Legacy_of_Darkness'),
  ('Q3040450', 'Dual Heroes est un jeu vidéo de combat sorti en 1997 sur Nintendo 64. Le jeu a été développé par Produce! et publié par Hudson Soft au Japon, Electro Brain en Amérique du Nord et Gaga Interactive Media en Europe.', 'https://fr.wikipedia.org/wiki/Dual_Heroes'),
  ('Q3200237', 'Saikyō Habu Shōgi est un jeu vidéo de shōgi sorti en 1996 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Seta.

Il est sorti exclusivement au Japon le 23 juin 1996, en tant que l''un des trois jeux de lancement japonais de la Nintendo 64 aux côtés de Super Mario 64 et Pilotwings 64. Il était le seul jeu de lancement à utiliser le Controller Pak et à être publié par un éditeur tiers.

Le jeu met en vedette le joueur de shōgi Yoshiharu Habu.', 'https://fr.wikipedia.org/wiki/Saiky%C5%8D_Habu_Sh%C5%8Dgi'),
  ('Q3198120', 'Kobe Bryant in NBA Courtside est un jeu vidéo de basket-ball sorti en 1998 sur Nintendo 64. Le jeu a été développé par Left Field Productions et édité par Nintendo.

Il a connu une suite, NBA Courtside 2: Featuring Kobe Bryant.', 'https://fr.wikipedia.org/wiki/Kobe_Bryant_in_NBA_Courtside'),
  ('Q3324129', 'Morita Shōgi 64 est un jeu vidéo de société sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Seta.

La cartouche du jeu possède un port qui permet de brancher un modem RJ-11, permettant ainsi de se connecter à des serveurs (morts depuis) pour jouer en ligne.', 'https://fr.wikipedia.org/wiki/Morita_Sh%C5%8Dgi_64'),
  ('Q3235097', 'Les Razmoket: La Chasse aux trésors (Rugrats: Scavenger Hunt) est un jeu vidéo party game sorti en 1999 sur Nintendo 64. Le jeu a été développé par Realtime Associates et édité par THQ.', 'https://fr.wikipedia.org/wiki/Les_Razmoket_:_La_Chasse_aux_tr%C3%A9sors'),
  ('Q3327645', 'Multi-Racing Championship (MRC) est un jeu vidéo de course sorti en 1997 sur Nintendo 64. Le jeu a été développé par Genki puis édité par Imagineer et Ocean Software.', 'https://fr.wikipedia.org/wiki/Multi-Racing_Championship'),
  ('Q3334430', 'Blades of Steel ou NHL Blades of Steel est une série de jeux vidéo de hockey sur glace développée par Konami de 1987 à 2000.', 'https://fr.wikipedia.org/wiki/NHL_Blades_of_Steel'),
  ('Q3005567', 'Cruis''n World est un jeu vidéo de course sorti en 1996 sur borne d''arcade, puis sur Nintendo 64 en 1998. Le jeu a été développé par Midway Manufacturing Company et édité par Midway Games.

Le jeu fait partie de la série Cruis''n.', 'https://fr.wikipedia.org/wiki/Cruis%27n_World'),
  ('Q2972141', 'Chōkūkan Night: Pro Yakyū King 2 est un jeu vidéo de baseball sorti en 1999 sur Nintendo 64. Le jeu est développé par Genki et édité par Imagineer.

Le jeu sort uniquement au Japon et est la suite de Chōkūkan Night: Pro Yakyū King.', 'https://fr.wikipedia.org/wiki/Ch%C5%8Dk%C5%ABkan_Night:_Pro_Yaky%C5%AB_King_2'),
  ('Q3197991', 'Knife Edge: Nose Gunner, est un jeu vidéo de type shoot them up sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Kemco.', 'https://fr.wikipedia.org/wiki/Knife_Edge:_Nose_Gunner'),
  ('Q3331753', 'Mystical Ninja 2 starring Goemon, ou Goemon''s Great Adventure en Amérique du Nord, est un jeu vidéo développé et édité par Konami sur Nintendo 64 le 23 décembre 1998. Il est le troisième jeu de la série Ganbare Goemon à être sorti en dehors du Japon, et il est la suite de Mystical Ninja starring Goemon, sorti deux ans auparavant.

Comportant une jouabilité plates-formes en 2.5D, il marque le retour de la série à un format side-scrolling.

Le jeu s''est vendu à plus de 150 000 exemplaires à travers le monde. Rappelant les jeux 16-bit plus anciens, le système de défilement latéral a été salué par des chroniqueurs, qui ont également loué le mode coopératif à deux joueurs. Les graphismes et la bande sonore vifs ont également remporté des bonnes notes. Des chroniqueurs ont considéré ce jeu comme le meilleur side-scroller de la Nintendo 64.', 'https://fr.wikipedia.org/wiki/Mystical_Ninja_2_starring_Goemon'),
  ('Q3007910', 'Custom Robo est un jeu vidéo de combat sorti en 1999 sur Nintendo 64, uniquement au Japon et en Chine. Le jeu a été développé par Noise et édité par Nintendo. Il est le premier opus de la série Custom Robo.

En Chine, le jeu est sorti en 2006 sur iQue Player.', 'https://fr.wikipedia.org/wiki/Custom_Robo_(jeu_vid%C3%A9o,_1999)'),
  ('Q3046150', 'Excitebike 64 est un jeu vidéo de course de motocross sorti en 2000 sur Nintendo 64. Le jeu a été développé par Left Field Productions et édité par Nintendo. En Chine, le jeu est sorti sur iQue Player.

Le joueur peut incarner plusieurs pilotes aux caractéristiques distinctes et participe à des courses sur des circuits ponctués de bosses et de virages serrés. Le joueur peut exécuter des sauts et des figures acrobatiques. Il doit toutefois surveiller la température du moteur, qui peut surchauffer si l’accélération est maintenue trop longtemps. Excitebike 64 propose divers modes de jeu, dont un mode multijoueur et l''intégralité d''Excitebike.', 'https://fr.wikipedia.org/wiki/Excitebike_64'),
  ('Q3005563', 'Cruis''n USA est un jeu vidéo de course sorti en 1994 sur arcade, puis adapté sur Nintendo 64 et sur la console virtuelle de la Wii. Le jeu a été développé par Midway Manufacturing Company et édité par Nintendo.

Le jeu fait partie de la série Cruis''n.', 'https://fr.wikipedia.org/wiki/Cruis%27n_USA'),
  ('Q3342043', 'Nintama Rantarō 64 Game Gallery est un jeu vidéo de puzzle sorti en 2000 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Culture Brain.', 'https://fr.wikipedia.org/wiki/Nintama_Rantar%C5%8D_64_Game_Gallery'),
  ('Q743187', 'Mario Party 3 est le troisième volet de la série Mario Party, mettant en vedette Mario et ses compagnons, sorti sur Nintendo 64 le 16 novembre 2001 en Europe, le 7 mai 2001 aux États-Unis et le 7 décembre 2000 au Japon.

Il s''agit du dernier jeu sorti sur la Nintendo 64 en Europe.

Ce jeu marque la dernière apparition du premier design de Daisy. Par la suite, elle conservera son apparence introduite dans Mario Party 4.', 'https://fr.wikipedia.org/wiki/Mario_Party_3'),
  ('Q3576039', 'Zool: Majū Tsukai Densetsu est un jeu vidéo de rôle sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu est développé par Pandora Box et édité par Imagineer.', 'https://fr.wikipedia.org/wiki/Zool:_Maj%C5%AB_Tsukai_Densetsu'),
  ('Q3571378', 'Yakōchū II: Satsujin Kōro est un jeu vidéo d''aventure sorti en 1999 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Athena.', 'https://fr.wikipedia.org/wiki/Yak%C5%8Dch%C5%AB_II:_Satsujin_K%C5%8Dro'),
  ('Q4894560', 'Asteroids Hyper 64 est un jeu vidéo shoot them up sorti en 1999 sur Nintendo 64. Le jeu a été développé par Syrox et édité par Crave Entertainment.', 'https://fr.wikipedia.org/wiki/Asteroids_Hyper_64'),
  ('Q4896761', 'Centre Court Tennis (aussi appelé Let''s Smash Tennis) est un jeu vidéo de tennis sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Hudson Soft.', 'https://fr.wikipedia.org/wiki/Centre_Court_Tennis'),
  ('Q6507722', 'Mario Party est un jeu vidéo de type Party game sorti sur Nintendo 64 en 1998 dans lequel le ou les joueur(s) se déplace sur un plateau de jeu pouvant être apparenté à celui du jeu de l''oie. Il constitue le premier épisode de la série Mario Party.

Hudson Soft est à l''origine de l''idée de Mario Party, mais Nintendo l''édite et le scénarise.', 'https://fr.wikipedia.org/wiki/Mario_Party_(jeu_vid%C3%A9o)'),
  ('Q774773', 'Donkey Kong 64 est un jeu vidéo de plates-formes développé par Rare et édité par Nintendo. Il est sorti sur Nintendo 64 en 1999. Le jeu fait partie de la série Donkey Kong et il s''agit du premier et l''un des rares jeux de la série entièrement en 3D temps réel. Il fait suite à la trilogie Donkey Kong Country sortie sur Super Nintendo.

Il s''agit du premier jeu nécessitant l''Expansion Pack, lequel est distribué avec la cartouche. On peut jouer avec plusieurs personnages que l''on débloque au cours du jeu. On peut aussi jouer en mode multijoueur et faire des combats ressemblant aux jeux d''espions avec des armes comme un Crache-Coco pour DK.', 'https://fr.wikipedia.org/wiki/Donkey_Kong_64'),
  ('Q796132', 'Neon Genesis Evangelion (Shin Seiki Evangelion ou, plus communément appelé Evangelion 64) est un jeu vidéo d''action sorti le 25 juin 1999 sur Nintendo 64, uniquement au Japon. Le jeu a été développé et édité par Bandai. Il est basé sur l''animé Neon Genesis Evangelion et connaît une suite en 2003: Neon Genesis Evangelion 2.', 'https://fr.wikipedia.org/wiki/Neon_Genesis_Evangelion_(jeu_vid%C3%A9o)'),
  ('Q806598', 'Banjo-Tooie est, comme le précédent épisode de la série, un jeu vidéo de plates-formes, créé par le studio de développement Rare et édité par Nintendo pour la console Nintendo 64. Il se déroule dans 9 mondes contenant 90 pièces de puzzle. Le jeu est proposé sur Xbox Live Arcade depuis avril 2009. Il est également disponible sur Nintendo Switch depuis le 25 octobre 2024 via l''abonnement Nintendo Switch Online + Pack additionnel.', 'https://fr.wikipedia.org/wiki/Banjo-Tooie'),
  ('Q3276747', 'Tetris 64 est un jeu vidéo de puzzle développé par Amtex et édité par Seta. Il est sorti en 1998 au Japon sur Nintendo 64. Il est compatible avec un accessoire, un capteur biométrique, qui capte la fréquence cardiaque du joueur.', 'https://fr.wikipedia.org/wiki/Tetris_64'),
  ('Q3279577', 'Turok 3: Shadow of Oblivion est un jeu vidéo de tir à la première personne sorti en 2000 sur Nintendo 64 et Game Boy Color. Le jeu a été développé et édité par Acclaim.

Le jeu fait partie de la série Turok.', 'https://fr.wikipedia.org/wiki/Turok_3:_Shadow_of_Oblivion'),
  ('Q3257786', 'Lode Runner 3-D est un jeu vidéo de plates-formes développé par Big Bang Software, sorti en 1999 sur Nintendo 64. Il fait partie de la série Lode Runner.', 'https://fr.wikipedia.org/wiki/Lode_Runner_3-D'),
  ('Q3280267', 'Off Road Challenge est un jeu vidéo de course sorti en 1997 sur arcade et en 1998 sur Nintendo 64. Le jeu a été développé par Avalanche Software et édité par Midway.', 'https://fr.wikipedia.org/wiki/Off_Road_Challenge'),
  ('Q3274185', 'Mace: The Dark Age est un jeu vidéo de combat sorti en 1997 sur Nintendo 64. La même année le jeu est également sorti sur borne d''arcade. Le jeu a été développé et édité par Midway.', 'https://fr.wikipedia.org/wiki/Mace:_The_Dark_Age'),
  ('Q3277746', 'Mahjong 64 est un jeu vidéo de mah-jong sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Chat Noir et édité par Koei.', 'https://fr.wikipedia.org/wiki/Mahjong_64'),
  ('Q3277757', 'Mahjong Master est un jeu vidéo de mah-jong sorti en 1996 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Konami.', 'https://fr.wikipedia.org/wiki/Mahjong_Master'),
  ('Q3279568', 'Top Gear Rally 2 est un jeu vidéo de course sorti en 1999 sur Nintendo 64 et Game Boy Color. Le jeu a été développé par Saffire et édité par Kemco.

Il fait partie de la série Top Gear.', 'https://fr.wikipedia.org/wiki/Top_Gear_Rally_2'),
  ('Q3297880', 'Masters ''98: Haruka Naru Augusta est un jeu vidéo de golf sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par T&E Soft.', 'https://fr.wikipedia.org/wiki/Masters_%2798:_Haruka_Naru_Augusta'),
  ('Q3280559', 'Major League Baseball Featuring Ken Griffey Jr. est un jeu vidéo de baseball sorti en 1998 sur Nintendo 64. Le jeu a été développé par Angel Studios.

Il s''agit de la suite de Ken Griffey Jr. Presents Major League Baseball sorti sur Super Nintendo.', 'https://fr.wikipedia.org/wiki/Major_League_Baseball_Featuring_Ken_Griffey_Jr.'),
  ('Q3283260', 'Top Gear Rally est un jeu de rallye développé pour la Nintendo 64, la Game Boy Color et la Game Boy Advance.', 'https://fr.wikipedia.org/wiki/Top_Gear_Rally'),
  ('Q3291346', 'World Driver Championship est un jeu vidéo de course sorti en 1999 sur Nintendo 64. Le jeu a été développé par Boss Game Studios et édité par Midway.', 'https://fr.wikipedia.org/wiki/World_Driver_Championship'),
  ('Q3314408', 'Milo''s Astro Lanes est un jeu vidéo de bowling sorti en 1998 sur Nintendo 64. Le jeu a été développé par Player 1 et édité par Crave Entertainment.', 'https://fr.wikipedia.org/wiki/Milo%27s_Astro_Lanes'),
  ('Q3282847', 'Turok: Rage Wars est un jeu vidéo de tir à la première personne sorti en 1999 sur Nintendo 64 et Game Boy Color. Le jeu a été développé et édité par Acclaim.

Le jeu fait partie de la série Turok mais n''est pas un canon.', 'https://fr.wikipedia.org/wiki/Turok:_Rage_Wars'),
  ('Q3313495', 'Mike Piazza''s Strike Zone est un jeu vidéo de baseball sorti en 1998 sur Nintendo 64. Le jeu a été développé par Devil''s Thumb Entertainment et édité par GT Interactive.', 'https://fr.wikipedia.org/wiki/Mike_Piazza%27s_Strike_Zone'),
  ('Q3281178', 'Snowboard Kids 2 (Super Snobow Kids au Japon) est un jeu vidéo de sport de glisse sorti en 1999 sur Nintendo 64. Le jeu a été développé par Racdym et édité par Atlus.

Le jeu est la suite de Snowboard Kids.', 'https://fr.wikipedia.org/wiki/Snowboard_Kids_2'),
  ('Q841712', 'Conker''s Bad Fur Day est un jeu vidéo d''action-aventure et de plates-formes développé par Rare. Le jeu a été édité par la même compagnie en Amérique du Nord, mais en Europe, il fut édité par THQ. Il a été distribué par Nintendo en Amérique du Nord, et par THQ en Europe. Le jeu est sorti en 2001 sur Nintendo 64.

Le jeu relate les aventures de Conker, un écureuil roux alcoolique et avide d''argent, qui tente de retourner chez lui après une soirée arrosée et de retrouver sa petite amie Berri. Le gameplay du jeu est composé de plusieurs défis, tel que des résolutions de casse-têtes et des courses de véhicules, le tout réparti dans de multiples niveaux. Le titre propose également un mode multijoueur jouable jusqu''à quatre joueurs.', 'https://fr.wikipedia.org/wiki/Conker%27s_Bad_Fur_Day'),
  ('Q814145', 'Beetle Adventure Racing (titre Australien: HSV Adventure Racing) est un jeu vidéo de course sorti en 1999 sur Nintendo 64. Le jeu a été développé et édité par Electronic Arts.', 'https://fr.wikipedia.org/wiki/Beetle_Adventure_Racing'),
  ('Q732943', 'The Legend of Zelda: Majora''s Mask (ou simplement Majora''s Mask) est un jeu d''action-aventure développé par Nintendo EAD et édité par Nintendo en 2000 sur la console Nintendo 64. Sixième jeu paru dans la franchise The Legend of Zelda et second en trois dimensions après Ocarina of Time, il est conçu en à peine plus d''un an par une équipe dirigée par Eiji Aonuma et Yoshiaki Koizumi et produit par Shigeru Miyamoto.', 'https://fr.wikipedia.org/wiki/The_Legend_of_Zelda:_Majora%27s_Mask'),
  ('Q919688', 'Mario no Photopi est un jeu vidéo éducatif sorti sur Nintendo 64 en 1998 uniquement au Japon. La cartouche dispose d''un port destiné à insérer deux cartes Smart Media, permettant ainsi d''importer ses propres photos. De même, les images produites dans le jeu peuvent être enregistrées sur une carte mémoire pour être utilisées par la suite.

Ce jeu, bien qu''il soit sorti uniquement au Japon, est rapidement devenu très populaire, particulièrement chez les collectionneurs, car il est le seul à utiliser un support SmartMedia dont le numéro de série est NUS-023.

Nintendo a également commercialisé des cartes SmartMedia contenant toutes sortes d''images tirées de jeux Nintendo.', 'https://fr.wikipedia.org/wiki/Mario_no_Photopi'),
  ('Q870981', 'Super Smash Bros. est un jeu vidéo de combat, développé par HAL Laboratory et édité par Nintendo pour la Nintendo 64. Il est sorti au Japon le 21 janvier 1999, en Amérique du Nord le 26 avril 1999 et en Europe le 19 novembre 1999. Super Smash Bros. est le premier jeu de la série éponyme et est suivi par Super Smash Bros. Melee sur GameCube en 2001, Super Smash Bros. Brawl sur Wii en 2008, Super Smash Bros. for Nintendo 3DS / for Wii U en 2014 et Super Smash Bros. Ultimate sur Nintendo Switch en 2018. Super Smash Bros. est ressorti sur Console virtuelle au Japon le 20 janvier 2009, en Europe le 12 juin 2009, et en Amérique du Nord le 21 décembre 2009.', 'https://fr.wikipedia.org/wiki/Super_Smash_Bros._(jeu_vid%C3%A9o)'),
  ('Q890065', 'Body Harvest est un jeu vidéo développé par DMA Design (désormais Rockstar North) et sorti sur Nintendo 64 en 1998. Dans ce GTA-like, le joueur incarne un super-soldat venu du futur pour empêcher des extraterrestres de « moissonner » l''espèce humaine. Chaque niveau du jeu est une large région en trois dimensions où le joueur peut circuler librement, à pied ou en véhicule. Ce gameplay rapproche le jeu de la série Grand Theft Auto, du même développeur, qui n''en est qu''à son premier opus à l''époque.

À l''origine produit par Nintendo pour le lancement de sa console, le jeu sort avec un retard de trois ans et reçoit un accueil mitigé de la presse. Vendu à moins de 200 000 exemplaires, le jeu est un échec commercial pour ses producteurs définitifs, Midway et Gremlin Interactive.', 'https://fr.wikipedia.org/wiki/Body_Harvest'),
  ('Q3532029', 'Top Gear Overdrive est un jeu vidéo de course sorti en 1998 sur Nintendo 64. Le jeu a été développé par Snowblind Studios et édité par Kemco.

Le jeu fait partie de la série Top Gear.', 'https://fr.wikipedia.org/wiki/Top_Gear_Overdrive'),
  ('Q3560851', 'Virtual Pro Wrestling 2: Ōdō Keishō est un jeu vidéo de catch sorti en 2000 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Aki Corporation et édité par Asmik Ace Entertainment. Il fait suite à Virtual Pro Wrestling 64.', 'https://fr.wikipedia.org/wiki/Virtual_Pro_Wrestling_2:_%C5%8Cd%C5%8D_Keish%C5%8D'),
  ('Q3530639', 'Tom et Jerry sèment la pagaille (Tom and Jerry in Fists of Furry) est un jeu vidéo de combat sorti en 2000 sur Nintendo 64 et Windows. Le jeu a été développé par VIS Entertainment puis édité par NewKidCo et Ubisoft. Il est basé sur le dessin animé Tom et Jerry.', 'https://fr.wikipedia.org/wiki/Tom_et_Jerry_s%C3%A8ment_la_pagaille'),
  ('Q3560853', 'Virtual Pro Wrestling 64 est un jeu vidéo de catch sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Aki Corporation et édité par Asmik Ace Entertainment.', 'https://fr.wikipedia.org/wiki/Virtual_Pro_Wrestling_64'),
  ('Q3532028', 'Top Gear Hyper Bike est un jeu vidéo de course sorti en 2000 sur Nintendo 64. Le jeu a été développé par Snowblind Studios et édité par Kemco.

Le jeu fait partie de la série Top Gear.', 'https://fr.wikipedia.org/wiki/Top_Gear_Hyper_Bike'),
  ('Q3560842', 'Virtual Chess 64 est un jeu vidéo d''échecs sorti en 1998 sur Nintendo 64. Le jeu a été développé et édité par Titus Software.

Il fait suite à Virtua Chess et Virtual Chess II.', 'https://fr.wikipedia.org/wiki/Virtual_Chess_64'),
  ('Q3560852', 'Virtual Pool 64 est un jeu vidéo de billard sorti en 1998 sur Nintendo 64. Le jeu a été développé par Celeris et édité par Crave Entertainment.', 'https://fr.wikipedia.org/wiki/Virtual_Pool_64'),
  ('Q1046604', 'Mario Kart 64 est un jeu vidéo de course et de combat motorisé développé par Nintendo Entertainment Analysis & Development et édité par Nintendo. Il sort sur la Nintendo 64 le 14 décembre 1996 au Japon, puis le 10 février 1997 en Amérique du Nord et enfin le 24 juin 1997 en Europe.

Deuxième volet de la série Mario Kart après Super Mario Kart sorti sur Super Nintendo, le jeu permet au joueur d''incarner un personnage de l''univers des jeux vidéo Super Mario à travers des courses de kart sur des circuits aux thèmes variés. À la différence de son prédécesseur, Mario Kart 64 adopte des graphismes en trois dimensions et devient donc le premier opus Mario Kart à en faire usage.', 'https://fr.wikipedia.org/wiki/Mario_Kart_64');

insert into import_summary (wikidata_id, summary, source) values
  ('Q933524', 'Pilotwings 64 est un jeu vidéo de simulateur de vol développé par Paradigm Entertainment et édité par Nintendo en 1996 sur Nintendo 64.', 'https://fr.wikipedia.org/wiki/Pilotwings_64'),
  ('Q1071278', 'Doom 64 est un jeu vidéo de tir à la première personne développé et édité par Midway Games et sorti le 2 décembre 1997 sur Nintendo 64. Il fait partie de la série des Doom et fait suite à Doom II: Hell on Earth. Il ressort officiellement le 20 mars 2020 sur Xbox One, PlayStation 4, Nintendo Switch et PC (via Steam) ainsi que le 12 mai 2020 sur Google Stadia, agrémenté d''un épisode supplémentaire appelé The Lost Levels.', 'https://fr.wikipedia.org/wiki/Doom_64'),
  ('Q1118490', 'Aidyn Chronicles: The First Mage est un jeu vidéo de rôle sorti en 2001 sur Nintendo 64. Le jeu a été développé par H2O Entertainment et édité par THQ.', 'https://fr.wikipedia.org/wiki/Aidyn_Chronicles:_The_First_Mage'),
  ('Q1109914', 'Pokémon Puzzle League est un jeu vidéo de puzzle sorti en 2000 sur Nintendo 64. Le jeu a été développé par NST et Intelligent Systems puis édité par Nintendo.

Le jeu est basé sur l''univers de Pokémon. En 2008, le jeu est sorti sur la console virtuelle de la Wii.', 'https://fr.wikipedia.org/wiki/Pok%C3%A9mon_Puzzle_League'),
  ('Q1107793', 'Altron est un studio de développement de jeux vidéo japonais fondé en 1983 et basé à Shinagawa, Tokyo.', 'https://fr.wikipedia.org/wiki/Altron'),
  ('Q1117921', 'AI Shōgi 3 est un jeu vidéo de réflexion sorti en 1998 sur Nintendo 64. Le jeu a été développé par Something Good et édité par ASCII Corporation.', 'https://fr.wikipedia.org/wiki/AI_Sh%C5%8Dgi_3'),
  ('Q1141963', 'Lylat Wars, aussi connu sous le nom de Star Fox 64 aux États-Unis, est un jeu vidéo de type Rail shooter développé par Nintendo EAD et édité par Nintendo, sorti sur Nintendo 64 en 1997. Il s''agit du deuxième jeu de la série Star Fox, succédant ainsi à Star Wing.

En Europe, le nom Star Fox n''a pu être utilisé comme titre pour le jeu, en raison d''un dépôt de marque non acquis par Nintendo. Un problème déjà rencontré lors de la sortie du précédent épisode. Mais en 2001, l''acquisition de la marque par Nintendo en permettra l''utilisation sur les épisodes suivants, notamment son remake sur Nintendo 3DS nommé Star Fox 64 3D. Un second remake intitulé simplement Star Fox est sorti sur Nintendo Switch 2 en juin 2026.', 'https://fr.wikipedia.org/wiki/Lylat_Wars'),
  ('Q1205676', 'Mario Party 2 est un jeu vidéo de type Party game sorti sur Nintendo 64 en 1999 au Japon, puis en 2000 dans le reste du monde. Il a été développé par Hudson Soft et édité par Nintendo. Le jeu est la suite du premier opus Mario Party et est le deuxième volet de la série des Mario Party. Il est suivi de Mario Party 3.

Mario Party 2 est également sorti sur Wii en tant que contenu téléchargeable de la Console virtuelle en 2010, puis sur Wii U en 2016, toujours sur le service de la Console virtuelle. Et plus récemment, la Console virtuelle sur Nintendo Switch.', 'https://fr.wikipedia.org/wiki/Mario_Party_2'),
  ('Q1309215', 'Doraemon 3: Nobita no machi SOS! est un jeu vidéo de plates-formes sorti en 2000 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Epoch.

Le jeu est inspiré du manga Doraemon. Il est le troisième et dernier jeu Doraemon sur Nintendo 64, précédé par Doraemon: Nobita to mittsu no seireiseki et Doraemon 2: Nobita to hikari no shinden.', 'https://fr.wikipedia.org/wiki/Doraemon_3:_Nobita_no_machi_SOS!'),
  ('Q1366980', 'Kirby 64: The Crystal Shards connu sous le nom de Kirby of the Stars 64 est un jeu vidéo de plates-formes développé par HAL Laboratory pour la Nintendo 64. Il est sorti en 2000 au Japon et en 2001 en Europe. Il fait partie des derniers jeux de la console.

Mis à part Kirby Air Ride qui a commencé à être développé sur Nintendo 64 avant de sortir finalement sur GameCube, Kirby 64 est l''unique jeu Nintendo 64 ayant Kirby pour personnage principal et le premier jeu de la série Kirby à être réalisé en 3D.', 'https://fr.wikipedia.org/wiki/Kirby_64:_The_Crystal_Shards'),
  ('Q1408723', 'Perfect Dark est un jeu vidéo de tir à la première personne, développé et édité par Rare, et sorti sur Nintendo 64 en 2000. Premier opus de la série Perfect Dark, il suit les missions de l''agente secrète Joanna Dark au service du fictif Institut Carrington, qui tente de déjouer une conspiration orchestrée par la puissante entreprise rivale dataDyne. Le jeu propose un mode campagne dans lequel le joueur doit parcourir une série de niveaux pour progresser dans l''histoire, ainsi que plusieurs modes multijoueur, incluant un mode coopératif et des parties en match à mort.

Successeur spirituel du jeu GoldenEye 007, également développé par Rare, Perfect Dark en reprend de nombreuses caractéristiques. Bien que n''exploitant pas la licence James Bond, le jeu possède un gameplay similaire et utilise une version améliorée du moteur de jeu. Martin Hollis, directeur de GoldenEye 007, supervise la production durant les quatorze premiers mois de son développement avant de quitter Rare pour fonder Free Radical Design. Perfect Dark sort alors que la Nintendo 64 arrive en fin de vie, et c''est peut-être pour cette raison qu''il n''a pas connu le même succès que son prédécesseur, bien qu''il soit l''un des jeux les plus avancés techniquement sur cette console.', 'https://fr.wikipedia.org/wiki/Perfect_Dark_(Nintendo_64)'),
  ('Q1478513', 'Holy Magic Century (Quest 64 aux États-Unis, Eltale Monsters au Japon) est un jeu vidéo de rôle sorti en 1998 sur Nintendo 64. Le jeu a été développé par Imagineer puis édité par THQ aux États-Unis, par Konami en Europe, et Imagineer au Japon.', 'https://fr.wikipedia.org/wiki/Holy_Magic_Century'),
  ('Q1385473', 'Extreme-G est un jeu vidéo de course sorti en 1997 sur Nintendo 64. Le jeu a été développé par Probe Entertainment et édité par Acclaim.

Il comporte 13 circuits, trois par thème (Désert/montagne, Ville, Grotte, Science-fiction) et un bonus.

De plus, il est jouable jusqu''à quatre joueurs simultanément, si on dispose de quatre manettes, et deux joueurs en mode grand prix.', 'https://fr.wikipedia.org/wiki/Extreme-G'),
  ('Q1309496', 'Doraemon 2: Nobita to hikari no shinden est un jeu vidéo de plates-formes sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Epoch.

Le jeu est inspiré du manga Doraemon. Il est le second jeu Doraemon sur Nintendo 64, précédé par Doraemon: Nobita to mittsu no seireiseki et suivi par Doraemon 3: Nobita no machi SOS!.', 'https://fr.wikipedia.org/wiki/Doraemon_2:_Nobita_to_hikari_no_shinden'),
  ('Q1309618', 'Doraemon: Nobita to mittsu no seireiseki est un jeu vidéo de plates-formes sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé et édité par Epoch.

Le jeu s''inspire du manga Doraemon. Il a eu deux suites sur Nintendo 64: Doraemon 2: Nobita to hikari no shinden et Doraemon 3: Nobita no machi SOS!.', 'https://fr.wikipedia.org/wiki/Doraemon:_Nobita_to_mittsu_no_seireiseki'),
  ('Q1527683', 'Indiana Jones et la Machine infernale (Indiana Jones and the Infernal Machine) est un jeu vidéo développé par LucasArts et édité en France par Ubisoft en 1999.

Avec ce titre, le studio LucasArts s''écarte des jeux d''aventure point and click qui ont largement contribué à sa renommée avec des titres comme Maniac Mansion: Day of the Tentacle, Monkey Island et Indiana Jones et le Mystère de l''Atlantide. En 3D à la 3e personne, mêlant phases d''exploration, phases d''action (combats arme au poing) et phases de plateformes, Indiana Jones et la Machine Infernale reprend le concept Tomb Raider.

La version Nintendo 64 du jeu n''a jamais été éditée en Europe.', 'https://fr.wikipedia.org/wiki/Indiana_Jones_et_la_Machine_infernale'),
  ('Q1758447', 'Mario Golf, ou Mario Golf 64 au Japon, est un jeu vidéo de golf développé par Camelot et édité par Nintendo en 1999 sur Nintendo 64. Le jeu est porté la même année sur Game Boy Color (le titre est Mario Golf GB au Japon).

Le jeu est compatible avec le Transfer Pak, ce qui permet de transférer des données et des personnages de la version Nintendo 64 sur Game Boy Color, et vice-versa.', 'https://fr.wikipedia.org/wiki/Mario_Golf_(jeu_vid%C3%A9o)'),
  ('Q1822207', 'Shadowgate 64: Trials of the Four Towers (litt. L''Épreuve des quatre tours) est un jeu vidéo d''aventure sorti en 1999 sur Nintendo 64. Le jeu a été développé par Infinite Ventures et édité par Kemco.

Le jeu est la suite de Shadowgate.', 'https://fr.wikipedia.org/wiki/Shadowgate_64:_Trials_of_the_Four_Towers'),
  ('Q1705294', 'Pokémon Snap est un jeu vidéo de la série Pokémon développé par HAL Laboratory et édité par Nintendo sur Nintendo 64. Il est sorti en mars 1999 au Japon, en juin 1999 en Amérique du Nord puis en septembre 2000 dans la région PAL. C''est un spin-off de la franchise Pokémon et l''un des premiers jeux de la saga à paraître sur console de salon.

Il propose au joueur de contrôler Todd Snap, appelé par le professeur Chen pour photographier des Pokémon au cours d''un safari-photo sur l''île Pokémon. Installé dans un véhicule au parcours prédéfini, le Zero-Un, Todd dispose de plusieurs accessoires pour photographier au mieux les Pokémon vivant sur cette île et compléter le rapport du professeur Chen.', 'https://fr.wikipedia.org/wiki/Pok%C3%A9mon_Snap'),
  ('Q1688483', 'Jet Force Gemini, ou Star Twins au Japon, est un jeu vidéo d''action-aventure, développé par Rare, sorti sur Nintendo 64 en 1999.', 'https://fr.wikipedia.org/wiki/Jet_Force_Gemini'),
  ('Q1634362', 'Rush 2: Extreme Racing USA est un jeu vidéo de course sorti en 1998 sur Nintendo 64. Le jeu a été développé par Atari et édité par Midway.

Le jeu fait partie de la série Rush.', 'https://fr.wikipedia.org/wiki/Rush_2:_Extreme_Racing_USA'),
  ('Q3393978', 'Pocket Monsters Stadium est un jeu vidéo de combat sorti en 1998 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par HAL Laboratory et édité par Nintendo.

Le jeu a eu une suite, connue sous le nom de Pokémon Stadium en Occident.', 'https://fr.wikipedia.org/wiki/Pocket_Monsters_Stadium'),
  ('Q3093008', 'Fushigi no Dungeon: Fūrai no Shiren 2 - Oni Shūrai! Siren-jō! est un jeu vidéo de type dungeon crawler sorti en 2000 sur Nintendo 64. Le jeu a été développé et édité par ChunSoft.', 'https://fr.wikipedia.org/wiki/Fushigi_no_Dungeon:_F%C5%ABrai_no_Siren_2'),
  ('Q3547692', 'Ucchannanchan no Honō no Challenger: Denryū Iraira Bō est un jeu vidéo d''adresse et de réflexion sorti en 1997 sur Nintendo 64 uniquement au Japon. Le jeu a été développé par Yuke''s et édité par Hudson Soft.

Le jeu est basé sur le jeu télévisé Ucchannanchan no Honō no Challenger: Kore ga Dekitara 100 Man En!!.', 'https://fr.wikipedia.org/wiki/Ucchannanchan_no_Hon%C5%8D_no_Challenger:_Denry%C5%AB_Iraira_B%C5%8D');

update public.game g
set summary = i.summary, summary_source = i.source
from import_summary i
where g.wikidata_id = i.wikidata_id
  and g.summary is null;

drop table import_summary;
