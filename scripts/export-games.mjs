// =====================================================================
// Carte Mémoire · Export de tous les jeux d'une console en CSV
//
// Une ligne par jeu : titres européen, américain et japonais, année, zones,
// codes produits, éditeurs, développeurs, familles et genres, jaquette.
// Fichier lisible dans Excel ou LibreOffice (séparateur « ; », UTF-8 avec BOM).
// Lecture seule, avec la clé publique (les données du catalogue sont publiques).
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/export-games.mjs        → exports/jeux-ps1-AAAA-MM-JJ.csv
//   node scripts/export-games.mjs NES    → une autre console (code court)
//   node scripts/export-games.mjs --sans-genre
//       → seulement les jeux encore sans genre (et non revus), avec un lien de
//         recherche et des colonnes « familles » et « genre_precis » à remplir
// =====================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, publicApi, readEnv } from './lib/redump.mjs';

const args = process.argv.slice(2);
const withoutGenre = args.includes('--sans-genre');
const platformCode = args.find((a) => !a.startsWith('--')) ?? 'PS1';
const FAMILIES = {
  action: 'Action', adventure: 'Aventure', fighting: 'Combat', racing: 'Course', horror: 'Horreur',
  music: 'Musique et rythme', party: 'Société, hasard et party games', platform: 'Plates-formes', puzzle: 'Réflexion',
  rpg: 'RPG', simulation: 'Simulation', sports: 'Sport', strategy: 'Stratégie', shooter: 'Tir', visual_novel: 'Visual novel',
};

const api = publicApi(readEnv());
const [platform] = await api(`platform?select=id,name&short_name=eq.${encodeURIComponent(platformCode)}`);
if (!platform) throw new Error(`Console inconnue : ${platformCode}`);

console.log(`Lecture des jeux ${platform.name}…`);
const games = [];
const fields = [
  'id', 'title', 'genres_reviewed',
  'game_genre(genre(name,families))',
  'game_developer(company(name))',
  `release!inner(zone,local_title,product_code,edition_type,platform_id,release_region(release_date),release_company(role,company(name)),image(id,type))`,
].join(',');
for (let offset = 0; ; offset += 500) {
  const page = await api(`game?select=${fields}&release.platform_id=eq.${platform.id}&order=title,id&limit=500&offset=${offset}`);
  games.push(...page);
  if (page.length < 500) break;
}

const unique = (list) => [...new Set(list.filter(Boolean))];
const titleIn = (g, zone) => g.release.find((r) => r.zone === zone && r.edition_type === 'standard')?.local_title
  ?? g.release.find((r) => r.zone === zone)?.local_title ?? '';
const slug = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Jeux encore sans genre : aucun genre avec une famille (les thèmes ne comptent pas), non revus
const selected = withoutGenre
  ? games.filter((g) => !g.genres_reviewed && !g.game_genre.some((x) => x.genre.families.length > 0))
  : games;

const rows = selected.map((g) => {
  const genres = g.game_genre.map((x) => x.genre);
  const dates = g.release.flatMap((r) => r.release_region.map((x) => x.release_date)).filter(Boolean).sort();
  const zoneOrder = ['NTSC-J', 'NTSC-U', 'PAL', 'region_free'];
  return [
    String(g.id),
    g.title,
    titleIn(g, 'PAL'),
    titleIn(g, 'NTSC-U'),
    titleIn(g, 'NTSC-J'),
    dates[0]?.slice(0, 4) ?? '',
    unique(g.release.map((r) => r.zone)).sort((a, b) => zoneOrder.indexOf(a) - zoneOrder.indexOf(b)).join(', '),
    String(g.release.length),
    unique(g.release.map((r) => r.product_code)).join(', '),
    unique(g.release.flatMap((r) => r.release_company.filter((c) => c.role === 'publisher').map((c) => c.company.name))).join(', '),
    unique(g.game_developer.map((d) => d.company.name)).join(', '),
    unique(genres.flatMap((x) => x.families).map((f) => FAMILIES[f] ?? f)).join(', '),
    genres.filter((x) => x.families.length > 0).map((x) => x.name).join(', '),
    genres.filter((x) => x.families.length === 0).map((x) => x.name).join(', '),
    g.release.some((r) => r.image.some((i) => i.type === 'front')) ? 'oui' : 'non',
    `/jeu/${g.id}-${slug(g.title)}`,
  ];
});

// Cellules : une formule (=, +, -, @) est neutralisée, comme dans l'export du site
const cell = (v) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
const header = ['id', 'titre', 'titre_europe', 'titre_usa', 'titre_japon', 'annee', 'zones', 'versions', 'codes_produits',
  'editeurs', 'developpeurs', 'familles', 'genres', 'themes', 'jaquette', 'adresse'];
// Version « à classer » : moins de colonnes, une recherche toute prête, deux colonnes à remplir
const search = (g) => `https://www.google.com/search?q=${encodeURIComponent(`"${titleIn(g, 'NTSC-J') || g.title}" PlayStation jeu genre`)}`;
const todoHeader = ['id', 'titre', 'titre_japon', 'titre_europe', 'titre_usa', 'annee', 'zones', 'editeurs', 'developpeurs',
  'codes_produits', 'themes', 'recherche', 'familles', 'genre_precis'];
const todo = selected.map((g, i) => {
  const [id, title, eu, us, jp, year, zones, , codes, publishers, developers, , , themes] = rows[i];
  return [id, title, jp, eu, us, year, zones, publishers, developers, codes, themes, search(g), '', ''];
});
const csv = (withoutGenre ? [todoHeader, ...todo] : [header, ...rows]).map((r) => r.map(cell).join(';')).join('\r\n');

const dir = join(ROOT, 'exports');
mkdirSync(dir, { recursive: true });
const file = join(dir, `jeux-${platformCode.toLowerCase()}${withoutGenre ? '-sans-genre' : ''}-${new Date().toISOString().slice(0, 10)}.csv`);
writeFileSync(file, `﻿${csv}`);
console.log(`${rows.length} jeux → ${file}`);
