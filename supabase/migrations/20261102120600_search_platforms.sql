-- =====================================================================
-- Recherche de jeux : la console de chaque résultat (PS1, PS2…)
--
-- Dans la recherche (accueil, fenêtre « Ajouter un jeu »), un jeu sans jaquette ne disait
-- pas sur quelle console il était sorti. search_games renvoie désormais platforms : les
-- consoles du jeu (seulement celles demandées si la recherche en nomme une), de la plus
-- ancienne à la plus récente. Le reste de la fonction est inchangé (recopié de
-- 20261010192500_search_words.sql). Ajouter une colonne de sortie oblige à supprimer puis
-- recréer la fonction : ses droits sont redonnés à la fin.
-- =====================================================================

drop function public.search_games(text, int, text);

create function public.search_games(search text, max_results int default 20, platform_code text default null)
returns table (
  id bigint,
  title text,
  first_release_date date,
  matched_title text,
  release_count int,
  cover_path text,
  matched_code text,
  slug text,
  platforms text[]
)
language sql
stable
set search_path = ''
as $$
  with raw as (
    -- La console écrite en toutes lettres ou détachée : « PlayStation 2 », « ps 2 » → ps2
    select regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(search, ''))),
      '\mplay\s*station\s*([2-5])\M', 'ps\1', 'g'),
      '\mplay\s*station\s*(1|one)\M', 'ps1', 'g'),
      '\mps\s+([1-5])\M', 'ps\1', 'g'),
      '\mplay\s*station\M', ' ', 'g') as s
  ),
  tokens as (
    select t.w, t.n
    from raw, regexp_split_to_table(raw.s, '\s+') with ordinality as t(w, n)
    where t.w <> ''
  ),
  -- Mots reconnus comme une console (abréviations sans risque de confusion avec un titre)
  aliases (alias, short_name) as (
    values ('ps1', 'PS1'), ('psx', 'PS1'), ('psone', 'PS1'), ('ps2', 'PS2'), ('ps3', 'PS3'),
           ('ps4', 'PS4'), ('ps5', 'PS5'), ('psp', 'PSP'), ('vita', 'PSV'), ('psvita', 'PSV'),
           ('n64', 'N64'), ('snes', 'SNES'), ('gba', 'GBA'), ('gbc', 'GBC'), ('nds', 'NDS'),
           ('3ds', '3DS'), ('x360', 'X360'), ('xbox360', 'X360'), ('wiiu', 'WIIU')
  ),
  words as (
    select public.normalize_name(t.w) as w, t.n
    from tokens t
    where public.normalize_name(t.w) is not null
      and not exists (select 1 from aliases a where a.alias = public.normalize_name(t.w))
  ),
  -- Studios dont le nom contient chaque mot (calculés une fois, pas jeu par jeu)
  word_companies as (
    select wd.w, wd.n,
      array(
        select co.id from public.company co where length(wd.w) >= 3 and co.name_key like '%' || wd.w || '%'
      ) as companies
    from words wd
  ),
  -- Pour chaque mot, les jeux où il apparaît (titre, titre régional, studio) : un passage
  -- par table, puis on garde les jeux qui ont TOUS les mots
  word_games as (
    select wd.n, g.id as game_id from words wd join public.game g on g.title_key like '%' || wd.w || '%'
    union
    select wd.n, r.game_id from words wd join public.release r on r.local_title_key like '%' || wd.w || '%'
    union
    select wc.n, gd.game_id from word_companies wc join public.game_developer gd on gd.company_id = any(wc.companies)
    union
    select wc.n, r.game_id from word_companies wc
      join public.release_company rc on rc.company_id = any(wc.companies)
      join public.release r on r.id = rc.release_id
  ),
  q as (
    select
      (select string_agg(wd.w, '' order by wd.n) from words wd) as k,
      (select p.id from public.platform p where p.short_name = platform_code) as pid,
      (select array_agg(distinct p.id) from tokens t
         join aliases a on a.alias = public.normalize_name(t.w)
         join public.platform p on p.short_name = a.short_name) as pids
  ),
  -- Jeux candidats : tous les mots trouvés, ou le code produit
  candidates as (
    select wg.game_id from word_games wg
    group by wg.game_id
    having count(distinct wg.n) = (select count(*) from words)
    union
    select r.game_id from q join public.release r
      on q.k ~ '[0-9]' and length(q.k) >= 4 and r.product_code_key like '%' || q.k || '%'
  )
  select
    g.id,
    g.title,
    g.first_release_date,
    coalesce(c.local_title, m.local_title, g.title) as matched_title,
    (select count(*)::int from public.release r
     where r.game_id = g.id and (q.pid is null or r.platform_id = q.pid)
       and (q.pids is null or r.platform_id = any(q.pids))) as release_count,
    -- Une jaquette : celle de la version trouvée par son code, sinon de la console demandée, puis européenne
    (
      select i.path
      from public.image i
      join public.release r on r.id = i.release_id
      where r.game_id = g.id and i.type = 'front'
      order by (r.id = c.release_id) desc nulls last,
               (r.platform_id = q.pid or r.platform_id = any(q.pids)) desc nulls last,
               (r.zone = 'PAL') desc nulls last, r.id, i.id
      limit 1
    ) as cover_path,
    c.product_code as matched_code,
    g.slug,
    -- Consoles du jeu (celles demandées seulement), de la plus ancienne à la plus récente
    (
      select array_agg(p.short_name order by p.launch_date nulls last, p.id)
      from public.platform p
      where exists (select 1 from public.release r where r.game_id = g.id and r.platform_id = p.id)
        and (q.pid is null or p.id = q.pid)
        and (q.pids is null or p.id = any(q.pids))
    ) as platforms
  from q
  cross join candidates cd
  join public.game g on g.id = cd.game_id
  -- Version trouvée par son titre régional
  left join lateral (
    select r.local_title
    from public.release r
    where r.game_id = g.id
      and (q.pid is null or r.platform_id = q.pid)
      and (q.pids is null or r.platform_id = any(q.pids))
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
      and (q.pids is null or r.platform_id = any(q.pids))
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
    and (q.pids is null or exists (
      select 1 from public.release r where r.game_id = g.id and r.platform_id = any(q.pids)
    ))
  order by
    (public.normalize_name(c.product_code) = q.k) desc nulls last,
    (c.release_id is not null) desc,
    (g.title_key = q.k) desc,
    (g.title_key like q.k || '%') desc,
    (g.title_key like '%' || q.k || '%') desc,
    (select count(*) from words wd where g.title_key like '%' || wd.w || '%') desc,
    extensions.similarity(g.title_key, q.k) desc,
    g.title
  limit least(greatest(coalesce(max_results, 20), 1), 50);
$$;

revoke execute on function public.search_games(text, int, text) from public;
grant execute on function public.search_games(text, int, text) to anon, authenticated;
