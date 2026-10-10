-- =====================================================================
-- Carte Mémoire · Codes produits recopiés par erreur sur des versions nationales
--
-- Le premier import des codes a donné le code européen à des versions
-- nationales (françaises, allemandes) du même jeu. Codes vérifiés dans Redump.
-- Chaque correction ne touche que la version au bon titre qui porte encore
-- l'ancien code (garde-fou si la base a changé entre-temps).
-- All Star Tennis '99 : un seul disque européen multilingue, la version
-- « Yannick Noah » partage légitimement son code : rien à corriger.
-- =====================================================================

create temporary table code_fix (game_title text, local_title text, old_code text, new_code text);
insert into code_fix values
  ('Broken Sword: The Shadow of the Templars', 'Les Chevaliers de Baphomet', 'SCES-00346', 'SCES-00347'),
  ('Broken Sword II: The Smoking Mirror', 'Baphomets Fluch 2: Die Spiegel der Finsternis', 'SCES-00798', 'SCES-00800'),
  ('Broken Sword II: The Smoking Mirror', 'Les Boucliers de Quetzalcoatl: Les Chevaliers de Baphomet II', 'SCES-00798', 'SCES-00799'),
  ('Blaze and Blade: Eternal Quest', 'Blaze and Blade: Eternal Quest', 'SLES-01273', 'SLES-00845'),
  ('Alex Ferguson''s Player Manager 2002', 'DSS Fussball Manager 2002', 'SLES-03775', 'SLES-03864'),
  -- Absente de Redump : le code faux est retiré (la fiche affichera « À compléter »)
  ('Alex Ferguson''s Player Manager 2002', 'Guy Roux Manager 2002', 'SLES-03775', null);

update public.release r
set product_code = f.new_code
from code_fix f, public.game g
where g.id = r.game_id and g.title = f.game_title and r.local_title = f.local_title
  and r.zone = 'PAL' and r.product_code = f.old_code
  and (f.new_code is null or not exists (select 1 from public.release o where o.game_id = r.game_id and o.product_code = f.new_code));

-- Versions françaises notées « anglais » : elles sont en français
update public.release r
set languages = '{fr}'
from public.game g
where g.id = r.game_id and r.zone = 'PAL' and r.languages = '{en}'
  and (g.title, r.local_title) in (
    ('Broken Sword: The Shadow of the Templars', 'Les Chevaliers de Baphomet'),
    ('Broken Sword II: The Smoking Mirror', 'Les Boucliers de Quetzalcoatl: Les Chevaliers de Baphomet II')
  );

drop table code_fix;
