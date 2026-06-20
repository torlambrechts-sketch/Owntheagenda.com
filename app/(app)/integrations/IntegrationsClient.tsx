"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { connectIntegration, disconnectIntegration } from "./actions";

export type Conn = { status: string; config: Record<string, unknown> };

type Provider = {
  key: string;
  name: string;
  blurb: string;
  field?: { key: string; label: string; placeholder: string };
};

const CATALOG: Provider[] = [
  { key: "slack", name: "Slack", blurb: "Post session readouts and reminders to a channel.", field: { key: "webhook_url", label: "Incoming webhook URL", placeholder: "https://hooks.slack.com/services/…" } },
  { key: "webhook", name: "Webhook", blurb: "Send session and action events to any HTTPS endpoint.", field: { key: "url", label: "Endpoint URL", placeholder: "https://…" } },
  { key: "teams", name: "Microsoft Teams", blurb: "Post reminders and readouts to a Teams channel.", field: { key: "webhook_url", label: "Incoming webhook URL", placeholder: "https://…webhook.office.com/…" } },
  { key: "google_calendar", name: "Google Calendar", blurb: "Put follow-ups and sessions on the calendar." },
  { key: "zoom", name: "Zoom", blurb: "Run live sessions over Zoom." },
  { key: "entra", name: "Microsoft Entra ID", blurb: "Single sign-on and directory sync." },
];

export function IntegrationsClient({
  workspaceId,
  connected,
}: {
  workspaceId: string;
  connected: Record<string, Conn>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [value, setValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function openConfig(p: Provider) {
    setEditing(p);
    setValue(String(connected[p.key]?.config?.[p.field!.key] ?? ""));
  }
  function save() {
    if (!editing) return;
    start(async () => {
      const res = await connectIntegration(workspaceId, editing.key, { [editing.field!.key]: value.trim() });
      if (res.error) flash(res.error);
      else { flash("Connected"); setEditing(null); router.refresh(); }
    });
  }
  function disconnect(key: string) {
    if (!confirm("Disconnect this integration?")) return;
    start(async () => {
      const res = await disconnectIntegration(workspaceId, key);
      if (res.error) flash(res.error);
      else { flash("Disconnected"); setEditing(null); router.refresh(); }
    });
  }

  return (
    <>
      <div className="tbl-card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Integration</th>
              <th style={{ width: 150 }}>Status</th>
              <th style={{ width: 170 }} />
            </tr>
          </thead>
          <tbody>
            {CATALOG.map((p) => {
              const conn = connected[p.key];
              const connectable = !!p.field;
              return (
                <tr key={p.key}>
                  <td>
                    <div className="person">
                      <span className="int-logo">{p.name.charAt(0)}</span>
                      <span className="tname"><b>{p.name}</b><small>{p.blurb}</small></span>
                    </div>
                  </td>
                  <td>
                    {conn ? (
                      <span className="pill sm open">Connected</span>
                    ) : connectable ? (
                      <span className="pill sm draft">Not connected</span>
                    ) : (
                      <span className="pill sm draft">Coming soon</span>
                    )}
                  </td>
                  <td className="r">
                    {connectable ? (
                      <div className="row-acts">
                        {conn ? (
                          <button className="linkbtn xs danger" disabled={pending} onClick={() => disconnect(p.key)}>Disconnect</button>
                        ) : null}
                        <button className="btn-sec sm" disabled={pending} onClick={() => openConfig(p)}>{conn ? "Configure" : "Connect"}</button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--faint)", fontSize: 12 }}>Coming soon</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SideWindow
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${connected[editing.key] ? "Configure" : "Connect"} ${editing.name}` : ""}
        subtitle={editing?.blurb}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setEditing(null)}>Cancel</button>
            <div className="right">
              <button className="btn-prim" disabled={pending || !value.trim()} onClick={save}>Save</button>
            </div>
          </>
        }
      >
        {editing ? (
          <>
            <div className="field">
              <label htmlFor="int-url">{editing.field!.label}</label>
              <input className="inp" id="int-url" value={value} onChange={(e) => setValue(e.target.value)} placeholder={editing.field!.placeholder} autoFocus />
            </div>
            {connected[editing.key] ? (
              <button className="linkbtn xs danger" disabled={pending} onClick={() => disconnect(editing.key)}>Disconnect this integration</button>
            ) : null}
          </>
        ) : null}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
