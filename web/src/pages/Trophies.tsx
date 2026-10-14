import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { computeTrophies, type TrophyStats } from '../lib/trophies';
import { TrophyBoard } from '../components/TrophyBoard';
import { PsSymbol } from '../components/PsSymbol';
import { tr } from '../lib/i18n';
import { usePageTitle } from '../lib/title';

// Mes trophées : propres au site, calculés à partir de ma collection et de mes contributions
export function TrophiesPage() {
  usePageTitle(tr('Mes trophées'));
  const [stats, setStats] = useState<TrophyStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.rpc('trophy_stats').then(({ data, error }) => {
      if (!active) return;
      if (error) return setError(errorMessage(error));
      setStats(((data as TrophyStats[] | null) ?? [])[0] ?? null);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <h1>{tr('Mes trophées')}</h1>
          <p className="muted">{tr("Des objectifs de collectionneur, propres à Carte Mémoire : ils se débloquent au fil de ta collection et de tes contributions.")}</p>
        </div>
        <div className="actions">
          <Link to="/collection" className="button"><PsSymbol shape="triangle" />{tr(' Ma collection')}</Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!stats && !error && <p className="loading">{tr('Lecture de la carte mémoire…')}</p>}
      {stats && <TrophyBoard trophies={computeTrophies(stats)} stats={stats} />}
    </section>
  );
}
