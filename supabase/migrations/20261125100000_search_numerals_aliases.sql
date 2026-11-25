-- =====================================================================
-- Carte Mémoire · Recherche : chiffres romains, abréviations, titres proches
--
-- Audit du 25/11/2026 : « ff7 » et « final fantasy 7 » ne trouvaient rien (seul « final
-- fantasy vii » marchait), et le site proposait alors d'ajouter un jeu… qui existait déjà.
-- search_games comprend désormais :
--   - les numéros en chiffres ou en chiffres romains (« 7 » ↔ « VII », de 2 à 20) ;
--   - les lettres et chiffres collés (« ff7 », « mgs2 », « re4 ») ;
--   - les abréviations des grandes séries (FF, MGS, GTA, RE, GT, KH…) ;
--   - quand aucun titre ne contient tous les mots : les titres les plus proches (fautes de
--     frappe), signalés par la nouvelle colonne approximate.
-- Le reste est inchangé (recopié de 20261102120600_search_platforms.sql). Ajouter une colonne
-- de sortie oblige à supprimer puis recréer la fonction : ses droits sont redonnés à la fin.
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
  platforms text[],
  approximate boolean
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
  -- Lettres et chiffres collés se lisent séparément : « ff7 » = « ff 7 », « mgs2 » = « mgs 2 »
  -- (un code produit reste entier : les morceaux sont recollés pour le chercher, plus bas)
  pieces as (
    select p.w, t.n * 100 + p.k as n
    from tokens t,
      regexp_split_to_table(
        regexp_replace(regexp_replace(public.normalize_name(t.w), '([a-z])([0-9])', '\1 \2', 'g'), '([0-9])([a-z])', '\1 \2', 'g'),
        ' ') with ordinality as p(w, k)
    where public.normalize_name(t.w) is not null
      and not exists (select 1 from aliases a where a.alias = public.normalize_name(t.w))
      and p.w <> ''
  ),
  -- Les numéros s'écrivent en chiffres ou en chiffres romains : « 7 » trouve « VII » et
  -- inversement (pas 1 ↔ I, qui trouverait presque tout)
  romans (arabic, roman) as (
    values ('2', 'ii'), ('3', 'iii'), ('4', 'iv'), ('5', 'v'), ('6', 'vi'), ('7', 'vii'), ('8', 'viii'),
           ('9', 'ix'), ('10', 'x'), ('11', 'xi'), ('12', 'xii'), ('13', 'xiii'), ('14', 'xiv'),
           ('15', 'xv'), ('16', 'xvi'), ('17', 'xvii'), ('18', 'xviii'), ('19', 'xix'), ('20', 'xx')
  ),
  -- Abréviations que les joueurs tapent pour les grandes séries
  abbreviations (abbr, expansion) as (
    values ('ff', 'finalfantasy'), ('ffx', 'finalfantasyx'), ('mgs', 'metalgearsolid'), ('mg', 'metalgear'),
           ('gta', 'grandtheftauto'), ('re', 'residentevil'), ('gt', 'granturismo'), ('ctr', 'crashteamracing'),
           ('kh', 'kingdomhearts'), ('dmc', 'devilmaycry'), ('sh', 'silenthill'), ('mk', 'mortalkombat'),
           ('tr', 'tombraider'), ('cod', 'callofduty'), ('moh', 'medalofhonor'), ('pes', 'proevolutionsoccer'),
           ('we', 'winningeleven'), ('dq', 'dragonquest'), ('sf', 'streetfighter'), ('soc', 'starocean'),
           ('thps', 'tonyhawksproskater'), ('nfs', 'needforspeed'), ('rr', 'ridgeracer'), ('sotn', 'symphonyofthenight'),
           ('dbz', 'dragonballz'), ('pop', 'princeofpersia')
  ),
  -- Chaque mot et ses équivalents (variants) ; pref et pref2 : ses formes probables dans un
  -- titre, numéro en chiffres romains (Final Fantasy VII) ou en chiffres (Resident Evil 4)
  words as (
    select pc.w, pc.n,
      coalesce(ab.expansion, ro.roman, pc.w) as pref,
      coalesce(ab.expansion, ra.arabic, pc.w) as pref2,
      array_remove(array[pc.w, ab.expansion, ro.roman, ra.arabic], null) as variants,
      array_remove(array['%' || pc.w || '%', '%' || ab.expansion || '%', '%' || ro.roman || '%', '%' || ra.arabic || '%'], null) as patterns
    from pieces pc
    left join abbreviations ab on ab.abbr = pc.w
    left join romans ro on ro.arabic = pc.w
    left join romans ra on ra.roman = pc.w
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
    select wd.n, g.id as game_id from words wd join public.game g on g.title_key like any (wd.patterns)
    union
    select wd.n, r.game_id from words wd join public.release r on r.local_title_key like any (wd.patterns)
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
      -- Le titre probable, abréviations développées et numéros en chiffres romains
      (select string_agg(wd.pref, '' order by wd.n) from words wd) as kp,
      (select string_agg(wd.pref2, '' order by wd.n) from words wd) as kp2,
      (select p.id from public.platform p where p.short_name = platform_code) as pid,
      (select array_agg(distinct p.id) from tokens t
         join aliases a on a.alias = public.normalize_name(t.w)
         join public.platform p on p.short_name = a.short_name) as pids
  ),
  -- Jeux candidats : tous les mots trouvés, ou le code produit
  exact as (
    select wg.game_id from word_games wg
    group by wg.game_id
    having count(distinct wg.n) = (select count(*) from words)
    union
    select r.game_id from q join public.release r
      on q.k ~ '[0-9]' and length(q.k) >= 4 and r.product_code_key like '%' || q.k || '%'
  ),
  -- Rien trouvé : les titres les plus proches (faute de frappe, mot mal orthographié),
  -- signalés comme approximatifs
  fuzzy as (
    select g.id as game_id
    from q, public.game g
    where not exists (select 1 from exact) and length(q.k) >= 4
      and extensions.similarity(g.title_key, q.kp) >= 0.3
    order by extensions.similarity(g.title_key, q.kp) desc
    limit 8
  ),
  candidates as (
    select game_id, false as approximate from exact
    union all
    select game_id, true from fuzzy
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
    ) as platforms,
    cd.approximate
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
    (g.title_key in (q.k, q.kp, q.kp2)) desc,
    (g.title_key like q.k || '%' or g.title_key like q.kp || '%' or g.title_key like q.kp2 || '%') desc,
    (g.title_key like '%' || q.k || '%' or g.title_key like '%' || q.kp || '%' or g.title_key like '%' || q.kp2 || '%') desc,
    (select count(*) from words wd where g.title_key like any (wd.patterns)) desc,
    greatest(extensions.similarity(g.title_key, q.kp), extensions.similarity(g.title_key, q.kp2)) desc,
    g.title
  limit least(greatest(coalesce(max_results, 20), 1), 50);
$$;

revoke execute on function public.search_games(text, int, text) from public;
grant execute on function public.search_games(text, int, text) to anon, authenticated;
