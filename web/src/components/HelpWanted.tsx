import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatNumber } from '../lib/format';
import { tr } from '../lib/i18n';
import { PsSymbol, type PsShape } from './PsSymbol';

interface Gaps { releases_without_cover: number; games_without_summary: number; games_without_genre: number }

// « Aide-nous à compléter la base » : ce qui manque encore au catalogue, et comment
// chacun peut le compléter. Les sources libres (Wikidata, Wikipédia, Redump,
// libretro) sont épuisées pour ces informations : le reste viendra des membres.
// Les nombres viennent de la base (catalog_gaps) ; sans eux, le texte reste juste.
export function HelpWanted({ signedIn }: { signedIn: boolean }) {
  const [gaps, setGaps] = useState<Gaps | null>(null);
  useEffect(() => {
    let active = true;
    supabase.rpc('catalog_gaps').then(({ data, error }) => {
      if (active && !error) setGaps(((data as Gaps[] | null) ?? [])[0] ?? null);
    });
    return () => { active = false; };
  }, []);

  const cards: { shape: PsShape; title: string; count: string | null; text: string; link?: { to: string; label: string } }[] = [
    {
      shape: 'circle',
      title: tr('Jaquettes'),
      count: gaps ? tr('{0} version{1?s} sans jaquette', formatNumber(gaps.releases_without_cover), gaps.releases_without_cover > 1) : null,
      text: tr('Tu as le jeu ? Prends sa boîte en photo avec ton téléphone : le site la redresse et la recadre.'),
      link: signedIn ? { to: '/collection?jaquette=manquante', label: tr('Mes jeux sans jaquette') } : undefined,
    },
    {
      shape: 'triangle',
      title: tr('Résumés'),
      count: gaps ? tr('{0} jeu{1?x} sans résumé', formatNumber(gaps.games_without_summary), gaps.games_without_summary > 1) : null,
      text: tr('Quelques lignes suffisent : « Proposer un résumé », sur la fiche du jeu.'),
    },
    {
      shape: 'square',
      title: tr('Genres'),
      count: gaps ? tr('{0} jeu{1?x} sans genre', formatNumber(gaps.games_without_genre), gaps.games_without_genre > 1) : null,
      text: tr('Tu connais le genre ? « Suggérer une correction » sur la fiche du jeu, puis « Genres ».'),
    },
    {
      shape: 'cross',
      title: tr('Jeux manquants'),
      count: null,
      text: tr('Un jeu ou une version manque à l’appel ? Propose-le : un modérateur vérifie avant de le publier.'),
      link: { to: '/proposer', label: tr('Proposer un jeu') },
    },
  ];

  return (
    <section className="panel welcome help-wanted" aria-labelledby="aide">
      <h2 id="aide">{tr('Aide-nous à compléter la base')}</h2>
      <p className="welcome-intro">
        {tr('Les données libres (Wikipédia, Wikidata, Redump) ont donné tout ce qu’elles pouvaient. Le reste, ce sont les collectionneurs qui l’apportent : chaque contribution est vérifiée par un modérateur.')}
      </p>
      <ul className="welcome-grid">
        {cards.map((c) => (
          <li key={c.shape} className={`welcome-card welcome-${c.shape}`}>
            <h3><PsSymbol shape={c.shape} colored /> {c.title}</h3>
            {c.count && <p className="help-count">{c.count}</p>}
            <p>{c.text}</p>
            {c.link && <p className="help-link"><Link to={c.link.to}>{c.link.label}</Link></p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
