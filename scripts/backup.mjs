// =====================================================================
// Carte Mémoire · Sauvegarde complète : la base de données et les images
//
// À lancer de temps en temps (une fois par semaine, par exemple), depuis le dossier
// carte-memoire :
//   node scripts/backup.mjs
//   node scripts/backup.mjs --dossier "D:\Sauvegardes"   (disque externe, clé USB…)
// Par défaut : Documents\Carte-Memoire-sauvegardes. Jamais dans le dossier du site
// (rien ne doit partir sur GitHub).
//
// 1. La base, en trois fichiers SQL, avec la commande officielle `npx supabase db dump`
//    (elle a besoin de Docker Desktop : le script le démarre s'il est fermé) : les rôles,
//    la structure, les données. Les données comprennent les comptes (adresses e-mail,
//    mots de passe chiffrés, double authentification, passkeys), mais pas les sessions,
//    les jetons temporaires ni le journal des connexions : inutiles pour repartir, et
//    sensibles.
// 2. Les images (jaquettes, photos de profil, photos proposées) : une copie à jour dans
//    « fichiers », où seules les nouvelles sont téléchargées. Une image supprimée du
//    site passe dans le dossier de la sauvegarde du jour (« fichiers-retires »).
// 3. Vérification : le nombre de lignes des tables principales est comparé à la base.
// 4. Les sauvegardes de plus de 60 jours sont effacées : une donnée supprimée du site
//    (compte, photo) ne reste pas indéfiniment dans les copies (page Confidentialité).
//
// Rien n'est modifié en ligne : le script ne fait que lire.
// =====================================================================

import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ROOT } from './lib/redump.mjs';

const KEEP_DAYS = 60;
const PARALLEL_DOWNLOADS = 8;
// Tables laissées de côté : sessions, jetons à usage unique, défis en cours, journal des
// connexions (adresses IP), navigateurs de confiance. Après une restauration, chacun se
// reconnecte simplement.
const EXCLUDED_TABLES = [
  'auth.sessions', 'auth.refresh_tokens', 'auth.one_time_tokens', 'auth.flow_state',
  'auth.mfa_challenges', 'auth.mfa_amr_claims', 'auth.webauthn_challenges',
  'auth.saml_relay_states', 'auth.oauth_client_states', 'auth.oauth_authorizations',
  'auth.audit_log_entries', 'private.trusted_browser', 'private.trusted_session',
];
// Tables comptées pour vérifier la sauvegarde
const KEY_TABLES = [
  ['public.game', 'jeux'],
  ['public.release', 'versions'],
  ['public.image', 'images du catalogue'],
  ['public.collection_item', 'exemplaires dans les collections'],
  ['public.submission', 'propositions'],
  ['public.profile', 'profils'],
  ['auth.users', 'comptes'],
  ['storage.objects', 'fichiers référencés'],
];

const args = process.argv.slice(2);
const destIndex = args.indexOf('--dossier');
const DEST = resolve(destIndex >= 0 && args[destIndex + 1] ? args[destIndex + 1] : join(homedir(), 'Documents', 'Carte-Memoire-sauvegardes'));

function stop(message) {
  console.log(`\nARRÊT : ${message}`);
  process.exit(1);
}

// Garde-fou : la sauvegarde contient des données personnelles, jamais dans le dépôt Git
const inside = relative(ROOT, DEST);
if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
  stop(`le dossier de sauvegarde ne doit pas être dans le dossier du site (${ROOT}).`);
}

const refFile = join(ROOT, 'supabase', '.temp', 'project-ref');
if (!existsSync(refFile)) stop("le projet Supabase n'est pas relié à ce dossier (npx supabase link).");
const PROJECT_REF = readFileSync(refFile, 'utf8').trim();
if (!/^[a-z0-9]{20}$/.test(PROJECT_REF)) stop(`identifiant de projet inattendu dans ${refFile}.`);

// npx a besoin du shell sous Windows : une seule ligne de commande, les arguments avec des
// espaces entre guillemets
const quote = (arg) => (/[\s&()^|<>]/.test(arg) ? `"${arg}"` : arg);
const supabase = (cliArgs, options = {}) => spawnSync(['npx', 'supabase', ...cliArgs].map(quote).join(' '), {
  cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options,
});

// Requête en lecture sur la base en ligne (renvoie les lignes)
function query(sql) {
  const file = join(tmpdir(), `carte-memoire-sauvegarde-${process.pid}.sql`);
  writeFileSync(file, sql);
  const result = supabase(['db', 'query', '--linked', '-f', file]);
  rmSync(file, { force: true });
  const out = result.stdout ?? '';
  if (result.status !== 0 || !out.includes('{')) {
    stop(`lecture de la base impossible : ${(result.stderr || out).trim().slice(0, 400)}`);
  }
  return JSON.parse(out.slice(out.indexOf('{'))).rows;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const dockerReady = () => spawnSync('docker', ['info'], { encoding: 'utf8' }).status === 0;

// La commande d'export de la base passe par Docker : on démarre Docker Desktop s'il est fermé
async function ensureDocker() {
  if (dockerReady()) return;
  const exe = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe');
  if (process.platform !== 'win32' || !existsSync(exe)) stop('Docker ne répond pas : ouvre Docker Desktop, attends qu\'il soit prêt, puis relance.');
  console.log('Docker Desktop est fermé : démarrage (jusqu\'à 3 minutes)…');
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    if (dockerReady()) return;
  }
  stop('Docker Desktop ne répond toujours pas : ouvre-le, attends qu\'il soit prêt, puis relance.');
}

// Lignes de chaque table dans l'export des données (blocs COPY … \.)
async function countRows(file) {
  const counts = new Map();
  let table = null;
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (table) {
      if (line === '\\.') table = null;
      else counts.set(table, counts.get(table) + 1);
      continue;
    }
    const copy = /^COPY "([^"]+)"\."([^"]+)"/.exec(line);
    if (copy) {
      table = `${copy[1]}.${copy[2]}`;
      counts.set(table, 0);
    }
  }
  return counts;
}

// Tous les fichiers d'un dossier, en chemins relatifs avec des « / »
function listFiles(folder, prefix = '') {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory()
    ? listFiles(join(folder, entry.name), `${prefix}${entry.name}/`)
    : [`${prefix}${entry.name}`]));
}

// Un nom de fichier du stockage devient un chemin du disque : jamais en dehors du dossier
const safeName = (name) => /^[\w .()-]+(\/[\w .()-]+)*$/.test(name) && !name.split('/').some((part) => part === '..' || part === '.');

async function download(bucket, name, target) {
  const url = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(`${target}.partiel`, body);
      renameSync(`${target}.partiel`, target);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(1000 * attempt);
    }
  }
}

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`;
const STAMP = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})h(\d{2})$/;
const working = join(DEST, `${stamp}-en-cours`);
const report = [`Sauvegarde Carte Mémoire du ${now.toLocaleString('fr-FR')}`, `Projet Supabase : ${PROJECT_REF}`, ''];
const warnings = [];

console.log(`Sauvegarde dans ${DEST}`);
await ensureDocker();
mkdirSync(working, { recursive: true });

// ---------------------------------------------------------------------
// 1. La base
// ---------------------------------------------------------------------
const dumps = [
  ['roles.sql', ['--role-only'], 'les rôles'],
  ['schema.sql', [], 'la structure (tables, règles de sécurité, fonctions)'],
  ['donnees.sql', ['--data-only', '--use-copy', '-x', EXCLUDED_TABLES.join(',')], 'les données'],
];
for (const [file, extra, label] of dumps) {
  console.log(`\nBase : ${label}…`);
  // pg_dump prévient que les tables region et release se citent elles-mêmes : sans
  // conséquence, la restauration désactive ces vérifications le temps du chargement
  if (file === 'donnees.sql') console.log('(Les avertissements « circular foreign-key constraints » sont normaux.)');
  const target = join(working, file);
  const result = supabase(['db', 'dump', '--linked', ...extra, '-f', target], { stdio: 'inherit', encoding: undefined });
  if (result.status !== 0 || !existsSync(target) || statSync(target).size === 0) {
    rmSync(working, { recursive: true, force: true });
    stop(`l'export de ${label} a échoué (voir le message ci-dessus). Rien n'a été gardé de cette sauvegarde ; les précédentes sont intactes.`);
  }
}

// ---------------------------------------------------------------------
// 2. Vérification : chaque table principale a autant de lignes que dans la base
// ---------------------------------------------------------------------
console.log('\nVérification de la sauvegarde…');
const saved = await countRows(join(working, 'donnees.sql'));
const live = new Map(query(KEY_TABLES.map(([table]) => `select '${table}' as t, count(*)::int as n from ${table}`).join('\nunion all\n')).map((row) => [row.t, row.n]));
report.push('Base de données :');
for (const [table, label] of KEY_TABLES) {
  const inBackup = saved.get(table) ?? 0;
  const online = live.get(table) ?? 0;
  report.push(`  ${label} : ${inBackup.toLocaleString('fr-FR')}${inBackup === online ? '' : ` (en ligne : ${online.toLocaleString('fr-FR')})`}`);
  // Un écart de quelques lignes : quelqu'un a modifié quelque chose pendant la sauvegarde
  if (online > 0 && inBackup === 0) {
    rmSync(working, { recursive: true, force: true });
    stop(`la table ${table} est vide dans la sauvegarde alors qu'elle a ${online} lignes en ligne. Rien n'a été gardé ; les sauvegardes précédentes sont intactes.`);
  }
  if (Math.abs(inBackup - online) > Math.max(5, online * 0.01)) warnings.push(`${label} : ${inBackup} dans la sauvegarde, ${online} en ligne`);
}
console.log(report.slice(3).join('\n'));

// ---------------------------------------------------------------------
// 3. Les images
// ---------------------------------------------------------------------
console.log('\nImages…');
const buckets = query('select id, public from storage.buckets order by id');
const objects = query("select bucket_id, name, (metadata->>'size')::bigint as size from storage.objects order by bucket_id, name");
const mirror = join(DEST, 'fichiers');
report.push('', 'Images (copie à jour dans « fichiers ») :');
let failed = 0;
for (const bucket of buckets) {
  const folder = join(mirror, bucket.id);
  const remote = objects.filter((o) => o.bucket_id === bucket.id);
  const unsafe = remote.filter((o) => !safeName(o.name));
  if (unsafe.length) warnings.push(`${bucket.id} : ${unsafe.length} fichier(s) au nom inattendu, non copiés (ex. ${unsafe[0].name})`);
  const wanted = remote.filter((o) => safeName(o.name));
  const missing = wanted.filter((o) => {
    const target = join(folder, ...o.name.split('/'));
    return !existsSync(target) || (o.size != null && statSync(target).size !== Number(o.size));
  });

  // Nouveaux fichiers : téléchargés (stockage public), ou copiés par la CLI (privé)
  let done = 0;
  const queue = [...missing];
  const worker = async () => {
    for (let o = queue.shift(); o; o = queue.shift()) {
      const target = join(folder, ...o.name.split('/'));
      try {
        if (bucket.public) {
          await download(bucket.id, o.name, target);
        } else {
          mkdirSync(dirname(target), { recursive: true });
          const result = supabase(['storage', 'cp', `ss:///${bucket.id}/${o.name}`, target, '--linked', '--experimental']);
          if (result.status !== 0) throw new Error((result.stderr || '').trim().slice(0, 200));
        }
      } catch (error) {
        failed++;
        if (failed <= 5) warnings.push(`${bucket.id}/${o.name} : ${error.message}`);
      }
      done++;
      if (done % 500 === 0) console.log(`  ${bucket.id} : ${done} / ${missing.length}`);
    }
  };
  await Promise.all(Array.from({ length: bucket.public ? PARALLEL_DOWNLOADS : 1 }, worker));

  // Fichiers supprimés du site depuis la dernière fois : rangés avec la sauvegarde du jour
  const remoteNames = new Set(wanted.map((o) => o.name));
  const local = listFiles(folder);
  // Restes d'un téléchargement interrompu
  for (const name of local.filter((n) => n.endsWith('.partiel'))) rmSync(join(folder, ...name.split('/')), { force: true });
  const removed = local.filter((name) => !remoteNames.has(name) && !name.endsWith('.partiel'));
  for (const name of removed) {
    const target = join(working, 'fichiers-retires', bucket.id, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    renameSync(join(folder, ...name.split('/')), target);
  }
  const line = `  ${bucket.id} : ${wanted.length.toLocaleString('fr-FR')} fichiers (${missing.length.toLocaleString('fr-FR')} nouveaux${removed.length ? `, ${removed.length} retirés du site` : ''})`;
  report.push(line);
  console.log(line);
}
if (failed) warnings.push(`${failed} image(s) non téléchargée(s) : elles le seront à la prochaine sauvegarde`);

// ---------------------------------------------------------------------
// 4. Bilan, puis effacement des sauvegardes de plus de 60 jours
// ---------------------------------------------------------------------
const final = join(DEST, stamp);
if (existsSync(final)) rmSync(final, { recursive: true, force: true });
renameSync(working, final);

const limit = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
const erased = [];
for (const name of readdirSync(DEST)) {
  const date = STAMP.exec(name);
  if (!date || name === stamp) continue;
  const time = new Date(+date[1], +date[2] - 1, +date[3], +date[4], +date[5]).getTime();
  if (time < limit) {
    rmSync(join(DEST, name), { recursive: true, force: true });
    erased.push(name);
  }
}
if (erased.length) report.push('', `Sauvegardes de plus de ${KEEP_DAYS} jours effacées : ${erased.join(', ')}`);
if (warnings.length) report.push('', 'À noter :', ...warnings.map((w) => `  - ${w}`));
writeFileSync(join(final, 'bilan.txt'), `${report.join('\r\n')}\r\n`);

writeFileSync(join(DEST, 'LISEZMOI.txt'), [
  'Sauvegardes de Carte Mémoire (faites par scripts/backup.mjs)',
  '',
  'ATTENTION : ces fichiers contiennent les données des membres (adresses e-mail, mots de',
  'passe chiffrés, secrets de double authentification). Les garder pour soi : jamais sur',
  'GitHub, jamais partagés. Un disque externe ou un espace en ligne privé convient.',
  '',
  'Chaque dossier daté (AAAA-MM-JJ_HHhMM) est une sauvegarde de la base :',
  '  roles.sql     les rôles de la base',
  '  schema.sql    la structure : tables, règles de sécurité, fonctions',
  '  donnees.sql   les données : catalogue, collections, propositions, comptes…',
  '  bilan.txt     ce qui a été sauvegardé, et les vérifications',
  '  fichiers-retires/  images supprimées du site depuis la sauvegarde précédente',
  '« fichiers » est la copie à jour de toutes les images (jaquettes, photos de profil…).',
  `Les sauvegardes de plus de ${KEEP_DAYS} jours sont effacées automatiquement.`,
  '',
  'Restaurer (en cas de gros problème) : se faire aider. Principe, d\'après la',
  'documentation de Supabase (« Backup and Restore using the CLI ») : dans un nouveau',
  'projet Supabase (il crée lui-même les tables des comptes et du stockage), exécuter avec',
  'psql roles.sql, schema.sql, puis « SET session_replication_role = replica » et',
  'donnees.sql ; renvoyer ensuite les images avec « npx supabase storage cp -r ».',
  'Restauration essayée le 20/10/2026 sur une base de test : données et comptes identiques.',
  '',
].join('\r\n'));

console.log(`\nSauvegarde terminée : ${final}`);
if (erased.length) console.log(`Sauvegardes de plus de ${KEEP_DAYS} jours effacées : ${erased.length}`);
if (warnings.length) console.log(`À noter :\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
