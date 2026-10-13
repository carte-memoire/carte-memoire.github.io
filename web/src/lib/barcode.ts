// Codes-barres des boîtes : EAN-13 (Europe, Japon), UPC-A (Amérique, 12 chiffres,
// complété en EAN-13 par un 0), EAN-8. Même calcul que la base (private.normalize_barcode).

// Chiffres seuls, clé de contrôle vérifiée ; null si le code est mal lu ou mal recopié
export function normalizeBarcode(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12) digits = `0${digits}`;
  if (digits.length !== 8 && digits.length !== 13) return null;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 1; i <= body.length; i++) sum += Number(body[body.length - i]) * (i % 2 === 1 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1)) ? digits : null;
}

// Affichage comme sous les barres : « 5 028587 080131 »
export function formatBarcode(code: string): string {
  if (code.length === 13) return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

// Identifiant de liaison PC ↔ téléphone : aléatoire, impossible à deviner
export const LINK_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const linkChannel = (link: string) => `scan-${link}`;

// Téléphone ou tablette (écran tactile) : on scanne avec l'appareil photo ;
// ordinateur : on propose le téléphone (QR code), la webcam restant possible
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export const cameraAvailable = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
