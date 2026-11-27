-- =====================================================================
-- Carte Mémoire · Pays des studios et origine des jeux, depuis Wikidata (CC0)
-- Fichier GÉNÉRÉ par scripts/import-origins.mjs le 2026-11-27.
--
-- 0 studios reçoivent leur pays (P17, sinon siège P159, sinon P495) ;
-- 51 jeux d'origine encore inconnue reçoivent leur pays d'origine (P495).
-- Seulement les réponses uniques ; rien de ce qui est déjà renseigné n'est remplacé.
-- =====================================================================

-- (aucun studio à compléter : une liste vide serait refusée)

-- Après les studios : on ne complète que les jeux dont l'origine reste inconnue
update public.game g
set origin_country = v.country
from (values
  ('Q1118490', 'CA'),
  ('Q1385473', 'GB'),
  ('Q1423930', 'US'),
  ('Q16266960', 'US'),
  ('Q1632811', 'US'),
  ('Q1632918', 'US'),
  ('Q1988494', 'JP'),
  ('Q1989219', 'CA'),
  ('Q2453573', 'JP'),
  ('Q2553121', 'JP'),
  ('Q2907306', 'US'),
  ('Q2911866', 'JP'),
  ('Q2948512', 'JP'),
  ('Q2948513', 'JP'),
  ('Q3023258', 'JP'),
  ('Q3062635', 'GB'),
  ('Q3063231', 'CA'),
  ('Q3093445', 'JP'),
  ('Q3109832', 'JP'),
  ('Q3149583', 'US'),
  ('Q3156716', 'JP'),
  ('Q3156816', 'JP'),
  ('Q3178659', 'JP'),
  ('Q3178664', 'JP'),
  ('Q3178665', 'JP'),
  ('Q3178667', 'JP'),
  ('Q3178672', 'JP'),
  ('Q3195037', 'US'),
  ('Q3257786', 'US'),
  ('Q3276747', 'JP'),
  ('Q3277746', 'JP'),
  ('Q3279577', 'US'),
  ('Q3281178', 'JP'),
  ('Q3282014', 'US'),
  ('Q3313495', 'US'),
  ('Q3314408', 'US'),
  ('Q3334428', 'CA'),
  ('Q3418096', 'JP'),
  ('Q3505760', 'JP'),
  ('Q3516512', 'GB'),
  ('Q3522012', 'CA'),
  ('Q3567573', 'GB'),
  ('Q54297', 'US'),
  ('Q54840', 'US'),
  ('Q615211', 'US'),
  ('Q617065', 'JP'),
  ('Q668397', 'JP'),
  ('Q690394', 'JP'),
  ('Q6952680', 'US'),
  ('Q733992', 'JP'),
  ('Q776211', 'GB')
) as v (wikidata_id, country)
where g.wikidata_id = v.wikidata_id and g.origin_country is null and public.origin(g) is null;
