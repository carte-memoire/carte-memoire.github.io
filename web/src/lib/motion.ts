// Animations du site. Par défaut, on suit le réglage de l'appareil (« moins
// d'animations », dans les paramètres d'accessibilité du système) ; Mon compte
// permet de les forcer ou de les couper sur cet appareil. Le choix pose la classe
// `motion` sur <html> : toutes les animations de styles.css en dépendent.
export type MotionChoice = 'auto' | 'on' | 'off';
const MOTION_KEY = 'carte-memoire:animations';
const SYSTEM_QUERY = '(prefers-reduced-motion: reduce)';

export function motionChoice(): MotionChoice {
  try {
    const value = localStorage.getItem(MOTION_KEY);
    return value === 'on' || value === 'off' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

// L'appareil demande moins d'animations (Windows : « Effets d'animation » désactivés…)
export function systemReducesMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_QUERY).matches;
}

// Animations coupées : par choix sur cet appareil, ou par le réglage du système
export function prefersReducedMotion(): boolean {
  const choice = motionChoice();
  return choice === 'off' || (choice === 'auto' && systemReducesMotion());
}

function applyMotion() {
  document.documentElement.classList.toggle('motion', !prefersReducedMotion());
}

export function setMotionChoice(choice: MotionChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(MOTION_KEY);
    else localStorage.setItem(MOTION_KEY, choice);
  } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
  applyMotion();
}

// Au démarrage, puis à chaque changement du réglage du système
export function startMotion() {
  applyMotion();
  if (typeof window.matchMedia === 'function') window.matchMedia(SYSTEM_QUERY).addEventListener('change', applyMotion);
}
