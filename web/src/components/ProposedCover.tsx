import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { caseFormatFor, type CaseFormat, type Quad } from '../lib/coverPhoto';
import { extensionOf, loadPhoto, prepareCover } from '../lib/images';
import { CoverEditor } from './CoverEditor';
import { Dialog } from './Dialog';
import { ImageZoom } from './ImageZoom';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// À l'acceptation : la jaquette publique (bucket covers), version recadrée par le
// modérateur ou image du membre. Jamais le fichier du membre tel quel : il est décodé
// puis réencodé ici, comme à l'envoi. Un fichier trafiqué en contournant le site (autre
// chose qu'une image sous un type d'image) est refusé ; une vraie image ressort propre,
// sans données cachées ni position GPS. Renvoie le chemin (sans extension en entrée).
export async function publishProposedCover(source: string, edited: Blob | null, destination: string): Promise<string> {
  let image = edited;
  if (!image) {
    const { data, error: readError } = await supabase.storage.from('submission-images').download(source);
    if (readError || !data) throw readError ?? new Error(tr("Ce fichier n'est pas une image lisible."));
    image = await prepareCover(data, 'front', 0.85);
  }
  const path = `${destination}.${extensionOf(image)}`;
  const { error } = await supabase.storage.from('covers').upload(path, image, { contentType: image.type, upsert: false });
  if (error) throw error;
  return path;
}

// Modération : la jaquette envoyée par un membre (stockage privé, lien temporaire).
// Le modérateur peut l'agrandir pour l'examiner, et la recadrer s'il le faut : sa
// version recadrée (`edited`) est alors celle publiée à l'acceptation. L'image
// du membre, elle, n'est jamais modifiée.
export function ProposedCover({ path, platform, editionType, edited, onEdited, size = 'large' }: {
  path: string;
  platform?: string | null;
  editionType?: string | null;
  edited: Blob | null;
  onEdited: (blob: Blob | null) => void;
  size?: 'medium' | 'large';
}) {
  const [url, setUrl] = useState('');
  const [editedUrl, setEditedUrl] = useState('');
  const [zoom, setZoom] = useState(false);
  const [cropping, setCropping] = useState<HTMLCanvasElement | null>(null);
  const [format, setFormat] = useState<CaseFormat>(() => caseFormatFor(platform, editionType));
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.storage.from('submission-images').createSignedUrl(path, 600).then(({ data }) => setUrl(data?.signedUrl ?? ''));
  }, [path]);

  // La console et l'édition arrivent avec la version (lue après coup) : le format suit
  useEffect(() => { setFormat(caseFormatFor(platform, editionType)); }, [platform, editionType]);

  useEffect(() => {
    if (!edited) return setEditedUrl('');
    const objectUrl = URL.createObjectURL(edited);
    setEditedUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [edited]);

  // Le recadrage part de l'image proposée (ou de la version déjà recadrée), coins aux angles
  async function startCrop() {
    setError('');
    try {
      const blob = edited ?? await (await fetch(url)).blob();
      setCropping(await loadPhoto(blob));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const shown = editedUrl || url;
  // Cadre aux proportions exactes de l'image proposée (le modérateur la voit entière, sans
  // bandes ni rognage) ; avant chargement, celles du boîtier choisi
  const tall = format === 'dvd' || (format === 'free' && platform === 'PS2');
  const [natural, setNatural] = useState<number | null>(null);
  const fullQuad = (c: HTMLCanvasElement): Quad => [{ x: 0, y: 0 }, { x: c.width, y: 0 }, { x: c.width, y: c.height }, { x: 0, y: c.height }];

  return (
    <div className="proposed-cover">
      <button type="button" className={`cover cover-${size} proposed-cover-image`} style={{ aspectRatio: String(natural ?? (tall ? 135 / 190 : 1)) }}
        onClick={() => shown && setZoom(true)} title={tr('Agrandir pour examiner')} disabled={!shown}>
        {shown
          ? <img src={shown} alt={tr('Jaquette proposée')} onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h) setNatural(w / h); }} />
          : <span className="cover-empty" aria-hidden="true"><PsSymbol shape="square" /></span>}
      </button>
      <div className="proposed-cover-tools">
        <button type="button" className="button button-small" onClick={() => setZoom(true)} disabled={!shown}>{tr('🔍 Agrandir')}</button>
        <button type="button" className="button button-small" onClick={startCrop} disabled={!url}>{tr('✂ Recadrer')}</button>
      </div>
      {edited && (
        <p className="small">
          <span className="badge badge-owned">{tr('Recadrée par toi')}</span>{' '}
          <button type="button" className="link-button small" onClick={() => onEdited(null)}>{tr("Revenir à l'originale")}</button>
        </p>
      )}
      {error && <p className="error small">{error}</p>}
      {zoom && shown && <ImageZoom src={shown} alt={tr('Jaquette proposée')} onClose={() => setZoom(false)} />}
      <Dialog open={cropping !== null} onClose={() => setCropping(null)} title={tr('Recadrer la jaquette proposée')} wide>
        {cropping && (
          <CoverEditor image={cropping} quad={fullQuad(cropping)} format={format} onFormat={setFormat}
            backLabel={tr('Annuler')} doneLabel={tr('Garder ce recadrage')}
            onBack={() => setCropping(null)} onDone={(blob) => { onEdited(blob); setCropping(null); }} />
        )}
      </Dialog>
    </div>
  );
}
