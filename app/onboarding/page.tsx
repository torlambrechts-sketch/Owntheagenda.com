import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already an *active* member? Skip onboarding. (Pending members must wait.)
  const { data: active } = await supabase
    .from("membership")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  if (active && active.length > 0) redirect("/dashboard");

  // Awaiting approval on a join request?
  const { data: pend } = await supabase.rpc("my_pending_membership");
  const pending = (pend as unknown as { name?: string; role?: string } | null) ?? null;

  const meta = (user.user_metadata ?? {}) as { join_code?: string; requested_role?: string };

  return (
    <OnboardingForm
      pending={pending && pending.name ? { name: pending.name, role: pending.role ?? "member" } : null}
      initialJoinCode={meta.join_code ?? ""}
      initialRole={meta.requested_role ?? "member"}
    />
  );
}
