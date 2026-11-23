import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { gamePath, zoneLabel } from '../lib/format';
import type { ImageType, Zone } from '../lib/types';
import { tr } from '../lib/i18n';
import { Cover } from './Cover';

interface WallCover {
  id: number;
  type: ImageType;
  path: string;
  release: {
    id: number;
    local_title: string;
    zone: Zone | null;
    platform: { short_name: string };
    game: { id: number; title: string; slug: string | null };
  };
}

// Jaquettes affichées (3 rangées de 8 sur ordinateur, 12 sur téléphone)
const COUNT = 24;
// Identifiants tirés au hasard : environ la moitié sont des rectos de jeux qui ont un résumé
const SAMPLE = 120;

// Plus grand identifiant d'image : lu une fois par visite
let highest: Promise<number> | null = null;

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Des rectos au hasard, un par jeu, parmi les jeux qui ont un résumé : ce sont en général
// les plus connus (ils ont un article Wikipédia), de quoi donner envie au premier coup d'œil.
// Tirage côté navigateur (des identifiants au hasard) : rien à ajouter dans la base.
async function randomCovers(): Promise<WallCover[]> {
  highest ??= Promise.resolve(supabase.from('image').select('id').order('id', { ascending: false }).limit(1))
    .then(({ data }) => Number(data?.[0]?.id ?? 0));
  const max = await highest;
  if (!max) {
    highest = null;
    return [];
  }
  const ids = [...new Set(Array.from({ length: SAMPLE }, () => 1 + Math.floor(Math.random() * max)))];
  const { data, error } = await supabase.from('image')
    .select('id, type, path, release:release_id!inner(id, local_title, zone, platform(short_name), game!inner(id, title, slug))')
    .eq('type', 'front')
    .not('release.game.summary', 'is', null)
    .in('id', ids);
  if (error) throw error;
  const seen = new Set<number>();
  const unique = ((data ?? []) as unknown as WallCover[]).filter((c) => {
    if (seen.has(c.release.game.id)) return false;
    seen.add(c.release.game.id);
    return true;
  });
  return shuffle(unique).slice(0, COUNT);
}

// « À découvrir » sur l'accueil : un mur de jaquettes, différent à chaque visite et à
// chaque clic sur « Mélanger »
export function CoverWall() {
  const [covers, setCovers] = useState<WallCover[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let active = true;
    randomCovers().then(
      (list) => { if (active) { setCovers(list); setFailed(false); } },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [round]);

  // Base injoignable : l'accueil reste utilisable sans le mur
  if (failed && !covers) return null;
  if (covers && covers.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby="a-decouvrir">
      <div className="section-head">
        <h2 id="a-decouvrir">{tr('À découvrir')}</h2>
        <button type="button" className="button button-small" onClick={() => setRound((r) => r + 1)}>
          <span aria-hidden="true">↻</span>{tr(' Mélanger')}
        </button>
      </div>
      <ul className="cover-wall" aria-busy={!covers}>
        {covers
          ? covers.map((c) => (
            <li key={`${round}-${c.id}`}>
              <Link to={gamePath(c.release.game)} className="cover-wall-link"
                title={`${c.release.local_title} · ${c.release.platform.short_name} · ${zoneLabel(c.release.zone)}`}>
                <Cover images={[{ id: c.id, type: c.type, path: c.path }]} title={c.release.local_title} size="small" platform={c.release.platform.short_name} />
                <span className="cover-wall-title">{c.release.local_title}</span>
              </Link>
            </li>
          ))
          : Array.from({ length: COUNT }, (_, i) => <li key={i} className="cover-wall-placeholder" aria-hidden="true"><span /></li>)}
      </ul>
    </section>
  );
}
