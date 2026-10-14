// =====================================================================
// Les consoles dessinées en vue 3D (isométrique), d'après photos (Wikipédia,
// Wikimedia Commons), sans aucun logo de marque : seulement la forme, les couleurs
// et les détails de chaque console (couvercle, fentes, ports, boutons…).
//
// Repère en millimètres, proche des vraies dimensions : x = largeur (vers la droite),
// y = profondeur (vers le fond ; y = 0 est la face avant), z = hauteur.
// Chaque face est éclairée selon son orientation (lumière en haut à gauche) et
// n'est dessinée que si elle est tournée vers nous : les surfaces courbes prennent
// ainsi un dégradé naturel.
//
// Fichier sans JSX : il sert au site (components/ConsoleArt.tsx) et peut aussi
// produire un SVG seul (consoleSvg), pour vérifier les dessins.
// =====================================================================

export type P2 = [number, number];
export type P3 = [number, number, number];
export interface Shape { d: string; fill: string; stroke?: string; width?: number; opacity?: number; blur?: boolean }

// Projection : la largeur descend un peu vers la droite, la profondeur monte vers la
// droite (le fond s'éloigne), la hauteur monte
export const project = ([x, y, z]: P3): P2 => [x * 0.94 + y * 0.58, x * 0.2 - y * 0.33 - z];

const unit = (v: P3): P3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
// Vers l'observateur (devant, à droite, au-dessus) et vers la lumière (devant, à gauche, au-dessus)
const VIEW = unit([0.617, -1, 0.453]);
const LIGHT = unit([-0.35, -0.55, 0.76]);

// Normale d'un polygone (méthode de Newell) : sortante si les points tournent dans le sens
// inverse des aiguilles d'une montre vus de l'extérieur
function normal(pts: P3[]): P3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit([x, y, z]);
}
const lightOf = (n: P3) => 0.68 + 0.42 * Math.max(0, dot(n, LIGHT));
export const TOP = lightOf([0, 0, 1]);
export const FRONT = lightOf([0, -1, 0]);
export const SIDE = lightOf([1, 0, 0]);

// Couleur éclaircie ou assombrie : « #rrggbb », ou « rgb(r, g, b) » (couleur déjà nuancée)
export function shade(color: string, factor: number): string {
  const rgb = color.startsWith('#')
    ? [16, 8, 0].map((shift) => (Number.parseInt(color.slice(1), 16) >> shift) & 255)
    : (color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  const [r, g, b] = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
  return `rgb(${r}, ${g}, ${b})`;
}

// Polygones 2D (dans le plan du dessus, de l'avant ou du côté)
const area = (p: P2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
const ccw = (p: P2[]): P2[] => (area(p) < 0 ? [...p].reverse() : p);
export const rect = (x: number, y: number, w: number, h: number): P2[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
// Coins arrondis : avant-gauche, avant-droit, arrière-droit, arrière-gauche (ou bas-gauche… dans un plan vertical)
export function rrect4(x: number, y: number, w: number, h: number, r: [number, number, number, number], steps = 6): P2[] {
  const corners: [number, number, number, number][] = [
    [x + w - r[1], y + r[1], -90, r[1]], [x + w - r[2], y + h - r[2], 0, r[2]],
    [x + r[3], y + h - r[3], 90, r[3]], [x + r[0], y + r[0], 180, r[0]],
  ];
  const out: P2[] = [];
  for (const [cx, cy, start, radius] of corners) {
    if (radius <= 0) { out.push([cx, cy]); continue; }
    for (let i = 0; i <= steps; i++) {
      const t = ((start + (90 * i) / steps) * Math.PI) / 180;
      out.push([cx + Math.cos(t) * radius, cy + Math.sin(t) * radius]);
    }
  }
  return out;
}
export const rrect = (x: number, y: number, w: number, h: number, r: number, steps = 6) => rrect4(x, y, w, h, [r, r, r, r], steps);
export const ellipse = (cx: number, cy: number, rx: number, ry = rx, steps = 36): P2[] =>
  Array.from({ length: steps }, (_, i) => { const t = (i / steps) * Math.PI * 2; return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]; });
// Croix directionnelle
export function cross(cx: number, cy: number, size: number, thick: number): P2[] {
  const s = size / 2, t = thick / 2;
  return [[cx - t, cy - s], [cx + t, cy - s], [cx + t, cy - t], [cx + s, cy - t], [cx + s, cy + t], [cx + t, cy + t],
    [cx + t, cy + s], [cx - t, cy + s], [cx - t, cy + t], [cx - s, cy + t], [cx - s, cy - t], [cx - t, cy - t]];
}

interface SolidOptions { glint?: number; edge?: string }

// Arête d'un flanc, allongée d'un rien de chaque côté : les facettes voisines d'une surface
// courbe se chevauchent, sans jour entre elles (sinon de fines rayures apparaissent)
function overlap(a: P2, b: P2, by = 0.5): [P2, P2] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [[a[0] - (dx / l) * by, a[1] - (dy / l) * by], [b[0] + (dx / l) * by, b[1] + (dy / l) * by]];
}

export class Scene {
  shapes: Shape[] = [];
  points: P2[] = [];

  push(points3: P3[], fill: string, extra: Partial<Shape> = {}, closed = true) {
    const pts = points3.map(project);
    this.points.push(...pts);
    this.shapes.push({ d: `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`, fill, ...extra });
  }

  // Une face pleine, éclairée selon son orientation ; ignorée si elle nous tourne le dos
  face(pts: P3[], color: string, opts: SolidOptions = {}) {
    const n = normal(pts);
    if (dot(n, VIEW) <= 0.001) return;
    const fill = shade(color, lightOf(n));
    // Contour : l'arête choisie, sinon un trait fin de la même couleur, qui bouche les jointures
    // entre facettes sans dessiner de rayures sur les surfaces courbes
    this.push(pts, fill, { stroke: opts.edge ?? fill, width: opts.edge ? 0.7 : 0.35 });
    if (opts.glint) this.push(pts, 'none', { stroke: '#ffffff', width: 1.1, opacity: opts.glint });
  }

  // Volume à base quelconque (vue de dessus), monté de z à z + h
  prism(foot: P2[], z: number, h: number, color: string, opts: SolidOptions = {}) {
    const f = ccw(foot);
    for (let i = 0; i < f.length; i++) {
      const [a, b] = overlap(f[i], f[(i + 1) % f.length]);
      this.face([[a[0], a[1], z], [b[0], b[1], z], [b[0], b[1], z + h], [a[0], a[1], z + h]], color);
    }
    this.face(f.map(([x, y]) => [x, y, z + h] as P3), color, { edge: opts.edge ?? shade(color, 0.55), glint: opts.glint });
  }

  // Volume dont on connaît la silhouette de face (x, z), poussée vers le fond sur d
  extrudeY(profile: P2[], y: number, d: number, color: string, opts: SolidOptions = {}) {
    const p = ccw(profile);
    for (let i = 0; i < p.length; i++) {
      const [a, b] = overlap(p[i], p[(i + 1) % p.length]);
      this.face([[a[0], y, a[1]], [a[0], y + d, a[1]], [b[0], y + d, b[1]], [b[0], y, b[1]]], color);
    }
    this.face(p.map(([x, z]) => [x, y, z] as P3), color, { edge: opts.edge ?? shade(color, 0.55), glint: opts.glint });
  }

  // Volume dont on connaît la silhouette de profil (y, z), sur la largeur w
  extrudeX(profile: P2[], x: number, w: number, color: string, opts: SolidOptions = {}) {
    const p = ccw(profile);
    for (let i = 0; i < p.length; i++) {
      const [a, b] = overlap(p[i], p[(i + 1) % p.length]);
      this.face([[x + w, a[0], a[1]], [x, a[0], a[1]], [x, b[0], b[1]], [x + w, b[0], b[1]]], color, { glint: opts.glint && a[1] === b[1] ? opts.glint : 0 });
    }
    this.face(p.map(([y, z]) => [x + w, y, z] as P3), color, { edge: opts.edge ?? shade(color, 0.55) });
  }

  // Pavé quelconque (incliné) : origine et trois arêtes
  slab(o: P3, u: P3, v: P3, t: P3, color: string, opts: SolidOptions = {}) {
    const c = (a: number, b: number, k: number): P3 => add(add(add(o, u, a), v, b), t, k);
    const center = c(0.5, 0.5, 0.5);
    const faces: P3[][] = [
      [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)], [c(0, 0, 1), c(0, 1, 1), c(1, 1, 1), c(1, 0, 1)],
      [c(0, 0, 0), c(0, 0, 1), c(1, 0, 1), c(1, 0, 0)], [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
      [c(0, 0, 0), c(0, 1, 0), c(0, 1, 1), c(0, 0, 1)], [c(1, 0, 0), c(1, 0, 1), c(1, 1, 1), c(1, 1, 0)],
    ];
    for (const f of faces) {
      const mid = f.reduce((m, p) => add(m, p, 0.25), [0, 0, 0] as P3);
      const oriented = dot(normal(f), add(mid, center, -1)) < 0 ? [...f].reverse() : f;
      this.face(oriented, color, opts);
    }
  }

  // Détails posés sur une face : dessus (plan z), avant (plan y), côté droit (plan x),
  // ou plan quelconque (origine, deux directions, coordonnées en mm)
  onTop(z: number, pts: P2[], fill: string, extra: Partial<Shape> = {}) { this.push(pts.map(([x, y]) => [x, y, z] as P3), fill, extra); }
  onFront(y: number, pts: P2[], fill: string, extra: Partial<Shape> = {}) { this.push(pts.map(([x, z]) => [x, y, z] as P3), fill, extra); }
  onSide(x: number, pts: P2[], fill: string, extra: Partial<Shape> = {}) { this.push(pts.map(([y, z]) => [x, y, z] as P3), fill, extra); }
  onPlane(o: P3, u: P3, v: P3, pts: P2[], fill: string, extra: Partial<Shape> = {}) {
    const uu = unit(u), vv = unit(v);
    this.push(pts.map(([a, b]) => add(add(o, uu, a), vv, b)), fill, extra);
  }

  line(a: P3, b: P3, stroke: string, width = 1, opacity = 1) { this.push([a, b], 'none', { stroke, width, opacity }, false); }
  polyline(pts: P3[], stroke: string, width = 1, opacity = 1) { this.push(pts, 'none', { stroke, width, opacity }, false); }

  // Ombre floue au sol
  shadow(foot: P2[], opacity = 0.5) { this.push(foot.map(([x, y]) => [x, y, 0] as P3), '#000000', { opacity, blur: true }); }
}

// Petit bouton rond en relief, posé à la hauteur z
function button(s: Scene, cx: number, cy: number, z: number, r: number, color: string, h = 1.6) {
  s.onTop(z, ellipse(cx, cy, r + 1, r + 1, 24), shade(color, 0.45));
  s.prism(ellipse(cx, cy, r, r, 24), z, h, color);
}
// Croix directionnelle en relief
function dpad(s: Scene, cx: number, cy: number, z: number, size: number, color: string) {
  s.onTop(z, cross(cx, cy, size + 3, size / 2.6 + 3), shade(color, 0.5));
  s.prism(cross(cx, cy, size, size / 2.6), z, 1.8, color);
}
// Écran (cadre, dalle et reflet) posé sur le dessus
function screenTop(s: Scene, x: number, y: number, w: number, h: number, z: number, bezel: string, glass: string, margin = 5) {
  s.onTop(z, rrect(x, y, w, h, 3), bezel);
  s.onTop(z + 0.2, rect(x + margin, y + margin, w - 2 * margin, h - 2 * margin), glass);
  s.onTop(z + 0.3, [[x + margin + 4, y + h - margin - 2], [x + margin + (w - 2 * margin) * 0.45, y + h - margin - 2], [x + margin + 4, y + margin + (h - 2 * margin) * 0.35]], '#ffffff', { opacity: 0.08 });
}


// ---------------------------------------------------------------------
// Sony
// ---------------------------------------------------------------------

// PlayStation (modèle d'origine), mesurée sur photos (vue de dessus et de trois quarts) :
// - dessus en trois parties : deux ailes un peu surélevées (≈ 67 mm chacune) et, au
//   centre, le très grand couvercle rond (≈ 173 mm), centré, qui empiète sur les ailes,
//   avec une bordure à l'arrière ;
// - aile gauche : petit bouton Reset, puis grand bouton Power vers l'avant, voyant vert
//   juste devant ; aile droite : grand bouton Open, symétrique de Power ;
// - avant, au centre : deux blocs carte mémoire (fente en haut) + port manette ;
// - flancs rainurés
function ps1(s: Scene) {
  const grey = '#c7c7c3';
  const recess = shade(grey, 0.7);
  s.shadow(rrect(0, 0, 270, 188, 6));
  s.prism(rrect(0, 0, 270, 188, 6), 0, 36, grey, { glint: 0.35 });
  // Assise du couvercle au centre (avec une marche à l'avant, au-dessus des ports),
  // bordure arrière, puis les deux ailes
  s.prism(rect(67, 22, 136, 152), 36, 5, grey);
  s.prism(rect(67, 174, 136, 14), 36, 6, grey, { glint: 0.3 });
  s.prism(rrect4(0, 0, 67, 188, [6, 0, 0, 6]), 36, 6, grey, { glint: 0.45 });
  s.prism(rrect4(203, 0, 67, 188, [0, 6, 6, 0]), 36, 6, grey, { glint: 0.45 });
  // Couvercle : sillon, puis le couvercle (il passe sur les ailes et avance au-dessus de la marche)
  s.onTop(42, ellipse(135, 92, 89, 89, 60), recess);
  s.prism(ellipse(135, 92, 86, 86, 60), 41, 2.3, grey, { glint: 0.35 });
  s.onTop(43.4, ellipse(135, 92, 70, 70, 60), shade(grey, 1.04));
  // Petit trait entre le couvercle et le bouton Open
  s.line([214, 40, 42.1], [222, 35, 42.1], recess, 1.2);
  // Reset (petit), Power (grand) et son voyant, Open (grand)
  const roundButton = (x: number, y: number, r: number) => {
    s.onTop(42, ellipse(x, y, r + 2.5, r + 2.5, 40), recess);
    s.prism(ellipse(x, y, r, r, 40), 41, 2, shade(grey, 0.96));
  };
  roundButton(24, 71, 8);
  roundButton(35, 32, 19);
  roundButton(235, 32, 19);
  s.onTop(42.2, ellipse(34, 6, 2.2, 1.4, 16), '#5be27a');
  // Avant, au centre : deux blocs carte mémoire + port manette
  for (const x of [76, 142]) {
    s.onFront(0, rrect(x, 5, 52, 27, 2), shade(grey, 0.8), { stroke: shade(grey, 0.55), width: 0.8 });
    s.onFront(0, rect(x + 5, 25, 42, 3.4), '#3a3a39');
    s.onFront(0, rrect(x + 4, 8, 44, 12, 2), shade(grey, 0.6));
    for (const k of [0, 1, 2]) s.onFront(0, rrect(x + 7 + k * 13.5, 10.5, 11, 7, 2), shade(grey, 0.42));
  }
  // Flancs rainurés (côté droit, visible)
  for (let y = 10; y < 180; y += 6) s.line([270, y, 5], [270, y, 38], shade(grey, 0.5), 1.1, 0.8);
}

// PlayStation 2 (modèle d'origine, à plat) : socle en retrait, dessus rainuré, fente du
// tiroir, ports manette et cartes mémoire en bas à gauche, Reset et Eject à droite
function ps2(s: Scene) {
  const black = '#25272d';
  s.shadow(rect(0, 0, 301, 182));
  s.prism(rect(8, 8, 285, 166), 0, 10, '#121317');
  s.prism(rect(0, 0, 301, 182), 10, 66, black, { glint: 0.3, edge: '#0c0d10' });
  for (let y = 20; y < 175; y += 13) s.line([10, y, 76], [291, y, 76], '#121318', 1.3);
  s.line([0, 0, 46], [301, 0, 46], '#555862', 0.8, 0.7);
  s.onFront(0, rect(16, 56, 214, 3.6), '#08080a');
  s.onFront(0, rrect(244, 52, 20, 9, 2), '#3a3d45');
  s.onFront(0, rect(249, 55.6, 10, 1.6), '#3d8af0');
  s.onFront(0, rrect(270, 52, 20, 9, 2), '#3a3d45');
  s.onFront(0, ellipse(280, 56.5, 1.8), '#3fd16b');
  for (const x of [26, 76]) {
    s.onFront(0, rect(x + 3, 36, 38, 3.6), '#08080a');
    s.onFront(0, rrect(x, 16, 44, 14, 2), '#3a3d45');
    s.onFront(0, rect(x + 7, 19.5, 30, 7), '#08080a');
  }
  for (const x of [140, 154]) s.onFront(0, rect(x, 22, 10, 5), '#08080a', { stroke: '#4a4d55', width: 0.5 });
}

// PlayStation 3 (premier modèle) : noir brillant, dessus bombé, bandeau chromé en bas
// de l'avant (ports USB), fente du lecteur au-dessus
function ps3(s: Scene) {
  const black = '#1b1c20';
  const arc: P2[] = Array.from({ length: 25 }, (_, i) => { const t = i / 24; return [325 * (1 - t), 60 + 38 * Math.sin(Math.PI * t)]; });
  s.shadow(rect(0, 0, 325, 274));
  s.extrudeY([[0, 0], [325, 0], ...arc], 0, 274, black, { glint: 0.35 });
  s.polyline(arc.map(([x, z]) => [x, 0, z] as P3), '#ffffff', 1.3, 0.35);
  s.onFront(0, rect(0, 8, 325, 22), '#a9aeb6');
  s.onFront(0, rect(0, 28, 325, 2), '#dfe3e8');
  s.onFront(0, rect(92, 52, 142, 3.4), '#050506');
  for (const x of [14, 28, 42, 56]) s.onFront(0, rect(x, 15, 9, 5), '#3a3d42');
  s.onFront(0, rect(282, 17, 14, 2), '#5c6068');
  s.onFront(0, rect(302, 17, 14, 2), '#5c6068');
}

// PlayStation 4 (premier modèle) : deux plateaux en parallélogramme (vus de profil),
// le dessus partagé entre une partie mate et une partie brillante, séparées par la
// barre lumineuse
function ps4(s: Scene) {
  const matte = '#2d3036', gloss = '#17181c';
  const profile: P2[] = [[10, 0], [305, 0], [295, 53], [0, 53]];
  s.shadow(rect(0, 0, 275, 305));
  s.extrudeX(profile, 0, 178, matte, { glint: 0.25 });
  s.extrudeX(profile, 178, 97, gloss, { glint: 0.35 });
  const yAt = (z: number, back = false) => (back ? 305 : 10) - 10 * (z / 53);
  s.line([0, yAt(19), 19], [275, yAt(19), 19], '#08090b', 2);
  s.line([275, yAt(19), 19], [275, yAt(19, true), 19], '#08090b', 2);
  s.line([178, 0, 53], [178, 295, 53], '#3d8af0', 2.4);
  s.line([178, 0, 53], [178, 295, 53], '#9cc8ff', 0.8, 0.8);
  s.line([22, yAt(37), 37], [160, yAt(37), 37], '#060607', 2.2);
}

// PlayStation 5 (debout) : cœur noir entre deux ailes blanches qui s'évasent vers le
// haut, socle rond, liseré bleu de part et d'autre du cœur
function ps5(s: Scene) {
  const white = '#eef0f3', core = '#1c1d22';
  const wing: P2[] = [[64, 16], [196, 16], [226, 120], [248, 250], [262, 392], [-4, 392], [8, 250], [30, 120]];
  s.shadow(rrect(-10, -10, 124, 290, 40));
  s.prism(ellipse(52, 130, 44, 52), 0, 10, '#202126');
  s.extrudeX(wing, 0, 20, white);
  s.prism(rect(20, 18, 64, 226), 10, 372, core, { edge: '#0b0b0e' });
  s.line([20, 18, 40], [20, 18, 370], '#4aa3ff', 1.6, 0.9);
  s.line([84, 18, 40], [84, 18, 370], '#4aa3ff', 1.6, 0.9);
  s.onFront(18, rect(36, 340, 10, 5), '#0a0a0c');
  s.onFront(18, rect(54, 340, 10, 5), '#0a0a0c');
  s.extrudeX(wing, 84, 20, white, { glint: 0.2 });
}

// PSP (premier modèle) : noire, bouts arrondis, écran large, croix et stick à gauche,
// quatre boutons à droite, liseré argenté sur la tranche
function psp(s: Scene) {
  const black = '#1d1e22';
  const foot = rrect(0, 0, 170, 74, 34, 10);
  s.shadow(foot);
  s.prism(foot, 0, 20, black, { glint: 0.35 });
  s.line([40, 0, 9], [130, 0, 9], '#b8bcc4', 2.2);
  screenTop(s, 36, 10, 98, 56, 20, '#0d0e10', '#3a4252');
  dpad(s, 19, 47, 20, 15, '#4a4b52');
  button(s, 19, 22, 20, 5, '#5a5b62', 1);
  for (const [dx, dy] of [[0, 7], [7, 0], [0, -7], [-7, 0]]) button(s, 151 + dx, 44 + dy, 20, 3.2, '#55565e', 1.2);
  for (const x of [56, 70, 100, 114]) s.onTop(20.2, rrect(x, 3, 8, 3, 1.4), '#3a3b40');
}

// PS Vita : ovale noire, grand écran, deux sticks sous la croix et les boutons
function psv(s: Scene) {
  const black = '#1a1b1e';
  const foot = rrect(0, 0, 182, 84, 36, 10);
  s.shadow(foot);
  s.prism(foot, 0, 17, black, { glint: 0.35 });
  screenTop(s, 37, 9, 108, 66, 17, '#0b0b0d', '#2b3442');
  dpad(s, 19, 56, 17, 14, '#4a4b52');
  for (const [dx, dy] of [[0, 6.5], [6.5, 0], [0, -6.5], [-6.5, 0]]) button(s, 163 + dx, 56 + dy, 17, 2.8, '#55565e', 1);
  for (const x of [22, 160]) {
    s.onTop(17, ellipse(x, 24, 8.5), '#0c0c0e');
    s.prism(ellipse(x, 24, 6.5), 17, 2.2, '#5a5b62');
  }
}


// ---------------------------------------------------------------------
// Nintendo
// ---------------------------------------------------------------------

// NES (modèle européen, chargement par l'avant) : bas gris foncé, haut gris clair,
// trappe de cartouche, zone rainurée à droite, Power et Reset, voyant rouge, ports
function nes(s: Scene) {
  const light = '#cfcfca', dark = '#7c7c78';
  s.shadow(rect(0, 0, 256, 203));
  s.prism(rect(0, 0, 256, 203), 0, 30, dark);
  s.prism(rect(0, 0, 256, 203), 30, 55, light, { glint: 0.4 });
  s.onTop(85, rect(186, 4, 66, 195), '#62625e');
  for (let y = 12; y < 196; y += 9) s.line([188, y, 85], [250, y, 85], '#2a2a29', 2);
  s.onFront(0, rect(186, 30, 70, 55), '#6c6c69');
  s.onFront(0, rrect(52, 38, 120, 40, 2), '#c3c3be', { stroke: '#8e8e8a', width: 1 });
  s.onFront(0, rect(58, 72, 108, 3), '#a9a9a4');
  s.onFront(0, rect(20, 9, 18, 9), '#d9d9d4');
  s.onFront(0, rect(44, 9, 18, 9), '#d9d9d4');
  s.onFront(0, rect(22, 22, 5, 3), '#e8222c');
  s.onFront(0, rect(196, 9, 20, 11), '#2a2a28');
  s.onFront(0, rect(224, 9, 20, 11), '#2a2a28');
}

// Super Nintendo (modèle européen, comme la Super Famicom) : gris clair, formes
// arrondies en deux niveaux, logement de cartouche, curseurs Power et Reset,
// bouton d'éjection, deux ports à l'avant
function snes(s: Scene) {
  const grey = '#d6d5d0';
  s.shadow(rrect(0, 0, 200, 242, 14));
  s.prism(rrect(0, 0, 200, 242, 14), 0, 34, '#c4c3be');
  s.prism(rrect(8, 10, 184, 222, 20), 34, 22, grey, { glint: 0.45 });
  s.prism(rrect(50, 116, 100, 74, 8), 56, 8, '#aeada8');
  s.onTop(64, rrect(62, 146, 76, 9, 2), '#3a3a38');
  for (const x of [24, 136]) {
    s.onTop(56, rrect(x, 36, 40, 16, 6), '#9f9e99');
    s.prism(rrect(x + 4, 39, 16, 10, 4), 56, 3, '#8c86a8');
  }
  s.prism(rrect(86, 92, 28, 16, 5), 56, 4, '#8f8e89');
  for (const x of [44, 116]) {
    s.onFront(0, rrect(x, 10, 40, 16, 4), '#8d8c88');
    s.onFront(0, rect(x + 7, 14, 26, 8), '#3a3a38');
  }
}

// Nintendo 64 : gris anthracite, bosse centrale avec la fente de cartouche et des
// rainures, curseurs Power et Reset, quatre ports manette à l'avant
function n64(s: Scene) {
  const charcoal = '#37373b';
  const base = rrect(0, 0, 260, 190, 18);
  s.shadow(base);
  s.prism(base, 0, 32, charcoal, { glint: 0.25 });
  for (const x of [34, 90, 146, 202]) {
    s.onFront(0, rrect(x, 8, 24, 13, 3), '#18181a');
    s.onFront(0, rect(x + 5, 11, 14, 7), '#0b0b0c');
  }
  s.prism(rrect(62, 44, 136, 134, 24), 32, 30, '#3d3d42', { glint: 0.35 });
  s.onTop(62, rrect(90, 98, 80, 11, 2), '#0e0e10');
  for (let y = 118; y < 170; y += 8) s.line([80, y, 62], [180, y, 62], '#1c1c1f', 2);
  for (const x of [16, 214]) {
    s.onTop(32, rrect(x, 18, 30, 13, 5), '#1e1e21');
    s.prism(rrect(x + 4, 20.5, 12, 8, 3), 32, 2.5, '#454549');
  }
}

// GameCube : cube violet, couvercle rond, poignée à l'arrière, quatre ports gris à
// l'avant, grille d'aération sur le côté
function gamecube(s: Scene) {
  const purple = '#5c4fa8';
  const foot = rrect(0, 0, 150, 161, 10);
  s.shadow(foot);
  s.prism(foot, 0, 108, purple, { glint: 0.35 });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) s.onSide(150, ellipse(52 + i * 12, 22 + j * 12, 3.2, 3.2, 12), '#3a3171');
  for (const x of [8, 43, 78, 113]) {
    s.onFront(0, rrect(x, 30, 29, 22, 4), '#cfcde0');
    s.onFront(0, rrect(x + 6, 35, 17, 12, 3), '#4a4a5a');
  }
  s.onFront(0, rect(10, 64, 130, 26), shade(purple, 0.8), { stroke: shade(purple, 0.6), width: 0.8 });
  s.onTop(108, ellipse(75, 92, 54), '#433889');
  s.prism(ellipse(75, 92, 49), 108, 2, purple);
  s.onTop(110, ellipse(75, 92, 15), '#2e2a52');
  button(s, 26, 26, 108, 7, '#2e2a52');
  button(s, 75, 24, 108, 9, '#2e2a52');
  button(s, 124, 26, 108, 7, '#2e2a52');
  s.polyline([[14, 146, 108], [14, 158, 126], [136, 158, 126], [136, 146, 108]], '#1b1a26', 7);
}

// Wii (debout sur son socle) : blanche, fente verticale du lecteur avec sa lueur bleue
function wii(s: Scene) {
  const white = '#f3f3f1';
  s.shadow(rrect(-14, 18, 72, 180, 12));
  s.prism(rrect(-14, 22, 72, 172, 12), 0, 14, '#8d9096', { glint: 0.3 });
  s.prism(rrect(0, 0, 44, 215, 4), 14, 157, white, { glint: 0.5 });
  s.onFront(0, rect(14, 54, 5, 108), '#1e1e1e');
  s.onFront(0, rect(15.5, 64, 2, 88), '#4ab3ff', { opacity: 0.85 });
  s.onFront(0, rrect(26, 24, 12, 30, 2), '#e2e2df', { stroke: '#c8c8c4', width: 0.6 });
  s.onFront(0, ellipse(31, 160, 3), '#d0d0cc');
}

// Wii U : console blanche brillante à l'arrière, et sa manette-tablette devant
function wiiu(s: Scene) {
  const white = '#f5f5f3';
  const consoleFoot = rrect(150, 60, 172, 268, 14);
  const pad = rrect(0, -126, 255, 133, 40, 10);
  s.shadow(consoleFoot);
  s.prism(consoleFoot, 0, 46, white, { glint: 0.5 });
  s.onFront(60, rect(166, 26, 118, 3), '#2a2a2a');
  s.onFront(60, rect(296, 26, 10, 4), '#c9c9c6');
  s.shadow(pad);
  s.prism(pad, 0, 14, white, { glint: 0.5 });
  screenTop(s, 50, -108, 155, 96, 14, '#151517', '#2c3442', 6);
  for (const x of [26, 229]) {
    s.onTop(14, ellipse(x, -24, 10.5), '#1d1d1f');
    s.prism(ellipse(x, -24, 8), 14, 3, '#3a3a3d');
  }
  dpad(s, 26, -70, 14, 16, '#3a3a3d');
  for (const [dx, dy] of [[0, 8], [8, 0], [0, -8], [-8, 0]]) button(s, 229 + dx, -70 + dy, 14, 3.4, '#3a3a3d', 1.2);
}

// Switch (en mode portable) : écran entre les manettes bleue (gauche) et rouge (droite)
function switchHandheld(s: Scene, opts: { width: number; depth: number; pad: number; left: string; right: string; body: string; ringLeft?: string; ringRight?: string }) {
  const { width: w, depth: d, pad: p, left, right, body } = opts;
  s.shadow(rrect(0, 0, w, d, 18));
  s.prism(rrect4(0, 0, p, d, [18, 0, 0, 18]), 0, 14, left, { glint: 0.4 });
  s.prism(rect(p, 0, w - 2 * p, d), 0, 14, body, { glint: 0.3 });
  s.prism(rrect4(w - p, 0, p, d, [0, 18, 18, 0]), 0, 14, right, { glint: 0.4 });
  screenTop(s, p + 7, 7, w - 2 * p - 14, d - 14, 14, '#0e0f12', '#2b3340', 5);
  const stick = (x: number, y: number, ring?: string) => {
    s.onTop(14, ellipse(x, y, 8.5), ring ?? '#1b1c1f');
    s.prism(ellipse(x, y, 6.5), 14, 3, '#2b2c30');
  };
  stick(p / 2, d * 0.7, opts.ringLeft);
  for (const [dx, dy] of [[0, 6.5], [6.5, 0], [0, -6.5], [-6.5, 0]]) button(s, p / 2 + dx, d * 0.32 + dy, 14, 2.8, '#2b2c30', 1);
  for (const [dx, dy] of [[0, 6.5], [6.5, 0], [0, -6.5], [-6.5, 0]]) button(s, w - p / 2 + dx, d * 0.7 + dy, 14, 2.8, '#2b2c30', 1);
  stick(w - p / 2, d * 0.32, opts.ringRight);
}
const nsw = (s: Scene) => switchHandheld(s, { width: 239, depth: 102, pad: 33, left: '#00b9ef', right: '#ff4f5e', body: '#232428' });
const nsw2 = (s: Scene) => switchHandheld(s, { width: 272, depth: 116, pad: 36, left: '#2a2c31', right: '#2a2c31', body: '#1f2024', ringLeft: '#3fc1ff', ringRight: '#ff5a4a' });

// Game Boy : grise, coin arrondi en bas à droite, écran vert, croix, boutons A et B
// magenta, Select et Start, grille du haut-parleur
function gameboy(s: Scene) {
  const grey = '#c8c6c0';
  const foot = rrect4(0, 0, 90, 148, [4, 26, 4, 4]);
  s.shadow(foot);
  s.prism(foot, 0, 30, grey, { glint: 0.45 });
  s.onTop(30, rrect4(8, 76, 74, 62, [3, 16, 3, 3]), '#6c6c78');
  s.onTop(30.2, rect(21, 86, 48, 42), '#a2ad52');
  s.onTop(30.2, ellipse(14, 112, 1.8), '#e2222c');
  dpad(s, 22, 50, 30, 22, '#2a2a2c');
  button(s, 55, 45, 30, 6, '#a3305f', 2);
  button(s, 72, 55, 30, 6, '#a3305f', 2);
  for (const x of [32, 46]) s.prism(rrect(x, 22, 10, 4, 2), 30, 1.2, '#8e8d88');
  for (let i = 0; i < 6; i++) s.line([60 + i * 4, 6, 30], [66 + i * 4, 24, 30], '#8f8e89', 1.6);
}

// Game Boy Color (violette) : écran au cadre noir, croix noire, boutons A et B
function gameboyColor(s: Scene) {
  const purple = '#7a5cb5';
  const foot = rrect4(0, 0, 75, 133, [12, 12, 6, 6]);
  s.shadow(foot);
  s.prism(foot, 0, 27, purple, { glint: 0.45 });
  s.onTop(27, rrect(6, 64, 63, 60, 5), '#1c1b22');
  s.onTop(27.2, rect(15, 72, 45, 41), '#bfc6bb');
  dpad(s, 18, 40, 27, 18, '#1e1e22');
  button(s, 48, 36, 27, 5.5, '#4a3b6e', 1.8);
  button(s, 62, 44, 27, 5.5, '#4a3b6e', 1.8);
  for (const x of [26, 38]) s.prism(rrect(x, 16, 9, 3.5, 1.7), 27, 1, '#3b2f57');
}

// Game Boy Advance (indigo, à l'horizontale) : écran au centre, croix à gauche, A et B
// gris à droite, gâchettes grises aux coins arrière
function gba(s: Scene) {
  const indigo = '#4b45a3';
  const foot = rrect(0, 0, 144.5, 82, 28, 10);
  s.shadow(foot);
  s.prism(rrect4(2, 52, 30, 30, [0, 0, 0, 22]), 0, 22, '#b9b9c2');
  s.prism(rrect4(112.5, 52, 30, 30, [0, 0, 22, 0]), 0, 22, '#b9b9c2');
  s.prism(foot, 0, 24, indigo, { glint: 0.45 });
  s.onTop(24, rrect(36, 13, 73, 56, 7), '#25232d');
  s.onTop(24.2, rect(43, 20, 59, 42), '#a5aba3');
  dpad(s, 19, 47, 24, 16, '#2a2840');
  button(s, 110 + 12, 50, 24, 5, '#d8d8de', 1.8);
  button(s, 110, 42, 24, 5, '#d8d8de', 1.8);
  for (const y of [22, 28]) s.prism(ellipse(24, y, 2.2, 2.2, 12), 24, 0.8, '#d8d8de');
  for (let i = 0; i < 4; i++) s.line([114, 14 + i * 3.4, 24], [130, 14 + i * 3.4, 24], '#2f2a6e', 1.2);
}

// Console portable à clapet (Nintendo DS, 3DS) : la moitié basse posée, l'écran du
// haut relevé vers l'arrière
function clamshell(s: Scene, o: {
  w: number; d: number; h: number; color: string; inner: string; lidAngle: number;
  bottom: (z: number) => void; top: (o: P3, u: P3, v: P3) => void;
}) {
  const { w, d, h, color } = o;
  const a = (o.lidAngle * Math.PI) / 180;
  const v: P3 = [0, d * Math.sin(a), d * Math.cos(a)];
  const t: P3 = [0, 11 * Math.cos(a), -11 * Math.sin(a)];
  s.shadow(rrect(0, 0, w, d + d * Math.sin(a), 8));
  s.slab([0, d - 2, h - 2], [w, 0, 0], v, t, color, { glint: 0.3 });
  const inner = unit(add(v, [0, 0, 0]));
  s.onPlane([0, d - 2, h - 2], [1, 0, 0], inner, rect(2, 2, w - 4, d - 4), o.inner);
  o.top([0, d - 2, h - 2], [1, 0, 0], inner);
  s.prism(rrect(0, 0, w, d, 8), 0, h, color, { glint: 0.4 });
  o.bottom(h);
}

// Nintendo DS (premier modèle, bleue)
function nds(s: Scene) {
  clamshell(s, {
    w: 149, d: 85, h: 14, color: '#1f5fd0', inner: '#1d4fae', lidAngle: 28,
    bottom: (z) => {
      s.onTop(z, rrect(41, 10, 67, 54, 3), '#1b1d26');
      s.onTop(z + 0.2, rect(46, 15, 57, 44), '#c9cfd6');
      dpad(s, 20, 42, z, 15, '#16171c');
      for (const [dx, dy] of [[0, 6], [6, 0], [0, -6], [-6, 0]]) button(s, 129 + dx, 42 + dy, z, 2.6, '#16171c', 1);
      for (const x of [123, 135]) s.prism(ellipse(x, 20, 1.8, 1.8, 12), z, 0.8, '#16171c');
    },
    top: (o, u, v) => {
      s.onPlane(o, u, v, rrect(34, 10, 81, 64, 3), '#1b1d26');
      s.onPlane(o, u, v, rect(40, 16, 69, 52), '#c9cfd6');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        s.onPlane(o, u, v, ellipse(14 + j * 4, 38 + i * 4, 0.9, 0.9, 8), '#123a85');
        s.onPlane(o, u, v, ellipse(128 + j * 4, 38 + i * 4, 0.9, 0.9, 8), '#123a85');
      }
    },
  });
}

// Nintendo 3DS (bleu aqua) : intérieur noir, grand écran en haut, pavé circulaire
function n3ds(s: Scene) {
  clamshell(s, {
    w: 134, d: 74, h: 11, color: '#2bb3c9', inner: '#17181b', lidAngle: 24,
    bottom: (z) => {
      s.onTop(z, rrect(4, 4, 126, 66, 5), '#1f8ea1');
      s.onTop(z + 0.1, rrect(36, 9, 62, 50, 3), '#17181b');
      s.onTop(z + 0.3, rect(41, 13, 52, 41), '#c7cdd2');
      s.onTop(z, ellipse(18, 52, 9.5), '#15161a');
      s.prism(ellipse(18, 52, 7.5), z, 2, '#9aa0a8');
      dpad(s, 18, 25, z, 13, '#127686');
      for (const [dx, dy] of [[0, 6], [6, 0], [0, -6], [-6, 0]]) button(s, 116 + dx, 42 + dy, z, 2.5, '#127686', 1);
    },
    top: (o, u, v) => {
      s.onPlane(o, u, v, rect(24, 9, 86, 54), '#0d0e10');
      s.onPlane(o, u, v, rect(28, 12, 78, 47), '#c7cdd2');
      s.onPlane(o, u, v, ellipse(67, 66, 2, 2, 12), '#2a2b30');
    },
  });
}


// ---------------------------------------------------------------------
// Sega
// ---------------------------------------------------------------------

// Master System (premier modèle européen) : noire et rouge, avant en pente, panneau
// rouge du logement de cartouche sur le dessus, fente pour cartes
function masterSystem(s: Scene) {
  const black = '#1c1c1e', red = '#c8102e';
  s.shadow(rect(0, 0, 365, 170));
  s.extrudeX([[0, 0], [170, 0], [170, 62], [42, 62], [0, 40]], 0, 365, black, { glint: 0.3 });
  const slope = (x: number, t: number): P3 => [x, 42 * t, 40 + 22 * t];
  s.onTop(62, rect(186, 58, 150, 104), shade(red, TOP));
  for (let y = 70; y < 156; y += 9) s.line([196, y, 62], [326, y, 62], '#7a0a1c', 1.4);
  s.onTop(62.2, rrect(222, 96, 80, 14, 2), '#0b0b0c');
  s.polyline([slope(14, 0.5), slope(150, 0.5)], red, 4);
  s.polyline([slope(190, 0.55), slope(300, 0.55)], '#0b0b0c', 3);
  s.onFront(0, rect(300, 14, 22, 10), '#2e2e31');
  s.onFront(0, rect(330, 14, 22, 10), '#2e2e31');
}

// Mega Drive (premier modèle européen) : noire, anneau surélevé autour du logement de
// cartouche, curseur Power et Reset à gauche, deux ports à l'avant
function megaDrive(s: Scene) {
  const black = '#1b1b1d';
  const foot = rrect(0, 0, 280, 212, 12);
  s.shadow(foot);
  s.prism(foot, 0, 42, black, { glint: 0.25 });
  s.prism(ellipse(178, 112, 76, 76, 48), 42, 10, '#212124', { glint: 0.3 });
  s.onTop(52, ellipse(178, 112, 66, 66, 48), 'none', { stroke: '#b9a65a', width: 1.4, opacity: 0.8 });
  s.prism(rrect(132, 96, 92, 32, 4), 52, 7, '#28282b');
  s.onTop(59, rect(140, 107, 76, 9), '#070708');
  s.onTop(42, rrect(26, 40, 44, 16, 6), '#101012');
  s.prism(rrect(30, 43, 16, 10, 3), 42, 3, '#3a3a3e');
  button(s, 92, 46, 42, 7, '#2e2e31');
  s.onFront(0, ellipse(20, 26, 2.2), '#e8222c');
  for (const x of [196, 232]) {
    s.onFront(0, rrect(x, 12, 28, 16, 4), '#2a2a2d');
    s.onFront(0, rect(x + 6, 16, 16, 8), '#060607');
  }
}

// Game Gear : noire, bouts arrondis, écran au cadre noir, croix ronde à gauche,
// boutons 1 et 2 à droite et Start bleu
function gameGear(s: Scene) {
  const black = '#232325';
  const foot = rrect(0, 0, 209, 113, 42, 10);
  s.shadow(foot);
  s.prism(foot, 0, 30, black, { glint: 0.35 });
  s.onTop(30, rrect(60, 16, 90, 84, 7), '#111112');
  s.onTop(30.2, rect(69, 25, 72, 64), '#46544d');
  s.onTop(30, ellipse(32, 58, 19), '#141415');
  dpad(s, 32, 58, 30, 24, '#2c2c2f');
  button(s, 170, 50, 30, 7.5, '#3a3a3e', 2);
  button(s, 189, 60, 30, 7.5, '#3a3a3e', 2);
  button(s, 180, 88, 30, 3.5, '#2d6fd8', 1.2);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) s.onTop(30.1, ellipse(20 + i * 6, 18 + j * 6, 1.2, 1.2, 8), '#0a0a0b');
}

// Saturn (premier modèle européen, noire) : grand couvercle rond, Power et Reset,
// bouton d'ouverture, logement de cartouche à l'arrière, deux ports à l'avant
function saturn(s: Scene) {
  const black = '#2a2a2d';
  const foot = rrect(0, 0, 260, 230, 16);
  s.shadow(foot);
  s.prism(foot, 0, 58, black, { glint: 0.3 });
  s.onTop(58, ellipse(130, 124, 76), '#1b1b1d');
  s.prism(ellipse(130, 124, 71), 58, 3, '#323236', { glint: 0.2 });
  s.onTop(61, ellipse(130, 124, 16), '#262629');
  s.onTop(58, rect(66, 206, 128, 10), '#0f0f10');
  button(s, 30, 30, 58, 8, '#3a3a3e');
  button(s, 70, 26, 58, 5, '#3a3a3e');
  button(s, 226, 36, 58, 14, '#3a3a3e', 2);
  for (const x of [62, 158]) {
    s.onFront(0, rrect(x, 14, 40, 18, 4), '#3a3a3e');
    s.onFront(0, rect(x + 8, 18, 24, 10), '#09090a');
  }
}

// Dreamcast : blanche, avant en pente avec Power et ouverture, grand couvercle rond,
// quatre ports gris à l'avant
function dreamcast(s: Scene) {
  const white = '#f1efe9';
  s.shadow(rect(0, 0, 190, 196));
  s.extrudeX([[0, 0], [196, 0], [196, 70], [44, 70], [0, 44]], 0, 190, white, { glint: 0.4 });
  for (const x of [16, 60, 104, 148]) {
    s.onFront(0, rrect(x, 10, 26, 16, 3), '#cfccc4');
    s.onFront(0, rect(x + 6, 14, 14, 8), '#55534e');
  }
  const o: P3 = [0, 0, 44];
  const u: P3 = [1, 0, 0];
  const v: P3 = [0, 44, 26];
  s.onPlane(o, u, v, ellipse(26, 26, 8), '#c9c6be');
  s.onPlane(o, u, v, ellipse(26, 26, 6), '#e6e3dc');
  s.onPlane(o, u, v, ellipse(164, 26, 8), '#c9c6be');
  s.onPlane(o, u, v, ellipse(164, 26, 6), '#e6e3dc');
  s.onPlane(o, u, v, ellipse(42, 26, 1.8), '#f08a1c');
  s.onTop(70, ellipse(95, 124, 64), '#dcd9d1');
  s.prism(ellipse(95, 124, 59), 70, 2, white, { glint: 0.3 });
}


// ---------------------------------------------------------------------
// Microsoft
// ---------------------------------------------------------------------

// Xbox : grosse et noire, un X en relief sur le dessus avec la pastille verte au
// centre, tiroir et quatre ports à l'avant
function xbox(s: Scene) {
  const black = '#1f2022';
  const foot = rrect(0, 0, 320, 260, 16);
  s.shadow(foot);
  s.prism(foot, 0, 90, black, { glint: 0.25 });
  for (const [a, b] of [[[22, 22], [138, 112]], [[298, 22], [182, 112]], [[22, 238], [138, 148]], [[298, 238], [182, 148]]] as [P2, P2][]) {
    s.line([a[0], a[1], 90], [b[0], b[1], 90], '#34353a', 9);
    s.line([a[0], a[1], 90], [b[0], b[1], 90], '#141517', 2);
  }
  s.onTop(90, ellipse(160, 130, 38), '#2c2d30');
  s.prism(ellipse(160, 130, 27), 90, 4, '#5fb12f', { glint: 0.4 });
  s.onFront(0, rect(70, 58, 180, 4), '#0b0b0c');
  for (const x of [34, 84, 196, 246]) {
    s.onFront(0, rrect(x, 16, 40, 18, 3), '#2d2e31');
    s.onFront(0, rect(x + 9, 20, 22, 10), '#09090a');
  }
}

// Xbox 360 (premier modèle, blanche, debout) : flancs creusés, dessus gris aéré,
// tiroir vertical, bouton rond entouré de son anneau lumineux vert
function xbox360(s: Scene) {
  const white = '#ecece8';
  const steps = 40;
  const right: P2[] = Array.from({ length: steps + 1 }, (_, i) => { const t = i / steps; return [83 - 7 * Math.sin(Math.PI * t), 309 * t]; });
  const left: P2[] = Array.from({ length: steps + 1 }, (_, i) => { const t = i / steps; return [7 * Math.sin(Math.PI * t), 309 * (1 - t)]; });
  s.shadow(rect(0, 0, 83, 258));
  s.extrudeY([...right, ...left], 0, 258, white, { glint: 0.45 });
  s.onTop(309, rect(6, 10, 71, 238), '#a9acb1');
  for (let y = 18; y < 244; y += 8) s.line([10, y, 309], [73, y, 309], '#7d8086', 1.6);
  s.onFront(0, rect(50, 100, 4, 160), '#cfcfca');
  s.onFront(0, ellipse(42, 48, 11), '#d9d9d5');
  for (let q = 0; q < 4; q++) {
    const arc: P2[] = Array.from({ length: 7 }, (_, i) => { const t = ((q * 90 + 10 + i * 11.7) * Math.PI) / 180; return [42 + Math.cos(t) * 9, 48 + Math.sin(t) * 9]; });
    s.polyline(arc.map(([x, z]) => [x, 0, z] as P3), '#7fd63a', 2);
  }
  s.onFront(0, rect(56, 30, 18, 12), '#dededa', { stroke: '#c4c4bf', width: 0.6 });
}

// Xbox One (premier modèle) : longue et noire, dessus partagé entre une grille
// d'aération (mate) et une partie brillante, fente du lecteur à l'avant
function xboxOne(s: Scene) {
  s.shadow(rect(0, 0, 333, 274));
  s.prism(rect(0, 0, 210, 274), 0, 79, '#1d1e21', { glint: 0.2 });
  for (let y = 10; y < 266; y += 5) s.line([8, y, 79], [202, y, 79], '#0f1012', 1.6);
  s.prism(rect(210, 0, 123, 274), 0, 79, '#121315', { glint: 0.45 });
  s.onFront(0, rect(26, 42, 160, 3.4), '#050506');
  s.onFront(0, ellipse(306, 42, 4), '#3a3b3f');
}

// Xbox Series X : tour noire mate, dessus creusé et perforé à l'intérieur vert,
// fente du lecteur et bouton à l'avant
function xboxSeriesX(s: Scene) {
  const black = '#1c1d1f';
  const foot = rrect(0, 0, 151, 151, 6);
  s.shadow(foot);
  s.prism(foot, 0, 301, black, { glint: 0.2 });
  s.onTop(301, ellipse(75.5, 75.5, 64), '#0f1011');
  s.onTop(301.1, ellipse(75.5, 75.5, 56), '#16241a');
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) {
    if (i * i + j * j > 46) continue;
    s.onTop(301.2, ellipse(75.5 + i * 7, 75.5 + j * 7, 1.7, 1.7, 8), '#3d8f4c', { opacity: 0.85 });
  }
  s.onFront(0, ellipse(22, 282, 4.5), '#4a4b4f');
  s.onFront(0, rect(126, 150, 3.5, 120), '#09090a');
  s.onFront(0, rect(14, 34, 12, 5), '#09090a');
}


// ---------------------------------------------------------------------
// Autres
// ---------------------------------------------------------------------

// Atari 2600 (quatre interrupteurs) : façade en bois, dessus noir rainuré en pente,
// logement de cartouche à l'arrière, interrupteurs à l'avant
function atari2600(s: Scene) {
  const black = '#1d1b1a';
  s.shadow(rect(0, 0, 340, 230));
  s.extrudeX([[0, 0], [230, 0], [230, 92], [112, 92], [40, 50], [0, 50]], 0, 340, black, { glint: 0.25 });
  s.onFront(0, rect(0, 4, 340, 42), '#7a4520');
  for (const z of [10, 17, 23, 31, 38]) s.line([0, 0, z], [340, 0, z], '#5a3015', 1, 0.7);
  for (let t = 0.1; t < 1; t += 0.12) s.line([6, 40 + 72 * t, 50 + 42 * t], [334, 40 + 72 * t, 50 + 42 * t], '#3a3633', 1.6);
  for (let y = 124; y < 226; y += 10) s.line([6, y, 92], [334, y, 92], '#3a3633', 1.6);
  s.onTop(92.2, rect(118, 150, 104, 14), '#0b0b0b');
  for (const x of [44, 84, 246, 286]) {
    s.onTop(50, rrect(x, 12, 14, 20, 3), '#0c0c0c');
    s.prism(rrect(x + 4, 18, 6, 8, 2), 50, 6, '#a9a9a9');
  }
}

// PC Engine : petit boîtier carré blanc, fente de carte à l'avant, interrupteur vert
function pcEngine(s: Scene) {
  const white = '#f3f2ec';
  const foot = rrect(0, 0, 140, 140, 6);
  s.shadow(foot);
  s.prism(foot, 0, 38, white, { glint: 0.5 });
  s.onTop(38, rect(12, 98, 116, 34), '#e3e2dc');
  s.onFront(0, rect(22, 22, 96, 4), '#2f2f2f');
  s.onFront(0, rrect(6, 8, 18, 10, 2), '#2fa84f');
  s.onFront(0, ellipse(122, 14, 6), '#9a9a96');
}

// Neo-Geo AES : grand boîtier noir, partie arrière surélevée avec la fente de cartouche,
// fente de carte mémoire et deux ports à l'avant
function neoGeo(s: Scene) {
  const black = '#1b1b1c';
  s.shadow(rect(0, 0, 325, 237));
  s.prism(rect(0, 0, 325, 237), 0, 50, black, { glint: 0.25 });
  s.prism(rrect(20, 100, 285, 124, 6), 50, 10, '#232325', { glint: 0.25 });
  s.onTop(60, rect(58, 152, 209, 11), '#09090a');
  s.onFront(0, rect(26, 22, 80, 4), '#09090a');
  for (const x of [230, 276]) {
    s.onFront(0, rrect(x, 12, 32, 16, 3), '#2b2b2e');
    s.onFront(0, rect(x + 7, 16, 18, 8), '#08080a');
  }
  s.onFront(0, rect(140, 18, 16, 8), '#c8102e');
}

const DRAWINGS: Record<string, (s: Scene) => void> = {
  PS1: ps1, PS2: ps2, PS3: ps3, PS4: ps4, PS5: ps5, PSP: psp, PSV: psv,
  NES: nes, SNES: snes, N64: n64, GC: gamecube, WII: wii, WIIU: wiiu, NSW: nsw, NSW2: nsw2,
  GB: gameboy, GBC: gameboyColor, GBA: gba, NDS: nds, '3DS': n3ds,
  SMS: masterSystem, MD: megaDrive, GG: gameGear, SAT: saturn, DC: dreamcast,
  XBOX: xbox, X360: xbox360, XONE: xboxOne, XSX: xboxSeriesX,
  2600: atari2600, PCE: pcEngine, NEO: neoGeo,
};

export const CONSOLE_ART_CODES = Object.keys(DRAWINGS);
export const hasConsoleArt = (platform: string) => platform in DRAWINGS;

// Les formes d'une console et le cadre qui les contient
export function drawConsole(platform: string): { viewBox: string; shapes: Shape[] } | null {
  const draw = DRAWINGS[platform];
  if (!draw) return null;
  const scene = new Scene();
  draw(scene);
  const xs = scene.points.map((p) => p[0]);
  const ys = scene.points.map((p) => p[1]);
  const margin = 14;
  const minX = Math.min(...xs) - margin, minY = Math.min(...ys) - margin;
  const width = Math.max(...xs) - minX + margin, height = Math.max(...ys) - minY + margin;
  return { viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`, shapes: scene.shapes };
}

// SVG autonome (aperçus, vérifications)
export function consoleSvg(platform: string, width = 400): string | null {
  const art = drawConsole(platform);
  if (!art) return null;
  const paths = art.shapes.map((s) => `<path d="${s.d}" fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 1}"` : ''}${s.opacity !== undefined ? ` opacity="${s.opacity}"` : ''}${s.blur ? ' filter="url(#ombre)"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" viewBox="${art.viewBox}"><defs><filter id="ombre" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter></defs>${paths}</svg>`;
}
