-- =====================================================================
-- Carte Mémoire · Studios mal rattachés à l'import Wikipédia
-- Fichier GÉNÉRÉ par scripts/fix-developer-companies.mjs le 2026-10-10.
--
-- L'import avait pris le titre de l'article visé par le lien (« List of Acclaim
-- Entertainment subsidiaries ») au lieu du texte affiché (« Acclaim Studios Austin »),
-- ou suivi un lien ambigu (« Starfish » → l'étoile de mer). Ici :
--   1. chaque jeu est rattaché à un studio propre au vrai nom (déjà existant, ou créé :
--      même quand le nom était juste, pour ne pas garder deux « Acquire ») ;
--   2. les 43 faux liens Wikidata, et le pays qui en venait, sont retirés ;
--   3. les pays sûrs de quelques studios connus sont renseignés ;
--   4. les faux studios devenus inutiles sont supprimés.
-- =====================================================================

create temporary table fix_studio (wrong_qid text, game_title text, right_name text);
insert into fix_studio values
  ('Q15977952', 'Asterix & Obelix Take On Caesar', 'Tek 5'),
  ('Q1475303', 'Memorial Series', 'Microvision'),
  ('Q1475303', 'Ginga Eiyuu Densetsu', 'Microvision'),
  ('Q1475303', 'Hitori de Dekirumon!', 'Microvision'),
  ('Q19922844', 'Tank Racer', 'Glass Ghost'),
  ('Q19922844', 'Eagle One: Harrier Attack', 'Glass Ghost'),
  ('Q56278089', 'Alien Trilogy', 'Probe Entertainment'),
  ('Q56278089', 'Batman & Robin', 'Probe Entertainment'),
  ('Q56278089', 'Bubble Bobble also featuring Rainbow Islands', 'Probe Entertainment'),
  ('Q56278089', 'Die Hard Trilogy', 'Probe Entertainment'),
  ('Q56278089', 'ECW Anarchy Rulz', 'Acclaim Studios Salt Lake City'),
  ('Q56278089', 'ECW Hardcore Revolution', 'Acclaim Studios Salt Lake City'),
  ('Q56278089', 'Fantastic Four', 'Probe Entertainment'),
  ('Q56278089', 'Forsaken', 'Probe Entertainment'),
  ('Q56278089', 'Jeremy McGrath Supercross ''98', 'Probe Entertainment'),
  ('Q56278089', 'Jeremy McGrath Supercross 2000', 'Acclaim Studios Salt Lake City'),
  ('Q56278089', 'Mortal Kombat II', 'Probe Entertainment'),
  ('Q56278089', 'NBA Jam Extreme', 'Sculptured Software'),
  ('Q56278089', 'NBA Jam Tournament Edition', 'Iguana UK'),
  ('Q56278089', 'NHL Breakaway 98', 'Sculptured Software'),
  ('Q56278089', 'Primal Rage', 'Probe Entertainment'),
  ('Q56278089', 'RC Revenge', 'Acclaim Studios Cheltenham'),
  ('Q56278089', 'Re-Volt', 'Acclaim Studios London'),
  ('Q56278089', 'Shadow Man', 'Acclaim Studios Teesside'),
  ('Q56278089', 'Space Jam', 'Sculptured Software'),
  ('Q56278089', 'WWF Attitude', 'Acclaim Studios Salt Lake City'),
  ('Q56278089', 'WWF in Your House', 'Sculptured Software'),
  ('Q56278089', 'WWF War Zone', 'Iguana West'),
  ('Q56278089', 'WWF WrestleMania: The Arcade Game', 'Sculptured Software'),
  ('Q56278089', 'X-Men: Children of the Atom', 'Probe Entertainment'),
  ('Q7828013', 'All Japan Woman Pro Wrestling', 'TEN'),
  ('Q1053990', 'Art Camion Sugorokuden', 'Affect'),
  ('Q1053990', 'Finger Flashing', 'Affect'),
  ('Q1053990', 'Game no Tatsujin', 'Affect'),
  ('Q1053990', 'Phix: The Adventure', 'Affect'),
  ('Q1053990', 'Zero Kara No Shogi: Shogi Youchien Ayumi-gumi', 'Affect'),
  ('Q2020225', 'Asterix', 'Sourcery'),
  ('Q233753', 'Backstreet Billiards', 'Agenda'),
  ('Q2271815', 'Barbie Explorer', 'Runecraft'),
  ('Q2271815', 'Barbie: Race & Ride', 'Runecraft'),
  ('Q2271815', 'Barbie Super Sports', 'Runecraft'),
  ('Q2271815', 'Caesars Palace 2000', 'Runecraft'),
  ('Q2271815', 'Caesar''s Palace II', 'Runecraft'),
  ('Q2271815', 'Detective Barbie: The Mystery Cruise', 'Runecraft'),
  ('Q2271815', 'Space Station Silicon Valley', 'Runecraft'),
  ('Q2271815', 'Mat Hoffman''s Pro BMX', 'Runecraft'),
  ('Q2271815', 'Men in Black: The Series – Crashdown', 'Runecraft'),
  ('Q2271815', 'Rescue Heroes: Molten Menace', 'Runecraft'),
  ('Q2271815', 'Risk', 'Runecraft'),
  ('Q2271815', 'Scrabble', 'Runecraft'),
  ('Q2271815', 'Spec Ops: Covert Assault', 'Runecraft'),
  ('Q2271815', 'Spec Ops: Ranger Elite', 'Runecraft'),
  ('Q2271815', 'Spec Ops: Stealth Patrol', 'Runecraft'),
  ('Q2271815', 'Super Bubble Pop', 'Runecraft'),
  ('Q2271815', 'Tintin: Destination Adventure', 'Runecraft'),
  ('Q2271815', 'Westlife: Fan-o-mania', 'Runecraft'),
  ('Q25349', 'Big Bass World Championship', 'Starfish'),
  ('Q25349', 'GunDress', 'Starfish'),
  ('Q25349', 'Super Black Bass X2', 'Starfish'),
  ('Q2844542', 'Bonogurashi: Kore de Kanpeki Disu', 'Amuse'),
  ('Q52058', 'BoomBots', 'The Neverhood'),
  ('Q52058', 'Klaymen Klaymen: The Neverhood Chronicles', 'The Neverhood'),
  ('Q52058', 'Skullmonkeys', 'The Neverhood'),
  ('Q212357', 'Bounty Hunter Sara: Holy Mountain no Teiou', 'Flagship'),
  ('Q5519798', 'Castrol Honda VTR', 'Interactive Entertainment'),
  ('Q5519798', 'Sports Superbike 2', 'Interactive Entertainment'),
  ('Q16886052', 'Digital Glider Airman', 'Ornith'),
  ('Q5243689', 'Disc Derby', 'Dazz'),
  ('Q5243689', 'Mezase! Meimon Yakyubu', 'Dazz'),
  ('Q55617482', 'Donald Duck: Goin'' Quackers', 'Ubi Soft'),
  ('Q55617482', 'F1 Racing Championship', 'Ubi Soft Milan'),
  ('Q55617482', 'The Jungle Book Groove Party', 'Ubi Soft'),
  ('Q55617482', 'Monaco Grand Prix: Racing Simulation 2', 'Ubi Soft'),
  ('Q55617482', 'Rayman Rush', 'Ubi Soft Shanghai'),
  ('Q55617482', 'Technomage', 'Ubi Soft'),
  ('Q55617482', 'V.I.P.', 'Ubi Soft Shanghai'),
  ('Q937164', 'Dragon Knights Glorious', 'Pandora Box'),
  ('Q65359104', 'Feda 2: White Surge the Platoon', 'Max Entertainment'),
  ('Q544667', 'Heart of Darkness', 'Amazing Studio'),
  ('Q48808457', 'Hybrid', 'Vulcan Software'),
  ('Q3229', 'IS – internal section', 'positron'),
  ('Q1186952', 'Kart Challenge', 'Interactive entertainment'),
  ('Q16903081', 'Kekkon: Marriage', 'West One'),
  ('Q16903081', 'Mirano no Arubaito Collection', 'West One'),
  ('Q16903081', 'Sotsugyou III: Wedding Bell', 'West One'),
  ('Q16903081', 'Sotsugyou M: Seito Kaichou no Karei naru Inbou', 'West One'),
  ('Q16903081', 'Wolkenkratzer: Shinpan no Tou', 'West One'),
  ('Q207546', 'Legend of Legaia', 'Contrail'),
  ('Q795101', 'Love Therapy', 'B-Factory'),
  ('Q795101', 'Yami Fuku Natsu: Teito Monogatari Futatabi', 'B-Factory'),
  ('Q6353182', 'Lucky Luke: Western Fever', 'Kalisto'),
  ('Q6353182', 'Nightmare Creatures', 'Kalisto'),
  ('Q6353182', 'Nightmare Creatures II', 'Kalisto'),
  ('Q5223588', 'M&M''s Shell Shocked', 'Boston Animation'),
  ('Q174190', 'Marby Baby Story', 'Ponos'),
  ('Q76250', 'MTV Sports: T.J. Lavin''s Ultimate BMX', 'Blue Shift'),
  ('Q76250', 'Running Wild', 'Blue Shift'),
  ('Q666115', 'Power Spike Pro Beach Volleyball', 'Carapace'),
  ('Q666115', 'Roland Garros French Open 2001', 'Carapace'),
  ('Q35407', 'Shinseiki GPX Cyber Formula: Aratanaru Chousensha', 'Aspect'),
  ('Q1273069', 'Simple 1500 Series Vol. 21: The Yakyuu', 'E''s'),
  ('Q2072670', 'Simple 1500 Series Vol. 63: The Gun Shooting 2', 'AMS'),
  ('Q7514947', 'Soccer ''97', 'Silicon Dreams'),
  ('Q7514947', 'UEFA Champions League 1998/99', 'Silicon Dreams'),
  ('Q7514947', 'UEFA Champions League 1999/00', 'Silicon Dreams'),
  ('Q7514947', 'UEFA Champions League 2000/01', 'Silicon Dreams'),
  ('Q3645260', 'Star Trek: Invasion', 'Warthog'),
  ('Q3645260', 'Tiny Toon Adventures: Plucky''s Big Adventure', 'Warthog'),
  ('Q2463952', 'Tear Ring Saga', 'Tirnanog'),
  ('Q342547', 'Tenchu: Stealth Assassins', 'Acquire'),
  ('Q342547', 'Tenchu 2: Birth of the Stealth Assassins', 'Acquire'),
  ('Q342547', 'Tenchu: Shinobi Hyakusen', 'Acquire'),
  ('Q342547', 'Tenchu: Shinobi Gaisen', 'Acquire'),
  ('Q35509', 'Trick''N Snowboarder', 'Cave');

-- Rattachements à retirer : le « studio » n'en était pas un (une notion, un lieu, le jeu)
create temporary table unlink_studio (wrong_qid text, game_title text);
insert into unlink_studio values
  ('Q1137037', 'Shin Hayarigami 2'),
  ('Q193071', 'Batman: The Telltale Series - Episode 4: Guardian of Gotham'),
  ('Q193071', 'City of Light'),
  ('Q5277544', 'Dragon''s Lair Trilogy'),
  ('Q1053990', 'Quantum Gate'),
  ('Q2446941', 'Baldies');

-- Les faux studios, repérés avant qu'on efface leur lien Wikidata
create temporary table wrong_studio as
select c.id from public.company c where c.wikidata_id in ('Q15977952', 'Q1475303', 'Q19922844', 'Q1137037', 'Q193071', 'Q5277544', 'Q56278089', 'Q7828013', 'Q1053990', 'Q2020225', 'Q233753', 'Q2446941', 'Q2271815', 'Q25349', 'Q2844542', 'Q52058', 'Q212357', 'Q5519798', 'Q16886052', 'Q5243689', 'Q55617482', 'Q937164', 'Q65359104', 'Q544667', 'Q48808457', 'Q3229', 'Q1186952', 'Q16903081', 'Q207546', 'Q795101', 'Q6353182', 'Q5223588', 'Q174190', 'Q76250', 'Q666115', 'Q35407', 'Q1273069', 'Q2072670', 'Q7514947', 'Q3645260', 'Q2463952', 'Q342547', 'Q35509');

-- 1. Les studios au vrai nom qui n'existent pas encore
insert into public.company (name)
select distinct on (public.normalize_name(f.right_name)) f.right_name
from fix_studio f
where not exists (
  select 1 from public.company c
  where c.name_key = public.normalize_name(f.right_name) and c.id not in (select id from wrong_studio)
)
order by public.normalize_name(f.right_name), f.right_name;

-- Pour chaque rattachement : le bon studio (celui qui a un lien Wikidata d'abord)
create temporary table relink as
select gd.game_id, gd.company_id as wrong_id,
       (select c.id from public.company c
        where c.name_key = public.normalize_name(f.right_name) and c.id not in (select id from wrong_studio)
        order by (c.wikidata_id is not null) desc, c.id limit 1) as right_id
from fix_studio f
join public.company wrong on wrong.wikidata_id = f.wrong_qid
join public.game_developer gd on gd.company_id = wrong.id
join public.game g on g.id = gd.game_id and g.title = f.game_title;

-- 2. Rattachement (si le jeu a déjà le bon studio, on retire seulement le faux)
delete from public.game_developer gd using relink r
where gd.game_id = r.game_id and gd.company_id = r.wrong_id
  and exists (select 1 from public.game_developer d where d.game_id = r.game_id and d.company_id = r.right_id);
update public.game_developer gd set company_id = r.right_id
from relink r
where gd.game_id = r.game_id and gd.company_id = r.wrong_id;

delete from public.game_developer gd
using unlink_studio u, public.company wrong, public.game g
where wrong.wikidata_id = u.wrong_qid and gd.company_id = wrong.id and g.id = gd.game_id and g.title = u.game_title;

-- 3. Plus de faux lien Wikidata, ni de pays qui en venait
update public.company set wikidata_id = null, country = null where id in (select id from wrong_studio);

-- 4. Pays sûrs de studios connus (sans écraser un pays déjà renseigné)
update public.company c set country = v.country
from (values
  ('Kalisto', 'FR'),
  ('Tek 5', 'FR'),
  ('Amazing Studio', 'FR'),
  ('Warthog', 'GB'),
  ('Silicon Dreams', 'GB'),
  ('Glass Ghost', 'GB'),
  ('Cave', 'JP'),
  ('Flagship', 'JP'),
  ('Ponos', 'JP'),
  ('Starfish', 'JP'),
  ('The Neverhood', 'US')
) as v (name, country)
where c.name_key = public.normalize_name(v.name) and c.country is null;

-- 5. Faux studios qui ne servent plus à rien
delete from public.company c
where c.id in (select id from wrong_studio)
  and not exists (select 1 from public.game_developer gd where gd.company_id = c.id)
  and not exists (select 1 from public.release_company rc where rc.company_id = c.id);

drop table fix_studio, unlink_studio, wrong_studio, relink;
