"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createCompany, type OnboardState } from "./actions";
import { LogoMark } from "@/components/Logo";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-prim btn-full" type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create company →"}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useFormState<OnboardState, FormData>(
    createCompany,
    {},
  );

  return (
    <div className="narrow">
      <div className="narrow-card auth-card">
        <div className="auth-brand">
          <LogoMark size={34} />
          <span className="wm">
            Own<span className="t">the</span>Agenda
          </span>
        </div>
        <h1>Name your company</h1>
        <p className="lede">
          This becomes your workspace — the home for your teams, assessments and
          sessions. You’ll be its owner.
        </p>

        {state.error ? <div className="form-err">{state.error}</div> : null}

        <form action={formAction}>
          <div className="field">
            <label htmlFor="name">Company name</label>
            <input
              className="inp"
              id="name"
              name="name"
              required
              autoFocus
              placeholder="Lumio AS"
            />
          </div>
          <Submit />
        </form>
      </div>
    </div>
  );
}
