create table if not exists public.roadmap_item (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'requested' check (status in ('requested','planned','in_progress','shipped','declined')),
  category text,
  sort int not null default 0,
  vote_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists roadmap_item_status_idx on public.roadmap_item(status);

create table if not exists public.roadmap_vote (
  roadmap_item_id uuid not null references public.roadmap_item(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (roadmap_item_id, user_id)
);

-- Keep the denormalized counter in sync. SECURITY DEFINER so a member's vote can
-- bump the counter even though roadmap_item updates are otherwise staff-only.
create or replace function private.roadmap_vote_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.roadmap_item set vote_count = vote_count + 1 where id = new.roadmap_item_id;
  elsif tg_op = 'DELETE' then
    update public.roadmap_item set vote_count = greatest(0, vote_count - 1) where id = old.roadmap_item_id;
  end if;
  return null;
end;
$$;
drop trigger if exists roadmap_vote_count_t on public.roadmap_vote;
create trigger roadmap_vote_count_t after insert or delete on public.roadmap_vote
  for each row execute function private.roadmap_vote_count();

alter table public.roadmap_item enable row level security;
alter table public.roadmap_vote enable row level security;

-- Curated items are public; a requester sees their own pending request; staff see all.
drop policy if exists roadmap_item_read on public.roadmap_item;
create policy roadmap_item_read on public.roadmap_item for select to authenticated using (
  status in ('planned','in_progress','shipped') or private.is_staff() or created_by = (select auth.uid())
);
-- Anyone may submit a request, but only as 'requested' and as themselves.
drop policy if exists roadmap_item_insert on public.roadmap_item;
create policy roadmap_item_insert on public.roadmap_item for insert to authenticated with check (
  created_by = (select auth.uid()) and status = 'requested'
);
drop policy if exists roadmap_item_modify on public.roadmap_item;
create policy roadmap_item_modify on public.roadmap_item for update to authenticated
  using (private.is_staff()) with check (private.is_staff());
drop policy if exists roadmap_item_delete on public.roadmap_item;
create policy roadmap_item_delete on public.roadmap_item for delete to authenticated using (private.is_staff());

drop policy if exists roadmap_vote_read on public.roadmap_vote;
create policy roadmap_vote_read on public.roadmap_vote for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists roadmap_vote_insert on public.roadmap_vote;
create policy roadmap_vote_insert on public.roadmap_vote for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists roadmap_vote_delete on public.roadmap_vote;
create policy roadmap_vote_delete on public.roadmap_vote for delete to authenticated using (user_id = (select auth.uid()));

-- Seed the roadmap (idempotent: only when empty).
insert into public.roadmap_item (title, description, status, category, sort)
select * from (values
  ('Role-based access control','Owner, Company Admin, Team Manager, Facilitator and Employee roles with scoped access.','shipped','access',0),
  ('GDPR data export & erasure','Per-member data export and right-to-erasure for privacy compliance.','shipped','privacy',1),
  ('Integrations framework','Connect your workspace to the tools your teams already use.','shipped','integrations',2),
  ('CSV member import','Bring a whole team in at once from a spreadsheet.','shipped','people',3),
  ('Help & Science center','In-product guides, the science behind the work, FAQ and this roadmap.','shipped','learn',4),
  ('Microsoft Teams integration','Share readouts and nudges in a Teams channel.','in_progress','integrations',0),
  ('Google Calendar integration','Put follow-ups and sessions on the calendar automatically.','in_progress','integrations',1),
  ('Zoom integration','Run live sessions over Zoom.','planned','integrations',0),
  ('Single sign-on (Entra ID)','SSO and directory sync via Microsoft Entra ID.','planned','access',1),
  ('AI session summaries','Automatic, editable readouts and action suggestions after a session.','planned','workshops',2)
) as v(title, description, status, category, sort)
where not exists (select 1 from public.roadmap_item);
