"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function scheduleFollowUp(input: {
  sessionId: string;
  kind: string;
  title: string;
  when: string;
  owner?: string | null;
  template?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("schedule_follow_up", {
    p_session: input.sessionId,
    p_kind: input.kind,
    p_title: input.title,
    p_when: input.when,
    ...(input.owner ? { p_owner: input.owner } : {}),
    ...(input.template ? { p_template: input.template } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${input.sessionId}`);
  return { id: data as string };
}

export async function skipFollowUp(sessionId: string, id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("skip_follow_up", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return {};
}

export async function completeFollowUp(sessionId: string, id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("complete_follow_up", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return {};
}

export async function rescheduleFollowUp(
  sessionId: string,
  id: string,
  when: string,
  title?: string | null,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reschedule_follow_up", {
    p_id: id,
    p_when: when,
    ...(title != null ? { p_title: title } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return {};
}
