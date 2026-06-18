import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { ManageClient, type MArticle, type MFaq } from "./ManageClient";

export default async function ManagePage() {
  const ctx = await requireSession();
  if (!ctx.profile?.is_staff) redirect("/help");

  const supabase = createClient();
  const { data: articles } = await supabase
    .from("help_article")
    .select("id, kind, slug, title, summary, category, topic_key, icon, sort, status, body")
    .order("kind", { ascending: true })
    .order("sort", { ascending: true });
  const { data: faqs } = await supabase
    .from("help_faq")
    .select("id, question, answer, category, sort, status")
    .order("sort", { ascending: true });

  return (
    <div>
      <Link className="hc-back" href="/help">← Help &amp; Science</Link>
      <h1 className="page-title">Manage content</h1>
      <p className="page-sub">Create and edit the guides, science articles and FAQ. Published changes are live for everyone.</p>
      <ManageClient articles={(articles ?? []) as MArticle[]} faqs={(faqs ?? []) as MFaq[]} />
    </div>
  );
}
