"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { resetPassword, type ResetPasswordState } from "@/app/reset-password/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon } from "@/components/dashboard/icons";

const initialState: ResetPasswordState = { error: null, success: false };

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(resetPassword, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();
  const confirmId = useId();

  if (state.success) {
    return (
      <div className="space-y-4 text-center">
        <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Your password has been reset. You can now sign in with your new password.
        </p>
        <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium text-slate-700">
          New Password
        </label>
        <div className="relative">
          <Input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters, with a letter and a number"
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

      <div>
        <label htmlFor={confirmId} className="mb-1.5 block text-sm font-medium text-slate-700">
          Confirm New Password
        </label>
        <Input
          id={confirmId}
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          disabled={isPending}
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full justify-center">
        {isPending ? "Resetting..." : "Reset Password"}
      </Button>
    </form>
  );
}
