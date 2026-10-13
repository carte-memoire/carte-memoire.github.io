// =====================================================================
// Carte Mémoire · Supprimer les anciennes jaquettes, remplacées par leur version
// recompressée (scripts/recompress-covers.mjs)
//
// Lit la liste .covers-recompress/anciennes-a-supprimer.txt (fichiers que plus
// aucune fiche n'utilise), revérifie juste avant qu'aucune image de la base ne
// pointe vers l'un d'eux, puis les supprime du stockage par paquets, avec la
// commande officielle : npx supabase storage rm … --linked
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/delete-old-covers.mjs              → bilan seul, rien n'est supprimé
//   node scripts/delete-old-covers.mjs --confirmer  → supprime
// =====================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, publicApi, readEnv } from './lib/redump.mjs';

const confirmed = process.argv.includes('--confirmer');
const list = readFileSync(join(ROOT, '.covers-recompress', 'anciennes-a-supprimer.txt'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

// Garde-fou : aucun fichier de la liste ne doit être utilisé par une fiche
console.log('Vérification : aucune fiche ne doit utiliser ces fichiers…');
const api = publicApi(readEnv());
const used = new Set();
for (let offset = 0; ; offset += 1000) {
  const page = await api(`image?select=path&order=id&limit=1000&offset=${offset}`);
  for (const i of page) used.add(i.path);
  if (page.length < 1000) break;
}
const stillUsed = list.filter((p) => used.has(p));
if (stillUsed.length) {
  console.log(`ARRÊT : ${stillUsed.length} fichier(s) de la liste sont encore utilisés par une fiche, rien n'est supprimé.`);
  console.log(stillUsed.slice(0, 5).join('\n'));
  process.exit(1);
}
const unsafe = list.filter((p) => !/^(releases|submissions)\/[\w./-]+\.(webp|jpe?g|png)$/i.test(p) || p.endsWith('-480.webp'));
if (unsafe.length) {
  console.log(`ARRÊT : ${unsafe.length} chemin(s) inattendus dans la liste, rien n'est supprimé.`);
  process.exit(1);
}
console.log(`  ${list.length} anciennes jaquettes, aucune n'est utilisée.`);

if (!confirmed) {
  console.log('\nPour les supprimer : node scripts/delete-old-covers.mjs --confirmer');
  process.exit(0);
}

const BATCH = 150;
let done = 0;
for (let i = 0; i < list.length; i += BATCH) {
  const batch = list.slice(i, i + BATCH).map((p) => `ss:///covers/${p}`);
  const result = spawnSync('npx', ['supabase', 'storage', 'rm', ...batch, '--linked', '--experimental'], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (result.status !== 0) {
    console.log(`\nÉchec sur le paquet ${i / BATCH + 1} : ${(result.stderr || result.stdout || '').trim().slice(0, 400)}`);
    console.log(`${done} fichiers supprimés jusqu'ici ; les autres sont intacts (et toujours inutilisés).`);
    process.exit(1);
  }
  done += batch.length;
  console.log(`  ${done} / ${list.length}`);
}
console.log('\nTerminé : les anciennes jaquettes sont supprimées.');
