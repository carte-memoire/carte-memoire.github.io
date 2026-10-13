import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import {
  CATALOG_ZONES, conditionLabel, editionLabel, formatNumber, formatPercent, gamePath, languagesLong, languagesShort, searchKey, tradeStatusLabel,
} from '../lib/format';
import type { EditionType, ItemCondition, ItemStatus, ProgressRow, TradeStatus, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Cover } from '../components/Cover';
import { MemoryBar } from '../components/MemoryBar';
import { PageSizeSelect, Pagination } from '../components/Pagination';

interface PublicProfile {
  username: string;
  avatar: string | null;
  member_since: string;
  is_public: boolean;
  is_me: boolean;
  owned_games: number | null;
  owned_copies: number | null;
  complete_copies: number | null;
  sealed_copies: number | null;
  wanted_games: number | null;
  offered: number | null;
}

interface PublicItem {
  status: ItemStatus;
  release_id: number;
  game_id: number;
  game_title: string;
  local_title: string;
  zone: Zone | null;
  edition_type: EditionType;
  edition_name: string | null;
  languages: string[];
  platform: string;
  cover_path: string | null;
  release_date: string | null;
  condition: ItemCondition | null;
  has_box: boolean | null;
  has_manual: boolean | null;
  has_media: boolean | null;
  has_spine_card: boolean | null;
  trade_status: TradeStatus | null;
}

type Tab = 'owned' | 'wanted' | 'offered';
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// La page publique d'une collection, à partager : chiffres, progression par région,
// jaquettes, jeux recherchés et à échanger. Jamais les prix, lieux, dates ni notes.
export function MemberPage() {
  const { pseudo = '' } = useParams();
  const { session, refresh } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [items, setItems] = useState<PublicItem[]>([]);
  const [totals, setTotals] = useState<ProgressRow[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('owned');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const [shared, setShared] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc('public_profile', { member: pseudo }),
      supabase.rpc('public_collection', { member: pseudo }),
      supabase.rpc('collection_progress', { platform_code: 'PS1', zone_code: null }),
    ]).then(([p, c, t]) => {
      if (!active) return;
      setError(p.error ? errorMessage(p.error) : c.error ? errorMessage(c.error) : '');
      setProfile(((p.data as PublicProfile[] | null) ?? [])[0] ?? null);
      setItems((c.data as PublicItem[] | null) ?? []);
      setTotals((t.data as ProgressRow[] | null) ?? []);
    });
    return () => { active = false; };
  }, [pseudo, version, session?.user.id]);

  // Exemplaires regroupés par version (trois FF7 PAL = une tuile ×3)
  const groups = useMemo(() => {
    const key = searchKey(query);
    const map = new Map<string, { item: PublicItem; count: number }>();
    for (const i of items) {
      if (tab === 'owned' && i.status !== 'owned') continue;
      if (tab === 'wanted' && i.status !== 'wanted') continue;
      if (tab === 'offered' && !(i.status === 'owned' && i.trade_status)) continue;
      if (zone && i.zone !== zone) continue;
      if (key && ![i.local_title, i.game_title].some((t) => searchKey(t).includes(key))) continue;
      const k = `${i.release_id}|${i.condition}|${i.trade_status}`;
      const g = map.get(k);
      if (g) g.count += 1;
      else map.set(k, { item: i, count: 1 });
    }
    return [...map.values()];
  }, [items, tab, zone, query]);

  if (profile === undefined) return <p className="loading">Lecture de la carte mémoire…</p>;
  if (profile === null) {
    return (
      <section className="panel narrow">
        <h1>Membre introuvable</h1>
        {error ? <p className="error">{error}</p> : <p>Aucun membre ne s'appelle « {pseudo} ».</p>}
        <Link to="/">Retour à l'accueil</Link>
      </section>
    );
  }

  const visible = profile.is_public || profile.is_me;
  const url = `${window.location.origin}/membre/${encodeURIComponent(profile.username)}`;
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(groups.length / pageSize));
  const current = Math.min(page, pages);
  const shown = pageSize === 0 ? groups : groups.slice((current - 1) * pageSize, current * pageSize);
  const ownedPs1 = (z: Zone) => new Set(items.filter((i) => i.status === 'owned' && i.platform === 'PS1' && i.zone === z).map((i) => i.game_id)).size;

  async function share() {
    const title = `La collection de ${profile!.username} · Carte Mémoire`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch { /* partage annulé : on propose de copier le lien */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared('Lien copié : colle-le où tu veux (message, forum, réseau social).');
    } catch {
      setShared(`Copie ce lien : ${url}`);
    }
  }

  async function makePublic() {
    const { error } = await supabase.from('profile').update({ public_collection: true }).eq('id', session!.user.id);
    if (error) return setError(errorMessage(error));
    await refresh();
    setVersion((v) => v + 1);
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <h1>Collection de {profile.username}</h1>
          <p className="muted">Membre depuis {monthYear.format(new Date(`${profile.member_since}T00:00:00Z`))}</p>
        </div>
        {profile.is_public && (
          <div className="actions">
            <button type="button" className="button button-primary" onClick={share}>Partager cette collection</button>
          </div>
        )}
      </div>
      {shared && <p className="success" role="status">{shared}</p>}
      {error && <p className="error">{error}</p>}

      {profile.is_me && !profile.is_public && (
        <div className="warning">
          <p>Ta collection est privée : personne d'autre ne voit cette page. Rends-la publique pour la partager (les prix, lieux et dates d'achat, et tes notes restent toujours privés).</p>
          <button type="button" className="button button-small" onClick={makePublic}>Rendre ma collection publique</button>
        </div>
      )}
      {profile.is_me && profile.is_public && (
        <p className="notice">C'est ta page publique, telle que les autres la voient. Prix, lieux et dates d'achat, et notes n'y figurent jamais. <Link to="/compte">Rendre ma collection privée</Link></p>
      )}

      {!visible ? (
        <div className="panel empty"><p>La collection de {profile.username} est privée.</p></div>
      ) : (
        <>
          <dl className="progress-stats panel">
            <div><dt>Jeux possédés</dt><dd>{formatNumber(profile.owned_games ?? 0)}</dd></div>
            <div><dt>Exemplaires</dt><dd>{formatNumber(profile.owned_copies ?? 0)}</dd></div>
            <div><dt>Complets</dt><dd>{formatNumber(profile.complete_copies ?? 0)}</dd></div>
            <div><dt>Sous blister</dt><dd>{formatNumber(profile.sealed_copies ?? 0)}</dd></div>
            <div><dt>Recherchés</dt><dd>{formatNumber(profile.wanted_games ?? 0)}</dd></div>
            <div><dt>À échanger ou vendre</dt><dd>{formatNumber(profile.offered ?? 0)}</dd></div>
          </dl>

          <div className="panel progress-panel">
            <h2>PlayStation, région par région</h2>
            <ul className="family-list">
              {CATALOG_ZONES.map((z) => {
                const total = totals.find((t) => t.scope === 'zone' && t.code === z.value)?.total ?? 0;
                const owned = ownedPs1(z.value);
                return (
                  <li key={z.value} className="family-row">
                    <span className="family-name">{z.label}</span>
                    <span className="family-count">{formatNumber(owned)} / {formatNumber(total)} · {formatPercent(owned, total)}</span>
                    <MemoryBar size="small" owned={owned} total={total} label={`${z.label} : jeux possédés`} />
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="tabs" role="tablist">
            {([['owned', `Sa collection (${formatNumber(profile.owned_copies ?? 0)})`], ['wanted', `Recherchés (${formatNumber(profile.wanted_games ?? 0)})`], ['offered', `À échanger ou vendre (${formatNumber(profile.offered ?? 0)})`]] as [Tab, string][]).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'tab active' : 'tab'}
                onClick={() => { setTab(value); setPage(1); }}>{label}</button>
            ))}
          </div>

          <div className="panel catalog-filters">
            <div className="row">
              <label className="field catalog-search">
                <span className="field-label">Rechercher</span>
                <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Titre" maxLength={120} autoComplete="off" />
              </label>
              <label className="field">
                <span className="field-label">Zone</span>
                <select value={zone} onChange={(e) => { setZone(e.target.value); setPage(1); }}>
                  <option value="">Toutes</option>
                  {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                </select>
              </label>
            </div>
            <div className="list-row">
              <p className="muted small">{formatNumber(groups.length)} version{groups.length > 1 ? 's' : ''}{pages > 1 ? ` · page ${current} sur ${pages}` : ''}</p>
              <PageSizeSelect value={pageSize} onChange={(n) => { setPageSize(n); setPage(1); }} />
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="panel empty">{tab === 'offered' ? 'Rien à échanger pour le moment.' : 'Aucun jeu ici pour le moment.'}</p>
          ) : (
            <ul className="cover-grid">
              {shown.map(({ item: i, count }) => (
                <li key={`${i.release_id}|${i.condition}|${i.trade_status}`} className="cover-tile">
                  <Link to={`${gamePath({ id: i.game_id, title: i.game_title })}?version=${i.release_id}`} className="cover-tile-link" title={i.local_title}>
                    <Cover images={i.cover_path ? [{ id: 0, type: 'front', path: i.cover_path }] : []} title={i.local_title} size="medium" />
                    <span className="cover-tile-title">{i.local_title}{count > 1 && <span className="chip-copies"> ×{count}</span>}</span>
                  </Link>
                  <span className="cover-tile-meta">
                    {i.zone ?? '?'} · {editionLabel({ ...i, platform: { short_name: i.platform } })}
                    {i.languages.length > 0 && <span title={languagesLong(i.languages)}> · {languagesShort(i.languages)}</span>}
                    {i.status === 'owned' && i.has_box && i.has_manual && i.has_media && <span className="cover-tile-complete"> · Complet</span>}
                  </span>
                  {(i.condition || i.trade_status) && (
                    <span className="cover-tile-badges">
                      {i.condition && <span className={`badge badge-condition badge-${i.condition}`}>{conditionLabel(i.condition)}</span>}
                      {i.trade_status && <span className="badge badge-trade">{tradeStatusLabel(i.trade_status)}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination page={current} pages={pages} onChange={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} label="Pages de la collection" />
        </>
      )}
    </section>
  );
}
