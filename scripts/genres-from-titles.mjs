// =====================================================================
// Carte Mémoire · Genres déduits du titre (cas sûrs uniquement)
//
// Pour des jeux sans genre (surtout sortis au Japon, sans article Wikipédia),
// le titre dit parfois le genre sans ambiguïté : « Hissatsu Pachinko Station »,
// « Minna no Shogi », « Simple 1500 Series Vol. 65: The Golf »…
// Chaque jeu ci-dessous a été relu à la main (2026-10-10) : seuls les cas
// certains sont listés. Les titres ambigus ont été écartés (« Tennis no
// Oujisama: Sweat & Tears » est une aventure, « WakuPuyo Dungeon » un jeu de
// donjon, « Tokimeki Memorial Drama Series » des aventures…).
//
// La migration vérifie le titre de chaque jeu (garde-fou), et ne touche qu'aux
// jeux toujours sans genre et non revus par un modérateur.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/genres-from-titles.mjs   → écrit la migration
// =====================================================================

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, publicApi, readEnv } from './lib/redump.mjs';

// Genres créés pour l'occasion (absents de Wikidata comme genre de jeu vidéo)
const NEW_GENRES = {
  pachinko: 'Pachinko et pachislot',
  cards: 'Jeu de cartes',
  go: 'Jeu de go',
};

// Genre (identifiant Wikidata, ou genre créé ci-dessus) → jeux relus
const GAMES = {
  Q9318902: [ // Jeu de mah-jong
    1560, 2229, 2245, 2298, 2446, 2473, 2578, 2585, 2751, 2752, 2911, 2914, 2917, 1187, 2944, 2945, 2946, 2948, 2947,
    2951, 3028, 3204, 3205, 3244, 3245, 3246, 3247, 3248, 3249, 1170, 1139, 3250, 3251, 3252, 3253, 1144, 3254, 3255,
    3256, 3257, 3258, 3346, 3388, 1192, 3480, 3481, 3482, 3483, 3555, 3717, 3718, 3719, 3720, 3721, 3722, 3723, 3776,
    3819, 3823, 3832, 3936, 3955, 3990, 3995, 4025, 4182, 4195, 4201, 4209, 4353, 4392, 4393, 4479,
  ],
  Q96102031: [ // Shogi
    1507, 1375, 2230, 2231, 2232, 2669, 2915, 2916, 2942, 1142, 3056, 1203, 1164, 3065, 3072, 1188, 3272, 3349, 3350,
    3351, 3390, 3391, 3524, 3820, 3821, 3824, 3826, 3878, 3885, 3940, 3941, 3942, 3945, 3991, 4192, 4200, 4481, 4501,
  ],
  go: [2666, 2667, 2776, 2913, 2949, 3343, 3344, 3825, 3876, 1476, 3877, 3959, 3993, 4190, 4191, 4337],
  Q71679871: [2416, 2417, 2418, 1265, 2660, 3385, 3822, 3963, 1315], // Échecs
  Q19272838: [2665, 3100, 3958, 2417, 3972, 3755, 3756], // Jeu de plateau (gunjin shogi, reversi, sugoroku, jeu de la vie)
  cards: [ // Hanafuda, cartes à jouer (trump), solitaire
    2338, 2473, 2634, 2819, 2820, 2821, 2822, 2823, 2824, 2912, 2990, 3249, 3387, 3554, 3960, 3994, 3961, 3962, 2860,
    1153, 3399, 4394,
  ],
  pachinko: [
    2757, 2843, 2844, 2873, 2874, 2875, 2876, 2877, 2878, 2879, 2880, 1380, 2889, 2881, 2882, 2883, 2884, 2885, 2886,
    2887, 2888, 2890, 2891, 2892, 2893, 2894, 2895, 2896, 2897, 2898, 2899, 2900, 2901, 2902, 2903, 2904, 2939, 2996,
    2997, 3016, 3017, 3018, 3019, 3020, 3021, 3022, 3023, 3024, 3025, 3026, 3045, 1166, 3103, 3122, 3123, 3485, 3486,
    3487, 3488, 3489, 3526, 3527, 3579, 3566, 3567, 3568, 3569, 3570, 3571, 3572, 3573, 3574, 3575, 3576, 3577, 3578,
    3580, 3581, 3582, 3583, 3584, 3585, 3586, 3587, 3588, 3589, 3590, 3591, 3592, 3593, 3594, 3595, 3596, 3597, 3598,
    3599, 3600, 3601, 3602, 3603, 3604, 3605, 3606, 1167, 3607, 3608, 3609, 3844, 3845, 3846, 3847, 3848, 3932, 3968,
    3969, 4050, 4051, 4052, 4053, 4054, 4055, 4056, 4057, 4059, 4060, 4061, 4062, 4063, 4064, 4065, 4066, 4067, 4068,
    4069, 4233, 4344, 1173, 1329, 4368, 4369, 4370, 4371, 4372,
  ],
  Q3742351: [3996], // Jeu de casino
  Q11298493: [ // Jeu de quiz
    1808, 2249, 2299, 2810, 2952, 3141, 3142, 3615, 3666, 3667, 3752, 3753, 3754, 3755, 3756, 3757, 3758, 3759, 3760,
    1149, 3966, 3986, 4006, 4021,
  ],
  Q54767: [2228, 1193, 2584, 2855, 3207, 3428, 3742, 2143, 3988, 3998, 1151, 4176, 4199, 4270, 4265, 4500, 2749, 2745, 1243, 4018], // Réflexion
  Q110505373: [3506, 3514, 3515, 3516, 3517, 3518], // Picross (Oekaki Puzzle)
  Q10308060: [2082, 4229, 3456, 4227], // Tetris
  Q2941225: [2350, 2351, 2492, 2852, 3967, 1152], // Casse-briques (Block Kuzushi)
  Q13717398: [4002], // Labyrinthe (The Meiro)
  Q60256879: [2333, 2998, 3479, 3642, 3646, 4009, 2013, 3291, 3537, 1241, 4375], // Golf
  Q61719251: [1598, 2659, 2853, 3971, 1150, 4120, 4373, 4395], // Bowling
  Q61793886: [2114, 574, 1430, 2528, 3213, 3214, 3215, 3533, 3978, 1311, 1326, 4446, 4452], // Tennis
  Q868217: [3985, 3484, 4003, 4000, 4016, 3975, 2487], // Sport (tennis de table, sumo, fléchettes, natation, gateball, curling)
  Q62019045: [2307, 2308, 2070, 2966, 3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 3011, 3328, 3726, 3973, 4029, 4035], // Baseball
  Q1478420: [ // Football (soccer, futsal)
    2220, 2221, 2246, 1288, 2612, 2613, 2614, 2611, 2708, 2709, 2717, 1190, 2965, 2978, 2979, 2980, 2981, 2982, 2983,
    2999, 3419, 3738, 3886, 4076, 4417, 4447, 4030,
  ],
  Q63915027: [4441], // Basket-ball
  Q3177953: [2141, 3984, 4365], // Boxe
  Q105221690: [2243, 2693, 3724, 3725, 3918, 3974, 3999, 4383, 4498], // Catch
  Q108611897: [3027, 3079, 3080, 3081, 1191, 3082, 3083, 3084, 3085, 3086, 3977, 828, 2546, 2544, 2545, 3053], // Courses hippiques
  Q140089489: [3170, 4024, 4377, 4378, 4379, 4380, 687], // Kyōtei
  Q16935625: [ // Pêche
    2310, 2332, 2698, 2699, 2700, 2701, 2702, 3074, 3191, 3295, 3407, 3556, 3640, 3641, 1686, 1687, 724, 3860, 3913,
    3981, 4161, 4311, 4314, 4332, 715, 4333, 4338,
  ],
  Q62022558: [2335, 3964, 3997], // Billard
  Q71441946: [4440], // Snooker
  Q653928: [2631, 2674, 2936, 3636, 3653, 3965], // Flipper
  Q71467370: [4007], // Ski
  Q71467408: [3810], // Saut à ski
  Q7548531: [3979, 1719], // Snowboard
  Q860750: [1268, 3621, 3763, 3774, 3989, 4291, 4300, 876], // Course
  Q18759108: [2651], // Karting
  Q1339223: [3783, 3987, 4012, 1839, 4193], // Simulation de drague (« Renai Simulation »)
  Q689445: [3983], // Visual novel (The Sound Novel)
  Q4282636: [3046, 4103, 4001], // Tir (« The Shooting », The Sniper)
  Q1044478: [2176], // Shoot 'em up (The Invaders)
};


// ---------------------------------------------------------------------
// Vérification : chaque jeu existe, avec le titre relu
// ---------------------------------------------------------------------
const api = publicApi(readEnv());
const ids = [...new Set(Object.values(GAMES).flat())];
const titles = new Map();
for (let i = 0; i < ids.length; i += 200) {
  for (const g of await api(`game?select=id,title&id=in.(${ids.slice(i, i + 200).join(',')})`)) titles.set(g.id, g.title);
}
const missing = ids.filter((id) => !titles.has(id));
if (missing.length) throw new Error(`Jeux introuvables : ${missing.join(', ')}`);

const lit = (s) => `'${s.replaceAll("'", "''")}'`;
const rows = Object.entries(GAMES).flatMap(([genre, list]) => list.map((id) =>
  `(${id}, ${lit(titles.get(id))}, ${genre in NEW_GENRES ? `null, ${lit(NEW_GENRES[genre])}` : `${lit(genre)}, null`})`));
console.log(`${ids.length} jeux, ${rows.length} genres attribués`);

// Après la dernière migration existante
const latest = readdirSync(join(ROOT, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).sort().at(-1);
const now = new Date();
const clock = now.toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = clock > latest ? clock : String(BigInt(latest) + 100n);
writeFileSync(join(ROOT, 'supabase', 'migrations', `${stamp}_genres_from_titles.sql`), `-- =====================================================================
-- Carte Mémoire · Genres déduits du titre, cas sûrs uniquement
-- Fichier GÉNÉRÉ par scripts/genres-from-titles.mjs le ${now.toISOString().slice(0, 10)}
-- (la liste des jeux, relue à la main, est dans ce script).
--
-- ${ids.length} jeux sans genre dont le titre ne laisse aucun doute (« Pachinko »,
-- « Shogi », « Mahjong », « The Golf »…). Garde-fous : le titre doit être
-- identique, le jeu toujours sans genre, et non revu par un modérateur.
-- =====================================================================

-- Genres absents de Wikidata comme genres de jeu vidéo
insert into public.genre (name, families) values
  ('Pachinko et pachislot', '{party}'),
  ('Jeu de cartes', '{party}'),
  ('Jeu de go', '{party}')
on conflict (name) do nothing;

create temporary table title_genre (
  game_id    bigint not null,
  title      text not null,
  genre_qid  text,
  genre_name text
);

insert into title_genre (game_id, title, genre_qid, genre_name) values
  ${rows.join(',\n  ')};

-- Le jeu relu : par son titre s'il est unique dans la base (les identifiants
-- peuvent différer d'une base à l'autre), sinon par identifiant ET titre
create temporary table title_genre_match as
select distinct t.game_id as listed_id, g.id
from title_genre t
join public.game g on g.title = t.title
where g.id = t.game_id
   or (select count(*) from public.game g2 where g2.title = t.title) = 1;

-- Jeux encore sans genre (hors thèmes) et non revus
create temporary table title_genre_game as
select m.listed_id, m.id
from title_genre_match m
join public.game g on g.id = m.id
where not g.genres_reviewed
  and not exists (
    select 1 from public.game_genre gg join public.genre ge on ge.id = gg.genre_id
    where gg.game_id = g.id and cardinality(ge.families) > 0
  );

insert into public.game_genre (game_id, genre_id)
select m.id, ge.id
from title_genre t
join title_genre_game m on m.listed_id = t.game_id
join public.genre ge on ge.wikidata_id = t.genre_qid or ge.name = t.genre_name
on conflict do nothing;

drop table title_genre_match;

drop table title_genre_game;
drop table title_genre;
`);
console.log(`Migration écrite : supabase/migrations/${stamp}_genres_from_titles.sql`);
