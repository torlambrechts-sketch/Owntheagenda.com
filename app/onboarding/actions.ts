"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OnboardState = { error?: string };

export async function createCompany(
  _prev: OnboardState,
  formData: FormData,
): Promise<OnboardState> {
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Please enter a company name." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("provision_workspace", {
    p_name: name,
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
