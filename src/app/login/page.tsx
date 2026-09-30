"use client";

import { useActionState } from "react";
import { login, signup } from "./actions";

export default function LoginPage() {
  const [loginState, loginAction, loginPending] = useActionState(login, undefined);
  const [signupState, signupAction, signupPending] = useActionState(signup, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-neutral-100">Sunday Dashboard</h1>

        <form action={loginAction} className="space-y-3 rounded-lg border border-neutral-800 p-4">
          <h2 className="text-sm font-medium text-neutral-300">Sign in</h2>
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Password"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
          {loginState?.error && (
            <p className="text-sm text-red-400">{loginState.error}</p>
          )}
          <button
            type="submit"
            disabled={loginPending}
            className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
          >
            {loginPending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <form action={signupAction} className="space-y-3 rounded-lg border border-neutral-800 p-4">
          <h2 className="text-sm font-medium text-neutral-300">Create account</h2>
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
          <input
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Password"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
          {signupState?.error && (
            <p className="text-sm text-red-400">{signupState.error}</p>
          )}
          <button
            type="submit"
            disabled={signupPending}
            className="w-full rounded border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 disabled:opacity-50"
          >
            {signupPending ? "Creating…" : "Sign up"}
          </button>
        </form>
      </div>
    </div>
  );
}
