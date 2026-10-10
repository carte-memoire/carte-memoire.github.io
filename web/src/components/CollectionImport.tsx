import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { downloadCsv, parseCsv, readTextFile, toCsv } from '../lib/csv';
import { canMatch, FIELD_LABELS, mapColumns, parseRow, TEMPLATE_ROWS, toInsert, type Field, type ImportRow } from '../lib/collectionCsv';
import { editionLabel, formatNumber } from '../lib/format';
import { errorMessage } from '../lib/errors';
import type { CatalogRelease, CollectionItem } from '../lib/types';
import { Dialog } from './Dialog';
import { PsSymbol } from './PsSymbol';

const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo
const MAX_ROWS = 5000;
const MATCH_BATCH = 1000; // la base accepte 2 000 lignes par appel
const INSERT_BATCH = 500;
const SHOWN = 300; // lignes affichées dans l'aperçu (les autres sont importées aussi)

type Choice = Pick<CatalogRelease, 'id' | 'local_title' | 'zone' | 'edition_type' | 'edition_name' | 'product_code' | 'platform'>;

interface ReviewRow extends ImportRow {
  releaseId: number | null;
  method: 'id' | 'code' | 'title' | null;
  needsReview: boolean;
  choices: Choice[];
  include: boolean;
}

interface MatchResult {
  row_index: number;
  release_id: number;
  method: 'id' | 'code' | 'title';
  needs_review: boolean;
  choices: Choice[];
}

const choiceLabel = (c: Choice) => [c.local_title, c.zone ?? 'zone ?', editionLabel(c), c.product_code].filter(Boolean).join(' · ');

// Import d'une collection depuis un fichier CSV : lecture, aperçu à vérifier, ajout
export function CollectionImport({ open, onClose, onImported, existing }: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  existing: CollectionItem[];
}) {
  const [step, setStep] = useState<'file' | 'review' | 'done'>('file');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [header, setHeader] = useState<string[]>([]);
  const [columns, setColumns] = useState<Field[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [filter, setFilter] = useState<'all' | 'review' | 'missing'>('all');
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep('file');
    setBusy('');
    setError('');
    setRows([]);
    setFilter('all');
    setSkipExisting(true);
  }, [open]);

  // Versions déjà dans la collection, avec le même statut (possédé ou recherché)
  const owned = useMemo(() => new Set(existing.map((i) => `${i.release.id}:${i.status}`)), [existing]);
  const isDuplicate = (row: ReviewRow) => row.releaseId !== null && owned.has(`${row.releaseId}:${row.values.status}`);
  const willImport = (row: ReviewRow) => row.include && row.releaseId !== null && !(skipExisting && isDuplicate(row));

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (file.size > MAX_SIZE) return setError('Fichier trop lourd (2 Mo au plus).');
    setBusy('Lecture du fichier…');
    try {
      const table = parseCsv(await readTextFile(file));
      if (table.length < 2) throw new Error("Le fichier est vide, ou il n'a qu'une ligne : la première ligne doit contenir les noms des colonnes.");
      const map = mapColumns(table[0]);
      if (!canMatch(map)) {
        throw new Error('Aucune colonne pour retrouver les jeux : il faut au moins « titre », « code_produit » ou « id_version » (voir le modèle).');
      }
      const data = table.slice(1);
      if (data.length > MAX_ROWS) throw new Error(`${formatNumber(data.length)} lignes : ${formatNumber(MAX_ROWS)} au plus par import.`);
      const parsed = data.map((cells, i) => parseRow(cells, map, i + 2));

      const review: ReviewRow[] = parsed.map((row) => ({ ...row, releaseId: null, method: null, needsReview: false, choices: [], include: false }));
      for (let start = 0; start < parsed.length; start += MATCH_BATCH) {
        setBusy(`Recherche des jeux… ${formatNumber(Math.min(start + MATCH_BATCH, parsed.length))} / ${formatNumber(parsed.length)}`);
        const { data: found, error } = await supabase.rpc('match_import_rows', { rows: parsed.slice(start, start + MATCH_BATCH).map((r) => r.match) });
        if (error) throw error;
        for (const m of found as MatchResult[]) {
          Object.assign(review[start + m.row_index], {
            releaseId: m.release_id, method: m.method, needsReview: m.needs_review, choices: m.choices, include: true,
          });
        }
      }
      setHeader(table[0]);
      setColumns(Object.keys(map) as Field[]);
      setRows(review);
      setStep('review');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  function updateRow(line: number, changes: Partial<ReviewRow>) {
    setRows((list) => list.map((r) => (r.line === line ? { ...r, ...changes } : r)));
  }

  async function runImport() {
    const selected = rows.filter(willImport);
    setError('');
    let done = 0;
    try {
      for (let start = 0; start < selected.length; start += INSERT_BATCH) {
        setBusy(`Ajout à ta collection… ${formatNumber(done)} / ${formatNumber(selected.length)}`);
        const batch = selected.slice(start, start + INSERT_BATCH).map((r) => toInsert(r.values, r.releaseId!));
        const { error } = await supabase.from('collection_item').insert(batch);
        if (error) throw error;
        done += batch.length;
      }
      setAdded(done);
      setStep('done');
      onImported();
    } catch (err) {
      setError(`${errorMessage(err)}${done ? ` (${formatNumber(done)} lignes ajoutées avant l'erreur)` : ''}`);
      if (done) onImported();
    } finally {
      setBusy('');
    }
  }

  // Lignes non importées (introuvables ou décochées), dans leur format d'origine
  function downloadLeftovers() {
    const left = rows.filter((r) => !willImport(r) && !(skipExisting && isDuplicate(r)));
    downloadCsv('carte-memoire-lignes-non-importees.csv', toCsv([header, ...left.map((r) => r.cells)]));
  }

  const found = rows.filter((r) => r.releaseId !== null && !r.needsReview).length;
  const toReview = rows.filter((r) => r.needsReview).length;
  const missing = rows.filter((r) => r.releaseId === null).length;
  const duplicates = rows.filter(isDuplicate).length;
  const count = rows.filter(willImport).length;
  const visible = rows.filter((r) => filter === 'all' || (filter === 'review' ? r.needsReview : r.releaseId === null));
  const leftovers = rows.filter((r) => !willImport(r) && !(skipExisting && isDuplicate(r))).length;

  return (
    <Dialog open={open} onClose={onClose} title="Importer une collection (CSV)" wide>
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p className="loading">{busy}</p>}

      {step === 'file' && !busy && (
        <>
          <p>
            Choisis un fichier CSV (enregistré depuis Excel, LibreOffice ou Google Sheets). La première ligne doit donner le nom
            des colonnes. Pour retrouver chaque jeu, le site utilise dans l'ordre l'<strong>identifiant</strong> (fichier exporté
            depuis Carte Mémoire), le <strong>code produit</strong> (SCES-00867…) ou le <strong>titre exact</strong>, aidé par la
            zone et l'édition.
          </p>
          <p className="muted small">
            Colonnes reconnues : titre, jeu, code_produit, zone, edition, console, statut (possédé / recherché), etat, boite,
            notice, disque, spine_card, obtenu, lieu_achat, prix_achat, date_achat, echange, notes. Les autres sont ignorées.
          </p>
          <div className="actions">
            <label className="button button-primary">
              <PsSymbol shape="cross" /> Choisir un fichier
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button type="button" className="button" onClick={() => downloadCsv('carte-memoire-modele.csv', toCsv(TEMPLATE_ROWS))}>
              <PsSymbol shape="square" /> Télécharger un modèle
            </button>
          </div>
        </>
      )}

      {step === 'review' && !busy && (
        <>
          <p className="import-summary">
            <span className="import-ok">✓ {formatNumber(found)} trouvé{found > 1 ? 's' : ''}</span>
            <span className="import-review">⚠ {formatNumber(toReview)} à vérifier</span>
            <span className="import-missing">✕ {formatNumber(missing)} introuvable{missing > 1 ? 's' : ''}</span>
          </p>
          <p className="muted small">Colonnes reconnues : {columns.map((c) => FIELD_LABELS[c]).join(', ')}.</p>
          {duplicates > 0 && (
            <label className="switch">
              <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
              Ignorer les {formatNumber(duplicates)} ligne{duplicates > 1 ? 's' : ''} déjà dans ma collection (pour ne pas créer de doubles)
            </label>
          )}

          <div className="zone-switch" role="group" aria-label="Lignes affichées">
            {([['all', `Toutes (${formatNumber(rows.length)})`], ['review', `À vérifier (${formatNumber(toReview)})`], ['missing', `Introuvables (${formatNumber(missing)})`]] as const).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'zone-option active' : 'zone-option'} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>

          <ul className="import-list">
            {visible.slice(0, SHOWN).map((row) => {
              const duplicate = skipExisting && isDuplicate(row);
              const state = row.releaseId === null ? 'missing' : row.needsReview ? 'review' : 'ok';
              return (
                <li key={row.line} className={`import-row import-${state}${duplicate ? ' is-duplicate' : ''}`}>
                  <input type="checkbox" checked={row.include && !duplicate} disabled={row.releaseId === null || duplicate}
                    onChange={(e) => updateRow(row.line, { include: e.target.checked })} aria-label={`Importer la ligne ${row.line}`} />
                  <span className="import-line">L{row.line}</span>
                  <span className="import-source">
                    <span className="import-label">{row.label}</span>
                    {row.values.status === 'wanted' && <span className="badge">recherché</span>}
                  </span>
                  <span className="import-target">
                    {row.releaseId === null && <span className="muted">Introuvable dans le catalogue</span>}
                    {row.releaseId !== null && row.choices.length > 1 && (
                      <select value={row.releaseId} onChange={(e) => updateRow(row.line, { releaseId: Number(e.target.value), needsReview: false })}
                        aria-label={`Version pour la ligne ${row.line}`}>
                        {row.choices.map((c) => <option key={c.id} value={c.id}>{choiceLabel(c)}</option>)}
                      </select>
                    )}
                    {row.releaseId !== null && row.choices.length === 1 && <span>{choiceLabel(row.choices[0])}</span>}
                    {duplicate && <span className="muted small">Déjà dans ta collection</span>}
                    {row.warnings.map((w) => <span key={w} className="import-warning">{w}</span>)}
                  </span>
                </li>
              );
            })}
          </ul>
          {visible.length > SHOWN && (
            <p className="muted small">… et {formatNumber(visible.length - SHOWN)} autres lignes, traitées de la même façon.</p>
          )}

          <div className="actions">
            <button type="button" className="button" onClick={() => setStep('file')}><PsSymbol shape="circle" /> Autre fichier</button>
            <button type="button" className="button button-primary" disabled={count === 0} onClick={runImport}>
              <PsSymbol shape="cross" /> Importer {formatNumber(count)} ligne{count > 1 ? 's' : ''}
            </button>
          </div>
        </>
      )}

      {step === 'done' && !busy && (
        <>
          <p className="success">{formatNumber(added)} ligne{added > 1 ? 's' : ''} ajoutée{added > 1 ? 's' : ''} à ta collection.</p>
          {leftovers > 0 && (
            <p>
              {formatNumber(leftovers)} ligne{leftovers > 1 ? 's' : ''} n'{leftovers > 1 ? 'ont' : 'a'} pas été importée{leftovers > 1 ? 's' : ''}.{' '}
              <button type="button" className="link-button" onClick={downloadLeftovers}>Les télécharger</button> pour les corriger
              ou les proposer au catalogue.
            </p>
          )}
          <div className="actions">
            <button type="button" className="button button-primary" onClick={onClose}><PsSymbol shape="cross" /> Terminer</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
