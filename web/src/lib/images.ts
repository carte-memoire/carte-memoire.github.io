import { supabase } from './supabase';
import type { ImageType, ReleaseImage } from './types';

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

// Envoie une image d'une version (jaquette, verso…) : fichier dans le stockage, puis
// ligne dans la table image. Si la ligne est refusée, le fichier est retiré aussitôt.
// Réservé aux modérateurs (la base refuse sinon).
export async function uploadReleaseImage(releaseId: number, type: ImageType, file: File, userId: string) {
  const blob = await prepareCover(file);
  const path = `releases/${releaseId}/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage.from('covers').upload(path, blob, { contentType: 'image/webp', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error: rowError } = await supabase.from('image')
    .insert({ release_id: releaseId, type, path, uploaded_by: userId }).select('id').single();
  if (rowError) {
    await supabase.storage.from('covers').remove([path]);
    throw rowError;
  }
  return { id: data.id as number, path };
}

// Image collée (Ctrl+V) : sur un autre site, clic droit sur l'image → « Copier l'image ».
// Renvoie null si le presse-papiers ne contient pas d'image (du texte, ou un lien copié
// avec « Copier l'adresse de l'image » : on ne va pas chercher l'image sur l'autre site).
export function imageFromClipboard(data: DataTransfer | null): File | null {
  for (const file of Array.from(data?.files ?? [])) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}

// Jaquette « en attendant » : pour une réédition (Platinum…) sans recto, celui de la
// version d'origine, barré d'un bandeau qui dit que ce n'est pas la vraie.
export interface StandIn {
  path: string;
  label: string;
}

// Celle d'une réédition sans recto, d'après les versions du jeu déjà chargées
export function standInFor(
  release: { image: ReleaseImage[]; reissue_of: number | null; edition_name: string | null },
  origins: { id: number; image: ReleaseImage[] }[],
): StandIn | null {
  if (!release.reissue_of || release.image.some((i) => i.type === 'front')) return null;
  const front = origins.find((o) => o.id === release.reissue_of)?.image.find((i) => i.type === 'front');
  return front ? { path: front.path, label: release.edition_name ?? 'Réédition' } : null;
}
