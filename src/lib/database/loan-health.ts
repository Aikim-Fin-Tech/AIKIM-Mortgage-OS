import { getLoanCaseDetails } from "@/lib/database/loan-case-details";
import { getRequiredDocuments } from "@/lib/database/required-documents";
import { getLoanCaseDocuments } from "@/lib/database/documents";
import { PROFILE_DIMENSIONS } from "@/lib/mortgage-rules/profile-dimensions";
import {
  calculateDocumentCompletion,
  calculateRequiredFields,
  calculateOcrSuccess,
  calculateWorkflowProgress,
  calculateLoanHealthScore,
} from "@/lib/loan-health/calculate-health-score";
import type { LoanHealthScore } from "@/lib/loan-health/types";

/**
 * Gathers the 4 Loan Health Score factors from real data (composing existing
 * read functions, not re-querying Supabase directly) and computes the score.
 * No AI — see src/lib/loan-health/calculate-health-score.ts.
 */
export async function getLoanHealthScore(caseNumber: string): Promise<{ health: LoanHealthScore | null; error: string | null }> {
  const [detailsResult, requiredResult, documentsResult] = await Promise.all([
    getLoanCaseDetails(caseNumber),
    getRequiredDocuments(caseNumber),
    getLoanCaseDocuments(caseNumber),
  ]);

  if (!detailsResult.case) {
    return { health: null, error: detailsResult.error };
  }

  const activeRows = requiredResult.rows.filter((r) => r.status !== "not_required");
  const completedCount = activeRows.filter((r) => r.status === "completed").length;
  const documentCompletion = calculateDocumentCompletion(completedCount, activeRows.length);

  const filledFieldsCount = PROFILE_DIMENSIONS.filter((dim) => detailsResult.case!.borrowerProfile[dim.key] !== null).length;
  const requiredFields = calculateRequiredFields(filledFieldsCount, PROFILE_DIMENSIONS.length);

  const ocrAttempts = documentsResult.documents.filter((d) => d.ocrKind && d.latestExtraction);
  const ocrSuccesses = ocrAttempts.filter((d) => d.latestExtraction && !d.latestExtraction.error);
  const ocrSuccess = calculateOcrSuccess(ocrSuccesses.length, ocrAttempts.length);

  const workflowProgress = calculateWorkflowProgress(detailsResult.case.status);

  const health = calculateLoanHealthScore({ documentCompletion, requiredFields, ocrSuccess, workflowProgress });

  const combinedError = detailsResult.error ?? requiredResult.error ?? documentsResult.error;
  return { health, error: combinedError };
}
