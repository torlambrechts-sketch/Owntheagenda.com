"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Set or clear a manual status overlay on one axis of a team. Null status clears.
export async function setHealthStatus(
  teamId: string,
  axis: string,
  status: string | null,
  note: string | null,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_health_status", {
    p_team: teamId,
    p_axis: axis,
    p_status: status,
    p_note: note,
  });
  if (error) return { error: error.message };
  revalidatePath("/health");
  return {};
}

// Full per-axis history + manual-status log for one team, fetched on demand when
// a Health row is expanded.
export async function healthDetail(teamId: string): Promise<{ data?: unknown; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("team_health_detail", { p_team: teamId });
  if (error) return { error: error.message };
  return { data };
}

// Tag a team as a leadership group (or back to an ordinary team).
export async function setTeamKind(teamId: string, kind: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_team_kind", { p_team: teamId, p_kind: kind });
  if (error) return { error: error.message };
  revalidatePath("/health");
  return {};
}
