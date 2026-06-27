import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { getFramework } from "@/lib/frameworks";
import { FrameworkIcon } from "@/components/FrameworkIcon";

// Framework detail (handoff 2) — the science behind one instrument: overview,
// dimensions, psychometric validity, how we use it, an interpretation guide,
// and the items respondents see. All derived from the instrument definition.
export default async function FrameworkDetailPage({ params }: { params: { key: string } }) {
  const ctx = await requireSession();
  const admin = isAdmin(ctx.role);
  const f = await getFramework(decodeURIComponent(params.key));
  if (!f) notFound();

  return (
    <>
      <Link href="/assessments/frameworks" className="linkbtn" style={{ fontSize: 12 }}>‹ All frameworks</Link>

      {/* hero */}
      <div className="fw-hero" style={{ marginTop: 8 }}>
        <span className="fw-hero-ic" style={{ background: f.accentBg, color: f.accent }}><FrameworkIcon icon={f.iconKey} size={26} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="a-pt" style={{ margin: 0 }}>{f.title}</h1>
            <span className="pill sm interview">{f.categoryLabel}</span>
          </div>
          <div className="fw-hero-tag">{f.tagline}</div>
          <div className="fw-hero-src">{f.source}</div>
        </div>
        <div className="a-pr">
          {admin ? <Link className="btn-sec" href={`/assessments/builder?use=${encodeURIComponent(f.key)}`}>Build from this</Link> : null}
          <Link className="btn-prim" href={`/assessments?compose=${encodeURIComponent(f.key)}`}>＋ Use this framework</Link>
        </div>
      </div>

      <div className="fw-detailgrid">
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* the science */}
          <div className="a-ovcard">
            <h3>The science</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink)", margin: 0 }}>{f.overview}</p>
          </div>

          {/* dimensions measured */}
          <div className="tbl-card">
            <div className="as-qgroup" style={{ textTransform: "none", letterSpacing: 0 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Dimensions measured</span>
              <span className="n" style={{ marginLeft: "auto" }}>{f.dimCount}</span>
            </div>
            {f.dims.map((d, i) => (
              <div className="fw-dimrow" key={i}>
                <span className="fw-dimnum" style={{ background: f.accentBg, color: f.accent }}>{i + 1}</span>
                <div>
                  <div className="fw-dimname">{d.n}</div>
                  {d.d ? <div className="fw-dimblurb">{d.d}</div> : null}
                </div>
              </div>
            ))}
          </div>

          {/* questions & sections */}
          <div className="tbl-card">
            <div className="as-qgroup" style={{ textTransform: "none", letterSpacing: 0 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Questions &amp; sections</span>
            </div>
            <div className="fw-itemnote">All items use a {f.scale.min}–{f.scale.max} scale unless noted · reverse items are re-scored so higher always means better.</div>
            {f.sections.map((s) => (
              <div key={s.name}>
                <div className="as-qgroup"><span>{s.name}</span><span className="n">{s.items.length}</span></div>
                {s.why ? <div className="fw-why">{s.why}</div> : null}
                {s.items.map((it) => (
                  <div className="as-qrow" key={it.n}>
                    <span className="as-qn">{it.n}</span>
                    <span style={{ flex: 1 }}>{it.text}</span>
                    {it.reverse ? <span className="pill sm draft" title="Reverse-scored">Reverse</span> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* right rail */}
        <aside className="a-rail">
          <div className="a-ovcard">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Psychometric validity</div>
            <div className="a-facts">
              <div className="a-fact"><span className="k">Items</span><span className="v">{f.validity.items}</span></div>
              <div className="a-fact"><span className="k">Scale</span><span className="v">{f.validity.scale}</span></div>
              <div className="a-fact"><span className="k">Reliability</span><span className="v">{f.validity.alpha}</span></div>
            </div>
            <div className="fw-evidence">
              <div className="fw-evidence-h">Validity evidence</div>
              <p>{f.validity.evidence}</p>
              <div className="fw-evidence-h" style={{ marginTop: 10 }}>Scientific basis</div>
              <p>{f.validity.basis}</p>
            </div>
          </div>

          <div className="a-ovcard">
            <div className="eyebrow" style={{ marginBottom: 10 }}>How we use it</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)", margin: 0 }}>{f.application}</p>
          </div>

          <div className="a-ovcard">
            <div className="eyebrow" style={{ marginBottom: 12 }}>How to read the results</div>
            <div className="fw-guide">
              {f.guide.map((g, i) => (
                <div className="fw-guide-row" key={i}>
                  <span className="fw-guide-n">{i + 1}</span>
                  <div><div className="fw-guide-t">{g.t}</div><div className="fw-guide-d">{g.d}</div></div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
