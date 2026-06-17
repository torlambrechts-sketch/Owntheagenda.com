"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { login, signup, type AuthState } from "@/app/auth/actions";
import { LogoMark } from "@/components/Logo";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-prim btn-full" type="submit" disabled={pending}>
      {pending ? "One moment…" : label}
    </button>
  );
}

export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "signup";
  next?: string;
}) {
  const action = mode === "login" ? login : signup;
  const [state, formAction] = useFormState<AuthState, FormData>(action, {});

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <LogoMark size={34} />
          <span className="wm">
            Own<span className="t">the</span>Agenda
          </span>
        </div>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="lede">
          {mode === "login"
            ? "Sign in to run your next session."
            : "Start running assessment-fueled leadership sessions."}
        </p>

        {state.error ? <div className="form-err">{state.error}</div> : null}
        {state.message ? (
          <div className="grounded" style={{ marginBottom: 14 }}>
            {state.message}
          </div>
        ) : null}

        <form action={formAction}>
          {next ? <input type="hidden" name="next" value={next} /> : null}

          {mode === "signup" ? (
            <div className="field">
              <label htmlFor="full_name">Full name</label>
              <input
                className="inp"
                id="full_name"
                name="full_name"
                autoComplete="name"
                placeholder="Kari Nordmann"
              />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              className="inp"
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              className="inp"
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder="••••••••"
            />
          </div>

          <Submit label={mode === "login" ? "Sign in" : "Create account"} />
        </form>

        <div className="auth-foot">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
