// =====================================================================
// Carte Mémoire · Recompresser les jaquettes déjà en ligne (moins de place)
//
// Même réglage que les nouvelles jaquettes (scripts/import-covers.mjs) : 480 × 672
// au plus, WebP qualité 72, compression poussée. Chaque recto est relu dans le
// stockage public, recompressé, et enregistré sous un NOUVEAU nom (« front.webp » →
// « front-480.webp ») : Supabase déconseille d'écraser un fichier (son réseau de
// diffusion garderait l'ancienne version en cache). Une image qui ne gagnerait rien
// est laissée telle quelle.
//
// Étapes (depuis le dossier carte-memoire) :
//   1. node scripts/recompress-covers.mjs
//        → .covers-recompress/upload/ (nouvelles images) et .covers-recompress/repoint.sql
//   2. npx supabase storage cp -r .covers-recompress/upload/releases ss:///covers --linked --experimental --jobs 8 --content-type image/webp
//   3. npx supabase db query --linked -f .covers-recompress/repoint.sql
//        → chaque fiche pointe vers sa nouvelle image (seulement si elle est bien dans le stockage)
//   4. Les anciennes images, qui ne servent plus à aucune fiche, peuvent alors être supprimées.
// =====================================================================

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, publicApi, readEnv } from './lib/redump.mjs';

const sharp = (await import('sharp')).default;
const env = readEnv();
const api = publicApi(env);
const OUT = join(ROOT, '.covers-recompress');
const UPLOAD = join(OUT, 'upload');
rmSync(UPLOAD, { recursive: true, force: true });
mkdirSync(UPLOAD, { recursive: true });

// Tous les rectos (jaquettes) déjà en ligne
console.log('Lecture des jaquettes de la base…');
const images = [];
for (let offset = 0; ; offset += 1000) {
  const page = await api(`image?select=id,path&type=eq.front&order=id&limit=1000&offset=${offset}`);
  images.push(...page);
  if (page.length < 1000) break;
}
const todo = images.filter((i) => /\.(webp|jpe?g|png)$/i.test(i.path) && !/-480\.webp$/.test(i.path));
console.log(`  ${images.length} jaquettes, ${todo.length} à recompresser`);

let before = 0, after = 0, done = 0, kept = 0;
const rows = [];
const failures = [];
async function processImage(image) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/covers/${image.path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());
  const smaller = await sharp(original, { failOn: 'error' })
    .resize({ width: 480, height: 672, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 6 })
    .toBuffer();
  before += original.length;
  if (smaller.length >= original.length * 0.95) { after += original.length; kept++; return; } // rien à gagner
  after += smaller.length;
  const newPath = image.path.replace(/\.(webp|jpe?g|png)$/i, '-480.webp');
  const file = join(UPLOAD, newPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, smaller);
  rows.push([image.id, image.path, newPath]);
}

// 8 à la fois
const queue = [...todo];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let image = queue.shift(); image; image = queue.shift()) {
    try { await processImage(image); } catch (err) { failures.push(`${image.path} : ${err.message}`); }
    if (++done % 500 === 0) console.log(`  ${done} / ${todo.length}`);
  }
}));
rows.sort((a, b) => a[0] - b[0]);

const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
writeFileSync(join(OUT, 'repoint.sql'), `-- =====================================================================
-- Carte Mémoire · Les fiches pointent vers les jaquettes recompressées
-- Fichier GÉNÉRÉ par scripts/recompress-covers.mjs le ${new Date().toISOString().slice(0, 10)}.
-- Ce n'est PAS une migration : à lancer APRÈS l'envoi des nouvelles images,
--   npx supabase db query --linked -f .covers-recompress/repoint.sql
-- Rejouable : seules les images présentes dans le stockage sont utilisées, et une
-- fiche modifiée entre-temps (autre image) n'est pas touchée.
-- =====================================================================

update public.image i
set path = v.new_path
from (values
  ${rows.map(([id, oldPath, newPath]) => `(${id}, ${lit(oldPath)}, ${lit(newPath)})`).join(',\n  ')}
) as v (id, old_path, new_path)
where i.id = v.id and i.path = v.old_path
  and exists (select 1 from storage.objects o where o.bucket_id = 'covers' and o.name = v.new_path);
`);

const mb = (n) => (n / 1048576).toFixed(0);
const folders = [...new Set(rows.map(([, , p]) => p.split('/')[0]))];
console.log(`
Bilan
  Jaquettes recompressées     ${rows.length}  (${kept} laissées telles quelles : rien à gagner)
  Échecs                      ${failures.length}${failures.length ? `\n    ${failures.slice(0, 5).join('\n    ')}` : ''}
  Poids                       ${mb(before)} Mo → ${mb(after)} Mo (${mb(before - after)} Mo libérés une fois les anciennes supprimées)
  Dossiers à envoyer          ${folders.join(', ')}
`);
