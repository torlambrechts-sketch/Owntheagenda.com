"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACTIVITY, CATEGORY } from "@/lib/util";
import { buildFromTemplate, deleteWorkshop } from "./actions";

export type TemplateCard = {
  id: string;
  key: string | null;
  name: string;
  category: string;
  source: string | null;
  description: string | null;
  steps: number;
  minutes: number;
  types: string[];
};
export type WorkshopRow = { id: string; title: string; status: string };
export type Recommendation = {
  templateId: string;
  templateName: string;
  dynamicLabel: string;
  why: string;
  pct: number | null;
  targetLow: number;
  belowBand: boolean;
  pulseId: string | null;
};

export function WorkshopsClient({
  teamId,
  canManage,
  templates,
  workshops,
  recommendation,
}: {
  teamId: string;
  canManage: boolean;
  templates: TemplateCard[];
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function use(templateId: string, pulseId?: string | null) {
    startTransition(async () => {
      const res = await buildFromTemplate(teamId, templateId, pulseId ?? undefined);
      if (res.error) flash(res.error);
      else if (res.id) router.push(`/workshops/${res.id}`);
    });
  }
  function remove(id: string) {
    if (!confirm("Delete this workshop?")) return;
    startTransition(async () => {
      const res = await deleteWorkshop(id);
      if (res.error) flash(res.error);
      else {
        flash("Workshop deleted");
        router.refresh();
      }
    });
  }

  const cats = Array.from(new Set(templates.map((t) => t.category)));

  return (
    <>
      {recommendation ? (
        <div className="rec">
          <div className="rec-l">
            <div className="rec-eyebrow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
              Grounded recommendation
            </div>
            <div className="rec-title">
              {recommendation.dynamicLabel} {recommendation.belowBand ? "is below target" : "is your lowest reading"}
              {recommendation.pct != null ? ` · ${recommendation.pct}% vs ${recommendation.targetLow}%+` : ""}
            </div>
            <div className="rec-why">
              Run <b>{recommendation.templateName}</b> to {recommendation.why}.
            </div>
          </div>
          {canManage ? (
            <button className="btn-prim" disabled={pending} onClick={() => use(recommendation.templateId, recommendation.pulseId)}>
              Build it ▸
            </button>
          ) : null}
        </div>
      ) : null}

      {workshops.length > 0 ? (
        <>
          <div className="cat-head">
            Your workshops <span className="n">{workshops.length}</span>
          </div>
          <div className="tbl-card">
            <table className="tbl">
              <tbody>
                {workshops.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link
                        href={`/workshops/${w.id}`}
                        style={{ fontWeight: 600, textDecoration: "none" }}
                      >
                        {w.title}
                      </Link>
                    </td>
                    <td style={{ width: 110 }}>
                      <span className="pill sm draft">{w.status}</span>
                    </td>
                    <td className="r" style={{ width: 120 }}>
                      <Link className="linkbtn" href={`/workshops/${w.id}`}>
                        Open
                      </Link>
                      {canManage ? (
                        <button
                          className="linkbtn"
                          style={{ marginLeft: 12, color: "var(--rust)" }}
                          disabled={pending}
                          onClick={() => remove(w.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="cat-head" style={{ marginTop: 28 }}>
        Library
      </div>

      {cats.map((cat) => {
        const items = templates.filter((t) => t.category === cat);
        return (
          <div key={cat}>
            <div className="cat-head" style={{ fontSize: 15, marginTop: 18 }}>
              {CATEGORY[cat] ?? cat} <span className="n">{items.length}</span>
            </div>
            <div className="tpl-grid">
              {items.map((t) => (
                <div className="tpl" key={t.id}>
                  <div className="thumb">
                    {t.types.slice(0, 7).map((ty, i) => (
                      <span
                        key={i}
                        className={`bar`}
                        style={{
                          height: `${30 + ((i * 13) % 60)}%`,
                          background:
                            ty === "vote"
                              ? "var(--internal-fg)"
                              : ty === "outcome"
                                ? "var(--rust)"
                                : ty === "discuss"
                                  ? "var(--draft-fg)"
                                  : ty === "checkin"
                                    ? "var(--green)"
                                    : "var(--role)",
                          opacity: 0.55,
                        }}
                      />
                    ))}
                  </div>
                  <div className="body">
                    <h3>{t.name}</h3>
                    <div className="src">{t.source}</div>
                    <p>{t.description}</p>
                    <div className="meta">
                      <span>⏱ {t.minutes} min</span>
                      <span>▥ {t.steps} steps</span>
                    </div>
                    <div className="foot">
                      <button
                        className="btn-prim"
                        disabled={!canManage || pending}
                        onClick={() => use(t.id)}
                        title={canManage ? "" : "Only a team lead or admin can build"}
                      >
                        Use template
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{toast}</span>
      </div>
    </>
  );
}
