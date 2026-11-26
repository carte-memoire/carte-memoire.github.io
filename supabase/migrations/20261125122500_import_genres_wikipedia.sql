-- =====================================================================
-- Carte Mémoire · Genres des jeux depuis Wikipédia en anglais
-- Fichier GÉNÉRÉ par scripts/import-genres.mjs le 2026-11-26.
-- Source : encadré « Genre » des articles Wikipédia en anglais (CC BY-SA).
--
-- 86 jeux. Pour chacun, Wikipédia décide des familles (RPG, Sport…) :
-- les genres actuels hors de ces familles sont retirés, ceux de Wikipédia ajoutés.
-- Les thèmes (science-fiction…) restent ; les jeux revus par un modérateur ne
-- sont pas touchés.
-- =====================================================================

create temporary table import_genre (
  game_qid  text not null,
  genre_qid text not null,
  primary key (game_qid, genre_qid)
);

insert into import_genre (game_qid, genre_qid) values
  ('Q2379922', 'Q1044478'),
  ('Q1197566', 'Q828322'),
  ('Q1790249', 'Q868217'),
  ('Q2264301', 'Q828322'),
  ('Q917503', 'Q1044478'),
  ('Q2321832', 'Q1422746'),
  ('Q2321832', 'Q828322'),
  ('Q2659903', 'Q1044478'),
  ('Q2338283', 'Q868217'),
  ('Q2338283', 'Q1478420'),
  ('Q1014915', 'Q828322'),
  ('Q1066657', 'Q828322'),
  ('Q2700588', 'Q868217'),
  ('Q2700588', 'Q61793886'),
  ('Q2710703', 'Q868217'),
  ('Q2710703', 'Q71474750'),
  ('Q2731595', 'Q868217'),
  ('Q2731595', 'Q60256879'),
  ('Q1041292', 'Q868217'),
  ('Q1041292', 'Q62019045'),
  ('Q1043375', 'Q828322'),
  ('Q1043534', 'Q1044478'),
  ('Q1075814', 'Q54767'),
  ('Q187339', 'Q1422746'),
  ('Q187339', 'Q828322'),
  ('Q204105', 'Q270948'),
  ('Q204105', 'Q13717398'),
  ('Q173626', 'Q13717398'),
  ('Q2513509', 'Q846224'),
  ('Q2513509', 'Q868217'),
  ('Q2532009', 'Q270948'),
  ('Q2532009', 'Q54767'),
  ('Q2530723', 'Q343568'),
  ('Q88759', 'Q828322'),
  ('Q2748771', 'Q343568'),
  ('Q2757019', 'Q868217'),
  ('Q2757019', 'Q62019077'),
  ('Q1995635', 'Q1044478'),
  ('Q2001519', 'Q1044478'),
  ('Q1142493', 'Q270948'),
  ('Q1142493', 'Q828322'),
  ('Q1192514', 'Q1044478'),
  ('Q2815984', 'Q2127647'),
  ('Q2815984', 'Q828322'),
  ('Q1224575', 'Q270948'),
  ('Q1327963', 'Q1044478'),
  ('Q3001971', 'Q2941225'),
  ('Q2107567', 'Q54767'),
  ('Q1439988', 'Q846224'),
  ('Q1514023', 'Q270948'),
  ('Q1514023', 'Q828322'),
  ('Q511995', 'Q653928'),
  ('Q603874', 'Q868217'),
  ('Q603874', 'Q71474750'),
  ('Q625283', 'Q868217'),
  ('Q625283', 'Q63915027'),
  ('Q3477465', 'Q1044478'),
  ('Q677353', 'Q1044478'),
  ('Q3521086', 'Q828322'),
  ('Q854479', 'Q828322'),
  ('Q5398840', 'Q1422746'),
  ('Q10334191', 'Q828322'),
  ('Q11286214', 'Q54767'),
  ('Q28464434', 'Q270948'),
  ('Q28464434', 'Q13717398'),
  ('Q27296', 'Q828322'),
  ('Q12395', 'Q343568'),
  ('Q12384', 'Q828322'),
  ('Q3986143', 'Q54767'),
  ('Q3277744', 'Q9318902'),
  ('Q11331909', 'Q1422746'),
  ('Q11328844', 'Q54767'),
  ('Q11313863', 'Q1224999'),
  ('Q11501817', 'Q23916'),
  ('Q16267624', 'Q584105'),
  ('Q605445', 'Q54767'),
  ('Q847977', 'Q343568'),
  ('Q761452', 'Q343568'),
  ('Q935001', 'Q270948'),
  ('Q56345292', 'Q1224999'),
  ('Q1984732', 'Q1044478'),
  ('Q1984732', 'Q270948'),
  ('Q2422991', 'Q343568'),
  ('Q2866029', 'Q828322'),
  ('Q3022851', 'Q828322'),
  ('Q3197999', 'Q828322'),
  ('Q3155272', 'Q54767'),
  ('Q3482155', 'Q23916'),
  ('Q3357671', 'Q584105'),
  ('Q4907302', 'Q13717398'),
  ('Q3815073', 'Q868217'),
  ('Q3815073', 'Q1478420'),
  ('Q3715533', 'Q744038'),
  ('Q5432792', 'Q1044478'),
  ('Q5245447', 'Q23916'),
  ('Q6428747', 'Q868217'),
  ('Q6352793', 'Q1422746'),
  ('Q7635526', 'Q23916'),
  ('Q6960387', 'Q23916'),
  ('Q6960387', 'Q1339223'),
  ('Q7335808', 'Q343568'),
  ('Q7805184', 'Q23916'),
  ('Q8062794', 'Q23916'),
  ('Q11291191', 'Q828322'),
  ('Q11299567', 'Q744038'),
  ('Q631331', 'Q828322');

-- Familles données par Wikipédia pour chaque jeu (jeux revus par un modérateur exclus)
create temporary table import_genre_game as
select g.id, array_agg(distinct f.family) as families
from import_genre i
join public.game g on g.wikidata_id = i.game_qid
join public.genre ge on ge.wikidata_id = i.genre_qid
cross join lateral unnest(ge.families) as f(family)
where not g.genres_reviewed
group by g.id;

-- Genres actuels hors de ces familles : retirés. Restent les plus précis (« Jeu de
-- football » quand Wikipédia dit « Sport »), ceux dont Wikipédia confirme la famille
-- principale (la première : « Jeu de catch » → sport), et les thèmes.
delete from public.game_genre gg
using public.genre ge, import_genre_game t
where ge.id = gg.genre_id
  and gg.game_id = t.id
  and cardinality(ge.families) > 0
  and not (ge.families <@ t.families or ge.families[1] = any (t.families));

insert into public.game_genre (game_id, genre_id)
select g.id, ge.id
from import_genre i
join public.game g on g.wikidata_id = i.game_qid
join public.genre ge on ge.wikidata_id = i.genre_qid
where g.id in (select id from import_genre_game)
on conflict do nothing;

drop table import_genre_game;
drop table import_genre;
