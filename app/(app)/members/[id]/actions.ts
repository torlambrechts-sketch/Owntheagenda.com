"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/workspace";

// Member HR detail + competence mutations. The workspace is taken from the
// session (never the client); the underlying RPCs re-check "self or admin", so
// these are safe to call from the member profile. Untyped RPCs are cast (the
// committed database types are intentionally not regenerated).
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function saveMemberDetail(
  userId: string,
  detail: { jobTitle: string; department: string; location: string; phone: string },
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  const supabase = createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { error } = await rpc("set_member_detail", {
    p_workspace: ctx.workspace.id,
    p_user: userId,
    p_job_title: detail.jobTitle,
    p_department: detail.department,
    p_location: detail.location,
    p_phone: detail.phone,
  });
  if (error) return { error: error.message };
  revalidatePath(`/members/${userId}`);
  return {};
}

export async function addCompetence(
  userId: string,
  comp: { name: string; issued: string | null; expires: string | null },
): Promise<{ error?: string }> {
  const ctx = await requireSession();
  const supabase = createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { error } = await rpc("add_member_competence", {
    p_workspace: ctx.workspace.id,
    p_user: userId,
    p_name: comp.name,
    p_issued: comp.issued,
    p_expires: comp.expires,
  });
  if (error) return { error: error.message };
  revalidatePath(`/members/${userId}`);
  return {};
}

export async function removeCompetence(userId: string, competenceId: string): Promise<{ error?: string }> {
  await requireSession();
  const supabase = createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const { error } = await rpc("delete_member_competence", { p_id: competenceId });
  if (error) return { error: error.message };
  revalidatePath(`/members/${userId}`);
  return {};
}
