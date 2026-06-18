import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { RoadmapClient, type RoadmapItem } from "./RoadmapClient";

export default async function RoadmapPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: items } = await supabase
    .from("roadmap_item")
    .select("id, title, description, status, category, vote_count, created_by")
    .order("vote_count", { ascending: false })
    .order("sort", { ascending: true });

  const { data: votes } = await supabase.from("roadmap_vote").select("roadmap_item_id");
  const votedIds = (votes ?? []).map((v) => v.roadmap_item_id);

  return (
    <div>
      <Link className="hc-back" href="/help">← Help &amp; Science</Link>
      <h1 className="page-title">Roadmap</h1>
      <p className="page-sub">What we&apos;re building. Upvote what matters to you, or suggest something new.</p>
      <RoadmapClient
        items={(items ?? []) as RoadmapItem[]}
        votedIds={votedIds}
        isStaff={!!ctx.profile?.is_staff}
      />
    </div>
  );
}
