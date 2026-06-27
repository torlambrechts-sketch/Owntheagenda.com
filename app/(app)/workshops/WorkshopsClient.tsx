"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WorkshopHome } from "./WorkshopHome";
import { WorkshopDashboard, type DashboardData } from "./WorkshopDashboard";
import { NewWorkshopWindow } from "./NewWorkshopWindow";
import { TemplatesClient, type TemplateVM } from "./templates/TemplatesClient";
import { createBlankWorkshop } from "./actions";
import { Icon, WA } from "./visuals";

type WkSection = "dashboard" | "workshops" | "board" | "templates";

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
  phases?: { title: string; type: string; minutes: number; prompt: string | null }[];
};
export type WorkshopRow = {
  id: string;
  title: string;
  status: string;
  editedLabel: string;
  scheduledAt: string | null;
  creatorName: string | null;
  category: string | null;
  templateName: string | null;
  participants: number;
  actions: number;
  decisions: number;
};
export type Recommendation = {
  templateId: string;
  templateName: string;
  dynamicLabel: string;
  why: string;
  pct: number | null;
  targetLow: number;
  belowBand: boolean;
  pulseId: string | null;
  scienceSlug: string | null;
};
// One block in an assessment-seeded agenda (preview + creation).
export type SeedBlock = {
  title: string;
  activityType: string;
  duration: number;
  prompt: string | null;
  phaseLabel: string;
};
// A team assessment offered in the "From assessment" creation mode.
export type AssessOption = {
  surveyId: string;
  name: string;
  teamName: string;
  responses: number;
  dateLabel: string;
  score: number | null;
  scale: number;
  band: 0 | 1 | 2;
  masked: boolean;
  weak: { label: string; score: number }[];
  seedBlocks: SeedBlock[];
};

// Four-section pill bar (design handoff): Dashboard / Workshops / Board / Templates.
const SECTIONS: { key: WkSection; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutGrid" },
  { key: "workshops", label: "Workshops", icon: "List" },
  { key: "board", label: "Board", icon: "Layers" },
  { key: "templates", label: "Templates", icon: "Presentation" },
];

export function WorkshopsClient({
  teamId,
  canManage,
  templates,
  workshops,
  recommendation,
  surveyInsts = [],
  scienceByCategory = {},
  templateVMs = [],
  initialSection = "dashboard",
  dashboard,
  upcoming = [],
  teamOptions = [],
  assessOptions = [],
}: {
  teamId: string;
  canManage: boolean;
  templates: TemplateCard[];
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
  surveyInsts?: { kind: string; name: string }[];
  scienceByCategory?: Record<string, string>;
  templateVMs?: TemplateVM[];
  initialSection?: WkSection;
  dashboard: DashboardData;
  upcoming?: WorkshopRow[];
  teamOptions?: { id: string; name: string }[];
  assessOptions?: AssessOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState<WkSection>(initialSection);
  const [newOpen, setNewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [filterOwner, setFilterOwner] = useState("all");
  const [newTemplateSignal, setNewTemplateSignal] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  // "Build workshop" (in the ⋯ menu) — create an empty draft and go straight
  // to the builder (no slide-over).
  function buildDirect() {
    setPageMenuOpen(false);
    startTransition(async () => {
      const r = await createBlankWorkshop(teamId, "");
      if (r.error) { flash(r.error); return; }
      if (r.id) router.push(`/workshops/${r.id}`);
    });
  }

  const owners = useMemo(
    () => Array.from(new Set(workshops.map((w) => w.creatorName).filter((n): n is string => !!n))),
    [workshops],
  );
  const filterActive = filterOwner !== "all";

  const secTabBase: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 9, flex: "1 1 0%",
    border: "none", borderRadius: 9, padding: "12px 14px", fontSize: 13.5, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  };

  const pageMenuItems = [
    { label: "Build workshop", icon: "Wand2", onClick: buildDirect },
    { label: "New template", icon: "Plus", onClick: () => { setPageMenuOpen(false); setSection("templates"); } },
    { label: "Import workshop", icon: "Download", onClick: () => { setPageMenuOpen(false); flash("Import isn’t available yet"); } },
  ];

  return (
    <div style={{ color: WA.ink2 }}>
      {/* header: title + Filters + ⋯ + New workshop */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, margin: "2px 0 16px" }}>
        <h1 className="page-title" style={{ margin: 0 }}>Workshops</h1>
        {canManage ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {section === "templates" ? (
              <button onClick={() => setNewTemplateSignal((n) => n + 1)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#3a4d3f", color: "#fff", border: "none", borderRadius: 6, padding: "11px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="Plus" size={15} color="#fff" /> New template
              </button>
            ) : (
              <button onClick={() => setNewOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#3a4d3f", color: "#fff", border: "none", borderRadius: 6, padding: "11px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="Plus" size={15} color="#fff" /> New workshop
              </button>
            )}

            {/* Filters pill + popover (owner) */}
            <div style={{ position: "relative" }}>
              <button onClick={() => { setFilterOpen((o) => !o); setPageMenuOpen(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${filterActive ? "#3a4d3f" : "#d8d4c6"}`, background: filterActive ? "#eef4ef" : "#fff", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontWeight: 600, color: "#2a2a26", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="SlidersHorizontal" size={14} color="#585850" /> Filters
                {filterActive ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#3a4d3f", color: "#fff", fontSize: 10.5, fontWeight: 700 }}>1</span> : null}
                <Icon name="ChevronDown" size={14} color="#8a8a7e" />
              </button>
              {filterOpen ? (
                <>
                  <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 236, background: "#fff", border: "1px solid #e4e1d5", borderRadius: 10, boxShadow: "0 12px 34px rgba(42,42,38,.16)", padding: 14, zIndex: 60 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#8a8a7e", marginBottom: 8 }}>Owner</div>
                    <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} style={{ width: "100%", background: "#fff", border: "1px solid #d8d4c6", borderRadius: 7, padding: "9px 10px", fontSize: 13, fontFamily: "inherit", color: "#2a2a26", outline: "none", cursor: "pointer", marginBottom: 12 }}>
                      <option value="all">All owners</option>
                      {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <button onClick={() => { setFilterOwner("all"); setFilterOpen(false); }} style={{ width: "100%", border: "1px solid #d8d4c6", background: "#fff", color: "#585850", borderRadius: 7, padding: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear filters</button>
                  </div>
                </>
              ) : null}
            </div>

            {/* page ⋯ menu */}
            <div style={{ position: "relative" }}>
              <button onClick={() => { setPageMenuOpen((o) => !o); setFilterOpen(false); }} aria-label="Page actions" style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid #d8d4c6", background: "#fff", color: "#585850", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Icon name="MoreHorizontal" size={18} color="#585850" />
              </button>
              {pageMenuOpen ? (
                <>
                  <div onClick={() => setPageMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 198, background: "#fff", border: "1px solid #e4e1d5", borderRadius: 10, boxShadow: "0 12px 34px rgba(42,42,38,.16)", padding: 5, zIndex: 60 }}>
                    {pageMenuItems.map((mi) => (
                      <button key={mi.label} onClick={mi.onClick} disabled={pending} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 7, padding: "8px 10px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "#404040" }}>
                        <Icon name={mi.icon} size={15} color="#525252" /><span>{mi.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* section bar */}
      <div style={{ display: "flex", gap: 4, padding: 6, background: "#3a4d3f", borderRadius: 12, marginBottom: 22 }}>
        {SECTIONS.map((s) => {
          const on = section === s.key;
          return (
            <button key={s.key} onClick={() => setSection(s.key)} style={{ ...secTabBase, background: on ? "#f3f1e8" : "transparent", color: on ? "#2a2a26" : "rgba(255,255,255,.82)" }}>
              <Icon name={s.icon} size={17} color={on ? "#3a4d3f" : "rgba(255,255,255,.82)"} /><span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {section === "dashboard" ? (
        <WorkshopDashboard data={dashboard} upcoming={upcoming} onViewAll={() => setSection("workshops")} />
      ) : section === "templates" ? (
        <TemplatesClient items={templateVMs} canManage={canManage} embedded newSignal={newTemplateSignal} />
      ) : (
        <WorkshopHome
          teamId={teamId}
          canManage={canManage}
          workshops={workshops}
          recommendation={recommendation}
          scienceByCategory={scienceByCategory}
          view={section === "board" ? "board" : "list"}
          filterOwner={filterOwner}
          onNew={() => setNewOpen(true)}
          onFlash={flash}
        />
      )}

      <NewWorkshopWindow
        open={newOpen}
        onClose={() => setNewOpen(false)}
        teamId={teamId}
        templates={templates}
        surveyInsts={surveyInsts}
        teamOptions={teamOptions}
        assessOptions={assessOptions}
        onFlash={flash}
      />

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
