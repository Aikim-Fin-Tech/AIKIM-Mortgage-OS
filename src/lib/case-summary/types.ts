import type { LoanStage, LoanStatus } from "@/lib/loan-cases-data";

/**
 * Everything on the Case Summary card except `nextAction` is computed live
 * from existing tables (customers, document_extractions, loan_case_required_
 * documents, loan_cases) — no AI involved, no hallucination risk on factual
 * fields. Only `nextAction` is AI-generated (Gemini), and only on request —
 * see generate-next-action.ts.
 */
export type CaseSummaryData = {
  customerName: string;
  employerName: string | null;
  basicSalary: number | null;
  netSalary: number | null;
  /** Whether employer/salary came from an OCR extraction — false if no salary slip has been processed yet. */
  hasIncomeData: boolean;
  missingDocuments: string[];
  stage: LoanStage;
  status: LoanStatus;
};
