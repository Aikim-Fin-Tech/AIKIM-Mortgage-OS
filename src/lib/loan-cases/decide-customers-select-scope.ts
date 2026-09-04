/**
 * Pure, no I/O — mirrors the branch structure of the customers_select_scope
 * RLS policy (see
 * supabase/migrations/20260902010000_permanent_nonrecursive_customers_select.sql
 * — this policy name was first introduced, then rolled back for causing RLS
 * recursion, in 20260901020000/20260901030000; this migration reintroduces
 * it with a non-recursive Banker branch) so the design property "only
 * Banker is narrowed to their own case scope; Super Admin, Property Agent,
 * Mortgage Outsource Agent, and a customer's own self-access all fall
 * through to the original, unmodified condition" is unit-testable without a
 * live database. Does not evaluate the actual SQL predicates — it only
 * proves which branch of the policy's `case current_user_role() ... end` a
 * given role resolves to. See decideCustomerAuthorizedForBanker for the
 * pure mirror of the Banker branch's own non-recursive helper logic.
 */
export type CustomersSelectBranch = "case-scoped-to-banker" | "original-staff-or-self-check";

export function decideCustomersSelectScope(role: string | null): CustomersSelectBranch {
  if (role === "banker") return "case-scoped-to-banker";
  return "original-staff-or-self-check";
}
