import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { RELEASE_FIELDS } from '../lib/queries';
import { conditionLabel } from '../lib/format';
import { PRICE_CATEGORIES, priceText, type ReleasePrice } from '../lib/prices';
import type { BarcodeMatch, ItemCondition, ItemStatus, Release } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Cover } from './Cover';
import { ReleaseSummary } from './ReleaseSummary';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Le verdict après un scan, sans quitter le scanner : la version reconnue, et en une
// seconde ce qui compte en brocante : tu l'as déjà (combien, dans quel état), tu le
// cherches, ce que les membres l'ont payé, combien le possèdent. Puis l'ajouter, voir
// la fiche, ou scanner le suivant.

interface Copy {
  id: number;
  status: ItemStatus;
  condition: ItemCondition | null;
  has_box: boolean | null;
  has_manual: boolean | null;
  has_media: boolean | null;
}

export function ScanVerdict({ match, onAdd, onOpen, onAgain }: {
  match: BarcodeMatch;
  onAdd: (release: Release) => void;
  onOpen: () => void;
  onAgain: () => void;
}) {
  const { session, needsMfa } = useAuth();
  const userId = session?.user.id ?? null;
  const [release, setRelease] = useState<Release | null>(null);
  const [copies, setCopies] = useState<Copy[] | null>(null);
  const [prices, setPrices] = useState<ReleasePrice[]>([]);
  const [popularity, setPopularity] = useState<{ owners: number; seekers: number } | null>(null);

  useEffect(() => {
    let active = true;
    setRelease(null);
    setCopies(null);
    setPrices([]);
    setPopularity(null);
    supabase.from('release').select(`${RELEASE_FIELDS}, game(id, title, slug)`).eq('id', match.release_id).single()
      .then(({ data }) => { if (active && data) setRelease(data as unknown as Release); });
    supabase.rpc('release_prices', { target_game: match.game_id })
      .then(({ data }) => { if (active) setPrices(((data as ReleasePrice[] | null) ?? []).filter((p) => p.release_id === match.release_id)); });
    supabase.rpc('game_popularity', { target_game: match.game_id })
      .then(({ data }) => {
        const row = ((data as { release_id: number | null; owners: number; seekers: number }[] | null) ?? []).find((p) => p.release_id === match.release_id);
        if (active) setPopularity(row ? { owners: row.owners, seekers: row.seekers } : { owners: 0, seekers: 0 });
      });
    if (userId) {
      supabase.from('collection_item').select('id, status, condition, has_box, has_manual, has_media').eq('profile_id', userId).eq('release_id', match.release_id)
        .then(({ data }) => { if (active) setCopies((data as Copy[] | null) ?? []); });
    } else {
      setCopies([]);
    }
    return () => { active = false; };
  }, [match, userId]);

  const owned = copies?.filter((c) => c.status === 'owned') ?? [];
  const wanted = copies?.some((c) => c.status === 'wanted') ?? false;
  const canAdd = Boolean(session) && !needsMfa;
  const known = prices.filter((p) => p.median !== null)
    .sort((a, b) => PRICE_CATEGORIES.findIndex((c) => c.value === a.category) - PRICE_CATEGORIES.findIndex((c) => c.value === b.category));

  // « Très bon état, complet » pour chaque exemplaire possédé
  const describe = (c: Copy) => [
    conditionLabel(c.condition),
    c.has_box && c.has_manual && c.has_media ? tr('complet') : c.has_media && !c.has_box && !c.has_manual ? tr('disque seul') : '',
  ].filter(Boolean).join(', ');

  return (
    <div className="verdict">
      <div className="verdict-head">
        {release
          ? <Cover images={release.image} title={release.local_title} size="small" platform={release.platform.short_name} />
          : <span className="cover cover-small" aria-hidden="true" />}
        <div>
          <strong>{match.game_title}</strong>
          {release
            ? <ReleaseSummary release={release} showPlatform />
            : <span className="muted small">{match.local_title}</span>}
        </div>
      </div>

      {!userId && (
        <p className="verdict-line">
          {tr('Connecte-toi pour savoir en un coup d’œil si tu l’as déjà.')}
          <small><Link to="/connexion">{tr('Connexion')}</Link> · <Link to="/inscription">{tr('Inscription')}</Link></small>
        </p>
      )}
      {userId && copies === null && <p className="verdict-line muted">{tr('Vérification dans ta collection…')}</p>}
      {userId && copies !== null && owned.length > 0 && (
        <p className="verdict-line is-owned" role="status">
          {tr('✓ Tu l’as déjà')}{owned.length > 1 ? tr(' (×{0})', owned.length) : ''}
          <small>{owned.map(describe).filter(Boolean).join(' · ') || tr('État non renseigné')}</small>
        </p>
      )}
      {userId && copies !== null && owned.length === 0 && wanted && (
        <p className="verdict-line is-wanted" role="status">
          {tr('★ Tu le cherches !')}
          <small>{tr('Il est dans ta liste de recherche : c’est le moment.')}</small>
        </p>
      )}
      {userId && copies !== null && owned.length === 0 && !wanted && (
        <p className="verdict-line" role="status">{tr('Pas encore dans ta collection.')}</p>
      )}
      {userId && owned.length > 0 && wanted && <p className="small muted">{tr('Il est aussi dans ta liste de recherche.')}</p>}

      <ul className="verdict-facts">
        {known.length > 0
          ? known.map((p) => (
            <li key={p.category}>
              {tr('Payé par les membres, {0} : ', PRICE_CATEGORIES.find((c) => c.value === p.category)?.label.toLowerCase())}<strong>{priceText(p)}</strong>
            </li>
          ))
          : <li className="muted">{tr('Pas encore assez de prix notés par les membres pour cette version.')}</li>}
        {popularity && (popularity.owners > 0 || popularity.seekers > 0) && (
          <li className="muted">
            {tr('Possédé par {0} membre{1?s}', popularity.owners, popularity.owners > 1)}
            {popularity.seekers > 0 && tr(' · recherché par {0}', popularity.seekers)}
          </li>
        )}
      </ul>

      <div className="actions">
        {canAdd && release && (
          <button type="button" className="button button-primary" onClick={() => onAdd(release)}>
            <PsSymbol shape="cross" />{' '}
            {wanted && owned.length === 0 ? tr('Je l’ai trouvé : l’ajouter') : owned.length > 0 ? tr('Ajouter un autre exemplaire') : tr('Ajouter à ma collection')}
          </button>
        )}
        <button type="button" className="button" onClick={onOpen}>{tr('Voir la fiche')}</button>
        <button type="button" className="button" onClick={onAgain}><PsSymbol shape="triangle" />{tr(' Scanner un autre jeu')}</button>
      </div>
    </div>
  );
}
