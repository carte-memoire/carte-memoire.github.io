-- =====================================================================
-- Thèmes et genres : libellés en français, doublons fusionnés, faux thèmes retirés
-- (audit du 22 novembre 2026)
--
-- Les « thèmes » (genres sans famille) venaient tels quels des catégories de Wikidata :
-- libellés anglais (« Mecha video game »), doublons (« Jeu vidéo avec des personnages
-- LGBT » et « Thèmes LGBT dans les jeux vidéo »), catégories qui ne disent rien du jeu
-- (« Infographie tridimensionnelle », « Manga et animé romantique »), et de vrais genres
-- rangés sans famille (« Jeu de cricket », « Jeu de rallye »), donc affichés en thèmes.
--
-- public.genre_alias garde l'identifiant Wikidata d'un genre fusionné (→ le genre qui le
-- remplace) ou retiré (→ aucun) : un import futur (nouvelles consoles) ne le recrée pas et
-- relie ses jeux au bon genre (scripts/import-wikidata.mjs).
-- =====================================================================

create table public.genre_alias (
  wikidata_id text primary key check (wikidata_id ~ '^Q[0-9]+$'),
  genre_id    bigint references public.genre (id) on delete cascade,
  created_at  timestamptz not null default now()
);
comment on table public.genre_alias is
  'Identifiant Wikidata d''un genre fusionné (genre_id = celui qui le remplace) ou retiré (genre_id vide) : les imports ne le recréent pas.';
alter table public.genre_alias enable row level security;
revoke all on public.genre_alias from anon, authenticated;
grant select on public.genre_alias to anon, authenticated;
create policy "Genre aliases: public read" on public.genre_alias for select to anon, authenticated using (true);

-- Renomme p_old en p_new ; si p_new existe déjà, fusionne p_old dedans. Familles en option.
create function pg_temp.regenre(p_old text, p_new text, p_families public.genre_family[] default null)
returns void
language plpgsql
as $$
declare
  v_old public.genre;
  v_new public.genre;
begin
  select * into v_old from public.genre where name = p_old;
  if not found then
    -- Déjà fait, ou genre absent (base de test) : on applique au moins les familles
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

-- Retire un faux thème (catégorie qui ne dit rien du jeu)
create function pg_temp.drop_genre(p_name text)
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

-- 1. Thèmes : libellés français courts, doublons fusionnés
select pg_temp.regenre('Jeu de science-fiction', 'Science-fiction');
select pg_temp.regenre('Jeu vidéo cyberpunk', 'Cyberpunk');
select pg_temp.regenre('Jeu vidéo postapocalyptique', 'Post-apocalyptique');
select pg_temp.regenre('Mecha', 'Mecha video game');           -- le plus utilisé garde ses liens…
select pg_temp.regenre('Mecha video game', 'Mecha');           -- …puis prend le nom court
select pg_temp.regenre('Jeu vidéo avec des personnages LGBT', 'LGBT');
select pg_temp.regenre('Thèmes LGBT dans les jeux vidéo', 'LGBT');
select pg_temp.regenre('Jeu vidéo historique', 'Historique');
select pg_temp.regenre('Fiction historique', 'Historique');
select pg_temp.regenre('Dark fantasy video game', 'Dark fantasy');
select pg_temp.regenre('Christmas video game', 'Noël');
select pg_temp.regenre('Jeu de fantasy', 'Fantasy');
select pg_temp.regenre('Manga et animé de fantasy', 'Fantasy');
select pg_temp.regenre('Vampire video game', 'Vampires');
select pg_temp.regenre('Space opera video game', 'Space opera');
select pg_temp.regenre('Jeu vidéo yuri', 'Yuri');
select pg_temp.regenre('Halloween video game', 'Halloween');
select pg_temp.regenre('Erotic video game', 'Eroge');
select pg_temp.regenre('Erotic game', 'Eroge');
select pg_temp.regenre('Érotisme', 'Eroge');
select pg_temp.regenre('Hentai', 'Eroge');
select pg_temp.regenre('Boys'' Love game', 'Boys'' love');
select pg_temp.regenre('Jeu vidéo épisodique', 'Épisodique');
select pg_temp.regenre('Neo-noir video game', 'Néo-noir');
select pg_temp.regenre('TechNoir', 'Néo-noir');
select pg_temp.regenre('Superhero video game', 'Super-héros');
select pg_temp.regenre('Magical girl video game', 'Magical girl');
select pg_temp.regenre('Jeu vidéo uchronique', 'Uchronie');
select pg_temp.regenre('Urban fantasy video game', 'Fantasy urbaine');
select pg_temp.regenre('Psychological thriller video game', 'Thriller psychologique');
select pg_temp.regenre('Zombie video game', 'Zombies');
select pg_temp.regenre('Gothic video game', 'Gothique');
select pg_temp.regenre('Time travel video game', 'Voyage dans le temps');
select pg_temp.regenre('Christian video game', 'Chrétien');
select pg_temp.regenre('Jeu vidéo du comédie', 'Comédie');
select pg_temp.regenre('Animé et manga comique', 'Comédie');
select pg_temp.regenre('Animé et manga en milieu scolaire', 'Milieu scolaire');
select pg_temp.regenre('Jeu vidéo publicitaire', 'Publicitaire');
select pg_temp.regenre('Logiciel ludo-éducatif', 'Éducatif');
select pg_temp.regenre('Ludopédagogie', 'Éducatif');
select pg_temp.regenre('Jeu vidéo d’apprentissage de la langue', 'Apprentissage des langues');
select pg_temp.regenre('Compilation de jeux vidéo', 'Compilation');
select pg_temp.regenre('Jeu d''arcade', 'Arcade');
select pg_temp.regenre('Jeu en ligne massivement multijoueur', 'Massivement multijoueur');
select pg_temp.regenre('Live action video game', 'Full motion video');

-- 2. Faux thèmes : catégories de technique, de cinéma ou d'animé, sans rien dire du jeu
select pg_temp.drop_genre('Infographie tridimensionnelle');
select pg_temp.drop_genre('Jeu vidéo en 3D');
select pg_temp.drop_genre('Jeu vidéo à défilement horizontal');
select pg_temp.drop_genre('Vue objective');
select pg_temp.drop_genre('Série B');
select pg_temp.drop_genre('Film ou téléfilm d''amour');
select pg_temp.drop_genre('Roman graphique');
select pg_temp.drop_genre('Manga et animé de genre drama');
select pg_temp.drop_genre('Manga et animé romantique');
select pg_temp.drop_genre('Manga ou anime d''aventure');
select pg_temp.drop_genre('Suspense anime and manga');
select pg_temp.drop_genre('Family game');
select pg_temp.drop_genre('Jeu occasionnel');

-- 3. Vrais genres rangés sans famille : ils passent dans leur famille (et quittent les thèmes)
select pg_temp.regenre('Jeu de cricket', 'Jeu de cricket', '{sports}');
select pg_temp.regenre('Jeu de football australien', 'Jeu de football australien', '{sports}');
select pg_temp.regenre('Jeu de cyclisme', 'Jeu de cyclisme', '{sports}');
select pg_temp.regenre('Jeu de rugby à XV', 'Jeu de rugby', '{sports}');
select pg_temp.regenre('Jeu d''équitation', 'Jeu d''équitation', '{sports}');
select pg_temp.regenre('Biathlon video game', 'Jeu de biathlon', '{sports}');
select pg_temp.regenre('Ski jumping video game', 'Jeu de saut à ski', '{sports}');
select pg_temp.regenre('Gaelic games video game', 'Jeu de sports gaéliques', '{sports}');
select pg_temp.regenre('Exergaming', 'Jeu de fitness', '{sports}');
select pg_temp.regenre('Paintball video game', 'Jeu de paintball', '{sports,shooter}');
select pg_temp.regenre('Jeu de course tout-terrain', 'Jeu de course tout-terrain', '{racing}');
select pg_temp.regenre('Jeu de rallye', 'Jeu de rallye', '{racing}');
select pg_temp.regenre('Jeu de dragster', 'Jeu de dragster', '{racing}');
select pg_temp.regenre('Jeu de course d''arcade', 'Jeu de course d''arcade', '{racing}');
select pg_temp.regenre('Jeu de karaoké', 'Karaoké', '{music}');
select pg_temp.regenre('Karaoké', 'Karaoké', '{music}');
select pg_temp.regenre('Jeu de poker', 'Jeu de poker', '{party}');
select pg_temp.regenre('Jeu de rôle en ligne massivement multijoueur', 'MMORPG', '{rpg}');
select pg_temp.regenre('Jeu de rôle à perspectives multiples', 'Jeu de rôle à perspectives multiples', '{rpg}');
select pg_temp.regenre('Kinetic novel', 'Kinetic novel', '{visual_novel}');
select pg_temp.regenre('Sound novel', 'Sound novel', '{visual_novel}');
select pg_temp.regenre('Charage', 'Charage', '{visual_novel}');
select pg_temp.regenre('Character-action video game', 'Character action', '{action}');
select pg_temp.regenre('Crowd-combat', 'Combat de foule', '{action}');
select pg_temp.regenre('Arena fighter', 'Combat en arène', '{fighting}');
select pg_temp.regenre('Collect-a-thon platformer', 'Plates-formes de collecte', '{platform}');
select pg_temp.regenre('Boomer shooter', 'Boomer shooter', '{shooter}');
select pg_temp.regenre('Simulateur de navire', 'Simulateur de navire', '{simulation}');
select pg_temp.regenre('Jeu de simulation biologique', 'Jeu de simulation biologique', '{simulation}');
select pg_temp.regenre('Typing game', 'Jeu de dactylographie', '{puzzle}');
select pg_temp.regenre('Fantasy sports video game', 'Fantasy sport', '{sports,simulation}');

drop function pg_temp.regenre(text, text, public.genre_family[]);
drop function pg_temp.drop_genre(text);
