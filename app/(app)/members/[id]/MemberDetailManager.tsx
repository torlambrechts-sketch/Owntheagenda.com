"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { saveMemberDetail, addCompetence, removeCompetence } from "./actions";

export type Competence = { id: string; name: string; issued: string | null; expires: string | null };
export type MemberContact = { jobTitle: string; department: string; location: string; phone: string };

// Status of a competence from its expiry — drives the pill colour + caption.
function compStatus(expires: string | null): { label: string; cls: "open" | "internal" | "reject" } {
  if (!expires) return { label: "No expiry", cls: "open" };
  const d = new Date(expires);
  if (isNaN(d.getTime())) return { label: "No expiry", cls: "open" };
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: "Expired", cls: "reject" };
  if (days <= 60) return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, cls: "internal" };
  return { label: `Valid to ${d.getFullYear()}`, cls: "open" };
}

export function MemberDetailManager({
  userId,
  canEdit,
  contact,
  competences,
}: {
  userId: string;
  canEdit: boolean;
  contact: MemberContact;
  competences: Competence[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<MemberContact>(contact);
  const [newName, setNewName] = useState("");
  const [newExpires, setNewExpires] = useState("");

  function saveContact() {
    setError(null);
    start(async () => {
      const res = await saveMemberDetail(userId, form);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }
  function add() {
    if (!newName.trim()) return;
    setError(null);
    start(async () => {
      const res = await addCompetence(userId, { name: newName.trim(), issued: null, expires: newExpires || null });
      if (res.error) return setError(res.error);
      setNewName("");
      setNewExpires("");
      router.refresh();
    });
  }
  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await removeCompetence(userId, id);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="a-ovcard">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Competence</h3>
        {canEdit ? (
          <button className="linkbtn" onClick={() => { setForm(contact); setOpen(true); }}>Edit details</button>
        ) : null}
      </div>

      {competences.length ? (
        <div className="mc-list">
          {competences.map((c) => {
            const s = compStatus(c.expires);
            return (
              <div key={c.id} className="mc-row">
                <div style={{ minWidth: 0 }}>
                  <div className="mc-name">{c.name}</div>
                  <div className={`mc-exp ${s.cls === "reject" ? "is-exp" : s.cls === "internal" ? "is-soon" : ""}`}>{s.label}</div>
                </div>
                <span className={`pill sm ${s.cls}`}>{s.cls === "open" ? "Valid" : s.cls === "internal" ? "Expiring" : "Expired"}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">No competence recorded yet.{canEdit ? " Use “Edit details” to add certifications and courses." : ""}</p>
      )}

      {canEdit ? (
        <SideWindow
          open={open}
          onClose={() => setOpen(false)}
          title="Member details"
          subtitle="Contact information and competence"
          footer={
            <>
              <button className="btn-sec" onClick={() => setOpen(false)} disabled={pending}>Close</button>
              <div className="right">
                <button className="btn-prim" onClick={saveContact} disabled={pending}>{pending ? "Saving…" : "Save contact"}</button>
              </div>
            </>
          }
        >
          {error ? <div className="form-err">{error}</div> : null}

          <div className="field">
            <label htmlFor="md-title">Job title</label>
            <input className="inp" id="md-title" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="e.g. Head of Product" />
          </div>
          <div className="field">
            <label htmlFor="md-dept">Department</label>
            <input className="inp" id="md-dept" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="e.g. HSE & Quality" />
          </div>
          <div className="field">
            <label htmlFor="md-loc">Location</label>
            <input className="inp" id="md-loc" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Oslo HQ" />
          </div>
          <div className="field">
            <label htmlFor="md-phone">Phone</label>
            <input className="inp" id="md-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="e.g. +47 922 14 503" />
          </div>

          <div style={{ borderTop: "1px solid var(--line)", margin: "8px 0 16px", paddingTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Competence</div>
            {competences.length ? (
              <div className="mc-list" style={{ marginBottom: 12 }}>
                {competences.map((c) => {
                  const s = compStatus(c.expires);
                  return (
                    <div key={c.id} className="mc-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="mc-name">{c.name}</div>
                        <div className="mc-exp">{s.label}</div>
                      </div>
                      <button className="icon-btn danger" onClick={() => remove(c.id)} disabled={pending} title="Remove" aria-label={`Remove ${c.name}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                <label htmlFor="md-comp">Add competence</label>
                <input className="inp" id="md-comp" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. First aid" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="md-exp">Expires <span className="opt">(optional)</span></label>
                <input className="inp" id="md-exp" type="date" value={newExpires} onChange={(e) => setNewExpires(e.target.value)} />
              </div>
              <button className="btn-sec" onClick={add} disabled={pending || !newName.trim()}>Add</button>
            </div>
          </div>
        </SideWindow>
      ) : null}
    </div>
  );
}
