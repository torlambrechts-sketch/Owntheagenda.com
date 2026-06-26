-- Close the "Function Search Path Mutable" advisor on private.report_next_run.
-- It's a pure date-math helper (no object resolution), but pin search_path
-- anyway for hygiene + to clear the advisor.
create or replace function private.report_next_run(p_freq text, p_from timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case p_freq
    when 'weekly' then p_from + interval '7 days'
    when 'monthly' then p_from + interval '1 month'
    else null
  end;
$$;
