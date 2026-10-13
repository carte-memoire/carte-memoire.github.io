// =====================================================================
// Consoles que les scripts d'import savent traiter, et ce qu'il faut pour
// chacune : identifiant Wikidata, listes Wikipédia, fichiers Redump et
// jaquettes libretro. Les scripts prennent l'option --console PS2
// (sans option : la PlayStation, comme avant).
// =====================================================================

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const CONSOLES = {
  PS1: {
    code: 'PS1',
    name: 'PlayStation',
    slug: 'ps1',
    wikidata: 'Q10677',
    // Listes Wikipédia : une colonne de dates par zone (JP, PAL, NA) et la mention P des Platinum
    wikipediaPages: ['List of PlayStation (console) games (A–L)', 'List of PlayStation (console) games (M–Z)'],
    wikipediaFormat: 'dates-by-zone',
    redump: 'Sony - PlayStation',
    thumbnails: 'libretro-thumbnails/Sony_-_PlayStation',
  },
  PS2: {
    code: 'PS2',
    name: 'PlayStation 2',
    slug: 'ps2',
    wikidata: 'Q10680',
    // Listes Wikipédia : la date de première sortie, puis une colonne « sorti oui/non » par zone
    wikipediaPages: ['List of PlayStation 2 games (A–K)', 'List of PlayStation 2 games (L–Z)'],
    wikipediaFormat: 'first-date-and-zones',
    redump: 'Sony - PlayStation 2',
    thumbnails: 'libretro-thumbnails/Sony_-_PlayStation_2',
    // Un jeu Wikidata n'est importé que si la liste Wikipédia ou Redump le confirme
    // (Wikidata classe aussi en PS2 des jeux annulés ou sortis seulement en compilation)
    confirmWikidata: true,
  },
};

// Fichier Redump d'une console (libretro-database) : noms des disques vérifiés
export const redumpDatUrl = (console_) =>
  `https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/${encodeURIComponent(console_.redump)}.dat`;

// --console PS2 (ou --console=PS2) ; sans option, la PlayStation
export function consoleFromArgs(argv = process.argv) {
  const i = argv.findIndex((a) => a === '--console' || a.startsWith('--console='));
  const code = i < 0 ? 'PS1' : argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
  const console_ = CONSOLES[String(code ?? '').toUpperCase()];
  if (!console_) throw new Error(`Console inconnue : ${code} (possibles : ${Object.keys(CONSOLES).join(', ')})`);
  return console_;
}

// Horodatage d'une nouvelle migration : juste après la plus récente du dossier, pour que
// les migrations écrites à la main ensuite restent dans l'ordre (db push refuse une
// migration plus ancienne que la dernière envoyée)
export function nextMigrationStamp(root) {
  const latest = readdirSync(join(root, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).filter((n) => /^\d{14}$/.test(n)).sort().at(-1);
  return String(BigInt(latest) + 100n);
}
