/**
 * Pure, no I/O — mirrors the branch structure of the customers_select_scope
 * RLS policy (see
 * supabase/migrations/20260901020000_restrict_banker_customer_bankers_select.sql)
 * so the design property "only Banker is narrowed to their own case scope;
 * Super Admin, Property Agent, Mortgage Outsource Agent, and a customer's
 * own self-access all fall through to the original, unmodified condition"
 * is unit-testable without a live database. Does not evaluate the actual
 * SQL predicates — it only proves which branch of the policy's
 * `case current_user_role() ... end` a given role resolves to.
 */
export type CustomersSelectBranch = "case-scoped-to-banker" | "original-staff-or-self-check";

export function decideCustomersSelectScope(role: string | null): CustomersSelectBranch {
  if (role === "banker") return "case-scoped-to-banker";
  return "original-staff-or-self-check";
}
