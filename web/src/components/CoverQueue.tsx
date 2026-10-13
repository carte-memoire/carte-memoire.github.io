import { useEffect, useEffectEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CATALOG_ZONES, editionClass, editionLabel, formatNumber, gamePath, zoneLabel } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ACCEPT_ATTRIBUTE, imageFromClipboard, uploadReleaseImage } from '../lib/images';
import { ALL_PLATFORMS, rememberedPageSize, rememberedPlatform, rememberPageSize } from '../lib/preferences';
import type { EditionType, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Cover } from './Cover';
import { PageSizeSelect, Pagination } from './Pagination';
import { PsSymbol } from './PsSymbol';
import { useKnownPlatform } from '../lib/usePlatforms';
import { tr } from '../lib/i18n';

// Files de modération : 100 au plus par page (plafond des fonctions)
const QUEUE_SIZES = [10, 20, 50, 100];

const EDITIONS: { value: EditionType | ''; label: string }[] = [
  { value: 'reissue', label: tr('Rééditions (Platinum…)') },
  { value: 'standard', label: tr('Éditions standard') },
  { value: '', label: tr('Toutes') },
];

interface CoverRow {
  id: number;
  game_id: number;
  game_title: string;
  local_title: string;
  zone: Zone | null;
  product_code: string | null;
  edition_type: EditionType;
  edition_name: string | null;
  stand_in_path: string | null;
  // Console de la version (absente tant que la migration 20261010190800 n'est pas envoyée)
  platform_short_name?: string;
  total_count: number;
}

// Dernière jaquette envoyée, pour pouvoir l'annuler (mauvaise image collée)
interface LastUpload {
  row: CoverRow;
  imageId: number;
  path: string;
}

// File des versions sans jaquette (recto). Le plus rapide : « Chercher l'image » ouvre une
// recherche dans un nouvel onglet ; clic droit sur la bonne image → « Copier l'image » ;
// retour ici → Ctrl+V. La jaquette part sur la carte ciblée, qui quitte la file, et la
// suivante devient la cible. Un fichier peut aussi être choisi ou déposé sur la carte.
export function CoverQueue({ onCount, active }: { onCount: (n: number) => void; active: boolean }) {
  const { session } = useAuth();
  const platform = useKnownPlatform(rememberedPlatform());
  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const [edition, setEdition] = useState<EditionType | ''>('reissue');
  const [zone, setZone] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => Math.min(rememberedPageSize('file', 20) || 100, 100));
  const [rows, setRows] = useState<CoverRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState(0);
  const [version, setVersion] = useState(0);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [last, setLast] = useState<LastUpload | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Compteur de l'onglet : toutes les versions sans recto, sans filtre
  useEffect(() => {
    supabase.rpc('releases_without_cover', { platform_code: platformCode, page_size: 1 })
      .then(({ data }) => onCount((data as CoverRow[] | null)?.[0]?.total_count ?? 0));
  }, [platformCode, onCount, version]);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(text.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    let alive = true;
    supabase.rpc('releases_without_cover', {
      platform_code: platformCode, edition: edition || null, zone_code: zone || null, search: query || null,
      page_number: page, page_size: pageSize,
    }).then(({ data, error }) => {
      if (!alive) return;
      setError(error ? errorMessage(error) : '');
      const list = (data as CoverRow[]) ?? [];
      setRows(list);
      setTotal(list[0]?.total_count ?? 0);
      setHidden(new Set());
      setSkipped(0);
      setTargetId(list[0]?.id ?? null);
    });
    return () => { alive = false; };
  }, [platformCode, edition, zone, query, page, pageSize, version]);

  const visible = (rows ?? []).filter((r) => !hidden.has(r.id));
  const target = visible.find((r) => r.id === targetId) ?? visible[0] ?? null;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // Carte traitée ou passée : elle disparaît, la suivante devient la cible. Page vidée :
  // on recharge la même page (les versions traitées ont quitté la file), ou la suivante
  // si tout a été passé.
  function done(id: number, saved: boolean) {
    const index = visible.findIndex((r) => r.id === id);
    const next = new Set(hidden).add(id);
    const skippedNow = skipped + (saved ? 0 : 1);
    setHidden(next);
    setSkipped(skippedNow);
    if (saved) setTotal((t) => t - 1);
    setTargetId(visible[index + 1]?.id ?? visible[index - 1]?.id ?? null);
    if (rows && rows.every((r) => next.has(r.id))) {
      if (skippedNow === rows.length) setPage((p) => p + 1);
      else setVersion((v) => v + 1);
    }
  }

  async function send(row: CoverRow, file: File | null) {
    if (!file) {
      setError(tr("Le presse-papiers ne contient pas d'image : sur l'autre site, fais un clic droit sur l'image puis « Copier l'image »."));
      return;
    }
    if (busyId !== null) return;
    setBusyId(row.id);
    setError('');
    setMessage('');
    try {
      const { id, path } = await uploadReleaseImage(row.id, 'front', file, session!.user.id);
      setLast({ row, imageId: id, path });
      setMessage(tr('Jaquette ajoutée à « {0} » ({1}, {2}).', row.local_title, zoneLabel(row.zone), label(row)));
      done(row.id, true);
    } catch (err) {
      setError(`${row.local_title} : ${errorMessage(err)}`);
    } finally {
      setBusyId(null);
    }
  }

  // Bouton « Coller l'image » : lecture directe du presse-papiers (le navigateur demande
  // l'autorisation la première fois). Refusée ou impossible : on cible la carte, Ctrl+V suffit.
  async function pasteButton(row: CoverRow) {
    setTargetId(row.id);
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) return send(row, new File([await item.getType(type)], 'jaquette', { type }));
      }
      send(row, null);
    } catch {
      setError(tr('Le navigateur ne laisse pas lire le presse-papiers : appuie sur Ctrl+V, la jaquette ira sur la carte encadrée.'));
    }
  }

  async function undo() {
    if (!last) return;
    const { error } = await supabase.from('image').delete().eq('id', last.imageId);
    if (error) return setError(errorMessage(error));
    await supabase.storage.from('covers').remove([last.path]);
    setMessage(tr('Jaquette retirée de « {0} ».', last.row.local_title));
    const back = new Set(hidden);
    back.delete(last.row.id);
    setHidden(back);
    setTotal((t) => t + 1);
    setTargetId(last.row.id);
    setLast(null);
  }

  // Ctrl+V n'importe où dans la page (sauf dans un champ de saisie) : sur la carte ciblée
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (!target || el?.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    send(target, imageFromClipboard(e.clipboardData));
  });
  useEffect(() => {
    if (!active) return;
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [active]);

  return (
    <div className="stack">
      <p className="muted">
        {tr("Versions qui n'ont pas encore de recto. Pour chacune : « Chercher l'image » ouvre une recherche dans un nouvel onglet ; fais un clic droit sur la bonne jaquette → « Copier l'image », reviens ici et appuie sur")}{' '}
        <kbd>{tr('Ctrl')}</kbd>+<kbd>V</kbd>{tr(". L'image va sur la carte encadrée, qui quitte la file. En attendant, une Platinum affiche la jaquette de sa version d'origine, avec un bandeau.")}
      </p>
      <div className="row">
        <label className="field catalog-search">
          <span className="field-label">{tr('Filtrer')}</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Titre ou code produit…')} autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">{tr('Édition')}</span>
          <select value={edition} onChange={(e) => { setEdition(e.target.value as EditionType | ''); setPage(1); }}>
            {EDITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{tr('Zone')}</span>
          <select value={zone} onChange={(e) => { setZone(e.target.value); setPage(1); }}>
            <option value="">{tr('Toutes')}</option>
            {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
        </label>
      </div>

      <div aria-live="polite">
        {message && (
          <p className="success">
            {message}{' '}
            {last && <button type="button" className="link-button" onClick={undo}>{tr('Annuler')}</button>}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      {rows !== null && (
        <div className="list-row">
          <p className="muted small">
            {formatNumber(total)}{tr(' version{0?s} sans jaquette', total > 1)}{pages > 1 ? tr(' · page {0} sur {1}', page, pages) : ''}
          </p>
          <PageSizeSelect value={pageSize} sizes={QUEUE_SIZES} onChange={(size) => { rememberPageSize('file', size); setPageSize(size); setPage(1); }} />
        </div>
      )}
      {rows !== null && !error && total === 0 && <p className="panel empty">{tr('Plus aucune jaquette à trouver ici. Bravo !')}</p>}

      <ul className="plain-list queue-list">
        {visible.map((row) => (
          <CoverCard
            key={row.id}
            row={row}
            platform={row.platform_short_name ?? platformCode ?? 'PS1'}
            isTarget={row.id === target?.id}
            busy={busyId === row.id}
            onTarget={() => setTargetId(row.id)}
            onFile={(file) => send(row, file)}
            onPaste={() => pasteButton(row)}
            onSkip={() => done(row.id, false)}
          />
        ))}
      </ul>

      <Pagination page={page} pages={pages} onChange={setPage} label={tr('Pages de la file')} />
    </div>
  );
}

function label(row: CoverRow, platform = 'PS1') {
  return editionLabel({ ...row, platform: { short_name: platform } });
}

function CoverCard({ row, platform, isTarget, busy, onTarget, onFile, onPaste, onSkip }: {
  row: CoverRow;
  platform: string;
  isTarget: boolean;
  busy: boolean;
  onTarget: () => void;
  onFile: (file: File | null) => void;
  onPaste: () => void;
  onSkip: () => void;
}) {
  const edition = label(row, platform);
  const search = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
    `"${row.local_title}" ${row.edition_type === 'standard' ? '' : edition} ${platform} ${row.zone ?? ''} cover`.replace(/\s+/g, ' '),
  )}`;
  const standIn = row.stand_in_path
    ? { path: row.stand_in_path, label: row.edition_type === 'reissue' ? edition : tr('Autre version') }
    : null;

  return (
    <li
      className={['panel queue-card cover-queue-card', isTarget && 'is-target', busy && 'is-busy'].filter(Boolean).join(' ')}
      onClick={onTarget}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onTarget(); onFile(imageFromClipboard(e.dataTransfer)); }}
    >
      <Cover images={[]} standIn={standIn} title={row.local_title} size="small" platform={platform} />
      <div className="queue-body">
        <p className="queue-title">
          <Link to={gamePath({ id: row.game_id, title: row.game_title })} target="_blank" rel="noopener">{row.local_title}</Link>
          {row.game_title !== row.local_title && <span className="result-alt"> · {row.game_title}</span>}
        </p>
        <p className="release-badges">
          <span className={`badge badge-zone badge-${(row.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(row.zone)}</span>
          <span className={`badge ${editionClass(row)}`}>{edition}</span>
          {row.product_code && <span className="muted small">{row.product_code}</span>}
        </p>
        <p className="muted small">
          <a href={search} target="_blank" rel="noopener noreferrer">{tr("Chercher l'image")}</a>
          {' · '}<Link to={`/jeu/${row.game_id}/modifier`} target="_blank" rel="noopener">{tr('Modifier le jeu')}</Link>
        </p>
        <div className="actions">
          <button type="button" className={isTarget ? 'button button-small button-primary' : 'button button-small'} disabled={busy} onClick={(e) => { e.stopPropagation(); onPaste(); }}>
            <PsSymbol shape="cross" /> {busy ? tr('Envoi…') : tr("Coller l'image")}
          </button>
          <label className="button button-small">
            <PsSymbol shape="square" />{tr(' Fichier…')}
            <input type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" disabled={busy}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { onTarget(); onFile(file); } }} />
          </label>
          <button type="button" className="button button-small" disabled={busy} onClick={(e) => { e.stopPropagation(); onSkip(); }}>{tr('Passer')}</button>
        </div>
        {isTarget && <p className="paste-hint small">{tr('Cible du collage : ')}<kbd>{tr('Ctrl')}</kbd>+<kbd>V</kbd>{tr(" envoie l'image ici.")}</p>}
      </div>
    </li>
  );
}
