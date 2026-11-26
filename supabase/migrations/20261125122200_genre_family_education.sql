-- =====================================================================
-- Carte Mémoire · Nouvelle famille de genres : Éducatif
--
-- Les jeux éducatifs (apprentissage des langues, dactylographie, jeux d'éveil) n'étaient
-- qu'un thème, absent des filtres par famille du catalogue et de la progression. Ils ont
-- maintenant leur famille. (Une valeur d'énumération ajoutée ne sert qu'après la fin de
-- sa transaction : elle est utilisée par la migration suivante, genres_cleanup.)
-- =====================================================================

alter type public.genre_family add value if not exists 'education';
