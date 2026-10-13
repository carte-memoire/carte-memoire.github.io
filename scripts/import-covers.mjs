// =====================================================================
// Carte Mémoire · Jaquettes (recto) depuis la collection libretro-thumbnails
// (https://github.com/libretro-thumbnails/Sony_-_PlayStation et Sony_-_PlayStation_2, dossier Named_Boxarts,
// la collection utilisée par RetroArch). Les jaquettes appartiennent à leurs éditeurs.
//
// Associe chaque image à une VERSION de notre base (même jeu, même zone),
// uniquement pour les versions qui n'ont encore aucune image : les jaquettes
// ajoutées à la main ne sont jamais remplacées.
//
// Étapes (depuis le dossier carte-memoire) :
//   node scripts/import-covers.mjs                → analyse seule, AUCUN téléchargement
//   (jeux PS1 ; --console PS2 pour ceux de la PS2)
//   node scripts/import-covers.mjs --telecharger  → télécharge, convertit en WebP dans
//                                                   .covers-import/, et écrit .covers-import/link-covers.sql
// Puis : envoyer les images dans le stockage, et SEULEMENT ENSUITE lancer link-covers.sql
// (rejouable : il ne rattache que les images effectivement présentes dans le stockage).
// =====================================================================

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT, bestMatch, buildIndex, loadReleases, parseName, publicApi, readEnv } from './lib/redump.mjs';
import { consoleFromArgs } from './lib/consoles.mjs';

const CONSOLE = consoleFromArgs();
const REPO = CONSOLE.thumbnails;
const download = process.argv.includes('--telecharger');


// ---------------------------------------------------------------------
// 1. Nos versions de la console sans image
// ---------------------------------------------------------------------
console.log(`Lecture des versions ${CONSOLE.code} de la base…`);
const { releases, keysOfGame } = await loadReleases(publicApi(readEnv()), 'image(id)', CONSOLE.code);
const targets = releases.filter((r) => r.image.length === 0 && r.zone && r.edition_type === 'standard');
console.log(`  ${releases.length} versions ${CONSOLE.code}, dont ${targets.length} sans image (zone connue, édition standard)`);


// ---------------------------------------------------------------------
// 2. Les jaquettes disponibles
// ---------------------------------------------------------------------
console.log('Lecture de la liste des jaquettes…');
const root = await fetch(`https://api.github.com/repos/${REPO}/git/trees/master`, { headers: { 'User-Agent': USER_AGENT } }).then((r) => r.json());
const sha = root.tree.find((f) => f.path === 'Named_Boxarts').sha;
const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${sha}`, { headers: { 'User-Agent': USER_AGENT } }).then((r) => r.json());

const covers = [];
for (const f of tree.tree) {
  if (f.type !== 'blob' || f.mode === '120000' || !f.path.endsWith('.png')) continue; // 120000 = raccourci
  const info = parseName(f.path.slice(0, -4)); // démos, prototypes… écartés (null)
  if (info) covers.push({ ...info, file: f.path, size: f.size });
}
const index = buildIndex(covers);
console.log(`  ${covers.length} jaquettes utilisables (démos, prototypes et raccourcis écartés)`);


// ---------------------------------------------------------------------
// 3. Association jaquette ↔ version (règles communes : scripts/lib/redump.mjs)
// ---------------------------------------------------------------------
const matches = [];
const unmatched = [];
for (const r of targets) {
  const match = bestMatch(r, keysOfGame, index);
  if (!match) { unmatched.push(r); continue; }
  matches.push({ release: r, cover: match.entry, viaAlias: match.viaAlias });
}

const byZone = {};
for (const m of matches) byZone[m.release.zone] = (byZone[m.release.zone] ?? 0) + 1;
const totalByZone = {};
for (const r of targets) totalByZone[r.zone] = (totalByZone[r.zone] ?? 0) + 1;
const files = new Map(matches.map((m) => [m.cover.file, m.cover.size]));
const downloadSize = [...files.values()].reduce((n, s) => n + s, 0);

console.log(`
Bilan (aucune image téléchargée)
  Versions sans jaquette     ${targets.length}  ${JSON.stringify(totalByZone)}
  Jaquette trouvée           ${matches.length}  ${JSON.stringify(byZone)}
  Sans correspondance        ${unmatched.length}
  À télécharger              ${files.size} fichiers PNG, ${Math.round(downloadSize / 1048576)} Mo
  Après conversion en WebP   environ ${Math.round(files.size * 35 / 1024)} Mo dans le stockage Supabase (≈ 30 à 40 Ko par image)
`);
console.log('Exemples :');
for (const t of ['Final Fantasy VII', 'Crash Bandicoot 2: Cortex Strikes Back', 'Resident Evil', 'Metal Gear Solid', 'Gran Turismo', '40 Winks']) {
  for (const m of matches.filter((x) => x.release.game.title === t)) {
    console.log(`  ${t.padEnd(38)} ${m.release.zone.padEnd(7)} « ${m.release.local_title} » ← ${m.cover.file}`);
  }
}
const viaAliases = matches.filter((m) => m.viaAlias);
if (viaAliases.length) {
  console.log(`\nAssociations par variante de titre (${viaAliases.length}), à vérifier :`);
  for (const m of viaAliases.filter((_, i) => i % Math.ceil(viaAliases.length / 30) === 0)) {
    console.log(`  ${m.release.zone.padEnd(7)} « ${m.release.game.title} » ← ${m.cover.file}`);
  }
}
console.log('\nQuelques versions sans correspondance :');
for (const r of unmatched.filter((_, i) => i % Math.ceil(unmatched.length / 12) === 0).slice(0, 12)) {
  console.log(`  ${r.zone.padEnd(7)} ${r.game.title} / « ${r.local_title} »`);
}

if (!download) {
  console.log(`\nPour télécharger et convertir : node scripts/import-covers.mjs --console ${CONSOLE.code} --telecharger`);
  process.exit(0);
}

// ---------------------------------------------------------------------
// 4. Téléchargement et conversion (étape suivante, après accord)
// ---------------------------------------------------------------------
const sharp = (await import('sharp')).default;
// Dossier d'envoi : uniquement les images de CE lancement (vidé à chaque fois),
// pour ne jamais renvoyer des images déjà présentes dans le stockage.
// Envoi : npx supabase storage cp -r .covers-import/upload/releases ss:///covers ...
// (« cp -r dossier ss:///covers » crée covers/releases/<id>/front.webp)
const uploadDir = join(ROOT, '.covers-import', 'upload');
rmSync(uploadDir, { recursive: true, force: true });
const outDir = join(uploadDir, 'releases');
mkdirSync(outDir, { recursive: true });
let done = 0;
const rows = [];
const failures = [];
// Une même image peut servir à plusieurs versions : on recopie le WebP déjà converti
const converted = new Map(); // fichier source → WebP produit

async function fetchPng(file) {
  const url = `https://raw.githubusercontent.com/${REPO}/master/Named_Boxarts/${encodeURIComponent(file)}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 15000)); // GitHub demande de ralentir
  }
  throw new Error('serveur indisponible');
}

async function processMatch(m) {
  const dir = join(outDir, `${m.release.id}`);
  const target = join(dir, 'front.webp');
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true });
    if (converted.has(m.cover.file)) {
      writeFileSync(target, readFileSync(converted.get(m.cover.file)));
    } else {
      // sharp vérifie que c'est bien une image avant de la convertir (rien d'autre n'est accepté).
      // 480 × 672 au plus (boîtier DVD ; un boîtier CD reste carré, 480 × 480) : assez pour
      // l'affichage le plus grand du site (280 px de large) sur un écran Retina. Qualité 72 et
      // compression poussée (effort 6) : un tiers de place en moins qu'en qualité 80, sans
      // différence visible (essais du 14 octobre 2026). Même réglage que les envois du site.
      const webp = await sharp(await fetchPng(m.cover.file), { failOn: 'error' })
        .resize({ width: 480, height: 672, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72, effort: 6 })
        .toBuffer();
      writeFileSync(target, webp);
    }
  }
  converted.set(m.cover.file, target);
  rows.push([m.release.id, `releases/${m.release.id}/front.webp`]);
  if (++done % 200 === 0) console.log(`  ${done} / ${matches.length}`);
}

// 4 téléchargements en parallèle
const queue = [...matches];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let m = queue.shift(); m; m = queue.shift()) {
    try {
      await processMatch(m);
    } catch (err) {
      failures.push(`${m.cover.file} : ${err.message}`);
    }
  }
}));
if (failures.length) console.log(`  ${failures.length} échecs, par exemple :\n    ${failures.slice(0, 5).join('\n    ')}`);
rows.sort((a, b) => a[0] - b[0]);

const now = new Date();
const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
writeFileSync(join(ROOT, '.covers-import', 'link-covers.sql'), `-- =====================================================================
-- Carte Mémoire · Rattachement des jaquettes importées depuis libretro-thumbnails
-- Fichier GÉNÉRÉ par scripts/import-covers.mjs le ${now.toISOString().slice(0, 10)} (${stamp}).
-- Ce n'est PAS une migration : à lancer APRÈS l'envoi des images dans le stockage,
--   npx supabase db query --linked -f .covers-import/link-covers.sql
-- Rejouable sans risque : seules les images présentes dans le stockage sont rattachées.
-- Une version qui a déjà une image n'en reçoit pas d'autre.
-- Les jaquettes appartiennent à leurs éditeurs respectifs.
-- =====================================================================

insert into public.image (release_id, type, path)
select v.release_id, 'front', v.path
from (values
  ${rows.map(([id, path]) => `(${id}, ${lit(path)})`).join(',\n  ')}
) as v (release_id, path)
where exists (select 1 from public.release r where r.id = v.release_id)
  and not exists (select 1 from public.image i where i.release_id = v.release_id)
  and exists (select 1 from storage.objects o where o.bucket_id = 'covers' and o.name = v.path)
on conflict (path) do nothing;
`);
console.log(`\n${done} jaquettes prêtes dans .covers-import/ et .covers-import/link-covers.sql écrit`);
