import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { COLLECTION_FIELDS } from '../lib/queries';
import { CATALOG_ZONES, FAMILIES, editionLabel, familyLabel, formatNumber, formatPercent, gamePath, yearOf, zoneOrder } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ALL_PLATFORMS, ALL_ZONES, DEFAULT_PLATFORM, rememberPlatform, rememberZone, rememberedPlatform, rememberedZone } from '../lib/preferences';
import type { CatalogRelease, CatalogRow, CollectionItem, GenreFamily, Ownership, ProgressRow, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection } from '../components/AddToCollection';
import { Cover } from '../components/Cover';
import { MemoryBar } from '../components/MemoryBar';
import { PlatformSelect } from '../components/PlatformSelect';
import { PsSymbol } from '../components/PsSymbol';

const PAGE_SIZE = 50;
const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const OWNERSHIP: { value: Ownership; label: string }[] = [
  { value: 'owned', label: "Ceux que j'ai" },
  { value: 'missing', label: 'Ceux qui me manquent' },
  { value: 'wanted', label: 'Ceux que je cherche' },
];

// Années proposées : celles de la vie de la console (PS1 : 1994 à 2006)
function yearsFor(platform: string): number[] {
  const [from, to] = platform === 'PS1' ? [1994, 2006] : [1972, new Date().getFullYear()];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Le catalogue complet d'une console, à cocher : chaque jeu avec ses versions
// de la zone choisie (Black Label, Platinum…). Un clic sur une version l'ajoute
// à la collection. Tous les filtres sont dans l'adresse : on peut la partager.
export function Catalog() {
  const { session, needsMfa } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  // Filtres lus dans l'adresse (une valeur inconnue est ignorée)
  const platform = params.get('console') ?? rememberedPlatform();
  const zoneParam = params.get('zone') ?? rememberedZone();
  const zone = zoneParam === ALL_ZONES || CATALOG_ZONES.some((z) => z.value === zoneParam) ? zoneParam : ALL_ZONES;
  const letterParam = params.get('lettre')?.toUpperCase() ?? null;
  const letter = letterParam && LETTERS.includes(letterParam) ? letterParam : null;
  const familyParam = params.get('genre');
  const family = FAMILIES.some((f) => f.value === familyParam) ? (familyParam as GenreFamily) : null;
  const year = Number.parseInt(params.get('annee') ?? '', 10) || null;
  const ownershipParam = params.get('possession');
  const ownership = session && OWNERSHIP.some((o) => o.value === ownershipParam) ? (ownershipParam as Ownership) : null;
  const query = params.get('q') ?? '';
  const sort = params.get('tri') === 'date' ? 'date' : 'title';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const zoneCode = zone === ALL_ZONES ? null : (zone as Zone);
  const userId = session?.user.id ?? null;
  const canTick = Boolean(session) && !needsMfa;

  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  // Incrémenté après chaque coche : la page et la progression sont relues
  const [version, setVersion] = useState(0);
  const [busyRelease, setBusyRelease] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<CollectionItem | null>(null);
  const [toast, setToast] = useState<{ text: string; itemId?: number; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { rememberPlatform(platform); }, [platform]);
  useEffect(() => { rememberZone(zone); }, [zone]);

  // Change des filtres dans l'adresse ; par défaut on revient à la page 1
  function update(changes: Record<string, string | null>, { keepPage = false, replace = false } = {}) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace });
  }

  function choosePlatform(value: string) {
    // Mémorisé AVANT de changer l'adresse : pour la PlayStation, l'adresse ne porte pas la console
    rememberPlatform(value);
    update({ console: value === DEFAULT_PLATFORM ? null : value, annee: null });
  }

  function chooseZone(value: string) {
    rememberZone(value);
    update({ zone: value });
  }

  function goToPage(n: number) {
    update({ page: n > 1 ? String(n) : null }, { keepPage: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Champ « filtrer » : l'adresse n'est mise à jour qu'après une courte pause de frappe
  const [text, setText] = useState(query);
  useEffect(() => { setText((t) => (t.trim() === query ? t : query)); }, [query]);
  useEffect(() => {
    if (text.trim() === query) return;
    const timer = setTimeout(() => update({ q: text.trim() || null }, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [text]);

  // La page du catalogue
  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.rpc('catalog_games', {
      platform_code: platformCode,
      zone_code: zoneCode,
      first_letter: letter,
      family_code: family,
      release_year: year,
      ownership,
      search: query || null,
      sort_by: sort,
      page_number: page,
      page_size: PAGE_SIZE,
    }).then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      setError(error ? errorMessage(error) : '');
      setRows((data as CatalogRow[]) ?? []);
    });
    return () => { active = false; };
  }, [platformCode, zoneCode, letter, family, year, ownership, query, sort, page, version, userId]);

  // La progression de la personne connectée (zone choisie, et genre s'il est filtré)
  useEffect(() => {
    if (!userId) return setProgress([]);
    let active = true;
    supabase.rpc('collection_progress', { platform_code: platformCode, zone_code: zoneCode })
      .then(({ data }) => { if (active) setProgress((data as ProgressRow[]) ?? []); });
    return () => { active = false; };
  }, [platformCode, zoneCode, version, userId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showToast(value: { text: string; itemId?: number; error?: boolean }) {
    clearTimeout(toastTimer.current);
    setToast(value);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  // « Je l'ai » : ajout immédiat (contenu et état à préciser plus tard)
  async function addOwned(release: CatalogRelease) {
    setBusyRelease(release.id);
    const { data, error } = await supabase.from('collection_item')
      .insert({ release_id: release.id, status: 'owned' }).select('id').single();
    // Le jeu était recherché : il ne l'est plus
    if (!error && release.wanted) {
      await supabase.from('collection_item').delete().eq('release_id', release.id).eq('status', 'wanted');
    }
    setBusyRelease(null);
    if (error) return showToast({ text: errorMessage(error), error: true });
    showToast({ text: `« ${release.local_title} » (${editionLabel(release)}) est dans ta collection.`, itemId: data.id });
    setVersion((v) => v + 1);
  }

  // Version déjà possédée : on ouvre l'exemplaire pour le compléter ou le modifier
  async function openItem(itemId: number) {
    const { data, error } = await supabase.from('collection_item').select(COLLECTION_FIELDS).eq('id', itemId).single();
    if (error || !data) return showToast({ text: errorMessage(error), error: true });
    setToast(null);
    setEditItem(data as unknown as CollectionItem);
  }

  async function toggleWanted(row: CatalogRow) {
    const releases = sortReleases(row.releases);
    setBusyRelease(releases[0]?.id ?? null);
    let failure: unknown = null;
    if (row.wanted) {
      const ids = releases.filter((r) => r.wanted).map((r) => r.id);
      ({ error: failure } = await supabase.from('collection_item').delete().in('release_id', ids).eq('status', 'wanted'));
    } else {
      // Toutes zones : on vise de préférence la version européenne standard
      const target = (zoneCode ? null : releases.find((r) => r.zone === 'PAL' && r.edition_type === 'standard')) ?? releases.find((r) => r.edition_type === 'standard') ?? releases[0];
      ({ error: failure } = await supabase.from('collection_item').insert({ release_id: target.id, status: 'wanted' }));
    }
    setBusyRelease(null);
    if (failure) return showToast({ text: errorMessage(failure), error: true });
    setVersion((v) => v + 1);
  }

  const total = rows?.[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const zoneInfo = CATALOG_ZONES.find((z) => z.value === zoneCode);
  const zoneProgress = progress.find((p) => p.scope === 'zone' && p.code === (zoneCode ?? 'all'));
  const familyProgress = family ? progress.find((p) => p.scope === 'family' && p.code === family) : null;
  const filtered = Boolean(letter || family || year || ownership || query);
  const next = encodeURIComponent(location.pathname + location.search);

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <h1>Catalogue</h1>
          <p className="catalog-subtitle">
            Les jeux <PlatformSelect value={platform} onChange={choosePlatform} /> sortis <ZoneSelect value={zone} onChange={chooseZone} />
          </p>
        </div>
        {zoneProgress && (
          <div className="catalog-progress">
            <p>
              <strong>{formatNumber(zoneProgress.owned)}</strong> / {formatNumber(zoneProgress.total)} jeux{zoneInfo ? ` ${zoneInfo.short}` : ''} dans ta collection
              <span className="muted"> · {formatPercent(zoneProgress.owned, zoneProgress.total)}</span>
            </p>
            <MemoryBar owned={zoneProgress.owned} total={zoneProgress.total} label="Ta progression" />
            {familyProgress && (
              <p className="small muted">{familyLabel(familyProgress.code)} : {formatNumber(familyProgress.owned)} / {formatNumber(familyProgress.total)}</p>
            )}
          </div>
        )}
      </div>

      {!session && (
        <p className="notice">
          <Link to={`/connexion?next=${next}`}>Connecte-toi</Link> pour cocher les jeux que tu possèdes et suivre ta progression.
        </p>
      )}
      {session && needsMfa && (
        <p className="warning">
          Ta session attend la double authentification : <Link to={`/connexion/verification?next=${next}`}>valide-la</Link> pour cocher tes jeux.
        </p>
      )}

      <div className="panel catalog-filters">
        <div className="row">
          <label className="field catalog-search">
            <span className="field-label">Filtrer</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Titre ou code produit" maxLength={120} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field-label">Genre</span>
            <select value={family ?? ''} onChange={(e) => update({ genre: e.target.value || null })}>
              <option value="">Tous les genres</option>
              {FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Année</span>
            <select value={year ?? ''} onChange={(e) => update({ annee: e.target.value || null })}>
              <option value="">Toutes</option>
              {yearsFor(platform).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {session && (
            <label className="field">
              <span className="field-label">Ma collection</span>
              <select value={ownership ?? ''} onChange={(e) => update({ possession: e.target.value || null })}>
                <option value="">Tous les jeux</option>
                {OWNERSHIP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">Tri</span>
            <select value={sort} onChange={(e) => update({ tri: e.target.value === 'date' ? 'date' : null })}>
              <option value="title">Par titre</option>
              <option value="date">Par date de sortie</option>
            </select>
          </label>
        </div>
        <nav className="letters" aria-label="Première lettre du titre">
          <button type="button" className={letter ? 'letter' : 'letter active'} aria-pressed={!letter} onClick={() => update({ lettre: null })}>Tous</button>
          {LETTERS.map((l) => (
            <button key={l} type="button" className={letter === l ? 'letter active' : 'letter'} aria-pressed={letter === l}
              aria-label={l === '#' ? 'Titres qui commencent par un chiffre' : `Lettre ${l}`}
              onClick={() => update({ lettre: letter === l ? null : l.toLowerCase() })}>
              {l}
            </button>
          ))}
        </nav>
      </div>

      <div className="list-row">
        <p className="muted" aria-live="polite">
          {rows === null ? 'Lecture du catalogue…' : `${formatNumber(total)} jeu${total > 1 ? 'x' : ''}${pages > 1 ? ` · page ${page} sur ${pages}` : ''}`}
        </p>
        {filtered && (
          <button type="button" className="link-button" onClick={() => setParams(new URLSearchParams([...params].filter(([k]) => k === 'console' || k === 'zone')))}>
            Effacer les filtres
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {rows && rows.length === 0 && !loading && !error && (
        <div className="panel empty">
          <p>{page > 1 ? 'Plus aucun jeu sur cette page.' : ownership === 'owned' ? 'Aucun jeu coché pour le moment : à toi de jouer !' : 'Aucun jeu ne correspond à ces filtres.'}</p>
          {page > 1 && <button type="button" className="button" onClick={() => goToPage(1)}><PsSymbol shape="circle" /> Première page</button>}
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className={loading ? 'catalog-list is-busy' : 'catalog-list'}>
          {rows.map((row) => (
            <CatalogLine
              key={row.id}
              row={row}
              showZone={!zoneCode}
              canTick={canTick}
              busyRelease={busyRelease}
              onAdd={addOwned}
              onOpen={openItem}
              onToggleWanted={toggleWanted}
            />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="pagination" aria-label="Pages du catalogue">
          <button type="button" className="button button-small" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            <PsSymbol shape="circle" /> Précédente
          </button>
          <span className="muted">Page {page} sur {pages}</span>
          <button type="button" className="button button-small" disabled={page >= pages} onClick={() => goToPage(page + 1)}>
            Suivante <PsSymbol shape="cross" />
          </button>
        </nav>
      )}

      {toast && (
        <div className={toast.error ? 'toast toast-error' : 'toast'} role="status">
          {toast.text}
          {toast.itemId && (
            <button type="button" className="link-button" onClick={() => openItem(toast.itemId!)}>Préciser l'état</button>
          )}
        </div>
      )}

      <AddToCollection
        open={editItem !== null}
        editItem={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => setVersion((v) => v + 1)}
      />
    </section>
  );
}

// Choix de la zone, glissé dans la phrase comme celui de la console
function ZoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <span className="inline-select-wrap">
      <select className="inline-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Choisir la région">
        {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.phrase}</option>)}
        <option value={ALL_ZONES}>dans toutes les régions</option>
      </select>
    </span>
  );
}

// Versions dans l'ordre habituel du site : Japon, Amérique, Europe ; la standard d'abord
function sortReleases(releases: CatalogRelease[]): CatalogRelease[] {
  return [...releases].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone)
    || Number(b.edition_type === 'standard') - Number(a.edition_type === 'standard') || a.id - b.id);
}

interface LineProps {
  row: CatalogRow;
  showZone: boolean;
  canTick: boolean;
  busyRelease: number | null;
  onAdd: (release: CatalogRelease) => void;
  onOpen: (itemId: number) => void;
  onToggleWanted: (row: CatalogRow) => void;
}

function CatalogLine({ row, showZone, canTick, busyRelease, onAdd, onOpen, onToggleWanted }: LineProps) {
  const releases = sortReleases(row.releases);
  const busy = releases.some((r) => r.id === busyRelease);
  return (
    <li className={row.owned ? 'catalog-row is-owned' : 'catalog-row'}>
      <div className={row.cover_other_zone ? 'cover-other-zone' : undefined} title={row.cover_other_zone ? "Jaquette d'une autre région" : undefined}>
        <Cover images={row.cover_path ? [{ id: 0, type: 'front', path: row.cover_path }] : []} title={row.display_title} size="small" />
      </div>
      <div className="catalog-main">
        <p className="catalog-heading">
          <Link to={gamePath(row)} className="catalog-title">{row.display_title}</Link>
          {row.display_title !== row.title && <span className="result-alt"> · {row.title}</span>}
          {row.release_date && <span className="muted small"> · {yearOf(row.release_date)}</span>}
        </p>
        <ul className="catalog-releases" aria-label="Versions">
          {releases.map((r) => (
            <li key={r.id}>
              <ReleaseChip release={r} showZone={showZone} interactive={canTick} busy={busy}
                onClick={() => (r.owned && r.owned_item ? onOpen(r.owned_item) : onAdd(r))} />
            </li>
          ))}
        </ul>
      </div>
      {canTick && !row.owned && releases.length > 0 && (
        <button type="button" className={row.wanted ? 'wish-button active' : 'wish-button'} aria-pressed={row.wanted} disabled={busy}
          onClick={() => onToggleWanted(row)} title={row.wanted ? 'Retirer de ma liste de recherche' : 'Ajouter à ma liste de recherche'}>
          {row.wanted ? '♥ Recherché' : '♡ Je le cherche'}
        </button>
      )}
    </li>
  );
}

function ReleaseChip({ release, showZone, interactive, busy, onClick }: {
  release: CatalogRelease; showZone: boolean; interactive: boolean; busy: boolean; onClick: () => void;
}) {
  const edition = editionLabel(release);
  const className = `release-chip${release.owned ? ' owned' : ''}${release.edition_type === 'reissue' ? ' reissue' : ''}`;
  const content = (
    <>
      <span className="chip-box" aria-hidden="true">{release.owned ? '✓' : ''}</span>
      {showZone && <span className="chip-zone">{release.zone ?? '?'}</span>}
      <span>{edition}</span>
      {release.product_code && <span className="code chip-code">{release.product_code}</span>}
      {release.copies > 1 && <span className="chip-copies">×{release.copies}</span>}
    </>
  );
  if (!interactive) return <span className={className}>{content}</span>;
  const description = `${edition}${release.product_code ? ` ${release.product_code}` : ''}`;
  return (
    <button type="button" className={className} disabled={busy} aria-pressed={release.owned}
      aria-label={release.owned ? `${description} : dans ta collection, modifier l'exemplaire` : `${description} : je l'ai, ajouter à ma collection`}
      title={release.owned ? 'Dans ta collection : cliquer pour préciser ou modifier' : "Je l'ai : cliquer pour l'ajouter à ma collection"}
      onClick={onClick}>
      {content}
    </button>
  );
}
