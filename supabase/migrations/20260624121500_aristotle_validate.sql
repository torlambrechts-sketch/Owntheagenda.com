-- =====================================================================
-- OwnTheAgenda · Aristotle psychometric-contract assertions
-- ---------------------------------------------------------------------
-- Fails the migration loudly if the seeded Project Aristotle instrument
-- violates its psychometric contract. This makes the validation rules
-- executable, not just documented: balance, reverse-key count, construct
-- isolation (one pillar + one declared sub-area per item) and key
-- uniqueness are all checked against the live `definition` row.
-- =====================================================================

do $$
declare
  v_def jsonb;
  v_dims int;
  v_bad  text;
begin
  select definition into v_def
  from public.assessment_template
  where key = 'aristotle_team' and workspace_id is null;

  if v_def is null then
    raise exception 'aristotle_team instrument not found — seed migration missing';
  end if;

  -- exactly 5 pillars
  select jsonb_array_length(v_def->'dimensions') into v_dims;
  if v_dims <> 5 then
    raise exception 'aristotle_team must have 5 pillars, found %', v_dims;
  end if;

  -- every item maps to a declared dimension
  select string_agg(it->>'key', ', ') into v_bad
  from jsonb_array_elements(v_def->'items') it
  where not exists (
    select 1 from jsonb_array_elements(v_def->'dimensions') d where d->>'key' = it->>'dimension'
  );
  if v_bad is not null then
    raise exception 'items map to unknown pillars: %', v_bad;
  end if;

  -- construct isolation: every item's sub-area is declared on its pillar
  select string_agg(it->>'key', ', ') into v_bad
  from jsonb_array_elements(v_def->'items') it
  where not exists (
    select 1
    from jsonb_array_elements(v_def->'dimensions') d,
         jsonb_array_elements_text(d->'subareas') sa
    where d->>'key' = it->>'dimension' and sa = it->>'subarea'
  );
  if v_bad is not null then
    raise exception 'items with missing/undeclared sub-area (construct isolation): %', v_bad;
  end if;

  -- balance: exactly 6 items per pillar
  select string_agg(dim || '=' || c, ', ') into v_bad
  from (
    select it->>'dimension' as dim, count(*) c
    from jsonb_array_elements(v_def->'items') it
    group by it->>'dimension'
    having count(*) <> 6
  ) z;
  if v_bad is not null then
    raise exception 'every pillar must have 6 items; offenders: %', v_bad;
  end if;

  -- acquiescence control: 1–2 reverse-keyed items per pillar
  select string_agg(dim || '=' || c, ', ') into v_bad
  from (
    select it->>'dimension' as dim, count(*) c
    from jsonb_array_elements(v_def->'items') it
    where coalesce((it->>'reverse')::boolean, false)
    group by it->>'dimension'
  ) z
  where c not between 1 and 2;
  if v_bad is not null then
    raise exception 'every pillar needs 1-2 reverse-keyed items; offenders: %', v_bad;
  end if;

  -- a pillar with zero reverse items also fails the 1–2 rule
  select string_agg(d->>'key', ', ') into v_bad
  from jsonb_array_elements(v_def->'dimensions') d
  where not exists (
    select 1 from jsonb_array_elements(v_def->'items') it
    where it->>'dimension' = d->>'key' and coalesce((it->>'reverse')::boolean, false)
  );
  if v_bad is not null then
    raise exception 'pillars with no reverse-keyed item: %', v_bad;
  end if;

  -- item keys are unique
  select string_agg(k, ', ') into v_bad
  from (
    select it->>'key' k, count(*) c
    from jsonb_array_elements(v_def->'items') it
    group by it->>'key' having count(*) > 1
  ) z;
  if v_bad is not null then
    raise exception 'duplicate item keys: %', v_bad;
  end if;

  raise notice 'aristotle_team psychometric contract OK: 5 pillars x 6 items, reverse keys balanced, construct isolation verified';
end $$;
