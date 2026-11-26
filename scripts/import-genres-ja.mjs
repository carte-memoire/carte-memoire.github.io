// =====================================================================
// Carte Mémoire · Genres des jeux japonais depuis Wikipédia en japonais
//
// Beaucoup de jeux sortis seulement au Japon n'ont pas d'article en anglais, donc
// pas de genre : c'est là que manquent la plupart des JRPG. Wikipédia en japonais
// en parle, dans l'encadré de chaque article (« ジャンル »). On trouve l'article de
// deux façons :
//   A. par Wikidata : le jeu a un élément Wikidata relié à un article japonais
//      (sûr : c'est le même élément) ;
//   B. par la liste japonaise des jeux de la console (« PlayStationのゲームタイトル一覧 »,
//      une page par année), qui donne pour chaque jeu sa date et son éditeur ; nos
//      titres sont romanisés (« Nankuro ») et les siens en japonais (« ナンクロ »),
//      on les relie donc par la date :
//        1. les dates où un seul jeu est sorti au Japon, chez nous comme dans la
//           liste : lien sûr, qui apprend comment chaque éditeur s'écrit en japonais ;
//        2. les autres dates : même date ET éditeur connu, un seul candidat.
//      Sans article, la remarque de la liste (« 野球ゲーム ») peut donner le genre.
// Les réponses de Wikipédia sont gardées dans .genres-import/ (non versionné).
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-genres-ja.mjs                         → analyse seule, PlayStation
//   node scripts/import-genres-ja.mjs --console PS2           → analyse seule, PlayStation 2
//   node scripts/import-genres-ja.mjs --console PS2 --ecrire  → écrit la migration
// Relire .genres-import/genres-ja-<console>.txt avant d'écrire : les correspondances
// fausses ou douteuses se mettent dans EXCLUDED (identifiants de jeux).
// =====================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, normalize, publicApi, readEnv } from './lib/redump.mjs';
import { consoleFromArgs, nextMigrationStamp } from './lib/consoles.mjs';
import { stripRefsAndComments, stripTags } from './lib/text.mjs';

const write = process.argv.includes('--ecrire');
const CONSOLE = consoleFromArgs();
const CACHE_DIR = join(ROOT, '.genres-import');

// Relecture (2026-10-10, PS1) : correspondance fausse (Ecsaform n'est pas Digimon World) ou
// genre douteux (« RPG de simulation amoureuse », disque bonus de Tokimeki Memorial)
// Relecture (2026-11-23, PS2) : BeatMania Da Da Da relié à un jeu de football, Marl de Jigsaw
// (puzzle) à la série RPG, Metal Wolf REV classé aventure, PachiPara 12 (pachinko) classé RPG
// Relecture (2026-11-23, PS1 et PS2) : jeux reliés à l'article du MANGA ou de l'animé dont ils
// sont tirés (c'est alors le genre du manga qui ressort) : Hunter × Hunter, Devilman,
// GetBackers, Nūbē, Kuro-chan, Senkai, Votoms, Bobobo, Reborn!, Kenichi, Gunslinger Girl,
// Samurai 7, Ashita no Joe, Kurohime
const EXCLUDED = new Set([2620, 3874, 4263, 7170, 8038, 8061, 8239,
  2932, 2933, 2549, 2202, 2106, 3044, 3882, 4096,
  7540, 7541, 7191, 7851, 8549, 7588, 7589, 8461, 7133, 8656, 8024]);
const CACHE = join(CACHE_DIR, CONSOLE.code === 'PS1' ? 'wikipedia-ja.json' : `wikipedia-ja-${CONSOLE.code.toLowerCase()}.json`);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const jawiki = (params) => `https://ja.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;

async function getJson(url, label) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (res.ok) {
      const text = await res.text();
      try { return JSON.parse(text); } catch { /* page d'erreur : on réessaie */ }
    } else if (![429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`Réponse ${res.status} pour « ${label} »`);
    }
    if (attempt >= 6) throw new Error(`Pas de réponse lisible pour « ${label} »`);
    const wait = Number(res.headers.get('retry-after')) || attempt * 15;
    console.log(`  ${label} : serveur occupé, nouvel essai dans ${wait} s`);
    await pause(wait * 1000);
  }
}

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
cache.lists ??= {};
// Encadrés lus avec la version 2 de l'analyse (genre en « Genre » ou « ジャンル », et la
// première phrase de l'article) : les réponses plus anciennes sont relues
if (cache.infoboxVersion !== 2) { cache.infobox = {}; cache.redirected = {}; cache.infoboxVersion = 2; }
cache.redirected ??= {};
cache.sitelinks ??= {};
const save = () => { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); };


// ---------------------------------------------------------------------
// 1. La liste japonaise des jeux de la console (une page par année)
// ---------------------------------------------------------------------
if (!cache.pages) {
  const prefix = `${CONSOLE.jaWikipediaList} (`;
  const data = await getJson(jawiki({ action: 'query', list: 'prefixsearch', pssearch: prefix, pslimit: '50' }), 'pages de la liste');
  // Les pages par année, et la page principale (qui garde les dernières années : 2008-2013 pour la PS2)
  cache.pages = [...data.query.prefixsearch.map((p) => p.title).filter((t) => t.startsWith(prefix) && /\d{4}年/.test(t)).sort(), CONSOLE.jaWikipediaList];
  save();
}
const PAGES = cache.pages;
for (const page of PAGES.filter((p) => !(p in cache.lists))) {
  console.log(`Wikipédia (ja) : ${page}`);
  const data = await getJson(jawiki({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: page }), page);
  cache.lists[page] = data.query.pages[0].revisions?.[0]?.slots?.main?.content ?? '';
  save();
  await pause(1000);
}

// Texte lisible d'une cellule : sans références, modèles ni liens
const clean = (s) => stripTags(stripRefsAndComments(s ?? '')
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/'''?/g, ''))
  .trim();

const jaRows = [];
for (const page of PAGES) {
  // Année : celle du titre de la page, puis celle de chaque intertitre (« == 2008年 »)
  let year = Number(/(\d{4})年/.exec(page)?.[1] ?? 0) || null;
  for (const line of cache.lists[page].split('\n')) {
    const heading = /^=+\s*(\d{4})年/.exec(line);
    if (heading) { year = Number(heading[1]); continue; }
    // Listes Nintendo (Famicom, Super Famicom, Game Boy) : une seule page, la date japonaise
    // complète, puis les dates nord-américaine et européenne, le titre, l'éditeur et les
    // remarques (« |1983年7月15日||…||…||[[ポパイ]]||任天堂||… »)
    const full = /^\|(?:[^|\n]*\|(?!\|))?\s*(?:<span[^>]*><\/span>)?\s*(\d{4})年(\d{1,2})月(\d{1,2})日(.*)$/.exec(line);
    if (full) {
      const cells = full[4].split('||');
      if (cells.length < 5) continue;
      const titleCell = cells[3];
      const link = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/.exec(titleCell);
      jaRows.push({
        date: `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`,
        title: clean(titleCell.split(/<br\s*\/?>/i)[0]),
        article: link ? link[1].trim() : null,
        anchorOnly: Boolean(link && /#/.test(titleCell.slice(link.index, link.index + link[0].length))),
        publisher: clean(cells[4]),
        notes: clean(cells.slice(5).join(' ')),
      });
      continue;
    }
    const m = /^\|\s*(\d{1,2})月(\d{1,2})日(.*)$/.exec(line);
    if (!m || !year) continue;
    const cells = m[3].split('||');
    if (cells.length < 3) continue;
    const titleCell = cells[1];
    const link = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/.exec(titleCell);
    jaRows.push({
      date: `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
      title: clean(titleCell),
      article: link ? link[1].trim() : null,
      anchorOnly: Boolean(link && /#/.test(titleCell.slice(link.index, link.index + link[0].length))),
      publisher: clean(cells[2]),
      notes: clean(cells.slice(3).join(' ')),
    });
  }
}
console.log(`Liste japonaise (${PAGES.length} pages) : ${jaRows.length} jeux`);


// ---------------------------------------------------------------------
// 2. Nos jeux de la console, et leurs versions japonaises (date et éditeur)
// ---------------------------------------------------------------------
console.log('Lecture de la base…');
const api = publicApi(readEnv());
const [platform] = await api(`platform?select=id&short_name=eq.${CONSOLE.code}`);
const releases = [];
for (let after = 0; ;) {
  const page = await api(`release?select=id,game_id,zone,local_title,release_region(release_date,date_precision,region(code)),release_company(role,company(name,wikidata_id)),game(title,wikidata_id,genres_reviewed,game_genre(genre(families)))&platform_id=eq.${platform.id}&id=gt.${after}&order=id&limit=500`);
  releases.push(...page);
  if (page.length < 500) break;
  after = page.at(-1).id;
}
const needsGenre = (g) => !g.genres_reviewed && !g.game_genre.some((gg) => gg.genre.families.length > 0);
const games = new Map(); // jeu → { id, title, qid, needs }
for (const r of releases) games.set(r.game_id, { id: r.game_id, title: r.game.title, qid: r.game.wikidata_id, needs: needsGenre(r.game) });
const needed = [...games.values()].filter((g) => g.needs && !EXCLUDED.has(g.id));
console.log(`  ${games.size} jeux sur ${CONSOLE.name}, dont ${needed.length} sans genre`);

const ours = releases.filter((r) => r.zone === 'NTSC-J').map((r) => {
  const dates = r.release_region.filter((x) => x.date_precision === 'day' && x.release_date);
  const jp = dates.find((x) => x.region.code === 'JP') ?? dates[0];
  const pub = r.release_company.find((c) => c.role === 'publisher')?.company;
  return { releaseId: r.id, gameId: r.game_id, title: r.game.title, date: jp?.release_date ?? null, publisher: pub?.name ?? null, publisherQid: pub?.wikidata_id ?? null };
}).filter((r) => r.date);
console.log(`  ${ours.length} versions japonaises datées au jour près`);


// ---------------------------------------------------------------------
// 3A. Article japonais par Wikidata (pour les jeux sans genre qui ont un élément)
// ---------------------------------------------------------------------
const qids = [...new Set(needed.map((g) => g.qid).filter((q) => q && !(q in cache.sitelinks)))];
for (const [i, ids] of chunks(qids, 50).entries()) {
  console.log(`Wikidata : articles japonais ${i + 1}/${Math.ceil(qids.length / 50)}`);
  const data = await getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'sitelinks', sitefilter: 'jawiki', format: 'json' })}`, 'Wikidata');
  for (const q of ids) cache.sitelinks[q] = data.entities?.[q]?.sitelinks?.jawiki?.title ?? null;
  save();
  await pause(2000);
}


// ---------------------------------------------------------------------
// 3B. Correspondances avec la liste japonaise (par la date et l'éditeur)
// ---------------------------------------------------------------------
const group = (list, key) => list.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]), new Map());
const oursByDate = group(ours, (r) => r.date);
const jaByDate = group(jaRows, (r) => r.date);
const pubKey = (s) => normalize(s ?? '');

// Nom japonais de nos éditeurs, d'après leur fiche Wikidata (libellé et alias en japonais)
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
  await pause(2000);
}

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

// Par élimination, date par date, jusqu'à ce que plus rien ne bouge
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
console.log(`Correspondances avec la liste : ${matches.size} versions japonaises reliées`);
const listMatchOfGame = new Map();
for (const r of ours) if (matches.has(r.releaseId) && !listMatchOfGame.has(r.gameId)) listMatchOfGame.set(r.gameId, matches.get(r.releaseId));


// ---------------------------------------------------------------------
// 4. Pour chaque jeu sans genre : son article (Wikidata d'abord, la liste sinon)
// ---------------------------------------------------------------------
const plan = needed.map((g) => {
  const viaWikidata = g.qid ? cache.sitelinks[g.qid] : null;
  const viaList = listMatchOfGame.get(g.id) ?? null;
  const listArticle = viaList?.ja.article && !viaList.ja.anchorOnly ? viaList.ja.article : null;
  return { g, article: viaWikidata ?? listArticle, source: viaWikidata ? 'wikidata' : listArticle ? 'liste' : null, list: viaList };
});
const articles = [...new Set(plan.map((p) => p.article).filter((t) => t && !(t in cache.infobox)))];
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
    const m = /\|\s*(?:Genre|ジャンル)\s*=\s*([^\n]*)/i.exec(text);
    cache.infobox[original] = { genre: m ? m[1].replace(/<ref[\s\S]*?(\/>|<\/ref>)/g, '').trim() : null, intro: firstSentence(text) };
    cache.redirected[original] = wasRedirect;
  }
  for (const t of batch) if (!(t in cache.infobox)) { cache.infobox[t] = { genre: null, intro: null }; cache.redirected[t] = false; }
  save();
  await pause(1500);
}

// Le genre de l'encadré ; à défaut, la première phrase de l'article (« …用フライト
// シミュレーションゲーム。 »). Un article qui redirige parle de la série : son genre vaut
// en général pour chaque jeu, mais la relecture le signale.
const infoboxGenre = (p) => (p.article ? cache.infobox[p.article]?.genre || null : null);
const introGenre = (p) => (p.article ? cache.infobox[p.article]?.intro || null : null);
const isSeries = (p) => Boolean(p.article && cache.redirected[p.article]);


// ---------------------------------------------------------------------
// 5. Genres japonais → genres de notre base (identifiants Wikidata)
//    Les termes les plus longs d'abord : « シミュレーションRPG » (RPG tactique) passe
//    avant « シミュレーション » et « RPG ».
// ---------------------------------------------------------------------
const JA_TERMS = [
  ['恋愛シミュレーション', 'Q1339223'], ['シミュレーションRPG', 'Q1529437'], ['タクティカルRPG', 'Q1529437'],
  // beatmania (« DJシミュレーション »), pop'n music (« 音楽シミュレーション ») : des jeux musicaux
  ['DJシミュレーション', 'Q584105'], ['音楽シミュレーション', 'Q584105'],
  ['アクションRPG', 'Q1422746'], ['アクションアドベンチャー', 'Q343568'], ['アクションパズル', 'Q11282930'],
  ['歴史シミュレーション', 'Q472055'], ['戦略シミュレーション', 'Q472055'], ['ストラテジー', 'Q472055'], ['リコエイション', 'Q472055'],
  // « Temps réel » et « élevage » désignent ici des simulations de vie (World Neverland, Winning Post), pas des RTS
  ['リアルタイムシミュレーション', 'Q1610017'], ['経営シミュレーション', 'Q1036289'], ['育成シミュレーション', 'Q1610017'],
  ['競馬', 'Q108611897'], ['ジョッキー', 'Q108611897'], ['ポイント・アンド・クリック', 'Q11590806'],
  ['恋愛アドベンチャー', 'Q14411698'], ['サウンドノベル', 'Q689445'], ['ビジュアルノベル', 'Q689445'], ['ノベルゲーム', 'Q689445'],
  ['ロールプレイング', 'Q744038'], ['RPG', 'Q744038'], ['アドベンチャー', 'Q23916'], ['シミュレーション', 'Q1610017'],
  ['ボードゲーム', 'Q19272838'], ['テーブルゲーム', 'Q19272838'], ['すごろく', 'Q19272838'], ['サイコロゲーム', 'Q19272838'],
  ['固定画面シューティング', 'Q96146284'], ['ガンシューティング', 'Q3965952'], ['シューティング', 'Q1044478'],
  ['対戦格闘', 'Q846224'], ['格闘ゲーム', 'Q846224'], ['格闘アクション', 'Q846224'], ['ミニゲーム集', 'Q126598654'], ['パズル', 'Q54767'],
  ['アクション', 'Q270948'], ['レースゲーム', 'Q860750'], ['レーシング', 'Q860750'], ['音楽ゲーム', 'Q584105'], ['リズムゲーム', 'Q2632782'],
  ['テニス', 'Q61793886'], ['野球', 'Q62019045'], ['サッカー', 'Q1478420'], ['ゴルフ', 'Q60256879'], ['ボウリング', 'Q61719251'],
  ['プロレス', 'Q105221690'], ['麻雀', 'Q9318902'], ['将棋', 'Q96102031'], ['カジノ', 'Q3742351'], ['クイズ', 'Q11298493'],
  ['釣り', 'Q16935625'], ['フィッシング', 'Q16935625'], ['ピンボール', 'Q653928'], ['スポーツ', 'Q868217'],
].sort((a, b) => b[0].length - a[0].length);

// Première phrase de l'article : après l'encadré, le premier paragraphe qui présente le
// jeu (« 『…』は、… ») ; seulement si elle dit de quelle sorte de « ゲーム » il s'agit
function firstSentence(wikitext) {
  let t = stripRefsAndComments(wikitext);
  for (let i = 0; i < 10 && /\{\{[^{}]*\}\}/.test(t); i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t.replace(/\[\[(?:ファイル|画像|File|Image):[^\]]*\]\]/gi, '');
  const paragraph = t.split('\n').map((l) => l.trim()).find((l) => l && !/^[|!{}=*#:;]/.test(l) && /(は|とは)、/.test(l));
  if (!paragraph) return null;
  const sentence = clean(paragraph).split('。')[0];
  return sentence.includes('ゲーム') ? sentence : null;
}

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
for (const p of plan) {
  const fromInfobox = jaGenres(infoboxGenre(p));
  const fromIntro = fromInfobox.length ? [] : jaGenres(introGenre(p));
  const fromNotes = fromInfobox.length || fromIntro.length || !p.list ? [] : jaGenres(p.list.ja.notes);
  let found = (fromInfobox.length ? fromInfobox : fromIntro.length ? fromIntro : fromNotes).filter((q) => genreByQid.has(q));
  // Une « course » de chevaux ou de plateau (backgammon) n'est pas un jeu de course
  if (found.includes('Q108611897') || found.includes('Q19272838')) found = found.filter((q) => q !== 'Q860750');
  const series = isSeries(p) ? ', article de la série' : '';
  const how = fromInfobox.length ? `encadré (${p.source}${series})` : fromIntro.length ? `introduction (${p.source}${series})` : 'remarque de la liste';
  if (found.length) decided.push({ ...p, qids: found, how });
}
const count = (prefix) => decided.filter((d) => d.how.startsWith(prefix)).length;
const rpg = decided.filter((d) => d.qids.some((q) => genreByQid.get(q)?.families.includes('rpg')));
console.log(`
Jeux sans genre sur ${CONSOLE.name}                     ${needed.length}
  avec un article japonais par Wikidata         ${plan.filter((p) => p.source === 'wikidata').length}
  avec un article par la liste japonaise        ${plan.filter((p) => p.source === 'liste').length}
Genres trouvés                                  ${decided.length}
  par l'encadré (article de l'élément Wikidata) ${count('encadré (wikidata')}
  par l'encadré (article trouvé dans la liste)  ${count('encadré (liste')}
  par la première phrase de l'article           ${count('introduction')}
  par la remarque de la liste                   ${count('remarque de la liste')}
  dont l'article est celui de la série          ${decided.filter((d) => d.how.includes('série')).length}
  dont des RPG (JRPG si le studio est japonais) ${rpg.length}
`);
const evidence = (d) => (d.how.startsWith('encadré') ? clean(infoboxGenre(d)) : d.how.startsWith('introduction') ? introGenre(d).slice(0, 90) : d.list.ja.notes.slice(0, 60));
const show = (d) => `${d.g.id} | ${d.g.title} ⇄ ${d.article ?? d.list?.ja.title ?? ''} | ${d.how} : ${evidence(d)} → ${d.qids.map((q) => genreByQid.get(q)?.name ?? q).join(', ')}`;
const reviewFile = join(CACHE_DIR, `genres-ja-${CONSOLE.code.toLowerCase()}.txt`);
writeFileSync(reviewFile, decided.map(show).join('\n'));
console.log(`Liste complète à relire : ${reviewFile}`);
for (const d of decided.filter((_, i) => i % Math.max(1, Math.floor(decided.length / 25)) === 0).slice(0, 25)) console.log(`  ${show(d)}`);

if (!write) {
  console.log(`\nPour écrire la migration : node scripts/import-genres-ja.mjs --console ${CONSOLE.code} --ecrire`);
  process.exit(0);
}


// ---------------------------------------------------------------------
// 6. Migration SQL : seulement des jeux toujours sans genre, non revus par un modérateur
// ---------------------------------------------------------------------
const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
const rows = decided.flatMap((d) => d.qids.map((q) => `(${d.g.id}, ${lit(d.g.title)}, ${lit(q)})`));
const stamp = nextMigrationStamp(ROOT);
const name = `${stamp}_import_genres_wikipedia_ja_${CONSOLE.code.toLowerCase()}.sql`;
const now = new Date();
writeFileSync(join(ROOT, 'supabase', 'migrations', name), `-- =====================================================================
-- Carte Mémoire · Genres de jeux japonais (${CONSOLE.name}) depuis Wikipédia en japonais
-- Fichier GÉNÉRÉ par scripts/import-genres-ja.mjs --console ${CONSOLE.code} le ${now.toISOString().slice(0, 10)}.
-- Source : encadrés des articles (trouvés par Wikidata, ou par la liste
-- « ${CONSOLE.jaWikipediaList} ») et remarques de cette liste ; Wikipédia
-- en japonais, CC BY-SA. Liste relue avant écriture.
--
-- ${decided.length} jeux sans genre. Garde-fous : le titre doit être identique, le jeu
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
console.log(`\nMigration écrite : supabase/migrations/${name}`);
