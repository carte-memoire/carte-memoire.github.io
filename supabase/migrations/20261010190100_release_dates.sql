-- =====================================================================
-- Carte Mémoire · Dates de sortie : correction de Strider, et historique
--
-- 1. Strider n'est sorti sur PS1 qu'avec Strider 2 (« Strider Hiryū 1 & 2 » au
--    Japon, deux disques dans la boîte de Strider 2 ailleurs) : ses versions
--    prennent les dates de celles de Strider 2. La version japonaise était
--    enregistrée au 24 octobre 2006 au lieu du 24 février 2000.
-- 2. Les dates de sortie, désormais modifiables par les modérateurs depuis le
--    site, sont notées dans l'historique des modifications (catalog_change),
--    comme les jeux, versions, genres et images.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Strider : mêmes dates que Strider 2 (version par version)
-- ---------------------------------------------------------------------
with pairs (strider, strider2) as (
  select s.id, s2.id
  from public.release s
  join public.game g on g.id = s.game_id and g.title = 'Strider'
  join public.release s2 on s2.zone = s.zone
  join public.game g2 on g2.id = s2.game_id and g2.title = 'Strider 2'
  where s.edition_type = 'standard' and s2.edition_type = 'standard'
),
dates as (
  select p.strider, rr.region_id, rr.release_date, rr.date_precision
  from pairs p
  join public.release_region rr on rr.release_id = p.strider2
  where rr.release_date is not null
)
insert into public.release_region (release_id, region_id, release_date, date_precision)
select d.strider, d.region_id, d.release_date, d.date_precision from dates d
on conflict (release_id, region_id) do update
  set release_date = excluded.release_date, date_precision = excluded.date_precision;

-- Les anciennes lignes sans date ou à une autre région que celle de Strider 2
-- (« Japon » au 24/10/2006, « États-Unis » sans date) sont retirées : une seule
-- date par version, celle de la boîte
delete from public.release_region rr
using public.release s, public.game g
where rr.release_id = s.id and g.id = s.game_id and g.title = 'Strider'
  and exists (select 1 from public.release_region other where other.release_id = s.id and other.region_id <> rr.region_id)
  and not exists (
    select 1 from public.release s2
    join public.game g2 on g2.id = s2.game_id and g2.title = 'Strider 2'
    join public.release_region rr2 on rr2.release_id = s2.id
    where s2.zone = s.zone and rr2.region_id = rr.region_id and rr2.release_date is not null
  );


-- ---------------------------------------------------------------------
-- 2. Historique : les dates de sortie aussi
-- ---------------------------------------------------------------------
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
      else r ->> 'id'
    end,
    case tg_table_name
      when 'game' then (r ->> 'id')::bigint
      when 'image' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      when 'release_region' then (select rel.game_id from public.release rel where rel.id = (r ->> 'release_id')::bigint)
      else (r ->> 'game_id')::bigint
    end,
    lower(tg_op), v_old, v_new, uid
  );
  return null;
end;
$$;

create trigger log_catalog_change after insert or update or delete on public.release_region
  for each row execute function private.log_catalog_change();
