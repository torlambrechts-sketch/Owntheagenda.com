"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Markdown } from "@/lib/markdown";

type Article = {
  kind: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  topic_key: string | null;
  icon: string | null;
  sort: number;
};
type Faq = { id: string; question: string; answer: string; category: string; sort: number };

export function HelpCenter({ articles, faqs }: { articles: Article[]; faqs: Faq[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const guides = articles.filter((a) => a.kind === "guide");
  const science = articles.filter((a) => a.kind === "science");
  const aHits = query ? articles.filter((a) => `${a.title} ${a.summary ?? ""} ${a.category}`.toLowerCase().includes(query)) : [];
  const fHits = query ? faqs.filter((f) => `${f.question} ${f.answer}`.toLowerCase().includes(query)) : [];
  const total = aHits.length + fHits.length;

  function card(a: Article) {
    return (
      <Link className="help-card" key={a.slug} href={`/help/${a.slug}`}>
        <span className={`pill sm ${a.kind === "science" ? "open" : "draft"}`}>{a.kind === "science" ? "Science" : "Guide"}</span>
        <b>{a.title}</b>
        <span className="hc-sum">{a.summary}</span>
      </Link>
    );
  }
  function faqItem(f: Faq) {
    return (
      <details className="faq-item" key={f.id}>
        <summary>{f.question}</summary>
        <div className="faq-a"><Markdown>{f.answer}</Markdown></div>
      </details>
    );
  }

  return (
    <div className="help">
      <div className="help-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" />
        </svg>
        <input
          className="inp"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search guides, science and FAQ…"
        />
      </div>

      {query ? (
        <div className="help-results">
          <div className="eyebrow" style={{ marginBottom: 12 }}>{total} result{total === 1 ? "" : "s"}</div>
          {aHits.length ? <div className="help-grid">{aHits.map(card)}</div> : null}
          {fHits.length ? <div className="faq-list" style={{ marginTop: aHits.length ? 14 : 0 }}>{fHits.map(faqItem)}</div> : null}
          {total === 0 ? <p style={{ color: "var(--muted)" }}>No matches. Try different words.</p> : null}
        </div>
      ) : (
        <>
          <Section title="Guides" sub="How to use the product">
            <div className="help-grid">{guides.map(card)}</div>
          </Section>
          <Section title="The science" sub="The research behind the workshops and assessments">
            <div className="help-grid">{science.map(card)}</div>
          </Section>
          <Section title="FAQ" sub="Quick answers to common questions">
            <div className="faq-list">{faqs.map(faqItem)}</div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="help-sec">
      <div className="help-sec-h">
        <h2>{title}</h2>
        <span>{sub}</span>
      </div>
      {children}
    </section>
  );
}
