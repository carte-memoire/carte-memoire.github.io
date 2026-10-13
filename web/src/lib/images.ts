import { supabase } from './supabase';
import type { EditionType, ImageType, ReleaseImage, Zone } from './types';
import { LANGUAGES, countryName } from './format';
import { tr } from './i18n';

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

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) throw new Error(tr("Impossible de convertir l'image."));
  if (blob.size > MAX_OUTPUT) throw new Error(tr('Image encore trop lourde après conversion (5 Mo maximum).'));
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
