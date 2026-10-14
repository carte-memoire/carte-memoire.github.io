import { useRef, useState, type ClipboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../lib/errors';
import { cameraAvailable, isTouchDevice } from '../lib/barcode';
import { caseFormatFor, type CaseFormat, type Quad } from '../lib/coverPhoto';
import { extensionOf, imageFromClipboard, loadPhoto } from '../lib/images';
import { usePhotoReceiver } from '../lib/photoLink';
import { editionLabel, zoneLabel } from '../lib/format';
import type { Release } from '../lib/types';
import { CoverCamera } from './CoverCamera';
import { CoverEditor } from './CoverEditor';
import { Dialog } from './Dialog';
import { PsSymbol } from './PsSymbol';
import { QrImage } from './Scanner';
import { tr } from '../lib/i18n';

type Step = 'choose' | 'camera' | 'phone' | 'edit' | 'done';

// Proposer la jaquette d'une version : une image (ordinateur, téléphone, ou collée),
// ou une photo (appareil photo du téléphone ; depuis un ordinateur, par un QR code),
// recadrée et redressée ici, puis envoyée aux modérateurs.
export function CoverProposal({ open, onClose, release, gameTitle }: {
  open: boolean;
  onClose: () => void;
  release: Pick<Release, 'id' | 'local_title' | 'zone' | 'edition_type' | 'edition_name' | 'platform' | 'image'>;
  gameTitle: string;
}) {
  const hasCover = release.image.some((i) => i.type === 'front');
  return (
    <Dialog open={open} onClose={onClose} title={hasCover ? tr('Proposer une meilleure jaquette') : tr('Proposer une jaquette')} wide>
      <ProposalBody release={release} gameTitle={gameTitle} hasCover={hasCover} onClose={onClose} />
    </Dialog>
  );
}

function ProposalBody({ release, gameTitle, hasCover, onClose }: {
  release: Pick<Release, 'id' | 'local_title' | 'zone' | 'edition_type' | 'edition_name' | 'platform'>;
  gameTitle: string;
  hasCover: boolean;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const [step, setStep] = useState<Step>('choose');
  const [format, setFormat] = useState<CaseFormat>(() => caseFormatFor(release.platform.short_name, release.edition_type));
  const [photo, setPhoto] = useState<{ image: HTMLCanvasElement; quad?: Quad } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  // Photo prise sur le téléphone relié : le recadrage s'ouvre ici
  const receiver = usePhotoReceiver(step === 'phone' ? link : null, (p) => {
    setFormat(p.format);
    setPhoto({ image: p.image, quad: p.quad });
    setStep('edit');
  });

  async function openFile(file: File | null | undefined) {
    if (!file) return;
    setError('');
    try {
      setPhoto({ image: await loadPhoto(file) });
      setStep('edit');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function paste(e: ClipboardEvent) {
    if (step !== 'choose') return;
    const file = imageFromClipboard(e.clipboardData);
    if (file) {
      e.preventDefault();
      openFile(file);
    }
  }

  function takePhoto() {
    setError('');
    if (isTouchDevice() && cameraAvailable()) return setStep('camera');
    setLink(crypto.randomUUID());
    setStep('phone');
  }

  // Envoi : l'image recadrée dans le dossier privé du membre, puis la proposition
  async function submit(blob: Blob) {
    const path = `${session!.user.id}/${crypto.randomUUID()}.${extensionOf(blob)}`;
    const { error: uploadError } = await supabase.storage.from('submission-images').upload(path, blob, { contentType: blob.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: insertError } = await supabase.from('submission')
      .insert({ action: 'create', target: 'image', target_id: release.id, data: { cover_path: path } });
    if (insertError) {
      await supabase.storage.from('submission-images').remove([path]);
      throw insertError;
    }
    setSent(URL.createObjectURL(blob));
    setStep('done');
  }

  const what = [release.local_title, zoneLabel(release.zone), editionLabel(release)].filter(Boolean).join(' · ');

  return (
    <div className="cover-proposal" onPaste={paste}>
      <p className="muted small">{gameTitle !== release.local_title ? `${gameTitle} — ` : ''}{what}</p>

      {step === 'choose' && (
        <>
          <p>
            {hasCover
              ? tr('La jaquette actuelle est floue, abîmée ou pas celle de cette version ? Envoie la tienne : un modérateur la comparera avant de la remplacer.')
              : tr("Cette version n'a pas encore de jaquette. Envoie la tienne : un modérateur la vérifiera avant qu'elle apparaisse.")}
          </p>
          <div className="cover-sources">
            <button type="button" className="cover-source" onClick={takePhoto}>
              <span className="cover-source-icon" aria-hidden="true">📷</span>
              <strong>{tr('Prendre une photo')}</strong>
              <span className="muted small">{isTouchDevice() ? tr('Avec l’appareil photo de ce téléphone') : tr('Avec ton téléphone, grâce à un QR code')}</span>
            </button>
            <button type="button" className="cover-source" onClick={() => fileInput.current?.click()}>
              <span className="cover-source-icon" aria-hidden="true">🖼️</span>
              <strong>{tr('Choisir une image')}</strong>
              <span className="muted small">{isTouchDevice() ? tr('Dans les photos de ce téléphone') : tr('Un scan ou une photo de ton ordinateur (ou colle-la avec Ctrl+V)')}</span>
            </button>
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
          <p className="hint">{tr('Uniquement ta propre photo ou ton scan de la boîte (pas une image prise sur un autre site). Elle est redimensionnée et convertie ici, sans les informations cachées de la photo (lieu, appareil).')}</p>
        </>
      )}

      {step === 'camera' && (
        <>
          <CoverCamera format={format} onFormat={setFormat} onPhoto={(image, quad) => { setPhoto({ image, quad }); setStep('edit'); }} />
          <button type="button" className="link-button small" onClick={() => setStep('choose')}>{tr('Retour')}</button>
        </>
      )}

      {step === 'phone' && link && (
        <>
          <QrImage url={`${window.location.origin}/scanner?photo=${link}&format=${format}`} alt={tr('QR code à viser avec le téléphone pour prendre la photo')} />
          <p className={receiver.phoneReady ? 'success' : 'notice'} aria-live="polite">
            {receiver.progress
              ? tr('Réception de la photo… ({0} / {1})', receiver.progress.done, receiver.progress.total)
              : receiver.phoneReady ? tr('Téléphone relié : prends la photo de la jaquette, elle arrivera ici.') : tr('En attente du téléphone…')}
          </p>
          {receiver.failed && <p className="error">{tr("La photo est arrivée abîmée : reprends-la sur le téléphone.")}</p>}
          <ol className="steps small">
            <li>{tr("Ouvre l'appareil photo de ton téléphone et vise ce QR code.")}</li>
            <li>{tr('Touche le lien qui apparaît : l’appareil photo du site s’ouvre, avec un cadre à la taille de la boîte.')}</li>
            <li>{tr('Prends la photo et envoie-la : tu la recadreras ici, sur cet ordinateur.')}</li>
          </ol>
          <button type="button" className="link-button small" onClick={() => setStep('choose')}>{tr('Retour')}</button>
        </>
      )}

      {step === 'edit' && photo && (
        <CoverEditor image={photo.image} quad={photo.quad} format={format} onFormat={setFormat}
          onBack={() => { setPhoto(null); setStep('choose'); }} onDone={submit} />
      )}

      {step === 'done' && (
        <div className="scan-done" role="status">
          {sent && <img className="cover-sent" src={sent} alt={tr('Ta jaquette recadrée')} />}
          <h2>{tr('Merci, ta jaquette est envoyée !')}</h2>
          <p>{tr('Un modérateur va la vérifier. Tu suivras sa décision dans ')}<Link to="/mes-propositions" onClick={onClose}>{tr('Mes propositions')}</Link>.</p>
          <button type="button" className="button button-primary" onClick={onClose}><PsSymbol shape="cross" />{tr(' Fermer')}</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
