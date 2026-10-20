import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { prefersReducedMotion } from '../lib/motion';
import { tr } from '../lib/i18n';

// Inscription : « insère le disque dans la console ». On glisse le CD dans la PS1 ouverte
// (ou on le touche, ou Entrée au clavier) ; il se pose sur l'axe, tourne, le capot se
// rabat, on appuie sur Power et le voyant s'allume. C'est l'expérience du site et une
// petite barrière contre les robots qui remplissent les formulaires à l'aveugle ; la
// vraie vérification, côté Supabase, est celle de Turnstile (lib/turnstile.ts).
//
// La PlayStation d'origine vue de dessus, avec sa façade, en millimètres (mêmes mesures
// que le dessin de l'accueil, lib/consoleArt.ts) : 270 × 188, deux ailes de 67 mm, le
// grand capot rond (Ø 172) qui empiète sur les ailes, Reset et Power à gauche avec le
// voyant devant, Open à droite, les deux ports carte mémoire + manette en façade. Capot
// ouvert : basculé vers l'arrière sur sa charnière, on voit le puits, le bloc laser noir,
// la lentille et l'axe. Disque de 12 cm. Sans logo de marque.

type Step = 'idle' | 'dragging' | 'inserting' | 'spinning' | 'closing' | 'done';

// Coin arrière gauche de la console dans le dessin ; centre du puits (et de l'axe)
const OX = 4;
const OY = 46;
const WELL = { x: 135, y: 96 };
const TRAY = { x: OX + WELL.x, y: OY + WELL.y };
const REST = { x: 350, y: TRAY.y };
const VIEW = { width: 414, height: 266 };
const DISC_R = 60;
const DROP_DISTANCE = 60;

const RECESS = '#8b8b89';
const SEAM = '#9d9d99';
const FRONT = '#a9a9a5';

// Façade vue en biais : une hauteur z (mm, depuis le sol) donne sa place sous le dessus
const FRONT_DEPTH = 0.6;
const frontY = (z: number) => 188 + (42 - z) * FRONT_DEPTH;

// Écran tactile (téléphone, tablette) : « touche-le » plutôt que « clique dessus »
const touchScreen = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

function RoundButton({ x, y, r, label, color, size, className }: {
  x: number; y: number; r: number; label: string; color: string; size: number; className?: string;
}) {
  return (
    <g className={className}>
      <circle cx={x} cy={y} r={r + 2.5} fill={RECESS} />
      <circle cx={x} cy={y} r={r} fill="#bfbfbb" stroke="#d3d3cf" strokeWidth="0.6" />
      <text x={x} y={y} className="console-label" fill={color} fontSize={size} textAnchor="middle" dominantBaseline="central">{label}</text>
    </g>
  );
}

export function DiscChallenge({ onDone }: { onDone: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [position, setPosition] = useState(REST);
  const drag = useRef<{ id: number; startX: number; startY: number; moved: boolean; offsetX: number; offsetY: number } | null>(null);
  const timers = useRef<number[]>([]);
  const ids = useId().replace(/:/g, '');
  const done = step === 'done';

  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);

  function later(ms: number, action: () => void) {
    timers.current.push(window.setTimeout(action, ms));
  }

  // Le disque se pose sur l'axe, tourne, puis le capot se rabat et la console s'allume
  function insert() {
    if (step !== 'idle' && step !== 'dragging') return;
    setPosition(TRAY);
    if (prefersReducedMotion()) {
      setStep('done');
      onDone();
      return;
    }
    setStep('inserting');
    later(450, () => setStep('spinning'));
    later(1350, () => setStep('closing'));
    later(1850, () => { setStep('done'); onDone(); });
  }

  // Coordonnées du pointeur dans le dessin
  function toDrawing(event: PointerEvent) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  // Le disque suit le pointeur là où on l'a saisi, sans sortir du dessin
  function onPointerDown(event: PointerEvent<SVGGElement>) {
    if (step !== 'idle') return;
    const point = toDrawing(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false,
      offsetX: point.x - position.x, offsetY: point.y - position.y,
    };
  }
  function onPointerMove(event: PointerEvent<SVGGElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
    current.moved = true;
    setStep('dragging');
    const point = toDrawing(event);
    if (point) {
      setPosition({
        x: Math.min(Math.max(point.x - current.offsetX, DISC_R + 2), REST.x),
        y: Math.min(Math.max(point.y - current.offsetY, DISC_R + 2), VIEW.height - DISC_R - 2),
      });
    }
  }
  function onPointerUp(event: PointerEvent<SVGGElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    // Simple toucher ou clic : le disque va tout seul dans la console
    if (!current.moved) return insert();
    if (Math.hypot(position.x - TRAY.x, position.y - TRAY.y) <= DROP_DISTANCE) insert();
    else { setStep('idle'); setPosition(REST); }
  }
  function onKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      insert();
    }
  }

  const lidClosed = step === 'closing' || done;
  // Disque glissé assez près du lecteur : le lâcher l'y pose
  const near = step === 'dragging' && Math.hypot(position.x - TRAY.x, position.y - TRAY.y) <= DROP_DISTANCE;
  const status = done
    ? tr('Disque lu : tu peux créer ton compte.')
    : step === 'spinning' || step === 'closing' || step === 'inserting'
      ? tr('Lecture du disque…')
      : touchScreen()
        ? tr('Dernière étape : glisse le disque dans la console, ou touche-le.')
        : tr('Dernière étape : glisse le disque dans la console, ou clique dessus.');
  const hinge = WELL.y - 86;

  return (
    <div className={`disc-challenge step-${step}${near ? ' is-near' : ''}${lidClosed ? ' lid-closed' : ''}`}>
      <svg ref={svg} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} className="disc-art">
        <defs>
          <linearGradient id={`${ids}-top`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cdcdc9" />
            <stop offset="1" stopColor="#c3c3bf" />
          </linearGradient>
          <radialGradient id={`${ids}-well`} cx="50%" cy="58%" r="55%">
            <stop offset="0" stopColor="#c3c3bf" />
            <stop offset="1" stopColor="#a3a3a0" />
          </radialGradient>
          <radialGradient id={`${ids}-lid`} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="#d4d4d0" />
            <stop offset="1" stopColor="#bebeba" />
          </radialGradient>
          <radialGradient id={`${ids}-lens`} cx="40%" cy="35%" r="65%">
            <stop offset="0" stopColor="#dce8ff" />
            <stop offset="1" stopColor="#3f5f9e" />
          </radialGradient>
          <radialGradient id={`${ids}-disc`} cx="50%" cy="50%" r="50%">
            <stop offset="0.2" stopColor="#e9ecf2" />
            <stop offset="0.6" stopColor="#c8ccd6" />
            <stop offset="1" stopColor="#9ea4b3" />
          </radialGradient>
          <linearGradient id={`${ids}-sheen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7b93ff" stopOpacity="0.35" />
            <stop offset="0.35" stopColor="#2fd6a6" stopOpacity="0.25" />
            <stop offset="0.65" stopColor="#ff86d9" stopOpacity="0.3" />
            <stop offset="1" stopColor="#ff5a6e" stopOpacity="0.25" />
          </linearGradient>
          <clipPath id={`${ids}-floor`}>
            <circle cx={WELL.x} cy={WELL.y} r="69" />
          </clipPath>
          {/* Le trou du disque laisse voir l'axe */}
          <mask id={`${ids}-hole`}>
            <circle r={DISC_R + 2} fill="#fff" />
            <circle r="7.5" fill="#000" />
          </mask>
        </defs>

        <g transform={`translate(${OX} ${OY})`}>
          {/* Ombre au sol, façade (ailes, centre en retrait) et ses deux ports */}
          <ellipse cx="135" cy={frontY(0)} rx="132" ry="4" fill="#05060d" opacity="0.45" />
          <rect x="0" y="180" width="270" height={frontY(0) - 180} rx="6" fill={FRONT} />
          <rect x="67" y="188" width="136" height={frontY(0) - 188} fill="#9e9e9a" />
          <path d={`M67 188V${frontY(0)}M203 188V${frontY(0)}`} stroke="#868683" strokeWidth="0.8" />
          {[76, 142].map((x) => (
            <g key={x}>
              <rect x={x} y={frontY(32)} width="52" height={27 * FRONT_DEPTH} rx="1.6" fill="#a2a29e" stroke="#6e6e6b" strokeWidth="0.6" />
              <rect x={x + 5} y={frontY(28.4)} width="42" height={3.4 * FRONT_DEPTH} fill="#3a3a39" />
              <rect x={x + 4} y={frontY(20)} width="44" height={12 * FRONT_DEPTH} rx="1.4" fill="#777775" />
              {[0, 1, 2].map((k) => (
                <rect key={k} x={x + 7 + k * 13.5} y={frontY(17.5)} width="11" height={7 * FRONT_DEPTH} rx="1.2" fill="#545452" />
              ))}
            </g>
          ))}

          {/* Dessus : marche avant au centre, bordure arrière, ailes et flancs rainurés */}
          <rect x="0" y="0" width="270" height="188" rx="6" fill={`url(#${ids}-top)`} />
          <rect x="67" y="166" width="136" height="3.6" fill={FRONT} />
          <rect x="67" y="169.6" width="136" height="18.4" fill="#c0c0bc" />
          <path d="M67 14H203" stroke="#b1b1ad" strokeWidth="0.8" />
          <path d="M67 0V188M203 0V188" stroke={SEAM} strokeWidth="1" />
          <path d="M66.2 0V188M203.8 0V188" stroke="#d9d9d5" strokeWidth="0.6" />
          <path
            d={Array.from({ length: 28 }, (_, i) => `M0.8 ${13 + i * 6}h3M266.2 ${13 + i * 6}h3`).join('')}
            stroke="#a3a39f"
            strokeWidth="0.9"
          />

          {/* Sillon et assise du capot, puis le puits */}
          <circle cx={WELL.x} cy={WELL.y} r="89" fill={RECESS} />
          <circle cx={WELL.x} cy={WELL.y} r="87" fill="#bcbcb8" />
          <circle cx={WELL.x} cy={WELL.y} r="70" fill={`url(#${ids}-well)`} stroke="#8f8f8b" strokeWidth="1.4" />
          <g clipPath={`url(#${ids}-floor)`}>
            {/* Paroi arrière dans l'ombre, reliefs moulés du fond */}
            <path d={`M${WELL.x - 70} ${WELL.y} A70 70 0 0 1 ${WELL.x + 70} ${WELL.y} A70 62 0 0 0 ${WELL.x - 70} ${WELL.y}Z`} fill="#000" opacity="0.13" />
            <path d="M60 118H100L106 112H164L170 118H210V170H60Z" fill="#cbcbc7" opacity="0.65" />
            <path d="M60 74H90V100H60Z" fill="#cbcbc7" opacity="0.65" />
            {/* Étiquette « ne pas toucher la lentille » */}
            <rect x="114" y="149" width="42" height="9" rx="1" fill="#d3d3ce" stroke="#a3a3a0" strokeWidth="0.5" />
            <path d="M117 151.8h36M117 154h36M117 156.2h28" stroke="#8d8d8a" strokeWidth="0.55" />
          </g>
          {/* Contacteur du capot, au bord du puits côté Open */}
          <rect x="193.5" y="127.3" width="7" height="3.4" rx="0.6" fill="#2b2b2b" transform="rotate(118 197 129)" />
          {/* Bloc laser : support noir, fenêtre du rail et lentille, axe du disque */}
          <path
            d="M79 60L93 36H129L137 44H159L163 56V102L149 114H117L107 102H79Z"
            fill="#1a1a1d"
            stroke="#000"
            strokeWidth="0.6"
          />
          <path d="M85 54L95 40H127" stroke="#3a3a40" strokeWidth="1" fill="none" />
          <rect x="85" y="50" width="38" height="22" rx="1" fill="#34343a" stroke="#0a0a0c" strokeWidth="0.6" />
          <path d="M88 55H120M88 67H120" stroke="#55555c" strokeWidth="0.8" />
          <rect x="106" y="54" width="14" height="14" rx="1.5" fill="#26262b" />
          <circle cx="113" cy="61" r="4.2" fill={`url(#${ids}-lens)`} />
          <circle cx="111.8" cy="59.8" r="1.3" fill="#fff" opacity="0.85" />
          <circle cx={WELL.x} cy={WELL.y} r="12" fill="#111113" />
          <circle cx={WELL.x} cy={WELL.y} r="8.5" fill="none" stroke="#3a3a3e" strokeWidth="1.2" />
          {[90, 210, 330].map((angle) => (
            <circle
              key={angle}
              cx={WELL.x + 6.5 * Math.cos((angle * Math.PI) / 180)}
              cy={WELL.y - 6.5 * Math.sin((angle * Math.PI) / 180)}
              r="1.3"
              fill="#9a9a9a"
            />
          ))}
          <circle cx={WELL.x} cy={WELL.y} r="2.2" fill="#c9c9cf" />

          {/* Petit trait du capot au bouton Open ; Reset, Power et son voyant, Open */}
          <path d="M208 139L221 147" stroke={RECESS} strokeWidth="1.2" />
          <RoundButton x={24} y={117} r={8} label="RESET" color="#5f5f5c" size={3.3} />
          <RoundButton x={35} y={156} r={19} label="POWER" color="#2fae93" size={6} className="power-cap" />
          <RoundButton x={235} y={156} r={19} label="OPEN" color="#5b94db" size={6} />
          <rect x="32.4" y="179" width="3.2" height="9" rx="1.6" fill="#6f6f6c" />
          <ellipse className="disc-led" cx="34" cy="185" rx="1.1" ry="2.4" />

          {/* Capot ouvert : relevé sur sa charnière, on en voit le dessous (moyeu qui
              maintient le disque, nervure) ; il se rabat vers l'avant */}
          <g className="lid-hinge">
            <rect x="86" y={hinge - 6} width="11" height="12" rx="1" fill="#b3b3af" stroke="#8d8d89" strokeWidth="0.6" />
            <rect x="170" y={hinge - 6} width="11" height="12" rx="1" fill="#b3b3af" stroke="#8d8d89" strokeWidth="0.6" />
            <path d={`M172.5 ${hinge - 5}v10M175 ${hinge - 5}v10M177.5 ${hinge - 5}v10`} stroke="#8d8d89" strokeWidth="0.6" />
          </g>
          <g className="lid-under">
            <circle cx={WELL.x} cy={hinge - 86} r="86" fill="#b9b9b5" stroke="#999995" strokeWidth="1.2" />
            <circle cx={WELL.x} cy={hinge - 86} r="80" fill="none" stroke="#cfcfcb" strokeWidth="2" />
            <rect x="112" y={hinge - 160} width="46" height="8" rx="1.5" fill="#c6c6c2" stroke="#a2a29e" strokeWidth="0.8" />
            <rect x="131" y={hinge - 152} width="8" height="42" fill="#c6c6c2" stroke="#a2a29e" strokeWidth="0.8" />
            <circle cx={WELL.x} cy={hinge - 86} r="18" fill="#c6c6c2" stroke="#999995" strokeWidth="1.2" />
            <circle cx={WELL.x} cy={hinge - 86} r="9" fill="#b0b0ac" />
            <circle cx={WELL.x} cy={hinge - 86} r="2.6" fill="#9a9a96" />
          </g>
        </g>

        {/* Où poser le disque */}
        <circle className="disc-target" cx={TRAY.x} cy={TRAY.y} r={DISC_R + 3} />

        {/* Le disque (12 cm) */}
        <g
          className="disc"
          role="button"
          tabIndex={done ? -1 : 0}
          aria-label={tr('Insérer le disque dans la console')}
          aria-disabled={done || undefined}
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; setStep('idle'); setPosition(REST); }}
          onKeyDown={onKeyDown}
        >
          <circle className="disc-focus" r={DISC_R + 4} />
          <g className="disc-face" mask={`url(#${ids}-hole)`}>
            <circle r={DISC_R} fill={`url(#${ids}-disc)`} stroke="#7d8291" strokeWidth="1" />
            <circle r={DISC_R} fill={`url(#${ids}-sheen)`} />
            <circle r="50" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="0.8" />
            <circle r="40" fill="none" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="0.8" />
            <circle r="25" fill="#1a1e38" stroke="#3b4170" strokeWidth="1.2" />
            {/* Les quatre symboles de la manette autour du centre */}
            <path d="M0,-20 l4.5,7.5 h-9 z" fill="none" stroke="#2fd6a6" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="16" cy="0" r="4" fill="none" stroke="#ff5a6e" strokeWidth="1.6" />
            <path d="M-3.5,12.5 l7,7 M3.5,12.5 l-7,7" stroke="#7b93ff" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="-20" y="-4" width="8" height="8" fill="none" stroke="#ff86d9" strokeWidth="1.6" />
            {/* Anneau transparent autour du trou */}
            <circle r="11" fill="#dfe5f1" fillOpacity="0.55" stroke="#9ea4b3" strokeWidth="0.8" />
          </g>
        </g>

        {/* Capot fermé : il se rabat depuis la charnière et recouvre le disque */}
        <g transform={`translate(${OX} ${OY})`}>
          <g className="lid-top">
            <circle cx={WELL.x} cy={WELL.y} r="86" fill={`url(#${ids}-lid)`} stroke="#a7a7a3" strokeWidth="0.8" />
            <circle cx={WELL.x} cy={WELL.y} r="70" fill="#d0d0cc" opacity="0.45" />
          </g>
        </g>
      </svg>
      <p className={done ? 'disc-status success-text' : 'disc-status'} role="status" aria-live="polite">
        {done && '✓ '}{status}
      </p>
    </div>
  );
}
