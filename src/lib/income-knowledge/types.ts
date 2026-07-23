/**
 * Client-safe types for Income Knowledge (Sprint 6.3B-1). Mirrors the 5
 * tables created by supabase/migrations/20260726010000_income_knowledge_schema.sql
 * exactly (camelCase, same convention as src/lib/mortgage-rules/types.ts).
 *
 * Rule DATA lives in the database (banks, bank_products,
 * income_recognition_rules); the matching ALGORITHM lives here in
 * TypeScript, extending src/lib/mortgage-rules/match-rule.ts rather than
 * replacing it — see match-income-rule.ts.
 */

// Re-exported rather than redefined: BorrowerProfile is already the
// canonical 4-field matching input type (docs/product/mortgage-knowledge-database-prd.md
// Section 4: "income_recognition_rules reuses the same four borrower-profile
// matching columns... no new matching vocabulary is invented").
export type { BorrowerProfile } from "@/lib/mortgage-rules/types";

export type Bank = {
  id: string;
  name: string;
  shortCode: string | null;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BankProduct = {
  id: string;
  bankId: string;
  productName: string;
  productCode: string | null;
  financingStructure: string | null;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IncomeRecognitionMethod = "full_value" | "percentage_haircut" | "rolling_average";

export type IncomeRecognitionRule = {
  id: string;
  bankId: string;
  /** Null = this bank's default treatment (wildcard); a specific value overrides it for that product only. */
  bankProductId: string | null;
  ruleName: string;
  incomeSourceType: string;
  /** Wildcard-if-null borrower-profile matching column — same convention as MortgageRule. */
  nationality: string | null;
  incomeCountry: string | null;
  employmentType: string | null;
  incomeStructure: string | null;
  recognitionMethod: IncomeRecognitionMethod;
  /** Only meaningful when recognitionMethod = "percentage_haircut". */
  haircutPercentage: number | null;
  /** Only meaningful when recognitionMethod = "rolling_average". */
  averagingWindowMonths: number | null;
  minimumHistoryMonths: number | null;
  description: string | null;
  version: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Open vocabulary, maintained by application-layer convention, not a
 * database enum — same posture as `evidence_type` below. Known values today
 * are "ocr" | "manual_entry" | "customer_declaration"; a future origin
 * (e.g. a credit-bureau integration) is a new string value, never a schema
 * or type change, so this is deliberately typed as `string`, not a union.
 */
export type EvidenceSourceType = string;

export type Evidence = {
  id: string;
  loanCaseId: string;
  /** Open vocabulary (e.g. "recognized_raw_income", "existing_commitment_instalment"). */
  evidenceType: string;
  /** The normalized fact itself — jsonb, shape varies by evidenceType. Deliberately not over-typed. */
  value: unknown;
  sourceType: EvidenceSourceType;
  sourceDocumentId: string | null;
  sourceExtractionId: string | null;
  sourceNote: string | null;
  capturedByUserId: string | null;
  capturedAt: string;
  /** If a later fact corrects this one (e.g. a re-OCR), points at the newer row. */
  supersededByEvidenceId: string | null;
};

export type DerivationDomain = "income_recognition" | "commitment_recognition" | "property_rules" | "dsr";

export type DerivationResult = {
  id: string;
  loanCaseId: string;
  bankProductId: string;
  domain: DerivationDomain;
  /**
   * Polymorphic reference (not a database foreign key): the row in
   * income_recognition_rules / commitment_recognition_rules / dsr_rules /
   * property_rules (per `domain`) that produced this result. See the design
   * note above the derivation_results CREATE TABLE statement in
   * 20260726010000_income_knowledge_schema.sql.
   */
  ruleId: string;
  /** Snapshot copy of the matched rule's `version` at computation time. */
  ruleVersion: number;
  inputEvidenceIds: string[];
  /** The computed output — shape varies by `domain`. Deliberately not over-typed. */
  resultValue: unknown;
  computedAt: string;
  computedByUserId: string | null;
};
