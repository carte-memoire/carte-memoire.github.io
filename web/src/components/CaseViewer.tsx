import { useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { SpineFace, spineKind } from './Spine';
import { CameraIcon } from './Cover';
import { prefersReducedMotion } from '../lib/motion';
import { isMultitapPack } from '../lib/cases';
import { tr } from '../lib/i18n';

// Un jeu sorti de l'étagère : son boîtier glisse vers soi, tranche en avant, puis pivote
// pour montrer sa jaquette, au centre de l'écran. Il suit un peu la souris (on le fait
// tourner) ; à la fermeture, il retourne à sa place sur l'étagère. Boîtiers au format
// européen, aux proportions réelles : CD 142 × 125 × 10,4 mm, DVD 135 × 190 × 14 mm.
// PS1 : deux formats. Europe (PAL) : boîtier plus épais, charnière noire avec
// « PlayStation » moulé ; Amérique et Japon : boîtier CD plat à charnière transparente.
const CASE_MM: Record<string, { w: number; h: number; d: number }> = {
  // Mesures relevées sur un boîtier PAL : 143 × 130 × 17 mm
  'ps1-pal': { w: 143, h: 130, d: 17 },
  'ps1-flat': { w: 142, h: 125, d: 10.4 },
  // PS2 : boîtier DVD (135 × 190 × 14 mm) dans toutes les régions ; seuls la matière et la
  // tranche changent : bleu translucide en Europe, noir en Amérique du Nord et au Japon
  ps2: { w: 135, h: 190, d: 14 },
  'ps2-us': { w: 135, h: 190, d: 14 },
  'ps2-jp': { w: 135, h: 190, d: 14 },
  // NES : boîte en carton, 127 × 178 × 24 mm (Europe, Amérique, mesures de collectionneurs) ;
  // Famicom (Japon) : boîte plus petite, à l'horizontale, 142 × 98 × 22 mm
  nes: { w: 127, h: 178, d: 24 },
  'nes-jp': { w: 142, h: 98, d: 22 },
  // Famicom Disk System : étui en plastique translucide, 88 × 98 × 9,5 mm, la jaquette en papier
  // sous la face, la disquette (jaune) derrière
  fds: { w: 88, h: 98, d: 9.5 },
  // Super Nintendo : boîte en carton couchée, 179 × 127 × 33 mm (Amérique du Nord, Europe :
  // protections de collectionneurs, proportions des scans) ; Super Famicom : haute et étroite,
  // 105 × 190 × 30 mm
  snes: { w: 179, h: 127, d: 33 },
  'snes-jp': { w: 105, h: 190, d: 30 },
  // Game Boy et Game Boy Color : petite boîte en carton carrée, 125 × 125 × 23 mm (protections de collectionneurs : 128 × 128 × 25 mm à l'intérieur) ;
  // au Japon, en hauteur, 98 × 114 × 22 mm
  gb: { w: 125, h: 125, d: 23 },
  'gb-jp': { w: 98, h: 114, d: 22 },
  // Game Boy Advance : en Amérique du Nord et en Europe, la boîte de la Game Boy (ci-dessus : les mêmes
  // protections de collectionneurs) ; au Japon, petite boîte couchée, 137 × 87 × 21 mm (mesures
  // concordantes de fabricants de protections japonais ; scans 1,57)
  'gba-jp': { w: 137, h: 87, d: 21 },
  // Mega Drive : boîtier en plastique noir, 133 × 187 × 23 mm (rapport des scans : 0,71 ; épaisseur
  // relevée sur des photos de piles de boîtes), le même dans les trois régions
  md: { w: 133, h: 187, d: 23 },
  // Nintendo 64 : boîte en carton couchée, la même que la Super Nintendo (protections acryliques
  // N64 : 182 × 129 × 36 mm à l'intérieur) ; au Japon, la même boîte debout (scans 0,715 = 127 / 179)
  n64: { w: 179, h: 127, d: 33 },
  'n64-jp': { w: 127, h: 179, d: 33 },
  // Pack PlayStation avec Multitap (Crash Team Racing, Speed Freaks, Le Monde des Bleus) : grande
  // boîte en carton couchée, 378 × 234 × 45 mm (mesurée sur celle de Crash Team Racing)
  'ps1-multitap': { w: 378, h: 234, d: 45 },
};

// Format du boîtier PS2 selon la zone de la version (zone inconnue : européen)
function ps2Format(zone: string | null | undefined): string {
  return zone === 'NTSC-U' ? 'ps2-us' : zone === 'NTSC-J' ? 'ps2-jp' : 'ps2';
}

// Coins arrondis (vus de face) du boîtier PS1 européen : chaque coin est un quart de cylindre
// en deux facettes, sur toute l'épaisseur. Pour chacune : le centre de l'arrondi et l'angle de
// la facette autour de l'axe de profondeur (0° = vers le haut, sens des aiguilles d'une montre).
function cornerFacets(w: number, h: number, r: number): { x: number; y: number; angle: number }[] {
  const corners: [number, number, number][] = [[-w / 2 + r, -h / 2 + r, 0], [w / 2 - r, -h / 2 + r, 90], [w / 2 - r, h / 2 - r, 180], [-w / 2 + r, h / 2 - r, 270]];
  return corners.flatMap(([x, y, start]) => [start - 67.5, start - 22.5].map((angle) => ({ x, y, angle })));
}

export interface Pulled {
  from: DOMRect;
  // La tranche sur l'étagère : sa place reste vide tant que le jeu est sorti
  source?: HTMLElement;
  release: { local_title: string; product_code: string | null; edition_type: string; edition_name?: string | null; zone?: string | null; platform: { short_name: string } };
  src: string | null;
  meta: string;
  // Lien vers la fiche (absent quand on y est déjà)
  gameHref?: string;
  // Sorti d'une jaquette (fiche d'un jeu) plutôt que d'une tranche : il part de face
  fromCover?: boolean;
}


// onPropose : son propre exemplaire sans jaquette, à prendre en photo
export function CaseViewer({ pulled, onClose, onEdit, onPropose }: { pulled: Pulled; onClose: () => void; onEdit?: () => void; onPropose?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // L'ombre du boîtier sur le « sol », sous lui une fois arrivé au centre
  const shadow = useRef<HTMLDivElement>(null);
  const turn = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  // La tranche sur l'étagère (sa place reste vide tant que le jeu est sorti)
  const spot = useRef(pulled.source);
  const kind = spineKind(pulled.release.platform.short_name) ?? 'ps1';
  const pack = isMultitapPack(pulled.release.platform.short_name, pulled.release.edition_type, pulled.release.edition_name);
  const format = pack ? 'ps1-multitap' : kind === 'ps1' ? (!pulled.release.zone || pulled.release.zone === 'PAL' ? 'ps1-pal' : 'ps1-flat')
    : kind === 'ps2' ? ps2Format(pulled.release.zone)
      : kind === 'nes' ? (pulled.release.zone === 'NTSC-J' ? 'nes-jp' : 'nes')
        : kind === 'n64' ? (pulled.release.zone === 'NTSC-J' ? 'n64-jp' : 'n64')
        : kind === 'snes' ? (pulled.release.zone === 'NTSC-J' ? 'snes-jp' : 'snes')
          : kind === 'gb' ? (pulled.release.zone === 'NTSC-J' ? (pulled.release.platform.short_name === 'GBA' ? 'gba-jp' : 'gb-jp') : 'gb') : kind;
  // Tranche dessinée selon la région du boîtier (sur l'étagère, toujours au format européen)
  const region = format === 'ps2-us' || (kind === 'md' && pulled.release.zone === 'NTSC-U') ? 'us'
    : format === 'ps2-jp' || format === 'nes-jp' || format === 'snes-jp' || format === 'n64-jp' || format === 'gb-jp' || format === 'gba-jp' || (kind === 'md' && pulled.release.zone === 'NTSC-J') ? 'jp' : undefined;
  // Boîte Super Famicom dont l'illustration est imprimée de côté (Square : Final Fantasy VI,
  // Chrono Trigger…) : la jaquette, plus large que haute, est tournée d'un quart de tour
  const [sideways, setSideways] = useState(false);
  const mm = CASE_MM[format];
  // La moitié de l'écran en hauteur (400 px au plus), et jamais plus large que l'écran moins une
  // marge : sur téléphone, le boîtier PS1 européen (plus large que haut) débordait
  const height = Math.min(window.innerHeight * 0.5, 400, (window.innerWidth - 56) * mm.h / mm.w);
  const k = height / mm.h;
  const [w, h, d] = [mm.w * k, height, mm.d * k];
  // PS1 Europe, d'après photos : coins arrondis (≈ 2 mm). Les tranches et les bords du dessus et
  // du dessous s'arrêtent avant le coin, que des facettes arrondissent : l'acrylique du dessus
  // s'enroule jusqu'à la tranche, sans angle vif ni trou au sommet
  // PS2 aussi : sinon chaque face arrondissait ses propres coins, et au sommet les trois
  // arrondis laissaient une marche entre la tranche et les bords. Son arrondi a l'épaisseur
  // du cadre bleu autour de la jaquette (0,8 %) : au bout de la tranche, le bleu des coins
  // en est le prolongement exact, pas plus épais
  const round = format === 'ps1-pal' ? h * 0.016 : kind === 'ps2' ? h * 0.008 : 0;
  const facet = 2 * round * Math.sin(Math.PI / 8) * 1.06;

  // Trajet entre la tranche sur l'étagère et le centre de la scène
  function keyframes(): Keyframe[] {
    const { from } = pulled;
    const dx = from.left + from.width / 2 - window.innerWidth / 2;
    const dy = from.top + from.height / 2 - window.innerHeight * 0.4;
    const s = pulled.fromCover ? from.width / w : from.height / h;
    const start = pulled.fromCover ? 0 : 90;
    const reach = pulled.fromCover ? 0.15 : 0.4;
    // Un seul mouvement continu, calculé image par image (pas d'étapes qui marquent un
    // temps d'arrêt) : le jeu glisse hors de l'étagère vers soi, tranche en avant, et
    // dans la foulée vient au centre en grandissant et pivote jusqu'à montrer sa jaquette
    const smooth = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
    const frames: Keyframe[] = [];
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pull = smooth(0, 0.4, t);
      const travel = smooth(0.12, 1, t);
      const scale = s * (1 + reach * pull) * (1 - travel) + travel;
      const lift = Math.sin(Math.PI * travel) * 28;
      const angle = start + (24 - start) * smooth(0.2, 1, t);
      frames.push({ transform: `translate(${(dx * (1 - travel)).toFixed(1)}px, ${(dy * (1 - travel) - lift).toFixed(1)}px) scale(${scale.toFixed(4)}) rotateY(${angle.toFixed(2)}deg)`, offset: t });
    }
    return frames;
  }

  const opened = useEffectEvent(() => {
    dialog.current?.showModal();
    // Sa place reste vide sur l'étagère pendant qu'il est sorti
    if (spot.current) spot.current.style.visibility = 'hidden';
    if (!prefersReducedMotion()) {
      box.current?.animate(keyframes(), { duration: 1150, fill: 'both' });
      // L'ombre apparaît quand le boîtier approche de sa place, pas pendant le trajet
      shadow.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: 1150, fill: 'both' });
    }
  });
  const restore = () => { if (spot.current) spot.current.style.visibility = ''; };
  useLayoutEffect(() => {
    opened();
    const el = spot.current;
    return () => { if (el) el.style.visibility = ''; };
  }, []);

  // Fermer : le boîtier refait le chemin à l'envers et se range dans sa place
  function close() {
    if (closing.current) return;
    closing.current = true;
    const done = () => { restore(); dialog.current?.close(); onClose(); };
    if (prefersReducedMotion() || !box.current) return done();
    // Le même mouvement à l'envers, d'une traite
    const back = keyframes().reverse().map((f, i, all) => ({ transform: f.transform, offset: i / (all.length - 1) }));
    shadow.current?.animate([{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], { duration: 950, fill: 'both' });
    box.current.animate(back, { duration: 950, fill: 'both' }).finished.then(done, done);
  }

  // Le boîtier suit la souris : quelques degrés de chaque côté
  function follow(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !turn.current) return;
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    turn.current.style.setProperty('--turn-y', `${(x * 36).toFixed(1)}deg`);
    turn.current.style.setProperty('--turn-x', `${(-y * 16).toFixed(1)}deg`);
    // Le reflet du film plastique glisse avec le boîtier
    turn.current.style.setProperty('--film', `${Math.round((x + 0.5) * 100)}%`);
  }

  const face = (style: CSSProperties) => ({ ...style, position: 'absolute' } as CSSProperties);
  const title = pulled.release.local_title;
  return (
    <dialog ref={dialog} className={`case-viewer cv-${pack ? 'pack' : kind} cv-${format}`} aria-label={title}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="cv-stage" onPointerMove={follow} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div ref={shadow} className="cv-shadow" aria-hidden="true"
          style={{ width: w * 1.15, height: Math.max(16, h * 0.09), marginLeft: -w * 0.575, marginTop: h / 2 + h * 0.03 }} />
        <div ref={box} className="cv-box" style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, ['--case-h' as string]: `${h}px`, ['--round' as string]: `${round}px`,
            ...(pack && pulled.src ? { ['--pack-art' as string]: `url("${pulled.src}")` } : {}) } as CSSProperties}>
          <div ref={turn} className="cv-turn">
            {/* Face : la jaquette sous le plastique (couvercle transparent du boîtier CD,
                pochette du boîtier DVD), avec ce qu'on voit autour d'elle */}
            <div className="cv-face cv-front" style={face({ width: w, height: h, transform: `translateZ(${d / 2}px)` })}>
              <span className="cv-hinge">{format === 'ps1-pal' && <span className="cv-hinge-text">PlayStation</span>}</span>
              {/* PS1 Europe : le décroché du couvercle en acrylique, entre la charnière noire et la jaquette */}
              {format === 'ps1-pal' && <span className="cv-step" />}
              <span className="cv-inlay">
                {pulled.src ? (
                  <img src={pulled.src} alt="" className={sideways ? 'is-sideways' : undefined}
                    style={sideways ? ({ width: h, height: w } as CSSProperties) : undefined}
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      if (format === 'snes-jp' && img.naturalWidth > img.naturalHeight * 1.2) setSideways(true);
                    }} />
                ) : (
                  <span className="cv-nocover">
                    <CameraIcon size={22} />
                    <strong>{title}</strong>
                    <span className="cover-missing-text">{tr('En attente de jaquette')}</span>
                  </span>
                )}
                {/* Jeux PAL seulement (pas les versions de zone inconnue) : l'étiquette hologramme
                    collée en bas à gauche, toujours au même endroit, à la place qu'elle a sur une
                    vraie jaquette PAL (un scan recadré peut avoir son texte dessous). Dessin à
                    nous, sans le logo de la marque ; ses couleurs changent quand le boîtier tourne */}
                {format === 'ps1-pal' && pulled.release.zone === 'PAL' && <span className="cv-holo" aria-hidden="true"><span className="cv-holo-text" /><span className="cv-holo-ghost" /><span className="cv-holo-window"><span className="cv-holo-emblem" /></span><span className="cv-holo-big" /></span>}
              </span>
              <span className="cv-gloss" />
            </div>
            {/* Dos : le verso n'est pas dans la base ; on voit le dos de la jaquette, sombre (Famicom
                Disk System : la disquette jaune à travers le plastique) */}
            <div className="cv-face cv-back" style={face({ width: w, height: h, transform: `rotateY(180deg) translateZ(${d / 2}px)` })}>
              {kind === 'fds' && <span className="cv-diskette" />}
              <span className="cv-inlay cv-back-inlay"><span>{title}</span>{pulled.release.product_code && <small>{pulled.release.product_code}</small>}</span>
              <span className="cv-gloss" />
            </div>
            <div className="cv-face cv-spine" style={face({ width: d, height: h - 2 * round, top: round, left: (w - d) / 2, transform: `rotateY(-90deg) translateZ(${w / 2}px)`, ['--spine-w' as string]: `${d}px` })}>
              <SpineFace release={pulled.release} region={region} />
              <span className="cv-gloss" />
            </div>
            {/* Côté ouverture : la seconde tranche du verso (boîtier CD), le plastique lisse et sa rainure (DVD) */}
            <div className="cv-face cv-side" style={face({ width: d, height: h - 2 * round, top: round, left: (w - d) / 2, transform: `rotateY(90deg) translateZ(${w / 2}px)`, ['--spine-w' as string]: `${d}px` })}>
              {/* Boîte en carton : le titre aussi sur l'autre tranche */}
              {(kind === 'ps1' || kind === 'nes' || kind === 'snes' || kind === 'n64' || kind === 'gb') && <SpineFace release={pulled.release} region={kind === 'ps1' ? undefined : region} />}
              {/* PS2 : la rainure où l'on glisse les doigts pour ouvrir le boîtier */}
              {kind === 'ps2' && <span className="cv-notch" />}
              <span className="cv-gloss" />
            </div>
            <div className="cv-face cv-edge cv-top" style={face({ width: w - 2 * round, left: round, height: d, top: (h - d) / 2, transform: `rotateX(90deg) translateZ(${h / 2}px)` })}>
              {/* Nintendo 64 (Europe, Amérique) : le nom de la console en grand, en blanc, sur le long
                  côté du dessus (texte simple, à la place du logo) */}
              {format === 'n64' && <span className="cv-edge-label">NINTENDO 64</span>}
              {/* Pack avec Multitap : l'illustration continue sur les côtés, et l'adaptateur nommé (texte simple) */}
              {pack && <span className="cv-edge-label">+ Multi Tap</span>}
            </div>
            <div className="cv-face cv-edge cv-bottom" style={face({ width: w - 2 * round, left: round, height: d, top: (h - d) / 2, transform: `rotateX(-90deg) translateZ(${h / 2}px)` })} />
            {round > 0 && cornerFacets(w, h, round).map((c, i) => (
              <div key={i} className="cv-face cv-round" style={face({ width: facet, height: d, left: (w - facet) / 2, top: (h - d) / 2,
                transform: `translate(${c.x}px, ${c.y}px) rotateZ(${c.angle}deg) rotateX(90deg) translateZ(${round * Math.cos(Math.PI / 8)}px)` })} />
            ))}
          </div>
        </div>
      </div>
      <div className="cv-info">
        <h2>{title}</h2>
        <p className="muted small">{pulled.meta}</p>
        <div className="actions">
          {pulled.gameHref && <Link to={pulled.gameHref} className="button button-primary">{tr('Voir la fiche')}</Link>}
          {onPropose && <button type="button" className="button" onClick={() => { closing.current = true; dialog.current?.close(); onClose(); onPropose(); }}>{tr('Proposer ma photo')}</button>}
          {onEdit && <button type="button" className="button" onClick={() => { closing.current = true; dialog.current?.close(); onClose(); onEdit(); }}>{tr('Modifier')}</button>}
          <button type="button" className="button" onClick={close}>{tr('Fermer')}</button>
        </div>
      </div>
    </dialog>
  );
}
