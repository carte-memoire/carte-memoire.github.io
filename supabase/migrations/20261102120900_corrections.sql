-- =====================================================================
-- « Suggérer une correction » champ par champ, et membres de confiance
-- (amélioration n° 3 de l'audit du 22 novembre 2026)
--
-- Jusqu'ici, un membre qui voyait une date, une zone, un code produit, un genre ou un
-- studio faux ne pouvait que le signaler en texte libre, et le modérateur retapait tout.
-- Désormais il propose la valeur juste, champ par champ :
--   proposition action 'update', cible 'game' ou 'release', target_id = l'objet,
--   data = { "changes": { <champ>: <nouvelle valeur>, … } }, sources = son explication.
--   Jeu     : first_release_date (+ first_release_precision), genre_ids, developer_ids
--   Version : zone, product_code, languages
-- La base vérifie chaque champ (liste fermée, valeurs existantes) ; un modérateur
-- l'accepte en un clic (review_submission) et la modification entre dans l'historique,
-- annulable comme les autres.
--
-- Membre de confiance (profile.trusted, réglé par l'admin) : ses corrections sont
-- appliquées tout de suite (proposition acceptée d'office, notée « membre de confiance »),
-- toujours visibles dans l'historique et annulables. Les jaquettes, résumés et nouveaux
-- jeux restent vérifiés par un modérateur.
-- =====================================================================

-- 1. Membre de confiance (lisible par tous, comme le rôle ; modifiable par l'admin seul :
--    les membres n'ont le droit de modifier que leur pseudo, leur photo et leur visibilité)
alter table public.profile add column trusted boolean not null default false;
comment on column public.profile.trusted is
  'Membre de confiance : ses corrections champ par champ sont appliquées sans attendre un modérateur.';

-- 2. Une modification de jeu est un résumé OU une correction ; une modification de
--    version, une correction
alter table public.submission drop constraint submission_summary_text;
alter table public.submission add constraint submission_update_content check (
  not (action = 'update' and target in ('game', 'release'))
  or (data ? 'changes' and not data ? 'summary' and jsonb_typeof(data -> 'changes') = 'object')
  or (target = 'game' and not data ? 'changes' and length(trim(coalesce(data ->> 'summary', ''))) between 20 and 3000)
);

-- Une seule correction en attente par membre et par jeu ou version
create unique index submission_one_pending_correction
  on public.submission (author_id, target, target_id)
  where action = 'update' and status = 'pending' and data ? 'changes';

-- 3. Chaque champ d'une correction est vérifié avant d'entrer dans la base
create function private.check_submission_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c   jsonb := new.data -> 'changes';
  bad text;
begin
  if not (new.action = 'update' and new.data ? 'changes') then
    return new;
  end if;
  if c = '{}'::jsonb then
    raise exception 'Aucune correction : change au moins un champ';
  end if;

  if new.target = 'game' then
    select k into bad from jsonb_object_keys(c) k
    where k not in ('first_release_date', 'first_release_precision', 'genre_ids', 'developer_ids') limit 1;
    if bad is not null then
      raise exception 'Ce champ ne se corrige pas ici : %', bad;
    end if;
    if not exists (select 1 from public.game where id = new.target_id) then
      raise exception 'Ce jeu n''existe plus';
    end if;
    if c ? 'first_release_date' and jsonb_typeof(c -> 'first_release_date') <> 'null' then
      if (c ->> 'first_release_date') !~ '^\d{4}-\d{2}-\d{2}$'
         or (c ->> 'first_release_date')::date not between date '1970-01-01' and current_date then
        raise exception 'Date de première sortie invalide';
      end if;
      if coalesce(c ->> 'first_release_precision', 'day') not in ('day', 'month', 'year') then
        raise exception 'Précision de date invalide';
      end if;
    end if;
    if c ? 'genre_ids' then
      if jsonb_typeof(c -> 'genre_ids') <> 'array' or jsonb_array_length(c -> 'genre_ids') not between 1 and 12
         or exists (select 1 from jsonb_array_elements(c -> 'genre_ids') x
                    where jsonb_typeof(x) <> 'number' or not exists (select 1 from public.genre g where g.id = (x #>> '{}')::bigint)) then
        raise exception 'Genres invalides (de 1 à 12 genres de la liste)';
      end if;
    end if;
    if c ? 'developer_ids' then
      if jsonb_typeof(c -> 'developer_ids') <> 'array' or jsonb_array_length(c -> 'developer_ids') not between 1 and 10
         or exists (select 1 from jsonb_array_elements(c -> 'developer_ids') x
                    where jsonb_typeof(x) <> 'number' or not exists (select 1 from public.company co where co.id = (x #>> '{}')::bigint)) then
        raise exception 'Studios invalides (de 1 à 10 studios déjà connus du site)';
      end if;
    end if;

  elsif new.target = 'release' then
    select k into bad from jsonb_object_keys(c) k where k not in ('zone', 'product_code', 'languages') limit 1;
    if bad is not null then
      raise exception 'Ce champ ne se corrige pas ici : %', bad;
    end if;
    if not exists (select 1 from public.release where id = new.target_id) then
      raise exception 'Cette version n''existe plus';
    end if;
    if c ? 'zone' and jsonb_typeof(c -> 'zone') <> 'null'
       and (c ->> 'zone') not in ('NTSC-J', 'NTSC-U', 'PAL', 'region_free') then
      raise exception 'Zone invalide';
    end if;
    if c ? 'product_code' and jsonb_typeof(c -> 'product_code') <> 'null'
       and (c ->> 'product_code') !~ '^[A-Z0-9][A-Z0-9 ./-]{2,29}$' then
      raise exception 'Code produit invalide (lettres majuscules, chiffres, tirets : SCES-00867)';
    end if;
    if c ? 'languages' then
      if jsonb_typeof(c -> 'languages') <> 'array' or jsonb_array_length(c -> 'languages') > 20
         or exists (select 1 from jsonb_array_elements(c -> 'languages') x
                    where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[a-z]{2,3}$') then
        raise exception 'Langues invalides';
      end if;
    end if;

  else
    raise exception 'Seuls un jeu ou une version se corrigent';
  end if;

  if exists (
    select 1 from public.submission s
    where s.author_id = new.author_id and s.action = 'update' and s.status = 'pending'
      and s.target = new.target and s.target_id = new.target_id and s.data ? 'changes'
  ) then
    raise exception 'Tu as déjà une correction en attente pour ce jeu ou cette version : attends la décision d''un modérateur, ou retire-la dans « Mes propositions »';
  end if;
  if (select count(*) from public.submission s
      where s.author_id = new.author_id and s.status = 'pending' and s.data ? 'changes') >= 50 then
    raise exception 'Cinquante corrections attendent déjà un modérateur : patiente un peu avant d''en proposer d''autres';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_submission_correction() from public, anon, authenticated;
create trigger check_submission_correction
  before insert on public.submission
  for each row execute function private.check_submission_correction();

-- 4. Appliquer une correction (acceptée par un modérateur, ou d'un membre de confiance)
create function private.apply_correction(p_submission bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submission;
  c jsonb;
begin
  select * into s from public.submission where id = p_submission;
  c := s.data -> 'changes';
  if s.target = 'game' then
    if not exists (select 1 from public.game where id = s.target_id) then
      raise exception 'Ce jeu n''existe plus';
    end if;
    if c ? 'first_release_date' then
      update public.game
      set first_release_date = (c ->> 'first_release_date')::date,
          first_release_precision = case when c ->> 'first_release_date' is null then null
                                         else coalesce(c ->> 'first_release_precision', 'day')::public.date_precision end
      where id = s.target_id;
    end if;
    if c ? 'genre_ids' then
      delete from public.game_genre gg
      where gg.game_id = s.target_id
        and gg.genre_id not in (select (x #>> '{}')::bigint from jsonb_array_elements(c -> 'genre_ids') x);
      insert into public.game_genre (game_id, genre_id)
      select s.target_id, (x #>> '{}')::bigint from jsonb_array_elements(c -> 'genre_ids') x
      on conflict do nothing;
      -- Genres choisis par une personne : le jeu sort de la file « Jeux sans genre »
      update public.game set genres_reviewed = true where id = s.target_id;
    end if;
    if c ? 'developer_ids' then
      delete from public.game_developer gd
      where gd.game_id = s.target_id
        and gd.company_id not in (select (x #>> '{}')::bigint from jsonb_array_elements(c -> 'developer_ids') x);
      insert into public.game_developer (game_id, company_id)
      select s.target_id, (x #>> '{}')::bigint from jsonb_array_elements(c -> 'developer_ids') x
      on conflict do nothing;
    end if;
  else
    if not exists (select 1 from public.release where id = s.target_id) then
      raise exception 'Cette version n''existe plus';
    end if;
    update public.release r
    set zone = case when c ? 'zone' then (c ->> 'zone')::public.video_zone else r.zone end,
        product_code = case when c ? 'product_code' then nullif(trim(c ->> 'product_code'), '') else r.product_code end,
        languages = case when c ? 'languages' then array(select x #>> '{}' from jsonb_array_elements(c -> 'languages') x) else r.languages end
    where r.id = s.target_id;
  end if;
end;
$$;
revoke execute on function private.apply_correction(bigint) from public, anon, authenticated;

-- 5. Membre de confiance : sa correction est appliquée dès qu'elle est envoyée (s'il a
--    validé sa double authentification, quand il l'a activée)
create function private.apply_trusted_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'update' and new.data ? 'changes' and new.status = 'pending'
     and exists (select 1 from public.profile p where p.id = new.author_id and p.trusted)
     and (select private.mfa_satisfied()) then
    perform private.apply_correction(new.id);
    update public.submission
    set status = 'approved', review_note = 'Appliquée directement : membre de confiance', reviewed_at = now()
    where id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function private.apply_trusted_correction() from public, anon, authenticated;
create trigger apply_trusted_correction
  after insert on public.submission
  for each row execute function private.apply_trusted_correction();

-- 6. Le modérateur accepte une correction comme les autres propositions
--    (fonction recopiée de 20261010191700_cover_submissions.sql, avec la branche « changes »)
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

  -- Acceptation d'une correction champ par champ (date, genres, studios d'un jeu ; zone,
  -- code produit, langues d'une version) : appliquée telle que proposée
  if s.action = 'update' and s.data ? 'changes' then
    perform private.apply_correction(s.id);
    update public.submission
    set status = 'approved', moderator_id = (select auth.uid()), review_note = nullif(trim(note), ''), reviewed_at = now()
    where id = submission_id;
    return jsonb_build_object('status', 'approved');
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

-- 7. L'admin fait d'un membre un membre de confiance (ou le retire)
create function public.admin_set_trusted(target uuid, trusted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.profile where id = target) then
    raise exception 'Membre introuvable';
  end if;
  update public.profile set trusted = admin_set_trusted.trusted where id = target;
end;
$$;
revoke execute on function public.admin_set_trusted(uuid, boolean) from public, anon;
grant execute on function public.admin_set_trusted(uuid, boolean) to authenticated;

-- 8. Liste des membres pour l'admin : propositions acceptées, refusées, et la confiance
--    (recopiée de 20261010192300_avatars.sql, avec trois colonnes de plus)
drop function public.admin_members(text, integer, integer);
create function public.admin_members(search text default null, max_results integer default 50, start_at integer default 0)
returns table (
  id uuid, username text, avatar text, role public.user_role, email text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, two_factor boolean,
  banned_until timestamptz, ban_reason text,
  owned_count integer, wanted_count integer, submission_count integer,
  accepted_count integer, rejected_count integer, trusted boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.username, p.avatar, p.role, u.email::text,
      coalesce(u.created_at, p.created_at), u.last_sign_in_at, u.email_confirmed_at is not null,
      exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
      b.until, b.reason,
      (select count(*)::int from public.collection_item c where c.profile_id = p.id and c.status = 'owned'),
      (select count(*)::int from public.collection_item c where c.profile_id = p.id and c.status = 'wanted'),
      (select count(*)::int from public.submission s where s.author_id = p.id),
      (select count(*)::int from public.submission s where s.author_id = p.id and s.status = 'approved'),
      (select count(*)::int from public.submission s where s.author_id = p.id and s.status = 'rejected'),
      p.trusted,
      count(*) over ()
    from public.profile p
    join auth.users u on u.id = p.id
    left join private.member_ban b on b.member_id = p.id and b.until > now()
    where search is null or p.username ilike '%' || search || '%' or u.email ilike '%' || search || '%'
    order by lower(p.username)
    limit least(greatest(max_results, 1), 200) offset greatest(start_at, 0);
end;
$$;
revoke execute on function public.admin_members(text, integer, integer) from public, anon;
grant execute on function public.admin_members(text, integer, integer) to authenticated;
