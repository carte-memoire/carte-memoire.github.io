-- =====================================================================
-- Anciennes adresses des fiches : droits de l'API resserrés
--
-- La table game_slug_history (20261010191900) retirait l'ajout, la modification et
-- la suppression aux rôles de l'API, mais gardait les autres droits accordés par
-- défaut aux nouvelles tables : vider la table (TRUNCATE, qui ignore les règles
-- d'accès), y attacher des déclencheurs ou des clés étrangères. L'API du site ne
-- propose aucune de ces commandes, mais comme pour les autres tables : tout est
-- retiré, puis seule la lecture est rendue.
-- =====================================================================

revoke all on public.game_slug_history from anon, authenticated;
grant select on public.game_slug_history to anon, authenticated;
