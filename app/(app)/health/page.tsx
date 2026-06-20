import { redirect } from "next/navigation";

// Health was renamed to Insight · Leadership Teams. Keep the old route working.
export default function HealthRedirect() {
  redirect("/insight/leadership-teams");
}
