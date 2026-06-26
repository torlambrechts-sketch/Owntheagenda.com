import { redirect } from "next/navigation";

// Health → the Insights dashboard (the former Leadership Teams page was
// removed). Keep the old route working.
export default function HealthRedirect() {
  redirect("/insight");
}
