// =====================================================================
// Carte Mémoire · Versions manquantes depuis Redump (analyse)
//
// Redump recense chaque disque PS1 vérifié, avec son code produit : la version
// française de Final Fantasy VII (SCES-00868), l'allemande (SCES-00869)…, et
// les rééditions qui ont leur propre code (The Best, PSone Books…).
// Pour chaque disque (disque 1, hors démos), on cherche le jeu de notre base au
// même titre (un seul jeu possible), puis :
//   - son code est déjà dans la base : rien à faire ;
//   - une version du même jeu, même zone, sans code produit, peut le recevoir ;
//   - sinon, c'est une version manquante : nationale PAL, réédition, ou autre.
// Rien n'est écrit dans la base.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-versions-redump.mjs
// =====================================================================

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, loadPs1Releases, normalize, parseName, publicApi, readEnv } from './lib/redump.mjs';

const DAT_URL = 'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation.dat';
const CODE = /^[A-Z]{4}-\d{5}$/;

console.log('Lecture des versions PS1 de la base…');
const api = publicApi(readEnv());
const { releases, keysOfGame } = await loadPs1Releases(api, 'product_code,edition_name,reissue_of');
const gamesByKey = new Map(); // titre normalisé → jeux
for (const [gameId, keys] of keysOfGame) {
  for (const k of keys) gamesByKey.set(k, new Set([...(gamesByKey.get(k) ?? []), gameId]));
}
const releasesByGame = new Map();
for (const r of releases) releasesByGame.set(r.game_id, [...(releasesByGame.get(r.game_id) ?? []), r]);
const titleOf = new Map(releases.map((r) => [r.game_id, r.game.title]));
console.log(`  ${releases.length} versions, ${keysOfGame.size} jeux`);

console.log('Lecture du fichier Redump…');
const res = await fetch(DAT_URL, { headers: { 'User-Agent': USER_AGENT } });
if (!res.ok) throw new Error(`Fichier Redump : ${res.status}`);
const dat = await res.text();
const discs = [];
for (const block of dat.split(/\ngame \(/).slice(1)) {
  const name = /name "([^"]+)"/.exec(block)?.[1];
  const serials = [...block.matchAll(/serial "([^"]+)"/g)].flatMap((m) => m[1].split(/,\s*/)).map((s) => s.trim().toUpperCase());
  const serial = serials.find((s) => CODE.test(s));
  if (!name || !serial) continue;
  const info = parseName(name);
  if (!info || info.disc > 1) continue;
  discs.push({ ...info, serial });
}
console.log(`  ${discs.length} disques utilisables (disque 1, démos écartées)`);

// ---------------------------------------------------------------------
// Rattachement et classement
// ---------------------------------------------------------------------
const seen = new Set(); // jeu + code : un même code n'est compté qu'une fois
const result = { existing: [], fillCode: [], national: [], reissue: [], other: [], ambiguous: 0, unknown: 0 };
for (const d of discs) {
  let games = gamesByKey.get(d.key);
  if (!games) games = d.aliases.map((a) => gamesByKey.get(a)).find((s) => s?.size === 1);
  if (!games) { result.unknown++; continue; }
  if (games.size > 1) { result.ambiguous++; continue; }
  const gameId = [...games][0];
  const k = `${gameId}:${d.serial}`;
  if (seen.has(k)) continue;
  seen.add(k);
  const own = releasesByGame.get(gameId) ?? [];
  const zone = d.zones.has('PAL') ? 'PAL' : d.zones.has('NTSC-U') ? 'NTSC-U' : 'NTSC-J';
  const row = { gameId, title: titleOf.get(gameId), disc: d.name, serial: d.serial, zone, places: d.places.join(', '), special: d.special, d, viaAlias: !gamesByKey.has(d.key) };
  if (own.some((r) => r.product_code === d.serial)) { result.existing.push(row); continue; }
  const empty = own.filter((r) => r.zone === zone && !r.product_code && (d.special ? r.edition_type !== 'standard' : r.edition_type === 'standard'));
  if (empty.length === 1) { result.fillCode.push({ ...row, release: empty[0].local_title }); continue; }
  if (d.special) result.reissue.push(row);
  else if (zone === 'PAL' && d.places[0] !== 'Europe') result.national.push(row);
  else result.other.push(row);
}

const games = (list) => new Set(list.map((r) => r.gameId)).size;
console.log(`
Bilan (disques rattachés à un seul jeu de la base)
  Code déjà dans la base                     ${result.existing.length}
  Code qui complète une version sans code    ${result.fillCode.length}  (${games(result.fillCode)} jeux)
  Versions manquantes :
    nationales PAL (France, Allemagne…)      ${result.national.length}  (${games(result.national)} jeux)
    rééditions (The Best, PSone Books…)      ${result.reissue.length}  (${games(result.reissue)} jeux)
    autres (USA, Japon, Europe, révisions)   ${result.other.length}  (${games(result.other)} jeux)
  Non rattachés : titre absent de la base ${result.unknown}, titre partagé par plusieurs jeux ${result.ambiguous}
`);

const show = (title, list, n = 12) => {
  console.log(title);
  for (const r of list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n)) {
    console.log(`  ${r.title.slice(0, 34).padEnd(34)} ${r.serial}  ${r.disc.slice(0, 70)}${r.release ? `  → « ${r.release} »` : ''}`);
  }
};
console.log('Final Fantasy VII :');
for (const list of [result.existing, result.fillCode, result.national, result.reissue, result.other]) {
  for (const r of list.filter((x) => x.title === 'Final Fantasy VII')) console.log(`  ${r.serial}  ${r.disc}`);
}
console.log();
show('Nationales PAL (échantillon) :', result.national);
show('\nRééditions (échantillon) :', result.reissue);
show('\nAutres (échantillon) :', result.other);
show('\nCode pour une version existante (échantillon) :', result.fillCode);

mkdirSync(join(ROOT, '.redump-import'), { recursive: true });
writeFileSync(join(ROOT, '.redump-import', 'versions.json'), JSON.stringify(result, null, 1));


// ---------------------------------------------------------------------
// Écriture de la migration : versions nationales PAL et rééditions
// (node scripts/import-versions-redump.mjs --ecrire)
// ---------------------------------------------------------------------
if (!process.argv.includes('--ecrire')) {
  console.log('\nPour écrire la migration (nationales PAL et rééditions) : node scripts/import-versions-redump.mjs --ecrire');
  process.exit(0);
}

const COUNTRY = {
  France: 'FR', Germany: 'DE', Spain: 'ES', Italy: 'IT', UK: 'GB', Australia: 'AU', Netherlands: 'NL', Sweden: 'SE',
  Portugal: 'PT', Greece: 'GR', Denmark: 'DK', Finland: 'FI', Norway: 'NO', Belgium: 'BE', Switzerland: 'CH',
  Austria: 'AT', Poland: 'PL', Russia: 'RU', Japan: 'JP', USA: 'US', Korea: 'KR',
};
const EDITION_TAG = /the best|psone books|major wave|rerelease|best choice|culture publishers|fukkokuban|reprint|greatest hits|platinum|genteiban|limited|premium|deluxe|controller set|special edition|tokubetsuban|value|nice price|collector/i;
const COLLECTOR_TAG = /genteiban|limited|premium|deluxe|controller set|special edition|tokubetsuban|collector/i;

// Titre affiché : « Colony Wars - Vengeance » → « Colony Wars: Vengeance », « Legend of Dragoon, The » → « The Legend of Dragoon »
function displayTitle(name) {
  let base = name.replace(/\s*\(.*$/, '').replace(/_/g, ' ').trim();
  const article = /^(.*), (The|A|An|Les|Le|La|Die|Der|Das|El|Los|Il)$/.exec(base);
  if (article) base = `${article[2]} ${article[1]}`;
  return base.replace(/ - /g, ': ');
}
// Nombre de disques : « Final Fantasy VII (France) (Disc 3) » → 3
const discCount = new Map();
for (const m of dat.matchAll(/name "([^"]+) \(Disc (\d+)\)[^"]*"/g)) discCount.set(m[1], Math.max(discCount.get(m[1]) ?? 1, Number(m[2])));
const mediaOf = (d) => discCount.get(d.name.replace(/ \(Disc \d+\).*$/, '')) ?? null;

const updates = []; // version existante qui reçoit son vrai code
const inserts = []; // nouvelle version
for (const row of [...result.national, ...result.reissue]) {
  const { d } = row;
  const own = releasesByGame.get(row.gameId) ?? [];
  const codes = own.map((r) => r.product_code).filter(Boolean);
  const shared = (code) => code && codes.filter((c) => c === code).length > 1;
  const country = COUNTRY[d.places[0]] ?? null;
  const tag = [...d.name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).find((t) => EDITION_TAG.test(t)) ?? null;
  const editionType = !d.special ? 'standard' : COLLECTOR_TAG.test(tag ?? '') ? 'collector' : 'reissue';

  // Version déjà là : nationale du même pays, ou réédition de même nom, sans code ou avec un code copié
  const twin = own.find((r) => r.zone === row.zone && (d.special
    ? r.edition_type !== 'standard' && normalize(r.edition_name ?? '') === normalize(tag ?? '')
    : r.edition_type === 'standard' && country && r.release_region.some((rr) => rr.region.code === country)));
  if (twin) {
    if (!twin.product_code || shared(twin.product_code)) updates.push({ id: twin.id, localTitle: twin.local_title, oldCode: twin.product_code, code: row.serial });
    continue;
  }
  const standard = own.filter((r) => r.zone === row.zone && r.edition_type === 'standard');
  inserts.push({
    gameId: row.gameId, gameTitle: row.title, localTitle: displayTitle(d.name), zone: row.zone, editionType,
    editionName: d.special ? tag : null, code: row.serial, languages: d.languages.filter((l) => /^[a-z]{2}$/.test(l)),
    media: mediaOf(d), country, reissueOf: d.special && standard.length === 1 ? standard[0].id : null,
  });
}
// Mode --zones : seulement les versions d'une zone où le jeu n'a encore AUCUNE version
// (« NASCAR 98 » sans version européenne), titre exact (pas de variante), hors éditions
// spéciales. Les autres « même zone, autre code » (révisions « Rev 1 », rééditions
// japonaises non marquées SLPS-91xxx, correspondances douteuses) restent à relire.
const zonesMode = process.argv.includes('--zones');
if (zonesMode) {
  updates.length = 0;
  inserts.length = 0;
  for (const row of result.other) {
    const { d } = row;
    if (row.viaAlias || d.special) continue;
    if ((releasesByGame.get(row.gameId) ?? []).some((r) => r.zone === row.zone)) continue;
    inserts.push({
      gameId: row.gameId, gameTitle: row.title, localTitle: displayTitle(d.name), zone: row.zone, editionType: 'standard',
      editionName: null, code: row.serial, languages: d.languages.filter((l) => /^[a-z]{2}$/.test(l)),
      media: mediaOf(d), country: COUNTRY[d.places[0]] ?? null, reissueOf: null,
    });
  }
}
console.log(`\nÀ écrire : ${updates.length} codes corrigés ou complétés, ${inserts.length} nouvelles versions`);

const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);
const arr = (a) => `'{${a.join(',')}}'`;
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const latest = readdirSync(join(ROOT, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).sort().at(-1);
const now = new Date();
const clock = now.toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = clock > latest ? clock : String(BigInt(latest) + 100n);
const updateValues = updates.map((u) => `(${u.id}, ${lit(u.localTitle)}, ${lit(u.oldCode)}, ${lit(u.code)})`);
const insertValues = inserts.map((n) => `(${n.gameId}, ${lit(n.gameTitle)}, ${lit(n.localTitle)}, ${lit(n.zone)}, ${lit(n.editionType)}, ${lit(n.editionName)}, ${lit(n.code)}, ${arr(n.languages)}, ${n.media ?? 'null'}, ${lit(n.country)}, ${n.reissueOf ?? 'null'})`);
const fileName = `${stamp}_import_versions_redump${zonesMode ? '_zones' : ''}.sql`;
writeFileSync(join(ROOT, 'supabase', 'migrations', fileName), [
  '-- =====================================================================',
  zonesMode
    ? '-- Carte Mémoire · Versions d\'une zone où le jeu n\'en avait aucune, depuis Redump'
    : '-- Carte Mémoire · Versions nationales PAL et rééditions depuis Redump',
  `-- Fichier GÉNÉRÉ par scripts/import-versions-redump.mjs${zonesMode ? ' --zones' : ''} le ${now.toISOString().slice(0, 10)}.`,
  '-- Source : Redump (http://redump.org), via libretro-database.',
  '--',
  ...(zonesMode ? [
    `-- ${inserts.length} versions créées (« NASCAR 98 » en Europe, « Zoop » au Japon…) : titre exact,`,
    '-- zone absente du jeu jusqu\'ici, édition standard.',
  ] : [
    `-- ${updates.length} versions existantes reçoivent leur vrai code (une version nationale`,
    '-- déjà présente, comme « Les Chevaliers de Baphomet », portait le code européen),',
    `-- ${inserts.length} versions sont créées (France, Allemagne… ; The Best, PSone Books…).`,
  ]),
  '-- Garde-fous : titre de la version ou du jeu identique, code jamais en double',
  '-- dans un même jeu, réédition rattachée seulement à une version du même jeu.',
  '-- =====================================================================',
  '',
  'create temporary table redump_update (release_id bigint, local_title text, old_code text, product_code text);',
  ...chunk(updateValues, 500).map((part) => `insert into redump_update values\n  ${part.join(',\n  ')};`),
  '',
  'update public.release r',
  'set product_code = u.product_code',
  'from redump_update u',
  'where r.id = u.release_id and r.local_title = u.local_title',
  '  and r.product_code is not distinct from u.old_code',
  '  and not exists (select 1 from public.release o where o.game_id = r.game_id and o.product_code = u.product_code);',
  '',
  'create temporary table redump_new (',
  '  game_id bigint, game_title text, local_title text, zone public.video_zone, edition_type public.edition_type,',
  '  edition_name text, product_code text, languages text[], media_count smallint, country text, reissue_of bigint',
  ');',
  ...chunk(insertValues, 400).map((part) => `insert into redump_new values\n  ${part.join(',\n  ')};`),
  '',
  '-- Le jeu : par son titre s\'il est unique dans la base, sinon par identifiant ET titre',
  'create temporary table redump_game as',
  'select distinct n.game_id as listed_id, g.id',
  'from redump_new n',
  'join public.game g on g.title = n.game_title',
  'where g.id = n.game_id or (select count(*) from public.game g2 where g2.title = n.game_title) = 1;',
  '',
  'with created as (',
  '  insert into public.release (game_id, platform_id, reissue_of, local_title, product_code, zone, edition_type, edition_name, media_count, languages)',
  '  select m.id, p.id,',
  '         (select r.id from public.release r where r.id = n.reissue_of and r.game_id = m.id),',
  '         n.local_title, n.product_code, n.zone, n.edition_type, n.edition_name, coalesce(n.media_count, 1), n.languages',
  '  from redump_new n',
  '  join redump_game m on m.listed_id = n.game_id',
  "  cross join (select id from public.platform where short_name = 'PS1') p",
  '  where not exists (select 1 from public.release r where r.game_id = m.id and r.product_code = n.product_code)',
  '  returning id, game_id, product_code',
  ')',
  'insert into public.release_region (release_id, region_id)',
  'select c.id, rg.id',
  'from created c',
  'join redump_game m on m.id = c.game_id',
  'join redump_new n on n.game_id = m.listed_id and n.product_code = c.product_code',
  'join public.region rg on rg.code = n.country;',
  '',
  'drop table redump_game;',
  'drop table redump_new;',
  'drop table redump_update;',
  '',
].join('\n'));
console.log(`Migration écrite : supabase/migrations/${fileName}`);
