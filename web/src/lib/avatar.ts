import { supabase } from './supabase';
import { encodeImage, extensionOf } from './images';
import { tr } from './i18n';

// Photo de profil : carré de 256 px, réencodé dans le navigateur (WebP, ou JPEG sur un
// navigateur qui ne sait pas écrire le WebP). Le réencodage efface tout ce qui pourrait
// être caché dans le fichier, et la position GPS des photos de téléphone. Le stockage
// n'accepte de toute façon que du WebP ou du JPEG de 200 Ko au plus, et la base ne laisse
// mettre dans le profil qu'un fichier de son propre dossier (jamais une adresse extérieure).

const SIZE = 256;
const MIN_SIDE = 64;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_ACCEPT = ACCEPTED.join(',');

// Adresse publique de l'image, construite à partir du chemin enregistré dans le profil
export const avatarUrl = (path: string) => supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;

// Image choisie → carré recadré au centre, réduit et réencodé
export async function prepareAvatar(file: Blob): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) throw new Error(tr('Formats acceptés : JPEG, PNG ou WebP.'));
  if (file.size > 15 * 1024 * 1024) throw new Error(tr('Image trop lourde (15 Mo maximum).'));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(tr("Ce fichier n'est pas une image lisible."));
  }
  const side = Math.min(bitmap.width, bitmap.height);
  if (side < MIN_SIDE) {
    bitmap.close();
    throw new Error(tr('Image trop petite ({0} px minimum de côté).', MIN_SIDE));
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(SIZE, side);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return encodeImage(canvas, 0.82);
}

// Nouvelle photo : déposée dans son dossier, enregistrée dans le profil, puis l'ancienne
// supprimée. Renvoie le chemin de la nouvelle.
export async function saveAvatar(userId: string, file: Blob, previous: string | null): Promise<string> {
  const image = await prepareAvatar(file);
  const path = `${userId}/${crypto.randomUUID().replace(/-/g, '')}.${extensionOf(image)}`;
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, image, { contentType: image.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from('profile').update({ avatar: path }).eq('id', userId);
  if (error) {
    await supabase.storage.from('avatars').remove([path]);
    throw error;
  }
  if (previous) await supabase.storage.from('avatars').remove([previous]);
  return path;
}

// Retirer sa photo : le profil d'abord, puis le fichier
export async function deleteAvatar(userId: string, path: string): Promise<void> {
  const { error } = await supabase.from('profile').update({ avatar: null }).eq('id', userId);
  if (error) throw error;
  await supabase.storage.from('avatars').remove([path]);
}

// Tous les fichiers du dossier d'un membre (suppression de son compte)
export async function removeAvatarFolder(userId: string): Promise<void> {
  const { data: files } = await supabase.storage.from('avatars').list(userId, { limit: 100 });
  if (files?.length) await supabase.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
}
