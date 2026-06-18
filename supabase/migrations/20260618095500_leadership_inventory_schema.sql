-- Leadership effectiveness inventory (Bang/Midelfart), stored relationally:
-- category → facet (sub-category) → question. Global product content: everyone
-- reads, platform staff edits. Reverse-scored items are inverted at scoring time.
create table if not exists public.assessment_category (
  id uuid primary key default gen_random_uuid(),
  instrument text not null default 'leadership_effectiveness',
  code text not null,
  name text not null,
  ord int not null default 0,
  created_at timestamptz not null default now(),
  unique (instrument, code)
);

create table if not exists public.assessment_facet (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.assessment_category(id) on delete cascade,
  code text not null unique,
  name text not null,
  ord int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, code)
);
create index if not exists assessment_facet_cat_idx on public.assessment_facet(category_id);

create table if not exists public.assessment_question (
  id uuid primary key default gen_random_uuid(),
  facet_id uuid not null references public.assessment_facet(id) on delete cascade,
  item_key text not null unique,
  ord int not null default 0,
  text text not null,
  reverse_scored boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists assessment_question_facet_idx on public.assessment_question(facet_id);

alter table public.assessment_category enable row level security;
alter table public.assessment_facet enable row level security;
alter table public.assessment_question enable row level security;

drop policy if exists assessment_category_read on public.assessment_category;
create policy assessment_category_read on public.assessment_category for select to authenticated using (true);
drop policy if exists assessment_category_write on public.assessment_category;
create policy assessment_category_write on public.assessment_category for all to authenticated using (private.is_staff()) with check (private.is_staff());

drop policy if exists assessment_facet_read on public.assessment_facet;
create policy assessment_facet_read on public.assessment_facet for select to authenticated using (true);
drop policy if exists assessment_facet_write on public.assessment_facet;
create policy assessment_facet_write on public.assessment_facet for all to authenticated using (private.is_staff()) with check (private.is_staff());

drop policy if exists assessment_question_read on public.assessment_question;
create policy assessment_question_read on public.assessment_question for select to authenticated using (true);
drop policy if exists assessment_question_write on public.assessment_question;
create policy assessment_question_write on public.assessment_question for all to authenticated using (private.is_staff()) with check (private.is_staff());
