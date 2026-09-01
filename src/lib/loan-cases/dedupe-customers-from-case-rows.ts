import type { CustomerOption } from "./new-loan-case-types";

type CaseCustomerRow = {
  customers: { id: string; full_name: string; phone: string | null } | null;
};

/**
 * Pure, no I/O — flattens, dedupes, and sorts the customers embedded in a
 * set of loan_cases rows into New Loan Case form options. Used by the
 * Banker branch of getNewLoanCaseFormOptions(), which queries loan_cases
 * scoped to `banker_id = ` the caller's own bankers.id — a Banker with zero
 * such rows always receives zero customer options here, never the
 * platform-wide customers table.
 */
export function dedupeCustomersFromCaseRows(rows: CaseCustomerRow[]): CustomerOption[] {
  const seen = new Set<string>();
  const customers: CustomerOption[] = [];

  for (const row of rows) {
    if (row.customers && !seen.has(row.customers.id)) {
      seen.add(row.customers.id);
      customers.push({ id: row.customers.id, fullName: row.customers.full_name, phone: row.customers.phone });
    }
  }

  customers.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return customers;
}
