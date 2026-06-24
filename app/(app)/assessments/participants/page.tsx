import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/util";

// Participants — the people in the workspace who take and own assessments
// (the handoff's "Participants" section). A light directory; each row opens the
// member's assessment profile at /members/[id].
export default async function ParticipantsPage() {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: mem } = await supabase
    .from("membership")
    .select("user_id, role")
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", "active");
  const rows = mem ?? [];
  const ids = rows.map((m) => m.user_id as string);

  const { data: profs } = ids.length
    ? await supabase.from("profile").select("id, full_name, display_name, email").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; display_name: string | null; email: string | null }[] };
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));

  const people = rows
    .map((m) => {
      const p = byId.get(m.user_id as string);
      return {
        id: m.user_id as string,
        name: p?.full_name || p?.display_name || p?.email || "Member",
        email: p?.email ?? null,
        role: m.role as string,
        isSelf: m.user_id === ctx.userId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="a-phead">
        <div>
          <div className="a-pt">Participants</div>
          <div className="a-ps">People in this workspace who take and own assessments. Open a participant to see their assessment activity, assigned workshops and competence.</div>
        </div>
      </div>

      <div className="tbl-card">
        {people.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Participant</th>
                <th style={{ width: 160 }}>Role</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/members/${p.id}`} className="person" style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}>
                      <span className="av sm green">{initials(p.name)}</span>
                      <span>
                        {p.name}{p.isSelf ? " (you)" : ""}
                        {p.email ? <small style={{ display: "block", color: "var(--faint)", fontWeight: 400 }}>{p.email}</small> : null}
                      </span>
                    </Link>
                  </td>
                  <td><span className={`pill sm role-${p.role}`}>{p.role}</span></td>
                  <td className="r"><Link className="linkbtn" href={`/members/${p.id}`}>Open ›</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No active participants yet.</div>
        )}
      </div>
    </>
  );
}
