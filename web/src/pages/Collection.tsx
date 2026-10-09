import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { COLLECTION_FIELDS } from '../lib/queries';
import { acquisitionLabel, conditionLabel, editionLabel, formatPrice, gamePath, tradeStatusLabel, zoneLabel } from '../lib/format';
import { errorMessage } from '../lib/errors';
import type { CollectionItem, ItemStatus } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection } from '../components/AddToCollection';
import { CollectionProgress } from '../components/CollectionProgress';
import { useConfirm } from '../components/Confirm';
import { Cover } from '../components/Cover';
import { PsSymbol } from '../components/PsSymbol';

export function Collection() {
  const { session, profile } = useAuth();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [tab, setTab] = useState<ItemStatus>('owned');
  const [dialog, setDialog] = useState<{ open: boolean; releaseId?: number | null; item?: CollectionItem | null }>({ open: false });
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('collection_item')
      .select(COLLECTION_FIELDS)
      .eq('profile_id', session!.user.id)
      .order('created_at', { ascending: false });
    if (error) setError(errorMessage(error));
    setItems((data as unknown as CollectionItem[]) ?? []);
    setLoaded(true);
  }, [session]);

  useEffect(() => { load(); }, [load]);

  // Arrivée depuis la fiche d'un jeu : /collection?ajouter=<id de la version>
  useEffect(() => {
    const releaseId = Number.parseInt(params.get('ajouter') ?? '', 10);
    if (Number.isInteger(releaseId)) {
      setDialog({ open: true, releaseId });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  async function remove(item: CollectionItem) {
    if (!(await confirm({ title: 'Retirer de ma collection', message: `Retirer « ${item.release.local_title} » de ta collection ?`, confirmLabel: 'Retirer', danger: true }))) return;
    const { error } = await supabase.from('collection_item').delete().eq('id', item.id);
    if (error) return setError(errorMessage(error));
    await load();
  }

  const owned = items.filter((i) => i.status === 'owned');
  const wanted = items.filter((i) => i.status === 'wanted');
  const shown = tab === 'owned' ? owned : wanted;

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
        <button type="button" role="tab" aria-selected={tab === 'owned'} className={tab === 'owned' ? 'tab active' : 'tab'} onClick={() => setTab('owned')}>
          Mes jeux ({owned.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'wanted'} className={tab === 'wanted' ? 'tab active' : 'tab'} onClick={() => setTab('wanted')}>
          Recherchés ({wanted.length})
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loaded && shown.length === 0 && (
        <div className="panel empty">
          <p>{tab === 'owned' ? 'Aucun jeu pour le moment : ta carte mémoire est vide !' : 'Aucun jeu dans ta liste de recherche.'}</p>
          <button type="button" className="button button-primary" onClick={() => setDialog({ open: true })}><PsSymbol shape="cross" /> Ajouter un jeu</button>
        </div>
      )}

      <ul className="memory-card">
        {shown.map((item) => {
          const r = item.release;
          const complete = item.has_box && item.has_manual && item.has_media;
          return (
            <li key={item.id} className="block">
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
                  <button type="button" className="button button-small" onClick={() => setDialog({ open: true, item })}><PsSymbol shape="triangle" /> Modifier</button>
                  <button type="button" className="button button-small button-danger" onClick={() => remove(item)}>Retirer</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

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
