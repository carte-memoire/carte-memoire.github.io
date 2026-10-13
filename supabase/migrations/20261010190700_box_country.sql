-- =====================================================================
-- Carte Mémoire · Pays de la boîte d'une version
--
-- Deux cas de versions nationales en Europe (vérifiés sur PSX Datacenter) :
-- - le disque change avec la langue (FF7 : anglais, français, allemand,
--   espagnol) : une version par langue, Platinum comprises (champ languages) ;
-- - un seul disque multilingue, mais des boîtes imprimées pour chaque pays
--   (Crash Bash Platinum : verso tout en français en France, verso allemand en
--   Allemagne…) : même code produit, boîtes différentes.
-- Le champ « Boîte vendue en » (box_region_id) distingue ce second cas ; la
-- langue reste celle du disque. Une boîte multi-pays : la zone « Europe ».
--
-- Nettoyage demandé : Crash Bash avait une Platinum générique (sans code ni
-- langue, venue de l'import) à côté de la Platinum française ajoutée à la main.
-- La générique disparaît ; ce qui y était rattaché passe à la française, qui
-- prend les 5 langues de son disque et la boîte « France ».
-- =====================================================================

alter table public.release
  add column box_region_id bigint references public.region (id) on delete set null;
comment on column public.release.box_region_id is 'Pays (ou zone) pour lequel la boîte a été imprimée, quand le même disque a eu des boîtes différentes selon le pays.';

create or replace function public.catalog_games(
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
  company_filter bigint default null,
  -- Une série (Final Fantasy, Resident Evil…)
  series_filter bigint default null
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
      and (series_filter is null
           or exists (select 1 from public.game_series gs where gs.game_id = g.id and gs.series_id = series_filter))
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
               'box_country', (select rg.code from public.region rg where rg.id = r.box_region_id),
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

create or replace function public.review_submission(
  submission_id bigint,
  approve boolean,
  note text default null,
  cover_path text default null,
  attach_to_game_id bigint default null,
  -- Décisions du modérateur sur les studios : {"publisher": "create" | "skip" | <id>, "developer": …}
  studios jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.submission;
  r          jsonb;
  v_game     bigint;
  v_release  bigint;
  v_region   bigint;
  v_company  bigint;
  v_date     date;
  v_precision public.date_precision;
begin
  if not ((select private.is_moderator()) and (select private.is_aal2())) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent traiter les propositions';
  end if;

  -- « for update » : deux modérateurs ne peuvent pas traiter la même proposition en même temps
  select * into s from public.submission where id = submission_id for update;
  if not found then
    raise exception 'Proposition introuvable';
  end if;
  if s.status <> 'pending' then
    raise exception 'Cette proposition a déjà été traitée';
  end if;

  -- Refus
  if not approve then
    if coalesce(trim(note), '') = '' then
      raise exception 'Indique le motif du refus : il sera affiché à l''auteur';
    end if;
    update public.submission
    set status = 'rejected', moderator_id = (select auth.uid()), review_note = trim(note), reviewed_at = now()
    where id = submission_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  -- Acceptation d'un résumé : il remplace l'ancien, qui n'est plus attribué à Wikipédia
  if s.action = 'update' and s.target = 'game' then
    if not exists (select 1 from public.game where id = s.target_id) then
      raise exception 'Ce jeu n''existe plus';
    end if;
    update public.game
    set summary = trim(s.data ->> 'summary'), summary_source = null
    where id = s.target_id;
    update public.submission
    set status = 'approved', moderator_id = (select auth.uid()), review_note = nullif(trim(note), ''),
        reviewed_at = now(), created_game_id = s.target_id
    where id = submission_id;
    return jsonb_build_object('status', 'approved', 'game_id', s.target_id);
  end if;

  -- Acceptation d'un nouveau jeu ou d'une nouvelle version
  if s.action <> 'create' or s.target not in ('game', 'release') then
    raise exception 'Ce type de proposition ne peut pas encore être appliqué automatiquement';
  end if;
  r := s.data -> 'release';
  if r is null or jsonb_typeof(r) <> 'object' then
    raise exception 'La proposition ne décrit aucune version';
  end if;

  -- Le jeu : rattachement choisi par le modérateur, jeu existant (nouvelle version), ou nouveau jeu
  if attach_to_game_id is not null then
    v_game := attach_to_game_id;
  elsif s.target = 'release' then
    v_game := (s.data ->> 'game_id')::bigint;
  end if;
  if v_game is not null and not exists (select 1 from public.game where id = v_game) then
    raise exception 'Le jeu auquel rattacher cette version n''existe plus';
  end if;

  v_date := nullif(r ->> 'release_date', '')::date;
  v_precision := case
    when v_date is null then null
    else coalesce(nullif(r ->> 'date_precision', ''), 'day')::public.date_precision
  end;

  if v_game is null then
    insert into public.game (title, first_release_date, first_release_precision)
    values (trim(s.data #>> '{game,title}'), v_date, v_precision)
    returning id into v_game;
  end if;

  insert into public.release (game_id, platform_id, zone, local_title, product_code, edition_type, edition_name, languages, box_region_id)
  values (
    v_game,
    coalesce((r ->> 'platform_id')::bigint, (select id from public.platform where short_name = 'PS1')),
    nullif(r ->> 'zone', '')::public.video_zone,
    left(trim(r ->> 'local_title'), 200),
    nullif(upper(trim(r ->> 'product_code')), ''),
    coalesce(nullif(r ->> 'edition_type', ''), 'standard')::public.edition_type,
    nullif(left(trim(r ->> 'edition_name'), 60), ''),
    coalesce(array(select jsonb_array_elements_text(r -> 'languages')), '{}'),
    (select rg.id from public.region rg where rg.code = nullif(r ->> 'box_region_code', '') and rg.type in ('country', 'zone'))
  )
  returning id into v_release;

  if nullif(r ->> 'region_code', '') is not null then
    select id into v_region from public.region where code = r ->> 'region_code';
    if v_region is null then
      raise exception 'Région inconnue : %', r ->> 'region_code';
    end if;
    insert into public.release_region (release_id, region_id, release_date, date_precision)
    values (v_release, v_region, v_date, v_precision);
  end if;

  v_company := private.resolve_studio(
    case when jsonb_typeof(r -> 'publisher_id') = 'number' then (r ->> 'publisher_id')::bigint end,
    r ->> 'publisher_name', studios -> 'publisher');
  if v_company is not null then
    insert into public.release_company (release_id, company_id, role)
    values (v_release, v_company, 'publisher') on conflict do nothing;
  end if;

  v_company := private.resolve_studio(
    case when jsonb_typeof(r -> 'developer_id') = 'number' then (r ->> 'developer_id')::bigint end,
    r ->> 'developer_name', studios -> 'developer');
  if v_company is not null then
    insert into public.game_developer (game_id, company_id)
    values (v_game, v_company) on conflict do nothing;
  end if;

  if s.data ? 'cover_path' then
    if cover_path is null
       or not exists (select 1 from storage.objects o where o.bucket_id = 'covers' and o.name = cover_path) then
      raise exception 'La jaquette doit d''abord être copiée dans les jaquettes publiques';
    end if;
    insert into public.image (release_id, type, path, uploaded_by)
    values (v_release, 'front', cover_path, s.author_id);
  end if;

  update public.submission
  set status = 'approved',
      moderator_id = (select auth.uid()),
      review_note = nullif(trim(note), ''),
      reviewed_at = now(),
      created_game_id = v_game,
      created_release_id = v_release
  where id = submission_id;

  return jsonb_build_object('status', 'approved', 'game_id', v_game, 'release_id', v_release);
end;
$$;


-- ---------------------------------------------------------------------
-- Fusion de deux versions d'un même jeu (doublon) : exemplaires, codes-barres,
-- dates, images et liens passent à la version gardée, puis le doublon disparaît.
-- Interne (pas d'accès par l'API) : utilisée ci-dessous pour Crash Bash.
-- ---------------------------------------------------------------------
create function private.merge_releases(keep_id bigint, duplicate_id bigint)
returns void
language plpgsql
set search_path = ''
as $f$
begin
  if keep_id = duplicate_id then
    raise exception 'Deux versions différentes sont nécessaires';
  end if;
  if (select game_id from public.release where id = keep_id) is distinct from (select game_id from public.release where id = duplicate_id) then
    raise exception 'Les deux versions doivent appartenir au même jeu';
  end if;
  update public.collection_item set release_id = keep_id where release_id = duplicate_id;
  insert into public.release_barcode (barcode, release_id, added_by, created_at)
  select b.barcode, keep_id, b.added_by, b.created_at from public.release_barcode b where b.release_id = duplicate_id
  on conflict do nothing;
  insert into public.release_region (release_id, region_id, release_date, date_precision)
  select keep_id, rr.region_id, rr.release_date, rr.date_precision from public.release_region rr where rr.release_id = duplicate_id
  on conflict do nothing;
  insert into public.release_company (release_id, company_id, role)
  select keep_id, rc.company_id, rc.role from public.release_company rc where rc.release_id = duplicate_id
  on conflict do nothing;
  update public.image i set release_id = keep_id
  where i.release_id = duplicate_id
    and not exists (select 1 from public.image k where k.release_id = keep_id and k.type = i.type);
  update public.submission set created_release_id = keep_id where created_release_id = duplicate_id;
  update public.release set reissue_of = keep_id where reissue_of = duplicate_id and id <> keep_id;
  delete from public.release where id = duplicate_id;
end;
$f$;
revoke execute on function private.merge_releases(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Crash Bash : une seule Platinum PAL, celle à la boîte française
-- ---------------------------------------------------------------------
do $$
declare
  v_game     bigint;
  v_generic  bigint;
  v_french   bigint;
  v_original public.release;
begin
  select g.id into v_game from public.game g where g.title = 'Crash Bash';
  if v_game is null then
    return;
  end if;
  select r.id into v_generic from public.release r
  where r.game_id = v_game and r.zone = 'PAL' and r.edition_type = 'reissue' and r.product_code is null
  order by r.id limit 1;
  select r.id into v_french from public.release r
  where r.game_id = v_game and r.zone = 'PAL' and r.edition_type = 'reissue' and r.product_code = 'SCES-02834'
  order by r.id limit 1;
  -- Rien à faire si la Platinum française n'existe pas (bases de test)
  if v_generic is null or v_french is null then
    return;
  end if;
  select * into v_original from public.release r
  where r.game_id = v_game and r.zone = 'PAL' and r.edition_type = 'standard' and r.product_code = 'SCES-02834'
  order by r.id limit 1;

  perform private.merge_releases(v_french, v_generic);

  update public.release
  set languages = coalesce(nullif(v_original.languages, '{}'), languages),
      reissue_of = coalesce(reissue_of, v_original.id),
      box_region_id = (select rg.id from public.region rg where rg.code = 'FR')
  where id = v_french;
end;
$$;
