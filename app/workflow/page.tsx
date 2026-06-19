"use client";

import { useState } from "react";

const CSS = `
:root{
  --shell:#4b6153;
  --shell-rail:#3f5548;
  --workspace:#ede9dd;
  --surface:#f7f4ec;
  --card:#fbfaf7;
  --text:#232a24;
  --muted:#767b74;
  --line:#dfd9cb;
  --accent:#4b7d5d;
  --red:#d65b4b;
  --amber:#e6b14f;
  --green:#4d8a5d;
  --blue:#5c7695;
  --shadow:0 1px 2px rgba(30,35,30,.05),0 14px 30px rgba(30,35,30,.08);
  --fd:"Libre Baskerville", Georgia, serif;
  --fu:"Inter", system-ui, -apple-system, sans-serif;
}
.wf-root *{box-sizing:border-box}
.wf-root{min-height:100vh;background:var(--workspace);font:14px/1.5 var(--fu);color:var(--text)}
.wf-root h1,.wf-root h2,.wf-root h3,.wf-root h4,.wf-root p{margin:0}
.wf-root button,.wf-root input,.wf-root select,.wf-root textarea{font:inherit}
.wf-root .layout{display:grid;grid-template-columns:72px 228px 1fr;min-height:100vh}
.wf-root .rail{background:var(--shell-rail);padding:16px 0;display:flex;flex-direction:column;align-items:center;gap:14px}
.wf-root .logo{width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,#ffc46b 0,#ffc46b 45%,#df6b5c 45%,#df6b5c 75%,#f7f2e6 75%);margin-bottom:10px}
.wf-root .railbtn{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#d8e0d9;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);font-size:18px}
.wf-root .railbtn.active{background:#566d60}
.wf-root .sidebar{background:var(--shell);color:#e7ece7;padding:18px 14px;border-right:1px solid rgba(255,255,255,.08)}
.wf-root .side-title{display:flex;justify-content:space-between;align-items:center;padding:2px 8px 16px;font-weight:800;font-size:18px}
.wf-root .side-section{margin-top:10px}
.wf-root .side-item{display:flex;align-items:center;justify-content:space-between;padding:11px 10px;border-radius:10px;color:#f1f4f1;font-size:13px;font-weight:600}
.wf-root .side-sub{margin-left:22px;padding-left:18px;border-left:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:2px}
.wf-root .side-sub a{padding:8px 0;color:#d4ddd5;text-decoration:none;font-size:12.5px}
.wf-root .main{background:var(--workspace)}
.wf-root .topbar{height:56px;display:flex;align-items:center;padding:0 22px;border-bottom:1px solid #e1dccf;background:rgba(247,244,236,.72)}
.wf-root .crumbs{font-size:13px;color:var(--muted)}
.wf-root .topright{margin-left:auto;display:flex;align-items:center;gap:22px;color:var(--muted);font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.wf-root .avatar{width:44px;height:44px;border-radius:50%;background:#4c6355;color:#fff;display:flex;align-items:center;justify-content:center;letter-spacing:.03em}
.wf-root .workspace{padding:24px 24px 32px}
.wf-root .hero{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);padding:28px 42px 22px}
.wf-root .hero-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.wf-root .back{font-size:13px;color:#555d55;text-decoration:underline}
.wf-root .hero h1{font:700 28px/1.2 var(--fd);margin-top:12px}
.wf-root .hero p{margin-top:8px;color:var(--muted);font-size:13px;max-width:900px}
.wf-root .hero-actions{display:flex;align-items:center;gap:12px;margin-top:18px}
.wf-root .btn{padding:12px 16px;border:1px solid var(--line);background:#fff;font-weight:800;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#565d55;cursor:pointer}
.wf-root .btn.primary{background:#4f6558;color:#fff;border-color:#4f6558}
.wf-root .dots{font-size:28px;color:#8b9188;line-height:1}
.wf-root .top-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
.wf-root .top-tab{padding:10px 14px;border:1px solid var(--line);background:#fff;color:#596057;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.wf-root .top-tab.active{background:#dfe8e1;border-color:#dfe8e1;color:#294437}
.wf-root .panel{background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);margin-top:18px}
.wf-root .panel-h{padding:18px 22px;border-bottom:1px solid var(--line)}
.wf-root .panel-title{font:700 20px var(--fd)}
.wf-root .panel-sub{margin-top:5px;color:var(--muted);font-size:12.5px}
.wf-root .panel-b{padding:20px 22px}
.wf-root .stage-flow{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
.wf-root .stage{background:#fff;border:1px solid var(--line);padding:16px;border-top:4px solid var(--accent);min-height:210px}
.wf-root .stage .num{width:26px;height:26px;border-radius:50%;background:#e7efe9;color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
.wf-root .stage h3{margin-top:12px;font-size:15px;font-weight:800}
.wf-root .stage p{margin-top:8px;color:var(--muted);font-size:13px}
.wf-root .tag{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-weight:700;font-size:11px;margin-top:10px}
.wf-root .tag.green{background:#e8f1ea;color:#39684f}
.wf-root .tag.amber{background:#f7efd2;color:#8a6b16}
.wf-root .tag.blue{background:#ebf0f7;color:#3d6791}
.wf-root .grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.wf-root .form-card{background:#fff;border:1px solid var(--line)}
.wf-root .form-h{padding:16px 18px;border-bottom:1px solid var(--line)}
.wf-root .form-title{font:700 17px var(--fd)}
.wf-root .form-sub{margin-top:4px;color:var(--muted);font-size:12px}
.wf-root .form-b{padding:18px}
.wf-root .fields{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.wf-root .field{background:#fff;border:1px solid var(--line);padding:10px 12px}
.wf-root .field label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.45px;color:#969b90;font-weight:800;margin-bottom:6px}
.wf-root .field input,.wf-root .field select,.wf-root .field textarea{width:100%;border:none;outline:none;background:transparent;color:var(--text)}
.wf-root .field.full{grid-column:1 / -1}
.wf-root .field textarea{min-height:98px;resize:vertical}
.wf-root .table{border:1px solid var(--line)}
.wf-root .th,.wf-root .tr{display:grid;gap:10px;align-items:center;padding:11px 12px}
.wf-root .th{background:#fbfaf6;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;font-weight:800;color:#8d9488;border-bottom:1px solid var(--line)}
.wf-root .tr{border-bottom:1px solid var(--line);font-size:12.5px}
.wf-root .tr:last-child{border-bottom:none}
.wf-root .helper{padding:12px 14px;background:#f8faf8;border-left:4px solid var(--accent);font-size:13px}
.wf-root .warn{padding:12px 14px;background:#fcf4f1;border-left:4px solid var(--red);font-size:13px}
.wf-root .checks{display:flex;flex-direction:column;gap:10px}
.wf-root .check{display:flex;gap:10px;align-items:flex-start;font-size:13px}
.wf-root .bullet{width:18px;height:18px;border-radius:50%;background:#e8f1ea;color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;flex:0 0 18px;margin-top:2px}
.wf-root .footer-actions{display:flex;justify-content:space-between;align-items:center;margin-top:18px}
.wf-root .hidden{display:none}
@media (max-width:1320px){.wf-root .layout{grid-template-columns:72px 1fr}.wf-root .sidebar{display:none}.wf-root .stage-flow,.wf-root .grid2,.wf-root .fields{grid-template-columns:1fr 1fr}}
@media (max-width:860px){.wf-root .stage-flow,.wf-root .grid2,.wf-root .fields{grid-template-columns:1fr}.wf-root .hero-head{flex-direction:column}.wf-root .topright{display:none}}
@media (max-width:640px){.wf-root .workspace{padding:14px}.wf-root .hero{padding:20px}.wf-root .th,.wf-root .tr{grid-template-columns:1fr!important}}
`;

type Tab = "workflow" | "assessment" | "workshop";

export default function WorkflowPage() {
  const [tab, setTab] = useState<Tab>("workflow");

  return (
    <div className="wf-root">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=Inter:wght@400;500;600;700;800&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="layout">
        <aside className="rail">
          <div className="logo" />
          <div className="railbtn active">⌕</div>
          <div className="railbtn">☑</div>
          <div className="railbtn">📁</div>
          <div className="railbtn">⚙</div>
        </aside>

        <aside className="sidebar">
          <div className="side-title">
            <span>Assessment</span>
            <span>‹</span>
          </div>
          <div className="side-section">
            <div className="side-item">
              <span>Dashboard</span>
            </div>
          </div>
          <div className="side-section">
            <div className="side-item">
              <span>Assessments</span>
              <span>⌃</span>
            </div>
            <div className="side-sub">
              <a href="#">Pulse library</a>
              <a href="#">New assessment</a>
              <a href="#">Manage cycles</a>
            </div>
          </div>
          <div className="side-section">
            <div className="side-item">
              <span>Workshops</span>
              <span>⌃</span>
            </div>
            <div className="side-sub">
              <a href="#">Workshop hub</a>
              <a href="#">New workshop</a>
              <a href="#">Facilitator notes</a>
            </div>
          </div>
          <div className="side-section">
            <div className="side-item">
              <span>Insights</span>
              <span>⌃</span>
            </div>
            <div className="side-sub">
              <a href="#">Leadership teams</a>
              <a href="#">Trends</a>
              <a href="#">Reports</a>
            </div>
          </div>
          <div className="side-section">
            <div className="side-item">
              <span>Settings</span>
              <span>⌃</span>
            </div>
            <div className="side-sub">
              <a href="#">Templates</a>
              <a href="#">Scoring models</a>
              <a href="#">Integrations</a>
            </div>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div className="crumbs">Insights → Builder Hub</div>
            <div className="topright">
              <span>The Conscia Corporation</span>
              <span>☑</span>
              <span>🔔</span>
              <div className="avatar">TL</div>
            </div>
          </div>

          <div className="workspace">
            <section className="hero">
              <div className="hero-head">
                <div>
                  <a className="back" href="#">
                    Back to builder hub
                  </a>
                  <h1>Workflow and builders</h1>
                  <p>
                    A full-page enterprise-dashboard view showing the workflow,
                    the assessment builder, and the workshop builder as separate
                    work surfaces. This version removes the browser-frame
                    presentation and makes the interface feel like a real
                    product page.
                  </p>
                </div>
                <div>
                  <div className="hero-actions">
                    <button className="btn">Edit layout</button>
                    <button className="btn primary">Save draft</button>
                    <div className="dots">…</div>
                  </div>
                </div>
              </div>
              <div className="top-tabs">
                <button
                  className={`top-tab${tab === "workflow" ? " active" : ""}`}
                  onClick={() => setTab("workflow")}
                >
                  Workflow
                </button>
                <button
                  className={`top-tab${tab === "assessment" ? " active" : ""}`}
                  onClick={() => setTab("assessment")}
                >
                  Assessment builder
                </button>
                <button
                  className={`top-tab${tab === "workshop" ? " active" : ""}`}
                  onClick={() => setTab("workshop")}
                >
                  Workshop builder
                </button>
              </div>
            </section>

            <section
              className={`panel${tab === "workflow" ? "" : " hidden"}`}
              id="tab-workflow"
            >
              <div className="panel-h">
                <div className="panel-title">Workflow</div>
                <div className="panel-sub">
                  A cleaner operating model from creating an assessment through
                  to workshop, action tracking and reassessment.
                </div>
              </div>
              <div className="panel-b">
                <div className="stage-flow">
                  <div className="stage">
                    <div className="num">1</div>
                    <h3>Create assessment</h3>
                    <p>
                      Select the assessment template, define audience, privacy
                      and scoring rules, and prepare the pulse for launch.
                    </p>
                    <span className="tag green">Builder step</span>
                  </div>
                  <div className="stage">
                    <div className="num">2</div>
                    <h3>Launch and collect</h3>
                    <p>
                      Invite the leadership group, track response rate and hold
                      publication until the minimum threshold is met.
                    </p>
                    <span className="tag amber">Status gate</span>
                  </div>
                  <div className="stage">
                    <div className="num">3</div>
                    <h3>Interpret results</h3>
                    <p>
                      Turn the pulse into strengths, risk areas and a clear
                      recommendation for the next intervention.
                    </p>
                    <span className="tag blue">Insight step</span>
                  </div>
                  <div className="stage">
                    <div className="num">4</div>
                    <h3>Create workshop</h3>
                    <p>
                      Use the linked workshop builder to generate a session with
                      agenda, facilitation prompts and expected outputs.
                    </p>
                    <span className="tag green">Builder step</span>
                  </div>
                  <div className="stage">
                    <div className="num">5</div>
                    <h3>Run and commit</h3>
                    <p>
                      Facilitate the session, agree visible behaviour changes
                      and assign owners, evidence and review timing.
                    </p>
                    <span className="tag amber">Intervention</span>
                  </div>
                  <div className="stage">
                    <div className="num">6</div>
                    <h3>Track and re-pulse</h3>
                    <p>
                      Review progress at the next checkpoint and repeat the
                      pulse to check whether the agreed changes are visible.
                    </p>
                    <span className="tag blue">Loop closure</span>
                  </div>
                </div>
                <div style={{ height: 18 }} />
                <div className="grid2">
                  <div className="helper">
                    <b>Design intent:</b> the workflow tab is not a builder. It
                    gives the operating model and shows where each builder fits
                    without forcing all details onto one page.
                  </div>
                  <div className="warn">
                    <b>Guardrail:</b> results are shown only when the response
                    threshold is met and the output remains aggregate-only for
                    leadership-team use.
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`panel${tab === "assessment" ? "" : " hidden"}`}
              id="tab-assessment"
            >
              <div className="panel-h">
                <div className="panel-title">Assessment builder</div>
                <div className="panel-sub">
                  Dedicated tab for creating and configuring the pulse, without
                  mixing workflow or workshop content into the same surface.
                </div>
              </div>
              <div className="panel-b">
                <div className="grid2">
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Core setup</div>
                      <div className="form-sub">
                        Define assessment identity and usage context
                      </div>
                    </div>
                    <div className="form-b">
                      <div className="fields">
                        <div className="field">
                          <label>Assessment name</label>
                          <input defaultValue="Leadership Group Psychological Safety Pulse" />
                        </div>
                        <div className="field">
                          <label>Template</label>
                          <select>
                            <option>Psychological Safety · 7-item core scale</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Audience</label>
                          <select>
                            <option>Leadership Team Norway</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Purpose</label>
                          <select>
                            <option>Team development + workshop pre-work</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Cycle</label>
                          <select>
                            <option>FY26 Q4</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Estimated time</label>
                          <input defaultValue="5–6 minutes" />
                        </div>
                        <div className="field full">
                          <label>Assessment description</label>
                          <textarea defaultValue="Short leadership-team pulse to understand whether the environment is safe enough for challenge, candour, help-seeking and speaking up before decisions close." />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Privacy and reporting</div>
                      <div className="form-sub">
                        Configure reporting logic and threshold rules
                      </div>
                    </div>
                    <div className="form-b">
                      <div className="fields">
                        <div className="field">
                          <label>Visibility</label>
                          <select>
                            <option>Aggregate only</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Minimum responses</label>
                          <select>
                            <option>5</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Comments</label>
                          <select>
                            <option>Optional · summarised only</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Scoring model</label>
                          <select>
                            <option>Average + reverse score logic</option>
                          </select>
                        </div>
                        <div className="field full">
                          <label>Publishing rule</label>
                          <textarea defaultValue="Do not publish any result view until the minimum threshold is met. Display management interpretation and intervention recommendation only at aggregate level." />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ height: 18 }} />
                <div className="grid2">
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Question configuration</div>
                      <div className="form-sub">Preview the pulse content</div>
                    </div>
                    <div className="form-b">
                      <div className="table">
                        <div
                          className="th"
                          style={{ gridTemplateColumns: "60px 1.5fr 120px" }}
                        >
                          <span>No.</span>
                          <span>Question</span>
                          <span>Scoring</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "60px 1.5fr 120px" }}
                        >
                          <span>1</span>
                          <span>
                            If you make a mistake on this team, it is often held
                            against you.
                          </span>
                          <span>Reverse</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "60px 1.5fr 120px" }}
                        >
                          <span>2</span>
                          <span>
                            Members of this team are able to bring up problems
                            and tough issues.
                          </span>
                          <span>Positive</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "60px 1.5fr 120px" }}
                        >
                          <span>3</span>
                          <span>
                            People on this team sometimes reject others for being
                            different.
                          </span>
                          <span>Reverse</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "60px 1.5fr 120px" }}
                        >
                          <span>4</span>
                          <span>It is safe to take a risk on this team.</span>
                          <span>Positive</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Launch and workflow link</div>
                      <div className="form-sub">
                        Connect the pulse to the intervention path
                      </div>
                    </div>
                    <div className="form-b">
                      <div className="checks">
                        <div className="check">
                          <span className="bullet">1</span>
                          <div>
                            <b>Auto-recommend workshop</b>
                            <div className="form-sub" style={{ marginTop: 2 }}>
                              Link low challenge behaviour to Trust in Action
                              workshop.
                            </div>
                          </div>
                        </div>
                        <div className="check">
                          <span className="bullet">2</span>
                          <div>
                            <b>Schedule reminder cadence</b>
                            <div className="form-sub" style={{ marginTop: 2 }}>
                              One reminder after 3 days, one final reminder before
                              close.
                            </div>
                          </div>
                        </div>
                        <div className="check">
                          <span className="bullet">3</span>
                          <div>
                            <b>Create reassessment placeholder</b>
                            <div className="form-sub" style={{ marginTop: 2 }}>
                              Hold a 30-day re-pulse slot so the loop is visible at
                              creation time.
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="footer-actions">
                        <button className="btn">Preview questions</button>
                        <button className="btn primary">Create assessment</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`panel${tab === "workshop" ? "" : " hidden"}`}
              id="tab-workshop"
            >
              <div className="panel-h">
                <div className="panel-title">Workshop builder</div>
                <div className="panel-sub">
                  Dedicated tab for creating the workshop independently, while
                  still connecting it to the selected assessment output.
                </div>
              </div>
              <div className="panel-b">
                <div className="grid2">
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Workshop definition</div>
                      <div className="form-sub">
                        Set the session structure and intended outcome
                      </div>
                    </div>
                    <div className="form-b">
                      <div className="fields">
                        <div className="field">
                          <label>Workshop name</label>
                          <input defaultValue="Trust in Action" />
                        </div>
                        <div className="field">
                          <label>Linked assessment</label>
                          <select>
                            <option>Leadership Group Psychological Safety Pulse</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Audience</label>
                          <select>
                            <option>Leadership Team Norway</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Duration</label>
                          <select>
                            <option>90 minutes</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Facilitator mode</label>
                          <select>
                            <option>Direct and reflective</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Output mode</label>
                          <select>
                            <option>Actions + reassessment</option>
                          </select>
                        </div>
                        <div className="field full">
                          <label>Workshop purpose</label>
                          <textarea defaultValue="Use the aggregate result to discuss what remains unsaid, why challenge may arrive too late, and what visible meeting behaviours should change over the next 30 days." />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Agenda stages</div>
                      <div className="form-sub">
                        Structured stages created in the builder
                      </div>
                    </div>
                    <div className="form-b">
                      <div className="table">
                        <div
                          className="th"
                          style={{ gridTemplateColumns: "70px 1fr 1fr" }}
                        >
                          <span>Stage</span>
                          <span>Purpose</span>
                          <span>Output</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "70px 1fr 1fr" }}
                        >
                          <span>01</span>
                          <span>Open, context and score framing</span>
                          <span>
                            Shared understanding of why the result is being used
                          </span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "70px 1fr 1fr" }}
                        >
                          <span>02</span>
                          <span>Review strengths and concern areas</span>
                          <span>Common view of current pattern</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "70px 1fr 1fr" }}
                        >
                          <span>03</span>
                          <span>Discuss challenge behaviour</span>
                          <span>Concrete examples and blockers</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "70px 1fr 1fr" }}
                        >
                          <span>04</span>
                          <span>Define behaviour changes</span>
                          <span>2–3 visible commitments</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "70px 1fr 1fr" }}
                        >
                          <span>05</span>
                          <span>Assign owners and evidence</span>
                          <span>Action tracker entries</span>
                        </div>
                        <div
                          className="tr"
                          style={{ gridTemplateColumns: "70px 1fr 1fr" }}
                        >
                          <span>06</span>
                          <span>Confirm checkpoint and re-pulse</span>
                          <span>Visible operating loop</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ height: 18 }} />
                <div className="grid2">
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Facilitator prompts</div>
                      <div className="form-sub">
                        What the builder carries into the live room
                      </div>
                    </div>
                    <div className="form-b">
                      <div className="checks">
                        <div className="check">
                          <span className="bullet">1</span>
                          <div>
                            <b>Opening script</b>
                            <div className="form-sub" style={{ marginTop: 2 }}>
                              “This result is a team-learning input, not a verdict
                              on any individual.”
                            </div>
                          </div>
                        </div>
                        <div className="check">
                          <span className="bullet">2</span>
                          <div>
                            <b>Reflection prompt</b>
                            <div className="form-sub" style={{ marginTop: 2 }}>
                              What feels recognisable, and what remains unsaid in
                              this leadership group?
                            </div>
                          </div>
                        </div>
                        <div className="check">
                          <span className="bullet">3</span>
                          <div>
                            <b>Intervention prompt</b>
                            <div className="form-sub" style={{ marginTop: 2 }}>
                              If the room goes quiet, switch to silent writing
                              before plenary discussion.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-card">
                    <div className="form-h">
                      <div className="form-title">Workshop outputs</div>
                      <div className="form-sub">
                        What the builder should create after save
                      </div>
                    </div>
                    <div className="form-b">
                      <div className="helper">
                        <b>Builder outcome:</b> create workshop agenda, attach
                        facilitator guidance, prepare post-workshop summary
                        template, and create placeholder action tracker entries
                        for owner-based follow-up.
                      </div>
                      <div style={{ height: 14 }} />
                      <div className="warn">
                        <b>Recommendation:</b> keep workshop creation separate
                        from assessment creation so each task remains
                        professionally scoped and easier to use.
                      </div>
                      <div className="footer-actions">
                        <button className="btn">Preview workshop</button>
                        <button className="btn primary">Create workshop</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
