import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { getFrameworks } from "@/lib/frameworks";
import { FrameworkIcon } from "@/components/FrameworkIcon";

// Frameworks — the "science" library (handoff 2). Every assessment instrument
// maps to a published, peer-reviewed framework. Data-driven from the catalog.
export default async function FrameworksPage() {
  await requireSession();
  const frameworks = await getFrameworks();

  return (
    <>
      <div className="a-phead">
        <div>
          <div className="a-pt">Frameworks</div>
          <div className="a-ps" style={{ maxWidth: 720 }}>
            Every assessment is grounded in a published, peer-reviewed framework — not invented rubrics. Each one below sets out the underlying science, its dimensions, and the psychometric evidence behind it, so feedback is defensible and developmental.
          </div>
        </div>
        <div className="a-pr">
          <Link className="btn-sec" href="/assessments">‹ Assessments</Link>
        </div>
      </div>

      <div className="fw-grid">
        {frameworks.map((f) => (
          <Link key={f.key} href={`/assessments/frameworks/${encodeURIComponent(f.key)}`} className="fw-card" style={{ borderLeftColor: f.accent }}>
            <div className="fw-card-h">
              <span className="fw-icon" style={{ background: f.accentBg, color: f.accent }}><FrameworkIcon icon={f.iconKey} size={18} /></span>
              <span className="pill sm interview">{f.categoryLabel}</span>
            </div>
            <div className="fw-card-title">{f.title}</div>
            <div className="fw-card-tag">{f.tagline}</div>
            <div className="fw-card-foot">
              <span className="fw-card-meta">{f.dimCount} dimensions</span>
              <span className="fw-card-meta">{f.validity.alpha}</span>
            </div>
            <div className="fw-card-src">{f.source}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
