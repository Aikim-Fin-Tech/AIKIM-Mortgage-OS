"use client";

import { useActionState, useId, useState } from "react";
import { login, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon } from "@/components/dashboard/icons";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const emailId = useId();
  const passwordId = useId();

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@aikim.com.my"
          required
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium text-slate-700">
          Password
        </label>
        <div className="relative">
          <Input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            disabled={isPending}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={isPending}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center
              text-slate-400 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full justify-center">
        {isPending ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
