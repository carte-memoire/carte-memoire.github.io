-- =====================================================================
-- Navigateurs de confiance, et connexion par passkey sans code
--
-- 1. « Faire confiance à ce navigateur pendant 30 jours » : après le code à
--    6 chiffres, le navigateur reçoit un jeton aléatoire (seule son empreinte
--    SHA-256 est gardée ici). À la connexion suivante (mot de passe), il le
--    présente : la session est alors reconnue comme si le code avait été tapé.
--    Il faut donc le mot de passe ET ce navigateur. Révocable un par un ou
--    tous ensemble ; effacés si le mot de passe change ; sans effet après une
--    nouvelle activation de la double authentification.
-- 2. Une passkey vaut deux facteurs à elle seule (l'appareil, et l'empreinte
--    ou le code de l'appareil) : une session ouverte par passkey ne demande
--    pas de code.
-- private.is_aal2() (utilisée par toutes les règles de sécurité) en tient compte.
-- =====================================================================

create table private.trusted_browser (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  label        text not null default '' check (length(label) <= 80),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz not null
);
create index on private.trusted_browser (user_id);

-- Sessions reconnues grâce à un navigateur de confiance (identifiant de session du jeton)
create table private.trusted_session (
  session_id uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  browser_id uuid not null references private.trusted_browser (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on private.trusted_session (browser_id);

revoke all on private.trusted_browser, private.trusted_session from public, anon, authenticated;

-- Un navigateur de confiance n'a d'effet que s'il est plus récent que l'activation de
-- la double authentification en place (la désactiver puis la réactiver les annule)
create function private.trusted_browser_valid(b private.trusted_browser)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select b.expires_at > now()
     and b.created_at >= coalesce((
       select max(f.created_at) from auth.mfa_factors f where f.user_id = b.user_id and f.status = 'verified'
     ), '-infinity'::timestamptz);
$$;
revoke execute on function private.trusted_browser_valid(private.trusted_browser) from public, anon, authenticated;

-- La session en cours a-t-elle été reconnue par un navigateur de confiance encore valable ?
create function private.session_trusted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.trusted_session t
    join private.trusted_browser b on b.id = t.browser_id
    where t.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and t.user_id = (select auth.uid())
      and private.trusted_browser_valid(b)
  );
$$;

-- La session a-t-elle été ouverte avec une passkey ?
create function private.passkey_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) a
    where a ->> 'method' in ('passkey', 'webauthn', 'mfa/webauthn')
  );
$$;

revoke execute on function private.session_trusted(), private.passkey_session() from public, anon;
grant execute on function private.session_trusted(), private.passkey_session() to authenticated;

-- Double authentification : code validé (aal2), passkey, ou navigateur de confiance
create or replace function private.is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or (select private.passkey_session())
      or (select private.session_trusted());
$$;

-- Après le code à 6 chiffres : ce navigateur devient de confiance pour 30 jours.
-- Renvoie le jeton, à garder par le navigateur (10 navigateurs au plus par compte).
create function public.trust_this_browser(label text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_token text;
begin
  -- Seulement juste après le vrai code (pas depuis un autre navigateur de confiance)
  if v_user is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Valide d''abord le code de double authentification';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.trusted_browser (user_id, token_hash, label, expires_at, last_used_at)
  values (v_user, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), left(coalesce(trim(label), ''), 80), now() + interval '30 days', now());
  delete from private.trusted_browser
  where id in (select id from private.trusted_browser where user_id = v_user order by created_at desc offset 10);
  return v_token;
end;
$$;
revoke execute on function public.trust_this_browser(text) from public, anon;
grant execute on function public.trust_this_browser(text) to authenticated;

-- À la connexion : le navigateur présente son jeton ; s'il est valable, la session est reconnue
create function public.use_trusted_browser(token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_browser private.trusted_browser;
begin
  if v_user is null or v_session is null or token is null or length(token) > 200 then
    return false;
  end if;
  select * into v_browser from private.trusted_browser b
  where b.user_id = v_user and b.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
  if not found or not private.trusted_browser_valid(v_browser) then
    return false;
  end if;
  update private.trusted_browser set last_used_at = now() where id = v_browser.id;
  insert into private.trusted_session (session_id, user_id, browser_id)
  values (v_session, v_user, v_browser.id)
  on conflict (session_id) do update set browser_id = excluded.browser_id
  where private.trusted_session.user_id = excluded.user_id;
  -- Ménage : vieilles sessions
  delete from private.trusted_session where created_at < now() - interval '60 days';
  return true;
end;
$$;
revoke execute on function public.use_trusted_browser(text) from public, anon;
grant execute on function public.use_trusted_browser(text) to authenticated;

-- Mon compte : mes navigateurs de confiance (celui-ci signalé)
create function public.my_trusted_browsers()
returns table (id uuid, label text, created_at timestamptz, last_used_at timestamptz, expires_at timestamptz, is_current boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.label, b.created_at, b.last_used_at, b.expires_at,
         exists (select 1 from private.trusted_session t
                 where t.browser_id = b.id and t.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid)
  from private.trusted_browser b
  where b.user_id = (select auth.uid()) and private.trusted_browser_valid(b)
  order by b.last_used_at desc nulls last, b.created_at desc;
$$;
revoke execute on function public.my_trusted_browsers() from public, anon;
grant execute on function public.my_trusted_browsers() to authenticated;

-- Retirer un navigateur de confiance, ou tous (« Se déconnecter de tous les appareils »)
create function public.revoke_trusted_browser(browser uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.trusted_browser where id = browser and user_id = (select auth.uid());
$$;
create function public.revoke_trusted_browsers()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.trusted_browser where user_id = (select auth.uid());
$$;
revoke execute on function public.revoke_trusted_browser(uuid), public.revoke_trusted_browsers() from public, anon;
grant execute on function public.revoke_trusted_browser(uuid), public.revoke_trusted_browsers() to authenticated;

-- Mot de passe changé (ou réinitialisé) : plus aucun navigateur de confiance
create function private.forget_trusted_browsers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from private.trusted_browser where user_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function private.forget_trusted_browsers() from public, anon, authenticated;

create trigger forget_trusted_browsers
  after update of encrypted_password on auth.users
  for each row execute function private.forget_trusted_browsers();
