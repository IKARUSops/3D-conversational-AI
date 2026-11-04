"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const inputClass =
  "mt-1.5 block h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-focus";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className={inputClass}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          className={inputClass}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>
      {state.error ? (
        <p id="login-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-md bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
