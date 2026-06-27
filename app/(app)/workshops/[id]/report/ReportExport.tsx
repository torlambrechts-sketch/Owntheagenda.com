"use client";

import { Icon } from "../../visuals";

// The design's "Export" affordance on the outcome report. Browser print →
// "Save as PDF" is the pragmatic, dependency-free export for a server-rendered
// document; the print stylesheet hides the app chrome.
export function ReportExport() {
  return (
    <button
      onClick={() => window.print()}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#3a4d3f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
    >
      <Icon name="ArrowRight" size={15} color="#fff" /> Export
    </button>
  );
}
