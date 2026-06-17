-- =====================================================================
-- OwnTheAgenda · Seed (LOCAL / DEV ONLY)
-- ---------------------------------------------------------------------
-- Recreates the mockup's demo spine: the "Lumio AS" workspace and its
-- six-person leadership team (Kari Nordmann et al.). Runs as the postgres
-- role (RLS bypassed), so it writes tables directly rather than via RPC.
--
-- Demo password for every user: "owntheagenda"
--
-- NOTE: to be able to *sign in*, directly-seeded auth users need (a) the
-- GoTrue token columns set to '' (not NULL) and (b) an auth.identities row
-- for the email provider — both handled below. Do NOT run in production.
-- =====================================================================

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111101','authenticated','authenticated','kari@lumio.example',   extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Kari Nordmann"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111102','authenticated','authenticated','henrik@lumio.example', extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Henrik Solberg"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111103','authenticated','authenticated','ingrid@lumio.example', extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Ingrid Dahl"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111104','authenticated','authenticated','mathias@lumio.example',extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Mathias Berg"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111105','authenticated','authenticated','sofie@lumio.example',  extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Sofie Lund"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111106','authenticated','authenticated','anders@lumio.example', extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Anders Vik"}')
on conflict (id) do nothing;

-- Email-provider identities (required by GoTrue for password sign-in).
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@lumio.example'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

insert into public.workspace (id, name, slug, plan, data_region, created_by)
values ('22222222-2222-2222-2222-222222222201', 'Lumio AS', 'lumio', 'pro', 'eu', '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;

insert into public.membership (workspace_id, user_id, role) values
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','owner'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111105','admin'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111102','member'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111103','member'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111104','member'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111106','member')
on conflict (workspace_id, user_id) do nothing;

insert into public.team (id, workspace_id, name, slug, lead_user_id, description, created_by)
values ('33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',
        'Lumio leadership team', 'leadership', '11111111-1111-1111-1111-111111111101',
        'The six-person executive team.', '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;

insert into public.team_member (team_id, user_id, role_title, is_lead, consent_share) values
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111101','CEO',            true,  true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111102','CFO',            false, true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111103','VP Product',     false, true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111104','VP Sales',       false, false),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111105','VP People',      false, true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111106','VP Engineering', false, true)
on conflict (team_id, user_id) do nothing;
