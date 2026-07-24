import { notFound } from "next/navigation";
import { getLoanCaseDetails } from "@/lib/database/loan-case-details";
import { getLoanCaseDocuments } from "@/lib/database/documents";
import { LoanCaseHeader } from "@/components/loan-cases/detail/LoanCaseHeader";
import { LoanCaseTabs } from "@/components/loan-cases/detail/LoanCaseTabs";
import { AssessmentForm } from "@/components/loan-cases/assessment/AssessmentForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LoanCaseAssessmentPage({ params }: PageProps) {
  const { id } = await params;

  const [details, documentsResult] = await Promise.all([getLoanCaseDetails(id), getLoanCaseDocuments(id)]);

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

      <LoanCaseTabs caseNumber={caseDetail.caseNumber} active="assessment" />

      <div className="mt-8">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Mortgage Assessment</h2>
        <AssessmentForm loanCaseId={documentsResult.loanCaseId} />
      </div>
    </div>
  );
}
