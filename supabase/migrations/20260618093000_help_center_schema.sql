-- Help & Science is GLOBAL product content (same for every workspace), so writes
-- are gated to platform staff, not per-workspace admins. Everyone reads published.
alter table public.profile add column if not exists is_staff boolean not null default false;

create or replace function private.is_staff()
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.profile where id = (select auth.uid()) and is_staff);
$$;

create table if not exists public.help_article (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('guide','science')),
  slug text not null unique,
  title text not null,
  summary text,
  body text not null default '',
  category text not null default 'general',
  topic_key text,
  icon text,
  sort int not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists help_article_kind_idx on public.help_article(kind, status);
create index if not exists help_article_topic_idx on public.help_article(topic_key);

alter table public.help_article enable row level security;
drop policy if exists help_article_read on public.help_article;
create policy help_article_read on public.help_article for select to authenticated
  using (status = 'published' or private.is_staff());
drop policy if exists help_article_write on public.help_article;
create policy help_article_write on public.help_article for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create table if not exists public.help_faq (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null default '',
  category text not null default 'general',
  sort int not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.help_faq enable row level security;
drop policy if exists help_faq_read on public.help_faq;
create policy help_faq_read on public.help_faq for select to authenticated
  using (status = 'published' or private.is_staff());
drop policy if exists help_faq_write on public.help_faq;
create policy help_faq_write on public.help_faq for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- Seed the product owner as the first platform-staff editor.
update public.profile set is_staff = true where lower(email::text) = lower('tor.lambrechts@gmail.com');
