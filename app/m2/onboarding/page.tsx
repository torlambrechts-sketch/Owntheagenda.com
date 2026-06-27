import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";

// MAIN2 onboarding — a standalone, chrome-less 3-step flow that sets up a
// team's first measurement cycle.
export default async function M2Onboarding() {
  await requireSession();
  const supabase = createClient();

  const [{ data: frameworks }, { data: level1 }] = await Promise.all([
    supabase
      .from("onboarding_framework")
      .select("key, name, description, icon, tint, question_count, est_minutes, recommended")
      .order("sort", { ascending: true }),
    supabase
      .from("journey_level")
      .select("level, name, icon, blurb")
      .eq("level", 1)
      .maybeSingle(),
  ]);

  return (
    <OnboardingWizard
      frameworks={frameworks ?? []}
      seedling={
        level1 ?? { level: 1, name: "Seedling", icon: "sprout", blurb: null }
      }
    />
  );
}
