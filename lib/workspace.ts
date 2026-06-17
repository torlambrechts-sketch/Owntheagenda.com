import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables, Enums } from "@/types/database.types";

export type WorkspaceSummary = Tables<"workspace">;
export type MembershipWithWorkspace = Tables<"membership"> & {
  workspace: WorkspaceSummary;
};

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: Tables<"profile"> | null;
  workspace: WorkspaceSummary;
  role: Enums<"workspace_role">;
  memberships: MembershipWithWorkspace[];
};

// Loads the signed-in user's active workspace context, or redirects:
//   no session     -> /login
//   no workspace   -> /onboarding
export async function requireSession(): Promise<SessionContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("membership")
    .select("*, workspace:workspace(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const list = (memberships ?? []) as MembershipWithWorkspace[];
  if (list.length === 0) redirect("/onboarding");

  const active = list[0];
  const { data: profile } = await supabase
    .from("profile")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    workspace: active.workspace,
    role: active.role,
    memberships: list,
  };
}
