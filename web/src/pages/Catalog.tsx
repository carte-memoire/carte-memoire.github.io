import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { COLLECTION_FIELDS } from '../lib/queries';
import {
  CATALOG_ZONES, FAMILIES, LANGUAGES, ORIGINS, editionLabel, familyOriginLabel, formatNumber, formatPercent, gamePath, languagesLong,
  languagesShort, originFromParam, originParam, yearOf, zoneOrder,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import {
  ALL_LANGUAGES, ALL_PLATFORMS, ALL_ZONES, DEFAULT_LANGUAGE, DEFAULT_PLATFORM, pageSizeFrom, pageSizeParam, rememberLanguage, rememberPageSize,
  rememberPlatform, rememberZone, rememberedLanguage, rememberedPageSize, rememberedPlatform, rememberedZone,
} from '../lib/preferences';
import type { CatalogRelease, CatalogRow, CollectionItem, GenreFamily, Ownership, ProgressRow, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection } from '../components/AddToCollection';
import { Cover } from '../components/Cover';
import { MemoryBar } from '../components/MemoryBar';
import { PageSizeSelect, Pagination } from '../components/Pagination';
import { PlatformSelect } from '../components/PlatformSelect';
import { PsSymbol } from '../components/PsSymbol';
import { useKnownPlatform } from '../lib/usePlatforms';

// L'API renvoie au plus 1 000 jeux par appel : « tout » est lu en plusieurs fois
const MAX_PER_CALL = 1000;
const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
// Tris du catalogue (le premier est celui par défaut, absent de l'adresse)
const SORTS = [
  { value: 'title', label: 'Titre (A → Z)' },
  { value: 'title_desc', label: 'Titre (Z → A)' },
  { value: 'date', label: 'Date de sortie (les plus anciens)' },
  { value: 'date_desc', label: 'Date de sortie (les plus récents)' },
  { value: 'versions', label: 'Nombre de versions' },
  { value: 'added', label: 'Ajouts récents à la base' },
];

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
  const platform = useKnownPlatform(params.get('console') ?? rememberedPlatform());
  const zoneParam = params.get('zone') ?? rememberedZone();
  const zone = zoneParam === ALL_ZONES || CATALOG_ZONES.some((z) => z.value === zoneParam) ? zoneParam : ALL_ZONES;
  const letterParam = params.get('lettre')?.toUpperCase() ?? null;
  const letter = letterParam && LETTERS.includes(letterParam) ? letterParam : null;
  const familyParam = params.get('genre');
  const family = FAMILIES.some((f) => f.value === familyParam) ? (familyParam as GenreFamily) : null;
  // Origine du studio : avec la famille RPG, « japon » donne les JRPG
  const origin = originFromParam(params.get('origine'));
  const year = Number.parseInt(params.get('annee') ?? '', 10) || null;
  const ownershipParam = params.get('possession');
  const ownership = session && OWNERSHIP.some((o) => o.value === ownershipParam) ? (ownershipParam as Ownership) : null;
  const query = params.get('q') ?? '';
  const sort = SORTS.find((s) => s.value === params.get('tri'))?.value ?? 'title';
  // Langue des versions : les versions semblables dans d'autres langues sont repliées
  const languageParam = params.get('langue') ?? rememberedLanguage();
  const language = languageParam === ALL_LANGUAGES || LANGUAGES.some((l) => l.value === languageParam) ? languageParam : DEFAULT_LANGUAGE;
  // Nombre de jeux par page (0 = tout) : adresse, sinon le dernier choix
  const pageSize = pageSizeFrom(params.get('par')) ?? rememberedPageSize('catalogue', 50);
  const page = pageSize === 0 ? 1 : Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

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
  // Téléphone : les filtres secondaires sont repliés pour laisser voir la liste
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => { rememberPlatform(platform); }, [platform]);
  useEffect(() => { rememberZone(zone); }, [zone]);
  useEffect(() => { rememberLanguage(language); }, [language]);

  // Change des filtres dans l'adresse ; par défaut on revient à la page 1
  function update(changes: Record<string, string | null>, { keepPage = false, replace = false } = {}) {
    // On part de l'adresse réelle du navigateur, à jour immédiatement : `params` n'est
    // mis à jour qu'au rendu suivant, et deux changements rapprochés (zone puis tri)
    // partiraient sinon tous deux de l'ancienne adresse, effaçant le premier.
    const next = new URLSearchParams(window.location.search);
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

  function choosePageSize(size: number) {
    rememberPageSize('catalogue', size);
    update({ par: pageSizeParam(size) });
  }

  function goToPage(n: number) {
    update({ page: n > 1 ? String(n) : null }, { keepPage: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Champ « filtrer » : il garde sa propre valeur (rien ne la réécrit pendant la frappe),
  // et l'adresse n'est mise à jour qu'après une courte pause
  const [text, setText] = useState(query);
  const sentQuery = useRef(query);
  useEffect(() => {
    if (text.trim() === query) return;
    const timer = setTimeout(() => {
      sentQuery.current = text.trim();
      update({ q: text.trim() || null }, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);
  // L'adresse a changé sans passer par le champ (bouton Retour, lien) : le champ suit,
  // sinon il remettrait son ancien texte dans l'adresse
  useEffect(() => {
    if (query === sentQuery.current) return;
    sentQuery.current = query;
    setText(query);
  }, [query]);

  // La page du catalogue (ou tout le catalogue filtré, lu par paquets de 1 000)
  useEffect(() => {
    let active = true;
    setLoading(true);
    const read = (pageNumber: number, size: number) => supabase.rpc('catalog_games', {
      platform_code: platformCode,
      zone_code: zoneCode,
      first_letter: letter,
      family_code: family,
      release_year: year,
      ownership,
      search: query || null,
      sort_by: sort,
      page_number: pageNumber,
      page_size: size,
      ...(origin ? { origin_filter: origin } : {}),
    });
    (async () => {
      const first = await read(page, pageSize || MAX_PER_CALL);
      let data = (first.data as CatalogRow[] | null) ?? [];
      let failure = first.error;
      if (!failure && pageSize === 0 && data.length > 0 && data.length < data[0].total_count) {
        // Taille des paquets : ce que le serveur a vraiment renvoyé (son plafond)
        const per = data.length;
        const calls = Math.ceil(data[0].total_count / per);
        const rest = await Promise.all(Array.from({ length: calls - 1 }, (_, i) => read(i + 2, per)));
        failure = rest.find((r) => r.error)?.error ?? null;
        data = [...data, ...rest.flatMap((r) => (r.data as CatalogRow[] | null) ?? [])];
      }
      if (!active) return;
      setLoading(false);
      setError(failure ? errorMessage(failure) : '');
      setRows(data);
    })();
    return () => { active = false; };
  }, [platformCode, zoneCode, letter, family, origin, year, ownership, query, sort, page, pageSize, version, userId]);

  // La progression de la personne connectée (zone choisie, et genre s'il est filtré)
  useEffect(() => {
    if (!userId) return setProgress([]);
    let active = true;
    supabase.rpc('collection_progress', { platform_code: platformCode, zone_code: zoneCode, ...(origin ? { origin_filter: origin } : {}) })
      .then(({ data }) => { if (active) setProgress((data as ProgressRow[]) ?? []); });
    return () => { active = false; };
  }, [platformCode, zoneCode, origin, version, userId]);

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
      // On vise la version standard (européenne si toutes zones), dans la langue choisie de préférence
      const standard = releases.filter((r) => r.edition_type === 'standard' && (zoneCode || r.zone === 'PAL'));
      const target = standard.find((r) => r.languages?.includes(language)) ?? standard[0]
        ?? releases.find((r) => r.edition_type === 'standard') ?? releases[0];
      ({ error: failure } = await supabase.from('collection_item').insert({ release_id: target.id, status: 'wanted' }));
    }
    setBusyRelease(null);
    if (failure) return showToast({ text: errorMessage(failure), error: true });
    setVersion((v) => v + 1);
  }

  const total = rows?.[0]?.total_count ?? 0;
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const zoneInfo = CATALOG_ZONES.find((z) => z.value === zoneCode);
  const zoneProgress = progress.find((p) => p.scope === 'zone' && p.code === (zoneCode ?? 'all'));
  const familyProgress = family ? progress.find((p) => p.scope === 'family' && p.code === family) : null;
  const filtered = Boolean(letter || family || origin || year || ownership || query);
  const activeFilters = [letter, family, origin, year, ownership, sort !== 'title' ? sort : null].filter(Boolean).length;
  // Avec le filtre d'origine : combien de jeux de la zone ont une origine connue
  const originRows = progress.filter((p) => p.scope === 'origin');
  const unknownOrigin = originRows.find((p) => p.code === 'unknown')?.total ?? 0;
  const allOrigins = originRows.reduce((n, p) => n + p.total, 0);
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
              <strong>{formatNumber(zoneProgress.owned)}</strong> / {formatNumber(zoneProgress.total)} jeux{zoneInfo ? ` ${zoneInfo.short}` : ''}
              {origin && ` (${ORIGINS.find((o) => o.value === origin)!.adjective})`} dans ta collection
              <span className="muted"> · {formatPercent(zoneProgress.owned, zoneProgress.total)}</span>
            </p>
            <MemoryBar owned={zoneProgress.owned} total={zoneProgress.total} label="Ta progression" />
            {familyProgress && (
              <p className="small muted">{familyOriginLabel(familyProgress.code, origin)} : {formatNumber(familyProgress.owned)} / {formatNumber(familyProgress.total)}</p>
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
        <div className="row catalog-search-row">
          <label className="field catalog-search">
            <span className="field-label">Filtrer</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Titre ou code produit" maxLength={120} autoComplete="off" />
          </label>
          <button type="button" className="button filters-toggle" aria-expanded={filtersOpen} aria-controls="catalog-more-filters"
            onClick={() => setFiltersOpen((v) => !v)}>
            Filtres{activeFilters > 0 && <span className="count-badge">{activeFilters}</span>} <span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span>
          </button>
        </div>
        <div id="catalog-more-filters" className={filtersOpen ? 'more-filters is-open' : 'more-filters'}>
          <div className="row">
            <label className="field">
              <span className="field-label">Genre</span>
              <select value={family ?? ''} onChange={(e) => update({ genre: e.target.value || null })}>
                <option value="">Tous les genres</option>
                {FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Origine du studio</span>
              <select value={originParam(origin) ?? ''} onChange={(e) => update({ origine: e.target.value || null })}>
                <option value="">Toutes</option>
                {ORIGINS.map((o) => (
                  <option key={o.value} value={o.param}>
                    {o.label}{family === 'rpg' ? (o.value === 'japan' ? ' (JRPG)' : ' (RPG occidentaux)') : ''}
                  </option>
                ))}
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
              <span className="field-label">Langue des versions</span>
              <select value={language} onChange={(e) => update({ langue: e.target.value === DEFAULT_LANGUAGE ? null : e.target.value }, { keepPage: true })}
                title="Quand un jeu existe en plusieurs versions nationales (anglaise, française, allemande…), celle-ci s'affiche d'abord ; les autres restent à un clic">
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                <option value={ALL_LANGUAGES}>Toutes les langues</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Tri</span>
              <select value={sort} onChange={(e) => update({ tri: e.target.value === 'title' ? null : e.target.value })}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
      </div>

      <div className="list-row">
        <p className="muted" aria-live="polite">
          {rows === null ? 'Lecture du catalogue…'
            : rows.length === 0 && page > 1 ? `Page ${page} : au-delà de la dernière page`
            : `${formatNumber(total)} jeu${total > 1 ? 'x' : ''}${pages > 1 ? ` · page ${page} sur ${pages}` : ''}`}
          {filtered && (
            <> · <button type="button" className="link-button" onClick={() => { setText(''); setParams(new URLSearchParams([...params].filter(([k]) => k === 'console' || k === 'zone' || k === 'par' || k === 'langue'))); }}>
              effacer les filtres
            </button></>
          )}
        </p>
        <PageSizeSelect value={pageSize} onChange={choosePageSize} />
      </div>

      {origin && unknownOrigin > 0 && (
        <p className="hint">
          Origine connue pour {formatNumber(allOrigins - unknownOrigin)} jeux sur {formatNumber(allOrigins)} : les {formatNumber(unknownOrigin)} autres
          n'apparaissent pas avec ce filtre. Elle se déduit du pays des studios, et se complète au fil des fiches.
        </p>
      )}

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
              language={language}
              canTick={canTick}
              busyRelease={busyRelease}
              onAdd={addOwned}
              onOpen={openItem}
              onToggleWanted={toggleWanted}
            />
          ))}
        </ul>
      )}

      {rows && rows.length > 0 && <Pagination page={page} pages={pages} onChange={goToPage} label="Pages du catalogue" />}

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

// Versions dans l'ordre habituel du site : Japon, Amérique, Europe ; la standard d'abord,
// et parmi les versions nationales, celle dans la langue choisie
function sortReleases(releases: CatalogRelease[], language = ''): CatalogRelease[] {
  const inLanguage = (r: CatalogRelease) => Number(Boolean(r.languages?.includes(language)));
  return [...releases].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone)
    || Number(b.edition_type === 'standard') - Number(a.edition_type === 'standard') || inLanguage(b) - inLanguage(a) || a.id - b.id);
}

interface LineProps {
  row: CatalogRow;
  showZone: boolean;
  language: string;
  canTick: boolean;
  busyRelease: number | null;
  onAdd: (release: CatalogRelease) => void;
  onOpen: (itemId: number) => void;
  onToggleWanted: (row: CatalogRow) => void;
}

function CatalogLine({ row, showZone, language, canTick, busyRelease, onAdd, onOpen, onToggleWanted }: LineProps) {
  const [expanded, setExpanded] = useState(false);
  const releases = sortReleases(row.releases, language);
  const busy = releases.some((r) => r.id === busyRelease);
  // Versions qui se ressemblent (même zone, même édition : FF7 PAL anglais, français,
  // allemand…) : on les distingue par leur langue. Le code produit reste sur la fiche.
  const lookalike = (r: CatalogRelease) => `${r.zone}|${editionLabel(r)}`;
  const groups = new Map<string, CatalogRelease[]>();
  for (const r of releases) groups.set(lookalike(r), [...(groups.get(lookalike(r)) ?? []), r]);
  const counts = new Map([...groups].map(([key, list]) => [key, list.length]));
  // Dans chaque groupe, on garde la version dans la langue choisie (et celles cochées,
  // recherchées ou de langue inconnue) ; s'il n'y en a aucune, tout le groupe reste
  const kept = new Set<number>();
  for (const list of groups.values()) {
    const mine = list.filter((r) => r.owned || r.wanted || !r.languages?.length || r.languages.includes(language));
    for (const r of (list.length === 1 || language === ALL_LANGUAGES || mine.length === 0 ? list : mine)) kept.add(r.id);
  }
  const hidden = releases.length - kept.size;
  const shown = expanded ? releases : releases.filter((r) => kept.has(r.id));
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
          {shown.map((r) => (
            <li key={r.id}>
              <ReleaseChip release={r} showZone={showZone} showLanguage={(counts.get(lookalike(r)) ?? 0) > 1} interactive={canTick} busy={busy}
                onClick={() => (r.owned && r.owned_item ? onOpen(r.owned_item) : onAdd(r))} />
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <button type="button" className="chip-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}
                title={expanded ? 'Replier les versions dans les autres langues' : 'Afficher les versions dans les autres langues'}>
                {expanded ? 'Moins' : `+${hidden} langue${hidden > 1 ? 's' : ''}`}
              </button>
            </li>
          )}
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

function ReleaseChip({ release, showZone, showLanguage, interactive, busy, onClick }: {
  release: CatalogRelease; showZone: boolean; showLanguage: boolean; interactive: boolean; busy: boolean; onClick: () => void;
}) {
  const edition = editionLabel(release);
  const language = showLanguage ? languagesShort(release.languages) : '';
  const className = `release-chip${release.owned ? ' owned' : ''}${release.edition_type === 'reissue' ? ' reissue' : ''}`;
  const content = (
    <>
      <span className="chip-box" aria-hidden="true">{release.owned ? '✓' : ''}</span>
      {showZone && <span className="chip-zone">{release.zone ?? '?'}</span>}
      <span>{edition}</span>
      {language && <span className="chip-language">{language}</span>}
      {release.copies > 1 && <span className="chip-copies">×{release.copies}</span>}
    </>
  );
  // Au survol : la langue en toutes lettres et le code produit
  const details = [languagesLong(release.languages), release.product_code].filter(Boolean).join(' · ');
  if (!interactive) return <span className={className} title={details || undefined}>{content}</span>;
  const description = [edition, languagesLong(release.languages)].filter(Boolean).join(', ');
  return (
    <button type="button" className={className} disabled={busy} aria-pressed={release.owned}
      aria-label={release.owned ? `${description} : dans ta collection, modifier l'exemplaire` : `${description} : je l'ai, ajouter à ma collection`}
      title={`${release.owned ? 'Dans ta collection : cliquer pour préciser ou modifier' : "Je l'ai : cliquer pour l'ajouter à ma collection"}${details ? ` (${details})` : ''}`}
      onClick={onClick}>
      {content}
    </button>
  );
}
