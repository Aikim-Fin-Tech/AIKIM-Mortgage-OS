/**
 * Pure, no I/O — decides whether a Loan Case creation request must be
 * rejected outright because the caller's role is 'banker' but they have no
 * linked public.bankers row. Mirrored exactly by the RPC-layer exception in
 * create_loan_case (see
 * supabase/migrations/20260901010000_enforce_banker_self_assignment.sql).
 *
 * Without this, decideEffectiveBankerId(...) would resolve such a Banker's
 * banker_id to null and the case would be created "Unassigned" — which,
 * against the live loan_cases_select_scope policy (banker_id IN (my own
 * bankers.id) OR assigned_agent_id = me OR customer_id IN (my own
 * customers)), a Banker with no bankers row can never satisfy: the case
 * would immediately become invisible to the very Banker who just created
 * it, silently, with the RPC still reporting success. Failing closed here
 * instead surfaces a clear, actionable error before any row is written.
 */
export function shouldRejectUnlinkedBanker(role: string, ownBankerId: string | null): boolean {
  return role === "banker" && ownBankerId === null;
}
