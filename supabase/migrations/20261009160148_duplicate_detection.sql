-- =====================================================================
-- Carte Mémoire · Migration : détection des doublons
--
-- On ne peut pas interdire deux jeux du même nom (« Doom » 1993 et « Doom »
-- 2016 sont deux jeux différents). On calcule donc une CLÉ DE COMPARAISON :
-- le titre sans majuscules, accents, espaces ni ponctuation.
--   « Final Fantasy VII »  → finalfantasyvii
--   « FINAL FANTASY  VII » → finalfantasyvii
--   « Pokémon: Snap »      → pokemonsnap
-- Elle sert à :
--   - fusionner les imports (Wikidata, Wikipédia…) sans créer de doublons ;
--   - avertir un contributeur qu'un jeu du même nom existe déjà (étape 5) ;
--   - lister les doublons possibles pour les modérateurs.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- Fonction de normalisation. Elle est déclarée « immutable » (même entrée =
-- même résultat), ce qui permet de l'utiliser dans une colonne calculée.
-- On retire la ponctuation plutôt que de garder les lettres : ainsi les
-- titres japonais (ファイナルファンタジーVII) gardent une clé utilisable.
create function public.normalize_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))),
      '[[:space:][:punct:]’‘“”«»–—…・：！？「」『』〜～™®©°　]+', '', 'g'),
    '');
$$;

-- Colonnes calculées automatiquement à chaque ajout ou modification
alter table public.game
  add column title_key text generated always as (public.normalize_name(title)) stored;
create index on public.game (title_key);

alter table public.company
  add column name_key text generated always as (public.normalize_name(name)) stored;
create index on public.company (name_key);

-- Doublons possibles, pour les modérateurs : jeux ou sociétés qui partagent la même clé.
-- security_invoker : la vue respecte les règles RLS de la personne qui la consulte.
create view public.possible_duplicate_game
with (security_invoker = true) as
select title_key,
       count(*)::int                     as total,
       array_agg(id order by id)         as game_ids,
       array_agg(title order by id)      as titles
from public.game
group by title_key
having count(*) > 1;

create view public.possible_duplicate_company
with (security_invoker = true) as
select name_key,
       count(*)::int                     as total,
       array_agg(id order by id)         as company_ids,
       array_agg(name order by id)       as names
from public.company
group by name_key
having count(*) > 1;

revoke all on public.possible_duplicate_game, public.possible_duplicate_company from anon, authenticated;
grant select on public.possible_duplicate_game, public.possible_duplicate_company to authenticated;
