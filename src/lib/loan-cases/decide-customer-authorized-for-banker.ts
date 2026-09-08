/**
 * Pure, no I/O — mirrors
 * public.is_customer_authorized_for_current_banker(p_customer_id) (see
 * supabase/migrations/20260902010000_permanent_nonrecursive_customers_select.sql)
 * so its decision logic is unit-testable without a live database. Does not
 * evaluate real RLS or touch Postgres — it only reproduces the same
 * boolean rule the SQL function applies over a caller-supplied set of
 * (customer, banker) links drawn from loan_cases.
 *
 * A null ownBankerId (an unlinked Banker — no public.bankers row) can never
 * match anything, mirroring the SQL's join through public.bankers on
 * b.user_profile_id = public.current_user_profile_id(): no bankers row
 * means no join match, means no case can ever satisfy the condition.
 */
export type CaseCustomerBankerLink = {
  customerId: string;
  bankerId: string | null;
};

export function decideCustomerAuthorizedForBanker(
  ownBankerId: string | null,
  targetCustomerId: string,
  caseLinks: CaseCustomerBankerLink[],
): boolean {
  if (ownBankerId === null) return false;
  return caseLinks.some((link) => link.customerId === targetCustomerId && link.bankerId === ownBankerId);
}
