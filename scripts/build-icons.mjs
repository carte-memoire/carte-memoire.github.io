// =====================================================================
// Carte Mémoire · Icônes de l'application (écran d'accueil du téléphone)
//
// À partir de web/public/favicon.svg (la carte mémoire), écrit dans web/public :
//   icon-192.png, icon-512.png    icônes du manifeste (manifest.webmanifest)
//   icon-maskable-512.png         icône « maskable » : Android la rogne en rond ou en
//                                 carré arrondi, le dessin reste dans la zone sûre (80 %)
//   apple-touch-icon.png (180)    iPhone et iPad (pas de transparence, coins arrondis
//                                 ajoutés par iOS)
// À relancer si favicon.svg change :  node scripts/build-icons.mjs
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const PUBLIC = join(import.meta.dirname, '..', 'web', 'public');
const BACKGROUND = '#0b0d1c'; // --bg du site (et theme-color)

// Le dessin du favicon (sans sa balise <svg>), posé sur un fond, à l'échelle voulue
const drawing = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
function icon(scale) {
  const offset = (32 - 32 * scale) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${drawing}</g>
</svg>`);
}

const files = [
  ['icon-192.png', 192, 0.8],
  ['icon-512.png', 512, 0.8],
  ['icon-maskable-512.png', 512, 0.6],
  ['apple-touch-icon.png', 180, 0.8],
];
for (const [name, size, scale] of files) {
  writeFileSync(join(PUBLIC, name), await sharp(icon(scale), { density: 72 * (size / 32) }).resize(size, size).png().toBuffer());
  console.log(`${name}  ${size}×${size}`);
}
