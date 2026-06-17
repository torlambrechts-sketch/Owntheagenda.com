"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { initials } from "@/lib/util";
import { createTeam } from "./actions";

export type TeamCard = {
  id: string;
  name: string;
  description: string | null;
  leadName: string | null;
  memberCount: number;
  parentName: string | null;
};
export type ParentOpt = { id: string; name: string };

export function TeamsClient({
  workspaceId,
  canManage,
  teams,
  parents,
}: {
  workspaceId: string;
  canManage: boolean;
  teams: TeamCard[];
  parents: ParentOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentTeamId, setParentTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function submit() {
    setError(null);
    const res = await createTeam({
      workspaceId,
      name,
      description: description || null,
      parentTeamId: parentTeamId || null,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setName("");
    setDescription("");
    setParentTeamId("");
    flash("Team created");
    router.refresh();
  }

  return (
    <>
      <div className="summary">
        <div className="stat">
          <div className="num">{teams.length}</div>
          <div className="lab">Teams</div>
        </div>
        {canManage ? (
          <div className="actions">
            <button className="btn-prim" onClick={() => setOpen(true)}>
              New team
            </button>
          </div>
        ) : null}
      </div>

      {teams.length === 0 ? (
        <div className="card empty">No teams yet.</div>
      ) : (
        <div className="cardgrid">
          {teams.map((t) => (
            <div className="card" key={t.id}>
              <div className="eyebrow">
                {t.parentName ? `↳ ${t.parentName}` : "Team"}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  margin: "4px 0 6px",
                }}
              >
                {t.name}
              </h3>
              {t.description ? (
                <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 12px" }}>
                  {t.description}
                </p>
              ) : null}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                {t.leadName ? (
                  <>
                    <span className="av sm green">{initials(t.leadName)}</span>
                    <span>{t.leadName} · lead</span>
                  </>
                ) : (
                  <span>No lead set</span>
                )}
                <span style={{ marginLeft: "auto" }}>
                  {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <SideWindow
        open={open}
        onClose={() => setOpen(false)}
        title="New team"
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <div className="right">
              <button className="btn-prim" disabled={!name} onClick={submit}>
                Create team
              </button>
            </div>
          </>
        }
      >
        {error ? <div className="form-err">{error}</div> : null}
        <div className="field">
          <label htmlFor="t-name">Team name</label>
          <input
            className="inp"
            id="t-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leadership team"
          />
        </div>
        <div className="field">
          <label htmlFor="t-desc">
            Description <span className="opt">(optional)</span>
          </label>
          <textarea
            className="inp"
            id="t-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {parents.length > 0 ? (
          <div className="field">
            <label htmlFor="t-parent">
              Parent team <span className="opt">(optional)</span>
            </label>
            <select
              className="inp"
              id="t-parent"
              value={parentTeamId}
              onChange={(e) => setParentTeamId(e.target.value)}
            >
              <option value="">— none (top level) —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
