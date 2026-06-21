import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, initials } from "@/lib/util";
import { resolveInstruments } from "@/lib/assessments";
import { OrgShell } from "@/components/OrgShell";

// Member assessment profile — the imported design's "Participant" screen,
// adapted. Activity only (which assessments a person has taken / been assigned,
// and the workshops they've run or attended) — never private scores. Visible to
// workspace admins or the member themselves.

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function MemberProfilePage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const admin = isAdmin(ctx.role);
  const self = ctx.userId === params.id;
  if (!admin && !self) redirect("/members");

  const supabase = createClient();
  const wsId = ctx.workspace.id;

  const { data: membership } = await supabase
    .from("membership")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", params.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) notFound();

  const { data: profile } = await supabase
    .from("profile")
    .select("full_name, display_name, email")
    .eq("id", params.id)
    .maybeSingle();
  const name = profile?.full_name || profile?.display_name || profile?.email || "Member";
  const role = membership.role as string;

  const instruments = await resolveInstruments();
  const nameOfKey = (k: string) => instruments[k]?.name ?? k;

  // Assessments this person has completed (personal instruments — attributed to
  // them by definition). Names + dates only, no scores.
  const { data: taken } = await supabase
    .from("individual_response")
    .select("template_key, updated_at")
    .eq("workspace_id", wsId)
    .eq("user_id", params.id)
    .order("updated_at", { ascending: false });
  const takenRows = (taken ?? []).map((t) => ({ key: t.template_key as string, name: nameOfKey(t.template_key as string), at: t.updated_at as string }));

  // Assessments assigned to them (still outstanding shown first).
  const { data: assigned } = await supabase
    .from("assessment_assignment")
    .select("template_key, note, due_at")
    .eq("workspace_id", wsId)
    .eq("assignee_user_id", params.id);
  const takenKeys = new Set(takenRows.map((t) => t.key));
  const assignedRows = (assigned ?? []).map((a) => ({
    key: a.template_key as string,
    name: nameOfKey(a.template_key as string),
    due: a.due_at as string | null,
    done: takenKeys.has(a.template_key as string),
  }));

  // Workshops this person has run or attended.
  const { data: parts } = await supabase
    .from("participant")
    .select("session_id, is_facilitator")
    .eq("user_id", params.id);
  const sessionIds = (parts ?? []).map((p) => p.session_id as string);
  const facilitatorBySession = new Map((parts ?? []).map((p) => [p.session_id as string, p.is_facilitator as boolean]));
  const { data: sessions } = sessionIds.length
    ? await supabase.from("session").select("id, workshop_id, started_at").in("id", sessionIds)
    : { data: [] as { id: string; workshop_id: string; started_at: string | null }[] };
  const workshopIds = Array.from(new Set((sessions ?? []).map((s) => s.workshop_id)));
  const { data: workshops } = workshopIds.length
    ? await supabase.from("workshop").select("id, title, scheduled_at").eq("workspace_id", wsId).in("id", workshopIds)
    : { data: [] as { id: string; title: string; scheduled_at: string | null }[] };
  const wsById = new Map((workshops ?? []).map((w) => [w.id, w]));
  const workshopRows = (sessions ?? [])
    .map((s) => {
      const w = wsById.get(s.workshop_id);
      if (!w) return null;
      return {
        id: w.id,
        title: w.title as string,
        at: (s.started_at as string | null) ?? (w.scheduled_at as string | null),
        led: facilitatorBySession.get(s.id) ?? false,
      };
    })
    .filter((x): x is { id: string; title: string; at: string | null; led: boolean } => !!x)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const ledCount = workshopRows.filter((w) => w.led).length;

  const kpis = [
    { big: String(takenRows.length), title: "Assessments taken", sub: "personal instruments" },
    { big: String(assignedRows.filter((a) => !a.done).length), title: "Assigned · open", sub: `${assignedRows.length} total` },
    { big: String(ledCount), title: "Workshops led", sub: "as facilitator" },
    { big: String(workshopRows.length - ledCount), title: "Workshops attended", sub: "as participant" },
  ];

  return (
    <OrgShell active="members" isAdmin={admin} subtitle={undefined}>
      <Link href="/members" className="linkbtn" style={{ fontSize: 12 }}>‹ Members</Link>

      <div className="a-phead" style={{ marginTop: 8 }}>
        <span className="av lg green" aria-hidden>{initials(name)}</span>
        <div>
          <div className="a-pt">{name}{self ? " (you)" : ""}</div>
          <div className="a-ps">
            <span className={`pill sm role-${role}`}>{role}</span>
            {profile?.email ? <span style={{ marginLeft: 10, color: "var(--muted)" }}>{profile.email}</span> : null}
          </div>
        </div>
      </div>

      <div className="as-kpis">
        {kpis.map((k, i) => (
          <div className="as-kpi" key={i}>
            <div className="as-kpi-big">{k.big}</div>
            <div className="as-kpi-title">{k.title}</div>
            <div className="as-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="a-ov">
        <div className="a-ovcard">
          <h3>Assessment activity</h3>
          {takenRows.length || assignedRows.length ? (
            <table className="tbl">
              <thead>
                <tr><th>Assessment</th><th style={{ width: 140 }}>When</th><th style={{ width: 110 }}>Status</th></tr>
              </thead>
              <tbody>
                {takenRows.map((t) => (
                  <tr key={`t-${t.key}-${t.at}`}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ color: "var(--muted)" }}>{fmtDate(t.at) ?? "—"}</td>
                    <td><span className="pill sm open">Completed</span></td>
                  </tr>
                ))}
                {assignedRows.filter((a) => !a.done).map((a) => (
                  <tr key={`a-${a.key}`}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td style={{ color: "var(--muted)" }}>{a.due ? `Due ${fmtDate(a.due)}` : "—"}</td>
                    <td><span className="pill sm draft">Assigned</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No assessment activity yet.</p>
          )}
        </div>

        <div className="a-ovcard">
          <h3>Workshops</h3>
          {workshopRows.length ? (
            <div className="wsd-att">
              {workshopRows.map((w) => (
                <Link key={`${w.id}-${w.at}`} href={`/workshops/${w.id}/overview`} className="wsd-att-row" style={{ textDecoration: "none" }}>
                  <span className="av sm green" aria-hidden>{initials(w.title)}</span>
                  <span className="wsd-att-nm">{w.title}<small style={{ display: "block", color: "var(--faint)", fontWeight: 400 }}>{fmtDate(w.at) ?? "—"}</small></span>
                  <span className={`pill sm ${w.led ? "internal" : "draft"}`}>{w.led ? "Facilitator" : "Attended"}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted">No workshops yet.</p>
          )}
        </div>
      </div>
    </OrgShell>
  );
}
