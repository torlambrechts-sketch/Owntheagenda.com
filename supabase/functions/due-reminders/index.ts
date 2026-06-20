// due-reminders — delivers a digest of due/overdue reminders.
//
// Two independent channels, each with its own dedup stamp on `notification`:
//   • Email   (per recipient)  — gated by RESEND_API_KEY, deduped via emailed_at.
//   • Webhook (per workspace)  — Slack / Teams / generic incoming webhooks from
//     the `integration` table, deduped via posted_at. Works with no email config.
//
// Triggered daily by pg_cron via pg_net (see migration *_reminder_email_dispatch).
// Auth: a shared secret (x-cron-secret) verified against the database, so the
// function can run with verify_jwt = false while staying private to our scheduler.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("REMINDER_FROM") ?? "OwnTheAgenda <onboarding@resend.dev>";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

const REMINDER_KINDS = [
  "action_due_soon", "action_overdue", "survey_open", "survey_due",
  "assessment_due_soon", "assessment_overdue",
];

type Notif = { id: string; user_id: string; title: string; body: string | null; kind: string };
type ChNotif = { id: string; workspace_id: string; title: string; body: string | null; kind: string };
type Integ = { workspace_id: string; provider: string; config: Record<string, unknown> | null };

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string),
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Authorize: shared secret checked against the database.
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: vErr } = await admin.rpc("verify_cron_secret", {
    p_name: "reminder_cron",
    p_secret: secret,
  });
  if (vErr) return json({ error: "auth check failed" }, 500);
  if (!ok) return json({ error: "unauthorized" }, 401);

  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();

  // ---- Channel delivery (Slack / Teams / generic webhook) ----
  // Independent of email: posts one per-workspace digest to each connected
  // webhook integration, deduped via posted_at. Runs even with no email config.
  let posted = 0;
  {
    const { data: chRows } = await admin
      .from("notification")
      .select("id, workspace_id, title, body, kind")
      .in("kind", REMINDER_KINDS)
      .is("posted_at", null)
      .gte("created_at", since);
    const chList = (chRows ?? []) as ChNotif[];
    if (chList.length) {
      const wsIds = [...new Set(chList.map((n) => n.workspace_id))];
      const { data: integRows } = await admin
        .from("integration")
        .select("workspace_id, provider, config")
        .in("workspace_id", wsIds)
        .in("provider", ["slack", "teams", "webhook"])
        .eq("status", "connected");
      const connsByWs = new Map<string, Integ[]>();
      for (const r of (integRows ?? []) as Integ[]) {
        const arr = connsByWs.get(r.workspace_id) ?? [];
        arr.push(r);
        connsByWs.set(r.workspace_id, arr);
      }
      const notifByWs = new Map<string, ChNotif[]>();
      for (const n of chList) {
        const arr = notifByWs.get(n.workspace_id) ?? [];
        arr.push(n);
        notifByWs.set(n.workspace_id, arr);
      }
      const postedIds: string[] = [];
      for (const [ws, items] of notifByWs) {
        const conns = connsByWs.get(ws);
        if (!conns?.length) continue; // no channel configured — email still covers them
        const text =
          `*Reminders from OwnTheAgenda*\n` +
          items.map((it) => `• ${it.title}${it.body ? ` — ${it.body}` : ""}`).join("\n") +
          (APP_URL ? `\n${APP_URL}` : "");
        let anyOk = false;
        for (const c of conns) {
          const cfg = c.config ?? {};
          const url = String(cfg.webhook_url ?? cfg.url ?? "");
          if (!url) continue;
          // Slack/Teams incoming webhooks take { text }; a generic webhook gets
          // a structured event it can route however it likes.
          const payload = c.provider === "webhook"
            ? { type: "reminders", workspace_id: ws, count: items.length, items }
            : { text };
          try {
            const r = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (r.ok) anyOk = true;
            else console.error("webhook error", c.provider, r.status, await r.text());
          } catch (e) {
            console.error("webhook fetch failed", c.provider, e);
          }
        }
        if (anyOk) {
          posted += items.length;
          for (const it of items) postedIds.push(it.id);
        }
      }
      if (postedIds.length) {
        await admin.from("notification").update({ posted_at: new Date().toISOString() }).in("id", postedIds);
      }
    }
  }

  // ---- Email delivery (per recipient) ----
  // Pending reminder notifications from the last 2 days, not yet emailed.
  const { data: notifs, error: nErr } = await admin
    .from("notification")
    .select("id, user_id, title, body, kind")
    .in("kind", REMINDER_KINDS)
    .is("emailed_at", null)
    .gte("created_at", since);
  if (nErr) return json({ error: nErr.message }, 500);

  const list = (notifs ?? []) as Notif[];
  const emailEnabled = RESEND_API_KEY.length > 0;
  if (list.length === 0) return json({ pending: 0, emailed: 0, posted, emailEnabled });

  // Email not configured yet: acknowledge without consuming so they can flow
  // once RESEND_API_KEY is set (they age out of the 2-day window otherwise).
  if (!emailEnabled) return json({ pending: list.length, emailed: 0, posted, emailEnabled: false });

  // Recipient emails.
  const userIds = [...new Set(list.map((n) => n.user_id))];
  const { data: profs } = await admin
    .from("profile")
    .select("id, email, full_name, display_name")
    .in("id", userIds);
  const who = new Map(
    (profs ?? []).map((p) => [
      p.id,
      {
        email: p.email as string | null,
        name: (p.full_name || p.display_name || "there") as string,
      },
    ]),
  );

  // Group per recipient and send one digest each.
  const byUser = new Map<string, Notif[]>();
  for (const n of list) {
    const arr = byUser.get(n.user_id) ?? [];
    arr.push(n);
    byUser.set(n.user_id, arr);
  }

  let emailed = 0;
  const doneIds: string[] = [];
  for (const [uid, items] of byUser) {
    const rec = who.get(uid);
    if (!rec?.email) continue; // no address on file — leave for later
    const subject =
      items.length === 1 ? items[0].title : `${items.length} items need your attention`;
    const link = APP_URL || "";
    const rowsHtml = items
      .map((it) => `<li><strong>${esc(it.title)}</strong>${it.body ? ` — ${esc(it.body)}` : ""}</li>`)
      .join("");
    const html =
      `<p>Hi ${esc(rec.name)},</p>` +
      `<p>You have ${items.length} item${items.length > 1 ? "s" : ""} that need your attention:</p>` +
      `<ul>${rowsHtml}</ul>` +
      (link ? `<p><a href="${link}">Open OwnTheAgenda →</a></p>` : "") +
      `<p style="color:#8a8a8a;font-size:12px;margin-top:18px">You're receiving this from your team's work in OwnTheAgenda.</p>`;
    const text =
      `Hi ${rec.name},\n\nYou have ${items.length} item(s) that need your attention:\n\n` +
      items.map((it) => `• ${it.title}${it.body ? ` — ${it.body}` : ""}`).join("\n") +
      (link ? `\n\n${link}` : "");

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [rec.email], subject, html, text }),
    });
    if (resp.ok) {
      emailed++;
      for (const it of items) doneIds.push(it.id);
    } else {
      console.error("resend error", resp.status, await resp.text());
    }
  }

  if (doneIds.length) {
    await admin
      .from("notification")
      .update({ emailed_at: new Date().toISOString() })
      .in("id", doneIds);
  }

  return json({ pending: list.length, emailed, posted, emailEnabled: true });
});
