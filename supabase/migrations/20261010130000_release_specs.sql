-- =====================================================================
-- Carte Mémoire · Caractéristiques d'une version (blocs de carte mémoire,
-- manette analogique, vibrations…) : contrôle des valeurs
--
-- Chaque console décrit ses caractéristiques dans platform.spec_fields (clé,
-- type, bornes, choix possibles). Une version ne peut enregistrer que ces
-- clés-là, avec des valeurs valides : la base le vérifie à chaque écriture.
-- =====================================================================

-- Message d'erreur (en français) si specs ne respecte pas fields, sinon null
create function private.spec_error(specs jsonb, fields jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  f jsonb;
begin
  for k, v in select e.key, e.value from jsonb_each(specs) e loop
    f := (select x from jsonb_array_elements(coalesce(fields, '[]')) x where x ->> 'key' = k limit 1);
    if f is null then
      return format('Caractéristique inconnue pour cette console : %s', k);
    end if;
    case f ->> 'type'
      when 'integer' then
        if jsonb_typeof(v) <> 'number'
           or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
           or (f ? 'min' and (v #>> '{}')::numeric < (f ->> 'min')::numeric)
           or (f ? 'max' and (v #>> '{}')::numeric > (f ->> 'max')::numeric) then
          return format('%s : nombre entier attendu (de %s à %s)', f ->> 'label', f ->> 'min', f ->> 'max');
        end if;
      when 'boolean' then
        if jsonb_typeof(v) <> 'boolean' then
          return format('%s : oui ou non attendu', f ->> 'label');
        end if;
      when 'choice' then
        if jsonb_typeof(v) <> 'string'
           or not exists (select 1 from jsonb_array_elements(f -> 'options') o where o ->> 'value' = v #>> '{}') then
          return format('%s : valeur non prévue', f ->> 'label');
        end if;
      when 'multi_choice' then
        if jsonb_typeof(v) <> 'array' or exists (
          select 1 from jsonb_array_elements(v) e
          where jsonb_typeof(e) <> 'string'
             or not exists (select 1 from jsonb_array_elements(f -> 'options') o where o ->> 'value' = e #>> '{}')
        ) then
          return format('%s : valeur non prévue', f ->> 'label');
        end if;
      else
        return format('Type de caractéristique inconnu : %s', f ->> 'type');
    end case;
  end loop;
  return null;
end;
$$;

create function private.check_release_specs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  msg text;
begin
  if new.specs = '{}'::jsonb then
    return new;
  end if;
  msg := private.spec_error(new.specs, (select p.spec_fields from public.platform p where p.id = new.platform_id));
  if msg is not null then
    raise exception '%', msg using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_release_specs
  before insert or update of specs, platform_id on public.release
  for each row execute function private.check_release_specs();
