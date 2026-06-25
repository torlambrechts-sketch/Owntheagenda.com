"use client";

import { useState } from "react";
import { WorkshopHome } from "./WorkshopHome";
import { TemplatesClient, type TemplateVM } from "./templates/TemplatesClient";

type WkTab = "workshops" | "templates";

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

export function WorkshopsClient({
  teamId,
  canManage,
  templates,
  workshops,
  recommendation,
  surveyInsts = [],
  scienceByCategory = {},
  templateVMs = [],
  initialTab = "workshops",
  kpis = [],
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
  initialTab?: WkTab;
  kpis?: { label: string; value: string; sub: string }[];
  teamOptions?: { id: string; name: string }[];
  assessOptions?: AssessOption[];
}) {
  const [tab, setTab] = useState<WkTab>(initialTab);

  return (
    <>
      <div className="wtabs">
        <button className={`wtab${tab === "workshops" ? " on" : ""}`} onClick={() => setTab("workshops")}>Workshops <span className="wtab-n">{workshops.length}</span></button>
        <button className={`wtab${tab === "templates" ? " on" : ""}`} onClick={() => setTab("templates")}>Templates <span className="wtab-n">{templateVMs.length}</span></button>
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
          assessOptions={assessOptions}
        />
      ) : (
        <TemplatesClient items={templateVMs} canManage={canManage} />
      )}
    </>
  );
}
