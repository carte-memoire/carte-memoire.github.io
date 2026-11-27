-- =====================================================================
-- Carte Mémoire · Pays des studios et origine des jeux, depuis Wikidata (CC0)
-- Fichier GÉNÉRÉ par scripts/import-origins.mjs le 2026-11-26.
--
-- 0 studios reçoivent leur pays (P17, sinon siège P159, sinon P495) ;
-- 29 jeux d'origine encore inconnue reçoivent leur pays d'origine (P495).
-- Seulement les réponses uniques ; rien de ce qui est déjà renseigné n'est remplacé.
-- =====================================================================

-- (aucun studio à compléter : une liste vide serait refusée)

-- Après les studios : on ne complète que les jeux dont l'origine reste inconnue
update public.game g
set origin_country = v.country
from (values
  ('Q1014915', 'JP'),
  ('Q105620191', 'JP'),
  ('Q105623455', 'JP'),
  ('Q105623514', 'JP'),
  ('Q105636153', 'JP'),
  ('Q108055188', 'JP'),
  ('Q108055464', 'JP'),
  ('Q108055524', 'JP'),
  ('Q108055992', 'JP'),
  ('Q108056105', 'JP'),
  ('Q11283862', 'JP'),
  ('Q11291191', 'US'),
  ('Q11308435', 'JP'),
  ('Q11331909', 'JP'),
  ('Q1197566', 'US'),
  ('Q12384', 'JP'),
  ('Q1439988', 'JP'),
  ('Q1790249', 'US'),
  ('Q2422991', 'GB'),
  ('Q2731595', 'JP'),
  ('Q2748771', 'JP'),
  ('Q3155272', 'US'),
  ('Q3191820', 'JP'),
  ('Q3197999', 'JP'),
  ('Q3357671', 'JP'),
  ('Q3715533', 'GB'),
  ('Q4907302', 'JP'),
  ('Q5245447', 'JP'),
  ('Q58353434', 'JP')
) as v (wikidata_id, country)
where g.wikidata_id = v.wikidata_id and g.origin_country is null and public.origin(g) is null;
