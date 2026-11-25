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
// Chaque page existe aussi en anglais, à son adresse /en/… (dist/en/jeu/…) : les deux
// versions se désignent l'une l'autre (balises hreflang), pour que Google montre la
// bonne langue à chacun.
// Les anciennes adresses (/jeu/36-final-fantasy-vii, titre corrigé depuis) ont une
// petite page qui renvoie vers la nouvelle : liens partagés et moteurs suivent.
//
// Prudence : toutes les données sont lues AVANT d'écrire le moindre fichier ; en
// cas d'erreur, rien n'est écrit et le site se publie comme avant.
//
// Usage (après « npm run build », dans web/) : node scripts/prerender.mjs
// Variables : VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (sinon lues dans
// .env.local), SITE_URL (adresse publique du site, https://carte-memoire.app
// par défaut).
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
const SITE = (process.env.SITE_URL || 'https://carte-memoire.app').trim().replace(/\/+$/, '');
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
// Les mêmes libellés en anglais (comme src/lib/i18n-en.ts)
const ZONES_EN = { 'NTSC-J': 'Japan (NTSC-J)', 'NTSC-U': 'North America (NTSC-U)', PAL: 'Europe (PAL)', region_free: 'Region free' };
const EDITIONS_EN = { standard: 'Standard', reissue: 'Reissue', collector: "Collector's edition", demo: 'Demo', promo: 'Promotional', bundle: 'Bundle' };
const languageNamesEn = new Intl.DisplayNames(['en'], { type: 'language' });
const languageNameEn = (code) => { try { return languageNamesEn.of(code) ?? code; } catch { return code; } };
// Adresse d'une page dans une langue : /jeu/x en français, /en/jeu/x en anglais (accueil : /en/)
const inLang = (lang, path) => (lang === 'en' ? `/en${path}` : path);
const coverUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/covers/${path.split('/').map(encodeURIComponent).join('/')}`;

const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Coupé proprement (sur un mot) pour une description de 155 caractères environ
function shorten(text, max = 155) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.]+$/, '')}…`;
}

// --- Lecture du catalogue public (250 jeux par appel) ------------------
// Les mêmes champs que la fiche du site (src/lib/queries.ts, en JavaScript pur pour être
// lu ici tel quel) : chaque page contient les données de sa fiche, que le site affiche
// sans attendre la base (et que les robots des moteurs de recherche lisent ainsi)
const queries = await import(`data:text/javascript,${encodeURIComponent(readFileSync(join(root, 'src', 'lib', 'queries.ts'), 'utf8'))}`);
const SELECT = queries.GAME_FIELDS.replace(/\s+/g, '');

// Par paquets de 250, à la suite de la dernière clé lue (pas de « offset », de plus en
// plus lent) : 1 000 jeux avec toutes leurs versions dépassaient le temps accordé aux
// visiteurs par la base (« statement timeout », erreur 57014), et la génération échouait
// à chaque publication depuis que le catalogue a doublé. Un paquet refusé est redemandé.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function readAll(table, select, key, size = 250) {
  const rows = [];
  for (let after = null; ;) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${key}&limit=${size}`
      + (after === null ? '' : `&${key}=gt.${encodeURIComponent(after)}`);
    let page;
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, { headers: { apikey: KEY, Accept: 'application/json' } });
      if (response.ok) { page = await response.json(); break; }
      const text = (await response.text()).slice(0, 300);
      if (attempt >= 5 || response.status < 500) throw new Error(`Lecture du catalogue impossible (${response.status}) : ${text}`);
      console.log(`  ${table} : réponse ${response.status}, nouvel essai dans ${attempt * 5} s`);
      await pause(attempt * 5000);
    }
    rows.push(...page);
    if (page.length < size) return rows;
    after = page.at(-1)[key];
  }
}

// --- Une page par jeu ---------------------------------------------------
const template = readFileSync(join(dist, 'index.html'), 'utf8');

// path : adresse de la page dans sa langue ; frPath : la même page en français (pour les
// balises hreflang, qui désignent les deux versions l'une l'autre)
function page({ title, description, path, frPath = path, lang = 'fr', image, jsonLd, body, data, noindex = false }) {
  const url = `${SITE}${path}`;
  const alternates = noindex ? [] : [
    `<link rel="alternate" hreflang="fr" href="${escape(`${SITE}${frPath}`)}" />`,
    `<link rel="alternate" hreflang="en" href="${escape(`${SITE}${inLang('en', frPath)}`)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escape(`${SITE}${frPath}`)}" />`,
  ];
  const head = [
    `<title>${escape(title)}</title>`,
    `<link rel="canonical" href="${escape(url)}" />`,
    ...alternates,
    noindex ? '<meta name="robots" content="noindex" />' : '',
    `<meta property="og:site_name" content="Carte Mémoire" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'fr_FR'}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    image ? `<meta property="og:image" content="${escape(image)}" />` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    // Données structurées : jamais de « </ » dans le JSON (fin de balise)
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '',
    // Données de la fiche pour le site (pages/GamePage.tsx), même précaution
    data ? `<script type="application/json" id="fiche-jeu">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
  // Remplacements par fonction : un « $ » dans un résumé ($&, $'…) resterait tel quel
  let html = template
    .replace('<html lang="fr">', () => `<html lang="${lang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, () => head)
    .replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${escape(description)}" />`);
  if (body) html = html.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
  if (!html.includes(escape(title)) || (body && !html.includes(body))) throw new Error(`Modèle de page inattendu (${path})`);
  return html;
}

function gamePage(game, lang = 'fr') {
  const en = lang === 'en';
  const zoneNames = en ? ZONES_EN : ZONES;
  const editionNames = en ? EDITIONS_EN : EDITIONS;
  const nameOf = en ? languageNameEn : languageName;
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
  // Le résumé de la langue de la page ; sinon celui de l'autre langue (balisé comme tel)
  const summary = en ? game.summary_en : game.summary;
  const otherSummary = en ? game.summary : game.summary_en;
  const title = en
    ? `${game.title} (${platformText}): versions and collection · Carte Mémoire`
    : `${game.title} (${platformText}) : versions et collection · Carte Mémoire`;
  const zoneList = zones.length ? ` (${zones.map((z) => zoneNames[z]?.split(' (')[0] ?? z).join(', ')})` : '';
  const description = summary
    ? shorten(summary)
    : en
      ? shorten(`${game.title}${year ? ` (${year})` : ''} on ${platformText}: ${releases.length} version${releases.length > 1 ? 's' : ''}${zoneList}, product codes, editions, languages and covers. Tick the ones in your collection.`)
      : shorten(`${game.title}${year ? ` (${year})` : ''} sur ${platformText} : ${releases.length} version${releases.length > 1 ? 's' : ''}${zoneList}, codes produit, éditions, langues et jaquettes. Coche celles de ta collection.`);
  const frPath = gamePath(game);
  const path = inLang(lang, frPath);

  const facts = [platformText, year, developers.slice(0, 3).join(', '), genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
  const versions = releases.map((r) => {
    const parts = [zoneNames[r.zone] ?? r.zone, r.edition_name || editionNames[r.edition_type] || r.edition_type, r.product_code,
      (r.languages ?? []).map(nameOf).join(', '), platforms.length > 1 ? r.platform?.short_name : null].filter(Boolean);
    return `<li><strong>${escape(r.local_title)}</strong> · ${escape(parts.join(' · '))}</li>`;
  }).join('');
  const body = '<div class="prerender">'
    + `<p class="prerender-site"><a href="${en ? '/en/' : '/'}">Carte Mémoire</a> · <a href="${inLang(lang, '/catalogue')}">${en ? 'Catalogue' : 'Catalogue'}</a></p>`
    + `<article class="panel"><h1>${escape(game.title)}</h1>`
    + (facts ? `<p class="muted">${escape(facts)}</p>` : '')
    + (series.length ? `<p>${en ? 'Series: ' : 'Série : '}${escape(series.join(', '))}</p>` : '')
    // Sans résumé dans la langue de la page, celui de l'autre langue (balisé comme tel pour
    // les moteurs de recherche)
    + (summary ? `<p>${escape(summary)}</p>` : otherSummary ? `<p lang="${en ? 'fr' : 'en'}">${escape(otherSummary)}</p>` : '')
    + `<h2>Versions (${releases.length})</h2><ul>${versions}</ul></article></div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    url: `${SITE}${path}`,
    inLanguage: lang,
    ...(image ? { image } : {}),
    ...(summary || otherSummary ? { description: shorten(summary || otherSummary, 500) } : {}),
    gamePlatform: platforms,
    ...(genres.length ? { genre: genres } : {}),
    ...(developers.length ? { author: developers.map((name) => ({ '@type': 'Organization', name })) } : {}),
    ...(game.first_release_date ? { datePublished: game.first_release_date } : {}),
  };
  return { path, html: page({ title, description, path, frPath, lang, image, jsonLd, body, data: game }) };
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
  { path: '/catalogue', title: 'Catalogue des jeux PlayStation et PlayStation 2 · Carte Mémoire', description: 'Tous les jeux PlayStation et PlayStation 2, version par version (Black Label, Platinum, versions nationales), à cocher pour suivre ta collection.',
    en: { title: 'PlayStation and PlayStation 2 games catalogue · Carte Mémoire', description: 'Every PlayStation and PlayStation 2 game, version by version (Black Label, Platinum, national versions), to tick off as you build your collection.' } },
  { path: '/mentions-legales', title: 'Mentions légales · Carte Mémoire', en: { title: 'Legal notice · Carte Mémoire' } },
  { path: '/conditions', title: "Conditions d'utilisation · Carte Mémoire", en: { title: 'Terms of use · Carte Mémoire' } },
  { path: '/confidentialite', title: 'Données personnelles et confidentialité · Carte Mémoire', en: { title: 'Personal data and privacy · Carte Mémoire' } },
  ...['collection', 'compte', 'proposer', 'mes-propositions', 'moderation', 'scanner', 'trophees', 'connexion', 'connexion/verification', 'inscription', 'mot-de-passe-oublie', 'reinitialiser']
    .map((p) => ({ path: `/${p}`, title: 'Carte Mémoire', noindex: true })),
];

// --- Tout est lu : on écrit ---------------------------------------------
const started = Date.now();
const games = (await readAll('game', SELECT, 'id')).filter((g) => g.release?.length);
const pages = games.flatMap((g) => [gamePage(g, 'fr'), gamePage(g, 'en')]);
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
const defaultDescriptionEn = 'The collaborative database of PlayStation games, and your collection.';
for (const r of ROUTES) {
  write(`${r.path.slice(1)}.html`, page({ title: r.title, description: r.description ?? defaultDescription, path: r.path, noindex: r.noindex }));
  write(`en${r.path}.html`, page({ title: r.en?.title ?? r.title, description: r.en?.description ?? defaultDescriptionEn, path: inLang('en', r.path), frPath: r.path, lang: 'en', noindex: r.noindex }));
}

// L'accueil : titre et aperçu de lien plus parlants (le modèle a déjà été lu plus haut)
write('index.html', page({
  title: 'Carte Mémoire · les jeux PlayStation, version par version, et ta collection',
  description: 'La base collaborative des jeux PlayStation et PlayStation 2 : toutes les versions (Black Label, Platinum, versions nationales), codes produit et jaquettes. Coche ta collection et suis ta progression.',
  path: '/',
}));
// L'accueil anglais : /en/ (un dossier, servi avec sa barre finale par GitHub Pages)
write('en/index.html', page({
  title: 'Carte Mémoire · PlayStation games, version by version, and your collection',
  description: 'The collaborative database of PlayStation and PlayStation 2 games: every version (Black Label, Platinum, national versions), product codes and covers. Tick off your collection and track your progress.',
  path: '/en/',
  frPath: '/',
  lang: 'en',
}));

const publicRoutes = ROUTES.filter((r) => !r.noindex).map((r) => r.path);
const indexed = ['/', '/en/', ...publicRoutes, ...publicRoutes.map((p) => inLang('en', p)), ...pages.map((p) => p.path)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexed.map((p) => `  <url><loc>${escape(`${SITE}${p}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
const hidden = ROUTES.filter((r) => r.noindex).map((r) => r.path);
write('robots.txt', ['User-agent: *', ...hidden.map((p) => `Disallow: ${p}`), ...hidden.map((p) => `Disallow: /en${p}`), 'Disallow: /membre/', 'Disallow: /en/membre/', '', `Sitemap: ${SITE}/sitemap.xml`, ''].join('\n'));

const size = pages.reduce((n, p) => n + Buffer.byteLength(p.html), 0);
console.log(`Référencement : ${pages.length} fiches de jeux (français et anglais) (${(size / 1e6).toFixed(1)} Mo), ${redirects.size} anciennes adresses renvoyées, ${ROUTES.length} pages, sitemap.xml (${indexed.length} adresses), robots.txt — ${((Date.now() - started) / 1000).toFixed(1)} s`);
