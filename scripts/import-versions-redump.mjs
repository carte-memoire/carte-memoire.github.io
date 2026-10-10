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

import { writeFileSync, mkdirSync } from 'node:fs';
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
  const row = { gameId, title: titleOf.get(gameId), disc: d.name, serial: d.serial, zone, places: d.places.join(', '), special: d.special };
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
