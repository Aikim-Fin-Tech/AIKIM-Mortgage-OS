/**
 * Provider-agnostic OCR contract. Application code (Server Actions, read
 * functions, UI) only ever imports from this file and from
 * get-ocr-provider.ts — never from gemini-provider.ts directly. Swapping
 * providers later means adding a new class that implements OCRProvider and
 * changing one line in get-ocr-provider.ts; nothing else in the app changes.
 *
 * Adding a new document kind (a "future OCR template") is additive: a new
 * entry in OCRDocumentKind, a new Fields type, a new case in the provider's
 * internal prompt/schema map — this interface itself never changes.
 *
 * Sprint 2 ("Document Screening API v1.0", see
 * docs/decisions/0016-document-screening-classification-and-validation.md)
 * widened this from 2 kinds (nric, salary_slip) to 6, and added a second,
 * independent `classify()` concern plus a `confidence` signal on
 * OCRExtractionResult — both additive, the interface's original shape is
 * unchanged for existing callers.
 */

export type OCRDocumentKind =
  | "nric"
  | "salary_slip"
  | "bank_statement"
  | "epf_statement"
  | "employment_letter"
  | "ea_form";

export type NricFields = {
  nricNumber: string | null;
  fullName: string | null;
  /** ISO date (YYYY-MM-DD) if reliably derivable from the printed NRIC/DOB — never inferred from the NRIC number alone if not also printed. */
  dateOfBirth: string | null;
  /** Only populated when the document itself explicitly states gender/sex — never inferred from the NRIC number's last digit or any other project rule. */
  gender: string | null;
  address: string | null;
};

export type SalarySlipFields = {
  // Existing 3 fields (shipped in 0008) — names/shape unchanged, per
  // ADR 0016's naming decision (netSalary is not renamed to netIncome).
  employerName: string | null;
  basicSalary: number | null;
  netSalary: number | null;
  // New fields added in Sprint 2, per the CTO brief's verbatim field list.
  customerName: string | null;
  salaryMonth: string | null;
  overtime: number | null;
  allowance: number | null;
  commission: number | null;
  bonus: number | null;
  grossIncome: number | null;
  epfEmployeeContribution: number | null;
  epfEmployerContribution: number | null;
};

/**
 * A single detected recurring/salary credit line in a bank statement.
 * Kept as a simple, flat shape (not a richer transaction model) — this is a
 * screening-time signal only, not a full transaction ledger, and out of
 * scope for the Mortgage Knowledge Engine (income/DSR/commitment tables are
 * untouched by this sprint).
 */
export type BankStatementCreditDetection = {
  description: string | null;
  amount: number | null;
  /** ISO date (YYYY-MM-DD) if legible. */
  date: string | null;
};

export type BankStatementFields = {
  accountHolder: string | null;
  bankName: string | null;
  /** Masked where appropriate (e.g. last 4 digits only) — the model itself is prompted to mask, matching the "never fabricate/never over-expose" extraction discipline; unmasked storage/display posture is a separate PII concern (see docs/architecture/security.md), not decided by this field's shape. */
  accountNumberMasked: string | null;
  statementPeriod: string | null;
  detectedSalaryCredits: BankStatementCreditDetection[] | null;
  detectedRecurringIncomeCredits: BankStatementCreditDetection[] | null;
};

export type EpfStatementFields = {
  memberName: string | null;
  employer: string | null;
  contributionPeriod: string | null;
  employeeContribution: number | null;
  employerContribution: number | null;
  /** Total/relevant wage figure the contribution was calculated against, when the statement states one. */
  wageAmount: number | null;
};

export type EmploymentLetterFields = {
  employeeName: string | null;
  employer: string | null;
  position: string | null;
  employmentStatus: string | null;
  /** ISO date (YYYY-MM-DD) if legible. */
  startDate: string | null;
  basicSalary: number | null;
  allowances: number | null;
  /** e.g. "confirmed" / "probation" — only when the letter explicitly states one, never inferred. */
  confirmationStatus: string | null;
};

export type EaFormFields = {
  employeeName: string | null;
  employer: string | null;
  taxYear: string | null;
  employmentIncome: number | null;
  allowancesAndBenefits: number | null;
  statutoryDeductions: number | null;
};

export type OCRFieldsFor<K extends OCRDocumentKind> = K extends "nric"
  ? NricFields
  : K extends "salary_slip"
    ? SalarySlipFields
    : K extends "bank_statement"
      ? BankStatementFields
      : K extends "epf_statement"
        ? EpfStatementFields
        : K extends "employment_letter"
          ? EmploymentLetterFields
          : K extends "ea_form"
            ? EaFormFields
            : never;

export type OCRFile = {
  bytes: Uint8Array;
  mimeType: string;
};

export type OCRExtractionResult<K extends OCRDocumentKind> = {
  kind: K;
  /** Null if extraction failed — see `error`. Never a guessed/placeholder value. */
  fields: OCRFieldsFor<K> | null;
  /**
   * Model's self-reported confidence (0–1) for this extraction attempt.
   * Sits alongside `fields`, never mixed into the domain fields object — see
   * ADR 0016 Decision 2. Null when extraction failed (nothing to score) or
   * the model didn't report one.
   */
  confidence: number | null;
  modelName: string;
  error: string | null;
};

/**
 * Result of an independent, unprimed "what kind of document is this?" call
 * — see ADR 0016 Decision 1 for why this is a second Gemini call rather than
 * folded into `extract()`. `"unrecognized"` is a valid outcome, not an error.
 */
export type OCRClassificationResult = {
  predictedKind: OCRDocumentKind | "unrecognized";
  confidence: number | null;
  modelName: string;
  error: string | null;
};

export interface OCRProvider {
  extract<K extends OCRDocumentKind>(kind: K, file: OCRFile): Promise<OCRExtractionResult<K>>;
  classify(file: OCRFile): Promise<OCRClassificationResult>;
}
