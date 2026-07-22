export type LoanHealthFactors = {
  /** % of active required documents that are completed (0-100). */
  documentCompletion: number;
  /** % of the 4 borrower profile fields that are filled in (0-100). */
  requiredFields: number;
  /** % of OCR attempts that succeeded (0-100). 100 if no OCR-eligible document has been attempted yet. */
  ocrSuccess: number;
  /** % progress through the status pipeline (New -> Approved) (0-100). */
  workflowProgress: number;
};

export type LoanHealthScore = {
  score: number;
  factors: LoanHealthFactors;
};
