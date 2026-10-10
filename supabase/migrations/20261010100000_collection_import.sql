-- =====================================================================
-- Carte Mémoire · Import d'une collection depuis un fichier CSV
--
-- match_import_rows reçoit les lignes du fichier (déjà lues par le site) et
-- retrouve pour chacune la version du catalogue, par ordre de préférence :
--   1. son identifiant (fichier exporté depuis Carte Mémoire) ;
--   2. son code produit (« SCES-00867 », « sces 00867 »…) ;
--   3. son titre exact (titre de la boîte ou titre de référence, sans tenir
--      compte des accents, majuscules et ponctuation).
-- La zone, l'édition (Platinum…) et la console aident à départager.
--
-- Pour chaque ligne trouvée : la version retenue, la méthode, et « à vérifier »
-- si plusieurs versions restent possibles (Black Label ou Platinum avec le même
-- code, titre sans zone…) ou si la zone ou l'édition indiquée ne correspond pas.
-- Les autres versions possibles sont renvoyées pour que la personne choisisse.
-- Une ligne absente du résultat n'a rien donné.
--
-- La fonction ne lit que le catalogue public et n'écrit rien : l'ajout à la
-- collection se fait ensuite par l'API, sous les règles habituelles (RLS).
-- =====================================================================

create function public.match_import_rows(rows jsonb)
returns table (row_index int, release_id bigint, method text, needs_review boolean, choices jsonb)
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) > 2000 then
    raise exception 'Import : 2 000 lignes au plus par envoi.' using errcode = '22023';
  end if;

  return query
  with input as (
    select
      (e.ord - 1)::int as i,
      case when e.r ->> 'release_id' ~ '^[0-9]{1,15}$' then (e.r ->> 'release_id')::bigint end as rid,
      nullif(public.normalize_name(e.r ->> 'code'), '') as code_key,
      nullif(public.normalize_name(e.r ->> 'title'), '') as title_key,
      case when e.r ->> 'zone' in ('PAL', 'NTSC-U', 'NTSC-J', 'region_free') then (e.r ->> 'zone')::public.video_zone end as zone,
      -- Édition indiquée : une réédition (Platinum, Greatest Hits, The Best…) ou l'édition normale
      case when coalesce(e.r ->> 'edition', '') = '' then null
           else public.normalize_name(e.r ->> 'edition') ~ '(platinum|greatesthits|thebest|reedition|reissue|psonebooks|majorwave)'
      end as reissue,
      coalesce(nullif(e.r ->> 'platform', ''), 'PS1') as platform
    from jsonb_array_elements(rows) with ordinality as e(r, ord)
  ),
  found as (
    select inp.i, r.id, 1 as priority, 'id' as how
    from input inp
    join public.release r on r.id = inp.rid
    union
    select inp.i, r.id, 2, 'code'
    from input inp
    join public.release r on r.product_code_key = inp.code_key
    where inp.rid is null and length(inp.code_key) >= 5
    union
    select inp.i, r.id, 3, 'title'
    from input inp
    join public.release r on r.local_title_key = inp.title_key
    where inp.rid is null and inp.title_key is not null
    union
    select inp.i, r.id, 3, 'title'
    from input inp
    join public.game g on g.title_key = inp.title_key
    join public.release r on r.game_id = g.id
    where inp.rid is null and inp.title_key is not null
  ),
  -- Niveau : la méthode d'abord (identifiant, code, titre), puis la zone et la console
  scored as (
    select
      f.i, f.how, r.id, r.local_title, r.zone, r.edition_type, r.edition_name, r.product_code, pl.short_name,
      inp.zone as wanted_zone, inp.reissue,
      f.priority * 1000
        - case when inp.zone is null or r.zone = inp.zone then 100 else 0 end
        - case when pl.short_name = inp.platform then 50 else 0 end as tier,
      -- Sans édition indiquée, on préfère l'édition normale à une réédition
      case when (r.edition_type = 'reissue') = coalesce(inp.reissue, false) then 0 else 1 end as edition_miss
    from (select distinct on (found.i, found.id) found.* from found order by found.i, found.id, found.priority) f
    join input inp on inp.i = f.i
    join public.release r on r.id = f.id
    join public.platform pl on pl.id = r.platform_id
  ),
  best as (
    select s.*,
           row_number() over (partition by s.i order by s.edition_miss, (s.zone = 'PAL') desc nulls last, s.id) as rn
    from scored s
    where s.tier = (select min(s2.tier) from scored s2 where s2.i = s.i)
  )
  select
    b.i,
    min(b.id) filter (where b.rn = 1),
    min(b.how),
    (
      -- Plusieurs versions possibles, que l'édition indiquée ne suffit pas à départager
      (count(*) > 1 and (bool_or(b.reissue is null) or count(*) filter (where b.edition_miss = 0) > 1))
      -- Zone indiquée introuvable pour ce jeu
      or bool_and(b.wanted_zone is not null and b.zone is distinct from b.wanted_zone)
      -- Édition indiquée introuvable pour ce jeu
      or (bool_or(b.reissue is not null) and min(b.edition_miss) = 1)
    ),
    jsonb_agg(jsonb_build_object(
      'id', b.id, 'local_title', b.local_title, 'zone', b.zone, 'edition_type', b.edition_type,
      'edition_name', b.edition_name, 'product_code', b.product_code,
      'platform', jsonb_build_object('short_name', b.short_name)
    ) order by b.rn) filter (where b.rn <= 10)
  from best b
  group by b.i
  order by b.i;
end;
$$;

revoke execute on function public.match_import_rows(jsonb) from public, anon;
grant execute on function public.match_import_rows(jsonb) to authenticated;
