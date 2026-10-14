import { tr } from './i18n';

// Recadrage d'une photo de jaquette : on pose un coin sur chaque coin de la boîte,
// et l'image est redressée (perspective), même photographiée de biais. Tout se passe
// dans le navigateur.

export interface Point { x: number; y: number }
// Haut-gauche, haut-droite, bas-droite, bas-gauche
export type Quad = [Point, Point, Point, Point];

// Format de la jaquette : boîtier CD (PS1, presque carré), boîtier DVD (PS2,
// 135 × 190 mm), ou libre (sans cadre : les proportions de ce qui est photographié,
// pour les éditions collector, les bundles, les boîtes en carton…)
export type CaseFormat = 'cd' | 'dvd' | 'free';
export const CASE_FORMATS: { value: CaseFormat; label: string; ratio: number | null }[] = [
  { value: 'cd', label: tr('Boîtier CD (carré)'), ratio: 1 },
  { value: 'dvd', label: tr('Boîtier DVD (haut)'), ratio: 135 / 190 },
  { value: 'free', label: tr('Sans cadre (libre)'), ratio: null },
];
// Le boîtier habituel de chaque console (cadre de l'appareil photo, format du recadrage).
// À COMPLÉTER à chaque nouvelle console importée (Game Boy : carré ; GameCube : proche
// du DVD…) ; une console absente prend le boîtier CD.
const CASE_BY_PLATFORM: Record<string, CaseFormat> = {
  PS1: 'cd',
  PS2: 'dvd',
};
// Une édition collector ou un bundle n'a pas forcément le boîtier standard : sans cadre
export function caseFormatFor(platform?: string | null, editionType?: string | null): CaseFormat {
  if (editionType === 'collector' || editionType === 'bundle') return 'free';
  return CASE_BY_PLATFORM[platform ?? ''] ?? 'cd';
}
export const fixedRatio = (format: CaseFormat): number => CASE_FORMATS.find((f) => f.value === format)?.ratio ?? 1;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Largeur / hauteur : celle du format, ou estimée d'après les côtés du quadrilatère
export function coverRatio(format: CaseFormat, quad: Quad): number {
  const ratio = CASE_FORMATS.find((f) => f.value === format)?.ratio;
  if (ratio) return ratio;
  const width = (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2;
  const height = (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2;
  return height > 0 ? Math.min(3, Math.max(1 / 3, width / height)) : 1;
}

// Taille finale : dans 480 × 672, comme les jaquettes du site
export function outputSize(ratio: number, maxWidth = 480, maxHeight = 672): { width: number; height: number } {
  return ratio >= maxWidth / maxHeight
    ? { width: maxWidth, height: Math.round(maxWidth / ratio) }
    : { width: Math.round(maxHeight * ratio), height: maxHeight };
}

// Quadrilatère de départ : l'image entière, un peu en retrait des bords
export function insetQuad(width: number, height: number, margin = 0.06): Quad {
  const mx = width * margin;
  const my = height * margin;
  return [{ x: mx, y: my }, { x: width - mx, y: my }, { x: width - mx, y: height - my }, { x: mx, y: height - my }];
}

// Carré unité → quadrilatère (homographie, méthode de Heckbert)
function squareToQuad(q: Quad) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-9 && Math.abs(den) > 1e-12) {
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return {
    a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x,
    d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y,
    g, h,
  };
}

// La jaquette redressée : chaque point de l'image finale va chercher sa couleur dans la
// photo (interpolation bilinéaire). La photo est d'abord réduite vers ~2× la taille
// finale par le navigateur (réduction de qualité), pour éviter le crénelage.
export function warpCover(source: HTMLCanvasElement, quad: Quad, width: number, height: number): HTMLCanvasElement {
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  const left = Math.max(0, Math.floor(Math.min(...xs))), top = Math.max(0, Math.floor(Math.min(...ys)));
  const right = Math.min(source.width, Math.ceil(Math.max(...xs))), bottom = Math.min(source.height, Math.ceil(Math.max(...ys)));
  const boxW = Math.max(1, right - left), boxH = Math.max(1, bottom - top);
  const quadW = Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2]), 1);
  const quadH = Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]), 1);
  const scale = Math.min(1, (2 * width) / quadW, (2 * height) / quadH);

  const work = document.createElement('canvas');
  work.width = Math.max(1, Math.round(boxW * scale));
  work.height = Math.max(1, Math.round(boxH * scale));
  const workContext = work.getContext('2d', { willReadFrequently: true })!;
  workContext.imageSmoothingQuality = 'high';
  workContext.drawImage(source, left, top, boxW, boxH, 0, 0, work.width, work.height);
  const src = workContext.getImageData(0, 0, work.width, work.height).data;
  const sw = work.width, sh = work.height;

  const m = squareToQuad(quad.map((p) => ({ x: (p.x - left) * scale, y: (p.y - top) * scale })) as Quad);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outContext = out.getContext('2d')!;
  const image = outContext.createImageData(width, height);
  const dst = image.data;
  for (let v = 0; v < height; v++) {
    const t = (v + 0.5) / height;
    for (let u = 0; u < width; u++) {
      const s = (u + 0.5) / width;
      const w = m.g * s + m.h * t + 1;
      const x = Math.min(sw - 1, Math.max(0, (m.a * s + m.b * t + m.c) / w - 0.5));
      const y = Math.min(sh - 1, Math.max(0, (m.d * s + m.e * t + m.f) / w - 0.5));
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const o = (v * width + u) * 4;
      for (let k = 0; k < 3; k++) {
        const top_ = src[i00 + k] + (src[i10 + k] - src[i00 + k]) * fx;
        const bottom_ = src[i01 + k] + (src[i11 + k] - src[i01 + k]) * fx;
        dst[o + k] = top_ + (bottom_ - top_) * fy;
      }
      dst[o + 3] = 255;
    }
  }
  outContext.putImageData(image, 0, 0);
  return out;
}

// Rotation d'un quart de tour (1 : sens des aiguilles d'une montre, -1 : sens inverse),
// avec les coins posés, qui suivent l'image
export function rotatePhoto(source: HTMLCanvasElement, quad: Quad, turn: 1 | -1): { image: HTMLCanvasElement; quad: Quad } {
  const image = document.createElement('canvas');
  image.width = source.height;
  image.height = source.width;
  const context = image.getContext('2d')!;
  context.translate(image.width / 2, image.height / 2);
  context.rotate((turn * Math.PI) / 2);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  const move = (p: Point): Point => (turn === 1 ? { x: source.height - p.y, y: p.x } : { x: p.y, y: source.width - p.x });
  const [tl, tr_, br, bl] = quad.map(move);
  // Le coin qui se retrouve en haut à gauche devient le premier
  return { image, quad: turn === 1 ? [bl, tl, tr_, br] : [tr_, br, bl, tl] };
}
