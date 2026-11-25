// Carte Mémoire · textures des étagères : des rendus de Blender (textures.py) aux images du site
//
// Pour chaque matière :
//   - <nom>-fil.webp : la planche, fil horizontal (face avant des tablettes, haut et socle du
//     meuble), raccordable à l'horizontale ;
//   - <nom>-panneau.webp : le panneau tourné à la verticale (fond du meuble, montants),
//     raccordable à la verticale. À l'horizontale, il se répète tous les 640 px, pile sur une
//     rainure des lames du fond (styles.css) : la jonction ne se voit pas.
// Raccord : les derniers pixels se fondent dans les premiers (fondu de 256 px le long du fil).
//
// Lancer : node scripts/etagere/encode.mjs <dossier des rendus>
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2];
if (!source) throw new Error('Dossier des rendus manquant');
const target = join(here, '../../web/src/assets/etagere');
mkdirSync(target, { recursive: true });
const OVERLAP = 256;

// Image raccordable : `along` = 'x' (fondu sur la largeur) ou 'y' (sur la hauteur)
async function seamless(input, along) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const outW = along === 'x' ? width - OVERLAP : width;
  const outH = along === 'y' ? height - OVERLAP : height;
  const out = Buffer.alloc(outW * outH * channels);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const pos = along === 'x' ? x : y;
      const o = (y * outW + x) * channels;
      const here = (y * width + x) * channels;
      if (pos >= OVERLAP) {
        data.copy(out, o, here, here + channels);
        continue;
      }
      // Début du motif : on part de la suite de la fin (raccord) pour revenir au début
      const t = pos / OVERLAP;
      const tail = along === 'x' ? (y * width + x + outW) * channels : ((y + outH) * width + x) * channels;
      for (let c = 0; c < channels; c++) out[o + c] = Math.round(data[tail + c] * (1 - t) + data[here + c] * t);
    }
  }
  return sharp(out, { raw: { width: outW, height: outH, channels } });
}

for (const file of readdirSync(source).filter((f) => /-(fil|panneau)\.png$/.test(f))) {
  const name = file.replace(/\.png$/, '');
  const input = join(source, file);
  const image = file.endsWith('-fil.png')
    ? await seamless(input, 'x')
    : await seamless(await sharp(input).rotate(90).png().toBuffer(), 'y');
  const info = await image.webp({ quality: 74, effort: 6, smartSubsample: true }).toFile(join(target, `${name}.webp`));
  console.log(`${name}.webp  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} Ko`);
}
