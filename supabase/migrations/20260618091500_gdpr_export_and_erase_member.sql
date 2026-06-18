-- GDPR: a member's identifiable data within a workspace (right to access).
-- Admin of the workspace, or the member themselves.
create or replace function public.export_member_data(p_user uuid, p_workspace uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_doc jsonb;
begin
  if not private.is_workspace_admin(p_workspace) and p_user <> (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.is_workspace_member(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'exported_at', now(),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name) from public.workspace w where w.id = p_workspace),
    'profile', (select jsonb_build_object('id', pr.id, 'email', pr.email, 'full_name', pr.full_name, 'display_name', pr.display_name)
                from public.profile pr where pr.id = p_user),
    'membership', (select jsonb_build_object('role', m.role, 'status', m.status, 'joined_at', m.created_at)
                   from public.membership m where m.user_id = p_user and m.workspace_id = p_workspace),
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('team', t.name, 'role_title', tm.role_title, 'is_lead', tm.is_lead)), '[]'::jsonb)
              from public.team_member tm join public.team t on t.id = tm.team_id
              where tm.user_id = p_user and t.workspace_id = p_workspace),
    'user_manual', (select to_jsonb(um) - 'user_id' - 'workspace_id' from public.user_manual um
                    where um.user_id = p_user and um.workspace_id = p_workspace),
    'ideas', (select coalesce(jsonb_agg(i.text), '[]'::jsonb) from public.idea i
              where i.author_id = p_user and i.workspace_id = p_workspace),
    'actions_owned', (select coalesce(jsonb_agg(a.text), '[]'::jsonb) from public.action_item a
                      where a.owner_id = p_user and a.workspace_id = p_workspace),
    'counts', jsonb_build_object(
      'agreement_votes', (select count(*) from public.agreement where user_id = p_user and session_id in (select id from public.session where workspace_id = p_workspace)),
      'survey_responses', (select count(*) from public.survey_response where respondent_id = p_user and survey_id in (select id from public.survey where workspace_id = p_workspace)),
      'pulse_responses', (select count(*) from public.pulse_response where respondent_id = p_user and pulse_id in (select id from public.pulse where workspace_id = p_workspace)),
      'individual_responses', (select count(*) from public.individual_response where user_id = p_user and workspace_id = p_workspace),
      'sessions_participated', (select count(*) from public.participant where user_id = p_user and session_id in (select id from public.session where workspace_id = p_workspace))
    )
  ) into v_doc;
  return v_doc;
end;
$$;
revoke execute on function public.export_member_data(uuid, uuid) from public, anon;
grant execute on function public.export_member_data(uuid, uuid) to authenticated;

-- GDPR: right to erasure, scoped to a workspace. Deletes the person's personal
-- data, anonymizes their authored content, removes their access, and scrubs the
-- global profile when they no longer belong to any workspace. Admin only; an
-- owner must hand over ownership first. (The auth.users login row is not deleted
-- here -- that is an account-level action.)
create or replace function public.erase_member(p_user uuid, p_workspace uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scrub boolean := false;
begin
  if not private.is_workspace_admin(p_workspace) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.membership where workspace_id = p_workspace and user_id = p_user and role = 'owner') then
    raise exception 'transfer ownership before erasing an owner' using errcode = '42501';
  end if;

  delete from public.agreement where user_id = p_user
    and session_id in (select id from public.session where workspace_id = p_workspace);
  delete from public.survey_response where respondent_id = p_user
    and survey_id in (select id from public.survey where workspace_id = p_workspace);
  delete from public.pulse_response where respondent_id = p_user
    and pulse_id in (select id from public.pulse where workspace_id = p_workspace);
  delete from public.individual_response where user_id = p_user and workspace_id = p_workspace;
  delete from public.idea_vote where voter_id = p_user
    and session_id in (select id from public.session where workspace_id = p_workspace);
  delete from public.decision_contributor where user_id = p_user
    and decision_id in (select id from public.decision where workspace_id = p_workspace);
  delete from public.participant where user_id = p_user
    and session_id in (select id from public.session where workspace_id = p_workspace);
  delete from public.user_manual where user_id = p_user and workspace_id = p_workspace;
  delete from public.notification where user_id = p_user and workspace_id = p_workspace;

  update public.idea set author_id = null, author_name = 'Removed user'
    where author_id = p_user and workspace_id = p_workspace;
  update public.action_item set owner_id = null, owner_name = 'Removed user'
    where owner_id = p_user and workspace_id = p_workspace;
  update public.canvas_object set author_id = null, author_name = 'Removed user'
    where author_id = p_user and workspace_id = p_workspace;

  delete from public.team_member where user_id = p_user
    and team_id in (select id from public.team where workspace_id = p_workspace);
  delete from public.membership where user_id = p_user and workspace_id = p_workspace;

  if not exists (select 1 from public.membership where user_id = p_user and status = 'active') then
    update public.profile set full_name = 'Removed user', display_name = null, email = null, avatar_url = null
      where id = p_user;
    v_scrub := true;
  end if;

  perform private.write_audit(p_workspace, (select auth.uid()), 'member.erased', 'profile', p_user,
    jsonb_build_object('profile_scrubbed', v_scrub));
  return jsonb_build_object('erased', true, 'profile_scrubbed', v_scrub);
end;
$$;
revoke execute on function public.erase_member(uuid, uuid) from public, anon;
grant execute on function public.erase_member(uuid, uuid) to authenticated;
