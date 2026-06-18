"use client";

import Link from "next/link";
import { useTableControls } from "@/components/TableControls";

export type SessionRow = {
  id: string;
  workshopId: string;
  title: string;
  team: string | null;
  startedAt: string | null;
  people: number;
  actions: number;
  status: string;
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SessionsClient({ rows }: { rows: SessionRow[] }) {
  const { view, controls } = useTableControls<SessionRow>(rows, {
    search: { placeholder: "Search sessions…", text: (s) => `${s.title} ${s.team ?? ""}` },
    sorts: [
      { key: "recent", label: "Most recent", cmp: (a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "") },
      { key: "people", label: "Most people", cmp: (a, b) => b.people - a.people },
      { key: "actions", label: "Most actions", cmp: (a, b) => b.actions - a.actions },
      { key: "title", label: "Workshop (A–Z)", cmp: (a, b) => a.title.localeCompare(b.title) },
    ],
    facets: [
      { key: "status", label: "Status", options: [
        { value: "live", label: "Live", test: (s) => s.status === "live" },
        { value: "ended", label: "Ended", test: (s) => s.status === "ended" },
      ] },
    ],
  });

  return (
    <>
      {rows.length >= 5 ? controls : null}
      <div className="tbl-card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Workshop</th>
              <th>Team</th>
              <th>When</th>
              <th style={{ width: 90 }}>People</th>
              <th style={{ width: 90 }}>Actions</th>
              <th style={{ width: 90 }}>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {view.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/sessions/${s.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>{s.title}</Link>
                </td>
                <td style={{ color: "var(--muted)" }}>{s.team ?? "—"}</td>
                <td style={{ color: "var(--muted)" }}>{fmtDate(s.startedAt)}</td>
                <td>{s.people}</td>
                <td>{s.actions}</td>
                <td>
                  <span className={`pill sm ${s.status === "live" ? "open" : "draft"}`}>{s.status}</span>
                </td>
                <td className="r">
                  <Link className="linkbtn" href={s.status === "live" ? `/run/${s.workshopId}` : `/sessions/${s.id}`}>
                    {s.status === "live" ? "Join" : "Readout"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
