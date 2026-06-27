-- Isolated E2E fixture: a throwaway "E2E Sandbox" workspace, team, owner user
-- (e2e@owntheagenda.test / owntheagenda), and a sample 4-block workshop. Idempotent.
-- Applied to the project already; kept here for reproducibility. NOT a migration
-- (data, not schema). Teardown: delete the auth.users + workspace rows below.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000','ee2e0000-0000-4000-8000-000000000001','authenticated','authenticated',
        'e2e@owntheagenda.test', extensions.crypt('owntheagenda', extensions.gen_salt('bf')), now(), now(), now(),
        '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"E2E Tester"}')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where u.id='ee2e0000-0000-4000-8000-000000000001'
  and not exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='email');

insert into public.workspace (id, name, slug, plan, data_region, created_by)
values ('ee2e0000-0000-4000-8000-000000000010','E2E Sandbox','e2e-sandbox','free','eu','ee2e0000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.membership (workspace_id, user_id, role, status)
values ('ee2e0000-0000-4000-8000-000000000010','ee2e0000-0000-4000-8000-000000000001','owner','active')
on conflict (workspace_id, user_id) do nothing;

insert into public.team (id, workspace_id, name, slug, lead_user_id, created_by)
values ('ee2e0000-0000-4000-8000-000000000020','ee2e0000-0000-4000-8000-000000000010','E2E Team','e2e-team',
        'ee2e0000-0000-4000-8000-000000000001','ee2e0000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.workshop (id, workspace_id, team_id, title, status, created_by)
values ('ee2e0000-0000-4000-8000-000000000030','ee2e0000-0000-4000-8000-000000000010','ee2e0000-0000-4000-8000-000000000020',
        'E2E Sample Workshop','draft','ee2e0000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.block (workshop_id, ord, title, activity_type, duration, config) values
  ('ee2e0000-0000-4000-8000-000000000030',1,'Check-in','checkin',5,'{}'),
  ('ee2e0000-0000-4000-8000-000000000030',2,'Brainstorm','brainstorm',15,'{"budget":3}'),
  ('ee2e0000-0000-4000-8000-000000000030',3,'Dot vote','vote',8,'{"budget":3,"options":[]}'),
  ('ee2e0000-0000-4000-8000-000000000030',4,'Outcomes','outcome',10,'{}')
on conflict do nothing;
