// =====================================================================
// Carte Mémoire · Codes produits (SLES-00868…) depuis Redump
//
// Redump recense chaque disque PS1 à partir de disques réels vérifiés, avec
// le code imprimé dessus. Source : le fichier « Sony - PlayStation.dat » de
// libretro-database (https://github.com/libretro/libretro-database), tiré de Redump.
//
// Pour chaque version PS1 de notre base SANS code produit (zone connue,
// édition standard), on cherche le disque correspondant (même jeu, même zone)
// et on récupère :
//   - le code produit du disque 1 (notre convention) ;
//   - les langues, si la version n'en a pas encore ;
//   - le nombre de disques, si on ne le connaissait pas.
// Rien de ce qui est déjà renseigné n'est écrasé.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-product-codes.mjs            → analyse seule
//   node scripts/import-product-codes.mjs --ecrire   → écrit la migration
// =====================================================================

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, bestMatch, buildIndex, loadPs1Releases, parseName, publicApi, readEnv } from './lib/redump.mjs';

const write = process.argv.includes('--ecrire');
const DAT_URL = 'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation.dat';
const CODE = /^[A-Z]{4}-\d{5}$/;


// ---------------------------------------------------------------------
// 1. Nos versions sans code produit
// ---------------------------------------------------------------------
console.log('Lecture des versions PS1 de la base…');
const api = publicApi(readEnv());
const { releases, keysOfGame } = await loadPs1Releases(api, 'product_code,languages,media_count');
const targets = releases.filter((r) => !r.product_code && r.zone && r.edition_type === 'standard');
console.log(`  ${releases.length} versions PS1, dont ${targets.length} sans code produit (zone connue, édition standard)`);


// ---------------------------------------------------------------------
// 2. Les disques recensés par Redump
// ---------------------------------------------------------------------
console.log('Lecture du fichier Redump…');
const res = await fetch(DAT_URL, { headers: { 'User-Agent': USER_AGENT } });
if (!res.ok) throw new Error(`Fichier Redump : ${res.status}`);
const dat = await res.text();
const version = /version "([^"]+)"/.exec(dat)?.[1] ?? 'inconnue';

// Une entrée par disque ; on garde, par nom, le code au format standard (SLES-00868)
const discs = new Map(); // nom → { ...infos, serial }
for (const block of dat.split(/\ngame \(/).slice(1)) {
  const name = /name "([^"]+)"/.exec(block)?.[1];
  const serials = [...block.matchAll(/serial "([^"]+)"/g)].flatMap((m) => m[1].split(/,\s*/)).map((s) => s.trim().toUpperCase());
  const serial = serials.find((s) => CODE.test(s));
  if (!name || !serial) continue;
  const info = parseName(name);
  if (!info || info.disc > 1) continue; // disque 1 ou jeu à un seul disque : notre convention
  if (!discs.has(name)) discs.set(name, { ...info, serial });
}
// Nombre de disques par jeu et par région : « (Europe) (Disc 3) » → 3
const discCount = new Map();
for (const m of dat.matchAll(/name "([^"]+) \(Disc (\d+)\)[^"]*"/g)) {
  const key = m[1];
  discCount.set(key, Math.max(discCount.get(key) ?? 1, Number(m[2])));
}
const entries = [...discs.values()];
const index = buildIndex(entries);
console.log(`  version ${version} · ${entries.length} disques utilisables (démos et prototypes écartés)`);


// ---------------------------------------------------------------------
// 3. Association
// ---------------------------------------------------------------------
const rows = [];
let ambiguous = 0;
for (const r of targets) {
  // Code produit : uniquement une édition standard (une réédition ou une édition limitée a son propre code)
  const match = bestMatch(r, keysOfGame, index, (e) => !e.special);
  if (!match) continue;
  const { entry, viaAlias, candidates } = match;
  // Plusieurs codes différents aussi bien placés : on prend le meilleur, mais on le compte
  if (candidates.length > 1 && candidates[1].serial !== entry.serial && candidates[1].places.join() === entry.places.join()) ambiguous++;
  const discsKey = entry.name.replace(/ \(Disc \d+\).*$/, '');
  const media = discCount.get(discsKey) ?? (entry.disc ? 1 : null);
  rows.push({
    id: r.id,
    title: r.game.title,
    localTitle: r.local_title,
    zone: r.zone,
    code: entry.serial,
    languages: r.languages.length === 0 && entry.languages.length ? entry.languages : null,
    media: media && media > 1 && (r.media_count ?? 1) === 1 ? media : null,
    viaAlias,
    source: entry.name,
  });
}

const byZone = {};
for (const row of rows) byZone[row.zone] = (byZone[row.zone] ?? 0) + 1;
const totalByZone = {};
for (const r of targets) totalByZone[r.zone] = (totalByZone[r.zone] ?? 0) + 1;
console.log(`
Bilan
  Versions sans code          ${targets.length}  ${JSON.stringify(totalByZone)}
  Code trouvé                 ${rows.length}  ${JSON.stringify(byZone)}
    dont par variante de titre ${rows.filter((r) => r.viaAlias).length}
    choix entre plusieurs codes de la même région : ${ambiguous}
  Langues ajoutées            ${rows.filter((r) => r.languages).length}
  Nombre de disques ajouté    ${rows.filter((r) => r.media).length}
`);
console.log('Exemples :');
for (const t of ['Final Fantasy VII', 'Crash Bandicoot', 'Resident Evil', 'Metal Gear Solid', 'Gran Turismo', '40 Winks', 'Tomb Raider']) {
  for (const row of rows.filter((x) => x.title === t)) {
    console.log(`  ${t.padEnd(18)} ${row.zone.padEnd(7)} ${row.code}  ${row.languages ? `[${row.languages.join(',')}]` : ''}${row.media ? ` ${row.media} disques` : ''}  ← ${row.source}`);
  }
}

console.log('\nÉchantillon régulier, pour relecture :');
for (const row of rows.filter((_, i) => i % Math.ceil(rows.length / 25) === 0)) {
  console.log(`  ${row.zone.padEnd(7)} ${row.code}  « ${row.localTitle} »${row.viaAlias ? ' (variante)' : ''}  ← ${row.source}`);
}

if (!write) {
  console.log('\nPour écrire la migration : node scripts/import-product-codes.mjs --ecrire');
  process.exit(0);
}


// ---------------------------------------------------------------------
// 4. Migration SQL
// ---------------------------------------------------------------------
const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);
const arr = (a) => (a ? `'{${a.join(',')}}'` : 'null');
const now = new Date();
const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
const values = [];
for (let i = 0; i < rows.length; i += 500) {
  values.push(`insert into import_code (release_id, local_title, product_code, languages, media_count) values\n  ${rows
    .slice(i, i + 500)
    .map((r) => `(${r.id}, ${lit(r.localTitle)}, ${lit(r.code)}, ${arr(r.languages)}, ${r.media ?? 'null'})`)
    .join(',\n  ')};`);
}
writeFileSync(join(ROOT, 'supabase', 'migrations', `${stamp}_import_product_codes_redump.sql`), `-- =====================================================================
-- Carte Mémoire · Codes produits, langues et nombre de disques depuis Redump
-- Fichier GÉNÉRÉ par scripts/import-product-codes.mjs le ${now.toISOString().slice(0, 10)}.
-- Source : Redump (http://redump.org), via libretro-database, fichier daté du ${version}.
--
-- ${rows.length} versions. Rien de ce qui est déjà renseigné n'est écrasé, et
-- chaque ligne vérifie aussi le titre de la version (garde-fou si les
-- identifiants ne correspondent pas, par exemple sur une autre base).
-- =====================================================================

create temporary table import_code (
  release_id   bigint primary key,
  local_title  text not null,
  product_code text not null,
  languages    text[],
  media_count  smallint
);

${values.join('\n\n')}

update public.release r
set product_code = i.product_code
from import_code i
where r.id = i.release_id and r.local_title = i.local_title and r.product_code is null;

update public.release r
set languages = i.languages
from import_code i
where r.id = i.release_id and r.local_title = i.local_title and i.languages is not null and r.languages = '{}';

update public.release r
set media_count = i.media_count
from import_code i
where r.id = i.release_id and r.local_title = i.local_title and i.media_count is not null and coalesce(r.media_count, 1) = 1;

drop table import_code;
`);
console.log(`\nMigration écrite : supabase/migrations/${stamp}_import_product_codes_redump.sql`);
