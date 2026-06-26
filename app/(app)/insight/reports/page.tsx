import { redirect } from "next/navigation";

// Reports folded into the unified Insights dashboard (the Reports tab —
// scheduled email delivery + exports). Kept as a redirect so old links land
// somewhere sensible.
export default function ReportsRedirect() {
  redirect("/insight");
}
