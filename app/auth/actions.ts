"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/dashboard");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const joinCode = String(formData.get("join_code") || "").trim().toUpperCase();
  const requestedRole = String(formData.get("requested_role") || "").trim();
  const next = String(formData.get("next") || "/onboarding");

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        ...(joinCode ? { join_code: joinCode } : {}),
        ...(requestedRole ? { requested_role: requestedRole } : {}),
      },
    },
  });
  if (error) return { error: error.message };

  // Email confirmation enabled → no session yet.
  if (!data.session) {
    return {
      message:
        "Almost there — check your email to confirm your account, then sign in.",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
