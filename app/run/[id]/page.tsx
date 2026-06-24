import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { resolveInstruments } from "@/lib/assessments";
import { RunLobby } from "./RunLobby";
import { PreworkLobby, type PreworkBlock } from "./PreworkLobby";
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
    .select("id, title, team_id, workspace_id, pulse_id")
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
    .select("id, ord, title, activity_type, duration, prompt, linked_dynamic, config, survey_id")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });
  const runBlocks: RunBlock[] = (blocks ?? []).map((b) => ({
    id: b.id,
    ord: b.ord,
    title: b.title,
    activityType: b.activity_type,
    duration: b.duration,
    prompt: b.prompt,
    linkedDynamic: b.linked_dynamic,
    config: (b.config ?? {}) as RunBlock["config"],
    surveyId: b.survey_id,
  }));

  const { data: session } = await supabase
    .from("session")
    .select("*")
    .eq("workshop_id", workshop.id)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Whole-workshop early input collects every input-capable step; the
  // flagged mode collects just the brainstorm steps marked pre-work.
  const INPUT_TYPES = ["brainstorm", "feedback", "checkin"];
  const preworkBlocks: PreworkBlock[] = (session?.prework_all
    ? runBlocks.filter((b) => INPUT_TYPES.includes(b.activityType))
    : runBlocks.filter((b) => b.activityType === "brainstorm" && (b.config as { prework?: boolean })?.prework)
  ).map((b) => ({ ord: b.ord, title: b.title, prompt: b.prompt, activityType: b.activityType, config: b.config as PreworkBlock["config"] }));

  const userName =
    ctx.profile?.full_name || ctx.profile?.display_name || ctx.email || "You";

  if (!session) {
    return (
      <RunLobby
        workshopId={workshop.id}
        title={workshop.title}
        canManage={canManage}
      />
    );
  }

  if (session.is_prep) {
    return (
      <PreworkLobby
        workshopId={workshop.id}
        sessionId={session.id}
        title={workshop.title}
        blocks={preworkBlocks}
        userId={ctx.userId}
        userName={userName}
        isFacilitator={session.facilitator_id === ctx.userId}
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
    .select("id, text, owner_name, due_at, status")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });
  const initialActions: Action[] = (actions ?? []).map((a) => ({
    id: a.id,
    text: a.text,
    owner: a.owner_name,
    due: a.due_at,
    done: a.status === "done",
  }));

  // Resolve the instrument catalog from the template library (data-driven).
  const instruments = await resolveInstruments();

  return (
    <RunClient
      workshopId={workshop.id}
      workspaceId={workshop.workspace_id}
      teamId={workshop.team_id}
      initialPulseId={workshop.pulse_id}
      title={workshop.title}
      blocks={runBlocks}
      instruments={instruments}
      session={{
        id: session.id,
        currentBlockOrd: session.current_block_ord,
        timerRunning: session.timer_running,
        timerEndsAt: session.timer_ends_at,
        timerRemaining: session.timer_remaining,
        isDryRun: session.is_dry_run,
      }}
      isFacilitator={session.facilitator_id === ctx.userId}
      userId={ctx.userId}
      userName={userName}
      initialParticipants={participants}
      initialActions={initialActions}
    />
  );
}
