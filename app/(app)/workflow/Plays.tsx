"use client";

import { useState } from "react";
import { PLAYS } from "@/lib/plays";

// Curated one-click recipes. Pick a team, hit Launch, and the Play opens the
// pulse and queues the matching workshop to auto-build when responses land.

type Named = { id: string; name: string };

export function Plays({
  teams,
  pending,
  onLaunch,
}: {
  teams: Named[];
  pending: boolean;
  onLaunch: (playKey: string, name: string, templateKey: string, minResponses: number, teamId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [teamFor, setTeamFor] = useState<Record<string, string>>({});

  return (
    <div className="plays">
      <button className="plays-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="plays-title">Plays</span>
        <span className="plays-sub">One-click recipes — assess, then auto-run the right workshop</span>
        <span className="plays-chev">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="plays-grid">
          {PLAYS.map((p) => {
            const team = teamFor[p.key] ?? teams[0]?.id ?? "";
            return (
              <div className="play-card" key={p.key}>
                <h4>{p.name}</h4>
                <p className="play-blurb">{p.blurb}</p>
                <div className="play-meta">
                  <span className="pill sm open">{p.workshopName}</span>
                  <span className="play-thr">{p.minResponses}+ responses</span>
                </div>
                <div className="play-launch">
                  <select
                    className="inp sm"
                    value={team}
                    onChange={(e) => setTeamFor((m) => ({ ...m, [p.key]: e.target.value }))}
                  >
                    {teams.length === 0 ? <option value="">No teams</option> : null}
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-prim sm"
                    disabled={pending || !team}
                    onClick={() => onLaunch(p.key, p.name, p.workshopTemplateKey, p.minResponses, team)}
                  >
                    Launch
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
