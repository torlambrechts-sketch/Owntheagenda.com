"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SideWindow } from "@/components/SideWindow";
import { Markdown } from "@/lib/markdown";
import {
  saveArticle,
  deleteArticle,
  setArticleStatus,
  saveFaq,
  deleteFaq,
  setFaqStatus,
  type ArticleInput,
  type FaqInput,
} from "./actions";

export type MArticle = {
  id: string;
  kind: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  topic_key: string | null;
  icon: string | null;
  sort: number;
  status: string;
  body: string;
};
export type MFaq = { id: string; question: string; answer: string; category: string; sort: number; status: string };

const BLANK_ARTICLE: ArticleInput = { kind: "guide", slug: "", title: "", summary: "", category: "general", topic_key: "", icon: "", sort: 0, status: "draft", body: "" };
const BLANK_FAQ: FaqInput = { question: "", answer: "", category: "general", sort: 0, status: "draft" };

export function ManageClient({ articles, faqs }: { articles: MArticle[]; faqs: MFaq[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"articles" | "faq">("articles");
  const [toast, setToast] = useState<string | null>(null);

  const [aForm, setAForm] = useState<ArticleInput | null>(null);
  const [fForm, setFForm] = useState<FaqInput | null>(null);
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  function editArticle(a?: MArticle) {
    setErr(null);
    setPreview(false);
    setAForm(a
      ? { id: a.id, kind: a.kind, slug: a.slug, title: a.title, summary: a.summary ?? "", category: a.category, topic_key: a.topic_key ?? "", icon: a.icon ?? "", sort: a.sort, status: a.status, body: a.body }
      : { ...BLANK_ARTICLE });
  }
  function editFaq(f?: MFaq) {
    setErr(null);
    setFForm(f ? { id: f.id, question: f.question, answer: f.answer, category: f.category, sort: f.sort, status: f.status } : { ...BLANK_FAQ });
  }

  async function submitArticle() {
    if (!aForm) return;
    setErr(null);
    const res = await saveArticle(aForm);
    if (res.error) { setErr(res.error); return; }
    setAForm(null);
    flash("Saved");
    router.refresh();
  }
  async function submitFaq() {
    if (!fForm) return;
    setErr(null);
    const res = await saveFaq(fForm);
    if (res.error) { setErr(res.error); return; }
    setFForm(null);
    flash("Saved");
    router.refresh();
  }

  function toggleArticle(a: MArticle) {
    start(async () => {
      const res = await setArticleStatus(a.id, a.status === "published" ? "draft" : "published");
      if (res.error) flash(res.error); else { flash(a.status === "published" ? "Unpublished" : "Published"); router.refresh(); }
    });
  }
  function toggleFaq(f: MFaq) {
    start(async () => {
      const res = await setFaqStatus(f.id, f.status === "published" ? "draft" : "published");
      if (res.error) flash(res.error); else { flash(f.status === "published" ? "Unpublished" : "Published"); router.refresh(); }
    });
  }
  function removeArticle(a: MArticle) {
    if (!confirm(`Delete "${a.title}"? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteArticle(a.id);
      if (res.error) flash(res.error); else { flash("Deleted"); router.refresh(); }
    });
  }
  function removeFaq(f: MFaq) {
    if (!confirm("Delete this FAQ?")) return;
    start(async () => {
      const res = await deleteFaq(f.id);
      if (res.error) flash(res.error); else { flash("Deleted"); router.refresh(); }
    });
  }

  function statusPill(s: string) {
    return <span className={`pill sm ${s === "published" ? "open" : "draft"}`}>{s}</span>;
  }

  return (
    <div>
      <div className="segbar" style={{ marginBottom: 18 }}>
        <button className={`seg${tab === "articles" ? " on" : ""}`} onClick={() => setTab("articles")}>Articles <span className="sn">{articles.length}</span></button>
        <button className={`seg${tab === "faq" ? " on" : ""}`} onClick={() => setTab("faq")}>FAQ <span className="sn">{faqs.length}</span></button>
      </div>

      {tab === "articles" ? (
        <>
          <div className="summary"><div className="actions"><button className="btn-prim" onClick={() => editArticle()}>New article</button></div></div>
          <div className="tbl-card">
            <table className="tbl">
              <thead><tr><th>Title</th><th style={{ width: 90 }}>Kind</th><th style={{ width: 100 }}>Status</th><th style={{ width: 190 }} /></tr></thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.title}</b><small style={{ display: "block", color: "var(--muted)" }}>/{a.slug}{a.topic_key ? ` · ${a.topic_key}` : ""}</small></td>
                    <td style={{ textTransform: "capitalize" }}>{a.kind}</td>
                    <td>{statusPill(a.status)}</td>
                    <td className="r"><div className="row-acts">
                      <button className="linkbtn xs" disabled={pending} onClick={() => toggleArticle(a)}>{a.status === "published" ? "Unpublish" : "Publish"}</button>
                      <button className="linkbtn xs" onClick={() => editArticle(a)}>Edit</button>
                      <button className="linkbtn xs danger" disabled={pending} onClick={() => removeArticle(a)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="summary"><div className="actions"><button className="btn-prim" onClick={() => editFaq()}>New FAQ</button></div></div>
          <div className="tbl-card">
            <table className="tbl">
              <thead><tr><th>Question</th><th style={{ width: 100 }}>Status</th><th style={{ width: 190 }} /></tr></thead>
              <tbody>
                {faqs.map((f) => (
                  <tr key={f.id}>
                    <td>{f.question}<small style={{ display: "block", color: "var(--muted)" }}>{f.category}</small></td>
                    <td>{statusPill(f.status)}</td>
                    <td className="r"><div className="row-acts">
                      <button className="linkbtn xs" disabled={pending} onClick={() => toggleFaq(f)}>{f.status === "published" ? "Unpublish" : "Publish"}</button>
                      <button className="linkbtn xs" onClick={() => editFaq(f)}>Edit</button>
                      <button className="linkbtn xs danger" disabled={pending} onClick={() => removeFaq(f)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Article editor */}
      <SideWindow
        open={!!aForm}
        onClose={() => setAForm(null)}
        title={aForm?.id ? "Edit article" : "New article"}
        subtitle="Markdown supported in the body"
        footer={
          <>
            <button className="btn-sec" onClick={() => setAForm(null)}>Cancel</button>
            <div className="right"><button className="btn-prim" disabled={!aForm?.title.trim() || !aForm?.slug.trim()} onClick={submitArticle}>Save</button></div>
          </>
        }
      >
        {aForm ? (
          <>
            {err ? <div className="form-err">{err}</div> : null}
            <div className="grid2">
              <div className="field"><label>Kind</label>
                <select className="inp" value={aForm.kind} onChange={(e) => setAForm({ ...aForm, kind: e.target.value })}>
                  <option value="guide">Guide</option><option value="science">Science</option>
                </select>
              </div>
              <div className="field"><label>Status</label>
                <select className="inp" value={aForm.status} onChange={(e) => setAForm({ ...aForm, status: e.target.value })}>
                  <option value="draft">Draft</option><option value="published">Published</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Title</label><input className="inp" value={aForm.title} onChange={(e) => setAForm({ ...aForm, title: e.target.value })} /></div>
            <div className="field"><label>Slug</label><input className="inp" value={aForm.slug} onChange={(e) => setAForm({ ...aForm, slug: e.target.value })} placeholder="lowercase-with-hyphens" /></div>
            <div className="field"><label>Summary</label><input className="inp" value={aForm.summary} onChange={(e) => setAForm({ ...aForm, summary: e.target.value })} /></div>
            <div className="grid2">
              <div className="field"><label>Category</label><input className="inp" value={aForm.category} onChange={(e) => setAForm({ ...aForm, category: e.target.value })} /></div>
              <div className="field"><label>Sort</label><input className="inp" type="number" value={aForm.sort} onChange={(e) => setAForm({ ...aForm, sort: Number(e.target.value) })} /></div>
            </div>
            <div className="field"><label>Topic key <span className="opt">(deep-link, e.g. dynamic:trust)</span></label><input className="inp" value={aForm.topic_key} onChange={(e) => setAForm({ ...aForm, topic_key: e.target.value })} /></div>
            <div className="field">
              <label style={{ display: "flex", justifyContent: "space-between" }}>
                Body
                <button type="button" className="linkbtn xs" onClick={() => setPreview((p) => !p)}>{preview ? "Edit" : "Preview"}</button>
              </label>
              {preview ? <div className="md-preview"><Markdown>{aForm.body}</Markdown></div>
                : <textarea className="inp mono" rows={14} value={aForm.body} onChange={(e) => setAForm({ ...aForm, body: e.target.value })} />}
            </div>
          </>
        ) : null}
      </SideWindow>

      {/* FAQ editor */}
      <SideWindow
        open={!!fForm}
        onClose={() => setFForm(null)}
        title={fForm?.id ? "Edit FAQ" : "New FAQ"}
        size="compact"
        footer={
          <>
            <button className="btn-sec" onClick={() => setFForm(null)}>Cancel</button>
            <div className="right"><button className="btn-prim" disabled={!fForm?.question.trim()} onClick={submitFaq}>Save</button></div>
          </>
        }
      >
        {fForm ? (
          <>
            {err ? <div className="form-err">{err}</div> : null}
            <div className="field"><label>Question</label><input className="inp" value={fForm.question} onChange={(e) => setFForm({ ...fForm, question: e.target.value })} /></div>
            <div className="field"><label>Answer <span className="opt">(markdown)</span></label><textarea className="inp" rows={6} value={fForm.answer} onChange={(e) => setFForm({ ...fForm, answer: e.target.value })} /></div>
            <div className="grid2">
              <div className="field"><label>Category</label><input className="inp" value={fForm.category} onChange={(e) => setFForm({ ...fForm, category: e.target.value })} /></div>
              <div className="field"><label>Status</label>
                <select className="inp" value={fForm.status} onChange={(e) => setFForm({ ...fForm, status: e.target.value })}>
                  <option value="draft">Draft</option><option value="published">Published</option>
                </select>
              </div>
            </div>
          </>
        ) : null}
      </SideWindow>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd0a3" strokeWidth="2.6"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast}</span>
      </div>
    </div>
  );
}
