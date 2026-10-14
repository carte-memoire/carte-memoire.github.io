// =====================================================================
// Référencement : une vraie page HTML par jeu, un plan du site et robots.txt
//
// GitHub Pages ne connaît que des fichiers : une adresse comme /jeu/ps1/crash-bandicoot
// n'existe pas et répond « introuvable » (code 404, 404.html charge quand même
// le site). Les visiteurs ne voient rien, mais les moteurs de recherche, si.
// Après la compilation, ce script écrit donc dist/jeu/ps1/crash-bandicoot.html
// pour chaque jeu (servi à l'adresse sans « .html ») : titre, description, versions,
// jaquette pour les aperçus de liens (Discord, réseaux sociaux…) et données
// structurées pour Google. Le site s'affiche ensuite par-dessus, comme d'habitude.
// Les anciennes adresses (/jeu/36-final-fantasy-vii, titre corrigé depuis) ont une
// petite page qui renvoie vers la nouvelle : liens partagés et moteurs suivent.
//
// Prudence : toutes les données sont lues AVANT d'écrire le moindre fichier ; en
// cas d'erreur, rien n'est écrit et le site se publie comme avant.
//
// Usage (après « npm run build », dans web/) : node scripts/prerender.mjs
// Variables : VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (sinon lues dans
// .env.local), SITE_URL (adresse publique du site, https://carte-memoire.github.io
// par défaut ; à changer le jour d'un nom de domaine).
// =====================================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

// Réglages : variables d'environnement, ou .env.local pour un essai sur son ordinateur
function setting(name) {
  if (process.env[name]) return process.env[name].trim();
  const file = join(root, '.env.local');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}
const SUPABASE_URL = setting('VITE_SUPABASE_URL').replace(/\/+$/, '');
const KEY = setting('VITE_SUPABASE_PUBLISHABLE_KEY');
const SITE = (process.env.SITE_URL || 'https://carte-memoire.github.io').trim().replace(/\/+$/, '');
if (!SUPABASE_URL || !KEY) throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY sont nécessaires');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Lance d\'abord « npm run build » : dist/index.html est introuvable');

// --- Comme le site (lib/format.ts) -------------------------------------
const slugify = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
// Ancienne forme des adresses (avant les adresses lisibles calculées par la base)
const oldGamePath = (game) => { const slug = slugify(game.title); return `/jeu/${game.id}${slug ? `-${slug}` : ''}`; };
const gamePath = (game) => (game.slug ? `/jeu/${game.slug}` : oldGamePath(game));
const ZONES = { 'NTSC-J': 'Japon (NTSC-J)', 'NTSC-U': 'Amérique du Nord (NTSC-U)', PAL: 'Europe (PAL)', region_free: 'Toutes zones' };
const ZONE_ORDER = { 'NTSC-J': 0, 'NTSC-U': 1, PAL: 2, region_free: 3 };
const EDITIONS = { standard: 'Standard', reissue: 'Réédition', collector: 'Édition collector', demo: 'Démo', promo: 'Promotionnel', bundle: 'Pack' };
const languageNames = new Intl.DisplayNames(['fr'], { type: 'language' });
const languageName = (code) => { try { return languageNames.of(code) ?? code; } catch { return code; } };
const coverUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/covers/${path.split('/').map(encodeURIComponent).join('/')}`;

const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Coupé proprement (sur un mot) pour une description de 155 caractères environ
function shorten(text, max = 155) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.]+$/, '')}…`;
}

// --- Lecture du catalogue public (1 000 jeux par appel) ----------------
const SELECT = [
  'id', 'title', 'slug', 'summary', 'first_release_date',
  'game_developer(company(name))', 'game_series(series(name))', 'game_genre(genre(name))',
  'release(id, local_title, zone, edition_type, edition_name, product_code, languages, platform(short_name, name), image(type, path))',
].join(',');

async function readAll(table, select, order) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${order}&limit=1000&offset=${offset}`;
    const response = await fetch(url, { headers: { apikey: KEY, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Lecture du catalogue impossible (${response.status}) : ${(await response.text()).slice(0, 300)}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// --- Une page par jeu ---------------------------------------------------
const template = readFileSync(join(dist, 'index.html'), 'utf8');

function page({ title, description, path, image, jsonLd, body, noindex = false }) {
  const url = `${SITE}${path}`;
  const head = [
    `<title>${escape(title)}</title>`,
    `<link rel="canonical" href="${escape(url)}" />`,
    noindex ? '<meta name="robots" content="noindex" />' : '',
    `<meta property="og:site_name" content="Carte Mémoire" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    image ? `<meta property="og:image" content="${escape(image)}" />` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    // Données structurées : jamais de « </ » dans le JSON (fin de balise)
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, head)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escape(description)}" />`);
  if (body) html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  if (!html.includes(escape(title)) || (body && !html.includes(body))) throw new Error(`Modèle de page inattendu (${path})`);
  return html;
}

function gamePage(game) {
  const releases = [...game.release].sort((a, b) => (a.platform?.short_name ?? '').localeCompare(b.platform?.short_name ?? '', 'en', { numeric: true })
    || (ZONE_ORDER[a.zone] ?? 9) - (ZONE_ORDER[b.zone] ?? 9) || Number(b.edition_type === 'standard') - Number(a.edition_type === 'standard') || a.id - b.id);
  const platforms = [...new Map(releases.map((r) => [r.platform?.short_name, r.platform?.name ?? r.platform?.short_name])).values()].filter(Boolean);
  const developers = [...new Set(game.game_developer.map((d) => d.company?.name).filter(Boolean))];
  const genres = [...new Set(game.game_genre.map((g) => g.genre?.name).filter(Boolean))];
  const series = [...new Set(game.game_series.map((s) => s.series?.name).filter(Boolean))];
  const year = game.first_release_date?.slice(0, 4);
  const front = (r) => r.image.find((i) => i.type === 'front');
  const cover = front(releases.find((r) => r.zone === 'PAL' && r.edition_type === 'standard' && front(r)) ?? releases.find(front) ?? { image: [] });
  const image = cover ? coverUrl(cover.path) : null;
  const zones = [...new Set(releases.map((r) => r.zone).filter(Boolean))];

  const platformText = platforms.join(', ') || 'PlayStation';
  const title = `${game.title} (${platformText}) : versions et collection · Carte Mémoire`;
  const description = game.summary
    ? shorten(game.summary)
    : shorten(`${game.title}${year ? ` (${year})` : ''} sur ${platformText} : ${releases.length} version${releases.length > 1 ? 's' : ''}`
      + `${zones.length ? ` (${zones.map((z) => ZONES[z]?.split(' (')[0] ?? z).join(', ')})` : ''}, codes produit, éditions, langues et jaquettes. Coche celles de ta collection.`);
  const path = gamePath(game);

  const facts = [platformText, year, developers.slice(0, 3).join(', '), genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
  const versions = releases.map((r) => {
    const parts = [ZONES[r.zone] ?? r.zone, r.edition_name || EDITIONS[r.edition_type] || r.edition_type, r.product_code,
      (r.languages ?? []).map(languageName).join(', '), platforms.length > 1 ? r.platform?.short_name : null].filter(Boolean);
    return `<li><strong>${escape(r.local_title)}</strong> · ${escape(parts.join(' · '))}</li>`;
  }).join('');
  const body = '<div class="prerender">'
    + '<p class="prerender-site"><a href="/">Carte Mémoire</a> · <a href="/catalogue">Catalogue</a></p>'
    + `<article class="panel"><h1>${escape(game.title)}</h1>`
    + (facts ? `<p class="muted">${escape(facts)}</p>` : '')
    + (series.length ? `<p>Série : ${escape(series.join(', '))}</p>` : '')
    + (game.summary ? `<p>${escape(game.summary)}</p>` : '')
    + `<h2>Versions (${releases.length})</h2><ul>${versions}</ul></article></div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    url: `${SITE}${path}`,
    ...(image ? { image } : {}),
    ...(game.summary ? { description: shorten(game.summary, 500) } : {}),
    gamePlatform: platforms,
    ...(genres.length ? { genre: genres } : {}),
    ...(developers.length ? { author: developers.map((name) => ({ '@type': 'Organization', name })) } : {}),
    ...(game.first_release_date ? { datePublished: game.first_release_date } : {}),
  };
  return { path, html: page({ title, description, path, image, jsonLd, body }) };
}

// Ancienne adresse → la fiche : renvoi immédiat (garde ?version=… et #…), adresse
// officielle indiquée aux moteurs de recherche, lien si rien ne se passe
function redirectPage(path, game) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(game.title)} · Carte Mémoire</title>
    <link rel="canonical" href="${escape(url)}" />
    <script>location.replace(${JSON.stringify(path).replace(/</g, '\\u003c')} + location.search + location.hash);</script>
    <meta http-equiv="refresh" content="0; url=${escape(path)}" />
    <style>body { background: #0b0d1c; color: #e8e9f3; font-family: system-ui, sans-serif; padding: 24px; } a { color: #8fb4ff; }</style>
  </head>
  <body>
    <p>La fiche de ce jeu a changé d'adresse : <a href="${escape(path)}">${escape(game.title)}</a>.</p>
  </body>
</html>
`;
}

// Pages du site sans contenu propre : adresse directe sans « introuvable » ; les pages
// personnelles ne sont pas proposées aux moteurs de recherche
const ROUTES = [
  { path: '/catalogue', title: 'Catalogue des jeux PlayStation et PlayStation 2 · Carte Mémoire', description: 'Tous les jeux PlayStation et PlayStation 2, version par version (Black Label, Platinum, versions nationales), à cocher pour suivre ta collection.' },
  { path: '/mentions-legales', title: 'Mentions légales · Carte Mémoire' },
  { path: '/conditions', title: "Conditions d'utilisation · Carte Mémoire" },
  { path: '/confidentialite', title: 'Données personnelles et confidentialité · Carte Mémoire' },
  ...['collection', 'compte', 'proposer', 'mes-propositions', 'moderation', 'scanner', 'trophees', 'connexion', 'connexion/verification', 'inscription', 'mot-de-passe-oublie', 'reinitialiser']
    .map((p) => ({ path: `/${p}`, title: 'Carte Mémoire', noindex: true })),
];

// --- Tout est lu : on écrit ---------------------------------------------
const started = Date.now();
const games = (await readAll('game', SELECT, 'id')).filter((g) => g.release?.length);
const pages = games.map(gamePage);
const seen = new Set();
for (const p of pages) {
  if (seen.has(p.path)) throw new Error(`Deux jeux à la même adresse : ${p.path}`);
  seen.add(p.path);
}
// Anciennes adresses : la forme /jeu/36-titre (déjà connue des moteurs de recherche)
// et les adresses d'avant un titre corrigé ou une fusion de fiches
const byId = new Map(games.map((g) => [g.id, g]));
const history = await readAll('game_slug_history', 'slug,game_id', 'slug');
const redirects = new Map();
for (const g of games) if (g.slug) redirects.set(oldGamePath(g), g);
for (const h of history) if (byId.has(h.game_id)) redirects.set(`/jeu/${h.slug}`, byId.get(h.game_id));
for (const path of seen) redirects.delete(path);

const write = (relative, content) => {
  const file = join(dist, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
for (const p of pages) write(`${p.path.slice(1)}.html`, p.html);
for (const [path, game] of redirects) write(`${path.slice(1)}.html`, redirectPage(gamePath(game), game));
const defaultDescription = 'La base de données collaborative des jeux PlayStation, et ta collection.';
for (const r of ROUTES) write(`${r.path.slice(1)}.html`, page({ title: r.title, description: r.description ?? defaultDescription, path: r.path, noindex: r.noindex }));

// L'accueil : titre et aperçu de lien plus parlants (le modèle a déjà été lu plus haut)
write('index.html', page({
  title: 'Carte Mémoire · les jeux PlayStation, version par version, et ta collection',
  description: 'La base collaborative des jeux PlayStation et PlayStation 2 : toutes les versions (Black Label, Platinum, versions nationales), codes produit et jaquettes. Coche ta collection et suis ta progression.',
  path: '/',
}));

const indexed = ['/', ...ROUTES.filter((r) => !r.noindex).map((r) => r.path), ...pages.map((p) => p.path)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexed.map((p) => `  <url><loc>${escape(`${SITE}${p}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', ['User-agent: *', ...ROUTES.filter((r) => r.noindex).map((r) => `Disallow: ${r.path}`), 'Disallow: /membre/', '', `Sitemap: ${SITE}/sitemap.xml`, ''].join('\n'));

const size = pages.reduce((n, p) => n + Buffer.byteLength(p.html), 0);
console.log(`Référencement : ${pages.length} fiches de jeux (${(size / 1e6).toFixed(1)} Mo), ${redirects.size} anciennes adresses renvoyées, ${ROUTES.length} pages, sitemap.xml (${indexed.length} adresses), robots.txt — ${((Date.now() - started) / 1000).toFixed(1)} s`);
