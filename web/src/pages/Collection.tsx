import { Fragment, lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { COLLECTION_FIELDS } from '../lib/queries';
import { standInFor, type CoverSource, type StandIn } from '../lib/images';
import {
  acquisitionLabel, CATALOG_ZONES, CONDITIONS, conditionLabel, editionClass, editionLabel, formatNumber, formatPercent, formatPrice, gamePath, languagesLong, languagesShort, searchKey, TRADE_STATUSES, tradeStatusLabel, zoneLabel, boxRegionName,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import { downloadCsv, toCsv } from '../lib/csv';
import { EXPORT_HEADERS, itemToRow } from '../lib/collectionCsv';
import {
  ALL_PLATFORMS, ALL_ZONES, pageSizeFrom, pageSizeParam, rememberCollectionView, rememberedPlatform, rememberedCollectionView, rememberedPageSize, rememberPageSize, type CollectionView,
} from '../lib/preferences';
import type { CollectionItem, ItemStatus, ProgressRow, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection, savedText, type SavedItem } from '../components/AddToCollection';
import { CollectionImport } from '../components/CollectionImport';
import { CollectionProgress, initialZone } from '../components/CollectionProgress';
import { MemoryBar } from '../components/MemoryBar';
import { Cover } from '../components/Cover';
import { PageSizeSelect, Pagination } from '../components/Pagination';
import { PsSymbol } from '../components/PsSymbol';
import { CollectionSkeleton } from '../components/Skeleton';
import { TrophyIcon } from '../components/TrophyIcon';
import { formatEuros } from '../lib/prices';
import { useToast } from '../components/Toast';
import { notifyCollectionChanged } from '../lib/trophies';
import { useKnownPlatform, usePlatforms } from '../lib/usePlatforms';
import { tr } from '../lib/i18n';
import { loadOrReload } from '../lib/reload';

// Fenêtre « Proposer une jaquette » : chargée seulement quand on s'en sert
const CoverProposal = lazy(() => loadOrReload(() => import('../components/CoverProposal')).then((m) => ({ default: m.CoverProposal })));

const hasOwnCover = (item: CollectionItem) => item.release.image.some((i) => i.type === 'front');
import { usePageTitle } from '../lib/title';

// L'API renvoie au plus 1 000 lignes par requête : on lit la collection par paquets
const BATCH = 1000;
// Jusqu'à ce nombre d'exemplaires, filtres et tri restent repliés derrière un bouton
const FEW_ITEMS = 30;
// Page par défaut : au-delà, le choix du nombre par page apparaît
const FULL_PAGE = 100;

type Sort = 'recent' | 'title' | 'release' | 'condition' | 'price' | 'purchase';
const SORTS: { value: Sort; label: string; ownedOnly?: boolean }[] = [
  { value: 'recent', label: tr('Ajoutés récemment') },
  { value: 'title', label: tr('Titre (A → Z)') },
  { value: 'release', label: tr('Année de sortie') },
  { value: 'condition', label: tr("État (le meilleur d'abord)"), ownedOnly: true },
  { value: 'price', label: tr("Prix payé (le plus cher d'abord)"), ownedOnly: true },
  { value: 'purchase', label: tr("Date d'achat (la plus récente d'abord)"), ownedOnly: true },
];

type Content = 'complete' | 'incomplete' | 'loose' | 'unknown';
const CONTENTS: { value: Content; label: string }[] = [
  { value: 'complete', label: tr('Complets (boîte, notice, disque)') },
  { value: 'incomplete', label: tr('Incomplets') },
  { value: 'loose', label: tr('Disque seul') },
  { value: 'unknown', label: tr('Contenu non précisé') },
];

const UNKNOWN_CONDITION = 'inconnu';
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const conditionRank = (item: CollectionItem) => (item.condition ? CONDITIONS.findIndex((c) => c.value === item.condition) : CONDITIONS.length);
const byTitle = (a: CollectionItem, b: CollectionItem) => collator.compare(a.release.local_title, b.release.local_title);

const COMPARE: Record<Sort, ((a: CollectionItem, b: CollectionItem) => number) | null> = {
  recent: null, // ordre de lecture : du plus récent au plus ancien
  title: byTitle,
  release: (a, b) => (a.release.game.first_release_date ?? '9999').localeCompare(b.release.game.first_release_date ?? '9999') || byTitle(a, b),
  condition: (a, b) => conditionRank(a) - conditionRank(b) || byTitle(a, b),
  price: (a, b) => (b.purchase_price ?? -1) - (a.purchase_price ?? -1) || byTitle(a, b),
  purchase: (a, b) => (b.purchase_date ?? '').localeCompare(a.purchase_date ?? '') || byTitle(a, b),
};

const noun = (tab: ItemStatus, n: number) =>
  tab === 'owned' ? (n > 1 ? 'exemplaires' : 'exemplaire') : (n > 1 ? tr('jeux recherchés') : tr('jeu recherché'));

function hasContent(item: CollectionItem, content: Content): boolean {
  const parts = [item.has_box, item.has_manual, item.has_media];
  switch (content) {
    case 'complete': return parts.every((p) => p === true);
    case 'incomplete': return parts.some((p) => p === false);
    case 'loose': return item.has_media === true && item.has_box !== true && item.has_manual !== true;
    case 'unknown': return parts.every((p) => p === null);
  }
}

export function Collection() {
  usePageTitle(tr('Ma collection'));
  const { session, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<CollectionItem[]>([]);
  // Versions des jeux dont l'exemplaire n'a pas de jaquette (id du jeu → versions avec recto)
  const [siblings, setSiblings] = useState<Map<number, CoverSource[]>>(new Map());
  const [dialog, setDialog] = useState<{ open: boolean; releaseId?: number | null; item?: CollectionItem | null }>({ open: false });
  // Exemplaire dont on prend la jaquette en photo (fenêtre « Proposer une jaquette »)
  const [coverFor, setCoverFor] = useState<CollectionItem | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const { toast, show: showToast } = useToast();
  // Version tout juste ajoutée ou modifiée : son exemplaire s'illumine dans la liste
  const [justSaved, setJustSaved] = useState<number | null>(null);
  // Valeur estimée de chaque exemplaire : prix médian payé par les membres pour sa version et son état
  const [values, setValues] = useState<Map<number, number>>(new Map());
  const [view, setView] = useState<CollectionView>(rememberedCollectionView);
  const [importing, setImporting] = useState(false);
  // Le champ de recherche garde sa propre valeur : relue depuis l'adresse, elle
  // pourrait revenir en arrière pendant la frappe (l'adresse suit avec un léger décalage)
  const [text, setText] = useState(() => params.get('q') ?? '');

  // Onglet, recherche, filtres et tri : dans l'adresse, pour les retrouver
  // en revenant d'une fiche de jeu. Les jeux d'abord ; les chiffres dans leur propre onglet.
  const tabParam = params.get('onglet');
  const showStats = tabParam === 'statistiques';
  const tab: ItemStatus = tabParam === 'recherches' ? 'wanted' : 'owned';
  const zone = params.get('zone') ?? '';
  // Console (PS1, PS2…) : le filtre n'apparaît que si la collection en mélange plusieurs
  const platform = params.get('console') ?? '';
  const condition = params.get('etat') ?? '';
  const content = (CONTENTS.some((c) => c.value === params.get('contenu')) ? params.get('contenu') : '') as Content | '';
  const offer = params.get('echange') ?? '';
  // « Mes jeux sans jaquette » : les versions possédées qui n'ont pas encore leur propre recto
  const noCover = tab === 'owned' && params.get('jaquette') === 'manquante';
  const sortParam = params.get('tri') as Sort | null;
  const sort: Sort = SORTS.some((s) => s.value === sortParam && (tab === 'owned' || !s.ownedOnly)) ? sortParam! : 'recent';
  // Filtres et tri : repliés derrière un bouton, sauf s'ils servent déjà
  const activeFilters = [platform, zone, ...(tab === 'owned' ? [condition, content, offer] : [])].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilters > 0 || sort !== 'recent');
  // Nombre d'exemplaires par page (0 = tout) et page affichée
  const pageSize = pageSizeFrom(params.get('par')) ?? rememberedPageSize('collection', FULL_PAGE);
  const page = pageSize === 0 ? 1 : Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  // Tout changement de filtre ramène à la première page
  function update(changes: Record<string, string | null>, { keepPage = false } = {}) {
    // On part de l'adresse réelle du navigateur, à jour immédiatement : `params` n'est
    // mis à jour qu'au rendu suivant, et deux changements rapprochés (zone puis tri)
    // partiraient sinon tous deux de l'ancienne adresse, effaçant le premier.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  }

  function choosePageSize(size: number) {
    rememberPageSize('collection', size);
    update({ par: pageSizeParam(size) });
  }

  function goToPage(n: number) {
    update({ page: n > 1 ? String(n) : null }, { keepPage: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function standInOf(item: CollectionItem): StandIn | null {
    const platformId = item.release.platform.id;
    return standInFor(item.release, (siblings.get(item.release.game.id) ?? []).filter((s) => !platformId || s.platform_id === platformId));
  }

  function chooseView(value: CollectionView) {
    rememberCollectionView(value);
    setView(value);
  }

  const load = useCallback(async () => {
    const all: CollectionItem[] = [];
    for (let from = 0; ; from += BATCH) {
      const { data, error } = await supabase
        .from('collection_item')
        .select(COLLECTION_FIELDS)
        .eq('profile_id', session!.user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + BATCH - 1);
      if (error) {
        setError(errorMessage(error));
        break;
      }
      all.push(...(data as unknown as CollectionItem[]));
      if (data.length < BATCH) {
        setError('');
        break;
      }
    }
    setItems(all);
    setLoaded(true);

    const games = [...new Set(all.map((i) => i.release)
      .filter((r) => !r.image.some((im) => im.type === 'front'))
      .map((r) => r.game.id))];
    const found = new Map<number, CoverSource[]>();
    for (let i = 0; i < games.length; i += 200) {
      const { data } = await supabase.from('release')
        .select('id, game_id, platform_id, zone, edition_type, image!inner(id, type, path)')
        .eq('image.type', 'front').in('game_id', games.slice(i, i + 200)).order('id');
      for (const row of (data ?? []) as (CoverSource & { game_id: number })[]) {
        found.set(row.game_id, [...(found.get(row.game_id) ?? []), row]);
      }
    }
    setSiblings(found);
  }, [session]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loaded) return;
    let active = true;
    supabase.rpc('my_collection_prices').then(({ data, error }) => {
      if (active && !error) setValues(new Map(((data as { item_id: number; median: number }[] | null) ?? []).map((r) => [r.item_id, Number(r.median)])));
    });
    return () => { active = false; };
  }, [items, loaded]);

  // Arrivée depuis la fiche d'un jeu : /collection?ajouter=<id de la version>
  const clearAddParam = useEffectEvent(() => update({ ajouter: null }, { keepPage: true }));
  useEffect(() => {
    const releaseId = Number.parseInt(params.get('ajouter') ?? '', 10);
    if (Number.isInteger(releaseId)) {
      setDialog({ open: true, releaseId });
      clearAddParam();
    }
  }, [params]);

  function saved(item: SavedItem) {
    showToast({ text: savedText(item), saved: true });
    setJustSaved(item.releaseId);
    // Le temps de l'animation : en changeant d'onglet, elle ne rejoue pas
    setTimeout(() => setJustSaved((current) => (current === item.releaseId ? null : current)), 2500);
    load();
  }

  // Retiré depuis la fenêtre « Modifier » (qui a déjà demandé confirmation)
  function removed(item: CollectionItem) {
    showToast({ text: item.status === 'owned' ? tr('« {0} » est retiré de ta collection.', item.release.local_title) : tr('« {0} » est retiré de ta liste de recherche.', item.release.local_title) });
    load();
  }

  // Toute la collection (sans tenir compte des filtres) : possédés puis recherchés, par titre
  function exportCsv() {
    const sorted = [...items].sort((a, b) => Number(a.status === 'wanted') - Number(b.status === 'wanted') || byTitle(a, b));
    downloadCsv(tr('carte-memoire-collection-{0}.csv', new Date().toISOString().slice(0, 10)), toCsv([EXPORT_HEADERS, ...sorted.map(itemToRow)]));
  }

  const owned = useMemo(() => items.filter((i) => i.status === 'owned'), [items]);
  const missingCovers = useMemo(() => owned.filter((i) => !hasOwnCover(i)).length, [owned]);
  const wanted = useMemo(() => items.filter((i) => i.status === 'wanted'), [items]);
  // Consoles présentes dans la collection, avec leur nom complet (liste des consoles)
  const platforms = usePlatforms();
  const consoles = [...new Set(items.map((i) => i.release.platform.short_name))]
    .map((code) => ({ code, name: platforms.find((p) => p.short_name === code)?.name ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  const multiPlatform = consoles.length > 1;

  const shown = useMemo(() => {
    const key = searchKey(text);
    const list = (tab === 'owned' ? owned : wanted).filter((item) => {
      const r = item.release;
      if (key && ![r.local_title, r.game.title, r.product_code ?? ''].some((t) => searchKey(t).includes(key))) return false;
      if (platform && r.platform.short_name !== platform) return false;
      if (zone && r.zone !== zone) return false;
      if (tab === 'wanted') return true;
      if (condition && (condition === UNKNOWN_CONDITION ? item.condition !== null : item.condition !== condition)) return false;
      if (content && !hasContent(item, content)) return false;
      if (offer && item.trade_status !== offer) return false;
      if (noCover && hasOwnCover(item)) return false;
      return true;
    });
    const compare = COMPARE[sort];
    return compare ? [...list].sort(compare) : list;
  }, [owned, wanted, tab, text, platform, zone, condition, content, offer, noCover, sort]);

  const total = tab === 'owned' ? owned.length : wanted.length;
  const filtered = Boolean(text || platform || zone || (tab === 'owned' && (condition || content || offer || noCover)));
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(shown.length / pageSize));
  // Page au-delà de la dernière (exemplaires retirés, filtre plus strict) : la dernière
  const current = Math.min(page, pages);
  const visible = pageSize === 0 ? shown : shown.slice((current - 1) * pageSize, current * pageSize);

  // Petite collection : filtres et tri repliés à toutes les largeurs (sur téléphone, toujours)
  const fewItems = total <= FEW_ITEMS;
  const filtersId = 'collection-more-filters';

  return (
    <section className="stack page-wide">
      <div className="page-head">
        <div>
          <h1>{tr('Ma collection')}</h1>
          <p className="muted">
            {profile?.public_collection ? tr('Visible par tout le monde') : tr('Privée (visible par toi seul)')} ·{' '}
            <Link to="/compte">{tr('changer')}</Link>
            {profile && <> · <Link to={`/membre/${encodeURIComponent(profile.username)}`}>{profile.public_collection ? tr('voir et partager ma page publique') : tr('voir ma page publique')}</Link></>}
          </p>
        </div>
        {/* Téléphone : « Ajouter un jeu » sur toute la largeur, les autres en barre d'outils */}
        <div className="actions collection-actions">
          <Link to="/trophees" className="button" title={tr('Tes trophées de collectionneur')}><TrophyIcon tier="gold" className="button-icon" />{tr(' Trophées')}</Link>
          <Link to="/catalogue" className="button" title={tr('Cocher dans le catalogue')}>
            <PsSymbol shape="square" /><span className="label-long">{tr(' Cocher dans le catalogue')}</span><span className="label-short">{tr(' Catalogue')}</span>
          </Link>
          <button type="button" className="button" onClick={() => setImporting(true)} title={tr('Ajouter des jeux depuis un fichier CSV (Excel, LibreOffice…)')}>
            <PsSymbol shape="triangle" />{tr(' Importer')}
          </button>
          <button type="button" className="button" onClick={exportCsv} disabled={items.length === 0} title={tr('Télécharger toute ta collection en CSV (sauvegarde, tableur)')}>
            <PsSymbol shape="circle" />{tr(' Exporter')}
          </button>
          <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}><PsSymbol shape="cross" />{tr(' Ajouter un jeu')}</button>
        </div>
      </div>

      {/* La carte mémoire en une ligne : le détail est dans l'onglet Statistiques */}
      {loaded && !showStats && owned.length > 0 && (
        <ProgressStrip items={items} onOpen={() => update({ onglet: 'statistiques', tri: null })} />
      )}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!showStats && tab === 'owned'} className={!showStats && tab === 'owned' ? 'tab active' : 'tab'}
          onClick={() => update({ onglet: null, tri: null })}>
          {tr('Mes jeux')}<span className="tab-count">{formatNumber(owned.length)}</span>
        </button>
        <button type="button" role="tab" aria-selected={!showStats && tab === 'wanted'} className={!showStats && tab === 'wanted' ? 'tab active' : 'tab'}
          onClick={() => update({ onglet: 'recherches', tri: null })}>
          {tr('Recherchés')}<span className="tab-count">{formatNumber(wanted.length)}</span>
        </button>
        <button type="button" role="tab" aria-selected={showStats} className={showStats ? 'tab active' : 'tab'}
          onClick={() => update({ onglet: 'statistiques', tri: null })}>
          {tr('Statistiques')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {showStats ? (
        loaded ? <CollectionProgress items={items} values={values} /> : !error && <CollectionSkeleton />
      ) : (
        <>
          {tab === 'owned' && missingCovers > 0 && (
            <p className="notice help-covers">
              <PsSymbol shape="circle" colored />{' '}
              {tr('{0} version{1?s} de ta collection n’{2?ont:a} pas encore de jaquette. Prends-la en photo avec ton téléphone : toute la communauté en profite.', formatNumber(missingCovers), missingCovers > 1, missingCovers > 1)}{' '}
              <button type="button" className="link-button" onClick={() => update({ jaquette: noCover ? null : 'manquante' })}>
                {noCover ? tr('Voir tous mes jeux') : tr('Voir lesquelles')}
              </button>
            </p>
          )}

          {total > 0 && (
            <div className={fewItems ? 'panel catalog-filters filters-compact' : 'panel catalog-filters'}>
              <div className="row catalog-search-row">
                <label className="field catalog-search">
                  <span className="field-label">{tr('Rechercher')}</span>
                  <input type="search" value={text} onChange={(e) => { setText(e.target.value); update({ q: e.target.value }); }} placeholder={tr('Titre ou code produit')} maxLength={120} autoComplete="off" />
                </label>
                <button type="button" className="button filters-toggle" aria-expanded={filtersOpen} aria-controls={filtersId}
                  onClick={() => setFiltersOpen((v) => !v)}>
                  {tr('Filtres et tri')}{activeFilters > 0 && <span className="count-badge">{activeFilters}</span>} <span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span>
                </button>
              </div>
              <div id={filtersId} className={filtersOpen ? 'more-filters is-open' : 'more-filters'}>
                <div className="row">
                  {(multiPlatform || platform) && (
                    <label className="field">
                      <span className="field-label">{tr('Console')}</span>
                      <select value={platform} onChange={(e) => update({ console: e.target.value })}>
                        <option value="">{tr('Toutes')}</option>
                        {consoles.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    <span className="field-label">{tr('Zone')}</span>
                    <select value={zone} onChange={(e) => update({ zone: e.target.value })}>
                      <option value="">{tr('Toutes')}</option>
                      {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                    </select>
                  </label>
                  {tab === 'owned' && (
                    <>
                      <label className="field">
                        <span className="field-label">{tr('État')}</span>
                        <select value={condition} onChange={(e) => update({ etat: e.target.value })}>
                          <option value="">{tr('Tous')}</option>
                          {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          <option value={UNKNOWN_CONDITION}>{tr('État non précisé')}</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">{tr('Contenu')}</span>
                        <select value={content} onChange={(e) => update({ contenu: e.target.value })}>
                          <option value="">{tr('Tous')}</option>
                          {CONTENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">{tr('Échange')}</span>
                        <select value={offer} onChange={(e) => update({ echange: e.target.value })}>
                          <option value="">{tr('Tous')}</option>
                          {TRADE_STATUSES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  <label className="field">
                    <span className="field-label">{tr('Tri')}</span>
                    <select value={sort} onChange={(e) => update({ tri: e.target.value === 'recent' ? null : e.target.value })}>
                      {SORTS.filter((s) => tab === 'owned' || !s.ownedOnly).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="list-row">
                <p className="muted small" aria-live="polite">
                  {filtered ? tr('{0} sur {1}', formatNumber(shown.length), formatNumber(total)) : formatNumber(total)} {noun(tab, total)}
                  {pages > 1 && tr(' · page {0} sur {1}', current, pages)}
                  {filtered && (
                    <> · <button type="button" className="link-button" onClick={() => { setText(''); update({ q: null, console: null, zone: null, etat: null, contenu: null, echange: null, jaquette: null }); }}>{tr('effacer les filtres')}</button></>
                  )}
                </p>
                <div className="list-tools">
                  {/* Le nombre par page ne sert que lorsque tout ne tient pas sur une page de 100 */}
                  {(pages > 1 || total > FULL_PAGE) && <PageSizeSelect value={pageSize} onChange={choosePageSize} />}
                  <div className="view-switch" role="group" aria-label={tr('Affichage')}>
                    <button type="button" className={view === 'list' ? 'zone-option active' : 'zone-option'} aria-pressed={view === 'list'} onClick={() => chooseView('list')}>{tr('▤ Liste')}</button>
                    <button type="button" className={view === 'grid' ? 'zone-option active' : 'zone-option'} aria-pressed={view === 'grid'} onClick={() => chooseView('grid')}>{tr('▦ Jaquettes')}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {loaded && total === 0 && (
            <div className="panel empty">
              <p>{tab === 'owned' ? tr('Aucun jeu pour le moment : ta carte mémoire est vide !') : tr('Aucun jeu dans ta liste de recherche.')}</p>
              <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}><PsSymbol shape="cross" />{tr(' Ajouter un jeu')}</button>
            </div>
          )}
          {loaded && total > 0 && shown.length === 0 && (
            <p className="panel empty">{tr('Aucun exemplaire ne correspond à ces filtres.')}</p>
          )}

          {!loaded && !error && <CollectionSkeleton />}

          {view === 'list' ? (
            <ul className="memory-card">
              {visible.map((item) => (
                <ItemBlock key={item.id} item={item} value={values.get(item.id) ?? null} fresh={item.release.id === justSaved} showPlatform={multiPlatform} standIn={standInOf(item)} onEdit={() => setDialog({ open: true, item })} onPhoto={item.status === 'owned' && !hasOwnCover(item) ? () => setCoverFor(item) : undefined} />
              ))}
            </ul>
          ) : (
            <ul className="cover-grid">
              {visible.map((item) => (
                <ItemTile key={item.id} item={item} fresh={item.release.id === justSaved} showPlatform={multiPlatform} standIn={standInOf(item)} onEdit={() => setDialog({ open: true, item })} onPhoto={item.status === 'owned' && !hasOwnCover(item) ? () => setCoverFor(item) : undefined} />
              ))}
            </ul>
          )}

          <Pagination page={current} pages={pages} onChange={goToPage} label={tr('Pages de la collection')} />
        </>
      )}

      <CollectionImport open={importing} onClose={() => setImporting(false)} onImported={() => { notifyCollectionChanged(); load(); }} existing={items} />

      <AddToCollection
        open={dialog.open}
        initialReleaseId={dialog.releaseId}
        editItem={dialog.item}
        onClose={() => setDialog({ open: false })}
        onSaved={saved}
        onRemoved={removed}
      />
      {coverFor && (
        <Suspense fallback={null}>
          <CoverProposal open release={coverFor.release} gameTitle={coverFor.release.game.title} onClose={() => setCoverFor(null)} />
        </Suspense>
      )}
      {toast}
    </section>
  );
}

// Bandeau de progression au-dessus des onglets : la carte mémoire (console et zone retenues
// dans les statistiques) et le compte, un clic mène au détail
function ProgressStrip({ items, onOpen }: { items: CollectionItem[]; onOpen: () => void }) {
  const platform = useKnownPlatform(rememberedPlatform());
  const platformCode = platform === ALL_PLATFORMS ? null : platform;
  const zone = initialZone();
  const zoneCode = zone === ALL_ZONES ? null : (zone as Zone);
  const [main, setMain] = useState<ProgressRow | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc('collection_progress', { platform_code: platformCode, zone_code: zoneCode }).then(({ data }) => {
      if (active) setMain(((data as ProgressRow[] | null) ?? []).find((r) => r.scope === 'zone' && r.code === (zoneCode ?? 'all')) ?? null);
    });
    return () => { active = false; };
  }, [platformCode, zoneCode, items]);

  if (!main || main.total === 0) return null;
  const scope = [platformCode, CATALOG_ZONES.find((z) => z.value === zoneCode)?.short].filter(Boolean).join(' ');
  return (
    <button type="button" className="progress-strip" onClick={onOpen}>
      <MemoryBar size="small" owned={main.owned} total={main.total} label={tr('Jeux possédés')} />
      <span className="progress-strip-text">
        <strong>{formatNumber(main.owned)}</strong> / {formatNumber(main.total)}{tr(' jeux')}{scope && ` ${scope}`}
        <span className="muted"> · {formatPercent(main.owned, main.total)}</span>
      </span>
      <span className="progress-strip-more">{tr('Statistiques')} <span aria-hidden="true">→</span></span>
    </button>
  );
}

// L'édition n'est dite que lorsqu'elle sort de l'ordinaire (Platinum, collector…) :
// « Black Label » ou « Standard » sur presque toutes les cartes n'apprend rien
const notableEdition = (r: CollectionItem['release']) => r.edition_type !== 'standard' || Boolean(r.edition_name);

// « Complet », « Boîte + Disque »… ; rien quand le contenu n'est pas précisé
function contentText(item: CollectionItem): string {
  if (item.has_box && item.has_manual && item.has_media) return tr('Complet');
  return [item.has_box && tr('Boîte'), item.has_manual && tr('Notice'), item.has_media && tr('Disque')].filter(Boolean).join(' + ');
}

// Console, zone et langues en une ligne discrète, séparées par « · »
function ReleaseLine({ release: r, showPlatform }: { release: CollectionItem['release']; showPlatform: boolean }) {
  const parts: ReactNode[] = [];
  if (showPlatform) parts.push(r.platform.short_name);
  parts.push(<span key="zone" title={zoneLabel(r.zone)}>{r.zone ?? '?'}</span>);
  if (r.box_region) parts.push(<span key="box" title={tr('Boîte : {0}', boxRegionName(r.box_region.code))}>{tr('Boîte ')}{r.box_region.code === 'europe' ? 'EU' : r.box_region.code}</span>);
  else if (r.languages.length > 0) parts.push(<span key="lang" title={languagesLong(r.languages)}>{languagesShort(r.languages)}</span>);
  return <>{parts.map((p, i) => <Fragment key={i}>{i > 0 && ' · '}{p}</Fragment>)}</>;
}

// Vue en liste : la jaquette, le titre, puis seulement ce qui distingue cet exemplaire
function ItemBlock({ item, value, fresh, showPlatform, standIn, onEdit, onPhoto }: {
  item: CollectionItem; value: number | null; fresh: boolean; showPlatform: boolean; standIn: StandIn | null; onEdit: () => void; onPhoto?: () => void;
}) {
  const r = item.release;
  const owned = item.status === 'owned';
  const contents = owned ? contentText(item) : '';
  const purchase = owned
    ? [contents && `${contents}${item.has_spine_card ? tr(' + spine card') : ''}`,
      item.acquisition && `${acquisitionLabel(item.acquisition)}${item.purchase_place ? ` (${item.purchase_place})` : ''}`,
      item.purchase_price !== null && formatPrice(item.purchase_price)].filter(Boolean).join(' · ')
    : '';
  const badges = notableEdition(r) || item.condition || item.trade_status;
  return (
    <li className={fresh ? 'block just-saved' : 'block'}>
      <div className="photo-cover">
        <Cover images={r.image} title={r.local_title} size="medium" platform={r.platform.short_name} standIn={standIn} />
        {onPhoto && <PhotoButton onClick={onPhoto} />}
      </div>
      <div className="block-body">
        <Link to={gamePath(r.game)} className="block-title">{r.local_title}</Link>
        <p className="block-meta"><ReleaseLine release={r} showPlatform={showPlatform} /></p>
        {badges && (
          <p className="block-badges">
            {notableEdition(r) && <span className={`badge ${editionClass(r)}`}>{editionLabel(r)}</span>}
            {item.condition && <span className={`badge badge-condition badge-${item.condition}`}>{conditionLabel(item.condition)}</span>}
            {item.trade_status && <span className="badge badge-trade">{tradeStatusLabel(item.trade_status)}</span>}
          </p>
        )}
        {purchase && <p className="block-meta">{purchase}</p>}
        {value !== null && (
          <p className="block-meta" title={tr('Prix médian payé par les membres pour cette version, dans cet état')}>
            {tr('Valeur estimée : ')}<strong className="block-value">{formatEuros(value)}</strong>
          </p>
        )}
        {item.notes && <p className="block-notes">{item.notes}</p>}
        <div className="block-actions">
          <button type="button" className="button button-small" onClick={onEdit} aria-label={tr('Modifier « {0} »', r.local_title)}>
            <PsSymbol shape="triangle" />{tr(' Modifier')}
          </button>
        </div>
      </div>
    </li>
  );
}

// Vue en grille : la jaquette d'abord, comme une étagère
function ItemTile({ item, fresh, showPlatform, standIn, onEdit, onPhoto }: { item: CollectionItem; fresh: boolean; showPlatform: boolean; standIn: StandIn | null; onEdit: () => void; onPhoto?: () => void }) {
  const r = item.release;
  const complete = item.has_box && item.has_manual && item.has_media;
  return (
    <li className={fresh ? 'cover-tile just-saved' : 'cover-tile'}>
      <Link to={gamePath(r.game)} className="cover-tile-link" title={r.local_title}>
        <Cover images={r.image} title={r.local_title} size="medium" platform={r.platform.short_name} standIn={standIn} />
        <span className="cover-tile-title">{r.local_title}</span>
      </Link>
      <span className="cover-tile-meta">
        <ReleaseLine release={r} showPlatform={showPlatform} />
        {notableEdition(r) && ` · ${editionLabel(r)}`}
        {item.status === 'owned' && complete && <span className="cover-tile-complete" title={tr('Complet (boîte, notice, disque)')}>{tr(' · Complet')}</span>}
      </span>
      {(item.condition || item.trade_status) && (
        <span className="cover-tile-badges">
          {item.condition && <span className={`badge badge-condition badge-${item.condition}`}>{conditionLabel(item.condition)}</span>}
          {item.trade_status && <span className="badge badge-trade">{tradeStatusLabel(item.trade_status)}</span>}
        </span>
      )}
      <button type="button" className="link-button small" onClick={onEdit} aria-label={tr('Modifier « {0} »', r.local_title)}>{tr('Modifier')}</button>
      {onPhoto && <PhotoButton onClick={onPhoto} />}
    </li>
  );
}

// Pastille « appareil photo » posée sur la jaquette (coin haut droit) d'un exemplaire dont
// la version n'a pas encore sa propre jaquette (celle affichée est alors provisoire)
function PhotoButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="photo-cover-button" onClick={onClick}
      title={tr('Cette version n’a pas encore sa propre jaquette : prends-la en photo')} aria-label={tr('Prendre la jaquette en photo')}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    </button>
  );
}
