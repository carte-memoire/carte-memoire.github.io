-- =====================================================================
-- Carte Mémoire · Genres des jeux Nintendo 64 : comme pour les autres consoles
--
-- L'import Wikidata des jeux Nintendo 64 apporte un genre encore inconnu, au libellé anglais :
-- « Sumo wrestling video game » (64 Ōzumō…). Il prend un libellé français et la famille Sport.
-- Son identifiant Wikidata ne change pas : un prochain import le retrouve.
-- =====================================================================

update public.genre
set name = 'Jeu de sumo', families = '{sports}'
where name = 'Sumo wrestling video game'
  and not exists (select 1 from public.genre where name = 'Jeu de sumo');
