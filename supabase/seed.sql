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

-- ----- assessment demo: a closed "April pulse" + responses + fingerprints ----
insert into public.pulse (id, team_id, name, status, opened_at, closed_at, created_by)
values ('44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333301',
        'April pulse','closed', now() - interval '30 days', now() - interval '25 days',
        '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;

insert into public.pulse_response (pulse_id, respondent_id, dynamic, score)
select '44444444-4444-4444-4444-444444444401', u.uid, d.dyn, d.scores[u.idx]
from (values
  ('11111111-1111-1111-1111-111111111101'::uuid, 1),
  ('11111111-1111-1111-1111-111111111102'::uuid, 2),
  ('11111111-1111-1111-1111-111111111103'::uuid, 3),
  ('11111111-1111-1111-1111-111111111104'::uuid, 4),
  ('11111111-1111-1111-1111-111111111105'::uuid, 5),
  ('11111111-1111-1111-1111-111111111106'::uuid, 6)
) as u(uid, idx)
cross join (values
  ('psych_safety'::public.team_dynamic,    array[3,3,3,3,3,3]),
  ('trust'::public.team_dynamic,           array[4,4,3,4,4,3]),
  ('conflict_norms'::public.team_dynamic,  array[4,3,4,3,4,3]),
  ('role_clarity'::public.team_dynamic,    array[4,4,4,4,5,4]),
  ('decision_rights'::public.team_dynamic, array[3,2,3,2,3,3])
) as d(dyn, scores)
on conflict (pulse_id, respondent_id, dynamic) do nothing;

insert into public.fingerprint (team_member_id, trait, band_low, band_high)
select tm.id, f.trait, f.lo, f.hi
from public.team_member tm
join (values
  ('11111111-1111-1111-1111-111111111101'::uuid,'Drive',72,92),
  ('11111111-1111-1111-1111-111111111101'::uuid,'Directness',60,82),
  ('11111111-1111-1111-1111-111111111102'::uuid,'Rigour',68,88),
  ('11111111-1111-1111-1111-111111111102'::uuid,'Caution',58,80),
  ('11111111-1111-1111-1111-111111111103'::uuid,'Vision',70,90),
  ('11111111-1111-1111-1111-111111111103'::uuid,'Curiosity',66,86),
  ('11111111-1111-1111-1111-111111111104'::uuid,'Energy',74,94),
  ('11111111-1111-1111-1111-111111111104'::uuid,'Influence',64,84),
  ('11111111-1111-1111-1111-111111111105'::uuid,'Empathy',72,92),
  ('11111111-1111-1111-1111-111111111105'::uuid,'Steadiness',60,82),
  ('11111111-1111-1111-1111-111111111106'::uuid,'Focus',70,90),
  ('11111111-1111-1111-1111-111111111106'::uuid,'Pragmatism',62,84)
) as f(uid, trait, lo, hi) on f.uid = tm.user_id
where tm.team_id = '33333333-3333-3333-3333-333333333301'
on conflict (team_member_id, trait) do nothing;

-- ----- a prior "January pulse" (lower scores) so April shows a trend -----
insert into public.pulse (id, team_id, name, status, opened_at, closed_at, created_by)
values ('44444444-4444-4444-4444-444444444402','33333333-3333-3333-3333-333333333301',
        'January pulse','closed', now() - interval '150 days', now() - interval '145 days',
        '11111111-1111-1111-1111-111111111101')
on conflict (id) do nothing;

insert into public.pulse_response (pulse_id, respondent_id, dynamic, score)
select '44444444-4444-4444-4444-444444444402', u.uid, d.dyn, d.scores[u.idx]
from (values
  ('11111111-1111-1111-1111-111111111101'::uuid, 1),
  ('11111111-1111-1111-1111-111111111102'::uuid, 2),
  ('11111111-1111-1111-1111-111111111103'::uuid, 3),
  ('11111111-1111-1111-1111-111111111104'::uuid, 4),
  ('11111111-1111-1111-1111-111111111105'::uuid, 5),
  ('11111111-1111-1111-1111-111111111106'::uuid, 6)
) as u(uid, idx)
cross join (values
  ('psych_safety'::public.team_dynamic,    array[3,2,3,2,3,2]),
  ('trust'::public.team_dynamic,           array[3,3,3,4,3,3]),
  ('conflict_norms'::public.team_dynamic,  array[3,3,3,3,3,3]),
  ('role_clarity'::public.team_dynamic,    array[4,3,4,3,4,4]),
  ('decision_rights'::public.team_dynamic, array[2,2,3,2,3,2])
) as d(dyn, scores)
on conflict (pulse_id, respondent_id, dynamic) do nothing;

-- ----- a demo workshop built from the Five Behaviours template -----------
insert into public.workshop (id, team_id, title, template_id, pulse_id, status, created_by)
select '55555555-5555-5555-5555-555555555501','33333333-3333-3333-3333-333333333301',
       'Trust & Decision-Making', t.id, '44444444-4444-4444-4444-444444444401', 'draft',
       '11111111-1111-1111-1111-111111111101'
from public.template t where t.key = 'five-beh' and t.workspace_id is null
on conflict (id) do nothing;

insert into public.block (workshop_id, ord, title, activity_type, duration, prompt, linked_dynamic)
select '55555555-5555-5555-5555-555555555501', ph.ord,
       ph.elem ->> 'title', coalesce((ph.elem ->> 'type')::public.activity_type,'canvas'),
       coalesce((ph.elem ->> 'minutes')::int,10), ph.elem ->> 'prompt',
       (ph.elem ->> 'dynamic')::public.team_dynamic
from public.template t, jsonb_array_elements(t.definition -> 'phases') with ordinality as ph(elem, ord)
where t.key = 'five-beh' and t.workspace_id is null
  and not exists (select 1 from public.block b where b.workshop_id = '55555555-5555-5555-5555-555555555501');
