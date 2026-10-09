-- =====================================================================
-- Carte Mémoire · Migration : modération des propositions
--
-- Un modérateur (en double authentification) accepte ou refuse une proposition :
--   - accepter applique la proposition au catalogue : nouveau jeu ou nouvelle
--     version, région et date, éditeur, développeur, jaquette ;
--   - refuser demande un motif, affiché à l'auteur.
-- Le modérateur peut aussi rattacher un « nouveau jeu » proposé à un jeu qui
-- existe déjà (doublon repéré) : seule la version est alors ajoutée.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Ce que la proposition a créé (pour mener l'auteur à la fiche du jeu)
-- ---------------------------------------------------------------------
alter table public.submission
  add column created_game_id    bigint references public.game (id) on delete set null,
  add column created_release_id bigint references public.release (id) on delete set null;

create index on public.submission (created_game_id);
create index on public.submission (created_release_id);

-- Garde-fous sur la taille de ce qu'un membre peut envoyer
alter table public.submission
  add constraint submission_data_size check (pg_column_size(data) <= 16384),
  add constraint submission_sources_length check (length(sources) <= 2000),
  add constraint submission_review_note_length check (length(review_note) <= 2000);


-- ---------------------------------------------------------------------
-- 2. Société retrouvée par son nom (normalisé), ou créée
-- ---------------------------------------------------------------------
create function private.company_by_name(p_name text)
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
    insert into public.company (name) values (left(v_name, 200)) returning id into v;
  end if;
  return v;
end;
$$;

revoke execute on function private.company_by_name(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Traitement d'une proposition
--    security definer : la fonction fait elle-même les vérifications
--    (modérateur, double authentification, proposition en attente),
--    puis écrit dans le catalogue et dans la proposition.
--    cover_path : chemin de la jaquette DÉJÀ copiée par le modérateur dans
--    le stockage public « covers » (le stockage ne se manipule pas en SQL).
-- ---------------------------------------------------------------------
create function public.review_submission(
  submission_id bigint,
  approve boolean,
  note text default null,
  cover_path text default null,
  attach_to_game_id bigint default null
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

  -- Acceptation
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

  insert into public.release (game_id, platform_id, zone, local_title, product_code, edition_type, edition_name, languages)
  values (
    v_game,
    coalesce((r ->> 'platform_id')::bigint, (select id from public.platform where short_name = 'PS1')),
    nullif(r ->> 'zone', '')::public.video_zone,
    left(trim(r ->> 'local_title'), 200),
    nullif(upper(trim(r ->> 'product_code')), ''),
    coalesce(nullif(r ->> 'edition_type', ''), 'standard')::public.edition_type,
    nullif(left(trim(r ->> 'edition_name'), 60), ''),
    coalesce(array(select jsonb_array_elements_text(r -> 'languages')), '{}')
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

  v_company := private.company_by_name(r ->> 'publisher_name');
  if v_company is not null then
    insert into public.release_company (release_id, company_id, role)
    values (v_release, v_company, 'publisher') on conflict do nothing;
  end if;

  v_company := private.company_by_name(r ->> 'developer_name');
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

revoke execute on function public.review_submission(bigint, boolean, text, text, bigint) from public, anon;
grant execute on function public.review_submission(bigint, boolean, text, text, bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Doublons : fusion forcée et faux positifs
-- ---------------------------------------------------------------------

-- 4a. Fusion : nouvelle option « force ». Deux fiches avec des identifiants
-- Wikidata différents sont refusées par défaut (souvent deux jeux distincts),
-- mais Wikidata a lui-même des doublons : le modérateur peut confirmer.
-- La fiche gardée conserve son identifiant ; celui du doublon est perdu.
drop function public.merge_games(bigint, bigint);

-- Les propositions acceptées qui menaient au doublon mènent à la fiche gardée.
-- (Les modérateurs n'écrivent pas directement dans les propositions : petite
-- fonction dédiée, qui vérifie elle-même le rôle.)
create function private.relink_submissions(from_game bigint, to_game bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.submission
  set created_game_id = to_game
  where created_game_id = from_game
    and (select private.is_moderator()) and (select private.is_aal2());
$$;

revoke execute on function private.relink_submissions(bigint, bigint) from public, anon;
grant execute on function private.relink_submissions(bigint, bigint) to authenticated;

create function public.merge_games(keep_id bigint, duplicate_id bigint, force boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  dup public.game;
begin
  -- Sans utilisateur connecté, c'est une migration ou un script serveur
  -- (les visiteurs n'ont pas le droit d'appeler la fonction).
  if (select auth.uid()) is not null
     and not ((select private.is_moderator()) and (select private.is_aal2())) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent fusionner des fiches';
  end if;
  if keep_id = duplicate_id then
    raise exception 'Impossible de fusionner un jeu avec lui-même';
  end if;

  select * into dup from public.game where id = duplicate_id;
  if not found or not exists (select 1 from public.game where id = keep_id) then
    raise exception 'Jeu introuvable';
  end if;
  if not force and exists (
    select 1 from public.game k
    where k.id = keep_id and k.wikidata_id is not null
      and dup.wikidata_id is not null and k.wikidata_id <> dup.wikidata_id
  ) then
    raise exception 'Ces deux jeux ont des identifiants Wikidata différents : ce sont sans doute deux jeux distincts';
  end if;

  insert into public.game_developer (game_id, company_id)
  select keep_id, company_id from public.game_developer where game_id = duplicate_id
  on conflict do nothing;
  insert into public.game_genre (game_id, genre_id)
  select keep_id, genre_id from public.game_genre where game_id = duplicate_id
  on conflict do nothing;
  insert into public.game_series (game_id, series_id)
  select keep_id, series_id from public.game_series where game_id = duplicate_id
  on conflict do nothing;

  update public.release set game_id = keep_id where game_id = duplicate_id;
  perform private.relink_submissions(duplicate_id, keep_id);
  delete from public.game where id = duplicate_id;

  update public.game k set
    wikidata_id             = coalesce(k.wikidata_id, dup.wikidata_id),
    summary                 = coalesce(k.summary, dup.summary),
    first_release_precision = case when k.first_release_date is null then dup.first_release_precision else k.first_release_precision end,
    first_release_date      = coalesce(k.first_release_date, dup.first_release_date)
  where k.id = keep_id;

  delete from public.release r
  where r.game_id = keep_id and r.zone is null and r.product_code is null and r.edition_type = 'standard'
    and not exists (select 1 from public.image i where i.release_id = r.id)
    and not exists (select 1 from public.collection_item c where c.release_id = r.id)
    and not exists (select 1 from public.release_region rr where rr.release_id = r.id and rr.release_date is not null)
    and not exists (select 1 from public.release x where x.reissue_of = r.id)
    and exists (select 1 from public.release o where o.game_id = keep_id and o.id <> r.id);
end;
$$;

revoke execute on function public.merge_games(bigint, bigint, boolean) from public, anon;
grant execute on function public.merge_games(bigint, bigint, boolean) to authenticated;

-- 4b. « Ce ne sont pas des doublons » : le groupe disparaît de la liste
-- (il réapparaît si un nouveau jeu du même nom arrive : la liste des
-- fiches concernées est mémorisée).
create table public.dismissed_duplicate (
  title_key    text primary key,
  game_ids     bigint[] not null,
  dismissed_by uuid default auth.uid() references public.profile (id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.dismissed_duplicate enable row level security;

revoke all on public.dismissed_duplicate from anon, authenticated;
grant select, insert, delete on public.dismissed_duplicate to authenticated;

create policy "Moderators read" on public.dismissed_duplicate
  for select to authenticated using ((select private.is_moderator()));
create policy "Moderators insert (MFA)" on public.dismissed_duplicate
  for insert to authenticated with check ((select private.is_moderator()) and (select private.is_aal2()));
create policy "Moderators delete (MFA)" on public.dismissed_duplicate
  for delete to authenticated using ((select private.is_moderator()) and (select private.is_aal2()));

create or replace view public.possible_duplicate_game
with (security_invoker = true) as
select g.title_key,
       count(*)::int                 as total,
       array_agg(g.id order by g.id) as game_ids,
       array_agg(g.title order by g.id) as titles
from public.game g
group by g.title_key
having count(*) > 1
   and not exists (
     select 1 from public.dismissed_duplicate d
     where d.title_key = g.title_key
       and d.game_ids @> array_agg(g.id order by g.id)
   );
