-- =====================================================================
-- Fiches « vides » (audit du 22 novembre 2026)
--
-- 8861 jeux en base ; 309 n'avaient que des versions vides (ni zone, ni code, ni date,
-- ni jaquette) : des éléments Wikidata classés PS1/PS2 sans vrai disque derrière. Comparées
-- aux disques Redump et aux autres fiches de la même console, elles se rangent en :
--   1. 15 même jeu qu'une vraie fiche sous un autre titre, repéré par le code produit
--      Redump (Harry Potter à l'école des sorciers, Red Asphalt…). Quatre vraies fiches
--      portaient le titre et l'élément Wikidata d'un AUTRE jeu que leurs versions : elles
--      reprennent le bon (Metal Slug X, Raiden DX, Lethal Enforcers I & II, Air Management '96).
--   2. 45 autre écriture du titre d'une vraie fiche de la même console (« Momotaro
--      Densetsu » / « Momotarou Densetsu », mêmes numéros, titres proches à 70 % au moins).
--   La fiche vide est FUSIONNÉE dans la vraie : elle lui apporte son élément Wikidata (si la
--   vraie n'en a pas), son résumé, ses genres, ses studios, sa série ; ses adresses mènent
--   désormais à la vraie fiche.
--   3. 82 sans aucune trace (aucun disque Redump au nom proche, aucune fiche proche,
--      titre en lettres latines) : Overwatch 2 « sur PS1 », Deadly Premonition, WWE '12…
--      SUPPRIMÉES, chacune notée dans le journal des suppressions.
-- Laissés pour une décision à la main (liste exports/fiches-vides-a-verifier-2026-11-22.csv) :
-- 139 rapprochements incertains, 26 vrais jeux à compléter depuis Redump, et
-- Dance Dance Revolution 4thMix (Konamix et Dancing Stage Party Edition mêlés).
-- Toute fiche qui a changé depuis (une version, une jaquette, un exemplaire) est laissée.
-- =====================================================================

-- Une fiche vide l'est-elle toujours ?
create function pg_temp.still_empty(p_game bigint)
returns boolean
language sql
as $$
  select not exists (
    select 1 from public.release r
    where r.game_id = p_game
      and (r.zone is not null or r.product_code is not null
        or exists (select 1 from public.image i where i.release_id = r.id)
        or exists (select 1 from public.release_region rr where rr.release_id = r.id and rr.release_date is not null)
        or exists (select 1 from public.collection_item c where c.release_id = r.id)
        or exists (select 1 from public.release_barcode b where b.release_id = r.id))
  );
$$;

-- Fusion d'une fiche vide (élément Wikidata p_dup) dans la vraie fiche p_keep
create function pg_temp.absorb(p_keep bigint, p_dup text, p_final text default null, p_title text default null)
returns void
language plpgsql
as $$
declare
  v_dup  public.game;
  v_date date;
  v_prec public.date_precision;
begin
  select * into v_dup from public.game where wikidata_id = p_dup;
  if p_keep is null or v_dup.id is null or p_keep = v_dup.id or not pg_temp.still_empty(v_dup.id) then
    raise notice 'Fusion % ignorée', p_dup;
    return;
  end if;
  perform public.merge_games(p_keep, v_dup.id, true);
  if p_final is not null then
    update public.game set wikidata_id = p_final where id = p_keep and wikidata_id is distinct from p_final;
  end if;
  if p_title is not null then
    -- Titre corrigé : la date était celle de l'autre jeu ; on prend celle de la fiche vide,
    -- sinon la plus ancienne sortie connue des versions
    select v_dup.first_release_date, v_dup.first_release_precision into v_date, v_prec;
    if v_date is null then
      select rr.release_date, rr.date_precision into v_date, v_prec
      from public.release r join public.release_region rr on rr.release_id = r.id
      where r.game_id = p_keep and rr.release_date is not null
      order by rr.release_date limit 1;
    end if;
    update public.game set title = p_title, first_release_date = v_date, first_release_precision = v_prec
    where id = p_keep;
  end if;
end;
$$;

-- Vraie fiche d'un titre sur une console (une seule, sinon rien)
create function pg_temp.game_on(p_title text, p_console text)
returns bigint
language sql
as $$
  select case when count(*) = 1 then min(g.id) end
  from public.game g
  where g.title = p_title
    and exists (select 1 from public.release r join public.platform p on p.id = r.platform_id
                where r.game_id = g.id and p.short_name = p_console and r.zone is not null);
$$;

-- 1. Même jeu sous un autre titre (par le code produit)
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLUS-01212' order by r.id limit 1), 'Q1072820', 'Q1072820', 'Metal Slug X');
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLES-03662' order by r.id limit 1), 'Q719960', 'Q719960', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLES-00056' order by r.id limit 1), 'Q56350490', 'Q56350490', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLPS-01252' order by r.id limit 1), 'Q3403915', 'Q3403915', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLES-00575' order by r.id limit 1), 'Q3492962', null, null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SCES-01833' order by r.id limit 1), 'Q3617718', 'Q3617718', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLUS-00191' order by r.id limit 1), 'Q109232300', null, null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLES-01375' order by r.id limit 1), 'Q113901119', null, null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLPS-00728' order by r.id limit 1), 'Q6141713', 'Q6141713', 'Raiden DX');
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLPS-00419' order by r.id limit 1), 'Q7499851', 'Q7499851', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLES-01716' order by r.id limit 1), 'Q16258871', 'Q16258871', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLUS-00293' order by r.id limit 1), 'Q109457153', 'Q109457153', 'Lethal Enforcers I & II');
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLUS-01309' order by r.id limit 1), 'Q130342866', 'Q130342866', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLES-03963' order by r.id limit 1), 'Q130342903', 'Q130342903', null);
select pg_temp.absorb((select r.game_id from public.release r where r.product_code = 'SLPM-86788' order by r.id limit 1), 'Q141260552', 'Q141260552', 'Air Management ''96');

-- 2. Autre écriture du titre
select pg_temp.absorb(pg_temp.game_on('Adiboo & Paziral''s Secret', 'PS1'), 'Q24934944'); -- Adiboo and Paziral's Secret
select pg_temp.absorb(pg_temp.game_on('3×3 Eyes: Tenrinou Genmu', 'PS1'), 'Q2816658'); -- 3×3 Eyes Tenrin' ō Genmu
select pg_temp.absorb(pg_temp.game_on('Meitantei Conan: Saikou no Aibou', 'PS1'), 'Q136498714'); -- Meitantei Conan - Saikō no aibō
select pg_temp.absorb(pg_temp.game_on('The Wild Thornberrys: Animal Adventure', 'PS1'), 'Q53794055'); -- The Wild Thornberrys: Animal Adventures
select pg_temp.absorb(pg_temp.game_on('Alex Ferguson''s Player Manager 2001', 'PS1'), 'Q140305612'); -- Alex Ferguson Player Manager 2001
select pg_temp.absorb(pg_temp.game_on('Haunted Junction: Seitokai Badge wo Oe!', 'PS1'), 'Q55846781'); -- Haunted Junction: Seitokai Batch o Oe!
select pg_temp.absorb(pg_temp.game_on('Battle Konchuuden', 'PS1'), 'Q65241495'); -- Battle Konchūden
select pg_temp.absorb(pg_temp.game_on('Tokimeki Memorial Drama Series Vol. 1 Nijiiro no Seishun', 'PS1'), 'Q88476433'); -- Tokimeki Memorial Drama Series Nijiiro no Seishun
select pg_temp.absorb(pg_temp.game_on('Tokimeki Memorial Drama Series Vol. 2 Irodori no Love Song', 'PS1'), 'Q88476664'); -- Tokimeki Memorial Drama Series Irodori no Love Song
select pg_temp.absorb(pg_temp.game_on('Tokimeki Memorial Drama Series Vol. 3 Tabidachi no Uta', 'PS1'), 'Q88476873'); -- Tokimeki Memorial Drama Series Tabidachi no Uta
select pg_temp.absorb(pg_temp.game_on('Momotarou Densetsu', 'PS1'), 'Q85881473'); -- Momotaro Densetsu
select pg_temp.absorb(pg_temp.game_on('Interplay Sports Baseball 2000', 'PS1'), 'Q104535513'); -- Interplay Sports Baseball Edition 2000
select pg_temp.absorb(pg_temp.game_on('Street Fighter EX Plus Alpha', 'PS1'), 'Q3500239'); -- Street Fighter EX Plus
select pg_temp.absorb(pg_temp.game_on('Winning Post EX', 'PS1'), 'Q3569361'); -- Winning Post
select pg_temp.absorb(pg_temp.game_on('Rurouni Kenshin: Meiji Kenkaku Romantan: Ishin Gekitōhen', 'PS1'), 'Q3942830'); -- Rurōni Kenshin: Meiji kenkaku romantan - Ishin gekitō-hen
select pg_temp.absorb(pg_temp.game_on('Eko Eko Azarak: Wizard of Darkness', 'PS1'), 'Q116213548'); -- Eko Eko Azaraku: Wizard of Darkness
select pg_temp.absorb(pg_temp.game_on('Wakusei Koukitai Little Cats', 'PS1'), 'Q120335954'); -- Wakusei Kōgekitai: Little Cats
select pg_temp.absorb(pg_temp.game_on('Seishoujo Kantai Virgin Fleet', 'PS1'), 'Q124526084'); -- Seishōjo Kantai Virgin Fleet
select pg_temp.absorb(pg_temp.game_on('Sentou Kokka: Air Land Battle', 'PS1'), 'Q126034746'); -- Sentō Kokka: Air Land Battle
select pg_temp.absorb(pg_temp.game_on('J.League Jikkyou Winning Eleven 2001', 'PS1'), 'Q6103733'); -- J-League Jikkyō Winning Eleven 2001
select pg_temp.absorb(pg_temp.game_on('Gokujou Parodius Da! Deluxe Pack', 'PS1'), 'Q10910509'); -- Gokujō Parodius Da! Deluxe Pack
select pg_temp.absorb(pg_temp.game_on('Taikou Risshiden II', 'PS1'), 'Q11082922'); -- Taiko Risshiden II
select pg_temp.absorb(pg_temp.game_on('Harukanaru Toki no Naka de: Banjyou Yuugi', 'PS1'), 'Q11240115'); -- Harukanaru Toki no Naka de: Banjoyūgi
select pg_temp.absorb(pg_temp.game_on('Simple 1500 Series Vol. 31: The Sound Novel', 'PS1'), 'Q11249192'); -- Simple 1500 Series vol.031 - The Sound Novel
select pg_temp.absorb(pg_temp.game_on('TIZ: Tokyo Insect Zoo', 'PS1'), 'Q11249437'); -- Tokyo Insect Zoo
select pg_temp.absorb(pg_temp.game_on('Mitsumete Knight R Daibouken hen', 'PS1'), 'Q11279030'); -- Mitsumete Knight R: Daibōken-hen
select pg_temp.absorb(pg_temp.game_on('Dungeon Shoutenkai: Densetsu no Ken Hajimemashita', 'PS1'), 'Q11271627'); -- Dungeon Shōtenkai: Densetsu no Ken Hajimemashita
select pg_temp.absorb(pg_temp.game_on('Doraemon: Nobita to Fukkatsu no Hoshi', 'PS1'), 'Q11322843'); -- Doraemon: Nobitaito Fukkatsu no hoshi
select pg_temp.absorb(pg_temp.game_on('Akagawa Jirou: Yasoukyoku', 'PS1'), 'Q11431252'); -- Akagawa Jiro - Yasoukyoku
select pg_temp.absorb(pg_temp.game_on('Kaitohranma Miyabi', 'PS1'), 'Q11491383'); -- Kaito Ranma Miyabi
select pg_temp.absorb(pg_temp.game_on('Kuro no Juusan', 'PS1'), 'Q11677970'); -- Kuro no Jūsan
select pg_temp.absorb(pg_temp.game_on('Activision Classic Games for the Atari 2600', 'PS1'), 'Q2819686'); -- A Collection of Activision Classic Games for the Atari 2600
select pg_temp.absorb(pg_temp.game_on('Gekka Ni no Kishi: O Ryusen', 'PS1'), 'Q130268072'); -- Gekka no Kishi: Ōryū-sen
select pg_temp.absorb(pg_temp.game_on('Alnam no Kiba: Juuzoku Juuni Shinto Densetsu', 'PS1'), 'Q17192210'); -- Alnam no Kiba: Jūzoku Jūnishinto Densetsu
select pg_temp.absorb(pg_temp.game_on('Nippon Golf Kyoukai Kanshuu: Double Eagle', 'PS1'), 'Q133453455'); -- Nippon Golf Kyōkai Kanshū: Double Eagle
select pg_temp.absorb(pg_temp.game_on('Simple 1500 Series Vol. 73: The Invaders ~Space Invaders 1500~', 'PS1'), 'Q140306762'); -- Simple 1500 Series Vol. 73: The Invaders
select pg_temp.absorb(pg_temp.game_on('Shichida Shiki Unou de Asoventure: Kotoba ABC 0~2-Sai Muke', 'PS1'), 'Q140307287'); -- Shichidashiki Unou de Adventure - Kotoba ABC - 0-2-sai Muke
select pg_temp.absorb(pg_temp.game_on('Morita Kazurou no Reversi', 'PS1'), 'Q137715055'); -- Morita Kazuro no Reversi
select pg_temp.absorb(pg_temp.game_on('Nanatsuiro * Drops Pure!!', 'PS2'), 'Q588754'); -- Nanatsuiro Drops
select pg_temp.absorb(pg_temp.game_on('Ichigeki Sacchuu!! HoiHoi-San', 'PS2'), 'Q602932'); -- Ichigeki Sacchu!! HoiHoi-san
select pg_temp.absorb(pg_temp.game_on('Yoshitsune Eiyūden: The Story of Hero Yoshitsune', 'PS2'), 'Q8056320'); -- Yoshitsune Eiyuuden: The Story of Hero Yoshitsune
select pg_temp.absorb(pg_temp.game_on('Bleach: Erabareshi Tamashii', 'PS2'), 'Q117826879'); -- Bleach: Erabarashi Tamashii
select pg_temp.absorb(pg_temp.game_on('Fushigi Yuugi: Genbu Kaiten Gaiden - Kagami no Miko', 'PS2'), 'Q3754887'); -- Fushigi Yûgi: Genbu Kaiden Gaiden – Kagami no Miko
select pg_temp.absorb(pg_temp.game_on('Jikkyou Powerful Pro Yakyuu 15', 'PS2'), 'Q18223723'); -- Jikkyō Powerful Pro Yakyū 15
select pg_temp.absorb(pg_temp.game_on('Jikkyou Powerful Pro Yakyuu 2009', 'PS2'), 'Q18223726'); -- Jikkyō Powerful Pro Yakyū 2009

-- 3. Sans aucune trace : supprimées, et notées au journal
create temporary table phantom (wikidata_id text primary key);
insert into phantom (wikidata_id) values
  ('Q845526'),
  ('Q860291'),
  ('Q1180940'),
  ('Q1191816'),
  ('Q1199765'),
  ('Q2366720'),
  ('Q917503'),
  ('Q1042365'),
  ('Q599937'),
  ('Q2669580'),
  ('Q24890553'),
  ('Q28126738'),
  ('Q2811807'),
  ('Q2580313'),
  ('Q2913706'),
  ('Q136499118'),
  ('Q136499987'),
  ('Q136500088'),
  ('Q53935553'),
  ('Q137791545'),
  ('Q139780183'),
  ('Q140729766'),
  ('Q3038307'),
  ('Q3038754'),
  ('Q57171071'),
  ('Q63284869'),
  ('Q85762191'),
  ('Q3342577'),
  ('Q104920097'),
  ('Q3942793'),
  ('Q3928155'),
  ('Q4370340'),
  ('Q111148157'),
  ('Q111569479'),
  ('Q112671210'),
  ('Q113434032'),
  ('Q112656103'),
  ('Q4735514'),
  ('Q4922153'),
  ('Q116601669'),
  ('Q114798749'),
  ('Q115087879'),
  ('Q122387828'),
  ('Q116870812'),
  ('Q124637534'),
  ('Q124289799'),
  ('Q123980459'),
  ('Q5242936'),
  ('Q125572608'),
  ('Q5372645'),
  ('Q7273276'),
  ('Q7396310'),
  ('Q7548502'),
  ('Q7852557'),
  ('Q7940736'),
  ('Q11200703'),
  ('Q11255817'),
  ('Q11261357'),
  ('Q11279809'),
  ('Q11301738'),
  ('Q11332070'),
  ('Q11371845'),
  ('Q11500895'),
  ('Q11533496'),
  ('Q11536992'),
  ('Q18636718'),
  ('Q103820038'),
  ('Q11290823'),
  ('Q126118636'),
  ('Q127730547'),
  ('Q114386361'),
  ('Q107136901'),
  ('Q107136969'),
  ('Q120689588'),
  ('Q133728857'),
  ('Q141481250'),
  ('Q6966482'),
  ('Q57040869'),
  ('Q100277673'),
  ('Q7813933'),
  ('Q123508710'),
  ('Q11292871');

do $$
declare
  g public.game;
begin
  for g in select gm.* from public.game gm join phantom p on p.wikidata_id = gm.wikidata_id order by gm.id loop
    if not pg_temp.still_empty(g.id) then
      raise notice 'Fiche % gardée : elle a changé', g.title;
      continue;
    end if;
    insert into public.catalog_deletion (kind, object_id, title, details, reason, deleted_by)
    values ('game', g.id, g.title, jsonb_build_object(
      'wikidata_id', g.wikidata_id,
      'releases', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'zone', r.zone, 'local_title', r.local_title,
        'product_code', r.product_code, 'edition', coalesce(r.edition_name, r.edition_type::text)) order by r.id), '[]')
        from public.release r where r.game_id = g.id),
      'images', 0
    ), 'Fiche fantôme : aucun disque connu de Redump ni fiche proche sur cette console (import Wikidata)', null);
    update public.submission s
    set status = 'rejected', review_note = 'Jeu supprimé du catalogue.', reviewed_at = now()
    where s.status = 'pending'
      and ((s.target = 'game' and s.target_id = g.id)
        or (s.target in ('release', 'image') and s.target_id in (select r.id from public.release r where r.game_id = g.id))
        or (s.data ->> 'game_id') = g.id::text);
    update public.dismissed_duplicate set game_ids = array_remove(game_ids, g.id) where g.id = any (game_ids);
    delete from public.release where game_id = g.id;
    delete from public.game where id = g.id;
  end loop;
end;
$$;

drop table phantom;
drop function pg_temp.absorb(bigint, text, text, text);
drop function pg_temp.game_on(text, text);
drop function pg_temp.still_empty(bigint);
