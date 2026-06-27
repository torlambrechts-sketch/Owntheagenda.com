"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/util";
import { Icon, catVis, WA } from "./visuals";
import type { WorkshopRow } from "./WorkshopsClient";

// All numbers are computed server-side from real data in page.tsx. A value of
// null renders as "—" (honest absence). See page.tsx for each query/RPC.
export type DashKpi = { num: string; suffix: string; label: string; color: string };
export type DashMonth = { label: string; value: number };
export type DashStatus = { live: number; scheduled: number; done: number };
export type DashAction = { done: number; onTrack: number; atRisk: number; notStarted: number };

export type DashboardData = {
  kpis: DashKpi[];
  months: DashMonth[];
  monthDelta: number | null; // +NN% vs last half, null when not computable
  status: DashStatus;
  actions: DashAction;
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e1d5",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(58,77,63,.05),0 6px 18px rgba(58,77,63,.05)",
};
const serifTitle: React.CSSProperties = { fontFamily: WA.serif, fontWeight: 600, color: "#2a2a26" };

export function WorkshopDashboard({
  data,
  upcoming,
  onViewAll,
}: {
  data: DashboardData;
  upcoming: WorkshopRow[];
  onViewAll: () => void;
}) {
  const router = useRouter();
  const { kpis, months, monthDelta, status, actions } = data;

  // bar chart — tallest bar forest, rest sage; honest empty state when no runs
  const maxM = Math.max(1, ...months.map((m) => m.value));

  // donut — conic-gradient over live/scheduled/done counts
  const total = status.live + status.scheduled + status.done;
  const liveDeg = total ? (status.live / total) * 360 : 0;
  const schedDeg = total ? (status.scheduled / total) * 360 : 0;
  const donut = total
    ? `conic-gradient(#16a34a 0deg ${liveDeg}deg, #2563eb ${liveDeg}deg ${liveDeg + schedDeg}deg, #a6a698 ${liveDeg + schedDeg}deg 360deg)`
    : "conic-gradient(#eceadf 0deg 360deg)";
  const statusLegend = [
    { label: "Live now", color: "#16a34a", count: status.live },
    { label: "Scheduled", color: "#2563eb", count: status.scheduled },
    { label: "Completed", color: "#a6a698", count: status.done },
  ];

  // action follow-through — Done / On track / At risk / Not started
  const actTotal = actions.done + actions.onTrack + actions.atRisk + actions.notStarted;
  const pct = (n: number) => (actTotal ? Math.round((n / actTotal) * 100) : 0);
  const actBars = [
    { label: "Done", value: actions.done, color: "#3f7d5a" },
    { label: "On track", value: actions.onTrack, color: "#a8862f" },
    { label: "At risk", value: actions.atRisk, color: "#b8584a" },
    { label: "Not started", value: actions.notStarted, color: "#a6a698" },
  ];
  const onTrackPct = actTotal ? Math.round(((actions.done + actions.onTrack) / actTotal) * 100) : null;

  return (
    <div style={{ color: WA.ink2 }}>
      {/* 5-KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 0, ...cardStyle, padding: "20px 8px", marginBottom: 18 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ padding: "0 18px", borderRight: i < kpis.length - 1 ? "1px solid #ece9df" : "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: WA.serif, fontSize: 32, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: k.color, lineHeight: 1 }}>{k.num}</span>
              {k.suffix ? <span style={{ fontSize: 14, fontWeight: 600, color: k.color }}>{k.suffix}</span> : null}
            </div>
            <div style={{ marginTop: 9, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#8a8a7e", lineHeight: 1.3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* row: bar chart + donut */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        <div style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
            <span style={{ ...serifTitle, fontSize: 18 }}>Workshops run per month</span>
            {monthDelta != null ? (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: monthDelta >= 0 ? "#3f7d5a" : "#b8584a", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="TrendingUp" size={14} color={monthDelta >= 0 ? "#3f7d5a" : "#b8584a"} />{monthDelta >= 0 ? "+" : ""}{monthDelta}% vs. last half
              </span>
            ) : null}
          </div>
          <div style={{ flex: "1 1 0%", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, minHeight: 180, paddingTop: 10 }}>
            {months.map((m, i) => {
              const tallest = m.value === maxM && m.value > 0;
              return (
                <div key={i} style={{ flex: "1 1 0%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8a7e", fontVariantNumeric: "tabular-nums" }}>{m.value}</span>
                  <div style={{ width: "100%", maxWidth: 34, borderRadius: "6px 6px 0 0", background: tallest ? "#3a4d3f" : "#cdd8cf", height: `${Math.round((m.value / maxM) * 140)}px` }} />
                  <span style={{ fontSize: 11, color: "#a6a698" }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column" }}>
          <div style={{ ...serifTitle, fontSize: 18, marginBottom: 16 }}>By status</div>
          <div style={{ flex: "1 1 0%", display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0, borderRadius: "50%", background: donut }}>
              <div style={{ position: "absolute", inset: 18, background: "#fff", borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: "#2a2a26", lineHeight: 1 }}>{total}</span>
                <span style={{ fontSize: 10, color: "#8a8a7e", textTransform: "uppercase", letterSpacing: ".04em" }}>Total</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: "1 1 0%" }}>
              {statusLegend.map((st, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: st.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: "#404040", flex: "1 1 0%" }}>{st.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#2a2a26", fontVariantNumeric: "tabular-nums" }}>{st.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* row: upcoming + action follow-through */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8, alignItems: "stretch" }}>
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ padding: "15px 20px", borderBottom: "1px solid #ece9df", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ ...serifTitle, fontSize: 17 }}>Upcoming workshops</span>
            <span onClick={onViewAll} style={{ fontSize: 12, fontWeight: 600, color: "#3a4d3f", cursor: "pointer" }}>View all</span>
          </div>
          {upcoming.length ? upcoming.map((w) => {
            const v = catVis(w.category);
            const when = w.scheduledAt
              ? new Date(w.scheduledAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
              : "—";
            return (
              <div key={w.id} onClick={() => router.push(`/workshops/${w.id}/overview`)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 20px", borderBottom: "1px solid #ece9df", cursor: "pointer" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: v.tint, border: `1px solid ${v.border}`, color: v.accent }}><Icon name={v.icon} size={17} color={v.accent} /></span>
                <div style={{ minWidth: 0, flex: "1 1 0%" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#2a2a26", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.title}</div>
                  <div style={{ fontSize: 11.5, color: "#a6a698", marginTop: 1 }}>{w.creatorName ?? "Unassigned"} · {w.participants} people</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#3a4d3f", whiteSpace: "nowrap" }}>{when}</span>
              </div>
            );
          }) : (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#a6a698", fontSize: 13 }}>Nothing scheduled yet.</div>
          )}
        </div>

        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <div style={{ ...serifTitle, fontSize: 17, marginBottom: 16 }}>Action items follow-through</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {actBars.map((a, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, color: "#404040" }}>{a.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#2a2a26", fontVariantNumeric: "tabular-nums" }}>{a.value}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "#eceadf", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, width: `${pct(a.value)}%`, background: a.color }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, paddingTop: 15, borderTop: "1px solid #ece9df", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: WA.serif, fontSize: 28, fontWeight: 600, color: "#3a4d3f" }}>{onTrackPct != null ? `${onTrackPct}%` : "—"}</span>
            <span style={{ fontSize: 12.5, color: "#585850", lineHeight: 1.4 }}>of all owned actions are on track or done</span>
          </div>
        </div>
      </div>
    </div>
  );
}
