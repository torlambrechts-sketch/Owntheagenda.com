import { redirect } from "next/navigation";
import { requireSession } from "@/lib/workspace";
import { isAdmin } from "@/lib/util";
import { OrganizationClient } from "./OrganizationClient";

export default async function OrganizationPage() {
  const ctx = await requireSession();
  if (!isAdmin(ctx.role)) redirect("/dashboard");
  const w = ctx.workspace;

  return (
    <div>
      <h1 className="page-title">Organization</h1>
      <p className="page-sub">Settings, data residency and privacy for {w.name}.</p>
      <OrganizationClient
        workspaceId={w.id}
        initial={{
          name: w.name,
          logoUrl: w.logo_url ?? "",
          dataRegion: w.data_region,
          retentionMonths: w.retention_months ?? null,
          joinCode: w.join_code,
          plan: w.plan,
        }}
      />
    </div>
  );
}
