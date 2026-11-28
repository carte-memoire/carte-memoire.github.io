-- =====================================================================
-- Carte Mémoire · Scrabble (Game Boy Advance) n'est pas Scramble
-- Écrit à la main le 2026-11-28.
--
-- Dans la liste des jeux Game Boy Advance de Wikipédia, la ligne « Scrabble » pointe
-- l'article de Scramble (le jeu de tir de Konami, Q650757) : l'import lui a donné cet
-- élément Wikidata, et avec lui le résumé, le genre et l'origine de Scramble. Le jeu n'a
-- pas d'élément à lui dans Wikidata : on retire celui-ci (scripts/lib/consoles.mjs le
-- retire aussi à l'import). Passe avant les résumés et les genres qui suivent.
-- =====================================================================

update public.game g
set wikidata_id = null
from public.platform p
where g.slug = 'gba/scrabble' and g.wikidata_id = 'Q650757'
  and exists (select 1 from public.release r where r.game_id = g.id and r.platform_id = p.id)
  and p.short_name = 'GBA';
