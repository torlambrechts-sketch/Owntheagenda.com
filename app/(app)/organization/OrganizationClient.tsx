"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOrgSettings, regenerateJoinCode } from "./actions";

const REGIONS = [
  { value: "eu", label: "European Union (EU)" },
  { value: "uk", label: "United Kingdom (UK)" },
  { value: "us", label: "United States (US)" },
];
const RETENTION = [
  { value: "", label: "Keep forever" },
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
  { value: "36", label: "36 months" },
];

export type OrgInitial = {
  name: string;
  logoUrl: string;
  dataRegion: string;
  retentionMonths: number | null;
  joinCode: string;
  plan: string;
};

export function OrganizationClient({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: OrgInitial;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [dataRegion, setDataRegion] = useState(initial.dataRegion);
  const [retention, setRetention] = useState(
    initial.retentionMonths != null ? String(initial.retentionMonths) : "",
  );
  const [code, setCode] = useState(initial.joinCode);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function save() {
    start(async () => {
      const res = await saveOrgSettings({
        workspaceId,
        name,
        logoUrl: logoUrl || null,
        dataRegion,
        retentionMonths: retention ? Number(retention) : null,
      });
      if (res.error) flash(res.error);
      else {
        flash("Saved");
        router.refresh();
      }
    });
  }

  function rotate() {
    if (!confirm("Generate a new Company ID? The current one stops working immediately.")) return;
    start(async () => {
      const res = await regenerateJoinCode(workspaceId);
      if (res.error) flash(res.error);
      else if (res.code) {
        setCode(res.code);
        flash("New Company ID generated");
      }
    });
  }

  return (
    <div className="orgwrap">
      <section className="card orgcard">
        <h3>Company</h3>
        <div className="field">
          <label htmlFor="org-name">Company name</label>
          <input className="inp" id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="org-logo">Logo URL <span className="opt">(optional)</span></label>
          <input className="inp" id="org-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Plan</label>
          <div className="org-plan">{initial.plan}</div>
        </div>
        <button className="btn-prim" disabled={pending} onClick={save}>Save changes</button>
      </section>

      <section className="card orgcard">
        <h3>Company ID</h3>
        <p className="org-note">Colleagues use this to self-join your company at signup.</p>
        <div className="joincode">
          <span className="jc-l">Company ID</span>
          <code className="jc-v">{code}</code>
          <button className="linkbtn xs" onClick={() => { navigator.clipboard?.writeText(code); flash("Copied"); }}>Copy</button>
        </div>
        <button className="btn-sec sm" disabled={pending} onClick={rotate}>Regenerate</button>
      </section>

      <section className="card orgcard">
        <h3>Data &amp; privacy</h3>
        <div className="field">
          <label htmlFor="org-region">Data residency</label>
          <select className="inp" id="org-region" value={dataRegion} onChange={(e) => setDataRegion(e.target.value)}>
            {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div className="form-note">Where this company’s data is stored.</div>
        </div>
        <div className="field">
          <label htmlFor="org-retention">Data retention</label>
          <select className="inp" id="org-retention" value={retention} onChange={(e) => setRetention(e.target.value)}>
            {RETENTION.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div className="form-note">Personal data and ended sessions older than this are purged.</div>
        </div>
        <button className="btn-prim" disabled={pending} onClick={save}>Save changes</button>
      </section>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
