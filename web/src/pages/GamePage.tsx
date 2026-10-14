import { Fragment, lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { Dialog } from '../components/Dialog';
import { GAME_FIELDS } from '../lib/queries';
import {
  boxRegionName, countryName, editionClass, editionLabel, familyLabel, formatDate, languagesLong, languagesShort, speaksLanguage, zoneLabel, zoneOrder, genreName, regionName,
} from '../lib/format';
import { rememberedLanguage, rememberedPlatform } from '../lib/preferences';
import { describeSpecs } from '../lib/specs';
import type { Game, ItemStatus, Release } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection, savedText } from '../components/AddToCollection';
import { Cover } from '../components/Cover';
import { PsSymbol } from '../components/PsSymbol';
import { ReportDialog } from '../components/ReportDialog';
import { GameSkeleton } from '../components/Skeleton';
import { PriceSummary } from '../components/PriceSummary';
// Caméra, recadrage, liaison avec le téléphone : chargés seulement à l'ouverture de la fenêtre
const CoverProposal = lazy(() => loadOrReload(() => import('../components/CoverProposal')).then((m) => ({ default: m.CoverProposal })));
import { useReleasePrices } from '../lib/prices';
import { useToast } from '../components/Toast';
import { notifyCollectionChanged } from '../lib/trophies';
import { standInFor } from '../lib/images';
import { formatBarcode, normalizeBarcode } from '../lib/barcode';
import { lang, tr } from '../lib/i18n';
import { loadOrReload } from '../lib/reload';

export function GamePage() {
  const { id, console: consoleName, slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, needsMfa, isModerator } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  // Adresse lisible (ps1/final-fantasy-vii) : le jeu est retrouvé par la base, y compris
  // sous une ancienne adresse (titre corrigé, fiches fusionnées). Ancienne forme : /jeu/36-…
  const address = consoleName && slug ? `${consoleName}/${slug}`.toLowerCase() : null;
  const [found, setFound] = useState<{ address: string; id: number | null } | null>(null);
  // undefined : adresse en cours de recherche ; null ou NaN : aucun jeu
  const gameId = !address ? Number.parseInt(id ?? '', 10)
    : game?.slug === address ? game.id
    : found?.address === address ? found.id : undefined;
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [proposeSummary, setProposeSummary] = useState(false);
  const [reporting, setReporting] = useState(false);
  // Résumé replié sur quelques lignes : les versions, l'essentiel, restent proches
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Pays du studio (champ calculé par la base), lu à part : la fiche s'affiche même sans lui
  const [origin, setOrigin] = useState<string | null>(null);
  // Mes exemplaires des versions de ce jeu (possédés ou recherchés)
  const [mine, setMine] = useState<{ id: number; release_id: number; status: ItemStatus }[]>([]);
  const [mineVersion, setMineVersion] = useState(0);
  const [adding, setAdding] = useState<number | null>(null);
  // Version dont on propose la jaquette (fenêtre ouverte)
  const [coverFor, setCoverFor] = useState<Release | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const { toast, show: showToast } = useToast();
  // Dernière version ajoutée (son badge « dans ta collection » s'anime) et dernière recherchée (son cœur)
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const [justWanted, setJustWanted] = useState<number | null>(null);
  const userId = session?.user.id ?? null;
  const canTick = Boolean(session) && !needsMfa;
  // Arrivée par un scan : ?version=… (la version trouvée) ou ?code=… (code inconnu à associer)
  const [params, setParams] = useSearchParams();
  const focusId = Number.parseInt(params.get('version') ?? '', 10) || null;
  const scanned = normalizeBarcode(params.get('code') ?? '');
  const [barcodes, setBarcodes] = useState<{ barcode: string; release_id: number }[]>([]);
  const [barcodesVersion, setBarcodesVersion] = useState(0);
  const [thanks, setThanks] = useState('');
  // Combien de membres possèdent ou recherchent le jeu (totaux seulement)
  const [popularity, setPopularity] = useState<{ release_id: number | null; owners: number; seekers: number }[]>([]);
  const here = location.pathname + location.search;
  // Prix médian payé par les membres, version par version (relu après un ajout)
  const prices = useReleasePrices(Number.isInteger(gameId) ? gameId! : null, mineVersion);

  useEffect(() => {
    if (!address || game?.slug === address || found?.address === address) return;
    let active = true;
    supabase.rpc('game_id_by_slug', { path: address })
      .then(({ data, error }) => { if (active) setFound({ address, id: error ? null : (data as number | null) }); });
    return () => { active = false; };
  }, [address, game, found]);

  useEffect(() => {
    if (gameId === undefined) return;
    if (gameId === null || !Number.isInteger(gameId)) return setState('missing');
    supabase.from('game').select(GAME_FIELDS).eq('id', gameId).maybeSingle().then(({ data }) => {
      if (!data) return setState('missing');
      setGame(data as unknown as Game);
      setState('ok');
    });
    supabase.from('game').select('origin').eq('id', gameId).maybeSingle()
      .then(({ data }) => setOrigin((data as { origin: string | null } | null)?.origin ?? null));
  }, [gameId]);

  // Adresse à jour dans la barre d'adresse : /jeu/ps1/final-fantasy-vii (sans nouvelle
  // entrée dans l'historique du navigateur ; ?version=… et #… sont gardés)
  useEffect(() => {
    if (!game?.slug || game.id !== gameId) return;
    const canonical = `/jeu/${game.slug}`;
    if (location.pathname !== canonical) {
      navigate(`${canonical}${location.search}${location.hash}`, { replace: true, state: { correctedFrom: location.pathname } });
    }
  }, [game, gameId, location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    const ids = game?.release.map((r) => r.id) ?? [];
    if (!userId || ids.length === 0) return setMine([]);
    let active = true;
    supabase.from('collection_item').select('id, release_id, status').eq('profile_id', userId).in('release_id', ids)
      .then(({ data }) => { if (active) setMine((data as typeof mine | null) ?? []); });
    return () => { active = false; };
  }, [game, userId, mineVersion]);

  // Codes-barres connus des versions (absents tant que la base n'est pas à jour : on s'en passe)
  useEffect(() => {
    const ids = game?.release.map((r) => r.id) ?? [];
    if (ids.length === 0) return;
    let active = true;
    supabase.from('release_barcode').select('barcode, release_id').in('release_id', ids).order('barcode')
      .then(({ data, error }) => { if (active && !error) setBarcodes((data as typeof barcodes | null) ?? []); });
    return () => { active = false; };
  }, [game, barcodesVersion]);

  useEffect(() => {
    if (!game) return;
    let active = true;
    supabase.rpc('game_popularity', { target_game: game.id })
      .then(({ data, error }) => { if (active && !error) setPopularity((data as typeof popularity | null) ?? []); });
    return () => { active = false; };
  }, [game, mineVersion]);

  // Titre de l'onglet : le jeu
  useEffect(() => { if (game) document.title = tr('{0} · Carte Mémoire', game.title); }, [game]);

  // La version scannée : on l'amène à l'écran
  useEffect(() => {
    if (state !== 'ok' || !focusId) return;
    const timer = setTimeout(() => document.getElementById(`version-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
    return () => clearTimeout(timer);
  }, [state, focusId]);

  if (state === 'loading') return <GameSkeleton />;
  if (state === 'missing' || !game) return <section className="panel"><h1>{tr('Jeu introuvable')}</h1><Link to="/"><PsSymbol shape="circle" />{tr(' Retour à la recherche')}</Link></section>;

  // Japon, Amérique, Europe ; dans chaque zone, la standard d'abord, puis la langue choisie dans le catalogue
  const language = rememberedLanguage();
  const releases = [...game.release].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone)
    || Number(b.edition_type === 'standard') - Number(a.edition_type === 'standard')
    || Number(speaksLanguage({ ...b, box_country: b.box_region?.code }, language)) - Number(speaksLanguage({ ...a, box_country: a.box_region?.code }, language)) || a.id - b.id);
  const copies = (r: Release) => mine.filter((m) => m.release_id === r.id && m.status === 'owned').length;
  const wantedItem = (r: Release) => mine.find((m) => m.release_id === r.id && m.status === 'wanted');
  const focused = releases.find((r) => r.id === focusId) ?? null;
  const gameStats = popularity.find((p) => p.release_id === null);
  const statsOf = (r: Release) => popularity.find((p) => p.release_id === r.id);
  const codesOf = (r: Release) => barcodes.filter((b) => b.release_id === r.id).map((b) => b.barcode);
  const pricesOf = (r: Release) => prices.filter((p) => p.release_id === r.id);
  // Un jeu sorti sur plusieurs consoles (PS1 et PS2…) : ses versions console par console,
  // celle choisie dans le catalogue d'abord, puis par date de lancement
  const preferredPlatform = rememberedPlatform();
  const platforms = [...new Map(releases.map((r) => [r.platform.id, r.platform])).values()]
    .sort((a, b) => Number(b.short_name === preferredPlatform) - Number(a.short_name === preferredPlatform)
      || (a.launch_date ?? '').localeCompare(b.launch_date ?? '') || a.id - b.id);
  const byPlatform = platforms.map((p) => ({ platform: p, releases: releases.filter((r) => r.platform.id === p.id) }));
  // Jaquette provisoire : empruntée à une version de la même console seulement (une boîte
  // PS1 n'aide pas à reconnaître la version PS2)
  const samePlatform = (r: Release) => releases.filter((x) => x.platform.id === r.platform.id);
  const heroPool = byPlatform[0]?.releases ?? releases;
  const heroImages = heroPool.find((r) => r.zone === 'PAL' && r.image.length)?.image ?? heroPool.find((r) => r.image.length)?.image
    ?? releases.find((r) => r.image.length)?.image ?? [];
  // Genres (avec leurs familles, cliquables vers le catalogue) et thèmes (sans famille)
  const genres = game.game_genre.map((g) => g.genre).filter((g) => g.families.length > 0);
  const themes = game.game_genre.map((g) => g.genre).filter((g) => g.families.length === 0);
  const families = [...new Set(genres.flatMap((g) => g.families))];

  // Ajout sur place (fenêtre de l'exemplaire), sans quitter la fiche
  function addToCollection(release: Release) {
    if (!session) return navigate(`/connexion?next=${encodeURIComponent(here)}`);
    if (needsMfa) return navigate(`/connexion/verification?next=${encodeURIComponent(here)}`);
    setAdding(release.id);
  }

  // Proposer une jaquette : réservé aux membres connectés
  function proposeCover(release: Release) {
    if (!session) return navigate(`/connexion?next=${encodeURIComponent(here)}`);
    if (needsMfa) return navigate(`/connexion/verification?next=${encodeURIComponent(here)}`);
    setCoverFor(release);
  }

  // « C'est ma version » : le code scanné est associé à cette version, pour tout le monde
  async function associate(release: Release) {
    if (!scanned) return;
    if (!session) return navigate(`/connexion?next=${encodeURIComponent(here)}`);
    if (needsMfa) return navigate(`/connexion/verification?next=${encodeURIComponent(here)}`);
    setBusy(release.id);
    setActionError('');
    const { error } = await supabase.rpc('add_release_barcode', { target_release: release.id, code: scanned });
    setBusy(null);
    if (error) return setActionError(errorMessage(error));
    setThanks(tr('Merci ! Le code {0} mène maintenant directement à cette version, pour tous les collectionneurs.', formatBarcode(scanned)));
    setBarcodesVersion((v) => v + 1);
    notifyCollectionChanged();
    setParams({ version: String(release.id) }, { replace: true });
  }

  // Code-barres faux : un modérateur le retire (l'historique garde la trace)
  async function removeBarcode(release: Release, barcode: string) {
    const { error } = await supabase.from('release_barcode').delete().eq('release_id', release.id).eq('barcode', barcode);
    if (error) return setActionError(errorMessage(error));
    setBarcodesVersion((v) => v + 1);
  }

  async function toggleWanted(release: Release) {
    setBusy(release.id);
    setActionError('');
    const item = wantedItem(release);
    const { error } = item
      ? await supabase.from('collection_item').delete().eq('id', item.id)
      : await supabase.from('collection_item').insert({ release_id: release.id, status: 'wanted' });
    setBusy(null);
    if (error) return setActionError(errorMessage(error));
    setJustWanted(item ? null : release.id);
    setMineVersion((v) => v + 1);
    notifyCollectionChanged();
  }

  return (
    <article className="game">
      <header className="game-head panel">
        <Cover images={heroImages} title={game.title} size="large" platform={byPlatform[0]?.platform.short_name} zoomable />
        <div className="game-info">
          <h1>{game.title}</h1>
          <dl className="facts">
            {game.first_release_date && (<><dt>{tr('Première sortie')}</dt><dd>{formatDate(game.first_release_date, game.first_release_precision)}</dd></>)}
            {platforms.length > 1 && (
              <>
                <dt>{tr('Consoles')}</dt>
                <dd>
                  {platforms.map((p, i) => (
                    <Fragment key={p.id}>
                      {i > 0 && ', '}
                      <a href={`#console-${p.short_name}`}>{p.name ?? p.short_name}</a>
                    </Fragment>
                  ))}
                </dd>
              </>
            )}
            {game.game_developer.length > 0 && (
              <><dt>{tr('Développement')}</dt><dd><StudioLinks companies={game.game_developer.map((d) => d.company)} /></dd></>
            )}
            {game.game_series.length > 0 && (
              <>
                <dt>{tr('Série')}</dt>
                <dd>
                  {game.game_series.map((g, i) => (
                    <Fragment key={g.series.id}>
                      {i > 0 && ', '}
                      <Link to={`/catalogue?serie=${g.series.id}`} title={tr('Tous les jeux de la série {0}', g.series.name)}>{g.series.name}</Link>
                    </Fragment>
                  ))}
                </dd>
              </>
            )}
            {gameStats && gameStats.owners + gameStats.seekers > 0 && (
              <>
                <dt>{tr('Collectionneurs')}</dt>
                <dd>{popularityText(gameStats.owners, gameStats.seekers)}</dd>
              </>
            )}
            {origin && (
              <>
                <dt>{tr('Origine')}</dt>
                <dd>
                  {countryName(origin)}
                  {origin === 'JP' && families.includes('rpg') && (
                    <> <Link to="/catalogue?genre=rpg&origine=japon" className="badge badge-family">{tr('JRPG')}</Link></>
                  )}
                </dd>
              </>
            )}
            {families.length > 0 && (
              <>
                <dt>{tr('Genre')}</dt>
                <dd>
                  <span className="family-tags">
                    {families.map((f) => <Link key={f} to={`/catalogue?genre=${f}`} className="badge badge-family">{familyLabel(f)}</Link>)}
                  </span>
                  <span className="muted small"> {genres.map((g) => genreName(g.name)).join(', ')}</span>
                </dd>
              </>
            )}
            {themes.length > 0 && (<><dt>{tr('Thèmes')}</dt><dd>{themes.map((g) => genreName(g.name)).join(', ')}</dd></>)}
          </dl>
          {game.summary && (
            <div className="summary-block">
              <p className={summaryOpen || game.summary.length < 320 ? 'summary' : 'summary is-clamped'}>{game.summary}</p>
              {game.summary.length >= 320 && (
                <button type="button" className="link-button small" aria-expanded={summaryOpen} onClick={() => setSummaryOpen((v) => !v)}>
                  {summaryOpen ? tr('Réduire') : tr('Lire la suite')}
                </button>
              )}
              {lang === 'en' && <p className="summary-source">Summary in French: English summaries will come later.</p>}
              {game.summary_source && (
                <p className="summary-source">
                  {tr('Résumé extrait de Wikipédia (licence')}{' '}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer">{tr('CC BY-SA 4.0')}</a>)
                  {' · '}
                  <a href={game.summary_source} target="_blank" rel="noopener noreferrer">{tr("lire l'article")}</a>
                </p>
              )}
            </div>
          )}
          {isModerator && (
            <div className="actions">
              <Link to={`/jeu/${game.id}/modifier`} className="button button-primary"><PsSymbol shape="triangle" />{tr(' Modifier ce jeu')}</Link>
            </div>
          )}
          <SummaryProposal open={proposeSummary} onClose={() => setProposeSummary(false)} game={game} />
          <ReportDialog open={reporting} onClose={() => setReporting(false)} game={game} />
          <AddToCollection open={adding !== null} initialReleaseId={adding} onClose={() => setAdding(null)} onSaved={(saved) => {
            showToast({ text: savedText(saved), saved: true });
            if (saved.status === 'owned') setJustAdded(saved.releaseId);
            else setJustWanted(saved.releaseId);
            setMineVersion((v) => v + 1);
          }} />
        </div>
      </header>

      {scanned && (
        <p className="notice scan-banner" aria-live="polite">
          <strong>{tr('Code-barres ')}{formatBarcode(scanned)}</strong>{tr(" : quelle version as-tu en main ? Touche « C'est ma version » sur la bonne fiche ci-dessous")}{session ? '' : tr(' (après connexion)')}{tr('. Le prochain qui scannera ce code tombera directement dessus.')}
        </p>
      )}
      {thanks && <p className="success" role="status">{thanks}</p>}
      {focused && !scanned && (
        <div className="panel scan-banner scan-found">
          <p>
            <strong>{tr('Ta version :')}</strong> {focused.local_title} · {zoneLabel(focused.zone)} · {editionLabel(focused)}
            {focused.languages.length > 0 && ` · ${languagesLong(focused.languages)}`}
          </p>
          <div className="actions">
            {copies(focused) > 0
              ? <span className={focused.id === justAdded ? 'badge badge-owned just-added' : 'badge badge-owned'}>{tr('✓ Déjà dans ta collection')}{copies(focused) > 1 ? tr(' (×{0})', copies(focused)) : ''}</span>
              : <button type="button" className="button button-primary" onClick={() => addToCollection(focused)}><PsSymbol shape="cross" />{tr(' Ajouter à ma collection')}</button>}
            <button type="button" className="link-button small" onClick={() => { setThanks(''); setParams({}, { replace: true }); }}>{tr('Voir toutes les versions')}</button>
          </div>
        </div>
      )}

      {actionError && <p className="error">{actionError}</p>}
      {byPlatform.map(({ platform, releases: list }) => (
        <Fragment key={platform.id}>
          <h2 id={`console-${platform.short_name}`}>
            {byPlatform.length > 1 ? `${platform.name ?? platform.short_name} (${list.length})` : <>{tr('Versions (')}{list.length})</>}
          </h2>
          <ul className="release-list">
            {list.map((r) => (
              <li key={r.id} id={`version-${r.id}`} className={r.id === focusId ? 'release-card panel is-focused' : 'release-card panel'}>
                <Cover images={r.image} title={r.local_title} size="medium" platform={r.platform.short_name} standIn={standInFor(r, samePlatform(r))} zoomable />
                <div className="release-body">
                  <h3>{r.local_title}</h3>
                  <p className="release-badges">
                    <span className={`badge badge-zone badge-${(r.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(r.zone)}</span>
                    {countryOf(r) && <span className="badge">{countryOf(r)}</span>}
                    <span className={`badge ${editionClass(r)}`}>{editionLabel(r)}</span>
                    {r.box_region && <span className="badge badge-language" title={tr('Boîte imprimée pour ce pays')}>{tr('Boîte : ')}{boxRegionName(r.box_region.code)}</span>}
                    {r.languages.length > 0 && (
                      <span className="badge badge-language" title={languagesLong(r.languages)}>
                        {r.languages.length === 1 ? languagesLong(r.languages) : languagesShort(r.languages)}
                      </span>
                    )}
                    {!r.product_code && <span className="badge badge-todo">{tr('À compléter')}</span>}
                    {copies(r) > 0 && <span key={copies(r)} className={r.id === justAdded ? 'badge badge-owned just-added' : 'badge badge-owned'}>{tr('✓ Dans ta collection')}{copies(r) > 1 ? tr(' (×{0})', copies(r)) : ''}</span>}
                    {wantedItem(r) && <span className={r.id === justWanted ? 'badge badge-trade just-added' : 'badge badge-trade'}>{tr('♥ Recherchée')}</span>}
                  </p>
                  <dl className="facts">
                    {r.product_code && (<><dt>{tr('Code produit')}</dt><dd className="code">{r.product_code}</dd></>)}
                    {r.release_region.length > 0 && (
                      <><dt>{tr('Sortie')}</dt><dd>{r.release_region.map((rr) => (rr.release_date ? tr('{0} : {1}', regionName(rr.region), formatDate(rr.release_date, rr.date_precision)) : regionName(rr.region))).join(' · ')}</dd></>
                    )}
                    {r.release_company.length > 0 && (
                      <><dt>{tr('Éditeur')}</dt><dd><StudioLinks companies={r.release_company.map((c) => c.company)} /></dd></>
                    )}
                    {(statsOf(r)?.owners ?? 0) + (statsOf(r)?.seekers ?? 0) > 0 && (
                      <><dt>{tr('Collectionneurs')}</dt><dd>{popularityText(statsOf(r)!.owners, statsOf(r)!.seekers)}</dd></>
                    )}
                    {pricesOf(r).length > 0 && (
                      <>
                        <dt title={tr("Médiane des prix d'achat notés par les membres ces 5 dernières années, état par état (cadeaux et échanges exclus). Elle apparaît à partir de 5 membres.")}>
                          {tr('Prix payés')}
                        </dt>
                        <dd><PriceSummary prices={pricesOf(r)} /></dd>
                      </>
                    )}
                    {codesOf(r).length > 0 && (
                      <>
                        <dt>{tr('Code-barres')}</dt>
                        <dd>
                          {codesOf(r).map((b) => (
                            <span key={b} className="barcode-value">
                              <span className="code">{formatBarcode(b)}</span>
                              {isModerator && (
                                <button type="button" className="link-button danger small" onClick={() => removeBarcode(r, b)} title={tr('Retirer ce code-barres (faux)')}>{tr('retirer')}</button>
                              )}
                            </span>
                          ))}
                        </dd>
                      </>
                    )}
                    {r.languages.length > 0 && (
                      <><dt>{tr('Langues')}</dt><dd>{languagesLong(r.languages)}</dd></>
                    )}
                    {r.media_count && r.media_count > 1 && (<><dt>{tr('Disques')}</dt><dd>{r.media_count}</dd></>)}
                    {describeSpecs(r.specs, r.platform.spec_fields).map((s) => (
                      <Fragment key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></Fragment>
                    ))}
                  </dl>
                  <div className="actions">
                    {scanned && !codesOf(r).includes(scanned) && (
                      <button type="button" className="button button-small button-primary" disabled={busy === r.id} onClick={() => associate(r)}>
                        <PsSymbol shape="triangle" />{tr(" C'est ma version")}
                      </button>
                    )}
                    <button type="button" className={copies(r) > 0 || scanned ? 'button button-small' : 'button button-small button-primary'} onClick={() => addToCollection(r)}>
                      <PsSymbol shape="cross" /> {copies(r) > 0 ? tr('Ajouter un autre exemplaire') : tr('Ajouter à ma collection')}
                    </button>
                    {canTick && copies(r) === 0 && (
                      <button type="button" className={wantedItem(r) ? `wish-button active${r.id === justWanted ? ' just-wanted' : ''}` : 'wish-button'} aria-pressed={Boolean(wantedItem(r))}
                        disabled={busy === r.id} onClick={() => toggleWanted(r)}>
                        {wantedItem(r) ? tr('♥ Recherchée') : tr('♡ Je la cherche')}
                      </button>
                    )}
                    {copies(r) > 0 && <Link to="/collection" className="small">{tr('Voir ma collection')}</Link>}
                    {r.image.some((i) => i.type === 'front')
                      ? <button type="button" className="link-button small" onClick={() => proposeCover(r)}>{tr('Proposer une meilleure jaquette')}</button>
                      : <button type="button" className="button button-small" onClick={() => proposeCover(r)}><PsSymbol shape="square" />{tr(' Proposer une jaquette')}</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}

      {/* Contribuer : après les versions, l'essentiel pour qui consulte la fiche */}
      <section className="panel contribute">
        <h2>{tr('Une info manque ou est fausse ?')}</h2>
        <p className="muted small">{tr("La base est collaborative : chaque proposition est relue par un modérateur avant d'apparaître.")}</p>
        <div className="actions">
          <Link to={`/proposer?jeu=${game.id}`} className="button"><PsSymbol shape="square" />{tr(' Proposer une version manquante')}</Link>
          <button type="button" className="button" onClick={() => (session ? setProposeSummary(true) : navigate(`/connexion?next=${encodeURIComponent(location.pathname)}`))}>
            <PsSymbol shape="circle" /> {game.summary ? tr('Proposer un meilleur résumé') : tr('Proposer un résumé')}
          </button>
          <button type="button" className="button" onClick={() => (session ? setReporting(true) : navigate(`/connexion?next=${encodeURIComponent(location.pathname)}`))}>
            <PsSymbol shape="triangle" />{tr(' Signaler une erreur')}
          </button>
        </div>
      </section>
      {coverFor && (
        <Suspense fallback={null}>
          <CoverProposal open release={coverFor} gameTitle={game.title} onClose={() => setCoverFor(null)} />
        </Suspense>
      )}
      {toast}
    </article>
  );
}

// « 12 membres l'ont · 3 le cherchent »
function popularityText(owners: number, seekers: number): string {
  return [
    owners > 0 && (owners > 1 ? tr('{0} membres l’ont', owners) : tr('{0} membre l’a', owners)),
    seekers > 0 && (seekers > 1 ? tr('{0} le cherchent', seekers) : tr('{0} le cherche', seekers)),
  ].filter(Boolean).join(' · ');
}

// Studios cliquables : leurs jeux dans le catalogue
function StudioLinks({ companies }: { companies: { id: number; name: string }[] }) {
  return (
    <>
      {companies.map((c, i) => (
        <Fragment key={c.id}>
          {i > 0 && ', '}
          <Link to={`/catalogue?studio=${c.id}`} title={tr('Tous les jeux de {0}', c.name)}>{c.name}</Link>
        </Fragment>
      ))}
    </>
  );
}

// Proposer un résumé écrit par soi-même (validé ensuite par un modérateur)
function SummaryProposal({ open, onClose, game }: { open: boolean; onClose: () => void; game: Game }) {
  const [text, setText] = useState('');
  const [sources, setSources] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const length = text.trim().length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (length < 20) return setError(tr('Le résumé doit faire au moins 20 caractères.'));
    setBusy(true);
    setError('');
    const { error } = await supabase.from('submission').insert({
      action: 'update',
      target: 'game',
      target_id: game.id,
      data: { summary: text.trim() },
      sources: sources.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSent(true);
  }

  function close() {
    onClose();
    setTimeout(() => { setSent(false); setText(''); setSources(''); setError(''); }, 250);
  }

  return (
    <Dialog open={open} onClose={close} title={tr('Résumé de « {0} »', game.title)}>
      {sent ? (
        <>
          <p className="success">{tr('Merci ! Ton résumé sera publié après validation par un modérateur.')}</p>
          <div className="actions"><button type="button" className="button" onClick={close}><PsSymbol shape="circle" />{tr(' Fermer')}</button></div>
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <p className="muted small">
            {tr("Écris avec tes propres mots : pas de copier-coller d'un autre site (droits d'auteur).")}
            {game.summary_source && tr(' Une fois validé, ton texte remplacera celui de Wikipédia.')}
          </p>
          <label className="field">
            <span className="field-label">{tr('Résumé ({0} / 3000 caractères)', length)}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={3000} required autoFocus />
          </label>
          <label className="field">
            <span className="field-label">{tr('Sources (facultatif)')}</span>
            <input value={sources} onChange={(e) => setSources(e.target.value)} maxLength={1000} placeholder={tr("J'ai fini le jeu, notice du jeu…")} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="button" onClick={close}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
            <button type="submit" className="button button-primary" disabled={busy || length < 20}><PsSymbol shape="cross" />{tr(' Envoyer')}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// Version sortie dans un seul pays (version française, allemande…) : son nom, pour la
// distinguer d'un coup d'œil des autres versions de la même zone
// (sauf s'il répète la zone : le Japon pour le NTSC-J, les États-Unis pour le NTSC-U)
function countryOf(release: Release): string | null {
  const countries = [...new Map(release.release_region.filter((rr) => /^[A-Z]{2}$/.test(rr.region.code))
    .map((rr) => [rr.region.code, regionName(rr.region)])).entries()];
  if (countries.length !== 1) return null;
  const [code, name] = countries[0];
  return (release.zone === 'NTSC-J' && code === 'JP') || (release.zone === 'NTSC-U' && code === 'US') ? null : name;
}
