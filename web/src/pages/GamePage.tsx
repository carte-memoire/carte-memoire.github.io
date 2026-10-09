import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GAME_FIELDS } from '../lib/queries';
import { editionLabel, formatDate, LANGUAGES, zoneLabel, zoneOrder } from '../lib/format';
import type { Game, Release } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { Cover } from '../components/Cover';

export function GamePage() {
  const { id } = useParams();
  const gameId = Number.parseInt(id ?? '', 10);
  const navigate = useNavigate();
  const { session, isModerator } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    if (!Number.isInteger(gameId)) return setState('missing');
    supabase.from('game').select(GAME_FIELDS).eq('id', gameId).maybeSingle().then(({ data }) => {
      if (!data) return setState('missing');
      setGame(data as unknown as Game);
      setState('ok');
    });
  }, [gameId]);

  if (state === 'loading') return <p className="loading">Lecture de la carte mémoire…</p>;
  if (state === 'missing' || !game) return <section className="panel"><h1>Jeu introuvable</h1><Link to="/">○ Retour à la recherche</Link></section>;

  const releases = [...game.release].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || a.id - b.id);
  const heroImages = releases.find((r) => r.zone === 'PAL' && r.image.length)?.image ?? releases.find((r) => r.image.length)?.image ?? [];

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
            {game.game_genre.length > 0 && (<><dt>Genres</dt><dd>{game.game_genre.map((g) => g.genre.name).join(', ')}</dd></>)}
          </dl>
          {game.summary && <p className="summary">{game.summary}</p>}
          <div className="actions">
            <Link to={`/proposer?jeu=${game.id}`} className="button">□ Proposer une version manquante</Link>
            {isModerator && <Link to={`/jeu/${game.id}/modifier`} className="button button-primary">△ Modifier ce jeu</Link>}
          </div>
        </div>
      </header>

      <h2>Versions ({releases.length})</h2>
      <ul className="release-list">
        {releases.map((r) => (
          <li key={r.id} className="release-card panel">
            <Cover images={r.image} title={r.local_title} size="medium" />
            <div className="release-body">
              <h3>{r.local_title}</h3>
              <p className="release-badges">
                <span className={`badge badge-zone badge-${(r.zone ?? 'unknown').toLowerCase()}`}>{zoneLabel(r.zone)}</span>
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
              </dl>
              <button type="button" className="button button-small button-primary" onClick={() => addToCollection(r)}>✕ Ajouter à ma collection</button>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
