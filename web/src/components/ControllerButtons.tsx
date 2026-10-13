import { PsSymbol } from './PsSymbol';

// Les boutons de façade de la manette de chaque console, sous le titre de l'accueil.
// PlayStation (et « toutes les consoles ») : △ ○ ✕ □. Les autres : des boutons ronds
// à lettre, aux couleurs de la manette d'origine (version européenne ou japonaise).

interface Face {
  label: string;
  color: string;
  // Couleur de la lettre sur un bouton plein
  ink?: string;
  // Bouton sombre, lettre et contour en couleur (Xbox)
  ring?: boolean;
}

const RED = '#d5222f';
const YELLOW = '#f2c20c';
const BLUE = '#2d6fd8';
const GREEN = '#2aa04a';
const GREY = '#c4c7d4';
const DARK = '#14161f';

const neutral = (...labels: string[]): Face[] => labels.map((label) => ({ label, color: '#9ba1c2', ring: true }));
const XBOX: Face[] = [
  { label: 'A', color: '#5fc236', ring: true }, { label: 'B', color: '#ec3b45', ring: true },
  { label: 'X', color: '#3d8af0', ring: true }, { label: 'Y', color: '#f6c516', ring: true },
];

const FACE_BUTTONS: Record<string, Face[]> = {
  XBOX, X360: XBOX, XONE: XBOX, XSX: XBOX,
  SNES: [{ label: 'A', color: RED }, { label: 'B', color: YELLOW, ink: DARK }, { label: 'X', color: BLUE }, { label: 'Y', color: GREEN }],
  N64: [{ label: 'A', color: BLUE }, { label: 'B', color: GREEN }, { label: 'C', color: YELLOW, ink: DARK }, { label: 'Z', color: GREY, ink: DARK }],
  GC: [{ label: 'A', color: '#2fb35b' }, { label: 'B', color: RED }, { label: 'X', color: GREY, ink: DARK }, { label: 'Y', color: GREY, ink: DARK }],
  DC: [{ label: 'A', color: RED }, { label: 'B', color: BLUE }, { label: 'X', color: YELLOW, ink: DARK }, { label: 'Y', color: GREEN }],
  NEO: [{ label: 'A', color: RED }, { label: 'B', color: YELLOW, ink: DARK }, { label: 'C', color: GREEN }, { label: 'D', color: BLUE }],
  NES: [{ label: 'B', color: '#c8202c' }, { label: 'A', color: '#c8202c' }],
  GB: [{ label: 'B', color: '#9b1b5a' }, { label: 'A', color: '#9b1b5a' }],
  '2600': [{ label: '', color: '#e0402a' }],
  GBC: neutral('B', 'A'), GBA: neutral('B', 'A'),
  NDS: neutral('A', 'B', 'X', 'Y'), '3DS': neutral('A', 'B', 'X', 'Y'),
  WII: neutral('A', 'B', '1', '2'), WIIU: neutral('A', 'B', 'X', 'Y'), NSW: neutral('A', 'B', 'X', 'Y'), NSW2: neutral('A', 'B', 'X', 'Y'),
  SMS: neutral('1', '2'), GG: neutral('1', '2'), MD: neutral('A', 'B', 'C'), SAT: neutral('A', 'B', 'C', 'X', 'Y', 'Z'),
  PCE: neutral('II', 'I'),
};

export function ControllerButtons({ platform }: { platform: string }) {
  const faces = FACE_BUTTONS[platform];
  if (!faces) {
    return (
      <>
        <PsSymbol shape="triangle" colored /><PsSymbol shape="circle" colored />
        <PsSymbol shape="cross" colored /><PsSymbol shape="square" colored />
      </>
    );
  }
  return <>{faces.map((face, i) => <FaceButton key={i} {...face} />)}</>;
}

function FaceButton({ label, color, ink = '#fff', ring = false }: Face) {
  return (
    <svg viewBox="0 0 24 24" className="ps-symbol face-button" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill={ring ? '#191c30' : color} stroke={ring ? color : 'rgba(0, 0, 0, 0.35)'} strokeWidth={ring ? 2 : 1} />
      {label && (
        <text x="12" y="12.8" textAnchor="middle" dominantBaseline="middle" fill={ring ? color : ink}
          fontSize={label.length > 1 ? 9 : 11.5} fontWeight={800} fontFamily="system-ui, sans-serif">
          {label}
        </text>
      )}
    </svg>
  );
}
