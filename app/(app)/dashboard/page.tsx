import { redirect } from "next/navigation";

// Dashboard + Insights are merged into one surface (the "Dashboard" tab lives at
// /insight as the default tab). Keep /dashboard working for old links/redirects.
export default function DashboardPage() {
  redirect("/insight");
}
