-- =====================================================================
-- Carte Mémoire · La Famicom Disk System
--
-- Le lecteur de disquettes de la Famicom (Japon, 1986). Ses jeux sont des disquettes : une
-- console à part, comme Wikidata et Wikipédia la rangent. Un jeu sorti aussi en cartouche
-- (The Legend of Zelda, Metroid, Kid Icarus…) garde UNE fiche, avec ses versions des deux
-- consoles (les imports le reconnaissent à son identifiant Wikidata).
-- =====================================================================

insert into public.platform (name, short_name, generation, type, media, launch_date, manufacturer_id, wikidata_id)
select 'Famicom Disk System', 'FDS', 3, 'home', 'Disquette', date '1986-02-21', c.id, 'Q135321'
from public.company c
where c.wikidata_id = 'Q8093'
on conflict (short_name) do nothing;
