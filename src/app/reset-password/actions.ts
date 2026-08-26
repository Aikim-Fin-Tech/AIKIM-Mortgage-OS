"use server";

import { createClient } from "@/lib/supabase/server";
import { validatePasswordConfirmation, validatePasswordStrength } from "@/lib/auth/password-validation";

export type ResetPasswordState = {
  error: string | null;
  success: boolean;
};

/**
 * Sets a new password for whoever the CURRENT SESSION belongs to —
 * auth.updateUser() always operates on the session already established by
 * /auth/confirm's verifyOtp() call, never a client-supplied user id. If
 * there is no session at all (expired link, or this action is somehow
 * invoked directly), Supabase's own call fails and no password is changed.
 */
export async function resetPassword(_prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const strengthError = validatePasswordStrength(password);
  if (strengthError) return { error: strengthError, success: false };

  const confirmError = validatePasswordConfirmation(password, confirmPassword);
  if (confirmError) return { error: confirmError, success: false };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "This reset link has expired or was already used. Please request a new one.", success: false };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error(`[resetPassword] updateUser failed. code=${error.code ?? "unknown"}`);
    return { error: "Something went wrong while resetting your password. Please try again.", success: false };
  }

  return { error: null, success: true };
}
