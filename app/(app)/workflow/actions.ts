"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Create a program (the standard six-stage operating loop) for the workspace.
export async function createProgram(workspaceId: string, title: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_program", {
    p_workspace: workspaceId,
    p_title: title,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return { id: data as string };
}

// Advance / update a single step. The RPC handles activating the next step
// and completing the program when the last step is done.
export async function setProgramStep(stepId: string, status: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_program_step", {
    p_step: stepId,
    p_status: status,
  });
  if (error) return { error: error.message };
  revalidatePath("/workflow");
  return {};
}
