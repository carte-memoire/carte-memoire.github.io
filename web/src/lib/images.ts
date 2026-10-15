import { supabase } from './supabase';
import type { EditionType, ImageType, ReleaseImage, Zone } from './types';
import { LANGUAGES, countryName } from './format';
import { tr } from './i18n';

// Préparation d'une image avant envoi :
// - vérifie le format et le poids ;
// - redimensionne et convertit en WebP.
// Ré-encoder l'image supprime aussi ses métadonnées (EXIF), dont la position
// GPS qu'un téléphone peut y avoir laissée.
//
// Recto : 480 × 672 au plus (boîtier DVD ; un boîtier CD reste carré, 480 × 480), assez
// pour l'affichage le plus grand du site (280 px de large) sur un écran Retina, et
// qualité 72 : même réglage que les jaquettes importées (scripts/import-covers.mjs).
// Verso, notice, disque… : plus grands (1000 px), pour pouvoir lire le texte.

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT = 15 * 1024 * 1024;
const MAX_OUTPUT = 5 * 1024 * 1024; // limite du stockage Supabase
const FRONT_BOX = { width: 480, height: 672, quality: 0.72 };
const OTHER_BOX = { width: 1000, height: 1000, quality: 0.8 };
const MIN_SIDE = 150;

export const ACCEPT_ATTRIBUTE = ACCEPTED.join(',');

// Extension du fichier envoyé, selon le format produit (WebP, ou JPEG en secours)
export const extensionOf = (blob: Blob) => (blob.type === 'image/webp' ? 'webp' : 'jpg');

// `quality` : pour réencoder une image déjà compressée une fois (moins de perte), sinon celle du format
export async function prepareCover(file: Blob, type: ImageType = 'front', quality?: number): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) throw new Error(tr('Formats acceptés : JPEG, PNG ou WebP.'));
  if (file.size > MAX_INPUT) throw new Error(tr('Image trop lourde (15 Mo maximum).'));

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(tr("Ce fichier n'est pas une image lisible."));
  }
  if (bitmap.width < MIN_SIDE || bitmap.height < MIN_SIDE) {
    bitmap.close();
    throw new Error(tr('Image trop petite ({0} px minimum de côté).', MIN_SIDE));
  }

  const box = type === 'front' ? FRONT_BOX : OTHER_BOX;
  const scale = Math.min(1, box.width / bitmap.width, box.height / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d')!;
  // Réduction de qualité : sans ce réglage, le navigateur réduit au plus vite (image floue)
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return encodeImage(canvas, quality ?? box.quality);
}

// Image prête (déjà à la bonne taille) → fichier WebP. Un navigateur qui ne sait pas
// écrire le WebP (ancien Safari) rend un PNG bien plus lourd : on passe alors au JPEG.
export async function encodeImage(canvas: HTMLCanvasElement, quality = FRONT_BOX.quality): Promise<Blob> {
  const encode = (format: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality));
  let blob = await encode('image/webp');
  if (blob && blob.type !== 'image/webp') blob = await encode('image/jpeg');
  if (!blob) throw new Error(tr("Impossible de convertir l'image."));
  if (blob.size > MAX_OUTPUT) throw new Error(tr('Image encore trop lourde après conversion (5 Mo maximum).'));
  return blob;
}

// Photo ou image choisie, prête à recadrer : format et poids vérifiés, orientation de
// l'appareil appliquée, réduite à 3 000 px au plus (assez pour un recadrage précis)
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  if (file.type && !ACCEPTED.includes(file.type) && !file.type.startsWith('image/')) throw new Error(tr('Formats acceptés : JPEG, PNG ou WebP.'));
  if (file.size > 25 * 1024 * 1024) throw new Error(tr('Image trop lourde (25 Mo maximum).'));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(tr("Ce fichier n'est pas une image lisible."));
  }
  if (bitmap.width < MIN_SIDE || bitmap.height < MIN_SIDE) {
    bitmap.close();
    throw new Error(tr('Image trop petite ({0} px minimum de côté).', MIN_SIDE));
  }
  const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

// Envoie une image d'une version (jaquette, verso…) : fichier dans le stockage, puis
// ligne dans la table image. Si la ligne est refusée, le fichier est retiré aussitôt.
// Réservé aux modérateurs (la base refuse sinon).
export async function uploadReleaseImage(releaseId: number, type: ImageType, file: File, userId: string) {
  const blob = await prepareCover(file, type);
  const path = `releases/${releaseId}/${crypto.randomUUID()}.${extensionOf(blob)}`;
  const { error: uploadError } = await supabase.storage.from('covers').upload(path, blob, { contentType: blob.type, upsert: false });
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

// ---------------------------------------------------------------------
// Jaquette « en attendant » : une version sans recto (Platinum, version française,
// allemande…) affiche celui d'une autre version du même jeu, sous un encart qui dit
// laquelle on regarde vraiment (« Platinum », « Français », « Platinum · Français »…).
// ---------------------------------------------------------------------
export interface StandIn {
  path: string;
  label: string;
}

// Une autre version du même jeu, dont on peut emprunter le recto
export interface CoverSource {
  id: number;
  // Console de la version : on n'emprunte que la jaquette d'une version de la même console
  platform_id?: number;
  zone: Zone | null;
  edition_type: EditionType;
  image: ReleaseImage[];
}

interface ReleaseWithoutCover extends CoverSource {
  edition_name: string | null;
  reissue_of: number | null;
  languages: string[];
  box_region?: { code: string; name: string } | null;
}

const front = (r: { image: ReleaseImage[] }) => r.image.find((i) => i.type === 'front');

// Le recto à emprunter, par ordre de préférence : la version d'origine d'une réédition ;
// une version standard de la même zone ; la version européenne (PAL) ; n'importe laquelle
export function standInFor(release: ReleaseWithoutCover, siblings: CoverSource[]): StandIn | null {
  if (front(release)) return null;
  const others = siblings.filter((s) => s.id !== release.id && front(s));
  const pick = others.find((s) => s.id === release.reissue_of)
    ?? others.find((s) => s.zone === release.zone && s.edition_type === 'standard')
    ?? others.find((s) => s.zone === 'PAL' && s.edition_type === 'standard')
    ?? others.find((s) => s.zone === release.zone)
    ?? others.find((s) => s.zone === 'PAL')
    ?? others[0];
  if (!pick) return null;
  // Jaquette d'une autre zone (américaine sur une version européenne…) : on le dit
  const parts = standInParts(release);
  if (pick.zone && pick.zone !== release.zone) parts.push(`jaquette ${ZONE_SHORT[pick.zone]}`);
  return { path: front(pick)!.path, label: parts.join(' · ') || tr('Autre version') };
}

const ZONE_SHORT: Record<Zone, string> = { PAL: 'EU', 'NTSC-U': 'US', 'NTSC-J': 'JP', region_free: tr('toutes zones') };

// L'encart : l'édition (sauf la standard) et la langue (« Français », ou « EN · FR · DE »)
function standInParts(release: ReleaseWithoutCover): string[] {
  const parts: string[] = [];
  if (release.edition_type !== 'standard') parts.push(release.edition_name ?? (release.edition_type === 'reissue' ? tr('Réédition') : tr('Autre édition')));
  const languages = release.languages ?? [];
  if (release.box_region) parts.push(release.box_region.code === 'europe' ? tr('Europe') : countryName(release.box_region.code));
  else if (languages.length === 1) parts.push(LANGUAGES.find((l) => l.value === languages[0])?.label ?? languages[0].toUpperCase());
  else if (languages.length >= 2 && languages.length <= 3) parts.push(languages.map((l) => l.toUpperCase()).join(' · '));
  else if (languages.length > 3) parts.push(tr('Multilingue'));
  return parts;
}
