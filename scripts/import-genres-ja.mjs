// =====================================================================
// Carte Mémoire · Genres des jeux japonais depuis Wikipédia en japonais
//
// Beaucoup de jeux sortis seulement au Japon n'ont pas d'article en anglais, et
// nos titres sont romanisés (« Nankuro ») alors que Wikipédia les écrit en
// japonais (« ナンクロ »). On les relie par la liste japonaise des jeux PS1
// (« PlayStationのゲームタイトル一覧 », une page par année), qui donne pour
// chaque jeu sa date de sortie et son éditeur :
//   1. les dates où un seul jeu est sorti au Japon, dans notre base comme dans
//      la liste : le lien est sûr, et il apprend comment chaque éditeur s'écrit
//      en japonais (« Success » = « サクセス ») ;
//   2. les autres dates : même date ET éditeur appris, et un seul candidat ;
//   3. pour chaque jeu relié, le genre de l'encadré de son article japonais.
// Les réponses sont gardées dans .genres-import/ (non versionné).
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-genres-ja.mjs           → analyse seule (rien n'est écrit dans la base)
//   node scripts/import-genres-ja.mjs --ecrire  → écrit la migration
//
// Toutes les correspondances retenues ont été relues à la main (2026-10-10) ;
// celles qui étaient fausses ou douteuses sont écartées dans EXCLUDED.
// =====================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, normalize, publicApi, readEnv } from './lib/redump.mjs';

const write = process.argv.includes('--ecrire');
const CACHE_DIR = join(ROOT, '.genres-import');

// Relecture : correspondance fausse (Ecsaform n'est pas Digimon World) ou genre douteux
// (« RPG de simulation amoureuse », disque bonus de Tokimeki Memorial)
const EXCLUDED = new Set([2620, 3874, 4263]);
const CACHE = join(CACHE_DIR, 'wikipedia-ja.json');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const jawiki = (params) => `https://ja.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;

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

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
cache.lists ??= {};
cache.infobox ??= {};
const save = () => { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); };


// ---------------------------------------------------------------------
// 1. La liste japonaise des jeux PS1
// ---------------------------------------------------------------------
const PAGES = ['1994年-1995年', '1996年', '1997年', '1998年', '1999年', '2000年', '2001年', '2002年', '2003年-2004年']
  .map((y) => `PlayStationのゲームタイトル一覧 (${y})`);
for (const page of PAGES.filter((p) => !(p in cache.lists))) {
  console.log(`Wikipédia (ja) : ${page}`);
  const data = await getJson(jawiki({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: page }), page);
  cache.lists[page] = data.query.pages[0].revisions?.[0]?.slots?.main?.content ?? '';
  save();
  await pause(1000);
}

// Texte lisible d'une cellule : sans références, modèles ni liens
const clean = (s) => s
  .replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '')
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/'''?|<[^>]+>/g, '')
  .trim();

const jaRows = [];
for (const page of PAGES) {
  const firstYear = Number(/(\d{4})年/.exec(page)[1]);
  let year = firstYear;
  for (const line of cache.lists[page].split('\n')) {
    const heading = /^=+\s*(\d{4})年/.exec(line);
    if (heading) { year = Number(heading[1]); continue; }
    const m = /^\|\s*(\d{1,2})月(\d{1,2})日(.*)$/.exec(line);
    if (!m) continue;
    const cells = m[3].split('||');
    if (cells.length < 3) continue;
    const titleCell = cells[1];
    const link = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/.exec(titleCell);
    jaRows.push({
      date: `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
      title: clean(titleCell),
      article: link && !link[1].includes('#') ? link[1].trim() : (link ? link[1].trim() : null),
      anchorOnly: Boolean(link && /#/.test(titleCell.slice(link.index, link.index + link[0].length))),
      publisher: clean(cells[2]),
      notes: clean(cells.slice(3).join(' ')),
    });
  }
}
console.log(`Liste japonaise : ${jaRows.length} jeux`);


// ---------------------------------------------------------------------
// 2. Nos versions japonaises (date et éditeur)
// ---------------------------------------------------------------------
console.log('Lecture de la base…');
const api = publicApi(readEnv());
const [ps1] = await api('platform?select=id&short_name=eq.PS1');
const releases = [];
for (let offset = 0; ; offset += 1000) {
  const page = await api(`release?select=id,game_id,local_title,release_region(release_date,date_precision,region(code)),release_company(role,company(name,wikidata_id)),game(title,genres_reviewed,game_genre(genre(families)))&platform_id=eq.${ps1.id}&zone=eq.NTSC-J&order=id&limit=1000&offset=${offset}`);
  releases.push(...page);
  if (page.length < 1000) break;
}
const ours = releases.map((r) => {
  const dates = r.release_region.filter((x) => x.date_precision === 'day' && x.release_date);
  const jp = dates.find((x) => x.region.code === 'JP') ?? dates[0];
  return {
    releaseId: r.id,
    gameId: r.game_id,
    title: r.game.title,
    date: jp?.release_date ?? null,
    publisher: r.release_company.find((c) => c.role === 'publisher')?.company.name ?? null,
    publisherQid: r.release_company.find((c) => c.role === 'publisher')?.company.wikidata_id ?? null,
    needsGenre: !r.game.genres_reviewed && !r.game.game_genre.some((gg) => gg.genre.families.length > 0),
  };
}).filter((r) => r.date);
console.log(`  ${ours.length} versions japonaises datées au jour près, dont ${ours.filter((r) => r.needsGenre).length} de jeux sans genre`);


// ---------------------------------------------------------------------
// 3. Correspondances
// ---------------------------------------------------------------------
const group = (list, key) => list.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]), new Map());
const oursByDate = group(ours, (r) => r.date);
const jaByDate = group(jaRows, (r) => r.date);
const pubKey = (s) => normalize(s ?? '');

// 3a. Nom japonais de nos éditeurs, d'après leur fiche Wikidata (libellé et alias en japonais)
cache.companyJa ??= {};
const companyQids = [...new Set(ours.map((r) => r.publisherQid).filter((q) => q && !(q in cache.companyJa)))];
for (const [i, ids] of chunks(companyQids, 50).entries()) {
  console.log(`Wikidata : éditeurs ${i + 1}/${Math.ceil(companyQids.length / 50)}`);
  const data = await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|aliases', languages: 'ja', format: 'json' })}`, 'Wikidata');
  for (const q of ids) {
    const e = data.entities?.[q];
    cache.companyJa[q] = [e?.labels?.ja?.value, ...(e?.aliases?.ja ?? []).map((a) => a.value)].filter(Boolean);
  }
  save();
  await pause(1000);
}

// Éditeur japonais possible pour chacun de nos éditeurs : Wikidata, puis ce qu'on apprend
const publisherMap = new Map(); // éditeur (romanisé) → Set(éditeurs japonais)
for (const r of ours) {
  const names = (cache.companyJa[r.publisherQid] ?? []).map(pubKey).filter(Boolean);
  if (names.length) publisherMap.set(pubKey(r.publisher), new Set([...(publisherMap.get(pubKey(r.publisher)) ?? []), ...names]));
}
const fromWikidata = publisherMap.size;
const samePublisher = (r, ja) => {
  const known = publisherMap.get(pubKey(r.publisher));
  // Égalité stricte (« バンダイ » n'est pas « バンダイビジュアル ») ; null : éditeur inconnu
  return known ? known.has(pubKey(ja.publisher)) : null;
};

// 3b. Par élimination, date par date, jusqu'à ce que plus rien ne bouge :
//   - un seul jeu de chaque côté (et éditeurs non contradictoires) → relié ;
//   - sinon, un jeu dont l'éditeur japonais est connu et seul candidat de cet éditeur → relié.
// Chaque lien sûr apprend l'écriture japonaise de l'éditeur.
const matches = new Map(); // releaseId → { ja, how }
const usedJa = new Set();
const learned = new Map(); // éditeur (romanisé) → Map(éditeur japonais → nombre)
function link(r, ja, how) {
  matches.set(r.releaseId, { ja, how });
  usedJa.add(ja);
  if (!r.publisher) return;
  const counts = learned.get(pubKey(r.publisher)) ?? new Map();
  counts.set(pubKey(ja.publisher), (counts.get(pubKey(ja.publisher)) ?? 0) + 1);
  learned.set(pubKey(r.publisher), counts);
}
for (let round = 1, changed = true; changed; round++) {
  changed = false;
  for (const [date, list] of oursByDate) {
    const left = list.filter((r) => !matches.has(r.releaseId));
    const ja = (jaByDate.get(date) ?? []).filter((x) => !usedJa.has(x));
    if (left.length === 0 || ja.length === 0) continue;
    if (left.length === 1 && ja.length === 1 && samePublisher(left[0], ja[0]) !== false) {
      link(left[0], ja[0], round === 1 ? 'seul ce jour-là' : 'seul restant ce jour-là');
      changed = true;
      continue;
    }
    for (const r of left) {
      if (!publisherMap.has(pubKey(r.publisher))) continue;
      const candidates = ja.filter((x) => samePublisher(r, x));
      const rivals = left.filter((x) => pubKey(x.publisher) === pubKey(r.publisher));
      if (candidates.length === 1 && rivals.length === 1) {
        link(r, candidates[0], 'même date et même éditeur');
        changed = true;
      }
    }
  }
  // Éditeurs appris : vus au moins 2 fois, et dans au moins 80 % des cas
  for (const [ourPub, counts] of learned) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const [best, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (n >= 2 && n / total >= 0.8 && !publisherMap.get(ourPub)?.has(best)) {
      publisherMap.set(ourPub, new Set([...(publisherMap.get(ourPub) ?? []), best]));
      changed = true;
    }
  }
}
console.log(`Éditeurs connus en japonais : ${fromWikidata} par Wikidata, ${publisherMap.size - fromWikidata} appris`);
console.log(`Correspondances : ${matches.size} versions japonaises reliées`);

const needed = ours.filter((r) => r.needsGenre);
const neededMatched = needed.filter((r) => matches.has(r.releaseId));
const withArticle = neededMatched.filter((r) => matches.get(r.releaseId).ja.article);
console.log(`
Jeux sans genre (versions japonaises datées)   ${needed.length}
  reliés à la liste japonaise                  ${neededMatched.length}
  … dont avec un article                       ${withArticle.length}
`);

console.log('Échantillon régulier, pour vérifier les correspondances :');
for (const r of neededMatched.filter((_, i) => i % Math.max(1, Math.floor(neededMatched.length / 30)) === 0).slice(0, 30)) {
  const m = matches.get(r.releaseId);
  console.log(`  ${r.date}  ${r.title.slice(0, 38).padEnd(38)} ${(r.publisher ?? '').slice(0, 16).padEnd(16)} ⇄ ${m.ja.title.slice(0, 24)}（${m.ja.publisher.slice(0, 12)}）[${m.how}]`);
}
writeFileSync(join(CACHE_DIR, 'correspondances-ja.txt'), neededMatched
  .map((r) => { const m = matches.get(r.releaseId); return `${r.date} | ${r.title} | ${r.publisher ?? ''} ⇄ ${m.ja.title} | ${m.ja.publisher} | ${m.how} | ${m.ja.article ?? '(pas d\'article)'} | ${m.ja.notes}`; })
  .join('\n'));
console.log('\nListe complète : .genres-import/correspondances-ja.txt');


// ---------------------------------------------------------------------
// 4. Genre de l'encadré de chaque article japonais
//    (un lien vers une section, ou un article qui redirige vers la série, ne
//    parle pas que de ce jeu : ignorés)
// ---------------------------------------------------------------------
cache.redirected ??= {};
const articles = [...new Set(neededMatched.map((r) => matches.get(r.releaseId).ja).filter((x) => x.article && !x.anchorOnly).map((x) => x.article))]
  .filter((t) => !(t in cache.infobox));
for (const [i, batch] of chunks(articles, 50).entries()) {
  console.log(`Wikipédia (ja) : encadrés ${i + 1}/${Math.ceil(articles.length / 50)}`);
  const data = await getJson(jawiki({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', rvsection: '0', redirects: '1', titles: batch.join('|') }), 'encadrés');
  const back = new Map((data.query.redirects ?? []).map((r) => [r.to, r.from]));
  const norm = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of data.query.pages) {
    let original = p.title;
    const wasRedirect = back.has(original);
    if (wasRedirect) original = back.get(original);
    if (norm.has(original)) original = norm.get(original);
    const text = p.revisions?.[0]?.slots?.main?.content ?? '';
    const m = /\|\s*Genre\s*=\s*([^\n]*)/i.exec(text);
    cache.infobox[original] = m ? m[1].replace(/<ref[\s\S]*?(\/>|<\/ref>)/g, '').trim() : null;
    cache.redirected[original] = wasRedirect;
  }
  for (const t of batch) if (!(t in cache.infobox)) { cache.infobox[t] = null; cache.redirected[t] = false; }
  save();
  await pause(1000);
}

const genreOf = (r) => {
  const ja = matches.get(r.releaseId).ja;
  if (!ja.article || ja.anchorOnly || cache.redirected[ja.article]) return null;
  return cache.infobox[ja.article] || null;
};
const withGenreJa = neededMatched.filter(genreOf);
console.log(`\nJeux sans genre reliés, avec un genre dans l'encadré japonais : ${withGenreJa.length}`);
const values = new Map();
for (const r of withGenreJa) { const v = clean(genreOf(r)); values.set(v, (values.get(v) ?? 0) + 1); }
console.log('Genres cités :');
for (const [v, n] of [...values].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${v}`);


// ---------------------------------------------------------------------
// 5. Genres japonais → genres de notre base (identifiants Wikidata)
//    On cherche les termes du plus long au plus court : « シミュレーションRPG »
//    (RPG tactique) passe avant « シミュレーション » et « RPG ».
// ---------------------------------------------------------------------
const JA_TERMS = [
  ['恋愛シミュレーション', 'Q1339223'], ['シミュレーションRPG', 'Q1529437'], ['タクティカルRPG', 'Q1529437'],
  ['アクションRPG', 'Q1422746'], ['アクションアドベンチャー', 'Q343568'], ['アクションパズル', 'Q11282930'],
  ['歴史シミュレーション', 'Q472055'], ['戦略シミュレーション', 'Q472055'], ['ストラテジー', 'Q472055'], ['リコエイション', 'Q472055'],
  // « Temps réel » et « élevage » désignent ici des simulations de vie (World Neverland, Winning Post), pas des RTS
  ['リアルタイムシミュレーション', 'Q1610017'], ['経営シミュレーション', 'Q1036289'], ['育成シミュレーション', 'Q1610017'],
  ['競馬', 'Q108611897'], ['ジョッキー', 'Q108611897'], ['ポイント・アンド・クリック', 'Q11590806'],
  ['恋愛アドベンチャー', 'Q14411698'], ['サウンドノベル', 'Q689445'], ['ビジュアルノベル', 'Q689445'], ['ノベルゲーム', 'Q689445'],
  ['ロールプレイング', 'Q744038'], ['RPG', 'Q744038'], ['アドベンチャー', 'Q23916'], ['シミュレーション', 'Q1610017'],
  ['ボードゲーム', 'Q19272838'], ['テーブルゲーム', 'Q19272838'], ['すごろく', 'Q19272838'], ['サイコロゲーム', 'Q19272838'],
  ['固定画面シューティング', 'Q96146284'], ['ガンシューティング', 'Q3965952'], ['シューティング', 'Q1044478'],
  ['対戦格闘', 'Q846224'], ['格闘ゲーム', 'Q846224'], ['ミニゲーム集', 'Q126598654'], ['パズル', 'Q54767'],
  ['アクション', 'Q270948'], ['レースゲーム', 'Q860750'], ['レーシング', 'Q860750'], ['音楽ゲーム', 'Q584105'], ['リズムゲーム', 'Q2632782'],
  ['テニス', 'Q61793886'], ['野球', 'Q62019045'], ['サッカー', 'Q1478420'], ['ゴルフ', 'Q60256879'], ['ボウリング', 'Q61719251'],
  ['プロレス', 'Q105221690'], ['麻雀', 'Q9318902'], ['将棋', 'Q96102031'], ['カジノ', 'Q3742351'], ['クイズ', 'Q11298493'],
  ['釣り', 'Q16935625'], ['フィッシング', 'Q16935625'], ['ピンボール', 'Q653928'], ['スポーツ', 'Q868217'],
].sort((a, b) => b[0].length - a[0].length);

function jaGenres(text) {
  let rest = clean(text ?? '');
  const found = new Set();
  for (const [term, qid] of JA_TERMS) {
    if (rest.includes(term)) {
      found.add(qid);
      rest = rest.split(term).join(' ');
    }
  }
  return [...found];
}

const genreRows = await api('genre?select=id,name,wikidata_id,families&limit=1000');
const genreByQid = new Map(genreRows.filter((g) => g.wikidata_id).map((g) => [g.wikidata_id, g]));
const decided = [];
for (const r of neededMatched) {
  const fromInfobox = jaGenres(genreOf(r));
  const fromNotes = fromInfobox.length ? [] : jaGenres(matches.get(r.releaseId).ja.notes);
  let qids = fromInfobox.length ? fromInfobox : fromNotes;
  // Une « course » de chevaux ou de plateau (backgammon) n'est pas un jeu de course
  if (qids.includes('Q108611897') || qids.includes('Q19272838')) qids = qids.filter((q) => q !== 'Q860750');
  if (EXCLUDED.has(r.gameId)) continue;
  if (qids.length) decided.push({ r, qids, source: fromInfobox.length ? 'encadré' : 'remarque' });
}
const bySource = (s) => decided.filter((d) => d.source === s);
console.log(`
Genres trouvés pour des jeux sans genre :
  par l'encadré de l'article japonais   ${bySource('encadré').length}
  par la remarque de la liste           ${bySource('remarque').length}
`);
const show = (d) => `  ${d.r.title.slice(0, 40).padEnd(40)} ⇄ ${matches.get(d.r.releaseId).ja.title.slice(0, 22).padEnd(22)} → ${d.qids.map((q) => genreByQid.get(q)?.name ?? q).join(', ')}`;
console.log('Par l\'encadré (échantillon) :');
for (const d of bySource('encadré').filter((_, i) => i % 5 === 0)) console.log(show(d));
console.log('\nPar la remarque (échantillon), avec la remarque :');
for (const d of bySource('remarque').filter((_, i) => i % 4 === 0).slice(0, 40)) console.log(`${show(d)}\n      « ${matches.get(d.r.releaseId).ja.notes.slice(0, 70)} »`);

writeFileSync(join(CACHE_DIR, 'genres-ja.txt'), decided
  .map((d) => `${d.r.gameId} | ${d.r.title} ⇄ ${matches.get(d.r.releaseId).ja.title} | ${d.source} : ${d.source === 'encadré' ? clean(genreOf(d.r)) : matches.get(d.r.releaseId).ja.notes.slice(0, 60)} → ${d.qids.map((q) => genreByQid.get(q)?.name ?? q).join(', ')}`)
  .join('\n'));

if (!write) {
  console.log('\nPour écrire la migration : node scripts/import-genres-ja.mjs --ecrire');
  process.exit(0);
}

// ---------------------------------------------------------------------
// 6. Migration SQL (même garde-fous que genres-from-titles)
// ---------------------------------------------------------------------
const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
const rows = [...new Map(decided.map((d) => [d.r.gameId, d])).values()]
  .flatMap((d) => d.qids.map((q) => `(${d.r.gameId}, ${lit(d.r.title)}, ${lit(q)})`));
const latest = readdirSync(join(ROOT, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).sort().at(-1);
const now = new Date();
const clock = now.toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = clock > latest ? clock : String(BigInt(latest) + 100n);
writeFileSync(join(ROOT, 'supabase', 'migrations', `${stamp}_import_genres_wikipedia_ja.sql`), `-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs le ${now.toISOString().slice(0, 10)}.
-- Source : liste « PlayStationのゲームタイトル一覧 » et encadrés des articles
-- (Wikipédia en japonais, CC BY-SA). Correspondances relues à la main.
--
-- ${new Set(decided.map((d) => d.r.gameId)).size} jeux sans genre. Garde-fous : le titre doit être identique, le jeu
-- toujours sans genre, et non revu par un modérateur.
-- =====================================================================

create temporary table ja_genre (
  game_id   bigint not null,
  title     text not null,
  genre_qid text not null
);

insert into ja_genre (game_id, title, genre_qid) values
  ${rows.join(',\n  ')};

create temporary table ja_genre_match as
select distinct t.game_id as listed_id, g.id
from ja_genre t
join public.game g on g.title = t.title
where (g.id = t.game_id or (select count(*) from public.game g2 where g2.title = t.title) = 1)
  and not g.genres_reviewed
  and not exists (
    select 1 from public.game_genre gg join public.genre ge on ge.id = gg.genre_id
    where gg.game_id = g.id and cardinality(ge.families) > 0
  );

insert into public.game_genre (game_id, genre_id)
select m.id, ge.id
from ja_genre t
join ja_genre_match m on m.listed_id = t.game_id
join public.genre ge on ge.wikidata_id = t.genre_qid
on conflict do nothing;

drop table ja_genre_match;
drop table ja_genre;
`);
console.log(`\nMigration écrite : supabase/migrations/${stamp}_import_genres_wikipedia_ja.sql`);
