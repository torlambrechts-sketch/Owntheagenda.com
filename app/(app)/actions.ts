"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WS_COOKIE } from "@/lib/workspace";

export async function setActiveWorkspace(workspaceId: string) {
  cookies().set(ACTIVE_WS_COOKIE, workspaceId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function markNotificationsRead(id?: string) {
  const supabase = createClient();
  await supabase.rpc("mark_notifications_read", id ? { p_id: id } : {});
  revalidatePath("/", "layout");
}
