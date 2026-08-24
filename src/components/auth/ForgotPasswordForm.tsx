"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/forgot-password/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ForgotPasswordState = { message: null, submitted: false };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);
  const emailId = useId();

  if (state.submitted) {
    return (
      <div className="space-y-4 text-center">
        <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {state.message}
        </p>
        <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          Back to Sign In
        </Link>
      </div>
    );
  }

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

      {state.message && !state.submitted && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full justify-center">
        {isPending ? "Sending..." : "Send Reset Link"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Back to Sign In
        </Link>
      </p>
    </form>
  );
}
