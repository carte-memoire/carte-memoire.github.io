-- =====================================================================
-- Carte Mémoire · Recherche par code produit, dans le même champ que le titre
--
-- « SLES-00868 », « sles 00868 », « SLES-008 » ou « 00868 » trouvent le jeu.
-- La recherche par code ne s'active que si le texte contient un chiffre
-- (sinon « crash » chercherait aussi dans les codes, inutilement).
-- =====================================================================

alter table public.release
  add column product_code_key text generated always as (public.normalize_name(product_code)) stored;

create index release_product_code_key_trgm on public.release using gin (product_code_key extensions.gin_trgm_ops);

-- Nouvelle colonne en sortie (matched_code) : il faut supprimer l'ancienne version
drop function public.search_games(text, int, text);

create function public.search_games(search text, max_results int default 20, platform_code text default null)
returns table (
  id bigint,
  title text,
  first_release_date date,
  matched_title text,
  release_count int,
  cover_path text,
  matched_code text
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select public.normalize_name(search) as k,
           (select p.id from public.platform p where p.short_name = platform_code) as pid
  )
  select
    g.id,
    g.title,
    g.first_release_date,
    coalesce(c.local_title, m.local_title, g.title) as matched_title,
    (select count(*)::int from public.release r
     where r.game_id = g.id and (q.pid is null or r.platform_id = q.pid)) as release_count,
    -- Une jaquette : celle de la version trouvée par son code, sinon de la console choisie, puis européenne
    (
      select i.path
      from public.image i
      join public.release r on r.id = i.release_id
      where r.game_id = g.id and i.type = 'front'
      order by (r.id = c.release_id) desc nulls last, (r.platform_id = q.pid) desc nulls last,
               (r.zone = 'PAL') desc nulls last, r.id, i.id
      limit 1
    ) as cover_path,
    c.product_code as matched_code
  from q
  cross join public.game g
  -- Version trouvée par son titre régional
  left join lateral (
    select r.local_title
    from public.release r
    where r.game_id = g.id
      and (q.pid is null or r.platform_id = q.pid)
      and r.local_title_key like '%' || q.k || '%'
      and r.local_title_key is distinct from g.title_key
    order by length(r.local_title)
    limit 1
  ) m on true
  -- Version trouvée par son code produit (seulement si le texte contient un chiffre)
  left join lateral (
    select r.id as release_id, r.product_code, r.local_title
    from public.release r
    where r.game_id = g.id
      and (q.pid is null or r.platform_id = q.pid)
      and q.k ~ '[0-9]' and length(q.k) >= 4
      and r.product_code_key like '%' || q.k || '%'
    order by (r.product_code_key = q.k) desc, (r.product_code_key like q.k || '%') desc, r.product_code
    limit 1
  ) c on true
  where length(q.k) >= 2
    -- Console inconnue : aucun résultat plutôt que tous les jeux
    and (platform_code is null or q.pid is not null)
    and (q.pid is null or exists (
      select 1 from public.release r where r.game_id = g.id and r.platform_id = q.pid
    ))
    and (
      c.release_id is not null
      or g.title_key like '%' || q.k || '%'
      or exists (
        select 1 from public.release r
        where r.game_id = g.id
          and (q.pid is null or r.platform_id = q.pid)
          and r.local_title_key like '%' || q.k || '%'
      )
    )
  order by
    (public.normalize_name(c.product_code) = q.k) desc nulls last,
    (c.release_id is not null) desc,
    (g.title_key = q.k) desc,
    (g.title_key like q.k || '%') desc,
    extensions.similarity(g.title_key, q.k) desc,
    g.title
  limit least(greatest(coalesce(max_results, 20), 1), 50);
$$;

revoke execute on function public.search_games(text, int, text) from public;
grant execute on function public.search_games(text, int, text) to anon, authenticated;
