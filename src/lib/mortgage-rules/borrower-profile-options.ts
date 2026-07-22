/**
 * Canonical value lists for the 4 borrower profile fields on loan_cases.
 *
 * This is UI/form vocabulary, not a business rule — it does not decide which
 * documents are required (that's mortgage_rules / mortgage_rule_documents in
 * the database). It exists because loan_cases.nationality etc. are free-text
 * columns (see the Sprint 6.2 migration): matching only works if the app
 * writes and rules are authored using the same exact strings, so this file is
 * the single source of truth for those strings.
 *
 * ASSUMPTION flagged for product review: these specific options were not
 * specified in the sprint brief and were chosen as a reasonable starting set
 * for the Malaysian mortgage context. Confirm/adjust with product-manager
 * before relying on them for real underwriting rules.
 */

export const NATIONALITY_OPTIONS = ["Malaysian", "Foreigner"] as const;

export const INCOME_COUNTRY_OPTIONS = ["Malaysia", "Outside Malaysia"] as const;

export const EMPLOYMENT_TYPE_OPTIONS = [
  "Salaried",
  "Self-Employed",
  "Commission-Based",
  "Business Owner",
] as const;

export const INCOME_STRUCTURE_OPTIONS = ["Fixed", "Variable", "Mixed"] as const;
