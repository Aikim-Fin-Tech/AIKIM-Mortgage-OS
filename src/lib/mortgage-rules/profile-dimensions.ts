import {
  NATIONALITY_OPTIONS,
  INCOME_COUNTRY_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  INCOME_STRUCTURE_OPTIONS,
} from "./borrower-profile-options";
import type { BorrowerProfile } from "./types";

export type ProfileDimensionKey = keyof BorrowerProfile;

export type ProfileDimensionConfig = {
  key: ProfileDimensionKey;
  /** Column name on loan_cases / mortgage_rules for this dimension. */
  column: string;
  label: string;
  options: readonly string[];
};

/**
 * Declarative list of every borrower-profile dimension the Rule Engine
 * matches on. This is THE extension point for Sprint 6.2's requirement that
 * the engine support more dimensions later (property type, loan purpose,
 * bank, developer, first home, loan amount, ...) "without redesigning the
 * architecture":
 *
 *   1. Add a column to loan_cases and mortgage_rules via a new migration.
 *   2. Add the field to BorrowerProfile and MortgageRule in types.ts.
 *   3. Add one entry here.
 *
 * match-rule.ts, the Borrower Profile form (BorrowerProfileCard), and the
 * admin Rule form all iterate over this array — none of them hardcode the
 * current 4 dimensions individually. Adding a 5th dimension touches this
 * file, one migration, and the type definitions; it does not require
 * rewriting the matching algorithm or either form.
 *
 * Options lists are still fixed TypeScript arrays, not a database table —
 * see borrower-profile-options.ts for why (form/UI vocabulary, not rule
 * data). A numeric dimension (e.g. loan amount) would not fit this
 * options-list shape and would need its own comparison mode (range, not
 * equality/wildcard) when it's actually added — flagged here so a future
 * implementer knows this file's `options: readonly string[]` shape is
 * specific to categorical dimensions, not a universal one.
 */
export const PROFILE_DIMENSIONS: readonly ProfileDimensionConfig[] = [
  { key: "nationality", column: "nationality", label: "Nationality", options: NATIONALITY_OPTIONS },
  { key: "incomeCountry", column: "income_country", label: "Income Country", options: INCOME_COUNTRY_OPTIONS },
  { key: "employmentType", column: "employment_type", label: "Employment Type", options: EMPLOYMENT_TYPE_OPTIONS },
  {
    key: "incomeStructure",
    column: "income_structure",
    label: "Income Structure",
    options: INCOME_STRUCTURE_OPTIONS,
  },
] as const;
