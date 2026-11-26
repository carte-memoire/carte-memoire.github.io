// =====================================================================
// Carte Mémoire · Genres des jeux encore SANS genre, depuis libretro-database
// (metadat/genre, licence CC BY-SA 4.0 : https://github.com/libretro/libretro-database)
//
// libretro classe chaque cartouche (nom No-Intro, le même que celui des jaquettes) dans un
// genre simple : « Platform », « Sports », « Role-playing (RPG) »… Moins précis que
// l'encadré des articles Wikipédia (scripts/import-genres.mjs, import-genres-ja.mjs) : il ne
// sert QUE pour les jeux qui n'ont encore aucun genre, et la migration le revérifie au moment
// de s'appliquer (un jeu classé entre-temps, ou revu par un modérateur, n'est pas touché).
//
// Les cartouches sont reliées à nos versions comme les jaquettes (scripts/lib/redump.mjs :
// même titre, même zone). La migration désigne les jeux par leur numéro ET leur titre
// (garde-fou : sur une autre base, un numéro qui ne porte pas ce titre est ignoré).
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-genres-libretro.mjs --console NES            → analyse seule
//   node scripts/import-genres-libretro.mjs --console NES --ecrire   → écrit la migration
// =====================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, buildIndex, bestMatch, loadReleases, parseName, publicApi, readEnv } from './lib/redump.mjs';
import { consoleFromArgs, nextMigrationStamp } from './lib/consoles.mjs';

const CONSOLE = consoleFromArgs();
const write = process.argv.includes('--ecrire');
const CACHE_DIR = join(ROOT, '.genres-import');

// Genres de libretro → genres de notre base (identifiant Wikidata, sinon nom)
const GENRES = {
  'Action': 'Q270948', 'Sports': 'Q868217', 'Platform': 'Q828322', 'Role-playing (RPG)': 'Q744038',
  'Puzzle': 'Q54767', 'Thinking': 'Q54767', 'Racing': 'Q860750', 'Strategy': 'Q472055', 'Adventure': 'Q23916',
  'Board': 'Q19272838', 'Shooter': 'Q4282636', 'Simulation': 'Q1610017', 'Fighting': 'Q846224',
  "Shoot'em Up": 'Q1044478', "Beat'em Up": 'Q401831', 'Gambling': 'Q60617897', 'Sports with Animals': 'Q868217',
  'Educational': 'Q1224999', 'Card': 'name:Jeu de cartes', 'Pinball': 'Q3177954', 'Quiz': 'Q11298493',
  'Music / Dancing': 'Q584105', 'Lightgun Shooter': 'Q3965952',
  // « Hunting and Fishing » : la pêche, sauf titre de chasse
  'Hunting and Fishing': (title) => (/hunt|chasse|duck|deer|shika|kari/i.test(title) ? 'Q71474253' : 'Q16935625'),
};
// Écartés : ce ne sont pas des genres de jeu
const IGNORED = new Set(['Compilation', 'Adult', 'Various', 'Casual Game', 'Demo']);


// ---------------------------------------------------------------------
// 1. Le fichier de genres de libretro (gardé dans .genres-import/)
// ---------------------------------------------------------------------
mkdirSync(CACHE_DIR, { recursive: true });
const cacheFile = join(CACHE_DIR, `libretro-genres-${CONSOLE.code.toLowerCase()}.dat`);
if (!existsSync(cacheFile)) {
  const url = `https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/genre/${encodeURIComponent(CONSOLE.redump)}.dat`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`libretro : ${res.status} pour ${url}`);
  writeFileSync(cacheFile, await res.text());
}
const entries = [];
for (const block of readFileSync(cacheFile, 'utf8').split(/\ngame \(/).slice(1)) {
  const name = /comment "([^"]+)"/.exec(block)?.[1];
  const genres = [...block.matchAll(/genre "([^"]+)"/g)].map((m) => m[1]);
  if (!name || genres.length === 0) continue;
  const info = parseName(name, { unlicensed: CONSOLE.unlicensed });
  if (info) entries.push({ ...info, name, genres });
}
const index = buildIndex(entries);
console.log(`libretro : ${entries.length} cartouches classées (${CONSOLE.redump})`);


// ---------------------------------------------------------------------
// 2. Nos jeux de la console, et ceux qui n'ont encore aucun genre
// ---------------------------------------------------------------------
const api = publicApi(readEnv());
const { releases, keysOfGame } = await loadReleases(api, 'game_ref:game(id)', CONSOLE.code);
const genres = await api('genre?select=id,families&limit=1000');
const withFamily = new Set(genres.filter((g) => g.families?.length).map((g) => g.id));
const [platform] = await api(`platform?select=id&short_name=eq.${CONSOLE.code}`);
const games = new Map();
for (let offset = 0; ; offset += 1000) {
  const page = await api(`game?select=id,title,genres_reviewed,game_genre(genre_id),release!inner(platform_id)&release.platform_id=eq.${platform.id}&order=id&limit=1000&offset=${offset}`);
  for (const g of page) games.set(g.id, g);
  if (page.length < 1000) break;
}
const withoutGenre = [...games.values()].filter((g) => !g.genres_reviewed && !g.game_genre.some((gg) => withFamily.has(gg.genre_id)));
console.log(`${games.size} jeux ${CONSOLE.code}, dont ${withoutGenre.length} sans genre (et non revus par un modérateur)`);


// ---------------------------------------------------------------------
// 3. Genres retenus : ceux des cartouches reliées aux versions de chaque jeu
// ---------------------------------------------------------------------
const decisions = [];
const unknown = new Map();
let noMatch = 0;
for (const game of withoutGenre) {
  const found = new Map(); // genre libretro → nombre de versions
  for (const r of releases.filter((x) => x.game_id === game.id && x.zone)) {
    const match = bestMatch(r, keysOfGame, index);
    if (!match) continue;
    for (const g of match.entry.genres) found.set(g, (found.get(g) ?? 0) + 1);
  }
  if (found.size === 0) { noMatch++; continue; }
  const targets = new Set();
  for (const label of found.keys()) {
    if (IGNORED.has(label)) continue;
    const target = typeof GENRES[label] === 'function' ? GENRES[label](game.title) : GENRES[label];
    if (target) targets.add(target);
    else unknown.set(label, (unknown.get(label) ?? 0) + 1);
  }
  if (targets.size) decisions.push({ game, labels: [...found.keys()], targets: [...targets] });
}
const byLabel = new Map();
for (const d of decisions) for (const l of d.labels) byLabel.set(l, (byLabel.get(l) ?? 0) + 1);
console.log(`
Bilan
  Jeux sans genre                 ${withoutGenre.length}
    sans cartouche reliée         ${noMatch}
    genre trouvé chez libretro    ${decisions.length}
  Genres libretro les plus donnés : ${[...byLabel].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', ')}
  Genres sans équivalent (ignorés) : ${[...unknown].map(([l, n]) => `${l} (${n})`).join(', ') || 'aucun'}
`);
console.log('Échantillon :');
for (const d of decisions.filter((_, i) => i % Math.max(1, Math.floor(decisions.length / 20)) === 0).slice(0, 20)) {
  console.log(`  ${d.game.title.slice(0, 50).padEnd(50)} ${d.labels.join(', ')}`);
}
writeFileSync(join(CACHE_DIR, `libretro-genres-${CONSOLE.code.toLowerCase()}.txt`),
  decisions.map((d) => `${d.game.id} | ${d.game.title} | ${d.labels.join(', ')}`).join('\n'));
if (!write) {
  console.log(`\nPour écrire la migration : node scripts/import-genres-libretro.mjs --console ${CONSOLE.code} --ecrire`);
  process.exit(0);
}


// ---------------------------------------------------------------------
// 4. Migration
// ---------------------------------------------------------------------
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = decisions.flatMap((d) => d.targets.map((t) => (t.startsWith('name:')
  ? `(${d.game.id}, ${sql(d.game.title)}, null, ${sql(t.slice(5))})`
  : `(${d.game.id}, ${sql(d.game.title)}, ${sql(t)}, null)`)));
const stamp = nextMigrationStamp(ROOT);
const file = join(ROOT, 'supabase', 'migrations', `${stamp}_import_genres_libretro_${CONSOLE.code.toLowerCase()}.sql`);
writeFileSync(file, `-- =====================================================================
-- Carte Mémoire · Genres des jeux ${CONSOLE.name} encore sans genre, depuis libretro-database
-- Fichier GÉNÉRÉ par scripts/import-genres-libretro.mjs le ${new Date().toISOString().slice(0, 10)}.
-- Source : libretro-database, metadat/genre (licence CC BY-SA 4.0),
--   https://github.com/libretro/libretro-database
--
-- ${decisions.length} jeux. Seulement ceux qui n'ont toujours aucun genre (de famille) au moment
-- de s'appliquer, et jamais un jeu revu par un modérateur. Jeux désignés par leur numéro ET
-- leur titre (garde-fou).
-- =====================================================================

insert into public.game_genre (game_id, genre_id)
select g.id, ge.id
from (values
  ${rows.join(',\n  ')}
) as v (game_id, title, genre_qid, genre_name)
join public.game g on g.id = v.game_id and g.title = v.title
join public.genre ge on ge.wikidata_id = v.genre_qid or (v.genre_qid is null and ge.name = v.genre_name)
where not g.genres_reviewed
  and not exists (select 1 from public.game_genre gg join public.genre x on x.id = gg.genre_id
                  where gg.game_id = g.id and cardinality(x.families) > 0)
on conflict do nothing;
`);
console.log(`\nMigration écrite : supabase/migrations/${stamp}_import_genres_libretro_${CONSOLE.code.toLowerCase()}.sql`);
