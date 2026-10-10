-- =====================================================================
-- Carte Mémoire · Signalements d'erreurs et historique des modifications
--
-- 1. report : un membre signale une erreur sur un jeu (genre, titre, version,
--    jaquette, doublon…). Les modérateurs corrigent puis classent le
--    signalement (« corrigé » ou « rejeté », avec un mot pour l'auteur).
-- 2. catalog_change : journal tenu par la base elle-même. Chaque modification
--    d'un jeu, d'une version, d'un genre de jeu ou d'une image faite par une
--    personne connectée y est notée (qui, quand, valeurs avant et après).
--    Les imports (migrations) ne sont pas notés.
-- 3. undo_catalog_change : un modérateur annule une modification simple
--    (champs d'un jeu ou d'une version, genre ajouté ou retiré), si l'objet
--    n'a pas été modifié depuis. L'annulation est elle-même notée.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Signalements
-- ---------------------------------------------------------------------
create type public.report_kind as enum ('genre', 'title', 'release', 'cover', 'duplicate', 'other');
create type public.report_status as enum ('open', 'resolved', 'rejected');

create table public.report (
  id           bigint generated always as identity primary key,
  game_id      bigint not null references public.game (id) on delete cascade,
  release_id   bigint,
  kind         public.report_kind not null,
  message      text not null check (length(trim(message)) between 10 and 1000),
  author_id    uuid default auth.uid() references public.profile (id) on delete set null,
  status       public.report_status not null default 'open',
  moderator_id uuid references public.profile (id) on delete set null,
  review_note  text check (length(review_note) <= 500),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  -- La version signalée appartient bien à ce jeu
  foreign key (release_id, game_id) references public.release (id, game_id) on delete set null (release_id),
  check ((status = 'open') = (reviewed_at is null))
);
create index on public.report (status, created_at);
create index on public.report (game_id);
create index on public.report (author_id);
comment on table public.report is 'Erreurs signalées par les membres sur un jeu ou une version.';

alter table public.report enable row level security;
revoke all on public.report from anon, authenticated;
-- Un membre ne choisit que le contenu ; statut et traitement passent par review_report
grant select on public.report to authenticated;
grant insert (game_id, release_id, kind, message) on public.report to authenticated;

create policy "Read own reports, or all for moderators" on public.report
  for select to authenticated
  using (author_id = (select auth.uid()) or (select private.is_moderator()));
create policy "Members report as themselves" on public.report
  for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "MFA required to insert" on public.report as restrictive
  for insert to authenticated
  with check ((select private.mfa_satisfied()));

-- Garde-fou contre les abus : 20 signalements par jour et par membre
create function private.limit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.report r
      where r.author_id = new.author_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Tu as déjà envoyé 20 signalements aujourd''hui : merci ! Réessaie demain.';
  end if;
  return new;
end;
$$;
create trigger limit_reports before insert on public.report
  for each row execute function private.limit_reports();

create function public.review_report(report_id bigint, resolved boolean, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_moderator()) or not (select private.is_aal2()) then
    raise exception 'Seuls les modérateurs, en double authentification, peuvent traiter les signalements';
  end if;
  update public.report
  set status = case when resolved then 'resolved'::public.report_status else 'rejected'::public.report_status end,
      review_note = nullif(trim(note), ''),
      moderator_id = (select auth.uid()),
      reviewed_at = now()
  where id = report_id and status = 'open';
  if not found then
    raise exception 'Signalement introuvable ou déjà traité';
  end if;
end;
$$;
revoke execute on function public.review_report(bigint, boolean, text) from public, anon;
grant execute on function public.review_report(bigint, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Historique des modifications
-- ---------------------------------------------------------------------
create table public.catalog_change (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_key     text not null,
  game_id     bigint,  -- sans clé étrangère : l'historique survit au jeu supprimé
  action      text not null check (action in ('insert', 'update', 'delete')),
  old_values  jsonb,
  new_values  jsonb,
  changed_by  uuid references public.profile (id) on delete set null,
  changed_at  timestamptz not null default now(),
  undone_at   timestamptz,
  undone_by   uuid references public.profile (id) on delete set null
);
create index on public.catalog_change (game_id, changed_at desc);
create index on public.catalog_change (changed_at desc);
comment on table public.catalog_change is 'Journal des modifications du catalogue faites par des personnes connectées.';

alter table public.catalog_change enable row level security;
revoke all on public.catalog_change from anon, authenticated;
grant select on public.catalog_change to authenticated;
create policy "Moderators read history" on public.catalog_change
  for select to authenticated
  using ((select private.is_moderator()));

create function private.log_catalog_change()
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
    case tg_table_name when 'game_genre' then (r ->> 'game_id') || ':' || (r ->> 'genre_id') else r ->> 'id' end,
    case tg_table_name
      when 'game' then (r ->> 'id')::bigint
      when 'image' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      else (r ->> 'game_id')::bigint
    end,
    lower(tg_op), v_old, v_new, uid
  );
  return null;
end;
$$;

create trigger log_catalog_change after insert or update or delete on public.game
  for each row execute function private.log_catalog_change();
create trigger log_catalog_change after insert or update or delete on public.release
  for each row execute function private.log_catalog_change();
create trigger log_catalog_change after insert or delete on public.game_genre
  for each row execute function private.log_catalog_change();
create trigger log_catalog_change after insert or delete on public.image
  for each row execute function private.log_catalog_change();


-- ---------------------------------------------------------------------
-- 3. Annuler une modification
-- ---------------------------------------------------------------------
create function public.undo_catalog_change(change_id bigint)
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
  else
    raise exception 'Ce type de modification ne peut pas être annulé automatiquement';
  end if;

  update public.catalog_change set undone_at = now(), undone_by = (select auth.uid()) where id = change_id;
end;
$$;
revoke execute on function public.undo_catalog_change(bigint) from public, anon;
grant execute on function public.undo_catalog_change(bigint) to authenticated;
