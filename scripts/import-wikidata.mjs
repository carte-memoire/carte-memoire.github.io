// =====================================================================
// Carte Mémoire · Import des jeux PS1 depuis Wikidata (licence CC0)
//
// Interroge Wikidata, puis écrit une migration SQL dans supabase/migrations/.
// Cette migration s'envoie ensuite comme les autres : npx supabase db push
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-wikidata.mjs            → écrit la migration
//   node scripts/import-wikidata.mjs --dry-run  → affiche seulement le bilan
//
// Aucune dépendance : il suffit de Node 18 ou plus.
// =====================================================================

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENDPOINT = 'https://query.wikidata.org/sparql';
// Wikimedia demande un User-Agent qui identifie le projet (on peut y ajouter un contact).
const USER_AGENT = 'carte-memoire-import/1.0 (projet personnel, import ponctuel)';

const PS1 = 'Q10677';
const PS1_GAMES = `?game wdt:P400 wd:${PS1} ; wdt:P31/wdt:P279* wd:Q7889 .`;

// --- Régions : doit rester cohérent avec la migration reference_data ---
const COUNTRY_ZONE = {
  FR: 'europe', BE: 'europe', CH: 'europe', LU: 'europe', DE: 'europe', AT: 'europe',
  GB: 'europe', IE: 'europe', IT: 'europe', ES: 'europe', PT: 'europe', NL: 'europe',
  SE: 'europe', NO: 'europe', DK: 'europe', FI: 'europe', PL: 'europe', GR: 'europe',
  US: 'north-america', CA: 'north-america', MX: 'north-america',
  BR: 'south-america', AR: 'south-america',
  JP: 'asia', KR: 'asia', CN: 'asia', HK: 'asia', TW: 'asia', SG: 'asia',
  AU: 'oceania', NZ: 'oceania',
  ZA: 'africa',
};
// Lieux Wikidata qui ne sont pas des pays (ou sans code ISO) → nos codes de région
const PLACE_ZONE = {
  Q13780930: 'world',          // mondial
  Q46: 'europe',
  Q458: 'europe',              // Union européenne
  Q466039: 'europe',           // Europe continentale
  Q21195: 'europe',            // Scandinavie
  Q2729044: 'europe',          // région PAL (principalement l'Europe)
  Q49: 'north-america',
  Q19464773: 'north-america',  // Amérique du Nord (doublon dans Wikidata)
  Q19188: 'CN',                // Chine continentale
  Q18: 'south-america',
  Q48: 'asia',
  Q538: 'oceania',
  Q45256: 'oceania',           // Australasie
  Q15: 'africa',
};
// Zone géographique → zone vidéo de la PS1
const VIDEO_ZONE = {
  europe: 'PAL', oceania: 'PAL', africa: 'PAL',
  'north-america': 'NTSC-U', 'south-america': 'NTSC-U',
  asia: 'NTSC-J',
  world: null,
};

const dryRun = process.argv.includes('--dry-run');


// ---------------------------------------------------------------------
// 1. Accès à Wikidata
// ---------------------------------------------------------------------
async function sparql(query, label) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ query }),
    });
    let problem;
    if (res.ok) {
      // La réponse arrive parfois coupée en route : on la relit en entier avant de l'analyser
      const text = await res.text();
      try {
        const rows = JSON.parse(text).results.bindings.map((b) =>
          Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
        console.log(`  ${label} : ${rows.length} lignes`);
        return rows;
      } catch {
        problem = 'réponse incomplète';
      }
    } else if ([429, 500, 502, 503, 504].includes(res.status)) {
      problem = `Wikidata est occupé (${res.status})`;
    } else {
      throw new Error(`Wikidata a répondu ${res.status} pour « ${label} »`);
    }
    if (attempt >= 4) throw new Error(`${problem} pour « ${label} », abandon après ${attempt} essais`);
    const wait = Number(res.headers.get('retry-after')) || attempt * 10;
    console.log(`  ${label} : ${problem}, nouvel essai dans ${wait} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

const qid = (uri) => uri?.split('/').pop();

// Regroupe les lignes SPARQL par déclaration (une déclaration peut avoir
// plusieurs qualificatifs, donc plusieurs lignes).
function groupStatements(rows, valueKey) {
  const byStatement = new Map();
  for (const r of rows) {
    let s = byStatement.get(r.s);
    if (!s) {
      s = { game: qid(r.game), value: r[valueKey], prec: r.prec, places: new Set(), platforms: new Set(), hasPart: false };
      byStatement.set(r.s, s);
    }
    if (r.place) s.places.add(qid(r.place));
    if (r.plat) s.platforms.add(qid(r.plat));
    if (r.part) s.hasPart = true;
  }
  return [...byStatement.values()];
}

// Date Wikidata → { date, precision } selon nos conventions (1er du mois, 1er janvier)
function normDate(time, prec) {
  const m = /^\+?(\d{4})-(\d{2})-(\d{2})/.exec(time);
  if (!m) return null;
  const [, y, mo, d] = m;
  const p = Number(prec);
  if (p >= 11 && mo !== '00' && d !== '00') return { date: `${y}-${mo}-${d}`, precision: 'day' };
  if (p >= 10 && mo !== '00') return { date: `${y}-${mo}-01`, precision: 'month' };
  if (p >= 9) return { date: `${y}-01-01`, precision: 'year' };
  return null;
}
const rank = { day: 3, month: 2, year: 1 };
// La plus précise, puis la plus ancienne
const better = (a, b) => !b || rank[a.precision] > rank[b.precision]
  || (rank[a.precision] === rank[b.precision] && a.date < b.date);
// La plus ancienne, puis la plus précise
const earlier = (a, b) => !b || a.date < b.date
  || (a.date === b.date && rank[a.precision] > rank[b.precision]);

// Lieu Wikidata → code de région chez nous (ou undefined si inconnu)
function regionOf(placeQid, places) {
  if (PLACE_ZONE[placeQid]) return PLACE_ZONE[placeQid];
  const iso = places.get(placeQid)?.iso;
  return iso && COUNTRY_ZONE[iso] ? iso : undefined;
}
const zoneOfRegion = (code) => (COUNTRY_ZONE[code] ?? code);

const capitalize = (s) => s && s[0].toLocaleUpperCase('fr') + s.slice(1);


// ---------------------------------------------------------------------
// 2. Récupération
// ---------------------------------------------------------------------
console.log('Interrogation de Wikidata…');

const gameRows = await sparql(`
  SELECT DISTINCT ?game ?en ?fr ?ja ?mul WHERE {
    ${PS1_GAMES}
    OPTIONAL { ?game rdfs:label ?en  FILTER(LANG(?en)  = "en") }
    OPTIONAL { ?game rdfs:label ?fr  FILTER(LANG(?fr)  = "fr") }
    OPTIONAL { ?game rdfs:label ?ja  FILTER(LANG(?ja)  = "ja") }
    OPTIONAL { ?game rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
  }`, 'jeux');

const platformCountRows = await sparql(`
  SELECT ?game (COUNT(DISTINCT ?p) AS ?n) WHERE { ${PS1_GAMES} ?game wdt:P400 ?p . }
  GROUP BY ?game`, 'nombre de plateformes par jeu');

const dateRows = await sparql(`
  SELECT DISTINCT ?game ?s ?time ?prec ?place ?plat ?part WHERE {
    ${PS1_GAMES}
    ?game p:P577 ?s .
    ?s psv:P577 [ wikibase:timeValue ?time ; wikibase:timePrecision ?prec ] .
    FILTER NOT EXISTS { ?s wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?s pq:P291|pq:P3005|pq:P1001 ?place }
    OPTIONAL { ?s pq:P400 ?plat }
    OPTIONAL { ?s pq:P518 ?part }
  }`, 'dates de sortie');

const companyStatement = (prop) => `
  SELECT DISTINCT ?game ?s ?company ?place ?plat ?part WHERE {
    ${PS1_GAMES}
    ?game p:${prop} ?s . ?s ps:${prop} ?company .
    FILTER NOT EXISTS { ?s wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?s pq:P291|pq:P3005|pq:P1001 ?place }
    OPTIONAL { ?s pq:P400 ?plat }
    OPTIONAL { ?s pq:P518 ?part }
  }`;
const publisherRows = await sparql(companyStatement('P123'), 'éditeurs');
const developerRows = await sparql(companyStatement('P178'), 'développeurs');

const genreRows = await sparql(`SELECT DISTINCT ?game ?genre WHERE { ${PS1_GAMES} ?game wdt:P136 ?genre . }`, 'genres');
const seriesRows = await sparql(`SELECT DISTINCT ?game ?series WHERE { ${PS1_GAMES} ?game wdt:P179 ?series . }`, 'séries');

// Libellés et codes pays des entités liées (sociétés, genres, séries, lieux)
async function describe(qids, label) {
  const out = new Map();
  const list = [...qids];
  for (let i = 0; i < list.length; i += 250) {
    const rows = await sparql(`
      SELECT ?item ?fr ?en ?mul ?iso ?countryIso WHERE {
        VALUES ?item { ${list.slice(i, i + 250).map((q) => `wd:${q}`).join(' ')} }
        OPTIONAL { ?item rdfs:label ?fr  FILTER(LANG(?fr)  = "fr") }
        OPTIONAL { ?item rdfs:label ?en  FILTER(LANG(?en)  = "en") }
        OPTIONAL { ?item rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
        OPTIONAL { ?item wdt:P297 ?iso }
        OPTIONAL { ?item wdt:P17/wdt:P297 ?countryIso }
      }`, `${label} (${i + 1} à ${Math.min(i + 250, list.length)})`);
    for (const r of rows) {
      const q = qid(r.item);
      const prev = out.get(q);
      // Plusieurs pays possibles : on garde le premier par ordre alphabétique
      const countryIso = [prev?.countryIso, r.countryIso].filter(Boolean).sort()[0];
      out.set(q, { ...prev, ...r, countryIso });
    }
  }
  return out;
}

const publisherStatements = groupStatements(publisherRows, 'company');
const developerStatements = groupStatements(developerRows, 'company');
const dateStatements = groupStatements(dateRows, 'time');

const companyQids = new Set([...publisherStatements, ...developerStatements].map((s) => qid(s.value)));
const placeQids = new Set([...dateStatements, ...publisherStatements].flatMap((s) => [...s.places]));

const companies = await describe(companyQids, 'sociétés');
const genres = await describe(new Set(genreRows.map((r) => qid(r.genre))), 'genres');
const series = await describe(new Set(seriesRows.map((r) => qid(r.series))), 'séries');
const places = await describe(placeQids, 'lieux');


// ---------------------------------------------------------------------
// 3. Transformation vers notre modèle
// ---------------------------------------------------------------------
const stats = { sansTitre: 0, lieuxInconnus: new Map(), editeursAmbigus: 0, editeursPlaces: 0 };

const platformCount = new Map(platformCountRows.map((r) => [qid(r.game), Number(r.n)]));

// Jeux
const games = new Map();
for (const r of gameRows) {
  const q = qid(r.game);
  const title = (r.en ?? r.mul ?? r.fr ?? r.ja)?.trim();
  if (!title) { stats.sansTitre++; continue; }
  games.set(q, { qid: q, title, ja: r.ja?.trim(), en: (r.en ?? r.mul)?.trim(), firstRelease: null, regions: new Map() });
}

// Dates : première sortie de l'œuvre + dates PS1 par région
for (const s of dateStatements) {
  const game = games.get(s.game);
  const d = game && normDate(s.value, s.prec);
  if (!d) continue;

  if (earlier(d, game.firstRelease)) game.firstRelease = d;

  // Date valable pour la PS1 ? Oui si le qualificatif « plateforme » dit PS1,
  // ou s'il n'y en a pas et que le jeu n'existe que sur PS1.
  const forPs1 = s.platforms.has(PS1)
    || (s.platforms.size === 0 && !s.hasPart && platformCount.get(s.game) === 1);
  if (!forPs1) continue;

  for (const place of s.places) {
    const region = regionOf(place, places);
    if (!region) {
      const name = places.get(place)?.fr ?? places.get(place)?.en ?? place;
      stats.lieuxInconnus.set(name, (stats.lieuxInconnus.get(name) ?? 0) + 1);
      continue;
    }
    if (better(d, game.regions.get(region))) game.regions.set(region, d);
  }
}

// Sorties : une par zone vidéo où le jeu est sorti, ou une seule « à compléter »
const releases = [];        // { game, zone, localTitle }
const releaseRegions = [];  // { game, zone, region, date, precision }
for (const g of games.values()) {
  const zones = new Map();
  for (const [region, d] of g.regions) {
    const zone = VIDEO_ZONE[zoneOfRegion(region)];
    if (!zones.has(zone)) zones.set(zone, []);
    zones.get(zone).push({ region, ...d });
  }
  if (zones.size === 0) zones.set(null, []);
  for (const [zone, regs] of zones) {
    const localTitle = (zone === 'NTSC-J' ? g.ja ?? g.title : g.en ?? g.title);
    releases.push({ game: g.qid, zone, localTitle });
    for (const r of regs) releaseRegions.push({ game: g.qid, zone, ...r });
  }
}
const zonesOfGame = new Map();
for (const r of releases) {
  if (!zonesOfGame.has(r.game)) zonesOfGame.set(r.game, new Set());
  zonesOfGame.get(r.game).add(r.zone);
}

// Sociétés : on n'importe que celles qui ont un nom
const companyName = (q) => (companies.get(q)?.mul ?? companies.get(q)?.en ?? companies.get(q)?.fr)?.trim();
const usedCompanies = new Set();

// Développeurs (on ignore ceux d'une autre version : arcade, PC…)
const gameDevelopers = new Set();
for (const s of developerStatements) {
  if (!games.has(s.game) || s.hasPart) continue;
  if (s.platforms.size > 0 && !s.platforms.has(PS1)) continue;
  const c = qid(s.value);
  if (!companyName(c)) continue;
  gameDevelopers.add(`${s.game}|${c}`);
  usedCompanies.add(c);
}

// Éditeurs : l'éditeur dépend de la région, donc on ne l'attache à une sortie
// que si c'est sûr (lieu précisé, ou un seul éditeur connu pour le jeu).
const releaseCompanies = new Set();
const unqualified = new Map();
for (const s of publisherStatements) {
  if (!games.has(s.game) || s.hasPart) continue;
  if (s.platforms.size > 0 && !s.platforms.has(PS1)) continue;
  const c = qid(s.value);
  if (!companyName(c)) continue;
  if (s.places.size > 0) {
    for (const place of s.places) {
      const region = regionOf(place, places);
      const zone = region && VIDEO_ZONE[zoneOfRegion(region)];
      if (region && zonesOfGame.get(s.game).has(zone)) {
        releaseCompanies.add(`${s.game}|${zone ?? ''}|${c}`);
        usedCompanies.add(c);
        stats.editeursPlaces++;
      }
    }
  } else {
    if (!unqualified.has(s.game)) unqualified.set(s.game, new Set());
    unqualified.get(s.game).add(c);
  }
}
for (const [game, set] of unqualified) {
  if (set.size !== 1) { stats.editeursAmbigus++; continue; }
  const [c] = set;
  for (const zone of zonesOfGame.get(game)) releaseCompanies.add(`${game}|${zone ?? ''}|${c}`);
  usedCompanies.add(c);
}

// Genres : libellé français avec une majuscule, « Jeu vidéo de course » → « Jeu de course »,
// sauf les noms qu'on préfère choisir nous-mêmes
const GENRE_RENAME = {
  Q744038: 'RPG',               // jeu vidéo de rôle
  Q19272838: 'Jeu de plateau',  // « jeu vidéo de jeu de plateau »
  Q60617905: 'Jeu télévisé',    // « jeu vidéo de jeu télévisé »
};
const genreName = (q) => GENRE_RENAME[q]
  ?? capitalize((genres.get(q)?.fr ?? genres.get(q)?.en)?.trim())?.replace(/^Jeu vidéo d(e |')/, "Jeu d$1");
const gameGenres = new Set();
for (const r of genreRows) {
  const g = qid(r.game), name = genreName(qid(r.genre));
  if (games.has(g) && name) gameGenres.add(`${g}|${name}`);
}
const seriesName = (q) => (series.get(q)?.fr ?? series.get(q)?.mul ?? series.get(q)?.en)?.trim();
const gameSeries = new Set();
for (const r of seriesRows) {
  const g = qid(r.game), s = qid(r.series);
  if (games.has(g) && seriesName(s)) gameSeries.add(`${g}|${s}`);
}


// ---------------------------------------------------------------------
// 4. Bilan
// ---------------------------------------------------------------------
const byZone = {};
for (const r of releases) byZone[r.zone ?? 'à compléter'] = (byZone[r.zone ?? 'à compléter'] ?? 0) + 1;
const genreNames = new Set([...gameGenres].map((k) => k.split('|')[1]));

console.log(`
Bilan
  Jeux                       ${games.size}  (${stats.sansTitre} ignorés faute de titre)
    avec date de 1re sortie  ${[...games.values()].filter((g) => g.firstRelease).length}
  Sorties PS1                ${releases.length}  ${JSON.stringify(byZone)}
    dates par région         ${releaseRegions.length}
  Sociétés                   ${usedCompanies.size}
    liens développeur        ${gameDevelopers.size}
    liens éditeur            ${releaseCompanies.size}  (dont ${stats.editeursPlaces} avec région précisée ; ${stats.editeursAmbigus} jeux avec plusieurs éditeurs sans région, ignorés)
  Genres                     ${genreNames.size}  (${gameGenres.size} liens)
  Séries                     ${new Set([...gameSeries].map((k) => k.split('|')[1])).size}  (${gameSeries.size} liens)
  Lieux non reconnus         ${[...stats.lieuxInconnus].map(([n, c]) => `${n} (${c})`).join(', ') || 'aucun'}
`);

if (dryRun) process.exit(0);


// ---------------------------------------------------------------------
// 5. Écriture de la migration SQL
// ---------------------------------------------------------------------
const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);

function insertValues(table, columns, rows) {
  if (rows.length === 0) return '';
  const chunks = [];
  for (let i = 0; i < rows.length; i += 500) {
    chunks.push(`insert into ${table} (${columns.join(', ')}) values\n  ${rows
      .slice(i, i + 500)
      .map((r) => `(${r.map(lit).join(', ')})`)
      .join(',\n  ')};`);
  }
  return chunks.join('\n\n');
}

const now = new Date();
const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
const file = join(import.meta.dirname, '..', 'supabase', 'migrations', `${stamp}_import_wikidata_ps1.sql`);

const sql = `-- =====================================================================
-- Carte Mémoire · Import des jeux PS1 depuis Wikidata
-- Fichier GÉNÉRÉ par scripts/import-wikidata.mjs le ${now.toISOString().slice(0, 10)} : ne pas modifier à la main.
-- Données Wikidata sous licence CC0 (https://www.wikidata.org).
--
-- ${games.size} jeux, ${releases.length} sorties PS1, ${usedCompanies.size} sociétés, ${genreNames.size} genres.
-- Ré-exécutable sans risque : rien n'est dupliqué, et les sorties ne sont
-- créées que pour les jeux qui n'en ont encore aucune.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tables temporaires (supprimées à la fin)
-- ---------------------------------------------------------------------
create temporary table import_company (wikidata_id text primary key, name text not null, country text);
create temporary table import_genre (name text primary key, wikidata_id text);
create temporary table import_series (wikidata_id text primary key, name text not null);
create temporary table import_game (wikidata_id text primary key, title text not null, first_release_date date, first_release_precision public.date_precision);
create temporary table import_game_developer (game text, company text);
create temporary table import_game_genre (game text, genre text);
create temporary table import_game_series (game text, series text);
create temporary table import_release (game text, zone public.video_zone, local_title text not null);
create temporary table import_release_region (game text, zone public.video_zone, region text, release_date date, date_precision public.date_precision);
create temporary table import_release_company (game text, zone public.video_zone, company text);


-- ---------------------------------------------------------------------
-- 2. Données
-- ---------------------------------------------------------------------
${insertValues('import_company', ['wikidata_id', 'name', 'country'],
  [...usedCompanies].sort().map((c) => [c, companyName(c), companies.get(c)?.countryIso ?? null]))}

${insertValues('import_genre', ['name', 'wikidata_id'],
  [...new Map([...gameGenres].map((k) => k.split('|')[1]).sort().map((n) => [n, null]))]
    .map(([n]) => [n, [...genres].find(([q]) => genreName(q) === n)?.[0] ?? null]))}

${insertValues('import_series', ['wikidata_id', 'name'],
  [...new Set([...gameSeries].map((k) => k.split('|')[1]))].sort().map((s) => [s, seriesName(s)]))}

${insertValues('import_game', ['wikidata_id', 'title', 'first_release_date', 'first_release_precision'],
  [...games.values()].map((g) => [g.qid, g.title, g.firstRelease?.date ?? null, g.firstRelease?.precision ?? null]))}

${insertValues('import_game_developer', ['game', 'company'], [...gameDevelopers].map((k) => k.split('|')))}

${insertValues('import_game_genre', ['game', 'genre'], [...gameGenres].map((k) => k.split('|')))}

${insertValues('import_game_series', ['game', 'series'], [...gameSeries].map((k) => k.split('|')))}

${insertValues('import_release', ['game', 'zone', 'local_title'],
  releases.map((r) => [r.game, r.zone, r.localTitle]))}

${insertValues('import_release_region', ['game', 'zone', 'region', 'release_date', 'date_precision'],
  releaseRegions.map((r) => [r.game, r.zone, r.region, r.date, r.precision]))}

${insertValues('import_release_company', ['game', 'zone', 'company'],
  [...releaseCompanies].map((k) => { const [g, z, c] = k.split('|'); return [g, z || null, c]; }))}


-- ---------------------------------------------------------------------
-- 3. Copie vers les vraies tables
-- ---------------------------------------------------------------------
insert into public.company (name, country, wikidata_id)
select name, country, wikidata_id from import_company
on conflict (wikidata_id) do nothing;

-- « on conflict do nothing » sans cible : ignore aussi un nom de genre déjà pris
insert into public.genre (name, wikidata_id)
select name, wikidata_id from import_genre
on conflict do nothing;

insert into public.series (name, wikidata_id)
select name, wikidata_id from import_series
on conflict (wikidata_id) do nothing;

-- Jeu déjà présent SANS identifiant Wikidata (ajouté par un autre import ou à la
-- main) avec le même titre normalisé : on le relie au lieu de créer un doublon.
-- (Un seul jeu par identifiant, et un seul identifiant par jeu.)
with candidate as (
  select distinct on (g.id) g.id, i.wikidata_id
  from import_game i
  join public.game g on g.wikidata_id is null and g.title_key = public.normalize_name(i.title)
  where not exists (select 1 from public.game x where x.wikidata_id = i.wikidata_id)
  order by g.id, i.wikidata_id
), unique_link as (
  select distinct on (wikidata_id) id, wikidata_id from candidate order by wikidata_id, id
)
update public.game g set wikidata_id = u.wikidata_id
from unique_link u
where g.id = u.id;

insert into public.game (title, wikidata_id, first_release_date, first_release_precision)
select title, wikidata_id, first_release_date, first_release_precision from import_game
on conflict (wikidata_id) do nothing;

-- Date de première sortie : complétée si elle manquait
update public.game g
set first_release_date = i.first_release_date, first_release_precision = i.first_release_precision
from import_game i
where g.wikidata_id = i.wikidata_id and g.first_release_date is null and i.first_release_date is not null;

insert into public.game_developer (game_id, company_id)
select g.id, c.id
from import_game_developer i
join public.game g on g.wikidata_id = i.game
join public.company c on c.wikidata_id = i.company
on conflict do nothing;

insert into public.game_genre (game_id, genre_id)
select g.id, ge.id
from import_game_genre i
join public.game g on g.wikidata_id = i.game
join public.genre ge on ge.name = i.genre
on conflict do nothing;

insert into public.game_series (game_id, series_id)
select g.id, s.id
from import_game_series i
join public.game g on g.wikidata_id = i.game
join public.series s on s.wikidata_id = i.series
on conflict do nothing;

-- Sorties : seulement pour les jeux qui n'en ont encore aucune
insert into public.release (game_id, platform_id, local_title, zone)
select g.id, p.id, i.local_title, i.zone
from import_release i
join public.game g on g.wikidata_id = i.game
cross join (select id from public.platform where short_name = 'PS1') p
where not exists (select 1 from public.release r where r.game_id = g.id);

-- Dates et éditeurs : sur la sortie DE BASE de chaque zone uniquement (la plus
-- ancienne en édition standard), jamais sur une réédition ou une version nationale
create temporary table import_base_release as
select distinct on (r.game_id, r.zone) r.id, r.game_id, r.zone
from public.release r
join public.platform p on p.id = r.platform_id and p.short_name = 'PS1'
where r.edition_type = 'standard'
order by r.game_id, r.zone, r.id;

insert into public.release_region (release_id, region_id, release_date, date_precision)
select r.id, rg.id, i.release_date, i.date_precision
from import_release_region i
join public.game g on g.wikidata_id = i.game
join import_base_release r on r.game_id = g.id and r.zone is not distinct from i.zone
join public.region rg on rg.code = i.region
on conflict do nothing;

insert into public.release_company (release_id, company_id, role)
select r.id, c.id, 'publisher'
from import_release_company i
join public.game g on g.wikidata_id = i.game
join import_base_release r on r.game_id = g.id and r.zone is not distinct from i.zone
join public.company c on c.wikidata_id = i.company
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 4. Ménage
-- ---------------------------------------------------------------------
drop table import_company, import_genre, import_series, import_game,
  import_game_developer, import_game_genre, import_game_series,
  import_release, import_release_region, import_release_company, import_base_release;
`;

writeFileSync(file, sql);
console.log(`Migration écrite : supabase/migrations/${stamp}_import_wikidata_ps1.sql (${Math.round(sql.length / 1024)} Ko)`);
