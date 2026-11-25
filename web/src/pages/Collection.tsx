import { Fragment, lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { coverUrl, supabase } from '../lib/supabase';
import { COLLECTION_FIELDS } from '../lib/queries';
import { standInFor, type CoverSource, type StandIn } from '../lib/images';
import {
  acquisitionLabel, CATALOG_ZONES, CONDITIONS, conditionLabel, editionClass, editionLabel, formatNumber, formatPrice, gamePath, languagesLong, languagesShort, searchKey, TRADE_STATUSES, tradeStatusLabel, zoneLabel, boxRegionName,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import { downloadCsv, toCsv } from '../lib/csv';
import { EXPORT_HEADERS, itemToRow } from '../lib/collectionCsv';
import {
  pageSizeFrom, pageSizeParam, rememberCollectionView, rememberedCollectionView, rememberedPageSize, rememberPageSize, type CollectionView,
} from '../lib/preferences';
import { useRoom } from '../lib/useRoom';
import { addMeuble, ALL_CONSOLES, compareShelfTitles, AUTO, distribute, duplicateMeuble, LEVEL_CHOICES, moveMeuble, removeMeuble, styleEverywhere, updateMeuble, type Meuble } from '../lib/room';
import { useShelfDrag } from '../lib/useShelfDrag';
import type { CollectionItem, ItemStatus } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection, savedText, type SavedItem } from '../components/AddToCollection';
import { CollectionImport } from '../components/CollectionImport';
import { CollectionProgress } from '../components/CollectionProgress';
import { ProgressStrip } from '../components/ProgressStrip';
import { Cover, tilt, untilt } from '../components/Cover';
import { travel, type Voyage } from '../lib/voyage';
import { SpineFace } from '../components/Spine';
import { CaseViewer, type Pulled } from '../components/CaseViewer';
import { COLLECTION_VIEWS } from '../components/CollectionViews';
import { MeubleEditor, ShelfStyleButton, ShelfStylePanel } from '../components/ShelfStyle';
import { RoomBox, ShelfCabinet } from '../components/ShelfCabinet';
import { ShelfFurniture } from '../components/ShelfFurniture';
import { PageSizeSelect, Pagination } from '../components/Pagination';
import { CollectionSkeleton } from '../components/Skeleton';
import { TrophyIcon } from '../components/TrophyIcon';
import { formatEuros } from '../lib/prices';
import { useToast } from '../components/Toast';
import { notifyCollectionChanged } from '../lib/trophies';
import { usePlatforms } from '../lib/usePlatforms';
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

type Sort = 'recent' | 'title' | 'custom' | 'release' | 'condition' | 'price' | 'purchase';
const SORTS: { value: Sort; label: string; ownedOnly?: boolean }[] = [
  { value: 'recent', label: tr('Ajoutés récemment') },
  { value: 'title', label: tr('Titre (A → Z)') },
  { value: 'custom', label: tr('Mon ordre (rangé à la main)') },
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
// Ponctuation ignorée (« Crash Bandicoot 2: … » avant « Crash Bandicoot: Warped »), numéros
// dans l'ordre (2 avant 10)

// Titre pour le tri, comme sur une étagère : sans article en tête (« The Getaway » à G)
// (une espace après The, Le, La, Les : « Legacy of Kain » reste à L)

// Même titre : la version standard (Black Label) avant la réédition (Platinum)
const editionRank = (item: CollectionItem) => (item.release.edition_type === 'standard' ? 0 : 1);
const conditionRank = (item: CollectionItem) => (item.condition ? CONDITIONS.findIndex((c) => c.value === item.condition) : CONDITIONS.length);
const byTitle = (a: CollectionItem, b: CollectionItem) => compareShelfTitles(a.release.local_title, b.release.local_title)
  || editionRank(a) - editionRank(b);

// Ouverture de la porte d'une vitrine avant que le jeu en sorte (ms, comme styles.css)
const VITRINE_OPENING = 700;
// Jeu pas encore placé à la main (ajouté depuis) : au bout de l'étagère
const UNPLACED = Number.MAX_SAFE_INTEGER;

const COMPARE: Record<Sort, ((a: CollectionItem, b: CollectionItem) => number) | null> = {
  recent: null, // ordre de lecture : du plus récent au plus ancien
  title: byTitle,
  // Mon ordre : la place choisie sur l'étagère de chaque console ; les jeux pas encore placés
  // à la fin, par titre
  custom: (a, b) => a.release.platform.short_name.localeCompare(b.release.platform.short_name)
    || (a.shelf_position ?? UNPLACED) - (b.shelf_position ?? UNPLACED) || byTitle(a, b),
  release: (a, b) => (a.release.game.first_release_date ?? '9999').localeCompare(b.release.game.first_release_date ?? '9999') || byTitle(a, b),
  condition: (a, b) => conditionRank(a) - conditionRank(b) || byTitle(a, b),
  price: (a, b) => (b.purchase_price ?? -1) - (a.purchase_price ?? -1) || byTitle(a, b),
  purchase: (a, b) => (b.purchase_date ?? '').localeCompare(a.purchase_date ?? '') || byTitle(a, b),
};

// Console d'un exemplaire (PS1, PS2…) : chaque console se range à part
const consoleOf = (item: CollectionItem) => item.release.platform.short_name;

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
  // Jeu sorti de l'étagère (CaseViewer) et son exemplaire
  const [pulled, setPulled] = useState<{ view: Pulled; item: CollectionItem } | null>(null);
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
  // Étagère déjà rangée à la main (dans cet onglet) : elle s'affiche dans cet ordre
  const arranged = useMemo(() => items.some((i) => i.status === tab && i.shelf_position !== null), [items, tab]);
  // Tri par défaut : sur l'étagère, l'ordre du collectionneur s'il l'a rangée, sinon par titre
  // (comme une vraie étagère) ; les plus récents ailleurs
  const defaultSort: Sort = view === 'shelf' ? (arranged ? 'custom' : 'title') : 'recent';
  const sort: Sort = SORTS.some((s) => s.value === sortParam && (tab === 'owned' || !s.ownedOnly)) ? sortParam! : defaultSort;
  // Filtres et tri : repliés derrière un bouton, sauf s'ils servent déjà
  const activeFilters = [platform, zone, ...(tab === 'owned' ? [condition, content, offer] : [])].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilters > 0 || sort !== defaultSort);
  // Le meuble dont le réglage est ouvert (son identifiant, ou « exposition »), et le mode
  // « Ranger » (glisser les tranches au doigt, flèches du clavier)
  const [styling, setStyling] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  // La vitrine dont la porte est ouverte : le jeu en sort une fois la porte grande ouverte
  const [openVitrine, setOpenVitrine] = useState<string | null>(null);
  const { drag, ghost, grab, swallowsClick } = useShelfDrag({ arranging, onDrop: arrange });
  // Enregistrements de l'ordre de l'étagère, l'un après l'autre (le dernier l'emporte)
  const savingOrder = useRef(Promise.resolve());
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

  // Le bouton « Personnaliser » posé sur chaque meuble
  const tuneButton = (key: string, label: string) => (
    <ShelfStyleButton label={tr('Personnaliser le meuble « {0} »', label)} open={styling === key} onClick={() => setStyling((s) => (s === key ? null : key))} />
  );

  // Ranger une étagère : `order`, le nouvel ordre des jeux affichés de cette console. Toute
  // l'étagère (cet onglet, cette console) est renumérotée dans l'ordre affiché, les jeux
  // affichés reprenant leurs places dans leur nouvel ordre : avec un filtre ou sur plusieurs
  // pages, les autres ne bougent pas. L'étagère passe en « Mon ordre ».
  function arrange(shelf: string, order: number[]) {
    const compare = COMPARE[sort];
    const all = items.filter((i) => i.status === tab && i.release.platform.short_name === shelf);
    const full = compare ? [...all].sort(compare) : all;
    const moved = new Set(order);
    let next = 0;
    const ids = full.map((i) => (moved.has(i.id) ? order[next++] : i.id));
    const place = new Map(ids.map((id, n) => [id, n + 1]));
    setItems((list) => list.map((i) => (place.has(i.id) ? { ...i, shelf_position: place.get(i.id)! } : i)));
    if (sort !== 'custom') {
      update({ tri: null }, { keepPage: true });
      showToast({ text: tr('Étagère rangée à ta façon : elle garde cet ordre (tri « Mon ordre »).') });
    }
    savingOrder.current = savingOrder.current.then(async () => {
      const { error } = await supabase.rpc('set_shelf_order', { item_ids: ids });
      if (error) {
        showToast({ text: tr('L’ordre de l’étagère n’a pas pu être enregistré : {0}', errorMessage(error)) });
        load();
      }
    });
  }

  // Au clavier, en mode « Ranger » : la tranche choisie avance ou recule d'une place
  function nudge(shelf: string, games: CollectionItem[], id: number, step: number) {
    const order = games.map((g) => g.id);
    const from = order.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(from, 1);
    order.splice(to, 0, id);
    arrange(shelf, order);
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
  const consoles = useMemo(() => [...new Set(items.map((i) => i.release.platform.short_name))]
    .map((code) => ({ code, name: platforms.find((p) => p.short_name === code)?.name ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })), [items, platforms]);
  const multiPlatform = consoles.length > 1;
  const consoleName = (code: string) => (code === ALL_CONSOLES ? tr('Ma collection') : platforms.find((p) => p.short_name === code)?.name ?? code);
  // La pièce du collectionneur : ses meubles (une bibliothèque par console tant qu'il n'a rien réglé)
  const { room, save: saveRoom } = useRoom(consoles);

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
  // Les tranches ne se coupent pas en pages : les meubles montrent toute la collection
  const paged = pageSize !== 0 && view !== 'shelf';
  const pages = paged ? Math.max(1, Math.ceil(shown.length / pageSize)) : 1;
  // Page au-delà de la dernière (exemplaires retirés, filtre plus strict) : la dernière
  const current = Math.min(page, pages);
  const visible = paged ? shown.slice((current - 1) * pageSize, current * pageSize) : shown;

  // Les jeux de chaque console, dans l'ordre de l'étagère (pour les ranger)
  const groups = useMemo(() => {
    const map = new Map<string, CollectionItem[]>();
    for (const item of shown) map.set(consoleOf(item), [...(map.get(consoleOf(item)) ?? []), item]);
    return map;
  }, [shown]);
  // Pendant un glisser : l'ordre provisoire de la console du jeu en main
  const ordered = useMemo(() => {
    if (!drag) return shown;
    const byId = new Map(shown.map((i) => [i.id, i]));
    const queue = drag.order.flatMap((id) => byId.get(id) ?? []);
    let k = 0;
    return shown.map((item) => (consoleOf(item) === drag.shelf && k < queue.length ? queue[k++] : item));
  }, [shown, drag]);
  // Jeux par étage des meubles « auto » : selon la largeur affichée (mesurée par chaque meuble)
  const [perRows, setPerRows] = useState<Record<string, number>>({});
  const onPerRow = useCallback((id: string, n: number) => setPerRows((p) => (p[id] === n ? p : { ...p, [id]: n })), []);
  const layout = useMemo(() => distribute(ordered, consoleOf, room.meubles, (m) => perRows[m.id] ?? 20), [ordered, room.meubles, perRows]);

  function changeMeuble(id: string, changes: Partial<Meuble>) {
    saveRoom(updateMeuble(room, id, changes));
  }
  function addFurniture(content: string, after?: string | null) {
    const next = addMeuble(room, content, content === ALL_CONSOLES ? '' : consoleName(content), after);
    if (!next.id) return;
    saveRoom(next.room);
    setStyling(next.id);
    // Le réglage du nouveau meuble s'ouvre juste au-dessus de lui
    requestAnimationFrame(() => document.querySelector(`[data-meuble="${next.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  // Un étage de plus au meuble (jusqu'à 8 ; au-delà, autant qu'il en faut)
  function addLevel(meuble: Meuble) {
    const next = LEVEL_CHOICES.find((n) => n > meuble.levels);
    changeMeuble(meuble.id, { levels: next ?? AUTO });
  }

  // Une tranche sur son étage : un clic sort le boîtier (d'une vitrine : la porte s'ouvre
  // d'abord), un glisser la change de place
  function renderSpine(item: CollectionItem, meuble?: Meuble) {
    const code = consoleOf(item);
    const games = groups.get(code) ?? [];
    return (
      <li key={item.id} data-shelf-item={item.id} data-shelf-group={code} className={drag?.id === item.id ? 'is-placeholder' : undefined}
        style={{ ['--i' as string]: Math.min(games.indexOf(item), 40) } as CSSProperties}>
        <button type="button" className={item.status === 'wanted' ? 'shelf-spine is-wanted' : 'shelf-spine'} title={item.release.local_title}
          aria-label={arranging ? tr('« {0} » : flèches gauche et droite pour le déplacer', item.release.local_title) : tr('Sortir « {0} » de l’étagère', item.release.local_title)}
          onPointerDown={(event) => grab(event, item.id, code, games.map((g) => g.id))}
          onKeyDown={arranging ? (event) => {
            const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
            if (!step) return;
            event.preventDefault();
            nudge(code, games, item.id, step);
          } : undefined}
          onClick={(event) => {
            // Fin d'un glisser, ou mode « Ranger » : le jeu reste sur l'étagère
            if (swallowsClick() || arranging) return;
            const path = item.release.image.find((i) => i.type === 'front')?.path ?? standInOf(item)?.path;
            const from = event.currentTarget.getBoundingClientRect();
            const pull = () => setPulled({ item, view: {
              from, release: item.release, src: path ? coverUrl(path) : null,
              meta: [consoleName(code), zoneLabel(item.release.zone), notableEdition(item.release) ? editionLabel(item.release) : null, item.status === 'owned' ? contentText(item) : tr('Recherché')].filter(Boolean).join(' · '),
              gameHref: gamePath(item.release.game),
            } });
            if (meuble?.style.furniture !== 'vitrine') return pull();
            setOpenVitrine(meuble.id);
            // La porte s'ouvre (styles.css : .furniture-vitrine.is-open), puis le jeu sort
            if (document.documentElement.classList.contains('motion')) setTimeout(pull, VITRINE_OPENING);
            else pull();
          }}>
          <SpineFace release={item.release} />
        </button>
      </li>
    );
  }

  // Le carton d'une console : ses jeux sans place, et de quoi leur en faire
  function renderBox(box: { console: string; after: string | null; items: CollectionItem[] }) {
    const last = room.meubles.find((m) => m.id === box.after);
    const n = box.items.length;
    return (
      <RoomBox key={`carton-${box.console}`}
        label={tr('{0} jeu{1?x} {2} attend{3?ent} une place dans un meuble.', formatNumber(n), n > 1, consoleName(box.console), n > 1)}
        actions={<>
          {last && last.levels !== AUTO && <button type="button" className="button button-small" onClick={() => addLevel(last)}>{tr('Un étage de plus')}</button>}
          <button type="button" className="button button-small button-primary" onClick={() => addFurniture(box.console, box.after)}>{tr('Ajouter un meuble')}</button>
        </>}>
        {box.items.map((item) => renderSpine(item))}
      </RoomBox>
    );
  }

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
            <span className="label-long">{tr('Cocher dans le catalogue')}</span><span className="label-short">{tr('Catalogue')}</span>
          </Link>
          <button type="button" className="button" onClick={() => setImporting(true)} title={tr('Ajouter des jeux depuis un fichier CSV (Excel, LibreOffice…)')}>
            {tr('Importer')}
          </button>
          <button type="button" className="button" onClick={exportCsv} disabled={items.length === 0} title={tr('Télécharger toute ta collection en CSV (sauvegarde, tableur)')}>
            {tr('Exporter')}
          </button>
          <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}>{tr('Ajouter un jeu')}</button>
        </div>
      </div>

      {/* La carte mémoire en une ligne : le détail est dans l'onglet Statistiques */}
      {loaded && !showStats && owned.length > 0 && (
        <ProgressStrip refresh={items} more={tr('Statistiques')} onOpen={() => update({ onglet: 'statistiques', tri: null })} />
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
                    <select value={sort} onChange={(e) => update({ tri: e.target.value === defaultSort ? null : e.target.value })}>
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
                  {view !== 'shelf' && (pages > 1 || total > FULL_PAGE) && <PageSizeSelect value={pageSize} onChange={choosePageSize} />}
                  {/* Ranger les tranches à la main (à la souris, on peut aussi les glisser à tout moment) */}
                  {view === 'shelf' && (
                    <button type="button" className={arranging ? 'zone-option view-option active' : 'zone-option view-option'} aria-pressed={arranging}
                      title={tr('Ranger tes jeux à la main : fais glisser les tranches où tu veux')} onClick={() => setArranging((v) => !v)}>
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h2v10H2zM9 2h2v11H9zM12 2.5h2V13h-2zM5.2 4.1l1.9-.6 3 9.6-1.9.6zM1 14h14v1H1z" fill="currentColor" /></svg>
                      {arranging ? tr('Terminé') : tr('Ranger')}
                    </button>
                  )}
                  {view !== 'list' && (
                    <button type="button" className={styling ? 'zone-option view-option active' : 'zone-option view-option'} aria-expanded={Boolean(styling)}
                      title={tr('Meuble, bois, couleur, éclairage : chaque étagère à ton goût')}
                      onClick={() => setStyling((s) => (s ? null : view === 'grid' ? 'exposition' : room.meubles[0]?.id ?? null))}>
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 11h14v2H1zM2 13.5h1.5V15H2zM12.5 13.5H14V15h-1.5zM3 3h2v7H3zM6 2h2v8H6zM10.2 2.6l1.9-.4 1.6 7.8-1.9.4z" fill="currentColor" /></svg>
                      {tr('Personnaliser')}
                    </button>
                  )}
                  {/* Chaque collectionneur range sa collection à sa façon (choix retenu sur l'appareil) */}
                  <div className="view-switch" role="group" aria-label={tr('Présentation de la collection')}>
                    {COLLECTION_VIEWS.map((v) => (
                      <button key={v.value} type="button" className={view === v.value ? 'zone-option view-option active' : 'zone-option view-option'}
                        aria-pressed={view === v.value} title={v.hint} onClick={() => chooseView(v.value)}>
                        {v.icon}{v.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {arranging && view === 'shelf' && shown.length > 0 && (
            <p className="notice shelf-arrange-help">
              {tr('Fais glisser les tranches pour ranger ton étagère (au clavier : flèches ← →). Les jeux ajoutés ensuite se placent au bout.')}{' '}
              <button type="button" className="link-button" onClick={() => setArranging(false)}>{tr('Terminé')}</button>
            </p>
          )}

          {loaded && total === 0 && (
            <div className="panel empty">
              <p>{tab === 'owned' ? tr('Aucun jeu pour le moment : ta carte mémoire est vide !') : tr('Aucun jeu dans ta liste de recherche.')}</p>
              <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}>{tr('Ajouter un jeu')}</button>
            </div>
          )}
          {loaded && total > 0 && shown.length === 0 && (
            <p className="panel empty">{tr('Aucun exemplaire ne correspond à ces filtres.')}</p>
          )}

          {!loaded && !error && <CollectionSkeleton />}

          {view === 'shelf' ? (
            // La pièce : les meubles du collectionneur, dans son ordre ; les jeux les remplissent
            // dans l'ordre de l'étagère, ceux sans place attendent dans un carton. Un clic sur une
            // tranche sort le boîtier, un glisser (souris, ou doigt en mode « Ranger ») la change de
            // place, d'un étage ou d'un meuble à l'autre.
            loaded && total > 0 && (
              <div className={`room${arranging ? ' is-arranging' : ''}${drag ? ' is-dragging' : ''}`} data-shelf-room="">
                {layout.placed.filter(({ levels }) => !filtered || levels.some((l) => l.length > 0)).map(({ meuble, levels }) => {
                  const count = levels.reduce((n, l) => n + l.length, 0);
                  const label = meuble.name || consoleName(meuble.content);
                  const inside = levels.flat();
                  const index = room.meubles.findIndex((m) => m.id === meuble.id);
                  return (
                    <Fragment key={meuble.id}>
                      {styling === meuble.id && (
                        <MeubleEditor meuble={meuble} index={index} count={room.meubles.length}
                          consoles={platforms.map((p) => ({ code: p.short_name, name: p.name }))}
                          onChange={(changes) => changeMeuble(meuble.id, changes)}
                          onMove={(step) => saveRoom(moveMeuble(room, meuble.id, step))}
                          onDuplicate={() => { const next = duplicateMeuble(room, meuble.id); saveRoom(next.room); setStyling(next.id); }}
                          onRemove={() => { saveRoom(removeMeuble(room, meuble.id)); setStyling(null); showToast({ text: tr('Meuble retiré : ses jeux passent au meuble suivant de leur console, ou dans un carton.') }); }}
                          onApplyLook={() => { saveRoom(styleEverywhere(room, meuble.style)); showToast({ text: tr('Tous tes meubles ont maintenant cet aspect.') }); }}
                          onClose={() => setStyling(null)} />
                      )}
                      <ShelfCabinet meuble={meuble} levels={levels} renderItem={renderSpine} onPerRow={onPerRow} editing={styling === meuble.id} open={openVitrine === meuble.id}
                        tall={meuble.content === 'PS2' || inside.some((i) => consoleOf(i) === 'PS2')}
                        narrow={meuble.content === 'PS2' || (inside.length > 0 && inside.every((i) => consoleOf(i) === 'PS2'))}
                        title={<h2 className="shelf-name">{label}<span className="shelf-count">{formatNumber(count)}</span></h2>}
                        tune={tuneButton(meuble.id, label)} />
                      {layout.boxes.filter((box) => box.after === meuble.id).map(renderBox)}
                    </Fragment>
                  );
                })}
                {layout.boxes.filter((box) => box.after === null).map(renderBox)}
                {!filtered && room.meubles.length < 24 && (
                  <button type="button" className="room-add" onClick={() => addFurniture(consoles[0]?.code ?? ALL_CONSOLES)}>
                    <span aria-hidden="true">+</span>{tr('Ajouter un meuble')}
                  </button>
                )}
              </div>
            )
          ) : view === 'list' ? (
            <ul className="memory-card">
              {visible.map((item) => (
                <ItemBlock key={item.id} item={item} value={values.get(item.id) ?? null} fresh={item.release.id === justSaved} showPlatform={multiPlatform} standIn={standInOf(item)} onEdit={() => setDialog({ open: true, item })} onPhoto={item.status === 'owned' && !hasOwnCover(item) ? () => setCoverFor(item) : undefined} />
              ))}
            </ul>
          ) : (
            // L'exposition : les jaquettes de face, dans leur propre meuble
            visible.length > 0 && (
              <div className="shelves">
                {styling === 'exposition' && (
                  <ShelfStylePanel name="etagere-exposition" title={tr('Le meuble de l’exposition')} value={room.exposition}
                    onChange={(style) => saveRoom({ ...room, exposition: style })}
                    onApplyAll={() => { saveRoom(styleEverywhere(room, room.exposition)); showToast({ text: tr('Tous tes meubles ont maintenant cet aspect.') }); }}
                    onClose={() => setStyling(null)} />
                )}
                <ShelfFurniture style={room.exposition} lines=".cover-tile .cover" refresh={visible.length}
                  title={<h2 className="shelf-name">{tr('Ma collection')}</h2>} tune={tuneButton('exposition', tr('Exposition'))}>
                  <ul className="cover-grid">
                    {visible.map((item, index) => (
                      <ItemTile key={item.id} index={index} item={item} fresh={item.release.id === justSaved} showPlatform={multiPlatform} standIn={standInOf(item)} onEdit={() => setDialog({ open: true, item })} onPhoto={item.status === 'owned' && !hasOwnCover(item) ? () => setCoverFor(item) : undefined} />
                    ))}
                  </ul>
                </ShelfFurniture>
              </div>
            )
          )}

          {paged && <Pagination page={current} pages={pages} onChange={goToPage} label={tr('Pages de la collection')} />}
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
      {pulled && <CaseViewer pulled={pulled.view} onClose={() => { setPulled(null); setOpenVitrine(null); }} onEdit={() => setDialog({ open: true, item: pulled.item })} />}
      {/* La tranche en main pendant un glisser : elle suit le pointeur (useShelfDrag) */}
      {drag && createPortal(
        <div ref={ghost} className="shelf shelf-ghost" style={{ left: drag.left, top: drag.top, width: drag.width, height: drag.height }} aria-hidden="true">
          {(() => { const item = items.find((i) => i.id === drag.id); return item && <SpineFace release={item.release} />; })()}
        </div>,
        document.body,
      )}
      {toast}
    </section>
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
            {tr('Modifier')}
          </button>
        </div>
      </div>
    </li>
  );
}

// Vue « Exposition » : l'étagère. Les boîtiers posés sur leur tablette se soulèvent et
// penchent vers la souris ; un clic fait voyager la jaquette jusqu'à la fiche du jeu.
function ItemTile({ item, index, fresh, showPlatform, standIn, onEdit, onPhoto }: { item: CollectionItem; index: number; fresh: boolean; showPlatform: boolean; standIn: StandIn | null; onEdit: () => void; onPhoto?: () => void }) {
  const r = item.release;
  const complete = item.has_box && item.has_manual && item.has_media;
  const navigate = useNavigate();
  const coverPath = r.image.find((i) => i.type === 'front')?.path ?? standIn?.path;
  return (
    <li className={fresh ? 'cover-tile just-saved' : 'cover-tile'} style={{ ['--i' as string]: Math.min(index, 16) } as CSSProperties}>
      <Link to={gamePath(r.game)} className="cover-tile-link" title={r.local_title} onPointerMove={tilt} onPointerLeave={untilt}
        onClick={(event) => {
          if (!coverPath) return;
          const voyage: Voyage = { releaseId: r.id, path: coverPath, platform: r.platform.short_name, title: r.local_title };
          travel(event, event.currentTarget.querySelector<HTMLElement>('.cover'), () => navigate(gamePath(r.game), { state: { voyage } }));
        }}>
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
