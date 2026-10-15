// =====================================================================
// Carte Mémoire · Correction des studios mal rattachés à l'import Wikipédia
//
// L'import prenait comme nom de studio le titre de l'article visé par le lien,
// après redirection : « Acclaim Studios Austin » devenait « List of Acclaim
// Entertainment subsidiaries » ; un lien ambigu « Starfish » visait l'étoile de mer.
// Ce script :
//   1. repère les studios des jeux PS1 dont l'élément Wikidata n'est ni une
//      entreprise ni une personne (liste, jeu, animal, notion…) ;
//   2. relit les listes Wikipédia des jeux PS1 et retrouve, jeu par jeu, le texte
//      affiché du lien (le vrai nom du studio) ;
//   3. écrit une migration : chaque jeu est rattaché au bon studio (existant, ou
//      créé), les faux liens Wikidata et les pays qui en venaient sont retirés.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/fix-developer-companies.mjs           → bilan seul
//   node scripts/fix-developer-companies.mjs --ecrire  → écrit la migration
// =====================================================================

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, normalize, publicApi, readEnv } from './lib/redump.mjs';
import { stripTags } from './lib/text.mjs';

const write = process.argv.includes('--ecrire');
const CACHE = join(ROOT, '.origins-import');
mkdirSync(CACHE, { recursive: true });

// Pays sûrs de studios connus, dont le lien Wikidata était faux (vérifiés à la main)
const KNOWN_COUNTRIES = {
  'Kalisto': 'FR', 'Tek 5': 'FR', 'Amazing Studio': 'FR',
  'Warthog': 'GB', 'Silicon Dreams': 'GB', 'Glass Ghost': 'GB',
  'Cave': 'JP', 'Flagship': 'JP', 'Ponos': 'JP', 'Starfish': 'JP',
  'The Neverhood': 'US',
};

async function post(url, params) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, Accept: 'application/json, application/sparql-results+json' },
      body: new URLSearchParams(params),
    });
    if (res.ok) {
      try { return JSON.parse(await res.text()); } catch { /* réponse coupée : on réessaie */ }
    }
    await new Promise((r) => setTimeout(r, attempt * 8000));
  }
  throw new Error(`${url} indisponible`);
}

async function cached(name, compute) {
  const file = join(CACHE, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const value = await compute();
  writeFileSync(file, JSON.stringify(value));
  return value;
}


// ---------------------------------------------------------------------
// 1. Studios des jeux PS1, et ceux dont l'élément Wikidata n'est pas une entreprise
// ---------------------------------------------------------------------
console.log('Studios des jeux PS1…');
const api = publicApi(readEnv());
const links = [];
for (let o = 0; ; o += 1000) {
  const page = await api(`game_developer?select=company(id,name,wikidata_id,country),game!inner(title,release!inner(platform_id))&game.release.platform_id=eq.1&limit=1000&offset=${o}`);
  links.push(...page);
  if (page.length < 1000) break;
}
const companies = new Map();
for (const l of links) {
  const c = companies.get(l.company.id) ?? { ...l.company, games: new Set() };
  c.games.add(l.game.title);
  companies.set(l.company.id, c);
}
const withWd = [...companies.values()].filter((c) => c.wikidata_id);

const kinds = await cached('types-studios.json', async () => {
  const out = {};
  for (let i = 0; i < withWd.length; i += 80) {
    const json = await post('https://query.wikidata.org/sparql', { query: `SELECT ?item ?ok WHERE {
      VALUES ?item { ${withWd.slice(i, i + 80).map((c) => `wd:${c.wikidata_id}`).join(' ')} }
      BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q43229 } || EXISTS { ?item wdt:P31/wdt:P279* wd:Q210167 }
           || EXISTS { ?item wdt:P31/wdt:P279* wd:Q1137109 } || EXISTS { ?item wdt:P31 wd:Q5 } AS ?ok)
    }` });
    for (const b of json.results.bindings) out[b.item.value.split('/').pop()] = b.ok.value === 'true';
  }
  return out;
});
const bad = withWd.filter((c) => !kinds[c.wikidata_id]);
console.log(`  ${companies.size} studios, ${bad.length} rattachés à un élément Wikidata qui n'est pas une entreprise`);


// ---------------------------------------------------------------------
// 2. Le texte affiché dans les listes Wikipédia, jeu par jeu
// ---------------------------------------------------------------------
console.log('Listes Wikipédia des jeux PS1…');
const PAGES = ['List of PlayStation (console) games (A–L)', 'List of PlayStation (console) games (M–Z)'];
const wikitext = await cached('listes-wikipedia.json', async () => {
  const texts = [];
  for (const page of PAGES) {
    const json = await post('https://en.wikipedia.org/w/api.php', { action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: page, format: 'json', formatversion: '2' });
    texts.push(json.query.pages[0].revisions[0].slots.main.content);
  }
  return texts;
});
const rows = wikitext.flatMap((t) => t.split(/\n\|-/));
const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const clean = (s) => stripTags(s.replace(/'{2,}/g, '')).replace(/\s+/g, ' ').trim();
// Première cellule de la ligne : le titre du jeu
const titleOf = (row) => normalize(clean((row.split('\n').find((l) => /^\s*[|!]/.test(l)) ?? '').replace(/^\s*[|!]+/, '').replace(/\{\{[^}]*\}\}/g, '').replace(LINK, (_, t, d) => d ?? t)));

const wanted = new Map(); // titre normalisé → lignes
for (const c of bad) for (const g of c.games) wanted.set(normalize(g), []);
for (const row of rows) {
  const key = titleOf(row);
  if (wanted.has(key)) wanted.get(key).push(row);
}

// Cibles de liens de ces lignes, après redirection
const targets = new Set();
for (const list of wanted.values()) for (const row of list) for (const m of row.matchAll(LINK)) targets.add(m[1].trim());
const resolved = await cached('redirections-studios.json', async () => {
  const out = {};
  const all = [...targets];
  for (let i = 0; i < all.length; i += 50) {
    const json = await post('https://en.wikipedia.org/w/api.php', { action: 'query', redirects: '1', titles: all.slice(i, i + 50).join('|'), format: 'json', formatversion: '2' });
    const follow = new Map();
    for (const n of json.query.normalized ?? []) follow.set(n.from, n.to);
    for (const r of json.query.redirects ?? []) follow.set(r.from, r.to);
    for (const t of all.slice(i, i + 50)) {
      let target = t;
      for (let hops = 0; follow.has(target) && hops < 3; hops++) target = follow.get(target);
      out[t] = target;
    }
  }
  return out;
});

const fixes = []; // { qid, wrongName, game, rightName }
for (const c of bad) {
  for (const game of c.games) {
    let rightName = null;
    for (const row of wanted.get(normalize(game)) ?? []) {
      for (const m of row.matchAll(LINK)) {
        const target = m[1].trim();
        const article = (resolved[target] ?? target).replace(/\s*\([^)]*\)$/, '');
        if (normalize(article) === normalize(c.name)) rightName = clean(m[2] ?? target).replace(/\s*\([^)]*\)$/, '');
      }
    }
    fixes.push({ qid: c.wikidata_id, wrongName: c.name, game, rightName });
  }
}

// Jeux introuvables dans les listes :
//  - studio « unique » mal nommé (« Runic magic » → Runecraft partout) : même vrai nom ;
//  - liste de filiales : la maison mère (vrai, moins précis) ;
//  - nom absurde (une notion, un lieu, le jeu lui-même) : rattachement retiré ;
//  - sinon le nom est plausible : on le garde, seul le lien Wikidata est retiré.
const PARENTS = { 'List of Ubisoft subsidiaries': 'Ubi Soft', 'List of Acclaim Entertainment subsidiaries': 'Acclaim Entertainment' };
const NONSENSE = /^list of /i;
const NONSENSE_NAMES = new Set(['rail transport in Malawi', 'lowland', 'Dimitrij', 'Baldies']);
for (const f of fixes.filter((x) => !x.rightName)) {
  const found = [...new Set(fixes.filter((x) => x.wrongName === f.wrongName && x.rightName).map((x) => x.rightName))];
  if (PARENTS[f.wrongName]) f.rightName = PARENTS[f.wrongName];
  else if (NONSENSE.test(f.wrongName) || NONSENSE_NAMES.has(f.wrongName)) f.unlink = true;
  else if (found.length === 1 && normalize(found[0]) !== normalize(f.wrongName)) f.rightName = found[0];
}

const renamed = fixes.filter((f) => f.rightName && normalize(f.rightName) !== normalize(f.wrongName));
const unlinked = fixes.filter((f) => f.unlink);
const sameName = fixes.filter((f) => f.rightName && normalize(f.rightName) === normalize(f.wrongName));
const notFound = fixes.filter((f) => !f.rightName && !f.unlink);
console.log(`
Bilan (${fixes.length} rattachements jeu → studio)
  Vrai nom retrouvé, différent     ${renamed.length}
  Même nom (seul le lien était faux) ${sameName.length}
  Rattachement retiré (nom absurde) ${unlinked.length}
  Nom gardé, lien Wikidata retiré  ${notFound.length}
`);
const byWrong = new Map();
for (const f of renamed) byWrong.set(f.wrongName, [...(byWrong.get(f.wrongName) ?? []), `${f.game} → ${f.rightName}`]);
for (const [w, list] of byWrong) console.log(`« ${w} » :\n    ${list.join('\n    ')}`);
console.log('\nRattachements retirés :', unlinked.map((f) => `${f.game} (« ${f.wrongName} »)`).join(' | '));
console.log('Noms gardés (lien Wikidata retiré) :', [...new Set([...notFound, ...sameName].map((f) => f.wrongName))].join(', '));

if (!write) process.exit(0);


// ---------------------------------------------------------------------
// 3. Migration (studios repérés par leur faux identifiant Wikidata, jeux par leur titre)
// ---------------------------------------------------------------------
const sql = (s) => (s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`);
const values = (list) => list.map((r) => `  (${r.map(sql).join(', ')})`).join(',\n');
const latest = readdirSync(join(ROOT, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).sort().at(-1);
const clock = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = clock > latest ? clock : String(BigInt(latest) + 100n);
const file = `${stamp}_fix_developer_companies.sql`;
writeFileSync(join(ROOT, 'supabase', 'migrations', file), `-- =====================================================================
-- Carte Mémoire · Studios mal rattachés à l'import Wikipédia
-- Fichier GÉNÉRÉ par scripts/fix-developer-companies.mjs le ${new Date().toISOString().slice(0, 10)}.
--
-- L'import avait pris le titre de l'article visé par le lien (« List of Acclaim
-- Entertainment subsidiaries ») au lieu du texte affiché (« Acclaim Studios Austin »),
-- ou suivi un lien ambigu (« Starfish » → l'étoile de mer). Ici :
--   1. chaque jeu est rattaché à un studio propre au vrai nom (déjà existant, ou créé :
--      même quand le nom était juste, pour ne pas garder deux « Acquire ») ;
--   2. les ${bad.length} faux liens Wikidata, et le pays qui en venait, sont retirés ;
--   3. les pays sûrs de quelques studios connus sont renseignés ;
--   4. les faux studios devenus inutiles sont supprimés.
-- =====================================================================

create temporary table fix_studio (wrong_qid text, game_title text, right_name text);
insert into fix_studio values
${values(fixes.filter((f) => !f.unlink).map((f) => [f.qid, f.game, f.rightName ?? f.wrongName]))};

-- Rattachements à retirer : le « studio » n'en était pas un (une notion, un lieu, le jeu)
create temporary table unlink_studio (wrong_qid text, game_title text);
insert into unlink_studio values
${values(unlinked.map((f) => [f.qid, f.game]))};

-- Les faux studios, repérés avant qu'on efface leur lien Wikidata
create temporary table wrong_studio as
select c.id from public.company c where c.wikidata_id in (${bad.map((c) => sql(c.wikidata_id)).join(', ')});

-- 1. Les studios au vrai nom qui n'existent pas encore
insert into public.company (name)
select distinct on (public.normalize_name(f.right_name)) f.right_name
from fix_studio f
where not exists (
  select 1 from public.company c
  where c.name_key = public.normalize_name(f.right_name) and c.id not in (select id from wrong_studio)
)
order by public.normalize_name(f.right_name), f.right_name;

-- Pour chaque rattachement : le bon studio (celui qui a un lien Wikidata d'abord)
create temporary table relink as
select gd.game_id, gd.company_id as wrong_id,
       (select c.id from public.company c
        where c.name_key = public.normalize_name(f.right_name) and c.id not in (select id from wrong_studio)
        order by (c.wikidata_id is not null) desc, c.id limit 1) as right_id
from fix_studio f
join public.company wrong on wrong.wikidata_id = f.wrong_qid
join public.game_developer gd on gd.company_id = wrong.id
join public.game g on g.id = gd.game_id and g.title = f.game_title;

-- 2. Rattachement (si le jeu a déjà le bon studio, on retire seulement le faux)
delete from public.game_developer gd using relink r
where gd.game_id = r.game_id and gd.company_id = r.wrong_id
  and exists (select 1 from public.game_developer d where d.game_id = r.game_id and d.company_id = r.right_id);
update public.game_developer gd set company_id = r.right_id
from relink r
where gd.game_id = r.game_id and gd.company_id = r.wrong_id;

delete from public.game_developer gd
using unlink_studio u, public.company wrong, public.game g
where wrong.wikidata_id = u.wrong_qid and gd.company_id = wrong.id and g.id = gd.game_id and g.title = u.game_title;

-- 3. Plus de faux lien Wikidata, ni de pays qui en venait
update public.company set wikidata_id = null, country = null where id in (select id from wrong_studio);

-- 4. Pays sûrs de studios connus (sans écraser un pays déjà renseigné)
update public.company c set country = v.country
from (values
${values(Object.entries(KNOWN_COUNTRIES))}
) as v (name, country)
where c.name_key = public.normalize_name(v.name) and c.country is null;

-- 5. Faux studios qui ne servent plus à rien
delete from public.company c
where c.id in (select id from wrong_studio)
  and not exists (select 1 from public.game_developer gd where gd.company_id = c.id)
  and not exists (select 1 from public.release_company rc where rc.company_id = c.id);

drop table fix_studio, unlink_studio, wrong_studio, relink;
`);
console.log(`\nMigration écrite : supabase/migrations/${file}`);
