"use client";

import { useActionState, useState } from "react";
import { changePassword, type ProfileActionState } from "@/app/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon } from "@/components/dashboard/icons";

const initialState: ProfileActionState = { error: null, success: false };

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
        <div className="relative">
          <Input
            name="newPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters, with a letter and a number"
            disabled={isPending}
            required
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
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm New Password</label>
        <Input
          name="confirmNewPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          disabled={isPending}
          required
        />
      </div>

      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-blue-700">Password changed.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Changing..." : "Change Password"}
      </Button>
    </form>
  );
}
