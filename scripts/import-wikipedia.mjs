// =====================================================================
// Carte Mémoire · Import des jeux d'une console depuis les listes de Wikipédia
//
// Source : « List of PlayStation (console) games » (A–L et M–Z), « List of
// PlayStation 2 games » (A–K et L–Z) sur Wikipédia en anglais, sous licence
// CC BY-SA 4.0 : il faut citer la source sur le site, et les données issues
// de cet import restent sous la même licence.
//
// Écrit une migration SQL dans supabase/migrations/ qui FUSIONNE avec
// l'existant : un jeu déjà présent (même identifiant Wikidata, ou même
// titre normalisé sur la même console) est complété, jamais dupliqué.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-wikipedia.mjs                  → jeux PS1, écrit la migration
//   node scripts/import-wikipedia.mjs --console PS2    → jeux PS2
//   node scripts/import-wikipedia.mjs --dry-run        → affiche seulement le bilan
// =====================================================================

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { consoleFromArgs, nextMigrationStamp } from './lib/consoles.mjs';
import { decodeEntities, stripRefsAndComments, stripTags } from './lib/text.mjs';

const USER_AGENT = 'carte-memoire-import/1.0 (projet personnel, import ponctuel)';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const CONSOLE = consoleFromArgs();
const PAGES = CONSOLE.wikipediaPages;
const dryRun = process.argv.includes('--dry-run');

// Mentions de région utilisées dans les listes (<sup>JP</sup>, <sup>PAL</sup>…)
// → [zone vidéo, code de région chez nous]
const TAGS = {
  JP: ['NTSC-J', 'JP'], JPN: ['NTSC-J', 'JP'], JA: ['NTSC-J', 'JP'],
  KO: ['NTSC-J', 'KR'], KR: ['NTSC-J', 'KR'], KOR: ['NTSC-J', 'KR'],
  AS: ['NTSC-J', 'asia'], ASIA: ['NTSC-J', 'asia'], SEA: ['NTSC-J', 'asia'],
  HK: ['NTSC-J', 'HK'], TW: ['NTSC-J', 'TW'], CN: ['NTSC-J', 'CN'], CH: ['PAL', 'CH'], SG: ['NTSC-J', 'SG'],
  NA: ['NTSC-U', 'north-america'], US: ['NTSC-U', 'US'], USA: ['NTSC-U', 'US'],
  CA: ['NTSC-U', 'CA'], CAN: ['NTSC-U', 'CA'], BR: ['NTSC-U', 'BR'],
  PAL: ['PAL', 'europe'], EU: ['PAL', 'europe'], EUR: ['PAL', 'europe'], EUROPE: ['PAL', 'europe'],
  SCAN: ['PAL', 'europe'], SCN: ['PAL', 'europe'], NORDIC: ['PAL', 'europe'],
  UK: ['PAL', 'GB'], GB: ['PAL', 'GB'], IE: ['PAL', 'IE'],
  FR: ['PAL', 'FR'], FRA: ['PAL', 'FR'], BE: ['PAL', 'BE'], LU: ['PAL', 'LU'],
  DE: ['PAL', 'DE'], GER: ['PAL', 'DE'], AT: ['PAL', 'AT'],
  IT: ['PAL', 'IT'], ITA: ['PAL', 'IT'], ES: ['PAL', 'ES'], SP: ['PAL', 'ES'], ESP: ['PAL', 'ES'],
  PT: ['PAL', 'PT'], NL: ['PAL', 'NL'], SE: ['PAL', 'SE'], SWE: ['PAL', 'SE'], NO: ['PAL', 'NO'],
  DK: ['PAL', 'DK'], FI: ['PAL', 'FI'], PL: ['PAL', 'PL'], GR: ['PAL', 'GR'],
  AU: ['PAL', 'AU'], AUS: ['PAL', 'AU'], NZ: ['PAL', 'NZ'], ZA: ['PAL', 'ZA'],
  // Pays sans région chez nous : la zone est retenue, la date ou le pays non
  IN: ['PAL', 'IN'], RU: ['PAL', 'RU'], SAR: ['PAL', 'SAR'],
  WW: [null, 'world'],
};
// Région « principale » de chaque zone : un titre ou une date pour cette
// région concerne la sortie de base, pas une version nationale.
const BASE_REGION = { 'NTSC-J': 'JP', 'NTSC-U': 'north-america', PAL: 'europe' };
// Colonnes de dates du tableau, dans l'ordre
const DATE_COLUMNS = ['NTSC-J', 'PAL', 'NTSC-U'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];


// ---------------------------------------------------------------------
// 1. Accès aux API (avec nouvel essai si le serveur est occupé)
// ---------------------------------------------------------------------
async function request(url, params, label) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams(params),
    });
    let problem;
    if (res.ok) {
      const text = await res.text();
      try { return JSON.parse(text); } catch { problem = 'réponse incomplète'; }
    } else if ([429, 500, 502, 503, 504].includes(res.status)) {
      problem = `serveur occupé (${res.status})`;
    } else {
      throw new Error(`Réponse ${res.status} pour « ${label} »`);
    }
    if (attempt >= 4) throw new Error(`${problem} pour « ${label} », abandon après ${attempt} essais`);
    const wait = Number(res.headers.get('retry-after')) || attempt * 10;
    console.log(`  ${label} : ${problem}, nouvel essai dans ${wait} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}


// ---------------------------------------------------------------------
// 2. Lecture du wikitexte
// ---------------------------------------------------------------------

// Découpe une chaîne sur un séparateur, sauf à l'intérieur de [[liens]],
// de {{modèles}} et de <sup>mentions</sup>.
function splitTopLevel(str, separators) {
  const parts = [];
  let depth = 0, inSup = false, current = '';
  for (let i = 0; i < str.length; i++) {
    const two = str.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; current += two; i++; continue; }
    if ((two === ']]' || two === '}}') && depth > 0) { depth--; current += two; i++; continue; }
    if (/^<sup\b/i.test(str.slice(i, i + 4))) inSup = true;
    if (/^<\/sup>/i.test(str.slice(i, i + 6))) inSup = false;
    const sep = depth === 0 && !inSup && separators.find((s) => str.startsWith(s, i));
    if (sep) { parts.push(current); current = ''; i += sep.length - 1; continue; }
    current += str[i];
  }
  parts.push(current);
  return parts;
}

// Retire les références et commentaires, et déplie les modèles qui contiennent du texte utile :
// {{sort|clé|texte}} → texte ; {{Not a typo|Med|iEvil}} → MediEvil
// Le modèle {{sup|JP, KO}} (listes PS2) vaut <sup>JP, KO</sup> (listes PS1).
const stripRefs = (s) => stripRefsAndComments(s
  .replace(/\{\{\s*sup\s*\|([^{}]*)\}\}/gi, '<sup>$1</sup>'))
  .replace(/\{\{\s*not a typo\s*\|([^{}]*)\}\}/gi, (_, p) => p.split('|').join(''))
  // {{ill|Phase Paradox|ja|フェイズパラドックス}} (article dans une autre langue) → Phase Paradox
  .replace(/\{\{\s*ill\s*\|([^|{}]*)[^{}]*\}\}/gi, '$1')
  .replace(/\{\{\s*sort\s*\|[^|{}]*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/gi, '$1');

// Wikitexte → texte lisible
function clean(s) {
  return decodeEntities(stripTags(stripRefs(s)
    .replace(/<sup>[\s\S]*?<\/sup>/gi, '')
    .replace(/\{\{\s*nihongo[^|}]*\|([^|}]*)[^}]*\}\}/gi, '$1')
    .replace(/\{\{\s*(?:lang|transl)\s*\|[^|}]*\|([^|}]*)[^}]*\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')))
    .replace(/^[\s•·*]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Première cible de lien [[Article|Texte]] (sans ancre #, sans fichier)
function linkTarget(s) {
  const m = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(stripRefs(s));
  if (!m || m[1].includes('#') || /^(file|image|category):/i.test(m[1])) return null;
  return m[1].trim().replace(/_/g, ' ');
}

// Mentions de région <sup>JP, PAL</sup> ou (JP) → liste de codes
function tagsOf(s) {
  const tags = [];
  for (const m of stripRefs(s).matchAll(/<sup>([\s\S]*?)<\/sup>/gi)) tags.push(...m[1].split(/[\s,/&+.]+/));
  const paren = /\(([A-Z]{2,4}(?:\s*[,/]\s*[A-Z]{2,4})*)\)\s*$/.exec(clean(s.replace(/<sup>[\s\S]*?<\/sup>/gi, '')));
  if (paren) tags.push(...paren[1].split(/[\s,/]+/));
  return tags.map((t) => clean(t).toUpperCase()).filter(Boolean);
}

// Normalisation proche de public.normalize_name (pour repérer les doublons dans l'import)
const normalize = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[\s\p{P}\p{S}]+/gu, '');

// Modèle {{dts|1997|01|31}} (ou variantes) → { date, precision }
function parseDts(params) {
  const tokens = params.split('|').map((t) => t.trim()).filter((t) => t && !t.includes('='));
  let year, month, day;
  for (const t of tokens.flatMap((t) => t.split(/[\s,/-]+/))) {
    const low = t.toLowerCase();
    const monthIndex = MONTHS.findIndex((m) => low.length >= 3 && m.startsWith(low));
    if (/^\d{4}$/.test(t) && !year) year = t;
    else if (monthIndex >= 0 && !month) month = monthIndex + 1;
    else if (/^\d{1,2}$/.test(t)) {
      const n = Number(t);
      if (!month && n >= 1 && n <= 12 && year) month = n;
      else if (!day && n >= 1 && n <= 31) day = n;
    }
  }
  if (!year) return null;
  const pad = (n) => String(n).padStart(2, '0');
  if (month && day) return { date: `${year}-${pad(month)}-${pad(day)}`, precision: 'day' };
  if (month) return { date: `${year}-${pad(month)}-01`, precision: 'month' };
  return { date: `${year}-01-01`, precision: 'year' };
}

const stats = {
  rows: 0, anomalies: [], unknownTags: new Map(), plainYears: 0, noDate: 0,
  multiUntaggedPublishers: 0, qidDuplicates: 0, notVideoGames: 0, companyLinksIgnored: new Set(),
};
const noteTag = (t, where) => stats.unknownTags.set(`${t} (${where})`, (stats.unknownTags.get(`${t} (${where})`) ?? 0) + 1);

// Cellule de dates → [{ zone, region, date, precision }]
function parseDates(cell, columnZone) {
  const fixed = stripRefs(cell).replace(/(^|[^{])\b(dts\|\d{4}(?:\|\d{1,2}){0,2})/gi, '$1{{$2}}');
  const out = [];
  for (const m of fixed.matchAll(/\{\{\s*dts\s*\|([^}]*)\}\}\s*(?:<sup>([\s\S]*?)<\/sup>)?/gi)) {
    const d = parseDts(m[1]);
    if (!d) continue;
    const tags = m[2] ? m[2].split(/[\s,/&+.]+/).map((t) => clean(t).toUpperCase()).filter(Boolean) : [];
    if (tags.length === 0) { out.push({ zone: columnZone, region: BASE_REGION[columnZone], ...d }); continue; }
    for (const t of tags) {
      if (!TAGS[t]) { noteTag(t, 'date'); continue; }
      const [zone, region] = TAGS[t];
      out.push({ zone: zone ?? columnZone, region, ...d });
    }
  }
  if (out.length === 0 && !/unreleased|cancel|n\/a/i.test(fixed)) {
    const y = /\b(19[89]\d|20[0-2]\d)\b/.exec(clean(fixed));
    if (y) { stats.plainYears++; out.push({ zone: columnZone, region: BASE_REGION[columnZone], date: `${y[1]}-01-01`, precision: 'year' }); }
  }
  return out;
}

// Listes PS2 : cellule « First released » (« 2005-11-23{{sup|JP}} », « 2003{{sup|EU, NA}} »)
// → la date de première sortie, dans chaque région citée. Sans région, elle ne sert
// qu'à la date de première sortie du jeu.
function parseFirstDate(cell) {
  const text = stripRefs(cell);
  const m = /(\d{4})(?:\s*[-–]\s*(\d{1,2}))?(?:\s*-\s*(\d{1,2}))?/.exec(text.replace(/<sup>[\s\S]*?<\/sup>/gi, ''));
  if (!m) return [];
  const pad = (n) => String(n).padStart(2, '0');
  const [, year, month, day] = m;
  const d = month && day ? { date: `${year}-${pad(month)}-${pad(day)}`, precision: 'day' }
    : month ? { date: `${year}-${pad(month)}-01`, precision: 'month' }
      : { date: `${year}-01-01`, precision: 'year' };
  const tags = tagsOf(text);
  if (tags.length === 0) return [{ zone: null, region: null, ...d }];
  const out = [];
  for (const t of tags) {
    if (!TAGS[t]) { noteTag(t, 'date'); continue; }
    const [zone, region] = TAGS[t];
    if (zone) out.push({ zone, region, ...d });
  }
  return out;
}

// Listes PS2 : colonnes JP, EU / PAL, NA, cochées {{Ya}} (avec parfois les pays : {{sup|JP, KO}})
// → la zone existe, dans ces pays (sinon sa région principale), date inconnue
const PRESENCE_COLUMNS = ['NTSC-J', 'PAL', 'NTSC-U'];
function parsePresence(cells) {
  const out = [];
  PRESENCE_COLUMNS.forEach((zone, i) => {
    const cell = stripRefs(cells[i] ?? '');
    if (!/\{\{\s*(ya|yes|y)\s*\}\}/i.test(cell)) return;
    const regions = tagsOf(cell).filter((t) => TAGS[t]?.[0] === zone).map((t) => TAGS[t][1]);
    for (const region of regions.length ? regions : [BASE_REGION[zone]]) out.push({ zone, region, date: null, precision: null });
  });
  return out;
}

// Cellule de sociétés → [{ name, article, tags }]
function parseCompanies(cell) {
  return splitTopLevel(stripRefs(cell).replace(/<br\s*\/?\s*>/gi, '\n'), [',', '\n', ';'])
    .map((part) => ({ name: clean(part).replace(/\s*\([A-Z]{2,4}(?:\s*[,/]\s*[A-Z]{2,4})*\)$/, ''), article: linkTarget(part), tags: tagsOf(part) }))
    .filter((c) => c.name && !/^(n\/a|unknown|—|-|\?)$/i.test(c.name));
}

function parseRow(cells, page) {
  // Cellule « id=… » ou « data-sort-value=… » qui ne contient qu'un attribut : on l'ignore
  cells = cells.filter((c) => !/^\s*([a-z-]+\s*=\s*"[^"]*"\s*)+$/i.test(c));
  // Retire les attributs en tête de cellule : style="…" | contenu
  cells = cells.map((c) => {
    const parts = splitTopLevel(c, ['|']);
    return parts.length > 1 && /^\s*(?:[a-z-]+\s*=\s*(?:"[^"]*"|[^\s"]+)(?:\s+|$))*$/i.test(parts[0]) ? parts.slice(1).join('|') : c;
  });
  if (cells.length < 6) { stats.anomalies.push(`${page} : ligne à ${cells.length} cellules : ${clean(cells[0] ?? '').slice(0, 60)}`); return null; }

  const [titleCell, devCell, pubCell, ...rest] = cells;
  // (<br /> parfois coupé en deux lignes dans le wikitexte : « <br /⏎> »)
  const segments = stripRefs(titleCell).split(/<br\s*\/?\s*>|\n/i).map((s) => s.trim()).filter((s) => clean(s));
  const main = segments[0] ?? '';
  const title = clean(main);
  if (!title) { stats.anomalies.push(`${page} : ligne sans titre ${JSON.stringify(cells.slice(0, 3)).slice(0, 160)}`); return null; }

  const altTitles = segments.slice(1).map((s) => ({ text: clean(s), tags: tagsOf(s) })).filter((a) => a.text);
  const mainTags = tagsOf(main);
  if (mainTags.length) altTitles.unshift({ text: title, tags: mainTags });

  // Les dates connues d'abord : une région déjà datée ne reçoit pas de date « inconnue » ensuite
  const byZones = CONSOLE.wikipediaFormat === 'first-date-and-zones';
  const dates = byZones
    ? [...parseFirstDate(rest[0] ?? ''), ...parsePresence(rest.slice(1))]
    : DATE_COLUMNS.flatMap((zone, i) => parseDates(rest[i] ?? '', zone));
  if (!dates.some((d) => d.date)) stats.noDate++;

  return {
    title,
    article: linkTarget(main),
    altTitles,
    developers: parseCompanies(devCell),
    publishers: parseCompanies(pubCell),
    dates,
    // Mention « P » des Platinum : listes PS1 seulement (pour la PS2, elles viendront de Redump)
    platinum: !byZones && /&nbsp;P&nbsp;/.test(rest[3] ?? ''),
  };
}

function parseTable(wikitext, page) {
  const start = wikitext.indexOf('id="softwarelist"');
  const end = wikitext.indexOf('\n|}', start);
  const lines = wikitext.slice(wikitext.lastIndexOf('\n', start) + 1, end).split('\n');
  const rows = [];
  let cells = null, header = false;
  const flush = () => { if (cells && !header && cells.length) rows.push(cells); };
  for (const line of lines) {
    if (/^\|-/.test(line)) { flush(); cells = []; header = false; continue; }
    if (cells === null) continue;
    if (/^!/.test(line)) { header = true; continue; }
    if (/^\|/.test(line)) cells.push(...splitTopLevel(line.slice(1), ['||']));
    else if (cells.length) cells[cells.length - 1] += `\n${line}`;
  }
  flush();
  return rows.map((c) => parseRow(c, page)).filter(Boolean);
}


// ---------------------------------------------------------------------
// 3. Récupération et analyse
// ---------------------------------------------------------------------
console.log('Lecture des listes Wikipédia…');
const sources = [];
const rows = [];
for (const page of PAGES) {
  const json = await request(WIKIPEDIA_API, {
    action: 'query', prop: 'revisions', rvprop: 'content|ids', rvslots: 'main',
    titles: page, format: 'json', formatversion: '2',
  }, page);
  const p = json.query.pages[0];
  const revision = p.revisions[0];
  sources.push({ page: p.title, revid: revision.revid });
  const parsed = parseTable(revision.slots.main.content, page);
  console.log(`  ${p.title} (révision ${revision.revid}) : ${parsed.length} jeux`);
  rows.push(...parsed);
}
stats.rows = rows.length;

// Articles Wikipédia → identifiants Wikidata
async function resolveArticles(titles, label) {
  const result = new Map();
  const list = [...titles];
  for (let i = 0; i < list.length; i += 50) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500)); // politesse envers les serveurs de Wikipédia
    const batch = list.slice(i, i + 50);
    const json = await request(WIKIPEDIA_API, {
      action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1',
      titles: batch.join('|'), format: 'json', formatversion: '2',
    }, `${label} ${i + 1}–${i + batch.length}`);
    const follow = new Map();
    for (const n of json.query.normalized ?? []) follow.set(n.from, n.to);
    for (const r of json.query.redirects ?? []) follow.set(r.from, r.to);
    const qidOf = new Map((json.query.pages ?? []).map((pg) => [pg.title, pg.pageprops?.wikibase_item]));
    for (const t of batch) {
      let target = t;
      for (let hops = 0; follow.has(target) && hops < 3; hops++) target = follow.get(target);
      result.set(t, { qid: qidOf.get(target) ?? null, resolvedTitle: target });
    }
  }
  console.log(`  ${label} : ${list.length} articles`);
  return result;
}

console.log('Correspondance avec Wikidata…');
const gameArticles = await resolveArticles(new Set(rows.map((r) => r.article).filter(Boolean)), 'jeux');
const companyArticles = await resolveArticles(
  new Set(rows.flatMap((r) => [...r.developers, ...r.publishers]).map((c) => c.article).filter(Boolean)), 'sociétés');

// Un identifiant Wikidata n'est retenu pour un jeu que s'il désigne bien UN jeu vidéo
for (const r of rows) r.qid = r.article ? gameArticles.get(r.article)?.qid ?? null : null;
const qidCount = new Map();
for (const r of rows) if (r.qid) qidCount.set(r.qid, (qidCount.get(r.qid) ?? 0) + 1);
for (const r of rows) if (r.qid && qidCount.get(r.qid) > 1) { r.qid = null; stats.qidDuplicates++; }

const candidateQids = [...new Set(rows.map((r) => r.qid).filter(Boolean))];
const videoGames = new Set();
for (let i = 0; i < candidateQids.length; i += 250) {
  const json = await request(WIKIDATA_SPARQL, {
    query: `SELECT DISTINCT ?item WHERE {
      VALUES ?item { ${candidateQids.slice(i, i + 250).map((q) => `wd:${q}`).join(' ')} }
      ?item wdt:P31/wdt:P279* wd:Q7889 . }`,
  }, `vérification Wikidata ${i + 1}`);
  for (const b of json.results.bindings) videoGames.add(b.item.value.split('/').pop());
}
for (const r of rows) if (r.qid && !videoGames.has(r.qid)) { r.qid = null; stats.notVideoGames++; }
console.log(`  ${videoGames.size} jeux reliés à Wikidata`);

// Un lien de la colonne Développeur ou Éditeur ne désigne pas toujours une société :
// « List of Acclaim Entertainment subsidiaries », un jeu, le fondateur (« Blue Moon » →
// Yoshitaka Murayama)… On ne garde le lien que vers une organisation, ou vers une personne
// affichée sous son propre nom ; sinon, le nom affiché dans la liste, sans identifiant.
const companyKinds = new Map(); // identifiant → 'organisation' | 'personne'
const companyQids = [...new Set([...companyArticles.values()].map((a) => a.qid).filter(Boolean))];
for (let i = 0; i < companyQids.length; i += 200) {
  const json = await request(WIKIDATA_SPARQL, {
    query: `SELECT ?item ?org ?human WHERE {
      VALUES ?item { ${companyQids.slice(i, i + 200).map((q) => `wd:${q}`).join(' ')} }
      BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q43229 } || EXISTS { ?item wdt:P31/wdt:P279* wd:Q210167 }
           || EXISTS { ?item wdt:P31/wdt:P279* wd:Q1137109 } AS ?org)
      BIND(EXISTS { ?item wdt:P31 wd:Q5 } AS ?human) }`,
  }, `nature des sociétés ${i + 1}`);
  for (const b of json.results.bindings) {
    const kind = b.org.value === 'true' ? 'organisation' : b.human.value === 'true' ? 'personne' : null;
    if (kind) companyKinds.set(b.item.value.split('/').pop(), kind);
  }
}
console.log(`  ${companyKinds.size} sociétés sur ${companyQids.length} liens vérifiées comme organisations ou personnes`);


// ---------------------------------------------------------------------
// 4. Transformation vers notre modèle
// ---------------------------------------------------------------------
const companies = new Map(); // clé → { key, qid, name }
function companyKey(c) {
  const resolved = c.article ? companyArticles.get(c.article) : null;
  const articleName = (resolved?.resolvedTitle ?? '').replace(/\s*\([^)]*\)$/, '');
  const kind = resolved?.qid ? companyKinds.get(resolved.qid) : null;
  const trusted = kind === 'organisation' || (kind === 'personne' && normalize(articleName) === normalize(c.name));
  if (resolved?.qid && !trusted) stats.companyLinksIgnored.add(`${c.name} → ${articleName}`);
  const qid = trusted ? resolved.qid : null;
  // Nom : titre de l'article sans précision entre parenthèses, sinon le texte affiché
  const name = (trusted && articleName) || c.name;
  const key = qid ?? `name:${normalize(name)}`;
  if (!companies.has(key)) companies.set(key, { key, qid, name });
  return key;
}

const seenTitles = new Map();
const games = rows.map((r) => {
  // Deux lignes de la liste avec le même titre = deux jeux distincts : seule la
  // première peut être fusionnée par titre avec un jeu déjà en base.
  const tkey = normalize(r.title);
  const titleMergeAllowed = !seenTitles.has(tkey);
  seenTitles.set(tkey, true);

  // Sorties de base par zone, puis versions nationales, puis Platinum
  const zones = new Set(r.dates.map((d) => d.zone));
  const baseTitle = {};
  const nationals = new Map(); // région → titre
  for (const alt of r.altTitles) {
    for (const t of alt.tags) {
      if (!TAGS[t]) { noteTag(t, 'titre'); continue; }
      const [zone, region] = TAGS[t];
      if (!zone) continue;
      zones.add(zone);
      const isBase = region === BASE_REGION[zone] || zone === 'NTSC-U';
      if (isBase) baseTitle[zone] ??= alt.text;
      else nationals.set(region, { zone, title: alt.text });
    }
  }

  const releases = [];
  const byKey = new Map();
  for (const zone of DATE_COLUMNS.filter((z) => zones.has(z))) {
    const rel = { zone, national: null, edition: 'standard', title: baseTitle[zone] ?? r.title, dates: [], publishers: new Set() };
    releases.push(rel); byKey.set(`${zone}|`, rel);
  }
  for (const [region, n] of nationals) {
    const base = byKey.get(`${n.zone}|`);
    if (base && normalize(n.title) === normalize(base.title)) continue; // même titre : pas une version à part
    const rel = { zone: n.zone, national: region, edition: 'standard', title: n.title, dates: [], publishers: new Set() };
    releases.push(rel); byKey.set(`${n.zone}|${region}`, rel);
  }
  if (r.platinum && byKey.has('PAL|')) {
    releases.push({ zone: 'PAL', national: null, edition: 'platinum', title: byKey.get('PAL|').title, dates: [], publishers: new Set() });
  }
  // Aucune région connue : une seule sortie « à compléter », pour que le jeu ait au moins une sortie
  if (releases.length === 0) {
    const rel = { zone: null, national: null, edition: 'standard', title: r.title, dates: [], publishers: new Set() };
    releases.push(rel); byKey.set('null|', rel);
  }

  // Dates : sur la version nationale si elle existe, sinon sur la sortie de base de la zone
  for (const d of r.dates) {
    const rel = byKey.get(`${d.zone}|${d.region}`) ?? byKey.get(`${d.zone}|`);
    if (rel && !rel.dates.some((x) => x.region === d.region)) rel.dates.push({ region: d.region, date: d.date, precision: d.precision });
  }
  // Une version nationale sans date connue reste rattachée à son pays
  for (const rel of releases) {
    if (rel.national && !rel.dates.some((x) => x.region === rel.national)) rel.dates.push({ region: rel.national, date: null, precision: null });
  }

  // Éditeurs : selon la région indiquée ; sans indication, seulement s'il n'y en a qu'un
  const untagged = r.publishers.filter((p) => p.tags.length === 0);
  for (const p of r.publishers) {
    const key = companyKey(p);
    if (p.tags.length === 0) {
      if (untagged.length === 1) for (const rel of releases) rel.publishers.add(key);
      continue;
    }
    for (const t of p.tags) {
      if (!TAGS[t]) { noteTag(t, 'éditeur'); continue; }
      const [zone, region] = TAGS[t];
      const targets = zone ? [byKey.get(`${zone}|${region}`) ?? byKey.get(`${zone}|`)] : releases;
      for (const rel of targets.filter(Boolean)) rel.publishers.add(key);
      if (zone === 'PAL') for (const rel of releases.filter((x) => x.edition === 'platinum')) rel.publishers.add(key);
    }
  }
  if (untagged.length > 1) stats.multiUntaggedPublishers++;

  const first = r.dates.filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    qid: r.qid,
    title: r.title,
    title_merge: titleMergeAllowed,
    first_release: first ? { date: first.date, precision: first.precision } : null,
    developers: [...new Set(r.developers.map(companyKey))],
    releases: releases.map((rel) => ({ ...rel, publishers: [...rel.publishers] })),
  };
});


// ---------------------------------------------------------------------
// 5. Bilan
// ---------------------------------------------------------------------
const count = (pred) => games.reduce((n, g) => n + g.releases.filter(pred).length, 0);
console.log(`
Bilan
  Lignes de la liste             ${stats.rows}
    reliées à Wikidata           ${games.filter((g) => g.qid).length}
    lien ignoré (doublon)        ${stats.qidDuplicates}  ·  lien ignoré (pas un jeu) ${stats.notVideoGames}
    titres en double dans la liste ${games.filter((g) => !g.title_merge).length}
    sans aucune date             ${stats.noDate}  ·  année en texte libre ${stats.plainYears}
  Sorties                        ${games.reduce((n, g) => n + g.releases.length, 0)}
    NTSC-J / NTSC-U / PAL        ${count((r) => r.zone === 'NTSC-J' && !r.national && r.edition === 'standard')} / ${count((r) => r.zone === 'NTSC-U' && !r.national)} / ${count((r) => r.zone === 'PAL' && !r.national && r.edition === 'standard')}
    versions nationales          ${count((r) => r.national)}
    Platinum                     ${count((r) => r.edition === 'platinum')}
    dates                        ${games.reduce((n, g) => n + g.releases.reduce((m, r) => m + r.dates.filter((d) => d.date).length, 0), 0)}
  Sociétés                       ${companies.size}  (${[...companies.values()].filter((c) => c.qid).length} reliées à Wikidata)
    jeux avec plusieurs éditeurs sans région (ignorés) ${stats.multiUntaggedPublishers}
    liens qui ne sont pas des sociétés (nom affiché gardé) ${stats.companyLinksIgnored.size} : ${[...stats.companyLinksIgnored].slice(0, 12).join(' ; ')}
  Mentions de région inconnues   ${[...stats.unknownTags].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t, n]) => `${t} ×${n}`).join(', ') || 'aucune'}
  Anomalies                      ${stats.anomalies.length}${stats.anomalies.length ? `\n    ${stats.anomalies.slice(0, 15).join('\n    ')}` : ''}
`);

if (dryRun) process.exit(0);


// ---------------------------------------------------------------------
// 6. Écriture de la migration SQL
// ---------------------------------------------------------------------
const payload = JSON.stringify({ companies: [...companies.values()], games });
if (payload.includes('$wikipedia$')) throw new Error('Délimiteur SQL présent dans les données');

const now = new Date();
const stamp = nextMigrationStamp(join(import.meta.dirname, '..'));
const fileName = `${stamp}_import_wikipedia_${CONSOLE.slug}.sql`;
const file = join(import.meta.dirname, '..', 'supabase', 'migrations', fileName);

const sql = `-- =====================================================================
-- Carte Mémoire · Import des jeux ${CONSOLE.code} depuis Wikipédia
-- Fichier GÉNÉRÉ par scripts/import-wikipedia.mjs le ${now.toISOString().slice(0, 10)} : ne pas modifier à la main.
--
-- Source : Wikipédia en anglais, licence CC BY-SA 4.0
--   https://creativecommons.org/licenses/by-sa/4.0/
${sources.map((s) => `--   « ${s.page} », révision ${s.revid}\n--   https://en.wikipedia.org/w/index.php?oldid=${s.revid}`).join('\n')}
--   Auteurs : voir l'historique de ces pages.
--
-- ${games.length} lignes. FUSION avec l'existant :
--   - un jeu déjà présent (même identifiant Wikidata, ou même titre normalisé
--     sans version sur une autre console) est complété, jamais dupliqué ;
--   - une sortie « à compléter » (sans zone) reçoit sa zone au lieu d'être doublée ;
--   - ré-exécutable sans créer de doublons.
-- =====================================================================

-- Société : par identifiant Wikidata, sinon par nom normalisé, sinon création
create function pg_temp.company_id(p_qid text, p_name text)
returns bigint
language plpgsql
as $$
declare
  v bigint;
begin
  if p_qid is not null then
    select id into v from public.company where wikidata_id = p_qid;
    if found then return v; end if;
  end if;

  -- À nom égal : celle qui a un identifiant Wikidata, puis celle qui a déjà des jeux
  -- (une fiche orpheline, reste d'une correction, ne doit pas renaître en doublon)
  select c.id into v from public.company c
  where c.name_key = public.normalize_name(p_name)
    and (c.wikidata_id is null or p_qid is null)
  order by (c.wikidata_id is null),
           (exists (select 1 from public.game_developer gd where gd.company_id = c.id)
            or exists (select 1 from public.release_company rc where rc.company_id = c.id)) desc,
           c.id
  limit 1;
  if found then
    if p_qid is not null then
      update public.company set wikidata_id = p_qid where id = v and wikidata_id is null;
    end if;
    return v;
  end if;

  insert into public.company (name, wikidata_id) values (p_name, p_qid) returning id into v;
  return v;
end;
$$;

do $import$
declare
  data      jsonb := $wikipedia$${payload}$wikipedia$::jsonb;
  v_platform bigint := (select id from public.platform where short_name = '${CONSOLE.code}');
  company   jsonb;
  g         jsonb;
  r         jsonb;
  d         jsonb;
  k         text;
  v_game    bigint;
  v_release bigint;
  v_pal     bigint;
  v_zone    public.video_zone;
  companies jsonb := '{}';
begin
  -- 1. Sociétés
  for company in select value from jsonb_array_elements(data -> 'companies') loop
    companies := companies || jsonb_build_object(
      company ->> 'key', pg_temp.company_id(company ->> 'qid', company ->> 'name'));
  end loop;

  for g in select value from jsonb_array_elements(data -> 'games') loop
    -- 2. Jeu : par identifiant Wikidata, sinon par titre normalisé, sinon création
    v_game := null;
    if g ->> 'qid' is not null then
      select id into v_game from public.game where wikidata_id = g ->> 'qid';
    end if;
    -- (par titre : jamais un jeu présent seulement sur une autre console, souvent une autre
    -- œuvre du même nom ; un jeu qui a déjà une version sur cette console, oui)
    if v_game is null and (g ->> 'title_merge')::boolean then
      select id into v_game from public.game x
      where x.title_key = public.normalize_name(g ->> 'title')
        and (x.wikidata_id is null or g ->> 'qid' is null)
        and (exists (select 1 from public.release o where o.game_id = x.id and o.platform_id = v_platform)
             or not exists (select 1 from public.release o where o.game_id = x.id and o.platform_id <> v_platform))
      order by exists (select 1 from public.release o where o.game_id = x.id and o.platform_id = v_platform) desc, x.id
      limit 1;
      if v_game is not null and g ->> 'qid' is not null then
        update public.game set wikidata_id = g ->> 'qid' where id = v_game;
      end if;
    end if;
    if v_game is null then
      insert into public.game (title, wikidata_id)
      values (g ->> 'title', g ->> 'qid')
      returning id into v_game;
    end if;

    if g -> 'first_release' <> 'null'::jsonb then
      update public.game
      set first_release_date = (g -> 'first_release' ->> 'date')::date,
          first_release_precision = (g -> 'first_release' ->> 'precision')::public.date_precision
      where id = v_game and first_release_date is null;
    end if;

    for k in select jsonb_array_elements_text(g -> 'developers') loop
      insert into public.game_developer (game_id, company_id)
      values (v_game, (companies ->> k)::bigint)
      on conflict do nothing;
    end loop;

    -- 3. Sorties
    v_pal := null;
    for r in select value from jsonb_array_elements(g -> 'releases') loop
      v_zone := (r ->> 'zone')::public.video_zone;
      v_release := null;

      if r ->> 'edition' = 'platinum' then
        select id into v_release from public.release
        where game_id = v_game and platform_id = v_platform and zone = 'PAL'
          and edition_type = 'reissue' and edition_name = 'Platinum'
        order by id limit 1;
        if v_release is null then
          insert into public.release (game_id, platform_id, reissue_of, local_title, zone, edition_type, edition_name)
          values (v_game, v_platform, v_pal, r ->> 'title', 'PAL', 'reissue', 'Platinum')
          returning id into v_release;
        end if;

      elsif r ->> 'national' is not null then
        select id into v_release from public.release
        where game_id = v_game and platform_id = v_platform and zone = v_zone
          and edition_type = 'standard'
          and public.normalize_name(local_title) = public.normalize_name(r ->> 'title')
        order by id limit 1;
        if v_release is null then
          insert into public.release (game_id, platform_id, local_title, zone)
          values (v_game, v_platform, r ->> 'title', v_zone)
          returning id into v_release;
        end if;

      else
        -- Sortie de base de la zone : existante, ou sortie « à compléter » à réutiliser
        select id into v_release from public.release
        where game_id = v_game and platform_id = v_platform and zone = v_zone and edition_type = 'standard'
        order by id limit 1;
        if v_release is null then
          select rel.id into v_release from public.release rel
          where rel.game_id = v_game and rel.platform_id = v_platform and rel.zone is null
            and rel.edition_type = 'standard' and rel.product_code is null
            and not exists (select 1 from public.collection_item ci where ci.release_id = rel.id)
            and not exists (select 1 from public.image i where i.release_id = rel.id)
          order by rel.id limit 1;
          if v_release is not null then
            update public.release set zone = v_zone, local_title = r ->> 'title' where id = v_release;
          else
            insert into public.release (game_id, platform_id, local_title, zone)
            values (v_game, v_platform, r ->> 'title', v_zone)
            returning id into v_release;
          end if;
        end if;
        if v_zone = 'PAL' then v_pal := v_release; end if;
      end if;

      for d in select value from jsonb_array_elements(r -> 'dates') loop
        insert into public.release_region (release_id, region_id, release_date, date_precision)
        select v_release, rg.id, (d ->> 'date')::date, (d ->> 'precision')::public.date_precision
        from public.region rg where rg.code = d ->> 'region'
        on conflict do nothing;
      end loop;

      for k in select jsonb_array_elements_text(r -> 'publishers') loop
        insert into public.release_company (release_id, company_id, role)
        values (v_release, (companies ->> k)::bigint, 'publisher')
        on conflict do nothing;
      end loop;
    end loop;
  end loop;
end;
$import$;

drop function pg_temp.company_id(text, text);
`;

writeFileSync(file, sql);
console.log(`Migration écrite : supabase/migrations/${fileName} (${Math.round(sql.length / 1024)} Ko)`);
