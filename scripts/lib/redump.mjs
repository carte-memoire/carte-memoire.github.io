// =====================================================================
// Outils communs aux imports qui utilisent les noms « à la Redump »
// (jaquettes libretro-thumbnails, codes produits Redump) :
//   « Final Fantasy VII (France) (Disc 1) », « Gran Turismo (Europe) (En,Fr,De,Es,It) »…
// =====================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const USER_AGENT = 'carte-memoire-import/1.0 (projet personnel, import ponctuel)';

// Même idée que public.normalize_name : sans majuscules, accents, espaces ni ponctuation
export const normalize = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

const PAL = ['Europe', 'France', 'Germany', 'Spain', 'Italy', 'UK', 'Australia', 'Netherlands', 'Sweden', 'Scandinavia', 'Portugal', 'Greece', 'Denmark', 'Finland', 'Norway', 'Belgium', 'Switzerland', 'Austria', 'Poland', 'Russia'];
const NTSC_U = ['USA', 'Canada', 'Brazil'];
const NTSC_J = ['Japan', 'Asia', 'Korea', 'Taiwan', 'Hong Kong', 'China'];
// Pays de Redump → nos codes de région
const COUNTRY = { France: 'FR', Germany: 'DE', Spain: 'ES', Italy: 'IT', UK: 'GB', Australia: 'AU', Netherlands: 'NL', Sweden: 'SE', Korea: 'KR' };
// Langue par défaut quand le nom ne la précise pas (convention Redump : « Europe » seul = anglais)
const DEFAULT_LANGUAGE = { Japan: 'ja', USA: 'en', Canada: 'en', UK: 'en', Australia: 'en', Europe: 'en', France: 'fr', Germany: 'de', Spain: 'es', Italy: 'it', Netherlands: 'nl', Sweden: 'sv', Korea: 'ko' };
// Pas le jeu vendu en magasin : démos (dont les démos de magasin japonaises
// « Tentou Shiyuudai-you »), prototypes, disques bonus, guides…
const EXCLUDED = /demo|beta|proto|sample|taikenban|otameshi|kiosk|preview|trial|promo|not for resale|review|unl|pirate|hack|program|playable|tech|test|putative|sampler|tentou|shiyuu|shotenban|premium disc|special disc|perfect guide|append|bonus|making|trailer/i;
// Une autre édition que la standard : rééditions et éditions limitées, qui ont
// souvent leur propre code produit et leur propre jaquette
const SPECIAL_EDITION = /the best|psone books|major wave|rerelease|best choice|culture publishers|fukkokuban|reprint|greatest hits|platinum|genteiban|limited|premium|deluxe|controller set|special edition|tokubetsuban|value|nice price|collector/i;

// Adresse et clé PUBLIQUE du projet (web/.env.local) : lecture seule de la base
export function readEnv() {
  return Object.fromEntries(
    readFileSync(join(ROOT, 'web', '.env.local'), 'utf8').split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

export function publicApi(env) {
  return (path) => fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY } })
    .then((r) => { if (!r.ok) throw new Error(`Base : ${r.status} ${path}`); return r.json(); });
}

// Toutes les versions PS1 de la base, et toutes les façons d'écrire le titre de chaque jeu
export async function loadPs1Releases(api, fields) {
  const [ps1] = await api('platform?select=id&short_name=eq.PS1');
  const releases = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await api(`release?select=id,game_id,zone,local_title,edition_type,release_region(region(code)),game(title),${fields}&platform_id=eq.${ps1.id}&order=id&limit=1000&offset=${offset}`);
    releases.push(...page);
    if (page.length < 1000) break;
  }
  const keysOfGame = new Map();
  for (const r of releases) {
    if (!keysOfGame.has(r.game_id)) keysOfGame.set(r.game_id, new Set([normalize(r.game.title)]));
    keysOfGame.get(r.game_id).add(normalize(r.local_title));
  }
  return { releases, keysOfGame };
}

// « Gran Turismo (Europe) (En,Fr,De,Es,It) (Disc 1) » → ses informations
export function parseName(name) {
  const tags = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  if (tags.some((t) => EXCLUDED.test(t))) return null;
  let base = name.replace(/\s*\(.*$/, '').replace(/_/g, ' ').trim();
  const article = /^(.*), (The|A|An)$/.exec(base); // « Legend of Dragoon, The »
  if (article) base = `${article[2]} ${article[1]}`;
  const places = (tags[0] ?? '').split(/,\s*/);
  const zones = new Set();
  if (places.some((p) => PAL.includes(p))) zones.add('PAL');
  if (places.some((p) => NTSC_U.includes(p))) zones.add('NTSC-U');
  if (places.some((p) => NTSC_J.includes(p))) zones.add('NTSC-J');
  if (places.includes('World')) ['PAL', 'NTSC-U', 'NTSC-J'].forEach((z) => zones.add(z));
  if (zones.size === 0) return null;
  // Langues : tag du type « En,Fr,De », sinon déduites du premier pays
  const langTag = tags.find((t) => /^[A-Z][a-z](,[A-Z][a-z])*$/.test(t));
  const languages = langTag
    ? langTag.split(',').map((l) => l.toLowerCase())
    : DEFAULT_LANGUAGE[places[0]] ? [DEFAULT_LANGUAGE[places[0]]] : [];
  // Variantes de titre, en secours : « CTR - Crash Team Racing » → « CTR » et « Crash Team Racing »
  const parts = base.split(' - ');
  return {
    name,
    key: normalize(base),
    aliases: parts.length === 2 ? parts.map(normalize).filter((k) => k.length >= 4) : [],
    places,
    zones,
    languages,
    disc: Number(/Disc (\d+)/.exec(name)?.[1] ?? 0),
    rev: /Rev \d/.test(name),
    special: tags.some((t) => SPECIAL_EDITION.test(t)),
  };
}

export function buildIndex(entries) {
  const byKey = new Map();
  const byAlias = new Map();
  const add = (map, k, e) => { if (!map.has(k)) map.set(k, []); map.get(k).push(e); };
  for (const e of entries) {
    add(byKey, e.key, e);
    for (const a of e.aliases) add(byAlias, a, e);
  }
  return { byKey, byAlias };
}

// Préférence : le pays exact de la version, puis l'Europe pour le PAL, une
// version qui contient le français, sans numéro de disque ni révision…
function score(entry, release) {
  const countries = release.release_region.map((rr) => rr.region.code);
  let s = 0;
  if (countries.some((c) => entry.places.some((p) => COUNTRY[p] === c))) s += 100;
  if (release.zone === 'PAL' && entry.places[0] === 'Europe') s += 50;
  if (release.zone === 'PAL' && (entry.places.includes('France') || entry.languages.includes('fr'))) s += 20; // site en français
  if (release.zone === 'NTSC-U' && entry.places[0] === 'USA') s += 50;
  if (release.zone === 'NTSC-J' && entry.places[0] === 'Japan') s += 50;
  if (entry.places.length === 1) s += 5;
  if (entry.disc === 0) s += 10; else s -= entry.disc;
  if (!entry.rev) s += 2;
  if (entry.special) s -= 40; // nos versions importées sont des éditions standard
  return s;
}

// La meilleure entrée pour une version : titre exact d'abord, variantes de titre en secours
export function bestMatch(release, keysOfGame, index, accept = () => true) {
  const keys = [...keysOfGame.get(release.game_id)];
  const inZone = (e) => e.zones.has(release.zone) && accept(e);
  let candidates = keys.flatMap((k) => index.byKey.get(k) ?? []).filter(inZone);
  let viaAlias = false;
  if (candidates.length === 0) {
    candidates = keys.flatMap((k) => index.byAlias.get(k) ?? []).filter(inZone);
    viaAlias = candidates.length > 0;
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => score(b, release) - score(a, release));
  return { entry: candidates[0], viaAlias, candidates };
}
