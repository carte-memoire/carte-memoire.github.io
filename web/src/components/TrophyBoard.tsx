import { formatNumber } from '../lib/format';
import { TIERS, tierLabel, type Trophy, type TrophyStats } from '../lib/trophies';
import { MemoryBar } from './MemoryBar';
import { TrophyIcon } from './TrophyIcon';
import { tr } from '../lib/i18n';

// Avancement d'un trophée : « 37 / 50 », ou en pour cent pour la part du catalogue
function progressText(t: Trophy, stats: TrophyStats): string {
  if (t.counter === 'best_share_percent') {
    const where = stats.best_share_platform ? ` (${stats.best_share_platform}${stats.best_share_zone ? ` ${stats.best_share_zone}` : ''})` : '';
    return `${formatNumber(Math.min(t.current, t.target))} % / ${t.target} %${where}`;
  }
  return `${formatNumber(Math.min(t.current, t.target))} / ${formatNumber(t.target)}`;
}

// Le tableau des trophées : le total façon carte mémoire, le compte par rang,
// puis chaque trophée avec son avancement. `onlyUnlocked` : page d'un autre membre.
export function TrophyBoard({ trophies, stats, onlyUnlocked = false }: { trophies: Trophy[]; stats: TrophyStats; onlyUnlocked?: boolean }) {
  const unlocked = trophies.filter((t) => t.unlocked);
  const shown = onlyUnlocked ? unlocked : trophies;
  return (
    <div className="trophy-board">
      <div className="panel trophy-summary">
        <p className="progress-figure">
          <strong>{formatNumber(unlocked.length)}</strong> / {formatNumber(trophies.length)}{tr(' trophées')}
        </p>
        <MemoryBar owned={unlocked.length} total={trophies.length} label={tr('Trophées débloqués')} />
        <ul className="trophy-tiers" aria-label={tr('Par rang')}>
          {TIERS.map((tier) => (
            <li key={tier.value} title={tier.label}>
              <TrophyIcon tier={tier.value} />
              <span>{formatNumber(unlocked.filter((t) => t.tier === tier.value).length)}</span>
              <span className="sr-only"> {tier.label}</span>
            </li>
          ))}
        </ul>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{tr('Aucun trophée pour le moment.')}</p>
      ) : (
        <ul className="trophy-grid">
          {shown.map((t) => (
            <li key={t.code} className={t.unlocked ? `trophy-card tier-${t.tier}` : `trophy-card tier-${t.tier} is-locked`}>
              <TrophyIcon tier={t.tier} locked={!t.unlocked} />
              <div className="trophy-text">
                <p className="trophy-title">{t.title}</p>
                <p className="trophy-description">{t.description}</p>
                <p className="trophy-meta">
                  <span className="trophy-tier">{tierLabel(t.tier)}</span>
                  {!t.unlocked && <span> · {progressText(t, stats)}</span>}
                </p>
                {!t.unlocked && (
                  <span className="trophy-progress" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (t.current / t.target) * 100)}%` }} />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Page publique d'un membre : ses trophées débloqués, en une rangée de pastilles
export function TrophyStrip({ trophies }: { trophies: Trophy[] }) {
  const unlocked = trophies.filter((t) => t.unlocked);
  return (
    <div className="panel trophy-strip">
      <h2>{tr('Trophées')} <span className="muted">({formatNumber(unlocked.length)} / {formatNumber(trophies.length)})</span></h2>
      {unlocked.length === 0 ? (
        <p className="muted small">{tr('Aucun trophée pour le moment.')}</p>
      ) : (
        <ul className="trophy-chips">
          {unlocked.map((t) => (
            <li key={t.code} className={`trophy-chip tier-${t.tier}`} title={`${tierLabel(t.tier)} · ${t.description}`}>
              <TrophyIcon tier={t.tier} />
              <span>{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
