import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "@/components/Logo";
import { InviteAccept } from "./InviteAccept";

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const token = params.token;
  const next = `/invite/${token}`;

  return (
    <div className="narrow">
      <div className="narrow-card auth-card">
        <div className="auth-brand">
          <LogoMark size={34} />
          <span className="wm">
            Own<span className="t">the</span>Agenda
          </span>
        </div>
        <h1>You’ve been invited</h1>

        {user ? (
          <>
            <p className="lede">
              You’re signed in as <strong>{user.email}</strong>. Accept to join
              the workspace.
            </p>
            <InviteAccept token={token} />
          </>
        ) : (
          <>
            <p className="lede">
              Sign in or create your account to accept this invitation.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Link
                className="btn-prim btn-full"
                href={`/login?next=${encodeURIComponent(next)}`}
              >
                Sign in
              </Link>
              <Link
                className="btn-sec btn-full"
                href={`/signup?next=${encodeURIComponent(next)}`}
              >
                Create account
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
