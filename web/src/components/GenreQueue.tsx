import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  CATALOG_ZONES, FAMILIES, familyLabel, formatNumber, gamePath, yearOf, genreName,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ALL_PLATFORMS, rememberedPageSize, rememberedPlatform, rememberPageSize } from '../lib/preferences';
import type { GenreFamily, GenreInfo } from '../lib/types';
import { Combobox } from './Combobox';
import { Cover } from './Cover';
import { PageSizeSelect, Pagination } from './Pagination';
import { PsSymbol } from './PsSymbol';
import { useKnownPlatform } from '../lib/usePlatforms';
import { tr } from '../lib/i18n';

// Files de modération : 100 au plus par page (plafond des fonctions)
const QUEUE_SIZES = [10, 20, 50, 100];

// Genre « de base » de chaque famille (identifiant Wikidata), pour classer en un clic
const MAIN_GENRE: Record<GenreFamily, string> = {
  action: 'Q270948', adventure: 'Q23916', rpg: 'Q744038', platform: 'Q828322', fighting: 'Q846224',
  shooter: 'Q4282636', racing: 'Q860750', sports: 'Q868217', puzzle: 'Q54767', strategy: 'Q472055',
  simulation: 'Q1610017', music: 'Q584105', horror: 'Q11338014', visual_novel: 'Q689445', party: 'Q7888616',
};

interface Genre extends GenreInfo {
  wikidata_id: string | null;
}

interface QueueRow {
  id: number;
  title: string;
  local_title: string | null;
  release_date: string | null;
  zones: string[] | null;
  publisher: string | null;
  cover_path: string | null;
  total_count: number;
}

// File des jeux sans genre : on choisit une ou plusieurs familles (ou un genre
// précis), on enregistre, le jeu quitte la file. Il est alors marqué « revu ».
export function GenreQueue({ onCount }: { onCount: (n: number) => void }) {
  const platform = useKnownPlatform(rememberedPlatform());
  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const [genres, setGenres] = useState<Genre[]>([]);
  const [zone, setZone] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => Math.min(rememberedPageSize('file', 20) || 100, 100));
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState(0);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('genre').select('id, name, families, wikidata_id').order('name').then(({ data }) => setGenres((data as Genre[]) ?? []));
  }, []);

  // Compteur de l'onglet : toute la file, sans filtre
  useEffect(() => {
    supabase.rpc('games_without_genre', { platform_code: platformCode, page_size: 1 })
      .then(({ data }) => onCount((data as QueueRow[] | null)?.[0]?.total_count ?? 0));
  }, [platformCode, onCount, version]);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(text.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    let active = true;
    supabase.rpc('games_without_genre', {
      platform_code: platformCode, zone_code: zone || null, search: query || null, page_number: page, page_size: pageSize,
    }).then(({ data, error }) => {
      if (!active) return;
      setError(error ? errorMessage(error) : '');
      setRows((data as QueueRow[]) ?? []);
      setTotal((data as QueueRow[] | null)?.[0]?.total_count ?? 0);
      setHidden(new Set());
      setSkipped(0);
    });
    return () => { active = false; };
  }, [platformCode, zone, query, page, pageSize, version]);

  // Jeu classé ou passé : il disparaît. Page vidée : on recharge la même page (les
  // jeux classés ont quitté la file, la suite remonte), ou la suivante si tout a été passé.
  function done(id: number, saved: boolean) {
    const next = new Set(hidden).add(id);
    const skippedNow = skipped + (saved ? 0 : 1);
    setHidden(next);
    setSkipped(skippedNow);
    if (saved) setTotal((t) => t - 1);
    if (rows && rows.every((r) => next.has(r.id))) {
      if (skippedNow === rows.length) setPage((p) => p + 1);
      else setVersion((v) => v + 1);
    }
  }

  const visible = (rows ?? []).filter((r) => !hidden.has(r.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="stack">
      <p className="muted">
        {tr("Jeux sans aucun genre, que personne n'a encore classés. Choisis une ou plusieurs familles (ou un genre précis), puis enregistre : le jeu est marqué « revu » et quitte la file. En cas de doute, « Chercher sur le web » ouvre une recherche dans un nouvel onglet.")}
      </p>
      <div className="row">
        <label className="field catalog-search">
          <span className="field-label">{tr('Filtrer')}</span>
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Titre…')} autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">{tr('Zone')}</span>
          <select value={zone} onChange={(e) => { setZone(e.target.value); setPage(1); }}>
            <option value="">{tr('Toutes')}</option>
            {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {rows !== null && (
        <div className="list-row">
          <p className="muted small" aria-live="polite">
            {formatNumber(total)}{tr(' jeu{0?x} à classer', total > 1)}{pages > 1 ? tr(' · page {0} sur {1}', page, pages) : ''}
          </p>
          <PageSizeSelect value={pageSize} sizes={QUEUE_SIZES} onChange={(size) => { rememberPageSize('file', size); setPageSize(size); setPage(1); }} />
        </div>
      )}
      {rows !== null && total === 0 && <p className="panel empty">{tr('Plus aucun jeu à classer ici. Bravo !')}</p>}

      <ul className="plain-list queue-list">
        {visible.map((row) => <QueueCard key={row.id} row={row} genres={genres} onDone={(saved) => done(row.id, saved)} />)}
      </ul>

      <Pagination page={page} pages={pages} onChange={setPage} label={tr('Pages de la file')} />
    </div>
  );
}

function QueueCard({ row, genres, onDone }: { row: QueueRow; genres: Genre[]; onDone: (saved: boolean) => void }) {
  const [chosen, setChosen] = useState<Genre[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mainOf = (family: GenreFamily) => genres.find((g) => g.wikidata_id === MAIN_GENRE[family]);
  const has = (g: Genre | undefined) => Boolean(g && chosen.some((c) => c.id === g.id));
  const toggle = (g: Genre | undefined) => g && setChosen(has(g) ? chosen.filter((c) => c.id !== g.id) : [...chosen, g]);
  const search = `https://www.google.com/search?q=${encodeURIComponent(tr('"{0}" PlayStation jeu genre', row.local_title ?? row.title))}`;

  async function save() {
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase.from('game_genre').insert(chosen.map((g) => ({ game_id: row.id, genre_id: g.id })));
      if (error) throw error;
      const { error: reviewError } = await supabase.from('game').update({ genres_reviewed: true }).eq('id', row.id);
      if (reviewError) throw reviewError;
      onDone(true);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <li className={busy ? 'panel queue-card is-busy' : 'panel queue-card'}>
      <Cover images={row.cover_path ? [{ id: 0, type: 'front', path: row.cover_path }] : []} title={row.title} size="small" />
      <div className="queue-body">
        <p className="queue-title">
          <Link to={gamePath(row)} target="_blank" rel="noopener">{row.title}</Link>
          {row.local_title && <span className="result-alt"> · {row.local_title}</span>}
        </p>
        <p className="muted small">
          {[yearOf(row.release_date), row.zones?.join(', '), row.publisher].filter(Boolean).join(' · ')}
          {' · '}<a href={search} target="_blank" rel="noopener noreferrer">{tr('Chercher sur le web')}</a>
        </p>
        <div className="pills" role="group" aria-label={tr('Familles de {0}', row.title)}>
          {FAMILIES.map((f) => {
            const g = mainOf(f.value);
            return (
              <button key={f.value} type="button" className={has(g) ? 'pill active' : 'pill'} aria-pressed={has(g)} disabled={!g} onClick={() => toggle(g)}>
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="queue-precise">
          <Combobox
            label={tr('Ou un genre précis')}
            placeholder={tr('Mahjong, plates-formes 3D, tactical RPG…')}
            options={genres.filter((g) => !has(g)).map((g) => ({ value: g.id, label: genreName(g.name), detail: g.families.length ? g.families.map(familyLabel).join(' + ') : tr('thème') }))}
            emptyText={tr('Aucun genre ne correspond')}
            onSelect={(o) => toggle(genres.find((g) => g.id === o.value))}
          />
        </div>
        {chosen.some((g) => !Object.values(MAIN_GENRE).includes(g.wikidata_id ?? '')) && (
          <ul className="genre-chips">
            {chosen.filter((g) => !Object.values(MAIN_GENRE).includes(g.wikidata_id ?? '')).map((g) => (
              <li key={g.id} className="genre-chip">
                {genreName(g.name)}
                <button type="button" className="icon-button" aria-label={tr('Retirer {0}', g.name)} onClick={() => toggle(g)}>✕</button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="button button-small button-primary" disabled={chosen.length === 0 || busy} onClick={save}>
            <PsSymbol shape="cross" />{tr(' Enregistrer')}{chosen.length ? ` (${chosen.map((g) => g.families.map(familyLabel)[0] ?? g.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')})` : ''}
          </button>
          <button type="button" className="button button-small" disabled={busy} onClick={() => onDone(false)}>{tr('Passer')}</button>
        </div>
      </div>
    </li>
  );
}
