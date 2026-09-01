/**
 * Pure, no I/O — decides which banker_id a loan case is actually created
 * with, mirrored exactly by the SECURITY INVOKER logic inside the
 * create_loan_case RPC (see supabase/migrations/20260901010000_enforce_banker_self_assignment.sql).
 * The RPC is the real enforcement boundary; this function exists so the
 * Server Action can fail closed the same way *before* ever calling the RPC,
 * and so this exact decision is unit-testable without mocking Supabase —
 * same pattern as decide-recovery-otp-verification.ts and
 * decide-dashboard-audit-access.ts.
 *
 * A Banker's own banker_id always wins over whatever the client submitted —
 * this is what closes the cross-Banker assignment gap (a Banker could
 * previously submit any real banker_id, since the RPC only checked it
 * against the loan_cases.banker_id foreign key, not against the caller's
 * own identity). Every other role's submitted value passes through
 * unchanged, preserving Super Admin's ability to assign across Bankers.
 */
export function decideEffectiveBankerId(
  role: string,
  ownBankerId: string | null,
  requestedBankerId: string | null,
): string | null {
  if (role === "banker") return ownBankerId;
  return requestedBankerId;
}
