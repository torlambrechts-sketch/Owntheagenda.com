import { redirect } from "next/navigation";

// Trends folded into the unified Insights dashboard (Overview "Average score
// trend" + By-team breakdown). Kept as a redirect so old links/bookmarks land
// somewhere sensible.
export default function TrendsRedirect() {
  redirect("/insight");
}
