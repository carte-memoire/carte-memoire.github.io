-- =====================================================================
-- Résumés en anglais (introduction des articles de Wikipédia en anglais)
--
-- Le résumé français (summary) reste le résumé principal. Le résumé anglais :
--   - s'affiche sur la version anglaise du site ;
--   - s'affiche aussi sur la version française quand le jeu n'a pas de résumé
--     en français, avec la mention « Résumé en anglais » (1 300 jeux environ
--     n'ont un article que sur Wikipédia en anglais).
-- Même règle que pour le français : la source (l'article, licence CC BY-SA) est
-- obligatoire et affichée. Lecture pour tous par les droits déjà donnés sur game ;
-- écriture réservée aux modérateurs par les règles déjà en place.
-- =====================================================================

alter table public.game
  add column summary_en text,
  add column summary_en_source text,
  add constraint game_summary_en_source_check
    check (summary_en_source is null or summary_en_source ~ '^https://en\.wikipedia\.org/'),
  add constraint game_summary_en_source_needs_summary
    check (summary_en_source is null or summary_en is not null),
  add constraint game_summary_en_length
    check (length(summary_en) <= 5000);

comment on column public.game.summary_en is
  'Résumé en anglais (introduction de l''article Wikipédia en anglais). Affiché en anglais, et en français à défaut de summary.';
comment on column public.game.summary_en_source is
  'Adresse de l''article Wikipédia en anglais d''où vient summary_en (licence CC BY-SA : à afficher).';
