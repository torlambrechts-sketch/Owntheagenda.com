"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/util";

// Personal User Manual (Start Smart): a durable, per-person working-style card.
// Everyone fills in their own; the whole team reads each other's. Attributed
// (the point is mutual knowing), every field optional ("pass"), leader-first.

const FIELD_DEFS: { key: ManualField; label: string; ph: string }[] = [
  { key: "strengths", label: "My strengths", ph: "What I'm reliably good at" },
  { key: "working_style", label: "How I work best", ph: "Focus blocks, mornings, async…" },
  { key: "communication_pref", label: "Best way to reach me", ph: "Slack for quick, email for detail…" },
  { key: "feedback_pref", label: "How I like feedback", ph: "Direct and early, in private…" },
  { key: "watch_outs", label: "Watch-outs / what drains me", ph: "Back-to-back meetings, surprises…" },
  { key: "energizers", label: "What energises me", ph: "Hard problems, shipping, teaching…" },
];
type ManualField =
  | "strengths"
  | "working_style"
  | "communication_pref"
  | "feedback_pref"
  | "watch_outs"
  | "energizers";
const ALL_FIELDS = FIELD_DEFS.map((f) => f.key);
const MCOLS = "user_id, strengths, working_style, communication_pref, feedback_pref, watch_outs, energizers";

type Manual = Record<ManualField, string | null> & { userId: string };

function mapManual(r: any): Manual {
  return {
    userId: r.user_id,
    strengths: r.strengths ?? null,
    working_style: r.working_style ?? null,
    communication_pref: r.communication_pref ?? null,
    feedback_pref: r.feedback_pref ?? null,
    watch_outs: r.watch_outs ?? null,
    energizers: r.energizers ?? null,
  };
}

export function ManualModule({
  workspaceId,
  userId,
  participants,
  title,
  prompt,
  stepLabel,
  config,
  showReady,
  ready,
  onToggleReady,
}: {
  workspaceId: string;
  userId: string;
  participants: { userId: string; name: string }[];
  title: string;
  prompt: string | null;
  stepLabel: string;
  config: { fields?: string[]; leaderFirst?: boolean; allowPass?: boolean };
  showReady: boolean;
  ready: boolean;
  onToggleReady: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [manuals, setManuals] = useState<Record<string, Manual>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<ManualField, string>>(() => emptyDraft());
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const fields: ManualField[] =
    Array.isArray(config.fields) && config.fields.length
      ? (config.fields.filter((f) => ALL_FIELDS.includes(f as ManualField)) as ManualField[])
      : ALL_FIELDS;

  const load = useCallback(async () => {
    const { data } = await supabase.from("user_manual").select(MCOLS).eq("workspace_id", workspaceId);
    const map: Record<string, Manual> = {};
    for (const r of data ?? []) map[(r as any).user_id] = mapManual(r);
    setManuals(map);
  }, [supabase, workspaceId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`manual:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_manual", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const m = mapManual(payload.new as any);
          setManuals((prev) => ({ ...prev, [m.userId]: m }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  function startEdit() {
    const mine = manuals[userId];
    const d = emptyDraft();
    if (mine) for (const k of ALL_FIELDS) d[k] = mine[k] ?? "";
    setDraft(d);
    setEditing(true);
  }
  async function save() {
    setSaving(true);
    const args: Record<string, string | null> = { p_workspace: workspaceId };
    for (const k of ALL_FIELDS) args[`p_${k}`] = draft[k]?.trim() ? draft[k].trim() : null;
    await supabase.rpc("upsert_user_manual", args as never);
    await load();
    setSaving(false);
    setEditing(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  // Cards: every participant, plus any manual author who isn't in the room.
  const order = [
    ...participants,
    ...Object.keys(manuals)
      .filter((id) => !participants.some((p) => p.userId === id))
      .map((id) => ({ userId: id, name: "Member" })),
  ];

  return (
    <div className="manualwrap">
      <div className="canvashead">
        <div>
          <div className="pact">{stepLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="cright">
          {!manuals[userId] || editing ? null : (
            <button className="btn-sec" onClick={startEdit}>Edit my manual</button>
          )}
          {showReady ? (
            <button className={`ready${ready ? " on" : ""}`} onClick={onToggleReady}>
              {ready ? "✓ You're ready" : "I'm ready"}
            </button>
          ) : null}
        </div>
      </div>
      {prompt ? <div className="canvasprompt">{prompt}</div> : null}
      {config.leaderFirst ? (
        <div className="manualtip">
          Tip: have the facilitator share first — it sets the tone. Every field is optional; skip anything you’d rather not share.
        </div>
      ) : null}

      <div className="manualgrid">
        {order.map((p) => {
          const m = manuals[p.userId];
          const isMe = p.userId === userId;
          const filled = fields.some((f) => m?.[f]);
          if (isMe && editing) {
            return (
              <div className="mcard me editing" key={p.userId}>
                <div className="mhead">
                  <span className="av sm">{initials(p.name)}</span>
                  <b>{p.name}</b>
                  <span className="metag">You</span>
                </div>
                {fields.map((f) => {
                  const def = FIELD_DEFS.find((d) => d.key === f)!;
                  return (
                    <div className="mfield" key={f}>
                      <label>{def.label}</label>
                      <textarea
                        className="inp"
                        rows={2}
                        value={draft[f]}
                        placeholder={def.ph}
                        onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                      />
                    </div>
                  );
                })}
                <div className="mactions">
                  <button className="btn-sec" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                  <button className="btn-prim" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                </div>
              </div>
            );
          }
          return (
            <div className={`mcard${isMe ? " me" : ""}`} key={p.userId}>
              <div className="mhead">
                <span className="av sm">{initials(p.name)}</span>
                <b>{p.name}</b>
                {isMe ? <span className="metag">You</span> : null}
              </div>
              {filled ? (
                fields.map((f) => {
                  const v = m?.[f];
                  if (!v) return null;
                  const def = FIELD_DEFS.find((d) => d.key === f)!;
                  return (
                    <div className="mrow" key={f}>
                      <span className="mlabel">{def.label}</span>
                      <span className="mval">{v}</span>
                    </div>
                  );
                })
              ) : isMe ? (
                <button className="manual-fill" onClick={startEdit}>
                  + Write your manual{savedFlash ? " — saved" : ""}
                </button>
              ) : (
                <div className="mempty">Not shared yet</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function emptyDraft(): Record<ManualField, string> {
  return {
    strengths: "",
    working_style: "",
    communication_pref: "",
    feedback_pref: "",
    watch_outs: "",
    energizers: "",
  };
}
