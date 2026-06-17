"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AcceptState = { error?: string };

export async function acceptInvite(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") || "");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/invite/${token}`);

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
