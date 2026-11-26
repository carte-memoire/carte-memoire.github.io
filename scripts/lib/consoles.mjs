// =====================================================================
// Consoles que les scripts d'import savent traiter, et ce qu'il faut pour
// chacune : identifiant Wikidata, listes Wikipédia, fichiers Redump (disques) ou
// No-Intro (cartouches) et jaquettes libretro. Les scripts prennent l'option
// --console PS2 (sans option : la PlayStation, comme avant).
// =====================================================================

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const CONSOLES = {
  PS1: {
    code: 'PS1',
    name: 'PlayStation',
    slug: 'ps1',
    wikidata: 'Q10677',
    // Listes Wikipédia : une colonne de dates par zone (JP, PAL, NA) et la mention P des Platinum
    wikipediaPages: ['List of PlayStation (console) games (A–L)', 'List of PlayStation (console) games (M–Z)'],
    wikipediaFormat: 'dates-by-zone',
    redump: 'Sony - PlayStation',
    thumbnails: 'libretro-thumbnails/Sony_-_PlayStation',
    // Liste des jeux sur Wikipédia en japonais (une page par année : « … (1998年) »)
    jaWikipediaList: 'PlayStationのゲームタイトル一覧',
  },
  PS2: {
    code: 'PS2',
    name: 'PlayStation 2',
    slug: 'ps2',
    wikidata: 'Q10680',
    // Listes Wikipédia : la date de première sortie, puis une colonne « sorti oui/non » par zone
    wikipediaPages: ['List of PlayStation 2 games (A–K)', 'List of PlayStation 2 games (L–Z)'],
    wikipediaFormat: 'first-date-and-zones',
    redump: 'Sony - PlayStation 2',
    thumbnails: 'libretro-thumbnails/Sony_-_PlayStation_2',
    jaWikipediaList: 'PlayStation 2のゲームタイトル一覧',
    // Un jeu Wikidata n'est importé que si la liste Wikipédia ou Redump le confirme
    // (Wikidata classe aussi en PS2 des jeux annulés ou sortis seulement en compilation)
    confirmWikidata: true,
  },
  // NES : la Famicom japonaise en est la version japonaise (NTSC-J), comme Wikidata et
  // Wikipédia la rangent (une seule console « Nintendo Entertainment System »)
  NES: {
    code: 'NES',
    name: 'NES',
    slug: 'nes',
    wikidata: 'Q172742',
    // Liste Wikipédia : titre, studio, éditeur, première sortie, puis une date par zone (JP, NA, PAL)
    wikipediaPages: ['List of Nintendo Entertainment System games'],
    wikipediaFormat: 'first-date-then-dates',
    dateColumns: ['NTSC-J', 'NTSC-U', 'PAL'],
    // Cartouches vérifiées : No-Intro (pas de code produit dans ce fichier)
    redump: 'Nintendo - Nintendo Entertainment System',
    datFolder: 'no-intro',
    thumbnails: 'libretro-thumbnails/Nintendo_-_Nintendo_Entertainment_System',
    jaWikipediaList: 'ファミリーコンピュータのゲームタイトル一覧',
    // Wikidata range aussi sous la NES des jeux annulés, des rééditions et des jeux sans licence
    confirmWikidata: true,
    // Jeux sans licence vendus en magasin (Tengen, Camerica…) : gardés (No-Intro, jaquettes)
    unlicensed: true,
    // Les autres tableaux de la liste : compilations, cartouches de championnat, Konami QTa,
    // Bandai Datach, et les jeux SANS LICENCE vendus en magasin (NES de l'époque, Famicom
    // d'Asie, cartouches sorties après la fin de la console). Pas les jeux jamais sortis.
    extraTables: [
      { id: 'softwarelist', heading: 'Compilations', main: true },
      { id: 'softwarelistchampionship', columns: ['title', 'developers', 'publishers', 'date'], zone: 'NTSC-U' },
      { id: 'konamiqtalist', columns: ['title', 'developers', 'publishers', 'date'], zone: 'NTSC-J' },
      { id: 'datachlist', columns: ['title', 'developers', 'publishers', 'date'], zone: 'NTSC-J' },
      { id: 'unlicensedgames', heading: 'Unlicensed games', columns: ['title', 'publishers', 'date'], zone: 'NTSC-U' },
      { id: 'unlicensedgames', heading: 'Famicom games', columns: ['title', 'date', 'publishers', 'country'], zone: 'NTSC-J' },
      // Après la fin de la console : cartouches NES, ou Famicom pour les éditeurs japonais
      { id: 'unlicensedgamesafter', columns: ['title', 'publishers', 'date'], zone: 'NTSC-U', japanesePublishers: ['Columbus Circle'] },
    ],
  },
  // Super Nintendo : la Super Famicom japonaise en est la version japonaise (NTSC-J), comme
  // pour la NES et la Famicom
  SNES: {
    code: 'SNES',
    name: 'Super Nintendo',
    slug: 'snes',
    wikidata: 'Q183259',
    // Liste Wikipédia : titre, studio, éditeur, puis une date par zone (JP, NA, PAL)
    wikipediaPages: ['List of Super Nintendo Entertainment System games'],
    wikipediaFormat: 'dates-by-zone',
    dateColumns: ['NTSC-J', 'NTSC-U', 'PAL'],
    redump: 'Nintendo - Super Nintendo Entertainment System',
    datFolder: 'no-intro',
    thumbnails: 'libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System',
    jaWikipediaList: 'スーパーファミコンのゲームタイトル一覧',
    confirmWikidata: true,
    // Wikidata range aussi sous la Super Nintendo le jeu d'origine d'une série (le jeu SNES a
    // sa propre fiche : Arkanoid: Doh It Again, Pitfall: The Mayan Adventure, Space Invaders:
    // The Original Game), le jeu FDS dont la version SNES est un autre jeu (Shin Onigashima),
    // un article d'anime, et des doublons d'un jeu de la liste (RoboCop 3, Taikō Risshiden)
    // Puis les doublons d'une ligne de la liste écrite sous un titre plus complet (Aretha, Yokozuna
    // Monogatari, The Shinri Game 2, A-Train III Super Version, Crayon Shin-chan, Kyūyaku Megami
    // Tensei, Daibakushō Jinsei Gekijō, Ancient Magic) et un cadeau promotionnel jamais vendu
    wikidataExclude: ['Q91282', 'Q1573878', 'Q220665', 'Q3482155', 'Q131357353', 'Q2589086', 'Q851255',
      'Q4789098', 'Q11543448', 'Q137998907', 'Q4651925', 'Q3002369', 'Q969588', 'Q11437758', 'Q11327733', 'Q107043291'],
    unlicensed: true,
    // Les cartouches de championnat (comme pour la NES) et les jeux sans licence vendus en
    // magasin (deux à l'époque, les autres bien après). Pas les cadeaux promotionnels, ni les
    // logiciels hors jeux, ni les rééditions sur d'autres consoles (Switch…)
    extraTables: [
      { id: 'softwarelistchampionship', columns: ['title', 'developers', 'date'], zone: 'NTSC-U' },
      { id: 'unlicensedgames', columns: ['title', 'developers', 'publishers', 'date', 'regions'], zone: 'NTSC-U' },
    ],
  },
  // Game Boy : la console portable d'origine (les jeux Game Boy Color seront une console à part)
  GB: {
    code: 'GB',
    name: 'Game Boy',
    slug: 'gb',
    wikidata: 'Q186437',
    // Liste Wikipédia : titre, studio, éditeur, puis une date par zone (JP, NA, PAL)
    wikipediaPages: ['List of Game Boy games'],
    wikipediaFormat: 'dates-by-zone',
    dateColumns: ['NTSC-J', 'NTSC-U', 'PAL'],
    redump: 'Nintendo - Game Boy',
    datFolder: 'no-intro',
    thumbnails: 'libretro-thumbnails/Nintendo_-_Game_Boy',
    jaWikipediaList: 'ゲームボーイのゲームタイトル一覧',
    confirmWikidata: true,
    // Wikidata range aussi sous la Game Boy des jeux d'une autre console (le jeu d'origine d'un
    // portage : MIDI Maze pour Faceball 2000, Prehistorik 2 pour Prehistorik Man ; M.C. Kids pour
    // McDonaldland, qui est Spot), une série (Space Invaders) et des jeux amateurs récents
    // jamais vendus en boîte
    wikidataExclude: ['Q335946', 'Q1093995', 'Q6712166', 'Q220665', 'Q5182325', 'Q376785',
      'Q130723247', 'Q81948431', 'Q130731746', 'Q122041740',
      // Adventure Island (jeu NES : la version Game Boy est le portage du II) ; New Ghostbusters II (NES)
      'Q568489', 'Q8762678'],
    // Lignes de la liste reliées à l'article d'une série ou du jeu d'une autre console : la fiche
    // Wikidata propre à la version Game Boy
    wikipediaQids: {
      'Adventures of Lolo': 'Q2825397', Baseball: 'Q116687747', "Bonk's Adventure": 'Q134868330',
      'Burai Fighter Deluxe': 'Q97653423', 'Choplifter III': 'Q109502583', 'Daffy Duck: The Marvin Missions': 'Q96076258',
      'Ghostbusters II': 'Q123530037', 'Nontan no Issho: Kuru Kuru Puzzle': 'Q104876516',
      'Pokémon Yellow Version: Special Pikachu Edition': 'Q1988120', "Pop'n TwinBee": 'Q2008875', 'Small Soldiers': 'Q95069603',
      "Solomon's Club": 'Q7558528', 'The Addams Family': 'Q7712362', "The Smurfs 3: The Smurfs' Nightmare": 'Q67113842',
      'Tetris Blast': 'Q136784104', 'V-Rally: Championship Edition': 'Q138458319',
      'Downtown Special: Kunio-Kun no Jidaigeki Dayo Zenin Shūgō!': 'Q11265439',
    },
    unlicensed: true,
    // Les compilations vendues en boîte, et les jeux sans licence vendus en magasin, pendant la
    // vie de la console (Sachen…) et bien après (cartouches neuves). Pas les applications
    // (Game Boy Camera…) : ce ne sont pas des jeux. Les tableaux sans licence n'ont pas
    // d'identifiant : repérés par le titre de leur section
    extraTables: [
      { id: 'softwarelist', heading: 'Bundle compilations', main: true },
      { heading: 'Before the discontinuation of the Game Boy', columns: ['title', 'developers', 'publishers', 'date', 'country'], zone: 'NTSC-J' },
      { heading: 'After the discontinuation of the Game Boy', columns: ['title', 'developers', 'publishers', 'date', 'country'], zone: 'NTSC-U' },
    ],
  },
  // Game Boy Color : les jeux en couleur, dont ceux « Dual Mode » (cartouche noire, aussi jouable
  // sur Game Boy). Un jeu sorti aussi sur Game Boy garde une fiche, avec ses versions des deux
  GBC: {
    code: 'GBC',
    name: 'Game Boy Color',
    slug: 'gbc',
    wikidata: 'Q203992',
    // Liste Wikipédia : tableau « list » ; titre, Dual Mode, fonction de la cartouche (colonnes
    // sautées), studio, éditeur, première sortie par région ({{Vgrtbl}}), puis JP, NA, EU cochés
    wikipediaPages: ['List of Game Boy Color games'],
    wikipediaFormat: 'first-date-and-zones',
    tableId: 'list',
    skipColumns: [1, 2],
    presenceColumns: ['NTSC-J', 'NTSC-U', 'PAL'],
    redump: 'Nintendo - Game Boy Color',
    datFolder: 'no-intro',
    thumbnails: 'libretro-thumbnails/Nintendo_-_Game_Boy_Color',
    jaWikipediaList: 'ゲームボーイカラーのゲームタイトル一覧',
    confirmWikidata: true,
    // Wikidata range aussi sous la Game Boy Color des jeux amateurs récents, une réédition de
    // 2024 (Toki Tori: Ultimate Edition) et un jeu Game Boy (V-Rally: Championship Edition)
    wikidataExclude: ['Q130723626', 'Q122041248', 'Q122019588', 'Q122031452', 'Q122068442', 'Q138331623', 'Q138458319'],
    // Lignes de la liste reliées à l'article d'une série ou du jeu d'une autre console : la fiche
    // Wikidata propre à la version Game Boy Color
    wikipediaQids: {
      'Armorines: Project S.W.A.R.M.': 'Q113329759', 'Army Men: Air Combat': 'Q137205117', Asteroids: 'Q51000295',
      Blade: 'Q123945230', 'Bomberman Max: Blue Champion': 'Q2909725', 'Choro Q Hyper GB': 'Q141906113',
      'Daa! Daa! Daa! Totsuzen ★ Card de Battle de Uranai!?': 'Q142199625', "Dragon Warrior Monsters 2: Cobi's Journey": 'Q3038754',
      'Driver: You Are the Wheelman': 'Q83863160', 'Déjà Vu I&II: The Casebooks of Ace Harding': 'Q133824874',
      'ESPN National Hockey Night': 'Q97983355', "Sesame Street: Elmo's ABCs": 'Q96377174', 'Hype: The Time Quest': 'Q101143766',
      'Thomas the Tank Engine & Friends: The Friends of Sodor': 'Q6406209', "Lego Island 2: The Brickster's Revenge": 'Q110253159',
      "MTV Sports: T.J. Lavin's Ultimate BMX": 'Q96583239', 'Mary-Kate & Ashley: Winners Circle': 'Q115857684', 'NASCAR Heat': 'Q99720547',
      'NFL Blitz 2001': 'Q113324389', 'No Fear Downhill Mountain Biking': 'Q98043531', 'Pokémon Gold Version': 'Q25991446',
      'Pokémon Silver Version': 'Q25991443', 'Power Spike Pro Beach Volleyball': 'Q96238334', 'R-Type DX': 'Q110662911',
      'Rayman 2: The Great Escape': 'Q104054000', 'Robopon: Sun Version': 'Q7353296', 'Shadowgate Classic': 'Q109016246',
      'Space Marauder': 'Q7572413', "Tony Hawk's Pro Skater 2": 'Q133760555', 'Tootuff•Titeuf': 'Q3529535', 'WCW Mayhem': 'Q130550035',
      'Xena: Warrior Princess': 'Q113301665',
    },
    unlicensed: true,
    // Les cartouches sorties bien après la fin de la console (Grimace's Birthday…) ; pas les
    // jeux « Nintendo Power » (téléchargés en boutique sur une cartouche réinscriptible)
    extraTables: [
      { heading: 'Aftermarket releases', columns: ['title', 'compatible', 'feature', 'developers', 'publishers', 'date'], zone: 'NTSC-U' },
    ],
  },
  // Famicom Disk System (Japon) : jeux sur disquette. Un jeu sorti aussi en cartouche garde une
  // seule fiche (même identifiant Wikidata), avec ses versions NES et FDS.
  FDS: {
    code: 'FDS',
    name: 'Famicom Disk System',
    slug: 'fds',
    wikidata: 'Q135321',
    // Sortie au Japon seulement : un jeu sans lieu de sortie connu y est rangé
    onlyZone: 'NTSC-J',
    // Liste Wikipédia : titre, studio, éditeur, date de sortie (Japon), notes ; puis les jeux
    // sans licence. Pas de tableau « par zone » : tout passe par les tableaux décrits ici.
    wikipediaPages: ['List of Famicom Disk System games'],
    wikipediaFormat: 'tables',
    redump: 'Nintendo - Family Computer Disk System',
    datFolder: 'no-intro',
    thumbnails: 'libretro-thumbnails/Nintendo_-_Family_Computer_Disk_System',
    confirmWikidata: true,
    unlicensed: true,
    extraTables: [
      { id: 'softwarelist', columns: ['title', 'developers', 'publishers', 'date', 'notes'], zone: 'NTSC-J' },
      { id: 'softwarelistunlicensed', columns: ['title', 'publishers', 'date'], zone: 'NTSC-J' },
    ],
  },
};

// Fichier Redump (disques) ou No-Intro (cartouches) d'une console (libretro-database) :
// noms des disques ou cartouches vérifiés
export const redumpDatUrl = (console_) =>
  `https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/${console_.datFolder ?? 'redump'}/${encodeURIComponent(console_.redump)}.dat`;

// --console PS2 (ou --console=PS2) ; sans option, la PlayStation
export function consoleFromArgs(argv = process.argv) {
  const i = argv.findIndex((a) => a === '--console' || a.startsWith('--console='));
  const code = i < 0 ? 'PS1' : argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
  const console_ = CONSOLES[String(code ?? '').toUpperCase()];
  if (!console_) throw new Error(`Console inconnue : ${code} (possibles : ${Object.keys(CONSOLES).join(', ')})`);
  return console_;
}

// Horodatage d'une nouvelle migration : juste après la plus récente du dossier, pour que
// les migrations écrites à la main ensuite restent dans l'ordre (db push refuse une
// migration plus ancienne que la dernière envoyée)
export function nextMigrationStamp(root) {
  const latest = readdirSync(join(root, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).filter((n) => /^\d{14}$/.test(n)).sort().at(-1);
  return String(BigInt(latest) + 100n);
}
