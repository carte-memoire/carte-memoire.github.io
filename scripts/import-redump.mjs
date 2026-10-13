// =====================================================================
// Carte Mémoire · Versions d'une console depuis Redump, en un seul passage
//
// Redump recense chaque disque vérifié, avec le code imprimé dessus. Source :
// « Sony - PlayStation 2.dat » de libretro-database, tiré de Redump.
// Pour la PS1, le même travail a été fait en deux scripts (import-product-codes.mjs
// puis import-versions-redump.mjs) ; celui-ci fait tout d'un coup, pour une seule
// migration à envoyer.
//
// Pour chaque disque (disque 1 ou disque unique, hors démos et prototypes), on
// cherche le jeu de la base au même titre (un seul jeu possible), puis :
//   - version de la base sans code, dans la même zone (et le même pays pour une
//     version nationale) : elle reçoit le code, les langues, le nombre de disques ;
//   - version nationale absente (France, Allemagne, Corée…) : créée ;
//   - réédition (Platinum, Greatest Hits, PlayStation 2 the Best…) : créée,
//     rattachée à la version d'origine (même code sans suffixe) ;
//   - zone où le jeu n'a encore aucune version : créée (ou la version « à
//     compléter » du jeu la reçoit) ;
//   - autre code dans une zone déjà servie (révision, retirage, variante de
//     langues) : laissé de côté, listé dans .redump-import/ pour relecture.
//
// Codes PS2 : le suffixe imprimé distingue les rééditions. « SCES-50490/P » (ou
// -P) = Platinum, « SLUS-20312GH » = Greatest Hits. Les suffixes de pays
// (/ANZ, /GER, /UK : même disque, boîte imprimée ailleurs) et de disque (-0, -1)
// ne créent pas de version à part.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-redump.mjs --console PS2            → analyse seule
//   node scripts/import-redump.mjs --console PS2 --ecrire   → écrit la migration
// =====================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { consoleFromArgs, nextMigrationStamp, redumpDatUrl } from './lib/consoles.mjs';
import { ROOT, USER_AGENT, loadReleases, normalize, parseName, publicApi, readEnv } from './lib/redump.mjs';

const CONSOLE = consoleFromArgs();
const write = process.argv.includes('--ecrire');

// Pays « principal » de chaque zone : son disque est la version de base de la zone
const BASE_PLACE = { PAL: 'Europe', 'NTSC-U': 'USA', 'NTSC-J': 'Japan' };
const BASE_REGION = { PAL: 'europe', 'NTSC-U': 'north-america', 'NTSC-J': 'JP' };
// Pays d'une version de base (une version « Japon » est la version de base NTSC-J)
const BASE_COUNTRIES = { PAL: [], 'NTSC-U': ['US', 'CA'], 'NTSC-J': ['JP'] };
// Pays de Redump → nos codes de région (une région absente de la base est ignorée à l'envoi)
const COUNTRY = {
  France: 'FR', Germany: 'DE', Spain: 'ES', Italy: 'IT', UK: 'GB', Australia: 'AU', Netherlands: 'NL', Sweden: 'SE',
  Portugal: 'PT', Greece: 'GR', Denmark: 'DK', Finland: 'FI', Norway: 'NO', Belgium: 'BE', Switzerland: 'CH',
  Austria: 'AT', Poland: 'PL', Russia: 'RU', Ireland: 'IE', 'New Zealand': 'NZ', 'South Africa': 'ZA',
  Canada: 'CA', Brazil: 'BR', Mexico: 'MX', Argentina: 'AR',
  Korea: 'KR', China: 'CN', Taiwan: 'TW', 'Hong Kong': 'HK', Singapore: 'SG', Asia: 'asia',
};
const EDITION_TAG = /the best|psone books|major wave|rerelease|best choice|culture publishers|fukkokuban|reprint|greatest hits|platinum|genteiban|limited|premium|deluxe|controller set|special edition|tokubetsuban|value|nice price|collector/i;
const COLLECTOR_TAG = /genteiban|limited|premium|deluxe|controller set|special edition|tokubetsuban|collector/i;

// Préfixes des disques qui ne sont pas des jeux vendus : démos et disques promotionnels
// (SCED, SLED, PAPX, PCPX), disques fournis avec la console ou utilitaires (PBPX, SCPN…)
const NOT_RETAIL = /^(SCED|SLED|PAPX|PCPX|PBPX|SCPN|SCPM|LDTL|PSXC|PUPX|PDPX|PTRM|PEPX)$/;

// Code imprimé → code de base et réédition éventuelle (Platinum, Greatest Hits)
function readSerial(serial, zone) {
  const m = /^([A-Z]{4})-+(\d{5})(.*)$/.exec(serial.trim().toUpperCase());
  if (!m || NOT_RETAIL.test(m[1])) return null;
  const base = `${m[1]}-${m[2]}`;
  const suffix = m[3];
  if (zone === 'PAL' && /(^|[^A-Z])P([^A-Z0-9]|$)/.test(suffix)) return { base, code: `${base}/P`, edition: 'Platinum' };
  if (zone === 'NTSC-U' && /GH/.test(suffix)) return { base, code: `${base}GH`, edition: 'Greatest Hits' };
  return { base, code: base, edition: null };
}

// Titre affiché : « Colony Wars - Vengeance » → « Colony Wars: Vengeance », « Getaway, The » → « The Getaway »
function displayTitle(name) {
  let base = name.replace(/\s*\(.*$/, '').replace(/_/g, ' ').trim();
  const article = /^(.*), (The|A|An|Les|Le|La|Die|Der|Das|El|Los|Il)$/.exec(base);
  if (article) base = `${article[2]} ${article[1]}`;
  return base.replace(/ - /g, ': ');
}


// ---------------------------------------------------------------------
// 1. Les versions de la console dans la base
// ---------------------------------------------------------------------
console.log(`Lecture des versions ${CONSOLE.code} de la base…`);
const api = publicApi(readEnv());
const { releases, keysOfGame } = await loadReleases(api, 'product_code,edition_name,reissue_of,languages,media_count', CONSOLE.code);
const gamesByKey = new Map(); // titre normalisé → jeux
for (const [gameId, keys] of keysOfGame) {
  for (const k of keys) gamesByKey.set(k, new Set([...(gamesByKey.get(k) ?? []), gameId]));
}
const titleOf = new Map(releases.map((r) => [r.game_id, r.game.title]));
// Copie de travail : les versions complétées ou créées ici comptent pour les disques suivants
const relsOf = new Map();
for (const r of releases) {
  const rel = {
    id: r.id, zone: r.zone, edition: r.edition_type, editionName: r.edition_name, code: r.product_code, title: r.local_title,
    languages: r.languages, media: r.media_count, countries: new Set(r.release_region.map((rr) => rr.region.code).filter((c) => /^[A-Z]{2}$/.test(c))),
  };
  relsOf.set(r.game_id, [...(relsOf.get(r.game_id) ?? []), rel]);
}
console.log(`  ${releases.length} versions, ${keysOfGame.size} jeux`);


// ---------------------------------------------------------------------
// 2. Les disques recensés par Redump
// ---------------------------------------------------------------------
console.log('Lecture du fichier Redump…');
const res = await fetch(redumpDatUrl(CONSOLE), { headers: { 'User-Agent': USER_AGENT } });
if (!res.ok) throw new Error(`Fichier Redump : ${res.status}`);
const dat = await res.text();
const datVersion = /version "([^"]+)"/.exec(dat)?.[1] ?? 'inconnue';
// Nombre de disques : « Final Fantasy XII (Japan) (Disc 2) » → au moins 2
const discCount = new Map();
for (const m of dat.matchAll(/name "([^"]+) \(Disc (\d+)\)[^"]*"/g)) discCount.set(m[1], Math.max(discCount.get(m[1]) ?? 1, Number(m[2])));
const mediaOf = (name) => discCount.get(name.replace(/ \(Disc \d+\).*$/, '')) ?? null;

const entries = new Map(); // nom + code imprimé → disque
for (const block of dat.split(/\ngame \(/).slice(1)) {
  const name = /name "([^"]+)"/.exec(block)?.[1];
  const info = name && parseName(name);
  if (!info || info.disc > 1) continue; // disque 1 ou disque unique : notre convention
  const zone = info.zones.has('PAL') ? 'PAL' : info.zones.has('NTSC-U') ? 'NTSC-U' : 'NTSC-J';
  const serials = new Set([...block.matchAll(/serial "([^"]+)"/g)].flatMap((m) => m[1].split(/,\s*/)));
  for (const s of serials) {
    const serial = readSerial(s, zone);
    if (!serial) continue;
    const key = `${name}|${serial.code}`;
    if (entries.has(key)) continue;
    // Réédition : par le suffixe du code, sinon par la mention dans le nom (« PlayStation 2 the Best »)
    const tag = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).find((t) => EDITION_TAG.test(t)) ?? null;
    const editionName = serial.edition ?? (info.special ? tag : null);
    const editionType = !editionName ? 'standard' : !serial.edition && COLLECTOR_TAG.test(tag ?? '') ? 'collector' : 'reissue';
    entries.set(key, {
      ...info, zone, code: serial.code, base: serial.base, editionName, editionType,
      languages: info.languages.filter((l) => /^[a-z]{2}$/.test(l)), media: mediaOf(name),
      isBase: info.places[0] === BASE_PLACE[zone], country: COUNTRY[info.places[0]] ?? null,
    });
  }
}
console.log(`  version ${datVersion} · ${entries.size} disques utilisables (démos et prototypes écartés)`);


// ---------------------------------------------------------------------
// 3. Rattachement des disques aux jeux
// ---------------------------------------------------------------------
const byGame = new Map();
let unknown = 0, ambiguous = 0;
for (const e of entries.values()) {
  let games = gamesByKey.get(e.key);
  const viaAlias = !games;
  // Variante de titre (« WRC - World Rally Championship » → « World Rally Championship »), sauf
  // si la partie laissée de côté est un titre daté : « PES 2010 - Pro Evolution Soccer » n'est
  // pas le « Pro Evolution Soccer » de 2001
  if (!games) games = e.aliases.map((a, i) => (i === 1 && /(19|20)\d\d/.test(e.aliases[0]) ? null : gamesByKey.get(a))).find((s) => s?.size === 1);
  if (!games) { unknown++; continue; }
  if (games.size > 1) { ambiguous++; continue; }
  const gameId = [...games][0];
  byGame.set(gameId, [...(byGame.get(gameId) ?? []), { ...e, viaAlias }]);
}

// Ordre de traitement d'un jeu : éditions standard d'abord, la version de base de chaque
// zone avant les versions nationales, la plus multilingue d'abord, sans révision
const order = (a, b) => Number(a.editionType !== 'standard') - Number(b.editionType !== 'standard')
  || Number(b.isBase) - Number(a.isBase)
  || b.languages.length - a.languages.length
  || Number(a.rev) - Number(b.rev)
  || a.places.length - b.places.length
  || a.code.localeCompare(b.code);

const fills = new Map(); // id de version → ce qu'elle reçoit
const created = [];
const skipped = [];
const stats = { existing: 0, fillBase: 0, fillNational: 0, fillPlaceholder: 0, national: 0, reissue: 0, zone: 0, other: 0, alias: 0 };

function fill(rel, e, extra = {}) {
  const f = fills.get(rel.id) ?? { id: rel.id, title: rel.title, source: e.name, viaAlias: e.viaAlias };
  if (!rel.code) { f.code = e.code; rel.code = e.code; }
  if (!rel.languages?.length && e.languages.length) { f.languages = e.languages; rel.languages = e.languages; }
  if (e.media && e.media > 1 && (rel.media ?? 1) <= 1) { f.media = e.media; rel.media = e.media; }
  if (extra.zone) { f.zone = extra.zone; rel.zone = extra.zone; }
  if (extra.region) { f.region = extra.region; if (/^[A-Z]{2}$/.test(extra.region)) rel.countries.add(extra.region); }
  fills.set(rel.id, f);
}

function create(gameId, rels, e, region) {
  const rel = { id: null, zone: e.zone, edition: e.editionType, editionName: e.editionName, code: e.code, title: displayTitle(e.name), languages: e.languages, media: e.media, countries: new Set(/^[A-Z]{2}$/.test(region ?? '') ? [region] : []) };
  rels.push(rel);
  created.push({ gameId, gameTitle: titleOf.get(gameId), localTitle: rel.title, zone: e.zone, editionType: e.editionType, editionName: e.editionName, code: e.code, base: e.base, languages: e.languages, media: e.media, region, source: e.name });
}

for (const [gameId, list] of byGame) {
  const rels = relsOf.get(gameId) ?? [];
  const codes = new Set(rels.map((r) => r.code).filter(Boolean));
  list.sort(order);
  for (const e of list) {
    if (codes.has(e.code)) { stats.existing++; continue; }
    if (e.viaAlias) stats.alias++;
    const inZone = rels.filter((r) => r.zone === e.zone);
    const empty = inZone.filter((r) => r.edition === 'standard' && !r.code);
    // Version de base : sans pays (« Europe »), ou dans le pays principal de la zone
    // (une version « Japon, Corée » reste la version japonaise)
    const blank = (r) => r.countries.size === 0;
    const baseLike = (r) => blank(r) || BASE_COUNTRIES[e.zone].some((c) => r.countries.has(c));
    const placeholder = inZone.length === 0 ? rels.find((r) => r.zone === null && r.edition === 'standard' && !r.code) : null;

    if (e.editionType !== 'standard') {
      // Réédition : toujours une version à part (jamais par une variante de titre)
      if (e.viaAlias) { skipped.push({ why: 'réédition, titre approché', gameId, e }); continue; }
      create(gameId, rels, e, e.isBase ? null : e.country);
      stats.reissue++;
    } else if (e.isBase) {
      const target = empty.find(baseLike) ?? placeholder;
      if (target) {
        fill(target, e, target === placeholder ? { zone: e.zone, region: BASE_REGION[e.zone] } : {});
        stats[target === placeholder ? 'fillPlaceholder' : 'fillBase']++;
      } else if (inZone.length === 0 && !e.viaAlias) {
        create(gameId, rels, e, BASE_REGION[e.zone]);
        stats.zone++;
      } else {
        skipped.push({ why: 'autre code dans une zone déjà servie', gameId, e });
        stats.other++;
        continue;
      }
    } else {
      // Version nationale : celle du même pays (pas la version de base « Japon, Corée »),
      // sinon une version de la zone sans pays si le jeu n'a pas de disque « de base »
      // dans cette zone (sorti seulement en France…)
      const hasBaseDisc = list.some((x) => x.editionType === 'standard' && x.isBase && x.zone === e.zone);
      const target = (e.country && empty.find((r) => r.countries.has(e.country) && !baseLike(r)))
        || (!hasBaseDisc && (empty.find(blank) ?? placeholder));
      if (target) {
        fill(target, e, { ...(target === placeholder ? { zone: e.zone } : {}), region: e.country ?? (target === placeholder ? BASE_REGION[e.zone] : undefined) });
        stats[target === placeholder ? 'fillPlaceholder' : 'fillNational']++;
      } else if (!e.viaAlias) {
        create(gameId, rels, e, e.country);
        stats.national++;
      } else {
        skipped.push({ why: 'version nationale, titre approché', gameId, e });
        continue;
      }
    }
    codes.add(e.code);
  }
}

const filledCodes = [...fills.values()].filter((f) => f.code).length;
console.log(`
Bilan (${byGame.size} jeux de la base trouvés dans Redump)
  Disques déjà dans la base (même code)          ${stats.existing}
  Versions complétées (code, langues, disques)   ${fills.size}, dont ${filledCodes} reçoivent leur code
    version de base de la zone                   ${stats.fillBase}
    version nationale                            ${stats.fillNational}
    version « à compléter » qui reçoit sa zone   ${stats.fillPlaceholder}
  Versions créées                                ${created.length}
    nationales (France, Allemagne, Corée…)       ${stats.national}
    rééditions                                   ${stats.reissue}  ${JSON.stringify(Object.fromEntries([...new Set(created.filter((c) => c.editionName).map((c) => c.editionName))].map((n) => [n, created.filter((c) => c.editionName === n).length]).sort((a, b) => b[1] - a[1]).slice(0, 8)))}
    zone où le jeu n'avait aucune version        ${stats.zone}
  Laissés de côté (autre code, zone déjà servie) ${stats.other}  · par variante de titre ${skipped.length - stats.other}
  Non rattachés : titre absent de la base ${unknown}, titre partagé par plusieurs jeux ${ambiguous}
`);
const show = (title) => {
  const id = [...titleOf].find(([, t]) => t === title)?.[0];
  if (!id) return;
  console.log(`${title} :`);
  for (const r of relsOf.get(id) ?? []) console.log(`  ${(r.zone ?? '?').padEnd(7)} ${(r.editionName ?? r.edition).padEnd(24)} ${(r.code ?? '—').padEnd(14)} ${[...r.countries].join(',').padEnd(6)} ${r.languages?.join(',') ?? ''}${r.id ? '' : '  (nouvelle)'}`);
};
for (const t of ['Final Fantasy X', 'Gran Turismo 4', 'Shadow of the Colossus', '007: NightFire', 'Metal Gear Solid 3: Subsistence']) show(t);

mkdirSync(join(ROOT, '.redump-import'), { recursive: true });
writeFileSync(join(ROOT, '.redump-import', `${CONSOLE.slug}-par-variante.json`), JSON.stringify([...fills.values()].filter((f) => f.viaAlias), null, 1));
writeFileSync(join(ROOT, '.redump-import', `${CONSOLE.slug}-a-relire.json`), JSON.stringify(skipped.map(({ why, gameId, e }) => ({ why, game: titleOf.get(gameId), gameId, code: e.code, disc: e.name })), null, 1));
console.log(`\nLaissés de côté : .redump-import/${CONSOLE.slug}-a-relire.json`);

if (!write) {
  console.log(`Pour écrire la migration : node scripts/import-redump.mjs --console ${CONSOLE.code} --ecrire`);
  process.exit(0);
}


// ---------------------------------------------------------------------
// 4. Migration SQL
// ---------------------------------------------------------------------
const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);
const arr = (a) => (a ? `'{${a.join(',')}}'` : 'null');
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const now = new Date();
const stamp = nextMigrationStamp(ROOT);
const fileName = `${stamp}_import_redump_${CONSOLE.slug}.sql`;
const fillRows = [...fills.values()].map((f) => `(${f.id}, ${lit(f.title)}, ${lit(f.code)}, ${arr(f.languages)}, ${f.media ?? 'null'}, ${lit(f.zone)}, ${lit(f.region)})`);
const newRows = (standard) => created.filter((n) => (n.editionType === 'standard') === standard).map((n) => `(${n.gameId}, ${lit(n.gameTitle)}, ${lit(n.localTitle)}, ${lit(n.zone)}, ${lit(n.editionType)}, ${lit(n.editionName)}, ${lit(n.code)}, ${lit(n.base)}, ${arr(n.languages)}, ${n.media ?? 'null'}, ${lit(n.region)})`);
const insertNew = (table, rows) => chunk(rows, 400).map((part) => `insert into ${table} values\n  ${part.join(',\n  ')};`);

writeFileSync(join(ROOT, 'supabase', 'migrations', fileName), [
  '-- =====================================================================',
  `-- Carte Mémoire · Versions ${CONSOLE.code} depuis Redump : codes, langues, disques,`,
  '-- versions nationales et rééditions (Platinum, Greatest Hits, the Best…)',
  `-- Fichier GÉNÉRÉ par scripts/import-redump.mjs --console ${CONSOLE.code} le ${now.toISOString().slice(0, 10)}.`,
  `-- Source : Redump (http://redump.org), via libretro-database, fichier daté du ${datVersion}.`,
  '--',
  `-- ${fills.size} versions existantes complétées (${filledCodes} codes), ${created.length} versions créées.`,
  '-- Garde-fous : rien de ce qui est renseigné n\'est écrasé ; chaque version complétée',
  '-- vérifie aussi son titre ; un code n\'est jamais en double dans un jeu ; une version',
  '-- n\'est créée que pour un jeu de la console au titre unique (ou au bon identifiant).',
  '-- =====================================================================',
  '',
  '-- 1. Versions existantes',
  'create temporary table redump_fill (',
  '  release_id bigint primary key, local_title text not null, product_code text, languages text[],',
  '  media_count smallint, zone public.video_zone, region text',
  ');',
  ...chunk(fillRows, 500).map((part) => `insert into redump_fill values\n  ${part.join(',\n  ')};`),
  '',
  'create temporary table redump_target as',
  'select f.*, r.game_id',
  'from redump_fill f',
  'join public.release r on r.id = f.release_id and r.local_title = f.local_title',
  `join public.platform p on p.id = r.platform_id and p.short_name = '${CONSOLE.code}';`,
  '',
  'update public.release r set product_code = t.product_code',
  'from redump_target t',
  'where r.id = t.release_id and r.product_code is null and t.product_code is not null',
  '  and not exists (select 1 from public.release o where o.game_id = r.game_id and o.product_code = t.product_code);',
  '',
  'update public.release r set languages = t.languages',
  'from redump_target t',
  "where r.id = t.release_id and r.languages = '{}' and t.languages is not null;",
  '',
  'update public.release r set media_count = t.media_count',
  'from redump_target t',
  'where r.id = t.release_id and t.media_count is not null and coalesce(r.media_count, 1) = 1;',
  '',
  '-- Version « à compléter » : elle reçoit sa zone',
  'update public.release r set zone = t.zone',
  'from redump_target t',
  'where r.id = t.release_id and r.zone is null and t.zone is not null;',
  '',
  'insert into public.release_region (release_id, region_id)',
  'select t.release_id, rg.id',
  'from redump_target t',
  'join public.region rg on rg.code = t.region',
  'on conflict do nothing;',
  '',
  '-- 2. Nouvelles versions (standard, puis rééditions : elles retrouvent ainsi leur',
  '--    version d\'origine par son code, même créée juste avant)',
  'create temporary table redump_new (',
  '  game_id bigint, game_title text, local_title text, zone public.video_zone, edition_type public.edition_type,',
  '  edition_name text, product_code text, base_code text, languages text[], media_count smallint, region text',
  ');',
  ...insertNew('redump_new', newRows(true)),
  ...insertNew('redump_new', newRows(false)),
  '',
  '-- Le jeu : par son titre s\'il est unique parmi les jeux de la console, sinon par identifiant ET titre',
  'create temporary table redump_game as',
  'select distinct n.game_id as listed_id, g.id',
  'from redump_new n',
  'join public.game g on g.title = n.game_title',
  `join public.platform p on p.short_name = '${CONSOLE.code}'`,
  'where exists (select 1 from public.release r where r.game_id = g.id and r.platform_id = p.id)',
  '  and (g.id = n.game_id or (select count(*) from public.game g2 where g2.title = n.game_title',
  '       and exists (select 1 from public.release r2 where r2.game_id = g2.id and r2.platform_id = p.id)) = 1);',
  '',
  ...[true, false].flatMap((standard) => [
    `with created as (`,
    '  insert into public.release (game_id, platform_id, reissue_of, local_title, product_code, zone, edition_type, edition_name, media_count, languages)',
    '  select m.id, p.id,',
    standard ? '         null,' : '         (select r.id from public.release r where r.game_id = m.id and r.platform_id = p.id and r.product_code = n.base_code and r.edition_type = \'standard\' order by r.id limit 1),',
    '         n.local_title, n.product_code, n.zone, n.edition_type, n.edition_name, coalesce(n.media_count, 1), n.languages',
    '  from redump_new n',
    '  join redump_game m on m.listed_id = n.game_id',
    `  cross join (select id from public.platform where short_name = '${CONSOLE.code}') p`,
    `  where n.edition_type ${standard ? '=' : '<>'} 'standard'`,
    '    and not exists (select 1 from public.release r where r.game_id = m.id and r.product_code = n.product_code)',
    '  returning id, game_id, product_code',
    ')',
    'insert into public.release_region (release_id, region_id)',
    'select c.id, rg.id',
    'from created c',
    'join redump_game m on m.id = c.game_id',
    'join redump_new n on n.game_id = m.listed_id and n.product_code = c.product_code',
    'join public.region rg on rg.code = n.region',
    'on conflict do nothing;',
    '',
  ]),
  'drop table redump_game;',
  'drop table redump_new;',
  'drop table redump_target;',
  'drop table redump_fill;',
  '',
].join('\n'));
console.log(`Migration écrite : supabase/migrations/${fileName}`);
