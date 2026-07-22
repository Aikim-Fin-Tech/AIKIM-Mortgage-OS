/**
 * Client-safe types for the Mortgage Rules Engine (Sprint 6.2 Phase 1).
 * Rule DATA lives in the database (mortgage_rules, mortgage_rule_documents);
 * the matching ALGORITHM lives here in TypeScript, by product decision — see
 * docs/decisions/0006-mortgage-rules-engine.md. This keeps the door open for
 * future extension (OCR, AI screening, DSR, recommendation) without needing
 * to rewrite the matcher out of Postgres later.
 */

export type BorrowerProfile = {
  nationality: string | null;
  incomeCountry: string | null;
  employmentType: string | null;
  incomeStructure: string | null;
};

export type MortgageRule = {
  id: string;
  ruleName: string;
  nationality: string | null;
  incomeCountry: string | null;
  employmentType: string | null;
  incomeStructure: string | null;
};

export type MortgageRuleDocument = {
  documentTypeId: string;
  requiredCount: number;
  requiredMonths: number | null;
};

export type RequiredDocumentState = "active" | "not_required";

/** A single row of the Documents tab's Required Documents table. */
export type RequiredDocumentRow = {
  id: string;
  documentTypeId: string;
  documentName: string;
  categoryName: string | null;
  requiredCount: number;
  requiredMonths: number | null;
  uploadedCount: number;
  /** Derived, never stored: "not_required" wins; otherwise uploadedCount >= requiredCount. */
  status: "completed" | "missing" | "not_required";
};

// ---------------------------------------------------------------------------
// Sprint 6.2 Phase 2 — Mortgage Rule Admin (super_admin only)
// ---------------------------------------------------------------------------

/** One row of the Mortgage Rules List. */
export type MortgageRuleListItem = {
  id: string;
  ruleName: string;
  nationality: string | null;
  incomeCountry: string | null;
  employmentType: string | null;
  incomeStructure: string | null;
  isActive: boolean;
  requiredDocumentCount: number;
  updatedAt: string;
};

/** Full detail for the Create/Edit (and View) Rule page. */
export type MortgageRuleDetail = {
  id: string;
  ruleName: string;
  description: string | null;
  nationality: string | null;
  incomeCountry: string | null;
  employmentType: string | null;
  incomeStructure: string | null;
  isActive: boolean;
  version: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A rule's required-document line item. Category is always derived from
 * document_types.category_id (see docs/decisions/0006-mortgage-rules-engine.md
 * §"deviations") — never stored redundantly on mortgage_rule_documents.
 */
export type RuleDocumentItem = {
  id: string;
  documentTypeId: string;
  documentTypeName: string;
  categoryId: string | null;
  categoryName: string | null;
  requiredCount: number;
  requiredMonths: number | null;
  isMandatory: boolean;
  displayOrder: number;
  notes: string | null;
};

export type DocumentCategoryItem = {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
};
