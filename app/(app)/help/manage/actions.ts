"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Every write here is additionally gated by RLS (private.is_staff()); the page
// also redirects non-staff. These are thin wrappers with friendly errors.

function bump() {
  revalidatePath("/help");
  revalidatePath("/help/manage");
}

export type ArticleInput = {
  id?: string;
  kind: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  topic_key: string;
  icon: string;
  sort: number;
  status: string;
  body: string;
};

export async function saveArticle(input: ArticleInput): Promise<{ error?: string; id?: string }> {
  const slug = input.slug.trim();
  const title = input.title.trim();
  if (!title || !slug) return { error: "Title and slug are required." };
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: "Slug can only contain lowercase letters, numbers and hyphens." };

  const supabase = createClient();
  const row = {
    kind: input.kind,
    slug,
    title,
    summary: input.summary.trim() || null,
    category: input.category.trim() || "general",
    topic_key: input.topic_key.trim() || null,
    icon: input.icon.trim() || null,
    sort: Number.isFinite(input.sort) ? input.sort : 0,
    status: input.status,
    body: input.body,
    updated_at: new Date().toISOString(),
  };
  const res = input.id
    ? await supabase.from("help_article").update(row).eq("id", input.id).select("id").maybeSingle()
    : await supabase.from("help_article").insert(row).select("id").maybeSingle();
  if (res.error) return { error: res.error.message };
  bump();
  return { id: res.data?.id };
}

export async function setArticleStatus(id: string, status: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("help_article").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  bump();
  return {};
}

export async function deleteArticle(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("help_article").delete().eq("id", id);
  if (error) return { error: error.message };
  bump();
  return {};
}

export type FaqInput = {
  id?: string;
  question: string;
  answer: string;
  category: string;
  sort: number;
  status: string;
};

export async function saveFaq(input: FaqInput): Promise<{ error?: string }> {
  const question = input.question.trim();
  if (!question) return { error: "Question is required." };
  const supabase = createClient();
  const row = {
    question,
    answer: input.answer,
    category: input.category.trim() || "general",
    sort: Number.isFinite(input.sort) ? input.sort : 0,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  const res = input.id
    ? await supabase.from("help_faq").update(row).eq("id", input.id)
    : await supabase.from("help_faq").insert(row);
  if (res.error) return { error: res.error.message };
  bump();
  return {};
}

export async function setFaqStatus(id: string, status: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("help_faq").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  bump();
  return {};
}

export async function deleteFaq(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("help_faq").delete().eq("id", id);
  if (error) return { error: error.message };
  bump();
  return {};
}
