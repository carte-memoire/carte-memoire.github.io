import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { Dialog } from '../components/Dialog';
import { GAME_FIELDS } from '../lib/queries';
import { countryName, editionLabel, familyLabel, formatDate, LANGUAGES, zoneLabel, zoneOrder } from '../lib/format';
import { describeSpecs } from '../lib/specs';
import type { Game, Release } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Cover } from '../components/Cover';
import { PsSymbol } from '../components/PsSymbol';
import { ReportDialog } from '../components/ReportDialog';
import { standInFor } from '../lib/images';

export function GamePage() {
  const { id } = useParams();
  const gameId = Number.parseInt(id ?? '', 10);
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isModerator } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [proposeSummary, setProposeSummary] = useState(false);
  const [reporting, setReporting] = useState(false);
  // Pays du studio (champ calculé par la base), lu à part : la fiche s'affiche même sans lui
  const [origin, setOrigin] = useState<string | null>(null);

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

  if (state === 'loading') return <p className="loading">Lecture de la carte mémoire…</p>;
  if (state === 'missing' || !game) return <section className="panel"><h1>Jeu introuvable</h1><Link to="/"><PsSymbol shape="circle" /> Retour à la recherche</Link></section>;

  const releases = [...game.release].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || a.id - b.id);
  const heroImages = releases.find((r) => r.zone === 'PAL' && r.image.length)?.image ?? releases.find((r) => r.image.length)?.image ?? [];
  // Genres (avec leurs familles, cliquables vers le catalogue) et thèmes (sans famille)
  const genres = game.game_genre.map((g) => g.genre).filter((g) => g.families.length > 0);
  const themes = game.game_genre.map((g) => g.genre).filter((g) => g.families.length === 0);
  const families = [...new Set(genres.flatMap((g) => g.families))];

  function addToCollection(release: Release) {
    const target = `/collection?ajouter=${release.id}`;
    navigate(session ? target : `/connexion?next=${encodeURIComponent(target)}`);
  }

  return (
    <article className="game">
      <header className="game-head panel">
        <Cover images={heroImages} title={game.title} size="large" />
        <div className="game-info">
          <h1>{game.title}</h1>
          <dl className="facts">
            {game.first_release_date && (<><dt>Première sortie</dt><dd>{formatDate(game.first_release_date, game.first_release_precision)}</dd></>)}
            {game.game_developer.length > 0 && (<><dt>Développement</dt><dd>{game.game_developer.map((d) => d.company.name).join(', ')}</dd></>)}
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
              <p className="summary">{game.summary}</p>
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
          <div className="actions">
            <Link to={`/proposer?jeu=${game.id}`} className="button"><PsSymbol shape="square" /> Proposer une version manquante</Link>
            <button type="button" className="button" onClick={() => (session ? setProposeSummary(true) : navigate(`/connexion?next=${encodeURIComponent(location.pathname)}`))}>
              <PsSymbol shape="circle" /> {game.summary ? 'Proposer un meilleur résumé' : 'Proposer un résumé'}
            </button>
            <button type="button" className="button" onClick={() => (session ? setReporting(true) : navigate(`/connexion?next=${encodeURIComponent(location.pathname)}`))}>
              <PsSymbol shape="circle" /> Signaler une erreur
            </button>
            {isModerator && <Link to={`/jeu/${game.id}/modifier`} className="button button-primary"><PsSymbol shape="triangle" /> Modifier ce jeu</Link>}
          </div>
          <SummaryProposal open={proposeSummary} onClose={() => setProposeSummary(false)} game={game} />
          <ReportDialog open={reporting} onClose={() => setReporting(false)} game={game} />
        </div>
      </header>

      <h2>Versions ({releases.length})</h2>
      <ul className="release-list">
        {releases.map((r) => (
          <li key={r.id} className="release-card panel">
            <Cover images={r.image} title={r.local_title} size="medium" standIn={standInFor(r, releases)} />
            <div className="release-body">
              <h3>{r.local_title}</h3>
              <p className="release-badges">
                <span className={`badge badge-zone badge-${(r.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(r.zone)}</span>
                {countryOf(r) && <span className="badge">{countryOf(r)}</span>}
                <span className={`badge ${r.edition_type === 'reissue' ? 'badge-platinum' : 'badge-edition'}`}>{editionLabel(r)}</span>
                {!r.product_code && <span className="badge badge-todo">À compléter</span>}
              </p>
              <dl className="facts">
                {r.product_code && (<><dt>Code produit</dt><dd className="code">{r.product_code}</dd></>)}
                {r.release_region.length > 0 && (
                  <><dt>Sortie</dt><dd>{r.release_region.map((rr) => `${rr.region.name}${rr.release_date ? ` : ${formatDate(rr.release_date, rr.date_precision)}` : ''}`).join(' · ')}</dd></>
                )}
                {r.release_company.length > 0 && (
                  <><dt>Édition</dt><dd>{r.release_company.map((c) => c.company.name).join(', ')}</dd></>
                )}
                {r.languages.length > 0 && (
                  <><dt>Langues</dt><dd>{r.languages.map((l) => LANGUAGES.find((x) => x.value === l)?.label ?? l).join(', ')}</dd></>
                )}
                {r.media_count && r.media_count > 1 && (<><dt>Disques</dt><dd>{r.media_count}</dd></>)}
                {describeSpecs(r.specs, r.platform.spec_fields).map((s) => (
                  <Fragment key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></Fragment>
                ))}
              </dl>
              <button type="button" className="button button-small button-primary" onClick={() => addToCollection(r)}><PsSymbol shape="cross" /> Ajouter à ma collection</button>
            </div>
          </li>
        ))}
      </ul>
    </article>
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
