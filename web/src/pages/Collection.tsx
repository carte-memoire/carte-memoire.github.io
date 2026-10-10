import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { COLLECTION_FIELDS } from '../lib/queries';
import {
  acquisitionLabel, CATALOG_ZONES, CONDITIONS, conditionLabel, editionLabel, formatNumber, formatPrice, gamePath,
  searchKey, TRADE_STATUSES, tradeStatusLabel, zoneLabel,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import { rememberCollectionView, rememberedCollectionView, type CollectionView } from '../lib/preferences';
import type { CollectionItem, ItemStatus } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection } from '../components/AddToCollection';
import { CollectionProgress } from '../components/CollectionProgress';
import { useConfirm } from '../components/Confirm';
import { Cover } from '../components/Cover';
import { PsSymbol } from '../components/PsSymbol';

// L'API renvoie au plus 1 000 lignes par requête : on lit la collection par paquets
const BATCH = 1000;

type Sort = 'recent' | 'title' | 'release' | 'condition' | 'price' | 'purchase';
const SORTS: { value: Sort; label: string; ownedOnly?: boolean }[] = [
  { value: 'recent', label: 'Ajoutés récemment' },
  { value: 'title', label: 'Titre (A → Z)' },
  { value: 'release', label: 'Année de sortie' },
  { value: 'condition', label: "État (le meilleur d'abord)", ownedOnly: true },
  { value: 'price', label: "Prix payé (le plus cher d'abord)", ownedOnly: true },
  { value: 'purchase', label: "Date d'achat (la plus récente d'abord)", ownedOnly: true },
];

type Content = 'complete' | 'incomplete' | 'loose' | 'unknown';
const CONTENTS: { value: Content; label: string }[] = [
  { value: 'complete', label: 'Complets (boîte, notice, disque)' },
  { value: 'incomplete', label: 'Incomplets' },
  { value: 'loose', label: 'Disque seul' },
  { value: 'unknown', label: 'Contenu non précisé' },
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
  tab === 'owned' ? (n > 1 ? 'exemplaires' : 'exemplaire') : (n > 1 ? 'jeux recherchés' : 'jeu recherché');

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
  const [dialog, setDialog] = useState<{ open: boolean; releaseId?: number | null; item?: CollectionItem | null }>({ open: false });
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<CollectionView>(rememberedCollectionView);
  // Le champ de recherche garde sa propre valeur : relue depuis l'adresse, elle
  // pourrait revenir en arrière pendant la frappe (l'adresse suit avec un léger décalage)
  const [text, setText] = useState(() => params.get('q') ?? '');

  // Onglet, recherche, filtres et tri : dans l'adresse, pour les retrouver
  // en revenant d'une fiche de jeu
  const tab: ItemStatus = params.get('onglet') === 'recherches' ? 'wanted' : 'owned';
  const zone = params.get('zone') ?? '';
  const condition = params.get('etat') ?? '';
  const content = (CONTENTS.some((c) => c.value === params.get('contenu')) ? params.get('contenu') : '') as Content | '';
  const offer = params.get('echange') ?? '';
  const sortParam = params.get('tri') as Sort | null;
  const sort: Sort = SORTS.some((s) => s.value === sortParam && (tab === 'owned' || !s.ownedOnly)) ? sortParam! : 'recent';

  function update(changes: Record<string, string | null>) {
    // On part de l'adresse réelle du navigateur, à jour immédiatement : `params` n'est
    // mis à jour qu'au rendu suivant, et deux changements rapprochés (zone puis tri)
    // partiraient sinon tous deux de l'ancienne adresse, effaçant le premier.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
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
  }, [session]);

  useEffect(() => { load(); }, [load]);

  // Arrivée depuis la fiche d'un jeu : /collection?ajouter=<id de la version>
  useEffect(() => {
    const releaseId = Number.parseInt(params.get('ajouter') ?? '', 10);
    if (Number.isInteger(releaseId)) {
      setDialog({ open: true, releaseId });
      update({ ajouter: null });
    }
  }, [params]);

  async function remove(item: CollectionItem) {
    if (!(await confirm({ title: 'Retirer de ma collection', message: `Retirer « ${item.release.local_title} » de ta collection ?`, confirmLabel: 'Retirer', danger: true }))) return;
    const { error } = await supabase.from('collection_item').delete().eq('id', item.id);
    if (error) return setError(errorMessage(error));
    await load();
  }

  const owned = items.filter((i) => i.status === 'owned');
  const wanted = items.filter((i) => i.status === 'wanted');

  const shown = useMemo(() => {
    const key = searchKey(text);
    const list = (tab === 'owned' ? owned : wanted).filter((item) => {
      const r = item.release;
      if (key && ![r.local_title, r.game.title, r.product_code ?? ''].some((t) => searchKey(t).includes(key))) return false;
      if (zone && r.zone !== zone) return false;
      if (tab === 'wanted') return true;
      if (condition && (condition === UNKNOWN_CONDITION ? item.condition !== null : item.condition !== condition)) return false;
      if (content && !hasContent(item, content)) return false;
      if (offer && item.trade_status !== offer) return false;
      return true;
    });
    const compare = COMPARE[sort];
    return compare ? [...list].sort(compare) : list;
  }, [items, tab, text, zone, condition, content, offer, sort]);

  const total = tab === 'owned' ? owned.length : wanted.length;
  const filtered = Boolean(text || zone || (tab === 'owned' && (condition || content || offer)));

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <h1>Ma collection</h1>
          <p className="muted">
            {profile?.public_collection ? 'Visible par tout le monde' : 'Privée (visible par toi seul)'} ·{' '}
            <Link to="/compte">changer</Link>
          </p>
        </div>
        <div className="actions">
          <Link to="/catalogue" className="button"><PsSymbol shape="square" /> Cocher dans le catalogue</Link>
          <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}><PsSymbol shape="cross" /> Ajouter un jeu</button>
        </div>
      </div>

      {loaded && <CollectionProgress items={items} />}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'owned'} className={tab === 'owned' ? 'tab active' : 'tab'}
          onClick={() => update({ onglet: null, tri: null })}>
          Mes jeux ({formatNumber(owned.length)})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'wanted'} className={tab === 'wanted' ? 'tab active' : 'tab'}
          onClick={() => update({ onglet: 'recherches', tri: null })}>
          Recherchés ({formatNumber(wanted.length)})
        </button>
      </div>

      {total > 0 && (
        <div className="panel catalog-filters">
          <div className="row">
            <label className="field catalog-search">
              <span className="field-label">Rechercher</span>
              <input type="search" value={text} onChange={(e) => { setText(e.target.value); update({ q: e.target.value }); }} placeholder="Titre ou code produit" maxLength={120} autoComplete="off" />
            </label>
            <label className="field">
              <span className="field-label">Zone</span>
              <select value={zone} onChange={(e) => update({ zone: e.target.value })}>
                <option value="">Toutes</option>
                {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </label>
            {tab === 'owned' && (
              <>
                <label className="field">
                  <span className="field-label">État</span>
                  <select value={condition} onChange={(e) => update({ etat: e.target.value })}>
                    <option value="">Tous</option>
                    {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    <option value={UNKNOWN_CONDITION}>État non précisé</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Contenu</span>
                  <select value={content} onChange={(e) => update({ contenu: e.target.value })}>
                    <option value="">Tous</option>
                    {CONTENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Échange</span>
                  <select value={offer} onChange={(e) => update({ echange: e.target.value })}>
                    <option value="">Tous</option>
                    {TRADE_STATUSES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              </>
            )}
            <label className="field">
              <span className="field-label">Tri</span>
              <select value={sort} onChange={(e) => update({ tri: e.target.value === 'recent' ? null : e.target.value })}>
                {SORTS.filter((s) => tab === 'owned' || !s.ownedOnly).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <div className="list-row">
            <p className="muted small" aria-live="polite">
              {filtered ? `${formatNumber(shown.length)} sur ${formatNumber(total)}` : formatNumber(total)} {noun(tab, total)}
              {filtered && (
                <> · <button type="button" className="link-button" onClick={() => { setText(''); update({ q: null, zone: null, etat: null, contenu: null, echange: null }); }}>effacer les filtres</button></>
              )}
            </p>
            <div className="view-switch" role="group" aria-label="Affichage">
              <button type="button" className={view === 'list' ? 'zone-option active' : 'zone-option'} aria-pressed={view === 'list'} onClick={() => chooseView('list')}>▤ Liste</button>
              <button type="button" className={view === 'grid' ? 'zone-option active' : 'zone-option'} aria-pressed={view === 'grid'} onClick={() => chooseView('grid')}>▦ Jaquettes</button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loaded && total === 0 && (
        <div className="panel empty">
          <p>{tab === 'owned' ? 'Aucun jeu pour le moment : ta carte mémoire est vide !' : 'Aucun jeu dans ta liste de recherche.'}</p>
          <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}><PsSymbol shape="cross" /> Ajouter un jeu</button>
        </div>
      )}
      {loaded && total > 0 && shown.length === 0 && (
        <p className="panel empty">Aucun exemplaire ne correspond à ces filtres.</p>
      )}

      {view === 'list' ? (
        <ul className="memory-card">
          {shown.map((item) => (
            <ItemBlock key={item.id} item={item} onEdit={() => setDialog({ open: true, item })} onRemove={() => remove(item)} />
          ))}
        </ul>
      ) : (
        <ul className="cover-grid">
          {shown.map((item) => (
            <ItemTile key={item.id} item={item} onEdit={() => setDialog({ open: true, item })} />
          ))}
        </ul>
      )}

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
function ItemBlock({ item, onEdit, onRemove }: { item: CollectionItem; onEdit: () => void; onRemove: () => void }) {
  const r = item.release;
  const complete = item.has_box && item.has_manual && item.has_media;
  return (
    <li className="block">
      <Cover images={r.image} title={r.local_title} size="medium" />
      <div className="block-body">
        <Link to={gamePath(r.game)} className="block-title">{r.local_title}</Link>
        <p className="block-badges">
          <span className={`badge badge-zone badge-${(r.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(r.zone)}</span>
          <span className={`badge ${r.edition_type === 'reissue' ? 'badge-platinum' : 'badge-edition'}`}>{editionLabel(r)}</span>
          {item.condition && <span className={`badge badge-condition badge-${item.condition}`}>{conditionLabel(item.condition)}</span>}
          {item.trade_status && <span className="badge badge-trade">{tradeStatusLabel(item.trade_status)}</span>}
        </p>
        {item.status === 'owned' && (
          <p className="block-meta">
            {complete ? 'Complet' : [item.has_box && 'Boîte', item.has_manual && 'Notice', item.has_media && 'Disque'].filter(Boolean).join(' + ') || 'Contenu non précisé'}
            {item.has_spine_card && ' + spine card'}
            {item.acquisition && ` · ${acquisitionLabel(item.acquisition)}`}
            {item.purchase_place && ` (${item.purchase_place})`}
            {item.purchase_price !== null && ` · ${formatPrice(item.purchase_price)}`}
          </p>
        )}
        {item.notes && <p className="block-notes">{item.notes}</p>}
        <div className="block-actions">
          <button type="button" className="button button-small" onClick={onEdit}><PsSymbol shape="triangle" /> Modifier</button>
          <button type="button" className="button button-small button-danger" onClick={onRemove}>Retirer</button>
        </div>
      </div>
    </li>
  );
}

// Vue en grille : la jaquette d'abord, comme une étagère
function ItemTile({ item, onEdit }: { item: CollectionItem; onEdit: () => void }) {
  const r = item.release;
  const complete = item.has_box && item.has_manual && item.has_media;
  return (
    <li className="cover-tile">
      <Link to={gamePath(r.game)} className="cover-tile-link" title={r.local_title}>
        <Cover images={r.image} title={r.local_title} size="medium" />
        <span className="cover-tile-title">{r.local_title}</span>
      </Link>
      <span className="cover-tile-meta">
        {r.zone ?? '?'} · {editionLabel(r)}
        {item.status === 'owned' && complete && <span className="cover-tile-complete" title="Complet (boîte, notice, disque)"> · Complet</span>}
      </span>
      {(item.condition || item.trade_status) && (
        <span className="cover-tile-badges">
          {item.condition && <span className={`badge badge-condition badge-${item.condition}`}>{conditionLabel(item.condition)}</span>}
          {item.trade_status && <span className="badge badge-trade">{tradeStatusLabel(item.trade_status)}</span>}
        </span>
      )}
      <button type="button" className="link-button small" onClick={onEdit}>Modifier</button>
    </li>
  );
}
