import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
import { DEFAULT_PLATFORM } from '../lib/preferences';
import { usePlatforms } from '../lib/usePlatforms';
import { siteUrl, tr, locale } from '../lib/i18n';
import { MemberSkeleton } from '../components/Skeleton';
import { TrophyStrip } from '../components/TrophyBoard';
import { computeTrophies, type TrophyStats } from '../lib/trophies';
import { usePageTitle } from '../lib/title';
import { Avatar } from '../components/Avatar';
import { SpineFace } from '../components/Spine';
import { CaseViewer, type Pulled } from '../components/CaseViewer';
import { RoomBox, ShelfCabinet } from '../components/ShelfCabinet';
import { ShelfFurniture } from '../components/ShelfFurniture';
import { ALL_CONSOLES, cleanRoom, compareShelfTitles, distribute, startingRoom, type Meuble, type Room } from '../lib/room';
import { coverUrl } from '../lib/supabase';

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
  game_slug: string | null;
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
  item_id?: number;
  product_code?: string | null;
  shelf_position?: number | null;
}

type Tab = 'owned' | 'wanted' | 'offered';
// Ses meubles (les tranches, rangées à sa façon) ou ses jaquettes (l'exposition)
type Look = 'meubles' | 'jaquettes';
const UNPLACED = Number.MAX_SAFE_INTEGER;
const monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

// La page publique d'une collection, à partager : chiffres, progression par région,
// jaquettes, jeux recherchés et à échanger. Jamais les prix, lieux, dates ni notes.
export function MemberPage() {
  const { pseudo = '' } = useParams();
  const { session, refresh } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [items, setItems] = useState<PublicItem[]>([]);
  usePageTitle(profile === null ? tr('Membre introuvable') : profile ? tr('Collection de ') + profile.username : null);
  // Jeux existants par zone, pour chaque console de la collection
  const [totals, setTotals] = useState<[string, ProgressRow[]][]>([]);
  const platforms = usePlatforms();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('owned');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('');
  const [platform, setPlatform] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const [shared, setShared] = useState('');
  // Sa pièce (ses meubles et leur aspect), le jeu sorti d'un meuble, et la présentation choisie
  const [savedRoom, setSavedRoom] = useState<Room | null>(null);
  const [pulled, setPulled] = useState<Pulled | null>(null);
  const [openVitrine, setOpenVitrine] = useState<string | null>(null);
  const [look, setLook] = useState<Look>('meubles');
  const [perRows, setPerRows] = useState<Record<string, number>>({});
  const onPerRow = useCallback((id: string, n: number) => setPerRows((p) => (p[id] === n ? p : { ...p, [id]: n })), []);
  // Ses trophées (vides si la collection est privée)
  const [trophyStats, setTrophyStats] = useState<TrophyStats | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc('trophy_stats', { member: pseudo }).then(({ data, error }) => {
      if (active) setTrophyStats(error ? null : ((data as TrophyStats[] | null) ?? [])[0] ?? null);
    });
    return () => { active = false; };
  }, [pseudo, version, session?.user.id]);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc('public_profile', { member: pseudo }),
      supabase.rpc('public_collection', { member: pseudo }),
    ]).then(async ([p, c]) => {
      if (!active) return;
      setError(p.error ? errorMessage(p.error) : c.error ? errorMessage(c.error) : '');
      const found = ((p.data as PublicProfile[] | null) ?? [])[0] ?? null;
      setProfile(found);
      const list = (c.data as PublicItem[] | null) ?? [];
      setItems(list);
      // Sa pièce : ses meubles, tels qu'il les a réglés (sinon une bibliothèque par console)
      if (found) {
        const { data } = await supabase.from('profile').select('shelf_style').eq('username', found.username).maybeSingle();
        if (active) setSavedRoom(cleanRoom(data?.shelf_style));
      }
      // Une progression par console possédée (la PlayStation si la collection est vide)
      const codes = [...new Set(list.filter((i) => i.status === 'owned').map((i) => i.platform))].sort();
      const progress = await Promise.all((codes.length ? codes : [DEFAULT_PLATFORM]).map((code) =>
        supabase.rpc('collection_progress', { platform_code: code, zone_code: null })
          .then(({ data }) => [code, (data as ProgressRow[] | null) ?? []] as [string, ProgressRow[]])));
      if (active) setTotals(progress);
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
      if (platform && i.platform !== platform) continue;
      if (zone && i.zone !== zone) continue;
      if (key && ![i.local_title, i.game_title].some((t) => searchKey(t).includes(key))) continue;
      const k = `${i.release_id}|${i.condition}|${i.trade_status}`;
      const g = map.get(k);
      if (g) g.count += 1;
      else map.set(k, { item: i, count: 1 });
    }
    return [...map.values()];
  }, [items, tab, platform, zone, query]);

  // Les exemplaires un à un, dans l'ordre de son étagère (sa place, sinon le titre)
  const shelved = useMemo(() => {
    const key = searchKey(query);
    return items.filter((i) => (tab === 'wanted' ? i.status === 'wanted' : i.status === 'owned' && (tab === 'owned' || i.trade_status)))
      .filter((i) => (!platform || i.platform === platform) && (!zone || i.zone === zone)
        && (!key || [i.local_title, i.game_title].some((t) => searchKey(t).includes(key))))
      .sort((a, b) => a.platform.localeCompare(b.platform) || (a.shelf_position ?? UNPLACED) - (b.shelf_position ?? UNPLACED)
        || compareShelfTitles(a.local_title, b.local_title) || Number(a.edition_type !== 'standard') - Number(b.edition_type !== 'standard'));
  }, [items, tab, platform, zone, query]);
  const roomConsoles = useMemo(() => [...new Set(items.map((i) => i.platform))].sort()
    .map((code) => ({ code, name: platforms.find((p) => p.short_name === code)?.name ?? code })), [items, platforms]);
  const room = savedRoom ?? startingRoom(roomConsoles);
  const furnished = useMemo(() => distribute(shelved, (i) => i.platform, room.meubles, (m) => perRows[m.id] ?? 20), [shelved, room.meubles, perRows]);

  if (profile === undefined) return <MemberSkeleton />;
  if (profile === null) {
    return (
      <section className="panel narrow">
        <h1>{tr('Membre introuvable')}</h1>
        {error ? <p className="error">{error}</p> : <p>{tr("Aucun membre ne s'appelle « ")}{pseudo} ».</p>}
        <Link to="/">{tr("Retour à l'accueil")}</Link>
      </section>
    );
  }

  const visible = profile.is_public || profile.is_me;
  const url = siteUrl(`/membre/${encodeURIComponent(profile.username)}`);
  const pages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(groups.length / pageSize));
  const current = Math.min(page, pages);
  const shown = pageSize === 0 ? groups : groups.slice((current - 1) * pageSize, current * pageSize);
  const ownedOn = (code: string, z: Zone) => new Set(items.filter((i) => i.status === 'owned' && i.platform === code && i.zone === z).map((i) => i.game_id)).size;
  const platformName = (code: string) => platforms.find((p) => p.short_name === code)?.name ?? code;
  // Consoles de la collection : au-delà d'une, un filtre et la console sur chaque tuile
  const consoles = [...new Set(items.map((i) => i.platform))].sort();
  const multiPlatform = consoles.length > 1;

  async function share() {
    const title = tr('La collection de {0} · Carte Mémoire', profile!.username);
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch { /* partage annulé : on propose de copier le lien */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(tr('Lien copié : colle-le où tu veux (message, forum, réseau social).'));
    } catch {
      setShared(tr('Copie ce lien : {0}', url));
    }
  }

  // Une tranche de sa pièce : un clic sort le boîtier (d'une vitrine : la porte s'ouvre d'abord)
  function renderSpine(i: PublicItem, meuble?: Meuble) {
    const name = platformName(i.platform);
    const release = { local_title: i.local_title, product_code: i.product_code ?? null, edition_type: i.edition_type, zone: i.zone, platform: { short_name: i.platform } };
    return (
      <li key={i.item_id ?? `${i.release_id}-${i.local_title}`}>
        <button type="button" className={i.status === 'wanted' ? 'shelf-spine is-wanted' : 'shelf-spine'} title={i.local_title}
          aria-label={tr('Sortir « {0} » de l’étagère', i.local_title)}
          onClick={(event) => {
            const from = event.currentTarget.getBoundingClientRect();
            const complete = i.has_box && i.has_manual && i.has_media;
            const pull = () => setPulled({
              from, release, src: i.cover_path ? coverUrl(i.cover_path) : null,
              meta: [name, i.zone ?? '?', i.edition_type !== 'standard' || i.edition_name ? editionLabel({ ...i, platform: { short_name: i.platform } }) : null,
                i.status === 'wanted' ? tr('Recherché') : complete ? tr('Complet') : null].filter(Boolean).join(' · '),
              gameHref: `${gamePath({ id: i.game_id, title: i.game_title, slug: i.game_slug })}?version=${i.release_id}`,
            });
            if (meuble?.style.furniture !== 'vitrine') return pull();
            setOpenVitrine(meuble.id);
            if (document.documentElement.classList.contains('motion')) setTimeout(pull, 700);
            else pull();
          }}>
          <SpineFace release={release} />
        </button>
      </li>
    );
  }

  async function makePublic() {
    const { error } = await supabase.from('profile').update({ public_collection: true }).eq('id', session!.user.id);
    if (error) return setError(errorMessage(error));
    await refresh();
    setVersion((v) => v + 1);
  }

  return (
    <section className="stack page-wide">
      <div className="page-head">
        <div className="member-title">
          <Avatar username={profile.username} path={profile.avatar} size="large" />
          <div>
            <h1>{tr('Collection de ')}{profile.username}</h1>
            <p className="muted">{tr('Membre depuis ')}{monthYear.format(new Date(`${profile.member_since}T00:00:00Z`))}</p>
          </div>
        </div>
        {profile.is_public && (
          <div className="actions">
            <button type="button" className="button button-primary" onClick={share}>{tr('Partager cette collection')}</button>
          </div>
        )}
      </div>
      {shared && <p className="success" role="status">{shared}</p>}
      {error && <p className="error">{error}</p>}

      {profile.is_me && !profile.is_public && (
        <div className="warning">
          <p>{tr("Ta collection est privée : personne d'autre ne voit cette page. Rends-la publique pour la partager (les prix, lieux et dates d'achat, et tes notes restent toujours privés).")}</p>
          <button type="button" className="button button-small" onClick={makePublic}>{tr('Rendre ma collection publique')}</button>
        </div>
      )}
      {profile.is_me && profile.is_public && (
        <p className="notice">{tr("C'est ta page publique, telle que les autres la voient. Prix, lieux et dates d'achat, et notes n'y figurent jamais. ")}<Link to="/compte">{tr('Rendre ma collection privée')}</Link></p>
      )}

      {!visible ? (
        <div className="panel empty"><p>{tr('La collection de ')}{profile.username}{tr(' est privée.')}</p></div>
      ) : (
        <>
          <dl className="progress-stats panel">
            <div><dt>{tr('Jeux possédés')}</dt><dd>{formatNumber(profile.owned_games ?? 0)}</dd></div>
            <div><dt>{tr('Exemplaires')}</dt><dd>{formatNumber(profile.owned_copies ?? 0)}</dd></div>
            <div><dt>{tr('Complets')}</dt><dd>{formatNumber(profile.complete_copies ?? 0)}</dd></div>
            <div><dt>{tr('Sous blister')}</dt><dd>{formatNumber(profile.sealed_copies ?? 0)}</dd></div>
            <div><dt>{tr('Recherchés')}</dt><dd>{formatNumber(profile.wanted_games ?? 0)}</dd></div>
            <div><dt>{tr('À échanger ou vendre')}</dt><dd>{formatNumber(profile.offered ?? 0)}</dd></div>
          </dl>

          {trophyStats && <TrophyStrip trophies={computeTrophies(trophyStats)} />}

          {totals.map(([code, rows]) => (
            <div key={code} className="panel progress-panel">
              <h2>{tr('{0}, région par région', platformName(code))}</h2>
              <ul className="family-list">
                {CATALOG_ZONES.map((z) => {
                  const total = rows.find((t) => t.scope === 'zone' && t.code === z.value)?.total ?? 0;
                  const owned = ownedOn(code, z.value);
                  return (
                    <li key={z.value} className="family-row">
                      <span className="family-name">{z.label}</span>
                      <span className="family-count">{formatNumber(owned)} / {formatNumber(total)} · {formatPercent(owned, total)}</span>
                      <MemoryBar size="small" owned={owned} total={total} label={tr('{0} : jeux possédés', z.label)} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="tabs" role="tablist">
            {([['owned', tr('Sa collection ({0})', formatNumber(profile.owned_copies ?? 0))], ['wanted', tr('Recherchés ({0})', formatNumber(profile.wanted_games ?? 0))], ['offered', tr('À échanger ou vendre ({0})', formatNumber(profile.offered ?? 0))]] as [Tab, string][]).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'tab active' : 'tab'}
                onClick={() => { setTab(value); setPage(1); }}>{label}</button>
            ))}
          </div>

          <div className="panel catalog-filters">
            <div className="row">
              <label className="field catalog-search">
                <span className="field-label">{tr('Rechercher')}</span>
                <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder={tr('Titre')} maxLength={120} autoComplete="off" />
              </label>
              {multiPlatform && (
                <label className="field">
                  <span className="field-label">{tr('Console')}</span>
                  <select value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }}>
                    <option value="">{tr('Toutes')}</option>
                    {consoles.map((code) => <option key={code} value={code}>{platformName(code)}</option>)}
                  </select>
                </label>
              )}
              <label className="field">
                <span className="field-label">{tr('Zone')}</span>
                <select value={zone} onChange={(e) => { setZone(e.target.value); setPage(1); }}>
                  <option value="">{tr('Toutes')}</option>
                  {CATALOG_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                </select>
              </label>
            </div>
            <div className="list-row">
              <p className="muted small">{formatNumber(groups.length)}{tr(' version{0?s}', groups.length > 1)}{pages > 1 ? tr(' · page {0} sur {1}', current, pages) : ''}</p>
              <PageSizeSelect value={pageSize} onChange={(n) => { setPageSize(n); setPage(1); }} />
            </div>
          </div>

          {groups.length > 0 && (
            <div className="view-switch member-look" role="group" aria-label={tr('Présentation de la collection')}>
              {([['meubles', tr('Ses meubles')], ['jaquettes', tr('Ses jaquettes')]] as [Look, string][]).map(([value, label]) => (
                <button key={value} type="button" className={look === value ? 'zone-option view-option active' : 'zone-option view-option'} aria-pressed={look === value}
                  onClick={() => setLook(value)}>{label}</button>
              ))}
            </div>
          )}

          {groups.length === 0 ? (
            <p className="panel empty">{tab === 'offered' ? tr('Rien à échanger pour le moment.') : tr('Aucun jeu ici pour le moment.')}</p>
          ) : look === 'meubles' ? (
            // Sa pièce : ses meubles, rangés et décorés à sa façon
            <div className="room">
              {furnished.placed.filter(({ levels }) => levels.some((l) => l.length > 0)).map(({ meuble, levels }) => {
                const inside = levels.flat();
                const count = inside.length;
                return (
                  <Fragment key={meuble.id}>
                    <ShelfCabinet meuble={meuble} levels={levels} renderItem={renderSpine} onPerRow={onPerRow} open={openVitrine === meuble.id}
                      consoles={[...new Set([...(meuble.content === ALL_CONSOLES ? [] : [meuble.content]), ...inside.map((i) => i.platform)])]}
                      title={<h2 className="shelf-name">{meuble.name || platformName(meuble.content)}<span className="shelf-count">{formatNumber(count)}</span></h2>} />
                    {furnished.boxes.filter((b) => b.after === meuble.id).map((b) => (
                      <RoomBox key={`carton-${b.console}`} label={tr('{0} jeu{1?x} {2} pas encore rangé{3?s}.', formatNumber(b.items.length), b.items.length > 1, platformName(b.console), b.items.length > 1)}>
                        {b.items.map((i) => renderSpine(i))}
                      </RoomBox>
                    ))}
                  </Fragment>
                );
              })}
              {furnished.boxes.filter((b) => b.after === null).map((b) => (
                <RoomBox key={`carton-${b.console}`} label={tr('{0} jeu{1?x} {2} pas encore rangé{3?s}.', formatNumber(b.items.length), b.items.length > 1, platformName(b.console), b.items.length > 1)}>
                  {b.items.map((i) => renderSpine(i))}
                </RoomBox>
              ))}
            </div>
          ) : (
            <ShelfFurniture style={room.exposition} lines=".cover-tile .cover" refresh={shown.length} title={<h2 className="shelf-name">{tr('Collection de ')}{profile.username}</h2>}>
            <ul className="cover-grid">
              {shown.map(({ item: i, count }) => (
                <li key={`${i.release_id}|${i.condition}|${i.trade_status}`} className="cover-tile">
                  <Link to={`${gamePath({ id: i.game_id, title: i.game_title, slug: i.game_slug })}?version=${i.release_id}`} className="cover-tile-link" title={i.local_title}>
                    <Cover images={i.cover_path ? [{ id: 0, type: 'front', path: i.cover_path }] : []} title={i.local_title} size="medium" platform={i.platform} />
                    <span className="cover-tile-title">{i.local_title}{count > 1 && <span className="chip-copies"> ×{count}</span>}</span>
                  </Link>
                  <span className="cover-tile-meta">
                    {multiPlatform && `${i.platform} · `}{i.zone ?? '?'} · {editionLabel({ ...i, platform: { short_name: i.platform } })}
                    {i.languages.length > 0 && <span title={languagesLong(i.languages)}> · {languagesShort(i.languages)}</span>}
                    {i.status === 'owned' && i.has_box && i.has_manual && i.has_media && <span className="cover-tile-complete">{tr(' · Complet')}</span>}
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
            </ShelfFurniture>
          )}
          {look === 'jaquettes' && <Pagination page={current} pages={pages} onChange={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} label={tr('Pages de la collection')} />}
          {pulled && <CaseViewer pulled={pulled} onClose={() => { setPulled(null); setOpenVitrine(null); }} />}
        </>
      )}
    </section>
  );
}
