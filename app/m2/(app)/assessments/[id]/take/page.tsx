import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { TakeFlow } from "./TakeFlow";

export default async function M2Take({ params }: { params: { id: string } }) {
  await requireSession();
  const supabase = createClient();

  const [{ data: pulse }, { data: bands }] = await Promise.all([
    supabase.from("pulse").select("id, name, status, team_id").eq("id", params.id).maybeSingle(),
    supabase.from("dynamic_band").select("dynamic, label, question, ord").order("ord", { ascending: true }),
  ]);

  if (!pulse) {
    return (
      <Wrap>
        <div className="m2-empty">
          <ClipboardCheck />
          <b>Assessment not found</b>
          <p>This assessment may have been removed.</p>
          <Link className="m2-btn" href="/m2/assessments">Back to assessments</Link>
        </div>
      </Wrap>
    );
  }
  if (pulse.status !== "open") {
    return (
      <Wrap>
        <div className="m2-empty">
          <ClipboardCheck />
          <b>This assessment isn&rsquo;t open</b>
          <p>It&rsquo;s currently {pulse.status}. You can respond once a facilitator opens it.</p>
          <Link className="m2-btn" href="/m2/assessments">Back to assessments</Link>
        </div>
      </Wrap>
    );
  }

  const questions = (bands ?? []).map((b) => ({
    dynamic: String(b.dynamic),
    label: b.label,
    question: b.question,
  }));

  return <TakeFlow pulseId={pulse.id} pulseName={pulse.name} questions={questions} />;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 640, margin: "0 auto" }}>{children}</div>;
}
