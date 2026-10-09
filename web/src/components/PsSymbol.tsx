// Les quatre symboles de la manette, dessinés en SVG sur la même grille.
// (Les caractères Unicode △ ○ ✕ □ viennent de polices différentes et n'ont
// pas tous la même taille à l'écran.)
// Les formes sont équilibrées « à l'œil » : un triangle et un carré de même
// hauteur qu'un cercle paraissent plus petits, on les agrandit légèrement.

export type PsShape = 'triangle' | 'circle' | 'cross' | 'square';

interface Props {
  shape: PsShape;
  // En couleur (vert, rouge, bleu, rose) ; sinon, couleur du texte
  colored?: boolean;
  className?: string;
}

export function PsSymbol({ shape, colored = false, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`ps-symbol${colored ? ` ps-${shape}` : ''} ${className}`.trim()}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shape === 'triangle' && <path d="M12 2.6 21.6 19.6H2.4Z" />}
      {shape === 'circle' && <circle cx="12" cy="12" r="8.6" />}
      {shape === 'cross' && <path d="M5.2 5.2 18.8 18.8M18.8 5.2 5.2 18.8" />}
      {shape === 'square' && <rect x="4" y="4" width="16" height="16" rx="0.6" />}
    </svg>
  );
}
