-- Include the new leadership_response in GDPR erasure.
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
  delete from public.leadership_response where user_id = p_user and workspace_id = p_workspace;
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
