-- =====================================================================
-- Carte Mémoire · Genres des jeux Nintendo 64 encore sans genre, depuis libretro-database
-- Fichier GÉNÉRÉ par scripts/import-genres-libretro.mjs le 2026-11-27.
-- Source : libretro-database, metadat/genre (licence CC BY-SA 4.0),
--   https://github.com/libretro/libretro-database
--
-- 4 jeux. Seulement ceux qui n'ont toujours aucun genre (de famille) au moment
-- de s'appliquer, et jamais un jeu revu par un modérateur. Jeux désignés par leur numéro ET
-- leur titre (garde-fou).
-- =====================================================================

insert into public.game_genre (game_id, genre_id)
select g.id, ge.id
from (values
  (15904, 'Super Smash Bros.', 'Q846224', null),
  (15965, 'ClayFighter: Sculptor''s Cut', 'Q846224', null),
  (15967, 'Onegai Monsters', 'Q744038', null),
  (15970, 'Space Invaders', 'Q4282636', null)
) as v (game_id, title, genre_qid, genre_name)
join public.game g on g.id = v.game_id and g.title = v.title
join public.genre ge on ge.wikidata_id = v.genre_qid or (v.genre_qid is null and ge.name = v.genre_name)
where not g.genres_reviewed
  and not exists (select 1 from public.game_genre gg join public.genre x on x.id = gg.genre_id
                  where gg.game_id = g.id and cardinality(x.families) > 0)
on conflict do nothing;
