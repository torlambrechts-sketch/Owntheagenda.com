-- =====================================================================
-- OwnTheAgenda · Seed (LOCAL DEVELOPMENT ONLY)
-- ---------------------------------------------------------------------
-- Recreates the mockup's demo spine: the "Lumio AS" workspace and its
-- six-person leadership team (Kari Nordmann et al.). Runs as the postgres
-- role (RLS bypassed), so it writes tables directly rather than via RPC.
--
-- Do NOT run against production. Intended for `supabase db reset` /
-- `supabase start`. All rows use ON CONFLICT DO NOTHING for idempotency.
-- Dev password for every demo user: "owntheagenda"
-- =====================================================================

-- ----- demo auth users (profiles are created by the on_auth_user_created trigger) ---
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111101','authenticated','authenticated','kari@lumio.example',   extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Kari Nordmann"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111102','authenticated','authenticated','henrik@lumio.example', extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Henrik Solberg"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111103','authenticated','authenticated','ingrid@lumio.example', extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ingrid Dahl"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111104','authenticated','authenticated','mathias@lumio.example',extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Mathias Berg"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111105','authenticated','authenticated','sofie@lumio.example',  extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sofie Lund"}'),
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111106','authenticated','authenticated','anders@lumio.example', extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Anders Vik"}')
on conflict (id) do nothing;

-- ----- workspace -----------------------------------------------------
insert into public.workspace (id, name, slug, plan, data_region, created_by)
values ('22222222-2222-2222-2222-222222222201', 'Lumio AS', 'lumio', 'pro', 'eu',
        '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;

-- ----- memberships (Kari owner, Sofie admin, rest members) -----------
insert into public.membership (workspace_id, user_id, role) values
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','owner'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111105','admin'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111102','member'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111103','member'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111104','member'),
  ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111106','member')
on conflict (workspace_id, user_id) do nothing;

-- ----- team ----------------------------------------------------------
insert into public.team (id, workspace_id, name, slug, lead_user_id, description, created_by)
values ('33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',
        'Lumio leadership team', 'leadership', '11111111-1111-1111-1111-111111111101',
        'The six-person executive team.', '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;

-- ----- team members (role titles + consent, per the mockup) ----------
insert into public.team_member (team_id, user_id, role_title, is_lead, consent_share) values
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111101','CEO',            true,  true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111102','CFO',            false, true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111103','VP Product',     false, true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111104','VP Sales',       false, false),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111105','VP People',      false, true),
  ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111106','VP Engineering', false, true)
on conflict (team_id, user_id) do nothing;
