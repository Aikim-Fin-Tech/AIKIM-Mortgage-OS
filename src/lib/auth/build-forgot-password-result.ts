export type ForgotPasswordState = {
  /** Always the same neutral copy on submit — see requestPasswordReset. Only ever null before first submit, or set to a genuine client-side validation message (empty field), never "no such account". */
  message: string | null;
  /** True once a submit has completed (success or otherwise) — lets the form show the neutral confirmation state instead of the form again. */
  submitted: boolean;
};

export const NEUTRAL_RESET_MESSAGE =
  "If an account exists for that email address, a password reset link has been sent to it.";

/**
 * The enumeration-protection rule itself, split out of the Server Action
 * (src/app/forgot-password/actions.ts) so it's directly testable: takes no
 * input at all, by design — no matter what Supabase's
 * resetPasswordForEmail() call returned (success, "user not found"
 * internally, rate-limited, or any other error), the caller always sees the
 * exact same neutral message and submitted:true, so there is nothing for
 * this function to branch on. The action logs the real error code
 * separately, server-side only, before calling this. The only exception is
 * the empty-email case, which the action checks before ever reaching this
 * function — that's a client-side form-completeness signal, not an
 * account-existence signal.
 */
export function buildForgotPasswordResult(): ForgotPasswordState {
  return { message: NEUTRAL_RESET_MESSAGE, submitted: true };
}
