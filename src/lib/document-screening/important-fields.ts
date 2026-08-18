import type { OCRDocumentKind } from "@/lib/ocr/types";

/**
 * Per-kind "important fields" list — if any of these are `null` in an
 * extraction's `fields`, computeValidation() raises a `missing_required_field`
 * REVIEW issue (see ADR 0016 Decision 2). This is a plain, code-owned
 * constant, not a database-driven rule table, matching the sprint's
 * "no new rule architecture" non-goal, and is deliberately not the AI
 * self-reporting which fields it found — the already-nullable `fields`
 * object is the single source of truth for that fact.
 *
 * 2-4 fields per kind, chosen as the minimum set a screener would consider
 * the document unusable without, not every field on the schema.
 */
export const IMPORTANT_FIELDS: Record<OCRDocumentKind, readonly string[]> = {
  // Identity and NRIC number are the two facts an NRIC document exists to prove.
  nric: ["nricNumber", "fullName"],
  // The figures a screener actually needs to assess income; employer name
  // anchors it to the applicant's employment.
  salary_slip: ["employerName", "basicSalary", "netSalary"],
  // Without who the account belongs to and which bank it's from, the
  // statement can't be attributed to the applicant at all.
  bank_statement: ["accountHolder", "bankName"],
  // The member and their contribution figures are the entire point of an
  // EPF statement as income-support evidence.
  epf_statement: ["memberName", "employeeContribution", "employerContribution"],
  // Confirms who is employed, by whom, and what they're paid — the minimum
  // an employment letter needs to say to be useful.
  employment_letter: ["employeeName", "employer", "basicSalary"],
  // The income figure and which tax year it covers are what makes an EA
  // Form usable as annual income evidence.
  ea_form: ["employeeName", "taxYear", "employmentIncome"],
};

/** Extraction confidence below this triggers a `low_extraction_confidence` REVIEW issue. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Minimum classify() confidence required before a predictedKind !== expectedKind
 * mismatch is treated as a real REVIEW-worthy signal, rather than a
 * low-confidence guess that shouldn't be flagged.
 */
export const MISMATCH_MIN_CONFIDENCE = 0.6;

/**
 * PD-017 Phase A — minimum classify() confidence required to auto-assign
 * documents.document_type_id at upload time (see
 * decide-document-type-assignment.ts). An implementation constant, not an
 * architectural decision — the decision function itself takes this as an
 * explicit parameter, never hard-coded internally, so it can later be
 * sourced from a database-configurable setting without that function
 * changing; this is just where the current caller-side value lives.
 */
export const DOCUMENT_TYPE_ASSIGNMENT_CONFIDENCE_THRESHOLD = 0.7;
