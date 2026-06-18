"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createCompany, joinCompany, type OnboardState } from "./actions";
import { signout } from "@/app/auth/actions";
import { LogoMark } from "@/components/Logo";
import { ROLE_OPTIONS, roleLabel } from "@/lib/util";
import type { Enums } from "@/types/database.types";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-prim btn-full" type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

function Brand() {
  return (
    <div className="auth-brand">
      <LogoMark size={34} />
      <span className="wm">
        Own<span className="t">the</span>Agenda
      </span>
    </div>
  );
}

export function OnboardingForm({
  pending,
  initialJoinCode,
  initialRole,
}: {
  pending: { name: string; role: string } | null;
  initialJoinCode: string;
  initialRole: string;
}) {
  const [createState, createAction] = useFormState<OnboardState, FormData>(createCompany, {});
  const [joinState, joinAction] = useFormState<OnboardState, FormData>(joinCompany, {});
  const [mode, setMode] = useState<"create" | "join">(initialJoinCode ? "join" : "create");

  if (pending) {
    return (
      <div className="narrow">
        <div className="narrow-card auth-card">
          <Brand />
          <h1>Awaiting approval</h1>
          <p className="lede">
            Your request to join <b>{pending.name}</b> as{" "}
            {roleLabel(pending.role as Enums<"workspace_role">)} is with the company’s admins.
            You’ll get access as soon as they approve it.
          </p>
          <form action={signout}>
            <button className="btn-sec btn-full" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="narrow-card auth-card">
        <Brand />
        <div className="segbar" style={{ marginBottom: 18 }}>
          <button type="button" className={`seg${mode === "create" ? " on" : ""}`} onClick={() => setMode("create")}>
            Create a company
          </button>
          <button type="button" className={`seg${mode === "join" ? " on" : ""}`} onClick={() => setMode("join")}>
            Join a company
          </button>
        </div>

        {mode === "create" ? (
          <>
            <h1>Name your company</h1>
            <p className="lede">
              This becomes your workspace — the home for your teams, assessments and sessions.
              You’ll be its owner.
            </p>
            {createState.error ? <div className="form-err">{createState.error}</div> : null}
            <form action={createAction}>
              <div className="field">
                <label htmlFor="name">Company name</label>
                <input className="inp" id="name" name="name" required autoFocus placeholder="Lumio AS" />
              </div>
              <Submit label="Create company →" busy="Creating…" />
            </form>
          </>
        ) : (
          <>
            <h1>Join your company</h1>
            <p className="lede">
              Enter the Company ID an admin shared with you. Employee and Facilitator activate
              right away; Team Manager and Company Admin need an admin’s approval.
            </p>
            {joinState.error ? <div className="form-err">{joinState.error}</div> : null}
            <form action={joinAction}>
              <div className="field">
                <label htmlFor="code">Company ID</label>
                <input
                  className="inp"
                  id="code"
                  name="code"
                  required
                  defaultValue={initialJoinCode}
                  autoCapitalize="characters"
                  placeholder="e.g. A1B2C3D4"
                />
              </div>
              <div className="field">
                <label htmlFor="role">Your role</label>
                <select className="inp" id="role" name="role" defaultValue={initialRole || "member"}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <Submit label="Request to join →" busy="Joining…" />
            </form>
          </>
        )}
      </div>
    </div>
  );
}
