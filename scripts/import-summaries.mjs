// =====================================================================
// Carte Mémoire · Résumés des jeux depuis Wikipédia en français
//
// 1. lit dans la base (API publique, en lecture seule) les jeux qui ont un
//    identifiant Wikidata et pas encore de résumé ;
// 2. demande à Wikidata l'article Wikipédia français de chacun ;
// 3. récupère l'introduction de l'article, en texte brut ;
// 4. écrit une migration SQL qui remplit game.summary et game.summary_source
//    (lien de l'article : obligatoire, licence CC BY-SA 4.0).
// Un résumé déjà présent (écrit par la communauté) n'est jamais écrasé.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-summaries.mjs            → écrit la migration
//   node scripts/import-summaries.mjs --dry-run  → affiche seulement le bilan
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const USER_AGENT = 'carte-memoire-import/1.0 (projet personnel, import ponctuel)';
const dryRun = process.argv.includes('--dry-run');
const MAX_LENGTH = 1500;
const MIN_LENGTH = 60;

// --- Adresse et clé PUBLIQUE du projet, lues dans web/.env.local
const env = Object.fromEntries(
  readFileSync(join(ROOT, 'web', '.env.local'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const PUBLIC_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !PUBLIC_KEY) throw new Error('web/.env.local incomplet');

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, label, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init.headers } });
    let problem;
    if (res.ok) {
      const text = await res.text();
      try { return JSON.parse(text); } catch { problem = 'réponse incomplète'; }
    } else if ([429, 500, 502, 503, 504].includes(res.status)) {
      problem = `serveur occupé (${res.status})`;
    } else {
      throw new Error(`Réponse ${res.status} pour « ${label} »`);
    }
    if (attempt >= 4) throw new Error(`${problem} pour « ${label} », abandon`);
    const wait = Number(res.headers.get('retry-after')) || attempt * 10;
    console.log(`  ${label} : ${problem}, nouvel essai dans ${wait} s`);
    await pause(wait * 1000);
  }
}


// ---------------------------------------------------------------------
// 1. Les jeux à compléter
// ---------------------------------------------------------------------
console.log('Lecture des jeux sans résumé…');
const games = [];
for (let offset = 0; ; offset += 1000) {
  const page = await getJson(
    `${SUPABASE_URL}/rest/v1/game?select=id,title,wikidata_id&wikidata_id=not.is.null&summary=is.null&order=id&limit=1000&offset=${offset}`,
    'base de données',
    { headers: { apikey: PUBLIC_KEY } },
  );
  games.push(...page);
  if (page.length < 1000) break;
}
console.log(`  ${games.length} jeux avec un identifiant Wikidata et sans résumé`);


// ---------------------------------------------------------------------
// 2. Article Wikipédia français de chaque jeu (via Wikidata)
// ---------------------------------------------------------------------
console.log('Recherche des articles en français…');
const frTitle = new Map(); // QID → titre de l'article
for (let i = 0; i < games.length; i += 50) {
  const ids = games.slice(i, i + 50).map((g) => g.wikidata_id);
  const json = await getJson(
    `https://www.wikidata.org/w/api.php?${new URLSearchParams({
      action: 'wbgetentities', ids: ids.join('|'), props: 'sitelinks', sitefilter: 'frwiki', format: 'json',
    })}`,
    `Wikidata ${i + 1}`,
  );
  for (const [qid, entity] of Object.entries(json.entities ?? {})) {
    const title = entity.sitelinks?.frwiki?.title;
    if (title) frTitle.set(qid, title);
    // Identifiant redirigé vers un autre : on garde l'identifiant demandé
    if (entity.redirects?.from && title) frTitle.set(entity.redirects.from, title);
  }
  await pause(2000); // politesse envers Wikimedia : sinon refus temporaire (429)
}
console.log(`  ${frTitle.size} jeux ont un article en français`);


// ---------------------------------------------------------------------
// 3. Introduction de chaque article, en texte brut
// ---------------------------------------------------------------------
console.log('Lecture des introductions…');
const extracts = new Map(); // titre demandé → { text, url }
const titles = [...new Set(frTitle.values())];
for (let i = 0; i < titles.length; i += 20) {
  const batch = titles.slice(i, i + 20);
  const json = await getJson(
    `https://fr.wikipedia.org/w/api.php?${new URLSearchParams({
      action: 'query', prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1',
      exlimit: '20', redirects: '1', titles: batch.join('|'), format: 'json', formatversion: '2',
    })}`,
    `Wikipédia ${i + 1}`,
  );
  const follow = new Map();
  for (const n of json.query?.normalized ?? []) follow.set(n.from, n.to);
  for (const r of json.query?.redirects ?? []) follow.set(r.from, r.to);
  const pages = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
  for (const t of batch) {
    let target = t;
    for (let hops = 0; follow.has(target) && hops < 3; hops++) target = follow.get(target);
    const page = pages.get(target);
    if (page?.extract) extracts.set(t, { text: page.extract, url: page.fullurl });
  }
  await pause(2000); // politesse envers Wikimedia : sinon refus temporaire (429)
}

// Nettoyage du texte brut
const stats = { short: 0, disambiguation: 0, cut: 0 };
function clean(raw) {
  let text = raw
    // Parenthèses en écriture japonaise (titre original, transcription) : trop longues pour un résumé
    .replace(/\s*[(（][^()（）]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][^()（）]*[)）]/gu, '')
    // Parenthèses vidées par la conversion en texte brut : « ( ; ) », « (, ) »…
    .replace(/\s*\(\s*[,;:–\-\s]*\)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.;:])/g, '$1')
    .trim();
  if (/^.{0,120}(peut désigner|peut faire référence|peut renvoyer)/s.test(text)) { stats.disambiguation++; return null; }

  // Les premiers paragraphes, sans dépasser MAX_LENGTH ; coupe à la fin d'une phrase
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  let summary = '';
  for (const p of paragraphs) {
    if (summary && summary.length + p.length + 2 > MAX_LENGTH) break;
    summary += (summary ? '\n\n' : '') + p;
    if (summary.length >= 600) break;
  }
  if (summary.length > MAX_LENGTH) {
    const cut = summary.slice(0, MAX_LENGTH);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    summary = end > MIN_LENGTH ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
    stats.cut++;
  }
  if (summary.length < MIN_LENGTH) { stats.short++; return null; }
  return summary;
}

const rows = [];
for (const g of games) {
  const title = frTitle.get(g.wikidata_id);
  const extract = title && extracts.get(title);
  if (!extract) continue;
  const summary = clean(extract.text);
  if (summary) rows.push({ qid: g.wikidata_id, title: g.title, summary, url: extract.url });
}

const avg = rows.length ? Math.round(rows.reduce((n, r) => n + r.summary.length, 0) / rows.length) : 0;
console.log(`
Bilan
  Jeux sans résumé            ${games.length}
  Avec un article français    ${frTitle.size}
  Introductions récupérées    ${extracts.size}
  Résumés retenus             ${rows.length}  (longueur moyenne ${avg} caractères, ${stats.cut} raccourcis)
  Écartés                     ${stats.short} trop courts, ${stats.disambiguation} pages d'homonymie
`);
for (const r of rows.filter((r) => ['Final Fantasy VII', 'Crash Bandicoot', 'Metal Gear Solid'].includes(r.title))) {
  console.log(`--- ${r.title} (${r.url})\n${r.summary}\n`);
}

if (dryRun) process.exit(0);


// ---------------------------------------------------------------------
// 4. Migration SQL
// ---------------------------------------------------------------------
const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
const now = new Date();
const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
const file = join(ROOT, 'supabase', 'migrations', `${stamp}_import_summaries_fr.sql`);
const values = [];
for (let i = 0; i < rows.length; i += 200) {
  values.push(`insert into import_summary (wikidata_id, summary, source) values\n  ${rows
    .slice(i, i + 200)
    .map((r) => `(${lit(r.qid)}, ${lit(r.summary)}, ${lit(r.url)})`)
    .join(',\n  ')};`);
}

writeFileSync(file, `-- =====================================================================
-- Carte Mémoire · Résumés des jeux : introduction des articles de Wikipédia en français
-- Fichier GÉNÉRÉ par scripts/import-summaries.mjs le ${now.toISOString().slice(0, 10)} : ne pas modifier à la main.
--
-- Textes issus de Wikipédia en français, licence CC BY-SA 4.0
--   https://creativecommons.org/licenses/by-sa/4.0/deed.fr
-- Chaque résumé garde l'adresse de son article (game.summary_source), affichée
-- sur la fiche du jeu. Auteurs : voir l'historique de chaque article.
--
-- ${rows.length} résumés. Un résumé déjà présent n'est jamais écrasé.
-- =====================================================================

create temporary table import_summary (wikidata_id text primary key, summary text not null, source text not null);

${values.join('\n\n')}

update public.game g
set summary = i.summary, summary_source = i.source
from import_summary i
where g.wikidata_id = i.wikidata_id
  and g.summary is null;

drop table import_summary;
`);
console.log(`Migration écrite : supabase/migrations/${stamp}_import_summaries_fr.sql`);
