"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { ROLE_OPTIONS, roleLabel } from "@/lib/util";
import type { Enums } from "@/types/database.types";
import { bulkInvite } from "./actions";
import type { TeamOpt } from "./MembersClient";

type Role = Enums<"workspace_role">;
const VALID_ROLES = new Set(ROLE_OPTIONS.map((r) => r.value));

type Parsed = {
  email: string;
  role: Role;
  teamId: string | null;
  teamLabel: string;
  roleTitle: string | null;
  ok: boolean;
  reason: string | null;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === ",") { out.push(cur); cur = ""; }
    else if (c === '"') q = true;
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string, teams: TeamOpt[]): Parsed[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let cols = ["email", "role", "team", "role_title"];
  let start = 0;
  if (lines[0].toLowerCase().includes("email")) {
    cols = splitCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
    start = 1;
  }
  const at = (parts: string[], name: string) => {
    const j = cols.indexOf(name);
    return j >= 0 && j < parts.length ? parts[j].trim() : "";
  };
  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t]));
  const out: Parsed[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const email = at(parts, "email");
    const roleRaw = (at(parts, "role") || "member").toLowerCase();
    const teamName = at(parts, "team");
    const roleTitle = at(parts, "role_title") || at(parts, "title") || "";
    const team = teamName ? teamByName.get(teamName.toLowerCase()) ?? null : null;

    let ok = true;
    let reason: string | null = null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { ok = false; reason = "Invalid email"; }
    else if (!VALID_ROLES.has(roleRaw as Role)) { ok = false; reason = `Unknown role "${roleRaw}"`; }
    else if (teamName && !team) { ok = false; reason = `No team "${teamName}"`; }

    out.push({
      email,
      role: (VALID_ROLES.has(roleRaw as Role) ? roleRaw : "member") as Role,
      teamId: team?.id ?? null,
      teamLabel: team?.name ?? (teamName || "—"),
      roleTitle: roleTitle || null,
      ok,
      reason,
    });
  }
  return out;
}

export function MemberImport({ workspaceId, teams }: { workspaceId: string; teams: TeamOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Parsed[] | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { email: string; error: string }[] } | null>(null);

  const valid = rows?.filter((r) => r.ok) ?? [];

  function reset() {
    setRaw("");
    setRows(null);
    setResult(null);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => { setRaw(t); setRows(parseCsv(t, teams)); });
  }

  function send() {
    start(async () => {
      const res = await bulkInvite(workspaceId, valid.map((r) => ({ email: r.email, role: r.role, teamId: r.teamId, roleTitle: r.roleTitle })));
      setResult(res);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-sec" onClick={() => { reset(); setOpen(true); }}>Import CSV</button>
      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title="Import members from CSV"
        subtitle="Columns: email, role, team, role_title"
        footer={
          result ? (
            <div className="right"><button className="btn-prim" onClick={() => setOpen(false)}>Done</button></div>
          ) : (
            <>
              <button className="btn-sec" onClick={() => setOpen(false)}>Cancel</button>
              <div className="right">
                <button className="btn-prim" disabled={pending || !valid.length} onClick={send}>
                  {pending ? "Sending…" : `Send ${valid.length} invite${valid.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )
        }
      >
        {result ? (
          <div>
            <div className="grounded" style={{ marginBottom: 12 }}>{result.created} invitation{result.created === 1 ? "" : "s"} created</div>
            {result.failed.length ? (
              <div className="form-err">
                {result.failed.length} failed:
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {result.failed.map((f, i) => <li key={i}>{f.email} — {f.error}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="field">
              <label>Paste CSV or upload a file</label>
              <textarea
                className="inp"
                rows={6}
                value={raw}
                onChange={(e) => { setRaw(e.target.value); setRows(parseCsv(e.target.value, teams)); }}
                placeholder={"email,role,team,role_title\nkari@co.com,member,Product,Engineer\nbo@co.com,manager,Sales,Lead"}
              />
            </div>
            <div className="field">
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
            </div>

            {rows && rows.length ? (
              <div className="imp-prev">
                <div className="imp-sum">{valid.length} ready · {rows.length - valid.length} skipped</div>
                <div className="tbl-card">
                  <table className="tbl">
                    <thead><tr><th>Email</th><th style={{ width: 110 }}>Role</th><th style={{ width: 110 }}>Team</th><th style={{ width: 90 }} /></tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={r.ok ? "" : "imp-bad"}>
                          <td>{r.email || <span className="muted">—</span>}</td>
                          <td>{roleLabel(r.role)}</td>
                          <td>{r.teamLabel}</td>
                          <td className="r">{r.ok ? <span className="pill sm open">OK</span> : <span className="pill sm reject" title={r.reason ?? ""}>Skip</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : raw ? (
              <div className="muted" style={{ fontSize: 13 }}>No rows found yet.</div>
            ) : null}
          </>
        )}
      </SideWindow>
    </>
  );
}
