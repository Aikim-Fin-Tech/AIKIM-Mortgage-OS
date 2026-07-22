import { STATUS_PIPELINE_ORDER, type LoanStatus } from "@/lib/loan-cases-data";
import type { LoanHealthFactors, LoanHealthScore } from "./types";

/**
 * Simple, deterministic, no-AI score (0-100) — an equal-weighted average of
 * 4 factors, each already 0-100. Pure function, no DB access, easy to unit
 * test; the caller (src/lib/database/loan-health.ts) is responsible for
 * gathering the real numbers this is built from.
 */

export function calculateDocumentCompletion(completedCount: number, activeCount: number): number {
  if (activeCount === 0) return 100;
  return Math.round((completedCount / activeCount) * 100);
}

export function calculateRequiredFields(filledCount: number, totalCount: number): number {
  if (totalCount === 0) return 100;
  return Math.round((filledCount / totalCount) * 100);
}

export function calculateOcrSuccess(successCount: number, attemptCount: number): number {
  // No OCR attempted yet is not a failure — don't penalize a case before any
  // OCR-eligible document has even been uploaded.
  if (attemptCount === 0) return 100;
  return Math.round((successCount / attemptCount) * 100);
}

/**
 * Rejected is treated as the end of the workflow (100%) rather than
 * penalized — the case reached a final decision, which is what "progress"
 * measures here, not the favorability of the outcome.
 */
export function calculateWorkflowProgress(status: LoanStatus): number {
  if (status === "Rejected") return 100;
  const index = STATUS_PIPELINE_ORDER.indexOf(status);
  if (index === -1) return 0;
  return Math.round((index / (STATUS_PIPELINE_ORDER.length - 1)) * 100);
}

export function calculateLoanHealthScore(factors: LoanHealthFactors): LoanHealthScore {
  const score = Math.round(
    (factors.documentCompletion + factors.requiredFields + factors.ocrSuccess + factors.workflowProgress) / 4,
  );
  return { score, factors };
}
