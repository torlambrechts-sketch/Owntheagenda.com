"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ACTIVE_WS_COOKIE } from "@/lib/workspace";

// MAIN2 variant of the workspace switch: identical to the app one but keeps
// the user inside the /m2 surface instead of bouncing to the legacy dashboard.
export async function setActiveWorkspaceM2(workspaceId: string) {
  cookies().set(ACTIVE_WS_COOKIE, workspaceId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/m2/dashboard");
}
