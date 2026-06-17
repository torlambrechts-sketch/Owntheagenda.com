import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { RunLobby } from "./RunLobby";
import { RunClient, type RunBlock, type Participant, type Action } from "./RunClient";

export default async function RunPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, team_id, workspace_id, pulse_id, survey_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!workshop || workshop.workspace_id !== ctx.workspace.id) notFound();

  const { data: team } = await supabase
    .from("team")
    .select("lead_user_id")
    .eq("id", workshop.team_id)
    .maybeSingle();
  const canManage =
    isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  const { data: blocks } = await supabase
    .from("block")
    .select("ord, title, activity_type, duration, prompt, linked_dynamic, config")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });
  const runBlocks: RunBlock[] = (blocks ?? []).map((b) => ({
    ord: b.ord,
    title: b.title,
    activityType: b.activity_type,
    duration: b.duration,
    prompt: b.prompt,
    linkedDynamic: b.linked_dynamic,
    config: (b.config ?? {}) as RunBlock["config"],
  }));

  const { data: session } = await supabase
    .from("session")
    .select("*")
    .eq("workshop_id", workshop.id)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return (
      <RunLobby
        workshopId={workshop.id}
        title={workshop.title}
        canManage={canManage}
      />
    );
  }

  const { data: parts } = await supabase
    .from("participant")
    .select("user_id, is_facilitator, ready")
    .eq("session_id", session.id);
  const pids = (parts ?? []).map((p) => p.user_id);
  const { data: profs } = pids.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", pids)
    : { data: [] as any[] };
  const nameById = new Map(
    (profs ?? []).map((p) => [p.id, p.full_name || p.display_name || p.email || "Member"]),
  );
  const participants: Participant[] = (parts ?? []).map((p) => ({
    userId: p.user_id,
    name: nameById.get(p.user_id) || "Member",
    isFacilitator: p.is_facilitator,
    ready: p.ready,
  }));

  const { data: actions } = await supabase
    .from("action_item")
    .select("id, text, owner_name, status")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });
  const initialActions: Action[] = (actions ?? []).map((a) => ({
    id: a.id,
    text: a.text,
    owner: a.owner_name,
    done: a.status === "done",
  }));

  const userName =
    ctx.profile?.full_name || ctx.profile?.display_name || ctx.email || "You";

  return (
    <RunClient
      workshopId={workshop.id}
      workspaceId={workshop.workspace_id}
      teamId={workshop.team_id}
      initialPulseId={workshop.pulse_id}
      initialSurveyId={workshop.survey_id}
      title={workshop.title}
      blocks={runBlocks}
      session={{
        id: session.id,
        currentBlockOrd: session.current_block_ord,
        timerRunning: session.timer_running,
        timerEndsAt: session.timer_ends_at,
        timerRemaining: session.timer_remaining,
      }}
      isFacilitator={session.facilitator_id === ctx.userId}
      userId={ctx.userId}
      userName={userName}
      initialParticipants={participants}
      initialActions={initialActions}
    />
  );
}
