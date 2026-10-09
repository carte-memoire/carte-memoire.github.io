-- =====================================================================
-- Carte Mémoire · Migration 3 : données de référence
-- Ce qui doit exister avant tout import : régions, PS1 et son constructeur.
-- Les noms affichés (France, Europe…) sont en français : c'est du contenu.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Régions : monde > zones > pays (codes ISO 3166-1 pour les pays)
-- ---------------------------------------------------------------------
insert into public.region (code, name, type)
values ('world', 'Monde', 'world');

insert into public.region (code, name, type, parent_id)
select v.code, v.name, 'zone'::public.region_type, w.id
from (values
  ('europe',        'Europe'),
  ('north-america', 'Amérique du Nord'),
  ('south-america', 'Amérique du Sud'),
  ('asia',          'Asie'),
  ('oceania',       'Océanie'),
  ('africa',        'Afrique')
) as v (code, name)
cross join public.region w
where w.code = 'world';

insert into public.region (code, name, type, parent_id)
select v.code, v.name, 'country'::public.region_type, z.id
from (values
  ('FR', 'France',           'europe'),
  ('BE', 'Belgique',         'europe'),
  ('CH', 'Suisse',           'europe'),
  ('LU', 'Luxembourg',       'europe'),
  ('DE', 'Allemagne',        'europe'),
  ('AT', 'Autriche',         'europe'),
  ('GB', 'Royaume-Uni',      'europe'),
  ('IE', 'Irlande',          'europe'),
  ('IT', 'Italie',           'europe'),
  ('ES', 'Espagne',          'europe'),
  ('PT', 'Portugal',         'europe'),
  ('NL', 'Pays-Bas',         'europe'),
  ('SE', 'Suède',            'europe'),
  ('NO', 'Norvège',          'europe'),
  ('DK', 'Danemark',         'europe'),
  ('FI', 'Finlande',         'europe'),
  ('PL', 'Pologne',          'europe'),
  ('GR', 'Grèce',            'europe'),
  ('US', 'États-Unis',       'north-america'),
  ('CA', 'Canada',           'north-america'),
  ('MX', 'Mexique',          'north-america'),
  ('BR', 'Brésil',           'south-america'),
  ('AR', 'Argentine',        'south-america'),
  ('JP', 'Japon',            'asia'),
  ('KR', 'Corée du Sud',     'asia'),
  ('CN', 'Chine',            'asia'),
  ('HK', 'Hong Kong',        'asia'),
  ('TW', 'Taïwan',           'asia'),
  ('SG', 'Singapour',        'asia'),
  ('AU', 'Australie',        'oceania'),
  ('NZ', 'Nouvelle-Zélande', 'oceania'),
  ('ZA', 'Afrique du Sud',   'africa')
) as v (code, name, zone)
join public.region z on z.code = v.zone;


-- ---------------------------------------------------------------------
-- 2. Constructeur et plateforme PS1
--    spec_fields : "key" et les valeurs en anglais (données techniques),
--    "label" en français (texte affiché dans le formulaire).
-- ---------------------------------------------------------------------
insert into public.company (name, country, wikidata_id)
values ('Sony Interactive Entertainment', 'JP', 'Q18594');

insert into public.platform
  (name, short_name, generation, type, media, launch_date, manufacturer_id, wikidata_id, spec_fields)
select
  'PlayStation', 'PS1', 5, 'home', 'CD-ROM', date '1994-12-03', c.id, 'Q10677',
  $json$[
    { "key": "memory_card_blocks", "label": "Blocs de carte mémoire", "type": "integer", "min": 1, "max": 15 },
    { "key": "analog", "label": "Manette analogique", "type": "choice",
      "options": [
        { "value": "no", "label": "Non" },
        { "value": "compatible", "label": "Compatible" },
        { "value": "required", "label": "Requise" }
      ] },
    { "key": "vibration", "label": "Vibrations", "type": "boolean" },
    { "key": "multitap", "label": "Compatible Multitap", "type": "boolean" },
    { "key": "link_cable", "label": "Câble Link", "type": "boolean" },
    { "key": "peripherals", "label": "Périphériques", "type": "multi_choice",
      "options": [
        { "value": "mouse", "label": "Souris" },
        { "value": "guncon", "label": "GunCon" },
        { "value": "negcon", "label": "neGcon" },
        { "value": "wheel", "label": "Volant" },
        { "value": "pocketstation", "label": "PocketStation" }
      ] }
  ]$json$::jsonb
from public.company c
where c.wikidata_id = 'Q18594';
