"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database.types";

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

export async function joinCompany(
  _prev: OnboardState,
  formData: FormData,
): Promise<OnboardState> {
  const code = String(formData.get("code") || "").trim();
  const role = String(formData.get("role") || "member") as Enums<"workspace_role">;
  if (!code) return { error: "Enter your Company ID." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("join_workspace_by_code", {
    p_code: code,
    p_role: role,
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  const status = (data as unknown as { status?: string } | null)?.status;
  // Employee/Facilitator activate immediately; Manager/Admin wait for approval.
  if (status === "active") redirect("/dashboard");
  redirect("/onboarding");
}
