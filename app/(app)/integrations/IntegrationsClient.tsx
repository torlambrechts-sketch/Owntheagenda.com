"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  { key: "teams", name: "Microsoft Teams", blurb: "Share readouts and nudges in a Teams channel." },
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
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function openConnect(p: Provider) {
    setEditing(p.key);
    setValue(String(connected[p.key]?.config?.[p.field!.key] ?? ""));
  }
  function connect(p: Provider) {
    start(async () => {
      const res = await connectIntegration(workspaceId, p.key, { [p.field!.key]: value.trim() });
      if (res.error) flash(res.error);
      else {
        flash("Connected");
        setEditing(null);
        router.refresh();
      }
    });
  }
  function disconnect(key: string) {
    if (!confirm("Disconnect this integration?")) return;
    start(async () => {
      const res = await disconnectIntegration(workspaceId, key);
      if (res.error) flash(res.error);
      else {
        flash("Disconnected");
        router.refresh();
      }
    });
  }

  return (
    <div className="intgrid">
      {CATALOG.map((p) => {
        const conn = connected[p.key];
        const connectable = !!p.field;
        return (
          <div className={`intcard${conn ? " on" : ""}`} key={p.key}>
            <div className="int-h">
              <span className="int-logo">{p.name.charAt(0)}</span>
              <div className="int-meta">
                <b>{p.name}</b>
                {conn ? (
                  <span className="pill sm open">Connected</span>
                ) : !connectable ? (
                  <span className="pill sm draft">Coming soon</span>
                ) : null}
              </div>
            </div>
            <p className="int-blurb">{p.blurb}</p>

            {connectable ? (
              editing === p.key ? (
                <div className="int-form">
                  <input className="inp" value={value} onChange={(e) => setValue(e.target.value)} placeholder={p.field!.placeholder} autoFocus />
                  <div className="int-acts">
                    <button className="btn-sec sm" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn-prim sm" disabled={pending || !value.trim()} onClick={() => connect(p)}>Save</button>
                  </div>
                </div>
              ) : (
                <div className="int-acts">
                  {conn ? (
                    <button className="linkbtn xs danger" disabled={pending} onClick={() => disconnect(p.key)}>Disconnect</button>
                  ) : null}
                  <button className="btn-sec sm" disabled={pending} onClick={() => openConnect(p)}>{conn ? "Configure" : "Connect"}</button>
                </div>
              )
            ) : (
              <button className="btn-sec sm" disabled>Coming soon</button>
            )}
          </div>
        );
      })}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
