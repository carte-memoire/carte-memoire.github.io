-- =====================================================================
-- Carte Mémoire · Migration 4 : date de première sortie d'un jeu
--
-- Wikidata connaît souvent l'année de sortie d'un jeu sans savoir dans
-- quelle région (85 % des jeux PS1 ont une date, 16 % seulement par région).
-- Sans cette colonne, ces dates seraient perdues : elles servent à afficher
-- « 1997 » dans les listes, à trier, à filtrer par année…
--
-- C'est la première sortie de l'ŒUVRE, toutes plateformes confondues
-- (Tekken : 1994 en arcade, même si la version PS1 date de 1995).
-- =====================================================================

alter table public.game
  add column first_release_date      date,
  add column first_release_precision public.date_precision,
  add constraint game_first_release_check
    check ((first_release_date is null) = (first_release_precision is null)),
  add constraint game_first_release_month_check
    check (first_release_precision is distinct from 'month'
           or extract(day from first_release_date) = 1),
  add constraint game_first_release_year_check
    check (first_release_precision is distinct from 'year'
           or (extract(day from first_release_date) = 1 and extract(month from first_release_date) = 1));

create index on public.game (first_release_date);
