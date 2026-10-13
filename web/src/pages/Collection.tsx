import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { COLLECTION_FIELDS } from '../lib/queries';
import { standInFor, type CoverSource, type StandIn } from '../lib/images';
import {
  acquisitionLabel, CATALOG_ZONES, CONDITIONS, conditionLabel, editionLabel, formatNumber, formatPrice, gamePath, languagesLong, languagesShort, searchKey, TRADE_STATUSES, tradeStatusLabel, zoneLabel, boxRegionName,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import { downloadCsv, toCsv } from '../lib/csv';
import { EXPORT_HEADERS, itemToRow } from '../lib/collectionCsv';
import {
  pageSizeFrom, pageSizeParam, rememberCollectionView, rememberedCollectionView, rememberedPageSize, rememberPageSize, type CollectionView,
} from '../lib/preferences';
import type { CollectionItem, ItemStatus } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection } from '../components/AddToCollection';
import { CollectionImport } from '../components/CollectionImport';
import { CollectionProgress } from '../components/CollectionProgress';
import { useConfirm } from '../components/Confirm';
import { Cover } from '../components/Cover';
import { PageSizeSelect, Pagination } from '../components/Pagination';
import { PsSymbol } from '../components/PsSymbol';
import { usePlatforms } from '../lib/usePlatforms';
import { tr } from '../lib/i18n';

// L'API renvoie au plus 1 000 lignes par requête : on lit la collection par paquets
const BATCH = 1000;

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
  const { session, profile } = useAuth();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<CollectionItem[]>([]);
  // Versions des jeux dont l'exemplaire n'a pas de jaquette (id du jeu → versions avec recto)
  const [siblings, setSiblings] = useState<Map<number, CoverSource[]>>(new Map());
  const [dialog, setDialog] = useState<{ open: boolean; releaseId?: number | null; item?: CollectionItem | null }>({ open: false });
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<CollectionView>(rememberedCollectionView);
  const [importing, setImporting] = useState(false);
  // Le champ de recherche garde sa propre valeur : relue depuis l'adresse, elle
  // pourrait revenir en arrière pendant la frappe (l'adresse suit avec un léger décalage)
  const [text, setText] = useState(() => params.get('q') ?? '');

  // Onglet, recherche, filtres et tri : dans l'adresse, pour les retrouver
  // en revenant d'une fiche de jeu
  const tab: ItemStatus = params.get('onglet') === 'recherches' ? 'wanted' : 'owned';
  const zone = params.get('zone') ?? '';
  // Console (PS1, PS2…) : le filtre n'apparaît que si la collection en mélange plusieurs
  const platform = params.get('console') ?? '';
  const condition = params.get('etat') ?? '';
  const content = (CONTENTS.some((c) => c.value === params.get('contenu')) ? params.get('contenu') : '') as Content | '';
  const offer = params.get('echange') ?? '';
  const sortParam = params.get('tri') as Sort | null;
  const sort: Sort = SORTS.some((s) => s.value === sortParam && (tab === 'owned' || !s.ownedOnly)) ? sortParam! : 'recent';
  // Nombre d'exemplaires par page (0 = tout) et page affichée
  const pageSize = pageSizeFrom(params.get('par')) ?? rememberedPageSize('collection', 100);
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

  // Arrivée depuis la fiche d'un jeu : /collection?ajouter=<id de la version>
  useEffect(() => {
    const releaseId = Number.parseInt(params.get('ajouter') ?? '', 10);
    if (Number.isInteger(releaseId)) {
      setDialog({ open: true, releaseId });
      update({ ajouter: null }, { keepPage: true });
    }
  }, [params]);

  async function remove(item: CollectionItem) {
    if (!(await confirm({ title: tr('Retirer de ma collection'), message: tr('Retirer « {0} » de ta collection ?', item.release.local_title), confirmLabel: tr('Retirer'), danger: true }))) return;
    const { error } = await supabase.from('collection_item').delete().eq('id', item.id);
    if (error) return setError(errorMessage(error));
    await load();
  }

  // Toute la collection (sans tenir compte des filtres) : possédés puis recherchés, par titre
  function exportCsv() {
    const sorted = [...items].sort((a, b) => Number(a.status === 'wanted') - Number(b.status === 'wanted') || byTitle(a, b));
    downloadCsv(tr('carte-memoire-collection-{0}.csv', new Date().toISOString().slice(0, 10)), toCsv([EXPORT_HEADERS, ...sorted.map(itemToRow)]));
  }

  const owned = items.filter((i) => i.status === 'owned');
  const wanted = items.filter((i) => i.status === 'wanted');
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
      return true;
    });
    const compare = COMPARE[sort];
    return compare ? [...list].sort(compare) : list;
  }, [items, tab, text, platform, zone, condition, content, offer, sort]);

  const total = tab === 'owned' ? owned.length : wanted.length;
  const filtered = Boolean(text || platform || zone || (tab === 'owned' && (condition || content || offer)));
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(shown.length / pageSize));
  // Page au-delà de la dernière (exemplaires retirés, filtre plus strict) : la dernière
  const current = Math.min(page, pages);
  const visible = pageSize === 0 ? shown : shown.slice((current - 1) * pageSize, current * pageSize);

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <h1>{tr('Ma collection')}</h1>
          <p className="muted">
            {profile?.public_collection ? tr('Visible par tout le monde') : tr('Privée (visible par toi seul)')} ·{' '}
            <Link to="/compte">{tr('changer')}</Link>
            {profile && <> · <Link to={`/membre/${encodeURIComponent(profile.username)}`}>{profile.public_collection ? tr('voir et partager ma page publique') : tr('voir ma page publique')}</Link></>}
          </p>
        </div>
        <div className="actions">
          <Link to="/catalogue" className="button"><PsSymbol shape="square" />{tr(' Cocher dans le catalogue')}</Link>
          <button type="button" className="button" onClick={() => setImporting(true)} title={tr('Ajouter des jeux depuis un fichier CSV (Excel, LibreOffice…)')}>
            <PsSymbol shape="triangle" />{tr(' Importer')}
          </button>
          <button type="button" className="button" onClick={exportCsv} disabled={items.length === 0} title={tr('Télécharger toute ta collection en CSV (sauvegarde, tableur)')}>
            <PsSymbol shape="circle" />{tr(' Exporter')}
          </button>
          <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}><PsSymbol shape="cross" />{tr(' Ajouter un jeu')}</button>
        </div>
      </div>

      {loaded && <CollectionProgress items={items} />}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'owned'} className={tab === 'owned' ? 'tab active' : 'tab'}
          onClick={() => update({ onglet: null, tri: null })}>
          {tr('Mes jeux (')}{formatNumber(owned.length)})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'wanted'} className={tab === 'wanted' ? 'tab active' : 'tab'}
          onClick={() => update({ onglet: 'recherches', tri: null })}>
          {tr('Recherchés (')}{formatNumber(wanted.length)})
        </button>
      </div>

      {total > 0 && (
        <div className="panel catalog-filters">
          <div className="row">
            <label className="field catalog-search">
              <span className="field-label">{tr('Rechercher')}</span>
              <input type="search" value={text} onChange={(e) => { setText(e.target.value); update({ q: e.target.value }); }} placeholder={tr('Titre ou code produit')} maxLength={120} autoComplete="off" />
            </label>
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
          <div className="list-row">
            <p className="muted small" aria-live="polite">
              {filtered ? `${formatNumber(shown.length)} sur ${formatNumber(total)}` : formatNumber(total)} {noun(tab, total)}
              {pages > 1 && tr(' · page {0} sur {1}', current, pages)}
              {filtered && (
                <> · <button type="button" className="link-button" onClick={() => { setText(''); update({ q: null, console: null, zone: null, etat: null, contenu: null, echange: null }); }}>{tr('effacer les filtres')}</button></>
              )}
            </p>
            <div className="list-tools">
              <PageSizeSelect value={pageSize} onChange={choosePageSize} />
              <div className="view-switch" role="group" aria-label={tr('Affichage')}>
                <button type="button" className={view === 'list' ? 'zone-option active' : 'zone-option'} aria-pressed={view === 'list'} onClick={() => chooseView('list')}>{tr('▤ Liste')}</button>
                <button type="button" className={view === 'grid' ? 'zone-option active' : 'zone-option'} aria-pressed={view === 'grid'} onClick={() => chooseView('grid')}>{tr('▦ Jaquettes')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loaded && total === 0 && (
        <div className="panel empty">
          <p>{tab === 'owned' ? tr('Aucun jeu pour le moment : ta carte mémoire est vide !') : tr('Aucun jeu dans ta liste de recherche.')}</p>
          <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}><PsSymbol shape="cross" />{tr(' Ajouter un jeu')}</button>
        </div>
      )}
      {loaded && total > 0 && shown.length === 0 && (
        <p className="panel empty">{tr('Aucun exemplaire ne correspond à ces filtres.')}</p>
      )}

      {view === 'list' ? (
        <ul className="memory-card">
          {visible.map((item) => (
            <ItemBlock key={item.id} item={item} showPlatform={multiPlatform} standIn={standInOf(item)} onEdit={() => setDialog({ open: true, item })} onRemove={() => remove(item)} />
          ))}
        </ul>
      ) : (
        <ul className="cover-grid">
          {visible.map((item) => (
            <ItemTile key={item.id} item={item} showPlatform={multiPlatform} standIn={standInOf(item)} onEdit={() => setDialog({ open: true, item })} />
          ))}
        </ul>
      )}

      <Pagination page={current} pages={pages} onChange={goToPage} label={tr('Pages de la collection')} />

      <CollectionImport open={importing} onClose={() => setImporting(false)} onImported={load} existing={items} />

      <AddToCollection
        open={dialog.open}
        initialReleaseId={dialog.releaseId}
        editItem={dialog.item}
        onClose={() => setDialog({ open: false })}
        onSaved={load}
      />
    </section>
  );
}

// Vue en liste : tous les détails de l'exemplaire
function ItemBlock({ item, showPlatform, standIn, onEdit, onRemove }: { item: CollectionItem; showPlatform: boolean; standIn: StandIn | null; onEdit: () => void; onRemove: () => void }) {
  const r = item.release;
  const complete = item.has_box && item.has_manual && item.has_media;
  return (
    <li className="block">
      <Cover images={r.image} title={r.local_title} size="medium" standIn={standIn} />
      <div className="block-body">
        <Link to={gamePath(r.game)} className="block-title">{r.local_title}</Link>
        <p className="block-badges">
          {showPlatform && <span className="badge badge-console">{r.platform.short_name}</span>}
          <span className={`badge badge-zone badge-${(r.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(r.zone)}</span>
          <span className={`badge ${r.edition_type === 'reissue' ? 'badge-platinum' : 'badge-edition'}`}>{editionLabel(r)}</span>
          {r.box_region
            ? <span className="badge badge-language" title={tr('Boîte : {0}', boxRegionName(r.box_region.code))}>{tr('Boîte ')}{r.box_region.code === 'europe' ? 'EU' : r.box_region.code}</span>
            : r.languages.length > 0 && <span className="badge badge-language" title={languagesLong(r.languages)}>{languagesShort(r.languages)}</span>}
          {item.condition && <span className={`badge badge-condition badge-${item.condition}`}>{conditionLabel(item.condition)}</span>}
          {item.trade_status && <span className="badge badge-trade">{tradeStatusLabel(item.trade_status)}</span>}
        </p>
        {item.status === 'owned' && (
          <p className="block-meta">
            {complete ? tr('Complet') : [item.has_box && tr('Boîte'), item.has_manual && tr('Notice'), item.has_media && tr('Disque')].filter(Boolean).join(' + ') || tr('Contenu non précisé')}
            {item.has_spine_card && tr(' + spine card')}
            {item.acquisition && ` · ${acquisitionLabel(item.acquisition)}`}
            {item.purchase_place && ` (${item.purchase_place})`}
            {item.purchase_price !== null && ` · ${formatPrice(item.purchase_price)}`}
          </p>
        )}
        {item.notes && <p className="block-notes">{item.notes}</p>}
        <div className="block-actions">
          <button type="button" className="button button-small" onClick={onEdit}><PsSymbol shape="triangle" />{tr(' Modifier')}</button>
          <button type="button" className="button button-small button-danger" onClick={onRemove}>{tr('Retirer')}</button>
        </div>
      </div>
    </li>
  );
}

// Vue en grille : la jaquette d'abord, comme une étagère
function ItemTile({ item, showPlatform, standIn, onEdit }: { item: CollectionItem; showPlatform: boolean; standIn: StandIn | null; onEdit: () => void }) {
  const r = item.release;
  const complete = item.has_box && item.has_manual && item.has_media;
  return (
    <li className="cover-tile">
      <Link to={gamePath(r.game)} className="cover-tile-link" title={r.local_title}>
        <Cover images={r.image} title={r.local_title} size="medium" standIn={standIn} />
        <span className="cover-tile-title">{r.local_title}</span>
      </Link>
      <span className="cover-tile-meta">
        {showPlatform && `${r.platform.short_name} · `}{r.zone ?? '?'} · {editionLabel(r)}{r.languages.length > 0 && <span title={languagesLong(r.languages)}> · {languagesShort(r.languages)}</span>}
        {item.status === 'owned' && complete && <span className="cover-tile-complete" title={tr('Complet (boîte, notice, disque)')}>{tr(' · Complet')}</span>}
      </span>
      {(item.condition || item.trade_status) && (
        <span className="cover-tile-badges">
          {item.condition && <span className={`badge badge-condition badge-${item.condition}`}>{conditionLabel(item.condition)}</span>}
          {item.trade_status && <span className="badge badge-trade">{tradeStatusLabel(item.trade_status)}</span>}
        </span>
      )}
      <button type="button" className="link-button small" onClick={onEdit}>{tr('Modifier')}</button>
    </li>
  );
}
