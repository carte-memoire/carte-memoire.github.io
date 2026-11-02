import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { BOX_REGIONS, boxRegionName, EDITION_TYPES, LANGUAGES, slugify, ZONES, zoneLabel } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { ACCEPT_ATTRIBUTE, imageFromClipboard, uploadReleaseImage } from '../../lib/images';
import type { EditionType, ImageType, Release, Zone } from '../../lib/types';
import { useAuth } from '../../auth/AuthContext';
import { useRegions } from '../../lib/useRegions';
import { Cover } from '../../components/Cover';
import { useConfirm } from '../../components/Confirm';
import { PsSymbol } from '../../components/PsSymbol';
import { StudioListEditor } from '../../components/StudioListEditor';
import { tr } from '../../lib/i18n';
import { removeCovers } from './covers';
import { DeclineRelease } from './DeclineRelease';
import { MoveRelease } from './MoveRelease';
import { ReleaseDates } from './ReleaseDates';
import { SpecsEditor } from './SpecsEditor';

const IMAGE_TYPES: { value: ImageType; label: string }[] = [
  { value: 'front', label: tr('Recto') },
  { value: 'back', label: tr('Verso') },
  { value: 'spine', label: tr('Tranche') },
  { value: 'disc', label: tr('Disque') },
  { value: 'manual', label: tr('Notice') },
  { value: 'screenshot', label: tr("Capture d'écran") },
];

// Version sans code produit à côté d'une version de même zone et même édition qui en a un :
// souvent un doublon laissé par une fusion (« Kagero: Deception 2 » / « … II »). Renvoie la
// version jumelle, pour le message (un titre différent peut aussi être une version nationale).
export function isEmptyTwin(r: Release, all: Release[]): Release | null {
  if (r.product_code) return null;
  return all.find((o) => o.id !== r.id && o.product_code && o.zone === r.zone && o.edition_type === r.edition_type
    && (o.edition_name ?? '') === (r.edition_name ?? '')) ?? null;
}

export function ReleaseEditor({ release, siblings, onSaved, canDelete, possibleDuplicate }: {
  release: Release; siblings: Release[]; onSaved: () => void; canDelete: boolean; possibleDuplicate: Release | null;
}) {
  const { session } = useAuth();
  const regions = useRegions();
  const [boxRegion, setBoxRegion] = useState(release.box_region?.code ?? '');
  const confirm = useConfirm();
  const [localTitle, setLocalTitle] = useState(release.local_title);
  const [zone, setZone] = useState<Zone | ''>(release.zone ?? '');
  const [productCode, setProductCode] = useState(release.product_code ?? '');
  const [editionType, setEditionType] = useState<EditionType>(release.edition_type);
  const [editionName, setEditionName] = useState(release.edition_name ?? '');
  const [mediaCount, setMediaCount] = useState(String(release.media_count ?? 1));
  const [languages, setLanguages] = useState<string[]>(release.languages);
  const [specs, setSpecs] = useState<Record<string, unknown>>(release.specs ?? {});
  const [imageType, setImageType] = useState<ImageType>('front');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const code = productCode.trim().toUpperCase();
    if (!localTitle.trim()) return setError(tr('Le titre est obligatoire.'));
    if (code && !/^[A-Z0-9][A-Z0-9 ._-]{2,19}$/.test(code)) return setError(tr('Code produit invalide (exemple : SCES-00867).'));
    const count = Number.parseInt(mediaCount, 10);
    const { error } = await supabase.from('release').update({
      local_title: localTitle.trim(),
      zone: zone || null,
      product_code: code || null,
      edition_type: editionType,
      edition_name: editionName.trim() || null,
      media_count: Number.isInteger(count) && count > 0 ? count : null,
      languages,
      specs,
      box_region_id: regions.find((r) => r.code === boxRegion)?.id ?? null,
    }).eq('id', release.id);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage(tr('Version enregistrée.'));
    onSaved();
  }

  async function uploadImage(file: File | undefined | null) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await uploadReleaseImage(release.id, imageType, file, session!.user.id);
      setMessage(tr('Image ajoutée ({0}).', IMAGE_TYPES.find((t) => t.value === imageType)?.label.toLowerCase()));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeRelease() {
    if (!(await confirm({
      title: tr('Supprimer cette version'),
      message: tr("« {0} » ({1}) sera définitivement supprimée, avec ses {2} image(s). C'est impossible si un membre l'a dans sa collection.", release.local_title, zoneLabel(release.zone), release.image.length),
      confirmLabel: tr('Supprimer'),
      danger: true,
    }))) return;
    const { data, error } = await supabase.rpc('delete_release', { target_release: release.id });
    if (error) return setError(errorMessage(error));
    await removeCovers(data as string[]);
    onSaved();
  }

  // Récupère le fichier tel qu'il est stocké (WebP), sous un nom lisible :
  // « final-fantasy-vii-pal-recto.webp ». Un lien direct ne suffit pas : le stockage
  // est sur un autre domaine, le navigateur ouvrirait l'image au lieu de l'enregistrer.
  async function downloadImage(path: string, type: ImageType) {
    setError('');
    const { data, error } = await supabase.storage.from('covers').download(path);
    if (error || !data) return setError(errorMessage(error) || tr('Téléchargement impossible.'));
    const label = IMAGE_TYPES.find((t) => t.value === type)?.label ?? type;
    const extension = path.split('.').pop() ?? 'webp';
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(`${release.local_title} ${release.zone ?? ''} ${label}`)}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeImage(imageId: number, path: string) {
    if (!(await confirm({ title: tr("Supprimer l'image"), message: tr('Cette image sera définitivement retirée du site.'), confirmLabel: tr('Supprimer'), danger: true }))) return;
    const { error } = await supabase.from('image').delete().eq('id', imageId);
    if (error) return setError(errorMessage(error));
    await supabase.storage.from('covers').remove([path]);
    onSaved();
  }

  return (
    <div className="panel release-editor">
      <h3>{release.local_title} <span className="muted small">· {zoneLabel(release.zone)}{tr(' · n° ')}{release.id}</span></h3>
      {possibleDuplicate && (
        <p className="warning">
          {tr('Doublon possible de « ')}{possibleDuplicate.local_title}{tr(' » (n° ')}{possibleDuplicate.id}, {possibleDuplicate.product_code}{tr(') : même zone, même édition, mais sans code produit.')}
          {possibleDuplicate.local_title.trim().toLowerCase() !== release.local_title.trim().toLowerCase() && tr(' Le titre diffère : ce peut aussi être une version nationale (française, allemande…).')}
          {' '}{tr("Vérifie, puis supprime-la si c'est un doublon.")}
        </p>
      )}

      {/* Clic sur cette zone, puis Ctrl+V : colle une image copiée sur un autre site ;
          on peut aussi y déposer un fichier. Elle prend le type choisi dans la liste. */}
      <div
        className="images-editor paste-target"
        tabIndex={0}
        aria-label={tr('Images de {0} : clique ici puis colle une image (Ctrl+V), ou dépose un fichier', release.local_title)}
        onPaste={(e) => {
          const file = imageFromClipboard(e.clipboardData);
          if (file) { e.preventDefault(); uploadImage(file); }
          else setError(tr("Le presse-papiers ne contient pas d'image : sur l'autre site, fais un clic droit sur l'image puis « Copier l'image »."));
        }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { const file = imageFromClipboard(e.dataTransfer); if (file) { e.preventDefault(); uploadImage(file); } }}
      >
        {release.image.map((img) => (
          <figure key={img.id} className="image-tile">
            <Cover images={[{ ...img, type: 'front' }]} title={release.local_title} size="small" platform={release.platform.short_name} />
            <figcaption>
              {IMAGE_TYPES.find((t) => t.value === img.type)?.label}
              <button type="button" className="link-button" onClick={() => downloadImage(img.path, img.type)}>{tr('Télécharger')}</button>
              <button type="button" className="link-button danger" onClick={() => removeImage(img.id, img.path)}>{tr('Supprimer')}</button>
            </figcaption>
          </figure>
        ))}
        <div className="image-upload">
          <select value={imageType} onChange={(e) => setImageType(e.target.value as ImageType)} aria-label={tr("Type d'image")}>
            {IMAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="button button-small">
            {busy ? tr('Envoi…') : <><PsSymbol shape="square" />{tr(' Ajouter une image')}</>}
            <input type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" disabled={busy}
              onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="muted small">{tr('ou clique dans ce cadre et colle (Ctrl+V)')}</span>
        </div>
      </div>

      <ReleaseDates release={release} onSaved={onSaved} />
      <StudioListEditor
        title={tr('Éditeurs de cette version')}
        studios={release.release_company.filter((c) => c.role === 'publisher').map((c) => c.company)}
        onAdd={(companyId) => supabase.from('release_company').insert({ release_id: release.id, company_id: companyId, role: 'publisher' })}
        onRemove={(companyId) => supabase.from('release_company').delete().eq('release_id', release.id).eq('company_id', companyId).eq('role', 'publisher')}
        onSaved={onSaved}
      />

      <form onSubmit={save} className="form">
        <div className="row">
          <label className="field">
            <span className="field-label">{tr('Titre sur la boîte')}</span>
            <input value={localTitle} onChange={(e) => setLocalTitle(e.target.value)} maxLength={200} required />
          </label>
          <label className="field">
            <span className="field-label">{tr('Zone')}</span>
            <select value={zone} onChange={(e) => setZone(e.target.value as Zone | '')}>
              <option value="">{tr('À compléter')}</option>
              {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span className="field-label">{tr('Code produit')}</span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="SCES-00867" maxLength={20} />
          </label>
          <label className="field">
            <span className="field-label">{tr('Édition')}</span>
            <select value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)}>
              {EDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{tr("Nom de l'édition")}</span>
            <input value={editionName} onChange={(e) => setEditionName(e.target.value)} placeholder={tr('Platinum')} maxLength={60} />
          </label>
          <label className="field field-narrow">
            <span className="field-label">{tr('Disques')}</span>
            <input type="number" min={1} max={20} value={mediaCount} onChange={(e) => setMediaCount(e.target.value)} />
          </label>
        </div>
        {release.platform.spec_fields && release.platform.spec_fields.length > 0 && (
          <SpecsEditor fields={release.platform.spec_fields} value={specs} onChange={setSpecs} />
        )}
        <fieldset className="checks">
          <legend className="field-label">{tr('Langues du disque')}</legend>
          {LANGUAGES.map((l) => (
            <label key={l.value}>
              <input type="checkbox" checked={languages.includes(l.value)}
                onChange={(e) => setLanguages(e.target.checked ? [...languages, l.value] : languages.filter((x) => x !== l.value))} />
              {l.label}
            </label>
          ))}
        </fieldset>
        <label className="field field-box-region">
          <span className="field-label">{tr('Boîte vendue en')}</span>
          <select value={boxRegion} onChange={(e) => setBoxRegion(e.target.value)}>
            <option value="">{tr('Non précisé')}</option>
            {BOX_REGIONS.map((code) => <option key={code} value={code}>{boxRegionName(code)}</option>)}
          </select>
          <span className="hint">{tr('Seulement quand le même disque a eu des boîtes différentes selon le pays (Crash Bash Platinum : boîte française, allemande…).')}</span>
        </label>
        {message && <p className="success">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="button button-primary"><PsSymbol shape="cross" />{tr(' Enregistrer cette version')}</button>
          <DeclineRelease release={release} siblings={siblings} onDone={onSaved} />
          {canDelete && <MoveRelease release={release} onMoved={onSaved} />}
          {canDelete && <button type="button" className="button button-small button-danger" onClick={removeRelease}>{tr('Supprimer cette version')}</button>}
        </div>
      </form>
    </div>
  );
}
