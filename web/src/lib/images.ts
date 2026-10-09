// Préparation d'une jaquette avant envoi :
// - vérifie le format et le poids ;
// - redimensionne (1200 px maximum) et convertit en WebP.
// Ré-encoder l'image supprime aussi ses métadonnées (EXIF), dont la position
// GPS qu'un téléphone peut y avoir laissée.

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT = 15 * 1024 * 1024;
const MAX_OUTPUT = 5 * 1024 * 1024; // limite du stockage Supabase
const MAX_SIDE = 1200;
const MIN_SIDE = 150;

export const ACCEPT_ATTRIBUTE = ACCEPTED.join(',');

export async function prepareCover(file: File): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) throw new Error('Formats acceptés : JPEG, PNG ou WebP.');
  if (file.size > MAX_INPUT) throw new Error('Image trop lourde (15 Mo maximum).');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Ce fichier n'est pas une image lisible.");
  }
  if (bitmap.width < MIN_SIDE || bitmap.height < MIN_SIDE) {
    bitmap.close();
    throw new Error(`Image trop petite (${MIN_SIDE} px minimum de côté).`);
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) throw new Error("Impossible de convertir l'image.");
  if (blob.size > MAX_OUTPUT) throw new Error('Image encore trop lourde après conversion (5 Mo maximum).');
  return blob;
}
