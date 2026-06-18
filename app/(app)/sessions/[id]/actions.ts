"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Save a session's canvas block as a durable, reusable snapshot.
export async function saveCanvas(sessionId: string, blockOrd: number, title: string | null): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("save_canvas_snapshot", {
    p_session: sessionId,
    p_block_ord: blockOrd,
    p_title: title,
  });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return { id: data as string };
}

// Start a fresh session of the snapshot's workshop, pre-seeded with the saved
// canvas, and return the workshop id to navigate the facilitator into the run.
export async function startFromCanvas(snapshotId: string): Promise<{ workshopId?: string; error?: string }> {
  const supabase = createClient();
  const { data: snap, error: e1 } = await supabase
    .from("canvas_snapshot")
    .select("workshop_id, block_ord")
    .eq("id", snapshotId)
    .maybeSingle();
  if (e1 || !snap) return { error: e1?.message ?? "Snapshot not found" };

  const { data: started, error: e2 } = await supabase.rpc("start_session", { p_workshop: snap.workshop_id });
  if (e2) return { error: e2.message };
  const sessionId = (started as { id?: string } | null)?.id;
  if (!sessionId) return { error: "Could not start a session" };

  const { error: e3 } = await supabase.rpc("seed_canvas_from_snapshot", {
    p_snapshot: snapshotId,
    p_session: sessionId,
    p_block_ord: snap.block_ord,
  });
  if (e3) return { error: e3.message };
  return { workshopId: snap.workshop_id };
}
