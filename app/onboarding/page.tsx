import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already in a workspace? Skip onboarding.
  const { data: memberships } = await supabase
    .from("membership")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (memberships && memberships.length > 0) redirect("/dashboard");

  return <OnboardingForm />;
}
