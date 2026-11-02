import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GAME_FIELDS } from '../lib/queries';
import { gamePath, zoneOrder } from '../lib/format';
import type { Game } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { HistoryList } from '../components/HistoryList';
import { StudioListEditor } from '../components/StudioListEditor';
import { PsSymbol } from '../components/PsSymbol';
import { tr } from '../lib/i18n';
import { usePageTitle } from '../lib/title';
import { DeleteGame } from './edit/DeleteGame';
import { GameForm } from './edit/GameForm';
import { GenreEditor } from './edit/GenreEditor';
import { MergeGame } from './edit/MergeGame';
import { OriginEditor } from './edit/OriginEditor';
import { isEmptyTwin, ReleaseEditor } from './edit/ReleaseEditor';

// Modification d'un jeu par un modérateur ou un admin (en double authentification :
// la base refuse sinon). Les membres passent par « Proposer une version ».
export function EditGame() {
  const { id } = useParams();
  const gameId = Number.parseInt(id ?? '', 10);
  const { aal } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [missing, setMissing] = useState(false);
  const [deleted, setDeleted] = useState('');
  usePageTitle(game ? tr('Modifier « ') + game.title + ' »' : missing ? tr('Jeu introuvable') : null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('game').select(GAME_FIELDS).eq('id', gameId).maybeSingle();
    if (!data) return setMissing(true);
    setGame(data as unknown as Game);
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  if (deleted) {
    return (
      <section className="panel stack">
        <h1>{tr('Jeu supprimé')}</h1>
        <p className="success">« {deleted}{tr(' » a été supprimé du catalogue. La suppression est notée dans le journal.')}</p>
        <p><Link to="/" className="button"><PsSymbol shape="circle" />{tr(' Retour à la recherche')}</Link></p>
      </section>
    );
  }
  if (missing) return <section className="panel"><h1>{tr('Jeu introuvable')}</h1></section>;
  if (!game) return <p className="loading">{tr('Lecture de la carte mémoire…')}</p>;

  const releases = [...game.release].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || a.id - b.id);

  return (
    <section className="stack">
      <div className="page-head">
        <h1>{tr('Modifier « ')}{game.title} »</h1>
        <Link to={gamePath(game)} className="button"><PsSymbol shape="circle" />{tr(' Retour à la fiche')}</Link>
      </div>
      {aal.current !== 'aal2' && (
        <p className="warning">
          {tr('Les modifications du catalogue demandent la double authentification.')}{' '}
          <Link to="/compte">{tr('Active-la ou valide-la dans « Mon compte »')}</Link>.
        </p>
      )}
      <GameForm game={game} onSaved={load} />
      <GenreEditor key={`${game.game_genre.map((g) => g.genre.id).join()}-${game.genres_reviewed}`} game={game} onSaved={load} />
      <section className="panel stack">
        <h2>{tr('Développeurs')}</h2>
        <StudioListEditor
          title={tr('Développeurs du jeu')}
          studios={game.game_developer.map((d) => d.company)}
          onAdd={(companyId) => supabase.from('game_developer').insert({ game_id: game.id, company_id: companyId })}
          onRemove={(companyId) => supabase.from('game_developer').delete().eq('game_id', game.id).eq('company_id', companyId)}
          onSaved={load}
        />
      </section>
      <OriginEditor key={game.game_developer.map((d) => d.company.id).join()} gameId={game.id} onSaved={load} />
      <h2>{tr('Versions')}</h2>
      {releases.map((r) => (
        <ReleaseEditor key={r.id} release={r} siblings={releases} onSaved={load} canDelete={releases.length > 1} possibleDuplicate={isEmptyTwin(r, releases)} />
      ))}
      <section className="panel stack">
        <h2>{tr('Historique')}</h2>
        <HistoryList gameId={game.id} onUndone={load} refresh={game} />
      </section>
      <MergeGame game={game} onMerged={load} />
      <DeleteGame game={game} onDeleted={() => setDeleted(game.title)} />
    </section>
  );
}
