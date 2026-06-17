import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/util";
import { BuilderClient, type BlockRow } from "./BuilderClient";

export default async function BuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: workshop } = await supabase
    .from("workshop")
    .select("id, title, status, team_id, workspace_id, scheduled_at, objective")
    .eq("id", params.id)
    .maybeSingle();
  if (!workshop || workshop.workspace_id !== ctx.workspace.id) notFound();

  const { data: team } = await supabase
    .from("team")
    .select("name, lead_user_id")
    .eq("id", workshop.team_id)
    .maybeSingle();

  const { data: blocks } = await supabase
    .from("block")
    .select("id, ord, title, activity_type, duration, prompt, linked_dynamic, config")
    .eq("workshop_id", workshop.id)
    .order("ord", { ascending: true });

  const rows: BlockRow[] = (blocks ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    activityType: b.activity_type,
    duration: b.duration,
    prompt: b.prompt,
    linkedDynamic: b.linked_dynamic,
    config: (b.config ?? {}) as BlockRow["config"],
  }));

  const canManage =
    isAdmin(ctx.role) || (team ? team.lead_user_id === ctx.userId : false);

  return (
    <div>
      <Link href="/workshops" className="linkbtn" style={{ fontSize: 12 }}>
        ‹ Workshops
      </Link>
      <BuilderClient
        workshop={{ id: workshop.id, title: workshop.title, scheduledAt: workshop.scheduled_at, objective: workshop.objective }}
        teamName={team?.name ?? ""}
        canManage={canManage}
        blocks={rows}
      />
    </div>
  );
}
