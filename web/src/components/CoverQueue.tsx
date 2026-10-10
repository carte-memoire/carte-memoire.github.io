import { useEffect, useEffectEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CATALOG_ZONES, editionLabel, formatNumber, gamePath, zoneLabel } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ACCEPT_ATTRIBUTE, imageFromClipboard, uploadReleaseImage } from '../lib/images';
import { ALL_PLATFORMS, rememberedPlatform } from '../lib/preferences';
import type { EditionType, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Cover } from './Cover';
import { PsSymbol } from './PsSymbol';

const PAGE_SIZE = 20;

const EDITIONS: { value: EditionType | ''; label: string }[] = [
  { value: 'reissue', label: 'Rééditions (Platinum…)' },
  { value: 'standard', label: 'Éditions standard' },
  { value: '', label: 'Toutes' },
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
  const platform = rememberedPlatform();
  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const [edition, setEdition] = useState<EditionType | ''>('reissue');
  const [zone, setZone] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
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
      page_number: page, page_size: PAGE_SIZE,
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
  }, [platformCode, edition, zone, query, page, version]);

  const visible = (rows ?? []).filter((r) => !hidden.has(r.id));
  const target = visible.find((r) => r.id === targetId) ?? visible[0] ?? null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      setError("Le presse-papiers ne contient pas d'image : sur l'autre site, fais un clic droit sur l'image puis « Copier l'image ».");
      return;
    }
    if (busyId !== null) return;
    setBusyId(row.id);
    setError('');
    setMessage('');
    try {
      const { id, path } = await uploadReleaseImage(row.id, 'front', file, session!.user.id);
      setLast({ row, imageId: id, path });
      setMessage(`Jaquette ajoutée à « ${row.local_title} » (${zoneLabel(row.zone)}, ${label(row)}).`);
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
      setError('Le navigateur ne laisse pas lire le presse-papiers : appuie sur Ctrl+V, la jaquette ira sur la carte encadrée.');
    }
  }

  async function undo() {
    if (!last) return;
    const { error } = await supabase.from('image').delete().eq('id', last.imageId);
    if (error) return setError(errorMessage(error));
    await supabase.storage.from('covers').remove([last.path]);
    setMessage(`Jaquette retirée de « ${last.row.local_title} ».`);
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
        Versions qui n'ont pas encore de recto. Pour chacune : « Chercher l'image » ouvre une recherche dans un nouvel
        onglet ; fais un clic droit sur la bonne jaquette → « Copier l'image », reviens ici et appuie sur{' '}
        <kbd>Ctrl</kbd>+<kbd>V</kbd>. L'image va sur la carte encadrée, qui quitte la file. En attendant, une Platinum
        affiche la jaquette de sa version d'origine, avec un bandeau.
      </p>
      <div className="row">
        <label className="field catalog-search">
          <span className="field-label">Filtrer</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Titre ou code produit…" autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">Édition</span>
          <select value={edition} onChange={(e) => { setEdition(e.target.value as EditionType | ''); setPage(1); }}>
            {EDITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Zone</span>
          <select value={zone} onChange={(e) => { setZone(e.target.value); setPage(1); }}>
            <option value="">Toutes</option>
            {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
        </label>
      </div>

      <div aria-live="polite">
        {message && (
          <p className="success">
            {message}{' '}
            {last && <button type="button" className="link-button" onClick={undo}>Annuler</button>}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      {rows !== null && (
        <p className="muted small">
          {formatNumber(total)} version{total > 1 ? 's' : ''} sans jaquette{pages > 1 ? ` · page ${page} sur ${pages}` : ''}
        </p>
      )}
      {rows !== null && !error && total === 0 && <p className="panel empty">Plus aucune jaquette à trouver ici. Bravo !</p>}

      <ul className="plain-list queue-list">
        {visible.map((row) => (
          <CoverCard
            key={row.id}
            row={row}
            platform={platformCode ?? 'PS1'}
            isTarget={row.id === target?.id}
            busy={busyId === row.id}
            onTarget={() => setTargetId(row.id)}
            onFile={(file) => send(row, file)}
            onPaste={() => pasteButton(row)}
            onSkip={() => done(row.id, false)}
          />
        ))}
      </ul>

      {pages > 1 && (
        <nav className="pagination" aria-label="Pages de la file">
          <button type="button" className="button button-small" disabled={page <= 1} onClick={() => setPage(page - 1)}><PsSymbol shape="circle" /> Précédente</button>
          <span className="muted">Page {page} sur {pages}</span>
          <button type="button" className="button button-small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivante <PsSymbol shape="cross" /></button>
        </nav>
      )}
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
    `"${row.local_title}" ${row.edition_type === 'standard' ? '' : edition} ${platform === 'PS1' ? 'PS1' : platform} ${row.zone ?? ''} cover`.replace(/\s+/g, ' '),
  )}`;
  const standIn = row.stand_in_path
    ? { path: row.stand_in_path, label: row.edition_type === 'reissue' ? edition : 'Autre version' }
    : null;

  return (
    <li
      className={['panel queue-card cover-queue-card', isTarget && 'is-target', busy && 'is-busy'].filter(Boolean).join(' ')}
      onClick={onTarget}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onTarget(); onFile(imageFromClipboard(e.dataTransfer)); }}
    >
      <Cover images={[]} standIn={standIn} title={row.local_title} size="small" />
      <div className="queue-body">
        <p className="queue-title">
          <Link to={gamePath({ id: row.game_id, title: row.game_title })} target="_blank" rel="noopener">{row.local_title}</Link>
          {row.game_title !== row.local_title && <span className="result-alt"> · {row.game_title}</span>}
        </p>
        <p className="release-badges">
          <span className={`badge badge-zone badge-${(row.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(row.zone)}</span>
          <span className={`badge ${row.edition_type === 'reissue' ? 'badge-platinum' : 'badge-edition'}`}>{edition}</span>
          {row.product_code && <span className="muted small">{row.product_code}</span>}
        </p>
        <p className="muted small">
          <a href={search} target="_blank" rel="noopener noreferrer">Chercher l'image</a>
          {' · '}<Link to={`/jeu/${row.game_id}/modifier`} target="_blank" rel="noopener">Modifier le jeu</Link>
        </p>
        <div className="actions">
          <button type="button" className={isTarget ? 'button button-small button-primary' : 'button button-small'} disabled={busy} onClick={(e) => { e.stopPropagation(); onPaste(); }}>
            <PsSymbol shape="cross" /> {busy ? 'Envoi…' : "Coller l'image"}
          </button>
          <label className="button button-small">
            <PsSymbol shape="square" /> Fichier…
            <input type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" disabled={busy}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { onTarget(); onFile(file); } }} />
          </label>
          <button type="button" className="button button-small" disabled={busy} onClick={(e) => { e.stopPropagation(); onSkip(); }}>Passer</button>
        </div>
        {isTarget && <p className="paste-hint small">Cible du collage : <kbd>Ctrl</kbd>+<kbd>V</kbd> envoie l'image ici.</p>}
      </div>
    </li>
  );
}
