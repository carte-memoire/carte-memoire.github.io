import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { TROPHY_EVENT, computeTrophies, tierLabel, type Trophy, type TrophyStats } from '../lib/trophies';
import { TrophyIcon } from './TrophyIcon';
import { tr } from '../lib/i18n';

const seenKey = (userId: string) => `carte-memoire:trophees-vus:${userId}`;

function readSeen(userId: string): string[] | null {
  try {
    const value = JSON.parse(localStorage.getItem(seenKey(userId)) ?? 'null');
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Surveille les trophées de la personne connectée : après chaque changement de sa
// collection, les trophées tout juste débloqués s'annoncent en haut de l'écran,
// l'un après l'autre. Sur un nouvel appareil, ceux déjà obtenus ne s'annoncent pas.
export function TrophyWatcher({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<Trophy[]>([]);

  const check = useCallback(async () => {
    const { data, error } = await supabase.rpc('trophy_stats');
    const stats = ((data as TrophyStats[] | null) ?? [])[0];
    if (error || !stats) return;
    const unlocked = computeTrophies(stats).filter((t) => t.unlocked);
    const seen = readSeen(userId);
    const fresh = seen ? unlocked.filter((t) => !seen.includes(t.code)) : [];
    try {
      localStorage.setItem(seenKey(userId), JSON.stringify([...new Set([...(seen ?? []), ...unlocked.map((t) => t.code)])]));
    } catch { /* stockage indisponible : pas d'annonce, les trophées restent sur leur page */ }
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh.filter((t) => !q.some((x) => x.code === t.code))]);
  }, [userId]);

  useEffect(() => { check(); }, [check]);

  // Un ajout, un retrait… : on relit les compteurs, une fois les changements terminés
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => { clearTimeout(timer); timer = setTimeout(check, 700); };
    window.addEventListener(TROPHY_EVENT, changed);
    return () => { clearTimeout(timer); window.removeEventListener(TROPHY_EVENT, changed); };
  }, [check]);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), 5500);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  return (
    <Link key={current.code} to="/trophees" className={`trophy-popup tier-${current.tier}`} role="status" onClick={() => setQueue((q) => q.slice(1))}>
      <TrophyIcon tier={current.tier} />
      <span className="trophy-popup-text">
        <span className="trophy-popup-label">{tr('Trophée débloqué')} · {tierLabel(current.tier)}</span>
        <strong>{current.title}</strong>
        <span className="trophy-popup-description">{current.description}</span>
      </span>
    </Link>
  );
}
