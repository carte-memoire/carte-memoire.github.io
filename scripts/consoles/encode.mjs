// Carte Mémoire · consoles de l'accueil : des rendus de Blender (render.py) aux images du site
//
// Chaque rendu (PNG transparent, 960 × 576) est rogné autour de la console et de son ombre,
// puis posé au centre d'une image de 288 × 192 (trois fois la place de la carte « Par console »,
// 96 × 64 px, pour les écrans haute densité), en WebP transparent.
//
// Lancer : node scripts/consoles/encode.mjs <dossier des rendus>
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2];
if (!source) throw new Error('Dossier des rendus manquant');
const target = join(here, '../../web/src/assets/consoles');
mkdirSync(target, { recursive: true });

let total = 0;
for (const file of readdirSync(source).filter((f) => f.endsWith('.png') && /^[A-Z0-9]+.png$/.test(f))) {
  const code = file.replace(/\.png$/, '');
  const out = join(target, `${code}.webp`);
  const trimmed = await sharp(join(source, file)).trim({ threshold: 2 }).toBuffer();
  await sharp(trimmed)
    .resize(288, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 84, alphaQuality: 90, effort: 6 })
    .toFile(out);
  const size = statSync(out).size;
  total += size;
  console.log(`${code}.webp  ${(size / 1024).toFixed(1)} Ko`);
}
console.log(`Total : ${(total / 1024).toFixed(0)} Ko`);
