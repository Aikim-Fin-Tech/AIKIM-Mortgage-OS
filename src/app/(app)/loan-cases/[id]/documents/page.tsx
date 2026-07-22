import { notFound } from "next/navigation";
import { getLoanCaseDetails } from "@/lib/database/loan-case-details";
import { getLoanCaseDocuments, getDocumentTypeOptions } from "@/lib/database/documents";
import { getRequiredDocuments } from "@/lib/database/required-documents";
import { LoanCaseHeader } from "@/components/loan-cases/detail/LoanCaseHeader";
import { LoanCaseTabs } from "@/components/loan-cases/detail/LoanCaseTabs";
import { DocumentsPanel } from "@/components/loan-cases/documents/DocumentsPanel";
import { RequiredDocumentsSection } from "@/components/loan-cases/documents/RequiredDocumentsSection";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LoanCaseDocumentsPage({ params }: PageProps) {
  const { id } = await params;

  const [details, documentsResult, documentTypesResult, requiredResult] = await Promise.all([
    getLoanCaseDetails(id),
    getLoanCaseDocuments(id),
    getDocumentTypeOptions(),
    getRequiredDocuments(id),
  ]);

  if (!details.case || !documentsResult.loanCaseId) {
    notFound();
  }

  const caseDetail = details.case;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <LoanCaseHeader
        caseDetail={caseDetail}
        customerName={details.customer?.fullName ?? "Unknown Customer"}
        bankerName={details.banker?.fullName ?? "Unassigned"}
      />

      <LoanCaseTabs caseNumber={caseDetail.caseNumber} active="documents" />

      {(documentsResult.error || documentTypesResult.error) && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Some document data could not be loaded right now. The list below may be incomplete.
        </div>
      )}

      <div className="mt-6">
        <RequiredDocumentsSection rows={requiredResult.rows} completionPercent={requiredResult.completionPercent} />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Uploaded Documents</h2>
        <DocumentsPanel
          caseNumber={caseDetail.caseNumber}
          loanCaseId={documentsResult.loanCaseId}
          documents={documentsResult.documents}
          documentTypes={documentTypesResult.types}
        />
      </div>
    </div>
  );
}
