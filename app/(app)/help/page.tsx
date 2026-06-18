import { createClient } from "@/lib/supabase/server";
import { HelpCenter } from "./HelpCenter";

export default async function HelpPage() {
  const supabase = createClient();
  const { data: articles } = await supabase
    .from("help_article")
    .select("kind, slug, title, summary, category, topic_key, icon, sort")
    .eq("status", "published")
    .order("sort", { ascending: true });
  const { data: faqs } = await supabase
    .from("help_faq")
    .select("id, question, answer, category, sort")
    .eq("status", "published")
    .order("sort", { ascending: true });

  return (
    <div>
      <h1 className="page-title">Help &amp; Science</h1>
      <p className="page-sub">Learn the product — and the research behind the workshops and assessments.</p>
      <HelpCenter articles={articles ?? []} faqs={faqs ?? []} />
    </div>
  );
}
