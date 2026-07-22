import { getLoanCaseDetails } from "@/lib/database/loan-case-details";
import { getLoanCaseDocuments } from "@/lib/database/documents";
import { getRequiredDocuments } from "@/lib/database/required-documents";
import type { CaseSummaryData } from "@/lib/case-summary/types";
import type { SalarySlipFields } from "@/lib/ocr/types";

/**
 * Assembles the Case Summary card's factual fields (Customer, Employment,
 * Income, Missing Documents, Current Status) entirely from data that already
 * exists — no AI call here. Composes the existing loan-case-details,
 * documents, and required-documents read functions rather than re-querying
 * Supabase directly, so there's exactly one source of truth for each.
 *
 * Employment/Income come from the most recently *successful* salary_slip
 * extraction across the case's uploaded documents, if any — never a guess
 * when no salary slip has been OCR'd yet (hasIncomeData: false in that case).
 */
export async function getCaseSummaryData(caseNumber: string): Promise<{ data: CaseSummaryData | null; error: string | null }> {
  const [detailsResult, documentsResult, requiredResult] = await Promise.all([
    getLoanCaseDetails(caseNumber),
    getLoanCaseDocuments(caseNumber),
    getRequiredDocuments(caseNumber),
  ]);

  if (!detailsResult.case) {
    return { data: null, error: detailsResult.error };
  }

  const latestSalarySlip = documentsResult.documents
    .filter((d) => d.ocrKind === "salary_slip" && d.latestExtraction && !d.latestExtraction.error && d.latestExtraction.fields)
    .sort((a, b) => new Date(b.latestExtraction!.extractedAt).getTime() - new Date(a.latestExtraction!.extractedAt).getTime())[0];

  const salaryFields = latestSalarySlip?.latestExtraction?.fields as SalarySlipFields | undefined;

  const missingDocuments = requiredResult.rows.filter((row) => row.status === "missing").map((row) => row.documentName);

  const data: CaseSummaryData = {
    customerName: detailsResult.customer?.fullName ?? "Unknown Customer",
    employerName: salaryFields?.employerName ?? null,
    basicSalary: salaryFields?.basicSalary ?? null,
    netSalary: salaryFields?.netSalary ?? null,
    hasIncomeData: Boolean(salaryFields),
    missingDocuments,
    stage: detailsResult.case.stage,
    status: detailsResult.case.status,
  };

  const combinedError = detailsResult.error ?? documentsResult.error ?? requiredResult.error;
  return { data, error: combinedError };
}
