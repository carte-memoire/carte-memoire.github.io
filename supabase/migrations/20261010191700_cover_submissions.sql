-- =====================================================================
-- Jaquettes proposées par les membres
--
-- Un membre propose la jaquette d'une version existante (photo ou image,
-- recadrée et redressée dans le site) ; un modérateur l'accepte ou la refuse.
-- Proposition : action 'create', cible 'image', target_id = la version,
-- data = { "cover_path": "<id du membre>/<fichier>" } dans le stockage privé
-- submission-images (mêmes règles que les jaquettes des propositions de jeux).
-- Acceptée, elle remplace le recto actuel de la version.
-- =====================================================================

-- Jusqu'ici, une création n'avait jamais de cible (target_id) ; une jaquette
-- proposée vise sa version. (Contrainte sans nom à l'origine : submission_check.)
alter table public.submission drop constraint submission_check;
alter table public.submission add constraint submission_target_id check (
  case when action = 'create' and target <> 'image' then target_id is null else target_id is not null end
);

alter table public.submission
  add constraint submission_cover_for_release check (
    not (action = 'create' and target = 'image')
    or (target_id is not null and data ? 'cover_path')
  );

-- Une seule jaquette en attente par membre et par version
create unique index submission_one_pending_cover
  on public.submission (author_id, target_id)
  where action = 'create' and target = 'image' and status = 'pending';

-- La jaquette annoncée doit vraiment avoir été envoyée ; pour une jaquette seule,
-- la version doit exister, et un membre n'en a pas plus de 30 en attente
create or replace function private.check_submission_cover()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data ? 'cover_path' and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'submission-images' and o.name = new.data ->> 'cover_path'
  ) then
    raise exception 'La jaquette envoyée est introuvable : %', new.data ->> 'cover_path';
  end if;
  if new.action = 'create' and new.target = 'image' then
    if not exists (select 1 from public.release r where r.id = new.target_id) then
      raise exception 'Cette version n''existe plus';
    end if;
    if exists (
      select 1 from public.submission s
      where s.author_id = new.author_id and s.target = 'image' and s.action = 'create'
        and s.status = 'pending' and s.target_id = new.target_id
    ) then
      raise exception 'Tu as déjà proposé une jaquette pour cette version : elle attend la décision d''un modérateur';
    end if;
    if (select count(*) from public.submission s
        where s.author_id = new.author_id and s.target = 'image' and s.status = 'pending') >= 30 then
      raise exception 'Trente jaquettes attendent déjà un modérateur : patiente un peu avant d''en proposer d''autres';
    end if;
  end if;
  return new;
end;
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
  v_replaced jsonb;
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

  -- Acceptation d'une jaquette proposée pour une version existante : elle remplace
  -- l'ancienne. Le site retire ensuite les fichiers remplacés (le stockage ne se
  -- manipule pas en SQL) : la fonction renvoie leurs chemins.
  if s.action = 'create' and s.target = 'image' then
    select r.game_id into v_game from public.release r where r.id = s.target_id;
    if v_game is null then
      raise exception 'Cette version n''existe plus';
    end if;
    if cover_path is null
       or not exists (select 1 from storage.objects o where o.bucket_id = 'covers' and o.name = cover_path) then
      raise exception 'La jaquette doit d''abord être copiée dans les jaquettes publiques';
    end if;
    select coalesce(jsonb_agg(i.path), '[]'::jsonb) into v_replaced
    from public.image i where i.release_id = s.target_id and i.type = 'front';
    delete from public.image where release_id = s.target_id and type = 'front';
    insert into public.image (release_id, type, path, uploaded_by)
    values (s.target_id, 'front', cover_path, s.author_id);
    update public.submission
    set status = 'approved', moderator_id = (select auth.uid()), review_note = nullif(trim(note), ''),
        reviewed_at = now(), created_game_id = v_game, created_release_id = s.target_id
    where id = submission_id;
    return jsonb_build_object('status', 'approved', 'game_id', v_game, 'release_id', s.target_id, 'replaced', v_replaced);
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

