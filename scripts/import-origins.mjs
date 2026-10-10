// =====================================================================
// Carte Mémoire · Pays des studios et origine des jeux, depuis Wikidata (CC0)
//
// L'origine d'un jeu se déduit du pays de ses studios (migration game_origin).
// Ce script complète ce qui manque, seulement quand Wikidata donne UNE réponse :
//   1. studios (développeurs de jeux PS1) qui ont un identifiant Wikidata mais pas
//      de pays : pays (P17), sinon pays du siège (P159), sinon pays d'origine (P495),
//      seulement si l'élément est bien une entreprise ou une organisation (pas une
//      liste, un jeu…) ; pour un développeur indépendant (une personne), sa nationalité (P27) ;
//   2. jeux dont l'origine reste inconnue : leur pays d'origine (P495).
//
// Étapes (depuis le dossier carte-memoire) :
//   node scripts/import-origins.mjs           → bilan seul (réponses gardées dans .origins-import/)
//   node scripts/import-origins.mjs --ecrire  → écrit la migration dans supabase/migrations/
// =====================================================================

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, publicApi, readEnv } from './lib/redump.mjs';

const write = process.argv.includes('--ecrire');
const CACHE = join(ROOT, '.origins-import');
mkdirSync(CACHE, { recursive: true });

async function sparql(query, label) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) {
      const text = await res.text();
      try {
        return JSON.parse(text).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
      } catch { /* réponse coupée : on réessaie */ }
    } else if (![429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`Wikidata a répondu ${res.status} pour « ${label} »`);
    }
    if (attempt >= 4) throw new Error(`Wikidata indisponible pour « ${label} »`);
    await new Promise((r) => setTimeout(r, attempt * 10_000));
  }
}

// Requête par paquets, avec les réponses gardées en cache (relancer ne réinterroge pas Wikidata)
async function byBatch(name, ids, build, size = 200) {
  const file = join(CACHE, `${name}.json`);
  const cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const todo = ids.filter((id) => !(id in cache));
  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size);
    const rows = await sparql(build(batch.map((q) => `wd:${q}`).join(' ')), `${name} ${i + 1}-${i + batch.length}`);
    for (const id of batch) cache[id] = [];
    for (const r of rows) cache[r.item.split('/').pop()].push(r);
    writeFileSync(file, JSON.stringify(cache));
    console.log(`  ${name} : ${Math.min(i + size, todo.length)} / ${todo.length}`);
  }
  return cache;
}

const single = (values) => {
  const set = [...new Set(values.filter(Boolean))];
  return set.length === 1 ? set[0] : null;
};


// ---------------------------------------------------------------------
// 1. Jeux PS1 et leurs studios
// ---------------------------------------------------------------------
console.log('Lecture des jeux PS1 et de leurs studios…');
const api = publicApi(readEnv());
const [ps1] = await api('platform?select=id&short_name=eq.PS1');
// Avant l'envoi de la migration game_origin, la colonne origin_country n'existe pas encore
const fields = 'id,title,wikidata_id,game_developer(company(id,name,wikidata_id,country)),game_genre(genre(families)),release!inner(platform_id)';
const withOrigin = await api(`game?select=origin_country&limit=1`).then(() => true, () => false);
const games = [];
for (let offset = 0; ; offset += 1000) {
  const page = await api(`game?select=${fields}${withOrigin ? ',origin_country' : ''}&release.platform_id=eq.${ps1.id}&order=id&limit=1000&offset=${offset}`);
  games.push(...page);
  if (page.length < 1000) break;
}
const companies = new Map();
for (const g of games) for (const d of g.game_developer) companies.set(d.company.id, d.company);
console.log(`  ${games.length} jeux, ${companies.size} studios`);

// Même règle que public.origin : choix enregistré, sinon studios tous connus et du même pays
function origin(game, countryOf) {
  if (game.origin_country) return game.origin_country;
  const countries = game.game_developer.map((d) => countryOf(d.company));
  if (!countries.length || countries.some((c) => !c)) return null;
  return single(countries);
}


// ---------------------------------------------------------------------
// 2. Pays des studios
// ---------------------------------------------------------------------
console.log('Pays des studios (Wikidata)…');
const missing = [...companies.values()].filter((c) => !c.country && c.wikidata_id);
const companyAnswers = await byBatch('studios', missing.map((c) => c.wikidata_id), (values) => `
  SELECT ?item ?iso ?hqIso ?originIso ?citizenIso ?org ?human WHERE {
    VALUES ?item { ${values} }
    OPTIONAL { ?item wdt:P17/wdt:P297 ?iso }
    OPTIONAL { ?item wdt:P159/wdt:P17/wdt:P297 ?hqIso }
    OPTIONAL { ?item wdt:P495/wdt:P297 ?originIso }
    OPTIONAL { ?item wdt:P27/wdt:P297 ?citizenIso }
    # Organisation, entreprise, développeur ou éditeur de jeux vidéo (ces deux derniers
    # ne sont pas rangés sous « organisation » dans Wikidata)
    BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q43229 } || EXISTS { ?item wdt:P31/wdt:P279* wd:Q210167 }
         || EXISTS { ?item wdt:P31/wdt:P279* wd:Q1137109 } AS ?org)
    BIND(EXISTS { ?item wdt:P31 wd:Q5 } AS ?human)
  }`, 50);
const companyCountry = new Map();
const notOrganization = [];
for (const c of missing) {
  const rows = companyAnswers[c.wikidata_id] ?? [];
  const human = rows.some((r) => r.human === 'true');
  if (!human && !rows.some((r) => r.org === 'true')) { if (rows.length) notOrganization.push(c.name); continue; }
  const country = human
    ? single(rows.map((r) => r.citizenIso))
    : single(rows.map((r) => r.iso)) ?? single(rows.map((r) => r.hqIso)) ?? single(rows.map((r) => r.originIso));
  if (country) companyCountry.set(c.id, { wikidata_id: c.wikidata_id, name: c.name, country });
}
const countryOf = (company) => company.country ?? companyCountry.get(company.id)?.country ?? null;


// ---------------------------------------------------------------------
// 3. Origine des jeux qui restent inconnus
// ---------------------------------------------------------------------
console.log('Origine des jeux (Wikidata)…');
const unknown = games.filter((g) => !origin(g, countryOf) && g.wikidata_id);
const gameAnswers = await byBatch('jeux', unknown.map((g) => g.wikidata_id), (values) => `
  SELECT ?item ?iso WHERE {
    VALUES ?item { ${values} }
    ?item wdt:P495/wdt:P297 ?iso .
  }`);
const gameOrigin = new Map();
for (const g of unknown) {
  const country = single((gameAnswers[g.wikidata_id] ?? []).map((r) => r.iso));
  if (country) gameOrigin.set(g.id, { wikidata_id: g.wikidata_id, title: g.title, country });
}


// ---------------------------------------------------------------------
// 4. Bilan
// ---------------------------------------------------------------------
const finalOrigin = (g) => origin(g, countryOf) ?? gameOrigin.get(g.id)?.country ?? null;
const isRpg = (g) => g.game_genre.some((x) => x.genre.families.includes('rpg'));
const count = (list, f) => list.filter(f).length;
const rpg = games.filter(isRpg);
console.log(`
Bilan
  Studios sans pays (avec Wikidata)   ${missing.length}, pays trouvé pour ${companyCountry.size}
  Écartés (ni entreprise ni personne) ${notOrganization.length} : ${notOrganization.slice(0, 8).join(', ')}${notOrganization.length > 8 ? '…' : ''}
  Jeux d'origine inconnue (Wikidata)  ${unknown.length}, origine trouvée pour ${gameOrigin.size}

  Jeux d'origine connue               avant ${count(games, (g) => origin(g, (c) => c.country))} → après ${count(games, finalOrigin)} sur ${games.length}
    dont Japon                        ${count(games, (g) => finalOrigin(g) === 'JP')}
  RPG d'origine connue                avant ${count(rpg, (g) => origin(g, (c) => c.country))} → après ${count(rpg, finalOrigin)} sur ${rpg.length}
    JRPG (Japon)                      ${count(rpg, (g) => finalOrigin(g) === 'JP')}
    RPG hors Japon                    ${count(rpg, (g) => finalOrigin(g) && finalOrigin(g) !== 'JP')}
`);
console.log('RPG hors Japon :', rpg.filter((g) => finalOrigin(g) && finalOrigin(g) !== 'JP').map((g) => `${g.title} (${finalOrigin(g)})`).join(' | '));
console.log('\nRPG d\'origine inconnue :', rpg.filter((g) => !finalOrigin(g)).map((g) => g.title).join(' | '));
console.log('\nExemples de studios complétés :', [...companyCountry.values()].slice(0, 15).map((c) => `${c.name} ${c.country}`).join(' | '));

if (!write) process.exit(0);


// ---------------------------------------------------------------------
// 5. Migration (correspondance par identifiant Wikidata : le même partout)
// ---------------------------------------------------------------------
const sql = (s) => `'${String(s).replaceAll("'", "''")}'`;
const values = (map) => [...map.values()].sort((a, b) => a.wikidata_id.localeCompare(b.wikidata_id))
  .map((v) => `  (${sql(v.wikidata_id)}, ${sql(v.country)})`).join(',\n');
const latest = readdirSync(join(ROOT, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).sort().at(-1);
const now = new Date();
const clock = now.toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = clock > latest ? clock : String(BigInt(latest) + 100n);
const file = `${stamp}_import_origins_wikidata.sql`;
writeFileSync(join(ROOT, 'supabase', 'migrations', file), `-- =====================================================================
-- Carte Mémoire · Pays des studios et origine des jeux, depuis Wikidata (CC0)
-- Fichier GÉNÉRÉ par scripts/import-origins.mjs le ${now.toISOString().slice(0, 10)}.
--
-- ${companyCountry.size} studios reçoivent leur pays (P17, sinon siège P159, sinon P495) ;
-- ${gameOrigin.size} jeux d'origine encore inconnue reçoivent leur pays d'origine (P495).
-- Seulement les réponses uniques ; rien de ce qui est déjà renseigné n'est remplacé.
-- =====================================================================

update public.company c
set country = v.country
from (values
${values(companyCountry)}
) as v (wikidata_id, country)
where c.wikidata_id = v.wikidata_id and c.country is null;

-- Après les studios : on ne complète que les jeux dont l'origine reste inconnue
update public.game g
set origin_country = v.country
from (values
${values(gameOrigin)}
) as v (wikidata_id, country)
where g.wikidata_id = v.wikidata_id and g.origin_country is null and public.origin(g) is null;
`);
console.log(`\nMigration écrite : supabase/migrations/${file}`);
