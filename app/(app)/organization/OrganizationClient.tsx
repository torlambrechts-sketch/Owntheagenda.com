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
    <div className="org-cards">
      <section className="ocard">
        <div className="ocard-h">
          <div className="oct">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" /></svg>
            Organization profile
          </div>
          <div className="ocd">Your company’s identity across OwnTheAgenda.</div>
        </div>
        <div className="oset">
          <div className="oset-l"><div className="oset-t">Name</div></div>
          <div className="oset-c"><input className="inp oset-inp" value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <div className="oset">
          <div className="oset-l"><div className="oset-t">Logo URL</div><div className="oset-d">Shown in the app and on shared recaps.</div></div>
          <div className="oset-c"><input className="inp oset-inp" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" /></div>
        </div>
        <div className="oset">
          <div className="oset-l"><div className="oset-t">Plan</div><div className="oset-d">Your current subscription tier.</div></div>
          <div className="oset-c"><span className="ohead-plan" style={{ textTransform: "capitalize" }}>{initial.plan}</span></div>
        </div>
        <div className="oset oset-foot">
          <div className="oset-l" />
          <div className="oset-c"><button className="btn-prim" disabled={pending} onClick={save}>Save changes</button></div>
        </div>
      </section>

      <section className="ocard">
        <div className="ocard-h">
          <div className="oct">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
            Company ID
          </div>
          <div className="ocd">Colleagues use this to self-join your company at signup.</div>
        </div>
        <div className="oset">
          <div className="oset-l"><div className="oset-t">Company ID</div><div className="oset-d">Anyone with this ID can request to join your company.</div></div>
          <div className="oset-c">
            <code className="oset-code">{code}</code>
            <button className="btn-sec sm" onClick={() => { navigator.clipboard?.writeText(code); flash("Copied"); }}>Copy</button>
            <button className="btn-sec sm" disabled={pending} onClick={rotate}>Regenerate</button>
          </div>
        </div>
      </section>

      <section className="ocard">
        <div className="ocard-h">
          <div className="oct">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            Data &amp; privacy
          </div>
          <div className="ocd">Where this company’s data lives, and how long it is kept.</div>
        </div>
        <div className="oset">
          <div className="oset-l"><div className="oset-t">Data residency</div><div className="oset-d">The region where workshop content and assessments are stored.</div></div>
          <div className="oset-c">
            <select className="inp oset-inp" value={dataRegion} onChange={(e) => setDataRegion(e.target.value)}>
              {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div className="oset">
          <div className="oset-l"><div className="oset-t">Data retention</div><div className="oset-d">Personal data and ended sessions older than this are purged.</div></div>
          <div className="oset-c">
            <select className="inp oset-inp" value={retention} onChange={(e) => setRetention(e.target.value)}>
              {RETENTION.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div className="oset oset-foot">
          <div className="oset-l" />
          <div className="oset-c"><button className="btn-prim" disabled={pending} onClick={save}>Save changes</button></div>
        </div>
      </section>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
