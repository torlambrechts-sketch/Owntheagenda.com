"use client";

import { useState } from "react";
import { SessionsTable, type SessionRow } from "./SessionsTable";
import { CanvasGallery, type GalleryItem } from "./CanvasGallery";
import { WorkshopHome } from "./WorkshopHome";

type WkTab = "workshops" | "sessions" | "canvas";

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

export function WorkshopsClient({
  teamId,
  canManage,
  templates,
  workshops,
  recommendation,
  surveyInsts = [],
  scienceByCategory = {},
  sessions = [],
  canvasItems = [],
  initialTab = "workshops",
  kpis = [],
  teamOptions = [],
}: {
  teamId: string;
  canManage: boolean;
  templates: TemplateCard[];
  workshops: WorkshopRow[];
  recommendation: Recommendation | null;
  surveyInsts?: { kind: string; name: string }[];
  scienceByCategory?: Record<string, string>;
  sessions?: SessionRow[];
  canvasItems?: GalleryItem[];
  initialTab?: WkTab;
  kpis?: { label: string; value: string; sub: string }[];
  teamOptions?: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<WkTab>(initialTab);

  return (
    <>
      <div className="wtabs">
        <button className={`wtab${tab === "workshops" ? " on" : ""}`} onClick={() => setTab("workshops")}>Workshops <span className="wtab-n">{workshops.length}</span></button>
        <button className={`wtab${tab === "sessions" ? " on" : ""}`} onClick={() => setTab("sessions")}>Sessions <span className="wtab-n">{sessions.length}</span></button>
        <button className={`wtab${tab === "canvas" ? " on" : ""}`} onClick={() => setTab("canvas")}>Canvas <span className="wtab-n">{canvasItems.length}</span></button>
      </div>

      {tab === "workshops" ? (
        <WorkshopHome
          teamId={teamId}
          canManage={canManage}
          templates={templates}
          workshops={workshops}
          recommendation={recommendation}
          surveyInsts={surveyInsts}
          scienceByCategory={scienceByCategory}
          kpis={kpis}
          teamOptions={teamOptions}
        />
      ) : tab === "sessions" ? (
        sessions.length ? <SessionsTable rows={sessions} /> : <div className="empty">No sessions yet — start a workshop to run your first.</div>
      ) : (
        <CanvasGallery items={canvasItems} />
      )}
    </>
  );
}
