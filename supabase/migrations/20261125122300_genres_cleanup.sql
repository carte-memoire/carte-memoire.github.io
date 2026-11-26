-- =====================================================================
-- Carte Mémoire · Genres : libellés en français, vrais genres dans leur famille,
-- doublons fusionnés, genres qui manquaient (audit du 26 novembre 2026)
--
-- 1. Libellés restés en anglais (« Falling block puzzle game », « Romance video game »…)
--    traduits ; « Liste de jeux vidéo basés sur les Jeux olympiques » devient « Jeux
--    olympiques ».
-- 2. Vrais genres rangés en thèmes, donc absents des filtres par famille : match-3,
--    sokoban (réflexion), karaté (combat), volley-ball, tennis de table (sport), dungeon
--    crawler (RPG), tir à défilement (tir)… rejoignent leur famille.
-- 3. Doublons fusionnés : « Boxe » dans « Jeu de boxe », « Flipper » dans « Jeu de
--    flipper », « Jeu de trivia » dans « Jeu de quiz », « Mascot racer » dans le karting…
--    L'identifiant Wikidata du genre fusionné reste en alias (public.genre_alias) : un
--    prochain import relie ses jeux au bon genre.
-- 4. Genres qui manquaient : jeu de danse (Dance Dance Revolution), collection de monstres
--    (Pokémon, Digimon World), jeu de survie, tower defense ; et la famille Éducatif.
-- =====================================================================

-- Renomme p_old en p_new (ou le fusionne dans p_new s'il existe déjà) ; familles en option
create or replace function pg_temp.fix_genre(p_old text, p_new text, p_families public.genre_family[] default null)
returns void
language plpgsql
as $$
declare
  v_old public.genre;
  v_new public.genre;
begin
  select * into v_old from public.genre where name = p_old;
  if not found then
    update public.genre set families = coalesce(p_families, families) where name = p_new;
    return;
  end if;
  select * into v_new from public.genre where name = p_new and id <> v_old.id;
  if found then
    insert into public.game_genre (game_id, genre_id)
    select gg.game_id, v_new.id from public.game_genre gg where gg.genre_id = v_old.id
    on conflict do nothing;
    delete from public.game_genre where genre_id = v_old.id;
    if v_old.wikidata_id is not null then
      insert into public.genre_alias (wikidata_id, genre_id) values (v_old.wikidata_id, v_new.id)
      on conflict (wikidata_id) do update set genre_id = excluded.genre_id;
    end if;
    delete from public.genre where id = v_old.id;
    update public.genre set families = coalesce(p_families, families) where id = v_new.id;
  else
    update public.genre set name = p_new, families = coalesce(p_families, families) where id = v_old.id;
  end if;
end;
$$;

-- Retire une catégorie qui ne dit rien du jeu (son identifiant reste, sans genre)
create or replace function pg_temp.remove_genre(p_name text)
returns void
language plpgsql
as $$
declare
  v public.genre;
begin
  select * into v from public.genre where name = p_name;
  if not found then
    return;
  end if;
  if v.wikidata_id is not null then
    insert into public.genre_alias (wikidata_id, genre_id) values (v.wikidata_id, null)
    on conflict (wikidata_id) do update set genre_id = null;
  end if;
  delete from public.game_genre where genre_id = v.id;
  delete from public.genre where id = v.id;
end;
$$;

-- 1. Libellés en français
select pg_temp.fix_genre('Character action', 'Action à combos');
select pg_temp.fix_genre('3D fighting game', 'Jeu de combat en 3D');
select pg_temp.fix_genre('Cinematic platformer', 'Plates-formes cinématique');
select pg_temp.fix_genre('Isometric platformer', 'Plates-formes en vue isométrique');
select pg_temp.fix_genre('Driving video game', 'Jeu de conduite');
select pg_temp.fix_genre('Personal watercraft racing video game', 'Jeu de course de jet-ski');
select pg_temp.fix_genre('Kyōtei video game', 'Jeu de kyōtei');
select pg_temp.fix_genre('Sim racing', 'Simulation de course automobile');
select pg_temp.fix_genre('BMX video game', 'Jeu de BMX');
select pg_temp.fix_genre('Shogi video game', 'Jeu de shōgi');
select pg_temp.fix_genre('Falling block puzzle game', 'Puzzle à blocs tombants');
select pg_temp.fix_genre('Puzz Loop clone', 'Jeu de billes en chaîne');
select pg_temp.fix_genre('Romance video game', 'Jeu de romance');
select pg_temp.fix_genre('Walking simulator', 'Simulateur de marche');
select pg_temp.fix_genre('Tube shooter', 'Jeu de tir en tunnel');
select pg_temp.fix_genre('Non-game', 'Logiciel (pas un jeu)');
select pg_temp.fix_genre('Urban crawl', 'Exploration urbaine');
select pg_temp.fix_genre('Liste de jeux vidéo basés sur les Jeux olympiques', 'Jeux olympiques');
select pg_temp.fix_genre('Fantasy sport', 'Gestion d''équipe imaginaire');

-- 2. Vrais genres rangés en thèmes : dans leur famille
select pg_temp.fix_genre('Jeu de correspondance de tuile', 'Jeu de correspondance de tuiles', '{puzzle}');
select pg_temp.fix_genre('Jeu de match-3', 'Jeu de match-3', '{puzzle}');
select pg_temp.fix_genre('Jeu de sokoban', 'Jeu de sokoban', '{puzzle}');
select pg_temp.fix_genre('Jeu de solitaire', 'Jeu de solitaire', '{party}');
select pg_temp.fix_genre('Jeu de backgammon', 'Jeu de backgammon', '{party}');
select pg_temp.fix_genre('Bingo', 'Jeu de bingo', '{party}');
select pg_temp.fix_genre('Jeu vidéo traditionnel', 'Jeu traditionnel', '{party}');
select pg_temp.fix_genre('Jeu de karaté', 'Jeu de karaté', '{fighting,sports}');
select pg_temp.fix_genre('Jeu de tennis de table', 'Jeu de tennis de table', '{sports}');
select pg_temp.fix_genre('Jeu de volley-ball', 'Jeu de volley-ball', '{sports}');
select pg_temp.fix_genre('Jeu de hockey', 'Jeu de hockey', '{sports}');
select pg_temp.fix_genre('Jeu de simulation agricole', 'Jeu de simulation agricole', '{simulation}');
select pg_temp.fix_genre('Jeu de simulation gouvernementale', 'Jeu de simulation gouvernementale', '{simulation,strategy}');
select pg_temp.fix_genre('Jeu incrémental', 'Jeu incrémental', '{simulation}');
select pg_temp.fix_genre('Jeu de tir à défilement', 'Jeu de tir à défilement', '{shooter}');
select pg_temp.fix_genre('Jeu de tir à défilement horizontal', 'Jeu de tir à défilement horizontal', '{shooter}');
select pg_temp.fix_genre('Cabal shooter', 'Jeu de tir à la Cabal', '{shooter}');
select pg_temp.fix_genre('Beat them all à défilement horizontal', 'Beat them all à défilement horizontal', '{action}');
select pg_temp.fix_genre('Immersive sim', 'Immersive sim', '{action}');
select pg_temp.fix_genre('Dungeon crawler', 'Dungeon crawler', '{rpg}');
select pg_temp.fix_genre('Jeu d''horreur cosmique', 'Jeu d''horreur cosmique', '{horror}');
select pg_temp.fix_genre('Fiction interactive', 'Fiction interactive', '{adventure}');
select pg_temp.fix_genre('Éducatif', 'Jeu éducatif', '{education}');
select pg_temp.fix_genre('Apprentissage des langues', 'Apprentissage des langues', '{education}');
select pg_temp.fix_genre('Jeu de dactylographie', 'Jeu de dactylographie', '{education}');

-- 3. Doublons
select pg_temp.fix_genre('Mascot racer', 'Jeu de course de karting');
select pg_temp.fix_genre('Billiard video game', 'Jeu de billard');
select pg_temp.fix_genre('Boxe', 'Jeu de boxe');
select pg_temp.fix_genre('Flipper', 'Jeu de flipper');
select pg_temp.fix_genre('Pistolet optique', 'Jeu de tir au pistolet optique');
select pg_temp.fix_genre('Jeu de trivia', 'Jeu de quiz');
select pg_temp.fix_genre('Minigame collection', 'Mini-jeu');
select pg_temp.fix_genre('Mini-jeu', 'Recueil de mini-jeux');
select pg_temp.fix_genre('Management simulation game', 'Jeu de gestion');
select pg_temp.fix_genre('Romance adventure game', 'Jeu de romance');
select pg_temp.fix_genre('Murder mystery game', 'Jeu de mystère');
select pg_temp.fix_genre('Jeu de mystère', 'Jeu d''enquête');
select pg_temp.fix_genre('Interactive storytelling', 'Fiction interactive');
select pg_temp.fix_genre('Parlour game', 'Party game');
select pg_temp.fix_genre('Jeu d''arcade', 'Arcade');
select pg_temp.remove_genre('Graphisme 2D');

-- 4. Genres qui manquaient (identifiants Wikidata vérifiés le 26 novembre 2026)
insert into public.genre (name, wikidata_id, families) values
  ('Jeu de danse', 'Q2187138', '{music}'),
  ('Jeu de collection de monstres', 'Q117474613', '{rpg}'),
  ('Jeu de survie', 'Q21030988', '{action}'),
  ('Tower defense', 'Q1137896', '{strategy}')
on conflict do nothing;

-- Les jeux de danse connus de la base, rangés jusqu'ici en jeu de rythme ou de musique :
-- Dance Dance Revolution, DDRMAX, Dancing Stage, Pump It Up, Bust a Groove (Bust a Move)…
insert into public.game_genre (game_id, genre_id)
select g.id, (select id from public.genre where wikidata_id = 'Q2187138')
from public.game g
where not g.genres_reviewed
  and (g.title ~* '^(dance ?dance ?revolution|ddrmax|dancing stage|pump it up|bust a (groove|move)|para ?para paradise)'
       or g.title ~* '\m(dance ?dance ?revolution|dancing stage)\M')
on conflict do nothing;

-- Collection de monstres : Pokémon (jeux principaux), Digimon World, Monster Rancher,
-- Dragon Quest Monsters, Shin Megami Tensei Devil Children, Robopon, Medabots…
insert into public.game_genre (game_id, genre_id)
select g.id, (select id from public.genre where wikidata_id = 'Q117474613')
from public.game g
where not g.genres_reviewed
  and g.title ~* '^(pok[eé]mon (red|blue|green|yellow|gold|silver|crystal|ruby|sapphire|emerald|firered|leafgreen|rouge|bleu|vert|jaune|or|argent|cristal)|pocket monsters|digimon world|monster rancher|monster farm|dragon (quest|warrior) monsters|robopon|medabots|medarot|shin megami tensei:? devil children|telefang|keitai denj[uū] telefang)'
on conflict do nothing;

drop function pg_temp.fix_genre(text, text, public.genre_family[]);
drop function pg_temp.remove_genre(text);
