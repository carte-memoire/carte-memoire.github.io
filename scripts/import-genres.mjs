// =====================================================================
// Carte Mémoire · Genres des jeux depuis Wikipédia en anglais
//
// Les genres importés de Wikidata contiennent des erreurs (Tintin: Destination
// Adventure classé « RPG »…). L'encadré « Genre » des articles Wikipédia en
// anglais est rédigé et relu à la main, jeu par jeu : on s'en sert de référence.
//
// Pour chaque jeu qui a un identifiant Wikidata :
//   1. Wikidata donne le titre de l'article Wikipédia en anglais ;
//   2. on lit l'encadré de cet article et ses liens de genre
//      ([[Action role-playing game|Action RPG]]…) ;
//   3. chaque lien de genre est ramené à son identifiant Wikidata, pour le
//      relier aux genres de notre base (et à leurs familles).
// Les réponses sont gardées dans .genres-import/ (non versionné) : relancer le
// script ne retélécharge rien.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-genres.mjs            → analyse seule (rien n'est écrit dans la base)
//   node scripts/import-genres.mjs --ecrire   → écrit la migration
//
// Règle appliquée par la migration : pour chaque jeu dont l'article donne un
// genre, Wikipédia décide des familles (RPG, Sport…). Les genres actuels hors de
// ces familles sont retirés (Tintin n'est plus un RPG), les plus précis restent
// (« Jeu de football » quand Wikipédia dit « Sport »), ceux de Wikipédia sont
// ajoutés. Les thèmes (science-fiction, Noël…) ne bougent pas, et les jeux revus
// à la main par un modérateur (genres_reviewed) ne sont pas touchés.
// =====================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, publicApi, readEnv } from './lib/redump.mjs';

const write = process.argv.includes('--ecrire');
const CACHE_DIR = join(ROOT, '.genres-import');
const CACHE = join(CACHE_DIR, 'wikipedia.json');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, label) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt >= 4) throw new Error(`Réponse ${res.status} pour « ${label} »`);
    const wait = Number(res.headers.get('retry-after')) || attempt * 10;
    console.log(`  ${label} : serveur occupé (${res.status}), nouvel essai dans ${wait} s`);
    await pause(wait * 1000);
  }
}

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const wiki = (params) => `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;


// ---------------------------------------------------------------------
// Correspondances : genres cités par Wikipédia → genres de notre base
// (identifiants Wikidata de nos genres)
// ---------------------------------------------------------------------

// Articles que Wikipédia cite comme genre, mais qui ne sont pas un genre de jeu
// de notre base : souvent le sport lui-même (« Basketball »)
const BY_TITLE = {
  'Basketball': 'Q63915027', 'Baseball': 'Q62019045', 'Association football': 'Q1478420',
  'American football': 'Q63915391', 'List of American football video games': 'Q63915391', 'Ice hockey': 'Q71474750',
  'Golf': 'Q60256879', 'List of golf video games': 'Q60256879', 'Racing': 'Q860750', 'Motorboat': 'Q860750',
  'Sport': 'Q868217', 'Table tennis': 'Q868217', 'Mountain bike': 'Q868217', 'Show jumping': 'Q108611897',
  'Cue sports': 'Q62022558', 'Pool (cue sports)': 'Q62022558', 'Tenpin bowling': 'Q61719251', 'Bowling': 'Q61719251',
  'Strategy game': 'Q472055', 'Strategy': 'Q472055', 'Party game': 'Q7888616', 'Board game': 'Q19272838',
  'Role-playing game': 'Q744038', 'Dungeon crawl': 'Q744038', 'Puzzle': 'Q54767', 'Nonogram': 'Q110505373',
  'Breakout (video game)': 'Q2941225', 'List of maze video games': 'Q13717398', 'Twin-stick shooter': 'Q78145485',
  'Vertically scrolling video game': 'Q96146237', 'Light gun': 'Q3965952', 'Flight simulator': 'Q4740553',
  'Simulation': 'Q1610017', 'Business simulation': 'Q1198141', 'Virtual pet': 'Q25861761',
  'Music': 'Q584105', 'Music sequencer': 'Q584105', 'Horror fiction': 'Q11338014', 'Romance': 'Q14411698',
  'Chess': 'Q71679871', 'Quiz': 'Q11298493', 'Gambling': 'Q60617897', 'Game show': 'Q60617905',
  '#Sports-based fighting': 'Q105221690', 'List of baseball video games': 'Q62019045', 'Snooker': 'Q71441946',
  'Tile-matching video game': 'Q54767', 'Formula One': 'Q860750', 'Motocross': 'Q111411020', 'Dance': 'Q2632782',
  'Space simulation': 'Q1892535', 'Space simulator': 'Q1892535', 'Social simulation': 'Q7551387',
  'Interactive fiction': 'Q23916', 'Tactical wargame': 'Q2454898', 'Fighting': 'Q846224',
};

// Genres hybrides : mêmes familles que dans la migration genre_families (pour un
// bilan exact avant qu'elle soit appliquée ; ensuite, la base les donne déjà)
const HYBRID = {
  Q1422746: ['rpg', 'action'], Q1529437: ['rpg', 'strategy'], Q343568: ['adventure', 'action'], Q333967: ['horror', 'adventure'],
  Q62591185: ['platform', 'puzzle'], Q19643088: ['platform', 'action'], Q60480500: ['shooter', 'action'], Q11282930: ['puzzle', 'action'],
  Q1417032: ['racing', 'simulation'], Q603481: ['simulation', 'shooter'], Q56298645: ['sports', 'simulation'], Q536420: ['simulation', 'strategy'],
  Q588289: ['simulation', 'strategy'], Q105221690: ['sports', 'fighting'], Q3177953: ['sports', 'fighting'], Q32112: ['sports', 'fighting'],
  Q1339223: ['visual_novel', 'simulation'],
};

// Genres écrits sans lien (« Action, Strategy », « Beat-em-up »…)
const BY_TEXT = {
  'action': 'Q270948', 'adventure': 'Q23916', 'action-adventure': 'Q343568', 'strategy': 'Q472055',
  'sports': 'Q868217', 'basketball': 'Q63915027', 'quiz': 'Q11298493', 'beat-em-up': 'Q401831',
  "beat 'em up": 'Q401831', 'car combat': 'Q2070892', 'turn-based strategy rpg': 'Q1529437',
  'romance': 'Q14411698', 'racing': 'Q860750', 'puzzle': 'Q54767', 'platform': 'Q828322',
  'fighting': 'Q846224', 'shooter': 'Q4282636', 'rpg': 'Q744038', 'role-playing': 'Q744038',
};


// ---------------------------------------------------------------------
// 1. Les jeux de la base et leurs genres actuels
// ---------------------------------------------------------------------
console.log('Lecture des jeux…');
const api = publicApi(readEnv());
const genres = await api('genre?select=*&limit=1000');
// Familles d'un genre : colonne families (après la migration genre_families) ou family (avant)
const familiesOf = (g) => g.families ?? HYBRID[g.wikidata_id] ?? (g.family ? [g.family] : []);
const games = [];
for (let offset = 0; ; offset += 1000) {
  const page = await api(`game?select=id,title,wikidata_id,genres_reviewed:genres_reviewed,game_genre(genre_id)&wikidata_id=not.is.null&order=id&limit=1000&offset=${offset}`)
    .catch(() => api(`game?select=id,title,wikidata_id,game_genre(genre_id)&wikidata_id=not.is.null&order=id&limit=1000&offset=${offset}`));
  games.push(...page);
  if (page.length < 1000) break;
}
console.log(`  ${games.length} jeux avec un identifiant Wikidata, ${genres.length} genres dans la base`);


// ---------------------------------------------------------------------
// 2. Wikipédia (avec cache)
// ---------------------------------------------------------------------
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
cache.articles ??= {};
cache.infobox ??= {};
cache.redirected ??= {};
cache.genreItems ??= {};
const save = () => { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); };

// Champ « genre » de l'encadré : il peut tenir sur plusieurs lignes ({{Plainlist}}, {{ubl}}…)
function genreField(text) {
  const m = /\|\s*genre\s*=\s*([\s\S]*?)(?=\n\s*\|\s*[\w ]+?\s*=|\n\s*\}\})/i.exec(text);
  const value = m ? m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[\s\S]*?(\/>|<\/ref>)/g, '').trim() : '';
  // Champ vide : la ligne suivante de l'encadré (« | modes = ») n'est pas un genre
  return value && !value.startsWith('|') ? value : null;
}
// Valeurs gardées par une version précédente du script
for (const [title, value] of Object.entries(cache.infobox)) if (value?.startsWith('|')) cache.infobox[title] = null;

// 2a. Titre de l'article anglais de chaque jeu
const missingQids = games.map((g) => g.wikidata_id).filter((q) => !(q in cache.articles));
for (const [i, ids] of chunks(missingQids, 50).entries()) {
  console.log(`Wikidata : articles anglais ${i + 1}/${Math.ceil(missingQids.length / 50)}`);
  const data = await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'sitelinks', sitefilter: 'enwiki', format: 'json' })}`, 'Wikidata');
  for (const q of ids) cache.articles[q] = data.entities?.[q]?.sitelinks?.enwiki?.title ?? null;
  save();
  await pause(1000);
}

// 2b. Encadré de chaque article (début de l'article seulement). Un article qui
// redirige ailleurs (vers la série, par exemple) ne parle pas que de ce jeu : ignoré.
const titles = [...new Set(games.map((g) => cache.articles[g.wikidata_id]).filter((t) => t && !(t in cache.infobox)))];
for (const [i, batch] of chunks(titles, 50).entries()) {
  console.log(`Wikipédia : encadrés ${i + 1}/${Math.ceil(titles.length / 50)}`);
  const data = await getJson(wiki({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', rvsection: '0', redirects: '1', titles: batch.join('|') }), 'Wikipédia');
  const redirects = new Map((data.query.redirects ?? []).map((r) => [r.to, r.from]));
  const normalized = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of data.query.pages) {
    const text = p.revisions?.[0]?.slots?.main?.content ?? null;
    let original = p.title;
    if (redirects.has(original)) { original = redirects.get(original); cache.redirected[original] = true; }
    if (normalized.has(original)) original = normalized.get(original);
    cache.infobox[original] = text === null ? null : genreField(text);
  }
  for (const t of batch) if (!(t in cache.infobox)) cache.infobox[t] = null;
  save();
  await pause(1000);
}

// 2b'. Redirections des articles lus par une version précédente du script
const unchecked = Object.keys(cache.infobox).filter((t) => !(t in cache.redirected));
for (const [i, batch] of chunks(unchecked, 50).entries()) {
  console.log(`Wikipédia : redirections ${i + 1}/${Math.ceil(unchecked.length / 50)}`);
  const data = await getJson(wiki({ action: 'query', redirects: '1', titles: batch.join('|') }), 'redirections');
  const normalized = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
  const from = new Set((data.query.redirects ?? []).map((r) => normalized.get(r.from) ?? r.from));
  for (const t of batch) cache.redirected[t] = from.has(t);
  save();
  await pause(1000);
}

// Liens de genre d'un champ : [[Action role-playing game|Action RPG]] → « Action role-playing game »
// Lien vers la liste des genres : c'est l'ancre qui donne le genre ([[List of video game genres#Sports-based fighting|…]])
const linksOf = (field) => [...(field ?? '').matchAll(/\[\[([^\]|#]+)(#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)]
  .map((m) => (m[1].trim() === 'List of video game genres' && m[2] ? m[2] : m[1].trim()).replace(/_/g, ' '))
  .map((t) => t[0].toUpperCase() + t.slice(1));

// 2c. Identifiant Wikidata de chaque article de genre (redirections suivies)
const genreTitles = [...new Set(Object.values(cache.infobox).flatMap(linksOf))]
  .filter((t) => !t.startsWith('#') && !(t in cache.genreItems));
for (const [i, batch] of chunks(genreTitles, 50).entries()) {
  console.log(`Wikipédia : articles de genre ${i + 1}/${Math.ceil(genreTitles.length / 50)}`);
  const data = await getJson(wiki({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: batch.join('|') }), 'genres');
  const back = new Map();
  for (const r of data.query.redirects ?? []) back.set(r.to, [...(back.get(r.to) ?? []), r.from]);
  for (const n of data.query.normalized ?? []) back.set(n.to, [...(back.get(n.to) ?? []), n.from]);
  for (const p of data.query.pages) {
    const item = { title: p.title, qid: p.pageprops?.wikibase_item ?? null };
    const names = [p.title, ...(back.get(p.title) ?? [])];
    for (const name of [...names]) names.push(...(back.get(name) ?? []));
    for (const name of names) cache.genreItems[name] = item;
  }
  for (const t of batch) if (!(t in cache.genreItems)) cache.genreItems[t] = { title: t, qid: null };
  save();
  await pause(1000);
}


// ---------------------------------------------------------------------
// 3. Genres retenus pour chaque jeu
// ---------------------------------------------------------------------
const genreByQid = new Map(genres.filter((g) => g.wikidata_id).map((g) => [g.wikidata_id, g]));
const genreById = new Map(genres.map((g) => [g.id, g]));
const isGenre = (g) => familiesOf(g).length > 0; // sinon c'est un thème

const ignored = new Map(); // genre cité mais sans équivalent dans la base → nombre de jeux

// Genres de notre base cités par l'encadré (thèmes exclus)
function wikipediaGenres(field) {
  const links = linksOf(field);
  // Sans lien : le texte, découpé (« Action, Strategy », « Comedy<br />Educational »…)
  const sources = links.length > 0
    ? links.map((l) => ({ label: l, qid: BY_TITLE[cache.genreItems[l]?.title ?? l] ?? BY_TITLE[l] ?? cache.genreItems[l]?.qid }))
    : field.split(/,|<br\s*\/?>|\//i).map((t) => t.trim().toLowerCase()).filter(Boolean).map((t) => ({ label: t, qid: BY_TEXT[t] }));
  const found = new Map();
  for (const { label, qid } of sources) {
    const g = qid && genreByQid.get(qid);
    if (g && isGenre(g)) found.set(g.wikidata_id, g);
    else if (!g) ignored.set(label, (ignored.get(label) ?? 0) + 1);
  }
  return [...found.values()];
}

const decisions = []; // { game, before: [genres], after: [genres] }
let noArticle = 0, redirected = 0, noGenre = 0, reviewed = 0;
for (const game of games) {
  const title = cache.articles[game.wikidata_id];
  if (!title) { noArticle++; continue; }
  if (cache.redirected[title]) { redirected++; continue; }
  const field = cache.infobox[title];
  const after = field ? wikipediaGenres(field) : [];
  if (after.length === 0) { noGenre++; continue; }
  if (game.genres_reviewed) { reviewed++; continue; }
  const before = game.game_genre.map((gg) => genreById.get(gg.genre_id)).filter((g) => g && isGenre(g));
  // Wikipédia décide des familles ; un genre plus précis déjà connu (« Jeu de football »
  // quand Wikipédia dit « Sport ») est gardé s'il reste dans ces familles, ou si
  // Wikipédia confirme sa famille principale (« Jeu de catch » : sport, puis combat)
  const families = new Set(after.flatMap(familiesOf));
  const kept = before.filter((g) => (familiesOf(g).every((f) => families.has(f)) || families.has(familiesOf(g)[0]))
    && !after.some((a) => a.id === g.id));
  decisions.push({ game, before, wikipedia: after, after: [...after, ...kept] });
}

const key = (list) => list.map((g) => g.wikidata_id).sort().join();
const same = decisions.filter((d) => key(d.before) === key(d.after));
const added = decisions.filter((d) => d.before.length === 0);
const changed = decisions.filter((d) => d.before.length > 0 && key(d.before) !== key(d.after));
const names = (list) => list.map((g) => g.name).join(', ') || '—';

console.log(`
Bilan
  Jeux avec identifiant Wikidata          ${games.length}
    sans article anglais                  ${noArticle}
    article qui redirige (série…)         ${redirected}
    article sans genre exploitable        ${noGenre}
    genres déjà revus par un modérateur   ${reviewed}
  Jeux dont les genres viennent de Wikipédia  ${decisions.length}
    identiques à ceux de Wikidata         ${same.length}
    nouveaux (aucun genre jusqu'ici)      ${added.length}
    modifiés                              ${changed.length}
`);

console.log('Tes exemples :');
for (const title of ['Tintin: Destination Adventure', 'Dragon Valor', "Tecmo's Deception: Invitation to Darkness", 'Kagero: Deception II', 'Deception III: Dark Delusion']) {
  const d = decisions.find((x) => x.game.title === title);
  const g = games.find((x) => x.title === title);
  console.log(`  ${title.padEnd(42)} ${d ? `${names(d.before)}  →  ${names(d.after)}` : g ? 'inchangé (pas de genre Wikipédia pour ce jeu)' : 'absent'}`);
}

console.log('\nÉchantillon régulier des changements :');
for (const d of changed.filter((_, i) => i % Math.max(1, Math.floor(changed.length / 30)) === 0).slice(0, 30)) {
  console.log(`  ${d.game.title.slice(0, 40).padEnd(40)} ${names(d.before)}  →  ${names(d.after)}`);
}

// Genres les plus souvent retirés ou ajoutés
const delta = new Map();
for (const d of changed) {
  for (const g of d.before) if (!d.after.some((a) => a.id === g.id)) delta.set(`− ${g.name}`, (delta.get(`− ${g.name}`) ?? 0) + 1);
  for (const g of d.after) if (!d.before.some((b) => b.id === g.id)) delta.set(`+ ${g.name}`, (delta.get(`+ ${g.name}`) ?? 0) + 1);
}
console.log('\nGenres les plus souvent retirés (−) ou ajoutés (+) :');
for (const [label, n] of [...delta].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(n).padStart(4)}  ${label}`);

console.log('\nCités par Wikipédia mais ignorés (thèmes, pages hors sujet) :');
console.log('  ' + [...ignored].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', '));

writeFileSync(join(CACHE_DIR, 'changements.txt'), changed.concat(added)
  .map((d) => `${d.game.title} : ${names(d.before)} → ${names(d.after)}`).sort().join('\n'));
console.log('\nListe complète des changements : .genres-import/changements.txt');

if (!write) {
  console.log('Pour écrire la migration : node scripts/import-genres.mjs --ecrire');
  process.exit(0);
}


// ---------------------------------------------------------------------
// 4. Migration SQL (jeux désignés par leur identifiant Wikidata, stable)
// ---------------------------------------------------------------------
// Seulement les genres de Wikipédia : la base en déduit les familles, puis ce qu'elle garde (même règle que le bilan)
const pairs = decisions.flatMap((d) => d.wikipedia.map((g) => `('${d.game.wikidata_id}', '${g.wikidata_id}')`));
const now = new Date();
// Toujours après la dernière migration existante : l'ordre des fichiers compte
const latest = readdirSync(join(ROOT, 'supabase', 'migrations')).map((name) => name.slice(0, 14)).sort().at(-1) ?? '0';
const clock = now.toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = clock > latest ? clock : String(BigInt(latest) + 100n);
writeFileSync(join(ROOT, 'supabase', 'migrations', `${stamp}_import_genres_wikipedia.sql`), `-- =====================================================================
-- Carte Mémoire · Genres des jeux depuis Wikipédia en anglais
-- Fichier GÉNÉRÉ par scripts/import-genres.mjs le ${now.toISOString().slice(0, 10)}.
-- Source : encadré « Genre » des articles Wikipédia en anglais (CC BY-SA).
--
-- ${decisions.length} jeux. Pour chacun, Wikipédia décide des familles (RPG, Sport…) :
-- les genres actuels hors de ces familles sont retirés, ceux de Wikipédia ajoutés.
-- Les thèmes (science-fiction…) restent ; les jeux revus par un modérateur ne
-- sont pas touchés.
-- =====================================================================

create temporary table import_genre (
  game_qid  text not null,
  genre_qid text not null,
  primary key (game_qid, genre_qid)
);

${chunks(pairs, 500).map((part) => `insert into import_genre (game_qid, genre_qid) values\n  ${part.join(',\n  ')};`).join('\n\n')}

-- Familles données par Wikipédia pour chaque jeu (jeux revus par un modérateur exclus)
create temporary table import_genre_game as
select g.id, array_agg(distinct f.family) as families
from import_genre i
join public.game g on g.wikidata_id = i.game_qid
join public.genre ge on ge.wikidata_id = i.genre_qid
cross join lateral unnest(ge.families) as f(family)
where not g.genres_reviewed
group by g.id;

-- Genres actuels hors de ces familles : retirés. Restent les plus précis (« Jeu de
-- football » quand Wikipédia dit « Sport »), ceux dont Wikipédia confirme la famille
-- principale (la première : « Jeu de catch » → sport), et les thèmes.
delete from public.game_genre gg
using public.genre ge, import_genre_game t
where ge.id = gg.genre_id
  and gg.game_id = t.id
  and cardinality(ge.families) > 0
  and not (ge.families <@ t.families or ge.families[1] = any (t.families));

insert into public.game_genre (game_id, genre_id)
select g.id, ge.id
from import_genre i
join public.game g on g.wikidata_id = i.game_qid
join public.genre ge on ge.wikidata_id = i.genre_qid
where g.id in (select id from import_genre_game)
on conflict do nothing;

drop table import_genre_game;
drop table import_genre;
`);
console.log(`\nMigration écrite : supabase/migrations/${stamp}_import_genres_wikipedia.sql`);
