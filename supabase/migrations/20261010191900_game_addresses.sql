-- =====================================================================
-- Adresses lisibles des fiches : /jeu/ps1/final-fantasy-vii
--
-- Avant : /jeu/36-final-fantasy-vii (le numéro du jeu dans la base). Désormais
-- chaque jeu a une adresse unique « console/titre » (game.slug), calculée une
-- fois pour toutes :
--   - la console : celle de sa première sortie (un jeu PS1 et PS2 → ps1) ;
--   - le titre en minuscules, sans accents ni ponctuation, 60 caractères au plus ;
--     un « titre pour l'adresse » (game.slug_title) le remplace s'il est rempli :
--     titre japonais écrit en lettres latines (超謎王 → chou-nazo-ou) ; à défaut
--     de lettres latines, le code produit ;
--   - deux jeux au même titre sur la même console : le plus ancien garde
--     l'adresse simple, l'autre prend l'année (ps1/spider-man-2001), puis -2…
-- Les anciennes adresses ne cassent jamais : titre corrigé, jeux fusionnés…
-- l'ancienne adresse est gardée (game_slug_history) et mène au bon jeu. Les
-- adresses /jeu/<numéro> restent comprises par le site, qui redirige.
-- =====================================================================

-- Texte → morceau d'adresse : « Final Fantasy VII » → « final-fantasy-vii »
create function public.slugify(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(both '-' from left(trim(both '-' from regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))),
    '[^a-z0-9]+', '-', 'g')), 60));
$$;

alter table public.game add column slug text;
alter table public.game add constraint game_slug_unique unique (slug);
alter table public.game add constraint game_slug_format check (slug ~ '^[a-z0-9]+/[a-z0-9]+(-[a-z0-9]+)*$');
comment on column public.game.slug is 'Adresse de la fiche après /jeu/ : console de la première sortie, puis le titre (ps1/final-fantasy-vii).';
alter table public.game add column slug_title text check (slug_title is null or length(trim(slug_title)) between 1 and 120);
comment on column public.game.slug_title is 'Titre à utiliser pour l''adresse, s''il diffère (titre japonais en lettres latines…).';

-- Anciennes adresses (titre corrigé, jeu fusionné…) : elles mènent toujours au bon jeu
create table public.game_slug_history (
  slug       text primary key,
  game_id    bigint not null references public.game (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.game_slug_history (game_id);
alter table public.game_slug_history enable row level security;
create policy "Old game addresses: public read" on public.game_slug_history for select to anon, authenticated using (true);
revoke insert, update, delete on public.game_slug_history from anon, authenticated;

-- L'adresse d'un jeu : calculée s'il n'en a pas, recalculée si son titre a changé
-- (l'ancienne passe dans l'historique). Sans aucune version, rien (pas de console).
create function private.assign_game_slug(target bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game    public.game;
  v_console text;
  v_name    text;
  v_base    text;
  v_year    text;
  v_try     text;
  n         int := 1;
begin
  select * into v_game from public.game where id = target;
  if not found then
    return;
  end if;
  -- La console de l'adresse ne change jamais : seule la partie « titre » suit les corrections
  v_console := nullif(split_part(v_game.slug, '/', 1), '');
  if v_console is null then
    select lower(pl.short_name) into v_console
    from public.release r join public.platform pl on pl.id = r.platform_id
    where r.game_id = target
    order by pl.launch_date nulls last, pl.id
    limit 1;
  end if;
  if v_console is null then
    return;
  end if;
  v_name := nullif(public.slugify(coalesce(v_game.slug_title, v_game.title)), '');
  if v_name is null then
    select nullif(public.slugify(r.product_code), '') into v_name
    from public.release r where r.game_id = target and r.product_code is not null order by r.id limit 1;
  end if;
  v_base := v_console || '/' || coalesce(v_name, 'jeu');
  -- Titre inchangé (adresse simple ou déjà départagée par l'année) : on garde
  if v_game.slug is not null and v_game.slug ~ ('^' || v_base || '(-[0-9]{4})?(-[0-9]+)?$') then
    return;
  end if;
  v_year := to_char(v_game.first_release_date, 'YYYY');
  v_try := v_base;
  while exists (select 1 from public.game g where g.slug = v_try and g.id <> target)
     or exists (select 1 from public.game_slug_history h where h.slug = v_try and h.game_id <> target) loop
    n := n + 1;
    v_try := v_base || case
      when v_year is null then '-' || n
      when n = 2 then '-' || v_year
      else '-' || v_year || '-' || (n - 1)
    end;
  end loop;
  if v_game.slug is not null then
    insert into public.game_slug_history (slug, game_id) values (v_game.slug, target)
    on conflict (slug) do update set game_id = excluded.game_id;
  end if;
  delete from public.game_slug_history where slug = v_try;
  update public.game set slug = v_try where id = target;
end;
$$;
revoke execute on function private.assign_game_slug(bigint) from public, anon, authenticated;

-- Première version d'un nouveau jeu : il reçoit son adresse. Une version qui passe
-- d'un jeu à un autre (fusion de deux jeux) : l'adresse de l'ancien mène au nouveau.
create function private.game_slug_on_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.game_id is distinct from old.game_id then
    insert into public.game_slug_history (slug, game_id)
    select g.slug, new.game_id from public.game g where g.id = old.game_id and g.slug is not null
    on conflict (slug) do nothing;
  end if;
  if (select slug from public.game where id = new.game_id) is null then
    perform private.assign_game_slug(new.game_id);
  end if;
  return new;
end;
$$;
revoke execute on function private.game_slug_on_release() from public, anon, authenticated;
create trigger assign_game_slug after insert or update of game_id, platform_id on public.release
  for each row execute function private.game_slug_on_release();

-- Titre corrigé : nouvelle adresse, l'ancienne reste valable
create function private.game_slug_on_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.slug_title is distinct from old.slug_title then
    perform private.assign_game_slug(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function private.game_slug_on_title() from public, anon, authenticated;
create trigger assign_game_slug after update of title, slug_title on public.game
  for each row execute function private.game_slug_on_title();

-- Adresse → jeu (adresse actuelle, sinon ancienne adresse)
create function public.game_id_by_slug(path text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select g.id from public.game g where g.slug = lower(path)),
    (select h.game_id from public.game_slug_history h where h.slug = lower(path))
  );
$$;
revoke execute on function public.game_id_by_slug(text) from public;
grant execute on function public.game_id_by_slug(text) to anon, authenticated;

-- Calcul initial : du plus ancien au plus récent (le premier sorti garde l'adresse
-- simple), sans encombrer l'historique des modifications du catalogue
alter table public.game disable trigger log_catalog_change;
alter table public.game disable trigger set_updated_at;
-- (Déclencheurs coupés) Les jeux au titre uniquement japonais : leur titre en lettres latines (Hepburn)
update public.game g set slug_title = v.latin
from (values
  ('後夜祭', 'Kouyasai'),
  ('ファンタステップ', 'Fantastep'),
  ('天空のレストラン', 'Tenkuu no Restaurant'),
  ('学園戦隊ソルブラスト', 'Gakuen Sentai Solblast'),
  ('天使な小生意気', 'Tenshi na Konamaiki'),
  ('おジャ魔女どれみドッカ〜ン!にじいろパラダイス', 'Ojamajo Doremi Dokkaan! Nijiiro Paradise'),
  ('ここ掘れ!プッカ', 'Koko Hore! Pukka'),
  ('やきとり娘〜スゴ腕繁盛記〜', 'Yakitori Musume: Sugoude Hanjouki'),
  ('カートンくん', 'Carton-kun'),
  ('超謎王', 'Chou Nazo Ou'),
  ('宇宙戦艦ヤマトシリーズ', 'Uchuu Senkan Yamato'),
  ('ピックスの大冒険', 'Pikkusu no Daibouken')
) as v(title, latin)
where g.title = v.title;

do $$
declare
  g record;
begin
  for g in select id from public.game order by first_release_date nulls last, id loop
    perform private.assign_game_slug(g.id);
  end loop;
end;
$$;
alter table public.game enable trigger log_catalog_change;
alter table public.game enable trigger set_updated_at;

-- ---------------------------------------------------------------------
-- L'adresse dans les listes du site : catalogue, recherche, page publique
-- d'une collection, scanner (mêmes fonctions qu'avant, une colonne en plus)
-- ---------------------------------------------------------------------
drop function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint, bigint);
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
  total_count int,
  slug text
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
    p.total_count,
    (select g.slug from public.game g where g.id = p.id)
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
revoke execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint, bigint) from public;
grant execute on function public.catalog_games(text, public.video_zone, text, public.genre_family, int, text, text, text, int, int, text, bigint, bigint) to anon, authenticated;

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
  slug text
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
    c.product_code as matched_code,
    g.slug
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

drop function public.public_collection(text);
create function public.public_collection(member text)
returns table (
  status public.item_status, release_id bigint, game_id bigint, game_title text, local_title text,
  zone public.video_zone, edition_type public.edition_type, edition_name text, languages text[], platform text,
  cover_path text, release_date date, condition public.item_condition,
  has_box boolean, has_manual boolean, has_media boolean, has_spine_card boolean, trade_status public.trade_status,
  game_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.status, r.id, g.id, g.title, r.local_title, r.zone, r.edition_type, r.edition_name, r.languages, pl.short_name,
         coalesce(
           (select i.path from public.image i where i.release_id = r.id and i.type = 'front' order by i.id limit 1),
           (select i.path from public.image i join public.release r2 on r2.id = i.release_id
            where r2.game_id = g.id and r2.platform_id = r.platform_id and i.type = 'front'
            order by (r2.zone = r.zone) desc nulls last, (r2.edition_type = 'standard') desc, r2.id, i.id limit 1)
         ),
         coalesce((select min(rr.release_date) from public.release_region rr where rr.release_id = r.id), g.first_release_date),
         c.condition, c.has_box, c.has_manual, c.has_media, c.has_spine_card, c.trade_status, g.slug
  from public.profile p
  join public.collection_item c on c.profile_id = p.id
  join public.release r on r.id = c.release_id
  join public.game g on g.id = r.game_id
  join public.platform pl on pl.id = r.platform_id
  where lower(p.username) = lower(member)
    and (p.public_collection or p.id = (select auth.uid()))
  order by g.title_key, r.zone, r.id, c.id;
$$;
revoke execute on function public.public_collection(text) from public;
grant execute on function public.public_collection(text) to anon, authenticated;

drop function public.releases_by_barcode(text);
create function public.releases_by_barcode(code text)
returns table (
  release_id bigint, game_id bigint, game_title text, local_title text, zone public.video_zone,
  edition_type public.edition_type, edition_name text, languages text[], platform text, barcode text, game_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, g.id, g.title, r.local_title, r.zone, r.edition_type, r.edition_name, r.languages, p.short_name, b.barcode, g.slug
  from public.release_barcode b
  join public.release r on r.id = b.release_id
  join public.game g on g.id = r.game_id
  join public.platform p on p.id = r.platform_id
  where b.barcode = (select private.normalize_barcode(code))
  order by r.id;
$$;
revoke execute on function public.releases_by_barcode(text) from public;
grant execute on function public.releases_by_barcode(text) to anon, authenticated;
