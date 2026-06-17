"use client";

import { useFormState, useFormStatus } from "react-dom";
import { acceptInvite, type AcceptState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-prim btn-full" type="submit" disabled={pending}>
      {pending ? "Joining…" : "Accept invitation →"}
    </button>
  );
}

export function InviteAccept({ token }: { token: string }) {
  const [state, formAction] = useFormState<AcceptState, FormData>(
    acceptInvite,
    {},
  );
  return (
    <>
      {state.error ? <div className="form-err">{state.error}</div> : null}
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <Submit />
      </form>
    </>
  );
}
