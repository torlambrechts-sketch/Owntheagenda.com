import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Markdown } from "@/lib/markdown";

export default async function HelpArticlePage({ params }: { params: { slug: string } }) {
  const supabase = createClient();
  // RLS returns the row only if it's published (or the viewer is staff).
  const { data: a } = await supabase
    .from("help_article")
    .select("kind, title, summary, body")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!a) notFound();

  return (
    <div className="help-article">
      <Link className="hc-back" href="/help">← Help &amp; Science</Link>
      <span className={`pill sm ${a.kind === "science" ? "open" : "draft"}`}>
        {a.kind === "science" ? "Science" : "Guide"}
      </span>
      <h1 className="page-title">{a.title}</h1>
      {a.summary ? <p className="page-sub">{a.summary}</p> : null}
      <article className="prose"><Markdown>{a.body}</Markdown></article>
    </div>
  );
}
