-- =====================================================================
-- Carte Mémoire · Studios choisis dans une liste, nouveaux studios vérifiés
--
-- Avant : un éditeur ou un développeur tapé dans une proposition était créé
-- d'office s'il n'existait pas (fautes de frappe = doublons).
-- Maintenant :
-- - l'auteur choisit dans la liste des studios existants (publisher_id,
--   developer_id) ; un nom inconnu reste possible, comme simple texte ;
-- - à la validation, un nom inconnu n'est jamais créé tout seul : le modérateur
--   confirme sa création (« create »), choisit un studio existant (son id) ou le
--   retire (« skip ») ; sans décision, la validation s'arrête et le dit.
-- - Les développeurs et éditeurs modifiés depuis « Modifier ce jeu » entrent dans
--   l'historique (et s'annulent).
-- =====================================================================

-- Studio d'une proposition : décision du modérateur, sinon studio choisi dans la
-- liste, sinon studio existant au même nom (ou ancien nom d'un studio fusionné) ;
-- un nom inconnu n'est créé que sur décision du modérateur
create function private.resolve_studio(p_id bigint, p_name text, decision jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v      bigint;
  v_name text := nullif(left(trim(coalesce(p_name, '')), 200), '');
begin
  if decision is not null and jsonb_typeof(decision) = 'number' then
    v := (decision #>> '{}')::bigint;
    if not exists (select 1 from public.company c where c.id = v) then
      raise exception 'Le studio choisi n''existe plus';
    end if;
    return v;
  end if;
  if decision is not null and decision #>> '{}' = 'skip' then
    return null;
  end if;
  if p_id is not null and exists (select 1 from public.company c where c.id = p_id) then
    return p_id;
  end if;
  if v_name is null then
    return null;
  end if;
  select c.id into v from public.company c
  where c.name_key = public.normalize_name(v_name)
  order by (c.wikidata_id is null), c.id
  limit 1;
  if v is null then
    select a.company_id into v from public.company_alias a where a.name_key = public.normalize_name(v_name);
  end if;
  if v is not null then
    return v;
  end if;
  if decision is not null and decision #>> '{}' = 'create' then
    insert into public.company (name) values (v_name) returning id into v;
    return v;
  end if;
  raise exception 'Nouveau studio « % » : vérifie qu''il existe bien, puis confirme sa création, choisis un studio existant ou retire-le', v_name;
end;
$$;
revoke execute on function private.resolve_studio(bigint, text, jsonb) from public, anon, authenticated;

drop function public.review_submission(bigint, boolean, text, text, bigint);

create function public.review_submission(
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

revoke execute on function public.review_submission(bigint, boolean, text, text, bigint, jsonb) from public, anon;
grant execute on function public.review_submission(bigint, boolean, text, text, bigint, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Historique des studios d'un jeu (développeurs) et d'une version (éditeurs)
-- ---------------------------------------------------------------------
create or replace function private.log_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
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
  -- Nom du studio gardé dans l'historique (lisible même si le studio change ensuite)
  if tg_table_name in ('game_developer', 'release_company') then
    r := r || jsonb_build_object('company_name', (select c.name from public.company c where c.id = (r ->> 'company_id')::bigint));
    if v_old is not null then v_old := r; end if;
    if v_new is not null then v_new := r; end if;
  end if;
  insert into public.catalog_change (table_name, row_key, game_id, action, old_values, new_values, changed_by)
  values (
    tg_table_name,
    case tg_table_name
      when 'game_genre' then (r ->> 'game_id') || ':' || (r ->> 'genre_id')
      when 'release_region' then (r ->> 'release_id') || ':' || (r ->> 'region_id')
      when 'release_barcode' then (r ->> 'release_id') || ':' || (r ->> 'barcode')
      when 'game_developer' then (r ->> 'game_id') || ':' || (r ->> 'company_id')
      when 'release_company' then (r ->> 'release_id') || ':' || (r ->> 'company_id') || ':' || (r ->> 'role')
      else r ->> 'id'
    end,
    case tg_table_name
      when 'game' then (r ->> 'id')::bigint
      when 'image' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      when 'release_region' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      when 'release_barcode' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      when 'release_company' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      else (r ->> 'game_id')::bigint
    end,
    lower(tg_op), v_old, v_new, uid
  );
  return null;
end;
$f$;

create trigger log_catalog_change after insert or delete on public.game_developer
  for each row execute function private.log_catalog_change();
create trigger log_catalog_change after insert or delete on public.release_company
  for each row execute function private.log_catalog_change();

-- Annuler un ajout ou un retrait de studio
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
  elsif c.table_name = 'game_developer' and c.action = 'insert' then
    delete from public.game_developer
    where game_id = (c.new_values ->> 'game_id')::bigint and company_id = (c.new_values ->> 'company_id')::bigint;
  elsif c.table_name = 'game_developer' and c.action = 'delete' then
    insert into public.game_developer (game_id, company_id)
    values ((c.old_values ->> 'game_id')::bigint, (c.old_values ->> 'company_id')::bigint)
    on conflict do nothing;
  elsif c.table_name = 'release_company' and c.action = 'insert' then
    delete from public.release_company
    where release_id = (c.new_values ->> 'release_id')::bigint and company_id = (c.new_values ->> 'company_id')::bigint
      and role = (c.new_values ->> 'role')::public.company_role;
  elsif c.table_name = 'release_company' and c.action = 'delete' then
    insert into public.release_company (release_id, company_id, role)
    values ((c.old_values ->> 'release_id')::bigint, (c.old_values ->> 'company_id')::bigint, (c.old_values ->> 'role')::public.company_role)
    on conflict do nothing;
  else
    raise exception 'Ce type de modification ne peut pas être annulé automatiquement';
  end if;

  update public.catalog_change set undone_at = now(), undone_by = (select auth.uid()) where id = change_id;
end;
$$;
