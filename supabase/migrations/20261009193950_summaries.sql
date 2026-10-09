-- =====================================================================
-- Carte Mémoire · Migration : résumés des jeux
--
-- Deux origines possibles pour un résumé :
--   - l'introduction de l'article Wikipédia en français (import) : on garde
--     le lien de l'article, obligatoire pour respecter la licence CC BY-SA ;
--   - un texte écrit par la communauté : proposé par un membre, validé par un
--     modérateur. Il remplace alors celui de Wikipédia (plus de lien source).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Source du résumé
-- ---------------------------------------------------------------------
alter table public.game
  add column summary_source text,
  add constraint game_summary_source_check
    check (summary_source is null or summary_source ~ '^https://fr\.wikipedia\.org/'),
  add constraint game_summary_source_needs_summary
    check (summary_source is null or summary is not null),
  add constraint game_summary_length
    check (length(summary) <= 5000);

comment on column public.game.summary_source is
  'Adresse de l''article Wikipédia d''où vient le résumé (licence CC BY-SA : à afficher). Vide = texte de la communauté.';


-- ---------------------------------------------------------------------
-- 2. Proposer un résumé : action « update » sur un jeu, data = { "summary": "…" }
-- ---------------------------------------------------------------------
alter table public.submission
  add constraint submission_summary_text check (
    not (action = 'update' and target = 'game')
    or length(trim(coalesce(data ->> 'summary', ''))) between 20 and 3000
  );


-- ---------------------------------------------------------------------
-- 3. La modération sait appliquer un résumé
--    (même fonction qu'avant, avec une branche en plus au début de l'acceptation)
-- ---------------------------------------------------------------------
create or replace function public.review_submission(
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
