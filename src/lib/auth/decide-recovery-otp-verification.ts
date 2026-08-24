/**
 * Pure, no I/O — the gate in front of /auth/confirm's verifyOtp() call
 * (src/app/auth/confirm/route.ts). Decides whether an incoming
 * ?token_hash=...&type=... query is even eligible to be verified, before
 * any Supabase call happens.
 *
 * Deliberately accepts only type === "recovery", never any other
 * EmailOtpType (signup, invite, magiclink, email_change, email) — this
 * route exists solely for the password-recovery email link. A different
 * OTP type reaching here (today: never, since no other flow in this app
 * points its redirectTo at this route) must never establish a session
 * here; rejecting it before verifyOtp is called is what guarantees that,
 * rather than relying on Supabase to reject an unexpected type on its own.
 */

export type RecoveryOtpDecision = { shouldVerify: true; tokenHash: string } | { shouldVerify: false };

export function decideRecoveryOtpVerification(tokenHash: string | null, type: string | null): RecoveryOtpDecision {
  if (!tokenHash || !type) return { shouldVerify: false };
  if (type !== "recovery") return { shouldVerify: false };
  return { shouldVerify: true, tokenHash };
}
