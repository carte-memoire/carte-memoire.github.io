import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { Dialog } from '../components/Dialog';
import { GAME_FIELDS } from '../lib/queries';
import { boxRegionName, countryName, editionLabel, familyLabel, formatDate, languagesLong, languagesShort, speaksLanguage, zoneLabel, zoneOrder } from '../lib/format';
import { rememberedLanguage } from '../lib/preferences';
import { describeSpecs } from '../lib/specs';
import type { Game, ItemStatus, Release } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { AddToCollection } from '../components/AddToCollection';
import { Cover } from '../components/Cover';
import { PsSymbol } from '../components/PsSymbol';
import { ReportDialog } from '../components/ReportDialog';
import { standInFor } from '../lib/images';
import { formatBarcode, normalizeBarcode } from '../lib/barcode';

export function GamePage() {
  const { id } = useParams();
  const gameId = Number.parseInt(id ?? '', 10);
  const navigate = useNavigate();
  const location = useLocation();
  const { session, needsMfa, isModerator } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
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
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
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

  useEffect(() => {
    if (!Number.isInteger(gameId)) return setState('missing');
    supabase.from('game').select(GAME_FIELDS).eq('id', gameId).maybeSingle().then(({ data }) => {
      if (!data) return setState('missing');
      setGame(data as unknown as Game);
      setState('ok');
    });
    supabase.from('game').select('origin').eq('id', gameId).maybeSingle()
      .then(({ data }) => setOrigin((data as { origin: string | null } | null)?.origin ?? null));
  }, [gameId]);

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

  // La version scannée : on l'amène à l'écran
  useEffect(() => {
    if (state !== 'ok' || !focusId) return;
    const timer = setTimeout(() => document.getElementById(`version-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
    return () => clearTimeout(timer);
  }, [state, focusId]);

  if (state === 'loading') return <p className="loading">Lecture de la carte mémoire…</p>;
  if (state === 'missing' || !game) return <section className="panel"><h1>Jeu introuvable</h1><Link to="/"><PsSymbol shape="circle" /> Retour à la recherche</Link></section>;

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
  const heroImages = releases.find((r) => r.zone === 'PAL' && r.image.length)?.image ?? releases.find((r) => r.image.length)?.image ?? [];
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
    setThanks(`Merci ! Le code ${formatBarcode(scanned)} mène maintenant directement à cette version, pour tous les collectionneurs.`);
    setBarcodesVersion((v) => v + 1);
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
    setMineVersion((v) => v + 1);
  }

  return (
    <article className="game">
      <header className="game-head panel">
        <Cover images={heroImages} title={game.title} size="large" />
        <div className="game-info">
          <h1>{game.title}</h1>
          <dl className="facts">
            {game.first_release_date && (<><dt>Première sortie</dt><dd>{formatDate(game.first_release_date, game.first_release_precision)}</dd></>)}
            {game.game_developer.length > 0 && (
              <><dt>Développement</dt><dd><StudioLinks companies={game.game_developer.map((d) => d.company)} /></dd></>
            )}
            {game.game_series.length > 0 && (
              <>
                <dt>Série</dt>
                <dd>
                  {game.game_series.map((g, i) => (
                    <Fragment key={g.series.id}>
                      {i > 0 && ', '}
                      <Link to={`/catalogue?serie=${g.series.id}`} title={`Tous les jeux de la série ${g.series.name}`}>{g.series.name}</Link>
                    </Fragment>
                  ))}
                </dd>
              </>
            )}
            {gameStats && gameStats.owners + gameStats.seekers > 0 && (
              <>
                <dt>Collectionneurs</dt>
                <dd>{popularityText(gameStats.owners, gameStats.seekers)}</dd>
              </>
            )}
            {origin && (
              <>
                <dt>Origine</dt>
                <dd>
                  {countryName(origin)}
                  {origin === 'JP' && families.includes('rpg') && (
                    <> <Link to="/catalogue?genre=rpg&origine=japon" className="badge badge-family">JRPG</Link></>
                  )}
                </dd>
              </>
            )}
            {families.length > 0 && (
              <>
                <dt>Genre</dt>
                <dd>
                  <span className="family-tags">
                    {families.map((f) => <Link key={f} to={`/catalogue?genre=${f}`} className="badge badge-family">{familyLabel(f)}</Link>)}
                  </span>
                  <span className="muted small"> {genres.map((g) => g.name).join(', ')}</span>
                </dd>
              </>
            )}
            {themes.length > 0 && (<><dt>Thèmes</dt><dd>{themes.map((g) => g.name).join(', ')}</dd></>)}
          </dl>
          {game.summary && (
            <div className="summary-block">
              <p className={summaryOpen || game.summary.length < 320 ? 'summary' : 'summary is-clamped'}>{game.summary}</p>
              {game.summary.length >= 320 && (
                <button type="button" className="link-button small" aria-expanded={summaryOpen} onClick={() => setSummaryOpen((v) => !v)}>
                  {summaryOpen ? 'Réduire' : 'Lire la suite'}
                </button>
              )}
              {game.summary_source && (
                <p className="summary-source">
                  Résumé extrait de Wikipédia (licence{' '}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>)
                  {' · '}
                  <a href={game.summary_source} target="_blank" rel="noopener noreferrer">lire l'article</a>
                </p>
              )}
            </div>
          )}
          {isModerator && (
            <div className="actions">
              <Link to={`/jeu/${game.id}/modifier`} className="button button-primary"><PsSymbol shape="triangle" /> Modifier ce jeu</Link>
            </div>
          )}
          <SummaryProposal open={proposeSummary} onClose={() => setProposeSummary(false)} game={game} />
          <ReportDialog open={reporting} onClose={() => setReporting(false)} game={game} />
          <AddToCollection open={adding !== null} initialReleaseId={adding} onClose={() => setAdding(null)} onSaved={() => setMineVersion((v) => v + 1)} />
        </div>
      </header>

      {scanned && (
        <p className="notice scan-banner" aria-live="polite">
          <strong>Code-barres {formatBarcode(scanned)}</strong> : quelle version as-tu en main ? Touche « C'est ma version » sur la bonne
          fiche ci-dessous{session ? '' : ' (après connexion)'}. Le prochain qui scannera ce code tombera directement dessus.
        </p>
      )}
      {thanks && <p className="success" role="status">{thanks}</p>}
      {focused && !scanned && (
        <div className="panel scan-banner scan-found">
          <p>
            <strong>Ta version :</strong> {focused.local_title} · {zoneLabel(focused.zone)} · {editionLabel(focused)}
            {focused.languages.length > 0 && ` · ${languagesLong(focused.languages)}`}
          </p>
          <div className="actions">
            {copies(focused) > 0
              ? <span className="badge badge-owned">✓ Déjà dans ta collection{copies(focused) > 1 ? ` (×${copies(focused)})` : ''}</span>
              : <button type="button" className="button button-primary" onClick={() => addToCollection(focused)}><PsSymbol shape="cross" /> Ajouter à ma collection</button>}
            <button type="button" className="link-button small" onClick={() => { setThanks(''); setParams({}, { replace: true }); }}>Voir toutes les versions</button>
          </div>
        </div>
      )}

      <h2>Versions ({releases.length})</h2>
      {actionError && <p className="error">{actionError}</p>}
      <ul className="release-list">
        {releases.map((r) => (
          <li key={r.id} id={`version-${r.id}`} className={r.id === focusId ? 'release-card panel is-focused' : 'release-card panel'}>
            <Cover images={r.image} title={r.local_title} size="medium" standIn={standInFor(r, releases)} />
            <div className="release-body">
              <h3>{r.local_title}</h3>
              <p className="release-badges">
                <span className={`badge badge-zone badge-${(r.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(r.zone)}</span>
                {countryOf(r) && <span className="badge">{countryOf(r)}</span>}
                <span className={`badge ${r.edition_type === 'reissue' ? 'badge-platinum' : 'badge-edition'}`}>{editionLabel(r)}</span>
                {r.box_region && <span className="badge badge-language" title="Boîte imprimée pour ce pays">Boîte : {boxRegionName(r.box_region.code)}</span>}
                {r.languages.length > 0 && (
                  <span className="badge badge-language" title={languagesLong(r.languages)}>
                    {r.languages.length === 1 ? languagesLong(r.languages) : languagesShort(r.languages)}
                  </span>
                )}
                {!r.product_code && <span className="badge badge-todo">À compléter</span>}
                {copies(r) > 0 && <span className="badge badge-owned">✓ Dans ta collection{copies(r) > 1 ? ` (×${copies(r)})` : ''}</span>}
                {wantedItem(r) && <span className="badge badge-trade">♥ Recherchée</span>}
              </p>
              <dl className="facts">
                {r.product_code && (<><dt>Code produit</dt><dd className="code">{r.product_code}</dd></>)}
                {r.release_region.length > 0 && (
                  <><dt>Sortie</dt><dd>{r.release_region.map((rr) => `${rr.region.name}${rr.release_date ? ` : ${formatDate(rr.release_date, rr.date_precision)}` : ''}`).join(' · ')}</dd></>
                )}
                {r.release_company.length > 0 && (
                  <><dt>Édition</dt><dd><StudioLinks companies={r.release_company.map((c) => c.company)} /></dd></>
                )}
                {(statsOf(r)?.owners ?? 0) + (statsOf(r)?.seekers ?? 0) > 0 && (
                  <><dt>Collectionneurs</dt><dd>{popularityText(statsOf(r)!.owners, statsOf(r)!.seekers)}</dd></>
                )}
                {codesOf(r).length > 0 && (
                  <>
                    <dt>Code-barres</dt>
                    <dd>
                      {codesOf(r).map((b) => (
                        <span key={b} className="barcode-value">
                          <span className="code">{formatBarcode(b)}</span>
                          {isModerator && (
                            <button type="button" className="link-button danger small" onClick={() => removeBarcode(r, b)} title="Retirer ce code-barres (faux)">retirer</button>
                          )}
                        </span>
                      ))}
                    </dd>
                  </>
                )}
                {r.languages.length > 0 && (
                  <><dt>Langues</dt><dd>{languagesLong(r.languages)}</dd></>
                )}
                {r.media_count && r.media_count > 1 && (<><dt>Disques</dt><dd>{r.media_count}</dd></>)}
                {describeSpecs(r.specs, r.platform.spec_fields).map((s) => (
                  <Fragment key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></Fragment>
                ))}
              </dl>
              <div className="actions">
                {scanned && !codesOf(r).includes(scanned) && (
                  <button type="button" className="button button-small button-primary" disabled={busy === r.id} onClick={() => associate(r)}>
                    <PsSymbol shape="triangle" /> C'est ma version
                  </button>
                )}
                <button type="button" className={copies(r) > 0 || scanned ? 'button button-small' : 'button button-small button-primary'} onClick={() => addToCollection(r)}>
                  <PsSymbol shape="cross" /> {copies(r) > 0 ? 'Ajouter un autre exemplaire' : 'Ajouter à ma collection'}
                </button>
                {canTick && copies(r) === 0 && (
                  <button type="button" className={wantedItem(r) ? 'wish-button active' : 'wish-button'} aria-pressed={Boolean(wantedItem(r))}
                    disabled={busy === r.id} onClick={() => toggleWanted(r)}>
                    {wantedItem(r) ? '♥ Recherchée' : '♡ Je la cherche'}
                  </button>
                )}
                {copies(r) > 0 && <Link to="/collection" className="small">Voir ma collection</Link>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Contribuer : après les versions, l'essentiel pour qui consulte la fiche */}
      <section className="panel contribute">
        <h2>Une info manque ou est fausse ?</h2>
        <p className="muted small">La base est collaborative : chaque proposition est relue par un modérateur avant d'apparaître.</p>
        <div className="actions">
          <Link to={`/proposer?jeu=${game.id}`} className="button"><PsSymbol shape="square" /> Proposer une version manquante</Link>
          <button type="button" className="button" onClick={() => (session ? setProposeSummary(true) : navigate(`/connexion?next=${encodeURIComponent(location.pathname)}`))}>
            <PsSymbol shape="circle" /> {game.summary ? 'Proposer un meilleur résumé' : 'Proposer un résumé'}
          </button>
          <button type="button" className="button" onClick={() => (session ? setReporting(true) : navigate(`/connexion?next=${encodeURIComponent(location.pathname)}`))}>
            <PsSymbol shape="triangle" /> Signaler une erreur
          </button>
        </div>
      </section>
    </article>
  );
}

// « 12 membres l'ont · 3 le cherchent »
function popularityText(owners: number, seekers: number): string {
  return [
    owners > 0 && `${owners} membre${owners > 1 ? 's l’ont' : ' l’a'}`,
    seekers > 0 && `${seekers} ${seekers > 1 ? 'le cherchent' : 'le cherche'}`,
  ].filter(Boolean).join(' · ');
}

// Studios cliquables : leurs jeux dans le catalogue
function StudioLinks({ companies }: { companies: { id: number; name: string }[] }) {
  return (
    <>
      {companies.map((c, i) => (
        <Fragment key={c.id}>
          {i > 0 && ', '}
          <Link to={`/catalogue?studio=${c.id}`} title={`Tous les jeux de ${c.name}`}>{c.name}</Link>
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
    if (length < 20) return setError('Le résumé doit faire au moins 20 caractères.');
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
    <Dialog open={open} onClose={close} title={`Résumé de « ${game.title} »`}>
      {sent ? (
        <>
          <p className="success">Merci ! Ton résumé sera publié après validation par un modérateur.</p>
          <div className="actions"><button type="button" className="button" onClick={close}><PsSymbol shape="circle" /> Fermer</button></div>
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <p className="muted small">
            Écris avec tes propres mots : pas de copier-coller d'un autre site (droits d'auteur).
            {game.summary_source && ' Une fois validé, ton texte remplacera celui de Wikipédia.'}
          </p>
          <label className="field">
            <span className="field-label">Résumé ({length} / 3000 caractères)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={3000} required autoFocus />
          </label>
          <label className="field">
            <span className="field-label">Sources (facultatif)</span>
            <input value={sources} onChange={(e) => setSources(e.target.value)} maxLength={1000} placeholder="J'ai fini le jeu, notice du jeu…" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="button" onClick={close}><PsSymbol shape="circle" /> Annuler</button>
            <button type="submit" className="button button-primary" disabled={busy || length < 20}><PsSymbol shape="cross" /> Envoyer</button>
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
    .map((rr) => [rr.region.code, rr.region.name])).entries()];
  if (countries.length !== 1) return null;
  const [code, name] = countries[0];
  return (release.zone === 'NTSC-J' && code === 'JP') || (release.zone === 'NTSC-U' && code === 'US') ? null : name;
}
