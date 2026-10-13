-- =====================================================================
-- Carte Mémoire · Studios et codes-barres
--
-- 1. Catalogue filtré par studio : les jeux qu'il a développés, ou édités
--    dans la zone choisie (on les coche comme dans le catalogue complet).
-- 2. Recherche des studios et résumé d'un studio (nombre de jeux, années).
-- 3. Fusion des studios en double (modérateurs) ; l'ancien nom reste reconnu
--    pour que les propositions suivantes ne recréent pas le doublon.
-- 4. Codes-barres des versions (EAN-13, UPC-A, EAN-8), pour retrouver sa
--    version en scannant la boîte. Aucune source libre n'existe : les membres
--    les ajoutent (une fois par code), les modérateurs peuvent les retirer, et
--    chaque ajout est dans l'historique (annulable).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Catalogue : filtre par studio (nouveau paramètre, nouvelle signature)
-- ---------------------------------------------------------------------
drop function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text);

create function public.catalog_games(
  platform_code text default 'PS1',
  zone_code public.video_zone default null,
  first_letter text default null,
  family_code public.genre_family default null,
  release_year int default null,
  ownership text default null,
  search text default null,
  -- 'title', 'title_desc', 'date', 'date_desc', 'versions', 'added'
  sort_by text default 'title',
  page_number int default 1,
  page_size int default 50,
  -- 'japan' : studio japonais (avec la famille RPG : les JRPG) ; 'other' : studio d'un autre pays
  origin_filter text default null,
  -- Un studio : les jeux qu'il a développés, ou édités dans la zone choisie
  company_filter bigint default null
)
returns table (
  id bigint,
  title text,
  display_title text,
  release_date date,
  cover_path text,
  cover_other_zone boolean,
  releases jsonb,
  owned boolean,
  wanted boolean,
  total_count int
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      (select p.id from public.platform p where p.short_name = platform_code) as pid,
      nullif(public.normalize_name(search), '') as k,
      lower(first_letter) as l,
      least(greatest(coalesce(page_size, 50), 1), 1000) as size,
      greatest(coalesce(page_number, 1), 1) as page
  ),
  rel as (
    select r.id, r.game_id, r.local_title, r.local_title_key, r.product_code_key, r.edition_type,
           (select min(rr.release_date) from public.release_region rr where rr.release_id = r.id) as release_date
    from public.release r
    cross join params
    where (platform_code is null or r.platform_id = params.pid)
      and (zone_code is null or r.zone = zone_code)
  ),
  mine as (
    select c.release_id,
           bool_or(c.status = 'owned') as owned,
           bool_or(c.status = 'wanted') as wanted,
           (count(*) filter (where c.status = 'owned'))::int as copies,
           min(c.id) filter (where c.status = 'owned') as owned_item,
           min(c.id) filter (where c.status = 'wanted') as wanted_item
    from public.collection_item c
    where c.profile_id = (select auth.uid())
    group by c.release_id
  ),
  per_game as (
    select
      rel.game_id,
      (array_agg(rel.local_title order by (rel.edition_type = 'standard') desc, rel.id))[1] as local_title,
      (array_agg(rel.local_title_key order by (rel.edition_type = 'standard') desc, rel.id))[1] as local_key,
      min(rel.release_date) as release_date,
      count(*)::int as release_count,
      bool_or(coalesce(m.owned, false)) as owned,
      bool_or(coalesce(m.wanted, false)) as wanted,
      bool_or(params.k is not null and (rel.local_title_key like '%' || params.k || '%'
                                        or rel.product_code_key like '%' || params.k || '%')) as matches
    from rel
    cross join params
    left join mine m on m.release_id = rel.id
    group by rel.game_id
  ),
  filtered as (
    select
      g.id, g.title,
      case when zone_code is null then g.title else pg.local_title end as display_title,
      case when zone_code is null then g.title_key else pg.local_key end as display_key,
      -- Date de la zone ; sinon d'une autre zone sur la même console ; sinon la première
      -- sortie du jeu, seulement si elle suit le lancement de la console (pas la borne
      -- d'arcade ou la version d'une autre console, des années plus tôt)
      coalesce(
        pg.release_date,
        (select min(rr.release_date)
         from public.release r2
         join public.release_region rr on rr.release_id = r2.id
         where r2.game_id = g.id and (platform_code is null or r2.platform_id = params.pid)),
        case when g.first_release_date >= coalesce((select p.launch_date from public.platform p where p.id = params.pid), '-infinity')
             then g.first_release_date end
      ) as release_date,
      pg.release_count, g.created_at,
      pg.owned, pg.wanted
    from per_game pg
    join public.game g on g.id = pg.game_id
    cross join params
    where (params.k is null or pg.matches or g.title_key like '%' || params.k || '%')
      and (family_code is null or exists (
        select 1
        from public.game_genre gg
        join public.genre ge on ge.id = gg.genre_id
        where gg.game_id = g.id and family_code = any (ge.families)
      ))
      and (company_filter is null
           or exists (select 1 from public.game_developer gd where gd.game_id = g.id and gd.company_id = company_filter)
           or exists (
             select 1
             from public.release_company rc
             join public.release r3 on r3.id = rc.release_id
             where r3.game_id = g.id and rc.company_id = company_filter and rc.role = 'publisher'
               and (platform_code is null or r3.platform_id = params.pid)
               and (zone_code is null or r3.zone = zone_code)
           ))
      and (case origin_filter
             when 'japan' then public.origin(g) = 'JP'
             when 'other' then public.origin(g) <> 'JP'
             else true
           end)
      and (case ownership
             when 'owned' then pg.owned
             when 'missing' then not pg.owned
             when 'wanted' then pg.wanted
             else true
           end)
  ),
  paged as (
    select f.*, (count(*) over ())::int as total_count
    from filtered f
    cross join params
    where (params.l is null
           or (case when left(f.display_key, 1) ~ '[a-z]' then left(f.display_key, 1) else '#' end) = params.l)
      and (release_year is null or extract(year from f.release_date) = release_year)
    order by
      case when sort_by = 'date' then f.release_date end asc nulls last,
      case when sort_by = 'date_desc' then f.release_date end desc nulls last,
      case when sort_by = 'versions' then f.release_count end desc,
      case when sort_by = 'added' then f.created_at end desc,
      case when sort_by = 'added' then f.id end desc,
      case when sort_by = 'title_desc' then f.display_key end desc,
      f.display_key, f.display_title, f.id
    limit (select size from params)
    offset ((select page from params) - 1) * (select size from params)
  )
  select
    p.id,
    p.title,
    p.display_title,
    p.release_date,
    cov.path,
    cov.other_zone,
    (
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'local_title', r.local_title,
               'product_code', r.product_code,
               'languages', r.languages,
               'zone', r.zone,
               'edition_type', r.edition_type,
               'edition_name', r.edition_name,
               'platform', jsonb_build_object('short_name', pl.short_name),
               'owned', coalesce(m.owned, false),
               'wanted', coalesce(m.wanted, false),
               'copies', coalesce(m.copies, 0),
               'owned_item', m.owned_item,
               'wanted_item', m.wanted_item)
             order by r.zone, (r.edition_type = 'standard') desc, r.id)
      from public.release r
      join public.platform pl on pl.id = r.platform_id
      left join mine m on m.release_id = r.id
      where r.game_id = p.id
        and (platform_code is null or r.platform_id = (select pid from params))
        and (zone_code is null or r.zone = zone_code)
    ) as releases,
    p.owned,
    p.wanted,
    p.total_count
  from paged p
  left join lateral (
    select i.path, (zone_code is not null and r.zone is distinct from zone_code) as other_zone
    from public.image i
    join public.release r on r.id = i.release_id
    where r.game_id = p.id
      and i.type = 'front'
      and (platform_code is null or r.platform_id = (select pid from params))
    order by (zone_code is null or r.zone = zone_code) desc, (r.edition_type = 'standard') desc,
             (r.zone = 'PAL') desc nulls last, r.id, i.id
    limit 1
  ) cov on true
  order by
    case when sort_by = 'date' then p.release_date end asc nulls last,
    case when sort_by = 'date_desc' then p.release_date end desc nulls last,
    case when sort_by = 'versions' then p.release_count end desc,
    case when sort_by = 'added' then p.created_at end desc,
    case when sort_by = 'added' then p.id end desc,
    case when sort_by = 'title_desc' then p.display_key end desc,
    p.display_key, p.display_title, p.id;
$$;

revoke execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint) from public;
grant execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Studios : recherche et résumé
-- ---------------------------------------------------------------------

-- Studios ayant au moins un jeu (sur la console choisie), avec leur nombre de jeux
-- développés et édités ; sans recherche : tous (outil de modération)
create function public.search_companies(search text default null, platform_code text default null, max_results int default 5)
returns table (id bigint, name text, country text, wikidata_id text, developed int, published int)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      (select p.id from public.platform p where p.short_name = platform_code) as pid,
      nullif(public.normalize_name(search), '') as k,
      least(greatest(coalesce(max_results, 5), 1), 2000) as size
  ),
  dev as (
    select gd.company_id, count(distinct gd.game_id)::int as n
    from public.game_developer gd
    cross join params
    where platform_code is null
       or exists (select 1 from public.release r where r.game_id = gd.game_id and r.platform_id = params.pid)
    group by gd.company_id
  ),
  pub as (
    select rc.company_id, count(distinct r.game_id)::int as n
    from public.release_company rc
    join public.release r on r.id = rc.release_id
    cross join params
    where rc.role = 'publisher' and (platform_code is null or r.platform_id = params.pid)
    group by rc.company_id
  )
  select c.id, c.name, c.country, c.wikidata_id, coalesce(dev.n, 0), coalesce(pub.n, 0)
  from public.company c
  cross join params
  left join dev on dev.company_id = c.id
  left join pub on pub.company_id = c.id
  where (dev.n > 0 or pub.n > 0)
    and (params.k is null or c.name_key like '%' || params.k || '%')
  -- Nom exact, puis début du nom, puis les plus prolifiques
  order by (c.name_key = params.k) desc nulls last, (c.name_key like params.k || '%') desc nulls last,
           coalesce(dev.n, 0) + coalesce(pub.n, 0) desc, c.name, c.id
  limit (select size from params);
$$;
revoke execute on function public.search_companies(text, text, int) from public;
grant execute on function public.search_companies(text, text, int) to anon, authenticated;

-- Résumé d'un studio sur une console : jeux développés, édités, première et dernière année
create function public.company_summary(company_id bigint, platform_code text default null)
returns table (id bigint, name text, country text, wikidata_id text, developed int, published int, first_year int, last_year int)
language sql
stable
set search_path = ''
as $$
  with params as (
    select (select p.id from public.platform p where p.short_name = platform_code) as pid
  ),
  rel as (
    -- Versions des jeux développés, et versions éditées par le studio
    select r.id, r.game_id, false as published
    from public.game_developer gd
    join public.release r on r.game_id = gd.game_id
    cross join params
    where gd.company_id = company_summary.company_id and (platform_code is null or r.platform_id = params.pid)
    union all
    select r.id, r.game_id, true
    from public.release_company rc
    join public.release r on r.id = rc.release_id
    cross join params
    where rc.company_id = company_summary.company_id and rc.role = 'publisher'
      and (platform_code is null or r.platform_id = params.pid)
  )
  select c.id, c.name, c.country, c.wikidata_id,
         (select count(distinct rel.game_id)::int from rel where not rel.published),
         (select count(distinct rel.game_id)::int from rel where rel.published),
         (select extract(year from min(rr.release_date))::int from rel join public.release_region rr on rr.release_id = rel.id),
         (select extract(year from max(rr.release_date))::int from rel join public.release_region rr on rr.release_id = rel.id)
  from public.company c
  where c.id = company_summary.company_id;
$$;
revoke execute on function public.company_summary(bigint, text) from public;
grant execute on function public.company_summary(bigint, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Studios en double : anciens noms, paires écartées, fusion
-- ---------------------------------------------------------------------

-- Noms d'un studio fusionné : une proposition qui les emploie retrouve le bon studio
create table public.company_alias (
  name_key   text primary key,
  company_id bigint not null references public.company (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.company_alias is 'Anciens noms (normalisés) des studios fusionnés.';
alter table public.company_alias enable row level security;
revoke all on public.company_alias from anon, authenticated;

-- « Ce ne sont pas des doublons » (Atari, Inc. de 1972 et Atari Corporation…)
create table public.dismissed_company_duplicate (
  company_a    bigint not null references public.company (id) on delete cascade,
  company_b    bigint not null references public.company (id) on delete cascade,
  dismissed_by uuid default auth.uid() references public.profile (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (company_a, company_b),
  check (company_a < company_b)
);
alter table public.dismissed_company_duplicate enable row level security;
revoke all on public.dismissed_company_duplicate from anon, authenticated;
grant select, insert, delete on public.dismissed_company_duplicate to authenticated;
create policy "Moderators read" on public.dismissed_company_duplicate
  for select to authenticated using ((select private.is_moderator()));
create policy "Moderators insert (MFA)" on public.dismissed_company_duplicate
  for insert to authenticated with check ((select private.is_moderator()) and (select private.is_aal2()));
create policy "Moderators delete (MFA)" on public.dismissed_company_duplicate
  for delete to authenticated using ((select private.is_moderator()) and (select private.is_aal2()));

-- Société retrouvée par son nom, ou par un ancien nom, ou créée
create or replace function private.company_by_name(p_name text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v bigint;
begin
  if v_name is null then
    return null;
  end if;
  select id into v from public.company
  where name_key = public.normalize_name(v_name)
  order by (wikidata_id is null), id
  limit 1;
  if v is null then
    select a.company_id into v from public.company_alias a where a.name_key = public.normalize_name(v_name);
  end if;
  if v is null then
    insert into public.company (name) values (left(v_name, 200)) returning id into v;
  end if;
  return v;
end;
$$;
revoke execute on function private.company_by_name(text) from public, anon, authenticated;

-- Fusion : les jeux développés et édités passent au studio gardé, qui reprend
-- le pays et la fiche Wikidata s'il n'en avait pas ; le doublon disparaît
create function public.merge_companies(keep_id bigint, duplicate_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.company;
  d public.company;
begin
  if not ((select private.is_moderator()) and (select private.is_aal2())) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent fusionner des studios';
  end if;
  if keep_id = duplicate_id then
    raise exception 'Choisis deux studios différents';
  end if;
  select * into k from public.company where id = keep_id for update;
  select * into d from public.company where id = duplicate_id for update;
  if k.id is null or d.id is null then
    raise exception 'Studio introuvable';
  end if;

  insert into public.game_developer (game_id, company_id)
  select gd.game_id, keep_id from public.game_developer gd where gd.company_id = duplicate_id
  on conflict do nothing;
  delete from public.game_developer where company_id = duplicate_id;

  insert into public.release_company (release_id, company_id, role)
  select rc.release_id, keep_id, rc.role from public.release_company rc where rc.company_id = duplicate_id
  on conflict do nothing;
  delete from public.release_company where company_id = duplicate_id;

  update public.platform set manufacturer_id = keep_id where manufacturer_id = duplicate_id;

  if k.wikidata_id is null and d.wikidata_id is not null then
    update public.company set wikidata_id = null where id = duplicate_id;
    update public.company set wikidata_id = d.wikidata_id where id = keep_id;
  end if;
  update public.company set country = coalesce(country, d.country), updated_at = now() where id = keep_id;

  update public.company_alias set company_id = keep_id where company_id = duplicate_id;
  if d.name_key is distinct from k.name_key and d.name_key is not null then
    insert into public.company_alias (name_key, company_id) values (d.name_key, keep_id)
    on conflict (name_key) do update set company_id = excluded.company_id;
  end if;
  delete from public.dismissed_company_duplicate where duplicate_id in (company_a, company_b);
  delete from public.company where id = duplicate_id;
end;
$$;
revoke execute on function public.merge_companies(bigint, bigint) from public, anon;
grant execute on function public.merge_companies(bigint, bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Codes-barres des versions
-- ---------------------------------------------------------------------

-- Code GTIN normalisé : chiffres seuls, UPC-A (12) complété en EAN-13, EAN-8 gardé ;
-- null si la clé de contrôle est fausse (code mal lu ou mal recopié)
create function private.normalize_barcode(code text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with d as (
    select regexp_replace(coalesce(code, ''), '[^0-9]', '', 'g') as raw
  ),
  n as (
    select case when length(raw) = 12 then '0' || raw else raw end as v from d
  )
  select n.v
  from n
  where length(n.v) in (8, 13)
    and (10 - (select sum(substr(n.v, length(n.v) - i, 1)::int * case when i % 2 = 1 then 3 else 1 end)
               from generate_series(1, length(n.v) - 1) i) % 10) % 10 = right(n.v, 1)::int;
$$;
-- Appelée seulement par les fonctions du site (droits du propriétaire)
revoke execute on function private.normalize_barcode(text) from public, anon, authenticated;

create table public.release_barcode (
  barcode    text not null check (barcode = private.normalize_barcode(barcode)),
  release_id bigint not null references public.release (id) on delete cascade,
  added_by   uuid default auth.uid() references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (barcode, release_id)
);
create index on public.release_barcode (release_id);
comment on table public.release_barcode is 'Codes-barres (EAN/UPC) imprimés sur les boîtes, ajoutés par les membres en scannant leurs jeux.';

alter table public.release_barcode enable row level security;
revoke all on public.release_barcode from anon, authenticated;
-- Qui a ajouté le code ne regarde que les modérateurs (historique) : colonne non lisible
grant select (barcode, release_id, created_at) on public.release_barcode to anon, authenticated;
grant delete on public.release_barcode to authenticated;
create policy "Public read" on public.release_barcode
  for select to anon, authenticated using (true);
create policy "Moderators delete (MFA)" on public.release_barcode
  for delete to authenticated using ((select private.is_moderator()) and (select private.is_aal2()));

-- Les versions qui portent ce code (souvent une seule). Exécutée avec les droits du
-- propriétaire pour appeler la normalisation (schéma privé, fermé aux visiteurs) ;
-- elle ne lit que des données publiques du catalogue.
create function public.releases_by_barcode(code text)
returns table (
  release_id bigint, game_id bigint, game_title text, local_title text, zone public.video_zone,
  edition_type public.edition_type, edition_name text, languages text[], platform text, barcode text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, g.id, g.title, r.local_title, r.zone, r.edition_type, r.edition_name, r.languages, p.short_name, b.barcode
  from public.release_barcode b
  join public.release r on r.id = b.release_id
  join public.game g on g.id = r.game_id
  join public.platform p on p.id = r.platform_id
  where b.barcode = (select private.normalize_barcode(code))
  order by r.id;
$$;
revoke execute on function public.releases_by_barcode(text) from public;
grant execute on function public.releases_by_barcode(text) to anon, authenticated;

-- Associer un code à sa version : tout membre connecté, une fois par code (un code
-- déjà associé ailleurs ne se déplace que par un modérateur), 100 par jour au plus
create function public.add_release_barcode(target_release bigint, code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  v_code text := private.normalize_barcode(code);
begin
  if uid is null then
    raise exception 'Connecte-toi pour associer un code-barres à une version';
  end if;
  if not (select private.mfa_satisfied()) then
    raise exception 'Valide d''abord ta double authentification';
  end if;
  if v_code is null then
    raise exception 'Code-barres invalide : vérifie les chiffres sous les barres';
  end if;
  if not exists (select 1 from public.release r where r.id = target_release) then
    raise exception 'Version introuvable';
  end if;
  if exists (select 1 from public.release_barcode b where b.barcode = v_code and b.release_id = target_release) then
    return v_code;
  end if;
  if exists (select 1 from public.release_barcode b where b.barcode = v_code)
     and not ((select private.is_moderator()) and (select private.is_aal2())) then
    raise exception 'Ce code-barres est déjà associé à une autre version. S''il est faux, signale l''erreur sur la fiche du jeu.';
  end if;
  if (select count(*) from public.release_barcode b where b.added_by = uid and b.created_at > now() - interval '1 day') >= 100 then
    raise exception 'Limite atteinte : 100 codes-barres par jour. Merci pour ton aide, reviens demain !';
  end if;
  insert into public.release_barcode (barcode, release_id, added_by) values (v_code, target_release, uid);
  return v_code;
end;
$$;
revoke execute on function public.add_release_barcode(bigint, text) from public, anon;
grant execute on function public.add_release_barcode(bigint, text) to authenticated;

-- Historique : chaque ajout ou retrait de code-barres est journalisé (et annulable)
create or replace function private.log_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := (select auth.uid());
  o     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r     jsonb := coalesce(n, o);
  v_old jsonb := o;
  v_new jsonb := n;
begin
  -- Migrations et imports (pas de personne connectée) : pas de journal
  if uid is null then
    return null;
  end if;
  -- Modification : seulement les champs qui ont changé (hors dates techniques et
  -- colonnes calculées *_key)
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, o -> k), jsonb_object_agg(k, n -> k) into v_old, v_new
    from jsonb_object_keys(n) k
    where k not in ('updated_at', 'created_at') and k not like '%\_key' and (o -> k) is distinct from (n -> k);
    if v_old is null then
      return null;
    end if;
  end if;
  insert into public.catalog_change (table_name, row_key, game_id, action, old_values, new_values, changed_by)
  values (
    tg_table_name,
    case tg_table_name
      when 'game_genre' then (r ->> 'game_id') || ':' || (r ->> 'genre_id')
      when 'release_region' then (r ->> 'release_id') || ':' || (r ->> 'region_id')
      when 'release_barcode' then (r ->> 'release_id') || ':' || (r ->> 'barcode')
      else r ->> 'id'
    end,
    case tg_table_name
      when 'game' then (r ->> 'id')::bigint
      when 'image' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      when 'release_region' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      when 'release_barcode' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      else (r ->> 'game_id')::bigint
    end,
    lower(tg_op), v_old, v_new, uid
  );
  return null;
end;
$$;

create trigger log_catalog_change after insert or delete on public.release_barcode
  for each row execute function private.log_catalog_change();

-- Annuler : un code ajouté par erreur se retire, un code retiré revient
create or replace function public.undo_catalog_change(change_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.catalog_change;
  current jsonb;
  sets    text;
begin
  if not (select private.is_moderator()) or not (select private.is_aal2()) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent annuler une modification';
  end if;
  select * into c from public.catalog_change where id = change_id for update;
  if not found then
    raise exception 'Modification introuvable';
  end if;
  if c.undone_at is not null then
    raise exception 'Cette modification a déjà été annulée';
  end if;

  if c.action = 'update' and c.table_name in ('game', 'release') then
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', c.table_name) into current using c.row_key::bigint;
    if current is null then
      raise exception 'L''objet modifié n''existe plus';
    end if;
    -- Refus si un champ a encore changé depuis : on n'écrase pas le travail de quelqu'un
    if exists (select 1 from jsonb_object_keys(c.new_values) k where (current -> k) is distinct from (c.new_values -> k)) then
      raise exception 'Ces champs ont été modifiés depuis : annulation impossible sans écraser une modification plus récente';
    end if;
    select string_agg(format('%I = r.%I', k, k), ', ') into sets from jsonb_object_keys(c.old_values) k;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2',
                   c.table_name, sets, c.table_name)
      using c.old_values, c.row_key::bigint;
  elsif c.table_name = 'game_genre' and c.action = 'insert' then
    delete from public.game_genre
    where game_id = (c.new_values ->> 'game_id')::bigint and genre_id = (c.new_values ->> 'genre_id')::bigint;
  elsif c.table_name = 'game_genre' and c.action = 'delete' then
    insert into public.game_genre (game_id, genre_id)
    values ((c.old_values ->> 'game_id')::bigint, (c.old_values ->> 'genre_id')::bigint)
    on conflict do nothing;
  elsif c.table_name = 'release_barcode' and c.action = 'insert' then
    delete from public.release_barcode
    where barcode = c.new_values ->> 'barcode' and release_id = (c.new_values ->> 'release_id')::bigint;
  elsif c.table_name = 'release_barcode' and c.action = 'delete' then
    insert into public.release_barcode (barcode, release_id, added_by)
    values (c.old_values ->> 'barcode', (c.old_values ->> 'release_id')::bigint, (c.old_values ->> 'added_by')::uuid)
    on conflict do nothing;
  else
    raise exception 'Ce type de modification ne peut pas être annulé automatiquement';
  end if;

  update public.catalog_change set undone_at = now(), undone_by = (select auth.uid()) where id = change_id;
end;
$$;
