/**
 * Pure, no I/O — mirrors the branch structure of the bankers_select_scope
 * RLS policy (see
 * supabase/migrations/20260901020000_restrict_banker_customer_bankers_select.sql)
 * so the design property "only Banker is narrowed; every other role falls
 * through to the original, unmodified condition" is unit-testable without a
 * live database. Does not evaluate the actual SQL predicates (there is no
 * bankers row or session to evaluate them against here) — it only proves
 * which branch of the policy's `case current_user_role() ... end` a given
 * role resolves to.
 */
export type BankersSelectBranch = "self-only" | "original-authenticated-check";

export function decideBankersSelectScope(role: string | null): BankersSelectBranch {
  if (role === "banker") return "self-only";
  return "original-authenticated-check";
}
