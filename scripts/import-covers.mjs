// =====================================================================
// Carte Mémoire · Jaquettes (recto) depuis la collection libretro-thumbnails
// (https://github.com/libretro-thumbnails/Sony_-_PlayStation, dossier Named_Boxarts,
// la collection utilisée par RetroArch). Les jaquettes appartiennent à leurs éditeurs.
//
// Associe chaque image à une VERSION de notre base (même jeu, même zone),
// uniquement pour les versions qui n'ont encore aucune image : les jaquettes
// ajoutées à la main ne sont jamais remplacées.
//
// Étapes (depuis le dossier carte-memoire) :
//   node scripts/import-covers.mjs                → analyse seule, AUCUN téléchargement
//   node scripts/import-covers.mjs --telecharger  → télécharge, convertit en WebP dans
//                                                   .covers-import/, et écrit .covers-import/link-covers.sql
// Puis : envoyer les images dans le stockage, et SEULEMENT ENSUITE lancer link-covers.sql
// (rejouable : il ne rattache que les images effectivement présentes dans le stockage).
// =====================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const USER_AGENT = 'carte-memoire-import/1.0 (projet personnel, import ponctuel)';
const REPO = 'libretro-thumbnails/Sony_-_PlayStation';
const download = process.argv.includes('--telecharger');

const env = Object.fromEntries(
  readFileSync(join(ROOT, 'web', '.env.local'), 'utf8').split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const api = (path) => fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY } })
  .then((r) => { if (!r.ok) throw new Error(`Base : ${r.status} ${path}`); return r.json(); });

// Même idée que public.normalize_name : sans majuscules, accents, espaces ni ponctuation
const normalize = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');


// ---------------------------------------------------------------------
// 1. Nos versions PS1 sans image
// ---------------------------------------------------------------------
console.log('Lecture des versions PS1 de la base…');
const [ps1] = await api('platform?select=id&short_name=eq.PS1');
const releases = [];
for (let offset = 0; ; offset += 1000) {
  const page = await api(`release?select=id,game_id,zone,local_title,edition_type,image(id),release_region(region(code)),game(title)&platform_id=eq.${ps1.id}&order=id&limit=1000&offset=${offset}`);
  releases.push(...page);
  if (page.length < 1000) break;
}
// Toutes les façons d'écrire le titre d'un jeu : titre de référence + titres de ses versions
const keysOfGame = new Map();
for (const r of releases) {
  if (!keysOfGame.has(r.game_id)) keysOfGame.set(r.game_id, new Set([normalize(r.game.title)]));
  keysOfGame.get(r.game_id).add(normalize(r.local_title));
}
const targets = releases.filter((r) => r.image.length === 0 && r.zone && r.edition_type === 'standard');
console.log(`  ${releases.length} versions PS1, dont ${targets.length} sans image (zone connue, édition standard)`);


// ---------------------------------------------------------------------
// 2. Les jaquettes disponibles
// ---------------------------------------------------------------------
console.log('Lecture de la liste des jaquettes…');
const root = await fetch(`https://api.github.com/repos/${REPO}/git/trees/master`, { headers: { 'User-Agent': USER_AGENT } }).then((r) => r.json());
const sha = root.tree.find((f) => f.path === 'Named_Boxarts').sha;
const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${sha}`, { headers: { 'User-Agent': USER_AGENT } }).then((r) => r.json());

const PAL = ['Europe', 'France', 'Germany', 'Spain', 'Italy', 'UK', 'Australia', 'Netherlands', 'Sweden', 'Scandinavia', 'Portugal', 'Greece', 'Denmark', 'Finland', 'Norway', 'Belgium', 'Switzerland', 'Austria', 'Poland', 'Russia'];
const NTSC_U = ['USA', 'Canada', 'Brazil'];
const NTSC_J = ['Japan', 'Asia', 'Korea', 'Taiwan', 'Hong Kong', 'China'];
const COUNTRY = { France: 'FR', Germany: 'DE', Spain: 'ES', Italy: 'IT', UK: 'GB', Australia: 'AU', Netherlands: 'NL', Sweden: 'SE', Korea: 'KR' };
// Pas des jaquettes du jeu vendu en magasin
const EXCLUDED = /demo|beta|proto|sample|taikenban|otameshi|kiosk|preview|trial|promo|not for resale|review|unl|pirate|hack|program|playable|tech|test|putative|sampler/i;

const covers = [];
for (const f of tree.tree) {
  if (f.type !== 'blob' || f.mode === '120000' || !f.path.endsWith('.png')) continue; // 120000 = raccourci
  const name = f.path.slice(0, -4);
  const tags = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  if (tags.some((t) => EXCLUDED.test(t))) continue;
  let base = name.replace(/\s*\(.*$/, '').replace(/_/g, ' ').trim();
  // « Legend of Dragoon, The » → « The Legend of Dragoon »
  const article = /^(.*), (The|A|An)$/.exec(base);
  if (article) base = `${article[2]} ${article[1]}`;
  const places = (tags[0] ?? '').split(/,\s*/);
  const zones = new Set();
  if (places.some((p) => PAL.includes(p))) zones.add('PAL');
  if (places.some((p) => NTSC_U.includes(p))) zones.add('NTSC-U');
  if (places.some((p) => NTSC_J.includes(p))) zones.add('NTSC-J');
  if (places.includes('World')) ['PAL', 'NTSC-U', 'NTSC-J'].forEach((z) => zones.add(z));
  if (zones.size === 0) continue;
  const disc = Number(/Disc (\d+)/.exec(name)?.[1] ?? 0);
  covers.push({ file: f.path, size: f.size, key: normalize(base), zones, places, disc, rev: /Rev \d/.test(name) });
}
const coversByKey = new Map();
for (const c of covers) {
  if (!coversByKey.has(c.key)) coversByKey.set(c.key, []);
  coversByKey.get(c.key).push(c);
}
console.log(`  ${covers.length} jaquettes utilisables (démos, prototypes et raccourcis écartés)`);


// ---------------------------------------------------------------------
// 3. Association jaquette ↔ version
// ---------------------------------------------------------------------
// Préférence : le pays exact de la version, puis l'Europe pour le PAL, puis
// sans numéro de disque ni révision, puis le plus petit numéro de disque.
function score(cover, release) {
  const countries = release.release_region.map((rr) => rr.region.code);
  let s = 0;
  if (countries.some((c) => cover.places.some((p) => COUNTRY[p] === c))) s += 100;
  if (release.zone === 'PAL' && cover.places[0] === 'Europe') s += 50;
  if (release.zone === 'PAL' && cover.places.includes('France')) s += 20; // site en français
  if (release.zone === 'NTSC-U' && cover.places[0] === 'USA') s += 50;
  if (release.zone === 'NTSC-J' && cover.places[0] === 'Japan') s += 50;
  if (cover.places.length === 1) s += 5;
  if (cover.disc === 0) s += 10; else s -= cover.disc;
  if (!cover.rev) s += 2;
  return s;
}

const matches = [];
const unmatched = [];
for (const r of targets) {
  const candidates = [...keysOfGame.get(r.game_id)]
    .flatMap((k) => coversByKey.get(k) ?? [])
    .filter((c) => c.zones.has(r.zone));
  if (candidates.length === 0) { unmatched.push(r); continue; }
  const best = candidates.sort((a, b) => score(b, r) - score(a, r))[0];
  matches.push({ release: r, cover: best });
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
  Après conversion en WebP   environ ${Math.round(files.size * 70 / 1024)} Mo dans le stockage Supabase (≈ 70 Ko par image)
`);
console.log('Exemples :');
for (const t of ['Final Fantasy VII', 'Crash Bandicoot 2: Cortex Strikes Back', 'Resident Evil', 'Metal Gear Solid', 'Gran Turismo', '40 Winks']) {
  for (const m of matches.filter((x) => x.release.game.title === t)) {
    console.log(`  ${t.padEnd(38)} ${m.release.zone.padEnd(7)} « ${m.release.local_title} » ← ${m.cover.file}`);
  }
}
console.log('\nQuelques versions sans correspondance :');
for (const r of unmatched.filter((_, i) => i % Math.ceil(unmatched.length / 12) === 0).slice(0, 12)) {
  console.log(`  ${r.zone.padEnd(7)} ${r.game.title} / « ${r.local_title} »`);
}

if (!download) {
  console.log('\nPour télécharger et convertir : node scripts/import-covers.mjs --telecharger');
  process.exit(0);
}

// ---------------------------------------------------------------------
// 4. Téléchargement et conversion (étape suivante, après accord)
// ---------------------------------------------------------------------
const sharp = (await import('sharp')).default;
const outDir = join(ROOT, '.covers-import', 'releases');
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
      // sharp vérifie que c'est bien une image avant de la convertir (rien d'autre n'est accepté)
      const webp = await sharp(await fetchPng(m.cover.file), { failOn: 'error' })
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
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
