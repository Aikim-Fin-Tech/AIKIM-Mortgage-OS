import type { LoanCase } from "@/lib/loan-cases-data";

/**
 * Pure, no I/O — derives the Loan Cases explorer's "Assigned Banker" filter
 * options from the cases actually visible to the current user, instead of a
 * hardcoded platform-wide name list (the previous `bankers` export in
 * loan-cases-data.ts, which happened to collide with real seeded Banker
 * full_names and shipped them to every Banker regardless of whether those
 * bankers had any case that Banker could see).
 *
 * Because `cases` is already scoped by loan_cases_select_scope RLS (a
 * Banker only ever receives their own cases), this list is self-limiting by
 * construction: a Banker with zero visible cases gets zero filter options,
 * and a Banker with only their own cases gets only their own name.
 */
export function deriveBankerFilterOptions(cases: Pick<LoanCase, "banker">[]): string[] {
  return Array.from(new Set(cases.map((loanCase) => loanCase.banker))).sort((a, b) => a.localeCompare(b));
}
