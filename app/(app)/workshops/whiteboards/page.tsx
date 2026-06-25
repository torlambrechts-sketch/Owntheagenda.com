import { requireSession } from "@/lib/workspace";

// Whiteboards section landing. The full gallery + canvas editor + export ship in
// a later phase of the workshop-engine rewrite; this placeholder keeps the new
// nav item live without 404-ing in the interim.
export default async function WhiteboardsIndex() {
  await requireSession();
  return (
    <div>
      <h1 className="page-title">Whiteboards</h1>
      <p className="page-sub">
        Infinite canvases for thinking together — sticky storms, mind maps, flows and matrices.
        The same engine powers the canvas block inside workshops.
      </p>
      <div className="card empty" style={{ marginTop: 18 }}>
        Whiteboards are coming together — the board gallery and editor land shortly.
      </div>
    </div>
  );
}
