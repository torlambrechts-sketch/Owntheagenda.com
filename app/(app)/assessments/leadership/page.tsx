import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { LeadershipTest, type Category } from "./LeadershipTest";

export default async function LeadershipTestPage() {
  await requireSession();
  const supabase = createClient();
  const { data } = await supabase.rpc("leadership_inventory");
  const inventory = ((data as unknown as Category[]) ?? []);

  return (
    <div>
      <Link className="hc-back" href="/assessments">← Assessments</Link>
      <h1 className="page-title">Leadership effectiveness test</h1>
      <p className="page-sub">
        A 63-item inventory across 21 facets, grounded in the Bang/Midelfart framework for
        leadership teams. Rate each statement from 1 (strongly disagree) to 7 (strongly agree).
      </p>
      <LeadershipTest inventory={inventory} />
    </div>
  );
}
